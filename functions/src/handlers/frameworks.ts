import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireAuth, requireTenantMember } from '../lib/auth-helpers.js';
import {
  appendAuditLogInTransaction,
  recordAuditLog,
} from '../lib/audit.js';
import { AUTHORITATIVE_CALLABLE_OPTIONS } from '../lib/command-boundary.js';
import {
  AdoptedFramework,
  RequirementApplicability,
  Framework,
  MasterControl,
  Control,
} from '@eurogovernance/shared-types';

const COMPLIANCE_WRITE_ROLES = [
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
] as const;
const FRAMEWORK_COMMAND_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

function frameworkCommandId(value: unknown, field: string): string {
  if (typeof value !== 'string' || !FRAMEWORK_COMMAND_ID_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', `${field} is invalid.`);
  }
  return value;
}

/**
 * 1. List Canonical Master Frameworks Library (/frameworks)
 */
export const listAvailableFrameworks = onCall(async (request) => {
  requireAuth(request);

  const snapshot = await db.collection('frameworks').get();
  const frameworks: Array<Framework & { masterControlsCount: number; requirementsCount: number }> = [];

  for (const doc of snapshot.docs) {
    const fwData = doc.data() as Framework;
    const [controlsSnap, reqsSnap] = await Promise.all([
      doc.ref.collection('master_controls').count().get(),
      doc.ref.collection('requirements').count().get(),
    ]);

    frameworks.push({
      ...fwData,
      id: doc.id,
      masterControlsCount: controlsSnap.data().count,
      requirementsCount: reqsSnap.data().count,
    });
  }

  return { frameworks };
});

export interface AdoptFrameworkInput {
  tenantId: string;
  frameworkId: string;
  scopeDescription?: string;
  scopingBoundaries?: string[];
  targetCertificationDate?: string | null;
  pinnedVersion?: string;
}

export interface UnadoptFrameworkInput {
  tenantId: string;
  frameworkId: string;
  reason?: string;
  deleteInstantiatedControls?: boolean;
}

/**
 * 2. Adopt a Global Framework for a Tenant
 */
export const adoptFramework = onCall<AdoptFrameworkInput>(async (request) => {
  const { tenantId, frameworkId, scopeDescription, scopingBoundaries, targetCertificationDate, pinnedVersion } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!frameworkId || typeof frameworkId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid frameworkId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  // 1. Verify global framework exists
  const fwRef = db.collection('frameworks').doc(frameworkId);
  const fwDoc = await fwRef.get();
  if (!fwDoc.exists) {
    throw new HttpsError('not-found', `Framework '${frameworkId}' does not exist in master library.`);
  }
  const fwData = fwDoc.data() as Framework;

  // 2. Prevent duplicate adoption if already active or in scoping
  const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(frameworkId);
  const existingAdopted = await adoptedRef.get();
  if (existingAdopted.exists) {
    const prevStatus = existingAdopted.data()?.status;
    if (prevStatus && prevStatus !== 'retired') {
      throw new HttpsError(
        'already-exists',
        `Framework '${frameworkId}' is already adopted by tenant '${tenantId}' with status '${prevStatus}'.`
      );
    }
  }

  // 3. Fetch master controls count and requirements
  const masterControlsSnap = await fwRef.collection('master_controls').limit(201).get();

  const now = new Date().toISOString();
  const effectiveVersion = pinnedVersion || fwData.version || '1.0';

  const adoptedRecord: AdoptedFramework = {
    id: frameworkId,
    tenantId,
    frameworkId,
    frameworkCode: fwData.code || frameworkId.toUpperCase(),
    frameworkName: fwData.name || frameworkId,
    frameworkVersion: fwData.version || '1.0',
    pinnedVersion: effectiveVersion,
    versionPinnedAt: now,
    status: 'in_scoping',
    ownerId: authCtx.userId,
    scopeDescription: scopeDescription || `Organizational compliance scope for ${fwData.name}`,
    scopingBoundaries: Array.isArray(scopingBoundaries) && scopingBoundaries.length > 0 ? scopingBoundaries : ['Primary EU Operations'],
    targetCertificationDate: targetCertificationDate || null,
    totalMasterControlsCount: masterControlsSnap.size,
    instantiatedControlsCount: 0,
    applicableControlsCount: 0,
    notApplicableControlsCount: 0,
    adoptedBy: authCtx.userId,
    adoptedAt: now,
    lastInstantiatedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: authCtx.userId,
    updatedBy: authCtx.userId,
  };

  // Adoption records scope intent only. It must not fabricate applicable or
  // implemented requirements before a scope evaluation has actually run.
  await db.runTransaction(async (transaction) => {
    const currentAdoption = await transaction.get(adoptedRef);
    if (currentAdoption.exists && currentAdoption.data()?.status !== 'retired') {
      throw new HttpsError(
        'already-exists',
        `Framework '${frameworkId}' is already adopted by tenant '${tenantId}'.`
      );
    }

    transaction.set(adoptedRef, adoptedRecord);
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authCtx.userId,
      actorEmail: authCtx.email,
      actorRole: authCtx.role,
      entityType: 'adopted_framework',
      entityId: frameworkId,
      action: 'create',
      beforeSummary: currentAdoption.exists ? currentAdoption.data() || null : null,
      afterSummary: adoptedRecord as any,
      source: 'cloud_function',
      workflowContext: `Adopted framework ${frameworkId} (Pinned Version: ${effectiveVersion}); applicability pending evaluation`,
    });
  });

  return { adoptedFramework: adoptedRecord };
});

/**
 * 2b. Unadopt or Deactivate Framework
 */
export const unadoptFramework = onCall<UnadoptFrameworkInput>(async (request) => {
  const { tenantId, frameworkId, reason = 'Unadopted by compliance management', deleteInstantiatedControls = false } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!frameworkId || typeof frameworkId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid frameworkId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, ['tenant_admin', 'compliance_manager', 'security_manager']);

  const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(frameworkId);
  const snap = await adoptedRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Framework '${frameworkId}' is not adopted by tenant '${tenantId}'.`);
  }

  const adoptedData = snap.data() as AdoptedFramework;
  const now = new Date().toISOString();

  // Control records are authoritative, versioned operational history. Framework
  // retirement must never hard-delete or mutate them outside the governed
  // control command boundary.
  if (deleteInstantiatedControls) {
    throw new HttpsError(
      'failed-precondition',
      'Framework retirement cannot delete instantiated controls. Retire or remap affected controls individually through the governed control workflow.'
    );
  }

  // Deactivate and transition to retired
  await adoptedRef.update({
    status: 'retired',
    updatedAt: now,
    updatedBy: authCtx.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'adopted_framework',
    entityId: frameworkId,
    action: 'status_transition',
    beforeSummary: adoptedData as any,
    afterSummary: { status: 'retired', reason, deleteInstantiatedControls },
    source: 'cloud_function',
    workflowContext: `Unadopted/deactivated framework ${frameworkId}`,
  });

  return { success: true, frameworkId, status: 'retired' };
});

/**
 * 3. Update Framework Scope & Boundaries
 */
export const updateFrameworkScope = onCall(async (request) => {
  const { tenantId, frameworkId, scopeDescription, scopingBoundaries, targetCertificationDate, status } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!frameworkId || typeof frameworkId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid frameworkId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(frameworkId);
  const snap = await adoptedRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Framework '${frameworkId}' is not adopted by tenant '${tenantId}'.`);
  }

  const beforeData = snap.data() as AdoptedFramework;
  const now = new Date().toISOString();

  const updates: Partial<AdoptedFramework> = {
    updatedAt: now,
  };

  if (typeof scopeDescription === 'string') updates.scopeDescription = scopeDescription;
  if (Array.isArray(scopingBoundaries)) updates.scopingBoundaries = scopingBoundaries;
  if (targetCertificationDate !== undefined) updates.targetCertificationDate = targetCertificationDate;
  if (status && ['evaluating', 'in_scoping', 'adopted', 'active', 'retired'].includes(status)) {
    updates.status = status;
  }

  await adoptedRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'adopted_framework',
    entityId: frameworkId,
    action: 'update',
    beforeSummary: beforeData as any,
    afterSummary: { ...beforeData, ...updates } as any,
    source: 'cloud_function',
  });

  return { success: true, updatedFields: updates };
});

/**
 * 4. Set Requirement Applicability (SoA / Scoping Decision)
 */
export const setRequirementApplicability = onCall(async (request) => {
  const { tenantId, requirementId, frameworkId, isApplicable, justification, scopingNotes } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!requirementId || typeof requirementId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid requirementId.');
  }
  if (typeof isApplicable !== 'boolean') {
    throw new HttpsError('invalid-argument', 'isApplicable must be a boolean.');
  }
  if (!isApplicable && (!justification || typeof justification !== 'string' || justification.trim().length === 0)) {
    throw new HttpsError('invalid-argument', 'A valid justification is strictly mandatory when marking a requirement non-applicable.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  const appRef = db.collection('tenants').doc(tenantId).collection('requirement_applicability').doc(requirementId);
  const snap = await appRef.get();
  const now = new Date().toISOString();

  let targetFwId = frameworkId;
  if (!targetFwId && snap.exists) {
    targetFwId = snap.data()?.frameworkId;
  }

  const updatedRecord: Partial<RequirementApplicability> = {
    isApplicable,
    justification: justification || (isApplicable ? 'Statutory requirement applicable in scope' : ''),
    scopingNotes: scopingNotes || '',
    assessedBy: authCtx.userId,
    assessedAt: now,
    updatedAt: now,
  };

  if (!snap.exists) {
    // Look up requirement title from global framework
    let sectionCode = requirementId;
    let requirementTitle = requirementId;
    if (targetFwId) {
      const globalReq = await db.collection('frameworks').doc(targetFwId).collection('requirements').doc(requirementId).get();
      if (globalReq.exists) {
        const d = globalReq.data();
        sectionCode = d?.sectionCode || requirementId;
        requirementTitle = d?.title || requirementId;
      }
    }

    const fullRecord: RequirementApplicability = {
      id: requirementId,
      tenantId,
      requirementId,
      frameworkId: targetFwId || 'unknown',
      sectionCode,
      requirementTitle,
      isApplicable,
      status: isApplicable ? 'implemented' : 'not_applicable',
      ownerId: authCtx.userId,
      justification: justification || 'Initial applicability assessment',
      scopingNotes: scopingNotes || '',
      assessedBy: authCtx.userId,
      assessedAt: now,
      createdAt: now,
      updatedAt: now,
      createdBy: authCtx.userId,
      updatedBy: authCtx.userId,
    };
    await appRef.set(fullRecord);
  } else {
    await appRef.update(updatedRecord);
  }

  // Recalculate applicable vs non-applicable count for framework
  if (targetFwId) {
    const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(targetFwId);
    const adoptedDoc = await adoptedRef.get();
    if (adoptedDoc.exists) {
      const allAppSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('requirement_applicability')
        .where('frameworkId', '==', targetFwId)
        .get();

      let applicableCount = 0;
      let nonApplicableCount = 0;

      allAppSnap.docs.forEach((doc) => {
        if (doc.data().isApplicable) applicableCount++;
        else nonApplicableCount++;
      });

      await adoptedRef.update({
        applicableControlsCount: applicableCount,
        notApplicableControlsCount: nonApplicableCount,
        updatedAt: now,
      });
    }
  }

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'requirement_applicability',
    entityId: requirementId,
    action: 'update',
    beforeSummary: snap.exists ? snap.data() : null,
    afterSummary: updatedRecord as any,
    source: 'cloud_function',
  });

  return { success: true, requirementId, isApplicable };
});

/**
 * 5. Instantiate Tenant Controls from Master Framework Library
 */
export const instantiateFrameworkControls = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = request.data;
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      throw new HttpsError(
        'invalid-argument',
        'Framework generation input must be an object.'
      );
    }
    const unknown = Object.keys(input).filter(
      (key) => key !== 'tenantId' && key !== 'frameworkId'
    );
    if (unknown.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Framework generation input contains unsupported field(s): ${unknown.join(', ')}.`
      );
    }
    const tenantId = frameworkCommandId(
      (input as Record<string, unknown>).tenantId,
      'tenantId'
    );
    const frameworkId = frameworkCommandId(
      (input as Record<string, unknown>).frameworkId,
      'frameworkId'
    );

    const authCtx = await requireTenantMember(request, tenantId, [
      ...COMPLIANCE_WRITE_ROLES,
    ]);
    const adoptedRef = db.doc(
      `tenants/${tenantId}/adopted_frameworks/${frameworkId}`
    );

    const masterControlsSnap = await db
      .collection(`frameworks/${frameworkId}/master_controls`)
      .limit(201)
      .get();
    if (masterControlsSnap.empty) {
      throw new HttpsError(
        'failed-precondition',
        `No master controls found for framework '${frameworkId}' in canonical library.`
      );
    }
    if (masterControlsSnap.size > 200) {
      throw new HttpsError(
        'resource-exhausted',
        'Framework control generation exceeds the bounded synchronous limit.'
      );
    }

    const applicabilitySnap = await db
      .collection(`tenants/${tenantId}/requirement_applicability`)
      .where('frameworkId', '==', frameworkId)
      .limit(1_001)
      .get();
    if (applicabilitySnap.size > 1_000) {
      throw new HttpsError(
        'resource-exhausted',
        'Framework applicability exceeds the bounded synchronous generation limit.'
      );
    }
    const nonApplicableRequirementIds = new Set<string>();
    for (const document of applicabilitySnap.docs) {
      const value = document.data();
      if (value.isApplicable === false) {
        nonApplicableRequirementIds.add(document.id);
        if (typeof value.requirementId === 'string') {
          nonApplicableRequirementIds.add(value.requirementId);
        }
      }
    }

    const templates = masterControlsSnap.docs.map((document, index) => {
      const master = document.data() as MasterControl;
      const rawRequirementIds = master.requirementIds ?? [];
      if (
        !Array.isArray(rawRequirementIds) ||
        rawRequirementIds.length > 20 ||
        rawRequirementIds.some(
          (requirementId) =>
            typeof requirementId !== 'string' ||
            !FRAMEWORK_COMMAND_ID_PATTERN.test(requirementId)
        )
      ) {
        throw new HttpsError(
          'failed-precondition',
          `Master control '${document.id}' has invalid requirement mappings.`
        );
      }
      const requirementIds = [...new Set(rawRequirementIds)].sort();
      const cleanCode = (master.code || document.id)
        .toLowerCase()
        .replace(/[^a-z0-9]/g, '_');
      const controlId = `ctl_${frameworkId}_${cleanCode}`;
      if (!FRAMEWORK_COMMAND_ID_PATTERN.test(controlId)) {
        throw new HttpsError(
          'failed-precondition',
          `Master control '${document.id}' produces an invalid tenant control identifier.`
        );
      }
      return {
        document,
        master,
        requirementIds,
        controlId,
        defaultCode: `CTL-${frameworkId.toUpperCase()}-${index + 1}`,
      };
    });

    let createdCount = 0;
    let skippedExistingCount = 0;
    const now = new Date().toISOString();
    await db.runTransaction(async (transaction) => {
      const adoptedSnapshot = await transaction.get(adoptedRef);
      const adoption = adoptedSnapshot.data() as AdoptedFramework | undefined;
      if (!adoptedSnapshot.exists) {
        throw new HttpsError(
          'not-found',
          `Framework '${frameworkId}' has not been adopted by tenant '${tenantId}'.`
        );
      }
      if (
        adoption?.tenantId !== tenantId ||
        adoption.frameworkId !== frameworkId ||
        adoption.status === 'retired' ||
        !['in_scoping', 'adopted', 'active'].includes(adoption.status)
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The adopted framework is retired or has inconsistent lifecycle state.'
        );
      }

      const controlsRef = db.collection(`tenants/${tenantId}/controls`);
      const controlRefs = templates.map((template) =>
        controlsRef.doc(template.controlId)
      );
      const existingSnapshots = await transaction.getAll(...controlRefs);
      let nextCreatedCount = 0;
      let nextSkippedCount = 0;
      for (let index = 0; index < templates.length; index += 1) {
        const template = templates[index]!;
        const targetRef = controlRefs[index]!;
        const existing = existingSnapshots[index]!;
        if (existing.exists) {
          nextSkippedCount += 1;
          continue;
        }
        const isExcluded =
          template.requirementIds.length > 0 &&
          template.requirementIds.every((requirementId) =>
            nonApplicableRequirementIds.has(requirementId)
          );
        const control: Control = {
          id: template.controlId,
          tenantId,
          masterControlId: template.document.id,
          ownerId: authCtx.userId,
          code: template.master.code || template.defaultCode,
          title: template.master.title || 'Master Control Implementation',
          description: template.master.description || '',
          domain: template.master.domain || 'security',
          frameworkIds: [frameworkId],
          requirementIds: template.requirementIds,
          status: 'not_started',
          healthScore: 0,
          workflowTrust: 'legacy_unverified',
          assuranceStatus: 'untested',
          enforcementMechanism: 'hybrid',
          reviewFrequencyDays:
            template.master.recommendedFrequencyDays || 90,
          lastReviewDate: null,
          nextReviewDate: null,
          implementationNotes: isExcluded
            ? 'All mapped requirements are currently scoped out. This draft remains unassured until governed or retired.'
            : 'Framework-derived draft. Rebaseline and independently review before relying on it as assurance.',
          createdAt: now,
          updatedAt: now,
          createdBy: authCtx.userId,
          updatedBy: authCtx.userId,
        };
        transaction.create(targetRef, control);
        nextCreatedCount += 1;
      }

      createdCount = nextCreatedCount;
      skippedExistingCount = nextSkippedCount;
      transaction.update(adoptedRef, {
        status: 'active',
        instantiatedControlsCount: masterControlsSnap.size,
        lastInstantiatedAt: now,
        updatedAt: now,
        updatedBy: authCtx.userId,
      });
      transaction.delete(
        db.doc(`tenants/${tenantId}/summary_metrics/current`)
      );
      appendAuditLogInTransaction(transaction, {
        tenantId,
        actorId: authCtx.userId,
        actorEmail: authCtx.email,
        actorRole: authCtx.role,
        entityType: 'adopted_framework',
        entityId: frameworkId,
        action: 'status_transition',
        beforeSummary: adoption as any,
        afterSummary: {
          frameworkId,
          createdControls: nextCreatedCount,
          updatedControls: 0,
          skippedExistingControls: nextSkippedCount,
          totalControls: masterControlsSnap.size,
          metricsInvalidated: true,
        },
        source: 'cloud_function',
        workflowContext:
          'Generated create-only unassured control drafts without overwriting existing controls.',
      });
    });

    return {
      success: true,
      frameworkId,
      createdControlsCount: createdCount,
      updatedControlsCount: 0,
      skippedGovernedControlsCount: skippedExistingCount,
      totalMasterControlsCount: masterControlsSnap.size,
      status: 'active',
      metricsInvalidated: true,
    };
  }
);

/**
 * 6. Retire or Archive Adopted Framework
 */
export const retireAdoptedFramework = onCall(async (request) => {
  const { tenantId, frameworkId, retirementReason } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!frameworkId || typeof frameworkId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid frameworkId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, ['tenant_admin', 'compliance_manager']);

  const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(frameworkId);
  const snap = await adoptedRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Framework '${frameworkId}' is not adopted.`);
  }

  const now = new Date().toISOString();
  await adoptedRef.update({
    status: 'retired',
    updatedAt: now,
  });

  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'adopted_framework',
    entityId: frameworkId,
    action: 'status_transition',
    beforeSummary: snap.data(),
    afterSummary: { status: 'retired', retirementReason: retirementReason || 'Retired by compliance lead' },
    source: 'cloud_function',
  });

  return { success: true, frameworkId, status: 'retired' };
});

/**
 * 7. List Tenant Adopted Frameworks
 */
export const listTenantAdoptedFrameworks = onCall(async (request) => {
  const { tenantId } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }

  await requireTenantMember(request, tenantId);

  const snap = await db.collection('tenants').doc(tenantId).collection('adopted_frameworks').get();
  const frameworks = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { frameworks };
});

/**
 * 8. List Tenant Requirement Applicability
 */
export const listTenantRequirementApplicability = onCall(async (request) => {
  const { tenantId, frameworkId } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('requirement_applicability') as FirebaseFirestore.Query;
  if (frameworkId) {
    q = q.where('frameworkId', '==', frameworkId);
  }

  const snap = await q.get();
  const requirements = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { requirements };
});

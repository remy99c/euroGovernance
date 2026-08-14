import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireAuth, requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { computeAndStoreTenantMetrics } from './metrics.js';
import {
  AdoptedFramework,
  RequirementApplicability,
  Framework,
  Requirement,
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
  const [masterControlsSnap, reqsSnap] = await Promise.all([
    fwRef.collection('master_controls').get(),
    fwRef.collection('requirements').get(),
  ]);

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
    applicableControlsCount: masterControlsSnap.size,
    notApplicableControlsCount: 0,
    adoptedBy: authCtx.userId,
    adoptedAt: now,
    lastInstantiatedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: authCtx.userId,
    updatedBy: authCtx.userId,
  };

  await adoptedRef.set(adoptedRecord);

  // 4. Populate default requirement applicability (without cloning controls yet)
  const batch = db.batch();
  for (const reqDoc of reqsSnap.docs) {
    const reqData = reqDoc.data() as Requirement;
    const appRef = db.collection('tenants').doc(tenantId).collection('requirement_applicability').doc(reqDoc.id);
    const appDoc = await appRef.get();

    if (!appDoc.exists) {
      const appRecord: RequirementApplicability = {
        id: reqDoc.id,
        tenantId,
        requirementId: reqDoc.id,
        frameworkId,
        sectionCode: reqData.sectionCode || reqDoc.id,
        requirementTitle: reqData.title || reqDoc.id,
        isApplicable: true,
        status: 'implemented',
        ownerId: authCtx.userId,
        justification: 'Default statutory applicability in initial scope',
        scopingNotes: '',
        assessedBy: authCtx.userId,
        assessedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: authCtx.userId,
        updatedBy: authCtx.userId,
      };
      batch.set(appRef, appRecord);
    }
  }
  await batch.commit();

  // 5. Audit Log
  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'adopted_framework',
    entityId: frameworkId,
    action: 'create',
    beforeSummary: existingAdopted.exists ? existingAdopted.data() : null,
    afterSummary: adoptedRecord as any,
    source: 'cloud_function',
    workflowContext: `Adopted framework ${frameworkId} (Pinned Version: ${effectiveVersion})`,
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

  // If deleteInstantiatedControls is requested, unmap framework from controls
  if (deleteInstantiatedControls) {
    const controlsSnap = await db.collection('tenants').doc(tenantId).collection('controls')
      .where('frameworkIds', 'array-contains', frameworkId)
      .get();

    const batch = db.batch();
    for (const ctrlDoc of controlsSnap.docs) {
      const ctrl = ctrlDoc.data();
      const updatedFwIds = (ctrl.frameworkIds || []).filter((id: string) => id !== frameworkId);
      if (updatedFwIds.length === 0) {
        batch.delete(ctrlDoc.ref);
      } else {
        batch.update(ctrlDoc.ref, { frameworkIds: updatedFwIds, updatedAt: now, updatedBy: authCtx.userId });
      }
    }
    await batch.commit();
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
export const instantiateFrameworkControls = onCall(async (request) => {
  const { tenantId, frameworkId } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }
  if (!frameworkId || typeof frameworkId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid frameworkId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  // 1. Verify adopted framework
  const adoptedRef = db.collection('tenants').doc(tenantId).collection('adopted_frameworks').doc(frameworkId);
  const adoptedDoc = await adoptedRef.get();
  if (!adoptedDoc.exists) {
    throw new HttpsError('not-found', `Framework '${frameworkId}' has not been adopted by tenant '${tenantId}'. Adopt it first.`);
  }

  // 2. Fetch master controls
  const fwRef = db.collection('frameworks').doc(frameworkId);
  const masterControlsSnap = await fwRef.collection('master_controls').get();

  if (masterControlsSnap.empty) {
    throw new HttpsError('failed-precondition', `No master controls found for framework '${frameworkId}' in canonical library.`);
  }

  // 3. Fetch requirement applicability decisions
  const applicabilitySnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('requirement_applicability')
    .where('frameworkId', '==', frameworkId)
    .get();

  const nonApplicableReqIds = new Set<string>();
  applicabilitySnap.docs.forEach((d) => {
    if (!d.data().isApplicable) {
      nonApplicableReqIds.add(d.id);
    }
  });

  const now = new Date().toISOString();
  let createdCount = 0;
  let updatedCount = 0;

  const batch = db.batch();
  const controlsRef = db.collection('tenants').doc(tenantId).collection('controls');

  for (const doc of masterControlsSnap.docs) {
    const mc = doc.data() as MasterControl;
    const cleanCode = (mc.code || doc.id).toLowerCase().replace(/[^a-z0-9]/g, '_');
    const controlId = `ctl_${frameworkId}_${cleanCode}`;
    const targetDocRef = controlsRef.doc(controlId);
    const existingSnap = await targetDocRef.get();

    const isExcluded = nonApplicableReqIds.has(doc.id) || nonApplicableReqIds.has(mc.id);

    if (!existingSnap.exists) {
      const newControl: Control = {
        id: controlId,
        tenantId,
        masterControlId: doc.id,
        ownerId: authCtx.userId,
        code: mc.code || `CTL-${frameworkId.toUpperCase()}-${createdCount + 1}`,
        title: mc.title || 'Master Control Implementation',
        description: mc.description || '',
        domain: mc.domain || 'security',
        frameworkIds: [frameworkId],
        requirementIds: [doc.id],
        status: isExcluded ? 'not_applicable' : 'not_started',
        healthScore: isExcluded ? 100 : 0,
        enforcementMechanism: 'hybrid',
        reviewFrequencyDays: mc.recommendedFrequencyDays || 90,
        lastReviewDate: null,
        nextReviewDate: new Date(Date.now() + 90 * 86400000).toISOString(),
        implementationNotes: isExcluded ? 'Excluded during framework scoping assessment' : '',
        createdAt: now,
        updatedAt: now,
        createdBy: authCtx.userId,
        updatedBy: authCtx.userId,
      };
      batch.set(targetDocRef, newControl);
      createdCount++;
    } else {
      const existingData = existingSnap.data() as Control;
      const currentFrameworks = new Set(existingData.frameworkIds || []);
      currentFrameworks.add(frameworkId);

      batch.update(targetDocRef, {
        masterControlId: doc.id,
        frameworkIds: Array.from(currentFrameworks),
        domain: mc.domain || existingData.domain,
        reviewFrequencyDays: mc.recommendedFrequencyDays || existingData.reviewFrequencyDays || 90,
        updatedAt: now,
      });
      updatedCount++;
    }
  }

  // 4. Update Adopted Framework status to active
  batch.update(adoptedRef, {
    status: 'active',
    instantiatedControlsCount: masterControlsSnap.size,
    lastInstantiatedAt: now,
    updatedAt: now,
  });

  await batch.commit();

  // 5. Recompute tenant metrics
  await computeAndStoreTenantMetrics(tenantId);

  // 6. Audit Log
  await recordAuditLog({
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'adopted_framework',
    entityId: frameworkId,
    action: 'status_transition',
    beforeSummary: adoptedDoc.data(),
    afterSummary: {
      frameworkId,
      createdControls: createdCount,
      updatedControls: updatedCount,
      totalControls: masterControlsSnap.size,
    },
    source: 'cloud_function',
    workflowContext: `Instantiated ${createdCount} new controls and updated ${updatedCount} controls for framework ${frameworkId}`,
  });

  return {
    success: true,
    frameworkId,
    createdControlsCount: createdCount,
    updatedControlsCount: updatedCount,
    totalMasterControlsCount: masterControlsSnap.size,
    status: 'active',
  };
});

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

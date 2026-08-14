import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  Risk,
  RiskStatus,
  Issue,
  IssueStatus,
  IssueSeverity,
  Task,
  TaskStatus,
  ProcessorProfile,
  TransferArrangement,
  Evidence,
  evaluateProcessorRiskFlags,
  DerivedProcessorRiskRuleCode,
} from '@eurogovernance/shared-types';

export interface CreateRiskInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  category: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
  inherentLikelihood: number; // 1-5
  inherentImpact: number; // 1-5
  residualLikelihood?: number; // 1-5
  residualImpact?: number; // 1-5
  treatmentStrategy?: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan?: string;
  mitigatingControlIds?: string[];
  affectedAssetIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  vendorIds?: string[];
  derivedRuleCode?: DerivedProcessorRiskRuleCode | string | null;
  ownerId?: string;
  status?: RiskStatus;
}

export interface UpdateRiskInput {
  tenantId: string;
  riskId: string;
  title?: string;
  description?: string;
  category?: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
  status?: RiskStatus;
  inherentLikelihood?: number;
  inherentImpact?: number;
  residualLikelihood?: number;
  residualImpact?: number;
  treatmentStrategy?: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan?: string;
  mitigatingControlIds?: string[];
  affectedAssetIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  vendorIds?: string[];
  derivedRuleCode?: DerivedProcessorRiskRuleCode | string | null;
  ownerId?: string;
}

export interface DeleteRiskInput {
  tenantId: string;
  riskId: string;
}

export interface ListRisksInput {
  tenantId: string;
  status?: RiskStatus;
  category?: string;
  processorProfileId?: string;
  transferArrangementId?: string;
  vendorId?: string;
  derivedRuleCode?: string;
}

export interface CreateIssueInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  source: 'audit' | 'risk_assessment' | 'incident' | 'manual_flag' | 'automated_test';
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  dueDate: string;
  resolutionPlan?: string;
  ownerId?: string;
}

export interface UpdateIssueInput {
  tenantId: string;
  issueId: string;
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  dueDate?: string;
  resolutionPlan?: string;
  verifiedBy?: string;
}

export interface DeleteIssueInput {
  tenantId: string;
  issueId: string;
}

export interface ListIssuesInput {
  tenantId: string;
  status?: IssueStatus;
  severity?: IssueSeverity;
  sourceEntityType?: string;
  sourceEntityId?: string;
}

export interface CreateTaskInput {
  tenantId: string;
  title: string;
  description: string;
  parentEntityType: 'control' | 'evidence' | 'policy' | 'risk' | 'issue' | 'dpia' | 'ai_system';
  parentEntityId: string;
  assigneeId?: string;
  dueDate: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  tenantId: string;
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
}

export interface DeleteTaskInput {
  tenantId: string;
  taskId: string;
}

export interface ListTasksInput {
  tenantId: string;
  parentEntityType?: string;
  parentEntityId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

// -----------------------------------------------------------------------------
// RISKS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantRisk = onCall<CreateRiskInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    category,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood = inherentLikelihood,
    residualImpact = inherentImpact,
    treatmentStrategy = 'mitigate',
    treatmentPlan = '',
    mitigatingControlIds = [],
    affectedAssetIds = [],
    processorProfileIds = [],
    transferArrangementIds = [],
    vendorIds = [],
    derivedRuleCode = null,
    ownerId,
    status = 'identified',
  } = request.data;

  if (!tenantId || !code || !title || !category || !inherentLikelihood || !inherentImpact) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, category, inherentLikelihood, and inherentImpact are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc();
  const now = new Date().toISOString();

  const riskDoc: Risk = {
    id: riskRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    category,
    status,
    inherentLikelihood,
    inherentImpact,
    inherentScore: inherentLikelihood * inherentImpact,
    residualLikelihood,
    residualImpact,
    residualScore: residualLikelihood * residualImpact,
    treatmentStrategy,
    treatmentPlan,
    mitigatingControlIds,
    affectedAssetIds,
    processorProfileIds,
    transferArrangementIds,
    vendorIds,
    derivedRuleCode,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await riskRef.set(riskDoc);

  // Sync reverse links on Processor Profiles and Transfer Arrangements
  if (processorProfileIds.length > 0 || transferArrangementIds.length > 0) {
    const batch = db.batch();
    for (const profId of processorProfileIds) {
      const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId);
      const pSnap = await pRef.get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        const prevRisks = pData.linkedRiskIds || [];
        if (!prevRisks.includes(riskRef.id)) {
          batch.update(pRef, {
            linkedRiskIds: [...prevRisks, riskRef.id],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }

    for (const transId of transferArrangementIds) {
      const tRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(transId);
      const tSnap = await tRef.get();
      if (tSnap.exists) {
        const tData = tSnap.data() as TransferArrangement;
        const prevRisks = tData.linkedRiskIds || [];
        if (!prevRisks.includes(riskRef.id)) {
          batch.update(tRef, {
            linkedRiskIds: [...prevRisks, riskRef.id],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
    await batch.commit();
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskRef.id,
    action: 'create',
    afterSummary: { code: riskDoc.code, title: riskDoc.title, category, inherentScore: riskDoc.inherentScore, processorProfileIds },
    source: 'cloud_function',
    workflowContext: 'risk_creation',
  });

  return { success: true, riskId: riskRef.id, risk: riskDoc };
});

export const updateTenantRisk = onCall<UpdateRiskInput>(async (request) => {
  const { tenantId, riskId, ...updates } = request.data;
  if (!tenantId || !riskId) {
    throw new HttpsError('invalid-argument', 'tenantId and riskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
  const snap = await riskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Risk document not found.');
  }

  const prev = snap.data() as Risk;
  const now = new Date().toISOString();

  const resLikelihood = updates.residualLikelihood ?? prev.residualLikelihood;
  const resImpact = updates.residualImpact ?? prev.residualImpact;

  // If processorProfileIds or transferArrangementIds are being updated, sync reverse links
  if (updates.processorProfileIds && Array.isArray(updates.processorProfileIds)) {
    const batch = db.batch();
    for (const profId of updates.processorProfileIds) {
      const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId);
      const pSnap = await pRef.get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        const prevRisks = pData.linkedRiskIds || [];
        if (!prevRisks.includes(riskId)) {
          batch.update(pRef, {
            linkedRiskIds: [...prevRisks, riskId],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
    await batch.commit();
  }

  const payload: Partial<Risk> = {
    ...updates,
    residualScore: resLikelihood * resImpact,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await riskRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskId,
    action: 'update',
    beforeSummary: { status: prev.status, residualScore: prev.residualScore },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'risk_update',
  });

  return { success: true, riskId, updatedFields: payload };
});

export const deleteTenantRisk = onCall<DeleteRiskInput>(async (request) => {
  const { tenantId, riskId } = request.data;
  if (!tenantId || !riskId) {
    throw new HttpsError('invalid-argument', 'tenantId and riskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
  const snap = await riskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Risk document not found.');
  }

  const prev = snap.data() as Risk;
  await riskRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskId,
    action: 'delete',
    beforeSummary: { code: prev.code, title: prev.title },
    source: 'cloud_function',
    workflowContext: 'risk_deletion',
  });

  return { success: true, riskId, deleted: true };
});

export const listTenantRisks = onCall<ListRisksInput>(async (request) => {
  const { tenantId, status, category, processorProfileId, transferArrangementId, vendorId, derivedRuleCode } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('risks');
  if (status) query = query.where('status', '==', status);
  if (category) query = query.where('category', '==', category);
  if (processorProfileId) query = query.where('processorProfileIds', 'array-contains', processorProfileId);
  if (transferArrangementId) query = query.where('transferArrangementIds', 'array-contains', transferArrangementId);
  if (vendorId) query = query.where('vendorIds', 'array-contains', vendorId);
  if (derivedRuleCode) query = query.where('derivedRuleCode', '==', derivedRuleCode);

  const snap = await query.get();
  const risks: Risk[] = snap.docs.map((d) => d.data() as Risk);

  return { success: true, count: risks.length, risks };
});

export interface LinkRiskToProcessorOrTransferInput {
  tenantId: string;
  riskId: string;
  processorProfileId?: string;
  transferArrangementId?: string;
  vendorId?: string;
}

export const linkRiskToProcessorOrTransfer = onCall<LinkRiskToProcessorOrTransferInput>(async (request) => {
  const { tenantId, riskId, processorProfileId, transferArrangementId, vendorId } = request.data;
  if (!tenantId || !riskId || (!processorProfileId && !transferArrangementId && !vendorId)) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, riskId, and at least one of processorProfileId, transferArrangementId, or vendorId are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
  const snap = await riskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Risk ${riskId} not found.`);
  }

  const prev = snap.data() as Risk;
  const now = new Date().toISOString();
  const batch = db.batch();

  const mergedProfiles = processorProfileId
    ? Array.from(new Set([...(prev.processorProfileIds || []), processorProfileId]))
    : prev.processorProfileIds || [];

  const mergedTransfers = transferArrangementId
    ? Array.from(new Set([...(prev.transferArrangementIds || []), transferArrangementId]))
    : prev.transferArrangementIds || [];

  const mergedVendors = vendorId
    ? Array.from(new Set([...(prev.vendorIds || []), vendorId]))
    : prev.vendorIds || [];

  if (processorProfileId) {
    const profRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
    const profSnap = await profRef.get();
    if (profSnap.exists) {
      const pData = profSnap.data() as ProcessorProfile;
      const prevRisks = pData.linkedRiskIds || [];
      if (!prevRisks.includes(riskId)) {
        batch.update(profRef, {
          linkedRiskIds: [...prevRisks, riskId],
          updatedAt: now,
          updatedBy: authContext.userId,
        });
      }
    }
  }

  if (transferArrangementId) {
    const transRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(transferArrangementId);
    const transSnap = await transRef.get();
    if (transSnap.exists) {
      const tData = transSnap.data() as TransferArrangement;
      const prevRisks = tData.linkedRiskIds || [];
      if (!prevRisks.includes(riskId)) {
        batch.update(transRef, {
          linkedRiskIds: [...prevRisks, riskId],
          updatedAt: now,
          updatedBy: authContext.userId,
        });
      }
    }
  }

  batch.update(riskRef, {
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    vendorIds: mergedVendors,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskId,
    action: 'link',
    beforeSummary: { processorProfileIds: prev.processorProfileIds, transferArrangementIds: prev.transferArrangementIds },
    afterSummary: { riskId, processorProfileId, transferArrangementId, vendorId },
    source: 'cloud_function',
    workflowContext: 'risk_processor_linking',
  });

  return {
    success: true,
    riskId,
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    vendorIds: mergedVendors,
  };
});

export interface GetProcessorRiskSummaryInput {
  tenantId: string;
  processorProfileId: string;
}

export const getProcessorRiskSummary = onCall<GetProcessorRiskSummaryInput>(async (request) => {
  const { tenantId, processorProfileId } = request.data;
  if (!tenantId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileId are required.');
  }

  await requireTenantMember(request, tenantId);

  const profRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
  const profSnap = await profRef.get();
  if (!profSnap.exists) {
    throw new HttpsError('not-found', `Processor profile ${processorProfileId} not found.`);
  }
  const profile = profSnap.data() as ProcessorProfile;

  const transSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('transfer_arrangements')
    .where('processorProfileId', '==', processorProfileId)
    .get();
  const transfers = transSnap.docs.map((d) => d.data() as TransferArrangement);

  const evSnap = await db.collection('tenants').doc(tenantId).collection('evidence').get();
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  const summary = evaluateProcessorRiskFlags(profile, transfers, evidenceDocs);

  return { success: true, summary };
});

export interface SyncDerivedProcessorRisksInput {
  tenantId: string;
  processorProfileId: string;
  autoCreateRisks?: boolean;
}

export const syncDerivedProcessorRisks = onCall<SyncDerivedProcessorRisksInput>(async (request) => {
  const { tenantId, processorProfileId, autoCreateRisks = false } = request.data;
  if (!tenantId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const profRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
  const profSnap = await profRef.get();
  if (!profSnap.exists) {
    throw new HttpsError('not-found', `Processor profile ${processorProfileId} not found.`);
  }
  const profile = profSnap.data() as ProcessorProfile;

  const transSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('transfer_arrangements')
    .where('processorProfileId', '==', processorProfileId)
    .get();
  const transfers = transSnap.docs.map((d) => d.data() as TransferArrangement);

  const evSnap = await db.collection('tenants').doc(tenantId).collection('evidence').get();
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  const summary = evaluateProcessorRiskFlags(profile, transfers, evidenceDocs);
  const createdRiskIds: string[] = [];

  if (autoCreateRisks && summary.flags.length > 0) {
    const existingRisksSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('risks')
      .where('processorProfileIds', 'array-contains', processorProfileId)
      .get();

    const existingRisks = existingRisksSnap.docs.map((d) => d.data() as Risk);
    const now = new Date().toISOString();
    const batch = db.batch();

    for (const flag of summary.flags) {
      // Deduplication: check if active risk with this derivedRuleCode already exists for this processor & entity
      const alreadyExists = existingRisks.some(
        (r) =>
          r.derivedRuleCode === flag.ruleCode &&
          (flag.transferArrangementId ? r.transferArrangementIds?.includes(flag.transferArrangementId) : true) &&
          r.status !== 'closed'
      );

      if (!alreadyExists) {
        const newRiskRef = db.collection('tenants').doc(tenantId).collection('risks').doc();
        const code = `RSK-PROC-${Math.floor(1000 + Math.random() * 9000)}`;

        const newRiskDoc: Risk = {
          id: newRiskRef.id,
          tenantId,
          code,
          title: flag.title,
          description: flag.description,
          category: 'third_party',
          status: 'identified',
          inherentLikelihood: flag.inherentLikelihood,
          inherentImpact: flag.inherentImpact,
          inherentScore: flag.inherentScore,
          residualLikelihood: flag.inherentLikelihood,
          residualImpact: flag.inherentImpact,
          residualScore: flag.inherentScore,
          treatmentStrategy: 'mitigate',
          treatmentPlan: flag.suggestedTreatment,
          mitigatingControlIds: [],
          affectedAssetIds: profile.linkedSystemAssetIds || [],
          processorProfileIds: [processorProfileId],
          transferArrangementIds: flag.transferArrangementId ? [flag.transferArrangementId] : [],
          vendorIds: profile.vendorId ? [profile.vendorId] : [],
          derivedRuleCode: flag.ruleCode,
          ownerId: authContext.userId,
          createdAt: now,
          updatedAt: now,
          createdBy: authContext.userId,
          updatedBy: authContext.userId,
        };

        batch.set(newRiskRef, newRiskDoc);
        createdRiskIds.push(newRiskRef.id);
      }
    }

    if (createdRiskIds.length > 0) {
      const prevLinkedRisks = profile.linkedRiskIds || [];
      batch.update(profRef, {
        linkedRiskIds: Array.from(new Set([...prevLinkedRisks, ...createdRiskIds])),
        updatedAt: now,
        updatedBy: authContext.userId,
      });
      await batch.commit();

      await recordAuditLog({
        tenantId,
        actorId: authContext.userId,
        actorEmail: authContext.email,
        actorRole: authContext.role,
        entityType: 'processor_profile',
        entityId: processorProfileId,
        action: 'create',
        afterSummary: { createdRiskIds, totalCreated: createdRiskIds.length },
        source: 'cloud_function',
        workflowContext: 'derived_processor_risk_synchronization',
      });
    }
  }

  return {
    success: true,
    summary,
    autoCreatedRiskIds: createdRiskIds,
  };
});

// -----------------------------------------------------------------------------
// ISSUES & REMEDIATIONS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantIssue = onCall<CreateIssueInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    severity,
    source,
    sourceEntityId = null,
    sourceEntityType = null,
    dueDate,
    resolutionPlan = '',
    ownerId,
  } = request.data;

  if (!tenantId || !code || !title || !severity || !source || !dueDate) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, severity, source, and dueDate are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc();
  const now = new Date().toISOString();

  const issueDoc: Issue = {
    id: issueRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    severity,
    status: 'open',
    source,
    sourceEntityId,
    sourceEntityType,
    dueDate,
    resolutionPlan,
    resolvedAt: null,
    verifiedBy: null,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await issueRef.set(issueDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueRef.id,
    action: 'create',
    afterSummary: { code: issueDoc.code, title: issueDoc.title, severity, source, dueDate },
    source: 'cloud_function',
    workflowContext: 'issue_creation',
  });

  return { success: true, issueId: issueRef.id, issue: issueDoc };
});

export const updateTenantIssue = onCall<UpdateIssueInput>(async (request) => {
  const { tenantId, issueId, status, ...updates } = request.data;
  if (!tenantId || !issueId) {
    throw new HttpsError('invalid-argument', 'tenantId and issueId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc(issueId);
  const snap = await issueRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Issue document not found.');
  }

  const prev = snap.data() as Issue;
  const now = new Date().toISOString();

  const payload: Partial<Issue> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    payload.status = status;
    if (status === 'resolved' || status === 'closed') {
      payload.resolvedAt = now;
      payload.verifiedBy = authContext.userId;
    }
  }

  await issueRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueId,
    action: 'update',
    beforeSummary: { status: prev.status, severity: prev.severity },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'issue_update',
  });

  return { success: true, issueId, updatedFields: payload };
});

export const deleteTenantIssue = onCall<DeleteIssueInput>(async (request) => {
  const { tenantId, issueId } = request.data;
  if (!tenantId || !issueId) {
    throw new HttpsError('invalid-argument', 'tenantId and issueId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc(issueId);
  const snap = await issueRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Issue document not found.');
  }

  const prev = snap.data() as Issue;
  await issueRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueId,
    action: 'delete',
    beforeSummary: { code: prev.code, title: prev.title },
    source: 'cloud_function',
    workflowContext: 'issue_deletion',
  });

  return { success: true, issueId, deleted: true };
});

export const listTenantIssues = onCall<ListIssuesInput>(async (request) => {
  const { tenantId, status, severity, sourceEntityType, sourceEntityId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('issues');
  if (status) query = query.where('status', '==', status);
  if (severity) query = query.where('severity', '==', severity);
  if (sourceEntityType) query = query.where('sourceEntityType', '==', sourceEntityType);
  if (sourceEntityId) query = query.where('sourceEntityId', '==', sourceEntityId);

  const snap = await query.get();
  const issues: Issue[] = snap.docs.map((d) => d.data() as Issue);

  return { success: true, count: issues.length, issues };
});

// -----------------------------------------------------------------------------
// TASKS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantTask = onCall<CreateTaskInput>(async (request) => {
  const {
    tenantId,
    title,
    description,
    parentEntityType,
    parentEntityId,
    assigneeId,
    dueDate,
    status = 'todo',
  } = request.data;

  if (!tenantId || !title || !parentEntityType || !parentEntityId || !dueDate) {
    throw new HttpsError('invalid-argument', 'tenantId, title, parentEntityType, parentEntityId, and dueDate are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc();
  const now = new Date().toISOString();

  const taskDoc: Task = {
    id: taskRef.id,
    tenantId,
    title: title.trim(),
    description: description.trim(),
    status,
    assigneeId: assigneeId || authContext.userId,
    parentEntityType,
    parentEntityId,
    dueDate,
    completedAt: null,
    ownerId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await taskRef.set(taskDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskRef.id,
    action: 'create',
    afterSummary: { title: taskDoc.title, parentEntityType, parentEntityId, dueDate, assigneeId: taskDoc.assigneeId },
    source: 'cloud_function',
    workflowContext: 'task_creation',
  });

  if (taskDoc.assigneeId && taskDoc.assigneeId !== authContext.userId) {
    await createNotification({
      tenantId,
      recipientId: taskDoc.assigneeId,
      title: 'New Remediation Task Assigned',
      message: `You have been assigned task: "${taskDoc.title}" due on ${dueDate}.`,
      type: 'task_assigned',
      priority: 'medium',
      sourceEntityType: 'task',
      sourceEntityId: taskRef.id,
    });
  }

  return { success: true, taskId: taskRef.id, task: taskDoc };
});

export const updateTenantTask = onCall<UpdateTaskInput>(async (request) => {
  const { tenantId, taskId, status, ...updates } = request.data;
  if (!tenantId || !taskId) {
    throw new HttpsError('invalid-argument', 'tenantId and taskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Task document not found.');
  }

  const prev = snap.data() as Task;
  const now = new Date().toISOString();

  const payload: Partial<Task> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    payload.status = status;
    if (status === 'completed') {
      payload.completedAt = now;
    }
  }

  await taskRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskId,
    action: 'update',
    beforeSummary: { status: prev.status, assigneeId: prev.assigneeId },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'task_update',
  });

  return { success: true, taskId, updatedFields: payload };
});

export const deleteTenantTask = onCall<DeleteTaskInput>(async (request) => {
  const { tenantId, taskId } = request.data;
  if (!tenantId || !taskId) {
    throw new HttpsError('invalid-argument', 'tenantId and taskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Task document not found.');
  }

  const prev = snap.data() as Task;
  await taskRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskId,
    action: 'delete',
    beforeSummary: { title: prev.title, parentEntityType: prev.parentEntityType, parentEntityId: prev.parentEntityId },
    source: 'cloud_function',
    workflowContext: 'task_deletion',
  });

  return { success: true, taskId, deleted: true };
});

export const listTenantTasks = onCall<ListTasksInput>(async (request) => {
  const { tenantId, parentEntityType, parentEntityId, assigneeId, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('tasks');
  if (parentEntityType) query = query.where('parentEntityType', '==', parentEntityType);
  if (parentEntityId) query = query.where('parentEntityId', '==', parentEntityId);
  if (assigneeId) query = query.where('assigneeId', '==', assigneeId);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const tasks: Task[] = snap.docs.map((d) => d.data() as Task);

  return { success: true, count: tasks.length, tasks };
});

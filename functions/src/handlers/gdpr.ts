import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  ROPAEntry,
  ROPAStatus,
  LegalBasisType,
  TransferMechanism,
  DPIA,
  DPIAStatus,
  TIA,
  TIAStatus,
  PersonalDataBreach,
  BreachSeverity,
  BreachStatus,
  BreachReportingSource,
  DSRRequest,
  DSRType,
  DSRStatus,
  TransferArrangement,
  ProcessorProfile,
  prefillROPAFromProcessors,
  synthesizeDPIAProcessorContext,
  summarizeProcessorBreachHistory,
} from '@eurogovernance/shared-types';

// -----------------------------------------------------------------------------
// 1. ROPA ENTRIES HANDLERS
// -----------------------------------------------------------------------------

export interface CreateROPAInput {
  tenantId: string;
  activityCode: string;
  activityName: string;
  purpose: string;
  legalBasis: LegalBasisType;
  legalBasisRationale: string;
  isSpecialCategoryData?: boolean;
  specialCategoryBasis?: string | null;
  dataSubjectCategories: string[];
  personalDataCategories: string[];
  retentionPeriodDescription: string;
  retentionPeriodMonths: number;
  dataSecurityMeasuresSummary?: string;
  jointControllerInfo?: string | null;
  processorIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  recipientCategories?: string[];
  involvesInternationalTransfer?: boolean;
  destinationCountries?: string[];
  transferMechanism?: TransferMechanism | null;
  dpiaRequired?: boolean;
  linkedDpiaId?: string | null;
  linkedTiaId?: string | null;
  linkedSystemAssetIds?: string[];
  ownerId?: string;
  status?: ROPAStatus;
}

export interface UpdateROPAInput {
  tenantId: string;
  ropaId: string;
  activityName?: string;
  purpose?: string;
  legalBasis?: LegalBasisType;
  legalBasisRationale?: string;
  isSpecialCategoryData?: boolean;
  specialCategoryBasis?: string | null;
  dataSubjectCategories?: string[];
  personalDataCategories?: string[];
  retentionPeriodDescription?: string;
  retentionPeriodMonths?: number;
  dataSecurityMeasuresSummary?: string;
  processorIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  involvesInternationalTransfer?: boolean;
  destinationCountries?: string[];
  transferMechanism?: TransferMechanism | null;
  dpiaRequired?: boolean;
  linkedDpiaId?: string | null;
  linkedTiaId?: string | null;
  linkedSystemAssetIds?: string[];
  status?: ROPAStatus;
  ownerId?: string;
}

export interface DeleteROPAInput {
  tenantId: string;
  ropaId: string;
}

export interface ListROPAInput {
  tenantId: string;
  status?: ROPAStatus;
  legalBasis?: LegalBasisType;
  isSpecialCategoryData?: boolean;
  involvesInternationalTransfer?: boolean;
  processorProfileId?: string;
  transferArrangementId?: string;
}

export const createTenantROPA = onCall<CreateROPAInput>(async (request) => {
  const {
    tenantId,
    activityCode,
    activityName,
    purpose,
    legalBasis,
    legalBasisRationale,
    isSpecialCategoryData = false,
    specialCategoryBasis = null,
    dataSubjectCategories,
    personalDataCategories,
    retentionPeriodDescription,
    retentionPeriodMonths,
    dataSecurityMeasuresSummary = '',
    jointControllerInfo = null,
    processorIds = [],
    processorProfileIds = [],
    transferArrangementIds = [],
    recipientCategories = [],
    involvesInternationalTransfer = false,
    destinationCountries = [],
    transferMechanism = null,
    dpiaRequired = false,
    linkedDpiaId = null,
    linkedTiaId = null,
    linkedSystemAssetIds = [],
    ownerId,
    status = 'active',
  } = request.data;

  if (
    !tenantId ||
    !activityCode ||
    !activityName ||
    !purpose ||
    !legalBasis ||
    !dataSubjectCategories ||
    !personalDataCategories ||
    !retentionPeriodDescription ||
    retentionPeriodMonths === undefined
  ) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, activityCode, activityName, purpose, legalBasis, dataSubjectCategories, personalDataCategories, retentionPeriodDescription, and retentionPeriodMonths are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const ropaRef = db.collection('tenants').doc(tenantId).collection('ropa_entries').doc();
  const now = new Date().toISOString();

  // If processorProfileIds provided, gather vendorIds from profiles to ensure normalization
  const vendorIdsSet = new Set<string>(processorIds);
  if (processorProfileIds && processorProfileIds.length > 0) {
    for (const profId of processorProfileIds) {
      const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId).get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        if (pData.vendorId) vendorIdsSet.add(pData.vendorId);
        // Sync reverse reference
        const prevRopas = pData.linkedRopaIds || [];
        if (!prevRopas.includes(ropaRef.id)) {
          await pSnap.ref.update({
            linkedRopaIds: [...prevRopas, ropaRef.id],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
  }

  const ropaDoc: ROPAEntry = {
    id: ropaRef.id,
    tenantId,
    activityCode: activityCode.trim().toUpperCase(),
    activityName: activityName.trim(),
    purpose: purpose.trim(),
    legalBasis,
    legalBasisRationale: legalBasisRationale ? legalBasisRationale.trim() : '',
    isSpecialCategoryData,
    specialCategoryBasis,
    dataSubjectCategories,
    personalDataCategories,
    retentionPeriodDescription: retentionPeriodDescription.trim(),
    retentionPeriodMonths,
    dataSecurityMeasuresSummary: dataSecurityMeasuresSummary.trim(),
    jointControllerInfo,
    processorIds: Array.from(vendorIdsSet),
    processorProfileIds,
    transferArrangementIds,
    recipientCategories,
    involvesInternationalTransfer,
    destinationCountries,
    transferMechanism,
    dpiaRequired,
    linkedDpiaId,
    linkedTiaId,
    linkedSystemAssetIds,
    status,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await ropaRef.set(ropaDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ropa_entry',
    entityId: ropaRef.id,
    action: 'create',
    afterSummary: { activityCode: ropaDoc.activityCode, activityName: ropaDoc.activityName, legalBasis, processorProfileIds },
    source: 'cloud_function',
    workflowContext: 'ropa_creation',
  });

  return { success: true, ropaId: ropaRef.id, ropa: ropaDoc };
});

export const updateTenantROPA = onCall<UpdateROPAInput>(async (request) => {
  const { tenantId, ropaId, ...updates } = request.data;
  if (!tenantId || !ropaId) {
    throw new HttpsError('invalid-argument', 'tenantId and ropaId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const ropaRef = db.collection('tenants').doc(tenantId).collection('ropa_entries').doc(ropaId);
  const snap = await ropaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'ROPA entry not found.');
  }

  const prev = snap.data() as ROPAEntry;
  const now = new Date().toISOString();

  // If processorProfileIds updated, sync reverse reference on processor profiles
  if (updates.processorProfileIds && Array.isArray(updates.processorProfileIds)) {
    for (const profId of updates.processorProfileIds) {
      const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId);
      const pSnap = await pRef.get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        const prevRopas = pData.linkedRopaIds || [];
        if (!prevRopas.includes(ropaId)) {
          await pRef.update({
            linkedRopaIds: [...prevRopas, ropaId],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
  }

  const payload: Partial<ROPAEntry> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await ropaRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ropa_entry',
    entityId: ropaId,
    action: 'update',
    beforeSummary: { activityName: prev.activityName, status: prev.status },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'ropa_update',
  });

  return { success: true, ropaId, updatedFields: payload };
});

export const deleteTenantROPA = onCall<DeleteROPAInput>(async (request) => {
  const { tenantId, ropaId } = request.data;
  if (!tenantId || !ropaId) {
    throw new HttpsError('invalid-argument', 'tenantId and ropaId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const ropaRef = db.collection('tenants').doc(tenantId).collection('ropa_entries').doc(ropaId);
  const snap = await ropaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'ROPA entry not found.');
  }

  const prev = snap.data() as ROPAEntry;
  await ropaRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ropa_entry',
    entityId: ropaId,
    action: 'delete',
    beforeSummary: { activityCode: prev.activityCode, activityName: prev.activityName },
    source: 'cloud_function',
    workflowContext: 'ropa_deletion',
  });

  return { success: true, ropaId, deleted: true };
});

export const listTenantROPA = onCall<ListROPAInput>(async (request) => {
  const { tenantId, status, legalBasis, isSpecialCategoryData, involvesInternationalTransfer, processorProfileId, transferArrangementId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('ropa_entries');
  if (status) query = query.where('status', '==', status);
  if (legalBasis) query = query.where('legalBasis', '==', legalBasis);
  if (isSpecialCategoryData !== undefined) query = query.where('isSpecialCategoryData', '==', isSpecialCategoryData);
  if (involvesInternationalTransfer !== undefined) query = query.where('involvesInternationalTransfer', '==', involvesInternationalTransfer);
  if (processorProfileId) query = query.where('processorProfileIds', 'array-contains', processorProfileId);
  if (transferArrangementId) query = query.where('transferArrangementIds', 'array-contains', transferArrangementId);

  const snap = await query.get();
  const ropaEntries: ROPAEntry[] = snap.docs.map((d) => d.data() as ROPAEntry);

  return { success: true, count: ropaEntries.length, ropaEntries };
});

export interface LinkProcessorProfilesToROPAInput {
  tenantId: string;
  ropaId: string;
  processorProfileIds: string[];
  transferArrangementIds?: string[];
}

export const linkProcessorProfilesToROPA = onCall<LinkProcessorProfilesToROPAInput>(async (request) => {
  const { tenantId, ropaId, processorProfileIds, transferArrangementIds = [] } = request.data;
  if (!tenantId || !ropaId || !processorProfileIds || !Array.isArray(processorProfileIds)) {
    throw new HttpsError('invalid-argument', 'tenantId, ropaId, and processorProfileIds (array) are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  // 1. Fetch ROPA Entry
  const ropaRef = db.collection('tenants').doc(tenantId).collection('ropa_entries').doc(ropaId);
  const ropaSnap = await ropaRef.get();
  if (!ropaSnap.exists) {
    throw new HttpsError('not-found', `ROPA entry ${ropaId} not found.`);
  }
  const ropa = ropaSnap.data() as ROPAEntry;

  const now = new Date().toISOString();

  // 2. Fetch and verify all Processor Profiles
  const currentProfiles = ropa.processorProfileIds || [];
  const mergedProfiles = Array.from(new Set([...currentProfiles, ...processorProfileIds]));

  const currentTransfers = ropa.transferArrangementIds || [];
  const mergedTransfers = Array.from(new Set([...currentTransfers, ...transferArrangementIds]));

  const vendorIdsSet = new Set<string>(ropa.processorIds || []);
  const batch = db.batch();

  for (const profId of processorProfileIds) {
    const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId);
    const pSnap = await pRef.get();
    if (pSnap.exists) {
      const pData = pSnap.data() as ProcessorProfile;
      if (pData.vendorId) vendorIdsSet.add(pData.vendorId);
      const linkedRopas = pData.linkedRopaIds || [];
      if (!linkedRopas.includes(ropaId)) {
        batch.update(pRef, {
          linkedRopaIds: [...linkedRopas, ropaId],
          updatedAt: now,
          updatedBy: authContext.userId,
        });
      }
    }
  }

  // Update ROPA
  batch.update(ropaRef, {
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    processorIds: Array.from(vendorIdsSet),
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ropa_entry',
    entityId: ropaId,
    action: 'link',
    beforeSummary: { processorProfileIds: currentProfiles, transferArrangementIds: currentTransfers },
    afterSummary: { ropaId, processorProfileIds: mergedProfiles, transferArrangementIds: mergedTransfers },
    source: 'cloud_function',
    workflowContext: 'ropa_processor_linking',
  });

  return { success: true, ropaId, processorProfileIds: mergedProfiles, transferArrangementIds: mergedTransfers };
});

export interface GetROPAForProcessorProfileInput {
  tenantId: string;
  processorProfileId: string;
}

export const getROPAForProcessorProfile = onCall<GetROPAForProcessorProfileInput>(async (request) => {
  const { tenantId, processorProfileId } = request.data;
  if (!tenantId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileId are required.');
  }

  await requireTenantMember(request, tenantId);

  // Query all ROPA entries referencing this processor profile
  const snap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('ropa_entries')
    .where('processorProfileIds', 'array-contains', processorProfileId)
    .get();

  const ropaEntries: ROPAEntry[] = snap.docs.map((d) => d.data() as ROPAEntry);

  return { success: true, processorProfileId, count: ropaEntries.length, ropaEntries };
});

export interface GetROPAPrefillInput {
  tenantId: string;
  processorProfileIds: string[];
  transferArrangementIds?: string[];
}

export const getROPAPrefillFromProcessors = onCall<GetROPAPrefillInput>(async (request) => {
  const { tenantId, processorProfileIds, transferArrangementIds = [] } = request.data;
  if (!tenantId || !processorProfileIds || !Array.isArray(processorProfileIds)) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileIds (array) are required.');
  }

  await requireTenantMember(request, tenantId);

  const profiles: ProcessorProfile[] = [];
  for (const profId of processorProfileIds) {
    const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId).get();
    if (pSnap.exists) {
      profiles.push(pSnap.data() as ProcessorProfile);
    }
  }

  const transfers: TransferArrangement[] = [];
  for (const transId of transferArrangementIds) {
    const tSnap = await db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(transId).get();
    if (tSnap.exists) {
      transfers.push(tSnap.data() as TransferArrangement);
    }
  }

  const prefillData = prefillROPAFromProcessors(profiles, transfers);

  return { success: true, prefillData };
});

// -----------------------------------------------------------------------------
// 2. DPIA ASSESSMENTS HANDLERS
// -----------------------------------------------------------------------------

export interface CreateDPIAInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  ropaEntryId: string;
  screeningQuestionsAnswers: {
    systematicEvaluation: boolean;
    automatedDecisionMaking: boolean;
    largeScaleSpecialCategories: boolean;
    vulnerableSubjects: boolean;
    innovativeTechUsage: boolean;
    preventsExercisingRights: boolean;
  };
  necessityAndProportionalityAssessment?: string;
  residualRiskLevel?: 'low' | 'medium' | 'high';
  mitigatingControlIds?: string[];
  nextReviewDate?: string;
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  thirdPartySafeguardsSummary?: string | null;
  ownerId?: string;
}

export interface TransitionDPIAInput {
  tenantId: string;
  dpiaId: string;
  targetStatus: DPIAStatus;
  dpoOpinionNotes?: string;
}

export interface ListDPIAInput {
  tenantId: string;
  status?: DPIAStatus;
  ropaEntryId?: string;
  residualRiskLevel?: string;
}

export const createTenantDPIA = onCall<CreateDPIAInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    ropaEntryId,
    screeningQuestionsAnswers,
    necessityAndProportionalityAssessment = '',
    residualRiskLevel = 'medium',
    mitigatingControlIds = [],
    nextReviewDate,
    processorProfileIds: directProfileIds,
    transferArrangementIds: directTransferIds,
    thirdPartySafeguardsSummary: directSafeguards,
    ownerId,
  } = request.data;

  if (!tenantId || !code || !title || !ropaEntryId || !screeningQuestionsAnswers) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, ropaEntryId, and screeningQuestionsAnswers are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  // Inherit processor profiles and transfer arrangements from ROPA if not explicitly provided
  let effectiveProfileIds = directProfileIds || [];
  let effectiveTransferIds = directTransferIds || [];
  if (effectiveProfileIds.length === 0 && effectiveTransferIds.length === 0) {
    const ropaSnap = await db.collection('tenants').doc(tenantId).collection('ropa_entries').doc(ropaEntryId).get();
    if (ropaSnap.exists) {
      const ropa = ropaSnap.data() as ROPAEntry;
      if (ropa.processorProfileIds && ropa.processorProfileIds.length > 0) {
        effectiveProfileIds = ropa.processorProfileIds;
      }
      if (ropa.transferArrangementIds && ropa.transferArrangementIds.length > 0) {
        effectiveTransferIds = ropa.transferArrangementIds;
      }
    }
  }

  // Calculate safeguards summary if not provided
  let effectiveSafeguards = directSafeguards || null;
  if (!effectiveSafeguards && (effectiveProfileIds.length > 0 || effectiveTransferIds.length > 0)) {
    const profiles: ProcessorProfile[] = [];
    for (const pId of effectiveProfileIds) {
      const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(pId).get();
      if (pSnap.exists) profiles.push(pSnap.data() as ProcessorProfile);
    }
    const transfers: TransferArrangement[] = [];
    for (const tId of effectiveTransferIds) {
      const tSnap = await db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(tId).get();
      if (tSnap.exists) transfers.push(tSnap.data() as TransferArrangement);
    }
    const context = synthesizeDPIAProcessorContext(profiles, transfers);
    effectiveSafeguards = context.safeguardsSummary;
  }

  // Screening logic: 2 or more true criteria requires full DPIA
  const positiveCriteriaCount = Object.values(screeningQuestionsAnswers).filter(Boolean).length;
  const initialStatus: DPIAStatus = positiveCriteriaCount >= 2 ? 'in_review' : 'draft';

  const dpiaRef = db.collection('tenants').doc(tenantId).collection('dpia_assessments').doc();
  const now = new Date().toISOString();
  const reviewDue = nextReviewDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const dpiaDoc: DPIA = {
    id: dpiaRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    ropaEntryId,
    status: initialStatus,
    screeningQuestionsAnswers,
    necessityAndProportionalityAssessment: necessityAndProportionalityAssessment.trim(),
    dpoOpinionNotes: null,
    dpoApprovalDate: null,
    residualRiskLevel,
    mitigatingControlIds,
    nextReviewDate: reviewDue,
    processorProfileIds: effectiveProfileIds,
    transferArrangementIds: effectiveTransferIds,
    thirdPartySafeguardsSummary: effectiveSafeguards,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await dpiaRef.set(dpiaDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dpia_assessment',
    entityId: dpiaRef.id,
    action: 'create',
    afterSummary: { code: dpiaDoc.code, title: dpiaDoc.title, initialStatus, positiveCriteriaCount, processorProfileIds: effectiveProfileIds },
    source: 'cloud_function',
    workflowContext: 'dpia_creation',
  });

  return { success: true, dpiaId: dpiaRef.id, dpia: dpiaDoc };
});

export const transitionTenantDPIAStatus = onCall<TransitionDPIAInput>(async (request) => {
  const { tenantId, dpiaId, targetStatus, dpoOpinionNotes } = request.data;
  if (!tenantId || !dpiaId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, dpiaId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'privacy_manager',
    'compliance_manager',
    'tenant_admin',
    'approver',
  ]);

  const dpiaRef = db.collection('tenants').doc(tenantId).collection('dpia_assessments').doc(dpiaId);
  const snap = await dpiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'DPIA assessment not found.');
  }

  const prev = snap.data() as DPIA;
  const now = new Date().toISOString();

  const updates: Partial<DPIA> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved') {
    updates.dpoOpinionNotes = dpoOpinionNotes || prev.dpoOpinionNotes || 'Approved by Data Protection Officer';
    updates.dpoApprovalDate = now;
  } else if (dpoOpinionNotes) {
    updates.dpoOpinionNotes = dpoOpinionNotes;
  }

  await dpiaRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dpia_assessment',
    entityId: dpiaId,
    action: targetStatus === 'approved' ? 'approve' : 'status_transition',
    beforeSummary: { status: prev.status },
    afterSummary: { status: targetStatus, dpoOpinionNotes: updates.dpoOpinionNotes },
    source: 'cloud_function',
    workflowContext: 'dpia_status_transition',
  });

  return { success: true, dpiaId, status: targetStatus, dpoApprovalDate: updates.dpoApprovalDate };
});

export const listTenantDPIAs = onCall<ListDPIAInput>(async (request) => {
  const { tenantId, status, ropaEntryId, residualRiskLevel } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('dpia_assessments');
  if (status) query = query.where('status', '==', status);
  if (ropaEntryId) query = query.where('ropaEntryId', '==', ropaEntryId);
  if (residualRiskLevel) query = query.where('residualRiskLevel', '==', residualRiskLevel);

  const snap = await query.get();
  const dpias: DPIA[] = snap.docs.map((d) => d.data() as DPIA);

  return { success: true, count: dpias.length, dpias };
});

export interface LinkProcessorsToDPIAInput {
  tenantId: string;
  dpiaId: string;
  processorProfileIds: string[];
  transferArrangementIds?: string[];
}

export const linkProcessorsToDPIA = onCall<LinkProcessorsToDPIAInput>(async (request) => {
  const { tenantId, dpiaId, processorProfileIds, transferArrangementIds = [] } = request.data;
  if (!tenantId || !dpiaId || !processorProfileIds || !Array.isArray(processorProfileIds)) {
    throw new HttpsError('invalid-argument', 'tenantId, dpiaId, and processorProfileIds (array) are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const dpiaRef = db.collection('tenants').doc(tenantId).collection('dpia_assessments').doc(dpiaId);
  const snap = await dpiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `DPIA ${dpiaId} not found.`);
  }

  const prev = snap.data() as DPIA;
  const now = new Date().toISOString();

  const mergedProfiles = Array.from(new Set([...(prev.processorProfileIds || []), ...processorProfileIds]));
  const mergedTransfers = Array.from(new Set([...(prev.transferArrangementIds || []), ...transferArrangementIds]));

  // Load profiles & transfers to synthesize updated safeguards summary
  const profiles: ProcessorProfile[] = [];
  for (const pId of mergedProfiles) {
    const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(pId).get();
    if (pSnap.exists) profiles.push(pSnap.data() as ProcessorProfile);
  }
  const transfers: TransferArrangement[] = [];
  for (const tId of mergedTransfers) {
    const tSnap = await db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(tId).get();
    if (tSnap.exists) transfers.push(tSnap.data() as TransferArrangement);
  }

  const context = synthesizeDPIAProcessorContext(profiles, transfers);

  const updates: Partial<DPIA> = {
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    thirdPartySafeguardsSummary: context.safeguardsSummary,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await dpiaRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dpia_assessment',
    entityId: dpiaId,
    action: 'link',
    beforeSummary: { processorProfileIds: prev.processorProfileIds, transferArrangementIds: prev.transferArrangementIds },
    afterSummary: { processorProfileIds: mergedProfiles, transferArrangementIds: mergedTransfers },
    source: 'cloud_function',
    workflowContext: 'dpia_processor_linking',
  });

  return {
    success: true,
    dpiaId,
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    safeguardsSummary: context.safeguardsSummary,
  };
});

export interface GetDPIAProcessorContextInput {
  tenantId: string;
  dpiaId: string;
}

export const getDPIAProcessorContext = onCall<GetDPIAProcessorContextInput>(async (request) => {
  const { tenantId, dpiaId } = request.data;
  if (!tenantId || !dpiaId) {
    throw new HttpsError('invalid-argument', 'tenantId and dpiaId are required.');
  }

  await requireTenantMember(request, tenantId);

  const dpiaRef = db.collection('tenants').doc(tenantId).collection('dpia_assessments').doc(dpiaId);
  const snap = await dpiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `DPIA ${dpiaId} not found.`);
  }

  const dpia = snap.data() as DPIA;

  let profileIds = dpia.processorProfileIds || [];
  let transferIds = dpia.transferArrangementIds || [];

  // If empty on DPIA, inherit from linked ROPA entry
  if (profileIds.length === 0 && dpia.ropaEntryId) {
    const ropaSnap = await db.collection('tenants').doc(tenantId).collection('ropa_entries').doc(dpia.ropaEntryId).get();
    if (ropaSnap.exists) {
      const ropa = ropaSnap.data() as ROPAEntry;
      if (ropa.processorProfileIds && ropa.processorProfileIds.length > 0) {
        profileIds = ropa.processorProfileIds;
      }
      if (ropa.transferArrangementIds && ropa.transferArrangementIds.length > 0) {
        transferIds = ropa.transferArrangementIds;
      }
    }
  }

  const profiles: ProcessorProfile[] = [];
  for (const pId of profileIds) {
    const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(pId).get();
    if (pSnap.exists) profiles.push(pSnap.data() as ProcessorProfile);
  }

  const transfers: TransferArrangement[] = [];
  for (const tId of transferIds) {
    const tSnap = await db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(tId).get();
    if (tSnap.exists) transfers.push(tSnap.data() as TransferArrangement);
  }

  const context = synthesizeDPIAProcessorContext(profiles, transfers);

  return {
    success: true,
    dpiaId,
    ropaEntryId: dpia.ropaEntryId,
    context,
  };
});

// -----------------------------------------------------------------------------
// 3. TIA ASSESSMENTS HANDLERS
// -----------------------------------------------------------------------------

export interface CreateTIAInput {
  tenantId: string;
  code: string;
  title: string;
  vendorId: string;
  destinationCountry: string;
  legalMechanism: TransferMechanism;
  destinationCountryLegalAssessment: string;
  supplementaryTechnicalMeasures?: string;
  supplementaryContractualMeasures?: string;
  residualRiskLevel?: 'low' | 'medium' | 'high';
  ownerId?: string;
}

export interface TransitionTIAInput {
  tenantId: string;
  tiaId: string;
  targetStatus: TIAStatus;
}

export interface ListTIAInput {
  tenantId: string;
  status?: TIAStatus;
  vendorId?: string;
}

export const createTenantTIA = onCall<CreateTIAInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    vendorId,
    destinationCountry,
    legalMechanism,
    destinationCountryLegalAssessment,
    supplementaryTechnicalMeasures = '',
    supplementaryContractualMeasures = '',
    residualRiskLevel = 'medium',
    ownerId,
  } = request.data;

  if (!tenantId || !code || !title || !vendorId || !destinationCountry || !legalMechanism || !destinationCountryLegalAssessment) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, code, title, vendorId, destinationCountry, legalMechanism, and destinationCountryLegalAssessment are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const tiaRef = db.collection('tenants').doc(tenantId).collection('tia_assessments').doc();
  const now = new Date().toISOString();

  const tiaDoc: TIA = {
    id: tiaRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    vendorId,
    destinationCountry: destinationCountry.trim().toUpperCase(),
    legalMechanism,
    destinationCountryLegalAssessment: destinationCountryLegalAssessment.trim(),
    supplementaryTechnicalMeasures: supplementaryTechnicalMeasures.trim(),
    supplementaryContractualMeasures: supplementaryContractualMeasures.trim(),
    status: 'in_review',
    residualRiskLevel,
    approvedBy: null,
    approvedAt: null,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await tiaRef.set(tiaDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tia_assessment',
    entityId: tiaRef.id,
    action: 'create',
    afterSummary: { code: tiaDoc.code, title: tiaDoc.title, destinationCountry, legalMechanism },
    source: 'cloud_function',
    workflowContext: 'tia_creation',
  });

  return { success: true, tiaId: tiaRef.id, tia: tiaDoc };
});

export const transitionTenantTIAStatus = onCall<TransitionTIAInput>(async (request) => {
  const { tenantId, tiaId, targetStatus } = request.data;
  if (!tenantId || !tiaId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, tiaId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'privacy_manager',
    'compliance_manager',
    'tenant_admin',
    'approver',
  ]);

  const tiaRef = db.collection('tenants').doc(tenantId).collection('tia_assessments').doc(tiaId);
  const snap = await tiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'TIA assessment not found.');
  }

  const prev = snap.data() as TIA;
  const now = new Date().toISOString();

  const updates: Partial<TIA> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved') {
    updates.approvedBy = authContext.userId;
    updates.approvedAt = now;
  }

  await tiaRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tia_assessment',
    entityId: tiaId,
    action: targetStatus === 'approved' ? 'approve' : 'status_transition',
    beforeSummary: { status: prev.status },
    afterSummary: { status: targetStatus, approvedBy: updates.approvedBy },
    source: 'cloud_function',
    workflowContext: 'tia_status_transition',
  });

  return { success: true, tiaId, status: targetStatus, approvedAt: updates.approvedAt };
});

export const listTenantTIAs = onCall<ListTIAInput>(async (request) => {
  const { tenantId, status, vendorId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('tia_assessments');
  if (status) query = query.where('status', '==', status);
  if (vendorId) query = query.where('vendorId', '==', vendorId);

  const snap = await query.get();
  const tias: TIA[] = snap.docs.map((d) => d.data() as TIA);

  return { success: true, count: tias.length, tias };
});

export interface CreateTIAFromTransferArrangementInput {
  tenantId: string;
  arrangementId: string;
  code?: string;
  title?: string;
  destinationCountryLegalAssessment?: string;
  supplementaryTechnicalMeasures?: string;
  supplementaryContractualMeasures?: string;
  residualRiskLevel?: 'low' | 'medium' | 'high';
  ownerId?: string;
}

export const createTIAFromTransferArrangement = onCall<CreateTIAFromTransferArrangementInput>(async (request) => {
  const {
    tenantId,
    arrangementId,
    code,
    title,
    destinationCountryLegalAssessment,
    supplementaryTechnicalMeasures,
    supplementaryContractualMeasures,
    residualRiskLevel = 'medium',
    ownerId,
  } = request.data;

  if (!tenantId || !arrangementId) {
    throw new HttpsError('invalid-argument', 'tenantId and arrangementId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  // 1. Fetch TransferArrangement
  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(arrangementId);
  const arrangementSnap = await arrangementRef.get();
  if (!arrangementSnap.exists) {
    throw new HttpsError('not-found', `Transfer arrangement with ID ${arrangementId} not found.`);
  }

  const arrangement = arrangementSnap.data() as TransferArrangement;

  // 2. Fetch linked ProcessorProfile
  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(arrangement.processorProfileId);
  const profileSnap = await profileRef.get();
  const profile = profileSnap.exists ? (profileSnap.data() as ProcessorProfile) : null;

  // 3. Map transferMechanismType to TransferMechanism
  let mappedLegalMechanism: TransferMechanism = 'standard_contractual_clauses';
  if (arrangement.transferMechanismType === 'adequacy_decision') {
    mappedLegalMechanism = 'adequacy_decision';
  } else if (arrangement.transferMechanismType === 'binding_corporate_rules') {
    mappedLegalMechanism = 'binding_corporate_rules';
  } else if (arrangement.transferMechanismType === 'derogation_art49') {
    mappedLegalMechanism = 'derogation_art49';
  } else if (arrangement.transferMechanismType === 'other') {
    mappedLegalMechanism = 'other';
  }

  const primaryCountry = (arrangement.destinationCountries && arrangement.destinationCountries[0]) || 'THIRD_COUNTRY';
  const resolvedVendorId = arrangement.vendorId || profile?.vendorId || 'unknown_vendor';
  const now = new Date().toISOString();

  // One year from now for review
  const nextYearDate = new Date();
  nextYearDate.setFullYear(nextYearDate.getFullYear() + 1);

  const generatedCode = code ? code.trim().toUpperCase() : `TIA-${primaryCountry.toUpperCase()}-${Date.now().toString(36).toUpperCase()}`;
  const generatedTitle = title ? title.trim() : `TIA for ${arrangement.name}`;
  const effectiveTechnicalMeasures =
    supplementaryTechnicalMeasures ||
    arrangement.supplementaryMeasuresSummary ||
    'End-to-end encryption (TLS 1.3 in transit, AES-256 at rest with customer-managed keys held within the EEA).';
  const effectiveContractualMeasures =
    supplementaryContractualMeasures ||
    (arrangement.subprocessorInvolvement
      ? `Subprocessor authorization obligations under GDPR Art. 28(2) & 46 SCCs; Subprocessors: ${arrangement.subprocessorsInvolved?.join(', ') || 'Listed in DPA'}`
      : 'Direct processor standard contractual clause commitments with government access challenge clause.');
  const effectiveLegalAssessment =
    destinationCountryLegalAssessment ||
    `Assessment of destination country (${arrangement.destinationCountries?.join(', ') || primaryCountry}) legal regime and surveillance laws for transfer under ${arrangement.transferMechanismType}.`;

  const tiaRef = db.collection('tenants').doc(tenantId).collection('tia_assessments').doc();
  const tiaId = tiaRef.id;

  const tiaDoc: TIA = {
    id: tiaId,
    tenantId,
    code: generatedCode,
    title: generatedTitle,
    vendorId: resolvedVendorId,
    destinationCountry: primaryCountry.toUpperCase(),
    legalMechanism: mappedLegalMechanism,
    destinationCountryLegalAssessment: effectiveLegalAssessment,
    supplementaryTechnicalMeasures: effectiveTechnicalMeasures,
    supplementaryContractualMeasures: effectiveContractualMeasures,
    status: 'in_review',
    residualRiskLevel,
    approvedBy: null,
    approvedAt: null,
    transferArrangementId: arrangementId,
    processorProfileId: arrangement.processorProfileId,
    nextReviewDate: nextYearDate.toISOString(),
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  // 4. Save TIA
  await tiaRef.set(tiaDoc);

  // 5. Update TransferArrangement with linkedTiaId
  await arrangementRef.update({
    linkedTiaId: tiaId,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  // 6. Update ProcessorProfile with linkedTiaId if missing
  if (profileRef && profileSnap.exists && !profile?.linkedTiaId) {
    await profileRef.update({
      linkedTiaId: tiaId,
      updatedAt: now,
      updatedBy: authContext.userId,
    });
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tia_assessment',
    entityId: tiaId,
    action: 'create',
    beforeSummary: null,
    afterSummary: {
      tiaId,
      code: tiaDoc.code,
      arrangementId,
      processorProfileId: arrangement.processorProfileId,
      destinationCountry: primaryCountry,
      legalMechanism: mappedLegalMechanism,
    },
    source: 'cloud_function',
    workflowContext: 'tia_created_from_transfer_arrangement',
  });

  return { success: true, tiaId, tia: tiaDoc };
});

export interface LinkTIAToTransferArrangementInput {
  tenantId: string;
  arrangementId: string;
  tiaId: string;
}

export const linkTIAToTransferArrangement = onCall<LinkTIAToTransferArrangementInput>(async (request) => {
  const { tenantId, arrangementId, tiaId } = request.data;
  if (!tenantId || !arrangementId || !tiaId) {
    throw new HttpsError('invalid-argument', 'tenantId, arrangementId, and tiaId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  // 1. Verify TransferArrangement exists
  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(arrangementId);
  const arrangementSnap = await arrangementRef.get();
  if (!arrangementSnap.exists) {
    throw new HttpsError('not-found', `Transfer arrangement ${arrangementId} not found.`);
  }
  const arrangement = arrangementSnap.data() as TransferArrangement;

  // 2. Verify TIA exists
  const tiaRef = db.collection('tenants').doc(tenantId).collection('tia_assessments').doc(tiaId);
  const snapTia = await tiaRef.get();
  if (!snapTia.exists) {
    throw new HttpsError('not-found', `TIA assessment ${tiaId} not found.`);
  }

  const now = new Date().toISOString();

  // 3. Update TransferArrangement
  await arrangementRef.update({
    linkedTiaId: tiaId,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  // 4. Update TIA with arrangement references
  await tiaRef.update({
    transferArrangementId: arrangementId,
    processorProfileId: arrangement.processorProfileId,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  // 5. Update ProcessorProfile if applicable
  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(arrangement.processorProfileId);
  const profileSnap = await profileRef.get();
  if (profileSnap.exists) {
    await profileRef.update({
      linkedTiaId: tiaId,
      updatedAt: now,
      updatedBy: authContext.userId,
    });
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'transfer_arrangement',
    entityId: arrangementId,
    action: 'link',
    beforeSummary: { previousLinkedTiaId: arrangement.linkedTiaId || null },
    afterSummary: { arrangementId, tiaId, processorProfileId: arrangement.processorProfileId },
    source: 'cloud_function',
    workflowContext: 'tia_linked_to_transfer_arrangement',
  });

  return { success: true, arrangementId, tiaId, linked: true };
});

// -----------------------------------------------------------------------------
// 4. DSR REQUESTS HANDLERS
// -----------------------------------------------------------------------------

export interface CreateDSRInput {
  tenantId: string;
  ticketNumber: string;
  requestType: DSRType;
  requesterEmailMasked: string;
  receivedAt?: string;
  processingNotes?: string;
  affectedRopaIds?: string[];
  ownerId?: string;
}

export interface UpdateDSRInput {
  tenantId: string;
  dsrId: string;
  status?: DSRStatus;
  processingNotes?: string;
  extensionReason?: string | null;
  rejectionReason?: string | null;
}

export interface ListDSRInput {
  tenantId: string;
  status?: DSRStatus;
  requestType?: DSRType;
}

export const createTenantDSR = onCall<CreateDSRInput>(async (request) => {
  const {
    tenantId,
    ticketNumber,
    requestType,
    requesterEmailMasked,
    receivedAt,
    processingNotes = '',
    affectedRopaIds = [],
    ownerId,
  } = request.data;

  if (!tenantId || !ticketNumber || !requestType || !requesterEmailMasked) {
    throw new HttpsError('invalid-argument', 'tenantId, ticketNumber, requestType, and requesterEmailMasked are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const dsrRef = db.collection('tenants').doc(tenantId).collection('dsr_requests').doc();
  const now = receivedAt || new Date().toISOString();
  const statutoryDeadlineDate = new Date(new Date(now).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const dsrDoc: DSRRequest = {
    id: dsrRef.id,
    tenantId,
    ticketNumber: ticketNumber.trim().toUpperCase(),
    requestType,
    status: 'received',
    requesterEmailMasked: requesterEmailMasked.trim(),
    requesterVerifiedAt: null,
    receivedAt: now,
    statutoryDeadlineDate,
    extensionReason: null,
    extendedDeadlineDate: null,
    processingNotes: processingNotes.trim(),
    fulfilledAt: null,
    rejectionReason: null,
    affectedRopaIds,
    ownerId: ownerId || authContext.userId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await dsrRef.set(dsrDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dsr_request',
    entityId: dsrRef.id,
    action: 'create',
    afterSummary: { ticketNumber: dsrDoc.ticketNumber, requestType, statutoryDeadlineDate },
    source: 'cloud_function',
    workflowContext: 'dsr_intake',
  });

  return { success: true, dsrId: dsrRef.id, dsr: dsrDoc };
});

export const updateTenantDSR = onCall<UpdateDSRInput>(async (request) => {
  const { tenantId, dsrId, status, processingNotes, extensionReason, rejectionReason } = request.data;
  if (!tenantId || !dsrId) {
    throw new HttpsError('invalid-argument', 'tenantId and dsrId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'compliance_manager',
  ]);

  const dsrRef = db.collection('tenants').doc(tenantId).collection('dsr_requests').doc(dsrId);
  const snap = await dsrRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'DSR request not found.');
  }

  const prev = snap.data() as DSRRequest;
  const now = new Date().toISOString();

  const updates: Partial<DSRRequest> = {
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    updates.status = status;
    if (status === 'identity_verified') {
      updates.requesterVerifiedAt = now;
    } else if (status === 'completed') {
      updates.fulfilledAt = now;
    }
  }

  if (processingNotes !== undefined) updates.processingNotes = processingNotes;
  if (rejectionReason !== undefined) updates.rejectionReason = rejectionReason;

  if (extensionReason) {
    updates.extensionReason = extensionReason;
    // Art. 12(3) allows extension by up to 2 further months (60 days)
    updates.extendedDeadlineDate = new Date(
      new Date(prev.statutoryDeadlineDate).getTime() + 60 * 24 * 60 * 60 * 1000
    ).toISOString();
  }

  await dsrRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dsr_request',
    entityId: dsrId,
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'dsr_update',
  });

  return { success: true, dsrId, updatedFields: updates };
});

export const listTenantDSRs = onCall<ListDSRInput>(async (request) => {
  const { tenantId, status, requestType } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('dsr_requests');
  if (status) query = query.where('status', '==', status);
  if (requestType) query = query.where('requestType', '==', requestType);

  const snap = await query.get();
  const dsrs: DSRRequest[] = snap.docs.map((d) => d.data() as DSRRequest);

  return { success: true, count: dsrs.length, dsrs };
});

// -----------------------------------------------------------------------------
// 5. PERSONAL DATA BREACHES & 72H TRACKER HANDLERS
// -----------------------------------------------------------------------------

export interface LogBreachInput {
  tenantId: string;
  incidentReference: string;
  title: string;
  discoveredAt: string;
  occurredAt?: string | null;
  severity: BreachSeverity;
  description: string;
  affectedDataCategories: string[];
  estimatedDataSubjectsCount?: number;
  natureOfBreach: 'confidentiality' | 'integrity' | 'availability';
  rootCauseAnalysis?: string;
  containmentActionsTaken?: string;
  remedialIssueIds?: string[];
  involvesProcessor?: boolean;
  processorProfileIds?: string[];
  vendorIds?: string[];
  reportingSource?: BreachReportingSource | null;
  processorNotificationReceivedAt?: string | null;
  transferArrangementIds?: string[];
  affectedSystemAssetIds?: string[];
  processorIncidentNotes?: string | null;
  ownerId?: string;
}

export interface UpdateBreachInput {
  tenantId: string;
  breachId: string;
  status?: BreachStatus;
  dpaNotifiedAt?: string | null;
  dpaReferenceNumber?: string | null;
  dataSubjectsNotifiedAt?: string | null;
  containmentActionsTaken?: string;
  rootCauseAnalysis?: string;
  involvesProcessor?: boolean;
  processorProfileIds?: string[];
  vendorIds?: string[];
  reportingSource?: BreachReportingSource | null;
  processorNotificationReceivedAt?: string | null;
  transferArrangementIds?: string[];
  affectedSystemAssetIds?: string[];
  processorIncidentNotes?: string | null;
}

export interface ListBreachesInput {
  tenantId: string;
  status?: BreachStatus;
  severity?: BreachSeverity;
  involvesProcessor?: boolean;
  processorProfileId?: string;
  vendorId?: string;
  reportingSource?: BreachReportingSource;
}

export const logTenantBreach = onCall<LogBreachInput>(async (request) => {
  const {
    tenantId,
    incidentReference,
    title,
    discoveredAt,
    occurredAt = null,
    severity,
    description,
    affectedDataCategories,
    estimatedDataSubjectsCount = 0,
    natureOfBreach,
    rootCauseAnalysis = '',
    containmentActionsTaken = '',
    remedialIssueIds = [],
    involvesProcessor = false,
    processorProfileIds = [],
    vendorIds = [],
    reportingSource = null,
    processorNotificationReceivedAt = null,
    transferArrangementIds = [],
    affectedSystemAssetIds = [],
    processorIncidentNotes = null,
    ownerId,
  } = request.data;

  if (!tenantId || !incidentReference || !title || !discoveredAt || !severity || !description || !affectedDataCategories || !natureOfBreach) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, incidentReference, title, discoveredAt, severity, description, affectedDataCategories, and natureOfBreach are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'security_manager',
    'compliance_manager',
  ]);

  const breachRef = db.collection('tenants').doc(tenantId).collection('breaches').doc();
  const now = new Date().toISOString();
  // GDPR Art. 33 strict 72-hour notification deadline from moment of discovery
  const dpaNotificationDeadline72h = new Date(
    new Date(discoveredAt).getTime() + 72 * 60 * 60 * 1000
  ).toISOString();

  // Resolve vendor IDs from processor profiles if processorProfileIds provided
  const vendorIdsSet = new Set<string>(vendorIds);
  const hasProcessors = involvesProcessor || processorProfileIds.length > 0;

  if (processorProfileIds && processorProfileIds.length > 0) {
    for (const profId of processorProfileIds) {
      const pSnap = await db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId).get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        if (pData.vendorId) vendorIdsSet.add(pData.vendorId);
        // Sync reverse reference
        const prevBreaches = pData.linkedBreachIds || [];
        if (!prevBreaches.includes(breachRef.id)) {
          await pSnap.ref.update({
            linkedBreachIds: [...prevBreaches, breachRef.id],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
  }

  const breachDoc: PersonalDataBreach = {
    id: breachRef.id,
    tenantId,
    incidentReference: incidentReference.trim().toUpperCase(),
    title: title.trim(),
    discoveredAt,
    occurredAt,
    severity,
    status: 'investigating',
    description: description.trim(),
    affectedDataCategories,
    estimatedDataSubjectsCount,
    natureOfBreach,
    rootCauseAnalysis: rootCauseAnalysis.trim(),
    dpaNotificationDeadline72h,
    dpaNotifiedAt: null,
    dpaReferenceNumber: null,
    dataSubjectsNotifiedAt: null,
    containmentActionsTaken: containmentActionsTaken.trim(),
    remedialIssueIds,
    involvesProcessor: hasProcessors,
    processorProfileIds,
    vendorIds: Array.from(vendorIdsSet),
    reportingSource,
    processorNotificationReceivedAt,
    transferArrangementIds,
    affectedSystemAssetIds,
    processorIncidentNotes,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await breachRef.set(breachDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'personal_data_breach',
    entityId: breachRef.id,
    action: 'create',
    afterSummary: { incidentReference: breachDoc.incidentReference, severity, dpaNotificationDeadline72h, involvesProcessor: hasProcessors, processorProfileIds },
    source: 'cloud_function',
    workflowContext: 'breach_incident_log',
  });

  if (breachDoc.ownerId) {
    await createNotification({
      tenantId,
      recipientId: breachDoc.ownerId,
      title: '🚨 GDPR Art. 33 72-Hour Breach Alert',
      message: `Breach "${incidentReference}" logged with severity ${severity}. DPA notification deadline expires on ${dpaNotificationDeadline72h}.`,
      type: 'breach_deadline_warning',
      priority: 'urgent',
      sourceEntityType: 'personal_data_breach',
      sourceEntityId: breachRef.id,
    });
  }

  return { success: true, breachId: breachRef.id, breach: breachDoc };
});

export const updateTenantBreach = onCall<UpdateBreachInput>(async (request) => {
  const {
    tenantId,
    breachId,
    status,
    dpaNotifiedAt,
    dpaReferenceNumber,
    dataSubjectsNotifiedAt,
    containmentActionsTaken,
    rootCauseAnalysis,
    involvesProcessor,
    processorProfileIds,
    vendorIds,
    reportingSource,
    processorNotificationReceivedAt,
    transferArrangementIds,
    affectedSystemAssetIds,
    processorIncidentNotes,
  } = request.data;

  if (!tenantId || !breachId) {
    throw new HttpsError('invalid-argument', 'tenantId and breachId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'security_manager',
    'compliance_manager',
  ]);

  const breachRef = db.collection('tenants').doc(tenantId).collection('breaches').doc(breachId);
  const snap = await breachRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Breach incident not found.');
  }

  const prev = snap.data() as PersonalDataBreach;
  const now = new Date().toISOString();

  // If processorProfileIds updated, sync reverse reference on processor profiles
  if (processorProfileIds && Array.isArray(processorProfileIds)) {
    for (const profId of processorProfileIds) {
      const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(profId);
      const pSnap = await pRef.get();
      if (pSnap.exists) {
        const pData = pSnap.data() as ProcessorProfile;
        const prevBreaches = pData.linkedBreachIds || [];
        if (!prevBreaches.includes(breachId)) {
          await pRef.update({
            linkedBreachIds: [...prevBreaches, breachId],
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      }
    }
  }

  const updates: Partial<PersonalDataBreach> = {
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) updates.status = status;
  if (dpaNotifiedAt !== undefined) updates.dpaNotifiedAt = dpaNotifiedAt;
  if (dpaReferenceNumber !== undefined) updates.dpaReferenceNumber = dpaReferenceNumber;
  if (dataSubjectsNotifiedAt !== undefined) updates.dataSubjectsNotifiedAt = dataSubjectsNotifiedAt;
  if (containmentActionsTaken !== undefined) updates.containmentActionsTaken = containmentActionsTaken;
  if (rootCauseAnalysis !== undefined) updates.rootCauseAnalysis = rootCauseAnalysis;
  if (involvesProcessor !== undefined) updates.involvesProcessor = involvesProcessor;
  if (processorProfileIds !== undefined) updates.processorProfileIds = processorProfileIds;
  if (vendorIds !== undefined) updates.vendorIds = vendorIds;
  if (reportingSource !== undefined) updates.reportingSource = reportingSource;
  if (processorNotificationReceivedAt !== undefined) updates.processorNotificationReceivedAt = processorNotificationReceivedAt;
  if (transferArrangementIds !== undefined) updates.transferArrangementIds = transferArrangementIds;
  if (affectedSystemAssetIds !== undefined) updates.affectedSystemAssetIds = affectedSystemAssetIds;
  if (processorIncidentNotes !== undefined) updates.processorIncidentNotes = processorIncidentNotes;

  await breachRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'personal_data_breach',
    entityId: breachId,
    action: 'update',
    beforeSummary: { status: prev.status, severity: prev.severity },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'breach_update',
  });

  return { success: true, breachId, updatedFields: updates };
});

export const listTenantBreaches = onCall<ListBreachesInput>(async (request) => {
  const { tenantId, status, severity, involvesProcessor, processorProfileId, vendorId, reportingSource } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'security_manager',
    'compliance_manager',
    'auditor',
  ]);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('breaches');
  if (status) query = query.where('status', '==', status);
  if (severity) query = query.where('severity', '==', severity);
  if (involvesProcessor !== undefined) query = query.where('involvesProcessor', '==', involvesProcessor);
  if (processorProfileId) query = query.where('processorProfileIds', 'array-contains', processorProfileId);
  if (vendorId) query = query.where('vendorIds', 'array-contains', vendorId);
  if (reportingSource) query = query.where('reportingSource', '==', reportingSource);

  const snap = await query.get();
  const breaches: PersonalDataBreach[] = snap.docs.map((d) => d.data() as PersonalDataBreach);

  return { success: true, count: breaches.length, breaches };
});

export interface LinkBreachToProcessorsInput {
  tenantId: string;
  breachId: string;
  processorProfileIds: string[];
  reportingSource?: BreachReportingSource | null;
  processorNotificationReceivedAt?: string | null;
  transferArrangementIds?: string[];
  affectedSystemAssetIds?: string[];
  processorIncidentNotes?: string | null;
}

export const linkBreachToProcessors = onCall<LinkBreachToProcessorsInput>(async (request) => {
  const {
    tenantId,
    breachId,
    processorProfileIds,
    reportingSource,
    processorNotificationReceivedAt,
    transferArrangementIds = [],
    affectedSystemAssetIds = [],
    processorIncidentNotes,
  } = request.data;

  if (!tenantId || !breachId || !processorProfileIds || !Array.isArray(processorProfileIds)) {
    throw new HttpsError('invalid-argument', 'tenantId, breachId, and processorProfileIds (array) are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'security_manager',
    'compliance_manager',
  ]);

  const breachRef = db.collection('tenants').doc(tenantId).collection('breaches').doc(breachId);
  const snap = await breachRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Breach incident ${breachId} not found.`);
  }

  const prev = snap.data() as PersonalDataBreach;
  const now = new Date().toISOString();

  const mergedProfiles = Array.from(new Set([...(prev.processorProfileIds || []), ...processorProfileIds]));
  const mergedTransfers = Array.from(new Set([...(prev.transferArrangementIds || []), ...transferArrangementIds]));
  const mergedSystems = Array.from(new Set([...(prev.affectedSystemAssetIds || []), ...affectedSystemAssetIds]));

  const vendorIdsSet = new Set<string>(prev.vendorIds || []);
  const batch = db.batch();

  for (const pId of processorProfileIds) {
    const pRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(pId);
    const pSnap = await pRef.get();
    if (pSnap.exists) {
      const pData = pSnap.data() as ProcessorProfile;
      if (pData.vendorId) vendorIdsSet.add(pData.vendorId);
      const prevBreaches = pData.linkedBreachIds || [];
      if (!prevBreaches.includes(breachId)) {
        batch.update(pRef, {
          linkedBreachIds: [...prevBreaches, breachId],
          updatedAt: now,
          updatedBy: authContext.userId,
        });
      }
    }
  }

  const updates: Partial<PersonalDataBreach> = {
    involvesProcessor: true,
    processorProfileIds: mergedProfiles,
    vendorIds: Array.from(vendorIdsSet),
    transferArrangementIds: mergedTransfers,
    affectedSystemAssetIds: mergedSystems,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (reportingSource !== undefined) updates.reportingSource = reportingSource;
  if (processorNotificationReceivedAt !== undefined) updates.processorNotificationReceivedAt = processorNotificationReceivedAt;
  if (processorIncidentNotes !== undefined) updates.processorIncidentNotes = processorIncidentNotes;

  batch.update(breachRef, updates);
  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'personal_data_breach',
    entityId: breachId,
    action: 'link',
    beforeSummary: { processorProfileIds: prev.processorProfileIds },
    afterSummary: { breachId, processorProfileIds: mergedProfiles, reportingSource },
    source: 'cloud_function',
    workflowContext: 'breach_processor_linking',
  });

  return {
    success: true,
    breachId,
    processorProfileIds: mergedProfiles,
    transferArrangementIds: mergedTransfers,
    reportingSource: updates.reportingSource || prev.reportingSource || null,
  };
});

export interface GetProcessorBreachHistoryInput {
  tenantId: string;
  processorProfileId: string;
}

export const getProcessorBreachHistory = onCall<GetProcessorBreachHistoryInput>(async (request) => {
  const { tenantId, processorProfileId } = request.data;
  if (!tenantId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileId are required.');
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'privacy_manager',
    'security_manager',
    'compliance_manager',
    'auditor',
  ]);

  const snap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('breaches')
    .where('processorProfileIds', 'array-contains', processorProfileId)
    .get();

  const breaches: PersonalDataBreach[] = snap.docs.map((d) => d.data() as PersonalDataBreach);
  const history = summarizeProcessorBreachHistory(processorProfileId, breaches);

  return { success: true, history };
});

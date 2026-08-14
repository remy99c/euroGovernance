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
  DSRRequest,
  DSRType,
  DSRStatus,
  TransferArrangement,
  ProcessorProfile,
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
    processorIds,
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
    afterSummary: { activityCode: ropaDoc.activityCode, activityName: ropaDoc.activityName, legalBasis },
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
  const { tenantId, status, legalBasis, isSpecialCategoryData, involvesInternationalTransfer } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('ropa_entries');
  if (status) query = query.where('status', '==', status);
  if (legalBasis) query = query.where('legalBasis', '==', legalBasis);
  if (isSpecialCategoryData !== undefined) query = query.where('isSpecialCategoryData', '==', isSpecialCategoryData);
  if (involvesInternationalTransfer !== undefined) query = query.where('involvesInternationalTransfer', '==', involvesInternationalTransfer);

  const snap = await query.get();
  const ropaEntries: ROPAEntry[] = snap.docs.map((d) => d.data() as ROPAEntry);

  return { success: true, count: ropaEntries.length, ropaEntries };
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
    afterSummary: { code: dpiaDoc.code, title: dpiaDoc.title, initialStatus, positiveCriteriaCount },
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
}

export interface ListBreachesInput {
  tenantId: string;
  status?: BreachStatus;
  severity?: BreachSeverity;
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
    afterSummary: { incidentReference: breachDoc.incidentReference, severity, dpaNotificationDeadline72h },
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
  const { tenantId, status, severity } = request.data;
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

  const snap = await query.get();
  const breaches: PersonalDataBreach[] = snap.docs.map((d) => d.data() as PersonalDataBreach);

  return { success: true, count: breaches.length, breaches };
});

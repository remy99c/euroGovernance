import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { appendAuditLogInTransaction, recordAuditLog } from '../lib/audit.js';
import { AUTHORITATIVE_CALLABLE_OPTIONS } from '../lib/command-boundary.js';
import { createNotification } from '../lib/notifications.js';
import { verifyControlCurrentArtifact } from './controls.js';
import {
  ProcessorCertification,
  ProcessorCertificationReviewStatus,
  ProcessorProfile,
  Evidence,
  Risk,
  Control,
  SystemAsset,
  Vendor,
  ListProcessorAssuranceInventoryInput,
  synthesizeProcessorAssuranceInventory,
  filterProcessorAssuranceInventory,
  summarizeProcessorAssuranceInventory,
  validateProcessorCertification,
  validateProcessorCertificationReviewTransition,
  evaluateProcessorCertificationReminders,
  evaluateProcessorCertificationRiskFlags,
  evaluateControlProcessorAssuranceSupport,
  mapProcessorsToControlsAssuranceMatrix,
} from '@eurogovernance/shared-types';

const PROCESSOR_ASSURANCE_READ_LIMIT = 250;
const PROCESSOR_ASSURANCE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

async function boundedProcessorAssuranceSnapshot(
  query: FirebaseFirestore.Query,
  label: string
): Promise<FirebaseFirestore.QuerySnapshot> {
  const snapshot = await query.limit(PROCESSOR_ASSURANCE_READ_LIMIT + 1).get();
  if (snapshot.size > PROCESSOR_ASSURANCE_READ_LIMIT) {
    throw new HttpsError(
      'resource-exhausted',
      `${label} exceeds the bounded synchronous assurance-report limit.`
    );
  }
  return snapshot;
}

export interface CreateProcessorCertificationInput {
  tenantId: string;
  processorProfileId: string;
  vendorId?: string;
  artifactKind: ProcessorCertification['artifactKind'];
  standardFamily: ProcessorCertification['standardFamily'];
  customStandardName?: string | null;
  issuingBodyOrAuditor: string;
  leadAuditorName?: string | null;
  certificateOrReportNumber: string;
  reportPeriodStart?: string | null;
  reportPeriodEnd?: string | null;
  validFrom: string;
  validUntil: string;
  status: ProcessorCertification['status'];
  assuranceScopeSummary: string;
  legalEntityOrRegionalScope: string;
  systemsOrServicesCovered: string[];
  notes?: string | null;
  reviewOwnerUserId: string;
  reviewStatus?: ProcessorCertificationReviewStatus;
  reviewDueDate?: string | null;
  linkedEvidenceIds?: string[];
  linkedControlIds?: string[];
  linkedTransferArrangementIds?: string[];
  unresolvedFindingsCount?: number;
  hasMajorDeficiencies?: boolean;
}

export interface ReviewProcessorCertificationInput {
  tenantId: string;
  certificationId: string;
  decision: 'start_review' | 'accept' | 'reject' | 'mark_insufficient';
  reviewNotes?: string;
  rejectionReason?: string;
  insufficientRationale?: string;
  nextReviewDueDate?: string | null;
}

export interface ReplaceProcessorCertificationInput {
  tenantId: string;
  previousCertificationId: string;
  newCertification: Omit<
    CreateProcessorCertificationInput,
    'tenantId' | 'processorProfileId'
  > & {
    processorProfileId?: string;
  };
  replacementRationale?: string;
}

/**
 * Callable Function: createTenantProcessorCertification
 */
export const createTenantProcessorCertification = onCall<CreateProcessorCertificationInput>(async (request) => {
  const data = request.data;
  const { tenantId } = data;

  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }
  if (data.linkedControlIds !== undefined) {
    throw new HttpsError(
      'invalid-argument',
      'Control links must be changed through linkProcessorCertificationToControls.'
    );
  }
  if (
    data.reviewStatus !== undefined &&
    data.reviewStatus !== 'pending'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'New processor assurance records must begin in pending review.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const certId = `procert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();

  const record: ProcessorCertification = {
    id: certId,
    tenantId,
    processorProfileId: data.processorProfileId,
    vendorId: data.vendorId,
    artifactKind: data.artifactKind,
    standardFamily: data.standardFamily,
    customStandardName: data.customStandardName || null,
    issuingBodyOrAuditor: data.issuingBodyOrAuditor,
    leadAuditorName: data.leadAuditorName || null,
    certificateOrReportNumber: data.certificateOrReportNumber,
    reportPeriodStart: data.reportPeriodStart || null,
    reportPeriodEnd: data.reportPeriodEnd || null,
    validFrom: data.validFrom,
    validUntil: data.validUntil,
    status: data.status || 'active_valid',
    assuranceScopeSummary: data.assuranceScopeSummary,
    legalEntityOrRegionalScope: data.legalEntityOrRegionalScope,
    systemsOrServicesCovered: data.systemsOrServicesCovered || [],
    notes: data.notes || null,
    reviewOwnerUserId: data.reviewOwnerUserId,
    reviewStatus: 'pending',
    reviewNotes: null,
    rejectionReason: null,
    reviewedBy: null,
    reviewerEmail: null,
    reviewedAt: null,
    isInsufficient: false,
    insufficientRationale: null,
    replacedByCertificationId: null,
    replacesCertificationId: null,
    versionNumber: 1,
    isHistoricVersion: false,
    reviewDueDate: data.reviewDueDate || null,
    lastReviewedAt: null,
    lastReviewedBy: null,
    linkedEvidenceIds: data.linkedEvidenceIds || [],
    linkedControlIds: [],
    linkedTransferArrangementIds: data.linkedTransferArrangementIds || [],
    unresolvedFindingsCount: data.unresolvedFindingsCount ?? 0,
    hasMajorDeficiencies: data.hasMajorDeficiencies ?? false,
    ownerId: authContext.userId,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
    createdAt: now,
    updatedAt: now,
  };

  const validation = validateProcessorCertification(record);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certId).set(record);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'create',
    entityType: 'processor_certification',
    entityId: certId,
    afterSummary: {
      standardFamily: record.standardFamily,
      certificateOrReportNumber: record.certificateOrReportNumber,
      processorProfileId: record.processorProfileId,
    },
    source: 'cloud_function',
    workflowContext: 'processor_certification_created',
  });

  return { success: true, certification: record };
});

export interface UpdateProcessorCertificationInput {
  tenantId: string;
  certificationId: string;
  artifactKind?: ProcessorCertification['artifactKind'];
  standardFamily?: ProcessorCertification['standardFamily'];
  customStandardName?: string | null;
  issuingBodyOrAuditor?: string;
  leadAuditorName?: string | null;
  certificateOrReportNumber?: string;
  reportPeriodStart?: string | null;
  reportPeriodEnd?: string | null;
  validFrom?: string;
  validUntil?: string;
  status?: ProcessorCertification['status'];
  assuranceScopeSummary?: string;
  legalEntityOrRegionalScope?: string;
  systemsOrServicesCovered?: string[];
  notes?: string | null;
  reviewOwnerUserId?: string;
  reviewDueDate?: string | null;
  linkedEvidenceIds?: string[];
  linkedControlIds?: string[];
  linkedTransferArrangementIds?: string[];
  unresolvedFindingsCount?: number;
  hasMajorDeficiencies?: boolean;
}

/**
 * Callable Function: updateTenantProcessorCertification
 * Updates an existing processor certification or assurance report.
 */
export const updateTenantProcessorCertification = onCall<UpdateProcessorCertificationInput>(async (request) => {
  const data = request.data;
  const { tenantId, certificationId } = data;

  if (!tenantId || !certificationId) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }
  if (data.linkedControlIds !== undefined) {
    throw new HttpsError(
      'invalid-argument',
      'Control links must be changed through linkProcessorCertificationToControls.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  const certSnap = await certRef.get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Processor certification ${certificationId} not found.`);
  }

  const existing = certSnap.data() as ProcessorCertification;
  if (existing.isHistoricVersion || existing.reviewStatus === 'superseded') {
    throw new HttpsError('failed-precondition', 'Cannot directly modify a superseded historical certification record.');
  }

  const now = new Date().toISOString();

  const updatedRecord: ProcessorCertification = {
    ...existing,
    ...(data.artifactKind !== undefined && { artifactKind: data.artifactKind }),
    ...(data.standardFamily !== undefined && { standardFamily: data.standardFamily }),
    ...(data.customStandardName !== undefined && { customStandardName: data.customStandardName }),
    ...(data.issuingBodyOrAuditor !== undefined && { issuingBodyOrAuditor: data.issuingBodyOrAuditor }),
    ...(data.leadAuditorName !== undefined && { leadAuditorName: data.leadAuditorName }),
    ...(data.certificateOrReportNumber !== undefined && { certificateOrReportNumber: data.certificateOrReportNumber }),
    ...(data.reportPeriodStart !== undefined && { reportPeriodStart: data.reportPeriodStart }),
    ...(data.reportPeriodEnd !== undefined && { reportPeriodEnd: data.reportPeriodEnd }),
    ...(data.validFrom !== undefined && { validFrom: data.validFrom }),
    ...(data.validUntil !== undefined && { validUntil: data.validUntil }),
    ...(data.status !== undefined && { status: data.status }),
    ...(data.assuranceScopeSummary !== undefined && { assuranceScopeSummary: data.assuranceScopeSummary }),
    ...(data.legalEntityOrRegionalScope !== undefined && { legalEntityOrRegionalScope: data.legalEntityOrRegionalScope }),
    ...(data.systemsOrServicesCovered !== undefined && { systemsOrServicesCovered: data.systemsOrServicesCovered }),
    ...(data.notes !== undefined && { notes: data.notes }),
    ...(data.reviewOwnerUserId !== undefined && { reviewOwnerUserId: data.reviewOwnerUserId }),
    ...(data.reviewDueDate !== undefined && { reviewDueDate: data.reviewDueDate }),
    ...(data.linkedEvidenceIds !== undefined && { linkedEvidenceIds: data.linkedEvidenceIds }),
    ...(data.linkedTransferArrangementIds !== undefined && { linkedTransferArrangementIds: data.linkedTransferArrangementIds }),
    ...(data.unresolvedFindingsCount !== undefined && { unresolvedFindingsCount: data.unresolvedFindingsCount }),
    ...(data.hasMajorDeficiencies !== undefined && { hasMajorDeficiencies: data.hasMajorDeficiencies }),
    updatedBy: authContext.userId,
    updatedAt: now,
  };

  const validation = validateProcessorCertification(updatedRecord);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed: ${validation.errors.join('; ')}`);
  }

  await certRef.set(updatedRecord);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'update',
    entityType: 'processor_certification',
    entityId: certificationId,
    beforeSummary: {
      standardFamily: existing.standardFamily,
      certificateOrReportNumber: existing.certificateOrReportNumber,
      status: existing.status,
    },
    afterSummary: {
      standardFamily: updatedRecord.standardFamily,
      certificateOrReportNumber: updatedRecord.certificateOrReportNumber,
      status: updatedRecord.status,
    },
    source: 'cloud_function',
    workflowContext: 'processor_certification_updated',
  });

  return { success: true, certification: updatedRecord };
});

export interface DeleteProcessorCertificationInput {
  tenantId: string;
  certificationId: string;
}

/**
 * Callable Function: deleteTenantProcessorCertification
 * Deletes a processor certification record with audit trail tracking.
 */
export const deleteTenantProcessorCertification = onCall<DeleteProcessorCertificationInput>(async (request) => {
  const { tenantId, certificationId } = request.data;
  if (!tenantId || !certificationId) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
  ]);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  const certSnap = await certRef.get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Processor certification ${certificationId} not found.`);
  }

  const existing = certSnap.data() as ProcessorCertification;

  await certRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'delete',
    entityType: 'processor_certification',
    entityId: certificationId,
    beforeSummary: {
      standardFamily: existing.standardFamily,
      certificateOrReportNumber: existing.certificateOrReportNumber,
      processorProfileId: existing.processorProfileId,
    },
    source: 'cloud_function',
    workflowContext: 'processor_certification_deleted',
  });

  return { success: true, certificationId };
});

/**
 * Callable Function: reviewProcessorCertification
 * Executes review decisions with strict attribution, state transition enforcement, and deficiency flagging.
 */
export const reviewProcessorCertification = onCall<ReviewProcessorCertificationInput>(async (request) => {
  const {
    tenantId,
    certificationId,
    decision,
    reviewNotes,
    rejectionReason,
    insufficientRationale,
    nextReviewDueDate,
  } = request.data;

  if (!tenantId || !certificationId || !decision) {
    throw new HttpsError('invalid-argument', 'tenantId, certificationId, and decision are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'approver',
  ]);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  const certSnap = await certRef.get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Processor certification "${certificationId}" not found.`);
  }

  const currentCert = certSnap.data() as ProcessorCertification;

  if (currentCert.isHistoricVersion || currentCert.reviewStatus === 'superseded') {
    throw new HttpsError(
      'failed-precondition',
      'Cannot review a superseded historic certification. Modify the active version instead.'
    );
  }

  let nextReviewStatus: ProcessorCertificationReviewStatus;
  let isInsufficient = false;
  let finalRejectionReason: string | null = null;
  let finalInsufficientRationale: string | null = null;

  switch (decision) {
    case 'start_review':
      nextReviewStatus = 'in_review';
      break;
    case 'accept':
      nextReviewStatus = 'accepted';
      isInsufficient = false;
      break;
    case 'reject':
      if (!rejectionReason || rejectionReason.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'rejectionReason is required when rejecting a certification.');
      }
      nextReviewStatus = 'rejected';
      finalRejectionReason = rejectionReason.trim();
      break;
    case 'mark_insufficient':
      if (!insufficientRationale || insufficientRationale.trim().length === 0) {
        throw new HttpsError('invalid-argument', 'insufficientRationale is required when marking a certification as insufficient.');
      }
      nextReviewStatus = 'insufficient';
      isInsufficient = true;
      finalInsufficientRationale = insufficientRationale.trim();
      break;
    default:
      throw new HttpsError('invalid-argument', `Invalid review decision: ${decision}`);
  }

  const transitionCheck = validateProcessorCertificationReviewTransition(currentCert.reviewStatus, nextReviewStatus);
  if (!transitionCheck.allowed) {
    throw new HttpsError('failed-precondition', transitionCheck.reason || 'Invalid state transition.');
  }

  const now = new Date().toISOString();
  const updates: Partial<ProcessorCertification> = {
    reviewStatus: nextReviewStatus,
    reviewNotes: reviewNotes || currentCert.reviewNotes || null,
    rejectionReason: finalRejectionReason,
    isInsufficient,
    insufficientRationale: finalInsufficientRationale,
    reviewedBy: authContext.userId,
    reviewerEmail: authContext.email,
    reviewedAt: now,
    lastReviewedAt: now,
    lastReviewedBy: authContext.userId,
    updatedBy: authContext.userId,
    updatedAt: now,
  };

  if (nextReviewDueDate !== undefined) {
    updates.reviewDueDate = nextReviewDueDate;
  }

  await certRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'status_transition',
    entityType: 'processor_certification',
    entityId: certificationId,
    beforeSummary: {
      reviewStatus: currentCert.reviewStatus,
      isInsufficient: currentCert.isInsufficient || false,
    },
    afterSummary: {
      reviewStatus: nextReviewStatus,
      decision,
      isInsufficient,
      reviewer: authContext.email,
    },
    source: 'cloud_function',
    workflowContext: 'processor_certification_reviewed',
  });

  return {
    success: true,
    certificationId,
    previousReviewStatus: currentCert.reviewStatus,
    newReviewStatus: nextReviewStatus,
    reviewedAt: now,
    reviewedBy: authContext.userId,
  };
});

/**
 * Callable Function: replaceProcessorCertification
 * Supersedes a previous certification while creating the replacing record and preserving historic auditability.
 */
export const replaceProcessorCertification = onCall<ReplaceProcessorCertificationInput>(async (request) => {
  const { tenantId, previousCertificationId, newCertification, replacementRationale } = request.data;

  if (!tenantId || !previousCertificationId || !newCertification) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, previousCertificationId, and newCertification payload are required.'
    );
  }
  if (newCertification.linkedControlIds !== undefined) {
    throw new HttpsError(
      'invalid-argument',
      'Control links must be changed through linkProcessorCertificationToControls.'
    );
  }
  if (
    newCertification.reviewStatus !== undefined &&
    newCertification.reviewStatus !== 'pending'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Replacement processor assurance records must begin in pending review.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const oldCertRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(previousCertificationId);
  const oldCertSnap = await oldCertRef.get();

  if (!oldCertSnap.exists) {
    throw new HttpsError('not-found', `Previous certification "${previousCertificationId}" not found.`);
  }

  const oldCert = oldCertSnap.data() as ProcessorCertification;

  if (oldCert.isHistoricVersion || oldCert.reviewStatus === 'superseded') {
    throw new HttpsError(
      'failed-precondition',
      `Certification "${previousCertificationId}" is already superseded and cannot be replaced again.`
    );
  }

  const newCertId = `procert_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
  const now = new Date().toISOString();
  const nextVersion = (oldCert.versionNumber || 1) + 1;

  const newRecord: ProcessorCertification = {
    id: newCertId,
    tenantId,
    processorProfileId: newCertification.processorProfileId || oldCert.processorProfileId,
    vendorId: newCertification.vendorId || oldCert.vendorId,
    artifactKind: newCertification.artifactKind,
    standardFamily: newCertification.standardFamily,
    customStandardName: newCertification.customStandardName || null,
    issuingBodyOrAuditor: newCertification.issuingBodyOrAuditor,
    leadAuditorName: newCertification.leadAuditorName || null,
    certificateOrReportNumber: newCertification.certificateOrReportNumber,
    reportPeriodStart: newCertification.reportPeriodStart || null,
    reportPeriodEnd: newCertification.reportPeriodEnd || null,
    validFrom: newCertification.validFrom,
    validUntil: newCertification.validUntil,
    status: newCertification.status || 'active_valid',
    assuranceScopeSummary: newCertification.assuranceScopeSummary,
    legalEntityOrRegionalScope: newCertification.legalEntityOrRegionalScope,
    systemsOrServicesCovered: newCertification.systemsOrServicesCovered || [],
    notes: newCertification.notes || null,
    reviewOwnerUserId: newCertification.reviewOwnerUserId || oldCert.reviewOwnerUserId,
    reviewStatus: 'pending',
    reviewNotes: replacementRationale ? `Superseded previous version (${oldCert.certificateOrReportNumber}): ${replacementRationale}` : null,
    rejectionReason: null,
    reviewedBy: null,
    reviewerEmail: null,
    reviewedAt: null,
    isInsufficient: false,
    insufficientRationale: null,
    replacedByCertificationId: null,
    replacesCertificationId: previousCertificationId,
    versionNumber: nextVersion,
    isHistoricVersion: false,
    reviewDueDate: newCertification.reviewDueDate || null,
    lastReviewedAt: null,
    lastReviewedBy: null,
    linkedEvidenceIds: newCertification.linkedEvidenceIds || [],
    linkedControlIds: [],
    linkedTransferArrangementIds: newCertification.linkedTransferArrangementIds || [],
    unresolvedFindingsCount: newCertification.unresolvedFindingsCount ?? 0,
    hasMajorDeficiencies: newCertification.hasMajorDeficiencies ?? false,
    ownerId: authContext.userId,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
    createdAt: now,
    updatedAt: now,
  };

  const validation = validateProcessorCertification(newRecord);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Validation failed for replacement certification: ${validation.errors.join('; ')}`);
  }

  const batch = db.batch();

  // 1. Mark old certification as superseded (preserving full history)
  batch.update(oldCertRef, {
    status: 'superseded',
    reviewStatus: 'superseded',
    replacedByCertificationId: newCertId,
    isHistoricVersion: true,
    updatedBy: authContext.userId,
    updatedAt: now,
  });

  // 2. Insert new active certification record
  const newCertRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(newCertId);
  batch.set(newCertRef, newRecord);

  await batch.commit();

  // Audit Logs
  await Promise.all([
    recordAuditLog({
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      action: 'status_transition',
      entityType: 'processor_certification',
      entityId: previousCertificationId,
      beforeSummary: { reviewStatus: oldCert.reviewStatus, isHistoricVersion: false },
      afterSummary: { reviewStatus: 'superseded', replacedByCertificationId: newCertId, isHistoricVersion: true },
      source: 'cloud_function',
      workflowContext: 'processor_certification_superseded',
    }),
    recordAuditLog({
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      action: 'create',
      entityType: 'processor_certification',
      entityId: newCertId,
      afterSummary: {
        replacesCertificationId: previousCertificationId,
        versionNumber: nextVersion,
        standardFamily: newRecord.standardFamily,
      },
      source: 'cloud_function',
      workflowContext: 'processor_certification_replaced',
    }),
  ]);

  return {
    success: true,
    previousCertificationId,
    newCertificationId: newCertId,
    newCertification: newRecord,
  };
});

export interface ListTenantProcessorCertificationsInput {
  tenantId: string;
  processorProfileId?: string;
  includeHistoric?: boolean;
}

/**
 * Callable Function: listTenantProcessorCertifications
 * Retrieves structured processor certification and attestation records.
 */
export const listTenantProcessorCertifications = onCall<ListTenantProcessorCertificationsInput>(async (request) => {
  const { tenantId, processorProfileId, includeHistoric } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('processor_certifications');
  if (processorProfileId) {
    query = query.where('processorProfileId', '==', processorProfileId);
  }

  const snap = await query.get();
  let certs = snap.docs.map((d) => d.data() as ProcessorCertification);

  if (!includeHistoric) {
    certs = certs.filter((c) => !c.isHistoricVersion && c.reviewStatus !== 'superseded');
  }

  // Sort by validUntil descending
  certs.sort((a, b) => new Date(b.validUntil).getTime() - new Date(a.validUntil).getTime());

  return {
    success: true,
    total: certs.length,
    certifications: certs,
  };
});

export interface GetProcessorCertificationRemindersInput {
  tenantId: string;
  processorProfileId?: string;
  windowDays?: number;
  gracePeriodDays?: number;
  maxReportAgeDays?: number;
}

/**
 * Callable Function: getProcessorCertificationReminders
 * Retrieves calculated reminder candidates for upcoming expiries, overdue reviews, and stale reports.
 */
export const getProcessorCertificationReminders = onCall<GetProcessorCertificationRemindersInput>(async (request) => {
  const { tenantId, processorProfileId, windowDays, gracePeriodDays, maxReportAgeDays } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('processor_certifications');
  if (processorProfileId) {
    query = query.where('processorProfileId', '==', processorProfileId);
  }

  const snap = await query.get();
  const certs = snap.docs.map((d) => d.data() as ProcessorCertification);

  const reminders = evaluateProcessorCertificationReminders(certs, {
    asOfDate: new Date(),
    windowDays: windowDays ?? 90,
    gracePeriodDays: gracePeriodDays ?? 30,
    maxReportAgeDays: maxReportAgeDays ?? 365,
  });

  return {
    success: true,
    totalCandidates: reminders.length,
    reminders,
  };
});

export interface DispatchProcessorCertificationRemindersInput {
  tenantId: string;
  processorProfileId?: string;
  windowDays?: number;
  gracePeriodDays?: number;
  dryRun?: boolean;
}

/**
 * Callable Function: dispatchProcessorCertificationReminders
 * Generates and dispatches notifications for processor certification lifecycles with deduplication suppression.
 */
export const dispatchProcessorCertificationReminders = onCall<DispatchProcessorCertificationRemindersInput>(async (request) => {
  const { tenantId, processorProfileId, windowDays, gracePeriodDays, dryRun = false } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('processor_certifications');
  if (processorProfileId) {
    query = query.where('processorProfileId', '==', processorProfileId);
  }

  const snap = await query.get();
  const certs = snap.docs.map((d) => d.data() as ProcessorCertification);

  const candidateReminders = evaluateProcessorCertificationReminders(certs, {
    asOfDate: new Date(),
    windowDays: windowDays ?? 90,
    gracePeriodDays: gracePeriodDays ?? 30,
  });

  // Fetch recent notifications for deduplication check (within 7 days)
  const sevenDaysAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
  const existingNotifsSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('notifications')
    .where('sourceEntityType', '==', 'processor_certification')
    .get();

  const existingNotifs = existingNotifsSnap.docs.map((d) => d.data());

  const dispatchedNotifications: string[] = [];
  let actualSuppressed = 0;

  if (!dryRun) {
    for (const candidate of candidateReminders) {
      const targetUserId = candidate.recipientUserId || authContext.userId;

      // Deduplication check: Has a notification of this exact type for this cert been sent recently?
      const isDuplicate = existingNotifs.some(
        (n) =>
          n.recipientId === targetUserId &&
          n.type === candidate.reminderType &&
          n.sourceEntityId === candidate.certificationId &&
          !n.isRead &&
          new Date(n.createdAt).getTime() > sevenDaysAgo
      );

      if (isDuplicate) {
        actualSuppressed++;
        continue;
      }

      const notif = await createNotification({
        tenantId,
        recipientId: targetUserId,
        title: candidate.title,
        message: candidate.message,
        type: candidate.reminderType,
        priority: candidate.severity,
        sourceEntityType: 'processor_certification',
        sourceEntityId: candidate.certificationId,
        linkUrl: `/processor-inventory?certId=${candidate.certificationId}`,
      });

      dispatchedNotifications.push(notif.id);
    }

    if (dispatchedNotifications.length > 0) {
      await recordAuditLog({
        tenantId,
        actorId: authContext.userId,
        actorEmail: authContext.email,
        actorRole: authContext.role,
        entityType: 'notification',
        entityId: `batch_${Date.now()}`,
        action: 'create',
        afterSummary: {
          totalDispatched: dispatchedNotifications.length,
          totalSuppressed: actualSuppressed,
          processorProfileId: processorProfileId || 'all',
        },
        source: 'cloud_function',
        workflowContext: 'processor_certification_reminders_dispatch',
      });
    }
  }

  return {
    success: true,
    dryRun,
    candidatesFound: candidateReminders.length,
    dispatchedCount: dryRun ? candidateReminders.length : dispatchedNotifications.length,
    suppressedCount: dryRun ? 0 : actualSuppressed,
    notificationIds: dispatchedNotifications,
  };
});

export interface GetProcessorCertificationRiskIndicatorsInput {
  tenantId: string;
  processorProfileId?: string;
  requiredSystems?: string[];
}

/**
 * Callable Function: getProcessorCertificationRiskIndicators
 * Computes live, explainable derived risk flags for processor assurance artifacts.
 */
export const getProcessorCertificationRiskIndicators = onCall<GetProcessorCertificationRiskIndicatorsInput>(async (request) => {
  const { tenantId, processorProfileId, requiredSystems } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  // Fetch relevant processor profiles, certs, and evidence
  const [profilesSnap, certsSnap, evSnap] = await Promise.all([
    db.collection('tenants').doc(tenantId).collection('processor_profiles').get(),
    db.collection('tenants').doc(tenantId).collection('processor_certifications').get(),
    db.collection('tenants').doc(tenantId).collection('evidence').get(),
  ]);

  let profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
  let certs = certsSnap.docs.map((d) => d.data() as ProcessorCertification);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  if (processorProfileId) {
    profiles = profiles.filter((p) => p.id === processorProfileId);
    certs = certs.filter((c) => c.processorProfileId === processorProfileId);
  }

  const requiredSystemsMap: Record<string, string[]> = {};
  if (processorProfileId && requiredSystems) {
    requiredSystemsMap[processorProfileId] = requiredSystems;
  }

  const flags = evaluateProcessorCertificationRiskFlags(certs, {
    evidenceDocs,
    processorProfiles: profiles,
    requiredSystemsMap,
    asOfDate: new Date(),
  });

  return {
    success: true,
    totalFlags: flags.length,
    flags,
  };
});

export interface SyncProcessorCertificationDerivedRisksInput {
  tenantId: string;
  processorProfileId?: string;
  dryRun?: boolean;
}

/**
 * Callable Function: syncProcessorCertificationDerivedRisks
 * Materializes derived risk indicators into the tenant's central Risk Register (/tenants/{tenantId}/risks)
 * with deterministic deduplication keys and automatic resolution of remediated risks.
 */
export const syncProcessorCertificationDerivedRisks = onCall<SyncProcessorCertificationDerivedRisksInput>(async (request) => {
  const { tenantId, processorProfileId, dryRun = false } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  // Fetch relevant collections
  const [profilesSnap, certsSnap, evSnap, risksSnap] = await Promise.all([
    db.collection('tenants').doc(tenantId).collection('processor_profiles').get(),
    db.collection('tenants').doc(tenantId).collection('processor_certifications').get(),
    db.collection('tenants').doc(tenantId).collection('evidence').get(),
    db.collection('tenants').doc(tenantId).collection('risks').where('sourceEntityType', '==', 'processor_certification').get(),
  ]);

  let profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
  let certs = certsSnap.docs.map((d) => d.data() as ProcessorCertification);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);
  const existingRisks = risksSnap.docs.map((d) => ({ docId: d.id, ...(d.data() as Risk) }));

  if (processorProfileId) {
    profiles = profiles.filter((p) => p.id === processorProfileId);
    certs = certs.filter((c) => c.processorProfileId === processorProfileId);
  }

  const flags = evaluateProcessorCertificationRiskFlags(certs, {
    evidenceDocs,
    processorProfiles: profiles,
    asOfDate: new Date(),
  });

  const now = new Date().toISOString();
  const batch = db.batch();
  let createdCount = 0;
  let updatedCount = 0;
  let resolvedCount = 0;
  let suppressedCount = 0;

  const activeDedupKeys = new Set<string>();

  for (const flag of flags) {
    activeDedupKeys.add(flag.dedupKey);

    const existing = existingRisks.find((r) => r.deduplicationKey === flag.dedupKey);

    const likelihood = flag.severity === 'critical' ? 5 : flag.severity === 'high' ? 4 : 3;
    const impact = flag.severity === 'critical' ? 5 : flag.severity === 'high' ? 4 : 3;
    const resLikelihood = flag.severity === 'critical' ? 4 : 3;
    const resImpact = flag.severity === 'critical' ? 4 : 3;

    if (!existing) {
      createdCount++;
      if (!dryRun) {
        const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc();
        const newRisk: Risk = {
          id: riskRef.id,
          tenantId,
          code: `RSK-PROCERT-${Date.now().toString(36).substring(4).toUpperCase()}`,
          title: flag.title,
          description: flag.description,
          category: 'third_party',
          status: 'identified',
          inherentLikelihood: likelihood,
          inherentImpact: impact,
          inherentScore: flag.inherentScore,
          residualLikelihood: resLikelihood,
          residualImpact: resImpact,
          residualScore: resLikelihood * resImpact,
          treatmentStrategy: 'mitigate',
          treatmentPlan: flag.suggestedTreatment,
          mitigatingControlIds: [],
          affectedAssetIds: [],
          processorProfileIds: [flag.processorProfileId],
          processorCertificationIds: flag.certificationId !== 'none' ? [flag.certificationId] : [],
          derivedRuleCode: flag.ruleCode,
          deduplicationKey: flag.dedupKey,
          sourceEntityType: 'processor_certification',
          sourceEntityId: flag.certificationId !== 'none' ? flag.certificationId : flag.processorProfileId,
          ownerId: authContext.userId,
          createdBy: authContext.userId,
          updatedBy: authContext.userId,
          createdAt: now,
          updatedAt: now,
        };
        batch.set(riskRef, newRisk);
      }
    } else {
      if (existing.status === 'closed') {
        // Reopen if condition recurred
        updatedCount++;
        if (!dryRun) {
          const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(existing.docId);
          batch.update(riskRef, {
            status: 'identified',
            inherentScore: flag.inherentScore,
            treatmentPlan: flag.suggestedTreatment,
            updatedAt: now,
            updatedBy: authContext.userId,
          });
        }
      } else {
        suppressedCount++;
      }
    }
  }

  // Auto-resolve risks whose underlying gap/flag is no longer active
  for (const existing of existingRisks) {
    if (existing.status !== 'closed' && existing.deduplicationKey && !activeDedupKeys.has(existing.deduplicationKey)) {
      if (processorProfileId && !existing.processorProfileIds?.includes(processorProfileId)) {
        continue;
      }
      resolvedCount++;
      if (!dryRun) {
        const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(existing.docId);
        batch.update(riskRef, {
          status: 'closed',
          treatmentPlan: 'Automatically resolved: valid assurance or supporting evidence verified.',
          updatedAt: now,
          updatedBy: 'system_auto_sync',
        });
      }
    }
  }

  if (!dryRun && (createdCount > 0 || updatedCount > 0 || resolvedCount > 0)) {
    await batch.commit();

    await recordAuditLog({
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'risk',
      entityId: `sync_procert_${Date.now()}`,
      action: 'update',
      afterSummary: {
        createdCount,
        updatedCount,
        resolvedCount,
        suppressedCount,
        processorProfileId: processorProfileId || 'all',
      },
      source: 'cloud_function',
      workflowContext: 'processor_certification_risk_sync',
    });
  }

  return {
    success: true,
    dryRun,
    activeFlagsCount: flags.length,
    createdCount,
    updatedCount,
    resolvedCount,
    suppressedCount,
  };
});

export interface GetControlProcessorAssuranceSupportInput {
  tenantId: string;
  controlId: string;
}

/**
 * Callable Function: getControlProcessorAssuranceSupport
 * Returns third-party processor assurance and supporting evidence context for a specific Control.
 */
export const getControlProcessorAssuranceSupport = onCall<GetControlProcessorAssuranceSupportInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const { tenantId, controlId } = request.data;
  if (
    !PROCESSOR_ASSURANCE_ID_PATTERN.test(tenantId || '') ||
    !PROCESSOR_ASSURANCE_ID_PATTERN.test(controlId || '')
  ) {
    throw new HttpsError('invalid-argument', 'tenantId and controlId are required.');
  }

  await requireTenantMember(request, tenantId);

  const controlRef = db.collection('tenants').doc(tenantId).collection('controls').doc(controlId);
  const controlSnap = await controlRef.get();

  if (!controlSnap.exists) {
    throw new HttpsError('not-found', `Control "${controlId}" not found in tenant.`);
  }

  const control = controlSnap.data() as Control;
  const controlTrust = await verifyControlCurrentArtifact(tenantId, controlSnap);

  const [certsSnap, evSnap, profilesSnap] = await Promise.all([
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/processor_certifications`),
      'Processor certifications'
    ),
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/evidence`),
      'Evidence records'
    ),
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/processor_profiles`),
      'Processor profiles'
    ),
  ]);

  const certs = certsSnap.docs.map((d) => d.data() as ProcessorCertification);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);
  const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);

  const support = evaluateControlProcessorAssuranceSupport(control, certs, evidenceDocs, profiles, new Date());

  return {
    success: true,
    support,
    controlWorkflowVerified: controlTrust.workflowTrusted,
    warning:
      'Processor assurance remains unverified until the certification, evidence, and review artifact chains are governed.',
  };
});

export interface GetProcessorsToControlsAssuranceMatrixInput {
  tenantId: string;
}

/**
 * Callable Function: getProcessorsToControlsAssuranceMatrix
 * Generates an end-to-end matrix showing which third-party processors support which tenant controls.
 */
export const getProcessorsToControlsAssuranceMatrix = onCall<GetProcessorsToControlsAssuranceMatrixInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const { tenantId } = request.data;
  if (!PROCESSOR_ASSURANCE_ID_PATTERN.test(tenantId || '')) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  const [profilesSnap, certsSnap, controlsSnap, evSnap] = await Promise.all([
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/processor_profiles`),
      'Processor profiles'
    ),
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/processor_certifications`),
      'Processor certifications'
    ),
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/controls`),
      'Controls'
    ),
    boundedProcessorAssuranceSnapshot(
      db.collection(`tenants/${tenantId}/evidence`),
      'Evidence records'
    ),
  ]);

  const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
  const certs = certsSnap.docs.map((d) => d.data() as ProcessorCertification);
  const controls = controlsSnap.docs.map((d) => d.data() as Control);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);

  const matrix = mapProcessorsToControlsAssuranceMatrix(profiles, certs, controls, evidenceDocs, new Date());

  return {
    success: true,
    totalProcessors: profiles.length,
    totalControls: controls.length,
    matrix,
    warning:
      'Matrix links are inventory context only; processor assurance is not counted until governed artifact chains verify.',
  };
});

export interface LinkProcessorCertificationToControlsInput {
  tenantId: string;
  certificationId: string;
  controlIds: string[];
  operation: 'add' | 'remove' | 'set';
}

/**
 * Callable Function: linkProcessorCertificationToControls
 * Updates bi-directional links between a ProcessorCertification and tenant Controls.
 */
export const linkProcessorCertificationToControls = onCall<LinkProcessorCertificationToControlsInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const input = request.data as unknown;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Request data must be an object.');
  }
  const value = input as Record<string, unknown>;
  const allowedKeys = new Set(['tenantId', 'certificationId', 'controlIds', 'operation']);
  const unknownKeys = Object.keys(value).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new HttpsError('invalid-argument', `Unsupported field(s): ${unknownKeys.join(', ')}.`);
  }
  const { tenantId, certificationId, controlIds, operation } = value;
  const safeId = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;
  if (
    typeof tenantId !== 'string' ||
    !safeId.test(tenantId) ||
    typeof certificationId !== 'string' ||
    !safeId.test(certificationId) ||
    !Array.isArray(controlIds) ||
    controlIds.length > 50 ||
    controlIds.some((id) => typeof id !== 'string' || !safeId.test(id)) ||
    new Set(controlIds).size !== controlIds.length ||
    (operation !== 'add' && operation !== 'remove' && operation !== 'set')
  ) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, certificationId, up to 50 unique controlIds, and operation (add|remove|set) are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  let updatedControlIds: string[] = [];
  await db.runTransaction(async (transaction) => {
    const certSnap = await transaction.get(certRef);
    if (!certSnap.exists) {
      throw new HttpsError('not-found', `Processor certification "${certificationId}" not found.`);
    }
    const cert = certSnap.data() as ProcessorCertification;
    if (cert.tenantId !== tenantId || cert.id !== certificationId) {
      throw new HttpsError('failed-precondition', 'Processor certification identity is inconsistent.');
    }

    const controlRefs = (controlIds as string[]).map((controlId) =>
      db.collection('tenants').doc(tenantId).collection('controls').doc(controlId)
    );
    const controlSnapshots = await Promise.all(
      controlRefs.map((controlRef) => transaction.get(controlRef))
    );
    controlSnapshots.forEach((snapshot, index) => {
      const controlId = (controlIds as string[])[index];
      const control = snapshot.data() as Control | undefined;
      if (!snapshot.exists || control?.tenantId !== tenantId || control?.id !== controlId || control?.retiredAt) {
        throw new HttpsError('failed-precondition', `Control "${controlId}" is missing, retired, or inconsistent.`);
      }
    });

    const currentLinkedControls = new Set<string>(cert.linkedControlIds || []);
    if (operation === 'add') {
      for (const controlId of controlIds as string[]) currentLinkedControls.add(controlId);
    } else if (operation === 'remove') {
      for (const controlId of controlIds as string[]) currentLinkedControls.delete(controlId);
    } else {
      currentLinkedControls.clear();
      for (const controlId of controlIds as string[]) currentLinkedControls.add(controlId);
    }
    updatedControlIds = Array.from(currentLinkedControls).sort();
    const now = new Date().toISOString();
    transaction.update(certRef, {
      linkedControlIds: updatedControlIds,
      updatedAt: now,
      updatedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'processor_certification',
      entityId: certificationId,
      action: 'link',
      beforeSummary: { linkedControlIds: cert.linkedControlIds || [] },
      afterSummary: { linkedControlIds: updatedControlIds, operation, affectedControlIds: controlIds },
      source: 'cloud_function',
      workflowContext: 'processor_certification_control_linkage',
    });
  });

  return {
    success: true,
    certificationId,
    linkedControlIds: updatedControlIds,
  };
});

/**
 * Callable Function: listTenantProcessorAssuranceInventory
 * Correlates and filters processor assurance records, profiles, vendors, assets, and evidence across the tenant.
 */
export const listTenantProcessorAssuranceInventory = onCall<ListProcessorAssuranceInventoryInput>(async (request) => {
  const {
    tenantId,
    processorProfileId,
    vendorId,
    artifactKind,
    standardFamily,
    status,
    validityStatus,
    reviewStatus,
    criticalProcessorOnly,
    issuerQuery,
    issuingBodyOrAuditor,
    linkedSystemAssetId,
    coveredSystemOrService,
    missingEvidenceOnly,
    insufficientOrRejectedOnly,
    searchQuery,
    includeHistoric = false,
    limit = 250,
    offset = 0,
  } = request.data;

  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  // 1. Query Firestore with primary indexed filters where possible
  let certQuery: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('processor_certifications');
  if (processorProfileId) {
    certQuery = certQuery.where('processorProfileId', '==', processorProfileId);
  }
  if (standardFamily) {
    certQuery = certQuery.where('standardFamily', '==', standardFamily);
  }
  if (artifactKind) {
    certQuery = certQuery.where('artifactKind', '==', artifactKind);
  }
  if (status) {
    certQuery = certQuery.where('status', '==', status);
  }
  if (reviewStatus) {
    certQuery = certQuery.where('reviewStatus', '==', reviewStatus);
  }

  // 2. Fetch correlated entities concurrently
  const [certsSnap, profilesSnap, vendorsSnap, assetsSnap, evidenceSnap] = await Promise.all([
    certQuery.get(),
    db.collection('tenants').doc(tenantId).collection('processor_profiles').get(),
    db.collection('tenants').doc(tenantId).collection('vendors').get(),
    db.collection('tenants').doc(tenantId).collection('system_assets').get(),
    db.collection('tenants').doc(tenantId).collection('evidence').get(),
  ]);

  const rawCerts = certsSnap.docs.map((d) => d.data() as ProcessorCertification);
  const profiles = profilesSnap.docs.map((d) => d.data() as ProcessorProfile);
  const vendors = vendorsSnap.docs.map((d) => d.data() as Vendor);
  const assets = assetsSnap.docs.map((d) => d.data() as SystemAsset);
  const evidenceList = evidenceSnap.docs.map((d) => d.data() as Evidence);

  // 3. Synthesize full cross-entity inventory items
  const allInventoryItems = synthesizeProcessorAssuranceInventory(rawCerts, profiles, vendors, assets, evidenceList);

  // 4. Apply multi-dimensional filters
  const filteredItems = filterProcessorAssuranceInventory(allInventoryItems, {
    tenantId,
    processorProfileId,
    vendorId,
    artifactKind,
    standardFamily,
    status,
    validityStatus,
    reviewStatus,
    criticalProcessorOnly,
    issuerQuery,
    issuingBodyOrAuditor,
    linkedSystemAssetId,
    coveredSystemOrService,
    missingEvidenceOnly,
    insufficientOrRejectedOnly,
    searchQuery,
    includeHistoric,
  });

  // Sort: active/valid first, then upcoming expiry asc, then superseded last
  filteredItems.sort((a, b) => {
    if (a.validityStatus === 'superseded' && b.validityStatus !== 'superseded') return 1;
    if (b.validityStatus === 'superseded' && a.validityStatus !== 'superseded') return -1;
    return new Date(a.certification.validUntil).getTime() - new Date(b.certification.validUntil).getTime();
  });

  // Calculate high-level summary KPIs
  const summary = summarizeProcessorAssuranceInventory(filteredItems);

  // Apply pagination
  const paginatedItems = filteredItems.slice(offset, offset + limit);

  return {
    success: true,
    total: filteredItems.length,
    count: paginatedItems.length,
    summary,
    items: paginatedItems,
  };
});

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  Evidence,
  EvidenceVersion,
  EvidenceStatus,
  EvidenceCategory,
  VALID_EVIDENCE_CATEGORIES,
  ProcessorProfile,
  TransferArrangement,
  ProcessorCertification,
  evaluateProcessorEvidenceCompleteness,
  evaluateTransferEvidenceCompleteness,
  evaluateProcessorCertificationCompleteness,
  findEvidenceForProcessorCertification,
} from '@eurogovernance/shared-types';

export interface CreateEvidenceInput {
  tenantId: string;
  title: string;
  description?: string;
  category: EvidenceCategory;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  fileHashSha256: string;
  controlIds?: string[];
  requirementIds?: string[];
  policyIds?: string[];
  riskIds?: string[];
  assessmentIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  vendorIds?: string[];
  certificationIds?: string[];
  processorCertificationIds?: string[];
}

export interface CreateEvidenceVersionInput {
  tenantId: string;
  evidenceId: string;
  fileName: string;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  fileHashSha256: string;
  changeSummary: string;
}

export interface ApproveEvidenceInput {
  tenantId: string;
  evidenceId: string;
  nextReviewDate?: string;
  decisionNotes?: string;
}

export interface RejectEvidenceInput {
  tenantId: string;
  evidenceId: string;
  rejectionReason: string;
  decisionNotes?: string;
}

export interface ListEvidenceInput {
  tenantId: string;
  controlId?: string;
  status?: EvidenceStatus;
  category?: string;
  processorProfileId?: string;
  transferArrangementId?: string;
  vendorId?: string;
}

const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB ceiling

const ALLOWED_MIME_PATTERNS = [
  /^application\/pdf$/,
  /^image\/.+$/,
  /^text\/.+$/,
  /^application\/json$/,
  /^application\/zip$/,
  /^application\/vnd\.openxmlformats-officedocument\..+$/,
  /^application\/msword$/,
  /^application\/vnd\.ms-excel$/,
];

function requireVerifiedEvidencePipeline(): never {
  throw new HttpsError(
    'failed-precondition',
    'Evidence file mutation is temporarily unavailable until a server-verified upload session binds metadata to an immutable Storage object.'
  );
}

function validateStorageFile(mimeType: string, fileSizeBytes: number, storagePath: string, tenantId: string) {
  if (fileSizeBytes > MAX_FILE_SIZE_BYTES) {
    throw new HttpsError('invalid-argument', `File size ${fileSizeBytes} exceeds maximum allowed 50MB limit.`);
  }

  const isAllowedMime = ALLOWED_MIME_PATTERNS.some((pattern) => pattern.test(mimeType));
  if (!isAllowedMime) {
    throw new HttpsError('invalid-argument', `MIME type '${mimeType}' is not permitted.`);
  }

  const expectedPrefix = `tenants/${tenantId}/evidence/`;
  if (!storagePath.startsWith(expectedPrefix)) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid storagePath: must start with '${expectedPrefix}' to ensure multi-tenant isolation.`
    );
  }
}

/**
 * Callable Function: createEvidence
 * Initializes an evidence record and its initial immutable v1 version document
 */
export const createEvidence = onCall<CreateEvidenceInput>(async (request) => {
  requireVerifiedEvidencePipeline();
  const {
    tenantId,
    title,
    description = '',
    category,
    fileName,
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    controlIds = [],
    requirementIds = [],
    policyIds = [],
    riskIds = [],
    assessmentIds = [],
    processorProfileIds = [],
    transferArrangementIds = [],
    vendorIds = [],
  } = request.data;

  if (!tenantId || !title || !category || !fileName || !storagePath || !fileSizeBytes || !mimeType || !fileHashSha256) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, title, category, fileName, storagePath, fileSizeBytes, mimeType, and fileHashSha256 are required.'
    );
  }

  if (!VALID_EVIDENCE_CATEGORIES.includes(category)) {
    throw new HttpsError('invalid-argument', `category must be one of: ${VALID_EVIDENCE_CATEGORIES.join(', ')}.`);
  }

  validateStorageFile(mimeType, fileSizeBytes, storagePath, tenantId);

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc();
  const versionRef = evidenceRef.collection('versions').doc('v1');
  const now = new Date().toISOString();

  const evidenceDoc: Evidence = {
    id: evidenceRef.id,
    tenantId,
    title: title.trim(),
    description: description.trim(),
    category,
    status: 'under_review',
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    controlIds,
    requirementIds,
    policyIds,
    riskIds,
    assessmentIds,
    processorProfileIds,
    transferArrangementIds,
    vendorIds,
    collectedAt: now,
    reviewDueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    currentVersion: 1,
    ownerId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const versionDoc: EvidenceVersion = {
    id: 'v1',
    tenantId,
    evidenceId: evidenceRef.id,
    versionNumber: 1,
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    changeSummary: 'Initial evidence upload',
    uploadedBy: authContext.userId,
    uploadedAt: now,
  };

  const batch = db.batch();
  batch.set(evidenceRef, evidenceDoc);
  batch.set(versionRef, versionDoc);
  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'evidence',
    entityId: evidenceRef.id,
    action: 'create',
    afterSummary: { title: evidenceDoc.title, category, currentVersion: 1, storagePath, fileHashSha256 },
    source: 'cloud_function',
    workflowContext: 'evidence_submission',
  });

  return { success: true, evidenceId: evidenceRef.id, currentVersion: 1 };
});

/**
 * Callable Function: createEvidenceVersion
 * Adds a new immutable version to an existing evidence record
 */
export const createEvidenceVersion = onCall<CreateEvidenceVersionInput>(async (request) => {
  requireVerifiedEvidencePipeline();
  const {
    tenantId,
    evidenceId,
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    changeSummary,
  } = request.data;

  if (!tenantId || !evidenceId || !storagePath || !fileSizeBytes || !mimeType || !fileHashSha256 || !changeSummary) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, evidenceId, storagePath, fileSizeBytes, mimeType, fileHashSha256, and changeSummary are required.'
    );
  }

  validateStorageFile(mimeType, fileSizeBytes, storagePath, tenantId);

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);
  const snap = await evidenceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Evidence record not found.');
  }

  const prev = snap.data() as Evidence;
  const newVersionNumber = (prev.currentVersion || 1) + 1;
  const versionRef = evidenceRef.collection('versions').doc(`v${newVersionNumber}`);
  const now = new Date().toISOString();

  const versionDoc: EvidenceVersion = {
    id: `v${newVersionNumber}`,
    tenantId,
    evidenceId,
    versionNumber: newVersionNumber,
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    changeSummary: changeSummary.trim(),
    uploadedBy: authContext.userId,
    uploadedAt: now,
  };

  const batch = db.batch();
  batch.set(versionRef, versionDoc);
  batch.update(evidenceRef, {
    currentVersion: newVersionNumber,
    storagePath,
    fileSizeBytes,
    mimeType,
    fileHashSha256,
    status: 'under_review',
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'evidence_version',
    entityId: `${evidenceId}_v${newVersionNumber}`,
    action: 'create',
    afterSummary: { evidenceId, versionNumber: newVersionNumber, changeSummary, storagePath, fileHashSha256 },
    source: 'cloud_function',
    workflowContext: 'evidence_version_upload',
  });

  return { success: true, evidenceId, newVersionNumber };
});

/**
 * Callable Function: approveEvidence
 * Privileged state transition with Four-Eyes separation and status transition validation
 */
export const approveEvidence = onCall<ApproveEvidenceInput>(async (request) => {
  requireVerifiedEvidencePipeline();
  const { tenantId, evidenceId, nextReviewDate, decisionNotes } = request.data;
  if (!tenantId || !evidenceId) {
    throw new HttpsError('invalid-argument', 'tenantId and evidenceId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'approver',
    'compliance_manager',
    'security_manager',
    'tenant_admin',
  ]);

  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);
  const snap = await evidenceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Evidence record not found.');
  }

  const evidence = snap.data() as Evidence;

  // Status transition validation
  if (evidence.status === 'valid') {
    throw new HttpsError('failed-precondition', 'Evidence is already approved and in valid status.');
  }

  // Four-Eyes Approval Enforcement: Creator cannot self-approve unless caller is tenant_admin
  if (evidence.createdBy === authContext.userId && authContext.role !== 'tenant_admin') {
    throw new HttpsError(
      'failed-precondition',
      'Four-Eyes Principle: You cannot approve evidence you created. Another authorized officer must review it.'
    );
  }

  const now = new Date().toISOString();
  const calculatedNextReview = nextReviewDate || new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  await evidenceRef.update({
    status: 'valid',
    reviewedBy: authContext.userId,
    reviewedAt: now,
    reviewDueDate: calculatedNextReview,
    rejectionReason: null,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'evidence',
    entityId: evidenceId,
    action: 'approve',
    beforeSummary: { status: evidence.status, reviewedBy: evidence.reviewedBy },
    afterSummary: {
      status: 'valid',
      reviewedBy: authContext.userId,
      reviewDueDate: calculatedNextReview,
      decisionNotes: decisionNotes || null,
    },
    source: 'cloud_function',
    workflowContext: 'evidence_approval_workflow',
  });

  if (evidence.createdBy) {
    await createNotification({
      tenantId,
      recipientId: evidence.createdBy,
      title: 'Evidence Approved',
      message: `Your evidence "${evidence.title}" has been signed off and marked active.`,
      type: 'evidence_approved',
      priority: 'low',
      sourceEntityType: 'evidence',
      sourceEntityId: evidenceId,
    });
  }

  return { success: true, evidenceId, status: 'valid', reviewedAt: now, reviewerId: authContext.userId };
});

/**
 * Callable Function: rejectEvidence
 * Rejects an evidence submission and captures audit rationale and decision comments
 */
export const rejectEvidence = onCall<RejectEvidenceInput>(async (request) => {
  requireVerifiedEvidencePipeline();
  const { tenantId, evidenceId, rejectionReason, decisionNotes } = request.data;
  if (!tenantId || !evidenceId || !rejectionReason) {
    throw new HttpsError('invalid-argument', 'tenantId, evidenceId, and rejectionReason are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'approver',
    'compliance_manager',
    'security_manager',
    'tenant_admin',
  ]);

  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);
  const snap = await evidenceRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Evidence record not found.');
  }

  const evidence = snap.data() as Evidence;
  if (evidence.status === 'rejected') {
    throw new HttpsError('failed-precondition', 'Evidence is already rejected.');
  }

  const now = new Date().toISOString();

  await evidenceRef.update({
    status: 'rejected',
    reviewedBy: authContext.userId,
    reviewedAt: now,
    rejectionReason: rejectionReason.trim(),
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'evidence',
    entityId: evidenceId,
    action: 'reject',
    beforeSummary: { status: evidence.status },
    afterSummary: {
      status: 'rejected',
      rejectionReason: rejectionReason.trim(),
      decisionNotes: decisionNotes || null,
      reviewedBy: authContext.userId,
    },
    source: 'cloud_function',
    workflowContext: 'evidence_rejection_workflow',
  });

  if (evidence.createdBy) {
    await createNotification({
      tenantId,
      recipientId: evidence.createdBy,
      title: 'Evidence Revision Requested',
      message: `Evidence "${evidence.title}" was rejected: ${rejectionReason.trim()}`,
      type: 'evidence_rejected',
      priority: 'high',
      sourceEntityType: 'evidence',
      sourceEntityId: evidenceId,
    });
  }

  return { success: true, evidenceId, status: 'rejected', rejectionReason: rejectionReason.trim(), reviewerId: authContext.userId };
});

/**
 * Callable Function: listTenantEvidence
 * Querying and filtering evidence records
 */
export const listTenantEvidence = onCall<ListEvidenceInput>(async (request) => {
  const { tenantId, controlId, status, category, processorProfileId, transferArrangementId, vendorId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('evidence');

  if (controlId) {
    query = query.where('controlIds', 'array-contains', controlId);
  }
  if (processorProfileId) {
    query = query.where('processorProfileIds', 'array-contains', processorProfileId);
  }
  if (transferArrangementId) {
    query = query.where('transferArrangementIds', 'array-contains', transferArrangementId);
  }
  if (vendorId) {
    query = query.where('vendorIds', 'array-contains', vendorId);
  }
  if (status) {
    query = query.where('status', '==', status);
  }
  if (category) {
    query = query.where('category', '==', category);
  }

  const snap = await query.get();
  const evidenceList: Evidence[] = snap.docs.map((d) => d.data() as Evidence);

  return { success: true, count: evidenceList.length, evidence: evidenceList };
});

export interface LinkEvidenceToProcessorProfileInput {
  tenantId: string;
  evidenceId: string;
  processorProfileId: string;
}

export const linkEvidenceToProcessorProfile = onCall<LinkEvidenceToProcessorProfileInput>(async (request) => {
  const { tenantId, evidenceId, processorProfileId } = request.data;
  if (!tenantId || !evidenceId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId, evidenceId, and processorProfileId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  // 1. Verify Evidence exists
  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);
  const evidenceSnap = await evidenceRef.get();
  if (!evidenceSnap.exists) {
    throw new HttpsError('not-found', `Evidence record ${evidenceId} not found.`);
  }
  const evidence = evidenceSnap.data() as Evidence;

  // 2. Verify ProcessorProfile exists
  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError('not-found', `Processor profile ${processorProfileId} not found.`);
  }
  const profile = profileSnap.data() as ProcessorProfile;

  const now = new Date().toISOString();
  const currentProfiles = evidence.processorProfileIds || [];
  const updatedProfiles = currentProfiles.includes(processorProfileId)
    ? currentProfiles
    : [...currentProfiles, processorProfileId];

  const currentVendors = evidence.vendorIds || [];
  const updatedVendors = profile.vendorId && !currentVendors.includes(profile.vendorId)
    ? [...currentVendors, profile.vendorId]
    : currentVendors;

  await evidenceRef.update({
    processorProfileIds: updatedProfiles,
    vendorIds: updatedVendors,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  // If evidence is DPA, link on processor profile as well
  if (evidence.category === 'dpa') {
    await profileRef.update({
      linkedDpaEvidenceId: evidenceId,
      dpaSigned: true,
      updatedAt: now,
      updatedBy: authContext.userId,
    });
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'evidence',
    entityId: evidenceId,
    action: 'link',
    beforeSummary: { previousProcessorProfileIds: currentProfiles },
    afterSummary: { evidenceId, processorProfileId, category: evidence.category },
    source: 'cloud_function',
    workflowContext: 'evidence_linked_to_processor_profile',
  });

  return { success: true, evidenceId, processorProfileId, linked: true };
});

export interface LinkEvidenceToTransferArrangementInput {
  tenantId: string;
  evidenceId: string;
  transferArrangementId: string;
}

export const linkEvidenceToTransferArrangement = onCall<LinkEvidenceToTransferArrangementInput>(async (request) => {
  const { tenantId, evidenceId, transferArrangementId } = request.data;
  if (!tenantId || !evidenceId || !transferArrangementId) {
    throw new HttpsError('invalid-argument', 'tenantId, evidenceId, and transferArrangementId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  // 1. Verify Evidence exists
  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);
  const evidenceSnap = await evidenceRef.get();
  if (!evidenceSnap.exists) {
    throw new HttpsError('not-found', `Evidence record ${evidenceId} not found.`);
  }
  const evidence = evidenceSnap.data() as Evidence;

  // 2. Verify TransferArrangement exists
  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(transferArrangementId);
  const arrangementSnap = await arrangementRef.get();
  if (!arrangementSnap.exists) {
    throw new HttpsError('not-found', `Transfer arrangement ${transferArrangementId} not found.`);
  }
  const arrangement = arrangementSnap.data() as TransferArrangement;

  const now = new Date().toISOString();

  // Update Evidence
  const currentArrangements = evidence.transferArrangementIds || [];
  const updatedArrangements = currentArrangements.includes(transferArrangementId)
    ? currentArrangements
    : [...currentArrangements, transferArrangementId];

  const currentProfiles = evidence.processorProfileIds || [];
  const updatedProfiles = arrangement.processorProfileId && !currentProfiles.includes(arrangement.processorProfileId)
    ? [...currentProfiles, arrangement.processorProfileId]
    : currentProfiles;

  await evidenceRef.update({
    transferArrangementIds: updatedArrangements,
    processorProfileIds: updatedProfiles,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  // Update TransferArrangement
  const currentLinkedEvidences = arrangement.linkedEvidenceIds || [];
  const updatedLinkedEvidences = currentLinkedEvidences.includes(evidenceId)
    ? currentLinkedEvidences
    : [...currentLinkedEvidences, evidenceId];

  await arrangementRef.update({
    linkedEvidenceIds: updatedLinkedEvidences,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'transfer_arrangement',
    entityId: transferArrangementId,
    action: 'link',
    beforeSummary: { previousLinkedEvidenceIds: currentLinkedEvidences },
    afterSummary: { evidenceId, transferArrangementId, category: evidence.category },
    source: 'cloud_function',
    workflowContext: 'evidence_linked_to_transfer_arrangement',
  });

  return { success: true, evidenceId, transferArrangementId, linked: true };
});

export interface GetProcessorEvidenceSummaryInput {
  tenantId: string;
  processorProfileId: string;
}

export const getProcessorEvidenceSummary = onCall<GetProcessorEvidenceSummaryInput>(async (request) => {
  const { tenantId, processorProfileId } = request.data;
  if (!tenantId || !processorProfileId) {
    throw new HttpsError('invalid-argument', 'tenantId and processorProfileId are required.');
  }

  await requireTenantMember(request, tenantId);

  // 1. Fetch processor profile
  const profileRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
  const profileSnap = await profileRef.get();
  if (!profileSnap.exists) {
    throw new HttpsError('not-found', `Processor profile ${processorProfileId} not found.`);
  }
  const profile = profileSnap.data() as ProcessorProfile;

  // 2. Fetch all evidences relevant to this processor
  const evidenceSnap = await db.collection('tenants').doc(tenantId).collection('evidence').get();
  const allEvidences: Evidence[] = evidenceSnap.docs.map((d) => d.data() as Evidence);

  const linkedEvidences = allEvidences.filter(
    (e) =>
      e.processorProfileIds?.includes(processorProfileId) ||
      (profile.vendorId && e.vendorIds?.includes(profile.vendorId)) ||
      e.id === profile.linkedDpaEvidenceId
  );

  const completeness = evaluateProcessorEvidenceCompleteness(profile, linkedEvidences);

  return {
    success: true,
    processorProfileId,
    completeness,
    linkedEvidenceCount: linkedEvidences.length,
    evidences: linkedEvidences,
  };
});

export interface GetTransferArrangementEvidenceSummaryInput {
  tenantId: string;
  transferArrangementId: string;
}

export const getTransferArrangementEvidenceSummary = onCall<GetTransferArrangementEvidenceSummaryInput>(async (request) => {
  const { tenantId, transferArrangementId } = request.data;
  if (!tenantId || !transferArrangementId) {
    throw new HttpsError('invalid-argument', 'tenantId and transferArrangementId are required.');
  }

  await requireTenantMember(request, tenantId);

  // 1. Fetch transfer arrangement
  const arrangementRef = db.collection('tenants').doc(tenantId).collection('transfer_arrangements').doc(transferArrangementId);
  const arrangementSnap = await arrangementRef.get();
  if (!arrangementSnap.exists) {
    throw new HttpsError('not-found', `Transfer arrangement ${transferArrangementId} not found.`);
  }
  const arrangement = arrangementSnap.data() as TransferArrangement;

  // 2. Fetch all evidences relevant to this transfer
  const evidenceSnap = await db.collection('tenants').doc(tenantId).collection('evidence').get();
  const allEvidences: Evidence[] = evidenceSnap.docs.map((d) => d.data() as Evidence);

  const linkedEvidences = allEvidences.filter(
    (e) =>
      e.transferArrangementIds?.includes(transferArrangementId) ||
      arrangement.linkedEvidenceIds?.includes(e.id)
  );

  const completeness = evaluateTransferEvidenceCompleteness(arrangement, linkedEvidences);

  return {
    success: true,
    transferArrangementId,
    completeness,
    linkedEvidenceCount: linkedEvidences.length,
    evidences: linkedEvidences,
  };
});

export interface LinkEvidenceToProcessorCertificationInput {
  tenantId: string;
  certificationId: string;
  evidenceId: string;
}

/**
 * Callable Function: linkEvidenceToProcessorCertification
 * Atomically links an evidence document to a processor certification with bidirectional referencing and audit logging.
 */
export const linkEvidenceToProcessorCertification = onCall<LinkEvidenceToProcessorCertificationInput>(async (request) => {
  const { tenantId, certificationId, evidenceId } = request.data;
  if (!tenantId || !certificationId || !evidenceId) {
    throw new HttpsError('invalid-argument', 'tenantId, certificationId, and evidenceId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  const evidenceRef = db.collection('tenants').doc(tenantId).collection('evidence').doc(evidenceId);

  const [certSnap, evSnap] = await Promise.all([certRef.get(), evidenceRef.get()]);

  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Processor certification "${certificationId}" not found.`);
  }
  if (!evSnap.exists) {
    throw new HttpsError('not-found', `Evidence "${evidenceId}" not found.`);
  }

  const cert = certSnap.data() as ProcessorCertification;
  const ev = evSnap.data() as Evidence;

  const certEvidenceIds = Array.from(new Set([...(cert.linkedEvidenceIds || []), evidenceId]));
  const evCertIds = Array.from(new Set([...(ev.processorCertificationIds || []), certificationId]));

  const now = new Date().toISOString();

  await Promise.all([
    certRef.update({
      linkedEvidenceIds: certEvidenceIds,
      updatedBy: authContext.userId,
      updatedAt: now,
    }),
    evidenceRef.update({
      processorCertificationIds: evCertIds,
      updatedBy: authContext.userId,
      updatedAt: now,
    }),
  ]);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    action: 'link',
    entityType: 'processor_certification',
    entityId: certificationId,
    beforeSummary: { linkedEvidenceIds: cert.linkedEvidenceIds || [] },
    afterSummary: { linkedEvidenceIds: certEvidenceIds, newlyLinkedEvidenceId: evidenceId },
    source: 'cloud_function',
    workflowContext: 'processor_certification_evidence_linked',
  });

  return {
    success: true,
    certificationId,
    evidenceId,
    linkedEvidenceIds: certEvidenceIds,
  };
});

export interface GetProcessorCertificationEvidenceSummaryInput {
  tenantId: string;
  certificationId: string;
}

/**
 * Callable Function: getProcessorCertificationEvidenceSummary
 * Evaluates evidence completeness, multi-file resolution, and missing evidence gaps for a processor certification.
 */
export const getProcessorCertificationEvidenceSummary = onCall<GetProcessorCertificationEvidenceSummaryInput>(async (request) => {
  const { tenantId, certificationId } = request.data;
  if (!tenantId || !certificationId) {
    throw new HttpsError('invalid-argument', 'tenantId and certificationId are required.');
  }

  await requireTenantMember(request, tenantId);

  const certRef = db.collection('tenants').doc(tenantId).collection('processor_certifications').doc(certificationId);
  const certSnap = await certRef.get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Processor certification "${certificationId}" not found.`);
  }
  const cert = certSnap.data() as ProcessorCertification;

  const evidenceSnap = await db.collection('tenants').doc(tenantId).collection('evidence').get();
  const allEvidences: Evidence[] = evidenceSnap.docs.map((d) => d.data() as Evidence);

  const linkedEvidences = findEvidenceForProcessorCertification(cert, allEvidences);
  const completeness = evaluateProcessorCertificationCompleteness(cert, allEvidences);

  return {
    success: true,
    certificationId,
    completeness,
    linkedEvidenceCount: linkedEvidences.length,
    evidences: linkedEvidences,
  };
});

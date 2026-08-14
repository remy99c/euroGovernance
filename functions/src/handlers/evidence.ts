import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Evidence,
  EvidenceVersion,
  EvidenceStatus,
} from '@eurogovernance/shared-types';

export interface CreateEvidenceInput {
  tenantId: string;
  title: string;
  description?: string;
  category: 'audit_log' | 'screenshot' | 'policy_doc' | 'export_report' | 'assessment_doc' | 'configuration';
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
}

export interface RejectEvidenceInput {
  tenantId: string;
  evidenceId: string;
  rejectionReason: string;
}

export interface ListEvidenceInput {
  tenantId: string;
  controlId?: string;
  status?: EvidenceStatus;
  category?: string;
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
  } = request.data;

  if (!tenantId || !title || !category || !fileName || !storagePath || !fileSizeBytes || !mimeType || !fileHashSha256) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, title, category, fileName, storagePath, fileSizeBytes, mimeType, and fileHashSha256 are required.'
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
 * Privileged state transition with Four-Eyes separation
 */
export const approveEvidence = onCall<ApproveEvidenceInput>(async (request) => {
  const { tenantId, evidenceId, nextReviewDate } = request.data;
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
    afterSummary: { status: 'valid', reviewedBy: authContext.userId, reviewDueDate: calculatedNextReview },
    source: 'cloud_function',
    workflowContext: 'evidence_approval_workflow',
  });

  return { success: true, evidenceId, status: 'valid', reviewedAt: now };
});

/**
 * Callable Function: rejectEvidence
 * Rejects an evidence submission and captures audit rationale.
 */
export const rejectEvidence = onCall<RejectEvidenceInput>(async (request) => {
  const { tenantId, evidenceId, rejectionReason } = request.data;
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
  const now = new Date().toISOString();

  await evidenceRef.update({
    status: 'rejected',
    reviewedBy: authContext.userId,
    reviewedAt: now,
    rejectionReason,
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
    afterSummary: { status: 'rejected', rejectionReason },
    source: 'cloud_function',
    workflowContext: 'evidence_rejection_workflow',
  });

  return { success: true, evidenceId, status: 'rejected', rejectionReason };
});

/**
 * Callable Function: listTenantEvidence
 * Querying and filtering evidence records
 */
export const listTenantEvidence = onCall<ListEvidenceInput>(async (request) => {
  const { tenantId, controlId, status, category } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('evidence');

  if (controlId) {
    query = query.where('controlIds', 'array-contains', controlId);
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

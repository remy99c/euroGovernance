import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { Evidence } from '@eurogovernance/shared-types';

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

/**
 * Callable Function: approveEvidence
 * Privileged state transition requiring approver, compliance_manager, security_manager, or tenant_admin.
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

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Policy,
  PolicyStatus,
} from '@eurogovernance/shared-types';

export interface CreatePolicyInput {
  tenantId: string;
  code: string;
  title: string;
  version: string;
  summary: string;
  scope: string;
  contentMarkdown?: string;
  storagePath?: string;
  linkedControlIds?: string[];
  ownerId?: string;
  status?: PolicyStatus;
}

export interface UpdatePolicyInput {
  tenantId: string;
  policyId: string;
  title?: string;
  version?: string;
  summary?: string;
  scope?: string;
  contentMarkdown?: string;
  storagePath?: string;
  linkedControlIds?: string[];
  ownerId?: string;
  effectiveDate?: string;
  nextReviewDate?: string;
}

export interface TransitionPolicyStatusInput {
  tenantId: string;
  policyId: string;
  targetStatus: PolicyStatus;
  decisionNotes?: string;
}

export interface DeletePolicyInput {
  tenantId: string;
  policyId: string;
}

export interface ListPoliciesInput {
  tenantId: string;
  status?: PolicyStatus;
  linkedControlId?: string;
}

const VALID_POLICY_STATUSES: PolicyStatus[] = ['draft', 'under_review', 'approved', 'active', 'retired'];

/**
 * Callable Function: createTenantPolicy
 * Creates a new policy document under /tenants/{tenantId}/policies/{policyId}
 */
export const createTenantPolicy = onCall<CreatePolicyInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    version = '1.0',
    summary,
    scope,
    contentMarkdown = '',
    storagePath = null,
    linkedControlIds = [],
    ownerId,
    status = 'draft',
  } = request.data;

  if (!tenantId || !code || !title || !summary || !scope) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, summary, and scope are required.');
  }

  if (!VALID_POLICY_STATUSES.includes(status)) {
    throw new HttpsError('invalid-argument', `Invalid policy status '${status}'.`);
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ]);

  const policyRef = db.collection('tenants').doc(tenantId).collection('policies').doc();
  const now = new Date().toISOString();
  const nextReviewDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  const policyDoc: Policy = {
    id: policyRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    version: version.trim(),
    summary: summary.trim(),
    contentMarkdown: contentMarkdown.trim(),
    storagePath,
    status,
    scope: scope.trim(),
    approverId: null,
    approvedAt: null,
    effectiveDate: null,
    nextReviewDate,
    linkedControlIds,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await policyRef.set(policyDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'policy',
    entityId: policyRef.id,
    action: 'create',
    afterSummary: { code: policyDoc.code, title: policyDoc.title, version: policyDoc.version, status },
    source: 'cloud_function',
    workflowContext: 'policy_creation',
  });

  return { success: true, policyId: policyRef.id, policy: policyDoc };
});

/**
 * Callable Function: updateTenantPolicy
 * Updates policy content and metadata
 */
export const updateTenantPolicy = onCall<UpdatePolicyInput>(async (request) => {
  const { tenantId, policyId, ...updates } = request.data;
  if (!tenantId || !policyId) {
    throw new HttpsError('invalid-argument', 'tenantId and policyId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'approver',
  ]);

  const policyRef = db.collection('tenants').doc(tenantId).collection('policies').doc(policyId);
  const snap = await policyRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Policy document not found.');
  }

  const prev = snap.data() as Policy;
  const now = new Date().toISOString();

  const updatePayload: Partial<Policy> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await policyRef.update(updatePayload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'policy',
    entityId: policyId,
    action: 'update',
    beforeSummary: { title: prev.title, version: prev.version, status: prev.status },
    afterSummary: updatePayload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'policy_metadata_update',
  });

  return { success: true, policyId, updatedFields: updatePayload };
});

/**
 * Callable Function: transitionPolicyStatus
 * Governs the policy lifecycle with approval sign-off
 */
export const transitionPolicyStatus = onCall<TransitionPolicyStatusInput>(async (request) => {
  const { tenantId, policyId, targetStatus, decisionNotes } = request.data;
  if (!tenantId || !policyId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, policyId, and targetStatus are required.');
  }

  if (!VALID_POLICY_STATUSES.includes(targetStatus)) {
    throw new HttpsError('invalid-argument', `Invalid target policy status '${targetStatus}'.`);
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'approver',
  ]);

  const policyRef = db.collection('tenants').doc(tenantId).collection('policies').doc(policyId);
  const snap = await policyRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Policy document not found.');
  }

  const prev = snap.data() as Policy;
  const now = new Date().toISOString();

  const updates: Partial<Policy> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved') {
    updates.approverId = authContext.userId;
    updates.approvedAt = now;
  } else if (targetStatus === 'active') {
    if (!prev.effectiveDate) {
      updates.effectiveDate = now;
    }
  }

  await policyRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'policy',
    entityId: policyId,
    action: targetStatus === 'approved' ? 'approve' : 'status_transition',
    beforeSummary: { status: prev.status },
    afterSummary: {
      status: targetStatus,
      approverId: updates.approverId || prev.approverId,
      approvedAt: updates.approvedAt || prev.approvedAt,
      decisionNotes: decisionNotes || null,
    },
    source: 'cloud_function',
    workflowContext: 'policy_status_transition',
  });

  return { success: true, policyId, status: targetStatus, approvedAt: updates.approvedAt };
});

/**
 * Callable Function: deleteTenantPolicy
 * Restricted exclusively to tenant_admin
 */
export const deleteTenantPolicy = onCall<DeletePolicyInput>(async (request) => {
  const { tenantId, policyId } = request.data;
  if (!tenantId || !policyId) {
    throw new HttpsError('invalid-argument', 'tenantId and policyId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const policyRef = db.collection('tenants').doc(tenantId).collection('policies').doc(policyId);
  const snap = await policyRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Policy document not found.');
  }

  const prev = snap.data() as Policy;
  await policyRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'policy',
    entityId: policyId,
    action: 'delete',
    beforeSummary: { code: prev.code, title: prev.title, version: prev.version },
    source: 'cloud_function',
    workflowContext: 'policy_deletion',
  });

  return { success: true, policyId, deleted: true };
});

/**
 * Callable Function: listTenantPolicies
 * Lists tenant policies with optional status filtering
 */
export const listTenantPolicies = onCall<ListPoliciesInput>(async (request) => {
  const { tenantId, status, linkedControlId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('policies');

  if (status) {
    query = query.where('status', '==', status);
  }
  if (linkedControlId) {
    query = query.where('linkedControlIds', 'array-contains', linkedControlId);
  }

  const snap = await query.get();
  const policies: Policy[] = snap.docs.map((d) => d.data() as Policy);

  return { success: true, count: policies.length, policies };
});

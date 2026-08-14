import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Control,
  ControlImplementationStatus,
  ControlReview,
  isValidControlStatus,
} from '@eurogovernance/shared-types';

export interface CreateControlInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  domain: string;
  frameworkIds: string[];
  requirementIds?: string[];
  status?: ControlImplementationStatus;
  enforcementMechanism?: 'automated' | 'manual' | 'policy' | 'hybrid';
  reviewFrequencyDays?: number;
  ownerId?: string;
  implementationNotes?: string;
}

export interface UpdateControlInput {
  tenantId: string;
  controlId: string;
  title?: string;
  description?: string;
  domain?: string;
  status?: ControlImplementationStatus;
  healthScore?: number;
  ownerId?: string;
  enforcementMechanism?: 'automated' | 'manual' | 'policy' | 'hybrid';
  reviewFrequencyDays?: number;
  implementationNotes?: string;
}

export interface DeleteControlInput {
  tenantId: string;
  controlId: string;
}

export interface RecordControlReviewInput {
  tenantId: string;
  controlId: string;
  effectiveness: 'effective' | 'ineffective' | 'needs_improvement';
  notes: string;
  nextReviewDate?: string;
}

export interface ListControlsInput {
  tenantId: string;
  frameworkId?: string;
  status?: ControlImplementationStatus;
  domain?: string;
  ownerId?: string;
}

/**
 * Callable Function: createTenantControl
 * Creates an adopted control under /tenants/{tenantId}/controls/{controlId}
 */
export const createTenantControl = onCall<CreateControlInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    domain,
    frameworkIds,
    requirementIds = [],
    status = 'not_started',
    enforcementMechanism = 'manual',
    reviewFrequencyDays = 90,
    ownerId,
    implementationNotes = '',
  } = request.data;

  if (!tenantId || !code || !title || !domain || !frameworkIds || frameworkIds.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, code, title, domain, and at least one frameworkId are required.'
    );
  }

  if (!isValidControlStatus(status)) {
    throw new HttpsError('invalid-argument', `Invalid control status: ${status}`);
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const controlRef = db.collection('tenants').doc(tenantId).collection('controls').doc();
  const now = new Date().toISOString();
  const nextReviewDate = new Date(Date.now() + reviewFrequencyDays * 24 * 60 * 60 * 1000).toISOString();

  const controlDoc: Control = {
    id: controlRef.id,
    tenantId,
    masterControlId: null,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description || '',
    domain: domain.trim(),
    frameworkIds,
    requirementIds,
    status,
    healthScore: status === 'implemented' ? 100 : status === 'partially_implemented' ? 50 : 0,
    enforcementMechanism,
    reviewFrequencyDays,
    lastReviewDate: null,
    nextReviewDate,
    implementationNotes,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await controlRef.set(controlDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'control',
    entityId: controlRef.id,
    action: 'create',
    afterSummary: { code: controlDoc.code, title: controlDoc.title, status: controlDoc.status },
    source: 'cloud_function',
    workflowContext: 'control_creation',
  });

  return { success: true, controlId: controlRef.id, control: controlDoc };
});

/**
 * Callable Function: updateTenantControl
 * Updates control properties and validates status transitions
 */
export const updateTenantControl = onCall<UpdateControlInput>(async (request) => {
  const { tenantId, controlId, status, ...rest } = request.data;
  if (!tenantId || !controlId) {
    throw new HttpsError('invalid-argument', 'tenantId and controlId are required.');
  }

  if (status !== undefined && !isValidControlStatus(status)) {
    throw new HttpsError('invalid-argument', `Invalid control status: ${status}`);
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const controlRef = db.collection('tenants').doc(tenantId).collection('controls').doc(controlId);
  const snap = await controlRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Control not found.');
  }

  const prevControl = snap.data() as Control;
  const now = new Date().toISOString();

  const updates: Partial<Control> = {
    ...rest,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    updates.status = status;
    if (status === 'implemented') updates.healthScore = 100;
    else if (status === 'partially_implemented') updates.healthScore = 50;
    else if (status === 'not_started') updates.healthScore = 0;
  }

  await controlRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'control',
    entityId: controlId,
    action: 'update',
    beforeSummary: { status: prevControl.status, healthScore: prevControl.healthScore, ownerId: prevControl.ownerId },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'control_update',
  });

  return { success: true, controlId, updatedFields: updates };
});

/**
 * Callable Function: deleteTenantControl
 * Restricted to tenant_admin
 */
export const deleteTenantControl = onCall<DeleteControlInput>(async (request) => {
  const { tenantId, controlId } = request.data;
  if (!tenantId || !controlId) {
    throw new HttpsError('invalid-argument', 'tenantId and controlId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const controlRef = db.collection('tenants').doc(tenantId).collection('controls').doc(controlId);
  const snap = await controlRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Control not found.');
  }

  const prevControl = snap.data() as Control;
  await controlRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'control',
    entityId: controlId,
    action: 'delete',
    beforeSummary: { code: prevControl.code, title: prevControl.title },
    source: 'cloud_function',
    workflowContext: 'control_deletion',
  });

  return { success: true, controlId, deleted: true };
});

/**
 * Callable Function: recordControlReview
 * Creates an append-only review log in /tenants/{tenantId}/controls/{controlId}/reviews/{reviewId}
 */
export const recordControlReview = onCall<RecordControlReviewInput>(async (request) => {
  const { tenantId, controlId, effectiveness, notes, nextReviewDate } = request.data;
  if (!tenantId || !controlId || !effectiveness || !notes) {
    throw new HttpsError('invalid-argument', 'tenantId, controlId, effectiveness, and notes are required.');
  }

  if (!['effective', 'ineffective', 'needs_improvement'].includes(effectiveness)) {
    throw new HttpsError('invalid-argument', `Invalid effectiveness rating: ${effectiveness}`);
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'auditor',
    'approver',
  ]);

  const controlRef = db.collection('tenants').doc(tenantId).collection('controls').doc(controlId);
  const snap = await controlRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Control not found.');
  }

  const control = snap.data() as Control;
  const reviewRef = controlRef.collection('reviews').doc();
  const now = new Date().toISOString();

  const reviewDoc: ControlReview = {
    id: reviewRef.id,
    tenantId,
    controlId,
    status: 'approved',
    reviewerId: authContext.userId,
    effectiveness,
    notes,
    reviewedAt: now,
  };

  const calculatedHealth = effectiveness === 'effective' ? 100 : effectiveness === 'needs_improvement' ? 60 : 20;
  const calculatedNext =
    nextReviewDate ||
    new Date(Date.now() + (control.reviewFrequencyDays || 90) * 24 * 60 * 60 * 1000).toISOString();

  const batch = db.batch();
  batch.set(reviewRef, reviewDoc);
  batch.update(controlRef, {
    lastReviewDate: now,
    nextReviewDate: calculatedNext,
    healthScore: calculatedHealth,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'control_review',
    entityId: reviewRef.id,
    action: 'approve',
    afterSummary: { controlId, effectiveness, notes, healthScore: calculatedHealth },
    source: 'cloud_function',
    workflowContext: 'control_review_execution',
  });

  return { success: true, reviewId: reviewRef.id, healthScore: calculatedHealth, nextReviewDate: calculatedNext };
});

/**
 * Callable Function: listTenantControls
 * Querying and filtering support for controls
 */
export const listTenantControls = onCall<ListControlsInput>(async (request) => {
  const { tenantId, frameworkId, status, domain, ownerId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('controls');

  if (frameworkId) {
    query = query.where('frameworkIds', 'array-contains', frameworkId);
  }
  if (status) {
    query = query.where('status', '==', status);
  }
  if (domain) {
    query = query.where('domain', '==', domain);
  }
  if (ownerId) {
    query = query.where('ownerId', '==', ownerId);
  }

  const snap = await query.get();
  const controls: Control[] = snap.docs.map((d) => d.data() as Control);

  return { success: true, count: controls.length, controls };
});

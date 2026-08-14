import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireAuth, requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Tenant,
  TenantMembership,
  TenantInvitation,
  UserRole,
  TenantSubscriptionTier,
} from '@eurogovernance/shared-types';

export interface CreateTenantInput {
  name: string;
  slug: string;
  tier?: TenantSubscriptionTier;
  dataRegion?: 'europe-west3' | 'europe-west1';
  enabledFrameworks?: string[];
}

export interface InviteUserInput {
  tenantId: string;
  email: string;
  role: UserRole;
  department: string;
}

export interface AcceptInviteInput {
  invitationId: string;
}

export interface AssignRoleInput {
  tenantId: string;
  targetUserId: string;
  newRole: UserRole;
}

/**
 * Callable Function: createTenant
 * Privileged workflow to instantiate a new tenant organization and set the caller as initial tenant_admin.
 */
export const createTenant = onCall<CreateTenantInput>(async (request) => {
  const authContext = requireAuth(request);
  const { name, slug, tier = 'professional', dataRegion = 'europe-west3', enabledFrameworks = ['gdpr', 'eu_ai_act', 'eu_data_act'] } = request.data;

  if (!name || !slug) {
    throw new HttpsError('invalid-argument', 'Tenant name and unique slug are required.');
  }

  const tenantRef = db.collection('tenants').doc(slug.toLowerCase());
  const existing = await tenantRef.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Tenant with slug '${slug}' already exists.`);
  }

  const now = new Date().toISOString();
  const tenantDoc: Tenant = {
    id: tenantRef.id,
    name,
    slug: slug.toLowerCase(),
    tier,
    status: 'active',
    primaryContactEmail: authContext.email,
    dataRegion,
    enabledFrameworks,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const membershipDoc: TenantMembership = {
    id: authContext.userId,
    tenantId: tenantRef.id,
    userId: authContext.userId,
    role: 'tenant_admin',
    status: 'active',
    department: 'Executive Governance',
    title: 'Organization Administrator',
    joinedAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const batch = db.batch();
  batch.set(tenantRef, tenantDoc);
  batch.set(tenantRef.collection('memberships').doc(authContext.userId), membershipDoc);

  await batch.commit();

  await recordAuditLog({
    tenantId: tenantDoc.id,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: 'tenant_admin',
    entityType: 'tenant',
    entityId: tenantDoc.id,
    action: 'create',
    afterSummary: { name, slug, tier, dataRegion, enabledFrameworks },
    source: 'cloud_function',
    workflowContext: 'tenant_creation',
  });

  return { success: true, tenantId: tenantDoc.id };
});

/**
 * Callable Function: inviteUserToTenant
 * Restricted to tenant_admin. Creates a secured invitation token record.
 */
export const inviteUserToTenant = onCall<InviteUserInput>(async (request) => {
  const { tenantId, email, role, department } = request.data;
  if (!tenantId || !email || !role) {
    throw new HttpsError('invalid-argument', 'tenantId, email, and role are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) {
    throw new HttpsError('not-found', 'Tenant does not exist.');
  }
  const tenantData = tenantSnap.data() as Tenant;

  const inviteRef = db.collection('invitations').doc();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const inviteDoc: TenantInvitation = {
    id: inviteRef.id,
    tenantId,
    tenantName: tenantData.name,
    email: email.toLowerCase().trim(),
    role,
    department: department || 'General',
    status: 'pending',
    tokenHash: inviteRef.id,
    expiresAt,
    createdAt: now.toISOString(),
    createdBy: authContext.userId,
  };

  await inviteRef.set(inviteDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'invitation',
    entityId: inviteRef.id,
    action: 'create',
    afterSummary: { email: inviteDoc.email, role: inviteDoc.role, department: inviteDoc.department },
    source: 'cloud_function',
    workflowContext: 'user_invitation',
  });

  return { success: true, invitationId: inviteRef.id, expiresAt };
});

/**
 * Callable Function: acceptTenantInvite
 * Enrolls the authenticated user into the tenant organization.
 */
export const acceptTenantInvite = onCall<AcceptInviteInput>(async (request) => {
  const authContext = requireAuth(request);
  const { invitationId } = request.data;

  if (!invitationId) {
    throw new HttpsError('invalid-argument', 'invitationId is required.');
  }

  const inviteRef = db.collection('invitations').doc(invitationId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invitation not found.');
  }

  const invite = inviteSnap.data() as TenantInvitation;
  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', `Invitation is already ${invite.status}.`);
  }

  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await inviteRef.update({ status: 'expired' });
    throw new HttpsError('deadline-exceeded', 'Invitation has expired.');
  }

  const now = new Date().toISOString();
  const membershipRef = db
    .collection('tenants')
    .doc(invite.tenantId)
    .collection('memberships')
    .doc(authContext.userId);

  const membershipDoc: TenantMembership = {
    id: authContext.userId,
    tenantId: invite.tenantId,
    userId: authContext.userId,
    role: invite.role,
    status: 'active',
    department: invite.department,
    title: 'Member',
    joinedAt: now,
    updatedAt: now,
    createdBy: invite.createdBy,
    updatedBy: authContext.userId,
  };

  const batch = db.batch();
  batch.set(membershipRef, membershipDoc);
  batch.update(inviteRef, { status: 'accepted' });

  await batch.commit();

  await recordAuditLog({
    tenantId: invite.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: invite.role,
    entityType: 'tenant_membership',
    entityId: authContext.userId,
    action: 'create',
    afterSummary: { role: invite.role, department: invite.department },
    source: 'cloud_function',
    workflowContext: 'invitation_acceptance',
  });

  return { success: true, tenantId: invite.tenantId, role: invite.role };
});

/**
 * Callable Function: assignTenantRole
 * Privileged role assignment restricted to tenant_admin.
 */
export const assignTenantRole = onCall<AssignRoleInput>(async (request) => {
  const { tenantId, targetUserId, newRole } = request.data;
  if (!tenantId || !targetUserId || !newRole) {
    throw new HttpsError('invalid-argument', 'tenantId, targetUserId, and newRole are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const memberSnap = await membershipRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Target membership record does not exist in this tenant.');
  }

  const previousMembership = memberSnap.data() as TenantMembership;
  const now = new Date().toISOString();

  await membershipRef.update({
    role: newRole,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tenant_membership',
    entityId: targetUserId,
    action: 'permission_assigned',
    beforeSummary: { role: previousMembership.role },
    afterSummary: { role: newRole },
    source: 'cloud_function',
    workflowContext: 'role_assignment',
  });

  return { success: true, targetUserId, updatedRole: newRole };
});

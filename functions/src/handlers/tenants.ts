import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireAuth, requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Tenant,
  TenantMembership,
  TenantInvitation,
  UserProfile,
  UserRole,
  TenantSubscriptionTier,
  isValidUserRole,
} from '@eurogovernance/shared-types';

export interface SyncUserProfileInput {
  displayName?: string;
  avatarUrl?: string;
  defaultTenantId?: string;
}

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

export interface CancelInviteInput {
  invitationId: string;
}

export interface AcceptInviteInput {
  invitationId: string;
}

export interface AssignRoleInput {
  tenantId: string;
  targetUserId: string;
  newRole: UserRole;
}

export interface SuspendMemberInput {
  tenantId: string;
  targetUserId: string;
  reason?: string;
}

export interface ReactivateMemberInput {
  tenantId: string;
  targetUserId: string;
}

export interface RemoveMemberInput {
  tenantId: string;
  targetUserId: string;
  reason?: string;
}

export interface ListMembersInput {
  tenantId: string;
}

export interface ListInvitationsInput {
  tenantId: string;
}

/**
 * Callable Function: syncUserProfile
 * Synchronizes Firebase Auth user state to /users/{uid} document.
 */
export const syncUserProfile = onCall<SyncUserProfileInput>(async (request) => {
  const authContext = requireAuth(request);
  const data = request.data || {};
  const userRef = db.collection('users').doc(authContext.userId);
  const userSnap = await userRef.get();
  const now = new Date().toISOString();

  const isPlatformAdmin = request.auth?.token.platform_admin === true;
  const fallbackName = authContext.email ? authContext.email.split('@')[0] || 'User' : 'User';
  const displayName = data.displayName || fallbackName;

  if (!userSnap.exists) {
    const newProfile: UserProfile = {
      id: authContext.userId,
      email: authContext.email,
      displayName,
      avatarUrl: data.avatarUrl || null,
      defaultTenantId: data.defaultTenantId || null,
      isPlatformAdmin,
      mfaEnabled: Boolean(request.auth?.token.firebase?.sign_in_second_factor),
      createdAt: now,
      updatedAt: now,
    };
    await userRef.set(newProfile);
    return { success: true, profile: newProfile };
  } else {
    const existing = userSnap.data() as UserProfile;
    const updatedProfile: Partial<UserProfile> = {
      email: authContext.email,
      displayName: data.displayName || existing.displayName,
      avatarUrl: data.avatarUrl !== undefined ? data.avatarUrl : existing.avatarUrl,
      defaultTenantId: data.defaultTenantId !== undefined ? data.defaultTenantId : existing.defaultTenantId,
      isPlatformAdmin,
      mfaEnabled: Boolean(request.auth?.token.firebase?.sign_in_second_factor),
      updatedAt: now,
    };
    await userRef.update(updatedProfile);
    return { success: true, profile: { ...existing, ...updatedProfile } };
  }
});

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

  const cleanSlug = slug.toLowerCase().trim().replace(/[^a-z0-9_-]/g, '-');
  const tenantRef = db.collection('tenants').doc(cleanSlug);
  const existing = await tenantRef.get();
  if (existing.exists) {
    throw new HttpsError('already-exists', `Tenant with slug '${cleanSlug}' already exists.`);
  }

  const now = new Date().toISOString();
  const tenantDoc: Tenant = {
    id: tenantRef.id,
    name: name.trim(),
    slug: cleanSlug,
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
    title: 'Founding Administrator',
    joinedAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const summaryMetricsRef = tenantRef.collection('summary_metrics').doc('latest');
  const initialMetrics = {
    tenantId: tenantRef.id,
    overallHealthScore: 0,
    frameworkProgress: enabledFrameworks.map((fw) => ({
      frameworkId: fw,
      name: fw.toUpperCase(),
      total: 0,
      implemented: 0,
      percentage: 0,
    })),
    controlsSummary: { total: 0, implemented: 0, in_progress: 0, not_started: 0 },
    evidenceSummary: { valid: 0, under_review: 0, expired: 0 },
    openRisksCount: 0,
    openBreachesCount: 0,
    openIncidentsCount: 0,
    lastAggregatedAt: now,
  };

  const batch = db.batch();
  batch.set(tenantRef, tenantDoc);
  batch.set(tenantRef.collection('memberships').doc(authContext.userId), membershipDoc);
  batch.set(summaryMetricsRef, initialMetrics);

  await batch.commit();

  await recordAuditLog({
    tenantId: tenantDoc.id,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: 'tenant_admin',
    entityType: 'tenant',
    entityId: tenantDoc.id,
    action: 'create',
    afterSummary: { name: tenantDoc.name, slug: cleanSlug, tier, dataRegion, enabledFrameworks },
    source: 'cloud_function',
    workflowContext: 'tenant_creation',
  });

  return { success: true, tenantId: tenantDoc.id, role: 'tenant_admin' };
});

/**
 * Callable Function: inviteUserToTenant
 * Restricted to tenant_admin. Enforces duplicate prevention and writes invitation.
 */
export const inviteUserToTenant = onCall<InviteUserInput>(async (request) => {
  const { tenantId, email, role, department } = request.data;
  if (!tenantId || !email || !role) {
    throw new HttpsError('invalid-argument', 'tenantId, email, and role are required.');
  }

  const cleanEmail = email.toLowerCase().trim();

  if (!isValidUserRole(role)) {
    throw new HttpsError('invalid-argument', `Invalid role '${role}'. Must be one of the recognized standard roles.`);
  }

  // Privilege Guardrail: Only platform_admin can invite another platform_admin
  if (role === 'platform_admin' && !request.auth?.token.platform_admin) {
    throw new HttpsError('permission-denied', 'Only platform administrators can assign the platform_admin role.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const tenantSnap = await db.collection('tenants').doc(tenantId).get();
  if (!tenantSnap.exists) {
    throw new HttpsError('not-found', 'Tenant does not exist.');
  }
  const tenantData = tenantSnap.data() as Tenant;

  // Duplicate Invitation Prevention
  const existingInvitesSnap = await db
    .collection('invitations')
    .where('tenantId', '==', tenantId)
    .where('email', '==', cleanEmail)
    .where('status', '==', 'pending')
    .get();

  if (!existingInvitesSnap.empty && existingInvitesSnap.docs[0]) {
    const existingInvite = existingInvitesSnap.docs[0].data() as TenantInvitation;
    if (new Date(existingInvite.expiresAt).getTime() > Date.now()) {
      throw new HttpsError('already-exists', `A pending invitation already exists for ${cleanEmail}.`);
    }
  }

  const inviteRef = db.collection('invitations').doc();
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const inviteDoc: TenantInvitation = {
    id: inviteRef.id,
    tenantId,
    tenantName: tenantData.name,
    email: cleanEmail,
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
 * Callable Function: cancelTenantInvite
 * Restricted to tenant_admin. Cancels/revokes an outstanding pending invitation.
 */
export const cancelTenantInvite = onCall<CancelInviteInput>(async (request) => {
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
  const authContext = await requireTenantMember(request, invite.tenantId, ['tenant_admin']);

  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', `Cannot cancel invitation with status '${invite.status}'.`);
  }

  await inviteRef.update({
    status: 'revoked',
  });

  await recordAuditLog({
    tenantId: invite.tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'invitation',
    entityId: invitationId,
    action: 'update',
    beforeSummary: { status: 'pending' },
    afterSummary: { status: 'revoked' },
    source: 'cloud_function',
    workflowContext: 'invitation_revocation',
  });

  return { success: true, invitationId, status: 'revoked' };
});

/**
 * Callable Function: acceptTenantInvite
 * Enrolls the authenticated recipient user into the tenant organization.
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

  // Intended Recipient Check
  if (authContext.email.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
    throw new HttpsError(
      'permission-denied',
      `This invitation was issued to '${invite.email}'. You are signed in as '${authContext.email}'.`
    );
  }

  if (invite.status !== 'pending') {
    throw new HttpsError('failed-precondition', `Invitation is already ${invite.status}.`);
  }

  // Expiry check
  if (new Date(invite.expiresAt).getTime() < Date.now()) {
    await inviteRef.update({ status: 'expired' });
    throw new HttpsError('deadline-exceeded', 'This invitation has expired.');
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
 * Helper to count active administrators in a tenant.
 */
async function countActiveTenantAdmins(tenantId: string): Promise<number> {
  const adminsSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .where('role', '==', 'tenant_admin')
    .where('status', '==', 'active')
    .get();
  return adminsSnap.size;
}

/**
 * Callable Function: assignTenantRole
 * Privileged role assignment with self-lockout and platform admin guardrails.
 */
export const assignTenantRole = onCall<AssignRoleInput>(async (request) => {
  const { tenantId, targetUserId, newRole } = request.data;
  if (!tenantId || !targetUserId || !newRole) {
    throw new HttpsError('invalid-argument', 'tenantId, targetUserId, and newRole are required.');
  }

  if (!isValidUserRole(newRole)) {
    throw new HttpsError('invalid-argument', `Invalid role '${newRole}'. Must be one of the recognized standard roles.`);
  }

  // Privilege Guardrail: Only platform_admin can assign the platform_admin role
  if (newRole === 'platform_admin' && !request.auth?.token.platform_admin) {
    throw new HttpsError('permission-denied', 'Only platform administrators can assign the platform_admin role.');
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

  // Self-Lockout Guardrail: Prevent demoting the sole active tenant_admin
  if (
    previousMembership.role === 'tenant_admin' &&
    newRole !== 'tenant_admin' &&
    previousMembership.status === 'active'
  ) {
    const adminCount = await countActiveTenantAdmins(tenantId);
    if (adminCount <= 1) {
      throw new HttpsError(
        'failed-precondition',
        'Cannot demote the sole active administrator of this organization. Appoint another tenant_admin first.'
      );
    }
  }

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

/**
 * Callable Function: suspendTenantMember
 * Suspends an active user membership with self-suspension guardrails.
 */
export const suspendTenantMember = onCall<SuspendMemberInput>(async (request) => {
  const { tenantId, targetUserId, reason } = request.data;
  if (!tenantId || !targetUserId) {
    throw new HttpsError('invalid-argument', 'tenantId and targetUserId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  // Self-Suspension Guardrail
  if (authContext.userId === targetUserId) {
    throw new HttpsError('failed-precondition', 'Administrators cannot suspend their own membership.');
  }

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const memberSnap = await membershipRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Target membership record not found.');
  }

  const prev = memberSnap.data() as TenantMembership;
  if (prev.status === 'suspended') {
    throw new HttpsError('failed-precondition', 'Membership is already suspended.');
  }

  // Sole Admin Guardrail
  if (prev.role === 'tenant_admin') {
    const adminCount = await countActiveTenantAdmins(tenantId);
    if (adminCount <= 1) {
      throw new HttpsError('failed-precondition', 'Cannot suspend the sole active administrator of this organization.');
    }
  }

  const now = new Date().toISOString();
  await membershipRef.update({
    status: 'suspended',
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
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: { status: 'suspended', reason: reason || 'Administrative suspension' },
    source: 'cloud_function',
    workflowContext: 'membership_suspension',
  });

  return { success: true, targetUserId, status: 'suspended' };
});

/**
 * Callable Function: reactivateTenantMember
 * Reactivates a suspended user membership.
 */
export const reactivateTenantMember = onCall<ReactivateMemberInput>(async (request) => {
  const { tenantId, targetUserId } = request.data;
  if (!tenantId || !targetUserId) {
    throw new HttpsError('invalid-argument', 'tenantId and targetUserId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const memberSnap = await membershipRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Target membership record not found.');
  }

  const prev = memberSnap.data() as TenantMembership;
  if (prev.status === 'active') {
    throw new HttpsError('failed-precondition', 'Membership is already active.');
  }

  const now = new Date().toISOString();
  await membershipRef.update({
    status: 'active',
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
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: { status: 'active' },
    source: 'cloud_function',
    workflowContext: 'membership_reactivation',
  });

  return { success: true, targetUserId, status: 'active' };
});

/**
 * Callable Function: removeTenantMember
 * Removes a membership from the organization.
 */
export const removeTenantMember = onCall<RemoveMemberInput>(async (request) => {
  const { tenantId, targetUserId, reason } = request.data;
  if (!tenantId || !targetUserId) {
    throw new HttpsError('invalid-argument', 'tenantId and targetUserId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const memberSnap = await membershipRef.get();
  if (!memberSnap.exists) {
    throw new HttpsError('not-found', 'Target membership record not found.');
  }

  const prev = memberSnap.data() as TenantMembership;

  // Sole Admin Guardrail
  if (prev.role === 'tenant_admin' && prev.status === 'active') {
    const adminCount = await countActiveTenantAdmins(tenantId);
    if (adminCount <= 1) {
      throw new HttpsError('failed-precondition', 'Cannot remove the sole active administrator of this organization.');
    }
  }

  await membershipRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tenant_membership',
    entityId: targetUserId,
    action: 'delete',
    beforeSummary: { role: prev.role, status: prev.status, department: prev.department },
    afterSummary: { reason: reason || 'Administrative removal' },
    source: 'cloud_function',
    workflowContext: 'membership_removal',
  });

  return { success: true, targetUserId, removed: true };
});

/**
 * Callable Function: listTenantMembers
 * Admin & compliance listing of tenant memberships.
 */
export const listTenantMembers = onCall<ListMembersInput>(async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId, ['tenant_admin', 'compliance_manager', 'auditor']);

  const membersSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .get();

  const members: TenantMembership[] = membersSnap.docs.map((doc) => doc.data() as TenantMembership);

  return { success: true, count: members.length, members };
});

/**
 * Callable Function: listTenantInvitations
 * Admin listing of tenant invitations.
 */
export const listTenantInvitations = onCall<ListInvitationsInput>(async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId, ['tenant_admin']);

  const invitesSnap = await db
    .collection('invitations')
    .where('tenantId', '==', tenantId)
    .get();

  const invitations: TenantInvitation[] = invitesSnap.docs.map((doc) => doc.data() as TenantInvitation);

  return { success: true, count: invitations.length, invitations };
});

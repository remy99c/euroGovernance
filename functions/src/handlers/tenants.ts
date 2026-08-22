import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import {
  requireAuth,
  requireTenantMember,
  verifyActiveTenantMembership,
} from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Tenant,
  TenantMembership,
  TenantInvitation,
  UserProfile,
  UserRole,
  isValidUserRole,
} from '@eurogovernance/shared-types';
import { appendAuditLogInTransaction } from '../lib/audit.js';

export interface SyncUserProfileInput {
  displayName?: string;
  avatarUrl?: string;
  defaultTenantId?: string;
}

export interface CreateTenantInput {
  name: string;
  slug: string;
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

const TENANT_MEMBERSHIP_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'privacy_manager',
  'ai_governance_manager',
  'security_manager',
  'auditor',
  'contributor',
  'viewer',
  'approver',
]);

function assertTenantMembershipRole(role: UserRole): void {
  if (!TENANT_MEMBERSHIP_ROLES.has(role)) {
    throw new HttpsError(
      'invalid-argument',
      'platform_admin is an identity claim and cannot be assigned as a tenant membership role.'
    );
  }
}

export interface MyTenantMembershipSummary {
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  role: UserRole;
  department: string;
  title: string;
  joinedAt: string;
}

export interface ListMyTenantMembershipsResult {
  success: true;
  count: number;
  truncated: boolean;
  memberships: MyTenantMembershipSummary[];
}

const MAX_DISCOVERABLE_TENANT_MEMBERSHIPS = 250;
const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const DEFAULT_TENANT_CREATION_LIMIT = 1;
const DEFAULT_PLATFORM_TENANT_CREATION_LIMIT = 100;
const MAX_TENANT_CREATION_LIMIT = 1_000;

function boundedSummaryString(value: unknown, fallback: string, maxLength: number): string {
  return typeof value === 'string' && value.trim()
    ? value.trim().slice(0, maxLength)
    : fallback;
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
  const input = request.data as CreateTenantInput & Record<string, unknown>;
  const allowedInputKeys = new Set(['name', 'slug']);
  const unexpectedInputKeys = Object.keys(input || {}).filter((key) => !allowedInputKeys.has(key));

  if (unexpectedInputKeys.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Tenant plan, region, and framework configuration are server-owned. Unexpected fields: ${unexpectedInputKeys.join(', ')}.`
    );
  }
  if (!authContext.email || !authContext.emailVerified) {
    throw new HttpsError(
      'permission-denied',
      'A verified email address is required before an organization can be provisioned.'
    );
  }

  const canCreateTenant =
    authContext.isPlatformAdmin || request.auth?.token.tenant_creator === true;
  if (!canCreateTenant) {
    throw new HttpsError(
      'permission-denied',
      'Tenant provisioning requires an explicit server-issued tenant_creator entitlement.'
    );
  }

  const name = typeof input?.name === 'string' ? input.name.trim() : '';
  const slug = typeof input?.slug === 'string' ? input.slug.trim() : '';
  if (name.length < 2 || name.length > 160) {
    throw new HttpsError('invalid-argument', 'Tenant name must be between 2 and 160 characters.');
  }
  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new HttpsError(
      'invalid-argument',
      'Tenant slug must be 3–63 lowercase letters, numbers, or hyphens and start with a letter or number.'
    );
  }

  const cleanSlug = slug;
  const tenantRef = db.collection('tenants').doc(cleanSlug);
  const now = new Date().toISOString();
  const tier = 'starter' as const;
  const dataRegion = 'europe-west3' as const;
  const enabledFrameworks: string[] = [];
  const tenantDoc: Tenant = {
    id: tenantRef.id,
    name,
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

  const rawClaimLimit = request.auth?.token.tenant_creation_limit;
  const claimLimit =
    typeof rawClaimLimit === 'number' &&
    Number.isSafeInteger(rawClaimLimit) &&
    rawClaimLimit > 0
      ? Math.min(rawClaimLimit, MAX_TENANT_CREATION_LIMIT)
      : null;
  const tenantCreationLimit =
    claimLimit ??
    (authContext.isPlatformAdmin
      ? DEFAULT_PLATFORM_TENANT_CREATION_LIMIT
      : DEFAULT_TENANT_CREATION_LIMIT);
  const quotaRef = db.collection('tenant_creation_quotas').doc(authContext.userId);

  await db.runTransaction(async (transaction) => {
    const [existingTenant, quotaSnapshot] = await Promise.all([
      transaction.get(tenantRef),
      transaction.get(quotaRef),
    ]);
    if (existingTenant.exists) {
      throw new HttpsError('already-exists', `Tenant with slug '${cleanSlug}' already exists.`);
    }

    const quotaData = quotaSnapshot.data();
    const createdTenants =
      typeof quotaData?.createdTenants === 'number' &&
      Number.isSafeInteger(quotaData.createdTenants) &&
      quotaData.createdTenants >= 0
        ? quotaData.createdTenants
        : 0;
    if (createdTenants >= tenantCreationLimit) {
      throw new HttpsError(
        'resource-exhausted',
        'The authenticated account has reached its tenant provisioning entitlement.'
      );
    }

    transaction.create(tenantRef, tenantDoc);
    transaction.create(
      tenantRef.collection('memberships').doc(authContext.userId),
      membershipDoc
    );
    transaction.create(summaryMetricsRef, initialMetrics);
    transaction.set(
      quotaRef,
      {
        userId: authContext.userId,
        createdTenants: createdTenants + 1,
        entitlementLimit: tenantCreationLimit,
        updatedAt: now,
      },
      { merge: true }
    );
    appendAuditLogInTransaction(transaction, {
      tenantId: tenantDoc.id,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.isPlatformAdmin ? 'platform_admin' : 'tenant_admin',
      entityType: 'tenant',
      entityId: tenantDoc.id,
      action: 'create',
      afterSummary: {
        name: tenantDoc.name,
        slug: cleanSlug,
        tier,
        dataRegion,
        enabledFrameworks,
      },
      source: 'cloud_function',
      workflowContext: 'tenant_creation',
    });
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
  assertTenantMembershipRole(role);

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

  if (!authContext.email || !authContext.emailVerified) {
    throw new HttpsError(
      'permission-denied',
      'A verified email address is required to accept a tenant invitation.'
    );
  }

  const inviteRef = db.collection('invitations').doc(invitationId);
  const transactionResult = await db.runTransaction(async (transaction) => {
    const inviteSnap = await transaction.get(inviteRef);
    if (!inviteSnap.exists) {
      throw new HttpsError('not-found', 'Invitation not found.');
    }

    const invite = inviteSnap.data() as TenantInvitation;
    if (authContext.email!.toLowerCase().trim() !== invite.email.toLowerCase().trim()) {
      throw new HttpsError('permission-denied', 'This invitation was issued to a different verified email address.');
    }
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Invitation is already ${invite.status}.`);
    }
    if (!isValidUserRole(invite.role) || invite.role === 'platform_admin') {
      throw new HttpsError('failed-precondition', 'Invitation contains an invalid tenant role.');
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      transaction.update(inviteRef, { status: 'expired' });
      return { invite, expired: true as const };
    }

    const tenantRef = db.collection('tenants').doc(invite.tenantId);
    const membershipRef = tenantRef.collection('memberships').doc(authContext.userId);
    const [tenantSnap, membershipSnap] = await Promise.all([
      transaction.get(tenantRef),
      transaction.get(membershipRef),
    ]);
    if (!tenantSnap.exists || (tenantSnap.data() as Tenant).status !== 'active') {
      throw new HttpsError('failed-precondition', 'The invited organization is not active.');
    }
    if (membershipSnap.exists) {
      throw new HttpsError('already-exists', 'A tenant membership already exists for this account.');
    }

    const now = new Date().toISOString();
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

    transaction.create(membershipRef, membershipDoc);
    transaction.update(inviteRef, { status: 'accepted' });
    return { invite, expired: false as const };
  });

  if (transactionResult.expired) {
    throw new HttpsError('deadline-exceeded', 'This invitation has expired.');
  }
  const { invite } = transactionResult;

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
  assertTenantMembershipRole(newRole);

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const now = new Date().toISOString();
  const previousMembership = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record does not exist in this tenant.');
    }
    const previous = memberSnap.data() as TenantMembership;
    if (previous.role === 'tenant_admin' && newRole !== 'tenant_admin' && previous.status === 'active') {
      const adminQuery = membershipRef.parent
        .where('role', '==', 'tenant_admin')
        .where('status', '==', 'active');
      const admins = await transaction.get(adminQuery);
      if (admins.size <= 1) {
        throw new HttpsError(
          'failed-precondition',
          'Cannot demote the sole active administrator of this organization. Appoint another tenant_admin first.'
        );
      }
    }
    transaction.update(membershipRef, {
      role: newRole,
      updatedAt: now,
      updatedBy: authContext.userId,
    });
    return previous;
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

  const now = new Date().toISOString();
  const prev = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record not found.');
    }
    const previous = memberSnap.data() as TenantMembership;
    if (previous.status === 'suspended') {
      throw new HttpsError('failed-precondition', 'Membership is already suspended.');
    }
    if (previous.role === 'tenant_admin' && previous.status === 'active') {
      const adminQuery = membershipRef.parent
        .where('role', '==', 'tenant_admin')
        .where('status', '==', 'active');
      const admins = await transaction.get(adminQuery);
      if (admins.size <= 1) {
        throw new HttpsError('failed-precondition', 'Cannot suspend the sole active administrator of this organization.');
      }
    }
    transaction.update(membershipRef, {
      status: 'suspended',
      updatedAt: now,
      updatedBy: authContext.userId,
    });
    return previous;
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

  const prev = await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record not found.');
    }
    const previous = memberSnap.data() as TenantMembership;
    if (previous.role === 'tenant_admin' && previous.status === 'active') {
      const adminQuery = membershipRef.parent
        .where('role', '==', 'tenant_admin')
        .where('status', '==', 'active');
      const admins = await transaction.get(adminQuery);
      if (admins.size <= 1) {
        throw new HttpsError('failed-precondition', 'Cannot remove the sole active administrator of this organization.');
      }
    }
    transaction.delete(membershipRef);
    return previous;
  });

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
 * Callable Function: listMyTenantMemberships
 *
 * Discovers the caller's active tenant memberships without accepting a user ID
 * or tenant ID from the client. Only the minimum tenant-switcher fields are
 * returned; membership administration metadata remains private.
 */
export const listMyTenantMemberships = onCall<Record<string, never>>(async (request) => {
  const authContext = requireAuth(request);
  const membershipSnap = await db
    .collectionGroup('memberships')
    .where('userId', '==', authContext.userId)
    .where('status', '==', 'active')
    .limit(MAX_DISCOVERABLE_TENANT_MEMBERSHIPS + 1)
    .get();

  const truncated = membershipSnap.size > MAX_DISCOVERABLE_TENANT_MEMBERSHIPS;

  const candidates = membershipSnap.docs
    .slice(0, MAX_DISCOVERABLE_TENANT_MEMBERSHIPS)
    .flatMap((membershipDoc) => {
      const tenantRef = membershipDoc.ref.parent.parent;
      const membership = membershipDoc.data() as TenantMembership;

      // A collection-group query may match an unrelated collection with the same
      // name. Derive and validate the tenant boundary from the document path.
      if (
        !tenantRef ||
        tenantRef.parent.id !== 'tenants' ||
        membershipDoc.id !== authContext.userId ||
        membership.userId !== authContext.userId ||
        membership.tenantId !== tenantRef.id ||
        membership.status !== 'active'
      ) {
        return [];
      }

      return [{ tenantRef, membership }];
    });

  if (candidates.length === 0) {
    const result: ListMyTenantMembershipsResult = {
      success: true,
      count: 0,
      truncated,
      memberships: [],
    };
    return result;
  }

  const tenantSnaps = await db.getAll(...candidates.map(({ tenantRef }) => tenantRef));
  const memberships: MyTenantMembershipSummary[] = [];

  candidates.forEach(({ membership }, index) => {
    const tenantSnap = tenantSnaps[index];
    const tenant = tenantSnap?.exists ? tenantSnap.data() as Tenant : undefined;

    try {
      const verifiedMembership = verifyActiveTenantMembership(
        membership.tenantId,
        authContext.userId,
        tenant,
        membership
      );

      memberships.push({
        tenantId: membership.tenantId,
        tenantName: boundedSummaryString(tenant!.name, membership.tenantId, 256),
        tenantSlug: boundedSummaryString(tenant!.slug, membership.tenantId, 128),
        role: verifiedMembership.role,
        department: boundedSummaryString(verifiedMembership.department, '', 160),
        title: boundedSummaryString(verifiedMembership.title, '', 160),
        joinedAt: boundedSummaryString(verifiedMembership.joinedAt, '', 64),
      });
    } catch (error) {
      if (!(error instanceof HttpsError)) {
        throw error;
      }
      // Corrupt, inactive, or cross-boundary records fail closed and are omitted.
    }
  });

  memberships.sort((left, right) =>
    left.tenantName.localeCompare(right.tenantName) || left.tenantId.localeCompare(right.tenantId)
  );

  const result: ListMyTenantMembershipsResult = {
    success: true,
    count: memberships.length,
    truncated,
    memberships,
  };
  return result;
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

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import {
  requireAuth,
  requireTenantMember,
  requireValidTenantId,
  verifyActiveTenantMembership,
} from '../lib/auth-helpers.js';
import type { VerifiedTenantAuthContext } from '../lib/auth-helpers.js';
import type { Transaction } from 'firebase-admin/firestore';
import {
  Tenant,
  TenantMembership,
  TenantInvitation,
  UserProfile,
  UserRole,
  isValidUserRole,
} from '@eurogovernance/shared-types';
import { appendAuditLogInTransaction } from '../lib/audit.js';
import {
  consumeTenantCreationQuota,
  DEFAULT_TENANT_CONFIGURATION,
  deterministicInvitationId,
  normalizeTenantInvitationInput,
  normalizeTenantProvisioningInput,
  parseTenantCreationQuota,
  requireSafeProvisioningActorId,
  requireSafeDocumentId,
  requireVerifiedProvisioningEmail,
  resolveTenantProvisioningEntitlement,
  tenantProvisioningFingerprint,
  TenantProvisioningValidationError,
} from '../lib/tenant-provisioning.js';

export interface SyncUserProfileInput {
  displayName?: string;
  avatarUrl?: string | null;
  defaultTenantId?: string | null;
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

interface TenantProvisioningReceipt {
  schemaVersion: 1;
  requestHash: string;
  actorId: string;
  tenantId: string;
  status: 'committed';
  auditLogId: string;
  createdAt: string;
}

function provisioningValidationError(error: unknown): HttpsError {
  if (!(error instanceof TenantProvisioningValidationError)) {
    return new HttpsError('internal', 'Tenant provisioning validation failed unexpectedly.');
  }
  if (error.kind === 'quota-exhausted') {
    return new HttpsError('resource-exhausted', error.message);
  }
  if (error.kind === 'invalid-input') {
    return new HttpsError('invalid-argument', error.message);
  }
  return new HttpsError('failed-precondition', error.message);
}

function isExactProvisioningReceipt(
  value: unknown,
  expected: Pick<TenantProvisioningReceipt, 'requestHash' | 'actorId' | 'tenantId'>
): value is TenantProvisioningReceipt {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const receipt = value as Record<string, unknown>;
  const expectedKeys = [
    'actorId',
    'auditLogId',
    'createdAt',
    'requestHash',
    'schemaVersion',
    'status',
    'tenantId',
  ];
  if (Object.keys(receipt).sort().join('|') !== expectedKeys.sort().join('|')) return false;
  return receipt.schemaVersion === 1 &&
    receipt.requestHash === expected.requestHash &&
    receipt.actorId === expected.actorId &&
    receipt.tenantId === expected.tenantId &&
    receipt.status === 'committed' &&
    typeof receipt.auditLogId === 'string' &&
    receipt.auditLogId.length > 0 &&
    typeof receipt.createdAt === 'string' &&
    Number.isFinite(Date.parse(receipt.createdAt));
}

async function requireTransactionalTenantAdmin(
  transaction: Transaction,
  authContext: VerifiedTenantAuthContext
): Promise<{ tenant: Tenant; actorRole: UserRole }> {
  const tenantRef = db.collection('tenants').doc(authContext.tenantId);
  const tenantSnapshot = await transaction.get(tenantRef);
  if (!tenantSnapshot.exists) {
    throw new HttpsError('permission-denied', 'The target tenant no longer exists.');
  }
  const tenant = tenantSnapshot.data() as Tenant;

  if (authContext.isPlatformAdmin) {
    return { tenant, actorRole: 'platform_admin' };
  }

  const membershipSnapshot = await transaction.get(
    tenantRef.collection('memberships').doc(authContext.userId)
  );
  const membership = membershipSnapshot.exists
    ? membershipSnapshot.data() as TenantMembership
    : undefined;
  const verified = verifyActiveTenantMembership(
    authContext.tenantId,
    authContext.userId,
    tenant,
    membership,
    ['tenant_admin']
  );
  return { tenant, actorRole: verified.role };
}

function assertMembershipIntegrity(
  membership: TenantMembership,
  tenantId: string,
  expectedUserId: string
): void {
  if (
    membership.id !== expectedUserId ||
    membership.userId !== expectedUserId ||
    membership.tenantId !== tenantId ||
    !isValidUserRole(membership.role) ||
    membership.role === 'platform_admin' ||
    !['active', 'inactive', 'suspended'].includes(membership.status)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The target tenant membership failed integrity validation.'
    );
  }
}

function exactInputRecord(
  value: unknown,
  fields: readonly string[]
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.keys(value).sort().join('|') !== [...fields].sort().join('|')
  ) {
    throw new HttpsError(
      'invalid-argument',
      `Input accepts exactly ${fields.join(', ')}.`
    );
  }
  return value as Record<string, unknown>;
}

function inputRecordWithOptionalFields(
  value: unknown,
  requiredFields: readonly string[],
  optionalFields: readonly string[]
): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', 'Input must be an object.');
  }
  const input = value as Record<string, unknown>;
  const allowed = new Set([...requiredFields, ...optionalFields]);
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    requiredFields.some((field) => !Object.prototype.hasOwnProperty.call(input, field)) ||
    Object.keys(input).some((field) => !allowed.has(field))
  ) {
    throw new HttpsError(
      'invalid-argument',
      `Input requires ${requiredFields.join(', ')} and only permits optional ${optionalFields.join(', ')}.`
    );
  }
  return input;
}

function boundedAdministrativeReason(value: unknown, fallback: string): string {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', 'Administrative reason must be a string.');
  }
  const reason = value.trim();
  if (!reason || reason.length > 1_000 || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/u.test(reason)) {
    throw new HttpsError(
      'invalid-argument',
      'Administrative reason must contain 1-1000 printable characters.'
    );
  }
  return reason;
}

function exactDocumentIdInput(value: unknown, field: string): string {
  const input = exactInputRecord(value, [field]);
  try {
    return requireSafeDocumentId(input[field], field);
  } catch (error) {
    throw provisioningValidationError(error);
  }
}

function assertInvitationIntegrity(
  invitation: TenantInvitation,
  expectedInvitationId: string
): void {
  if (
    invitation.id !== expectedInvitationId ||
    typeof invitation.tenantId !== 'string' ||
    typeof invitation.email !== 'string' ||
    invitation.email !== invitation.email.trim().toLowerCase() ||
    !isValidUserRole(invitation.role) ||
    invitation.role === 'platform_admin' ||
    !['pending', 'accepted', 'expired', 'revoked'].includes(invitation.status) ||
    !Number.isFinite(Date.parse(invitation.expiresAt)) ||
    typeof invitation.createdBy !== 'string' ||
    invitation.createdBy.length === 0
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The invitation record failed integrity validation.'
    );
  }
}

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
  if (!authContext.emailVerified || !authContext.email) {
    throw new HttpsError(
      'permission-denied',
      'A verified email address is required to synchronize a user profile.'
    );
  }
  const data = request.data || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Profile input must be an object.');
  }
  const unknownKeys = Object.keys(data).filter(
    (key) => !['displayName', 'avatarUrl', 'defaultTenantId'].includes(key)
  );
  if (unknownKeys.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Profile input contains unsupported field(s): ${unknownKeys.join(', ')}.`
    );
  }

  const normalizedDisplayName =
    typeof data.displayName === 'string' ? data.displayName.trim() : undefined;
  if (
    data.displayName !== undefined &&
    (typeof data.displayName !== 'string' ||
      !normalizedDisplayName ||
      normalizedDisplayName.length > 120)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'displayName must contain 1-120 characters.'
    );
  }

  let normalizedAvatarUrl: string | null | undefined;
  if (data.avatarUrl === null) {
    normalizedAvatarUrl = null;
  } else if (data.avatarUrl !== undefined) {
    if (typeof data.avatarUrl !== 'string' || data.avatarUrl.length > 2048) {
      throw new HttpsError('invalid-argument', 'avatarUrl must be a bounded HTTPS URL.');
    }
    try {
      const url = new URL(data.avatarUrl);
      if (url.protocol !== 'https:' || url.username || url.password) {
        throw new Error('unsafe URL');
      }
      normalizedAvatarUrl = url.toString();
    } catch {
      throw new HttpsError('invalid-argument', 'avatarUrl must be a valid HTTPS URL.');
    }
  }

  let normalizedDefaultTenantId: string | null | undefined;
  if (data.defaultTenantId === null) {
    normalizedDefaultTenantId = null;
  } else if (data.defaultTenantId !== undefined) {
    normalizedDefaultTenantId = requireValidTenantId(data.defaultTenantId);
    await requireTenantMember(request, normalizedDefaultTenantId);
  }

  const userRef = db.collection('users').doc(authContext.userId);
  const now = new Date().toISOString();

  const isPlatformAdmin = request.auth?.token.platform_admin === true;
  const fallbackName = authContext.email ? authContext.email.split('@')[0] || 'User' : 'User';
  const displayName = normalizedDisplayName || fallbackName.slice(0, 120);

  return db.runTransaction(async (transaction) => {
    const userSnap = await transaction.get(userRef);
    if (!userSnap.exists) {
      const newProfile: UserProfile = {
        id: authContext.userId,
        email: authContext.email,
        displayName,
        avatarUrl: normalizedAvatarUrl ?? null,
        defaultTenantId: normalizedDefaultTenantId ?? null,
        isPlatformAdmin,
        mfaEnabled: Boolean(request.auth?.token.firebase?.sign_in_second_factor),
        createdAt: now,
        updatedAt: now,
      };
      transaction.create(userRef, newProfile);
      return { success: true, profile: newProfile };
    }

    const existing = userSnap.data() as UserProfile;
    if (existing.id !== authContext.userId) {
      throw new HttpsError('failed-precondition', 'User profile identity metadata is invalid.');
    }
    const updatedProfile: Partial<UserProfile> = {
      email: authContext.email,
      displayName: normalizedDisplayName || existing.displayName,
      avatarUrl:
        normalizedAvatarUrl !== undefined ? normalizedAvatarUrl : existing.avatarUrl,
      defaultTenantId:
        normalizedDefaultTenantId !== undefined
          ? normalizedDefaultTenantId
          : existing.defaultTenantId,
      isPlatformAdmin,
      mfaEnabled: Boolean(request.auth?.token.firebase?.sign_in_second_factor),
      updatedAt: now,
    };
    transaction.update(userRef, updatedProfile);
    return { success: true, profile: { ...existing, ...updatedProfile } };
  });
});

/**
 * Callable Function: createTenant
 * Privileged workflow to instantiate a new tenant organization and set the caller as initial tenant_admin.
 */
export const createTenant = onCall<CreateTenantInput>(
  {
    // Tenant provisioning is low-volume and security/cost critical, so it adds
    // replay protection to the global baseline App Check enforcement.
    enforceAppCheck: true,
    consumeAppCheckToken: true,
  },
  async (request) => {
  const authContext = requireAuth(request);
  if (!request.app) {
    throw new HttpsError(
      'unauthenticated',
      'A valid Firebase App Check attestation is required for tenant provisioning.'
    );
  }
  if (request.app?.alreadyConsumed === true) {
    throw new HttpsError(
      'permission-denied',
      'The App Check token for this provisioning request has already been consumed.'
    );
  }

  let input;
  let actorId;
  let verifiedEmail;
  try {
    input = normalizeTenantProvisioningInput(request.data);
    actorId = requireSafeProvisioningActorId(authContext.userId);
    verifiedEmail = requireVerifiedProvisioningEmail(
      authContext.email,
      authContext.emailVerified
    );
  } catch (error) {
    if (
      error instanceof TenantProvisioningValidationError &&
      error.message.includes('verified email')
    ) {
      throw new HttpsError('permission-denied', error.message);
    }
    throw provisioningValidationError(error);
  }

  const entitlement = resolveTenantProvisioningEntitlement({
    isPlatformAdmin: authContext.isPlatformAdmin,
    tenantCreatorClaim: request.auth?.token.tenant_creator,
    tenantCreationLimitClaim: request.auth?.token.tenant_creation_limit,
  });
  const fingerprint = tenantProvisioningFingerprint(actorId, input);
  const tenantRef = db.collection('tenants').doc(input.slug);
  const now = new Date().toISOString();
  const enabledFrameworks = [...DEFAULT_TENANT_CONFIGURATION.enabledFrameworks];
  const tenantDoc: Tenant = {
    id: tenantRef.id,
    name: input.name,
    slug: input.slug,
    tier: DEFAULT_TENANT_CONFIGURATION.tier,
    status: DEFAULT_TENANT_CONFIGURATION.status,
    primaryContactEmail: verifiedEmail,
    dataRegion: DEFAULT_TENANT_CONFIGURATION.dataRegion,
    enabledFrameworks,
    createdAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
  };

  const membershipDoc: TenantMembership = {
    id: actorId,
    tenantId: tenantRef.id,
    userId: actorId,
    role: 'tenant_admin',
    status: 'active',
    department: 'Executive Governance',
    title: 'Founding Administrator',
    joinedAt: now,
    updatedAt: now,
    createdBy: actorId,
    updatedBy: actorId,
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

  const quotaRef = db.collection('tenant_creation_quotas').doc(actorId);
  const receiptRef = quotaRef.collection('provisioning_receipts').doc(fingerprint.receiptId);
  const membershipRef = tenantRef.collection('memberships').doc(actorId);

  const provisioningResult = await db.runTransaction(async (transaction) => {
    const [receiptSnapshot, existingTenant, membershipSnapshot, metricsSnapshot, quotaSnapshot] =
      await Promise.all([
      transaction.get(receiptRef),
      transaction.get(tenantRef),
      transaction.get(membershipRef),
      transaction.get(summaryMetricsRef),
      transaction.get(quotaRef),
    ]);

    if (receiptSnapshot.exists) {
      const receiptData = receiptSnapshot.data();
      if (
        !isExactProvisioningReceipt(receiptData, {
          requestHash: fingerprint.requestHash,
          actorId,
          tenantId: tenantDoc.id,
        })
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The tenant provisioning receipt failed integrity validation.'
        );
      }
      const auditSnapshot = await transaction.get(
        tenantRef.collection('audit_logs').doc(receiptData.auditLogId)
      );
      const auditData = auditSnapshot.data();
      if (
        !existingTenant.exists ||
        (existingTenant.data() as Tenant).id !== tenantDoc.id ||
        (existingTenant.data() as Tenant).slug !== input.slug ||
        (existingTenant.data() as Tenant).createdBy !== actorId ||
        !membershipSnapshot.exists ||
        (membershipSnapshot.data() as TenantMembership).tenantId !== tenantDoc.id ||
        (membershipSnapshot.data() as TenantMembership).userId !== actorId ||
        (membershipSnapshot.data() as TenantMembership).role !== 'tenant_admin' ||
        (membershipSnapshot.data() as TenantMembership).status !== 'active' ||
        !metricsSnapshot.exists ||
        metricsSnapshot.data()?.tenantId !== tenantDoc.id ||
        !auditSnapshot.exists ||
        auditData?.tenantId !== tenantDoc.id ||
        auditData?.actorId !== actorId ||
        auditData?.entityType !== 'tenant' ||
        auditData?.entityId !== tenantDoc.id ||
        auditData?.action !== 'create' ||
        auditData?.source !== 'cloud_function' ||
        auditData?.workflowContext !== 'tenant_creation'
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The tenant provisioning receipt or its authoritative records failed integrity validation.'
        );
      }
      return { replayed: true as const };
    }

    if (entitlement.configurationError) {
      throw new HttpsError('failed-precondition', entitlement.configurationError);
    }
    if (!entitlement.permitted) {
      throw new HttpsError(
        'permission-denied',
        'Tenant provisioning requires an explicit server-issued tenant_creator entitlement.'
      );
    }
    if (existingTenant.exists) {
      throw new HttpsError('already-exists', `Tenant with slug '${input.slug}' already exists.`);
    }
    if (membershipSnapshot.exists || metricsSnapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        'Orphaned tenant provisioning records already exist for this slug.'
      );
    }

    let quota;
    let nextCreatedTenants;
    try {
      quota = parseTenantCreationQuota(
        quotaSnapshot.exists,
        quotaSnapshot.data(),
        actorId
      );
      nextCreatedTenants = consumeTenantCreationQuota(quota, entitlement.limit);
    } catch (error) {
      throw provisioningValidationError(error);
    }

    transaction.create(tenantRef, tenantDoc);
    transaction.create(membershipRef, membershipDoc);
    transaction.create(summaryMetricsRef, initialMetrics);
    const quotaDocument = {
      userId: actorId,
      createdTenants: nextCreatedTenants,
      entitlementLimit: entitlement.limit,
      createdAt: quota.createdAt ?? now,
      updatedAt: now,
    };
    if (quota.exists) {
      transaction.set(quotaRef, quotaDocument);
    } else {
      transaction.create(quotaRef, quotaDocument);
    }
    const auditLogId = appendAuditLogInTransaction(transaction, {
      tenantId: tenantDoc.id,
      actorId,
      actorEmail: verifiedEmail,
      actorRole: authContext.isPlatformAdmin ? 'platform_admin' : 'tenant_admin',
      entityType: 'tenant',
      entityId: tenantDoc.id,
      action: 'create',
      afterSummary: {
        name: tenantDoc.name,
        slug: input.slug,
        tier: DEFAULT_TENANT_CONFIGURATION.tier,
        dataRegion: DEFAULT_TENANT_CONFIGURATION.dataRegion,
        enabledFrameworks,
        entitlementBasis: entitlement.basis,
        appCheckAttested: Boolean(request.app),
      },
      source: 'cloud_function',
      workflowContext: 'tenant_creation',
    });
    const receipt: TenantProvisioningReceipt = {
      schemaVersion: 1,
      requestHash: fingerprint.requestHash,
      actorId,
      tenantId: tenantDoc.id,
      status: 'committed',
      auditLogId,
      createdAt: now,
    };
    transaction.create(receiptRef, receipt);
    return { replayed: false as const };
  });

  return {
    success: true,
    tenantId: tenantDoc.id,
    role: 'tenant_admin' as const,
    replayed: provisioningResult.replayed,
  };
  }
);

/**
 * Callable Function: inviteUserToTenant
 * Restricted to tenant_admin. Enforces duplicate prevention and writes invitation.
 */
export const inviteUserToTenant = onCall<InviteUserInput>(async (request) => {
  let input;
  try {
    input = normalizeTenantInvitationInput(request.data);
  } catch (error) {
    throw provisioningValidationError(error);
  }
  const tenantId = requireValidTenantId(input.tenantId);
  if (!isValidUserRole(input.role)) {
    throw new HttpsError(
      'invalid-argument',
      `Invalid role '${input.role}'. Must be one of the recognized standard roles.`
    );
  }
  const role = input.role;
  assertTenantMembershipRole(role);

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);
  const invitationId = deterministicInvitationId(tenantId, input.email);
  const inviteRef = db.collection('invitations').doc(invitationId);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000).toISOString();
  const invitationResult = await db.runTransaction(async (transaction) => {
    const existingSnapshot = await transaction.get(inviteRef);
    const { tenant, actorRole } = await requireTransactionalTenantAdmin(
      transaction,
      authContext
    );
    if (tenant.status !== 'active') {
      throw new HttpsError('failed-precondition', 'Invitations require an active tenant.');
    }

    let previous: TenantInvitation | null = null;
    if (existingSnapshot.exists) {
      previous = existingSnapshot.data() as TenantInvitation;
      assertInvitationIntegrity(previous, invitationId);
      if (
        previous.tenantId !== tenantId ||
        previous.email !== input.email
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The existing invitation failed tenant and recipient integrity validation.'
        );
      }
      if (previous.status === 'accepted') {
        throw new HttpsError(
          'already-exists',
          'This recipient has already accepted the tenant invitation.'
        );
      }
      if (
        previous.status === 'pending' &&
        Number.isFinite(Date.parse(previous.expiresAt)) &&
        Date.parse(previous.expiresAt) > now.getTime()
      ) {
        throw new HttpsError(
          'already-exists',
          `A pending invitation already exists for ${input.email}.`
        );
      }
    }

    const inviteDoc: TenantInvitation = {
      id: invitationId,
      tenantId,
      tenantName: tenant.name,
      email: input.email,
      role,
      department: input.department,
      status: 'pending',
      // Invitations are authorized by the recipient's verified Auth email, not
      // by this non-secret compatibility field.
      tokenHash: invitationId.slice(4),
      expiresAt,
      createdAt: now.toISOString(),
      createdBy: authContext.userId,
    };

    if (existingSnapshot.exists) {
      transaction.set(inviteRef, inviteDoc);
    } else {
      transaction.create(inviteRef, inviteDoc);
    }
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'invitation',
      entityId: invitationId,
      action: 'create',
      beforeSummary: previous
        ? { status: previous.status, role: previous.role, expiresAt: previous.expiresAt }
        : null,
      afterSummary: {
        email: inviteDoc.email,
        role: inviteDoc.role,
        department: inviteDoc.department,
        expiresAt,
      },
      source: 'cloud_function',
      workflowContext: previous ? 'user_invitation_reissue' : 'user_invitation',
    });
    return { reissued: Boolean(previous) };
  });

  return {
    success: true,
    invitationId,
    expiresAt,
    reissued: invitationResult.reissued,
  };
});

/**
 * Callable Function: cancelTenantInvite
 * Restricted to tenant_admin. Cancels/revokes an outstanding pending invitation.
 */
export const cancelTenantInvite = onCall<CancelInviteInput>(async (request) => {
  const invitationId = exactDocumentIdInput(request.data, 'invitationId');

  const inviteRef = db.collection('invitations').doc(invitationId);
  const inviteSnap = await inviteRef.get();
  if (!inviteSnap.exists) {
    throw new HttpsError('not-found', 'Invitation not found.');
  }

  const invite = inviteSnap.data() as TenantInvitation;
  assertInvitationIntegrity(invite, invitationId);
  const authContext = await requireTenantMember(request, invite.tenantId, ['tenant_admin']);

  await db.runTransaction(async (transaction) => {
    const currentSnapshot = await transaction.get(inviteRef);
    if (!currentSnapshot.exists) {
      throw new HttpsError('not-found', 'Invitation not found.');
    }
    const current = currentSnapshot.data() as TenantInvitation;
    assertInvitationIntegrity(current, invitationId);
    if (current.tenantId !== invite.tenantId) {
      throw new HttpsError(
        'failed-precondition',
        'The invitation tenant changed during authorization.'
      );
    }
    const { actorRole } = await requireTransactionalTenantAdmin(transaction, authContext);
    if (current.status !== 'pending') {
      throw new HttpsError(
        'failed-precondition',
        `Cannot cancel invitation with status '${current.status}'.`
      );
    }

    const revokedAt = new Date().toISOString();
    transaction.update(inviteRef, {
      status: 'revoked',
      revokedAt,
      revokedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId: current.tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'invitation',
      entityId: invitationId,
      action: 'update',
      beforeSummary: { status: 'pending' },
      afterSummary: { status: 'revoked', revokedAt },
      source: 'cloud_function',
      workflowContext: 'invitation_revocation',
    });
  });

  return { success: true, invitationId, status: 'revoked' };
});

/**
 * Callable Function: acceptTenantInvite
 * Enrolls the authenticated recipient user into the tenant organization.
 */
export const acceptTenantInvite = onCall<AcceptInviteInput>(async (request) => {
  const authContext = requireAuth(request);
  const invitationId = exactDocumentIdInput(request.data, 'invitationId');

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
    assertInvitationIntegrity(invite, invitationId);
    if (authContext.email!.toLowerCase().trim() !== invite.email) {
      throw new HttpsError('permission-denied', 'This invitation was issued to a different verified email address.');
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

    const inviteRecord = invite as TenantInvitation & {
      acceptedBy?: unknown;
      acceptedAt?: unknown;
    };
    if (invite.status === 'accepted') {
      if (
        inviteRecord.acceptedBy !== authContext.userId ||
        !membershipSnap.exists
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The accepted invitation does not match its membership record.'
        );
      }
      const existingMembership = membershipSnap.data() as TenantMembership;
      assertMembershipIntegrity(existingMembership, invite.tenantId, authContext.userId);
      if (
        existingMembership.status !== 'active' ||
        existingMembership.role !== invite.role
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The accepted invitation role or status does not match its membership record.'
        );
      }
      return { invite, expired: false as const, replayed: true as const };
    }
    if (invite.status !== 'pending') {
      throw new HttpsError('failed-precondition', `Invitation is already ${invite.status}.`);
    }

    if (new Date(invite.expiresAt).getTime() < Date.now()) {
      const expiredAt = new Date().toISOString();
      transaction.update(inviteRef, { status: 'expired', expiredAt });
      appendAuditLogInTransaction(transaction, {
        tenantId: invite.tenantId,
        actorId: authContext.userId,
        actorEmail: authContext.email,
        actorRole: 'external_respondent',
        actorType: 'external_respondent',
        entityType: 'invitation',
        entityId: invitationId,
        action: 'update',
        beforeSummary: { status: 'pending' },
        afterSummary: { status: 'expired', expiredAt },
        source: 'cloud_function',
        workflowContext: 'invitation_expiration',
      });
      return { invite, expired: true as const, replayed: false as const };
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
    transaction.update(inviteRef, {
      status: 'accepted',
      acceptedAt: now,
      acceptedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId: invite.tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: invite.role,
      entityType: 'tenant_membership',
      entityId: authContext.userId,
      action: 'create',
      afterSummary: {
        role: invite.role,
        department: invite.department,
        invitationId,
      },
      source: 'cloud_function',
      workflowContext: 'invitation_acceptance',
    });
    return { invite, expired: false as const, replayed: false as const };
  });

  if (transactionResult.expired) {
    throw new HttpsError('deadline-exceeded', 'This invitation has expired.');
  }
  const { invite } = transactionResult;

  return {
    success: true,
    tenantId: invite.tenantId,
    role: invite.role,
    replayed: transactionResult.replayed,
  };
});

/**
 * Callable Function: assignTenantRole
 * Privileged role assignment with self-lockout and platform admin guardrails.
 */
export const assignTenantRole = onCall<AssignRoleInput>(async (request) => {
  const input = exactInputRecord(request.data, ['tenantId', 'targetUserId', 'newRole']);
  const tenantId = requireValidTenantId(input.tenantId);
  let targetUserId;
  try {
    targetUserId = requireSafeDocumentId(input.targetUserId, 'targetUserId');
  } catch (error) {
    throw provisioningValidationError(error);
  }
  const newRole = input.newRole;

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
    const { actorRole } = await requireTransactionalTenantAdmin(transaction, authContext);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record does not exist in this tenant.');
    }
    const previous = memberSnap.data() as TenantMembership;
    assertMembershipIntegrity(previous, tenantId, targetUserId);
    if (previous.role === newRole) {
      return { previous, changed: false as const };
    }
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
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'tenant_membership',
      entityId: targetUserId,
      action: 'permission_assigned',
      beforeSummary: { role: previous.role },
      afterSummary: { role: newRole },
      source: 'cloud_function',
      workflowContext: 'role_assignment',
    });
    return { previous, changed: true as const };
  });

  return {
    success: true,
    targetUserId,
    updatedRole: newRole,
    changed: previousMembership.changed,
  };
});

/**
 * Callable Function: suspendTenantMember
 * Suspends an active user membership with self-suspension guardrails.
 */
export const suspendTenantMember = onCall<SuspendMemberInput>(async (request) => {
  const input = inputRecordWithOptionalFields(
    request.data,
    ['tenantId', 'targetUserId'],
    ['reason']
  );
  const tenantId = requireValidTenantId(input.tenantId);
  let targetUserId;
  try {
    targetUserId = requireSafeDocumentId(input.targetUserId, 'targetUserId');
  } catch (error) {
    throw provisioningValidationError(error);
  }
  const reason = boundedAdministrativeReason(
    input.reason,
    'Administrative suspension'
  );

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
  await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    const { actorRole } = await requireTransactionalTenantAdmin(transaction, authContext);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record not found.');
    }
    const previous = memberSnap.data() as TenantMembership;
    assertMembershipIntegrity(previous, tenantId, targetUserId);
    if (previous.status !== 'active') {
      throw new HttpsError(
        'failed-precondition',
        `Only an active membership can be suspended; current status is '${previous.status}'.`
      );
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
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'tenant_membership',
      entityId: targetUserId,
      action: 'update',
      beforeSummary: { status: previous.status },
      afterSummary: { status: 'suspended', reason },
      source: 'cloud_function',
      workflowContext: 'membership_suspension',
    });
  });

  return { success: true, targetUserId, status: 'suspended' };
});

/**
 * Callable Function: reactivateTenantMember
 * Reactivates a suspended user membership.
 */
export const reactivateTenantMember = onCall<ReactivateMemberInput>(async (request) => {
  const input = exactInputRecord(request.data, ['tenantId', 'targetUserId']);
  const tenantId = requireValidTenantId(input.tenantId);
  let targetUserId;
  try {
    targetUserId = requireSafeDocumentId(input.targetUserId, 'targetUserId');
  } catch (error) {
    throw provisioningValidationError(error);
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  const now = new Date().toISOString();
  await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    const { actorRole } = await requireTransactionalTenantAdmin(transaction, authContext);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record not found.');
    }
    const previous = memberSnap.data() as TenantMembership;
    assertMembershipIntegrity(previous, tenantId, targetUserId);
    if (previous.status !== 'suspended') {
      throw new HttpsError(
        'failed-precondition',
        `Only a suspended membership can be reactivated; current status is '${previous.status}'.`
      );
    }

    transaction.update(membershipRef, {
      status: 'active',
      updatedAt: now,
      updatedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'tenant_membership',
      entityId: targetUserId,
      action: 'update',
      beforeSummary: { status: previous.status },
      afterSummary: { status: 'active' },
      source: 'cloud_function',
      workflowContext: 'membership_reactivation',
    });
  });

  return { success: true, targetUserId, status: 'active' };
});

/**
 * Callable Function: removeTenantMember
 * Removes a membership from the organization.
 */
export const removeTenantMember = onCall<RemoveMemberInput>(async (request) => {
  const input = inputRecordWithOptionalFields(
    request.data,
    ['tenantId', 'targetUserId'],
    ['reason']
  );
  const tenantId = requireValidTenantId(input.tenantId);
  let targetUserId;
  try {
    targetUserId = requireSafeDocumentId(input.targetUserId, 'targetUserId');
  } catch (error) {
    throw provisioningValidationError(error);
  }
  const reason = boundedAdministrativeReason(input.reason, 'Administrative removal');

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const membershipRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('memberships')
    .doc(targetUserId);

  await db.runTransaction(async (transaction) => {
    const memberSnap = await transaction.get(membershipRef);
    const { actorRole } = await requireTransactionalTenantAdmin(transaction, authContext);
    if (!memberSnap.exists) {
      throw new HttpsError('not-found', 'Target membership record not found.');
    }
    const previous = memberSnap.data() as TenantMembership;
    assertMembershipIntegrity(previous, tenantId, targetUserId);
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
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole,
      entityType: 'tenant_membership',
      entityId: targetUserId,
      action: 'delete',
      beforeSummary: {
        role: previous.role,
        status: previous.status,
        department: previous.department,
      },
      afterSummary: { reason },
      source: 'cloud_function',
      workflowContext: 'membership_removal',
    });
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

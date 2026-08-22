/**
 * euroGovernance - Multi-Tenant Authentication & Authorization Helpers
 *
 * Trust Boundaries & Security Invariants:
 * 1. Boundary: Firebase Callable Functions receive `request.auth` populated by Firebase Auth.
 *    Clients cannot spoof `request.auth.uid` or custom claims without valid private tokens.
 * 2. Tenant Isolation Invariant: Every tenant-scoped function must invoke `requireTenantMember`
 *    before reading or modifying documents in `/tenants/{tenantId}/...`.
 * 3. Role Hierarchy Invariant: A user's role is determined strictly from the database document
 *    `/tenants/{tenantId}/memberships/{uid}` (or `request.auth.token.platform_admin`), preventing
 *    privilege escalation via client-supplied parameters.
 * 4. Active Membership Invariant: Inactive or suspended members (`membership.status !== 'active'`)
 *    are immediately rejected with `permission-denied`.
 */

import { HttpsError, CallableRequest } from 'firebase-functions/v2/https';
import { db } from './firebase.js';
import {
  Tenant,
  TenantMembership,
  UserRole,
  isValidUserRole,
} from '@eurogovernance/shared-types';

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;

export interface VerifiedAuthContext {
  userId: string;
  email: string;
  emailVerified: boolean;
  isPlatformAdmin: boolean;
}

export interface VerifiedTenantAuthContext extends VerifiedAuthContext {
  tenantId: string;
  membership: TenantMembership;
  role: UserRole;
}

/**
 * Validates tenant identifiers before they are interpolated into Firestore paths.
 *
 * Firestore will reject some malformed document paths itself, but authorization
 * code must fail closed before attempting a lookup. In particular, accepting
 * whitespace or path separators can make security logs and error handling refer
 * to a different tenant than the document actually accessed.
 */
export function requireValidTenantId(tenantId: unknown): string {
  if (
    typeof tenantId !== 'string' ||
    tenantId.length === 0 ||
    tenantId !== tenantId.trim() ||
    !TENANT_ID_PATTERN.test(tenantId)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId must be a valid tenant document identifier.'
    );
  }

  return tenantId;
}

/**
 * Validates the database records that authorize a tenant-scoped request.
 *
 * The membership document path alone is not sufficient authorization: corrupt
 * or legacy records with mismatched embedded tenant/user identifiers must not
 * grant access, and a tenant membership cannot confer the platform_admin role.
 */
export function verifyActiveTenantMembership(
  tenantId: string,
  userId: string,
  tenant: Tenant | undefined,
  membership: TenantMembership | undefined,
  allowedRoles?: readonly UserRole[]
): TenantMembership {
  if (!tenant || tenant.id !== tenantId || tenant.status !== 'active') {
    throw new HttpsError('permission-denied', 'The target tenant is not active or accessible.');
  }

  if (
    !membership ||
    membership.userId !== userId ||
    membership.tenantId !== tenantId ||
    membership.status !== 'active'
  ) {
    throw new HttpsError('permission-denied', 'The user does not have an active tenant membership.');
  }

  if (!isValidUserRole(membership.role) || membership.role === 'platform_admin') {
    throw new HttpsError('permission-denied', 'The tenant membership contains an invalid role.');
  }

  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(membership.role)) {
    throw new HttpsError(
      'permission-denied',
      `User role '${membership.role}' does not have sufficient privileges. Required: [${allowedRoles.join(', ')}].`
    );
  }

  return membership;
}

/**
 * Validates that the request is from an authenticated Firebase user.
 *
 * @throws {HttpsError} `unauthenticated` if `request.auth` or `request.auth.uid` is missing.
 */
export function requireAuth(request: CallableRequest<unknown>): VerifiedAuthContext {
  if (!request.auth || !request.auth.uid) {
    throw new HttpsError('unauthenticated', 'The operation requires valid user authentication.');
  }

  const email = request.auth.token.email || '';
  const emailVerified = request.auth.token.email_verified === true;
  const isPlatformAdmin = request.auth.token.platform_admin === true;

  return {
    userId: request.auth.uid,
    email,
    emailVerified,
    isPlatformAdmin,
  };
}

/**
 * Validates that the authenticated user belongs to the specified tenant, has an active status,
 * and possesses one of the required authorization roles.
 *
 * @param request The callable function request object
 * @param tenantId The target tenant ID to verify access against
 * @param allowedRoles Optional list of roles permitted to perform this action. If omitted, any active member is allowed.
 * @returns Verified context containing user details, verified role, and tenant membership record.
 * @throws {HttpsError} `invalid-argument` if `tenantId` is malformed.
 * @throws {HttpsError} `permission-denied` if user is not an active member or lacks required role.
 */
export async function requireTenantMember(
  request: CallableRequest<unknown>,
  tenantId: string,
  allowedRoles?: UserRole[]
): Promise<VerifiedTenantAuthContext> {
  requireValidTenantId(tenantId);

  const authContext = requireAuth(request);

  const tenantRef = db.collection('tenants').doc(tenantId);

  if (authContext.isPlatformAdmin) {
    // Platform administrators may service suspended or archived tenants, but a
    // custom claim must never authorize access to an arbitrary non-existent path.
    const tenantSnap = await tenantRef.get();
    if (!tenantSnap.exists) {
      throw new HttpsError('permission-denied', 'The target tenant does not exist.');
    }

    return {
      ...authContext,
      tenantId,
      role: 'platform_admin',
      membership: {
        id: authContext.userId,
        tenantId,
        userId: authContext.userId,
        role: 'platform_admin',
        status: 'active',
        department: 'Platform Administration',
        title: 'Platform Superadmin',
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: 'system',
        updatedBy: 'system',
      },
    };
  }

  const membershipRef = tenantRef.collection('memberships').doc(authContext.userId);
  const tenantAndMembershipSnaps = await db.getAll(tenantRef, membershipRef);
  const tenantSnap = tenantAndMembershipSnaps[0]!;
  const membershipSnap = tenantAndMembershipSnaps[1]!;
  const tenant = tenantSnap.exists ? tenantSnap.data() as Tenant : undefined;
  const membership = membershipSnap.exists
    ? membershipSnap.data() as TenantMembership
    : undefined;

  const verifiedMembership = verifyActiveTenantMembership(
    tenantId,
    authContext.userId,
    tenant,
    membership,
    allowedRoles
  );

  return {
    ...authContext,
    tenantId,
    membership: verifiedMembership,
    role: verifiedMembership.role,
  };
}

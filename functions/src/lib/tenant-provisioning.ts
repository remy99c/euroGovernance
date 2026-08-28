import { createHash } from 'node:crypto';

export const DEFAULT_TENANT_CONFIGURATION = Object.freeze({
  tier: 'starter' as const,
  status: 'active' as const,
  dataRegion: 'europe-west3' as const,
  enabledFrameworks: Object.freeze([]) as readonly string[],
});

export const DEFAULT_TENANT_CREATION_LIMIT = 1;
export const DEFAULT_PLATFORM_TENANT_CREATION_LIMIT = 100;
export const MAX_TENANT_CREATION_LIMIT = 1_000;

const TENANT_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]{2,62}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f]/u;
const SAFE_FIRESTORE_DOCUMENT_ID_PATTERN = /^[^/]{1,128}$/u;

export type TenantProvisioningErrorKind =
  | 'invalid-input'
  | 'invalid-entitlement'
  | 'invalid-quota'
  | 'quota-exhausted';

export class TenantProvisioningValidationError extends Error {
  constructor(
    readonly kind: TenantProvisioningErrorKind,
    message: string
  ) {
    super(message);
    this.name = 'TenantProvisioningValidationError';
  }
}

export interface NormalizedTenantProvisioningInput {
  name: string;
  slug: string;
}

export interface TenantProvisioningEntitlement {
  permitted: boolean;
  limit: number;
  basis: 'platform_admin' | 'tenant_creator' | 'none';
  configurationError: string | null;
}

export interface TenantCreationQuotaState {
  exists: boolean;
  createdTenants: number;
  previousEntitlementLimit: number | null;
  createdAt: string | null;
}

export interface TenantProvisioningFingerprint {
  receiptId: string;
  requestHash: string;
}

export interface NormalizedTenantInvitationInput {
  tenantId: string;
  email: string;
  role: string;
  department: string;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length &&
    actual.every((key, index) => key === expected[index]);
}

function validIsoTimestamp(value: unknown): value is string {
  return typeof value === 'string' &&
    value.length >= 20 &&
    value.length <= 40 &&
    Number.isFinite(Date.parse(value));
}

export function normalizeTenantProvisioningInput(
  value: unknown
): NormalizedTenantProvisioningInput {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['name', 'slug'])) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Tenant provisioning accepts exactly name and slug; plan, status, region, and frameworks are server-owned.'
    );
  }

  if (typeof value.name !== 'string' || typeof value.slug !== 'string') {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Tenant name and slug must be strings.'
    );
  }
  if (value.name.length > 512 || value.slug.length > 128) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Tenant provisioning input exceeds its size limit.'
    );
  }

  const name = value.name.trim();
  const slug = value.slug.trim();
  if (
    name.length < 2 ||
    name.length > 160 ||
    CONTROL_CHARACTER_PATTERN.test(name)
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Tenant name must contain 2-160 printable characters.'
    );
  }
  if (!TENANT_SLUG_PATTERN.test(slug)) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Tenant slug must be 3-63 lowercase letters, numbers, or hyphens and start with a letter or number.'
    );
  }

  return { name, slug };
}

export function requireSafeProvisioningActorId(value: unknown): string {
  if (
    typeof value !== 'string' ||
    !SAFE_FIRESTORE_DOCUMENT_ID_PATTERN.test(value) ||
    value === '.' ||
    value === '..' ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'The authenticated user identifier cannot be used for tenant provisioning.'
    );
  }
  return value;
}

export function requireSafeDocumentId(value: unknown, label: string): string {
  if (
    typeof value !== 'string' ||
    !SAFE_FIRESTORE_DOCUMENT_ID_PATTERN.test(value) ||
    value === '.' ||
    value === '..' ||
    value !== value.trim() ||
    CONTROL_CHARACTER_PATTERN.test(value)
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      `${label} must be a safe document identifier.`
    );
  }
  return value;
}

export function normalizeTenantInvitationInput(
  value: unknown
): NormalizedTenantInvitationInput {
  if (!isPlainRecord(value) || !hasExactKeys(value, ['tenantId', 'email', 'role', 'department'])) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Invitation input accepts exactly tenantId, email, role, and department.'
    );
  }
  if (
    typeof value.tenantId !== 'string' ||
    typeof value.email !== 'string' ||
    typeof value.role !== 'string' ||
    typeof value.department !== 'string'
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Invitation fields must be strings.'
    );
  }

  const email = value.email.trim().toLowerCase();
  const department = value.department.trim() || 'General';
  if (
    email.length < 3 ||
    email.length > 320 ||
    CONTROL_CHARACTER_PATTERN.test(email) ||
    /\s/u.test(email) ||
    !/^[^@]+@[^@]+$/u.test(email)
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Invitation email must be a bounded email address.'
    );
  }
  if (department.length > 160 || CONTROL_CHARACTER_PATTERN.test(department)) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'Invitation department must not exceed 160 printable characters.'
    );
  }

  return {
    tenantId: value.tenantId,
    email,
    role: value.role,
    department,
  };
}

export function requireVerifiedProvisioningEmail(
  email: unknown,
  emailVerified: boolean
): string {
  if (
    !emailVerified ||
    typeof email !== 'string' ||
    email.length === 0 ||
    email.length > 320 ||
    email !== email.trim() ||
    CONTROL_CHARACTER_PATTERN.test(email)
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-input',
      'A bounded, verified email address is required before an organization can be provisioned.'
    );
  }
  return email.toLowerCase();
}

export function resolveTenantProvisioningEntitlement(input: {
  isPlatformAdmin: boolean;
  tenantCreatorClaim: unknown;
  tenantCreationLimitClaim: unknown;
}): TenantProvisioningEntitlement {
  const basis = input.isPlatformAdmin
    ? 'platform_admin'
    : input.tenantCreatorClaim === true
      ? 'tenant_creator'
      : 'none';
  if (basis === 'none') {
    return { permitted: false, limit: 0, basis, configurationError: null };
  }

  const defaultLimit = basis === 'platform_admin'
    ? DEFAULT_PLATFORM_TENANT_CREATION_LIMIT
    : DEFAULT_TENANT_CREATION_LIMIT;
  if (
    input.tenantCreationLimitClaim === undefined ||
    input.tenantCreationLimitClaim === null
  ) {
    return {
      permitted: true,
      limit: defaultLimit,
      basis,
      configurationError: null,
    };
  }

  const claimLimit = input.tenantCreationLimitClaim;
  if (
    typeof claimLimit !== 'number' ||
    !Number.isSafeInteger(claimLimit) ||
    claimLimit <= 0 ||
    claimLimit > MAX_TENANT_CREATION_LIMIT
  ) {
    return {
      permitted: false,
      limit: 0,
      basis,
      configurationError:
        'The server-issued tenant_creation_limit claim is invalid; provisioning fails closed.',
    };
  }

  return {
    permitted: true,
    limit: claimLimit,
    basis,
    configurationError: null,
  };
}

export function parseTenantCreationQuota(
  exists: boolean,
  value: unknown,
  expectedUserId: string
): TenantCreationQuotaState {
  if (!exists) {
    return {
      exists: false,
      createdTenants: 0,
      previousEntitlementLimit: null,
      createdAt: null,
    };
  }

  if (!isPlainRecord(value)) {
    throw new TenantProvisioningValidationError(
      'invalid-quota',
      'The tenant provisioning quota record is malformed.'
    );
  }
  const allowedKeys = new Set([
    'userId',
    'createdTenants',
    'entitlementLimit',
    'createdAt',
    'updatedAt',
  ]);
  if (Object.keys(value).some((key) => !allowedKeys.has(key))) {
    throw new TenantProvisioningValidationError(
      'invalid-quota',
      'The tenant provisioning quota record contains unsupported fields.'
    );
  }
  if (
    value.userId !== expectedUserId ||
    typeof value.createdTenants !== 'number' ||
    !Number.isSafeInteger(value.createdTenants) ||
    value.createdTenants < 0 ||
    typeof value.entitlementLimit !== 'number' ||
    !Number.isSafeInteger(value.entitlementLimit) ||
    value.entitlementLimit <= 0 ||
    value.entitlementLimit > MAX_TENANT_CREATION_LIMIT ||
    !validIsoTimestamp(value.updatedAt) ||
    (value.createdAt !== undefined && !validIsoTimestamp(value.createdAt))
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-quota',
      'The tenant provisioning quota record failed integrity validation.'
    );
  }

  return {
    exists: true,
    createdTenants: value.createdTenants,
    previousEntitlementLimit: value.entitlementLimit,
    createdAt: typeof value.createdAt === 'string' ? value.createdAt : null,
  };
}

export function consumeTenantCreationQuota(
  quota: TenantCreationQuotaState,
  entitlementLimit: number
): number {
  if (
    !Number.isSafeInteger(entitlementLimit) ||
    entitlementLimit <= 0 ||
    entitlementLimit > MAX_TENANT_CREATION_LIMIT
  ) {
    throw new TenantProvisioningValidationError(
      'invalid-entitlement',
      'The tenant provisioning entitlement limit is invalid.'
    );
  }
  if (quota.createdTenants >= entitlementLimit) {
    throw new TenantProvisioningValidationError(
      'quota-exhausted',
      'The authenticated account has reached its tenant provisioning entitlement.'
    );
  }
  return quota.createdTenants + 1;
}

function hashLengthDelimited(parts: readonly string[]): string {
  const hash = createHash('sha256');
  hash.update('eurogovernance:tenant-provisioning:v1\n');
  for (const part of parts) {
    hash.update(String(Buffer.byteLength(part, 'utf8')));
    hash.update(':');
    hash.update(part);
    hash.update('\n');
  }
  return hash.digest('hex');
}

export function tenantProvisioningFingerprint(
  actorId: string,
  input: NormalizedTenantProvisioningInput
): TenantProvisioningFingerprint {
  const safeActorId = requireSafeProvisioningActorId(actorId);
  const requestHash = hashLengthDelimited([safeActorId, input.name, input.slug]);
  return {
    receiptId: `tp_${requestHash}`,
    requestHash,
  };
}

export function deterministicInvitationId(tenantId: string, normalizedEmail: string): string {
  const digest = hashLengthDelimited(['invitation', tenantId, normalizedEmail]);
  return `inv_${digest}`;
}

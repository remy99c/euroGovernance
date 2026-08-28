import { HttpsError } from 'firebase-functions/v2/https';
import type { PolicyStatus } from '@eurogovernance/shared-types';

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const POLICY_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const VALID_POLICY_STATUSES = new Set<PolicyStatus>([
  'draft',
  'under_review',
  'approved',
  'active',
  'retired',
]);

const CREATE_POLICY_KEYS = [
  'code',
  'title',
  'version',
  'summary',
  'scope',
  'contentMarkdown',
  'storagePath',
  'linkedControlIds',
  'ownerId',
] as const;

const UPDATE_POLICY_KEYS = [
  'policyId',
  'code',
  'title',
  'version',
  'summary',
  'scope',
  'contentMarkdown',
  'storagePath',
  'linkedControlIds',
  'ownerId',
  'nextReviewDate',
] as const;

export const POLICY_LEGAL_TRANSITIONS: Readonly<
  Record<PolicyStatus, readonly PolicyStatus[]>
> = Object.freeze({
  draft: ['under_review', 'retired'],
  under_review: ['draft', 'approved', 'retired'],
  approved: ['draft', 'active', 'retired'],
  active: ['under_review', 'retired'],
  retired: [],
});

export interface NormalizedCreatePolicyPayload {
  code: string;
  title: string;
  version: string;
  summary: string;
  scope: string;
  contentMarkdown: string | null;
  storagePath: string | null;
  linkedControlIds: string[];
  ownerId: string | null;
}

export interface NormalizedUpdatePolicyPayload {
  policyId: string;
  code?: string;
  title?: string;
  version?: string;
  summary?: string;
  scope?: string;
  contentMarkdown?: string | null;
  storagePath?: string | null;
  linkedControlIds?: string[];
  ownerId?: string;
  nextReviewDate?: string;
}

export interface NormalizedPolicyTransitionPayload {
  policyId: string;
  targetStatus: PolicyStatus;
  decisionNotes: string | null;
  reviewAssigneeId: string | null;
}

export interface NormalizedRetirePolicyPayload {
  policyId: string;
  retirementReason: string;
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new HttpsError('invalid-argument', `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `${label} contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
}

function normalizedString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number
): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must contain ${minimumLength}-${maximumLength} characters.`
    );
  }
  if (
    /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/.test(
      normalized
    )
  ) {
    throw new HttpsError(
      'invalid-argument',
      `${label} contains unsupported control or directional formatting characters.`
    );
  }
  return normalized;
}

function normalizedNullableString(
  value: unknown,
  label: string,
  maximumLength: number
): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizedString(value, label, 1, maximumLength);
}

export function normalizePolicyDocumentId(value: unknown, label: string): string {
  const normalized = normalizedString(value, label, 1, 128);
  if (!DOCUMENT_ID_PATTERN.test(normalized)) {
    throw new HttpsError('invalid-argument', `${label} is not a valid document identifier.`);
  }
  return normalized;
}

export function normalizePolicyCode(value: unknown): string {
  const normalized = normalizedString(value, 'code', 2, 40).toUpperCase();
  if (!POLICY_CODE_PATTERN.test(normalized)) {
    throw new HttpsError(
      'invalid-argument',
      'code may contain only letters, numbers, periods, underscores, and hyphens.'
    );
  }
  return normalized;
}

function normalizedIdArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError('invalid-argument', `${label} must contain at most 50 IDs.`);
  }
  const normalized = value.map((entry, index) =>
    normalizePolicyDocumentId(entry, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError('invalid-argument', `${label} must not contain duplicate IDs.`);
  }
  return normalized;
}

function normalizedStoragePath(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const path = normalizedString(value, 'storagePath', 1, 1024);
  if (
    path.startsWith('/') ||
    path.includes('..') ||
    /[\u0000-\u001f\u007f]/.test(path)
  ) {
    throw new HttpsError('invalid-argument', 'storagePath is invalid.');
  }
  return path;
}

function normalizedIsoDate(value: unknown, label: string): string {
  const raw = normalizedString(value, label, 10, 40);
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(raw);
  const utcTimestamp = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(raw);
  if (!dateOnly && !utcTimestamp) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must be YYYY-MM-DD or a canonical UTC ISO 8601 timestamp.`
    );
  }
  const timestamp = Date.parse(raw);
  const canonical = Number.isFinite(timestamp)
    ? new Date(timestamp).toISOString()
    : null;
  if (
    canonical === null ||
    (dateOnly && canonical.slice(0, 10) !== raw) ||
    (utcTimestamp && canonical !== raw)
  ) {
    throw new HttpsError('invalid-argument', `${label} must be a valid ISO 8601 date.`);
  }
  return canonical;
}

/**
 * Applies schedule bounds by UTC calendar day, not by a rolling 24-hour
 * duration. This permits tomorrow at midnight even when a command is submitted
 * late in the current UTC day.
 */
export function assertPolicyReviewDateIsReasonable(
  reviewDate: string,
  requestedAt: string
): void {
  const reviewTimestamp = Date.parse(reviewDate);
  const requestedTimestamp = Date.parse(requestedAt);
  if (!Number.isFinite(reviewTimestamp) || !Number.isFinite(requestedTimestamp)) {
    throw new HttpsError(
      'invalid-argument',
      'nextReviewDate and the authoritative request time must be valid ISO dates.'
    );
  }
  const reviewDay = new Date(reviewTimestamp).toISOString().slice(0, 10);
  const requestedDate = new Date(requestedTimestamp);
  const requestedDay = requestedDate.toISOString().slice(0, 10);
  const maximum = new Date(requestedTimestamp);
  maximum.setUTCFullYear(maximum.getUTCFullYear() + 3);
  const maximumDay = maximum.toISOString().slice(0, 10);
  if (reviewDay <= requestedDay || reviewDay > maximumDay) {
    throw new HttpsError(
      'invalid-argument',
      'nextReviewDate must be between one day and three years in the future.'
    );
  }
}

function normalizedStatus(value: unknown, label: string): PolicyStatus {
  if (typeof value !== 'string' || !VALID_POLICY_STATUSES.has(value as PolicyStatus)) {
    throw new HttpsError('invalid-argument', `${label} contains an unsupported value.`);
  }
  return value as PolicyStatus;
}

export function normalizeCreatePolicyPayload(
  payload: unknown
): NormalizedCreatePolicyPayload {
  const input = requirePlainObject(payload, 'Policy create payload');
  rejectUnknownKeys(input, CREATE_POLICY_KEYS, 'Policy create payload');

  return {
    code: normalizePolicyCode(input.code),
    title: normalizedString(input.title, 'title', 3, 200),
    version: normalizedString(input.version ?? '1.0', 'version', 1, 40),
    summary: normalizedString(input.summary, 'summary', 10, 4_000),
    scope: normalizedString(input.scope, 'scope', 3, 4_000),
    contentMarkdown: normalizedNullableString(input.contentMarkdown, 'contentMarkdown', 50_000),
    storagePath: normalizedStoragePath(input.storagePath),
    linkedControlIds: normalizedIdArray(input.linkedControlIds, 'linkedControlIds'),
    ownerId:
      input.ownerId === undefined || input.ownerId === null || input.ownerId === ''
        ? null
        : normalizePolicyDocumentId(input.ownerId, 'ownerId'),
  };
}

export function normalizeUpdatePolicyPayload(
  payload: unknown
): NormalizedUpdatePolicyPayload {
  const input = requirePlainObject(payload, 'Policy update payload');
  rejectUnknownKeys(input, UPDATE_POLICY_KEYS, 'Policy update payload');
  const policyId = normalizePolicyDocumentId(input.policyId, 'policyId');
  const normalized: NormalizedUpdatePolicyPayload = { policyId };

  if (Object.prototype.hasOwnProperty.call(input, 'code')) {
    normalized.code = normalizePolicyCode(input.code);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'title')) {
    normalized.title = normalizedString(input.title, 'title', 3, 200);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'version')) {
    normalized.version = normalizedString(input.version, 'version', 1, 40);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'summary')) {
    normalized.summary = normalizedString(input.summary, 'summary', 10, 4_000);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'scope')) {
    normalized.scope = normalizedString(input.scope, 'scope', 3, 4_000);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'contentMarkdown')) {
    normalized.contentMarkdown = normalizedNullableString(
      input.contentMarkdown,
      'contentMarkdown',
      50_000
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'storagePath')) {
    normalized.storagePath = normalizedStoragePath(input.storagePath);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'linkedControlIds')) {
    normalized.linkedControlIds = normalizedIdArray(input.linkedControlIds, 'linkedControlIds');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'ownerId')) {
    normalized.ownerId = normalizePolicyDocumentId(input.ownerId, 'ownerId');
  }
  if (Object.prototype.hasOwnProperty.call(input, 'nextReviewDate')) {
    normalized.nextReviewDate = normalizedIsoDate(input.nextReviewDate, 'nextReviewDate');
  }

  if (Object.keys(normalized).length === 1) {
    throw new HttpsError('invalid-argument', 'Policy update payload contains no changes.');
  }
  return normalized;
}

export function normalizePolicyTransitionPayload(
  payload: unknown,
  expectedTargetStatus?: PolicyStatus
): NormalizedPolicyTransitionPayload {
  const input = requirePlainObject(payload, 'Policy transition payload');
  rejectUnknownKeys(
    input,
    ['policyId', 'targetStatus', 'decisionNotes', 'reviewAssigneeId'],
    'Policy transition payload'
  );
  const targetStatus = normalizedStatus(input.targetStatus, 'targetStatus');
  if (expectedTargetStatus !== undefined && targetStatus !== expectedTargetStatus) {
    throw new HttpsError(
      'invalid-argument',
      `This command only accepts targetStatus '${expectedTargetStatus}'.`
    );
  }
  if (targetStatus === 'retired') {
    throw new HttpsError(
      'invalid-argument',
      'Use deleteTenantPolicy with an explicit retirement reason to retire a policy.'
    );
  }

  const decisionNotes = normalizedNullableString(input.decisionNotes, 'decisionNotes', 2_000);
  const reviewAssigneeId =
    input.reviewAssigneeId === undefined ||
    input.reviewAssigneeId === null ||
    input.reviewAssigneeId === ''
      ? null
      : normalizePolicyDocumentId(input.reviewAssigneeId, 'reviewAssigneeId');
  if (targetStatus === 'under_review' && reviewAssigneeId === null) {
    throw new HttpsError(
      'invalid-argument',
      'reviewAssigneeId is required when a policy enters review.'
    );
  }
  if (targetStatus !== 'under_review' && reviewAssigneeId !== null) {
    throw new HttpsError(
      'invalid-argument',
      'reviewAssigneeId is only accepted when targetStatus is under_review.'
    );
  }
  if (
    (targetStatus === 'draft' || targetStatus === 'approved') &&
    (!decisionNotes || decisionNotes.length < 10)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'decisionNotes must contain 10-2000 characters for this lifecycle decision.'
    );
  }

  return {
    policyId: normalizePolicyDocumentId(input.policyId, 'policyId'),
    targetStatus,
    decisionNotes,
    reviewAssigneeId,
  };
}

export function normalizeRetirePolicyPayload(
  payload: unknown
): NormalizedRetirePolicyPayload {
  const input = requirePlainObject(payload, 'Policy retirement payload');
  rejectUnknownKeys(input, ['policyId', 'retirementReason'], 'Policy retirement payload');
  return {
    policyId: normalizePolicyDocumentId(input.policyId, 'policyId'),
    retirementReason: normalizedString(
      input.retirementReason,
      'retirementReason',
      10,
      2_000
    ),
  };
}

export function assertLegalPolicyTransition(
  currentStatus: unknown,
  targetStatus: PolicyStatus
): asserts currentStatus is PolicyStatus {
  const current = normalizedStatus(currentStatus, 'Current policy status');
  if (!POLICY_LEGAL_TRANSITIONS[current].includes(targetStatus)) {
    throw new HttpsError(
      'failed-precondition',
      `Policy status cannot transition from '${current}' to '${targetStatus}'.`
    );
  }
}

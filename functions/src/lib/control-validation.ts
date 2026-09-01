import { HttpsError } from 'firebase-functions/v2/https';

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const CONTROL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

const CREATE_KEYS = [
  'code',
  'title',
  'description',
  'domain',
  'frameworkIds',
  'requirementIds',
  'enforcementMechanism',
  'reviewFrequencyDays',
  'ownerId',
  'implementationNotes',
] as const;

const UPDATE_KEYS = [
  'controlId',
  'code',
  'title',
  'description',
  'domain',
  'frameworkIds',
  'requirementIds',
  'status',
  'statusRationale',
  'enforcementMechanism',
  'reviewFrequencyDays',
  'ownerId',
  'implementationNotes',
] as const;

const REVIEW_KEYS = [
  'controlId',
  'effectiveness',
  'notes',
  'evidenceIds',
  'reviewAssigneeId',
  'testMethod',
  'testPeriodStart',
  'testPeriodEnd',
  'sampleSize',
  'exceptions',
] as const;

const REVIEW_DECISION_KEYS = [
  'controlId',
  'reviewId',
  'decision',
  'decisionNotes',
] as const;

const RETIRE_KEYS = ['controlId', 'retirementReason'] as const;

export type ControlEditableStatus =
  | 'not_started'
  | 'in_progress'
  | 'not_applicable';

export type ControlEnforcementMechanism =
  | 'automated'
  | 'manual'
  | 'policy'
  | 'hybrid';

export interface NormalizedCreateControlPayload {
  code: string;
  title: string;
  description: string;
  domain: string;
  frameworkIds: string[];
  requirementIds: string[];
  enforcementMechanism: ControlEnforcementMechanism;
  reviewFrequencyDays: number;
  ownerId: string | null;
  implementationNotes: string;
}

export interface NormalizedUpdateControlPayload {
  controlId: string;
  code?: string;
  title?: string;
  description?: string;
  domain?: string;
  frameworkIds?: string[];
  requirementIds?: string[];
  status?: ControlEditableStatus;
  statusRationale?: string;
  enforcementMechanism?: ControlEnforcementMechanism;
  reviewFrequencyDays?: number;
  ownerId?: string | null;
  implementationNotes?: string;
}

export interface NormalizedControlReviewPayload {
  controlId: string;
  effectiveness: 'effective' | 'ineffective' | 'needs_improvement';
  notes: string;
  evidenceIds: string[];
  reviewAssigneeId: string;
  testMethod: string;
  testPeriodStart: string | null;
  testPeriodEnd: string | null;
  sampleSize: number | null;
  exceptions: string;
}

export interface NormalizedControlReviewDecisionPayload {
  controlId: string;
  reviewId: string;
  decision: 'approved' | 'rejected';
  decisionNotes: string;
}

export interface NormalizedRetireControlPayload {
  controlId: string;
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
  if (UNSAFE_TEXT_PATTERN.test(normalized)) {
    throw new HttpsError(
      'invalid-argument',
      `${label} contains unsupported control or directional formatting characters.`
    );
  }
  return normalized;
}

function normalizedOptionalText(
  value: unknown,
  label: string,
  maximumLength: number
): string {
  if (value === undefined || value === null || value === '') return '';
  return normalizedString(value, label, 1, maximumLength);
}

export function normalizeControlDocumentId(value: unknown, label: string): string {
  const normalized = normalizedString(value, label, 1, 128);
  if (!DOCUMENT_ID_PATTERN.test(normalized)) {
    throw new HttpsError(
      'invalid-argument',
      `${label} is not a valid document identifier.`
    );
  }
  return normalized;
}

export function normalizeControlCode(value: unknown): string {
  const normalized = normalizedString(value, 'code', 2, 40).toUpperCase();
  if (!CONTROL_CODE_PATTERN.test(normalized)) {
    throw new HttpsError(
      'invalid-argument',
      'code may contain only letters, numbers, periods, underscores, and hyphens.'
    );
  }
  return normalized;
}

function normalizedIdArray(
  value: unknown,
  label: string,
  maximumLength: number,
  required: boolean
): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > maximumLength) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must be an array containing at most ${maximumLength} IDs.`
    );
  }
  const normalized = value.map((entry, index) =>
    normalizeControlDocumentId(entry, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must not contain duplicate IDs.`
    );
  }
  return normalized.sort((left, right) => left.localeCompare(right));
}

function normalizedEnforcementMechanism(value: unknown): ControlEnforcementMechanism {
  if (
    value !== 'automated' &&
    value !== 'manual' &&
    value !== 'policy' &&
    value !== 'hybrid'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'enforcementMechanism contains an unsupported value.'
    );
  }
  return value;
}

function normalizedReviewFrequency(value: unknown): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 1095) {
    throw new HttpsError(
      'invalid-argument',
      'reviewFrequencyDays must be a whole number from 1 to 1095.'
    );
  }
  return value as number;
}

function normalizedOptionalSampleSize(value: unknown): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 100_000) {
    throw new HttpsError(
      'invalid-argument',
      'sampleSize must be a whole number from 1 to 100000 when supplied.'
    );
  }
  return value as number;
}

function normalizedIsoTimestamp(value: unknown, label: string): string {
  const raw = normalizedString(value, label, 24, 24);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(raw)) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must be a canonical UTC ISO 8601 timestamp.`
    );
  }
  const parsed = Date.parse(raw);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== raw) {
    throw new HttpsError('invalid-argument', `${label} must be a valid timestamp.`);
  }
  return raw;
}

export function assertControlReviewDateIsReasonable(
  nextReviewDate: string,
  requestedAt: string
): void {
  const next = Date.parse(nextReviewDate);
  const requested = Date.parse(requestedAt);
  if (
    !Number.isFinite(next) ||
    !Number.isFinite(requested) ||
    next < requested + 24 * 60 * 60 * 1000 ||
    next > requested + 3 * 366 * 24 * 60 * 60 * 1000
  ) {
    throw new HttpsError(
      'invalid-argument',
      'nextReviewDate must be between one day and three years after the command.'
    );
  }
}

export function normalizeCreateControlPayload(
  payload: unknown
): NormalizedCreateControlPayload {
  const value = requirePlainObject(payload, 'Control create payload');
  rejectUnknownKeys(value, CREATE_KEYS, 'Control create payload');
  const frameworkIds = normalizedIdArray(
    value.frameworkIds,
    'frameworkIds',
    10,
    true
  );
  if (frameworkIds.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'frameworkIds must contain at least one adopted framework.'
    );
  }
  return {
    code: normalizeControlCode(value.code),
    title: normalizedString(value.title, 'title', 3, 200),
    description: normalizedString(value.description, 'description', 20, 10_000),
    domain: normalizedString(value.domain, 'domain', 2, 80),
    frameworkIds,
    requirementIds: normalizedIdArray(
      value.requirementIds,
      'requirementIds',
      20,
      false
    ),
    enforcementMechanism:
      value.enforcementMechanism === undefined
        ? 'manual'
        : normalizedEnforcementMechanism(value.enforcementMechanism),
    reviewFrequencyDays:
      value.reviewFrequencyDays === undefined
        ? 90
        : normalizedReviewFrequency(value.reviewFrequencyDays),
    ownerId:
      value.ownerId === undefined || value.ownerId === null || value.ownerId === ''
        ? null
        : normalizeControlDocumentId(value.ownerId, 'ownerId'),
    implementationNotes: normalizedOptionalText(
      value.implementationNotes,
      'implementationNotes',
      10_000
    ),
  };
}

export function normalizeUpdateControlPayload(
  payload: unknown
): NormalizedUpdateControlPayload {
  const value = requirePlainObject(payload, 'Control update payload');
  rejectUnknownKeys(value, UPDATE_KEYS, 'Control update payload');
  const normalized: NormalizedUpdateControlPayload = {
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
  };
  if (value.code !== undefined) normalized.code = normalizeControlCode(value.code);
  if (value.title !== undefined) {
    normalized.title = normalizedString(value.title, 'title', 3, 200);
  }
  if (value.description !== undefined) {
    normalized.description = normalizedString(value.description, 'description', 20, 10_000);
  }
  if (value.domain !== undefined) {
    normalized.domain = normalizedString(value.domain, 'domain', 2, 80);
  }
  if (value.frameworkIds !== undefined) {
    normalized.frameworkIds = normalizedIdArray(
      value.frameworkIds,
      'frameworkIds',
      10,
      true
    );
    if (normalized.frameworkIds.length === 0) {
      throw new HttpsError(
        'invalid-argument',
        'frameworkIds must contain at least one adopted framework.'
      );
    }
  }
  if (value.requirementIds !== undefined) {
    normalized.requirementIds = normalizedIdArray(
      value.requirementIds,
      'requirementIds',
      20,
      true
    );
  }
  if (value.status !== undefined) {
    if (
      value.status !== 'not_started' &&
      value.status !== 'in_progress' &&
      value.status !== 'not_applicable'
    ) {
      throw new HttpsError(
        'invalid-argument',
        'status may only be not_started, in_progress, or not_applicable; implementation assurance is review-derived.'
      );
    }
    normalized.status = value.status;
  }
  if (value.statusRationale !== undefined) {
    normalized.statusRationale = normalizedString(
      value.statusRationale,
      'statusRationale',
      10,
      2_000
    );
  }
  if (value.enforcementMechanism !== undefined) {
    normalized.enforcementMechanism = normalizedEnforcementMechanism(
      value.enforcementMechanism
    );
  }
  if (value.reviewFrequencyDays !== undefined) {
    normalized.reviewFrequencyDays = normalizedReviewFrequency(
      value.reviewFrequencyDays
    );
  }
  if (value.ownerId !== undefined) {
    normalized.ownerId =
      value.ownerId === null || value.ownerId === ''
        ? null
        : normalizeControlDocumentId(value.ownerId, 'ownerId');
  }
  if (value.implementationNotes !== undefined) {
    normalized.implementationNotes = normalizedOptionalText(
      value.implementationNotes,
      'implementationNotes',
      10_000
    );
  }
  if (Object.keys(normalized).length === 1) {
    throw new HttpsError(
      'invalid-argument',
      'Control update payload contains no changes.'
    );
  }
  if (normalized.status === 'not_applicable' && !normalized.statusRationale) {
    throw new HttpsError(
      'invalid-argument',
      'statusRationale is required when marking a control not applicable.'
    );
  }
  if (normalized.statusRationale && normalized.status !== 'not_applicable') {
    throw new HttpsError(
      'invalid-argument',
      'statusRationale is only accepted with status not_applicable.'
    );
  }
  return normalized;
}

export function normalizeControlReviewPayload(
  payload: unknown
): NormalizedControlReviewPayload {
  const value = requirePlainObject(payload, 'Control review payload');
  rejectUnknownKeys(value, REVIEW_KEYS, 'Control review payload');
  if (
    value.effectiveness !== 'effective' &&
    value.effectiveness !== 'ineffective' &&
    value.effectiveness !== 'needs_improvement'
  ) {
    throw new HttpsError(
      'invalid-argument',
      'effectiveness contains an unsupported value.'
    );
  }
  const evidenceIds = normalizedIdArray(value.evidenceIds, 'evidenceIds', 10, true);
  if (evidenceIds.length === 0) {
    throw new HttpsError(
      'invalid-argument',
      'evidenceIds must contain at least one server-verified evidence record.'
    );
  }
  const testPeriodStart =
    value.testPeriodStart === undefined || value.testPeriodStart === null
      ? null
      : normalizedIsoTimestamp(value.testPeriodStart, 'testPeriodStart');
  const testPeriodEnd =
    value.testPeriodEnd === undefined || value.testPeriodEnd === null
      ? null
      : normalizedIsoTimestamp(value.testPeriodEnd, 'testPeriodEnd');
  if ((testPeriodStart === null) !== (testPeriodEnd === null)) {
    throw new HttpsError(
      'invalid-argument',
      'testPeriodStart and testPeriodEnd must either both be supplied or both be omitted.'
    );
  }
  if (
    testPeriodStart !== null &&
    testPeriodEnd !== null &&
    Date.parse(testPeriodStart) > Date.parse(testPeriodEnd)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'testPeriodStart must not be later than testPeriodEnd.'
    );
  }
  return {
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
    effectiveness: value.effectiveness,
    notes: normalizedString(value.notes, 'notes', 20, 5_000),
    evidenceIds,
    reviewAssigneeId: normalizeControlDocumentId(
      value.reviewAssigneeId,
      'reviewAssigneeId'
    ),
    testMethod: normalizedString(value.testMethod, 'testMethod', 10, 2_000),
    testPeriodStart,
    testPeriodEnd,
    sampleSize: normalizedOptionalSampleSize(value.sampleSize),
    exceptions: normalizedOptionalText(value.exceptions, 'exceptions', 5_000),
  };
}

export function normalizeControlReviewDecisionPayload(
  payload: unknown
): NormalizedControlReviewDecisionPayload {
  const value = requirePlainObject(payload, 'Control review decision payload');
  rejectUnknownKeys(
    value,
    REVIEW_DECISION_KEYS,
    'Control review decision payload'
  );
  if (value.decision !== 'approved' && value.decision !== 'rejected') {
    throw new HttpsError(
      'invalid-argument',
      'decision must be approved or rejected.'
    );
  }
  return {
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
    reviewId: normalizeControlDocumentId(value.reviewId, 'reviewId'),
    decision: value.decision,
    decisionNotes: normalizedString(
      value.decisionNotes,
      'decisionNotes',
      20,
      5_000
    ),
  };
}

export function normalizeRetireControlPayload(
  payload: unknown
): NormalizedRetireControlPayload {
  const value = requirePlainObject(payload, 'Control retirement payload');
  rejectUnknownKeys(value, RETIRE_KEYS, 'Control retirement payload');
  return {
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
    retirementReason: normalizedString(
      value.retirementReason,
      'retirementReason',
      10,
      2_000
    ),
  };
}

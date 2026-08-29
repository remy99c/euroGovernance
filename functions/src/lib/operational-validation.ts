import { HttpsError } from 'firebase-functions/v2/https';
import type {
  IssueSeverity,
  IssueStatus,
  RiskStatus,
  TaskStatus,
} from '@eurogovernance/shared-types';

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const RECORD_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/;
const UNSAFE_TEXT_PATTERN =
  /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u;

const RISK_CATEGORIES = new Set([
  'legal_compliance',
  'security',
  'privacy',
  'ai_bias',
  'operational',
  'third_party',
]);
const RISK_STATUSES = new Set<RiskStatus>([
  'identified',
  'assessed',
  'mitigating',
  'accepted',
  'closed',
]);
const TREATMENT_STRATEGIES = new Set(['mitigate', 'accept', 'transfer', 'avoid']);
const ISSUE_SEVERITIES = new Set<IssueSeverity>(['low', 'medium', 'high', 'critical']);
const ISSUE_SOURCES = new Set([
  'audit',
  'risk_assessment',
  'incident',
  'manual_flag',
  'automated_test',
]);
const ISSUE_STATUSES = new Set<IssueStatus>([
  'open',
  'in_progress',
  'under_review',
  'resolved',
  'closed',
]);
const TASK_PARENT_TYPES = new Set([
  'control',
  'evidence',
  'policy',
  'risk',
  'issue',
  'dpia',
  'ai_system',
]);
const TASK_STATUSES = new Set<TaskStatus>([
  'todo',
  'in_progress',
  'blocked',
  'completed',
  'canceled',
]);

const CREATE_RISK_KEYS = [
  'code',
  'title',
  'description',
  'category',
  'inherentLikelihood',
  'inherentImpact',
  'residualLikelihood',
  'residualImpact',
  'treatmentStrategy',
  'treatmentPlan',
  'mitigatingControlIds',
  'affectedAssetIds',
  'processorProfileIds',
  'transferArrangementIds',
  'vendorIds',
  'ownerId',
] as const;
const UPDATE_RISK_KEYS = [
  'riskId',
  'title',
  'description',
  'category',
  'status',
  'inherentLikelihood',
  'inherentImpact',
  'residualLikelihood',
  'residualImpact',
  'treatmentStrategy',
  'treatmentPlan',
  'mitigatingControlIds',
  'affectedAssetIds',
  'processorProfileIds',
  'transferArrangementIds',
  'vendorIds',
  'ownerId',
] as const;
const LINK_RISK_KEYS = [
  'riskId',
  'processorProfileId',
  'transferArrangementId',
  'vendorId',
] as const;
const CREATE_ISSUE_KEYS = [
  'code',
  'title',
  'description',
  'severity',
  'source',
  'sourceEntityId',
  'sourceEntityType',
  'dueDate',
  'resolutionPlan',
  'ownerId',
] as const;
const UPDATE_ISSUE_KEYS = [
  'issueId',
  'title',
  'description',
  'severity',
  'status',
  'dueDate',
  'resolutionPlan',
  'ownerId',
] as const;
const CREATE_TASK_KEYS = [
  'title',
  'description',
  'parentEntityType',
  'parentEntityId',
  'assigneeId',
  'dueDate',
] as const;
const UPDATE_TASK_KEYS = [
  'taskId',
  'title',
  'description',
  'status',
  'assigneeId',
  'dueDate',
] as const;
const RETIRE_KEYS = ['entityId', 'retirementReason'] as const;
const SYNC_DERIVED_KEYS = ['processorProfileId'] as const;

type RiskCategory =
  | 'legal_compliance'
  | 'security'
  | 'privacy'
  | 'ai_bias'
  | 'operational'
  | 'third_party';
type TreatmentStrategy = 'mitigate' | 'accept' | 'transfer' | 'avoid';
type IssueSource =
  | 'audit'
  | 'risk_assessment'
  | 'incident'
  | 'manual_flag'
  | 'automated_test';
export type TaskParentEntityType =
  | 'control'
  | 'evidence'
  | 'policy'
  | 'risk'
  | 'issue'
  | 'dpia'
  | 'ai_system';

export interface NormalizedCreateRiskPayload {
  code: string;
  title: string;
  description: string;
  category: RiskCategory;
  inherentLikelihood: number;
  inherentImpact: number;
  residualLikelihood: number;
  residualImpact: number;
  treatmentStrategy: TreatmentStrategy;
  treatmentPlan: string;
  mitigatingControlIds: string[];
  affectedAssetIds: string[];
  processorProfileIds: string[];
  transferArrangementIds: string[];
  vendorIds: string[];
  ownerId: string | null;
}

export interface NormalizedUpdateRiskPayload {
  riskId: string;
  title?: string;
  description?: string;
  category?: RiskCategory;
  status?: RiskStatus;
  inherentLikelihood?: number;
  inherentImpact?: number;
  residualLikelihood?: number;
  residualImpact?: number;
  treatmentStrategy?: TreatmentStrategy;
  treatmentPlan?: string;
  mitigatingControlIds?: string[];
  affectedAssetIds?: string[];
  processorProfileIds?: string[];
  transferArrangementIds?: string[];
  vendorIds?: string[];
  ownerId?: string;
}

export interface NormalizedLinkRiskPayload {
  riskId: string;
  processorProfileId: string | null;
  transferArrangementId: string | null;
  vendorId: string | null;
}

export interface NormalizedCreateIssuePayload {
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  source: IssueSource;
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  dueDate: string;
  resolutionPlan: string;
  ownerId: string | null;
}

export interface NormalizedUpdateIssuePayload {
  issueId: string;
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  dueDate?: string;
  resolutionPlan?: string;
  ownerId?: string;
}

export interface NormalizedCreateTaskPayload {
  title: string;
  description: string;
  parentEntityType: TaskParentEntityType;
  parentEntityId: string;
  assigneeId: string | null;
  dueDate: string;
}

export interface NormalizedUpdateTaskPayload {
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
}

export interface NormalizedRetireOperationalPayload {
  entityId: string;
  retirementReason: string;
}

export interface NormalizedSyncDerivedRiskPayload {
  processorProfileId: string;
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

function optionalText(value: unknown, label: string, maximumLength: number): string {
  if (value === undefined || value === null || value === '') return '';
  return normalizedString(value, label, 1, maximumLength);
}

export function normalizeOperationalDocumentId(value: unknown, label: string): string {
  const normalized = normalizedString(value, label, 1, 128);
  if (!DOCUMENT_ID_PATTERN.test(normalized)) {
    throw new HttpsError('invalid-argument', `${label} is not a valid document identifier.`);
  }
  return normalized;
}

function normalizedCode(value: unknown): string {
  const normalized = normalizedString(value, 'code', 2, 40).toUpperCase();
  if (!RECORD_CODE_PATTERN.test(normalized)) {
    throw new HttpsError(
      'invalid-argument',
      'code may contain only letters, numbers, periods, underscores, and hyphens.'
    );
  }
  return normalized;
}

function scoreInput(value: unknown, label: string): number {
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > 5) {
    throw new HttpsError('invalid-argument', `${label} must be a whole number from 1 to 5.`);
  }
  return value as number;
}

function idArray(value: unknown, label: string, required = false): string[] {
  if (value === undefined && !required) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError('invalid-argument', `${label} must contain at most 50 IDs.`);
  }
  const normalized = value.map((entry, index) =>
    normalizeOperationalDocumentId(entry, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError('invalid-argument', `${label} must not contain duplicate IDs.`);
  }
  return normalized;
}

function normalizedDate(value: unknown, label: string): string {
  const raw = normalizedString(value, label, 10, 24);
  const canonical = /^\d{4}-\d{2}-\d{2}$/u.test(raw)
    ? `${raw}T00:00:00.000Z`
    : raw;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(canonical)) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must be a date or canonical UTC ISO 8601 timestamp.`
    );
  }
  const parsed = Date.parse(canonical);
  if (!Number.isFinite(parsed) || new Date(parsed).toISOString() !== canonical) {
    throw new HttpsError('invalid-argument', `${label} must be a valid calendar date.`);
  }
  return canonical;
}

function optionalId(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizeOperationalDocumentId(value, label);
}

function enumValue<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new HttpsError('invalid-argument', `${label} contains an unsupported value.`);
  }
  return value as T;
}

export function assertOperationalDueDateIsReasonable(
  dueDate: string,
  requestedAt: string
): void {
  const due = Date.parse(dueDate);
  const requested = Date.parse(requestedAt);
  if (
    !Number.isFinite(due) ||
    !Number.isFinite(requested) ||
    due < requested - 24 * 60 * 60 * 1000 ||
    due > requested + 10 * 366 * 24 * 60 * 60 * 1000
  ) {
    throw new HttpsError(
      'invalid-argument',
      'dueDate must be between yesterday and ten years after the command.'
    );
  }
}

export const RISK_LEGAL_TRANSITIONS: Readonly<Record<RiskStatus, readonly RiskStatus[]>> =
  Object.freeze({
    identified: ['assessed', 'mitigating', 'accepted'],
    assessed: ['mitigating', 'accepted'],
    mitigating: ['assessed', 'accepted', 'closed'],
    accepted: ['assessed', 'mitigating', 'closed'],
    closed: [],
  });

export const ISSUE_LEGAL_TRANSITIONS: Readonly<Record<IssueStatus, readonly IssueStatus[]>> =
  Object.freeze({
    open: ['in_progress', 'under_review'],
    in_progress: ['under_review'],
    under_review: ['in_progress', 'resolved'],
    resolved: ['in_progress', 'closed'],
    closed: [],
  });

export const TASK_LEGAL_TRANSITIONS: Readonly<Record<TaskStatus, readonly TaskStatus[]>> =
  Object.freeze({
    todo: ['in_progress', 'blocked', 'canceled'],
    in_progress: ['blocked', 'completed', 'canceled'],
    blocked: ['in_progress', 'canceled'],
    completed: [],
    canceled: [],
  });

export function assertOperationalTransition<T extends string>(
  current: T,
  target: T,
  transitions: Readonly<Record<T, readonly T[]>>,
  label: string
): void {
  if (current === target) {
    throw new HttpsError('failed-precondition', `${label} is already ${target}.`);
  }
  if (!transitions[current]?.includes(target)) {
    throw new HttpsError(
      'failed-precondition',
      `Illegal ${label} transition from ${current} to ${target}.`
    );
  }
}

export function normalizeCreateRiskPayload(payload: unknown): NormalizedCreateRiskPayload {
  const value = requirePlainObject(payload, 'Risk create payload');
  rejectUnknownKeys(value, CREATE_RISK_KEYS, 'Risk create payload');
  const inherentLikelihood = scoreInput(value.inherentLikelihood, 'inherentLikelihood');
  const inherentImpact = scoreInput(value.inherentImpact, 'inherentImpact');
  return {
    code: normalizedCode(value.code),
    title: normalizedString(value.title, 'title', 3, 200),
    description: normalizedString(value.description, 'description', 1, 10_000),
    category: enumValue(value.category, RISK_CATEGORIES, 'category') as RiskCategory,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood:
      value.residualLikelihood === undefined
        ? inherentLikelihood
        : scoreInput(value.residualLikelihood, 'residualLikelihood'),
    residualImpact:
      value.residualImpact === undefined
        ? inherentImpact
        : scoreInput(value.residualImpact, 'residualImpact'),
    treatmentStrategy:
      value.treatmentStrategy === undefined
        ? 'mitigate'
        : (enumValue(
            value.treatmentStrategy,
            TREATMENT_STRATEGIES,
            'treatmentStrategy'
          ) as TreatmentStrategy),
    treatmentPlan: optionalText(value.treatmentPlan, 'treatmentPlan', 10_000),
    mitigatingControlIds: idArray(value.mitigatingControlIds, 'mitigatingControlIds'),
    affectedAssetIds: idArray(value.affectedAssetIds, 'affectedAssetIds'),
    processorProfileIds: idArray(value.processorProfileIds, 'processorProfileIds'),
    transferArrangementIds: idArray(
      value.transferArrangementIds,
      'transferArrangementIds'
    ),
    vendorIds: idArray(value.vendorIds, 'vendorIds'),
    ownerId: optionalId(value.ownerId, 'ownerId'),
  };
}

export function normalizeUpdateRiskPayload(payload: unknown): NormalizedUpdateRiskPayload {
  const value = requirePlainObject(payload, 'Risk update payload');
  rejectUnknownKeys(value, UPDATE_RISK_KEYS, 'Risk update payload');
  const normalized: NormalizedUpdateRiskPayload = {
    riskId: normalizeOperationalDocumentId(value.riskId, 'riskId'),
  };
  if (value.title !== undefined) normalized.title = normalizedString(value.title, 'title', 3, 200);
  if (value.description !== undefined) {
    normalized.description = normalizedString(value.description, 'description', 1, 10_000);
  }
  if (value.category !== undefined) {
    normalized.category = enumValue(value.category, RISK_CATEGORIES, 'category') as RiskCategory;
  }
  if (value.status !== undefined) normalized.status = enumValue(value.status, RISK_STATUSES, 'status');
  for (const field of [
    'inherentLikelihood',
    'inherentImpact',
    'residualLikelihood',
    'residualImpact',
  ] as const) {
    if (value[field] !== undefined) normalized[field] = scoreInput(value[field], field);
  }
  if (value.treatmentStrategy !== undefined) {
    normalized.treatmentStrategy = enumValue(
      value.treatmentStrategy,
      TREATMENT_STRATEGIES,
      'treatmentStrategy'
    ) as TreatmentStrategy;
  }
  if (value.treatmentPlan !== undefined) {
    normalized.treatmentPlan = optionalText(value.treatmentPlan, 'treatmentPlan', 10_000);
  }
  for (const field of [
    'mitigatingControlIds',
    'affectedAssetIds',
    'processorProfileIds',
    'transferArrangementIds',
    'vendorIds',
  ] as const) {
    if (value[field] !== undefined) normalized[field] = idArray(value[field], field, true);
  }
  if (value.ownerId !== undefined) {
    normalized.ownerId = normalizeOperationalDocumentId(value.ownerId, 'ownerId');
  }
  if (Object.keys(normalized).length === 1) {
    throw new HttpsError('invalid-argument', 'Risk update payload contains no changes.');
  }
  return normalized;
}

export function normalizeLinkRiskPayload(payload: unknown): NormalizedLinkRiskPayload {
  const value = requirePlainObject(payload, 'Risk link payload');
  rejectUnknownKeys(value, LINK_RISK_KEYS, 'Risk link payload');
  const normalized = {
    riskId: normalizeOperationalDocumentId(value.riskId, 'riskId'),
    processorProfileId: optionalId(value.processorProfileId, 'processorProfileId'),
    transferArrangementId: optionalId(value.transferArrangementId, 'transferArrangementId'),
    vendorId: optionalId(value.vendorId, 'vendorId'),
  };
  if (!normalized.processorProfileId && !normalized.transferArrangementId && !normalized.vendorId) {
    throw new HttpsError('invalid-argument', 'At least one relationship ID is required.');
  }
  return normalized;
}

export function normalizeCreateIssuePayload(payload: unknown): NormalizedCreateIssuePayload {
  const value = requirePlainObject(payload, 'Issue create payload');
  rejectUnknownKeys(value, CREATE_ISSUE_KEYS, 'Issue create payload');
  const sourceEntityId = optionalId(value.sourceEntityId, 'sourceEntityId');
  const sourceEntityType =
    value.sourceEntityType === undefined || value.sourceEntityType === null || value.sourceEntityType === ''
      ? null
      : normalizedString(value.sourceEntityType, 'sourceEntityType', 2, 80);
  if ((sourceEntityId === null) !== (sourceEntityType === null)) {
    throw new HttpsError(
      'invalid-argument',
      'sourceEntityId and sourceEntityType must either both be supplied or both be null.'
    );
  }
  return {
    code: normalizedCode(value.code),
    title: normalizedString(value.title, 'title', 3, 200),
    description: normalizedString(value.description, 'description', 1, 10_000),
    severity: enumValue(value.severity, ISSUE_SEVERITIES, 'severity'),
    source: enumValue(value.source, ISSUE_SOURCES, 'source') as IssueSource,
    sourceEntityId,
    sourceEntityType,
    dueDate: normalizedDate(value.dueDate, 'dueDate'),
    resolutionPlan: optionalText(value.resolutionPlan, 'resolutionPlan', 10_000),
    ownerId: optionalId(value.ownerId, 'ownerId'),
  };
}

export function normalizeUpdateIssuePayload(payload: unknown): NormalizedUpdateIssuePayload {
  const value = requirePlainObject(payload, 'Issue update payload');
  rejectUnknownKeys(value, UPDATE_ISSUE_KEYS, 'Issue update payload');
  const normalized: NormalizedUpdateIssuePayload = {
    issueId: normalizeOperationalDocumentId(value.issueId, 'issueId'),
  };
  if (value.title !== undefined) normalized.title = normalizedString(value.title, 'title', 3, 200);
  if (value.description !== undefined) {
    normalized.description = normalizedString(value.description, 'description', 1, 10_000);
  }
  if (value.severity !== undefined) {
    normalized.severity = enumValue(value.severity, ISSUE_SEVERITIES, 'severity');
  }
  if (value.status !== undefined) normalized.status = enumValue(value.status, ISSUE_STATUSES, 'status');
  if (value.dueDate !== undefined) normalized.dueDate = normalizedDate(value.dueDate, 'dueDate');
  if (value.resolutionPlan !== undefined) {
    normalized.resolutionPlan = optionalText(value.resolutionPlan, 'resolutionPlan', 10_000);
  }
  if (value.ownerId !== undefined) {
    normalized.ownerId = normalizeOperationalDocumentId(value.ownerId, 'ownerId');
  }
  if (Object.keys(normalized).length === 1) {
    throw new HttpsError('invalid-argument', 'Issue update payload contains no changes.');
  }
  return normalized;
}

export function normalizeCreateTaskPayload(payload: unknown): NormalizedCreateTaskPayload {
  const value = requirePlainObject(payload, 'Task create payload');
  rejectUnknownKeys(value, CREATE_TASK_KEYS, 'Task create payload');
  return {
    title: normalizedString(value.title, 'title', 3, 200),
    description: normalizedString(value.description, 'description', 1, 10_000),
    parentEntityType: enumValue(
      value.parentEntityType,
      TASK_PARENT_TYPES,
      'parentEntityType'
    ) as TaskParentEntityType,
    parentEntityId: normalizeOperationalDocumentId(value.parentEntityId, 'parentEntityId'),
    assigneeId: optionalId(value.assigneeId, 'assigneeId'),
    dueDate: normalizedDate(value.dueDate, 'dueDate'),
  };
}

export function normalizeUpdateTaskPayload(payload: unknown): NormalizedUpdateTaskPayload {
  const value = requirePlainObject(payload, 'Task update payload');
  rejectUnknownKeys(value, UPDATE_TASK_KEYS, 'Task update payload');
  const normalized: NormalizedUpdateTaskPayload = {
    taskId: normalizeOperationalDocumentId(value.taskId, 'taskId'),
  };
  if (value.title !== undefined) normalized.title = normalizedString(value.title, 'title', 3, 200);
  if (value.description !== undefined) {
    normalized.description = normalizedString(value.description, 'description', 1, 10_000);
  }
  if (value.status !== undefined) normalized.status = enumValue(value.status, TASK_STATUSES, 'status');
  if (value.assigneeId !== undefined) {
    normalized.assigneeId = normalizeOperationalDocumentId(value.assigneeId, 'assigneeId');
  }
  if (value.dueDate !== undefined) normalized.dueDate = normalizedDate(value.dueDate, 'dueDate');
  if (Object.keys(normalized).length === 1) {
    throw new HttpsError('invalid-argument', 'Task update payload contains no changes.');
  }
  return normalized;
}

export function normalizeRetireOperationalPayload(
  payload: unknown
): NormalizedRetireOperationalPayload {
  const value = requirePlainObject(payload, 'Operational retirement payload');
  rejectUnknownKeys(value, RETIRE_KEYS, 'Operational retirement payload');
  return {
    entityId: normalizeOperationalDocumentId(value.entityId, 'entityId'),
    retirementReason: normalizedString(
      value.retirementReason,
      'retirementReason',
      10,
      2_000
    ),
  };
}

export function normalizeSyncDerivedRiskPayload(
  payload: unknown
): NormalizedSyncDerivedRiskPayload {
  const value = requirePlainObject(payload, 'Derived-risk synchronization payload');
  rejectUnknownKeys(value, SYNC_DERIVED_KEYS, 'Derived-risk synchronization payload');
  return {
    processorProfileId: normalizeOperationalDocumentId(
      value.processorProfileId,
      'processorProfileId'
    ),
  };
}

import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import type {
  DocumentReference,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import {
  isValidUserRole,
  type AuditActionType,
  type Control,
  type ControlImplementationStatus,
  type Evidence,
  type TenantMembership,
  type UserRole,
} from '@eurogovernance/shared-types';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  AUTHORITATIVE_CALLABLE_OPTIONS,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CURRENT_COMMAND_ENVELOPE_VERSION,
  executeTenantCommand,
  stableTrustedValueHash,
  type TenantCommandEnvelope,
} from '../lib/command-boundary.js';
import {
  normalizeControlDocumentId,
  normalizeCreateControlPayload,
  normalizeUpdateControlPayload,
  normalizeControlReviewPayload,
  normalizeControlReviewDecisionPayload,
  normalizeRetireControlPayload,
  type NormalizedCreateControlPayload,
  type NormalizedUpdateControlPayload,
  type NormalizedControlReviewPayload,
  type NormalizedControlReviewDecisionPayload,
  type NormalizedRetireControlPayload,
} from '../lib/control-validation.js';

export type CreateControlInput = TenantCommandEnvelope;
export type UpdateControlInput = TenantCommandEnvelope;
export type DeleteControlInput = TenantCommandEnvelope;
export type RecordControlReviewInput = TenantCommandEnvelope;
export type DecideControlReviewInput = TenantCommandEnvelope;

const CONTROL_WORKFLOW_SCHEMA_VERSION = 1;
const CONTROL_VERSION_SCHEMA_VERSION = 2;
const CONTROL_REVIEW_SCHEMA_VERSION = 1;
const CONTROL_REVIEW_EVENT_SCHEMA_VERSION = 1;
const CONTROL_COMMAND_VERSION = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_HISTORY_PAGE_SIZE = 50;
const MAX_REVIEWERS = 500;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CONTROL_STATUSES = new Set<ControlImplementationStatus>([
  'not_started',
  'in_progress',
  'implemented',
  'partially_implemented',
  'not_applicable',
]);
const CONTROL_OWNER_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
  'contributor',
]);
const CONTROL_REVIEWER_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
  'approver',
]);
const FULL_CONTROL_READ_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
  'auditor',
  'approver',
]);

interface EvidenceAnchor {
  evidenceId: string;
  evidenceVersion: number;
  evidenceCreatedBy: string;
  evidenceReviewedBy: string;
  evidenceReviewedAt: string;
  storagePath: string;
  storageGeneration: string;
  fileHashSha256: string;
  fileSizeBytes: number;
  mimeType: string;
  objectVerifiedAt: string;
  reviewDueDate: string | null;
}

interface GovernedControlRecord extends Control {
  revision?: number;
  workflowSchemaVersion?: number;
  pendingReviewId?: string | null;
  pendingReviewAssigneeId?: string | null;
  lastReviewId?: string | null;
  lastReviewCommandId?: string | null;
  lastReviewEffectiveness?: 'effective' | 'ineffective' | 'needs_improvement' | null;
  lastReviewEvidenceIds?: string[];
  implementationContributorIds?: string[];
  statusRationale?: string | null;
  statusDecidedBy?: string | null;
  statusDecidedAt?: string | null;
  assuranceInvalidatedAt?: string | null;
  assuranceInvalidatedBy?: string | null;
  retiredAt?: string | null;
  retiredBy?: string | null;
  retirementReason?: string | null;
}

interface GovernedControlReview {
  schemaVersion: number;
  id: string;
  tenantId: string;
  controlId: string;
  status: 'pending_approval' | 'approved' | 'rejected';
  effectiveness: 'effective' | 'ineffective' | 'needs_improvement';
  notes: string;
  testMethod: string;
  testPeriodStart: string | null;
  testPeriodEnd: string | null;
  sampleSize: number | null;
  exceptions: string;
  evidenceIds: string[];
  evidenceAnchors: EvidenceAnchor[];
  assignedReviewerId: string;
  assignedReviewerRole: UserRole;
  reviewerId: string | null;
  reviewerRole: UserRole | null;
  submittedBy: string;
  submittedAt: string;
  submissionCommandId: string;
  reviewedControlRevision: number;
  reviewedStateHash: string;
  reviewedVersionArtifactHash: string;
  resultingControlRevision: number;
  implementationContributorIds: string[];
  decision: 'approved' | 'rejected' | null;
  decisionNotes: string | null;
  decisionCommandId: string | null;
  decidedBy: string | null;
  reviewedAt: string | null;
}

interface VersionAnchor {
  versionId: string | null;
  stateHash: string | null;
  artifactHash: string | null;
  commandId: string | null;
  recordedBy: string | null;
  recordedAt: string | null;
  captureLegacyBaseline: boolean;
}

function invalidateSummaryMetrics(
  transaction: Transaction,
  tenantId: string
): void {
  transaction.delete(
    db.doc(`tenants/${tenantId}/summary_metrics/current`)
  );
}

export interface ControlTrustResult {
  workflowTrusted: boolean;
  assuranceTrusted: boolean;
  assuranceReason:
    | 'authoritative'
    | 'not_required'
    | 'expired'
    | 'evidence_unverified'
    | 'review_unverified'
    | 'workflow_unverified';
}

interface ListControlsInput {
  tenantId: string;
  frameworkId?: string;
  status?: ControlImplementationStatus;
  domain?: string;
  ownerId?: string;
  pageSize?: number;
  cursor?: string;
}

interface GetControlInput {
  tenantId: string;
  controlId: string;
}

interface GetControlHistoryInput extends GetControlInput {
  pageSize?: number;
  cursorRevision?: number;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonical<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * 24 * 60 * 60 * 1_000).toISOString();
}

function deterministicDocumentId(namespace: string, commandId: string): string {
  return `${namespace}_${createHash('sha256')
    .update(`${namespace}:${commandId}`, 'utf8')
    .digest('hex')
    .slice(0, 32)}`;
}

function controlRevision(control: GovernedControlRecord): number {
  const revision = control.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new HttpsError(
      'failed-precondition',
      'Control revision metadata is invalid and must be repaired before mutation.'
    );
  }
  return revision;
}

function controlVersionId(revision: number): string {
  return `r${String(revision).padStart(10, '0')}`;
}

function controlCodeReservationId(code: string): string {
  return stableTrustedValueHash({ code }, 'control code reservation key');
}

function assertControlIdentity(
  control: GovernedControlRecord,
  tenantId: string,
  controlId: string
): void {
  if (control.id !== controlId || control.tenantId !== tenantId) {
    throw new HttpsError(
      'failed-precondition',
      'Control identity metadata does not match its authoritative path.'
    );
  }
}

function changedControlFields(
  before: GovernedControlRecord | null,
  after: GovernedControlRecord
): string[] {
  if (!before) return Object.keys(after).sort();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(before[key as keyof GovernedControlRecord]) !==
        JSON.stringify(after[key as keyof GovernedControlRecord])
    )
    .sort();
}

function controlVersionArtifactHash(version: Record<string, unknown>): string {
  const { artifactHash: _ignored, ...artifact } = version;
  return stableTrustedValueHash(artifact, 'control version artifact');
}

async function preparePriorControlVersion(
  transaction: Transaction,
  controlRef: DocumentReference,
  previous: GovernedControlRecord | null
): Promise<VersionAnchor> {
  if (!previous) {
    return {
      versionId: null,
      stateHash: null,
      artifactHash: null,
      commandId: null,
      recordedBy: null,
      recordedAt: null,
      captureLegacyBaseline: false,
    };
  }
  const state = canonical(previous);
  const revision = controlRevision(state);
  const id = controlVersionId(revision);
  const stateHash = stableTrustedValueHash(state, 'previous control state');
  const snapshot = await transaction.get(controlRef.collection('versions').doc(id));
  if (!snapshot.exists) {
    if (revision !== 0) {
      throw new HttpsError(
        'failed-precondition',
        'The prior immutable control version is missing; mutation is blocked to preserve continuity.'
      );
    }
    return {
      versionId: id,
      stateHash,
      artifactHash: null,
      commandId: null,
      recordedBy: null,
      recordedAt: null,
      captureLegacyBaseline: true,
    };
  }
  const version = snapshot.data();
  let storedStateHash = '';
  let storedArtifactHash = '';
  try {
    storedStateHash = stableTrustedValueHash(version?.state, 'stored control version state');
    storedArtifactHash = controlVersionArtifactHash(version as Record<string, unknown>);
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'The prior immutable control version is invalid.'
    );
  }
  const chainValid =
    revision === 0
      ? version?.previousVersionId === null &&
        version?.previousStateHash === null &&
        version?.previousArtifactHash === null &&
        version?.commandId === null &&
        version?.provenance === 'legacy_baseline_captured_on_first_command'
      : revision === 1
        ? ((version?.previousVersionId === null &&
              version?.previousStateHash === null &&
              version?.previousArtifactHash === null) ||
            (version?.previousVersionId === controlVersionId(0) &&
              typeof version?.previousStateHash === 'string' &&
              SHA256_PATTERN.test(version.previousStateHash) &&
              typeof version?.previousArtifactHash === 'string' &&
              SHA256_PATTERN.test(version.previousArtifactHash))) &&
          typeof version?.commandId === 'string'
        : version?.previousVersionId === controlVersionId(revision - 1) &&
          typeof version?.previousStateHash === 'string' &&
          SHA256_PATTERN.test(version.previousStateHash) &&
          typeof version?.previousArtifactHash === 'string' &&
          SHA256_PATTERN.test(version.previousArtifactHash) &&
          typeof version?.commandId === 'string';
  let previousLinkValid = true;
  if (
    revision > 0 &&
    typeof version?.previousVersionId === 'string' &&
    typeof version?.previousStateHash === 'string' &&
    typeof version?.previousArtifactHash === 'string'
  ) {
    const previousSnapshot = await transaction.get(
      controlRef.collection('versions').doc(version.previousVersionId)
    );
    const previousVersion = previousSnapshot.data();
    previousLinkValid = Boolean(
      previousSnapshot.exists &&
        isPlainRecord(previousVersion) &&
        previousVersion.id === version.previousVersionId &&
        previousVersion.tenantId === previous.tenantId &&
        previousVersion.controlId === controlRef.id &&
        previousVersion.revision === revision - 1 &&
        previousVersion.stateHash === version.previousStateHash &&
        previousVersion.artifactHash === version.previousArtifactHash &&
        controlVersionArtifactHash(previousVersion) === previousVersion.artifactHash &&
        stableTrustedValueHash(
          previousVersion.state,
          'previous linked control version state'
        ) === previousVersion.stateHash
    );
  }
  if (
    !isPlainRecord(version) ||
    version.schemaVersion !== CONTROL_VERSION_SCHEMA_VERSION ||
    version.id !== id ||
    version.tenantId !== previous.tenantId ||
    version.controlId !== controlRef.id ||
    version.revision !== revision ||
    version.stateHash !== stateHash ||
    storedStateHash !== stateHash ||
    version.artifactHash !== storedArtifactHash ||
    !chainValid ||
    !previousLinkValid ||
    !Array.isArray(version.changedFields) ||
    version.changedFields.some((field) => typeof field !== 'string')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The prior immutable control version diverges from current state; mutation is blocked.'
    );
  }
  return {
    versionId: id,
    stateHash,
    artifactHash: storedArtifactHash,
    commandId: typeof version.commandId === 'string' ? version.commandId : null,
    recordedBy: typeof version.recordedBy === 'string' ? version.recordedBy : null,
    recordedAt: typeof version.recordedAt === 'string' ? version.recordedAt : null,
    captureLegacyBaseline: false,
  };
}

function writeControlVersion(
  transaction: Transaction,
  controlRef: DocumentReference,
  control: GovernedControlRecord,
  previous: GovernedControlRecord | null,
  priorAnchor: VersionAnchor,
  actorId: string,
  commandId: string,
  recordedAt: string
): {
  versionId: string;
  stateHash: string;
  artifactHash: string;
  changedFields: string[];
} {
  const state = canonical(control);
  const previousState = previous ? canonical(previous) : null;
  const revision = controlRevision(state);
  const id = controlVersionId(revision);
  const stateHash = stableTrustedValueHash(state, 'control state');
  const changedFields = changedControlFields(previousState, state);
  let previousArtifactHash = priorAnchor.artifactHash;
  if (previousState && priorAnchor.captureLegacyBaseline) {
    const baselineId = controlVersionId(0);
    const baselineArtifact: Record<string, unknown> = {
      schemaVersion: CONTROL_VERSION_SCHEMA_VERSION,
      id: baselineId,
      tenantId: control.tenantId,
      controlId: control.id,
      revision: 0,
      state: previousState,
      stateHash: stableTrustedValueHash(previousState, 'legacy control baseline state'),
      previousVersionId: null,
      previousStateHash: null,
      previousArtifactHash: null,
      changedFields: Object.keys(previousState).sort(),
      commandId: null,
      capturedByCommandId: commandId,
      capturedBy: actorId,
      recordedBy: null,
      recordedAt,
      provenance: 'legacy_baseline_captured_on_first_command',
    };
    const baselineArtifactHash = controlVersionArtifactHash(baselineArtifact);
    transaction.create(controlRef.collection('versions').doc(baselineId), {
      ...baselineArtifact,
      artifactHash: baselineArtifactHash,
    });
    previousArtifactHash = baselineArtifactHash;
  }
  const versionArtifact: Record<string, unknown> = {
    schemaVersion: CONTROL_VERSION_SCHEMA_VERSION,
    id,
    tenantId: control.tenantId,
    controlId: control.id,
    revision,
    state,
    stateHash,
    previousVersionId: priorAnchor.versionId,
    previousStateHash: priorAnchor.stateHash,
    previousArtifactHash,
    changedFields,
    commandId,
    recordedBy: actorId,
    recordedAt,
    provenance: previous ? 'governed_command' : 'governed_creation',
  };
  const artifactHash = controlVersionArtifactHash(versionArtifact);
  transaction.create(controlRef.collection('versions').doc(id), {
    ...versionArtifact,
    artifactHash,
  });
  return { versionId: id, stateHash, artifactHash, changedFields };
}

function controlAuditSummary(
  control: GovernedControlRecord,
  version: {
    versionId: string | null;
    stateHash: string | null;
    artifactHash: string | null;
    changedFields?: string[];
  }
): Record<string, unknown> {
  return {
    id: control.id,
    code: control.code,
    title: control.title,
    status: control.status,
    healthScore: control.healthScore,
    ownerId: control.ownerId,
    frameworkIds: control.frameworkIds,
    requirementCount: control.requirementIds.length,
    pendingReviewId: control.pendingReviewId ?? null,
    lastReviewId: control.lastReviewId ?? null,
    retiredAt: control.retiredAt ?? null,
    revision: controlRevision(control),
    versionId: version.versionId,
    stateHash: version.stateHash,
    versionArtifactHash: version.artifactHash,
    changedFields: version.changedFields ?? [],
  };
}

function contributorIds(control: GovernedControlRecord): string[] {
  const inferred = [control.createdBy, control.updatedBy].filter(
    (value): value is string => typeof value === 'string' && value.length > 0
  );
  const raw =
    control.workflowSchemaVersion === CONTROL_WORKFLOW_SCHEMA_VERSION &&
    control.implementationContributorIds !== undefined
      ? control.implementationContributorIds
      : inferred;
  if (
    !Array.isArray(raw) ||
    raw.length > 100 ||
    raw.some((value) => typeof value !== 'string')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Control contributor metadata must be repaired before mutation.'
    );
  }
  const normalized = raw.map((value, index) =>
    normalizeControlDocumentId(value, `Persisted implementationContributorIds[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError(
      'failed-precondition',
      'Control contributor metadata contains duplicates.'
    );
  }
  return normalized;
}

function timestampWithinCommandWindow(earlier: unknown, later: unknown): boolean {
  if (typeof earlier !== 'string' || typeof later !== 'string') return false;
  const first = Date.parse(earlier);
  const second = Date.parse(later);
  return (
    Number.isFinite(first) &&
    Number.isFinite(second) &&
    first <= second &&
    second - first <= 5 * 60 * 1_000
  );
}

function controlReceiptResultMatches(
  value: unknown,
  controlId: string,
  revision: number
): boolean {
  return (
    isPlainRecord(value) &&
    value.success === true &&
    value.controlId === controlId &&
    value.revision === revision
  );
}

function controlAuditAfterSummaryMatches(
  value: unknown,
  controlId: string,
  revision: number,
  versionId: string,
  stateHash: string,
  artifactHash: string
): boolean {
  return (
    isPlainRecord(value) &&
    value.id === controlId &&
    value.revision === revision &&
    value.versionId === versionId &&
    value.stateHash === stateHash &&
    value.versionArtifactHash === artifactHash
  );
}

interface ControlCodeReservationPlan {
  apply: (transaction: Transaction) => void;
}

async function prepareControlCodeReservation(
  transaction: Transaction,
  tenantId: string,
  controlId: string,
  code: string,
  previousCode: string | null,
  actorId: string,
  recordedAt: string
): Promise<ControlCodeReservationPlan> {
  const collection = db.collection(`tenants/${tenantId}/control_code_reservations`);
  const id = controlCodeReservationId(code);
  const reservationRef = collection.doc(id);
  const reservationSnapshot = await transaction.get(reservationRef);
  const reservation = reservationSnapshot.data();
  if (
    reservationSnapshot.exists &&
    (reservation?.schemaVersion !== 1 ||
      reservation?.id !== id ||
      reservation?.tenantId !== tenantId ||
      reservation?.controlId !== controlId ||
      reservation?.code !== code)
  ) {
    throw new HttpsError('already-exists', `Control code '${code}' is already reserved.`);
  }
  const duplicates = await transaction.get(
    db.collection(`tenants/${tenantId}/controls`).where('code', '==', code).limit(2)
  );
  if (duplicates.docs.some((document) => document.id !== controlId)) {
    throw new HttpsError('already-exists', `A control with code '${code}' already exists.`);
  }

  let previousReservationRef: DocumentReference | null = null;
  let deletePrevious = false;
  if (previousCode !== null && previousCode !== code) {
    previousReservationRef = collection.doc(controlCodeReservationId(previousCode));
    const previousSnapshot = await transaction.get(previousReservationRef);
    if (previousSnapshot.exists) {
      const prior = previousSnapshot.data();
      if (
        prior?.tenantId !== tenantId ||
        prior?.controlId !== controlId ||
        prior?.code !== previousCode
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The previous control-code reservation is inconsistent.'
        );
      }
      deletePrevious = true;
    }
  }
  return {
    apply: (writeTransaction) => {
      if (!reservationSnapshot.exists) {
        writeTransaction.create(reservationRef, {
          schemaVersion: 1,
          id,
          tenantId,
          controlId,
          code,
          reservedBy: actorId,
          reservedAt: recordedAt,
        });
      }
      if (deletePrevious && previousReservationRef) {
        writeTransaction.delete(previousReservationRef);
      }
    },
  };
}

async function assertControlRelationships(
  transaction: Transaction,
  tenantId: string,
  ownerId: string,
  frameworkIds: readonly string[],
  requirementIds: readonly string[]
): Promise<void> {
  const ownerRef = db.doc(`tenants/${tenantId}/memberships/${ownerId}`);
  const adoptionRefs = frameworkIds.map((id) =>
    db.doc(`tenants/${tenantId}/adopted_frameworks/${id}`)
  );
  const frameworkRefs = frameworkIds.map((id) => db.doc(`frameworks/${id}`));
  const requirementRefs = requirementIds.flatMap((requirementId) =>
    frameworkIds.map((frameworkId) =>
      db.doc(`frameworks/${frameworkId}/requirements/${requirementId}`)
    )
  );
  const snapshots = await transaction.getAll(
    ownerRef,
    ...adoptionRefs,
    ...frameworkRefs,
    ...requirementRefs
  );
  const owner = snapshots[0]?.data() as TenantMembership | undefined;
  if (
    !snapshots[0]?.exists ||
    owner?.id !== ownerId ||
    owner?.userId !== ownerId ||
    owner?.tenantId !== tenantId ||
    owner?.status !== 'active' ||
    !isValidUserRole(owner?.role) ||
    !CONTROL_OWNER_ROLES.has(owner.role)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The control owner must have an active operational membership in this tenant.'
    );
  }
  const adoptionOffset = 1;
  const frameworkOffset = adoptionOffset + adoptionRefs.length;
  const requirementOffset = frameworkOffset + frameworkRefs.length;
  frameworkIds.forEach((frameworkId, index) => {
    const adoptionSnapshot = snapshots[adoptionOffset + index]!;
    const adoption = adoptionSnapshot.data();
    if (
      !adoptionSnapshot.exists ||
      adoption?.tenantId !== tenantId ||
      adoption?.frameworkId !== frameworkId ||
      adoption?.id !== frameworkId ||
      adoption?.status === 'retired'
    ) {
      throw new HttpsError(
        'failed-precondition',
        `Framework '${frameworkId}' must be actively adopted before it can be mapped to a control.`
      );
    }
    const frameworkSnapshot = snapshots[frameworkOffset + index]!;
    const framework = frameworkSnapshot.data();
    if (
      !frameworkSnapshot.exists ||
      (framework?.id !== undefined && framework.id !== frameworkId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        `Framework '${frameworkId}' is missing or has invalid identity metadata.`
      );
    }
  });
  requirementIds.forEach((requirementId, requirementIndex) => {
    const start = requirementOffset + requirementIndex * frameworkIds.length;
    const matches = frameworkIds.some((frameworkId, frameworkIndex) => {
      const snapshot = snapshots[start + frameworkIndex]!;
      const requirement = snapshot.data();
      return Boolean(
        snapshot.exists &&
          (requirement?.id === undefined || requirement.id === requirementId) &&
          (requirement?.frameworkId === undefined || requirement.frameworkId === frameworkId)
      );
    });
    if (!matches) {
      throw new HttpsError(
        'failed-precondition',
        `Requirement '${requirementId}' does not exist in any selected framework.`
      );
    }
  });
}

async function assertReviewAssignee(
  transaction: Transaction,
  tenantId: string,
  reviewerId: string
): Promise<UserRole> {
  const snapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/memberships/${reviewerId}`)
  );
  const membership = snapshot.data() as TenantMembership | undefined;
  if (
    !snapshot.exists ||
    membership?.id !== reviewerId ||
    membership?.userId !== reviewerId ||
    membership?.tenantId !== tenantId ||
    membership?.status !== 'active' ||
    !isValidUserRole(membership?.role) ||
    !CONTROL_REVIEWER_ROLES.has(membership.role)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The assigned reviewer must have an active control-review role in this tenant.'
    );
  }
  return membership.role;
}

function evidenceAnchor(
  evidence: Evidence,
  tenantId: string,
  evidenceId: string,
  controlId: string,
  asOf: string
): EvidenceAnchor {
  const verification = evidence.objectVerification;
  const due = evidence.reviewDueDate;
  if (
    evidence.id !== evidenceId ||
    evidence.tenantId !== tenantId ||
    evidence.status !== 'valid' ||
    !Array.isArray(evidence.controlIds) ||
    !evidence.controlIds.includes(controlId) ||
    typeof evidence.storagePath !== 'string' ||
    !evidence.storagePath.startsWith(`tenants/${tenantId}/`) ||
    typeof evidence.fileHashSha256 !== 'string' ||
    !SHA256_PATTERN.test(evidence.fileHashSha256) ||
    !Number.isSafeInteger(evidence.fileSizeBytes) ||
    evidence.fileSizeBytes <= 0 ||
    typeof evidence.mimeType !== 'string' ||
    evidence.mimeType.length === 0 ||
    !verification ||
    verification.status !== 'verified' ||
    verification.storagePath !== evidence.storagePath ||
    verification.verifiedFileHashSha256 !== evidence.fileHashSha256 ||
    verification.verifiedFileSizeBytes !== evidence.fileSizeBytes ||
    verification.verifiedMimeType !== evidence.mimeType ||
    typeof verification.storageGeneration !== 'string' ||
    verification.storageGeneration.length === 0 ||
    verification.verifier !== 'storage_finalize_function' ||
    !Number.isFinite(Date.parse(verification.verifiedAt)) ||
    !Number.isSafeInteger(evidence.currentVersion) ||
    evidence.currentVersion < 1 ||
    typeof evidence.createdBy !== 'string' ||
    evidence.createdBy.length === 0 ||
    typeof evidence.reviewedBy !== 'string' ||
    evidence.reviewedBy.length === 0 ||
    evidence.reviewedBy === evidence.createdBy ||
    typeof evidence.reviewedAt !== 'string' ||
    !Number.isFinite(Date.parse(evidence.reviewedAt)) ||
    Date.parse(evidence.reviewedAt) > Date.parse(asOf) ||
    Date.parse(verification.verifiedAt) > Date.parse(evidence.reviewedAt) ||
    typeof due !== 'string' ||
    !Number.isFinite(Date.parse(due)) ||
    Date.parse(due) <= Date.parse(asOf)
  ) {
    throw new HttpsError(
      'failed-precondition',
      `Evidence '${evidenceId}' is not current, reciprocally linked, and Storage-verified.`
    );
  }
  return {
    evidenceId,
    evidenceVersion: evidence.currentVersion,
    evidenceCreatedBy: evidence.createdBy,
    evidenceReviewedBy: evidence.reviewedBy,
    evidenceReviewedAt: evidence.reviewedAt,
    storagePath: evidence.storagePath,
    storageGeneration: verification.storageGeneration,
    fileHashSha256: evidence.fileHashSha256,
    fileSizeBytes: evidence.fileSizeBytes,
    mimeType: evidence.mimeType,
    objectVerifiedAt: verification.verifiedAt,
    reviewDueDate: due,
  };
}

async function verifiedEvidenceAnchorsInTransaction(
  transaction: Transaction,
  tenantId: string,
  controlId: string,
  evidenceIds: readonly string[],
  asOf: string
): Promise<EvidenceAnchor[]> {
  const refs = evidenceIds.map((id) => db.doc(`tenants/${tenantId}/evidence/${id}`));
  const snapshots = await transaction.getAll(...refs);
  return snapshots.map((snapshot, index) => {
    if (!snapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        `Evidence '${evidenceIds[index]}' does not exist.`
      );
    }
    return evidenceAnchor(
      snapshot.data() as Evidence,
      tenantId,
      evidenceIds[index]!,
      controlId,
      asOf
    );
  });
}

function evidenceAnchorsMatch(
  expected: readonly EvidenceAnchor[],
  actual: readonly EvidenceAnchor[]
): boolean {
  return (
    expected.length === actual.length &&
    stableTrustedValueHash(expected, 'expected control evidence anchors') ===
      stableTrustedValueHash(actual, 'current control evidence anchors')
  );
}

async function verifyCurrentCommandArtifactInTransaction(
  transaction: Transaction,
  tenantId: string,
  controlRef: DocumentReference,
  control: GovernedControlRecord,
  anchor: VersionAnchor,
  expectedCommandName?: string
): Promise<void> {
  const revision = controlRevision(control);
  if (
    revision < 1 ||
    control.workflowSchemaVersion !== CONTROL_WORKFLOW_SCHEMA_VERSION ||
    !anchor.versionId ||
    !anchor.stateHash ||
    !anchor.artifactHash ||
    !anchor.commandId ||
    !anchor.recordedBy ||
    !anchor.recordedAt
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The control must be rebaselined through a governed update before this workflow.'
    );
  }
  const receiptSnapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/command_receipts/${anchor.commandId}`)
  );
  const receipt = receiptSnapshot.data();
  if (!receiptSnapshot.exists || !isPlainRecord(receipt)) {
    throw new HttpsError('failed-precondition', 'The control command receipt is missing.');
  }
  const commandName = receipt.commandName;
  const expectedRevisionMatches =
    commandName === 'control.create'
      ? receipt.expectedRevision === null
      : receipt.expectedRevision === revision - 1;
  if (
    receipt.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION ||
    receipt.envelopeVersion !== CURRENT_COMMAND_ENVELOPE_VERSION ||
    receipt.commandVersion !== CONTROL_COMMAND_VERSION ||
    receipt.id !== anchor.commandId ||
    receipt.commandId !== anchor.commandId ||
    receipt.tenantId !== tenantId ||
    typeof commandName !== 'string' ||
    !commandName.startsWith('control.') ||
    (expectedCommandName !== undefined && commandName !== expectedCommandName) ||
    receipt.actorId !== anchor.recordedBy ||
    receipt.status !== 'completed' ||
    receipt.entityType !== 'control' ||
    receipt.entityId !== controlRef.id ||
    typeof receipt.auditAction !== 'string' ||
    typeof receipt.auditLogId !== 'string' ||
    typeof receipt.auditWorkflowContext !== 'string' ||
    typeof receipt.committedAt !== 'string' ||
    receipt.expectedRevisionWasProvided !== true ||
    !expectedRevisionMatches ||
    !controlReceiptResultMatches(receipt.result, controlRef.id, revision) ||
    !timestampWithinCommandWindow(anchor.recordedAt, receipt.committedAt)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The control command receipt is inconsistent with the current immutable version.'
    );
  }
  const auditSnapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/audit_logs/${receipt.auditLogId}`)
  );
  const audit = auditSnapshot.data();
  if (
    !auditSnapshot.exists ||
    audit?.id !== auditSnapshot.id ||
    audit?.tenantId !== tenantId ||
    audit?.actorId !== receipt.actorId ||
    audit?.actorRole !== receipt.actorRole ||
    audit?.entityType !== 'control' ||
    audit?.entityId !== controlRef.id ||
    audit?.action !== receipt.auditAction ||
    audit?.workflowContext !== receipt.auditWorkflowContext ||
    audit?.source !== 'cloud_function' ||
    !controlAuditAfterSummaryMatches(
      audit?.afterSummary,
      controlRef.id,
      revision,
      anchor.versionId,
      anchor.stateHash,
      anchor.artifactHash
    ) ||
    !timestampWithinCommandWindow(anchor.recordedAt, audit?.timestamp) ||
    !timestampWithinCommandWindow(audit?.timestamp, receipt.committedAt)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The control audit anchor is inconsistent with the current immutable version.'
    );
  }
}

async function resolveControlRevision(
  transaction: Transaction,
  tenantId: string,
  controlId: string
): Promise<number | null> {
  const snapshot = await transaction.get(db.doc(`tenants/${tenantId}/controls/${controlId}`));
  if (!snapshot.exists) return null;
  const control = snapshot.data() as GovernedControlRecord;
  assertControlIdentity(control, tenantId, controlId);
  return controlRevision(control);
}

export const createTenantControl = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<
      NormalizedCreateControlPayload,
      { success: true; controlId: string; revision: number }
    >(request, {
      commandName: 'control.create',
      commandVersion: CONTROL_COMMAND_VERSION,
      validatePayload: normalizeCreateControlPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: async () => null,
      mutateInTransaction: async (context) => {
        const controlId = deterministicDocumentId('control', context.commandId);
        const controlRef = db.doc(`tenants/${context.tenantId}/controls/${controlId}`);
        const collision = await context.transaction.get(controlRef);
        if (collision.exists) {
          throw new HttpsError(
            'already-exists',
            'The deterministic control identifier already exists.'
          );
        }
        const ownerId = context.payload.ownerId ?? context.actor.userId;
        const reservation = await prepareControlCodeReservation(
          context.transaction,
          context.tenantId,
          controlId,
          context.payload.code,
          null,
          context.actor.userId,
          context.requestedAt
        );
        await assertControlRelationships(
          context.transaction,
          context.tenantId,
          ownerId,
          context.payload.frameworkIds,
          context.payload.requirementIds
        );
        const control: GovernedControlRecord = canonical({
          id: controlId,
          tenantId: context.tenantId,
          masterControlId: null,
          code: context.payload.code,
          title: context.payload.title,
          description: context.payload.description,
          domain: context.payload.domain,
          frameworkIds: context.payload.frameworkIds,
          requirementIds: context.payload.requirementIds,
          status: 'not_started',
          healthScore: 0,
          enforcementMechanism: context.payload.enforcementMechanism,
          reviewFrequencyDays: context.payload.reviewFrequencyDays,
          lastReviewDate: null,
          nextReviewDate: addDays(
            context.requestedAt,
            context.payload.reviewFrequencyDays
          ),
          implementationNotes: context.payload.implementationNotes,
          workflowTrust: 'governed_unassured',
          assuranceStatus: 'untested',
          implementationContributorIds: [context.actor.userId],
          statusRationale: null,
          statusDecidedBy: null,
          statusDecidedAt: null,
          lastReviewId: null,
          lastReviewCommandId: null,
          lastReviewDecisionCommandId: null,
          lastReviewEffectiveness: null,
          lastReviewEvidenceIds: [],
          lastReviewEvidenceAnchors: [],
          pendingReviewId: null,
          pendingReviewAssigneeId: null,
          pendingReviewSubmittedAt: null,
          pendingReviewSubmittedBy: null,
          assuranceInvalidatedAt: null,
          assuranceInvalidatedBy: null,
          processorCertificationIds: [],
          processorProfileIds: [],
          ownerId,
          revision: 1,
          workflowSchemaVersion: CONTROL_WORKFLOW_SCHEMA_VERSION,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
          createdAt: context.requestedAt,
          updatedAt: context.requestedAt,
          createdBy: context.actor.userId,
          updatedBy: context.actor.userId,
        } satisfies GovernedControlRecord);
        const priorAnchor: VersionAnchor = {
          versionId: null,
          stateHash: null,
          artifactHash: null,
          commandId: null,
          recordedBy: null,
          recordedAt: null,
          captureLegacyBaseline: false,
        };
        reservation.apply(context.transaction);
        context.transaction.create(controlRef, control);
        const version = writeControlVersion(
          context.transaction,
          controlRef,
          control,
          null,
          priorAnchor,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        invalidateSummaryMetrics(context.transaction, context.tenantId);
        return {
          result: { success: true, controlId, revision: 1 },
          audit: {
            entityType: 'control',
            entityId: controlId,
            action: 'create',
            beforeSummary: null,
            afterSummary: controlAuditSummary(control, version),
            workflowContext: 'control_created_unassured',
          },
        };
      },
    })
);

function updateHasMaterialChange(
  before: GovernedControlRecord,
  after: GovernedControlRecord
): boolean {
  const excluded = new Set(['revision', 'updatedAt', 'updatedBy']);
  return changedControlFields(before, after).some((field) => !excluded.has(field));
}

export const updateTenantControl = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<
      NormalizedUpdateControlPayload,
      { success: true; controlId: string; revision: number }
    >(request, {
      commandName: 'control.update',
      commandVersion: CONTROL_COMMAND_VERSION,
      validatePayload: normalizeUpdateControlPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveControlRevision(
          context.transaction,
          context.tenantId,
          context.payload.controlId
        ),
      mutateInTransaction: async (context) => {
        const { controlId, ...payloadPatch } = context.payload;
        const controlRef = db.doc(`tenants/${context.tenantId}/controls/${controlId}`);
        const snapshot = await context.transaction.get(controlRef);
        if (!snapshot.exists) {
          throw new HttpsError('not-found', 'Control does not exist.');
        }
        const before = snapshot.data() as GovernedControlRecord;
        assertControlIdentity(before, context.tenantId, controlId);
        if (before.retiredAt) {
          throw new HttpsError('failed-precondition', 'Retired controls are immutable.');
        }
        if (before.pendingReviewId) {
          throw new HttpsError(
            'failed-precondition',
            'A pending control review must be decided before implementation changes.'
          );
        }
        const patchKeys = Object.keys(payloadPatch).filter(
          (key) => payloadPatch[key as keyof typeof payloadPatch] !== undefined
        );
        if (context.actor.role === 'contributor') {
          if (before.ownerId !== context.actor.userId) {
            throw new HttpsError(
              'permission-denied',
              'Contributors may update only controls assigned to them.'
            );
          }
          const allowed = new Set(['implementationNotes', 'status']);
          if (
            patchKeys.some((key) => !allowed.has(key)) ||
            payloadPatch.status === 'not_applicable'
          ) {
            throw new HttpsError(
              'permission-denied',
              'Contributors may update only implementation notes and working status.'
            );
          }
        }
        const existingContributors = contributorIds(before);
        const notApplicableDecision = payloadPatch.status === 'not_applicable';
        if (notApplicableDecision) {
          if (
            patchKeys.some((key) => key !== 'status' && key !== 'statusRationale') ||
            context.actor.role === 'contributor' ||
            context.actor.userId === before.ownerId ||
            context.actor.userId === before.createdBy ||
            existingContributors.includes(context.actor.userId)
          ) {
            throw new HttpsError(
              'permission-denied',
              'Not-applicable decisions require an independent manager and a dedicated rationale-only decision.'
            );
          }
        }
        const ownerId =
          payloadPatch.ownerId === undefined
            ? before.ownerId
            : payloadPatch.ownerId ?? context.actor.userId;
        const frameworkIds = payloadPatch.frameworkIds ?? before.frameworkIds;
        const requirementIds = payloadPatch.requirementIds ?? before.requirementIds;
        const code = payloadPatch.code ?? before.code;
        const resolvedRequestedValues: Record<string, unknown> = {
          ...payloadPatch,
          ownerId,
          frameworkIds,
          requirementIds,
          code,
        };
        const hasRequestedChange = patchKeys.some(
          (key) =>
            JSON.stringify(resolvedRequestedValues[key]) !==
            JSON.stringify(before[key as keyof GovernedControlRecord])
        );
        if (!hasRequestedChange) {
          throw new HttpsError(
            'failed-precondition',
            'Control update contains no material change.'
          );
        }
        const reservation = await prepareControlCodeReservation(
          context.transaction,
          context.tenantId,
          controlId,
          code,
          before.code,
          context.actor.userId,
          context.requestedAt
        );
        await assertControlRelationships(
          context.transaction,
          context.tenantId,
          ownerId,
          frameworkIds,
          requirementIds
        );
        const priorAnchor = await preparePriorControlVersion(
          context.transaction,
          controlRef,
          before
        );
        if (controlRevision(before) > 0) {
          await verifyCurrentCommandArtifactInTransaction(
            context.transaction,
            context.tenantId,
            controlRef,
            before,
            priorAnchor
          );
        }
        const authors = notApplicableDecision
          ? existingContributors
          : [...new Set([...existingContributors, context.actor.userId])];
        if (authors.length > 100) {
          throw new HttpsError(
            'resource-exhausted',
            'Control implementation contributor history has reached its governed limit.'
          );
        }
        let status: ControlImplementationStatus =
          payloadPatch.status ?? before.status;
        if (
          !notApplicableDecision &&
          (before.status === 'implemented' ||
            before.status === 'partially_implemented' ||
            before.status === 'not_applicable') &&
          payloadPatch.status === undefined
        ) {
          status = 'in_progress';
        }
        const after: GovernedControlRecord = canonical({
          ...before,
          ...payloadPatch,
          ownerId,
          code,
          frameworkIds,
          requirementIds,
          status,
          healthScore: 0,
          workflowSchemaVersion: CONTROL_WORKFLOW_SCHEMA_VERSION,
          workflowTrust: 'governed_unassured',
          assuranceStatus: notApplicableDecision ? 'not_applicable' : 'untested',
          implementationContributorIds: authors,
          statusRationale: notApplicableDecision
            ? payloadPatch.statusRationale!
            : null,
          statusDecidedBy: notApplicableDecision ? context.actor.userId : null,
          statusDecidedAt: notApplicableDecision ? context.requestedAt : null,
          pendingReviewId: null,
          pendingReviewAssigneeId: null,
          pendingReviewSubmittedAt: null,
          pendingReviewSubmittedBy: null,
          nextReviewDate: addDays(
            context.requestedAt,
            payloadPatch.reviewFrequencyDays ?? before.reviewFrequencyDays
          ),
          assuranceInvalidatedAt:
            before.status === 'implemented' || before.status === 'partially_implemented'
              ? context.requestedAt
              : before.assuranceInvalidatedAt ?? null,
          assuranceInvalidatedBy:
            before.status === 'implemented' || before.status === 'partially_implemented'
              ? context.actor.userId
              : before.assuranceInvalidatedBy ?? null,
          revision: controlRevision(before) + 1,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        if (!updateHasMaterialChange(before, after)) {
          throw new HttpsError(
            'failed-precondition',
            'Control update contains no material change.'
          );
        }
        reservation.apply(context.transaction);
        context.transaction.set(controlRef, after);
        const version = writeControlVersion(
          context.transaction,
          controlRef,
          after,
          before,
          priorAnchor,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        invalidateSummaryMetrics(context.transaction, context.tenantId);
        return {
          result: {
            success: true,
            controlId,
            revision: controlRevision(after),
          },
          audit: {
            entityType: 'control',
            entityId: controlId,
            action: notApplicableDecision ? 'status_transition' : 'update',
            beforeSummary: controlAuditSummary(before, {
              versionId: priorAnchor.versionId,
              stateHash: priorAnchor.stateHash,
              artifactHash: priorAnchor.artifactHash,
            }),
            afterSummary: controlAuditSummary(after, version),
            workflowContext: notApplicableDecision
              ? 'control_not_applicable_decided'
              : 'control_implementation_updated_assurance_invalidated',
          },
        };
      },
    })
);

export const recordControlReview = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<
      NormalizedControlReviewPayload,
      { success: true; controlId: string; reviewId: string; revision: number }
    >(request, {
      commandName: 'control.review_submit',
      commandVersion: CONTROL_COMMAND_VERSION,
      validatePayload: normalizeControlReviewPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveControlRevision(
          context.transaction,
          context.tenantId,
          context.payload.controlId
        ),
      mutateInTransaction: async (context) => {
        const { controlId } = context.payload;
        const controlRef = db.doc(`tenants/${context.tenantId}/controls/${controlId}`);
        const snapshot = await context.transaction.get(controlRef);
        if (!snapshot.exists) {
          throw new HttpsError('not-found', 'Control does not exist.');
        }
        const before = snapshot.data() as GovernedControlRecord;
        assertControlIdentity(before, context.tenantId, controlId);
        if (before.retiredAt) {
          throw new HttpsError('failed-precondition', 'Retired controls are immutable.');
        }
        if (before.pendingReviewId) {
          throw new HttpsError(
            'failed-precondition',
            'A control may have only one pending review.'
          );
        }
        if (before.status === 'not_applicable') {
          throw new HttpsError(
            'failed-precondition',
            'A not-applicable control must be returned to implementation before testing.'
          );
        }
        if (
          typeof before.implementationNotes !== 'string' ||
          before.implementationNotes.trim().length < 20
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Control testing requires substantive implementation notes of at least 20 characters.'
          );
        }
        if (
          context.payload.testPeriodEnd !== null &&
          Date.parse(context.payload.testPeriodEnd) > Date.parse(context.requestedAt)
        ) {
          throw new HttpsError(
            'invalid-argument',
            'testPeriodEnd cannot be later than the review submission time.'
          );
        }
        if (
          context.actor.role === 'contributor' &&
          before.ownerId !== context.actor.userId
        ) {
          throw new HttpsError(
            'permission-denied',
            'Contributors may submit tests only for controls assigned to them.'
          );
        }
        const authors = contributorIds(before);
        const assignedReviewerRole = await assertReviewAssignee(
          context.transaction,
          context.tenantId,
          context.payload.reviewAssigneeId
        );
        if (
          context.payload.reviewAssigneeId === before.ownerId ||
          context.payload.reviewAssigneeId === before.createdBy ||
          context.payload.reviewAssigneeId === context.actor.userId ||
          authors.includes(context.payload.reviewAssigneeId)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'The assigned reviewer must be independent of control ownership, authorship, implementation, and submission.'
          );
        }
        await assertControlRelationships(
          context.transaction,
          context.tenantId,
          before.ownerId,
          before.frameworkIds,
          before.requirementIds
        );
        const anchors = await verifiedEvidenceAnchorsInTransaction(
          context.transaction,
          context.tenantId,
          controlId,
          context.payload.evidenceIds,
          context.requestedAt
        );
        if (
          anchors.some(
            (anchor) =>
              anchor.evidenceCreatedBy === context.payload.reviewAssigneeId
          )
        ) {
          throw new HttpsError(
            'failed-precondition',
            'The assigned control reviewer cannot review evidence they created.'
          );
        }
        const priorAnchor = await preparePriorControlVersion(
          context.transaction,
          controlRef,
          before
        );
        await verifyCurrentCommandArtifactInTransaction(
          context.transaction,
          context.tenantId,
          controlRef,
          before,
          priorAnchor
        );
        const reviewId = deterministicDocumentId('control_review', context.commandId);
        const reviewRef = controlRef.collection('reviews').doc(reviewId);
        const reviewEventRef = controlRef.collection('review_events').doc(context.commandId);
        const [reviewCollision, eventCollision] = await context.transaction.getAll(
          reviewRef,
          reviewEventRef
        );
        if (reviewCollision?.exists || eventCollision?.exists) {
          throw new HttpsError(
            'already-exists',
            'The deterministic control review artifact already exists.'
          );
        }
        const resultingRevision = controlRevision(before) + 1;
        const review: GovernedControlReview = canonical({
          schemaVersion: CONTROL_REVIEW_SCHEMA_VERSION,
          id: reviewId,
          tenantId: context.tenantId,
          controlId,
          status: 'pending_approval',
          effectiveness: context.payload.effectiveness,
          notes: context.payload.notes,
          testMethod: context.payload.testMethod,
          testPeriodStart: context.payload.testPeriodStart,
          testPeriodEnd: context.payload.testPeriodEnd,
          sampleSize: context.payload.sampleSize,
          exceptions: context.payload.exceptions,
          evidenceIds: context.payload.evidenceIds,
          evidenceAnchors: anchors,
          assignedReviewerId: context.payload.reviewAssigneeId,
          assignedReviewerRole,
          reviewerId: null,
          reviewerRole: null,
          submittedBy: context.actor.userId,
          submittedAt: context.requestedAt,
          submissionCommandId: context.commandId,
          commandId: context.commandId,
          reviewedControlRevision: controlRevision(before),
          reviewedStateHash: priorAnchor.stateHash!,
          reviewedVersionArtifactHash: priorAnchor.artifactHash!,
          resultingControlRevision: resultingRevision,
          implementationContributorIds: authors,
          decision: null,
          decisionNotes: null,
          decisionCommandId: null,
          decidedBy: null,
          reviewedAt: null,
        });
        const after: GovernedControlRecord = canonical({
          ...before,
          status: 'in_progress',
          healthScore: 0,
          workflowSchemaVersion: CONTROL_WORKFLOW_SCHEMA_VERSION,
          workflowTrust: 'review_pending',
          assuranceStatus: 'pending_review',
          pendingReviewId: reviewId,
          pendingReviewAssigneeId: context.payload.reviewAssigneeId,
          pendingReviewSubmittedAt: context.requestedAt,
          pendingReviewSubmittedBy: context.actor.userId,
          nextReviewDate: null,
          assuranceInvalidatedAt:
            before.status === 'implemented' || before.status === 'partially_implemented'
              ? context.requestedAt
              : before.assuranceInvalidatedAt ?? null,
          assuranceInvalidatedBy:
            before.status === 'implemented' || before.status === 'partially_implemented'
              ? context.actor.userId
              : before.assuranceInvalidatedBy ?? null,
          revision: resultingRevision,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        context.transaction.create(reviewRef, review);
        context.transaction.create(reviewEventRef, {
          schemaVersion: CONTROL_REVIEW_EVENT_SCHEMA_VERSION,
          id: context.commandId,
          tenantId: context.tenantId,
          controlId,
          reviewId,
          eventType: 'submitted',
          reviewStatus: 'pending_approval',
          controlRevision: resultingRevision,
          reviewStateHash: stableTrustedValueHash(review, 'control review submission'),
          commandId: context.commandId,
          actorId: context.actor.userId,
          actorRole: context.actor.role,
          recordedAt: context.requestedAt,
        });
        context.transaction.set(controlRef, after);
        const version = writeControlVersion(
          context.transaction,
          controlRef,
          after,
          before,
          priorAnchor,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        invalidateSummaryMetrics(context.transaction, context.tenantId);
        return {
          result: {
            success: true,
            controlId,
            reviewId,
            revision: resultingRevision,
          },
          audit: {
            entityType: 'control',
            entityId: controlId,
            action: 'update',
            beforeSummary: controlAuditSummary(before, {
              versionId: priorAnchor.versionId,
              stateHash: priorAnchor.stateHash,
              artifactHash: priorAnchor.artifactHash,
            }),
            afterSummary: {
              ...controlAuditSummary(after, version),
              reviewId,
              reviewEventId: context.commandId,
              reviewStateHash: stableTrustedValueHash(
                review,
                'control review submission'
              ),
              evidenceAnchorsHash: stableTrustedValueHash(
                review.evidenceAnchors,
                'control review submission evidence anchors'
              ),
              claimedEffectiveness: review.effectiveness,
              evidenceIds: review.evidenceIds,
              assignedReviewerId: review.assignedReviewerId,
              testPeriodStart: review.testPeriodStart,
              testPeriodEnd: review.testPeriodEnd,
              sampleSize: review.sampleSize,
            },
            workflowContext: 'control_test_submitted_for_independent_review',
          },
        };
      },
    })
);

/** Independently approves or rejects a submitted control test package. */
export const decideControlReview = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<
      NormalizedControlReviewDecisionPayload,
      {
        success: true;
        controlId: string;
        reviewId: string;
        decision: 'approved' | 'rejected';
        status: ControlImplementationStatus;
        revision: number;
      }
    >(request, {
      commandName: 'control.review_decide',
      commandVersion: CONTROL_COMMAND_VERSION,
      validatePayload: normalizeControlReviewDecisionPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveControlRevision(
          context.transaction,
          context.tenantId,
          context.payload.controlId
        ),
      mutateInTransaction: async (context) => {
        const { controlId, reviewId, decision, decisionNotes } = context.payload;
        const controlRef = db.doc(`tenants/${context.tenantId}/controls/${controlId}`);
        const reviewRef = controlRef.collection('reviews').doc(reviewId);
        const [controlSnapshot, reviewSnapshot] = await context.transaction.getAll(
          controlRef,
          reviewRef
        );
        if (!controlSnapshot?.exists) {
          throw new HttpsError('not-found', 'Control does not exist.');
        }
        if (!reviewSnapshot?.exists) {
          throw new HttpsError('not-found', 'Control review does not exist.');
        }
        const before = controlSnapshot.data() as GovernedControlRecord;
        const reviewBefore = reviewSnapshot.data() as GovernedControlReview;
        assertControlIdentity(before, context.tenantId, controlId);
        if (before.retiredAt) {
          throw new HttpsError('failed-precondition', 'Retired controls are immutable.');
        }
        if (
          before.pendingReviewId !== reviewId ||
          before.pendingReviewAssigneeId !== context.actor.userId ||
          reviewBefore.schemaVersion !== CONTROL_REVIEW_SCHEMA_VERSION ||
          reviewBefore.id !== reviewId ||
          reviewBefore.tenantId !== context.tenantId ||
          reviewBefore.controlId !== controlId ||
          reviewBefore.status !== 'pending_approval' ||
          reviewBefore.assignedReviewerId !== context.actor.userId ||
          reviewBefore.decision !== null ||
          reviewBefore.decisionCommandId !== null ||
          reviewBefore.reviewerId !== null ||
          reviewBefore.reviewedAt !== null
        ) {
          throw new HttpsError(
            'failed-precondition',
            'The control and pending review assignment are inconsistent.'
          );
        }
        if (
          context.actor.userId === before.ownerId ||
          context.actor.userId === before.createdBy ||
          context.actor.userId === reviewBefore.submittedBy ||
          reviewBefore.implementationContributorIds.includes(context.actor.userId)
        ) {
          throw new HttpsError(
            'permission-denied',
            'A control owner, creator, submitter, or implementation contributor cannot decide the review.'
          );
        }

        const priorAnchor = await preparePriorControlVersion(
          context.transaction,
          controlRef,
          before
        );
        await verifyCurrentCommandArtifactInTransaction(
          context.transaction,
          context.tenantId,
          controlRef,
          before,
          priorAnchor,
          'control.review_submit'
        );
        if (
          reviewBefore.submissionCommandId !== priorAnchor.commandId ||
          reviewBefore.resultingControlRevision !== controlRevision(before) ||
          reviewBefore.reviewedControlRevision !== controlRevision(before) - 1 ||
          !Array.isArray(reviewBefore.evidenceIds) ||
          !Array.isArray(reviewBefore.evidenceAnchors) ||
          !Array.isArray(reviewBefore.implementationContributorIds)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'The pending review does not match the governed control revision.'
          );
        }

        const reviewedVersionRef = controlRef
          .collection('versions')
          .doc(controlVersionId(reviewBefore.reviewedControlRevision));
        const submissionEventRef = controlRef
          .collection('review_events')
          .doc(reviewBefore.submissionCommandId);
        const [reviewedVersionSnapshot, submissionEventSnapshot] =
          await context.transaction.getAll(reviewedVersionRef, submissionEventRef);
        const reviewedVersion = reviewedVersionSnapshot?.data();
        const submissionEvent = submissionEventSnapshot?.data();
        if (
          !reviewedVersionSnapshot?.exists ||
          reviewedVersion?.schemaVersion !== CONTROL_VERSION_SCHEMA_VERSION ||
          reviewedVersion?.tenantId !== context.tenantId ||
          reviewedVersion?.controlId !== controlId ||
          reviewedVersion?.revision !== reviewBefore.reviewedControlRevision ||
          reviewedVersion?.stateHash !== reviewBefore.reviewedStateHash ||
          reviewedVersion?.artifactHash !== reviewBefore.reviewedVersionArtifactHash ||
          controlVersionArtifactHash(reviewedVersion as Record<string, unknown>) !==
            reviewBefore.reviewedVersionArtifactHash ||
          stableTrustedValueHash(
            reviewedVersion?.state,
            'reviewed control version state'
          ) !== reviewBefore.reviewedStateHash ||
          !submissionEventSnapshot?.exists ||
          submissionEvent?.schemaVersion !== CONTROL_REVIEW_EVENT_SCHEMA_VERSION ||
          submissionEvent?.tenantId !== context.tenantId ||
          submissionEvent?.controlId !== controlId ||
          submissionEvent?.reviewId !== reviewId ||
          submissionEvent?.eventType !== 'submitted' ||
          submissionEvent?.reviewStatus !== 'pending_approval' ||
          submissionEvent?.commandId !== reviewBefore.submissionCommandId ||
          submissionEvent?.reviewStateHash !==
            stableTrustedValueHash(reviewBefore, 'control review submission')
        ) {
          throw new HttpsError(
            'failed-precondition',
            'The immutable review submission artifacts are missing or inconsistent.'
          );
        }

        const currentEvidenceAnchors = await verifiedEvidenceAnchorsInTransaction(
          context.transaction,
          context.tenantId,
          controlId,
          reviewBefore.evidenceIds,
          context.requestedAt
        );
        if (!evidenceAnchorsMatch(reviewBefore.evidenceAnchors, currentEvidenceAnchors)) {
          throw new HttpsError(
            'failed-precondition',
            'Evidence changed, expired, or lost object verification after review submission.'
          );
        }
        if (
          currentEvidenceAnchors.some(
            (anchor) => anchor.evidenceCreatedBy === context.actor.userId
          )
        ) {
          throw new HttpsError(
            'permission-denied',
            'The independent control reviewer cannot approve evidence they created.'
          );
        }

        const approved = decision === 'approved';
        const resultingStatus: ControlImplementationStatus = !approved
          ? 'in_progress'
          : reviewBefore.effectiveness === 'effective'
            ? 'implemented'
            : reviewBefore.effectiveness === 'needs_improvement'
              ? 'partially_implemented'
              : 'in_progress';
        const resultingHealth = !approved
          ? 0
          : reviewBefore.effectiveness === 'effective'
            ? 100
            : reviewBefore.effectiveness === 'needs_improvement'
              ? 60
              : 20;
        const resultingRevision = controlRevision(before) + 1;
        const reviewedAt = context.requestedAt;
        const reviewAfter: GovernedControlReview = canonical({
          ...reviewBefore,
          status: approved ? 'approved' : 'rejected',
          reviewerId: context.actor.userId,
          reviewerRole: context.actor.role,
          decision,
          decisionNotes,
          decisionCommandId: context.commandId,
          decidedBy: context.actor.userId,
          reviewedAt,
          resultingControlRevision: resultingRevision,
        });
        const after: GovernedControlRecord = canonical({
          ...before,
          status: resultingStatus,
          healthScore: resultingHealth,
          workflowSchemaVersion: CONTROL_WORKFLOW_SCHEMA_VERSION,
          workflowTrust: approved ? 'authoritative' : 'governed_unassured',
          assuranceStatus: approved
            ? reviewBefore.effectiveness
            : 'untested',
          lastReviewId: reviewId,
          lastReviewCommandId: reviewBefore.submissionCommandId,
          lastReviewDecisionCommandId: context.commandId,
          lastReviewEffectiveness: approved ? reviewBefore.effectiveness : null,
          lastReviewEvidenceIds: [...reviewBefore.evidenceIds],
          lastReviewEvidenceAnchors: [...reviewBefore.evidenceAnchors],
          lastReviewDate: reviewedAt,
          nextReviewDate: addDays(reviewedAt, before.reviewFrequencyDays),
          pendingReviewId: null,
          pendingReviewAssigneeId: null,
          pendingReviewSubmittedAt: null,
          pendingReviewSubmittedBy: null,
          assuranceInvalidatedAt: approved ? null : reviewedAt,
          assuranceInvalidatedBy: approved ? null : context.actor.userId,
          revision: resultingRevision,
          updatedAt: reviewedAt,
          updatedBy: context.actor.userId,
        });
        const decisionEventRef = controlRef
          .collection('review_events')
          .doc(context.commandId);
        const decisionEventCollision = await context.transaction.get(decisionEventRef);
        if (decisionEventCollision.exists) {
          throw new HttpsError(
            'already-exists',
            'The deterministic review decision event already exists.'
          );
        }
        context.transaction.set(reviewRef, reviewAfter);
        context.transaction.create(decisionEventRef, {
          schemaVersion: CONTROL_REVIEW_EVENT_SCHEMA_VERSION,
          id: context.commandId,
          tenantId: context.tenantId,
          controlId,
          reviewId,
          eventType: decision,
          reviewStatus: reviewAfter.status,
          controlRevision: resultingRevision,
          reviewStateHash: stableTrustedValueHash(
            reviewAfter,
            'control review decision'
          ),
          evidenceAnchorsHash: stableTrustedValueHash(
            reviewAfter.evidenceAnchors,
            'control review decision evidence anchors'
          ),
          commandId: context.commandId,
          actorId: context.actor.userId,
          actorRole: context.actor.role,
          recordedAt: reviewedAt,
        });
        context.transaction.set(controlRef, after);
        const version = writeControlVersion(
          context.transaction,
          controlRef,
          after,
          before,
          priorAnchor,
          context.actor.userId,
          context.commandId,
          reviewedAt
        );
        invalidateSummaryMetrics(context.transaction, context.tenantId);
        return {
          result: {
            success: true,
            controlId,
            reviewId,
            decision,
            status: resultingStatus,
            revision: resultingRevision,
          },
          audit: {
            entityType: 'control',
            entityId: controlId,
            action: (approved ? 'approve' : 'reject') as AuditActionType,
            beforeSummary: controlAuditSummary(before, {
              versionId: priorAnchor.versionId,
              stateHash: priorAnchor.stateHash,
              artifactHash: priorAnchor.artifactHash,
            }),
            afterSummary: {
              ...controlAuditSummary(after, version),
              reviewId,
              reviewEventId: context.commandId,
              reviewStateHash: stableTrustedValueHash(
                reviewAfter,
                'control review decision'
              ),
              evidenceAnchorsHash: stableTrustedValueHash(
                reviewAfter.evidenceAnchors,
                'control review decision evidence anchors'
              ),
              decision,
              decisionNotes,
              effectiveness: reviewBefore.effectiveness,
              evidenceIds: reviewBefore.evidenceIds,
            },
            workflowContext: approved
              ? 'control_test_independently_approved'
              : 'control_test_rejected',
          },
        };
      },
    })
);

/** Compatibility name retained; controls are retired, never deleted. */
export const deleteTenantControl = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<
      NormalizedRetireControlPayload,
      {
        success: true;
        controlId: string;
        deleted: false;
        retired: true;
        revision: number;
      }
    >(request, {
      commandName: 'control.retire',
      commandVersion: CONTROL_COMMAND_VERSION,
      validatePayload: normalizeRetireControlPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveControlRevision(
          context.transaction,
          context.tenantId,
          context.payload.controlId
        ),
      mutateInTransaction: async (context) => {
        const { controlId, retirementReason } = context.payload;
        const controlRef = db.doc(`tenants/${context.tenantId}/controls/${controlId}`);
        const snapshot = await context.transaction.get(controlRef);
        if (!snapshot.exists) {
          throw new HttpsError('not-found', 'Control does not exist.');
        }
        const before = snapshot.data() as GovernedControlRecord;
        assertControlIdentity(before, context.tenantId, controlId);
        if (before.retiredAt) {
          throw new HttpsError('failed-precondition', 'Control is already retired.');
        }
        if (before.pendingReviewId) {
          throw new HttpsError(
            'failed-precondition',
            'A pending review must be decided before the control can be retired.'
          );
        }
        const [taskSnapshot, issueSnapshot, riskSnapshot, policySnapshot] =
          await Promise.all([
            context.transaction.get(
              db.collection(`tenants/${context.tenantId}/tasks`)
                .where('parentEntityType', '==', 'control')
                .where('parentEntityId', '==', controlId)
                .limit(101)
            ),
            context.transaction.get(
              db.collection(`tenants/${context.tenantId}/issues`)
                .where('sourceEntityType', '==', 'control')
                .where('sourceEntityId', '==', controlId)
                .limit(101)
            ),
            context.transaction.get(
              db.collection(`tenants/${context.tenantId}/risks`)
                .where('mitigatingControlIds', 'array-contains', controlId)
                .limit(101)
            ),
            context.transaction.get(
              db.collection(`tenants/${context.tenantId}/policies`)
                .where('linkedControlIds', 'array-contains', controlId)
                .limit(101)
            ),
          ]);
        if (
          taskSnapshot.size > 100 ||
          issueSnapshot.size > 100 ||
          riskSnapshot.size > 100 ||
          policySnapshot.size > 100
        ) {
          throw new HttpsError(
            'resource-exhausted',
            'Control retirement dependency checks exceeded the bounded synchronous limit.'
          );
        }
        if (
          taskSnapshot.docs.some((doc) =>
            ['todo', 'in_progress', 'blocked'].includes(String(doc.data().status))
          ) ||
          issueSnapshot.docs.some((doc) =>
            ['open', 'in_progress', 'under_review'].includes(String(doc.data().status))
          ) ||
          riskSnapshot.docs.some((doc) => !doc.data().retiredAt) ||
          policySnapshot.docs.some((doc) => !doc.data().retiredAt)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'Resolve or remap active tasks, issues, risks, and policies before retiring this control.'
          );
        }
        const priorAnchor = await preparePriorControlVersion(
          context.transaction,
          controlRef,
          before
        );
        if (controlRevision(before) > 0) {
          await verifyCurrentCommandArtifactInTransaction(
            context.transaction,
            context.tenantId,
            controlRef,
            before,
            priorAnchor
          );
        }
        const resultingRevision = controlRevision(before) + 1;
        const after: GovernedControlRecord = canonical({
          ...before,
          healthScore: 0,
          workflowSchemaVersion: CONTROL_WORKFLOW_SCHEMA_VERSION,
          workflowTrust: 'retired',
          assuranceStatus: 'expired',
          nextReviewDate: null,
          pendingReviewId: null,
          pendingReviewAssigneeId: null,
          pendingReviewSubmittedAt: null,
          pendingReviewSubmittedBy: null,
          retiredAt: context.requestedAt,
          retiredBy: context.actor.userId,
          retirementReason,
          revision: resultingRevision,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        context.transaction.set(controlRef, after);
        const version = writeControlVersion(
          context.transaction,
          controlRef,
          after,
          before,
          priorAnchor,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        invalidateSummaryMetrics(context.transaction, context.tenantId);
        return {
          result: {
            success: true,
            controlId,
            deleted: false,
            retired: true,
            revision: resultingRevision,
          },
          audit: {
            entityType: 'control',
            entityId: controlId,
            action: 'status_transition',
            beforeSummary: controlAuditSummary(before, {
              versionId: priorAnchor.versionId,
              stateHash: priorAnchor.stateHash,
              artifactHash: priorAnchor.artifactHash,
            }),
            afterSummary: {
              ...controlAuditSummary(after, version),
              retirementReason,
            },
            workflowContext: 'control_retired_not_deleted',
          },
        };
      },
    })
);

function normalizePageSize(
  value: unknown,
  fallback: number,
  maximum: number
): number {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new HttpsError(
      'invalid-argument',
      `pageSize must be a whole number from 1 to ${maximum}.`
    );
  }
  return value as number;
}

function normalizeOptionalReadText(
  value: unknown,
  label: string,
  maximumLength: number
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (!normalized || normalized.length > maximumLength) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must contain 1-${maximumLength} characters.`
    );
  }
  if (/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/u.test(normalized)) {
    throw new HttpsError('invalid-argument', `${label} contains unsupported characters.`);
  }
  return normalized;
}

function normalizeListControlsInput(value: unknown): Required<Pick<ListControlsInput, 'tenantId' | 'pageSize'>> & Omit<ListControlsInput, 'tenantId' | 'pageSize'> {
  if (!isPlainRecord(value)) {
    throw new HttpsError('invalid-argument', 'Control list input must be an object.');
  }
  const allowed = new Set([
    'tenantId',
    'frameworkId',
    'status',
    'domain',
    'ownerId',
    'pageSize',
    'cursor',
  ]);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Control list input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const status = value.status;
  if (status !== undefined && !CONTROL_STATUSES.has(status as ControlImplementationStatus)) {
    throw new HttpsError('invalid-argument', 'status contains an unsupported value.');
  }
  const filterCount = [value.frameworkId, status, value.domain, value.ownerId].filter(
    (candidate) => candidate !== undefined
  ).length;
  if (filterCount > 1) {
    throw new HttpsError(
      'invalid-argument',
      'A control page may use one server-side filter at a time.'
    );
  }
  return {
    tenantId: normalizeControlDocumentId(value.tenantId, 'tenantId'),
    frameworkId:
      value.frameworkId === undefined
        ? undefined
        : normalizeControlDocumentId(value.frameworkId, 'frameworkId'),
    status: status as ControlImplementationStatus | undefined,
    domain: normalizeOptionalReadText(value.domain, 'domain', 80),
    ownerId:
      value.ownerId === undefined
        ? undefined
        : normalizeControlDocumentId(value.ownerId, 'ownerId'),
    pageSize: normalizePageSize(value.pageSize, DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE),
    cursor:
      value.cursor === undefined
        ? undefined
        : normalizeControlDocumentId(value.cursor, 'cursor'),
  };
}

function normalizeGetControlInput(value: unknown): GetControlInput {
  if (!isPlainRecord(value)) {
    throw new HttpsError('invalid-argument', 'Control detail input must be an object.');
  }
  const unknown = Object.keys(value).filter(
    (key) => key !== 'tenantId' && key !== 'controlId'
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Control detail input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  return {
    tenantId: normalizeControlDocumentId(value.tenantId, 'tenantId'),
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
  };
}

function normalizeGetControlHistoryInput(value: unknown): GetControlHistoryInput {
  if (!isPlainRecord(value)) {
    throw new HttpsError('invalid-argument', 'Control history input must be an object.');
  }
  const allowed = new Set(['tenantId', 'controlId', 'pageSize', 'cursorRevision']);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Control history input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const cursorRevision = value.cursorRevision;
  if (
    cursorRevision !== undefined &&
    (!Number.isSafeInteger(cursorRevision) || (cursorRevision as number) < 1)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'cursorRevision must be a positive whole-number revision.'
    );
  }
  return {
    tenantId: normalizeControlDocumentId(value.tenantId, 'tenantId'),
    controlId: normalizeControlDocumentId(value.controlId, 'controlId'),
    pageSize: normalizePageSize(
      value.pageSize,
      20,
      MAX_HISTORY_PAGE_SIZE
    ),
    cursorRevision: cursorRevision as number | undefined,
  };
}

async function verifyVersionReceiptAudit(
  tenantId: string,
  controlId: string,
  control: GovernedControlRecord
): Promise<{
  verified: boolean;
  version: Record<string, unknown> | null;
  receipt: Record<string, unknown> | null;
  audit: Record<string, unknown> | null;
}> {
  try {
    const revision = controlRevision(control);
    if (revision < 1 || control.workflowSchemaVersion !== CONTROL_WORKFLOW_SCHEMA_VERSION) {
      return { verified: false, version: null, receipt: null, audit: null };
    }
    const versionId = controlVersionId(revision);
    const versionSnapshot = await db.doc(
      `tenants/${tenantId}/controls/${controlId}/versions/${versionId}`
    ).get();
    const version = versionSnapshot.data();
    const stateHash = stableTrustedValueHash(control, 'current control projection state');
    const artifactHash = isPlainRecord(version)
      ? controlVersionArtifactHash(version)
      : '';
    if (
      !versionSnapshot.exists ||
      !isPlainRecord(version) ||
      version.schemaVersion !== CONTROL_VERSION_SCHEMA_VERSION ||
      version.id !== versionId ||
      version.tenantId !== tenantId ||
      version.controlId !== controlId ||
      version.revision !== revision ||
      version.stateHash !== stateHash ||
      version.artifactHash !== artifactHash ||
      stableTrustedValueHash(version.state, 'current stored control version state') !== stateHash ||
      typeof version.commandId !== 'string' ||
      typeof version.recordedBy !== 'string' ||
      typeof version.recordedAt !== 'string'
    ) {
      return { verified: false, version: version ?? null, receipt: null, audit: null };
    }
    if (revision > 1) {
      const previousId = controlVersionId(revision - 1);
      const previousSnapshot = await db.doc(
        `tenants/${tenantId}/controls/${controlId}/versions/${previousId}`
      ).get();
      const previous = previousSnapshot.data();
      if (
        !previousSnapshot.exists ||
        !isPlainRecord(previous) ||
        previous.id !== previousId ||
        previous.tenantId !== tenantId ||
        previous.controlId !== controlId ||
        previous.revision !== revision - 1 ||
        version.previousVersionId !== previousId ||
        version.previousStateHash !== previous.stateHash ||
        version.previousArtifactHash !== previous.artifactHash ||
        controlVersionArtifactHash(previous) !== previous.artifactHash ||
        stableTrustedValueHash(previous.state, 'previous stored control version state') !==
          previous.stateHash
      ) {
        return { verified: false, version, receipt: null, audit: null };
      }
    } else if (version.previousVersionId === controlVersionId(0)) {
      const baselineSnapshot = await db.doc(
        `tenants/${tenantId}/controls/${controlId}/versions/${controlVersionId(0)}`
      ).get();
      const baseline = baselineSnapshot.data();
      if (
        !baselineSnapshot.exists ||
        !isPlainRecord(baseline) ||
        baseline.id !== controlVersionId(0) ||
        baseline.tenantId !== tenantId ||
        baseline.controlId !== controlId ||
        baseline.revision !== 0 ||
        baseline.previousVersionId !== null ||
        baseline.previousStateHash !== null ||
        baseline.previousArtifactHash !== null ||
        baseline.commandId !== null ||
        baseline.provenance !== 'legacy_baseline_captured_on_first_command' ||
        version.previousStateHash !== baseline.stateHash ||
        version.previousArtifactHash !== baseline.artifactHash ||
        controlVersionArtifactHash(baseline) !== baseline.artifactHash ||
        stableTrustedValueHash(baseline.state, 'legacy control baseline state') !==
          baseline.stateHash
      ) {
        return { verified: false, version, receipt: null, audit: null };
      }
    } else if (
      version.previousVersionId !== null ||
      version.previousStateHash !== null ||
      version.previousArtifactHash !== null
    ) {
      return { verified: false, version, receipt: null, audit: null };
    }
    const receiptSnapshot = await db.doc(
      `tenants/${tenantId}/command_receipts/${version.commandId}`
    ).get();
    const receipt = receiptSnapshot.data();
    if (
      !receiptSnapshot.exists ||
      !isPlainRecord(receipt) ||
      receipt.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION ||
      receipt.envelopeVersion !== CURRENT_COMMAND_ENVELOPE_VERSION ||
      receipt.commandVersion !== CONTROL_COMMAND_VERSION ||
      receipt.id !== version.commandId ||
      receipt.commandId !== version.commandId ||
      receipt.tenantId !== tenantId ||
      receipt.actorId !== version.recordedBy ||
      receipt.status !== 'completed' ||
      receipt.entityType !== 'control' ||
      receipt.entityId !== controlId ||
      typeof receipt.commandName !== 'string' ||
      !receipt.commandName.startsWith('control.') ||
      typeof receipt.auditLogId !== 'string' ||
      typeof receipt.auditAction !== 'string' ||
      typeof receipt.auditWorkflowContext !== 'string' ||
      typeof receipt.committedAt !== 'string' ||
      receipt.expectedRevisionWasProvided !== true ||
      (receipt.commandName === 'control.create'
        ? receipt.expectedRevision !== null
        : receipt.expectedRevision !== revision - 1) ||
      !controlReceiptResultMatches(receipt.result, controlId, revision) ||
      !timestampWithinCommandWindow(version.recordedAt, receipt.committedAt)
    ) {
      return { verified: false, version, receipt: receipt ?? null, audit: null };
    }
    const auditSnapshot = await db.doc(
      `tenants/${tenantId}/audit_logs/${receipt.auditLogId}`
    ).get();
    const audit = auditSnapshot.data();
    if (
      !auditSnapshot.exists ||
      !isPlainRecord(audit) ||
      audit.id !== auditSnapshot.id ||
      audit.tenantId !== tenantId ||
      audit.actorId !== receipt.actorId ||
      audit.actorRole !== receipt.actorRole ||
      audit.entityType !== 'control' ||
      audit.entityId !== controlId ||
      audit.action !== receipt.auditAction ||
      audit.workflowContext !== receipt.auditWorkflowContext ||
      audit.source !== 'cloud_function' ||
      !controlAuditAfterSummaryMatches(
        audit.afterSummary,
        controlId,
        revision,
        versionId,
        stateHash,
        artifactHash
      ) ||
      !timestampWithinCommandWindow(version.recordedAt, audit.timestamp) ||
      !timestampWithinCommandWindow(audit.timestamp, receipt.committedAt)
    ) {
      return { verified: false, version, receipt, audit: audit ?? null };
    }
    return { verified: true, version, receipt, audit };
  } catch {
    return { verified: false, version: null, receipt: null, audit: null };
  }
}

/**
 * Reusable fail-closed verifier for every server-side consumer of control
 * assurance. Raw `status` and `healthScore` fields are never sufficient.
 */
export async function verifyControlCurrentArtifact(
  tenantId: string,
  document: DocumentSnapshot,
  asOf = new Date().toISOString()
): Promise<ControlTrustResult> {
  const unverified = (
    assuranceReason: ControlTrustResult['assuranceReason'] = 'workflow_unverified'
  ): ControlTrustResult => ({
    workflowTrusted: false,
    assuranceTrusted: false,
    assuranceReason,
  });
  try {
    if (!document.exists) return unverified();
    const control = document.data() as GovernedControlRecord;
    assertControlIdentity(control, tenantId, document.id);
    const artifact = await verifyVersionReceiptAudit(tenantId, document.id, control);
    if (!artifact.verified || !artifact.version || !artifact.receipt || !artifact.audit) {
      return unverified();
    }
    const commandName = artifact.receipt.commandName;
    if (control.workflowTrust === 'review_pending') {
      if (
        commandName !== 'control.review_submit' ||
        typeof control.pendingReviewId !== 'string' ||
        typeof control.pendingReviewAssigneeId !== 'string'
      ) {
        return unverified('review_unverified');
      }
      const [reviewSnapshot, eventSnapshot] = await db.getAll(
        db.doc(
          `tenants/${tenantId}/controls/${document.id}/reviews/${control.pendingReviewId}`
        ),
        db.doc(
          `tenants/${tenantId}/controls/${document.id}/review_events/${artifact.version.commandId}`
        )
      );
      const review = reviewSnapshot?.data() as GovernedControlReview | undefined;
      const event = eventSnapshot?.data();
      const auditAfter = isPlainRecord(artifact.audit.afterSummary)
        ? artifact.audit.afterSummary
        : null;
      if (
        !reviewSnapshot?.exists ||
        review?.schemaVersion !== CONTROL_REVIEW_SCHEMA_VERSION ||
        review.id !== control.pendingReviewId ||
        review.tenantId !== tenantId ||
        review.controlId !== document.id ||
        review.status !== 'pending_approval' ||
        review.submissionCommandId !== artifact.version.commandId ||
        review.resultingControlRevision !== controlRevision(control) ||
        review.reviewedControlRevision !== controlRevision(control) - 1 ||
        review.assignedReviewerId !== control.pendingReviewAssigneeId ||
        !eventSnapshot?.exists ||
        event?.schemaVersion !== CONTROL_REVIEW_EVENT_SCHEMA_VERSION ||
        event?.id !== artifact.version.commandId ||
        event?.tenantId !== tenantId ||
        event?.controlId !== document.id ||
        event?.reviewId !== review.id ||
        event?.eventType !== 'submitted' ||
        event?.reviewStatus !== 'pending_approval' ||
        event?.controlRevision !== controlRevision(control) ||
        event?.commandId !== review.submissionCommandId ||
        event?.actorId !== review.submittedBy ||
        event?.recordedAt !== review.submittedAt ||
        event?.reviewStateHash !==
          stableTrustedValueHash(review, 'control review submission') ||
        auditAfter?.reviewId !== review.id ||
        auditAfter?.reviewEventId !== review.submissionCommandId ||
        auditAfter?.reviewStateHash !==
          stableTrustedValueHash(review, 'control review submission') ||
        auditAfter?.evidenceAnchorsHash !==
          stableTrustedValueHash(
            review.evidenceAnchors,
            'control review submission evidence anchors'
          )
      ) {
        return unverified('review_unverified');
      }
      return {
        workflowTrusted: true,
        assuranceTrusted: false,
        assuranceReason: 'review_unverified',
      };
    }

    if (control.workflowTrust !== 'authoritative') {
      if (
        control.workflowTrust !== 'governed_unassured' &&
        control.workflowTrust !== 'retired'
      ) {
        return unverified();
      }
      if (control.status === 'not_applicable') {
        const reviewDue = Date.parse(control.nextReviewDate ?? '');
        if (
          commandName !== 'control.update' ||
          control.assuranceStatus !== 'not_applicable' ||
          typeof control.statusRationale !== 'string' ||
          control.statusRationale.trim().length < 10 ||
          control.statusDecidedBy !== artifact.receipt.actorId ||
          control.statusDecidedAt !== artifact.version.recordedAt ||
          !Number.isFinite(reviewDue)
        ) {
          return unverified();
        }
        return {
          workflowTrusted: true,
          assuranceTrusted: false,
          assuranceReason: reviewDue > Date.parse(asOf) ? 'not_required' : 'expired',
        };
      }
      return {
        workflowTrusted: true,
        assuranceTrusted: false,
        assuranceReason: 'workflow_unverified',
      };
    }

    if (
      commandName !== 'control.review_decide' ||
      typeof control.lastReviewId !== 'string' ||
      typeof control.lastReviewDecisionCommandId !== 'string' ||
      control.lastReviewDecisionCommandId !== artifact.version.commandId ||
      !Array.isArray(control.lastReviewEvidenceAnchors) ||
      !Array.isArray(control.lastReviewEvidenceIds)
    ) {
      return unverified('review_unverified');
    }
    const [reviewSnapshot, decisionEventSnapshot] = await db.getAll(
      db.doc(
        `tenants/${tenantId}/controls/${document.id}/reviews/${control.lastReviewId}`
      ),
      db.doc(
        `tenants/${tenantId}/controls/${document.id}/review_events/${control.lastReviewDecisionCommandId}`
      )
    );
    const review = reviewSnapshot?.data() as GovernedControlReview | undefined;
    const event = decisionEventSnapshot?.data();
    const auditAfter = isPlainRecord(artifact.audit.afterSummary)
      ? artifact.audit.afterSummary
      : null;
    if (
      !reviewSnapshot?.exists ||
      review?.schemaVersion !== CONTROL_REVIEW_SCHEMA_VERSION ||
      review.id !== control.lastReviewId ||
      review.tenantId !== tenantId ||
      review.controlId !== document.id ||
      review.status !== 'approved' ||
      review.decision !== 'approved' ||
      review.decisionCommandId !== control.lastReviewDecisionCommandId ||
      review.resultingControlRevision !== controlRevision(control) ||
      review.reviewerId === review.submittedBy ||
      review.reviewerId === control.ownerId ||
      review.implementationContributorIds.includes(review.reviewerId ?? '') ||
      !decisionEventSnapshot?.exists ||
      event?.schemaVersion !== CONTROL_REVIEW_EVENT_SCHEMA_VERSION ||
      event?.id !== control.lastReviewDecisionCommandId ||
      event?.tenantId !== tenantId ||
      event?.controlId !== document.id ||
      event?.reviewId !== review.id ||
      event?.eventType !== 'approved' ||
      event?.reviewStatus !== 'approved' ||
      event?.controlRevision !== controlRevision(control) ||
      event?.commandId !== review.decisionCommandId ||
      event?.actorId !== review.reviewerId ||
      event?.recordedAt !== review.reviewedAt ||
      event?.reviewStateHash !==
        stableTrustedValueHash(review, 'control review decision') ||
      event?.evidenceAnchorsHash !==
        stableTrustedValueHash(
          review.evidenceAnchors,
          'control review decision evidence anchors'
        ) ||
      !evidenceAnchorsMatch(review.evidenceAnchors, control.lastReviewEvidenceAnchors) ||
      auditAfter?.reviewId !== review.id ||
      auditAfter?.reviewEventId !== review.decisionCommandId ||
      auditAfter?.reviewStateHash !==
        stableTrustedValueHash(review, 'control review decision') ||
      auditAfter?.evidenceAnchorsHash !==
        stableTrustedValueHash(
          review.evidenceAnchors,
          'control review decision evidence anchors'
        )
    ) {
      return unverified('review_unverified');
    }
    const evidenceSnapshots = review.evidenceIds.length
      ? await db.getAll(
          ...review.evidenceIds.map((evidenceId) =>
            db.doc(`tenants/${tenantId}/evidence/${evidenceId}`)
          )
        )
      : [];
    let currentAnchors: EvidenceAnchor[];
    try {
      currentAnchors = evidenceSnapshots.map((snapshot, index) => {
        if (!snapshot.exists) {
          throw new Error('missing evidence');
        }
        return evidenceAnchor(
          snapshot.data() as Evidence,
          tenantId,
          review.evidenceIds[index]!,
          document.id,
          asOf
        );
      });
    } catch {
      return {
        workflowTrusted: true,
        assuranceTrusted: false,
        assuranceReason: 'evidence_unverified',
      };
    }
    if (!evidenceAnchorsMatch(review.evidenceAnchors, currentAnchors)) {
      return {
        workflowTrusted: true,
        assuranceTrusted: false,
        assuranceReason: 'evidence_unverified',
      };
    }
    const nextReviewMillis = Date.parse(control.nextReviewDate ?? '');
    if (!Number.isFinite(nextReviewMillis) || nextReviewMillis <= Date.parse(asOf)) {
      return {
        workflowTrusted: true,
        assuranceTrusted: false,
        assuranceReason: 'expired',
      };
    }
    const expectedStatus =
      review.effectiveness === 'effective'
        ? 'implemented'
        : review.effectiveness === 'needs_improvement'
          ? 'partially_implemented'
          : 'in_progress';
    const expectedHealth =
      review.effectiveness === 'effective'
        ? 100
        : review.effectiveness === 'needs_improvement'
          ? 60
          : 20;
    if (
      control.status !== expectedStatus ||
      control.healthScore !== expectedHealth ||
      control.assuranceStatus !== review.effectiveness ||
      control.lastReviewEffectiveness !== review.effectiveness
    ) {
      return unverified('review_unverified');
    }
    return {
      workflowTrusted: true,
      assuranceTrusted: true,
      assuranceReason: 'authoritative',
    };
  } catch {
    return unverified();
  }
}

function projectControl(
  control: GovernedControlRecord,
  trust: ControlTrustResult,
  full: boolean
): Record<string, unknown> {
  const workflowTrust = trust.workflowTrusted
    ? control.workflowTrust
    : 'legacy_unverified';
  const assuranceStatus = trust.assuranceTrusted
    ? control.assuranceStatus
    : trust.assuranceReason === 'expired'
      ? 'expired'
      : control.assuranceStatus === 'not_applicable' && trust.workflowTrusted
        ? 'not_applicable'
        : control.assuranceStatus === 'pending_review' && trust.workflowTrusted
          ? 'pending_review'
          : 'untested';
  const recordedStatus = CONTROL_STATUSES.has(control.status)
    ? control.status
    : 'invalid_recorded_status';
  const status =
    (recordedStatus === 'implemented' || recordedStatus === 'partially_implemented') &&
    !trust.assuranceTrusted
      ? 'in_progress'
      : recordedStatus;
  const common = {
    id: control.id,
    tenantId: control.tenantId,
    code: control.code,
    title: control.title,
    domain: control.domain,
    frameworkIds: Array.isArray(control.frameworkIds) ? control.frameworkIds : [],
    requirementIds: Array.isArray(control.requirementIds) ? control.requirementIds : [],
    status,
    recordedStatus,
    healthScore: trust.assuranceTrusted ? control.healthScore : 0,
    ownerId: control.ownerId,
    revision: Number.isSafeInteger(control.revision) ? control.revision : 0,
    workflowTrust,
    assuranceStatus,
    assuranceReason: trust.assuranceReason,
    currentArtifactVerified: trust.workflowTrusted,
    lastReviewDate: control.lastReviewDate ?? null,
    nextReviewDate: control.nextReviewDate ?? null,
    lastReviewId: control.lastReviewId ?? null,
    lastReviewEffectiveness: trust.assuranceTrusted
      ? control.lastReviewEffectiveness ?? null
      : null,
    pendingReviewId: control.pendingReviewId ?? null,
    pendingReviewAssigneeId: control.pendingReviewAssigneeId ?? null,
    pendingReviewSubmittedAt: control.pendingReviewSubmittedAt ?? null,
    pendingReviewSubmittedBy: control.pendingReviewSubmittedBy ?? null,
    retiredAt: control.retiredAt ?? null,
    updatedAt: control.updatedAt,
  };
  return full
    ? {
        ...control,
        ...common,
        lastReviewEvidenceIds: trust.assuranceTrusted
          ? control.lastReviewEvidenceIds ?? []
          : [],
      }
    : common;
}

/**
 * Shared fail-closed summary for dashboards and exports. Assurance-only fields
 * are redacted unless the complete current workflow artifact verifies.
 */
export function projectControlAssuranceSummary(
  control: Control,
  trust: ControlTrustResult
): Record<string, unknown> {
  return projectControl(control as GovernedControlRecord, trust, false);
}

/** Bounded verified control summaries; raw Firestore control reads are denied. */
export const listTenantControls = onCall<ListControlsInput>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = normalizeListControlsInput(request.data);
    const auth = await requireTenantMember(request, input.tenantId);
    let query: FirebaseFirestore.Query = db
      .collection(`tenants/${input.tenantId}/controls`)
      .orderBy(FieldPath.documentId());
    if (input.frameworkId) {
      query = query.where('frameworkIds', 'array-contains', input.frameworkId);
    }
    if (input.status) query = query.where('status', '==', input.status);
    if (input.domain) query = query.where('domain', '==', input.domain);
    if (input.ownerId) query = query.where('ownerId', '==', input.ownerId);
    if (input.cursor) query = query.startAfter(input.cursor);
    const snapshot = await query.limit(input.pageSize + 1).get();
    const documents = snapshot.docs.slice(0, input.pageSize);
    const projected = await Promise.all(
      documents.map(async (document) => {
        const control = document.data() as GovernedControlRecord;
        assertControlIdentity(control, input.tenantId, document.id);
        const trust = await verifyControlCurrentArtifact(input.tenantId, document);
        const full =
          FULL_CONTROL_READ_ROLES.has(auth.role) ||
          (auth.role === 'contributor' && control.ownerId === auth.userId);
        return projectControl(control, trust, full);
      })
    );
    const truncated = snapshot.size > input.pageSize;
    return {
      success: true,
      controls: projected,
      count: projected.length,
      truncated,
      nextCursor: truncated ? documents.at(-1)?.id ?? null : null,
      pageSummary: {
        authoritative: projected.filter((control) => control.workflowTrust === 'authoritative').length,
        reviewPending: projected.filter((control) => control.workflowTrust === 'review_pending').length,
        legacyUnverified: projected.filter((control) => control.workflowTrust === 'legacy_unverified').length,
        overdue: projected.filter((control) => control.assuranceStatus === 'expired').length,
      },
    };
  }
);

/** Full least-privilege control detail with a verified pending-review projection. */
export const getTenantControlDetail = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = normalizeGetControlInput(request.data);
    const auth = await requireTenantMember(request, input.tenantId);
    const controlSnapshot = await db.doc(
      `tenants/${input.tenantId}/controls/${input.controlId}`
    ).get();
    if (!controlSnapshot.exists) {
      throw new HttpsError('not-found', 'Control does not exist.');
    }
    const control = controlSnapshot.data() as GovernedControlRecord;
    assertControlIdentity(control, input.tenantId, input.controlId);
    const trust = await verifyControlCurrentArtifact(input.tenantId, controlSnapshot);
    const full =
      FULL_CONTROL_READ_ROLES.has(auth.role) ||
      (auth.role === 'contributor' && control.ownerId === auth.userId);
    const projection = projectControl(control, trust, full);
    let pendingReview: Record<string, unknown> | null = null;
    if (
      full &&
      trust.workflowTrusted &&
      control.workflowTrust === 'review_pending' &&
      typeof control.pendingReviewId === 'string'
    ) {
      const reviewSnapshot = await controlSnapshot.ref
        .collection('reviews')
        .doc(control.pendingReviewId)
        .get();
      const review = reviewSnapshot.data() as GovernedControlReview | undefined;
      if (
        reviewSnapshot.exists &&
        review?.id === reviewSnapshot.id &&
        review.tenantId === input.tenantId &&
        review.controlId === input.controlId &&
        review.status === 'pending_approval'
      ) {
        pendingReview = {
          id: review.id,
          controlId: review.controlId,
          status: review.status,
          assignedReviewerId: review.assignedReviewerId,
          submittedBy: review.submittedBy,
          submittedAt: review.submittedAt,
          effectiveness: review.effectiveness,
          notes: review.notes,
          testMethod: review.testMethod,
          testPeriodStart: review.testPeriodStart,
          testPeriodEnd: review.testPeriodEnd,
          sampleSize: review.sampleSize,
          exceptions: review.exceptions,
          evidenceIds: review.evidenceIds,
          reviewedControlRevision: review.reviewedControlRevision,
          resultingControlRevision: review.resultingControlRevision,
        };
      }
    }
    const processorCertifications = await db
      .collection(`tenants/${input.tenantId}/processor_certifications`)
      .where('linkedControlIds', 'array-contains', input.controlId)
      .limit(101)
      .get();
    if (processorCertifications.size > 100) {
      throw new HttpsError(
        'resource-exhausted',
        'Linked processor assurance exceeds the bounded detail limit.'
      );
    }
    return {
      success: true,
      control: projection,
      pendingReview,
      linkedProcessorCertificationIds: processorCertifications.docs.map(
        (document) => document.id
      ),
    };
  }
);

function submittedReviewState(review: GovernedControlReview): GovernedControlReview {
  return canonical({
    ...review,
    status: 'pending_approval',
    reviewerId: null,
    reviewerRole: null,
    decision: null,
    decisionNotes: null,
    decisionCommandId: null,
    decidedBy: null,
    reviewedAt: null,
    resultingControlRevision: review.reviewedControlRevision + 1,
  });
}

function invalidReviewHistory(
  revision: unknown,
  commandName: unknown
): Record<string, unknown> {
  return {
    kind: 'control_review',
    revision,
    commandName,
    integrityStatus: 'invalid',
  };
}

async function projectedReviewForVersion(
  tenantId: string,
  controlId: string,
  version: Record<string, unknown>,
  receipt: Record<string, unknown>,
  audit: Record<string, unknown>
): Promise<Record<string, unknown> | null> {
  const commandName = receipt.commandName;
  if (commandName !== 'control.review_submit' && commandName !== 'control.review_decide') {
    return null;
  }
  const invalid = (): Record<string, unknown> =>
    invalidReviewHistory(version.revision, commandName);
  try {
    const state = isPlainRecord(version.state) ? version.state : null;
    const auditAfter = isPlainRecord(audit.afterSummary) ? audit.afterSummary : null;
    const reviewId = auditAfter?.reviewId;
    const commandId = receipt.commandId;
    if (
      !state ||
      typeof reviewId !== 'string' ||
      typeof commandId !== 'string' ||
      auditAfter?.reviewEventId !== commandId
    ) {
      return invalid();
    }
    const [reviewSnapshot, eventSnapshot] = await db.getAll(
      db.doc(`tenants/${tenantId}/controls/${controlId}/reviews/${reviewId}`),
      db.doc(`tenants/${tenantId}/controls/${controlId}/review_events/${commandId}`)
    );
    const review = reviewSnapshot?.data() as GovernedControlReview | undefined;
    const event = eventSnapshot?.data();
    if (
      !reviewSnapshot?.exists ||
      !review ||
      review.schemaVersion !== CONTROL_REVIEW_SCHEMA_VERSION ||
      review.id !== reviewId ||
      review.tenantId !== tenantId ||
      review.controlId !== controlId ||
      !Array.isArray(review.evidenceIds) ||
      !Array.isArray(review.evidenceAnchors) ||
      !Array.isArray(review.implementationContributorIds) ||
      !Number.isSafeInteger(review.reviewedControlRevision) ||
      review.reviewedControlRevision < 1 ||
      !Number.isSafeInteger(review.resultingControlRevision) ||
      !eventSnapshot?.exists ||
      !isPlainRecord(event) ||
      event.schemaVersion !== CONTROL_REVIEW_EVENT_SCHEMA_VERSION ||
      event.id !== commandId ||
      event.tenantId !== tenantId ||
      event.controlId !== controlId ||
      event.reviewId !== reviewId ||
      event.commandId !== commandId ||
      event.actorId !== receipt.actorId ||
      event.actorRole !== receipt.actorRole ||
      event.recordedAt !== version.recordedAt
    ) {
      return invalid();
    }

    let reviewForCommand: GovernedControlReview;
    if (commandName === 'control.review_submit') {
      reviewForCommand = submittedReviewState(review);
      if (
        review.submissionCommandId !== commandId ||
        reviewForCommand.resultingControlRevision !== version.revision ||
        reviewForCommand.submittedBy !== receipt.actorId ||
        reviewForCommand.submittedAt !== version.recordedAt ||
        state.pendingReviewId !== reviewId ||
        state.pendingReviewAssigneeId !== reviewForCommand.assignedReviewerId ||
        state.pendingReviewSubmittedBy !== reviewForCommand.submittedBy ||
        state.pendingReviewSubmittedAt !== reviewForCommand.submittedAt ||
        state.workflowTrust !== 'review_pending' ||
        event.eventType !== 'submitted' ||
        event.reviewStatus !== 'pending_approval' ||
        event.controlRevision !== version.revision
      ) {
        return invalid();
      }
    } else {
      reviewForCommand = review;
      if (
        (review.status !== 'approved' && review.status !== 'rejected') ||
        review.decisionCommandId !== commandId ||
        review.decision !== event.eventType ||
        review.status !== event.reviewStatus ||
        review.resultingControlRevision !== version.revision ||
        review.reviewerId !== receipt.actorId ||
        review.reviewedAt !== version.recordedAt ||
        review.decidedBy !== receipt.actorId ||
        state.lastReviewId !== reviewId ||
        state.lastReviewDecisionCommandId !== commandId ||
        state.pendingReviewId !== null ||
        event.controlRevision !== version.revision
      ) {
        return invalid();
      }

      const submitted = submittedReviewState(review);
      const submissionRevision = submitted.resultingControlRevision;
      const [submissionVersionSnapshot, submissionEventSnapshot] = await db.getAll(
        db.doc(
          `tenants/${tenantId}/controls/${controlId}/versions/${controlVersionId(
            submissionRevision
          )}`
        ),
        db.doc(
          `tenants/${tenantId}/controls/${controlId}/review_events/${review.submissionCommandId}`
        )
      );
      const submissionVersion = submissionVersionSnapshot?.data();
      const submissionEvent = submissionEventSnapshot?.data();
      if (
        !submissionVersionSnapshot?.exists ||
        !isPlainRecord(submissionVersion) ||
        !isPlainRecord(submissionVersion.state) ||
        !submissionEventSnapshot?.exists ||
        !isPlainRecord(submissionEvent)
      ) {
        return invalid();
      }
      const submissionArtifact = await verifyVersionReceiptAudit(
        tenantId,
        controlId,
        submissionVersion.state as unknown as GovernedControlRecord
      );
      const submissionAuditAfter = isPlainRecord(submissionArtifact.audit?.afterSummary)
        ? submissionArtifact.audit.afterSummary
        : null;
      if (
        !submissionArtifact.verified ||
        submissionArtifact.receipt?.commandName !== 'control.review_submit' ||
        submissionVersion.revision !== submissionRevision ||
        review.submissionCommandId !== submissionVersion.commandId ||
        submissionEvent.id !== review.submissionCommandId ||
        submissionEvent.tenantId !== tenantId ||
        submissionEvent.controlId !== controlId ||
        submissionEvent.reviewId !== reviewId ||
        submissionEvent.eventType !== 'submitted' ||
        submissionEvent.reviewStatus !== 'pending_approval' ||
        submissionEvent.controlRevision !== submissionRevision ||
        submissionEvent.commandId !== review.submissionCommandId ||
        submissionEvent.actorId !== review.submittedBy ||
        submissionEvent.recordedAt !== review.submittedAt ||
        submissionEvent.reviewStateHash !==
          stableTrustedValueHash(submitted, 'control review submission') ||
        submissionAuditAfter?.reviewId !== reviewId ||
        submissionAuditAfter?.reviewEventId !== review.submissionCommandId ||
        submissionAuditAfter?.reviewStateHash !==
          stableTrustedValueHash(submitted, 'control review submission') ||
        submissionAuditAfter?.evidenceAnchorsHash !==
          stableTrustedValueHash(
            submitted.evidenceAnchors,
            'control review submission evidence anchors'
          )
      ) {
        return invalid();
      }
    }

    const reviewHashContext =
      commandName === 'control.review_submit'
        ? 'control review submission'
        : 'control review decision';
    const evidenceHashContext =
      commandName === 'control.review_submit'
        ? 'control review submission evidence anchors'
        : 'control review decision evidence anchors';
    if (
      event.reviewStateHash !== stableTrustedValueHash(reviewForCommand, reviewHashContext) ||
      auditAfter?.reviewStateHash !==
        stableTrustedValueHash(reviewForCommand, reviewHashContext) ||
      auditAfter?.evidenceAnchorsHash !==
        stableTrustedValueHash(reviewForCommand.evidenceAnchors, evidenceHashContext) ||
      (commandName === 'control.review_decide' &&
        event.evidenceAnchorsHash !==
          stableTrustedValueHash(reviewForCommand.evidenceAnchors, evidenceHashContext))
    ) {
      return invalid();
    }

    return {
      kind: 'control_review',
      id: review.id,
      revision: version.revision,
      status: reviewForCommand.status,
      effectiveness: reviewForCommand.effectiveness,
      submittedBy: reviewForCommand.submittedBy,
      submittedAt: reviewForCommand.submittedAt,
      assignedReviewerId: reviewForCommand.assignedReviewerId,
      reviewerId: reviewForCommand.reviewerId,
      reviewedAt: reviewForCommand.reviewedAt,
      decision: reviewForCommand.decision,
      decisionNotes: reviewForCommand.decisionNotes,
      testMethod: reviewForCommand.testMethod,
      testPeriodStart: reviewForCommand.testPeriodStart,
      testPeriodEnd: reviewForCommand.testPeriodEnd,
      sampleSize: reviewForCommand.sampleSize,
      exceptions: reviewForCommand.exceptions,
      evidenceIds: reviewForCommand.evidenceIds,
      integrityStatus: 'verified',
    };
  } catch {
    return invalid();
  }
}

async function projectedVersionHistory(
  tenantId: string,
  controlId: string,
  versionDocument: DocumentSnapshot
): Promise<Record<string, unknown>> {
  const version = versionDocument.data();
  if (!versionDocument.exists || !isPlainRecord(version)) {
    return { versionId: versionDocument.id, integrityStatus: 'invalid' };
  }
  let stateHashValid = false;
  let versionIdentityValid = false;
  let artifactHashValid = false;
  try {
    const revision = version.revision;
    const state = isPlainRecord(version.state) ? version.state : null;
    versionIdentityValid =
      version.schemaVersion === CONTROL_VERSION_SCHEMA_VERSION &&
      Number.isSafeInteger(revision) &&
      (revision as number) >= 0 &&
      versionDocument.id === controlVersionId(revision as number) &&
      version.id === versionDocument.id &&
      version.tenantId === tenantId &&
      version.controlId === controlId &&
      state?.id === controlId &&
      state?.tenantId === tenantId;
    stateHashValid =
      versionIdentityValid &&
      typeof version.stateHash === 'string' &&
      stableTrustedValueHash(version.state, 'history control version state') ===
        version.stateHash;
    artifactHashValid =
      versionIdentityValid &&
      typeof version.artifactHash === 'string' &&
      controlVersionArtifactHash(version) === version.artifactHash;
  } catch {
    stateHashValid = false;
    artifactHashValid = false;
  }
  let receipt: Record<string, unknown> | null = null;
  let audit: Record<string, unknown> | null = null;
  let commandVerified = false;
  if (
    stateHashValid &&
    artifactHashValid &&
    isPlainRecord(version.state) &&
    typeof version.commandId === 'string'
  ) {
    const artifact = await verifyVersionReceiptAudit(
      tenantId,
      controlId,
      version.state as unknown as GovernedControlRecord
    );
    commandVerified = artifact.verified;
    receipt = artifact.receipt;
    audit = artifact.audit;
  }
  const review =
    commandVerified && receipt && audit
      ? await projectedReviewForVersion(tenantId, controlId, version, receipt, audit)
      : null;
  const reviewCommand =
    receipt?.commandName === 'control.review_submit' ||
    receipt?.commandName === 'control.review_decide';
  const reviewVerified = !reviewCommand || review?.integrityStatus === 'verified';
  const legacyBaseline =
    versionIdentityValid &&
    version.revision === 0 &&
    version.commandId === null &&
    version.previousVersionId === null &&
    version.previousStateHash === null &&
    version.previousArtifactHash === null &&
    version.recordedBy === null &&
    typeof version.capturedByCommandId === 'string' &&
    typeof version.capturedBy === 'string' &&
    version.provenance === 'legacy_baseline_captured_on_first_command';
  return {
    versionId: versionDocument.id,
    revision: version.revision,
    state: version.state,
    stateHash: version.stateHash,
    versionArtifactHash: version.artifactHash,
    previousStateHash: version.previousStateHash ?? null,
    previousArtifactHash: version.previousArtifactHash ?? null,
    changedFields: Array.isArray(version.changedFields) ? version.changedFields : [],
    recordedBy: version.recordedBy ?? null,
    recordedAt: version.recordedAt,
    provenance: version.provenance,
    integrityStatus:
      stateHashValid &&
      artifactHashValid &&
      (commandVerified || legacyBaseline) &&
      reviewVerified
        ? legacyBaseline
          ? 'legacy_baseline'
          : 'verified'
        : 'invalid',
    command: receipt
      ? {
          commandId: receipt.commandId,
          commandName: receipt.commandName,
          committedAt: receipt.committedAt,
        }
      : null,
    audit: audit
      ? {
          action: audit.action,
          actorId: audit.actorId,
          actorRole: audit.actorRole,
          timestamp: audit.timestamp,
          workflowContext: audit.workflowContext,
        }
      : null,
    review,
  };
}

/** Paged immutable version/review history for assurance and audit personas. */
export const getTenantControlHistory = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = normalizeGetControlHistoryInput(request.data);
    await requireTenantMember(request, input.tenantId, [
      'tenant_admin',
      'compliance_manager',
      'security_manager',
      'privacy_manager',
      'ai_governance_manager',
      'auditor',
      'approver',
    ]);
    const controlRef = db.doc(`tenants/${input.tenantId}/controls/${input.controlId}`);
    const controlSnapshot = await controlRef.get();
    if (!controlSnapshot.exists) {
      throw new HttpsError('not-found', 'Control does not exist.');
    }
    assertControlIdentity(
      controlSnapshot.data() as GovernedControlRecord,
      input.tenantId,
      input.controlId
    );
    let query: FirebaseFirestore.Query = controlRef
      .collection('versions')
      .orderBy('revision', 'desc');
    if (input.cursorRevision !== undefined) {
      query = query.startAfter(input.cursorRevision);
    }
    const versionsSnapshot = await query.limit((input.pageSize ?? 20) + 1).get();
    const versionDocuments = versionsSnapshot.docs.slice(0, input.pageSize);
    const history = await Promise.all(
      versionDocuments.map((document) =>
        projectedVersionHistory(input.tenantId, input.controlId, document)
      )
    );
    const truncated = versionsSnapshot.size > (input.pageSize ?? 20);
    return {
      success: true,
      history,
      truncated,
      nextCursorRevision: truncated
        ? (history.at(-1)?.revision as number | undefined) ?? null
        : null,
    };
  }
);

/** Minimal active reviewer directory; no global user/profile enumeration. */
export const listTenantControlReviewers = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    if (!isPlainRecord(request.data)) {
      throw new HttpsError('invalid-argument', 'Reviewer list input must be an object.');
    }
    const unknown = Object.keys(request.data).filter((key) => key !== 'tenantId');
    if (unknown.length > 0) {
      throw new HttpsError(
        'invalid-argument',
        `Reviewer list input contains unsupported field(s): ${unknown.join(', ')}.`
      );
    }
    const tenantId = normalizeControlDocumentId(request.data.tenantId, 'tenantId');
    await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'security_manager',
      'privacy_manager',
      'ai_governance_manager',
      'contributor',
      'approver',
    ]);
    const memberships = await db
      .collection(`tenants/${tenantId}/memberships`)
      .where('status', '==', 'active')
      .limit(MAX_REVIEWERS + 1)
      .get();
    if (memberships.size > MAX_REVIEWERS) {
      throw new HttpsError(
        'resource-exhausted',
        'The reviewer directory exceeds the governed limit.'
      );
    }
    const eligible = memberships.docs
      .map((document) => {
        const membership = document.data() as TenantMembership;
        if (
          membership.id !== document.id ||
          membership.userId !== document.id ||
          membership.tenantId !== tenantId ||
          membership.status !== 'active' ||
          !isValidUserRole(membership.role)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'An active membership has inconsistent identity metadata.'
          );
        }
        return { document, membership };
      })
      .filter(({ membership }) => CONTROL_REVIEWER_ROLES.has(membership.role));
    const profiles = eligible.length
      ? await db.getAll(
          ...eligible.map(({ document }) => db.doc(`users/${document.id}`))
        )
      : [];
    const reviewers = eligible
      .map(({ document, membership }, index) => {
        const profile = profiles[index]?.data();
        return {
          userId: document.id,
          displayName:
            profile?.id === document.id &&
            typeof profile.displayName === 'string' &&
            profile.displayName.trim()
              ? profile.displayName.trim().slice(0, 200)
              : null,
          role: membership.role,
          department:
            typeof membership.department === 'string'
              ? membership.department.slice(0, 200)
              : '',
          title:
            typeof membership.title === 'string'
              ? membership.title.slice(0, 200)
              : '',
        };
      })
      .sort((left, right) =>
        (left.displayName || left.title || left.userId).localeCompare(
          right.displayName || right.title || right.userId
        )
      );
    return { success: true, reviewers, count: reviewers.length };
  }
);

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  isValidUserRole,
  type AuditActionType,
  type Policy,
  type PolicyStatus,
  type PolicyWorkflowTrust,
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
  normalizeCommandId,
  stableTrustedValueHash,
  type TenantCommandContext,
  type TenantCommandEnvelope,
} from '../lib/command-boundary.js';
import {
  commandJsonByteLength,
  serializeTrustedCommandJson,
} from '../lib/command-boundary-values.js';
import {
  rolesForTenantAction,
  type TenantPermissionAction,
} from '../lib/action-permissions.js';
import {
  assertLegalPolicyTransition,
  assertPolicyReviewDateIsReasonable,
  normalizeCreatePolicyPayload,
  normalizePolicyCode,
  normalizePolicyDocumentId,
  normalizePolicyTransitionPayload,
  normalizeRetirePolicyPayload,
  normalizeUpdatePolicyPayload,
  type NormalizedPolicyTransitionPayload,
  type NormalizedRetirePolicyPayload,
  type NormalizedUpdatePolicyPayload,
} from '../lib/policy-validation.js';

export type CreatePolicyInput = TenantCommandEnvelope;
export type UpdatePolicyInput = TenantCommandEnvelope;
export type TransitionPolicyStatusInput = TenantCommandEnvelope;
export type DeletePolicyInput = TenantCommandEnvelope;

export interface ListPoliciesInput {
  tenantId: string;
  status?: PolicyStatus;
  linkedControlId?: string;
  pageSize?: number;
  cursor?: string;
}

export interface GetPolicyInput {
  tenantId: string;
  policyId: string;
}

export interface GetPolicyHistoryInput extends GetPolicyInput {
  pageSize?: number;
  cursorRevision?: number;
}

type PolicyTransitionTarget = Exclude<PolicyStatus, 'retired'>;
type PolicyTransitionCommandName =
  | 'policy.submit_review'
  | 'policy.return_draft'
  | 'policy.approve'
  | 'policy.activate';

const POLICY_VERSION_SCHEMA_VERSION = 1;
const POLICY_COMMAND_VERSION = 1;
const POLICY_WORKFLOW_SCHEMA_VERSION = 1;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const OPERATIONAL_POLICY_OWNER_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'privacy_manager',
  'ai_governance_manager',
  'security_manager',
  'contributor',
]);
const POLICY_REVIEW_ASSIGNEE_ROLES = new Set<UserRole>([
  'tenant_admin',
  'approver',
]);
const POLICY_STATUSES = new Set<PolicyStatus>([
  'draft',
  'under_review',
  'approved',
  'active',
  'retired',
]);

function addDays(isoDate: string, days: number): string {
  return new Date(Date.parse(isoDate) + days * 24 * 60 * 60 * 1_000).toISOString();
}

function policyRevision(policy: Policy): number {
  const revision = policy.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new HttpsError(
      'failed-precondition',
      'Policy revision metadata is invalid and must be repaired before mutation.'
    );
  }
  return revision;
}

function policyVersionId(revision: number): string {
  return `r${String(revision).padStart(10, '0')}`;
}

function policyCodeReservationId(code: string): string {
  return stableTrustedValueHash({ code }, 'policy code reservation key');
}

interface PolicyCodeReservationPlan {
  apply: (transaction: Transaction) => void;
}

async function preparePolicyCodeReservation(
  transaction: Transaction,
  tenantId: string,
  policyId: string,
  code: string,
  previousCode: string | null,
  actorId: string,
  recordedAt: string
): Promise<PolicyCodeReservationPlan> {
  const collection = db.collection(`tenants/${tenantId}/policy_code_reservations`);
  const reservationId = policyCodeReservationId(code);
  const reservationRef = collection.doc(reservationId);
  const reservationSnapshot = await transaction.get(reservationRef);
  const reservation = reservationSnapshot.exists
    ? reservationSnapshot.data()
    : undefined;
  if (
    reservation &&
    (reservation.id !== reservationId ||
      reservation.tenantId !== tenantId ||
      reservation.policyId !== policyId ||
      reservation.code !== code)
  ) {
    throw new HttpsError('already-exists', `Policy code '${code}' is already reserved.`);
  }

  const duplicates = await transaction.get(
    db.collection(`tenants/${tenantId}/policies`).where('code', '==', code).limit(2)
  );
  if (duplicates.docs.some((document) => document.id !== policyId)) {
    throw new HttpsError('already-exists', `A policy with code '${code}' already exists.`);
  }

  let previousReservationRef: DocumentReference | null = null;
  let deletePreviousReservation = false;
  if (previousCode !== null && previousCode !== code) {
    previousReservationRef = collection.doc(policyCodeReservationId(previousCode));
    const previousSnapshot = await transaction.get(previousReservationRef);
    if (previousSnapshot.exists) {
      const previousReservation = previousSnapshot.data();
      if (
        previousReservation?.tenantId !== tenantId ||
        previousReservation?.policyId !== policyId ||
        previousReservation?.code !== previousCode
      ) {
        throw new HttpsError(
          'failed-precondition',
          'The previous policy-code reservation is inconsistent.'
        );
      }
      deletePreviousReservation = true;
    }
  }

  return {
    apply: (writeTransaction) => {
      if (!reservationSnapshot.exists) {
        writeTransaction.create(reservationRef, {
          schemaVersion: 1,
          id: reservationId,
          tenantId,
          policyId,
          code,
          reservedBy: actorId,
          reservedAt: recordedAt,
        });
      }
      if (deletePreviousReservation && previousReservationRef) {
        writeTransaction.delete(previousReservationRef);
      }
    },
  };
}

function canonicalPolicyState(policy: Policy): Policy {
  return JSON.parse(JSON.stringify(policy)) as Policy;
}

function changedPolicyFields(before: Policy | null, after: Policy): string[] {
  if (!before) return Object.keys(after).sort();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(before[key as keyof Policy]) !==
        JSON.stringify(after[key as keyof Policy])
    )
    .sort();
}

interface PriorPolicyVersionAnchor {
  versionId: string | null;
  stateHash: string | null;
  captureLegacyBaseline: boolean;
  commandId: string | null;
  recordedBy: string | null;
}

async function preparePriorPolicyVersion(
  transaction: Transaction,
  policyRef: DocumentReference,
  previous: Policy | null
): Promise<PriorPolicyVersionAnchor> {
  if (!previous) {
    return {
      versionId: null,
      stateHash: null,
      captureLegacyBaseline: false,
      commandId: null,
      recordedBy: null,
    };
  }

  const previousState = canonicalPolicyState(previous);
  const revision = policyRevision(previousState);
  const versionId = policyVersionId(revision);
  const stateHash = stableTrustedValueHash(previousState, 'previous policy state');
  const versionSnapshot = await transaction.get(
    policyRef.collection('versions').doc(versionId)
  );
  if (!versionSnapshot.exists) {
    if (revision !== 0) {
      throw new HttpsError(
        'failed-precondition',
        'The prior immutable policy version is missing; mutation is blocked to preserve continuity.'
      );
    }
    return {
      versionId,
      stateHash,
      captureLegacyBaseline: true,
      commandId: null,
      recordedBy: null,
    };
  }

  const version = versionSnapshot.data();
  const versionStateHash = isPlainRecord(version?.state)
    ? stableTrustedValueHash(version.state, 'stored prior policy version state')
    : null;
  const priorChainIsValid =
    revision === 0
      ? version?.previousVersionId === null &&
        version?.previousStateHash === null &&
        version?.commandId === null &&
        version?.provenance === 'legacy_baseline_captured_on_first_command'
      : revision === 1
        ? ((version?.previousVersionId === null &&
            version?.previousStateHash === null) ||
            (version?.previousVersionId === policyVersionId(0) &&
              typeof version?.previousStateHash === 'string' &&
              SHA256_PATTERN.test(version.previousStateHash))) &&
          typeof version?.commandId === 'string' &&
          typeof version?.recordedBy === 'string'
      : version?.previousVersionId === policyVersionId(revision - 1) &&
        typeof version?.previousStateHash === 'string' &&
        SHA256_PATTERN.test(version.previousStateHash) &&
        typeof version?.commandId === 'string' &&
        typeof version?.recordedBy === 'string';
  if (
    !isPlainRecord(version) ||
    version.schemaVersion !== POLICY_VERSION_SCHEMA_VERSION ||
    version.id !== versionId ||
    version.tenantId !== previous.tenantId ||
    version.policyId !== policyRef.id ||
    version.revision !== revision ||
    version.stateHash !== stateHash ||
    versionStateHash !== stateHash ||
    !priorChainIsValid ||
    !Array.isArray(version.changedFields) ||
    version.changedFields.some((field) => typeof field !== 'string')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The prior immutable policy version diverges from current state; mutation is blocked.'
    );
  }
  return {
    versionId,
    stateHash,
    captureLegacyBaseline: false,
    commandId: typeof version.commandId === 'string' ? version.commandId : null,
    recordedBy: typeof version.recordedBy === 'string' ? version.recordedBy : null,
  };
}

function writePolicyVersion(
  transaction: Transaction,
  policyRef: DocumentReference,
  policy: Policy,
  previous: Policy | null,
  priorAnchor: PriorPolicyVersionAnchor,
  actorId: string,
  commandId: string,
  recordedAt: string
): { versionId: string; stateHash: string; changedFields: string[] } {
  const state = canonicalPolicyState(policy);
  const previousState = previous ? canonicalPolicyState(previous) : null;
  const revision = policyRevision(state);
  const versionId = policyVersionId(revision);
  const stateHash = stableTrustedValueHash(state, 'policy state');
  const changedFields = changedPolicyFields(previousState, state);
  if (previousState && priorAnchor.captureLegacyBaseline) {
    const baselineVersionId = policyVersionId(0);
    transaction.create(policyRef.collection('versions').doc(baselineVersionId), {
      schemaVersion: POLICY_VERSION_SCHEMA_VERSION,
      id: baselineVersionId,
      tenantId: policy.tenantId,
      policyId: policy.id,
      revision: 0,
      state: previousState,
      stateHash: stableTrustedValueHash(previousState, 'legacy policy baseline state'),
      previousVersionId: null,
      previousStateHash: null,
      changedFields: Object.keys(previousState).sort(),
      commandId: null,
      capturedByCommandId: commandId,
      capturedBy: actorId,
      recordedBy: null,
      recordedAt,
      provenance: 'legacy_baseline_captured_on_first_command',
    });
  }

  transaction.create(policyRef.collection('versions').doc(versionId), {
    schemaVersion: POLICY_VERSION_SCHEMA_VERSION,
    id: versionId,
    tenantId: policy.tenantId,
    policyId: policy.id,
    revision,
    state,
    stateHash,
    previousVersionId:
      priorAnchor.versionId,
    previousStateHash: priorAnchor.stateHash,
    changedFields,
    commandId,
    recordedBy: actorId,
    recordedAt,
  });

  return { versionId, stateHash, changedFields };
}

function policyAuditSummary(
  policy: Policy,
  version: { versionId: string | null; stateHash: string; changedFields?: string[] }
): Record<string, unknown> {
  return {
    versionId: version.versionId,
    stateHash: version.stateHash,
    changedFields: version.changedFields ?? [],
    code: typeof policy.code === 'string' ? policy.code : null,
    title: typeof policy.title === 'string' ? policy.title : null,
    documentVersion: typeof policy.version === 'string' ? policy.version : null,
    status: typeof policy.status === 'string' ? policy.status : null,
    ownerId: typeof policy.ownerId === 'string' ? policy.ownerId : null,
    approverId: policy.approverId ?? null,
    approvedAt: policy.approvedAt ?? null,
    effectiveDate: policy.effectiveDate ?? null,
    nextReviewDate: policy.nextReviewDate ?? null,
    linkedControlCount: Array.isArray(policy.linkedControlIds)
      ? policy.linkedControlIds.length
      : null,
    attachmentTrust: policy.storagePath ? 'legacy_unverified_reference' : 'none',
    draftContributorCount: Array.isArray(policy.draftContributorIds)
      ? policy.draftContributorIds.length
      : null,
    reviewSubmittedBy: policy.reviewSubmittedBy ?? null,
    reviewSubmittedAt: policy.reviewSubmittedAt ?? null,
    reviewAssigneeId: policy.reviewAssigneeId ?? null,
    workflowSchemaVersion: policy.workflowSchemaVersion ?? null,
    workflowTrust: policy.workflowTrust ?? 'legacy_unverified',
    revision: policyRevision(policy),
  };
}

function assertPolicyCoreReadyForReview(policy: Policy): void {
  if (policy.storagePath !== null && policy.storagePath !== undefined) {
    throw new HttpsError(
      'failed-precondition',
      'A policy with an unverified legacy file reference cannot enter approval; clear or migrate the reference first.'
    );
  }
  if (
    typeof policy.contentMarkdown !== 'string' ||
    policy.contentMarkdown.trim().length < 200
  ) {
    throw new HttpsError(
      'failed-precondition',
      'A policy requires a substantive governed document body before review or approval.'
    );
  }

  try {
    const normalized = normalizeCreatePolicyPayload({
      code: policy.code,
      title: policy.title,
      version: policy.version,
      summary: policy.summary,
      scope: policy.scope,
      contentMarkdown: policy.contentMarkdown ?? null,
      storagePath: null,
      linkedControlIds: policy.linkedControlIds,
      ownerId: policy.ownerId,
    });
    if (
      normalized.code !== policy.code ||
      normalized.title !== policy.title ||
      normalized.version !== policy.version ||
      normalized.summary !== policy.summary ||
      normalized.scope !== policy.scope ||
      normalized.contentMarkdown !== (policy.contentMarkdown ?? null) ||
      normalized.ownerId !== policy.ownerId ||
      JSON.stringify(normalized.linkedControlIds) !==
        JSON.stringify(policy.linkedControlIds)
    ) {
      throw new Error('Policy core fields are not canonical.');
    }
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Policy content and relationship fields must be completed and normalized before review or approval.'
    );
  }
}

function policyDraftContributors(policy: Policy): string[] {
  const hasExplicitContributorHistory =
    policy.workflowSchemaVersion === POLICY_WORKFLOW_SCHEMA_VERSION &&
    policy.draftContributorIds !== undefined;
  const rawContributors = hasExplicitContributorHistory
    ? policy.draftContributorIds
    : [...new Set([policy.createdBy, policy.updatedBy])];
  if (!Array.isArray(rawContributors) || rawContributors.length > 100) {
    throw new HttpsError(
      'failed-precondition',
      'Policy draft-contributor metadata must be repaired before mutation.'
    );
  }
  try {
    const contributors = rawContributors.map((contributorId, index) => {
      const normalized = normalizePolicyDocumentId(
        contributorId,
        `Persisted draftContributorIds[${index}]`
      );
      if (normalized !== contributorId) throw new Error('Non-canonical contributor ID.');
      return normalized;
    });
    if (
      hasExplicitContributorHistory &&
      new Set(contributors).size !== contributors.length
    ) {
      throw new Error('Duplicate contributor ID.');
    }
    return contributors;
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Policy draft-contributor metadata must be repaired before mutation.'
    );
  }
}

function assertPolicyIdentity(
  policy: Policy,
  tenantId: string,
  policyId: string
): void {
  if (policy.id !== policyId || policy.tenantId !== tenantId) {
    throw new HttpsError(
      'failed-precondition',
      'Policy identity metadata does not match its authoritative path.'
    );
  }
}

async function resolvePolicyRevision(
  transaction: Transaction,
  tenantId: string,
  policyId: string
): Promise<number | null> {
  const snapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/policies/${policyId}`)
  );
  if (!snapshot.exists) return null;
  const policy = snapshot.data() as Policy;
  assertPolicyIdentity(policy, tenantId, policyId);
  return policyRevision(policy);
}

function assertPersistedPolicyRelationships(policy: Policy): void {
  try {
    if (
      normalizePolicyDocumentId(policy.ownerId, 'Persisted ownerId') !==
        policy.ownerId ||
      !Array.isArray(policy.linkedControlIds) ||
      policy.linkedControlIds.length > 50 ||
      new Set(policy.linkedControlIds).size !== policy.linkedControlIds.length ||
      policy.linkedControlIds.some(
        (controlId, index) =>
          normalizePolicyDocumentId(
            controlId,
            `Persisted linkedControlIds[${index}]`
          ) !== controlId
      )
    ) {
      throw new Error('Invalid policy relationship metadata.');
    }
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Policy relationship metadata must be repaired before mutation.'
    );
  }
}

async function assertPolicyRelationshipsExist(
  transaction: Transaction,
  tenantId: string,
  ownerId: string,
  linkedControlIds: readonly string[]
): Promise<void> {
  const ownerRef = db.doc(`tenants/${tenantId}/memberships/${ownerId}`);
  const controlRefs = linkedControlIds.map((controlId) =>
    db.doc(`tenants/${tenantId}/controls/${controlId}`)
  );
  const snapshots = await transaction.getAll(ownerRef, ...controlRefs);
  const ownerSnapshot = snapshots[0]!;
  const membership = ownerSnapshot.exists
    ? (ownerSnapshot.data() as TenantMembership)
    : undefined;
  if (
    !membership ||
    membership.userId !== ownerId ||
    membership.tenantId !== tenantId ||
    membership.status !== 'active' ||
    !isValidUserRole(membership.role) ||
    !OPERATIONAL_POLICY_OWNER_ROLES.has(membership.role)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The policy owner must have an active operational membership in this tenant.'
    );
  }
  controlRefs.forEach((controlRef, index) => {
    const snapshot = snapshots[index + 1]!;
    if (!snapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        `Referenced control '${controlRef.id}' does not exist in this tenant.`
      );
    }
    const control = snapshot.data();
    if (
      (control?.id !== undefined && control.id !== controlRef.id) ||
      (control?.tenantId !== undefined && control.tenantId !== tenantId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        `Referenced control '${controlRef.id}' has invalid identity metadata.`
      );
    }
  });
}

async function assertPolicyReviewAssigneeExists(
  transaction: Transaction,
  tenantId: string,
  reviewAssigneeId: string
): Promise<void> {
  const snapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/memberships/${reviewAssigneeId}`)
  );
  const membership = snapshot.exists
    ? (snapshot.data() as TenantMembership)
    : undefined;
  if (
    !membership ||
    membership.userId !== reviewAssigneeId ||
    membership.tenantId !== tenantId ||
    membership.status !== 'active' ||
    !isValidUserRole(membership.role) ||
    !POLICY_REVIEW_ASSIGNEE_ROLES.has(membership.role)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The assigned policy reviewer must be an active tenant approver or tenant administrator.'
    );
  }
}

function assertStorageReferenceCanBeUsed(
  storagePath: string | null,
  tenantId: string
): void {
  if (storagePath === null) return;
  if (!storagePath.startsWith(`tenants/${tenantId}/policies/`)) {
    throw new HttpsError(
      'invalid-argument',
      'storagePath must be tenant-scoped under the policy document prefix.'
    );
  }
  throw new HttpsError(
    'failed-precondition',
    'Policy file references are unavailable until an upload session server-verifies the Storage object.'
  );
}

function deriveActivationReviewDate(policy: Policy, requestedAt: string): string {
  if (typeof policy.nextReviewDate === 'string') {
    try {
      assertPolicyReviewDateIsReasonable(policy.nextReviewDate, requestedAt);
      return policy.nextReviewDate;
    } catch {
      // A stale or legacy schedule is replaced by the server-owned annual default.
    }
  }
  return addDays(requestedAt, 365);
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

interface PolicyArtifactExpectation {
  commandId: unknown;
  commandName: TenantPermissionAction;
  actorId: unknown;
  status: PolicyStatus;
  auditAction: AuditActionType;
}

async function verifyAuthoritativePolicyArtifact(
  transaction: Transaction,
  tenantId: string,
  policyRef: DocumentReference,
  policy: Policy,
  expected: PolicyArtifactExpectation
): Promise<PriorPolicyVersionAnchor> {
  let commandId: string;
  let actorId: string;
  try {
    commandId = normalizeCommandId(expected.commandId);
    actorId = normalizePolicyDocumentId(expected.actorId, 'Artifact actorId');
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Policy lifecycle state is missing a valid authoritative command anchor.'
    );
  }

  const revision = policyRevision(policy);
  const receiptRef = db.doc(
    `tenants/${tenantId}/command_receipts/${commandId}`
  );
  const receiptSnapshot = await transaction.get(receiptRef);
  const priorAnchor = await preparePriorPolicyVersion(
    transaction,
    policyRef,
    policy
  );
  if (!receiptSnapshot.exists) {
    throw new HttpsError(
      'failed-precondition',
      'Policy lifecycle command receipt is missing.'
    );
  }

  const receipt = receiptSnapshot.data();
  const result = isPlainRecord(receipt?.result) ? receipt.result : null;
  let serializedResult: string | null = null;
  let resultHash: string | null = null;
  try {
    if (result) {
      serializedResult = serializeTrustedCommandJson(result, 'policy artifact result');
      resultHash = stableTrustedValueHash(result, 'policy artifact result');
    }
  } catch {
    // The uniform failed-precondition below intentionally avoids leaking internals.
  }
  const actorRole = receipt?.actorRole;
  if (
    !isPlainRecord(receipt) ||
    receipt.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION ||
    receipt.envelopeVersion !== CURRENT_COMMAND_ENVELOPE_VERSION ||
    receipt.commandVersion !== POLICY_COMMAND_VERSION ||
    receipt.id !== commandId ||
    receipt.commandId !== commandId ||
    receipt.tenantId !== tenantId ||
    receipt.commandName !== expected.commandName ||
    receipt.status !== 'completed' ||
    receipt.actorId !== actorId ||
    !isValidUserRole(actorRole) ||
    actorRole === 'platform_admin' ||
    !rolesForTenantAction(expected.commandName).includes(
      actorRole as Exclude<UserRole, 'platform_admin'>
    ) ||
    receipt.payloadHashVersion !== 'sha256-canonical-json-v1' ||
    typeof receipt.payloadHash !== 'string' ||
    !SHA256_PATTERN.test(receipt.payloadHash) ||
    typeof receipt.payloadByteLength !== 'number' ||
    !Number.isSafeInteger(receipt.payloadByteLength) ||
    receipt.payloadByteLength < 0 ||
    receipt.payloadByteLength > 64 * 1024 ||
    receipt.expectedRevisionWasProvided !== true ||
    receipt.expectedRevision !== revision - 1 ||
    receipt.entityType !== 'policy' ||
    receipt.entityId !== policyRef.id ||
    receipt.auditAction !== expected.auditAction ||
    typeof receipt.auditLogId !== 'string' ||
    !Array.isArray(receipt.outboxEventIds) ||
    receipt.outboxEventIds.length !== 0 ||
    typeof receipt.committedAt !== 'string' ||
    !Number.isFinite(Date.parse(receipt.committedAt)) ||
    !result ||
    serializedResult === null ||
    resultHash === null ||
    receipt.resultHash !== resultHash ||
    receipt.resultByteLength !== commandJsonByteLength(serializedResult) ||
    result.policyId !== policyRef.id ||
    result.status !== expected.status ||
    result.revision !== revision ||
    priorAnchor.versionId !== policyVersionId(revision) ||
    priorAnchor.commandId !== commandId ||
    priorAnchor.recordedBy !== actorId
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Policy lifecycle receipt or immutable version is inconsistent.'
    );
  }

  let auditLogId: string;
  try {
    auditLogId = normalizePolicyDocumentId(receipt.auditLogId, 'Lifecycle auditLogId');
    if (auditLogId !== receipt.auditLogId) throw new Error('Non-canonical audit ID.');
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Policy lifecycle audit anchor identifier is invalid.'
    );
  }

  const auditSnapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/audit_logs/${auditLogId}`)
  );
  const audit = auditSnapshot.exists ? auditSnapshot.data() : undefined;
  const afterSummary = isPlainRecord(audit?.afterSummary)
    ? audit.afterSummary
    : null;
  if (
    !isPlainRecord(audit) ||
    audit.id !== auditLogId ||
    audit.tenantId !== tenantId ||
    audit.actorId !== actorId ||
    audit.actorRole !== actorRole ||
    audit.actorType !== 'tenant_user' ||
    typeof audit.actorEmail !== 'string' ||
    audit.actorEmail.length === 0 ||
    audit.entityType !== 'policy' ||
    audit.entityId !== policyRef.id ||
    audit.action !== expected.auditAction ||
    audit.source !== 'cloud_function' ||
    audit.workflowContext !== receipt.auditWorkflowContext ||
    audit.workflowContext !==
      `command:ev${CURRENT_COMMAND_ENVELOPE_VERSION}:${expected.commandName}:cv${POLICY_COMMAND_VERSION}:${commandId} | ${expected.commandName}` ||
    typeof audit.timestamp !== 'string' ||
    !Number.isFinite(Date.parse(audit.timestamp)) ||
    (audit.beforeSummary !== null && !isPlainRecord(audit.beforeSummary)) ||
    !afterSummary ||
    afterSummary.stateHash !== priorAnchor.stateHash ||
    afterSummary.versionId !== priorAnchor.versionId
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Policy lifecycle audit anchor is missing or inconsistent.'
    );
  }
  return priorAnchor;
}

/** Creates a draft policy. Status, approval, provenance, and review schedule are server-owned. */
export const createTenantPolicy = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand(request, {
    commandName: 'policy.create',
    commandVersion: 1,
    validatePayload: normalizeCreatePolicyPayload,
    requireExpectedRevision: true,
    resolveCurrentRevision: async () => null,
    mutateInTransaction: async (context) => {
      assertStorageReferenceCanBeUsed(context.payload.storagePath, context.tenantId);
      const policyRef = db.collection(`tenants/${context.tenantId}/policies`).doc();
      const codeReservation = await preparePolicyCodeReservation(
        context.transaction,
        context.tenantId,
        policyRef.id,
        context.payload.code,
        null,
        context.actor.userId,
        context.requestedAt
      );
      const ownerId = context.payload.ownerId ?? context.actor.userId;
      await assertPolicyRelationshipsExist(
        context.transaction,
        context.tenantId,
        ownerId,
        context.payload.linkedControlIds
      );

      const policy: Policy = {
        id: policyRef.id,
        tenantId: context.tenantId,
        code: context.payload.code,
        title: context.payload.title,
        version: context.payload.version,
        summary: context.payload.summary,
        scope: context.payload.scope,
        contentMarkdown: context.payload.contentMarkdown,
        storagePath: context.payload.storagePath,
        linkedControlIds: context.payload.linkedControlIds,
        status: 'draft',
        ownerId,
        approverId: null,
        approvedAt: null,
        effectiveDate: null,
        nextReviewDate: addDays(context.requestedAt, 365),
        revision: 1,
        workflowSchemaVersion: POLICY_WORKFLOW_SCHEMA_VERSION,
        workflowTrust: 'governed_draft',
        lastDecisionNotes: null,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
        approvalCommandId: null,
        draftContributorIds: [context.actor.userId],
        reviewSubmittedBy: null,
        reviewSubmittedAt: null,
        reviewSubmissionCommandId: null,
        reviewAssigneeId: null,
        createdAt: context.requestedAt,
        updatedAt: context.requestedAt,
        createdBy: context.actor.userId,
        updatedBy: context.actor.userId,
      };
      const priorAnchor = await preparePriorPolicyVersion(
        context.transaction,
        policyRef,
        null
      );
      codeReservation.apply(context.transaction);
      context.transaction.create(policyRef, policy);
      const version = writePolicyVersion(
        context.transaction,
        policyRef,
        policy,
        null,
        priorAnchor,
        context.actor.userId,
        context.commandId,
        context.requestedAt
      );

      return {
        result: {
          success: true,
          policyId: policyRef.id,
          revision: policy.revision!,
        },
        audit: {
          entityType: 'policy',
          entityId: policyRef.id,
          action: 'create',
          beforeSummary: null,
          afterSummary: policyAuditSummary(policy, version),
          workflowContext: 'policy_created_as_draft',
        },
      };
    },
  })
);

/** Updates an editable draft without accepting any lifecycle or attribution fields. */
export const updateTenantPolicy = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand<
    NormalizedUpdatePolicyPayload,
    { success: true; policyId: string; revision: number }
  >(request, {
    commandName: 'policy.update',
    commandVersion: 1,
    validatePayload: normalizeUpdatePolicyPayload,
    requireExpectedRevision: true,
    resolveCurrentRevision: (context) =>
      resolvePolicyRevision(
        context.transaction,
        context.tenantId,
        context.payload.policyId
      ),
    mutateInTransaction: async (context) => {
      const policyRef = db.doc(
        `tenants/${context.tenantId}/policies/${context.payload.policyId}`
      );
      const snapshot = await context.transaction.get(policyRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Policy document does not exist.');
      }
      const before = snapshot.data() as Policy;
      assertPolicyIdentity(before, context.tenantId, context.payload.policyId);
      if (before.status !== 'draft') {
        throw new HttpsError(
          'failed-precondition',
          'Only draft policies may be edited; use a lifecycle command first.'
        );
      }
      if (context.payload.storagePath !== undefined) {
        assertStorageReferenceCanBeUsed(context.payload.storagePath, context.tenantId);
      }
      if (context.payload.nextReviewDate !== undefined) {
        assertPolicyReviewDateIsReasonable(
          context.payload.nextReviewDate,
          context.requestedAt
        );
      }

      let code: string;
      try {
        code = context.payload.code ?? normalizePolicyCode(before.code);
      } catch {
        throw new HttpsError(
          'failed-precondition',
          'A valid replacement code is required to repair this legacy draft.'
        );
      }
      const ownerId = context.payload.ownerId ?? before.ownerId;
      const linkedControlIds = context.payload.linkedControlIds ?? before.linkedControlIds;
      assertPersistedPolicyRelationships({
        ...before,
        ownerId,
        linkedControlIds,
      });

      const mutableFields: Array<keyof NormalizedUpdatePolicyPayload> = [
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
      ];
      const hasDomainChange =
        code !== before.code ||
        mutableFields.some(
          (field) =>
            context.payload[field] !== undefined &&
            JSON.stringify(context.payload[field]) !==
              JSON.stringify(before[field as keyof Policy])
        );
      if (!hasDomainChange) {
        throw new HttpsError(
          'failed-precondition',
          'The normalized policy patch does not change authoritative domain state.'
        );
      }

      const codeReservation = await preparePolicyCodeReservation(
        context.transaction,
        context.tenantId,
        policyRef.id,
        code,
        typeof before.code === 'string' ? before.code : null,
        context.actor.userId,
        context.requestedAt
      );
      await assertPolicyRelationshipsExist(
        context.transaction,
        context.tenantId,
        ownerId,
        linkedControlIds
      );

      const draftContributorIds = policyDraftContributors(before);
      if (!draftContributorIds.includes(context.actor.userId)) {
        if (draftContributorIds.length >= 100) {
          throw new HttpsError(
            'resource-exhausted',
            'Policy draft contributor history reached its 100-member safety limit.'
          );
        }
        draftContributorIds.push(context.actor.userId);
      }

      const revision = policyRevision(before) + 1;
      const updatePatch: Partial<Policy> = {
        revision,
        approverId: null,
        approvedAt: null,
        approvalCommandId: null,
        effectiveDate: null,
        reviewSubmittedBy: null,
        reviewSubmittedAt: null,
        reviewSubmissionCommandId: null,
        reviewAssigneeId: null,
        retiredAt: null,
        retiredBy: null,
        retirementReason: null,
        draftContributorIds,
        workflowSchemaVersion: POLICY_WORKFLOW_SCHEMA_VERSION,
        workflowTrust: 'governed_draft',
        updatedAt: context.requestedAt,
        updatedBy: context.actor.userId,
      };
      if (code !== before.code || context.payload.code !== undefined) {
        updatePatch.code = code;
      }
      if (context.payload.title !== undefined) {
        updatePatch.title = context.payload.title;
      }
      if (context.payload.version !== undefined) {
        updatePatch.version = context.payload.version;
      }
      if (context.payload.summary !== undefined) {
        updatePatch.summary = context.payload.summary;
      }
      if (context.payload.scope !== undefined) {
        updatePatch.scope = context.payload.scope;
      }
      if (context.payload.contentMarkdown !== undefined) {
        updatePatch.contentMarkdown = context.payload.contentMarkdown;
      }
      if (context.payload.storagePath !== undefined) {
        updatePatch.storagePath = context.payload.storagePath;
      }
      if (context.payload.linkedControlIds !== undefined) {
        updatePatch.linkedControlIds = context.payload.linkedControlIds;
      }
      if (context.payload.ownerId !== undefined) {
        updatePatch.ownerId = context.payload.ownerId;
      }
      if (context.payload.nextReviewDate !== undefined) {
        updatePatch.nextReviewDate = context.payload.nextReviewDate;
      }
      const after: Policy = { ...before, ...updatePatch };
      const priorAnchor = await preparePriorPolicyVersion(
        context.transaction,
        policyRef,
        before
      );
      codeReservation.apply(context.transaction);
      context.transaction.update(policyRef, updatePatch);
      const beforeStateHash = stableTrustedValueHash(
        canonicalPolicyState(before),
        'previous policy state'
      );
      const version = writePolicyVersion(
        context.transaction,
        policyRef,
        after,
        before,
        priorAnchor,
        context.actor.userId,
        context.commandId,
        context.requestedAt
      );

      return {
        result: { success: true, policyId: policyRef.id, revision },
        audit: {
          entityType: 'policy',
          entityId: policyRef.id,
          action: 'update',
          beforeSummary: policyAuditSummary(before, {
            versionId: policyVersionId(policyRevision(before)),
            stateHash: beforeStateHash,
          }),
          afterSummary: policyAuditSummary(after, version),
          workflowContext: 'policy_draft_updated',
        },
      };
    },
  })
);

function readUntrustedTransitionTarget(data: unknown): PolicyTransitionTarget {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    throw new HttpsError('invalid-argument', 'Command request must be an object.');
  }
  const payload = (data as Record<string, unknown>).payload;
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
    throw new HttpsError('invalid-argument', 'Policy transition payload must be an object.');
  }
  const targetStatus = (payload as Record<string, unknown>).targetStatus;
  if (targetStatus === 'retired') {
    throw new HttpsError(
      'invalid-argument',
      'Use deleteTenantPolicy with an explicit retirement reason to retire a policy.'
    );
  }
  if (
    targetStatus !== 'draft' &&
    targetStatus !== 'under_review' &&
    targetStatus !== 'approved' &&
    targetStatus !== 'active'
  ) {
    throw new HttpsError('invalid-argument', 'targetStatus contains an unsupported value.');
  }
  return targetStatus;
}

function transitionCommandName(
  targetStatus: PolicyTransitionTarget
): PolicyTransitionCommandName {
  switch (targetStatus) {
    case 'draft':
      return 'policy.return_draft';
    case 'under_review':
      return 'policy.submit_review';
    case 'approved':
      return 'policy.approve';
    case 'active':
      return 'policy.activate';
  }
}

async function mutatePolicyTransition(
  context: TenantCommandContext<NormalizedPolicyTransitionPayload>
) {
  const policyRef = db.doc(
    `tenants/${context.tenantId}/policies/${context.payload.policyId}`
  );
  const snapshot = await context.transaction.get(policyRef);
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Policy document does not exist.');
  }
  const before = snapshot.data() as Policy;
  assertPolicyIdentity(before, context.tenantId, context.payload.policyId);
  if (context.payload.targetStatus === 'retired') {
    throw new HttpsError(
      'internal',
      'Policy retirement must use the dedicated retirement command.'
    );
  }
  assertLegalPolicyTransition(before.status, context.payload.targetStatus);

  if (context.payload.targetStatus === 'under_review') {
    const reviewAssigneeId = context.payload.reviewAssigneeId!;
    await assertPolicyReviewAssigneeExists(
      context.transaction,
      context.tenantId,
      reviewAssigneeId
    );
    const contributors =
      before.status === 'draft' ? policyDraftContributors(before) : [];
    if (
      reviewAssigneeId === before.ownerId ||
      reviewAssigneeId === before.createdBy ||
      reviewAssigneeId === context.actor.userId ||
      contributors.includes(reviewAssigneeId)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'The assigned reviewer must be independent of policy ownership, authorship, and submission.'
      );
    }
  }

  if (
    context.payload.targetStatus === 'under_review' &&
    before.status === 'draft' &&
    (before.workflowSchemaVersion !== POLICY_WORKFLOW_SCHEMA_VERSION ||
      before.workflowTrust !== 'governed_draft')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Legacy policy drafts require an audited draft update/rebaseline before review.'
    );
  }
  if (
    context.payload.targetStatus === 'approved' &&
    (before.workflowSchemaVersion !== POLICY_WORKFLOW_SCHEMA_VERSION ||
      before.workflowTrust !== 'governed_under_review')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Only a governed review submission can be approved.'
    );
  }
  if (
    context.payload.targetStatus === 'active' &&
    (before.workflowSchemaVersion !== POLICY_WORKFLOW_SCHEMA_VERSION ||
      before.workflowTrust !== 'authoritative')
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Only an authoritative command-approved policy can be activated.'
    );
  }

  const requiresOperationalReadiness =
    context.payload.targetStatus === 'approved' ||
    context.payload.targetStatus === 'active' ||
    (context.payload.targetStatus === 'under_review' && before.status === 'draft');
  if (requiresOperationalReadiness) {
    assertPersistedPolicyRelationships(before);
    await assertPolicyRelationshipsExist(
      context.transaction,
      context.tenantId,
      before.ownerId,
      before.linkedControlIds
    );
    assertPolicyCoreReadyForReview(before);
  }

  const draftContributorIds =
    context.payload.targetStatus === 'approved'
      ? policyDraftContributors(before)
      : [];

  if (
    context.payload.targetStatus === 'approved' &&
    (context.actor.userId !== before.reviewAssigneeId ||
      context.actor.userId === before.ownerId ||
      context.actor.userId === before.createdBy ||
      context.actor.userId === before.updatedBy ||
      context.actor.userId === before.reviewSubmittedBy ||
      draftContributorIds.includes(context.actor.userId))
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Policy approval requires the assigned independent reviewer, who must not own, create, edit, or submit the draft.'
    );
  }

  let priorAnchor: PriorPolicyVersionAnchor | null = null;
  if (context.payload.targetStatus === 'approved') {
    if (
      typeof before.reviewSubmittedAt !== 'string' ||
      !Number.isFinite(Date.parse(before.reviewSubmittedAt))
    ) {
      throw new HttpsError(
        'failed-precondition',
        'Policy review submission timestamp is missing or invalid.'
      );
    }
    priorAnchor = await verifyAuthoritativePolicyArtifact(
      context.transaction,
      context.tenantId,
      policyRef,
      before,
      {
        commandId: before.reviewSubmissionCommandId,
        commandName: 'policy.submit_review',
        actorId: before.reviewSubmittedBy,
        status: 'under_review',
        auditAction: 'status_transition',
      }
    );
  } else if (context.payload.targetStatus === 'active') {
    priorAnchor = await verifyAuthoritativePolicyArtifact(
      context.transaction,
      context.tenantId,
      policyRef,
      before,
      {
        commandId: before.approvalCommandId,
        commandName: 'policy.approve',
        actorId: before.approverId,
        status: 'approved',
        auditAction: 'approve',
      }
    );
  }

  const revision = policyRevision(before) + 1;
  const lifecyclePatch: Partial<Policy> = {
    status: context.payload.targetStatus,
    revision,
    lastDecisionNotes: context.payload.decisionNotes,
    updatedAt: context.requestedAt,
    updatedBy: context.actor.userId,
  };

  if (
    context.payload.targetStatus === 'under_review' ||
    context.payload.targetStatus === 'draft'
  ) {
    lifecyclePatch.approverId = null;
    lifecyclePatch.approvedAt = null;
    lifecyclePatch.approvalCommandId = null;
    lifecyclePatch.effectiveDate = null;
    if (context.payload.targetStatus === 'under_review') {
      lifecyclePatch.reviewSubmittedBy = context.actor.userId;
      lifecyclePatch.reviewSubmittedAt = context.requestedAt;
      lifecyclePatch.reviewSubmissionCommandId = context.commandId;
      lifecyclePatch.reviewAssigneeId = context.payload.reviewAssigneeId;
      lifecyclePatch.workflowTrust =
        before.workflowSchemaVersion === POLICY_WORKFLOW_SCHEMA_VERSION &&
        (before.workflowTrust === 'governed_draft' ||
          before.workflowTrust === 'authoritative')
          ? 'governed_under_review'
          : 'legacy_unverified';
    } else {
      lifecyclePatch.reviewSubmittedBy = null;
      lifecyclePatch.reviewSubmittedAt = null;
      lifecyclePatch.reviewSubmissionCommandId = null;
      lifecyclePatch.reviewAssigneeId = null;
      lifecyclePatch.workflowTrust =
        before.workflowSchemaVersion === POLICY_WORKFLOW_SCHEMA_VERSION &&
        before.workflowTrust !== 'legacy_unverified'
          ? 'governed_draft'
          : 'legacy_unverified';
    }
  } else if (context.payload.targetStatus === 'approved') {
    lifecyclePatch.approverId = context.actor.userId;
    lifecyclePatch.approvedAt = context.requestedAt;
    lifecyclePatch.approvalCommandId = context.commandId;
    lifecyclePatch.effectiveDate = null;
    lifecyclePatch.workflowSchemaVersion = POLICY_WORKFLOW_SCHEMA_VERSION;
    lifecyclePatch.workflowTrust = 'authoritative';
  } else {
    if (!before.approverId || !before.approvedAt) {
      throw new HttpsError(
        'failed-precondition',
        'Policy activation requires approval recorded through the authoritative command workflow.'
      );
    }
    lifecyclePatch.effectiveDate = context.requestedAt;
    lifecyclePatch.nextReviewDate = deriveActivationReviewDate(
      before,
      context.requestedAt
    );
    lifecyclePatch.draftContributorIds = [];
    lifecyclePatch.workflowTrust = 'authoritative';
  }

  const after: Policy = { ...before, ...lifecyclePatch };
  priorAnchor ??= await preparePriorPolicyVersion(
    context.transaction,
    policyRef,
    before
  );
  context.transaction.update(policyRef, lifecyclePatch);
  const beforeStateHash = stableTrustedValueHash(
    canonicalPolicyState(before),
    'previous policy state'
  );
  const version = writePolicyVersion(
    context.transaction,
    policyRef,
    after,
    before,
    priorAnchor,
    context.actor.userId,
    context.commandId,
    context.requestedAt
  );

  return {
    result: {
      success: true as const,
      policyId: policyRef.id,
      status: context.payload.targetStatus,
      revision,
      approvedAt: after.approvedAt,
    },
    audit: {
      entityType: 'policy',
      entityId: policyRef.id,
      action:
        context.payload.targetStatus === 'approved'
          ? ('approve' as const)
          : ('status_transition' as const),
      beforeSummary: policyAuditSummary(before, {
        versionId: policyVersionId(policyRevision(before)),
        stateHash: beforeStateHash,
      }),
      afterSummary: {
        ...policyAuditSummary(after, version),
        decisionNotes: context.payload.decisionNotes,
      },
      workflowContext: transitionCommandName(context.payload.targetStatus),
    },
  };
}

/** Routes each lifecycle target through a distinct authorization action and legal transition. */
export const transitionPolicyStatus = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) => {
  const targetStatus = readUntrustedTransitionTarget(request.data);
  return executeTenantCommand<
    NormalizedPolicyTransitionPayload,
    {
      success: true;
      policyId: string;
      status: PolicyStatus;
      revision: number;
      approvedAt: string | null;
    }
  >(request, {
    commandName: transitionCommandName(targetStatus),
    commandVersion: 1,
    validatePayload: (payload) =>
      normalizePolicyTransitionPayload(payload, targetStatus),
    requireExpectedRevision: true,
    resolveCurrentRevision: (context) =>
      resolvePolicyRevision(
        context.transaction,
        context.tenantId,
        context.payload.policyId
      ),
    mutateInTransaction: mutatePolicyTransition,
  });
});

/** Compatibility name retained, but deletion is now a reasoned, immutable retirement. */
export const deleteTenantPolicy = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand<
    NormalizedRetirePolicyPayload,
    {
      success: true;
      policyId: string;
      deleted: false;
      retired: true;
      revision: number;
    }
  >(request, {
    commandName: 'policy.retire',
    commandVersion: 1,
    validatePayload: normalizeRetirePolicyPayload,
    requireExpectedRevision: true,
    resolveCurrentRevision: (context) =>
      resolvePolicyRevision(
        context.transaction,
        context.tenantId,
        context.payload.policyId
      ),
    mutateInTransaction: async (context) => {
      const policyRef = db.doc(
        `tenants/${context.tenantId}/policies/${context.payload.policyId}`
      );
      const snapshot = await context.transaction.get(policyRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Policy document does not exist.');
      }
      const before = snapshot.data() as Policy;
      assertPolicyIdentity(before, context.tenantId, context.payload.policyId);
      assertLegalPolicyTransition(before.status, 'retired');

      const revision = policyRevision(before) + 1;
      const retirementPatch: Partial<Policy> = {
        status: 'retired',
        retirementReason: context.payload.retirementReason,
        retiredAt: context.requestedAt,
        retiredBy: context.actor.userId,
        lastDecisionNotes: context.payload.retirementReason,
        workflowSchemaVersion: POLICY_WORKFLOW_SCHEMA_VERSION,
        workflowTrust: 'retired',
        revision,
        updatedAt: context.requestedAt,
        updatedBy: context.actor.userId,
      };
      const after: Policy = { ...before, ...retirementPatch };
      const priorAnchor = await preparePriorPolicyVersion(
        context.transaction,
        policyRef,
        before
      );
      context.transaction.update(policyRef, retirementPatch);
      const beforeStateHash = stableTrustedValueHash(
        canonicalPolicyState(before),
        'previous policy state'
      );
      const version = writePolicyVersion(
        context.transaction,
        policyRef,
        after,
        before,
        priorAnchor,
        context.actor.userId,
        context.commandId,
        context.requestedAt
      );

      return {
        result: {
          success: true,
          policyId: policyRef.id,
          deleted: false,
          retired: true,
          revision,
        },
        audit: {
          entityType: 'policy',
          entityId: policyRef.id,
          action: 'status_transition',
          beforeSummary: policyAuditSummary(before, {
            versionId: policyVersionId(policyRevision(before)),
            stateHash: beforeStateHash,
          }),
          afterSummary: {
            ...policyAuditSummary(after, version),
            retirementReason: context.payload.retirementReason,
          },
          workflowContext: 'policy_retired_not_deleted',
        },
      };
    },
  })
);

function normalizedPageSize(value: unknown, defaultValue: number, maximum: number): number {
  if (value === undefined) return defaultValue;
  if (!Number.isSafeInteger(value) || (value as number) < 1 || (value as number) > maximum) {
    throw new HttpsError(
      'invalid-argument',
      `pageSize must be an integer between 1 and ${maximum}.`
    );
  }
  return value as number;
}

function effectivePolicyTrust(
  policy: Policy,
  currentArtifactVerified: boolean
): PolicyWorkflowTrust {
  let revision: number;
  try {
    revision = policyRevision(policy);
  } catch {
    return 'legacy_unverified';
  }
  if (
    currentArtifactVerified &&
    revision > 0 &&
    policy.workflowSchemaVersion === POLICY_WORKFLOW_SCHEMA_VERSION &&
    ((policy.workflowTrust === 'governed_draft' && policy.status === 'draft') ||
      (policy.workflowTrust === 'governed_under_review' &&
        policy.status === 'under_review' &&
        typeof policy.reviewSubmissionCommandId === 'string' &&
        typeof policy.reviewSubmittedBy === 'string' &&
        typeof policy.reviewAssigneeId === 'string') ||
      (policy.workflowTrust === 'authoritative' &&
        (policy.status === 'approved' || policy.status === 'active') &&
        typeof policy.approvalCommandId === 'string' &&
        typeof policy.approverId === 'string' &&
        typeof policy.approvedAt === 'string') ||
      (policy.workflowTrust === 'retired' &&
        policy.status === 'retired' &&
        typeof policy.retiredBy === 'string' &&
        typeof policy.retiredAt === 'string'))
  ) {
    return policy.workflowTrust;
  }
  return 'legacy_unverified';
}

function policySummaryProjection(
  policy: Policy,
  currentArtifactVerified: boolean
): Record<string, unknown> {
  const workflowTrust = effectivePolicyTrust(policy, currentArtifactVerified);
  const recordedStatus = POLICY_STATUSES.has(policy.status)
    ? policy.status
    : 'invalid_recorded_status';
  const status =
    (recordedStatus === 'approved' || recordedStatus === 'active') &&
    workflowTrust !== 'authoritative'
      ? 'legacy_unverified'
      : recordedStatus;
  return {
    id: policy.id,
    tenantId: policy.tenantId,
    code: policy.code,
    title: policy.title,
    documentVersion: policy.version,
    summary: policy.summary,
    scope: policy.scope,
    status,
    recordedStatus,
    workflowTrust,
    ownerId: policy.ownerId,
    approverId: policy.approverId ?? null,
    reviewAssigneeId: policy.reviewAssigneeId ?? null,
    approvedAt: policy.approvedAt ?? null,
    effectiveDate: policy.effectiveDate ?? null,
    nextReviewDate: policy.nextReviewDate ?? null,
    linkedControlIds: Array.isArray(policy.linkedControlIds)
      ? policy.linkedControlIds
      : [],
    revision: policyRevision(policy),
    createdAt: policy.createdAt,
    updatedAt: policy.updatedAt,
  };
}

/** Lists bounded, cursor-paged policy summaries without large document bodies. */
export const listTenantPolicies = onCall<ListPoliciesInput>(async (request) => {
  const input = request.data as unknown;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Policy list input must be an object.');
  }
  const data = input as Record<string, unknown>;
  const unknown = Object.keys(data).filter(
    (key) =>
      !['tenantId', 'status', 'linkedControlId', 'pageSize', 'cursor'].includes(key)
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Policy list input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }

  const tenantId = normalizePolicyDocumentId(data.tenantId, 'tenantId');
  const status = data.status;
  if (status !== undefined && !POLICY_STATUSES.has(status as PolicyStatus)) {
    throw new HttpsError('invalid-argument', 'status contains an unsupported value.');
  }
  const linkedControlId =
    data.linkedControlId === undefined
      ? undefined
      : normalizePolicyDocumentId(data.linkedControlId, 'linkedControlId');
  const pageSize = normalizedPageSize(data.pageSize, 50, 100);
  const cursor =
    data.cursor === undefined
      ? undefined
      : normalizePolicyDocumentId(data.cursor, 'cursor');

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection(
    `tenants/${tenantId}/policies`
  );
  if (status !== undefined) {
    query = query.where('status', '==', status);
  }
  if (linkedControlId !== undefined) {
    query = query.where('linkedControlIds', 'array-contains', linkedControlId);
  }
  query = query.orderBy(FieldPath.documentId());
  if (cursor !== undefined) {
    query = query.startAfter(cursor);
  }

  const snapshot = await query.limit(pageSize + 1).get();
  const pageDocuments = snapshot.docs.slice(0, pageSize);
  const policyDocuments = pageDocuments.map((document) => {
    const policy = document.data() as Policy;
    assertPolicyIdentity(policy, tenantId, document.id);
    return policy;
  });
  const verifiedArtifacts = await verifyCurrentPolicyArtifacts(
    tenantId,
    policyDocuments
  );
  const policies = policyDocuments.map((policy) =>
    policySummaryProjection(policy, verifiedArtifacts.get(policy.id) === true)
  );
  return {
    success: true,
    count: policies.length,
    policies,
    truncated: snapshot.size > pageSize,
    nextCursor:
      snapshot.size > pageSize && pageDocuments.length > 0
        ? pageDocuments[pageDocuments.length - 1]!.id
        : null,
  };
});

/** Returns one full policy document with fail-closed lifecycle assurance projection. */
export const getTenantPolicyDetail = onCall<GetPolicyInput>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainRecord(input)) {
    throw new HttpsError('invalid-argument', 'Policy detail input must be an object.');
  }
  const unknown = Object.keys(input).filter(
    (key) => !['tenantId', 'policyId'].includes(key)
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Policy detail input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const tenantId = normalizePolicyDocumentId(input.tenantId, 'tenantId');
  const policyId = normalizePolicyDocumentId(input.policyId, 'policyId');
  await requireTenantMember(request, tenantId);
  const snapshot = await db.doc(`tenants/${tenantId}/policies/${policyId}`).get();
  if (!snapshot.exists) {
    throw new HttpsError('not-found', 'Policy document does not exist.');
  }
  const policy = snapshot.data() as Policy;
  assertPolicyIdentity(policy, tenantId, policyId);
  const verifiedArtifacts = await verifyCurrentPolicyArtifacts(tenantId, [policy]);
  const currentArtifactVerified = verifiedArtifacts.get(policyId) === true;
  return {
    policy: {
      ...policy,
      assuranceStatus: policySummaryProjection(policy, currentArtifactVerified).status,
      recordedStatus: policy.status,
      workflowTrust: effectivePolicyTrust(policy, currentArtifactVerified),
      currentArtifactVerified,
    },
  };
});

interface PolicyHistoryCommandArtifact {
  auditAction: AuditActionType;
  resultingStatus: PolicyStatus;
  workflowContext: string;
  resultIncludesStatus: boolean;
}

function policyHistoryCommandArtifact(
  commandName: unknown
): PolicyHistoryCommandArtifact | null {
  switch (commandName) {
    case 'policy.create':
      return {
        auditAction: 'create',
        resultingStatus: 'draft',
        workflowContext: 'policy_created_as_draft',
        resultIncludesStatus: false,
      };
    case 'policy.update':
      return {
        auditAction: 'update',
        resultingStatus: 'draft',
        workflowContext: 'policy_draft_updated',
        resultIncludesStatus: false,
      };
    case 'policy.submit_review':
      return {
        auditAction: 'status_transition',
        resultingStatus: 'under_review',
        workflowContext: 'policy.submit_review',
        resultIncludesStatus: true,
      };
    case 'policy.return_draft':
      return {
        auditAction: 'status_transition',
        resultingStatus: 'draft',
        workflowContext: 'policy.return_draft',
        resultIncludesStatus: true,
      };
    case 'policy.approve':
      return {
        auditAction: 'approve',
        resultingStatus: 'approved',
        workflowContext: 'policy.approve',
        resultIncludesStatus: true,
      };
    case 'policy.activate':
      return {
        auditAction: 'status_transition',
        resultingStatus: 'active',
        workflowContext: 'policy.activate',
        resultIncludesStatus: true,
      };
    case 'policy.retire':
      return {
        auditAction: 'status_transition',
        resultingStatus: 'retired',
        workflowContext: 'policy_retired_not_deleted',
        resultIncludesStatus: false,
      };
    default:
      return null;
  }
}

function safePolicyHistoryHash(value: unknown, label: string): string | null {
  try {
    return isPlainRecord(value) ? stableTrustedValueHash(value, label) : null;
  } catch {
    return null;
  }
}

function policyHistoryVersionEnvelopeIsValid(
  version: Record<string, unknown>,
  documentId: string,
  tenantId: string,
  policyId: string
): boolean {
  const state = isPlainRecord(version.state) ? version.state : null;
  const calculatedStateHash = safePolicyHistoryHash(
    state,
    'policy history version state'
  );
  return (
    version.schemaVersion === POLICY_VERSION_SCHEMA_VERSION &&
    version.id === documentId &&
    version.tenantId === tenantId &&
    version.policyId === policyId &&
    Number.isSafeInteger(version.revision) &&
    (version.revision as number) >= 0 &&
    state !== null &&
    state.id === policyId &&
    state.tenantId === tenantId &&
    (version.revision === 0
      ? state.revision === undefined || state.revision === 0
      : state.revision === version.revision) &&
    typeof version.stateHash === 'string' &&
    SHA256_PATTERN.test(version.stateHash) &&
    version.stateHash === calculatedStateHash &&
    Array.isArray(version.changedFields) &&
    version.changedFields.length <= 100 &&
    version.changedFields.every((field) => typeof field === 'string') &&
    new Set(version.changedFields).size === version.changedFields.length &&
    typeof version.recordedAt === 'string' &&
    Number.isFinite(Date.parse(version.recordedAt))
  );
}

function policyHistoryCommandArtifactIsValid(params: {
  version: Record<string, unknown>;
  documentId: string;
  olderVersion: Record<string, unknown> | null;
  olderDocumentId: string | null;
  commandId: string | null;
  receipt: Record<string, unknown> | undefined;
  audit: Record<string, unknown> | undefined;
  tenantId: string;
  policyId: string;
}): boolean {
  const {
    version,
    documentId,
    olderVersion,
    olderDocumentId,
    commandId,
    receipt,
    audit,
    tenantId,
    policyId,
  } = params;
  if (
    !policyHistoryVersionEnvelopeIsValid(
      version,
      documentId,
      tenantId,
      policyId
    ) ||
    commandId === null ||
    !receipt ||
    !audit
  ) {
    return false;
  }

  const artifact = policyHistoryCommandArtifact(receipt.commandName);
  const revision = version.revision as number;
  const state = version.state as Record<string, unknown>;
  const result = isPlainRecord(receipt.result) ? receipt.result : null;
  const beforeSummary = isPlainRecord(audit.beforeSummary)
    ? audit.beforeSummary
    : null;
  const afterSummary = isPlainRecord(audit.afterSummary)
    ? audit.afterSummary
    : null;
  let resultHash: string | null = null;
  let resultByteLength: number | null = null;
  try {
    if (result) {
      const serialized = serializeTrustedCommandJson(
        result,
        'policy history command result'
      );
      resultHash = stableTrustedValueHash(
        result,
        'policy history command result'
      );
      resultByteLength = commandJsonByteLength(serialized);
    }
  } catch {
    return false;
  }

  const commandName = receipt.commandName as TenantPermissionAction;
  const actorRole = receipt.actorRole;
  const expectedRevision =
    commandName === 'policy.create' ? null : revision - 1;
  const expectedWorkflowContext = artifact
    ? `command:ev${CURRENT_COMMAND_ENVELOPE_VERSION}:${commandName}:cv${POLICY_COMMAND_VERSION}:${commandId} | ${artifact.workflowContext}`
    : null;
  const olderEnvelopeValid =
    olderVersion !== null &&
    olderDocumentId !== null &&
    policyHistoryVersionEnvelopeIsValid(
      olderVersion,
      olderDocumentId,
      tenantId,
      policyId
    ) &&
    olderVersion.revision === revision - 1 &&
    version.previousVersionId === olderDocumentId &&
    version.previousStateHash === olderVersion.stateHash;

  return Boolean(
    artifact &&
      state.status === artifact.resultingStatus &&
      version.commandId === commandId &&
      version.recordedBy === receipt.actorId &&
      (commandName === 'policy.create'
        ? revision === 1 &&
          olderVersion === null &&
          version.previousVersionId === null &&
          version.previousStateHash === null &&
          audit.beforeSummary === null
        : revision > 0 &&
          olderEnvelopeValid &&
          beforeSummary?.versionId === olderDocumentId &&
          beforeSummary?.stateHash === olderVersion?.stateHash) &&
      receipt.schemaVersion === COMMAND_RECEIPT_SCHEMA_VERSION &&
      receipt.envelopeVersion === CURRENT_COMMAND_ENVELOPE_VERSION &&
      receipt.commandVersion === POLICY_COMMAND_VERSION &&
      receipt.id === commandId &&
      receipt.commandId === commandId &&
      receipt.tenantId === tenantId &&
      receipt.status === 'completed' &&
      isValidUserRole(actorRole) &&
      actorRole !== 'platform_admin' &&
      rolesForTenantAction(commandName).includes(
        actorRole as Exclude<UserRole, 'platform_admin'>
      ) &&
      receipt.payloadHashVersion === 'sha256-canonical-json-v1' &&
      typeof receipt.payloadHash === 'string' &&
      SHA256_PATTERN.test(receipt.payloadHash) &&
      Number.isSafeInteger(receipt.payloadByteLength) &&
      (receipt.payloadByteLength as number) >= 0 &&
      (receipt.payloadByteLength as number) <= 64 * 1024 &&
      receipt.expectedRevisionWasProvided === true &&
      receipt.expectedRevision === expectedRevision &&
      result !== null &&
      result.policyId === policyId &&
      result.revision === revision &&
      (!artifact.resultIncludesStatus || result.status === artifact.resultingStatus) &&
      receipt.resultHash === resultHash &&
      receipt.resultByteLength === resultByteLength &&
      Number.isSafeInteger(receipt.resultByteLength) &&
      (receipt.resultByteLength as number) >= 0 &&
      (receipt.resultByteLength as number) <= 32 * 1024 &&
      receipt.entityType === 'policy' &&
      receipt.entityId === policyId &&
      receipt.auditAction === artifact.auditAction &&
      receipt.auditLogId === audit.id &&
      receipt.auditWorkflowContext === expectedWorkflowContext &&
      Array.isArray(receipt.outboxEventIds) &&
      receipt.outboxEventIds.length === 0 &&
      typeof receipt.committedAt === 'string' &&
      Number.isFinite(Date.parse(receipt.committedAt)) &&
      audit.tenantId === tenantId &&
      audit.actorId === receipt.actorId &&
      audit.actorRole === actorRole &&
      audit.actorType === 'tenant_user' &&
      typeof audit.actorEmail === 'string' &&
      audit.actorEmail.length > 0 &&
      audit.entityType === 'policy' &&
      audit.entityId === policyId &&
      audit.action === artifact.auditAction &&
      audit.source === 'cloud_function' &&
      audit.workflowContext === expectedWorkflowContext &&
      typeof audit.timestamp === 'string' &&
      Number.isFinite(Date.parse(audit.timestamp)) &&
      afterSummary?.versionId === documentId &&
      afterSummary?.stateHash === version.stateHash
  );
}

/**
 * Verifies each materialized policy against its exact immutable current
 * version, command receipt, audit event, and immediately preceding version.
 * Read projections must never infer workflow assurance from mutable fields.
 */
async function verifyCurrentPolicyArtifacts(
  tenantId: string,
  policies: Policy[]
): Promise<Map<string, boolean>> {
  const verified = new Map(policies.map((policy) => [policy.id, false]));
  const candidates = policies.flatMap((policy) => {
    try {
      assertPolicyIdentity(policy, tenantId, policy.id);
      const revision = policyRevision(policy);
      if (revision < 1) return [];
      return [{ policy, revision, versionId: policyVersionId(revision) }];
    } catch {
      return [];
    }
  });
  if (candidates.length === 0) return verified;

  const currentVersionSnapshots = await db.getAll(
    ...candidates.map(({ policy, versionId }) =>
      db.doc(`tenants/${tenantId}/policies/${policy.id}/versions/${versionId}`)
    )
  );
  const currentVersions = new Map(
    currentVersionSnapshots.map((snapshot) => [
      `${snapshot.ref.parent.parent?.id ?? ''}:${snapshot.id}`,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  const commandIds = [...new Set(currentVersionSnapshots.flatMap((snapshot) => {
    const commandId = snapshot.data()?.commandId;
    try {
      return normalizeCommandId(commandId) === commandId ? [commandId] : [];
    } catch {
      return [];
    }
  }))];
  const receiptSnapshots = commandIds.length
    ? await db.getAll(
        ...commandIds.map((commandId) =>
          db.doc(`tenants/${tenantId}/command_receipts/${commandId}`)
        )
      )
    : [];
  const receipts = new Map(
    receiptSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  const auditIds = [...new Set(receiptSnapshots.flatMap((snapshot) => {
    const auditId = snapshot.data()?.auditLogId;
    try {
      return normalizePolicyDocumentId(auditId, 'auditLogId') === auditId
        ? [auditId]
        : [];
    } catch {
      return [];
    }
  }))];
  const auditSnapshots = auditIds.length
    ? await db.getAll(
        ...auditIds.map((auditId) =>
          db.doc(`tenants/${tenantId}/audit_logs/${auditId}`)
        )
      )
    : [];
  const audits = new Map(
    auditSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  const previousReferences = candidates.flatMap(({ policy, versionId }) => {
    const current = currentVersions.get(`${policy.id}:${versionId}`);
    const previousVersionId = current?.previousVersionId;
    return typeof previousVersionId === 'string' && /^r[0-9]{10}$/u.test(previousVersionId)
      ? [{ policyId: policy.id, versionId: previousVersionId }]
      : [];
  });
  const previousSnapshots = previousReferences.length
    ? await db.getAll(
        ...previousReferences.map(({ policyId, versionId }) =>
          db.doc(`tenants/${tenantId}/policies/${policyId}/versions/${versionId}`)
        )
      )
    : [];
  const previousVersions = new Map(
    previousSnapshots.map((snapshot) => [
      `${snapshot.ref.parent.parent?.id ?? ''}:${snapshot.id}`,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  candidates.forEach(({ policy, versionId }) => {
    const current = currentVersions.get(`${policy.id}:${versionId}`);
    if (!current || safePolicyHistoryHash(policy, 'current policy read state') !== current.stateHash) {
      return;
    }
    const commandId = typeof current.commandId === 'string' ? current.commandId : null;
    const receipt = commandId ? receipts.get(commandId) : undefined;
    const audit =
      typeof receipt?.auditLogId === 'string'
        ? audits.get(receipt.auditLogId)
        : undefined;
    const previousVersionId =
      typeof current.previousVersionId === 'string'
        ? current.previousVersionId
        : null;
    const previous = previousVersionId
      ? previousVersions.get(`${policy.id}:${previousVersionId}`) ?? null
      : null;
    verified.set(
      policy.id,
      policyHistoryCommandArtifactIsValid({
        version: current,
        documentId: versionId,
        olderVersion: previous,
        olderDocumentId: previousVersionId,
        commandId,
        receipt,
        audit,
        tenantId,
        policyId: policy.id,
      })
    );
  });

  return verified;
}

/**
 * Least-privilege auditor projection joining immutable version, command receipt,
 * and audit metadata without exposing receipt payload hashes or internal fields.
 */
export const getTenantPolicyHistory = onCall<GetPolicyHistoryInput>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainRecord(input)) {
    throw new HttpsError('invalid-argument', 'Policy history input must be an object.');
  }
  const unknown = Object.keys(input).filter(
    (key) => !['tenantId', 'policyId', 'pageSize', 'cursorRevision'].includes(key)
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Policy history input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const tenantId = normalizePolicyDocumentId(input.tenantId, 'tenantId');
  const policyId = normalizePolicyDocumentId(input.policyId, 'policyId');
  const pageSize = normalizedPageSize(input.pageSize, 10, 20);
  const cursorRevision = input.cursorRevision;
  if (
    cursorRevision !== undefined &&
    (!Number.isSafeInteger(cursorRevision) || (cursorRevision as number) < 0)
  ) {
    throw new HttpsError(
      'invalid-argument',
      'cursorRevision must be a non-negative safe integer.'
    );
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'auditor',
    'approver',
  ]);
  const policyRef = db.doc(`tenants/${tenantId}/policies/${policyId}`);
  const policySnapshot = await policyRef.get();
  if (!policySnapshot.exists) {
    throw new HttpsError('not-found', 'Policy document does not exist.');
  }
  assertPolicyIdentity(policySnapshot.data() as Policy, tenantId, policyId);

  let query: FirebaseFirestore.Query = policyRef
    .collection('versions')
    .orderBy('revision', 'desc');
  if (cursorRevision !== undefined) {
    query = query.startAfter(cursorRevision);
  }
  const versionSnapshot = await query.limit(pageSize + 1).get();
  const versionDocuments = versionSnapshot.docs.slice(0, pageSize);
  const commandIds = versionDocuments.map((document) => {
    const commandId = document.data().commandId;
    if (commandId === null) return null;
    try {
      return normalizeCommandId(commandId);
    } catch {
      return null;
    }
  });
  const receiptReferences = [...new Set(
    commandIds.filter((commandId): commandId is string => commandId !== null)
  )]
    .map((commandId) =>
      db.doc(`tenants/${tenantId}/command_receipts/${commandId}`)
    );
  const receiptSnapshots = receiptReferences.length
    ? await db.getAll(...receiptReferences)
    : [];
  const receiptsByCommandId = new Map(
    receiptSnapshots.map((snapshot) => [snapshot.id, snapshot.data()])
  );
  const auditIds = receiptSnapshots.flatMap((snapshot) => {
    const auditLogId = snapshot.data()?.auditLogId;
    try {
      const normalized = normalizePolicyDocumentId(auditLogId, 'auditLogId');
      return normalized === auditLogId ? [normalized] : [];
    } catch {
      return [];
    }
  });
  const auditReferences = [...new Set(auditIds)].map((auditId) =>
    db.doc(`tenants/${tenantId}/audit_logs/${auditId}`)
  );
  const auditSnapshots = auditReferences.length
    ? await db.getAll(...auditReferences)
    : [];
  const auditsById = new Map(
    auditSnapshots.map((snapshot) => [snapshot.id, snapshot.data()])
  );

  const history = versionDocuments.map((document, index) => {
    const version = document.data();
    const commandId = commandIds[index] ?? null;
    const receipt = commandId ? receiptsByCommandId.get(commandId) : undefined;
    const audit =
      typeof receipt?.auditLogId === 'string'
        ? auditsById.get(receipt.auditLogId)
        : undefined;
    const olderDocument = versionSnapshot.docs[index + 1];
    const olderVersion = olderDocument?.data() ?? null;
    const baseline = version.revision === 0;
    const baselineEnvelopeValid =
      baseline &&
      policyHistoryVersionEnvelopeIsValid(
        version,
        document.id,
        tenantId,
        policyId
      ) &&
      version.commandId === null &&
      version.recordedBy === null &&
      version.previousVersionId === null &&
      version.previousStateHash === null &&
      version.provenance === 'legacy_baseline_captured_on_first_command' &&
      olderVersion === null;
    const commandArtifactVerified = policyHistoryCommandArtifactIsValid({
      version,
      documentId: document.id,
      olderVersion,
      olderDocumentId: olderDocument?.id ?? null,
      commandId,
      receipt,
      audit,
      tenantId,
      policyId,
    });
    return {
      versionId: document.id,
      revision: version.revision,
      state: version.state,
      stateHash: version.stateHash,
      previousVersionId: version.previousVersionId,
      previousStateHash: version.previousStateHash,
      changedFields: version.changedFields,
      recordedBy: version.recordedBy ?? null,
      recordedAt: version.recordedAt,
      provenance: version.provenance ?? 'authoritative_command',
      integrityStatus: baseline
        ? baselineEnvelopeValid
          ? 'legacy_baseline_unverified'
          : 'invalid'
        : commandArtifactVerified
          ? 'verified'
          : 'invalid',
      command:
        commandId && receipt
          ? {
              commandId,
              commandName: receipt.commandName,
              committedAt: receipt.committedAt,
            }
          : null,
      audit:
        audit && receipt
          ? {
              id: audit.id,
              action: audit.action,
              actorId: audit.actorId,
              actorEmail: audit.actorEmail,
              actorRole: audit.actorRole,
              timestamp: audit.timestamp,
              workflowContext: audit.workflowContext,
            }
          : null,
    };
  });

  return {
    history,
    truncated: versionSnapshot.size > pageSize,
    nextCursorRevision:
      versionSnapshot.size > pageSize && history.length > 0
        ? history[history.length - 1]!.revision
        : null,
  };
});

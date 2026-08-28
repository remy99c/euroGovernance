/**
 * Transactional command boundary for authoritative tenant-scoped mutations.
 *
 * Security invariants:
 * - The callable authentication context is the only source of actor identity.
 * - Tenant and membership records are re-read in the mutation transaction.
 * - A command ID can commit at most one payload for one actor and command name.
 * - Authoritative state, its audit event, and the idempotency receipt commit atomically.
 * - Replays return the stored result only after validating its immutable audit anchor.
 * - Command callbacks may perform Firestore transaction operations only. Network calls,
 *   email delivery, and other side effects belong in a transactional outbox consumer.
 */

import { createHash } from 'node:crypto';
import type { CallableRequest } from 'firebase-functions/v2/https';
import { HttpsError } from 'firebase-functions/v2/https';
import type {
  DocumentData,
  DocumentSnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import type {
  AuditActionType,
  Tenant,
  TenantMembership,
  UserRole,
} from '@eurogovernance/shared-types';
import { isValidUserRole } from '@eurogovernance/shared-types';
import { db } from './firebase.js';
import { requireAuth, verifyActiveTenantMembership } from './auth-helpers.js';
import { appendAuditLogInTransaction } from './audit.js';
import { consumeCommandAttemptBudget } from './command-rate-limit.js';
import {
  rolesForTenantAction,
  type TenantPermissionAction,
} from './action-permissions.js';
import {
  COMMAND_BOUNDARY_LIMITS,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CURRENT_COMMAND_ENVELOPE_VERSION,
  MAXIMUM_COMMAND_VERSION,
  CommandBoundaryValueError,
  assertExpectedRevision,
  assertNoClientActorFields,
  commandJsonByteLength as byteLength,
  isPlainJsonRecord as isPlainRecord,
  parseTenantCommandEnvelope,
  serializeClientCommandJson as serializeClientValue,
  serializeCommandJson as serializeJson,
  serializeTrustedCommandJson as serializeTrustedValue,
} from './command-boundary-values.js';
import type {
  CommandRevision,
  TenantCommandEnvelope,
} from './command-boundary-values.js';

export {
  COMMAND_BOUNDARY_LIMITS,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CURRENT_COMMAND_ENVELOPE_VERSION,
  MAXIMUM_COMMAND_VERSION,
  assertExpectedRevision,
  assertNoClientActorFields,
  normalizeCommandId,
  parseTenantCommandEnvelope,
  stablePayloadHash,
  stableTrustedValueHash,
} from './command-boundary-values.js';
export type { CommandRevision, TenantCommandEnvelope } from './command-boundary-values.js';

/**
 * Runtime perimeter for every callable that delegates to executeTenantCommand.
 * Keep this explicit on each exported callable so unregistered clients are
 * rejected by the Functions platform before domain code is entered.
 */
export const AUTHORITATIVE_CALLABLE_OPTIONS = Object.freeze({
  enforceAppCheck: true,
  consumeAppCheckToken: false,
});

const PAYLOAD_HASH_VERSION = 'sha256-canonical-json-v1' as const;
const COMMAND_NAME_PATTERN = /^[a-z][a-z0-9_.:-]{2,79}$/;
const ENTITY_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]{0,79}$/;
const OUTBOX_EVENT_TYPE_PATTERN = /^[a-z][a-z0-9_.:-]{2,79}$/;
const DOCUMENT_ID_PATTERN = /^[^/\s]{1,128}$/;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;

const VALID_AUDIT_ACTIONS = new Set<AuditActionType>([
  'create',
  'update',
  'delete',
  'approve',
  'reject',
  'link',
  'status_transition',
  'export_generated',
  'permission_assigned',
  'login_mfa_success',
  'login_mfa_failed',
]);

export type TenantCommandRole = Exclude<UserRole, 'platform_admin'>;

export interface VerifiedCommandActor {
  userId: string;
  email: string;
  role: TenantCommandRole;
}

export interface TenantCommandContext<TPayload> {
  transaction: Transaction;
  envelopeVersion: typeof CURRENT_COMMAND_ENVELOPE_VERSION;
  commandVersion: number;
  tenantId: string;
  commandId: string;
  commandName: string;
  payload: TPayload;
  payloadHash: string;
  expectedRevision: CommandRevision | undefined;
  actor: VerifiedCommandActor;
  requestedAt: string;
}

export interface TenantCommandAudit {
  entityType: string;
  entityId: string;
  action: AuditActionType;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  /** Human-readable context appended after the non-forgeable command anchor. */
  workflowContext?: string | null;
}

export interface TenantCommandMutation<TResult> {
  result: TResult;
  audit: TenantCommandAudit;
  /** Durable post-commit work. Consumers must be idempotent by outbox event ID. */
  outboxEvents?: Array<{
    type: string;
    payload: Record<string, unknown>;
  }>;
}

export interface TenantCommandDefinition<TPayload, TResult> {
  commandName: TenantPermissionAction;
  /** Increment when the meaning or normalized contract of this command changes. */
  commandVersion: number;
  /** Must reject unknown domain fields and return a normalized payload. */
  validatePayload: (payload: unknown) => TPayload;
  /**
   * Required whenever an envelope supplies expectedRevision. The resolver must
   * read the authoritative record through the supplied transaction and return
   * its non-negative integer revision, or null when the record does not exist.
   */
  resolveCurrentRevision?: (
    context: Omit<TenantCommandContext<TPayload>, 'transaction'> & {
      transaction: Transaction;
    }
  ) => Promise<CommandRevision>;
  requireExpectedRevision?: boolean;
  /**
   * Perform Firestore reads/writes only. This callback can be retried by
   * Firestore and therefore must not emit external side effects.
   */
  mutateInTransaction: (
    context: TenantCommandContext<TPayload>
  ) => Promise<TenantCommandMutation<TResult>>;
}

export interface TenantCommandResult<TResult> {
  envelopeVersion: typeof CURRENT_COMMAND_ENVELOPE_VERSION;
  commandVersion: number;
  commandId: string;
  replayed: boolean;
  result: TResult;
  auditLogId: string;
  committedAt: string;
}

interface PersistedCommandReceipt {
  schemaVersion: number;
  envelopeVersion: typeof CURRENT_COMMAND_ENVELOPE_VERSION;
  commandVersion: number;
  id: string;
  tenantId: string;
  commandId: string;
  commandName: string;
  actorId: string;
  actorRole: TenantCommandRole;
  payloadHashVersion: typeof PAYLOAD_HASH_VERSION;
  payloadHash: string;
  payloadByteLength: number;
  expectedRevision: CommandRevision | null;
  expectedRevisionWasProvided: boolean;
  status: 'completed';
  result: unknown;
  resultHash: string;
  resultByteLength: number;
  entityType: string;
  entityId: string;
  auditAction: AuditActionType;
  auditLogId: string;
  auditWorkflowContext: string;
  outboxEventIds: string[];
  committedAt: string;
}

function validateDefinition<TPayload, TResult>(
  definition: TenantCommandDefinition<TPayload, TResult>
): void {
  if (!COMMAND_NAME_PATTERN.test(definition.commandName)) {
    throw new Error(
      'Command definitions require a 3-80 character lower-case commandName.'
    );
  }
  if (
    !Number.isSafeInteger(definition.commandVersion) ||
    definition.commandVersion < 1 ||
    definition.commandVersion > MAXIMUM_COMMAND_VERSION
  ) {
    throw new Error(
      `Command definitions require an integer commandVersion from 1 to ${MAXIMUM_COMMAND_VERSION}.`
    );
  }
  const allowedRoles = rolesForTenantAction(definition.commandName);
  if (!Array.isArray(allowedRoles) || allowedRoles.length === 0) {
    throw new Error('Command definitions require at least one registered tenant role.');
  }
  const uniqueRoles = new Set(allowedRoles);
  if (
    uniqueRoles.size !== allowedRoles.length ||
    allowedRoles.some(
      (role) => !isValidUserRole(role) || role === 'platform_admin'
    )
  ) {
    throw new Error('Command definitions contain a duplicate or invalid tenant role.');
  }
  if (
    typeof definition.validatePayload !== 'function' ||
    typeof definition.mutateInTransaction !== 'function'
  ) {
    throw new Error('Command definitions require payload validation and a transaction callback.');
  }
}

function validateAudit(audit: TenantCommandAudit): void {
  if (!isPlainRecord(audit)) {
    throw new HttpsError('internal', 'Command implementation did not return audit metadata.');
  }
  if (!ENTITY_TYPE_PATTERN.test(audit.entityType)) {
    throw new HttpsError('internal', 'Command audit entityType is invalid.');
  }
  if (
    typeof audit.entityId !== 'string' ||
    audit.entityId !== audit.entityId.trim() ||
    !DOCUMENT_ID_PATTERN.test(audit.entityId)
  ) {
    throw new HttpsError('internal', 'Command audit entityId is invalid.');
  }
  if (!VALID_AUDIT_ACTIONS.has(audit.action)) {
    throw new HttpsError('internal', 'Command audit action is invalid.');
  }
  if (
    audit.workflowContext !== undefined &&
    audit.workflowContext !== null &&
    (typeof audit.workflowContext !== 'string' ||
      audit.workflowContext.length === 0 ||
      audit.workflowContext.length > 160)
  ) {
    throw new HttpsError('internal', 'Command audit workflowContext is invalid.');
  }

  const summaries = {
    beforeSummary: audit.beforeSummary ?? null,
    afterSummary: audit.afterSummary ?? null,
  };
  if (
    summaries.beforeSummary !== null &&
    !isPlainRecord(summaries.beforeSummary)
  ) {
    throw new HttpsError('internal', 'Command beforeSummary must be a plain JSON object.');
  }
  if (summaries.afterSummary !== null && !isPlainRecord(summaries.afterSummary)) {
    throw new HttpsError('internal', 'Command afterSummary must be a plain JSON object.');
  }
  const serialized = serializeTrustedValue(summaries, 'audit summaries');
  if (byteLength(serialized) > COMMAND_BOUNDARY_LIMITS.auditSummaryBytes) {
    throw new HttpsError('internal', 'Command audit summaries exceed the 24 KiB limit.');
  }
}

function validateOutboxEvents(
  events: TenantCommandMutation<unknown>['outboxEvents']
): asserts events is NonNullable<TenantCommandMutation<unknown>['outboxEvents']> | undefined {
  if (events === undefined) return;
  if (!Array.isArray(events) || events.length > 10) {
    throw new HttpsError('internal', 'A command may emit at most 10 outbox events.');
  }
  let totalBytes = 0;
  for (const event of events) {
    if (!isPlainRecord(event) || !OUTBOX_EVENT_TYPE_PATTERN.test(event.type)) {
      throw new HttpsError('internal', 'Command outbox event type is invalid.');
    }
    if (!isPlainRecord(event.payload)) {
      throw new HttpsError('internal', 'Command outbox payload must be a plain JSON object.');
    }
    const serialized = serializeTrustedValue(event.payload, 'outbox payload');
    const eventBytes = byteLength(serialized);
    if (eventBytes > 16 * 1024) {
      throw new HttpsError('internal', 'A command outbox payload exceeds the 16 KiB limit.');
    }
    totalBytes += eventBytes;
  }
  if (totalBytes > 32 * 1024) {
    throw new HttpsError('internal', 'Command outbox payloads exceed the 32 KiB total limit.');
  }
}

function commandAuditWorkflowContext(
  envelopeVersion: typeof CURRENT_COMMAND_ENVELOPE_VERSION,
  commandName: string,
  commandVersion: number,
  commandId: string,
  workflowContext?: string | null
): string {
  const anchor = `command:ev${envelopeVersion}:${commandName}:cv${commandVersion}:${commandId}`;
  return workflowContext ? `${anchor} | ${workflowContext}` : anchor;
}

function invalidReceipt(): never {
  throw new HttpsError(
    'failed-precondition',
    'The command receipt or its audit anchor is invalid. Contact support; the command was not rerun.'
  );
}

function parseReceipt(snapshot: DocumentSnapshot<DocumentData>): PersistedCommandReceipt {
  if (!snapshot.exists) return invalidReceipt();
  const value = snapshot.data();
  if (!isPlainRecord(value)) return invalidReceipt();

  const receipt = value as unknown as PersistedCommandReceipt;
  if (
    receipt.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION ||
    receipt.envelopeVersion !== CURRENT_COMMAND_ENVELOPE_VERSION ||
    !Number.isSafeInteger(receipt.commandVersion) ||
    receipt.commandVersion < 1 ||
    receipt.commandVersion > MAXIMUM_COMMAND_VERSION ||
    receipt.id !== snapshot.id ||
    receipt.commandId !== snapshot.id ||
    receipt.status !== 'completed' ||
    receipt.payloadHashVersion !== PAYLOAD_HASH_VERSION ||
    !SHA256_PATTERN.test(receipt.payloadHash) ||
    !SHA256_PATTERN.test(receipt.resultHash) ||
    !Number.isSafeInteger(receipt.payloadByteLength) ||
    receipt.payloadByteLength < 0 ||
    !Number.isSafeInteger(receipt.resultByteLength) ||
    receipt.resultByteLength < 0 ||
    receipt.resultByteLength > COMMAND_BOUNDARY_LIMITS.resultBytes ||
    typeof receipt.auditLogId !== 'string' ||
    !DOCUMENT_ID_PATTERN.test(receipt.auditLogId) ||
    !Array.isArray(receipt.outboxEventIds) ||
    receipt.outboxEventIds.length > 10 ||
    receipt.outboxEventIds.some(
      (eventId) => typeof eventId !== 'string' || !DOCUMENT_ID_PATTERN.test(eventId)
    ) ||
    typeof receipt.committedAt !== 'string'
  ) {
    return invalidReceipt();
  }

  let serializedResult: string;
  try {
    serializedResult = serializeJson(receipt.result, 'receipt.result');
  } catch {
    return invalidReceipt();
  }
  if (
    byteLength(serializedResult) !== receipt.resultByteLength ||
    createHash('sha256').update(serializedResult, 'utf8').digest('hex') !== receipt.resultHash
  ) {
    return invalidReceipt();
  }
  return receipt;
}

function assertReplayMatches(
  receipt: PersistedCommandReceipt,
  envelope: TenantCommandEnvelope,
  commandName: string,
  actorId: string,
  payloadHash: string,
  payloadByteLength: number
): void {
  const expectedRevisionWasProvided = Object.prototype.hasOwnProperty.call(
    envelope,
    'expectedRevision'
  );
  if (
    receipt.tenantId !== envelope.tenantId ||
    receipt.envelopeVersion !== envelope.envelopeVersion ||
    receipt.commandVersion !== envelope.commandVersion ||
    receipt.commandName !== commandName ||
    receipt.actorId !== actorId ||
    receipt.payloadHash !== payloadHash ||
    receipt.payloadByteLength !== payloadByteLength ||
    receipt.expectedRevisionWasProvided !== expectedRevisionWasProvided ||
    receipt.expectedRevision !== (envelope.expectedRevision ?? null)
  ) {
    throw new HttpsError(
      'already-exists',
      'commandId is already bound to a different command, actor, payload, or expected revision.'
    );
  }
}

function assertAuditAnchor(
  auditSnapshot: DocumentSnapshot<DocumentData>,
  receipt: PersistedCommandReceipt
): void {
  if (!auditSnapshot.exists) return invalidReceipt();
  const audit = auditSnapshot.data();
  if (
    !isPlainRecord(audit) ||
    audit.id !== receipt.auditLogId ||
    audit.tenantId !== receipt.tenantId ||
    audit.actorId !== receipt.actorId ||
    audit.actorRole !== receipt.actorRole ||
    audit.entityType !== receipt.entityType ||
    audit.entityId !== receipt.entityId ||
    audit.action !== receipt.auditAction ||
    audit.source !== 'cloud_function' ||
    audit.workflowContext !== receipt.auditWorkflowContext
  ) {
    return invalidReceipt();
  }
}

/**
 * Execute a tenant-scoped authoritative command through the common trust boundary.
 */
async function executeTenantCommandInternal<TPayload, TResult>(
  request: CallableRequest<unknown>,
  definition: TenantCommandDefinition<TPayload, TResult>
): Promise<TenantCommandResult<TResult>> {
  validateDefinition(definition);
  const auth = requireAuth(request);
  if (!request.app) {
    // `enforceAppCheck` should reject first. This remains as defense in depth
    // if a handler is accidentally invoked without the required runtime option.
    throw new HttpsError(
      'unauthenticated',
      'A valid Firebase App Check attestation is required.'
    );
  }
  if (!auth.emailVerified || !auth.email) {
    throw new HttpsError(
      'permission-denied',
      'A verified email address is required for authoritative tenant commands.'
    );
  }

  const requestedAt = new Date().toISOString();
  // Consume the global/action attempt budget before parsing the untrusted
  // envelope, so authenticated malformed requests are not a free CPU path.
  await consumeCommandAttemptBudget(auth.userId, definition.commandName, requestedAt);
  const envelope = parseTenantCommandEnvelope(request.data);

  const serializedPayload = serializeClientValue(envelope.payload, 'payload');
  const payloadByteLength = byteLength(serializedPayload);
  const payloadHash = createHash('sha256').update(serializedPayload, 'utf8').digest('hex');

  const expectedRevisionWasProvided = Object.prototype.hasOwnProperty.call(
    envelope,
    'expectedRevision'
  );

  // The attempt budget intentionally commits outside the domain transaction so
  // rejected and failed commands still consume budget.
  const tenantRef = db.collection('tenants').doc(envelope.tenantId);
  const membershipRef = tenantRef.collection('memberships').doc(auth.userId);
  const receiptRef = tenantRef.collection('command_receipts').doc(envelope.commandId);

  return db.runTransaction(async (transaction) => {
    // All authorization and receipt checks occur in the same serializable view
    // as the state mutation. This closes membership suspension/role-change races.
    const snapshots = await transaction.getAll(tenantRef, membershipRef, receiptRef);
    const tenantSnapshot = snapshots[0]!;
    const membershipSnapshot = snapshots[1]!;
    const receiptSnapshot = snapshots[2]!;
    const tenant = tenantSnapshot.exists
      ? (tenantSnapshot.data() as Tenant)
      : undefined;
    const membership = membershipSnapshot.exists
      ? (membershipSnapshot.data() as TenantMembership)
      : undefined;
    const verifiedMembership = verifyActiveTenantMembership(
      envelope.tenantId,
      auth.userId,
      tenant,
      membership,
      [...rolesForTenantAction(definition.commandName)]
    );
    const actor: VerifiedCommandActor = {
      userId: auth.userId,
      email: auth.email,
      role: verifiedMembership.role as TenantCommandRole,
    };

    if (receiptSnapshot.exists) {
      const receipt = parseReceipt(receiptSnapshot);
      assertReplayMatches(
        receipt,
        envelope,
        definition.commandName,
        actor.userId,
        payloadHash,
        payloadByteLength
      );
      const auditRef = tenantRef.collection('audit_logs').doc(receipt.auditLogId);
      const auditSnapshot = await transaction.get(auditRef);
      assertAuditAnchor(auditSnapshot, receipt);
      return {
        envelopeVersion: receipt.envelopeVersion,
        commandVersion: receipt.commandVersion,
        commandId: envelope.commandId,
        replayed: true,
        result: receipt.result as TResult,
        auditLogId: receipt.auditLogId,
        committedAt: receipt.committedAt,
      };
    }

    // Domain validators evolve across deployments. Exact retries of already-
    // committed commands must replay their immutable receipt before applying a
    // newer validator or revision policy that may intentionally reject the
    // historical envelope.
    if (envelope.commandVersion !== definition.commandVersion) {
      throw new HttpsError(
        'failed-precondition',
        `Command version ${envelope.commandVersion} is not supported for new ${definition.commandName} commands.`
      );
    }
    if (definition.requireExpectedRevision && !expectedRevisionWasProvided) {
      throw new HttpsError('invalid-argument', 'This command requires expectedRevision.');
    }
    if (expectedRevisionWasProvided && !definition.resolveCurrentRevision) {
      throw new Error(
        `Command '${definition.commandName}' accepts expectedRevision but has no revision resolver.`
      );
    }
    let payload: TPayload;
    try {
      payload = definition.validatePayload(envelope.payload);
    } catch (error) {
      if (error instanceof HttpsError) throw error;
      throw new HttpsError('invalid-argument', 'Command payload failed domain validation.');
    }
    // A normalizer must not smuggle attribution fields into the mutation context.
    assertNoClientActorFields(payload);
    const serializedNormalizedPayload = serializeTrustedValue(payload, 'normalized payload');
    if (byteLength(serializedNormalizedPayload) > COMMAND_BOUNDARY_LIMITS.payloadBytes) {
      throw new HttpsError('internal', 'Normalized command payload exceeds the 64 KiB limit.');
    }

    const context: TenantCommandContext<TPayload> = {
      transaction,
      envelopeVersion: envelope.envelopeVersion,
      commandVersion: envelope.commandVersion,
      tenantId: envelope.tenantId,
      commandId: envelope.commandId,
      commandName: definition.commandName,
      payload,
      payloadHash,
      expectedRevision: envelope.expectedRevision,
      actor,
      requestedAt,
    };

    if (expectedRevisionWasProvided) {
      const currentRevision = await definition.resolveCurrentRevision!(context);
      assertExpectedRevision(envelope.expectedRevision!, currentRevision);
    }

    const mutation = await definition.mutateInTransaction(context);
    if (!isPlainRecord(mutation)) {
      throw new HttpsError('internal', 'Command implementation returned an invalid mutation.');
    }
    validateAudit(mutation.audit);
    validateOutboxEvents(mutation.outboxEvents);

    const serializedResult = serializeTrustedValue(mutation.result, 'result');
    const resultByteLength = byteLength(serializedResult);
    if (resultByteLength > COMMAND_BOUNDARY_LIMITS.resultBytes) {
      throw new HttpsError('internal', 'Command result exceeds the 32 KiB receipt limit.');
    }
    const resultHash = createHash('sha256')
      .update(serializedResult, 'utf8')
      .digest('hex');
    const auditWorkflowContext = commandAuditWorkflowContext(
      envelope.envelopeVersion,
      definition.commandName,
      envelope.commandVersion,
      envelope.commandId,
      mutation.audit.workflowContext
    );
    const auditLogId = appendAuditLogInTransaction(transaction, {
      tenantId: envelope.tenantId,
      actorId: actor.userId,
      actorEmail: actor.email,
      actorRole: actor.role,
      actorType: 'tenant_user',
      entityType: mutation.audit.entityType,
      entityId: mutation.audit.entityId,
      action: mutation.audit.action,
      beforeSummary: mutation.audit.beforeSummary,
      afterSummary: mutation.audit.afterSummary,
      source: 'cloud_function',
      workflowContext: auditWorkflowContext,
    });

    const outboxEventIds = (mutation.outboxEvents ?? []).map((event, index) => {
      const eventId = `${envelope.commandId}_${String(index).padStart(2, '0')}`;
      const eventRef = tenantRef.collection('command_outbox').doc(eventId);
      transaction.create(eventRef, {
        schemaVersion: 1,
        id: eventId,
        tenantId: envelope.tenantId,
        commandId: envelope.commandId,
        commandName: definition.commandName,
        eventType: event.type,
        payload: event.payload,
        status: 'pending',
        attempts: 0,
        createdAt: requestedAt,
        availableAt: requestedAt,
        processedAt: null,
        lastErrorCode: null,
      });
      return eventId;
    });

    const committedAt = new Date().toISOString();
    const receipt: PersistedCommandReceipt = {
      schemaVersion: COMMAND_RECEIPT_SCHEMA_VERSION,
      envelopeVersion: envelope.envelopeVersion,
      commandVersion: envelope.commandVersion,
      id: envelope.commandId,
      tenantId: envelope.tenantId,
      commandId: envelope.commandId,
      commandName: definition.commandName,
      actorId: actor.userId,
      actorRole: actor.role,
      payloadHashVersion: PAYLOAD_HASH_VERSION,
      payloadHash,
      payloadByteLength,
      expectedRevision: envelope.expectedRevision ?? null,
      expectedRevisionWasProvided,
      status: 'completed',
      result: mutation.result,
      resultHash,
      resultByteLength,
      entityType: mutation.audit.entityType,
      entityId: mutation.audit.entityId,
      auditAction: mutation.audit.action,
      auditLogId,
      auditWorkflowContext,
      outboxEventIds,
      committedAt,
    };
    transaction.create(receiptRef, receipt);

    return {
      envelopeVersion: envelope.envelopeVersion,
      commandVersion: envelope.commandVersion,
      commandId: envelope.commandId,
      replayed: false,
      result: mutation.result,
      auditLogId,
      committedAt,
    };
  });
}

/**
 * Execute a tenant-scoped authoritative command through the common trust boundary.
 * Pure value validation errors are converted to callable-safe HTTPS errors here,
 * keeping the canonicalization module independent of Firebase Admin at test time.
 */
export async function executeTenantCommand<TPayload, TResult>(
  request: CallableRequest<unknown>,
  definition: TenantCommandDefinition<TPayload, TResult>
): Promise<TenantCommandResult<TResult>> {
  try {
    return await executeTenantCommandInternal(request, definition);
  } catch (error) {
    if (error instanceof CommandBoundaryValueError) {
      throw new HttpsError(error.code, error.message);
    }
    throw error;
  }
}

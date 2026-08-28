/** Pure validation and canonicalization primitives for the command boundary. */

import { createHash } from 'node:crypto';

export const COMMAND_BOUNDARY_LIMITS = Object.freeze({
  requestBytes: 96 * 1024,
  payloadBytes: 64 * 1024,
  resultBytes: 32 * 1024,
  auditSummaryBytes: 24 * 1024,
  maximumJsonDepth: 24,
  maximumJsonNodes: 10_000,
});

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const UUID_LIKE_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const ULID_PATTERN = /^[0-7][0-9A-HJKMNP-TV-Z]{25}$/i;
const RESERVED_ACTOR_FIELDS = new Set([
  'actorid',
  'actoremail',
  'actorrole',
  'actortype',
  'createdby',
  'updatedby',
  'requestedby',
  'submittedby',
  'reviewedby',
  'approvedby',
  'rejectedby',
  'auditactor',
  'auditsource',
  'audittimestamp',
]);
const UNSAFE_OBJECT_KEYS = new Set(['__proto__', 'prototype', 'constructor']);

export type CommandRevision = number | null;

export const CURRENT_COMMAND_ENVELOPE_VERSION = 1 as const;
export const COMMAND_RECEIPT_SCHEMA_VERSION = 2 as const;
export const MAXIMUM_COMMAND_VERSION = 1_000;

export interface TenantCommandEnvelope {
  envelopeVersion: typeof CURRENT_COMMAND_ENVELOPE_VERSION;
  commandVersion: number;
  tenantId: string;
  commandId: string;
  /** `null` asserts that the target does not yet exist. */
  expectedRevision?: CommandRevision;
  payload: unknown;
}

class CanonicalJsonError extends Error {}

export type CommandBoundaryValueErrorCode =
  | 'invalid-argument'
  | 'resource-exhausted'
  | 'aborted'
  | 'internal';

export class CommandBoundaryValueError extends Error {
  constructor(
    readonly code: CommandBoundaryValueErrorCode,
    message: string
  ) {
    super(message);
    this.name = 'CommandBoundaryValueError';
  }
}

function normalizedFieldName(fieldName: string): string {
  return fieldName.replace(/[_-]/g, '').toLowerCase();
}

export function commandJsonByteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

export function isPlainJsonRecord(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function canonicalizeJson(
  value: unknown,
  state: { nodes: number },
  depth: number,
  path: string
): string {
  state.nodes += 1;
  if (state.nodes > COMMAND_BOUNDARY_LIMITS.maximumJsonNodes) {
    throw new CanonicalJsonError(
      `JSON value exceeds ${COMMAND_BOUNDARY_LIMITS.maximumJsonNodes} nodes.`
    );
  }
  if (depth > COMMAND_BOUNDARY_LIMITS.maximumJsonDepth) {
    throw new CanonicalJsonError(
      `JSON value exceeds maximum nesting depth ${COMMAND_BOUNDARY_LIMITS.maximumJsonDepth}.`
    );
  }

  if (value === null) return 'null';
  if (typeof value === 'string' || typeof value === 'boolean') return JSON.stringify(value);
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) {
      throw new CanonicalJsonError(`${path} contains a non-finite number.`);
    }
    return JSON.stringify(Object.is(value, -0) ? 0 : value);
  }
  if (typeof value !== 'object') {
    throw new CanonicalJsonError(`${path} contains a non-JSON value.`);
  }

  if (Array.isArray(value)) {
    const serialized: string[] = [];
    for (let index = 0; index < value.length; index += 1) {
      if (!(index in value)) {
        throw new CanonicalJsonError(`${path}[${index}] is an array hole.`);
      }
      serialized.push(canonicalizeJson(value[index], state, depth + 1, `${path}[${index}]`));
    }
    return `[${serialized.join(',')}]`;
  }

  if (!isPlainJsonRecord(value)) {
    throw new CanonicalJsonError(`${path} must contain plain JSON objects only.`);
  }
  const keys = Object.keys(value).sort();
  const serialized = keys.map((key) => {
    if (UNSAFE_OBJECT_KEYS.has(key)) {
      throw new CanonicalJsonError(`${path} contains unsafe object key '${key}'.`);
    }
    return `${JSON.stringify(key)}:${canonicalizeJson(
      value[key],
      state,
      depth + 1,
      `${path}.${key}`
    )}`;
  });
  return `{${serialized.join(',')}}`;
}

export function serializeCommandJson(value: unknown, path: string): string {
  return canonicalizeJson(value, { nodes: 0 }, 0, path);
}

export function serializeClientCommandJson(value: unknown, path: string): string {
  try {
    return serializeCommandJson(value, path);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new CommandBoundaryValueError('invalid-argument', error.message);
    }
    throw error;
  }
}

export function serializeTrustedCommandJson(value: unknown, path: string): string {
  try {
    return serializeCommandJson(value, path);
  } catch (error) {
    if (error instanceof CanonicalJsonError) {
      throw new CommandBoundaryValueError(
        'internal',
        `Command implementation produced invalid ${path}.`
      );
    }
    throw error;
  }
}

/** Deterministic SHA-256 over a strictly validated canonical JSON representation. */
export function stablePayloadHash(payload: unknown): string {
  const serialized = serializeClientCommandJson(payload, 'payload');
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/** Deterministic hash for server-derived JSON state stored beside immutable versions. */
export function stableTrustedValueHash(value: unknown, path = 'trusted value'): string {
  const serialized = serializeTrustedCommandJson(value, path);
  return createHash('sha256').update(serialized, 'utf8').digest('hex');
}

/** Accept a canonical UUID-like identifier or a Crockford-base32 ULID. */
export function normalizeCommandId(commandId: unknown): string {
  if (
    typeof commandId !== 'string' ||
    commandId.length < 26 ||
    commandId.length > 36 ||
    commandId !== commandId.trim()
  ) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      'commandId must be a UUID-like identifier or ULID.'
    );
  }
  if (UUID_LIKE_PATTERN.test(commandId) && !/^0{8}-(?:0{4}-){3}0{12}$/.test(commandId)) {
    return commandId.toLowerCase();
  }
  if (ULID_PATTERN.test(commandId)) return commandId.toUpperCase();
  throw new CommandBoundaryValueError(
    'invalid-argument',
    'commandId must be a UUID-like identifier or ULID.'
  );
}

/** Reject client-controlled audit attribution anywhere in a domain payload. */
export function assertNoClientActorFields(value: unknown): void {
  const visit = (candidate: unknown, path: string, depth: number): void => {
    if (depth > COMMAND_BOUNDARY_LIMITS.maximumJsonDepth) return;
    if (Array.isArray(candidate)) {
      candidate.forEach((entry, index) => visit(entry, `${path}[${index}]`, depth + 1));
      return;
    }
    if (!isPlainJsonRecord(candidate)) return;
    for (const [key, nested] of Object.entries(candidate)) {
      if (RESERVED_ACTOR_FIELDS.has(normalizedFieldName(key))) {
        throw new CommandBoundaryValueError(
          'invalid-argument',
          `${path}.${key} is server-derived and must not be supplied by the client.`
        );
      }
      visit(nested, `${path}.${key}`, depth + 1);
    }
  };
  visit(value, 'payload', 0);
}

export function parseTenantCommandEnvelope(data: unknown): TenantCommandEnvelope {
  const serializedRequest = serializeClientCommandJson(data, 'request.data');
  if (commandJsonByteLength(serializedRequest) > COMMAND_BOUNDARY_LIMITS.requestBytes) {
    throw new CommandBoundaryValueError(
      'resource-exhausted',
      'Command request exceeds the 96 KiB limit.'
    );
  }
  if (!isPlainJsonRecord(data)) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      'Command request must be a JSON object.'
    );
  }
  const allowedKeys = new Set([
    'envelopeVersion',
    'commandVersion',
    'tenantId',
    'commandId',
    'expectedRevision',
    'payload',
  ]);
  const unknownKeys = Object.keys(data).filter((key) => !allowedKeys.has(key));
  if (unknownKeys.length > 0) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      `Command request contains unsupported field(s): ${unknownKeys.join(', ')}.`
    );
  }
  if (!Object.prototype.hasOwnProperty.call(data, 'payload')) {
    throw new CommandBoundaryValueError('invalid-argument', 'Command request requires payload.');
  }
  if (data.envelopeVersion !== CURRENT_COMMAND_ENVELOPE_VERSION) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      `envelopeVersion must be ${CURRENT_COMMAND_ENVELOPE_VERSION}.`
    );
  }
  if (
    !Number.isSafeInteger(data.commandVersion) ||
    (data.commandVersion as number) < 1 ||
    (data.commandVersion as number) > MAXIMUM_COMMAND_VERSION
  ) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      `commandVersion must be an integer from 1 to ${MAXIMUM_COMMAND_VERSION}.`
    );
  }
  if (
    typeof data.tenantId !== 'string' ||
    data.tenantId !== data.tenantId.trim() ||
    !TENANT_ID_PATTERN.test(data.tenantId)
  ) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      'tenantId must be a valid tenant document identifier.'
    );
  }

  const commandId = normalizeCommandId(data.commandId);
  const expectedRevisionWasProvided = Object.prototype.hasOwnProperty.call(data, 'expectedRevision');
  const expectedRevision = data.expectedRevision;
  if (
    expectedRevisionWasProvided &&
    expectedRevision !== null &&
    (!Number.isSafeInteger(expectedRevision) || (expectedRevision as number) < 0)
  ) {
    throw new CommandBoundaryValueError(
      'invalid-argument',
      'expectedRevision must be a non-negative safe integer or null.'
    );
  }
  const serializedPayload = serializeClientCommandJson(data.payload, 'payload');
  if (commandJsonByteLength(serializedPayload) > COMMAND_BOUNDARY_LIMITS.payloadBytes) {
    throw new CommandBoundaryValueError(
      'resource-exhausted',
      'Command payload exceeds the 64 KiB limit.'
    );
  }
  assertNoClientActorFields(data.payload);

  return {
    envelopeVersion: CURRENT_COMMAND_ENVELOPE_VERSION,
    commandVersion: data.commandVersion as number,
    tenantId: data.tenantId,
    commandId,
    ...(expectedRevisionWasProvided
      ? { expectedRevision: expectedRevision as CommandRevision }
      : {}),
    payload: data.payload,
  };
}

export function assertExpectedRevision(
  expectedRevision: CommandRevision,
  currentRevision: CommandRevision
): void {
  const validRevision = (value: CommandRevision) =>
    value === null || (Number.isSafeInteger(value) && value >= 0);
  if (!validRevision(expectedRevision) || !validRevision(currentRevision)) {
    throw new CommandBoundaryValueError(
      'internal',
      'Revision resolver returned an invalid revision.'
    );
  }
  if (expectedRevision !== currentRevision) {
    throw new CommandBoundaryValueError(
      'aborted',
      `The record changed before this command committed (expected ${String(
        expectedRevision
      )}, current ${String(currentRevision)}). Refresh and retry with a new commandId.`
    );
  }
}

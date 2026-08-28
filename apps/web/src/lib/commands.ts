export interface TenantCommandEnvelope<TPayload> {
  envelopeVersion: 1;
  commandVersion: number;
  tenantId: string;
  commandId: string;
  expectedRevision?: number | null;
  payload: TPayload;
}

export interface RetryableTenantCommandIntent<TPayload> {
  commandVersion: number;
  tenantId: string;
  action: string;
  /**
   * A non-sensitive domain identifier, such as a certification ID. Creates
   * omit this value so the canonical payload fingerprint becomes the intent
   * key; changed create data can therefore never inherit an old command ID.
   */
  logicalKey?: string;
  expectedRevision?: number | null;
  payload: TPayload;
}

export interface RetryableTenantCommandReference {
  commandVersion: number;
  tenantId: string;
  action: string;
  commandId: string;
}

interface StoredRetryMetadata {
  schemaVersion: 2;
  commandVersion: number;
  tenantId: string;
  action: string;
  logicalKey: string;
  commandId: string;
  expectedRevision: number | null;
  payloadHash: string;
  createdAt: number;
}

const COMMAND_ENVELOPE_VERSION = 1 as const;
const RETRY_SCHEMA_VERSION = 2 as const;
const RETRY_TTL_MS = 7 * 24 * 60 * 60 * 1000;
const RETRY_STORAGE_PREFIX = 'eurogovernance:tenant-command:v2:';
const MAX_STORED_RECORD_LENGTH = 2048;
const memoryRetryMetadata = new Map<string, StoredRetryMetadata>();
let browserStorageUnavailable = false;

function assertMetadataValue(value: string, label: string, maxLength: number): void {
  if (
    typeof value !== 'string' ||
    value.length === 0 ||
    value.length > maxLength ||
    value.trim() !== value ||
    /[\u0000-\u001f\u007f]/u.test(value)
  ) {
    throw new Error(`${label} is invalid.`);
  }
}

function normalizeExpectedRevision(value: number | null | undefined): number | null {
  if (value === undefined || value === null) return null;
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('expectedRevision must be a non-negative safe integer or null.');
  }
  return value;
}

function normalizeCommandVersion(value: number): number {
  if (!Number.isSafeInteger(value) || value < 1 || value > 1_000) {
    throw new Error('commandVersion must be an integer from 1 to 1000.');
  }
  return value;
}

function canonicalJson(value: unknown, ancestors = new Set<object>()): string {
  if (value === null) return 'null';

  switch (typeof value) {
    case 'string':
    case 'boolean':
      return JSON.stringify(value);
    case 'number':
      if (!Number.isFinite(value)) {
        throw new Error('Command payload numbers must be finite.');
      }
      return JSON.stringify(value);
    case 'object': {
      if (ancestors.has(value)) {
        throw new Error('Command payload must not contain circular references.');
      }

      ancestors.add(value);
      try {
        if (Array.isArray(value)) {
          return `[${value.map((item) => canonicalJson(item, ancestors)).join(',')}]`;
        }

        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
          throw new Error('Command payload must contain only JSON-compatible objects.');
        }

        const objectValue = value as Record<string, unknown>;
        const entries = Object.keys(objectValue)
          .sort()
          .map((key) => {
            const item = objectValue[key];
            if (
              item === undefined ||
              typeof item === 'function' ||
              typeof item === 'symbol' ||
              typeof item === 'bigint'
            ) {
              throw new Error('Command payload must contain only JSON-compatible values.');
            }
            return `${JSON.stringify(key)}:${canonicalJson(item, ancestors)}`;
          });
        return `{${entries.join(',')}}`;
      } finally {
        ancestors.delete(value);
      }
    }
    default:
      throw new Error('Command payload must contain only JSON-compatible values.');
  }
}

function commandCrypto(): Crypto {
  const cryptoApi = globalThis.crypto;
  if (!cryptoApi?.randomUUID || !cryptoApi.subtle) {
    throw new Error('Secure command retry support is unavailable in this browser context.');
  }
  return cryptoApi;
}

async function sha256Hex(value: string): Promise<string> {
  const digest = await commandCrypto().subtle.digest(
    'SHA-256',
    new TextEncoder().encode(value)
  );
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function browserStorage(): Storage | null {
  if (browserStorageUnavailable) return null;
  try {
    if (typeof globalThis.localStorage === 'undefined') {
      browserStorageUnavailable = true;
      return null;
    }
    return globalThis.localStorage;
  } catch {
    browserStorageUnavailable = true;
    return null;
  }
}

function isStoredRetryMetadata(value: unknown): value is StoredRetryMetadata {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  const exactKeys = [
    'action',
    'commandVersion',
    'commandId',
    'createdAt',
    'expectedRevision',
    'logicalKey',
    'payloadHash',
    'schemaVersion',
    'tenantId',
  ];
  if (Object.keys(candidate).sort().join('|') !== exactKeys.sort().join('|')) return false;

  return (
    candidate.schemaVersion === RETRY_SCHEMA_VERSION &&
    typeof candidate.commandVersion === 'number' &&
    Number.isSafeInteger(candidate.commandVersion) &&
    candidate.commandVersion >= 1 &&
    candidate.commandVersion <= 1_000 &&
    typeof candidate.tenantId === 'string' &&
    typeof candidate.action === 'string' &&
    typeof candidate.logicalKey === 'string' &&
    typeof candidate.commandId === 'string' &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      candidate.commandId
    ) &&
    (candidate.expectedRevision === null ||
      (typeof candidate.expectedRevision === 'number' &&
        Number.isSafeInteger(candidate.expectedRevision) &&
        candidate.expectedRevision >= 0)) &&
    typeof candidate.payloadHash === 'string' &&
    /^[0-9a-f]{64}$/u.test(candidate.payloadHash) &&
    typeof candidate.createdAt === 'number' &&
    Number.isSafeInteger(candidate.createdAt) &&
    candidate.createdAt >= 0
  );
}

function parseStoredRetryMetadata(rawValue: string | null): StoredRetryMetadata | null {
  if (!rawValue || rawValue.length > MAX_STORED_RECORD_LENGTH) return null;
  try {
    const value: unknown = JSON.parse(rawValue);
    return isStoredRetryMetadata(value) ? value : null;
  } catch {
    return null;
  }
}

function readRetryMetadata(storageKey: string): StoredRetryMetadata | null {
  const storage = browserStorage();
  if (!storage) return memoryRetryMetadata.get(storageKey) ?? null;
  try {
    return parseStoredRetryMetadata(storage.getItem(storageKey));
  } catch {
    browserStorageUnavailable = true;
    return memoryRetryMetadata.get(storageKey) ?? null;
  }
}

function writeRetryMetadata(storageKey: string, metadata: StoredRetryMetadata): void {
  const storage = browserStorage();
  if (storage) {
    try {
      storage.setItem(storageKey, JSON.stringify(metadata));
      return;
    } catch {
      browserStorageUnavailable = true;
    }
  }
  memoryRetryMetadata.set(storageKey, metadata);
}

function removeRetryMetadata(storageKey: string): void {
  memoryRetryMetadata.delete(storageKey);
  const storage = browserStorage();
  if (!storage) return;
  try {
    storage.removeItem(storageKey);
  } catch {
    browserStorageUnavailable = true;
  }
}

function isWithinRetryWindow(createdAt: number, now: number): boolean {
  return createdAt <= now && now - createdAt <= RETRY_TTL_MS;
}

async function pruneExpiredRetryMetadata(
  now: number,
  excludedStorageKey: string
): Promise<void> {
  for (const [storageKey, metadata] of memoryRetryMetadata) {
    if (storageKey !== excludedStorageKey && !isWithinRetryWindow(metadata.createdAt, now)) {
      memoryRetryMetadata.delete(storageKey);
    }
  }

  const storage = browserStorage();
  if (!storage) return;
  try {
    const keys: string[] = [];
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);
      if (key?.startsWith(RETRY_STORAGE_PREFIX)) keys.push(key);
    }
    await Promise.all(
      keys
        .filter((key) => key !== excludedStorageKey)
        .map((key) =>
          withRetryLock(key, () => {
            const metadata = readRetryMetadata(key);
            if (!metadata || !isWithinRetryWindow(metadata.createdAt, now)) {
              removeRetryMetadata(key);
            }
          })
        )
    );
  } catch {
    browserStorageUnavailable = true;
  }
}

async function withRetryLock<TResult>(
  storageKey: string,
  callback: () => TResult | Promise<TResult>
): Promise<TResult> {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(storageKey, callback);
  }
  return callback();
}

async function retryStorageKey(
  tenantId: string,
  action: string,
  commandVersion: number,
  logicalKey: string
): Promise<string> {
  const selectorHash = await sha256Hex(
    canonicalJson([tenantId, action, commandVersion, logicalKey])
  );
  return `${RETRY_STORAGE_PREFIX}${selectorHash}`;
}

/**
 * Builds a one-shot command envelope. Prefer retryableTenantCommand for user
 * initiated mutations so a lost response can be retried idempotently.
 */
export function createTenantCommandEnvelope<TPayload>(
  tenantId: string,
  commandVersion: number,
  payload: TPayload,
  expectedRevision?: number | null
): TenantCommandEnvelope<TPayload> {
  assertMetadataValue(tenantId, 'tenantId', 256);
  const normalizedCommandVersion = normalizeCommandVersion(commandVersion);
  const normalizedRevision = normalizeExpectedRevision(expectedRevision);
  return {
    envelopeVersion: COMMAND_ENVELOPE_VERSION,
    commandVersion: normalizedCommandVersion,
    tenantId,
    commandId: commandCrypto().randomUUID(),
    expectedRevision: normalizedRevision,
    payload,
  };
}

/**
 * Returns the same command ID only for the exact same tenant, action, logical
 * record, revision, and canonical payload within seven days. Persisted data is
 * metadata only: the command payload is never written to browser storage.
 */
export async function retryableTenantCommand<TPayload>(
  intent: RetryableTenantCommandIntent<TPayload>
): Promise<TenantCommandEnvelope<TPayload>> {
  assertMetadataValue(intent.tenantId, 'tenantId', 256);
  assertMetadataValue(intent.action, 'action', 128);
  const commandVersion = normalizeCommandVersion(intent.commandVersion);
  const expectedRevision = normalizeExpectedRevision(intent.expectedRevision);
  const payloadHash = await sha256Hex(canonicalJson(intent.payload));
  const logicalKey = intent.logicalKey ?? `intent:${payloadHash}`;
  assertMetadataValue(logicalKey, 'logicalKey', 512);

  const storageKey = await retryStorageKey(
    intent.tenantId,
    intent.action,
    commandVersion,
    logicalKey
  );
  await pruneExpiredRetryMetadata(Date.now(), storageKey);
  return withRetryLock(storageKey, () => {
    const now = Date.now();
    const previous = readRetryMetadata(storageKey);
    if (
      previous &&
      isWithinRetryWindow(previous.createdAt, now) &&
      previous.tenantId === intent.tenantId &&
      previous.action === intent.action &&
      previous.commandVersion === commandVersion &&
      previous.logicalKey === logicalKey &&
      previous.expectedRevision === expectedRevision &&
      previous.payloadHash === payloadHash
    ) {
      return {
        envelopeVersion: COMMAND_ENVELOPE_VERSION,
        commandVersion,
        tenantId: intent.tenantId,
        commandId: previous.commandId,
        expectedRevision,
        payload: intent.payload,
      };
    }

    const envelope = createTenantCommandEnvelope(
      intent.tenantId,
      commandVersion,
      intent.payload,
      expectedRevision
    );
    writeRetryMetadata(storageKey, {
      schemaVersion: RETRY_SCHEMA_VERSION,
      commandVersion,
      tenantId: intent.tenantId,
      action: intent.action,
      logicalKey,
      commandId: envelope.commandId,
      expectedRevision,
      payloadHash,
      createdAt: now,
    });
    return envelope;
  });
}

/**
 * Best-effort removal after success or an explicit user cancellation. The
 * tenant/action/command tuple prevents a stale component from clearing an
 * unrelated command. Failure to clear is safe: the server receipt remains the
 * source of truth and the local metadata expires after seven days.
 */
export async function clearRetryableTenantCommand(
  reference: RetryableTenantCommandReference
): Promise<void> {
  try {
    assertMetadataValue(reference.tenantId, 'tenantId', 256);
    assertMetadataValue(reference.action, 'action', 128);
    assertMetadataValue(reference.commandId, 'commandId', 64);
    const commandVersion = normalizeCommandVersion(reference.commandVersion);

    const matchingStorageKeys: string[] = [];
    for (const [storageKey, metadata] of memoryRetryMetadata) {
      if (
        metadata.tenantId === reference.tenantId &&
        metadata.action === reference.action &&
        metadata.commandVersion === commandVersion &&
        metadata.commandId === reference.commandId
      ) {
        matchingStorageKeys.push(storageKey);
      }
    }

    const storage = browserStorage();
    if (storage) {
      try {
        for (let index = 0; index < storage.length; index += 1) {
          const key = storage.key(index);
          if (!key?.startsWith(RETRY_STORAGE_PREFIX)) continue;
          const metadata = parseStoredRetryMetadata(storage.getItem(key));
          if (
            metadata?.tenantId === reference.tenantId &&
            metadata.action === reference.action &&
            metadata.commandVersion === commandVersion &&
            metadata.commandId === reference.commandId
          ) {
            matchingStorageKeys.push(key);
          }
        }
      } catch {
        browserStorageUnavailable = true;
      }
    }

    await Promise.all(
      [...new Set(matchingStorageKeys)].map((storageKey) =>
        withRetryLock(storageKey, () => {
          const current = readRetryMetadata(storageKey);
          if (
            current?.tenantId === reference.tenantId &&
            current.action === reference.action &&
            current.commandVersion === commandVersion &&
            current.commandId === reference.commandId
          ) {
            removeRetryMetadata(storageKey);
          }
        })
      )
    );
  } catch {
    // Clearing client retry metadata must never turn a successful mutation
    // into a reported failure. Server-side command receipts remain authoritative.
  }
}

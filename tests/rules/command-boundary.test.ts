import { readFileSync } from 'node:fs';
import {
  assertExpectedRevision,
  assertNoClientActorFields,
  normalizeCommandId,
  parseTenantCommandEnvelope,
  stablePayloadHash,
} from '../../functions/src/lib/command-boundary-values.js';
import {
  COMMAND_ATTEMPT_RATE_LIMIT,
  CommandAttemptRateLimitError,
  nextCommandAttemptRateLimitState,
} from '../../functions/src/lib/command-rate-limit-values.js';

function commandBoundarySource(): string {
  return readFileSync(
    new URL('../../functions/src/lib/command-boundary.ts', import.meta.url),
    'utf8'
  );
}

describe('Audited tenant command boundary', () => {
  test('canonical payload hashing is independent of object key insertion order', () => {
    const first = {
      control: { title: 'Access control', revision: 4 },
      mappings: ['iso27001:A.5.15', 'gdpr:32'],
    };
    const second = {
      mappings: ['iso27001:A.5.15', 'gdpr:32'],
      control: { revision: 4, title: 'Access control' },
    };

    expect(stablePayloadHash(first)).toMatch(/^[0-9a-f]{64}$/);
    expect(stablePayloadHash(first)).toBe(stablePayloadHash(second));
    expect(stablePayloadHash({ values: [1, 2] })).not.toBe(
      stablePayloadHash({ values: [2, 1] })
    );
  });

  test('canonical hashing rejects values that Firestore cannot safely receipt', () => {
    expect(() => stablePayloadHash({ score: Number.NaN })).toThrow('non-finite');
    expect(() => stablePayloadHash({ value: undefined })).toThrow('non-JSON');
    expect(() => stablePayloadHash(new Date())).toThrow('plain JSON objects');

    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;
    expect(() => stablePayloadHash(cyclic)).toThrow();
  });

  test('command IDs accept canonical UUID-like and ULID forms only', () => {
    expect(normalizeCommandId('550E8400-E29B-41D4-A716-446655440000')).toBe(
      '550e8400-e29b-41d4-a716-446655440000'
    );
    expect(normalizeCommandId('01ARZ3NDEKTSV4RRFFQ69G5FAV')).toBe(
      '01ARZ3NDEKTSV4RRFFQ69G5FAV'
    );
    expect(() => normalizeCommandId('command-1')).toThrow('UUID-like identifier or ULID');
    expect(() => normalizeCommandId('00000000-0000-0000-0000-000000000000')).toThrow();
    expect(() => normalizeCommandId(' 550e8400-e29b-41d4-a716-446655440000')).toThrow();
  });

  test('the envelope is exact, bounded, revision-aware, and attribution-free', () => {
    const envelope = parseTenantCommandEnvelope({
      envelopeVersion: 1,
      commandVersion: 1,
      tenantId: 'tenant_nl_01',
      commandId: '550e8400-e29b-41d4-a716-446655440000',
      expectedRevision: 7,
      payload: { title: 'Quarterly access review', ownerId: 'user_2' },
    });
    expect(envelope).toMatchObject({
      envelopeVersion: 1,
      commandVersion: 1,
      tenantId: 'tenant_nl_01',
      expectedRevision: 7,
    });

    expect(() =>
      parseTenantCommandEnvelope({
        envelopeVersion: 1,
        commandVersion: 1,
        tenantId: 'tenant_nl_01',
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        payload: {},
        actorRole: 'tenant_admin',
      })
    ).toThrow('unsupported field');
    expect(() =>
      parseTenantCommandEnvelope({
        envelopeVersion: 1,
        commandVersion: 1,
        tenantId: 'tenant_nl_01',
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        expectedRevision: -1,
        payload: {},
      })
    ).toThrow('non-negative safe integer');
    expect(() =>
      parseTenantCommandEnvelope({
        envelopeVersion: 1,
        commandVersion: 1,
        tenantId: 'tenant_nl_01',
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        payload: { changes: { approved_by: 'attacker' } },
      })
    ).toThrow('server-derived');

    expect(() =>
      parseTenantCommandEnvelope({
        envelopeVersion: 2,
        commandVersion: 1,
        tenantId: 'tenant_nl_01',
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        payload: {},
      })
    ).toThrow('envelopeVersion must be 1');
    expect(() =>
      parseTenantCommandEnvelope({
        envelopeVersion: 1,
        commandVersion: 0,
        tenantId: 'tenant_nl_01',
        commandId: '550e8400-e29b-41d4-a716-446655440000',
        payload: {},
      })
    ).toThrow('commandVersion must be an integer');
  });

  test('nested client actor attribution is rejected but domain ownership remains valid', () => {
    expect(() => assertNoClientActorFields({ actorId: 'attacker' })).toThrow(
      'server-derived'
    );
    expect(() =>
      assertNoClientActorFields({ rows: [{ audit_source: 'client' }] })
    ).toThrow('server-derived');
    expect(() =>
      assertNoClientActorFields({ ownerId: 'owner_1', assigneeId: 'user_2' })
    ).not.toThrow();
  });

  test('optimistic concurrency supports existing and create-if-absent records', () => {
    expect(() => assertExpectedRevision(4, 4)).not.toThrow();
    expect(() => assertExpectedRevision(null, null)).not.toThrow();
    expect(() => assertExpectedRevision(4, 5)).toThrow('Refresh and retry');
    expect(() => assertExpectedRevision(null, 0)).toThrow('Refresh and retry');
  });

  test('authenticated command attempt budgets are deterministic, per-action, and windowed', () => {
    const actorHash = 'a'.repeat(64);
    let state = nextCommandAttemptRateLimitState(null, {
      actorHash,
      commandName: 'certification.update',
      nowMillis: 1_000,
      updatedAt: '1970-01-01T00:00:01.000Z',
    });
    expect(state.totalAttempts).toBe(1);
    expect(state.actionAttempts['certification.update']).toBe(1);

    for (
      let attempt = 1;
      attempt < COMMAND_ATTEMPT_RATE_LIMIT.maximumAttemptsPerAction;
      attempt += 1
    ) {
      state = nextCommandAttemptRateLimitState(state, {
        actorHash,
        commandName: 'certification.update',
        nowMillis: 1_000 + attempt,
        updatedAt: '1970-01-01T00:00:01.000Z',
      });
    }
    expect(() =>
      nextCommandAttemptRateLimitState(state, {
        actorHash,
        commandName: 'certification.update',
        nowMillis: 2_000,
        updatedAt: '1970-01-01T00:00:02.000Z',
      })
    ).toThrow(CommandAttemptRateLimitError);

    const reset = nextCommandAttemptRateLimitState(state, {
      actorHash,
      commandName: 'certification.update',
      nowMillis: 1_000 + COMMAND_ATTEMPT_RATE_LIMIT.windowMilliseconds,
      updatedAt: '1970-01-01T00:01:01.000Z',
    });
    expect(reset.totalAttempts).toBe(1);
    expect(reset.windowStartedAtMillis).toBe(
      1_000 + COMMAND_ATTEMPT_RATE_LIMIT.windowMilliseconds
    );
  });

  test('source contract keeps authorization, mutation, audit, and receipt in one transaction', () => {
    const source = commandBoundarySource();
    const authentication = source.indexOf('const auth = requireAuth(request)');
    const appCheck = source.indexOf('if (!request.app)', authentication);
    const rateLimit = source.indexOf('await consumeCommandAttemptBudget(', appCheck);
    const envelopeParsing = source.indexOf(
      'const envelope = parseTenantCommandEnvelope(request.data)',
      rateLimit
    );
    const transactionStart = source.indexOf('return db.runTransaction');
    const membershipVerification = source.indexOf(
      'verifyActiveTenantMembership(',
      transactionStart
    );
    const mutation = source.indexOf('definition.mutateInTransaction(context)', transactionStart);
    const audit = source.indexOf('appendAuditLogInTransaction(transaction', transactionStart);
    const receipt = source.indexOf('transaction.create(receiptRef, receipt)', transactionStart);
    const replayBranch = source.indexOf('if (receiptSnapshot.exists)', transactionStart);
    const domainValidation = source.indexOf(
      'definition.validatePayload(envelope.payload)',
      transactionStart
    );
    const revisionRequirement = source.indexOf(
      'definition.requireExpectedRevision && !expectedRevisionWasProvided',
      transactionStart
    );
    const commandVersionRequirement = source.indexOf(
      'envelope.commandVersion !== definition.commandVersion',
      transactionStart
    );

    expect(source).toContain('export const AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(source).toContain('enforceAppCheck: true');
    expect(authentication).toBeGreaterThan(0);
    expect(appCheck).toBeGreaterThan(authentication);
    expect(rateLimit).toBeGreaterThan(appCheck);
    expect(envelopeParsing).toBeGreaterThan(rateLimit);
    expect(transactionStart).toBeGreaterThan(0);
    expect(source).toContain('await transaction.getAll(tenantRef, membershipRef, receiptRef)');
    expect(membershipVerification).toBeGreaterThan(transactionStart);
    expect(mutation).toBeGreaterThan(membershipVerification);
    expect(audit).toBeGreaterThan(mutation);
    expect(receipt).toBeGreaterThan(audit);
    expect(replayBranch).toBeGreaterThan(membershipVerification);
    expect(domainValidation).toBeGreaterThan(replayBranch);
    expect(revisionRequirement).toBeGreaterThan(replayBranch);
    expect(commandVersionRequirement).toBeGreaterThan(replayBranch);
    expect(domainValidation).toBeGreaterThan(commandVersionRequirement);
    expect(source).toContain("tenantRef.collection('command_receipts').doc(envelope.commandId)");
    expect(source).toContain('assertAuditAnchor(auditSnapshot, receipt)');
    expect(source).toContain('receipt.commandVersion !== envelope.commandVersion');
    expect(source).toContain('command:ev${envelopeVersion}:${commandName}:cv${commandVersion}');
    expect(source).toContain('consumeCommandAttemptBudget(');
    expect(source).toContain("source: 'cloud_function'");
    expect(source).not.toContain('request.data.actor');
  });
});

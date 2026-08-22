import { readFileSync } from 'node:fs';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function between(contents: string, startMarker: string, endMarker?: string): string {
  const start = contents.indexOf(startMarker);
  expect(start).toBeGreaterThanOrEqual(0);
  const end = endMarker ? contents.indexOf(endMarker, start + startMarker.length) : contents.length;
  expect(end).toBeGreaterThan(start);
  return contents.slice(start, end);
}

describe('Functions trust boundary', () => {
  const authHelpers = source('../../functions/src/lib/auth-helpers.ts');
  const auditLibrary = source('../../functions/src/lib/audit.ts');

  test('tenant identifiers fail closed before Firestore path interpolation', () => {
    const guard = between(
      authHelpers,
      'export function requireValidTenantId',
      'export function verifyActiveTenantMembership'
    );

    expect(guard).toContain("typeof tenantId !== 'string'");
    expect(guard).toContain('tenantId !== tenantId.trim()');
    expect(guard).toContain('!TENANT_ID_PATTERN.test(tenantId)');
    expect(guard).toContain("'invalid-argument'");
  });

  test('authentication identity comes only from the verified callable context', () => {
    const guard = between(
      authHelpers,
      'export function requireAuth',
      'export async function requireTenantMember'
    );

    expect(guard).toContain('if (!request.auth || !request.auth.uid)');
    expect(guard).toContain('userId: request.auth.uid');
    expect(guard).toContain('request.auth.token.email');
    expect(guard).toContain('request.auth.token.email_verified === true');
    expect(guard).toContain('request.auth.token.platform_admin === true');
    expect(guard).not.toContain('request.data');
  });

  test('tenant authorization verifies active, identity-consistent records and roles', () => {
    const guard = between(
      authHelpers,
      'export function verifyActiveTenantMembership',
      'export function requireAuth'
    );

    expect(guard).toContain('tenant.id !== tenantId');
    expect(guard).toContain("tenant.status !== 'active'");
    expect(guard).toContain('membership.userId !== userId');
    expect(guard).toContain('membership.tenantId !== tenantId');
    expect(guard).toContain("membership.status !== 'active'");
    expect(guard).toContain("membership.role === 'platform_admin'");
    expect(guard).toContain('!allowedRoles.includes(membership.role)');
  });

  test('tenant membership lookup uses the authenticated uid and the verified guard', () => {
    const guard = between(authHelpers, 'export async function requireTenantMember');

    expect(guard).toContain('requireValidTenantId(tenantId)');
    expect(guard).toContain("db.collection('tenants').doc(tenantId)");
    expect(guard).toContain("tenantRef.collection('memberships').doc(authContext.userId)");
    expect(guard).toContain('verifyActiveTenantMembership(');
    expect(guard).toContain('role: verifiedMembership.role');
  });

  test('audit attribution preserves the verified role and rejects client sources', () => {
    const actorGuard = between(
      auditLibrary,
      'export function auditActorFromVerifiedContext',
      'function assertTrustedAuditParameters'
    );
    const trustedSourceGuard = between(
      auditLibrary,
      'function assertTrustedAuditParameters',
      'function sanitizeSummaryPayload'
    );

    expect(actorGuard).toContain('actorId: actor.userId');
    expect(actorGuard).toContain('actorRole: actor.role');
    expect(trustedSourceGuard).toContain("params.source !== 'cloud_function'");
    expect(trustedSourceGuard).toContain("params.source !== 'scheduled_job'");
    expect(trustedSourceGuard).toContain('trusted server source');
  });

  test('generic caller-defined audit events are a deployed fail-closed tombstone', () => {
    const auditHandler = source('../../functions/src/handlers/audit.ts');
    const functionsEntryPoint = source('../../functions/src/index.ts');

    expect(auditHandler).toMatch(
      /export function rejectClientDefinedAuditEvent\(\): never \{[\s\S]*?throw new HttpsError\([\s\S]*?'failed-precondition'/
    );
    expect(auditHandler).toContain(
      'export const createAuditLogEvent = onCall(async () => rejectClientDefinedAuditEvent());'
    );
    // Keep the export for one release so deployment overwrites any previously
    // permissive callable rather than relying on an optional function deletion.
    expect(functionsEntryPoint).toContain("export { createAuditLogEvent } from './handlers/audit.js';");
  });

  test('tenant provisioning is entitled, quota-bound, server-configured, and atomically audited', () => {
    const tenantHandler = source('../../functions/src/handlers/tenants.ts');
    const createHandler = between(
      tenantHandler,
      'export const createTenant',
      'export const inviteUserToTenant'
    );

    expect(createHandler).toContain('authContext.emailVerified');
    expect(createHandler).toContain('request.auth?.token.tenant_creator === true');
    expect(createHandler).toContain("request.auth?.token.tenant_creation_limit");
    expect(createHandler).toContain("db.collection('tenant_creation_quotas')");
    expect(createHandler).toContain('await db.runTransaction');
    expect(createHandler).toContain('transaction.create(tenantRef, tenantDoc)');
    expect(createHandler).toContain('appendAuditLogInTransaction(transaction');
    expect(createHandler).toContain("const tier = 'starter' as const");
    expect(createHandler).toContain("const dataRegion = 'europe-west3' as const");
    expect(createHandler).toContain('const enabledFrameworks: string[] = []');
    expect(createHandler).toContain('Unexpected fields');
  });

  test('legacy processor-assessment bearer-token workflows remain fail closed', () => {
    const processorHandler = source('../../functions/src/handlers/processor-assessments.ts');

    expect(processorHandler).toContain('function rejectLegacyProcessorExternalWorkflow(): void');
    expect(processorHandler).toMatch(
      /export const getPublicProcessorAssessment[\s\S]*?=> \{\n  rejectLegacyProcessorExternalWorkflow\(\);\n  const \{ tenantId/
    );
    expect(processorHandler).toMatch(
      /export const savePublicProcessorAssessmentDraft[\s\S]*?=> \{\n  rejectLegacyProcessorExternalWorkflow\(\);\n  const \{ tenantId/
    );
    expect(processorHandler).toMatch(
      /export const submitPublicProcessorAssessment[\s\S]*?=> \{\n  rejectLegacyProcessorExternalWorkflow\(\);\n  const \{/
    );
    expect(processorHandler).toMatch(
      /export const sendProcessorAssessment[\s\S]*?requireTenantMember[\s\S]*?rejectLegacyProcessorExternalWorkflow\(\);[\s\S]*?const docRef/
    );
    expect(processorHandler).toMatch(
      /export const renewRecurringProcessorAssessment[\s\S]*?requireTenantMember[\s\S]*?rejectLegacyProcessorExternalWorkflow\(\);[\s\S]*?const prevRef/
    );
    expect(processorHandler).toContain('if (autoSend) {');
    expect(processorHandler).toContain("status: 'draft'");
    const createHandler = between(
      processorHandler,
      'export const createProcessorAssessment',
      'export interface SendProcessorAssessmentInput'
    );
    expect(createHandler).not.toContain('accessToken');
  });

  test('public assessment submissions cannot be cross-bound to another request', () => {
    const portalHandler = source('../../functions/src/handlers/assessment-access-tokens.ts');
    const bindingGuard = between(
      portalHandler,
      'export function assertSubmissionRequestBinding',
      'async function settlePostCommitOperations'
    );

    expect(bindingGuard).toContain('submission.id !== submissionId');
    expect(bindingGuard).toContain('submission.tenantId !== tenantId');
    expect(bindingGuard).toContain('submission.requestId !== requestId');
    expect(bindingGuard).toContain('submission.templateId !== templateId');
    expect(bindingGuard).toContain("'failed-precondition'");

    const guardedCommands = [
      between(
        portalHandler,
        'export const validateAssessmentAccessToken',
        'export const revokeAssessmentAccessToken'
      ),
      between(
        portalHandler,
        'export const savePublicAssessmentDraft',
        'export const submitPublicAssessment'
      ),
      between(portalHandler, 'export const submitPublicAssessment'),
    ];
    for (const command of guardedCommands) {
      expect(command).toContain('assertSubmissionRequestBinding(');
    }
  });

  test('audit validation executes before the append-only database create', () => {
    const writer = between(
      auditLibrary,
      'function createAuditLogWrite',
      'export function appendAuditLogInTransaction'
    );

    expect(writer.indexOf('assertTrustedAuditParameters(params)')).toBeGreaterThanOrEqual(0);
    expect(writer.indexOf("db.collection('tenants')")).toBeGreaterThan(
      writer.indexOf('assertTrustedAuditParameters(params)')
    );
    expect(auditLibrary).toContain('await docRef.create(auditEvent)');
  });
});

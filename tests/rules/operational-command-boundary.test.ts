import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { rolesForTenantAction } from '../../functions/src/lib/action-permissions.js';

jest.unstable_mockModule('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
}));

const {
  ISSUE_LEGAL_TRANSITIONS,
  RISK_LEGAL_TRANSITIONS,
  TASK_LEGAL_TRANSITIONS,
  assertOperationalDueDateIsReasonable,
  assertOperationalTransition,
  normalizeCreateIssuePayload,
  normalizeCreateRiskPayload,
  normalizeCreateTaskPayload,
  normalizeLinkRiskPayload,
  normalizeRetireOperationalPayload,
  normalizeUpdateIssuePayload,
  normalizeUpdateRiskPayload,
  normalizeUpdateTaskPayload,
} = await import('../../functions/src/lib/operational-validation.js');

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const createRisk = {
  code: ' rsk-sec-01 ',
  title: ' Customer data exposure ',
  description: 'Unauthorized public access to restricted customer records.',
  category: 'security',
  inherentLikelihood: 4,
  inherentImpact: 5,
  residualLikelihood: 2,
  residualImpact: 4,
  treatmentStrategy: 'mitigate',
  treatmentPlan: 'Restrict access and continuously validate the storage boundary.',
  mitigatingControlIds: [],
  affectedAssetIds: [],
  processorProfileIds: [],
  transferArrangementIds: [],
  vendorIds: [],
};

describe('Operational register authoritative command contract', () => {
  test('risk payloads are exact, canonical, bounded, and cannot self-declare provenance', () => {
    const normalized = normalizeCreateRiskPayload(createRisk);
    expect(normalized.code).toBe('RSK-SEC-01');
    expect(normalized.inherentLikelihood).toBe(4);
    expect(normalized.residualImpact).toBe(4);

    for (const injected of [
      ['status', 'closed'],
      ['revision', 99],
      ['createdBy', 'attacker'],
      ['tenantId', 'other_tenant'],
      ['derivedRuleCode', 'FABRICATED'],
      ['workflowSchemaVersion', 1],
      ['retiredBy', 'attacker'],
    ] as const) {
      expect(() =>
        normalizeCreateRiskPayload({ ...createRisk, [injected[0]]: injected[1] })
      ).toThrow('unsupported field');
    }
    expect(() =>
      normalizeCreateRiskPayload({ ...createRisk, inherentLikelihood: 6 })
    ).toThrow('whole number from 1 to 5');
    expect(() =>
      normalizeCreateRiskPayload({
        ...createRisk,
        mitigatingControlIds: ['control_1', 'control_1'],
      })
    ).toThrow('duplicate');
    expect(() =>
      normalizeCreateRiskPayload({
        ...createRisk,
        title: 'Risk\u202eadmin',
      })
    ).toThrow('directional formatting');
  });

  test('updates, links, and retirement accept only explicit domain fields', () => {
    expect(
      normalizeUpdateRiskPayload({
        riskId: 'risk_01',
        residualLikelihood: 2,
        residualImpact: 3,
        status: 'mitigating',
      })
    ).toMatchObject({ riskId: 'risk_01', residualLikelihood: 2, status: 'mitigating' });
    expect(() => normalizeUpdateRiskPayload({ riskId: 'risk_01' })).toThrow(
      'contains no changes'
    );
    expect(() =>
      normalizeUpdateRiskPayload({ riskId: 'risk_01', updatedBy: 'attacker' })
    ).toThrow('unsupported field');
    expect(() =>
      normalizeLinkRiskPayload({ riskId: 'risk_01' })
    ).toThrow('At least one relationship ID');
    expect(
      normalizeLinkRiskPayload({ riskId: 'risk_01', processorProfileId: 'profile_01' })
    ).toEqual({
      riskId: 'risk_01',
      processorProfileId: 'profile_01',
      transferArrangementId: null,
      vendorId: null,
    });
    expect(() =>
      normalizeRetireOperationalPayload({ entityId: 'risk_01', retirementReason: 'short' })
    ).toThrow('10-2000');
  });

  test('issue and task inputs reject browser-supplied approval and lifecycle fields', () => {
    const issue = {
      code: 'ISS-01',
      title: 'Unencrypted backup',
      description: 'A production backup is not encrypted with a managed key.',
      severity: 'high',
      source: 'manual_flag',
      sourceEntityId: null,
      sourceEntityType: null,
      dueDate: '2026-09-30',
      resolutionPlan: '',
    };
    expect(normalizeCreateIssuePayload(issue).dueDate).toBe(
      '2026-09-30T00:00:00.000Z'
    );
    expect(() =>
      normalizeCreateIssuePayload({ ...issue, verifiedBy: 'attacker' })
    ).toThrow('unsupported field');
    expect(() =>
      normalizeUpdateIssuePayload({
        issueId: 'issue_01',
        status: 'resolved',
        verifiedAt: '2026-09-01T00:00:00.000Z',
      })
    ).toThrow('unsupported field');

    const task = {
      title: 'Encrypt production backup',
      description: 'Enable managed-key encryption and verify restoration.',
      parentEntityType: 'issue',
      parentEntityId: 'issue_01',
      dueDate: '2026-09-30',
    };
    expect(normalizeCreateTaskPayload(task)).not.toHaveProperty('status');
    expect(() => normalizeCreateTaskPayload({ ...task, status: 'completed' })).toThrow(
      'unsupported field'
    );
    expect(() =>
      normalizeUpdateTaskPayload({ taskId: 'task_01', completedAt: 'forged' })
    ).toThrow('unsupported field');
  });

  test('legal transitions prohibit skips, reversals, and post-terminal mutation', () => {
    expect(() =>
      assertOperationalTransition('identified', 'assessed', RISK_LEGAL_TRANSITIONS, 'risk status')
    ).not.toThrow();
    expect(() =>
      assertOperationalTransition('identified', 'closed', RISK_LEGAL_TRANSITIONS, 'risk status')
    ).toThrow('Illegal');
    expect(() =>
      assertOperationalTransition('open', 'resolved', ISSUE_LEGAL_TRANSITIONS, 'issue status')
    ).toThrow('Illegal');
    expect(() =>
      assertOperationalTransition('under_review', 'resolved', ISSUE_LEGAL_TRANSITIONS, 'issue status')
    ).not.toThrow();
    expect(() =>
      assertOperationalTransition('todo', 'completed', TASK_LEGAL_TRANSITIONS, 'task status')
    ).toThrow('Illegal');
    expect(() =>
      assertOperationalTransition('completed', 'in_progress', TASK_LEGAL_TRANSITIONS, 'task status')
    ).toThrow('Illegal');
  });

  test('operational due dates use bounded canonical UTC semantics', () => {
    expect(() =>
      assertOperationalDueDateIsReasonable(
        '2026-09-30T00:00:00.000Z',
        '2026-08-28T12:00:00.000Z'
      )
    ).not.toThrow();
    expect(() =>
      assertOperationalDueDateIsReasonable(
        '2040-01-01T00:00:00.000Z',
        '2026-08-28T12:00:00.000Z'
      )
    ).toThrow('ten years');
  });

  test('permission matrix separates operational work from read-only and retirement authority', () => {
    expect(rolesForTenantAction('risk.create')).toContain('security_manager');
    expect(rolesForTenantAction('risk.create')).not.toContain('contributor');
    expect(rolesForTenantAction('risk.update')).not.toContain('auditor');
    expect(rolesForTenantAction('issue.update')).toContain('contributor');
    expect(rolesForTenantAction('task.update')).toContain('contributor');
    expect(rolesForTenantAction('risk.retire')).toEqual([
      'tenant_admin',
      'compliance_manager',
    ]);
    expect(rolesForTenantAction('issue.retire')).not.toContain('contributor');
  });

  test('handlers use atomic commands, immutable versions, independent verification, and soft retirement', () => {
    const handler = source('functions/src/handlers/risks.ts');
    const page = source('apps/web/src/app/page.tsx');
    const rules = source('firestore.rules');

    for (const commandName of [
      'risk.create',
      'risk.update',
      'risk.link',
      'risk.sync_derived',
      'risk.retire',
      'issue.create',
      'issue.update',
      'issue.retire',
      'task.create',
      'task.update',
      'task.retire',
    ]) {
      expect(handler).toContain(`commandName: '${commandName}'`);
    }
    expect(handler).toContain('requireExpectedRevision: true');
    expect(handler).toContain('legacy_baseline_captured_on_first_command');
    expect(handler).toContain('state diverges from its immutable history');
    expect(handler).toContain('Issue resolution requires an independent manager');
    expect(handler).toContain('Residual-risk acceptance requires an independent manager');
    expect(handler).toContain('Derived processor risks are reconciled only by the verified risk engine');
    expect(handler).toContain('Completed and canceled tasks are immutable');
    expect(handler).toContain('An issue under review');
    expect(handler).toContain("verification.verifier === 'storage_finalize_function'");
    expect(handler).toContain('Duplicate derived risks exist');
    expect(handler).toContain('transaction.getAll(...anchorReferences)');
    expect(handler).not.toContain('recordAuditLog');
    expect(handler).not.toContain('createNotification');
    expect(handler).not.toMatch(/\.delete\(\)/);
    for (const projectionName of [
      'listTenantRisks',
      'listTenantIssues',
      'listTenantTasks',
      'listTenantOperationalAssignees',
      'getProcessorRiskSummary',
    ]) {
      expect(handler).toContain(
        `export const ${projectionName} = onCall(AUTHORITATIVE_CALLABLE_OPTIONS`
      );
    }

    expect(page).toContain("'listTenantRisks' | 'listTenantTasks' | 'listTenantIssues'");
    expect(page).toContain('>(functions, callableName)');
    expect(page).not.toContain("collection(db, 'tenants', tenantId, 'risks')");
    expect(page).not.toContain("collection(db, 'tenants', tenantId, 'issues')");
    expect(page).not.toContain("collection(db, 'tenants', tenantId, 'tasks')");

    expect(rules).toMatch(
      /match \/risks\/\{riskId\}[\s\S]*?allow read, create, update, delete: if false;/
    );
    expect(rules).toMatch(
      /match \/issues\/\{issueId\}[\s\S]*?allow read, create, update, delete: if false;/
    );
    expect(rules).toMatch(
      /match \/tasks\/\{taskId\}[\s\S]*?allow read, create, update, delete: if false;/
    );
  });
});

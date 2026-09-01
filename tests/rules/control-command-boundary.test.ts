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
  normalizeControlReviewDecisionPayload,
  normalizeControlReviewPayload,
  normalizeCreateControlPayload,
  normalizeRetireControlPayload,
  normalizeUpdateControlPayload,
} = await import('../../functions/src/lib/control-validation.js');

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const validCreatePayload = {
  code: ' ctl-int-01 ',
  title: 'Privileged access review',
  description:
    'Privileged access is approved, time-bound, logged, and reviewed every quarter.',
  domain: 'security',
  frameworkIds: ['iso27001'],
  requirementIds: ['a.5.18'],
  enforcementMechanism: 'hybrid',
  reviewFrequencyDays: 90,
  ownerId: 'control_owner_01',
  implementationNotes: 'Implementation is tracked through the privileged-access workflow.',
};

const validReviewPayload = {
  controlId: 'control_01',
  effectiveness: 'effective',
  notes:
    'A sample of privileged access grants was traced from approval through expiry and revocation.',
  evidenceIds: ['evidence_01'],
  reviewAssigneeId: 'independent_reviewer_01',
  testMethod:
    'Selected a random sample and reconciled approvals, access logs, and revocation timestamps.',
  testPeriodStart: '2026-04-01T00:00:00.000Z',
  testPeriodEnd: '2026-06-30T00:00:00.000Z',
  sampleSize: 25,
  exceptions: '',
} as const;

describe('Control authoritative command contract', () => {
  test('create is exact, canonical, bounded, and cannot self-declare assurance', () => {
    expect(normalizeCreateControlPayload(validCreatePayload)).toMatchObject({
      code: 'CTL-INT-01',
      title: 'Privileged access review',
      frameworkIds: ['iso27001'],
      reviewFrequencyDays: 90,
    });

    for (const [field, value] of [
      ['status', 'implemented'],
      ['healthScore', 100],
      ['lastReviewDate', '2026-01-01T00:00:00.000Z'],
      ['nextReviewDate', '2027-01-01T00:00:00.000Z'],
      ['createdBy', 'attacker'],
      ['updatedBy', 'attacker'],
      ['revision', 99],
      ['workflowTrust', 'authoritative'],
      ['pendingReviewId', 'forged_review'],
      ['implementationContributorIds', ['attacker']],
    ] as const) {
      expect(() =>
        normalizeCreateControlPayload({
          ...validCreatePayload,
          [field]: value,
        })
      ).toThrow('unsupported field');
    }

    expect(() =>
      normalizeCreateControlPayload({
        ...validCreatePayload,
        frameworkIds: Array.from({ length: 11 }, (_, index) => `framework_${index}`),
      })
    ).toThrow('at most 10');
    expect(() =>
      normalizeCreateControlPayload({
        ...validCreatePayload,
        requirementIds: Array.from({ length: 21 }, (_, index) => `requirement_${index}`),
      })
    ).toThrow('at most 20');
    expect(() =>
      normalizeCreateControlPayload({
        ...validCreatePayload,
        description: 'too short',
      })
    ).toThrow('20-10000');
  });

  test('updates expose implementation work but not review-derived assurance', () => {
    expect(
      normalizeUpdateControlPayload({
        controlId: 'control_01',
        status: 'in_progress',
        implementationNotes: 'Privileged-access automation is being rolled out.',
      })
    ).toEqual({
      controlId: 'control_01',
      status: 'in_progress',
      implementationNotes: 'Privileged-access automation is being rolled out.',
    });
    expect(
      normalizeUpdateControlPayload({
        controlId: 'control_01',
        ownerId: null,
      })
    ).toEqual({ controlId: 'control_01', ownerId: null });

    for (const [field, value] of [
      ['status', 'implemented'],
      ['status', 'partially_implemented'],
      ['healthScore', 100],
      ['reviewerId', 'attacker'],
      ['reviewedAt', '2026-01-01T00:00:00.000Z'],
      ['assuranceInvalidatedBy', 'attacker'],
      ['revision', 99],
      ['updatedBy', 'attacker'],
    ] as const) {
      expect(() =>
        normalizeUpdateControlPayload({
          controlId: 'control_01',
          [field]: value,
        })
      ).toThrow();
    }

    expect(() =>
      normalizeUpdateControlPayload({
        controlId: 'control_01',
        status: 'not_applicable',
      })
    ).toThrow('statusRationale is required');
    expect(() =>
      normalizeUpdateControlPayload({
        controlId: 'control_01',
        status: 'in_progress',
        statusRationale: 'The rationale may not be attached to this state.',
      })
    ).toThrow('only accepted');
    expect(() => normalizeUpdateControlPayload({ controlId: 'control_01' })).toThrow(
      'contains no changes'
    );
  });

  test('review submission requires evidence, independent assignment, and bounded test detail', () => {
    expect(normalizeControlReviewPayload(validReviewPayload)).toEqual(validReviewPayload);

    for (const [field, value] of [
      ['nextReviewDate', '2030-01-01T00:00:00.000Z'],
      ['reviewerId', 'attacker'],
      ['reviewedAt', '2026-01-01T00:00:00.000Z'],
      ['status', 'approved'],
      ['healthScore', 100],
      ['submittedBy', 'attacker'],
      ['commandId', 'forged'],
    ] as const) {
      expect(() =>
        normalizeControlReviewPayload({ ...validReviewPayload, [field]: value })
      ).toThrow('unsupported field');
    }

    expect(() =>
      normalizeControlReviewPayload({ ...validReviewPayload, evidenceIds: [] })
    ).toThrow('at least one');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        evidenceIds: Array.from({ length: 11 }, (_, index) => `evidence_${index}`),
      })
    ).toThrow('at most 10');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        evidenceIds: ['evidence_01', 'evidence_01'],
      })
    ).toThrow('duplicate');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        reviewAssigneeId: undefined,
      })
    ).toThrow('string');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        testMethod: 'too short',
      })
    ).toThrow('10-2000');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        testPeriodEnd: null,
      })
    ).toThrow('both be supplied');
    expect(() =>
      normalizeControlReviewPayload({
        ...validReviewPayload,
        testPeriodStart: '2026-07-01T00:00:00.000Z',
      })
    ).toThrow('must not be later');
    expect(() =>
      normalizeControlReviewPayload({ ...validReviewPayload, sampleSize: 1_000_001 })
    ).toThrow('whole number');
  });

  test('review decision and retirement are exact reasoned commands', () => {
    expect(
      normalizeControlReviewDecisionPayload({
        controlId: 'control_01',
        reviewId: 'review_01',
        decision: 'approved',
        decisionNotes:
          'Approved after independently tracing the sample to immutable evidence objects.',
      })
    ).toMatchObject({ decision: 'approved' });
    expect(() =>
      normalizeControlReviewDecisionPayload({
        controlId: 'control_01',
        reviewId: 'review_01',
        decision: 'approved',
        decisionNotes:
          'Approved after independently tracing the sample to immutable evidence objects.',
        approvedBy: 'attacker',
      })
    ).toThrow('unsupported field');
    expect(() =>
      normalizeControlReviewDecisionPayload({
        controlId: 'control_01',
        reviewId: 'review_01',
        decision: 'fabricated',
        decisionNotes: 'This fabricated decision must never reach persistence.',
      })
    ).toThrow('approved or rejected');
    expect(() =>
      normalizeRetireControlPayload({
        controlId: 'control_01',
        retirementReason: 'Superseded by the consolidated privileged-access control.',
        deletedBy: 'attacker',
      })
    ).toThrow('unsupported field');
  });

  test('role matrix separates implementation, independent decision, and retirement', () => {
    expect(rolesForTenantAction('control.create')).not.toContain('contributor');
    expect(rolesForTenantAction('control.update')).toContain('contributor');
    expect(rolesForTenantAction('control.review_submit')).toContain('contributor');
    expect(rolesForTenantAction('control.review_decide')).toContain('approver');
    expect(rolesForTenantAction('control.review_decide')).not.toContain('contributor');
    expect(rolesForTenantAction('control.review_decide')).not.toContain('auditor');
    expect(rolesForTenantAction('control.retire')).toEqual([
      'tenant_admin',
      'compliance_manager',
    ]);
  });

  test('handler and Rules preserve the authoritative audit and projection boundary', () => {
    const handler = source('functions/src/handlers/controls.ts');
    const rules = source('firestore.rules');

    for (const commandName of [
      'control.create',
      'control.update',
      'control.review_submit',
      'control.review_decide',
      'control.retire',
    ]) {
      expect(handler).toContain(`commandName: '${commandName}'`);
    }
    expect(handler).toContain('AUTHORITATIVE_CALLABLE_OPTIONS');
    expect(handler).toContain('requireExpectedRevision: true');
    expect(handler).toContain('COMMAND_RECEIPT_SCHEMA_VERSION');
    expect(handler).toContain('legacy_baseline_captured_on_first_command');
    expect(handler).toContain('stableTrustedValueHash');
    expect(handler).toContain('versionArtifactHash');
    expect(handler).toContain('previousArtifactHash');
    expect(handler).toContain('reviewStateHash');
    expect(handler).toContain('evidenceAnchorsHash');
    expect(handler).toContain("control_code_reservations");
    expect(handler).toContain("verification.verifier !== 'storage_finalize_function'");
    expect(handler).toContain('storageGeneration');
    expect(handler).toContain('reviewAssigneeId');
    expect(handler).toContain('implementationContributorIds');
    expect(handler).toContain('pendingReviewId');
    expect(handler).toContain('control_retired_not_deleted');
    expect(handler).toContain('legacy_unverified');
    expect(handler).toContain('getTenantControlDetail');
    expect(handler).toContain('getTenantControlHistory');
    expect(handler).toContain('listTenantControlReviewers');
    expect(handler).not.toContain('recordAuditLog');
    expect(handler).not.toContain('transaction.delete(controlRef)');
    expect(handler).not.toContain('controlRef.delete()');
    expect(handler).not.toContain('...rest');

    expect(rules).toMatch(
      /match \/controls\/\{controlId\}[\s\S]*?allow read, create, update, delete: if false;/
    );
    for (const nestedPath of ['reviews', 'review_events', 'versions']) {
      expect(rules).toMatch(
        new RegExp(
          `match /${nestedPath}/\\{[^}]+\\}\\s*\\{[\\s\\S]*?allow read, create, update, delete: if false;`
        )
      );
    }
    expect(rules).toMatch(
      /match \/control_code_reservations\/\{reservationId\}[\s\S]*?allow read, create, update, delete: if false;/
    );
  });
});

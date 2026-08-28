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
  assertLegalPolicyTransition,
  assertPolicyReviewDateIsReasonable,
  normalizeCreatePolicyPayload,
  normalizePolicyTransitionPayload,
  normalizeRetirePolicyPayload,
  normalizeUpdatePolicyPayload,
} = await import('../../functions/src/lib/policy-validation.js');

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const validCreatePayload = {
  code: ' pol-sec-01 ',
  title: ' Information Security Policy ',
  version: ' 1.0 ',
  summary: 'Defines the mandatory information-security control baseline.',
  scope: 'All personnel, systems, and service providers.',
  contentMarkdown: '# Information Security\n\nMandatory requirements.',
  storagePath: null,
  linkedControlIds: ['control_access_01'],
  ownerId: 'user_security_01',
};

describe('Policy authoritative command contract', () => {
  test('create payload is exact, bounded, canonical, and cannot self-declare assurance', () => {
    const normalized = normalizeCreatePolicyPayload(validCreatePayload);
    expect(normalized.code).toBe('POL-SEC-01');
    expect(normalized.title).toBe('Information Security Policy');
    expect(normalized.version).toBe('1.0');

    for (const injectedField of [
      ['status', 'active'],
      ['approverId', 'attacker'],
      ['approvedAt', '2026-01-01T00:00:00.000Z'],
      ['createdBy', 'attacker'],
      ['revision', 99],
      ['draftContributorIds', ['attacker']],
      ['reviewSubmittedBy', 'attacker'],
      ['reviewSubmissionCommandId', 'forged-command'],
      ['reviewAssigneeId', 'attacker'],
      ['workflowTrust', 'authoritative'],
      ['workflowSchemaVersion', 1],
    ] as const) {
      expect(() =>
        normalizeCreatePolicyPayload({
          ...validCreatePayload,
          [injectedField[0]]: injectedField[1],
        })
      ).toThrow('unsupported field');
    }

    expect(() =>
      normalizeCreatePolicyPayload({
        ...validCreatePayload,
        linkedControlIds: ['control_01', 'control_01'],
      })
    ).toThrow('duplicate');
    expect(() =>
      normalizeCreatePolicyPayload({
        ...validCreatePayload,
        contentMarkdown: 'x'.repeat(50_001),
      })
    ).toThrow('1-50000');
    expect(() =>
      normalizeCreatePolicyPayload({
        ...validCreatePayload,
        ownerId: '../other-tenant',
      })
    ).toThrow('valid document identifier');
  });

  test('update is an explicit draft patch and rejects status, approval, provenance, and empty changes', () => {
    expect(
      normalizeUpdatePolicyPayload({
        policyId: 'policy_01',
        title: ' Revised Security Policy ',
        linkedControlIds: ['control_01', 'control_02'],
        nextReviewDate: '2027-08-22',
      })
    ).toEqual({
      policyId: 'policy_01',
      title: 'Revised Security Policy',
      linkedControlIds: ['control_01', 'control_02'],
      nextReviewDate: '2027-08-22T00:00:00.000Z',
    });

    for (const injectedField of [
      ['status', 'approved'],
      ['approverId', 'attacker'],
      ['approvedAt', '2026-01-01T00:00:00.000Z'],
      ['effectiveDate', '2026-01-01T00:00:00.000Z'],
      ['updatedBy', 'attacker'],
      ['retiredBy', 'attacker'],
      ['draftContributorIds', ['attacker']],
      ['reviewSubmittedBy', 'attacker'],
      ['reviewSubmissionCommandId', 'forged-command'],
      ['reviewAssigneeId', 'attacker'],
      ['workflowTrust', 'authoritative'],
    ] as const) {
      expect(() =>
        normalizeUpdatePolicyPayload({
          policyId: 'policy_01',
          title: 'Revised Security Policy',
          [injectedField[0]]: injectedField[1],
        })
      ).toThrow('unsupported field');
    }
    expect(() => normalizeUpdatePolicyPayload({ policyId: 'policy_01' })).toThrow(
      'contains no changes'
    );
    expect(() =>
      normalizeUpdatePolicyPayload({
        policyId: 'policy_01',
        nextReviewDate: '08/22/2027',
      })
    ).toThrow('canonical UTC ISO 8601');
    expect(() =>
      normalizeUpdatePolicyPayload({
        policyId: 'policy_01',
        nextReviewDate: '2027-02-30',
      })
    ).toThrow('valid ISO 8601');
    expect(() =>
      normalizeUpdatePolicyPayload({
        policyId: 'policy_01',
        title: 'Security\u202ePolicy',
      })
    ).toThrow('directional formatting');
  });

  test('lifecycle input is target-specific and never accepts injected approver identity', () => {
    expect(
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'under_review',
          decisionNotes: null,
          reviewAssigneeId: 'reviewer_01',
        },
        'under_review'
      )
    ).toEqual({
      policyId: 'policy_01',
      targetStatus: 'under_review',
      decisionNotes: null,
      reviewAssigneeId: 'reviewer_01',
    });
    expect(
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'approved',
          decisionNotes: 'Approved after independent control-owner review.',
        },
        'approved'
      )
    ).toMatchObject({ targetStatus: 'approved' });

    expect(() =>
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'under_review',
          decisionNotes: null,
        },
        'under_review'
      )
    ).toThrow('reviewAssigneeId is required');
    expect(() =>
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'approved',
          decisionNotes: 'Approved after an independent policy review.',
          reviewAssigneeId: 'attacker',
        },
        'approved'
      )
    ).toThrow('only accepted when targetStatus is under_review');

    expect(() =>
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'approved',
          decisionNotes: 'Approved after independent control-owner review.',
          approverId: 'attacker',
        },
        'approved'
      )
    ).toThrow('unsupported field');
    expect(() =>
      normalizePolicyTransitionPayload(
        {
          policyId: 'policy_01',
          targetStatus: 'active',
        },
        'approved'
      )
    ).toThrow("only accepts targetStatus 'approved'");
    expect(() =>
      normalizePolicyTransitionPayload({
        policyId: 'policy_01',
        targetStatus: 'approved',
        decisionNotes: 'too short',
      })
    ).toThrow('10-2000');
    expect(() =>
      normalizePolicyTransitionPayload({
        policyId: 'policy_01',
        targetStatus: 'retired',
        decisionNotes: 'Retire it for a documented business reason.',
      })
    ).toThrow('deleteTenantPolicy');
  });

  test('legal lifecycle supports review cycles but blocks skipped and post-retirement transitions', () => {
    expect(() => assertLegalPolicyTransition('draft', 'under_review')).not.toThrow();
    expect(() => assertLegalPolicyTransition('under_review', 'approved')).not.toThrow();
    expect(() => assertLegalPolicyTransition('approved', 'active')).not.toThrow();
    expect(() => assertLegalPolicyTransition('active', 'under_review')).not.toThrow();
    expect(() => assertLegalPolicyTransition('active', 'retired')).not.toThrow();
    expect(() => assertLegalPolicyTransition('draft', 'approved')).toThrow(
      "cannot transition from 'draft' to 'approved'"
    );
    expect(() => assertLegalPolicyTransition('under_review', 'active')).toThrow(
      "cannot transition from 'under_review' to 'active'"
    );
    expect(() => assertLegalPolicyTransition('retired', 'draft')).toThrow(
      "cannot transition from 'retired' to 'draft'"
    );
    expect(() => assertLegalPolicyTransition('fabricated', 'active')).toThrow(
      'unsupported value'
    );
  });

  test('review schedules use UTC calendar-day semantics with a three-year bound', () => {
    expect(() =>
      assertPolicyReviewDateIsReasonable(
        '2026-08-23T00:00:00.000Z',
        '2026-08-22T23:59:59.000Z'
      )
    ).not.toThrow();
    expect(() =>
      assertPolicyReviewDateIsReasonable(
        '2026-08-22T23:59:59.999Z',
        '2026-08-22T00:00:00.000Z'
      )
    ).toThrow('between one day and three years');
    expect(() =>
      assertPolicyReviewDateIsReasonable(
        '2029-08-23T00:00:00.000Z',
        '2026-08-22T12:00:00.000Z'
      )
    ).toThrow('between one day and three years');
  });

  test('retirement is a strict reasoned soft-delete command', () => {
    expect(
      normalizeRetirePolicyPayload({
        policyId: 'policy_01',
        retirementReason: 'Superseded by the consolidated security policy.',
      })
    ).toEqual({
      policyId: 'policy_01',
      retirementReason: 'Superseded by the consolidated security policy.',
    });
    expect(() =>
      normalizeRetirePolicyPayload({
        policyId: 'policy_01',
        retirementReason: 'short',
      })
    ).toThrow('10-2000');
    expect(() =>
      normalizeRetirePolicyPayload({
        policyId: 'policy_01',
        retirementReason: 'Superseded by another approved policy.',
        deletedBy: 'attacker',
      })
    ).toThrow('unsupported field');
  });

  test('permissions separate editing, approval, activation, and retirement duties', () => {
    expect(rolesForTenantAction('policy.create')).toContain('ai_governance_manager');
    expect(rolesForTenantAction('policy.update')).not.toContain('approver');
    expect(rolesForTenantAction('policy.update')).not.toContain('auditor');
    expect(rolesForTenantAction('policy.approve')).toEqual([
      'tenant_admin',
      'approver',
    ]);
    expect(rolesForTenantAction('policy.activate')).toContain('security_manager');
    expect(rolesForTenantAction('policy.retire')).toEqual([
      'tenant_admin',
      'compliance_manager',
    ]);
  });

  test('handler uses revisioned atomic commands, immutable versions, and server-derived lifecycle data', () => {
    const handler = source('functions/src/handlers/policies.ts');
    const policyTypes = source('packages/shared-types/src/grc.ts');

    for (const commandName of [
      'policy.create',
      'policy.update',
      'policy.submit_review',
      'policy.return_draft',
      'policy.approve',
      'policy.activate',
      'policy.retire',
    ]) {
      expect(handler).toContain(commandName);
    }
    expect(handler.match(/requireExpectedRevision: true/g)?.length).toBeGreaterThanOrEqual(4);
    expect(handler.match(/commandVersion: 1/g)?.length).toBeGreaterThanOrEqual(4);
    expect(handler).toContain('verifyCurrentPolicyArtifacts');
    expect(handler).toContain('currentArtifactVerified');
    expect(handler).toContain('COMMAND_RECEIPT_SCHEMA_VERSION');
    expect(handler).toContain("status: 'draft'");
    expect(handler).toContain('lifecyclePatch.approverId = context.actor.userId');
    expect(handler).toContain('lifecyclePatch.approvalCommandId = context.commandId');
    expect(handler).toContain('verifyAuthoritativePolicyArtifact');
    expect(handler).toContain('assertPolicyCoreReadyForReview(before)');
    expect(handler).toContain('policy.contentMarkdown.trim().length < 200');
    expect(handler).toContain('draftContributorIds.includes(context.actor.userId)');
    expect(handler).toContain('lifecyclePatch.reviewSubmittedBy = context.actor.userId');
    expect(handler).toContain('lifecyclePatch.reviewSubmissionCommandId = context.commandId');
    expect(handler).toContain('context.actor.userId !== before.reviewAssigneeId');
    expect(handler).toContain("commandName: 'policy.submit_review'");
    expect(handler).toContain("commandName: 'policy.approve'");
    expect(handler).toContain('afterSummary.stateHash !== priorAnchor.stateHash');
    expect(handler).toContain("policyRef.collection('versions').doc(versionId)");
    expect(handler).toContain('transaction.create(policyRef.collection');
    expect(handler).toContain('legacy_baseline_captured_on_first_command');
    expect(handler).toContain('previousVersionId:');
    expect(handler).toContain('priorAnchor.versionId');
    expect(handler).toContain('stableTrustedValueHash');
    expect(handler).toContain("policy_code_reservations");
    expect(handler).toContain('preparePriorPolicyVersion');
    expect(handler).toContain('The prior immutable policy version diverges');
    expect(handler).toContain("workflowTrust: 'governed_draft'");
    expect(handler).toContain("workflowTrust = 'authoritative'");
    expect(handler).toContain('The normalized policy patch does not change');
    expect(handler).toContain('Lists bounded, cursor-paged policy summaries');
    expect(handler).toContain('getTenantPolicyHistory');
    expect(handler).toContain("? 'legacy_unverified'");
    expect(handler).toContain('policy_retired_not_deleted');
    expect(handler).toContain('deleted: false');
    expect(handler).toContain('upload session server-verifies');
    expect(handler).not.toContain('recordAuditLog');
    expect(handler).not.toContain('await policyRef.delete()');
    expect(handler).not.toContain('...updates');
    expect(handler).not.toContain('...clientChanges');
    expect(policyTypes).toContain('revision?: number');
    expect(policyTypes).toContain('approvalCommandId?: string | null');
    expect(policyTypes).toContain('draftContributorIds?: string[]');
    expect(policyTypes).toContain('reviewSubmissionCommandId?: string | null');
    expect(policyTypes).toContain('reviewAssigneeId?: string | null');
    expect(policyTypes).toContain('workflowTrust?: PolicyWorkflowTrust');
  });
});

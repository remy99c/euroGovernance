import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  TenantApplicabilityDecision,
  validateApplicabilityOverride,
  applyApplicabilityOverride,
  revertApplicabilityOverride,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_override_alpha';
const tenantB = 'tenant_override_beta';

const userAdminA = 'usr_admin_ovr_a';
const userComplianceA = 'usr_comp_ovr_a';
const userContributorA = 'usr_contrib_ovr_a';
const userAuditorA = 'usr_auditor_ovr_a';
const userCompB = 'usr_comp_ovr_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-override-review-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Tenant A Memberships
    await db.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
      userId: userAdminA,
      tenantId: tenantA,
      role: 'tenant_admin',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
      userId: userComplianceA,
      tenantId: tenantA,
      role: 'compliance_manager',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
      userId: userContributorA,
      tenantId: tenantA,
      role: 'contributor',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
      userId: userAuditorA,
      tenantId: tenantA,
      role: 'auditor',
      status: 'active',
    });

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${userCompB}`).set({
      userId: userCompB,
      tenantId: tenantB,
      role: 'compliance_manager',
      status: 'active',
    });
  });
});

describe('Manual Applicability Override, Review & History Preservation Suite', () => {
  const now = new Date().toISOString();

  const baselineAutoDecision: TenantApplicabilityDecision = {
    id: 'dec_gdpr_art_35_auto',
    tenantId: tenantA,
    ownerId: userComplianceA,
    requirementId: 'gdpr_art_35',
    frameworkId: 'gdpr',
    sectionCode: 'Article 35',
    requirementTitle: 'Data Protection Impact Assessment (DPIA)',
    isApplicable: false,
    status: 'not_applicable',
    applicabilityType: 'statutory_mandatory',
    decisionSource: 'auto',
    isOverridden: false,
    autoResult: {
      isApplicable: false,
      status: 'not_applicable',
      matchedRuleId: 'rule_gdpr_35_auto',
      ruleEvaluationSummary: 'No high risk or special category personal data processing declared.',
      evaluatedAt: now,
    },
    matchedRuleId: 'rule_gdpr_35_auto',
    ruleEvaluationSummary: 'No high risk or special category personal data processing declared.',
    rationale: 'Derived from questionnaire scope facts.',
    overrideReason: null,
    overrideRationale: null,
    previousStatus: null,
    assessedBy: userComplianceA,
    assessedAt: now,
    reviewedBy: null,
    reviewedAt: null,
    history: [],
    createdAt: now,
    updatedAt: now,
    createdBy: userComplianceA,
    updatedBy: userComplianceA,
  };

  // 1. Mandatory Override Rationale & Attribution Requirements
  describe('Rationale & Reviewer Attribution Requirements', () => {
    test('rejects override when overrideRationale is missing or under 10 characters', () => {
      const noRationale = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: '',
        decisionSource: 'user_override',
      });
      expect(noRationale.valid).toBe(false);
      expect(noRationale.error).toContain('Mandatory override rationale');

      const shortRationale = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'test msg',
        decisionSource: 'user_override',
      });
      expect(shortRationale.valid).toBe(false);
      expect(shortRationale.error).toContain('minimum 10 characters');
    });

    test('rejects reviewer_override when reviewerId attribution is omitted', () => {
      const missingReviewer = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary adoption of DPIA governance framework.',
        decisionSource: 'reviewer_override',
        reviewerId: '',
      });
      expect(missingReviewer.valid).toBe(false);
      expect(missingReviewer.error).toContain('Reviewer attribution');
    });

    test('accepts valid override with sufficient rationale and reviewer attribution', () => {
      const validOverride = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Executive decision to perform voluntary DPIA on upcoming healthcare integration.',
        decisionSource: 'reviewer_override',
        reviewerId: userAdminA,
      });
      expect(validOverride.valid).toBe(true);
      expect(validOverride.error).toBeUndefined();
    });
  });

  // 2. History Preservation, Baseline Visibility & Reversibility
  describe('History Preservation & Baseline Retention', () => {
    test('preserves automatic baseline and appends sequential history entries across multiple overrides', () => {
      // 1. First Override: from 'not_applicable' to 'applicable' by User
      const firstOverride = applyApplicabilityOverride({
        decision: baselineAutoDecision,
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary adoption of DPIA for enterprise customer assurance.',
        actorId: userComplianceA,
        actorRole: 'compliance_manager',
        decisionSource: 'user_override',
      });

      expect(firstOverride.isOverridden).toBe(true);
      expect(firstOverride.decisionSource).toBe('user_override');
      expect(firstOverride.status).toBe('applicable');
      expect(firstOverride.isApplicable).toBe(true);
      // Automatic baseline remains visible for audit comparison
      expect(firstOverride.autoResult?.status).toBe('not_applicable');
      expect(firstOverride.autoResult?.isApplicable).toBe(false);
      expect(firstOverride.history?.length).toBe(1);
      expect(firstOverride.history![0]?.previousStatus).toBe('not_applicable');
      expect(firstOverride.history![0]?.newStatus).toBe('applicable');
      expect(firstOverride.history![0]?.actorId).toBe(userComplianceA);

      // 2. Second Override: from 'applicable' to 'review_required' by Reviewer
      const secondOverride = applyApplicabilityOverride({
        decision: firstOverride,
        newStatus: 'review_required',
        isApplicable: true,
        overrideRationale: 'Requires formal CISO and legal sign-off on processing scope.',
        actorId: userAdminA,
        actorRole: 'tenant_admin',
        decisionSource: 'reviewer_override',
        reviewerId: userAdminA,
      });

      expect(secondOverride.status).toBe('review_required');
      expect(secondOverride.decisionSource).toBe('reviewer_override');
      expect(secondOverride.reviewedBy).toBe(userAdminA);
      expect(secondOverride.autoResult?.status).toBe('not_applicable'); // Baseline still untouched
      expect(secondOverride.history?.length).toBe(2);
      expect(secondOverride.history![1]?.previousStatus).toBe('applicable');
      expect(secondOverride.history![1]?.newStatus).toBe('review_required');

      // 3. Revert Override: Restore to original automatic baseline
      const reverted = revertApplicabilityOverride({
        decision: secondOverride,
        actorId: userComplianceA,
        actorRole: 'compliance_manager',
        reason: 'Integration project cancelled; returning to automated baseline.',
      });

      expect(reverted.isOverridden).toBe(false);
      expect(reverted.decisionSource).toBe('auto');
      expect(reverted.status).toBe('not_applicable');
      expect(reverted.isApplicable).toBe(false);
      // Complete 3-step history is preserved
      expect(reverted.history?.length).toBe(3);
      expect(reverted.history![2]?.overrideRationale).toContain('Reverted to automatic baseline');
    });
  });

  // 3. Firestore Security Rules Isolation & Role Guardrails
  describe('Firestore Security Rules Role Guardrails for Overrides', () => {
    test('compliance manager in Tenant A can mutate and override applicability decisions', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      const docRef = db.doc(`tenants/${tenantA}/applicability_decisions/${baselineAutoDecision.id}`);

      // Seed decision
      await assertSucceeds(docRef.set(baselineAutoDecision));

      // Override update succeeds
      await assertSucceeds(
        docRef.update({
          status: 'applicable',
          isApplicable: true,
          isOverridden: true,
          decisionSource: 'user_override',
          overrideRationale: 'Compliance manager valid manual override rationale.',
          updatedAt: new Date().toISOString(),
          updatedBy: userComplianceA,
        })
      );
    });

    test('unauthorized contributor in Tenant A cannot update or override applicability decisions', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      await adminCtx.firestore().doc(`tenants/${tenantA}/applicability_decisions/${baselineAutoDecision.id}`).set({
        ...baselineAutoDecision,
        ownerId: userAdminA,
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      const contribCtx = testEnv.authenticatedContext(userContributorA);
      const docRef = contribCtx.firestore().doc(`tenants/${tenantA}/applicability_decisions/${baselineAutoDecision.id}`);

      // Contributor override fails
      await assertFails(
        docRef.update({
          status: 'applicable',
          isApplicable: true,
          overrideRationale: 'Unauthorized contributor attempt',
        })
      );
    });

    test('auditor in Tenant A can read decisions but cannot modify or override them', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      await adminCtx.firestore().doc(`tenants/${tenantA}/applicability_decisions/${baselineAutoDecision.id}`).set({
        ...baselineAutoDecision,
        ownerId: userAdminA,
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const docRef = auditorCtx.firestore().doc(`tenants/${tenantA}/applicability_decisions/${baselineAutoDecision.id}`);

      // Read succeeds
      await assertSucceeds(docRef.get());

      // Mutation fails
      await assertFails(
        docRef.update({
          status: 'not_applicable',
        })
      );
    });

    test('Tenant A user cannot read or mutate applicability decisions in Tenant B partition', async () => {
      const compBCtx = testEnv.authenticatedContext(userCompB);
      await compBCtx.firestore().doc(`tenants/${tenantB}/applicability_decisions/dec_tenant_b_confidential`).set({
        ...baselineAutoDecision,
        id: 'dec_tenant_b_confidential',
        tenantId: tenantB,
        ownerId: userCompB,
        createdBy: userCompB,
        updatedBy: userCompB,
      });

      const compACtx = testEnv.authenticatedContext(userComplianceA);
      const crossTenantRef = compACtx
        .firestore()
        .doc(`tenants/${tenantB}/applicability_decisions/dec_tenant_b_confidential`);

      // Read is blocked
      await assertFails(crossTenantRef.get());

      // Mutation is blocked
      await assertFails(
        crossTenantRef.update({
          status: 'applicable',
        })
      );
    });
  });
});

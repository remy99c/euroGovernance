import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  ApplicabilityRule,
  TenantApplicabilityDecision,
  evaluateConditionClause,
  evaluateConditionGroup,
  evaluateApplicabilityRule,
  validateApplicabilityRule,
  CANONICAL_APPLICABILITY_RULES,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-applicability-engine-test';

beforeAll(async () => {
  const rules = getFirestoreRules();
  testEnv = await initializeTestEnvironment({
    projectId,
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
});

describe('Applicability Rules Engine & Condition Evaluator', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

      // Seed global applicability rules
      for (const rule of CANONICAL_APPLICABILITY_RULES) {
        await db.doc(`applicability_rules/${rule.id}`).set(rule);
      }

      // Seed Tenant A Memberships
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
      await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
    });
  });

  // 1. Condition Operator Parsing & Evaluation Tests
  describe('Condition Operators & Group Logic', () => {
    const facts: Record<string, unknown> = {
      processes_personal_data: true,
      data_subject_count: 50000,
      cloud_providers: ['AWS', 'GCP'],
      primary_jurisdiction: 'Germany',
      special_category_data: false,
      incident_sla_hours: 72,
      empty_vendor_list: [],
      null_fact: null,
    };

    test('evaluates comparison operators (equals, not_equals, in, not_in, contains, contains_any, contains_all)', () => {
      expect(evaluateConditionClause({ factKey: 'primary_jurisdiction', operator: 'equals', expectedValue: 'germany' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'primary_jurisdiction', operator: 'not_equals', expectedValue: 'France' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'primary_jurisdiction', operator: 'in', expectedValue: ['Germany', 'Austria', 'Switzerland'] }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'primary_jurisdiction', operator: 'not_in', expectedValue: ['USA', 'China'] }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'cloud_providers', operator: 'contains', expectedValue: 'AWS' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'cloud_providers', operator: 'contains_any', expectedValue: ['Azure', 'GCP'] }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'cloud_providers', operator: 'contains_all', expectedValue: ['AWS', 'GCP'] }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'cloud_providers', operator: 'contains_all', expectedValue: ['AWS', 'Azure'] }, facts).passed).toBe(false);
    });

    test('evaluates numeric operators (greater_than, less_than, greater_than_or_equal, less_than_or_equal)', () => {
      expect(evaluateConditionClause({ factKey: 'data_subject_count', operator: 'greater_than', expectedValue: 10000 }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'data_subject_count', operator: 'less_than', expectedValue: 100000 }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'incident_sla_hours', operator: 'less_than_or_equal', expectedValue: 72 }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'incident_sla_hours', operator: 'greater_than_or_equal', expectedValue: 72 }, facts).passed).toBe(true);
    });

    test('evaluates existence and boolean operators (is_true, is_false, is_empty, is_not_empty, exists, not_exists)', () => {
      expect(evaluateConditionClause({ factKey: 'processes_personal_data', operator: 'is_true' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'special_category_data', operator: 'is_false' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'empty_vendor_list', operator: 'is_empty' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'cloud_providers', operator: 'is_not_empty' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'processes_personal_data', operator: 'exists' }, facts).passed).toBe(true);
      expect(evaluateConditionClause({ factKey: 'unrecorded_key', operator: 'not_exists' }, facts).passed).toBe(true);
    });

    test('evaluates complex condition groups (all, any, none, not, and nested groups)', () => {
      // Group: ALL must match
      const allGroup = {
        logicalOperator: 'all' as const,
        clauses: [
          { factKey: 'processes_personal_data', operator: 'is_true' as const },
          { factKey: 'data_subject_count', operator: 'greater_than' as const, expectedValue: 1000 },
        ],
      };
      expect(evaluateConditionGroup(allGroup, facts).passed).toBe(true);

      // Group: ANY matches
      const anyGroup = {
        logicalOperator: 'any' as const,
        clauses: [
          { factKey: 'special_category_data', operator: 'is_true' as const }, // false
          { factKey: 'processes_personal_data', operator: 'is_true' as const }, // true
        ],
      };
      expect(evaluateConditionGroup(anyGroup, facts).passed).toBe(true);

      // Group: NONE matches
      const noneGroup = {
        logicalOperator: 'none' as const,
        clauses: [
          { factKey: 'special_category_data', operator: 'is_true' as const },
          { factKey: 'primary_jurisdiction', operator: 'equals' as const, expectedValue: 'USA' },
        ],
      };
      expect(evaluateConditionGroup(noneGroup, facts).passed).toBe(true);

      // Nested Groups: (A and B) or (C and D)
      const nestedGroup = {
        logicalOperator: 'any' as const,
        clauses: [],
        nestedGroups: [
          {
            logicalOperator: 'all' as const,
            clauses: [
              { factKey: 'processes_personal_data', operator: 'is_true' as const },
              { factKey: 'special_category_data', operator: 'is_true' as const }, // Fails
            ],
          },
          {
            logicalOperator: 'all' as const,
            clauses: [
              { factKey: 'processes_personal_data', operator: 'is_true' as const },
              { factKey: 'cloud_providers', operator: 'contains' as const, expectedValue: 'AWS' }, // Passes
            ],
          },
        ],
      };
      expect(evaluateConditionGroup(nestedGroup, facts).passed).toBe(true);
    });
  });

  // 2. Rule Evaluation Outcomes & Explanations Tests
  describe('Rule Evaluation Outcomes & Audit Trails', () => {
    test('produces comprehensive explanation and audit trail on matching and non-matching rules', () => {
      const rule: ApplicabilityRule = {
        id: 'rule_ai_risk_assessment',
        frameworkId: 'eu_ai_act',
        targetRequirementId: 'aia_art_09',
        targetMasterControlId: 'ctl_master_aia_art09',
        ruleName: 'AI Risk Management System Applicability',
        description: 'Mandates Article 9 controls when high-risk AI is in production',
        conditionGroup: {
          logicalOperator: 'all',
          clauses: [
            { factKey: 'deploys_ai_systems', operator: 'is_true' },
            { factKey: 'deploys_high_risk_ai', operator: 'is_true' },
          ],
        },
        resultingStatusIfMatched: 'applicable',
        resultingStatusIfNotMatched: 'not_applicable',
        statutoryRationale: 'Article 9 applies directly to deployers of high-risk AI.',
        isMandatoryUnlessExempt: true,
        version: '1.0',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Test 1: Facts match -> Outcome: applicable
      const matchedFacts = {
        deploys_ai_systems: true,
        deploys_high_risk_ai: true,
      };
      const matchResult = evaluateApplicabilityRule(rule, matchedFacts);
      expect(matchResult.matched).toBe(true);
      expect(matchResult.resultingOutcome).toBe('applicable');
      expect(matchResult.explanation).toContain('evaluated to MATCHED');
      expect(matchResult.explanation).toContain('Article 9 applies directly');
      expect(matchResult.clauseDetails.length).toBe(2);
      expect(matchResult.auditTrail.length).toBeGreaterThan(0);

      // Test 2: Facts do not match -> Outcome: not_applicable
      const unmatchedFacts = {
        deploys_ai_systems: true,
        deploys_high_risk_ai: false,
      };
      const unmatchResult = evaluateApplicabilityRule(rule, unmatchedFacts);
      expect(unmatchResult.matched).toBe(false);
      expect(unmatchResult.resultingOutcome).toBe('not_applicable');
      expect(unmatchResult.explanation).toContain('did not match');

      // Test 3: Outcome review_required, inherited, or deferred
      const reviewRule: ApplicabilityRule = {
        ...rule,
        resultingStatusIfNotMatched: 'review_required',
      };
      const reviewResult = evaluateApplicabilityRule(reviewRule, unmatchedFacts);
      expect(reviewResult.resultingOutcome).toBe('review_required');
    });
  });

  // 3. Invalid Rule Rejection Tests
  describe('Invalid Rule Rejection & Validation', () => {
    test('rejects malformed rules missing required identifiers or invalid operators', () => {
      // Missing targetRequirementId
      const missingReq = {
        id: 'rule_bad_1',
        frameworkId: 'gdpr',
        resultingStatusIfMatched: 'applicable' as const,
      };
      expect(validateApplicabilityRule(missingReq as any).valid).toBe(false);

      // Invalid operator
      const badOperator: Partial<ApplicabilityRule> = {
        id: 'rule_bad_2',
        frameworkId: 'gdpr',
        targetRequirementId: 'gdpr_art_30',
        resultingStatusIfMatched: 'applicable',
        conditionGroup: {
          logicalOperator: 'all',
          clauses: [{ factKey: 'processes_personal_data', operator: 'invalid_op' as any }],
        },
      };
      expect(validateApplicabilityRule(badOperator).valid).toBe(false);

      // Numeric operator with non-numeric expected value
      const badType: Partial<ApplicabilityRule> = {
        id: 'rule_bad_3',
        frameworkId: 'gdpr',
        targetRequirementId: 'gdpr_art_30',
        resultingStatusIfMatched: 'applicable',
        conditionGroup: {
          logicalOperator: 'all',
          clauses: [{ factKey: 'headcount', operator: 'greater_than', expectedValue: 'two hundred' as any }],
        },
      };
      const badTypeRes = validateApplicabilityRule(badType);
      expect(badTypeRes.valid).toBe(false);
      expect(badTypeRes.error).toContain('requires numeric expectedValue');
    });
  });

  // 4. Multi-Tenant Firestore Security Rules Isolation
  describe('Applicability Decisions Security Rules Isolation', () => {
    const now = new Date().toISOString();

    const sampleDecision: TenantApplicabilityDecision = {
      id: 'gdpr_art_30',
      tenantId: tenantA,
      ownerId: userComplianceA,
      requirementId: 'gdpr_art_30',
      frameworkId: 'gdpr',
      sectionCode: 'Art. 30',
      requirementTitle: 'Records of Processing Activities',
      isApplicable: true,
      status: 'applicable',
      applicabilityType: 'rule_derived',
      matchedRuleId: 'rule_gdpr_art30_records',
      ruleEvaluationSummary: 'Automated rule matched',
      rationale: 'Organization processes EU personal data',
      overrideReason: null,
      previousStatus: null,
      assessedBy: userComplianceA,
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
    };

    test('compliance manager in Tenant A can create and update applicability decisions', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      await assertSucceeds(
        db.doc(`tenants/${tenantA}/applicability_decisions/gdpr_art_30`).set(sampleDecision)
      );

      const snap = await db.doc(`tenants/${tenantA}/applicability_decisions/gdpr_art_30`).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()?.status).toBe('applicable');
    });

    test('auditor in Tenant A can read but cannot create or modify applicability decisions', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      await adminCtx.firestore().doc(`tenants/${tenantA}/applicability_decisions/gdpr_art_30`).set({
        ...sampleDecision,
        ownerId: userAdminA,
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();

      // Read succeeds
      await assertSucceeds(db.doc(`tenants/${tenantA}/applicability_decisions/gdpr_art_30`).get());

      // Write fails
      await assertFails(
        db.doc(`tenants/${tenantA}/applicability_decisions/gdpr_art_30`).update({
          isApplicable: false,
        })
      );
    });

    test('Tenant A user cannot read or mutate applicability decisions in Tenant B partition', async () => {
      const compCtxA = testEnv.authenticatedContext(userComplianceA);
      const dbA = compCtxA.firestore();

      // Tenant A cannot write to Tenant B decisions
      await assertFails(
        dbA.doc(`tenants/${tenantB}/applicability_decisions/gdpr_art_30`).set({
          ...sampleDecision,
          tenantId: tenantB,
        })
      );

      // Tenant A cannot read Tenant B decisions
      await assertFails(
        dbA.doc(`tenants/${tenantB}/applicability_decisions/gdpr_art_30`).get()
      );
    });
  });
});

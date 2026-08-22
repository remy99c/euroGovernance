import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  TenantApplicabilityDecision,
  validateApplicabilityOverride,
  applyApplicabilityOverride,
  revertApplicabilityOverride,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantId = 'tenant_review_ui_corp';
const userAdmin = 'usr_admin_review';
const userCompliance = 'usr_comp_review';
const userAuditor = 'usr_auditor_review';
const userContributor = 'usr_contrib_review';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-review-ui-test',
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

    await db.doc(`tenants/${tenantId}`).set({ id: tenantId, status: 'active' });

    await db.doc(`tenants/${tenantId}/memberships/${userAdmin}`).set({
      userId: userAdmin,
      tenantId,
      role: 'tenant_admin',
      status: 'active',
    });
    await db.doc(`tenants/${tenantId}/memberships/${userCompliance}`).set({
      userId: userCompliance,
      tenantId,
      role: 'compliance_manager',
      status: 'active',
    });
    await db.doc(`tenants/${tenantId}/memberships/${userAuditor}`).set({
      userId: userAuditor,
      tenantId,
      role: 'auditor',
      status: 'active',
    });
    await db.doc(`tenants/${tenantId}/memberships/${userContributor}`).set({
      userId: userContributor,
      tenantId,
      role: 'contributor',
      status: 'active',
    });
  });
});

describe('Applicability Decision Review UI & Governance Suite', () => {
  const now = new Date().toISOString();

  const dataset: TenantApplicabilityDecision[] = [
    {
      id: 'dec_gdpr_art30',
      tenantId,
      ownerId: userCompliance,
      requirementId: 'gdpr_art_30',
      frameworkId: 'gdpr',
      sectionCode: 'Article 30',
      requirementTitle: 'Records of Processing Activities (ROPA)',
      isApplicable: true,
      status: 'applicable',
      applicabilityType: 'statutory_mandatory',
      decisionSource: 'auto',
      isOverridden: false,
      autoResult: {
        isApplicable: true,
        status: 'applicable',
        matchedRuleId: 'rule_gdpr_art30_records',
        ruleEvaluationSummary: 'Triggered because personal data processing fact is active.',
        evaluatedAt: now,
      },
      matchedRuleId: 'rule_gdpr_art30_records',
      ruleEvaluationSummary: 'Triggered because personal data processing fact is active.',
      rationale: 'Mandatory statutory record for EU personal data.',
      overrideReason: null,
      overrideRationale: null,
      previousStatus: null,
      assessedBy: 'system_engine',
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userCompliance,
      updatedBy: userCompliance,
    },
    {
      id: 'dec_gdpr_art35',
      tenantId,
      ownerId: userCompliance,
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
        matchedRuleId: 'rule_gdpr_art35_dpia',
        ruleEvaluationSummary: 'Special category data processing is inactive.',
        evaluatedAt: now,
      },
      matchedRuleId: 'rule_gdpr_art35_dpia',
      ruleEvaluationSummary: 'Special category data processing is inactive.',
      rationale: 'Exempt unless high-risk or special category data processing is active.',
      overrideReason: null,
      overrideRationale: null,
      previousStatus: null,
      assessedBy: 'system_engine',
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userCompliance,
      updatedBy: userCompliance,
    },
    {
      id: 'dec_aia_art09',
      tenantId,
      ownerId: userCompliance,
      requirementId: 'aia_art_09',
      frameworkId: 'eu_ai_act',
      sectionCode: 'Article 9',
      requirementTitle: 'Risk Management System for High-Risk AI',
      isApplicable: false,
      status: 'not_applicable',
      applicabilityType: 'statutory_mandatory',
      decisionSource: 'auto',
      isOverridden: false,
      autoResult: {
        isApplicable: false,
        status: 'not_applicable',
        matchedRuleId: 'rule_aia_09_high_risk',
        ruleEvaluationSummary: 'highRiskAIUsage is false.',
        evaluatedAt: now,
      },
      matchedRuleId: 'rule_aia_09_high_risk',
      ruleEvaluationSummary: 'highRiskAIUsage is false.',
      rationale: 'Applies exclusively to Annex III high-risk AI.',
      overrideReason: null,
      overrideRationale: null,
      previousStatus: null,
      assessedBy: 'system_engine',
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userCompliance,
      updatedBy: userCompliance,
    },
    {
      id: 'dec_iso_a824',
      tenantId,
      ownerId: userCompliance,
      requirementId: 'iso_a824',
      frameworkId: 'iso_27001',
      sectionCode: 'A.8.24',
      requirementTitle: 'Use of Cryptography',
      isApplicable: true,
      status: 'applicable',
      applicabilityType: 'rule_derived',
      decisionSource: 'auto',
      isOverridden: false,
      autoResult: {
        isApplicable: true,
        status: 'applicable',
        matchedRuleId: 'rule_iso_crypto',
        ruleEvaluationSummary: 'Cloud infrastructure usage requires cryptographic controls.',
        evaluatedAt: now,
      },
      matchedRuleId: 'rule_iso_crypto',
      ruleEvaluationSummary: 'Cloud infrastructure usage requires cryptographic controls.',
      rationale: 'Mandatory Annex A control.',
      overrideReason: null,
      overrideRationale: null,
      previousStatus: null,
      assessedBy: 'system_engine',
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userCompliance,
      updatedBy: userCompliance,
    },
  ];

  // 1. Filtering by Framework and Outcome
  describe('UI Filtering Logic', () => {
    test('filters decisions by framework (GDPR vs EU AI Act vs ISO 27001)', () => {
      const gdprOnly = dataset.filter((d) => d.frameworkId === 'gdpr');
      expect(gdprOnly.length).toBe(2);
      expect(gdprOnly.every((d) => d.frameworkId === 'gdpr')).toBe(true);

      const aiOnly = dataset.filter((d) => d.frameworkId === 'eu_ai_act');
      expect(aiOnly.length).toBe(1);
      expect(aiOnly[0]?.sectionCode).toBe('Article 9');

      const isoOnly = dataset.filter((d) => d.frameworkId === 'iso_27001');
      expect(isoOnly.length).toBe(1);
      expect(isoOnly[0]?.sectionCode).toBe('A.8.24');
    });

    test('filters decisions by outcome status (applicable vs not_applicable)', () => {
      const applicableItems = dataset.filter((d) => d.status === 'applicable');
      expect(applicableItems.length).toBe(2);

      const excludedItems = dataset.filter((d) => d.status === 'not_applicable');
      expect(excludedItems.length).toBe(2);
    });

    test('searches decisions by requirement title, sectionCode, and rationale text', () => {
      const searchDPIA = dataset.filter(
        (d) =>
          d.sectionCode.toLowerCase().includes('dpia') ||
          d.requirementTitle.toLowerCase().includes('dpia') ||
          d.rationale.toLowerCase().includes('dpia')
      );
      expect(searchDPIA.length).toBe(1);
      expect(searchDPIA[0]?.id).toBe('dec_gdpr_art35');
    });
  });

  // 2. Override Flow with Rationale & Reversibility
  describe('Override Flow & History Preservation', () => {
    test('enforces mandatory override rationale of at least 10 characters', () => {
      const emptyValidation = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: '',
        decisionSource: 'user_override',
      });
      expect(emptyValidation.valid).toBe(false);

      const shortValidation = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'too short',
        decisionSource: 'user_override',
      });
      expect(shortValidation.valid).toBe(false);

      const validValidation = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary customer assurance DPIA commitment for clinical trials.',
        decisionSource: 'user_override',
      });
      expect(validValidation.valid).toBe(true);
    });

    test('applies override, preserves autoResult baseline, and appends to history', () => {
      const targetDecision = dataset[1]!; // dec_gdpr_art35 (originally not_applicable)

      const overridden = applyApplicabilityOverride({
        decision: targetDecision,
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary customer assurance DPIA commitment for clinical trials.',
        actorId: userCompliance,
        actorRole: 'compliance_manager',
        decisionSource: 'user_override',
      });

      expect(overridden.status).toBe('applicable');
      expect(overridden.isOverridden).toBe(true);
      expect(overridden.autoResult?.status).toBe('not_applicable');
      expect(overridden.history?.length).toBe(1);
      expect(overridden.history![0]?.overrideRationale).toContain('Voluntary customer assurance');

      // Revert decision back to automatic baseline
      const reverted = revertApplicabilityOverride({
        decision: overridden,
        actorId: userCompliance,
        actorRole: 'compliance_manager',
        reason: 'Recalibrated after clinical trial scope closure.',
      });

      expect(reverted.status).toBe('not_applicable');
      expect(reverted.isOverridden).toBe(false);
      expect(reverted.history?.length).toBe(2);
    });
  });

  // 3. Role-Based Security & Visibility Restrictions
  describe('Role-Based Access Control', () => {
    test('compliance manager can write and override applicability decision documents in Firestore', async () => {
      const compCtx = testEnv.authenticatedContext(userCompliance);
      const db = compCtx.firestore();

      const docRef = db.doc(`tenants/${tenantId}/applicability_decisions/${dataset[0]!.id}`);
      await assertSucceeds(docRef.set(dataset[0]!));

      await assertSucceeds(
        docRef.update({
          status: 'review_required',
          updatedAt: new Date().toISOString(),
          updatedBy: userCompliance,
        })
      );
    });

    test('auditor can inspect and read applicability decisions, but cannot modify or override them', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdmin);
      await adminCtx.firestore().doc(`tenants/${tenantId}/applicability_decisions/${dataset[0]!.id}`).set({
        ...dataset[0]!,
        ownerId: userAdmin,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditor);
      const docRef = auditorCtx.firestore().doc(`tenants/${tenantId}/applicability_decisions/${dataset[0]!.id}`);

      // Read succeeds
      await assertSucceeds(docRef.get());

      // Modification fails
      await assertFails(
        docRef.update({
          status: 'not_applicable',
          overrideRationale: 'Auditor unauthorized override attempt.',
        })
      );
    });

    test('contributor cannot modify or override applicability decisions', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdmin);
      await adminCtx.firestore().doc(`tenants/${tenantId}/applicability_decisions/${dataset[0]!.id}`).set({
        ...dataset[0]!,
        ownerId: userAdmin,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      });

      const contribCtx = testEnv.authenticatedContext(userContributor);
      const docRef = contribCtx.firestore().doc(`tenants/${tenantId}/applicability_decisions/${dataset[0]!.id}`);

      // Modification fails
      await assertFails(
        docRef.update({
          status: 'applicable',
        })
      );
    });
  });
});

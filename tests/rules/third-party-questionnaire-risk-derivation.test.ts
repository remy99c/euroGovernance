import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  DynamicQuestionnaireSection,
  Risk,
  analyzeSubmissionRiskPosture,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-risk-derivation-test',
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
    const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

    // 1. Tenants
    await db.doc(`tenants/${tenantA}`).set({
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
      id: tenantB,
      name: 'Nordic AI Health AB',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      id: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      userId: PERSONAS.complianceA.uid,
      role: 'compliance_manager',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      id: PERSONAS.adminB.uid,
      tenantId: tenantB,
      userId: PERSONAS.adminB.uid,
      role: 'tenant_admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe('Third-Party Questionnaire Risk Derivation & Scoring Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();

  const testSections: DynamicQuestionnaireSection[] = [
    {
      id: 'sec_security',
      tenantId: tenantA,
      templateId: 'tmpl_risk_test',
      code: 'SEC-TOMS',
      title: 'Technical and Organizational Measures',
      description: 'GDPR Article 32 security controls.',
      sortOrder: 1,
      weight: 10,
      questions: [
        {
          id: 'q_encryption_rest',
          tenantId: tenantA,
          templateId: 'tmpl_risk_test',
          sectionId: 'sec_security',
          code: 'TOM-01',
          title: 'How is personal data encrypted at rest?',
          questionType: 'single_select',
          required: true,
          sortOrder: 1,
          scoring: { weight: 5 },
          options: [
            {
              id: 'opt_aes256',
              label: 'AES-256 with customer-managed keys',
              value: 'aes256_cmk',
              score: 100,
              isRiskTrigger: false,
            },
            {
              id: 'opt_none',
              label: 'Data is stored in plaintext (No encryption)',
              value: 'plaintext',
              score: 0,
              isRiskTrigger: true,
              riskCode: 'RISK_PLAINTEXT_STORAGE',
              riskSeverity: 'critical',
              riskRationale: 'Unencrypted personal data storage at rest violates GDPR Article 32(1)(a).',
            },
          ],
          statutoryCitations: ['GDPR Art. 32(1)(a)'],
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'q_breach_sla',
          tenantId: tenantA,
          templateId: 'tmpl_risk_test',
          sectionId: 'sec_security',
          code: 'SEC-02',
          title: 'Maximum breach notification SLA to Controller (in hours)',
          questionType: 'numeric',
          required: true,
          sortOrder: 2,
          scoring: {
            weight: 3,
            numericRanges: [
              { max: 24, score: 100, label: '<= 24 hours' },
              { min: 25, max: 72, score: 70, label: '25-72 hours' },
              { min: 73, score: 0, label: '> 72 hours' },
            ],
          },
          riskTriggers: [
            {
              operator: 'greater_than',
              triggerValue: 72,
              riskCode: 'RISK_BREACH_SLA_EXCEEDS_72H',
              riskTitle: 'Breach Notification SLA Exceeds Statutory Limit',
              riskSeverity: 'high',
              riskCategory: 'legal_compliance',
              suggestedRemediation: 'Negotiate DPA clause to mandate breach notification within 24-48 hours.',
              statutoryCitation: 'GDPR Art. 33(1)',
            },
          ],
          statutoryCitations: ['GDPR Art. 33(1)'],
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'q_iso27001_cert',
          tenantId: tenantA,
          templateId: 'tmpl_risk_test',
          sectionId: 'sec_security',
          code: 'SEC-03',
          title: 'Upload ISO 27001 certificate.',
          questionType: 'file_upload',
          required: true,
          requiresEvidence: true,
          acceptedEvidenceCategories: ['iso_certificate'],
          sortOrder: 3,
          scoring: { weight: 2 },
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
      ],
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // ---------------------------------------------------------------------------
  // 1. WEIGHTED SCORING & RISK POSTURE CALCULATION
  // ---------------------------------------------------------------------------
  describe('1. Weighted Score Calculation & Risk Posture', () => {
    it('calculates weighted score and returns low risk posture for compliant responses', () => {
      const answers = {
        q_encryption_rest: {
          questionId: 'q_encryption_rest',
          questionCode: 'TOM-01',
          sectionId: 'sec_security',
          value: 'aes256_cmk',
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_breach_sla: {
          questionId: 'q_breach_sla',
          questionCode: 'SEC-02',
          sectionId: 'sec_security',
          value: 24,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_iso27001_cert: {
          questionId: 'q_iso27001_cert',
          questionCode: 'SEC-03',
          sectionId: 'sec_security',
          value: 'attached',
          attachedEvidenceIds: ['ev_cert_123'],
          updatedAt: now,
        },
      };

      const result = analyzeSubmissionRiskPosture(testSections, answers, {
        passingScoreThreshold: 70,
        thirdPartyName: 'CloudSafe Europe',
      });

      expect(result.overallScorePercent).toBe(100);
      expect(result.isCompliant).toBe(true);
      expect(result.overallRiskTier).toBe('low');
      expect(result.triggeredFlags.length).toBe(0);
      expect(result.requiresReviewFollowUp).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. RISK FLAG TRIGGERING & EXPLAINABILITY
  // ---------------------------------------------------------------------------
  describe('2. Risk Flag Triggering & Transparent Explanations', () => {
    it('triggers critical and high risk flags from critical answers with clear explanations', () => {
      const answers = {
        q_encryption_rest: {
          questionId: 'q_encryption_rest',
          questionCode: 'TOM-01',
          sectionId: 'sec_security',
          value: 'plaintext', // Critical trigger!
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_breach_sla: {
          questionId: 'q_breach_sla',
          questionCode: 'SEC-02',
          sectionId: 'sec_security',
          value: 120, // High risk trigger (> 72h)!
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_iso27001_cert: {
          questionId: 'q_iso27001_cert',
          questionCode: 'SEC-03',
          sectionId: 'sec_security',
          value: null,
          attachedEvidenceIds: [], // Missing evidence!
          updatedAt: now,
        },
      };

      const result = analyzeSubmissionRiskPosture(testSections, answers, {
        passingScoreThreshold: 70,
        thirdPartyName: 'RiskyData Corp',
      });

      expect(result.overallScorePercent).toBe(0);
      expect(result.isCompliant).toBe(false);
      expect(result.overallRiskTier).toBe('critical');
      expect(result.requiresReviewFollowUp).toBe(true);
      expect(result.triggeredFlags.length).toBe(2);

      // Verify triggered flag details
      const plaintextFlag = result.triggeredFlags.find((f) => f.riskCode === 'RISK_PLAINTEXT_STORAGE');
      expect(plaintextFlag).toBeDefined();
      expect(plaintextFlag?.riskSeverity).toBe('critical');

      const breachFlag = result.triggeredFlags.find((f) => f.riskCode === 'RISK_BREACH_SLA_EXCEEDS_72H');
      expect(breachFlag).toBeDefined();
      expect(breachFlag?.riskSeverity).toBe('high');

      // Verify explainability
      expect(result.explanations.length).toBeGreaterThanOrEqual(3);
      const statutoryExplanation = result.explanations.find(
        (e) => e.statutoryCitation === 'GDPR Art. 32(1)(a)'
      );
      expect(statutoryExplanation).toBeDefined();
      expect(statutoryExplanation?.severity).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DEDUPLICATION & RISK REGISTER ENTRIES
  // ---------------------------------------------------------------------------
  describe('3. Deduplication & Risk Register Integration', () => {
    it('produces deterministic deduplication keys and handles risk register ingestion without duplicates', async () => {
      const answers = {
        q_encryption_rest: {
          questionId: 'q_encryption_rest',
          questionCode: 'TOM-01',
          sectionId: 'sec_security',
          value: 'plaintext',
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_breach_sla: {
          questionId: 'q_breach_sla',
          questionCode: 'SEC-02',
          sectionId: 'sec_security',
          value: 24,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_iso27001_cert: {
          questionId: 'q_iso27001_cert',
          questionCode: 'SEC-03',
          sectionId: 'sec_security',
          value: 'attached',
          attachedEvidenceIds: ['ev_cert_123'],
          updatedAt: now,
        },
      };

      const result = analyzeSubmissionRiskPosture(testSections, answers, {
        passingScoreThreshold: 70,
        thirdPartyName: 'Acme SaaS',
        vendorId: 'vend_acme_01',
      });

      expect(result.recommendedRegisterEntries.length).toBe(1);
      const entry = result.recommendedRegisterEntries[0];
      expect(entry).toBeDefined();
      if (!entry) throw new Error('Expected entry to be defined');
      expect(entry.deduplicationKey).toBe('TP_RISK_VEND_ACME_01_RISK_PLAINTEXT_STORAGE');

      // Ingest into Firestore
      const riskDoc: Risk = {
        id: 'risk_plaintext_acme',
        tenantId: tenantA,
        code: entry.code,
        title: entry.title,
        description: entry.description,
        category: 'third_party',
        status: 'identified',
        inherentLikelihood: entry.inherentLikelihood,
        inherentImpact: entry.inherentImpact,
        inherentScore: entry.inherentScore,
        residualLikelihood: entry.inherentLikelihood,
        residualImpact: entry.inherentImpact,
        residualScore: entry.inherentScore,
        treatmentStrategy: entry.treatmentStrategy,
        treatmentPlan: entry.treatmentPlan,
        mitigatingControlIds: [],
        affectedAssetIds: [],
        vendorIds: ['vend_acme_01'],
        sourceEntityType: 'third_party_assessment',
        sourceEntityId: 'req_acme_001',
        derivedRuleCode: entry.code,
        deduplicationKey: entry.deduplicationKey,
        ownerId: PERSONAS.complianceA.uid,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: now,
        updatedAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/risks/${riskDoc.id}`).set(riskDoc);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const riskSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/risks/${riskDoc.id}`).get()
      );
      expect(riskSnap.exists).toBe(true);
      const rData = riskSnap.data() as Risk;
      expect(rData.deduplicationKey).toBe('TP_RISK_VEND_ACME_01_RISK_PLAINTEXT_STORAGE');
    });

    it('prevents Tenant B user from reading Tenant A derived risks', async () => {
      const riskDocId = 'risk_isolated_001';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/risks/${riskDocId}`).set({
          id: riskDocId,
          tenantId: tenantA,
          code: 'RISK_001',
          title: 'Isolated Risk',
          description: 'Description',
          category: 'third_party',
          status: 'identified',
          inherentLikelihood: 3,
          inherentImpact: 3,
          inherentScore: 9,
          residualLikelihood: 3,
          residualImpact: 3,
          residualScore: 9,
          treatmentStrategy: 'mitigate',
          treatmentPlan: 'Plan',
          mitigatingControlIds: [],
          affectedAssetIds: [],
          ownerId: PERSONAS.complianceA.uid,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        });
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/risks/${riskDocId}`).get()
      );
    });
  });
});

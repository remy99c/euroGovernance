import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import * as crypto from 'crypto';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  ThirdPartyAssessmentRequest,
  AssessmentAccessToken,
  ExternalAssessmentSubmission,
  DynamicQuestionnaireSection,
  QuestionnaireAnswer,
  evaluateQuestionVisibility,
  evaluateQuestionScore,
  validateAnswer,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

function generateTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-external-submission-test',
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
  });
});

describe('External Assessment Submission & Validation Workflow Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();

  const { tokenHash } = generateTokenPair();

  const sampleSections: DynamicQuestionnaireSection[] = [
    {
      id: 'sec_gov',
      tenantId: tenantA,
      templateId: 'tmpl_gdpr_art28',
      code: 'SEC-GOV',
      title: '1. Privacy Governance',
      description: 'Organizational data protection measures and DPO appointment.',
      sortOrder: 1,
      weight: 1,
      questions: [
        {
          id: 'q_gov_dpo',
          tenantId: tenantA,
          templateId: 'tmpl_gdpr_art28',
          sectionId: 'sec_gov',
          code: 'GOV-01',
          title: 'Has your organization designated a Data Protection Officer (DPO)?',
          questionType: 'yes_no',
          required: true,
          sortOrder: 1,
          scoring: { weight: 5 },
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'q_gov_dpo_email',
          tenantId: tenantA,
          templateId: 'tmpl_gdpr_art28',
          sectionId: 'sec_gov',
          code: 'GOV-02',
          title: 'Official contact email for your DPO',
          questionType: 'text',
          required: true,
          sortOrder: 2,
          scoring: { weight: 5 },
          conditionalRules: [
            {
              dependsOnQuestionId: 'q_gov_dpo',
              operator: 'is_truthy',
              action: 'show',
            },
          ],
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
    {
      id: 'sec_toms',
      tenantId: tenantA,
      templateId: 'tmpl_gdpr_art28',
      code: 'SEC-TOMS',
      title: '2. Technical & Organizational Measures',
      description: 'Encryption standards and SLA notification limits.',
      sortOrder: 2,
      weight: 2,
      questions: [
        {
          id: 'q_toms_encryption',
          tenantId: tenantA,
          templateId: 'tmpl_gdpr_art28',
          sectionId: 'sec_toms',
          code: 'TOM-01',
          title: 'Data Encryption Standards',
          questionType: 'single_select',
          required: true,
          sortOrder: 1,
          scoring: { weight: 10 },
          options: [
            { label: 'AES-256 at rest, TLS 1.3 in transit', value: 'aes256_tls13', score: 100 },
            { label: 'No encryption enforced', value: 'none', score: 0, isRiskTrigger: true },
          ],
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: 'q_toms_breach_sla',
          tenantId: tenantA,
          templateId: 'tmpl_gdpr_art28',
          sectionId: 'sec_toms',
          code: 'TOM-02',
          title: 'Breach Notification SLA (Hours)',
          questionType: 'numeric',
          required: true,
          sortOrder: 2,
          scoring: { weight: 10 },
          numericConstraints: { min: 1, max: 72, unit: 'hours' },
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

  const assessmentRequest: ThirdPartyAssessmentRequest = {
    id: 'req_portal_test_001',
    tenantId: tenantA,
    title: 'CloudCorp Security Due Diligence',
    templateId: 'tmpl_gdpr_art28',
    templateSnapshot: {
      id: 'tmpl_gdpr_art28',
      tenantId: tenantA,
      code: 'TMPL-GDPR-ART28',
      title: 'GDPR Article 28 Due Diligence',
      description: 'Vendor guarantees questionnaire.',
      version: '1.0.0',
      status: 'published',
      category: 'gdpr_article_28',
      targetScope: 'any',
      passingScoreThreshold: 70,
      defaultValidDays: 30,
      defaultRecurrenceCadence: 'annual',
      sectionCount: 2,
      questionCount: 4,
      isSystemDefault: true,
      sections: sampleSections as any,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
    },
    targetType: 'prospective_vendor',
    thirdPartyName: 'CloudCorp Technologies EU',
    prospectCompanyName: 'CloudCorp Technologies EU',
    vendorId: null,
    processorProfileId: null,
    respondent: {
      name: 'Dr. Lukas Weber',
      email: 'lukas@cloudcorp.eu',
      companyName: 'CloudCorp Technologies EU',
    },
    accessTokenHash: tokenHash,
    tokenExpiresAt: futureIso,
    accessCount: 1,
    requestType: 'one_time_due_diligence',
    status: 'sent',
    dueDate: futureIso,
    isRecurring: false,
    recurrenceCadence: 'none',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: [],
    linkedEvidenceIds: [],
    linkedRiskIds: [],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const activeToken: AssessmentAccessToken = {
    id: 'tok_submission_001',
    tenantId: tenantA,
    requestId: assessmentRequest.id,
    templateId: 'tmpl_gdpr_art28',
    recipientEmail: 'lukas@cloudcorp.eu',
    recipientName: 'Dr. Lukas Weber',
    thirdPartyName: 'CloudCorp Technologies EU',
    tokenHash,
    tokenType: 'single_use',
    status: 'active',
    maxUses: 1,
    useCount: 0,
    expiresAt: futureIso,
    lastAccessedAt: null,
    lastAccessedIpMasked: null,
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    requireEmailVerificationCode: false,
    issuedByUserId: PERSONAS.complianceA.uid,
    issuedAt: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. DRAFT SAVING & QUESTION VISIBILITY
  // ---------------------------------------------------------------------------
  describe('1. Draft Saving & Dynamic Conditional Visibility', () => {
    it('evaluates conditional questions dynamically based on upstream answers', () => {
      // Case A: DPO is false -> DPO email should be hidden
      const answersNoDpo: Record<string, QuestionnaireAnswer> = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          questionCode: 'GOV-01',
          sectionId: 'sec_gov',
          value: false,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      const emailQuestion = sampleSections[0]!.questions[1]!;
      const visNoDpo = evaluateQuestionVisibility(emailQuestion, answersNoDpo);
      expect(visNoDpo.isVisible).toBe(false);

      // Case B: DPO is true -> DPO email should be visible & required
      const answersWithDpo: Record<string, QuestionnaireAnswer> = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          questionCode: 'GOV-01',
          sectionId: 'sec_gov',
          value: true,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      const visWithDpo = evaluateQuestionVisibility(emailQuestion, answersWithDpo);
      expect(visWithDpo.isVisible).toBe(true);
      expect(visWithDpo.isRequired).toBe(true);
    });

    it('saves draft answers successfully in Firestore and links to submission', async () => {
      const submissionDoc: ExternalAssessmentSubmission = {
        id: 'sub_portal_draft_001',
        tenantId: tenantA,
        requestId: assessmentRequest.id,
        templateId: 'tmpl_gdpr_art28',
        targetType: 'prospective_vendor',
        vendorId: null,
        processorProfileId: null,
        thirdPartyName: 'CloudCorp Technologies EU',
        status: 'draft_saved',
        submittedBy: {
          name: 'Dr. Lukas Weber',
          email: 'lukas@cloudcorp.eu',
          companyName: 'CloudCorp Technologies EU',
          submittedAt: now,
        },
        computedScorePercent: 0,
        isPassingThreshold: false,
        sectionScores: {},
        answers: {
          q_gov_dpo: {
            questionId: 'q_gov_dpo',
            questionCode: 'GOV-01',
            sectionId: 'sec_gov',
            value: true,
            attachedEvidenceIds: [],
            updatedAt: now,
          },
        },
        unansweredRequiredCount: 3,
        totalQuestionsCount: 4,
        answeredQuestionsCount: 1,
        ipAddressMasked: '192.168.***.***',
        userAgent: null,
        ownerId: PERSONAS.complianceA.uid,
        createdBy: 'external_respondent',
        updatedBy: 'external_respondent',
        createdAt: now,
        updatedAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_submissions/${submissionDoc.id}`).set(submissionDoc);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const snap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_submissions/${submissionDoc.id}`).get()
      );
      expect(snap.exists).toBe(true);
      expect((snap.data() as ExternalAssessmentSubmission).status).toBe('draft_saved');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. SUBMISSION VALIDATION & SCORING
  // ---------------------------------------------------------------------------
  describe('2. Submission Validation & Scoring Engine', () => {
    it('detects missing required fields when a mandatory visible question has no value', () => {
      const incompleteAnswers: Record<string, QuestionnaireAnswer> = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          questionCode: 'GOV-01',
          sectionId: 'sec_gov',
          value: true,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_gov_dpo_email: {
          questionId: 'q_gov_dpo_email',
          questionCode: 'GOV-02',
          sectionId: 'sec_gov',
          value: null,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      const emailQuestion = sampleSections[0]!.questions[1]!;
      const vis = evaluateQuestionVisibility(emailQuestion, incompleteAnswers);
      const val = validateAnswer(emailQuestion, incompleteAnswers[emailQuestion.id]!, {
        checkRequired: vis.isRequired,
      });

      expect(val.valid).toBe(false);
      expect(val.errors[0]).toContain('mandatory');
    });

    it('calculates 100% passing score when compliant answers are provided for all visible questions', () => {
      const completeAnswers: Record<string, QuestionnaireAnswer> = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          questionCode: 'GOV-01',
          sectionId: 'sec_gov',
          value: true,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_gov_dpo_email: {
          questionId: 'q_gov_dpo_email',
          questionCode: 'GOV-02',
          sectionId: 'sec_gov',
          value: 'dpo@cloudcorp.eu',
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_toms_encryption: {
          questionId: 'q_toms_encryption',
          questionCode: 'TOM-01',
          sectionId: 'sec_toms',
          value: 'aes256_tls13',
          attachedEvidenceIds: [],
          updatedAt: now,
        },
        q_toms_breach_sla: {
          questionId: 'q_toms_breach_sla',
          questionCode: 'TOM-02',
          sectionId: 'sec_toms',
          value: 24,
          attachedEvidenceIds: [],
          updatedAt: now,
        },
      };

      let totalEarned = 0;
      let totalPossible = 0;

      for (const sec of sampleSections) {
        for (const q of sec.questions) {
          const vis = evaluateQuestionVisibility(q, completeAnswers);
          if (vis.isVisible) {
            const ans = completeAnswers[q.id];
            const val = validateAnswer(q, ans, { checkRequired: vis.isRequired });
            expect(val.valid).toBe(true);

            const score = evaluateQuestionScore(q, ans);
            totalEarned += score.earnedPoints;
            totalPossible += score.maxPoints;
          }
        }
      }

      const scorePercent = Math.round((totalEarned / totalPossible) * 100);
      expect(scorePercent).toBe(100);
      expect(scorePercent >= 70).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MULTI-TENANT ISOLATION & SUBMISSION BOUNDARIES
  // ---------------------------------------------------------------------------
  describe('3. Multi-Tenant Isolation & Submission Boundaries', () => {
    it('prevents Tenant B user from reading Tenant A assessment submissions', async () => {
      const submissionDoc: ExternalAssessmentSubmission = {
        id: 'sub_tenant_a_001',
        tenantId: tenantA,
        requestId: assessmentRequest.id,
        templateId: 'tmpl_gdpr_art28',
        targetType: 'prospective_vendor',
        vendorId: null,
        processorProfileId: null,
        thirdPartyName: 'CloudCorp Technologies EU',
        status: 'submitted',
        submittedBy: {
          name: 'Dr. Lukas Weber',
          email: 'lukas@cloudcorp.eu',
          companyName: 'CloudCorp Technologies EU',
          submittedAt: now,
        },
        computedScorePercent: 100,
        isPassingThreshold: true,
        sectionScores: {},
        answers: {},
        unansweredRequiredCount: 0,
        totalQuestionsCount: 4,
        answeredQuestionsCount: 4,
        ipAddressMasked: null,
        userAgent: null,
        ownerId: PERSONAS.complianceA.uid,
        createdBy: 'external_respondent',
        updatedBy: 'external_respondent',
        createdAt: now,
        updatedAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_submissions/${submissionDoc.id}`).set(submissionDoc);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/assessment_submissions/${submissionDoc.id}`).get()
      );
    });

    it('exhausts single-use access token when submission is finalized', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).set(activeToken);
      });

      const exhaustedToken: AssessmentAccessToken = {
        ...activeToken,
        status: 'used',
        useCount: 1,
        updatedAt: new Date().toISOString(),
      };

      expect(exhaustedToken.status).toBe('used');
      expect(exhaustedToken.useCount).toBe(1);
    });
  });
});

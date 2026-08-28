import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  ScopeQuestion,
  TenantScopeAnswer,
  validateScopeAnswer,
  mapAnswerToScopeFact,
  calculateQuestionnaireProgress,
  composeTenantQuestionnaire,
  CANONICAL_SCOPE_QUESTIONNAIRES,
  CANONICAL_SCOPE_QUESTIONS,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-questionnaire-test';

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

describe('Scope Questionnaire System Suite', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

      // Seed global questionnaires
      for (const qnr of CANONICAL_SCOPE_QUESTIONNAIRES) {
        await db.doc(`scope_questionnaires/${qnr.id}`).set(qnr);
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

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
    });
  });

  // 1. Scope Answer Validation Tests
  describe('Question Types & Scope Answer Validation', () => {
    const booleanQuestion: ScopeQuestion = {
      id: 'q_gdpr_personal_data',
      questionnaireId: 'qnr_gdpr_privacy_scoping',
      factKey: 'processes_personal_data',
      prompt: 'Do you process EU personal data?',
      guidanceText: 'General data scope',
      category: 'data_processing',
      responseType: 'boolean',
      sortOrder: 1,
      isRequired: true,
      isTriggerForFrameworks: ['gdpr'],
    };

    const multiChoiceQuestion: ScopeQuestion = {
      id: 'q_cloud_providers',
      questionnaireId: 'qnr_general_org_scoping',
      factKey: 'cloud_providers',
      prompt: 'Which cloud providers do you use?',
      guidanceText: 'Cloud infrastructure',
      category: 'infrastructure',
      responseType: 'multi_choice',
      options: [
        { label: 'AWS', value: 'AWS' },
        { label: 'GCP', value: 'GCP' },
        { label: 'Azure', value: 'Azure' },
      ],
      sortOrder: 2,
      isRequired: true,
      isTriggerForFrameworks: ['iso_27001'],
    };

    test('validates boolean answers and rejects non-boolean or missing required values', () => {
      expect(validateScopeAnswer(booleanQuestion, { answerBoolean: true }).valid).toBe(true);
      expect(validateScopeAnswer(booleanQuestion, { answerBoolean: false }).valid).toBe(true);

      // Missing answer for required question
      const missingRes = validateScopeAnswer(booleanQuestion, {});
      expect(missingRes.valid).toBe(false);
      expect(missingRes.error).toContain('is mandatory');

      // Invalid response type
      const invalidTypeRes = validateScopeAnswer(booleanQuestion, { answerBoolean: 'true' as any });
      expect(invalidTypeRes.valid).toBe(false);
      expect(invalidTypeRes.error).toContain('expects boolean response');
    });

    test('validates multi_choice answers against allowed options', () => {
      const validAns: Partial<TenantScopeAnswer> = {
        answerArray: ['AWS', 'GCP'],
      };
      expect(validateScopeAnswer(multiChoiceQuestion, validAns).valid).toBe(true);

      const invalidAns: Partial<TenantScopeAnswer> = {
        answerArray: ['AWS', 'UnknownCloudProvider'],
      };
      const invalidRes = validateScopeAnswer(multiChoiceQuestion, invalidAns);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.error).toContain('Invalid option');
    });
  });

  // 2. Questionnaire Composition across Multiple Adopted Frameworks
  describe('Questionnaire Composition Engine', () => {
    test('composes unified questionnaire for single framework (GDPR)', () => {
      const composed = composeTenantQuestionnaire(
        ['gdpr'],
        CANONICAL_SCOPE_QUESTIONNAIRES,
        CANONICAL_SCOPE_QUESTIONS
      );

      expect(composed.applicableFrameworkIds).toEqual(['gdpr']);
      expect(composed.sections.length).toBeGreaterThanOrEqual(2); // General + GDPR

      const sectionTitles = composed.sections.map((s) => s.title);
      expect(sectionTitles).toContain('General Organizational & Cloud Infrastructure Scope');
      expect(sectionTitles).toContain('GDPR Statutory Privacy & Personal Data Scoping');
    });

    test('composes deduplicated multi-framework questionnaire for GDPR + ISO 27001 + EU AI Act', () => {
      const composed = composeTenantQuestionnaire(
        ['gdpr', 'iso_27001', 'eu_ai_act'],
        CANONICAL_SCOPE_QUESTIONNAIRES,
        CANONICAL_SCOPE_QUESTIONS
      );

      expect(composed.applicableFrameworkIds).toEqual(['gdpr', 'iso_27001', 'eu_ai_act']);
      expect(composed.sections.length).toBe(4); // General + GDPR + AI Act + ISO 27001

      // Verify no duplicate questions across composed sections
      const seenFactKeys = new Set<string>();
      for (const section of composed.sections) {
        for (const q of section.questions) {
          expect(seenFactKeys.has(q.factKey)).toBe(false);
          seenFactKeys.add(q.factKey);
        }
      }

      expect(composed.totalQuestionsCount).toBe(seenFactKeys.size);
      expect(composed.requiredQuestionsCount).toBeGreaterThan(0);
    });
  });

  // 3. Mapping Answers to Structured Scope Facts
  describe('Answer to Scope Fact Mapping', () => {
    test('maps boolean questionnaire answer to TenantScopeFact', () => {
      const question: ScopeQuestion = {
        id: 'q_gdpr_special_cat',
        questionnaireId: 'qnr_gdpr_privacy_scoping',
        factKey: 'processes_special_category_data',
        prompt: 'Do you process Article 9 Special Category Data?',
        guidanceText: 'Sensitive data',
        category: 'data_processing',
        responseType: 'boolean',
        sortOrder: 1,
        isRequired: true,
        isTriggerForFrameworks: ['gdpr'],
      };

      const answer: TenantScopeAnswer = {
        id: 'q_gdpr_special_cat',
        tenantId: tenantA,
        ownerId: userComplianceA,
        questionnaireId: 'qnr_gdpr_privacy_scoping',
        questionId: 'q_gdpr_special_cat',
        factKey: 'processes_special_category_data',
        responseType: 'boolean',
        answerBoolean: true,
        answerString: null,
        answerNumber: null,
        answerArray: null,
        notes: 'Processes medical patient records',
        answeredBy: userComplianceA,
        answeredAt: new Date().toISOString(),
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      };

      const fact = mapAnswerToScopeFact(tenantA, question, answer, userComplianceA);

      expect(fact.id).toBe('processes_special_category_data');
      expect(fact.factKey).toBe('processes_special_category_data');
      expect(fact.category).toBe('data_processing');
      expect(fact.dataType).toBe('boolean');
      expect(fact.valueBoolean).toBe(true);
      expect(fact.source).toBe('questionnaire');
      expect(fact.sourceQuestionId).toBe('q_gdpr_special_cat');
      expect(fact.assessedBy).toBe(userComplianceA);
    });

    test('maps string_array / multi_choice answer to TenantScopeFact', () => {
      const question: ScopeQuestion = {
        id: 'q_org_cloud',
        questionnaireId: 'qnr_general_org_scoping',
        factKey: 'cloud_providers',
        prompt: 'Which cloud providers do you host workloads on?',
        guidanceText: 'Cloud hosting',
        category: 'infrastructure',
        responseType: 'multi_choice',
        sortOrder: 2,
        isRequired: true,
        isTriggerForFrameworks: ['iso_27001'],
      };

      const answer: TenantScopeAnswer = {
        id: 'q_org_cloud',
        tenantId: tenantA,
        ownerId: userComplianceA,
        questionnaireId: 'qnr_general_org_scoping',
        questionId: 'q_org_cloud',
        factKey: 'cloud_providers',
        responseType: 'multi_choice',
        answerBoolean: null,
        answerString: null,
        answerNumber: null,
        answerArray: ['AWS', 'GCP'],
        notes: 'Primary workloads on AWS Frankfurt',
        answeredBy: userComplianceA,
        answeredAt: new Date().toISOString(),
        status: 'active',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      };

      const fact = mapAnswerToScopeFact(tenantA, question, answer, userComplianceA);

      expect(fact.dataType).toBe('string_array');
      expect(fact.valueArray).toEqual(['AWS', 'GCP']);
      expect(fact.category).toBe('infrastructure');
    });
  });

  // 4. Progress & Completion Tracking
  describe('Questionnaire Progress Tracking', () => {
    test('computes progress percentage and detects missing required questions', () => {
      const q1: ScopeQuestion = {
        id: 'q1',
        questionnaireId: 'qnr1',
        factKey: 'f1',
        prompt: 'Q1',
        guidanceText: '',
        category: 'organization',
        responseType: 'boolean',
        sortOrder: 1,
        isRequired: true,
        isTriggerForFrameworks: ['gdpr'],
      };
      const q2: ScopeQuestion = {
        id: 'q2',
        questionnaireId: 'qnr1',
        factKey: 'f2',
        prompt: 'Q2',
        guidanceText: '',
        category: 'organization',
        responseType: 'boolean',
        sortOrder: 2,
        isRequired: true,
        isTriggerForFrameworks: ['gdpr'],
      };
      const q3Optional: ScopeQuestion = {
        id: 'q3',
        questionnaireId: 'qnr1',
        factKey: 'f3',
        prompt: 'Q3 Optional',
        guidanceText: '',
        category: 'organization',
        responseType: 'boolean',
        sortOrder: 3,
        isRequired: false,
        isTriggerForFrameworks: ['gdpr'],
      };

      const questions = [q1, q2, q3Optional];

      // 1 of 3 answered
      const partialAnswers: Record<string, Partial<TenantScopeAnswer>> = {
        q1: { answerBoolean: true },
      };

      const prog1 = calculateQuestionnaireProgress(questions, partialAnswers);
      expect(prog1.totalQuestions).toBe(3);
      expect(prog1.requiredQuestions).toBe(2);
      expect(prog1.answeredQuestions).toBe(1);
      expect(prog1.answeredRequiredQuestions).toBe(1);
      expect(prog1.progressPercentage).toBe(33);
      expect(prog1.isComplete).toBe(false);
      expect(prog1.missingRequiredQuestionIds).toEqual(['q2']);

      // 2 of 3 answered (all required completed)
      const requiredCompleteAnswers: Record<string, Partial<TenantScopeAnswer>> = {
        q1: { answerBoolean: true },
        q2: { answerBoolean: false },
      };

      const prog2 = calculateQuestionnaireProgress(questions, requiredCompleteAnswers);
      expect(prog2.progressPercentage).toBe(67);
      expect(prog2.isComplete).toBe(true);
      expect(prog2.missingRequiredQuestionIds.length).toBe(0);
    });
  });

  // 5. Multi-Tenant Firestore Security Rules Isolation
  describe('Scope Answers Security Rules Isolation', () => {
    const now = new Date().toISOString();

    const sampleAnswer: TenantScopeAnswer = {
      id: 'q_gdpr_processes_personal_data',
      tenantId: tenantA,
      ownerId: userContributorA,
      questionnaireId: 'qnr_gdpr_privacy_scoping',
      questionId: 'q_gdpr_processes_personal_data',
      factKey: 'processes_personal_data',
      responseType: 'boolean',
      answerBoolean: true,
      answerString: null,
      answerNumber: null,
      answerArray: null,
      notes: 'Customer data in Postgres DB',
      answeredBy: userContributorA,
      answeredAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: userContributorA,
      updatedBy: userContributorA,
    };

    test('contributors must submit scope answers through a server command', async () => {
      const contribCtx = testEnv.authenticatedContext(userContributorA);
      const db = contribCtx.firestore();

      await assertFails(
        db.doc(`tenants/${tenantA}/scope_answers/q_gdpr_processes_personal_data`).set(sampleAnswer)
      );

      const snap = await db.doc(`tenants/${tenantA}/scope_answers/q_gdpr_processes_personal_data`).get();
      expect(snap.exists).toBe(false);
    });

    test('auditor in Tenant A can read but cannot create or modify scope answers', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/scope_answers/q_gdpr_processes_personal_data`).set({
          ...sampleAnswer,
          ownerId: userAdminA,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        });
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();

      // Read succeeds
      await assertSucceeds(db.doc(`tenants/${tenantA}/scope_answers/q_gdpr_processes_personal_data`).get());

      // Write fails
      await assertFails(
        db.doc(`tenants/${tenantA}/scope_answers/q_gdpr_processes_personal_data`).update({
          answerBoolean: false,
        })
      );
    });

    test('Tenant A user cannot read or submit scope answers under Tenant B partition', async () => {
      const contribCtxA = testEnv.authenticatedContext(userContributorA);
      const dbA = contribCtxA.firestore();

      // Tenant A cannot write to Tenant B answers
      await assertFails(
        dbA.doc(`tenants/${tenantB}/scope_answers/q_gdpr_processes_personal_data`).set({
          ...sampleAnswer,
          tenantId: tenantB,
        })
      );

      // Tenant A cannot read Tenant B answers
      await assertFails(
        dbA.doc(`tenants/${tenantB}/scope_answers/q_gdpr_processes_personal_data`).get()
      );
    });
  });
});

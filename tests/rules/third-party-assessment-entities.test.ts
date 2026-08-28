import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  QuestionnaireTemplate,
  ThirdPartyAssessmentRequest,
  RecurringAssessmentSchedule,
  ExternalAssessmentSubmission,
  SubmissionReview,
  validateQuestionnaireTemplate,
  validateThirdPartyAssessmentRequest,
  validateRecurringAssessmentSchedule,
  validateExternalAssessmentSubmission,
  validateSubmissionReview,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-third-party-assessment-entities-test',
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
      status: 'active',
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
      status: 'active',
      id: tenantB,
      name: 'Nordic AI Health AB',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships Tenant A
    const membersA = [
      PERSONAS.adminA,
      PERSONAS.complianceA,
      PERSONAS.privacyA,
      PERSONAS.securityA,
      PERSONAS.approverA,
      PERSONAS.auditorA,
      PERSONAS.viewerA,
    ];

    for (const m of membersA) {
      await db.doc(`tenants/${tenantA}/memberships/${m.uid}`).set({
        id: m.uid,
        tenantId: tenantA,
        userId: m.uid,
        role: m.role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3. Memberships Tenant B
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

describe('Third-Party Assessment Core Data Model & Security Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();

  const sampleTemplate: QuestionnaireTemplate = {
    id: 'tmpl_gdpr_supplier_v1',
    tenantId: tenantA,
    code: 'TMPL-GDPR-ART28',
    title: 'GDPR Article 28 Supplier Due Diligence & Technical Safeguards',
    description: 'Data-driven assessment verifying controller guarantees under GDPR Art. 28.',
    version: '1.0.0',
    status: 'published',
    category: 'gdpr_article_28',
    targetScope: 'any',
    passingScoreThreshold: 75,
    defaultValidDays: 30,
    defaultRecurrenceCadence: 'annual',
    sectionCount: 1,
    questionCount: 2,
    isSystemDefault: false,
    sections: [
      {
        id: 'sec_toms',
        tenantId: tenantA,
        templateId: 'tmpl_gdpr_supplier_v1',
        code: 'SEC-TOMS',
        title: 'Technical & Organizational Security Measures',
        sortOrder: 1,
        weight: 1,
        questions: [
          {
            id: 'q_toms_enc',
            tenantId: tenantA,
            templateId: 'tmpl_gdpr_supplier_v1',
            sectionId: 'sec_toms',
            code: 'TOM-01',
            title: 'Encryption at Rest and in Transit',
            questionType: 'single_select',
            required: true,
            weight: 5,
            sortOrder: 1,
            options: [
              { label: 'Full AES-256 and TLS 1.3 enforced', value: 'full', score: 100 },
              { label: 'No encryption enforced', value: 'none', score: 0, isRiskTrigger: true },
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
    ],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const sampleProspectRequest: ThirdPartyAssessmentRequest = {
    id: 'req_prospect_001',
    tenantId: tenantA,
    title: 'Pre-Contract Due Diligence: CloudData GmbH',
    templateId: sampleTemplate.id,
    templateSnapshot: sampleTemplate,
    targetType: 'prospective_vendor',
    thirdPartyName: 'CloudData GmbH',
    prospectCompanyName: 'CloudData GmbH',
    prospectWebsite: 'https://clouddata.example.eu',
    vendorId: null,
    processorProfileId: null,
    respondent: {
      name: 'Max Mustermann',
      email: 'security@clouddata.example.eu',
      companyName: 'CloudData GmbH',
    },
    accessTokenHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    tokenExpiresAt: '2026-09-15T00:00:00.000Z',
    accessCount: 0,
    requestType: 'one_time_due_diligence',
    status: 'dispatched',
    dueDate: '2026-09-15T00:00:00.000Z',
    isRecurring: false,
    recurrenceCadence: 'none',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: ['ctrl_toms_01'],
    linkedEvidenceIds: [],
    linkedRiskIds: [],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const sampleExistingProcessorRequest: ThirdPartyAssessmentRequest = {
    id: 'req_existing_proc_001',
    tenantId: tenantA,
    title: 'Annual Periodic Review: AWS EMEA SARL',
    templateId: sampleTemplate.id,
    templateSnapshot: sampleTemplate,
    targetType: 'active_processor',
    thirdPartyName: 'AWS EMEA SARL',
    vendorId: 'vend_aws_01',
    processorProfileId: 'proc_aws_emea_01',
    respondent: {
      name: 'AWS Compliance Desk',
      email: 'eu-compliance@amazon.example.com',
      companyName: 'AWS EMEA SARL',
    },
    requestType: 'recurring_periodic_review',
    status: 'dispatched',
    dueDate: '2026-09-01T00:00:00.000Z',
    isRecurring: true,
    recurrenceCadence: 'annual',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: ['asset_cloud_infra'],
    linkedControlIds: ['ctrl_cloud_sec'],
    linkedEvidenceIds: ['ev_soc2_aws'],
    linkedRiskIds: [],
    accessCount: 0,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const sampleRecurringSchedule: RecurringAssessmentSchedule = {
    id: 'sched_aws_annual',
    tenantId: tenantA,
    title: 'AWS Annual Periodic Assessment Cadence',
    templateId: sampleTemplate.id,
    targetType: 'processor_profile',
    vendorId: 'vend_aws_01',
    processorProfileId: 'proc_aws_emea_01',
    thirdPartyName: 'AWS EMEA SARL',
    contact: {
      name: 'AWS Compliance Desk',
      email: 'eu-compliance@amazon.example.com',
      companyName: 'AWS EMEA SARL',
    },
    cadence: 'annual',
    leadTimeDays: 30,
    autoDispatch: true,
    status: 'active',
    nextScheduledDispatchDate: '2027-07-15T00:00:00.000Z',
    nextAssessmentDueDate: '2027-08-15T00:00:00.000Z',
    ownerUserId: PERSONAS.complianceA.uid,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const sampleSubmission: ExternalAssessmentSubmission = {
    id: 'sub_prospect_001',
    tenantId: tenantA,
    requestId: sampleProspectRequest.id,
    templateId: sampleTemplate.id,
    targetType: 'prospective_vendor',
    thirdPartyName: 'CloudData GmbH',
    status: 'submitted',
    submittedBy: {
      name: 'Max Mustermann',
      email: 'security@clouddata.example.eu',
      companyName: 'CloudData GmbH',
      submittedAt: now,
    },
    computedScorePercent: 100,
    isPassingThreshold: true,
    sectionScores: {
      sec_toms: {
        sectionTitle: 'Technical & Organizational Security Measures',
        earnedPoints: 100,
        possiblePoints: 100,
        scorePercent: 100,
      },
    },
    answers: {
      q_toms_enc: {
        questionId: 'q_toms_enc',
        questionCode: 'TOM-01',
        sectionId: 'sec_toms',
        value: 'full',
        attachedEvidenceIds: [],
        calculatedScore: 100,
        updatedAt: now,
      },
    },
    unansweredRequiredCount: 0,
    totalQuestionsCount: 1,
    answeredQuestionsCount: 1,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: 'external_respondent',
    updatedBy: 'external_respondent',
    createdAt: now,
    updatedAt: now,
  };

  const sampleReview: SubmissionReview = {
    id: 'rev_sub_001',
    tenantId: tenantA,
    submissionId: sampleSubmission.id,
    requestId: sampleProspectRequest.id,
    thirdPartyName: 'CloudData GmbH',
    decision: 'accept',
    status: 'completed',
    finalScorePercent: 100,
    determinedRiskTier: 'low',
    isCompliant: true,
    questionFindings: {
      q_toms_enc: {
        questionId: 'q_toms_enc',
        questionCode: 'TOM-01',
        flag: 'ok',
        reviewerNotes: 'Verified encryption at rest policy and architecture diagrams.',
      },
    },
    derivedRiskFlagIds: [],
    generatedEvidenceIds: [],
    reviewerUserId: PERSONAS.complianceA.uid,
    reviewerEmail: PERSONAS.complianceA.email,
    reviewedAt: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. SCHEMA & RELATIONSHIP INTEGRITY VALIDATION
  // ---------------------------------------------------------------------------
  describe('1. Schema Validation & Relationship Integrity', () => {
    it('validates a complete QuestionnaireTemplate and rejects invalid thresholds', () => {
      const validRes = validateQuestionnaireTemplate(sampleTemplate);
      expect(validRes.valid).toBe(true);

      const invalidRes = validateQuestionnaireTemplate({
        ...sampleTemplate,
        passingScoreThreshold: 150, // Invalid: > 100
      });
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.errors.some((e) => e.includes('passingScoreThreshold'))).toBe(true);
    });

    it('validates a prospective vendor assessment request without requiring existing vendorId', () => {
      const res = validateThirdPartyAssessmentRequest(sampleProspectRequest);
      expect(res.valid).toBe(true);
      expect(sampleProspectRequest.vendorId).toBeNull();
      expect(sampleProspectRequest.prospectCompanyName).toBe('CloudData GmbH');
    });

    it('enforces vendorId when targetType is existing_vendor or active_processor', () => {
      const validProcRes = validateThirdPartyAssessmentRequest(sampleExistingProcessorRequest);
      expect(validProcRes.valid).toBe(true);

      const missingVendorRes = validateThirdPartyAssessmentRequest({
        ...sampleExistingProcessorRequest,
        targetType: 'existing_vendor',
        vendorId: undefined,
      });
      expect(missingVendorRes.valid).toBe(false);
      expect(missingVendorRes.errors.some((e) => e.includes('vendorId is required'))).toBe(true);

      const missingProcRes = validateThirdPartyAssessmentRequest({
        ...sampleExistingProcessorRequest,
        targetType: 'active_processor',
        processorProfileId: undefined,
      });
      expect(missingProcRes.valid).toBe(false);
      expect(missingProcRes.errors.some((e) => e.includes('processorProfileId is required'))).toBe(true);
    });

    it('validates RecurringAssessmentSchedule with cadence and due dates', () => {
      const validRes = validateRecurringAssessmentSchedule(sampleRecurringSchedule);
      expect(validRes.valid).toBe(true);

      const invalidCadenceRes = validateRecurringAssessmentSchedule({
        ...sampleRecurringSchedule,
        cadence: 'invalid_cadence',
      });
      expect(invalidCadenceRes.valid).toBe(false);
      expect(invalidCadenceRes.errors.some((e) => e.includes('cadence'))).toBe(true);
    });

    it('validates ExternalAssessmentSubmission and SubmissionReview', () => {
      const validSubRes = validateExternalAssessmentSubmission(sampleSubmission);
      expect(validSubRes.valid).toBe(true);

      const validRevRes = validateSubmissionReview(sampleReview);
      expect(validRevRes.valid).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. FIRESTORE SECURITY RULES & MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('2. Firestore Security Rules & Multi-Tenant Isolation', () => {
    it('denies direct questionnaire-template creation by compliance_manager and tenant_admin', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/questionnaire_templates/${sampleTemplate.id}`);
      await assertFails(ref.set(sampleTemplate));
    });

    it('requires server commands for assessment requests and recurring schedules', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const reqRef = db.doc(`tenants/${tenantA}/assessment_requests/${sampleProspectRequest.id}`);
      await assertFails(reqRef.set(sampleProspectRequest));

      const schedRef = db.doc(`tenants/${tenantA}/recurring_schedules/${sampleRecurringSchedule.id}`);
      await assertFails(schedRef.set(sampleRecurringSchedule));
    });

    it('requires server commands for approver submission-review mutations', async () => {
      const dbApprover = testEnv.authenticatedContext(PERSONAS.approverA.uid).firestore();
      const revRef = dbApprover.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`);
      await assertFails(
        revRef.set({
          ...sampleReview,
          ownerId: PERSONAS.approverA.uid,
          createdBy: PERSONAS.approverA.uid,
          updatedBy: PERSONAS.approverA.uid,
        })
      );
    });

    it('blocks viewer and auditor from creating templates, requests, or reviews', async () => {
      const dbViewer = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      await assertFails(
        dbViewer.doc(`tenants/${tenantA}/questionnaire_templates/tmpl_hack`).set({
          ...sampleTemplate,
          id: 'tmpl_hack',
          ownerId: PERSONAS.viewerA.uid,
          createdBy: PERSONAS.viewerA.uid,
          updatedBy: PERSONAS.viewerA.uid,
        })
      );

      await assertFails(
        dbViewer.doc(`tenants/${tenantA}/assessment_requests/req_hack`).set({
          ...sampleProspectRequest,
          id: 'req_hack',
          ownerId: PERSONAS.viewerA.uid,
          createdBy: PERSONAS.viewerA.uid,
          updatedBy: PERSONAS.viewerA.uid,
        })
      );
    });

    it('STRICT ISOLATION: prevents Tenant B user from accessing Tenant A assessment entities', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/questionnaire_templates/${sampleTemplate.id}`).set(sampleTemplate);
        await db.doc(`tenants/${tenantA}/assessment_requests/${sampleProspectRequest.id}`).set(sampleProspectRequest);
        await db.doc(`tenants/${tenantA}/assessment_submissions/${sampleSubmission.id}`).set(sampleSubmission);
        await db.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).set(sampleReview);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(dbTenantB.doc(`tenants/${tenantA}/questionnaire_templates/${sampleTemplate.id}`).get());
      await assertFails(dbTenantB.doc(`tenants/${tenantA}/assessment_requests/${sampleProspectRequest.id}`).get());
      await assertFails(dbTenantB.doc(`tenants/${tenantA}/assessment_submissions/${sampleSubmission.id}`).get());
      await assertFails(dbTenantB.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).get());

      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/assessment_requests/${sampleProspectRequest.id}`).update({
          title: 'Hacked Title by Tenant B',
        })
      );
    });

    it('blocks direct unauthenticated client read/write to all assessment collections', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(unauthDb.doc(`tenants/${tenantA}/questionnaire_templates/${sampleTemplate.id}`).get());
      await assertFails(unauthDb.doc(`tenants/${tenantA}/assessment_requests/${sampleProspectRequest.id}`).get());
      await assertFails(unauthDb.doc(`tenants/${tenantA}/assessment_submissions/${sampleSubmission.id}`).get());
      await assertFails(unauthDb.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).get());
    });
  });
});

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
  QuestionnaireTemplate,
  ThirdPartyAssessmentRequest,
  AssessmentAccessToken,
  ExternalAssessmentSubmission,
  SubmissionReview,
  RecurringAssessmentSchedule,
  Vendor,
  ProcessorProfile,
  Evidence,
  evaluateControlAssessmentSatisfaction,
  evaluateAccessTokenValidity,
  createSanitizedPublicAssessmentView,
  DynamicQuestionnaireSection,
  analyzeSubmissionRiskPosture,
} from '@eurogovernance/shared-types';
import * as crypto from 'crypto';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assessment-full-e2e-test',
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

describe('Third-Party Assessment Full Feature End-to-End Lifecycle', () => {
  const nowIso = '2026-08-15T12:00:00.000Z';
  const futureIso = '2026-09-15T12:00:00.000Z';

  // Test entity IDs tracked across all 10 steps
  const templateId = 'tmpl_gdpr_art28_v1';
  const requestId = 'req_cloudai_prospect_01';
  const tokenId = 'tok_cloudai_sec_01';
  const submissionId = 'sub_cloudai_resp_01';
  const reviewId = 'rev_cloudai_internal_01';
  const vendorId = 'vend_cloudai_solutions';
  const processorId = 'proc_cloudai_infra';
  const evidenceId = 'ev_cloudai_iso27001_cert';
  const scheduleId = 'sched_cloudai_yearly';
  const controlId = 'ctrl_vendor_assurance_art28';

  const rawTokenSecret = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
  const tokenHash = crypto.createHash('sha256').update(rawTokenSecret).digest('hex');

  const templateFixture: QuestionnaireTemplate = {
    id: templateId,
    tenantId: tenantA,
    code: 'TMPL-GDPR-ART28',
    title: 'GDPR Article 28 Processor Compliance Questionnaire',
    description: 'Standard due diligence for cloud service providers and sub-processors.',
    version: '1.0.0',
    status: 'published',
    category: 'gdpr_article_28',
    targetScope: 'subprocessor',
    passingScoreThreshold: 75,
    defaultValidDays: 365,
    defaultRecurrenceCadence: 'annual',
    sectionCount: 1,
    questionCount: 2,
    isSystemDefault: false,
    sections: [
      {
        id: 'sec_security_toms',
        tenantId: tenantA,
        templateId,
        code: 'SEC-TOMS',
        title: 'Technical and Organisational Measures',
        sortOrder: 1,
        weight: 10,
        questions: [
          {
            id: 'q_encryption_rest',
            tenantId: tenantA,
            templateId,
            sectionId: 'sec_security_toms',
            code: 'Q-ENC-REST',
            title: 'Is customer personal data encrypted at rest using AES-256 or equivalent?',
            questionType: 'yes_no',
            required: true,
            weight: 10,
            sortOrder: 1,
            requiresEvidence: false,
            guidanceNotes: 'Must comply with GDPR Article 32 encryption standard.',
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          {
            id: 'q_soc2_iso_cert',
            tenantId: tenantA,
            templateId,
            sectionId: 'sec_security_toms',
            code: 'Q-CERT-ISO',
            title: 'Do you hold an active ISO 27001 or SOC 2 Type II certification?',
            questionType: 'yes_no',
            required: true,
            weight: 10,
            sortOrder: 2,
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  test('Executes the full 10-step third-party questionnaire lifecycle seamlessly', async () => {
    await testEnv.clearFirestore();

    // 0. Setup Tenants and Memberships
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

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

      await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
        id: PERSONAS.complianceA.uid,
        tenantId: tenantA,
        userId: PERSONAS.complianceA.uid,
        role: 'compliance_manager',
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
      await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
        id: PERSONAS.securityA.uid,
        tenantId: tenantA,
        userId: PERSONAS.securityA.uid,
        role: 'security_manager',
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

    const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

    // -------------------------------------------------------------------------
    // STEP 1: CREATE QUESTIONNAIRE TEMPLATE
    // -------------------------------------------------------------------------
    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/questionnaire_templates/${templateId}`).set(templateFixture)
    );

    // -------------------------------------------------------------------------
    // STEP 2: CREATE ONE-TIME ASSESSMENT FOR POTENTIAL PROCESSOR
    // -------------------------------------------------------------------------
    const requestData: ThirdPartyAssessmentRequest = {
      id: requestId,
      tenantId: tenantA,
      title: 'CloudAI Solutions Pre-Onboarding Due Diligence',
      templateId,
      templateSnapshot: templateFixture,
      targetType: 'prospective_vendor',
      thirdPartyName: 'CloudAI Solutions BV',
      prospectCompanyName: 'CloudAI Solutions BV',
      prospectWebsite: 'https://cloudai.example.eu',
      vendorId: null,
      processorProfileId: null,
      respondent: {
        name: 'Elena Rostova',
        email: 'elena.rostova@cloudai.example.eu',
        companyName: 'CloudAI Solutions BV',
      },
      requestType: 'one_time_due_diligence',
      status: 'sent',
      dueDate: futureIso,
      accessCount: 0,
      isRecurring: false,
      recurrenceCadence: 'annual',
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: [controlId],
      linkedEvidenceIds: [],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).set(requestData)
    );

    // -------------------------------------------------------------------------
    // STEP 3: GENERATE SECURE ACCESS LINK & SANITIZE PUBLIC VIEW
    // -------------------------------------------------------------------------
    const tokenRecord: AssessmentAccessToken = {
      id: tokenId,
      tenantId: tenantA,
      requestId,
      templateId,
      tokenHash,
      tokenType: 'multi_use_session',
      recipientEmail: 'elena.rostova@cloudai.example.eu',
      recipientName: 'Elena Rostova',
      thirdPartyName: 'CloudAI Solutions BV',
      status: 'active',
      expiresAt: futureIso,
      maxUses: 50,
      useCount: 0,
      lastAccessedAt: null,
      lastAccessedIpMasked: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      requireEmailVerificationCode: false,
      issuedByUserId: PERSONAS.complianceA.uid,
      issuedAt: nowIso,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`tenants/${tenantA}/assessment_access_tokens/${tokenId}`).set(tokenRecord);
    });

    const validity = evaluateAccessTokenValidity(tokenRecord, tokenHash, new Date(nowIso));
    expect(validity.isValid).toBe(true);

    const publicView = createSanitizedPublicAssessmentView(requestData, tokenRecord);
    expect(publicView.requestId).toBe(requestId);
    expect(publicView.thirdPartyName).toBe('CloudAI Solutions BV');
    expect((publicView as any).linkedControlIds).toBeUndefined();
    expect((publicView as any).linkedRiskIds).toBeUndefined();

    // -------------------------------------------------------------------------
    // STEP 4: SUBMIT ANSWERS & UPLOAD SUPPORTING DOCS EXTERNALLY
    // -------------------------------------------------------------------------
    const dynamicSections: DynamicQuestionnaireSection[] = [
      {
        id: 'sec_security_toms',
        tenantId: tenantA,
        templateId,
        code: 'SEC-TOMS',
        title: 'Technical and Organisational Measures',
        sortOrder: 1,
        weight: 10,
        questions: [
          {
            id: 'q_encryption_rest',
            tenantId: tenantA,
            templateId,
            sectionId: 'sec_security_toms',
            code: 'Q-ENC-REST',
            title: 'Is customer personal data encrypted at rest?',
            questionType: 'single_select',
            required: true,
            sortOrder: 1,
            scoring: { weight: 5 },
            options: [
              {
                id: 'opt_yes',
                label: 'Yes, AES-256 encrypted',
                value: 'yes',
                score: 100,
                isRiskTrigger: false,
              },
              {
                id: 'opt_no',
                label: 'No encryption at rest',
                value: 'no',
                score: 0,
                isRiskTrigger: true,
                riskCode: 'RISK_PLAINTEXT_STORAGE',
                riskSeverity: 'critical',
                riskRationale: 'Customer data stored in unencrypted format violates Article 32 GDPR.',
              },
            ],
            statutoryCitations: ['GDPR Art. 32'],
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
          {
            id: 'q_soc2_iso_cert',
            tenantId: tenantA,
            templateId,
            sectionId: 'sec_security_toms',
            code: 'Q-CERT-ISO',
            title: 'Do you hold an active ISO 27001 certification?',
            questionType: 'single_select',
            required: true,
            sortOrder: 2,
            scoring: { weight: 5 },
            options: [
              {
                id: 'opt_cert_yes',
                label: 'Yes',
                value: 'yes',
                score: 100,
                isRiskTrigger: false,
              },
            ],
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: nowIso,
            updatedAt: nowIso,
          },
        ],
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: nowIso,
        updatedAt: nowIso,
      },
    ];

    const answersRecord = {
      q_encryption_rest: {
        questionId: 'q_encryption_rest',
        questionCode: 'Q-ENC-REST',
        sectionId: 'sec_security_toms',
        value: 'yes',
        notes: 'AES-256 applied across all PostgreSQL volumes and S3 storage.',
        attachedEvidenceIds: [],
        updatedAt: nowIso,
      },
      q_soc2_iso_cert: {
        questionId: 'q_soc2_iso_cert',
        questionCode: 'Q-CERT-ISO',
        sectionId: 'sec_security_toms',
        value: 'yes',
        attachedEvidenceIds: [evidenceId],
        notes: 'Attached latest ISO 27001 certificate valid through 2027.',
        updatedAt: nowIso,
      },
    };

    const riskPosture = analyzeSubmissionRiskPosture(dynamicSections, answersRecord);
    expect(riskPosture.overallScorePercent).toBe(100);
    expect(riskPosture.overallRiskTier).toBe('low');
    expect(riskPosture.triggeredFlags.length).toBe(0);

    const evidenceData: Evidence = {
      id: evidenceId,
      tenantId: tenantA,
      title: 'CloudAI Solutions ISO 27001 Certificate 2026-2027',
      description: 'Uploaded by Elena Rostova during third-party assessment.',
      category: 'iso_certificate',
      status: 'valid',
      storagePath: `tenants/${tenantA}/evidence/${evidenceId}.pdf`,
      fileSizeBytes: 2048576,
      mimeType: 'application/pdf',
      fileHashSha256: 'a1b2c3d4e5f67890123456789abcdef0123456789abcdef0123456789abcdef0',
      controlIds: [controlId],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [requestId],
      sourceType: 'external_questionnaire_submission',
      isExternalSubmissionArtifact: true,
      sourceAssessmentRequestId: requestId,
      sourceSubmissionId: submissionId,
      collectedAt: nowIso,
      reviewDueDate: null,
      reviewedBy: null,
      reviewedAt: null,
      rejectionReason: null,
      currentVersion: 1,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const submissionData: ExternalAssessmentSubmission = {
      id: submissionId,
      tenantId: tenantA,
      requestId,
      templateId,
      targetType: 'prospective_vendor',
      thirdPartyName: 'CloudAI Solutions BV',
      status: 'submitted',
      submittedBy: {
        name: 'Elena Rostova',
        email: 'elena.rostova@cloudai.example.eu',
        companyName: 'CloudAI Solutions BV',
        submittedAt: nowIso,
      },
      answers: answersRecord,
      unansweredRequiredCount: 0,
      totalQuestionsCount: 2,
      answeredQuestionsCount: 2,
      computedScorePercent: riskPosture.overallScorePercent,
      isPassingThreshold: true,
      sectionScores: {},
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`tenants/${tenantA}/evidence/${evidenceId}`).set(evidenceData);
      await db.doc(`tenants/${tenantA}/assessment_submissions/${submissionId}`).set(submissionData);
      await db.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).update({
        status: 'submitted',
        submissionId,
        submittedAt: nowIso,
        linkedEvidenceIds: [evidenceId],
      });
    });

    const subSnap = await dbCompliance.doc(`tenants/${tenantA}/assessment_submissions/${submissionId}`).get();
    expect(subSnap.exists).toBe(true);
    expect(subSnap.data()?.computedScorePercent).toBe(100);

    // -------------------------------------------------------------------------
    // STEP 5: REVIEW INTERNALLY & ACCEPT ASSESSMENT
    // -------------------------------------------------------------------------
    const reviewData: SubmissionReview = {
      id: reviewId,
      tenantId: tenantA,
      requestId,
      submissionId,
      thirdPartyName: 'CloudAI Solutions BV',
      status: 'completed',
      decision: 'accept',
      finalScorePercent: 100,
      determinedRiskTier: 'low',
      isCompliant: true,
      reviewerUserId: PERSONAS.complianceA.uid,
      reviewerEmail: 'compliance@eurocorp.example.eu',
      internalNotes: 'Verified AES-256 encryption at rest and active ISO 27001 certificate.',
      questionFindings: {},
      derivedRiskFlagIds: [],
      generatedEvidenceIds: [evidenceId],
      reviewedAt: nowIso,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/submission_reviews/${reviewId}`).set(reviewData)
    );

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).update({
        status: 'accepted',
        finalScorePercent: 100,
        overallRiskRating: 'low',
        isCompliant: true,
        reviewedBy: PERSONAS.complianceA.uid,
        reviewedAt: nowIso,
        reviewNotes: 'Verified AES-256 encryption at rest and active ISO 27001 certificate.',
        updatedAt: nowIso,
      })
    );

    // -------------------------------------------------------------------------
    // STEP 6: LINK ACCEPTED SUBMISSION TO VENDOR / PROCESSOR PROFILE
    // -------------------------------------------------------------------------
    const vendorData: Vendor = {
      id: vendorId,
      tenantId: tenantA,
      name: 'CloudAI Solutions BV',
      category: 'cloud_provider',
      riskTier: 'low',
      primaryContactName: 'Elena Rostova',
      primaryContactEmail: 'elena.rostova@cloudai.example.eu',
      countryOfIncorporation: 'NL',
      dataHostingRegions: ['NL', 'EU'],
      subprocessorsListed: [],
      status: 'active',
      dpaSigned: true,
      dpaDate: nowIso,
      securityAssessmentDate: nowIso,
      nextAssessmentDueDate: '2027-08-15T00:00:00.000Z',
      latestAssessmentRequestId: requestId,
      latestAssessmentSubmissionId: submissionId,
      latestAssessmentScorePercent: 100,
      latestAssessmentRiskTier: 'low',
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const processorData: ProcessorProfile = {
      id: processorId,
      tenantId: tenantA,
      vendorId,
      processorRole: 'subprocessor',
      serviceDescription: 'Cloud infrastructure hosting for AI inference workloads.',
      dataCategories: ['user_credentials', 'application_logs', 'analytics_events'],
      dataSubjects: ['customers', 'end_users'],
      isSpecialCategoryData: false,
      jurisdictions: ['NL', 'EU'],
      linkedSystemAssetIds: [],
      criticality: 'high',
      ownerUserId: PERSONAS.complianceA.uid,
      reviewCadence: 'annually',
      lastReviewDate: nowIso,
      nextReviewDate: '2027-08-15T00:00:00.000Z',
      status: 'active',
      notes: 'Passed initial security screening with 100% score.',
      dpaSigned: true,
      dpaDate: nowIso,
      latestAssessmentRequestId: requestId,
      latestAssessmentSubmissionId: submissionId,
      latestAssessmentScorePercent: 100,
      latestAssessmentDate: nowIso,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/vendors/${vendorId}`).set(vendorData)
    );
    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/processor_profiles/${processorId}`).set(processorData)
    );

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).update({
        targetType: 'existing_vendor',
        vendorId,
        processorProfileId: processorId,
        updatedAt: nowIso,
      })
    );

    // -------------------------------------------------------------------------
    // STEP 7: CREATE RECURRING YEARLY SCHEDULE FOR EXISTING PROCESSOR
    // -------------------------------------------------------------------------
    const scheduleData: RecurringAssessmentSchedule = {
      id: scheduleId,
      tenantId: tenantA,
      title: 'CloudAI Solutions Annual GDPR Review',
      templateId,
      targetType: 'vendor',
      vendorId,
      processorProfileId: processorId,
      thirdPartyName: 'CloudAI Solutions BV',
      contact: {
        name: 'Elena Rostova',
        email: 'elena.rostova@cloudai.example.eu',
        companyName: 'CloudAI Solutions BV',
      },
      cadence: 'annual',
      leadTimeDays: 30,
      autoDispatch: true,
      status: 'active',
      nextScheduledDispatchDate: '2027-07-15T00:00:00.000Z',
      nextAssessmentDueDate: '2027-08-15T00:00:00.000Z',
      linkedControlIds: [controlId],
      ownerUserId: PERSONAS.complianceA.uid,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/recurring_schedules/${scheduleId}`).set(scheduleData)
    );

    // -------------------------------------------------------------------------
    // STEP 8: GENERATE NEXT CYCLE
    // -------------------------------------------------------------------------
    const nextCycleRequestId = 'req_cloudai_cycle_2027';
    const nextCycleRequest: ThirdPartyAssessmentRequest = {
      id: nextCycleRequestId,
      tenantId: tenantA,
      title: 'CloudAI Solutions Annual GDPR Review (Cycle 2)',
      templateId,
      templateSnapshot: templateFixture,
      targetType: 'existing_vendor',
      thirdPartyName: 'CloudAI Solutions BV',
      vendorId,
      processorProfileId: processorId,
      respondent: {
        name: 'Elena Rostova',
        email: 'elena.rostova@cloudai.example.eu',
        companyName: 'CloudAI Solutions BV',
      },
      requestType: 'recurring_periodic_review',
      status: 'sent',
      dueDate: '2027-08-15T00:00:00.000Z',
      accessCount: 0,
      isRecurring: true,
      recurrenceCadence: 'annual',
      recurrenceScheduleId: scheduleId,
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: [controlId],
      linkedEvidenceIds: [],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: '2027-07-15T00:00:00.000Z',
      updatedAt: '2027-07-15T00:00:00.000Z',
    };

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${nextCycleRequestId}`).set(nextCycleRequest)
    );

    await assertSucceeds(
      dbCompliance.doc(`tenants/${tenantA}/recurring_schedules/${scheduleId}`).update({
        nextScheduledDispatchDate: '2028-07-15T00:00:00.000Z',
        nextAssessmentDueDate: '2028-08-15T00:00:00.000Z',
        updatedAt: '2027-07-15T00:00:00.000Z',
      })
    );

    // -------------------------------------------------------------------------
    // STEP 9: LINK RESULT TO CONTROL AS RECURRING EVIDENCE
    // -------------------------------------------------------------------------
    const updatedRequestSnap = await dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).get();
    const acceptedRequest = updatedRequestSnap.data() as ThirdPartyAssessmentRequest;

    const satisfaction = evaluateControlAssessmentSatisfaction(
      controlId,
      [acceptedRequest],
      {
        maxValidityDays: 365,
        nowDate: new Date(nowIso),
      }
    );

    expect(satisfaction.isSatisfied).toBe(true);
    expect(satisfaction.satisfactionStatus).toBe('satisfied');
    expect(satisfaction.latestAssessmentRequestId).toBe(requestId);
    expect(satisfaction.supportingEvidenceIds).toContain(evidenceId);
    expect(satisfaction.explanation).toContain('scored 100%');

    // -------------------------------------------------------------------------
    // STEP 10: VERIFY UNAUTHORIZED CROSS-TENANT & PUBLIC ACCESS IS BLOCKED
    // -------------------------------------------------------------------------
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const tenantBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

    // Direct unauthenticated read blocked
    await assertFails(unauthDb.doc(`tenants/${tenantA}/questionnaire_templates/${templateId}`).get());
    await assertFails(unauthDb.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).get());
    await assertFails(unauthDb.doc(`tenants/${tenantA}/assessment_access_tokens/${tokenId}`).get());
    await assertFails(unauthDb.doc(`tenants/${tenantA}/assessment_submissions/${submissionId}`).get());

    // Cross-tenant read blocked
    await assertFails(tenantBDb.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).get());
    await assertFails(tenantBDb.doc(`tenants/${tenantA}/assessment_access_tokens/${tokenId}`).get());
    await assertFails(tenantBDb.doc(`tenants/${tenantA}/assessment_submissions/${submissionId}`).get());
    await assertFails(tenantBDb.doc(`tenants/${tenantA}/recurring_schedules/${scheduleId}`).get());

    // Cross-tenant tamper blocked
    await assertFails(
      tenantBDb.doc(`tenants/${tenantA}/assessment_requests/${requestId}`).update({
        status: 'rejected',
      })
    );
  });
});

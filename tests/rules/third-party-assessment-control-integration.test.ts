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
  Control,
  RecurringAssessmentSchedule,
  ThirdPartyAssessmentRequest,
  ExternalAssessmentSubmission,
  SubmissionReview,
  Evidence,
  evaluateControlAssessmentSatisfaction,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-control-integration-test',
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

describe('Third-Party Assessment Control Integration Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();

  const vendorControl: Control = {
    id: 'ctrl_vendor_assurance_01',
    tenantId: tenantA,
    masterControlId: null,
    code: 'A.15.1.1',
    title: 'Information Security Policy for Supplier Relationships',
    description: 'Information security requirements for mitigating the risks associated with supplier access.',
    domain: 'Supplier Relationships',
    frameworkIds: ['iso_27001_2022', 'gdpr'],
    requirementIds: ['req_iso_a15_1'],
    status: 'implemented',
    healthScore: 100,
    enforcementMechanism: 'hybrid',
    reviewFrequencyDays: 365,
    lastReviewDate: now,
    nextReviewDate: futureIso,
    implementationNotes: 'Satisfied by recurring yearly vendor questionnaires and ISO 27001 certificate audits.',
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const annualSchedule: RecurringAssessmentSchedule = {
    id: 'sched_auth0_annual',
    tenantId: tenantA,
    title: 'Auth0 Annual Supplier Security Review',
    templateId: 'tmpl_gdpr_art28',
    targetType: 'vendor',
    vendorId: 'vend_auth0_eu',
    thirdPartyName: 'Auth0 / Okta Ireland Ltd',
    contact: {
      name: 'Auth0 Security Officer',
      email: 'dpo@auth0.example.com',
      companyName: 'Auth0 / Okta Ireland Ltd',
    },
    cadence: 'annual',
    leadTimeDays: 30,
    autoDispatch: true,
    status: 'active',
    lastAssessmentRequestId: 'req_auth0_2026',
    lastAssessmentCompletedAt: now,
    nextScheduledDispatchDate: '2027-07-15T00:00:00.000Z',
    nextAssessmentDueDate: '2027-08-15T00:00:00.000Z',
    linkedControlIds: [vendorControl.id],
    ownerUserId: PERSONAS.complianceA.uid,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const assessmentRequest: ThirdPartyAssessmentRequest = {
    id: 'req_auth0_2026',
    tenantId: tenantA,
    title: 'Auth0 2026 Annual Supplier Assurance Review',
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
      sectionCount: 1,
      questionCount: 2,
      isSystemDefault: true,
      sections: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
    },
    targetType: 'existing_vendor',
    thirdPartyName: 'Auth0 / Okta Ireland Ltd',
    vendorId: 'vend_auth0_eu',
    processorProfileId: 'proc_auth0_01',
    respondent: {
      name: 'Auth0 Security Officer',
      email: 'dpo@auth0.example.com',
      companyName: 'Auth0 / Okta Ireland Ltd',
    },
    accessTokenHash: 'hash_xyz',
    tokenExpiresAt: futureIso,
    accessCount: 1,
    requestType: 'recurring_periodic_review',
    status: 'accepted',
    dueDate: futureIso,
    isRecurring: true,
    recurrenceCadence: 'annual',
    recurrenceScheduleId: annualSchedule.id,
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: [vendorControl.id],
    linkedEvidenceIds: ['ev_auth0_iso27001'],
    linkedRiskIds: [],
    activeSubmissionId: 'sub_auth0_2026',
    finalScorePercent: 98,
    isCompliant: true,
    overallRiskRating: 'low',
    reviewedBy: PERSONAS.complianceA.uid,
    reviewedAt: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const assessmentSubmission: ExternalAssessmentSubmission = {
    id: 'sub_auth0_2026',
    tenantId: tenantA,
    requestId: assessmentRequest.id,
    templateId: 'tmpl_gdpr_art28',
    targetType: 'existing_vendor',
    vendorId: 'vend_auth0_eu',
    processorProfileId: 'proc_auth0_01',
    thirdPartyName: 'Auth0 / Okta Ireland Ltd',
    status: 'reviewed',
    submittedBy: {
      name: 'Auth0 Security Officer',
      email: 'dpo@auth0.example.com',
      companyName: 'Auth0 / Okta Ireland Ltd',
      submittedAt: now,
    },
    computedScorePercent: 98,
    isPassingThreshold: true,
    sectionScores: {},
    answers: {},
    unansweredRequiredCount: 0,
    totalQuestionsCount: 2,
    answeredQuestionsCount: 2,
    ipAddressMasked: '192.168.***.***',
    userAgent: null,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: 'external_respondent',
    updatedBy: 'external_respondent',
    createdAt: now,
    updatedAt: now,
  };

  const submissionReview: SubmissionReview = {
    id: 'rev_auth0_2026',
    tenantId: tenantA,
    status: 'completed',
    submissionId: assessmentSubmission.id,
    requestId: assessmentRequest.id,
    vendorId: 'vend_auth0_eu',
    processorProfileId: 'proc_auth0_01',
    thirdPartyName: 'Auth0 / Okta Ireland Ltd',
    decision: 'accept',
    finalScorePercent: 98,
    determinedRiskTier: 'low',
    isCompliant: true,
    rejectionReason: null,
    revisionInstructions: null,
    internalNotes: 'Annual ISO 27001 validation passed.',
    remediationActionPlan: null,
    questionFindings: {},
    derivedRiskFlagIds: [],
    generatedEvidenceIds: ['ev_auth0_iso27001'],
    reviewerUserId: PERSONAS.complianceA.uid,
    reviewerEmail: 'compliance-manager@eurocorp.example.eu',
    reviewedAt: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const attachedEvidence: Evidence = {
    id: 'ev_auth0_iso27001',
    tenantId: tenantA,
    title: 'Auth0 ISO 27001:2022 Certificate',
    description: 'Supporting evidence for supplier assurance control A.15.1.1',
    category: 'iso_certificate',
    status: 'valid',
    storagePath: 'evidence/auth0_iso27001.pdf',
    fileSizeBytes: 280000,
    mimeType: 'application/pdf',
    fileHashSha256: 'hash_iso_2026',
    controlIds: [vendorControl.id],
    requirementIds: [],
    policyIds: [],
    riskIds: [],
    assessmentIds: [assessmentRequest.id],
    vendorIds: ['vend_auth0_eu'],
    collectedAt: now,
    reviewDueDate: futureIso,
    reviewedBy: PERSONAS.complianceA.uid,
    reviewedAt: now,
    rejectionReason: null,
    currentVersion: 1,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: 'external_respondent',
    updatedBy: 'external_respondent',
    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. CONTROL LINKAGE & RECURRING SATISFACTION
  // ---------------------------------------------------------------------------
  describe('1. Control Satisfaction Evaluation via Completed Questionnaires', () => {
    it('evaluates control as SATISFIED when valid accepted assessment is linked', () => {
      const satisfaction = evaluateControlAssessmentSatisfaction(
        vendorControl.id,
        [assessmentRequest],
        { maxValidityDays: 365, nowDate: new Date(now) }
      );

      expect(satisfaction.isSatisfied).toBe(true);
      expect(satisfaction.satisfactionStatus).toBe('satisfied');
      expect(satisfaction.latestAssessmentRequestId).toBe(assessmentRequest.id);
      expect(satisfaction.latestAssessmentScorePercent).toBe(98);
      expect(satisfaction.supportingVendorNames).toContain('Auth0 / Okta Ireland Ltd');
      expect(satisfaction.supportingEvidenceIds).toContain('ev_auth0_iso27001');
    });

    it('evaluates control as UNDER_REVIEW when latest submission is not yet accepted', () => {
      const pendingRequest: ThirdPartyAssessmentRequest = {
        ...assessmentRequest,
        id: 'req_auth0_pending',
        status: 'under_review',
        reviewedAt: null,
      };

      const satisfaction = evaluateControlAssessmentSatisfaction(
        vendorControl.id,
        [pendingRequest],
        { maxValidityDays: 365, nowDate: new Date(now) }
      );

      expect(satisfaction.isSatisfied).toBe(false);
      expect(satisfaction.satisfactionStatus).toBe('under_review');
    });

    it('evaluates control as EXPIRED when accepted assessment exceeds validity period (365 days)', () => {
      const pastAssessment: ThirdPartyAssessmentRequest = {
        ...assessmentRequest,
        id: 'req_auth0_old',
        reviewedAt: '2024-01-01T00:00:00.000Z',
      };

      const satisfaction = evaluateControlAssessmentSatisfaction(
        vendorControl.id,
        [pastAssessment],
        { maxValidityDays: 365, nowDate: new Date('2026-08-15T00:00:00.000Z') }
      );

      expect(satisfaction.isSatisfied).toBe(false);
      expect(satisfaction.satisfactionStatus).toBe('expired');
      expect(satisfaction.isExpired).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. END-TO-END TRACEABILITY
  // ---------------------------------------------------------------------------
  describe('2. End-to-End Control-to-Evidence Traceability', () => {
    it('preserves full lineage: Control -> Schedule -> Request -> Submission -> Review -> Evidence in Firestore', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/controls/${vendorControl.id}`).set(vendorControl);
        await db.doc(`tenants/${tenantA}/recurring_schedules/${annualSchedule.id}`).set(annualSchedule);
        await db.doc(`tenants/${tenantA}/assessment_requests/${assessmentRequest.id}`).set(assessmentRequest);
        await db.doc(`tenants/${tenantA}/assessment_submissions/${assessmentSubmission.id}`).set(assessmentSubmission);
        await db.doc(`tenants/${tenantA}/submission_reviews/${submissionReview.id}`).set(submissionReview);
        await db.doc(`tenants/${tenantA}/evidence/${attachedEvidence.id}`).set(attachedEvidence);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // 1. Verify the control exists without reopening the raw browser read
      // path that would bypass governed assurance verification.
      await assertFails(dbCompliance.doc(`tenants/${tenantA}/controls/${vendorControl.id}`).get());
      let controlExists = false;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const ctrlSnap = await context.firestore().doc(`tenants/${tenantA}/controls/${vendorControl.id}`).get();
        controlExists = ctrlSnap.exists;
      });
      expect(controlExists).toBe(true);

      // 2. Verify Schedule links to Control
      const schedSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/recurring_schedules/${annualSchedule.id}`).get()
      );
      expect((schedSnap.data() as RecurringAssessmentSchedule).linkedControlIds).toContain(vendorControl.id);

      // 3. Verify Request links to Control & Evidence
      const reqSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${assessmentRequest.id}`).get()
      );
      const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
      expect(reqData.linkedControlIds).toContain(vendorControl.id);
      expect(reqData.linkedEvidenceIds).toContain(attachedEvidence.id);
      expect(reqData.activeSubmissionId).toBe(assessmentSubmission.id);

      // 4. Verify Review outcome
      const revSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/submission_reviews/${submissionReview.id}`).get()
      );
      expect((revSnap.data() as SubmissionReview).decision).toBe('accept');

      // 5. Verify Evidence links to Control & Assessment
      const evSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/evidence/${attachedEvidence.id}`).get()
      );
      const evData = evSnap.data() as Evidence;
      expect(evData.controlIds).toContain(vendorControl.id);
      expect(evData.assessmentIds).toContain(assessmentRequest.id);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('3. Multi-Tenant Isolation for Control Satisfaction', () => {
    it('prevents Tenant B user from reading Tenant A control and schedule linkages', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/controls/${vendorControl.id}`).set(vendorControl);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/controls/${vendorControl.id}`).get()
      );
    });
  });
});

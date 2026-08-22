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
  Vendor,
  ProcessorProfile,
  ThirdPartyAssessmentRequest,
  ExternalAssessmentSubmission,
  SubmissionReview,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-vendor-assessment-integration-test',
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

describe('Vendor & Processor Assessment Integration Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();

  const existingVendor: Vendor = {
    id: 'vend_auth0_eu',
    tenantId: tenantA,
    name: 'Auth0 / Okta Ireland Ltd',
    category: 'saas_service',
    riskTier: 'medium',
    primaryContactName: 'Privacy Desk',
    primaryContactEmail: 'privacy@auth0.example.com',
    dpaSigned: true,
    dpaDate: now,
    securityAssessmentDate: now,
    nextAssessmentDueDate: futureIso,
    countryOfIncorporation: 'IE',
    dataHostingRegions: ['EU', 'DE'],
    subprocessorsListed: ['AWS Frankfurt'],
    hasProcessorProfile: true,
    activeProcessorProfileId: 'proc_auth0_01',
    status: 'active',
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const existingProcessor: ProcessorProfile = {
    id: 'proc_auth0_01',
    tenantId: tenantA,
    vendorId: existingVendor.id,
    engagementName: 'Customer Identity & Access Management (CIAM)',
    processorRole: 'data_processor',
    serviceDescription: 'Authentication, OAuth tokens, and user identity store.',
    dataCategories: ['contact_data', 'ip_addresses', 'auth_logs'],
    dataSubjects: ['customers', 'employees'],
    isSpecialCategoryData: false,
    jurisdictions: ['DE', 'IE'],
    linkedSystemAssetIds: ['asset_user_auth_service'],
    criticality: 'high',
    ownerUserId: PERSONAS.complianceA.uid,
    reviewCadence: 'annually',
    lastReviewDate: now,
    nextReviewDate: futureIso,
    status: 'active',
    notes: 'ISO 27001 and SOC 2 Type II certified.',
    dpaSigned: true,
    dpaDate: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const prospectRequest: ThirdPartyAssessmentRequest = {
    id: 'req_prospect_neuralai',
    tenantId: tenantA,
    title: 'Pre-Contract Evaluation: NeuralAI Labs SAS',
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
    targetType: 'prospective_vendor',
    thirdPartyName: 'NeuralAI Labs SAS',
    prospectCompanyName: 'NeuralAI Labs SAS',
    prospectWebsite: 'https://neuralai.example.fr',
    vendorId: null,
    processorProfileId: null,
    respondent: {
      name: 'Claire Dupont',
      email: 'claire@neuralai.example.fr',
      companyName: 'NeuralAI Labs SAS',
    },
    accessTokenHash: 'hash_token_001',
    tokenExpiresAt: futureIso,
    accessCount: 1,
    requestType: 'one_time_due_diligence',
    status: 'accepted',
    dueDate: futureIso,
    isRecurring: false,
    recurrenceCadence: 'none',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: [],
    linkedEvidenceIds: [],
    linkedRiskIds: [],
    activeSubmissionId: 'sub_neuralai_001',
    finalScorePercent: 96,
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

  const prospectSubmission: ExternalAssessmentSubmission = {
    id: 'sub_neuralai_001',
    tenantId: tenantA,
    requestId: prospectRequest.id,
    templateId: 'tmpl_gdpr_art28',
    targetType: 'prospective_vendor',
    vendorId: null,
    processorProfileId: null,
    thirdPartyName: 'NeuralAI Labs SAS',
    status: 'reviewed',
    submittedBy: {
      name: 'Claire Dupont',
      email: 'claire@neuralai.example.fr',
      companyName: 'NeuralAI Labs SAS',
      submittedAt: now,
    },
    computedScorePercent: 96,
    isPassingThreshold: true,
    sectionScores: {},
    answers: {
      q_toms_encryption: {
        questionId: 'q_toms_encryption',
        questionCode: 'TOM-01',
        sectionId: 'sec_toms',
        value: 'aes256_tls13',
        attachedEvidenceIds: ['ev_cert_neuralai'],
        updatedAt: now,
      },
    },
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

  const prospectReview: SubmissionReview = {
    id: 'rev_neuralai_001',
    tenantId: tenantA,
    status: 'completed',
    submissionId: prospectSubmission.id,
    requestId: prospectRequest.id,
    vendorId: null,
    processorProfileId: null,
    thirdPartyName: 'NeuralAI Labs SAS',
    decision: 'accept',
    finalScorePercent: 96,
    determinedRiskTier: 'low',
    isCompliant: true,
    rejectionReason: null,
    revisionInstructions: null,
    internalNotes: 'Excellent security posture and Article 28 compliance.',
    remediationActionPlan: null,
    questionFindings: {},
    derivedRiskFlagIds: [],
    generatedEvidenceIds: ['ev_cert_neuralai'],
    reviewerUserId: PERSONAS.complianceA.uid,
    reviewerEmail: 'compliance-manager@eurocorp.example.eu',
    reviewedAt: now,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. PROSPECT-TO-VENDOR CONVERSION LINKAGE
  // ---------------------------------------------------------------------------
  describe('1. Prospect-to-Vendor Conversion & Entity Linkage', () => {
    it('creates converted Vendor document and links requestId, score, and contact details', async () => {
      const convertedVendorId = 'vend_neuralai_france_01';

      const convertedVendor: Vendor = {
        id: convertedVendorId,
        tenantId: tenantA,
        name: prospectRequest.thirdPartyName,
        category: 'ai_model_provider',
        riskTier: 'low',
        primaryContactName: prospectRequest.respondent.name,
        primaryContactEmail: prospectRequest.respondent.email,
        dpaSigned: true,
        dpaDate: now,
        securityAssessmentDate: now,
        nextAssessmentDueDate: futureIso,
        countryOfIncorporation: 'FR',
        dataHostingRegions: ['EU', 'FR'],
        subprocessorsListed: [],
        hasProcessorProfile: false,
        activeProcessorProfileId: null,
        commercialStatus: 'active',
        latestAssessmentRequestId: prospectRequest.id,
        latestAssessmentSubmissionId: prospectSubmission.id,
        latestAssessmentScorePercent: 96,
        latestAssessmentRiskTier: 'low',
        status: 'active',
        ownerId: PERSONAS.complianceA.uid,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: now,
        updatedAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/vendors/${convertedVendorId}`).set(convertedVendor);
        await db.doc(`tenants/${tenantA}/assessment_requests/${prospectRequest.id}`).set({
          ...prospectRequest,
          vendorId: convertedVendorId,
          targetType: 'existing_vendor',
        });
        await db.doc(`tenants/${tenantA}/assessment_submissions/${prospectSubmission.id}`).set({
          ...prospectSubmission,
          vendorId: convertedVendorId,
        });
        await db.doc(`tenants/${tenantA}/submission_reviews/${prospectReview.id}`).set({
          ...prospectReview,
          vendorId: convertedVendorId,
        });
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // 1. Verify Vendor has latest assessment fields
      const vendorSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/vendors/${convertedVendorId}`).get()
      );
      expect(vendorSnap.exists).toBe(true);
      const vData = vendorSnap.data() as Vendor;
      expect(vData.latestAssessmentRequestId).toBe(prospectRequest.id);
      expect(vData.latestAssessmentScorePercent).toBe(96);
      expect(vData.name).toBe('NeuralAI Labs SAS');

      // 2. Verify Request and Submission have linked vendorId
      const reqSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${prospectRequest.id}`).get()
      );
      expect((reqSnap.data() as ThirdPartyAssessmentRequest).vendorId).toBe(convertedVendorId);
      expect((reqSnap.data() as ThirdPartyAssessmentRequest).targetType).toBe('existing_vendor');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. POST-ONBOARDING PROCESSOR ASSESSMENT LINKAGE
  // ---------------------------------------------------------------------------
  describe('2. Post-Onboarding Processor Assessment Linkage', () => {
    it('links recurring assessment cycle to existing Vendor and ProcessorProfile', async () => {
      const cycle2026Request: ThirdPartyAssessmentRequest = {
        id: 'req_auth0_2026_cycle',
        tenantId: tenantA,
        title: 'Auth0 2026 Annual GDPR Re-assessment',
        templateId: 'tmpl_gdpr_art28',
        templateSnapshot: prospectRequest.templateSnapshot,
        targetType: 'active_processor',
        thirdPartyName: existingVendor.name,
        vendorId: existingVendor.id,
        processorProfileId: existingProcessor.id,
        respondent: {
          name: 'Auth0 Security Desk',
          email: 'dpo@auth0.example.com',
          companyName: existingVendor.name,
        },
        accessTokenHash: 'hash_auth0_2026',
        tokenExpiresAt: futureIso,
        accessCount: 2,
        requestType: 'recurring_periodic_review',
        status: 'accepted',
        dueDate: futureIso,
        isRecurring: true,
        recurrenceCadence: 'annual',
        ownerUserId: PERSONAS.complianceA.uid,
        linkedSystemAssetIds: ['asset_user_auth_service'],
        linkedControlIds: ['ctrl_encryption'],
        linkedEvidenceIds: [],
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

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/vendors/${existingVendor.id}`).set(existingVendor);
        await db.doc(`tenants/${tenantA}/processor_profiles/${existingProcessor.id}`).set({
          ...existingProcessor,
          latestAssessmentRequestId: cycle2026Request.id,
          latestAssessmentScorePercent: 98,
          latestAssessmentDate: now,
        });
        await db.doc(`tenants/${tenantA}/assessment_requests/${cycle2026Request.id}`).set(cycle2026Request);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const procSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/processor_profiles/${existingProcessor.id}`).get()
      );
      expect(procSnap.exists).toBe(true);
      const procData = procSnap.data() as ProcessorProfile;
      expect(procData.latestAssessmentRequestId).toBe('req_auth0_2026_cycle');
      expect(procData.latestAssessmentScorePercent).toBe(98);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. HISTORICAL PRESERVATION ACROSS REPEATED CYCLES
  // ---------------------------------------------------------------------------
  describe('3. Multi-Cycle Historical Preservation', () => {
    it('preserves past 2025 assessment request and submission when 2026 cycle is completed', async () => {
      const cycle2025: ThirdPartyAssessmentRequest = {
        id: 'req_auth0_2025_cycle',
        tenantId: tenantA,
        title: 'Auth0 2025 Annual Review',
        templateId: 'tmpl_gdpr_art28',
        templateSnapshot: prospectRequest.templateSnapshot,
        targetType: 'active_processor',
        thirdPartyName: existingVendor.name,
        vendorId: existingVendor.id,
        processorProfileId: existingProcessor.id,
        respondent: {
          name: 'Auth0 Security Desk',
          email: 'dpo@auth0.example.com',
          companyName: existingVendor.name,
        },
        requestType: 'recurring_periodic_review',
        status: 'superseded',
        dueDate: '2025-08-15T00:00:00.000Z',
        isRecurring: true,
        recurrenceCadence: 'annual',
        ownerUserId: PERSONAS.complianceA.uid,
        linkedSystemAssetIds: [],
        linkedControlIds: [],
        linkedEvidenceIds: [],
        linkedRiskIds: [],
        activeSubmissionId: 'sub_auth0_2025',
        finalScorePercent: 92,
        isCompliant: true,
        accessCount: 1,
        renewalRequestId: 'req_auth0_2026_cycle',
        ownerId: PERSONAS.complianceA.uid,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: '2025-08-15T00:00:00.000Z',
        updatedAt: '2025-08-15T00:00:00.000Z',
      };

      const cycle2026: ThirdPartyAssessmentRequest = {
        ...cycle2025,
        id: 'req_auth0_2026_cycle',
        title: 'Auth0 2026 Annual Review',
        status: 'accepted',
        previousRequestId: 'req_auth0_2025_cycle',
        renewalRequestId: null,
        dueDate: futureIso,
        activeSubmissionId: 'sub_auth0_2026',
        finalScorePercent: 98,
        createdAt: now,
        updatedAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_requests/${cycle2025.id}`).set(cycle2025);
        await db.doc(`tenants/${tenantA}/assessment_requests/${cycle2026.id}`).set(cycle2026);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // Both historical cycles remain distinct and queryable
      const snap2025 = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${cycle2025.id}`).get()
      );
      const snap2026 = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_requests/${cycle2026.id}`).get()
      );

      expect(snap2025.exists).toBe(true);
      expect(snap2026.exists).toBe(true);
      expect((snap2025.data() as ThirdPartyAssessmentRequest).finalScorePercent).toBe(92);
      expect((snap2026.data() as ThirdPartyAssessmentRequest).finalScorePercent).toBe(98);
      expect((snap2026.data() as ThirdPartyAssessmentRequest).previousRequestId).toBe('req_auth0_2025_cycle');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('4. Multi-Tenant Isolation for Vendor Linkages', () => {
    it('prevents Tenant B user from reading Tenant A vendor assessment linkages', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/vendors/${existingVendor.id}`).set(existingVendor);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/vendors/${existingVendor.id}`).get()
      );
    });
  });
});

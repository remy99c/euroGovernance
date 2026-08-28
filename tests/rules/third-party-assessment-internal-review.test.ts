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
  ThirdPartyAssessmentRequest,
  ExternalAssessmentSubmission,
  SubmissionReview,
  isValidRequestStateTransition,
  validateSubmissionReview,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-internal-review-test',
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

describe('Third-Party Assessment Internal Review & Decision Workflow Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();

  const sampleRequest: ThirdPartyAssessmentRequest = {
    id: 'req_review_test_001',
    tenantId: tenantA,
    title: 'CloudData EU Processor Due Diligence',
    templateId: 'tmpl_gdpr_art28',
    templateSnapshot: {
      id: 'tmpl_gdpr_art28',
      tenantId: tenantA,
      code: 'TMPL-GDPR-ART28',
      title: 'GDPR Article 28 Due Diligence',
      description: 'Processor questionnaire.',
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
    targetType: 'active_processor',
    thirdPartyName: 'CloudData Europe B.V.',
    vendorId: 'vend_clouddata_01',
    processorProfileId: 'proc_clouddata_01',
    respondent: {
      name: 'Maria Santos',
      email: 'maria.santos@clouddata.eu',
      companyName: 'CloudData Europe B.V.',
    },
    accessTokenHash: 'hash_xyz',
    tokenExpiresAt: futureIso,
    accessCount: 3,
    requestType: 'recurring_periodic_review',
    status: 'submitted',
    dueDate: futureIso,
    isRecurring: true,
    recurrenceCadence: 'annual',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: ['ctrl_encryption'],
    linkedEvidenceIds: ['ev_iso27001_clouddata'],
    linkedRiskIds: [],
    activeSubmissionId: 'sub_review_test_001',
    finalScorePercent: 90,
    isCompliant: true,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const sampleSubmission: ExternalAssessmentSubmission = {
    id: 'sub_review_test_001',
    tenantId: tenantA,
    requestId: sampleRequest.id,
    templateId: 'tmpl_gdpr_art28',
    targetType: 'active_processor',
    vendorId: 'vend_clouddata_01',
    processorProfileId: 'proc_clouddata_01',
    thirdPartyName: 'CloudData Europe B.V.',
    status: 'submitted',
    submittedBy: {
      name: 'Maria Santos',
      email: 'maria.santos@clouddata.eu',
      companyName: 'CloudData Europe B.V.',
      submittedAt: now,
    },
    computedScorePercent: 90,
    isPassingThreshold: true,
    sectionScores: {
      sec_gov: {
        sectionTitle: 'Privacy Governance',
        earnedPoints: 18,
        possiblePoints: 20,
        scorePercent: 90,
      },
    },
    answers: {
      q_gov_dpo: {
        questionId: 'q_gov_dpo',
        questionCode: 'GOV-01',
        sectionId: 'sec_gov',
        value: true,
        attachedEvidenceIds: [],
        updatedAt: now,
      },
      q_toms_encryption: {
        questionId: 'q_toms_encryption',
        questionCode: 'TOM-01',
        sectionId: 'sec_gov',
        value: 'aes256_tls13',
        attachedEvidenceIds: ['ev_cert_001'],
        attachedFileMetadata: [
          {
            fileName: 'iso27001_certificate_2026.pdf',
            fileSizeBytes: 245000,
            mimeType: 'application/pdf',
            storagePath: 'evidence/uploads/iso27001_certificate_2026.pdf',
          },
        ],
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

  const sampleReview: SubmissionReview = {
    id: 'rev_review_test_001',
    tenantId: tenantA,
    status: 'completed',
    submissionId: sampleSubmission.id,
    requestId: sampleRequest.id,
    vendorId: 'vend_clouddata_01',
    processorProfileId: 'proc_clouddata_01',
    thirdPartyName: 'CloudData Europe B.V.',
    decision: 'accept',
    finalScorePercent: 90,
    determinedRiskTier: 'low',
    isCompliant: true,
    rejectionReason: null,
    revisionInstructions: null,
    internalNotes: 'All TOMs and ISO 27001 certificates validated. DPA terms acceptable.',
    remediationActionPlan: null,
    questionFindings: {
      q_toms_encryption: {
        questionId: 'q_toms_encryption',
        questionCode: 'TOM-01',
        flag: 'ok',
        reviewerNotes: 'Verified certificate validity against TÜV accreditation.',
      },
    },
    derivedRiskFlagIds: [],
    generatedEvidenceIds: ['ev_cert_001'],
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
  // 1. REVIEWER PERMISSIONS & SECURITY RULES
  // ---------------------------------------------------------------------------
  describe('1. Reviewer Permissions & RBAC Enforcement', () => {
    it('validates submission review schema integrity', () => {
      const res = validateSubmissionReview(sampleReview);
      expect(res.valid).toBe(true);
      expect(sampleReview.decision).toBe('accept');
      expect(sampleReview.reviewerUserId).toBe(PERSONAS.complianceA.uid);
    });

    it('denies compliance_manager direct submission-review creation', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`);
      await assertFails(ref.set(sampleReview));
    });

    it('denies approver direct submission-review creation', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.approverA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/submission_reviews/rev_approver_001`);
      await assertFails(
        ref.set({
          ...sampleReview,
          id: 'rev_approver_001',
          reviewerUserId: PERSONAS.approverA.uid,
          ownerId: PERSONAS.approverA.uid,
          createdBy: PERSONAS.approverA.uid,
          updatedBy: PERSONAS.approverA.uid,
        })
      );
    });

    it('BLOCKS viewer in Tenant A from creating review records', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/submission_reviews/rev_viewer_hack`);
      await assertFails(ref.set(sampleReview));
    });

    it('STRICT ISOLATION: prevents Tenant B user from accessing Tenant A review records', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).set(sampleReview);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).get()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DECISION OUTCOMES & STATE TRANSITIONS
  // ---------------------------------------------------------------------------
  describe('2. Review Outcomes & State Transitions', () => {
    it('handles "accept" outcome: submitted -> under_review -> accepted', () => {
      expect(isValidRequestStateTransition('submitted', 'under_review')).toBe(true);
      expect(isValidRequestStateTransition('under_review', 'accepted')).toBe(true);
    });

    it('handles "reject" outcome: submitted -> under_review -> rejected', () => {
      expect(isValidRequestStateTransition('submitted', 'under_review')).toBe(true);
      expect(isValidRequestStateTransition('under_review', 'rejected')).toBe(true);
    });

    it('handles "request_revision" outcome: under_review -> revision_requested -> sent', () => {
      expect(isValidRequestStateTransition('under_review', 'revision_requested')).toBe(true);
      expect(isValidRequestStateTransition('revision_requested', 'sent')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. HISTORY PRESERVATION & AUDIT TRAIL
  // ---------------------------------------------------------------------------
  describe('3. History Preservation & Audit Trail', () => {
    it('preserves submitted answers and uploaded file attachments after review completion', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_submissions/${sampleSubmission.id}`).set(sampleSubmission);
        await db.doc(`tenants/${tenantA}/submission_reviews/${sampleReview.id}`).set(sampleReview);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const subSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/assessment_submissions/${sampleSubmission.id}`).get()
      );

      expect(subSnap.exists).toBe(true);
      const subData = subSnap.data() as ExternalAssessmentSubmission;
      expect(subData.answers['q_toms_encryption']?.value).toBe('aes256_tls13');
      expect(subData.answers['q_toms_encryption']?.attachedFileMetadata?.[0]?.fileName).toBe(
        'iso27001_certificate_2026.pdf'
      );
      expect(subData.submittedBy.email).toBe('maria.santos@clouddata.eu');
    });
  });
});

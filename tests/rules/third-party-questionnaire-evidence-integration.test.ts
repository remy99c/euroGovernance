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
  Evidence,
  EvidenceVersion,
  DynamicQuestionnaireSection,
  evaluateMissingEvidenceRequirements,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-evidence-integration-test',
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

describe('Third-Party Questionnaire Evidence Repository Integration Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();

  const sampleEvidence: Evidence = {
    id: 'ev_iso27001_neuralai',
    tenantId: tenantA,
    title: 'ISO 27001:2022 Certificate (NeuralAI Labs SAS)',
    description: 'Supporting document for questionnaire question [TOM-01] Technical & Organisational Measures',
    category: 'iso_certificate',
    status: 'under_review',
    storagePath: 'tenants/tenantA/evidence/neuralai/iso27001_cert_2026.pdf',
    fileSizeBytes: 312000,
    mimeType: 'application/pdf',
    fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    controlIds: ['ctrl_encryption_at_rest'],
    requirementIds: [],
    policyIds: [],
    riskIds: [],
    assessmentIds: ['req_neuralai_001'],
    processorProfileIds: ['proc_neuralai_001'],
    vendorIds: ['vend_neuralai_001'],
    sourceType: 'external_questionnaire_submission',
    isExternalSubmissionArtifact: true,
    sourceAssessmentRequestId: 'req_neuralai_001',
    sourceSubmissionId: 'sub_neuralai_001',
    sourceQuestionId: 'q_toms_encryption',
    sourceThirdPartyName: 'NeuralAI Labs SAS',
    sourceRespondentEmail: 'claire@neuralai.example.fr',
    collectedAt: now,
    reviewDueDate: null,
    reviewedBy: null,
    reviewedAt: null,
    rejectionReason: null,
    currentVersion: 1,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: 'external_respondent',
    updatedBy: 'external_respondent',
    createdAt: now,
    updatedAt: now,
  };

  const sampleVersion: EvidenceVersion = {
    id: 'v1',
    tenantId: tenantA,
    evidenceId: sampleEvidence.id,
    versionNumber: 1,
    storagePath: sampleEvidence.storagePath,
    fileSizeBytes: sampleEvidence.fileSizeBytes,
    mimeType: sampleEvidence.mimeType,
    fileHashSha256: sampleEvidence.fileHashSha256,
    changeSummary: 'Uploaded by Claire Dupont (claire@neuralai.example.fr) for assessment req_neuralai_001',
    uploadedBy: 'claire@neuralai.example.fr',
    uploadedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. EVIDENCE LINKAGE & PROVENANCE TRACKING
  // ---------------------------------------------------------------------------
  describe('1. Evidence Repository Linkage & Provenance Tracking', () => {
    it('creates Evidence and EvidenceVersion records with explicit external provenance metadata', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}`).set(sampleEvidence);
        await db
          .doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}/versions/${sampleVersion.id}`)
          .set(sampleVersion);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // Verify Evidence document
      const evSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}`).get()
      );
      expect(evSnap.exists).toBe(true);
      const evData = evSnap.data() as Evidence;
      expect(evData.sourceType).toBe('external_questionnaire_submission');
      expect(evData.isExternalSubmissionArtifact).toBe(true);
      expect(evData.sourceAssessmentRequestId).toBe('req_neuralai_001');
      expect(evData.sourceQuestionId).toBe('q_toms_encryption');
      expect(evData.sourceRespondentEmail).toBe('claire@neuralai.example.fr');
      expect(evData.category).toBe('iso_certificate');
      expect(evData.status).toBe('under_review');

      // Verify immutable EvidenceVersion sub-document
      const verSnap = await assertSucceeds(
        dbCompliance
          .doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}/versions/${sampleVersion.id}`)
          .get()
      );
      expect(verSnap.exists).toBe(true);
      const verData = verSnap.data() as EvidenceVersion;
      expect(verData.uploadedBy).toBe('claire@neuralai.example.fr');
      expect(verData.versionNumber).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. MISSING EVIDENCE REQUIREMENTS EVALUATOR
  // ---------------------------------------------------------------------------
  describe('2. Missing Requested Evidence Indicators', () => {
    const testSections: DynamicQuestionnaireSection[] = [
      {
        id: 'sec_security',
        tenantId: tenantA,
        templateId: 'tmpl_test',
        code: 'SEC-SECURITY',
        title: 'Technical Security & Certifications',
        description: 'Information security controls.',
        sortOrder: 1,
        weight: 10,
        questions: [
          {
            id: 'q_iso27001',
            tenantId: tenantA,
            templateId: 'tmpl_test',
            sectionId: 'sec_security',
            code: 'SEC-01',
            title: 'Do you maintain an active ISO 27001 certification?',
            questionType: 'yes_no',
            required: true,
            sortOrder: 1,
            scoring: { weight: 5 },
            requiresEvidence: true,
            acceptedEvidenceCategories: ['iso_certificate', 'audit_report'],
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'q_soc2',
            tenantId: tenantA,
            templateId: 'tmpl_test',
            sectionId: 'sec_security',
            code: 'SEC-02',
            title: 'Upload your latest SOC 2 Type II assurance report.',
            questionType: 'file_upload',
            required: true,
            sortOrder: 2,
            scoring: { weight: 5 },
            requiresEvidence: true,
            acceptedEvidenceCategories: ['soc_report'],
            createdBy: PERSONAS.complianceA.uid,
            updatedBy: PERSONAS.complianceA.uid,
            createdAt: now,
            updatedAt: now,
          },
          {
            id: 'q_conditional_pci',
            tenantId: tenantA,
            templateId: 'tmpl_test',
            sectionId: 'sec_security',
            code: 'SEC-03',
            title: 'Upload PCI-DSS Attestation of Compliance (AoC).',
            questionType: 'file_upload',
            required: true,
            sortOrder: 3,
            scoring: { weight: 5 },
            requiresEvidence: true,
            conditionalRules: [
              {
                dependsOnQuestionId: 'q_iso27001',
                operator: 'equals',
                targetValue: false,
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
    ];

    it('identifies missing evidence for visible questions where no files/evidence IDs are attached', () => {
      const answers = {
        q_iso27001: {
          questionId: 'q_iso27001',
          questionCode: 'SEC-01',
          sectionId: 'sec_security',
          value: true,
          attachedEvidenceIds: ['ev_iso27001_neuralai'], // Evidence provided
          updatedAt: now,
        },
        q_soc2: {
          questionId: 'q_soc2',
          questionCode: 'SEC-02',
          sectionId: 'sec_security',
          value: null,
          attachedEvidenceIds: [], // Missing required evidence
          updatedAt: now,
        },
      };

      const result = evaluateMissingEvidenceRequirements(testSections, answers);

      expect(result.hasMissingEvidence).toBe(true);
      expect(result.totalRequestedCount).toBe(2); // q_iso27001 and q_soc2 are visible; q_conditional_pci is hidden
      expect(result.providedEvidenceCount).toBe(1);
      expect(result.missingEvidenceCount).toBe(1);
      expect(result.missingQuestions[0]?.questionId).toBe('q_soc2');
      expect(result.missingQuestions[0]?.questionCode).toBe('SEC-02');
      expect(result.missingQuestions[0]?.acceptedEvidenceCategories).toContain('soc_report');
    });

    it('returns hasMissingEvidence: false when all required evidence items are attached', () => {
      const answers = {
        q_iso27001: {
          questionId: 'q_iso27001',
          questionCode: 'SEC-01',
          sectionId: 'sec_security',
          value: true,
          attachedEvidenceIds: ['ev_iso27001_neuralai'],
          updatedAt: now,
        },
        q_soc2: {
          questionId: 'q_soc2',
          questionCode: 'SEC-02',
          sectionId: 'sec_security',
          value: 'attached',
          attachedEvidenceIds: [],
          attachedFileMetadata: [
            {
              fileName: 'soc2_type2_report_2026.pdf',
              fileSizeBytes: 1050000,
              mimeType: 'application/pdf',
              storagePath: 'evidence/soc2_type2_report_2026.pdf',
              uploadedAt: now,
            },
          ],
          updatedAt: now,
        },
      };

      const result = evaluateMissingEvidenceRequirements(testSections, answers);

      expect(result.hasMissingEvidence).toBe(false);
      expect(result.missingEvidenceCount).toBe(0);
      expect(result.providedEvidenceCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. MULTI-TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('3. Multi-Tenant Isolation for Questionnaire Evidence', () => {
    it('prevents Tenant B user from accessing Tenant A questionnaire evidence artifacts', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}`).set(sampleEvidence);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/evidence/${sampleEvidence.id}`).get()
      );
    });
  });
});

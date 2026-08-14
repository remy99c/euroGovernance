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
  ProcessorProfile,
  TransferArrangement,
  DPIA,
  synthesizeDPIAProcessorContext,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-test',
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
      name: 'MedTech France SAS',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships Tenant A
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.adminA.uid}`).set({
      userId: PERSONAS.adminA.uid,
      tenantId: tenantA,
      role: PERSONAS.adminA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed DPIA Assessment with Linked Processors
    await db.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_recruiting`).set({
      id: 'dpia_ai_recruiting',
      tenantId: tenantA,
      code: 'DPIA-AI-01',
      title: 'AI Automated Candidate Screening System',
      description: 'Systematic profiling and automated scoring of applicant video interviews',
      ropaEntryId: 'ropa_talent_acquisition',
      status: 'in_review',
      screeningQuestionsAnswers: {
        systematicEvaluation: true,
        automatedDecisionMaking: true,
        largeScaleSpecialCategories: false,
        vulnerableSubjects: false,
        innovativeTechUsage: true,
        preventsExercisingRights: false,
      },
      necessityAndProportionalityAssessment: 'Proportionate for initial skill filtering with mandatory human-in-the-loop review.',
      dpoOpinionNotes: null,
      dpoApprovalDate: null,
      residualRiskLevel: 'high',
      mitigatingControlIds: ['ctrl_human_review', 'ctrl_bias_audit'],
      nextReviewDate: '2027-08-15T00:00:00.000Z',
      processorProfileIds: ['prof_hirevue_screening'],
      transferArrangementIds: ['trans_hirevue_us_scc'],
      thirdPartySafeguardsSummary: 'Article 28 Controller-Processor binding commitments verified; Transfer safeguards established: standard_contractual_clauses.',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });
  });
});

describe('Processor Profiles & DPIA Assessments Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. DPIA Processor Context Synthesis & Risk Visibility
  // ---------------------------------------------------------------------------
  describe('1. DPIA Processor Context Synthesis & Risk Derivation', () => {
    const criticalProcessor: ProcessorProfile = {
      id: 'prof_openai_enterprise',
      tenantId: tenantA,
      vendorId: 'vnd_openai_inc',
      engagementName: 'Enterprise LLM Evaluation Addendum',
      processorRole: 'data_processor',
      serviceDescription: 'Custom model inference on resume embeddings',
      dataCategories: ['candidate_cv', 'employment_history'],
      dataSubjects: ['job_applicants'],
      isSpecialCategoryData: true, // Special category biometric / diversity markers
      specialCategoryTypes: ['biometrics'],
      jurisdictions: ['US'],
      linkedSystemAssetIds: ['asset_llm_gateway'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'semi_annually',
      lastReviewDate: null,
      nextReviewDate: null,
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-15T00:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
      notes: null,
    };

    const subprocessorWithoutDpa: ProcessorProfile = {
      id: 'prof_transcription_api',
      tenantId: tenantA,
      vendorId: 'vnd_speech_to_text_ltd',
      processorRole: 'subprocessor',
      serviceDescription: 'Audio transcription',
      dataCategories: ['audio_recordings'],
      dataSubjects: ['job_applicants'],
      isSpecialCategoryData: false,
      jurisdictions: ['UK'],
      linkedSystemAssetIds: [],
      criticality: 'high',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: null,
      nextReviewDate: null,
      status: 'active',
      dpaSigned: false, // Missing DPA!
      dpaDate: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
      notes: null,
    };

    const restrictedTransferWithoutTia: TransferArrangement = {
      id: 'trans_openai_us',
      tenantId: tenantA,
      processorProfileId: 'prof_openai_enterprise',
      vendorId: 'vnd_openai_inc',
      name: 'US LLM Pipeline',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['hosting', 'analytics'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-01-01T00:00:00.000Z',
      reviewDueDate: '2027-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Client-side pseudonymization',
      subprocessorInvolvement: true,
      linkedTiaId: null, // Missing TIA!
      linkedEvidenceIds: [],
      status: 'active_valid',
      rationale: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    };

    test('synthesizes comprehensive processor context, safeguards, and risk highlights for DPIA execution', () => {
      const context = synthesizeDPIAProcessorContext(
        [criticalProcessor, subprocessorWithoutDpa],
        [restrictedTransferWithoutTia]
      );

      expect(context.processorCount).toBe(2);
      expect(context.transferCount).toBe(1);

      // Risk highlights
      expect(context.riskSummary.highestCriticality).toBe('critical');
      expect(context.riskSummary.hasSpecialCategoryData).toBe(true);
      expect(context.riskSummary.hasRestrictedTransfers).toBe(true);
      expect(context.riskSummary.hasSubprocessors).toBe(true);
      expect(context.riskSummary.missingDpaCount).toBe(1);
      expect(context.riskSummary.missingTiaCount).toBe(1);

      expect(context.riskSummary.riskHighlights).toEqual(
        expect.arrayContaining([
          expect.stringContaining('High/Critical supply chain dependence'),
          expect.stringContaining('Special Category Data'),
          expect.stringContaining('Article 28 DPA Warning'),
          expect.stringContaining('Chapter V Cross-Border Transfers'),
          expect.stringContaining('TIA Gap'),
        ])
      );

      // Safeguards summary
      expect(context.safeguardsSummary).toContain('Article 28 Controller-Processor binding commitments verified for 1/2 processors');
      expect(context.safeguardsSummary).toContain('standard_contractual_clauses');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DPIA Security Rules & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('2. DPIA Security Rules & Multi-Tenant Isolation', () => {
    test('Privacy Officer can view DPIA with processor and transfer linkage', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const snap = await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_recruiting`).get()
      );
      expect(snap.exists).toBe(true);
      const data = snap.data() as DPIA;
      expect(data.processorProfileIds).toContain('prof_hirevue_screening');
      expect(data.transferArrangementIds).toContain('trans_hirevue_us_scc');
      expect(data.thirdPartySafeguardsSummary).toBeDefined();
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or alter Tenant A DPIA processor linkages', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Read is forbidden
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_recruiting`).get()
      );

      // Mutate is forbidden
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_recruiting`).update({
          processorProfileIds: ['prof_unauthorized_hijack'],
        })
      );
    });
  });
});

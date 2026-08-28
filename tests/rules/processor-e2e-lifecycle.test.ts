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
  seedTenantWithMembers,
} from './fixtures/test-factories.js';
import {
  buildProcessorE2EFixtures,
  seedProcessorTopology,
} from './fixtures/processor-e2e-helpers.js';
import {
  evaluateProcessorRiskFlags,
  evaluateProcessorEvidenceCompleteness,
  evaluateTransferEvidenceCompleteness,
  evaluateProcessorReminders,
  ProcessorProfile,
  TransferArrangement,
  Evidence,
  ProcessorReminderCandidate,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-processor-e2e-test',
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

  // Seed Tenants and Memberships
  await seedTenantWithMembers(
    testEnv,
    { tenantId: tenantA, name: 'EuroCorp Technologies SE' },
    [
      { userId: PERSONAS.adminA.uid, tenantId: tenantA, role: PERSONAS.adminA.role },
      { userId: PERSONAS.privacyA.uid, tenantId: tenantA, role: PERSONAS.privacyA.role },
      { userId: PERSONAS.complianceA.uid, tenantId: tenantA, role: PERSONAS.complianceA.role },
      { userId: PERSONAS.viewerA.uid, tenantId: tenantA, role: PERSONAS.viewerA.role },
    ]
  );

  await seedTenantWithMembers(
    testEnv,
    { tenantId: tenantB, name: 'MedTech France SAS' },
    [
      { userId: PERSONAS.adminB.uid, tenantId: tenantB, role: PERSONAS.adminB.role },
      { userId: PERSONAS.contributorB.uid, tenantId: tenantB, role: PERSONAS.contributorB.role },
    ]
  );
});

describe('Processor & Cross-Border Transfer Governance: Full E2E Lifecycle Pack', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. Create Vendor (Step 1)
  // ---------------------------------------------------------------------------
  test('Step 1: trusted command creates a Vendor record readable by the Privacy Officer', async () => {
    const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

    const vendorDoc = {
      id: 'vnd_omnicloud_01',
      tenantId: tenantA,
      name: 'OmniCloud Services International Corp',
      category: 'cloud_provider',
      riskTier: 'critical',
      primaryContactName: 'Global Vendor Operations',
      primaryContactEmail: 'security@omnicloud.example.com',
      countryOfIncorporation: 'US',
      dataHostingRegions: ['us-east-1', 'eu-central-1'],
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/vendors/vnd_omnicloud_01`).set(vendorDoc);
    });

    const snap = await privDb.doc(`tenants/${tenantA}/vendors/vnd_omnicloud_01`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.name).toBe('OmniCloud Services International Corp');
  });

  // ---------------------------------------------------------------------------
  // 2. Create Processor Profile (Step 2)
  // ---------------------------------------------------------------------------
  test('Step 2: trusted command creates a GDPR Article 28 Processor Profile', async () => {
    const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

    const profileDoc = {
      id: 'prof_omnicloud_01',
      tenantId: tenantA,
      vendorId: 'vnd_omnicloud_01',
      engagementName: 'OmniCloud Core Compute & Database Cluster',
      processorRole: 'data_processor',
      serviceDescription: 'Multi-tenant cloud infrastructure and API processing cluster',
      dataCategories: ['contact_details', 'usage_telemetry'],
      dataSubjects: ['customers', 'employees'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'DE'],
      linkedSystemAssetIds: [],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2025-08-01T00:00:00.000Z',
      nextReviewDate: '2026-08-01T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2025-08-01T00:00:00.000Z',
      linkedDpaEvidenceId: null,
      linkedRiskIds: [],
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).set(profileDoc);
    });

    const snap = await privDb.doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.processorRole).toBe('data_processor');
  });

  // ---------------------------------------------------------------------------
  // 3 & 4. Add Restricted Transfer & Choose SCC Mechanism (Steps 3 & 4)
  // ---------------------------------------------------------------------------
  test('Steps 3 & 4: trusted command records a Restricted Transfer Arrangement with SCCs', async () => {
    const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

    const transferDoc = {
      id: 'trans_omnicloud_us',
      tenantId: tenantA,
      processorProfileId: 'prof_omnicloud_01',
      vendorId: 'vnd_omnicloud_01',
      name: 'OmniCloud US Data Replication Stream',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['backup', 'analytics', 'hosting'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2025-08-01T00:00:00.000Z',
      reviewDueDate: '2026-08-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'KMS AES-256 encryption with client-held encryption keys',
      subprocessorInvolvement: false,
      linkedTiaId: null,
      linkedEvidenceIds: [],
      rationale: 'Disaster recovery and high availability failover',
      status: 'active',
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).set(transferDoc);
    });

    const snap = await compDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.transferMechanismType).toBe('standard_contractual_clauses');
    expect(snap.data()?.restrictedTransfer).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // 5. Attach Evidence (Step 5)
  // ---------------------------------------------------------------------------
  test('Step 5: trusted evidence workflow attaches verified DPA and SCC execution evidence', async () => {
    const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

    const dpaEvidence = {
      id: 'ev_dpa_omni_01',
      tenantId: tenantA,
      title: 'OmniCloud Executed DPA & Technical Safeguards',
      category: 'dpa',
      status: 'under_review',
      storagePath: `tenants/${tenantA}/evidence/dpa_omnicloud.pdf`,
      processorProfileIds: ['prof_omnicloud_01'],
      collectedAt: now,
      currentVersion: 1,
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    const sccEvidence = {
      id: 'ev_scc_omni_01',
      tenantId: tenantA,
      title: 'OmniCloud Standard Contractual Clauses (Module 2)',
      category: 'scc',
      status: 'under_review',
      storagePath: `tenants/${tenantA}/evidence/scc_omnicloud.pdf`,
      processorProfileIds: ['prof_omnicloud_01'],
      transferArrangementIds: ['trans_omnicloud_us'],
      collectedAt: now,
      currentVersion: 1,
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    // Evidence is created only by the trusted server pipeline; seed the
    // resulting records directly so this lifecycle test can exercise linkage.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const serverDb = context.firestore();
      await serverDb.doc(`tenants/${tenantA}/evidence/ev_dpa_omni_01`).set(dpaEvidence);
      await serverDb.doc(`tenants/${tenantA}/evidence/ev_scc_omni_01`).set(sccEvidence);
    });

    // The trusted workflow links evidence IDs to the authoritative profile.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).set(
        {
          id: 'prof_omnicloud_01',
          tenantId: tenantA,
          vendorId: 'vnd_omnicloud_01',
          engagementName: 'OmniCloud Core Compute & Database Cluster',
          processorRole: 'data_processor',
          serviceDescription: 'Multi-tenant cloud infrastructure and API processing cluster',
          dataCategories: ['contact_details', 'usage_telemetry'],
          dataSubjects: ['customers', 'employees'],
          isSpecialCategoryData: false,
          jurisdictions: ['US', 'DE'],
          linkedSystemAssetIds: [],
          criticality: 'critical',
          ownerUserId: PERSONAS.privacyA.uid,
          reviewCadence: 'annually',
          lastReviewDate: '2025-08-01T00:00:00.000Z',
          nextReviewDate: '2026-08-01T00:00:00.000Z',
          status: 'active',
          dpaSigned: true,
          dpaDate: '2025-08-01T00:00:00.000Z',
          linkedDpaEvidenceId: 'ev_dpa_omni_01',
          linkedRiskIds: [],
          ownerId: PERSONAS.privacyA.uid,
          createdBy: PERSONAS.privacyA.uid,
          createdAt: now,
          updatedAt: now,
        },
        { merge: true }
      );
    });

    const profileSnap = await privDb.doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).get();
    expect(profileSnap.data()?.linkedDpaEvidenceId).toBe('ev_dpa_omni_01');
  });

  // ---------------------------------------------------------------------------
  // 6. Link / Create TIA Assessment (Step 6)
  // ---------------------------------------------------------------------------
  test('Step 6: trusted command creates and links a Schrems II Transfer Impact Assessment (TIA)', async () => {
    const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

    const tiaDoc = {
      id: 'tia_omnicloud_us',
      tenantId: tenantA,
      code: 'TIA-OMNI-US-01',
      title: 'OmniCloud US Data Transfer Impact Assessment (Schrems II)',
      vendorId: 'vnd_omnicloud_01',
      processorProfileId: 'prof_omnicloud_01',
      transferArrangementId: 'trans_omnicloud_us',
      destinationCountry: 'US',
      legalMechanism: 'standard_contractual_clauses',
      destinationCountryLegalAssessment: 'FISA 702 / EO 14086 assessed with client KMS technical safeguard',
      supplementaryTechnicalMeasures: 'End-to-end client encryption',
      supplementaryContractualMeasures: 'Government request notification clause',
      status: 'draft',
      residualRiskLevel: 'low',
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const serverDb = context.firestore();
      await serverDb.doc(`tenants/${tenantA}/tia_assessments/tia_omnicloud_us`).set(tiaDoc);

      // Link the TIA ID to the transfer arrangement in the same trusted workflow.
      await serverDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).set(
        {
          id: 'trans_omnicloud_us',
          tenantId: tenantA,
          processorProfileId: 'prof_omnicloud_01',
          vendorId: 'vnd_omnicloud_01',
          name: 'OmniCloud US Data Replication Stream',
          restrictedTransfer: true,
          destinationCountries: ['US'],
          eeaStatus: 'third_country_non_adequate',
          transferScopes: ['backup', 'analytics', 'hosting'],
          transferMechanismType: 'standard_contractual_clauses',
          transferMechanismStatus: 'active_valid',
          effectiveDate: '2025-08-01T00:00:00.000Z',
          reviewDueDate: '2026-08-01T00:00:00.000Z',
          supplementaryMeasuresSummary: 'KMS AES-256 encryption with client-held encryption keys',
          subprocessorInvolvement: false,
          linkedTiaId: 'tia_omnicloud_us',
          linkedEvidenceIds: ['ev_scc_omni_01'],
          rationale: 'Disaster recovery and high availability failover',
          status: 'active',
          ownerId: PERSONAS.privacyA.uid,
          createdBy: PERSONAS.privacyA.uid,
          createdAt: now,
          updatedAt: now,
        }
      );
    });

    const transferSnap = await privDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).get();
    expect(transferSnap.data()?.linkedTiaId).toBe('tia_omnicloud_us');
  });

  // ---------------------------------------------------------------------------
  // 7. Link to System Asset and Article 30 ROPA (Step 7)
  // ---------------------------------------------------------------------------
  test('Step 7: trusted command links the processor and transfer to a System Asset and ROPA entry', async () => {
    const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

    // 1. Create System Asset with typed processor relationship
    const assetDoc = {
      id: 'asset_web_backend',
      tenantId: tenantA,
      name: 'Customer Web Application & Processing Backend',
      assetType: 'cloud_infrastructure',
      criticality: 'mission_critical',
      dataClassification: 'restricted_personal',
      hostingLocation: 'EU-West / US-East',
      vendorId: 'vnd_omnicloud_01',
      containsPersonalData: true,
      containsSpecialCategoryData: false,
      containsTrainingData: false,
      processorProfileIds: ['prof_omnicloud_01'],
      processorRelationships: [
        {
          processorProfileId: 'prof_omnicloud_01',
          relationshipType: 'hosting',
          relationshipDescription: 'Primary compute workload and data persistence tier',
        },
      ],
      status: 'active',
      ownerId: PERSONAS.adminA.uid,
      createdBy: PERSONAS.adminA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/system_assets/asset_web_backend`).set(assetDoc);
    });

    // 2. Create Article 30 ROPA entry linking processor and transfer arrangement
    const ropaDoc = {
      id: 'ropa_cust_onboard',
      tenantId: tenantA,
      activityCode: 'ROPA-CUST-ONBOARD-01',
      activityName: 'Customer Account Onboarding & Core Service Provision',
      purpose: 'Provision of enterprise SaaS services',
      legalBasis: 'contractual_necessity',
      legalBasisRationale: 'GDPR Article 6(1)(b)',
      isSpecialCategoryData: false,
      specialCategoryBasis: null,
      dataSubjectCategories: ['customers'],
      personalDataCategories: ['contact_details', 'identification_numbers'],
      retentionPeriodDescription: 'Active account duration plus statutory 10-year retention',
      retentionPeriodMonths: 120,
      dataSecurityMeasuresSummary: 'Role-based access control, TLS 1.3 in transit, AES-256 at rest',
      jointControllerInfo: null,
      processorIds: ['vnd_omnicloud_01'],
      processorProfileIds: ['prof_omnicloud_01'],
      transferArrangementIds: ['trans_omnicloud_us'],
      recipientCategories: ['cloud_infrastructure_providers'],
      involvesInternationalTransfer: true,
      destinationCountries: ['US'],
      transferMechanism: 'standard_contractual_clauses',
      dpiaRequired: false,
      linkedDpiaId: null,
      linkedTiaId: 'tia_omnicloud_us',
      linkedSystemAssetIds: ['asset_web_backend'],
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    };

    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/ropa_entries/ropa_cust_onboard`).set(ropaDoc);
    });

    const snapRopa = await privDb.doc(`tenants/${tenantA}/ropa_entries/ropa_cust_onboard`).get();
    expect(snapRopa.exists).toBe(true);
    expect(snapRopa.data()?.processorProfileIds).toContain('prof_omnicloud_01');
    expect(snapRopa.data()?.transferArrangementIds).toContain('trans_omnicloud_us');
  });

  // ---------------------------------------------------------------------------
  // 8. Trigger Derived Warnings / Risk Evaluation (Step 8)
  // ---------------------------------------------------------------------------
  describe('Step 8: Derived Risk Rule Engine & Safeguard Verification', () => {
    test('8a. Evaluates critical risk flag when restricted transfer lacks an approved TIA or evidence', () => {
      const unmitigatedProfile: ProcessorProfile = {
        id: 'prof_unmitigated',
        tenantId: tenantA,
        vendorId: 'vnd_omnicloud_01',
        engagementName: 'Unmitigated Transfer Pipeline',
        processorRole: 'data_processor',
        serviceDescription: 'Raw data export',
        dataCategories: ['contact_details'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: true, // Special category without DPA -> critical flag
        jurisdictions: ['US'],
        linkedSystemAssetIds: [],
        criticality: 'critical',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z', // Overdue -> high flag
        status: 'active',
        dpaSigned: false, // Gap: No signed DPA
        dpaDate: null,
        linkedDpaEvidenceId: null,
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.privacyA.uid,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const unmitigatedTransfer: TransferArrangement = {
        id: 'trans_unmitigated',
        tenantId: tenantA,
        processorProfileId: 'prof_unmitigated',
        vendorId: 'vnd_omnicloud_01',
        name: 'Unmitigated US Transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'no_mechanism_selected', // No mechanism -> critical flag
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2024-01-01T00:00:00.000Z',
        reviewDueDate: '2025-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: '',
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['ThirdParty Subcontractor'],
        linkedTiaId: null, // Gap: Missing TIA
        linkedEvidenceIds: [], // Gap: Missing SCC evidence
        rationale: 'Analytics',
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const evalSummary = evaluateProcessorRiskFlags(
        unmitigatedProfile,
        [unmitigatedTransfer],
        [],
        new Date('2026-08-15T00:00:00.000Z')
      );

      expect(evalSummary.overallRiskLevel).toBe('critical');
      expect(evalSummary.totalDerivedFlagsCount).toBeGreaterThan(0);

      const flagCodes = evalSummary.flags.map((f) => f.ruleCode);
      expect(flagCodes).toContain('RESTRICTED_TRANSFER_NO_MECHANISM');
      expect(flagCodes).toContain('SPECIAL_CATEGORY_MISSING_DPA');
      expect(flagCodes).toContain('HIGH_CRITICALITY_REVIEW_OVERDUE');
      expect(flagCodes).toContain('RESTRICTED_TRANSFER_MISSING_TIA');
      expect(flagCodes).toContain('SUBPROCESSORS_NO_SUPPORTING_DOCS');
    });

    test('8b. Evaluates low risk when DPA, SCCs, approved TIA, and valid evidence are attached', () => {
      const fixtures = buildProcessorE2EFixtures({
        tenantId: tenantA,
        vendorId: 'vnd_omnicloud_01',
        profileId: 'prof_omnicloud_01',
        arrangementId: 'trans_omnicloud_us',
        evidenceDpaId: 'ev_dpa_omni_01',
        evidenceSccId: 'ev_scc_omni_01',
        evidenceSecurityId: 'ev_sec_omni_01',
        tiaId: 'tia_omnicloud_us',
        assetId: 'asset_web_backend',
        ropaId: 'ropa_cust_onboard',
        ownerUid: PERSONAS.privacyA.uid,
      });

      const profile = fixtures.processorProfile as ProcessorProfile;
      const transfer = fixtures.transferArrangement as TransferArrangement;
      const dpaEv = fixtures.dpaEvidence as Evidence;
      const sccEv = fixtures.sccEvidence as Evidence;
      const secEv = fixtures.securityEvidence as Evidence;

      const evalSummary = evaluateProcessorRiskFlags(
        profile,
        [transfer],
        [dpaEv, sccEv, secEv],
        new Date('2026-08-15T00:00:00.000Z')
      );

      expect(evalSummary.overallRiskLevel).toBe('low');
      expect(evalSummary.criticalFlagsCount).toBe(0);

      const completeness = evaluateProcessorEvidenceCompleteness(
        profile,
        [dpaEv, sccEv, secEv],
        '2026-08-15T00:00:00.000Z'
      );

      expect(completeness.isComplete).toBe(true);
      expect(completeness.missingCount).toBe(0);

      const transferCompleteness = evaluateTransferEvidenceCompleteness(
        transfer,
        [dpaEv, sccEv, secEv],
        '2026-08-15T00:00:00.000Z'
      );
      expect(transferCompleteness.isComplete).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Verify Review Reminders & Duplicate Suppression (Step 9)
  // ---------------------------------------------------------------------------
  describe('Step 9: Review Reminders Engine & Notification Dispatch', () => {
    test('generates timely reminders for overdue or upcoming processor/transfer reviews', () => {
      const overdueProfile: ProcessorProfile = {
        id: 'prof_overdue',
        tenantId: tenantA,
        vendorId: 'vnd_omnicloud_01',
        engagementName: 'Legacy Processing Service',
        processorRole: 'data_processor',
        serviceDescription: 'Legacy pipeline',
        dataCategories: ['contact_details'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['US'],
        linkedSystemAssetIds: [],
        criticality: 'critical',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: '2025-01-01T00:00:00.000Z',
        nextReviewDate: '2026-01-01T00:00:00.000Z', // Overdue relative to 2026-08-15
        status: 'active',
        dpaSigned: true,
        dpaDate: '2025-01-01T00:00:00.000Z',
        linkedDpaEvidenceId: null,
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.privacyA.uid,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const overdueTransfer: TransferArrangement = {
        id: 'trans_overdue',
        tenantId: tenantA,
        processorProfileId: 'prof_overdue',
        vendorId: 'vnd_omnicloud_01',
        name: 'Overdue US Transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z', // Overdue
        supplementaryMeasuresSummary: 'KMS',
        subprocessorInvolvement: false,
        linkedTiaId: null,
        linkedEvidenceIds: [],
        rationale: 'Backup',
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const reminderEvents: ProcessorReminderCandidate[] = evaluateProcessorReminders(
        overdueProfile,
        [overdueTransfer],
        [],
        { asOfDate: new Date('2026-08-15T00:00:00.000Z'), windowDays: 30 }
      );

      expect(reminderEvents.length).toBeGreaterThan(0);
      const recipientIds = reminderEvents.map((r: ProcessorReminderCandidate) => r.recipientUserId);
      expect(recipientIds).toContain(PERSONAS.privacyA.uid);

      const reminderTypes = reminderEvents.map((r: ProcessorReminderCandidate) => r.reminderType);
      expect(reminderTypes).toContain('processor_annual_review_due');
      expect(reminderTypes).toContain('scc_review_due');
    });
  });

  // ---------------------------------------------------------------------------
  // 10. Verify Cross-Tenant Isolation (Step 10)
  // ---------------------------------------------------------------------------
  describe('Step 10: Strict Cross-Tenant Boundary Enforcement', () => {
    beforeEach(async () => {
      // Seed complete topology in Tenant A
      await seedProcessorTopology(testEnv, {
        tenantId: tenantA,
        vendorId: 'vnd_omnicloud_01',
        profileId: 'prof_omnicloud_01',
        arrangementId: 'trans_omnicloud_us',
        evidenceDpaId: 'ev_dpa_omni_01',
        evidenceSccId: 'ev_scc_omni_01',
        tiaId: 'tia_omnicloud_us',
        assetId: 'asset_web_backend',
        ropaId: 'ropa_cust_onboard',
        ownerUid: PERSONAS.privacyA.uid,
      });
    });

    test('Tenant B Admin is denied from reading any Tenant A processor governance documents', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(adminBDb.doc(`tenants/${tenantA}/vendors/vnd_omnicloud_01`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/evidence/ev_dpa_omni_01`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/tia_assessments/tia_omnicloud_us`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/system_assets/asset_web_backend`).get());
      await assertFails(adminBDb.doc(`tenants/${tenantA}/ropa_entries/ropa_cust_onboard`).get());
    });

    test('Tenant B Contributor is denied from mutating or forging records in Tenant A', async () => {
      const contribBDb = testEnv.authenticatedContext(PERSONAS.contributorB.uid).firestore();

      await assertFails(
        contribBDb.doc(`tenants/${tenantA}/processor_profiles/prof_omnicloud_01`).update({
          status: 'suspended',
        })
      );

      await assertFails(
        contribBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_omnicloud_us`).update({
          restrictedTransfer: false,
        })
      );

      await assertFails(
        contribBDb.doc(`tenants/${tenantA}/processor_profiles/prof_cross_forge`).set({
          id: 'prof_cross_forge',
          tenantId: tenantA,
          vendorId: 'vnd_omnicloud_01',
          engagementName: 'Cross Forge',
          status: 'active',
          createdBy: PERSONAS.contributorB.uid,
          createdAt: now,
        })
      );
    });
  });
});

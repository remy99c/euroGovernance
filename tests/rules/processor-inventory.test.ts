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
      status: 'active',
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
      status: 'active',
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.viewerA.uid}`).set({
      userId: PERSONAS.viewerA.uid,
      tenantId: tenantA,
      role: PERSONAS.viewerA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Processor 1 (Tenant A: Critical, Restricted Transfer to US, SCC, Approved TIA, Overdue Review)
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_us_cloud`).set({
      id: 'prof_us_cloud',
      tenantId: tenantA,
      vendorId: 'vnd_hyperscaler_us',
      engagementName: 'US Hyperscaler Production Compute',
      processorRole: 'data_processor',
      serviceDescription: 'Multi-region compute in US-East',
      dataCategories: ['user_content', 'contact_details'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'DE'],
      linkedSystemAssetIds: ['asset_prod_api'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2025-01-01T00:00:00.000Z',
      nextReviewDate: '2026-01-01T00:00:00.000Z', // Overdue
      status: 'active',
      dpaSigned: true,
      dpaDate: '2025-01-01T00:00:00.000Z',
      linkedDpaEvidenceId: 'ev_us_dpa',
      linkedRiskIds: [],
      notes: null,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_us_compute`).set({
      id: 'trans_us_compute',
      processorProfileId: 'prof_us_cloud',
      vendorId: 'vnd_hyperscaler_us',
      tenantId: tenantA,
      name: 'US Cloud Hosting Stream',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['hosting'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2025-01-01T00:00:00.000Z',
      reviewDueDate: '2026-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'KMS AES-256',
      subprocessorInvolvement: false,
      linkedTiaId: 'tia_us_compute',
      linkedEvidenceIds: ['ev_us_scc'],
      rationale: 'Primary backend host',
      notes: null,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/tia_assessments/tia_us_compute`).set({
      id: 'tia_us_compute',
      tenantId: tenantA,
      code: 'TIA-US-01',
      title: 'US Cloud Compute Assessment',
      vendorId: 'vnd_hyperscaler_us',
      destinationCountry: 'US',
      legalMechanism: 'scc',
      destinationCountryLegalAssessment: 'FISA 702 mitigated',
      supplementaryTechnicalMeasures: 'AES-256',
      supplementaryContractualMeasures: 'Notice clause',
      status: 'approved',
      residualRiskLevel: 'low',
      approvedBy: PERSONAS.privacyA.uid,
      approvedAt: now,
      transferArrangementId: 'trans_us_compute',
      processorProfileId: 'prof_us_cloud',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/evidence/ev_us_dpa`).set({
      id: 'ev_us_dpa',
      tenantId: tenantA,
      title: 'US DPA Contract',
      description: 'DPA',
      category: 'dpa',
      status: 'valid',
      storagePath: 'tenants/tenantA/evidence/us_dpa.pdf',
      fileSizeBytes: 1024,
      mimeType: 'application/pdf',
      fileHashSha256: 'hash_us_dpa',
      controlIds: [],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [],
      processorProfileIds: ['prof_us_cloud'],
      collectedAt: now,
      currentVersion: 1,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/evidence/ev_us_scc`).set({
      id: 'ev_us_scc',
      tenantId: tenantA,
      title: 'US SCC Contract',
      description: 'SCC',
      category: 'scc',
      status: 'valid',
      storagePath: 'tenants/tenantA/evidence/us_scc.pdf',
      fileSizeBytes: 2048,
      mimeType: 'application/pdf',
      fileHashSha256: 'hash_us_scc',
      controlIds: [],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [],
      processorProfileIds: ['prof_us_cloud'],
      transferArrangementIds: ['trans_us_compute'],
      collectedAt: now,
      currentVersion: 1,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 5. Seed Processor 2 (Tenant A: Medium Criticality, Local EU Transfer, Adequacy, No Restricted Transfer)
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_eu_analytics`).set({
      id: 'prof_eu_analytics',
      tenantId: tenantA,
      vendorId: 'vnd_eu_analytics_gmbh',
      engagementName: 'EU Local Analytics Engine',
      processorRole: 'data_processor',
      serviceDescription: 'Privacy-preserving aggregate analytics in Germany',
      dataCategories: ['telemetry'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE'],
      linkedSystemAssetIds: ['asset_analytics_lake'],
      criticality: 'medium',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2026-06-01T00:00:00.000Z',
      nextReviewDate: '2027-06-01T00:00:00.000Z', // On track
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-06-01T00:00:00.000Z',
      linkedDpaEvidenceId: 'ev_eu_dpa',
      linkedRiskIds: [],
      notes: null,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_eu_analytics`).set({
      id: 'trans_eu_analytics',
      processorProfileId: 'prof_eu_analytics',
      vendorId: 'vnd_eu_analytics_gmbh',
      tenantId: tenantA,
      name: 'EU Internal Analytics Feed',
      restrictedTransfer: false,
      destinationCountries: ['DE'],
      eeaStatus: 'within_eea',
      transferScopes: ['analytics'],
      transferMechanismType: 'adequacy_decision',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-06-01T00:00:00.000Z',
      reviewDueDate: '2027-06-01T00:00:00.000Z',
      supplementaryMeasuresSummary: null,
      subprocessorInvolvement: false,
      linkedTiaId: null,
      linkedEvidenceIds: ['ev_eu_dpa'],
      rationale: 'Intra-EEA processing',
      notes: null,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 6. Seed Processor 3 (Tenant A: High Criticality, Under Review status, Restricted Transfer to India, Missing TIA, Missing Evidence)
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_in_support`).set({
      id: 'prof_in_support',
      tenantId: tenantA,
      vendorId: 'vnd_in_support_ltd',
      engagementName: 'India 24/7 Follow-the-Sun Support',
      processorRole: 'subprocessor',
      serviceDescription: 'Tier 2 customer support remote console access',
      dataCategories: ['contact_details', 'user_content'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['IN'],
      linkedSystemAssetIds: ['asset_crm_portal'],
      criticality: 'high',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'semi_annually',
      lastReviewDate: null,
      nextReviewDate: '2026-08-20T00:00:00.000Z', // Due in <30 days
      status: 'under_review',
      dpaSigned: false, // Missing DPA
      dpaDate: null,
      linkedDpaEvidenceId: null,
      linkedRiskIds: [],
      notes: null,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_in_support`).set({
      id: 'trans_in_support',
      processorProfileId: 'prof_in_support',
      vendorId: 'vnd_in_support_ltd',
      tenantId: tenantA,
      name: 'India Support Remote Access Channel',
      restrictedTransfer: true,
      destinationCountries: ['IN'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['support_access', 'subprocessing'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'under_review',
      effectiveDate: '2026-02-01T00:00:00.000Z',
      reviewDueDate: '2026-08-20T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Role-based access control with session recording',
      subprocessorInvolvement: true,
      linkedTiaId: null, // Missing TIA
      linkedEvidenceIds: [], // Missing Evidence
      rationale: '24/7 support',
      notes: null,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 7. Seed System Assets
    await db.doc(`tenants/${tenantA}/system_assets/asset_prod_api`).set({
      id: 'asset_prod_api',
      tenantId: tenantA,
      name: 'Production API Gateway',
      assetType: 'cloud_infrastructure',
      criticality: 'tier_1_critical',
      dataClassification: 'restricted_personal',
      hostingLocation: 'US-East',
      vendorId: 'vnd_hyperscaler_us',
      containsPersonalData: true,
      containsSpecialCategoryData: false,
      containsTrainingData: false,
      processorProfileIds: ['prof_us_cloud'],
      status: 'active',
      ownerId: PERSONAS.adminA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
    });

    await db.doc(`tenants/${tenantA}/system_assets/asset_crm_portal`).set({
      id: 'asset_crm_portal',
      tenantId: tenantA,
      name: 'Global CRM Support Portal',
      assetType: 'internal_software',
      criticality: 'tier_2_significant',
      dataClassification: 'confidential',
      hostingLocation: 'Frankfurt',
      vendorId: 'vnd_in_support_ltd',
      containsPersonalData: true,
      containsSpecialCategoryData: false,
      containsTrainingData: false,
      processorProfileIds: ['prof_in_support'],
      status: 'active',
      ownerId: PERSONAS.adminA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
    });

    // 8. Seed Tenant B Processor (Isolate from Tenant A)
    await db.doc(`tenants/${tenantB}/processor_profiles/prof_tenant_b_proc`).set({
      id: 'prof_tenant_b_proc',
      tenantId: tenantB,
      vendorId: 'vnd_tenant_b_host',
      engagementName: 'Tenant B Isolated Hosting',
      processorRole: 'data_processor',
      serviceDescription: 'Tenant B only',
      dataCategories: ['user_content'],
      dataSubjects: ['patients'],
      isSpecialCategoryData: true,
      jurisdictions: ['FR'],
      linkedSystemAssetIds: [],
      criticality: 'critical',
      ownerUserId: PERSONAS.adminB.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2026-01-01T00:00:00.000Z',
      nextReviewDate: '2027-01-01T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-01T00:00:00.000Z',
      linkedDpaEvidenceId: null,
      linkedRiskIds: [],
      notes: null,
      ownerId: PERSONAS.adminB.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminB.uid,
      updatedBy: PERSONAS.adminB.uid,
    });
  });
});

describe('Processor Inventory Multi-Dimensional Query & Filter Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Direct Firestore Security Rules & Query Isolation
  // ---------------------------------------------------------------------------
  describe('1. Security Rules & Query Permissions', () => {
    test('Privacy Officer in Tenant A can query processor profiles with filters', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Query active status
      const activeSnap = await assertSucceeds(
        privDb.collection(`tenants/${tenantA}/processor_profiles`).where('status', '==', 'active').get()
      );
      expect(activeSnap.docs.length).toBe(2);

      // Query critical criticality
      const critSnap = await assertSucceeds(
        privDb.collection(`tenants/${tenantA}/processor_profiles`).where('criticality', '==', 'critical').get()
      );
      expect(critSnap.docs.length).toBe(1);
      expect(critSnap.docs[0]!.id).toBe('prof_us_cloud');
    });

    test('Viewer in Tenant A can list processor profiles but is denied write access', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      const snap = await assertSucceeds(
        viewerDb.collection(`tenants/${tenantA}/processor_profiles`).get()
      );
      expect(snap.docs.length).toBe(3);

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_us_cloud`).update({
          status: 'offboarded',
        })
      );
    });

    test('Cross-Tenant Isolation: Tenant B Admin cannot query Tenant A processor collection', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.collection(`tenants/${tenantA}/processor_profiles`).get()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Inventory Filtering Engine Logic (Unit verification)
  // ---------------------------------------------------------------------------
  describe('2. Multi-Dimensional Filter Derivation', () => {
    test('filters processors by restricted transfer flag and destination country correctly', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const allTransfersSnap = await privDb.collection(`tenants/${tenantA}/transfer_arrangements`).get();
      const allTransfers = allTransfersSnap.docs.map((d) => d.data() as TransferArrangement);

      // Restricted transfers count
      const restrictedTransfers = allTransfers.filter((t) => t.restrictedTransfer);
      expect(restrictedTransfers.length).toBe(2); // US and IN

      // Filter by country IN
      const inTransfers = allTransfers.filter((t) => t.destinationCountries.includes('IN'));
      expect(inTransfers.length).toBe(1);
      expect(inTransfers[0]!.processorProfileId).toBe('prof_in_support');

      // Filter by country DE
      const deTransfers = allTransfers.filter((t) => t.destinationCountries.includes('DE'));
      expect(deTransfers.length).toBe(1);
      expect(deTransfers[0]!.processorProfileId).toBe('prof_eu_analytics');
    });

    test('identifies missing TIA for restricted transfers without linked TIA', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const allTransfersSnap = await privDb.collection(`tenants/${tenantA}/transfer_arrangements`).get();
      const allTransfers = allTransfersSnap.docs.map((d) => d.data() as TransferArrangement);

      const missingTiaTransfers = allTransfers.filter((t) => t.restrictedTransfer && !t.linkedTiaId);
      expect(missingTiaTransfers.length).toBe(1);
      expect(missingTiaTransfers[0]!.processorProfileId).toBe('prof_in_support');
    });

    test('identifies review overdue processors based on reviewDueDate', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const allProfilesSnap = await privDb.collection(`tenants/${tenantA}/processor_profiles`).get();
      const allProfiles = allProfilesSnap.docs.map((d) => d.data() as ProcessorProfile);

      const nowMillis = new Date('2026-08-15T00:00:00.000Z').getTime();
      const overdueProfiles = allProfiles.filter((p) => {
        if (!p.nextReviewDate) return false;
        return new Date(p.nextReviewDate).getTime() < nowMillis;
      });

      expect(overdueProfiles.length).toBe(1);
      expect(overdueProfiles[0]!.id).toBe('prof_us_cloud');
    });
  });
});

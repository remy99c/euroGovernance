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
  deriveTransferArrangementTIAStatus,
  deriveProcessorTIAStatus,
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
    const now = new Date().toISOString();

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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.contributorA.uid}`).set({
      userId: PERSONAS.contributorA.uid,
      tenantId: tenantA,
      role: PERSONAS.contributorA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed initial TIA and Transfer Arrangement in Tenant A
    await db.doc(`tenants/${tenantA}/tia_assessments/tia_sec_us_2026`).set({
      id: 'tia_sec_us_2026',
      tenantId: tenantA,
      code: 'TIA-US-2026-01',
      title: 'Schrems II Assessment for US Cloud Subprocessing',
      vendorId: 'vnd_datadog_inc',
      destinationCountry: 'US',
      legalMechanism: 'standard_contractual_clauses',
      destinationCountryLegalAssessment: 'FISA 702 and EO 14086 redress evaluation complete.',
      supplementaryTechnicalMeasures: 'End-to-end encryption with KMS keys held in Frankfurt.',
      supplementaryContractualMeasures: 'Mandatory warrant challenge clause.',
      status: 'approved',
      residualRiskLevel: 'low',
      approvedBy: PERSONAS.privacyA.uid,
      approvedAt: now,
      transferArrangementId: null,
      processorProfileId: null,
      nextReviewDate: '2027-08-15T00:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_datadog_us`).set({
      id: 'trans_datadog_us',
      tenantId: tenantA,
      processorProfileId: 'prof_datadog_main',
      vendorId: 'vnd_datadog_inc',
      name: 'Datadog US Telemetry Transfer',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['analytics', 'support_access'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-01-01T00:00:00.000Z',
      reviewDueDate: '2027-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Frankfurt key management',
      subprocessorInvolvement: false,
      linkedTiaId: null,
      linkedEvidenceIds: [],
      rationale: 'Telemetry processing under SCC Module 2',
      notes: null,
      status: 'active_valid',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });
  });
});

describe('Processor Transfer & TIA Assessment Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. Status Derivation (Missing, In Progress, Approved, Stale, Not Applicable)
  // ---------------------------------------------------------------------------
  describe('1. Pure Status Derivation & Posture Calculation', () => {
    const baseProfile: ProcessorProfile = {
      id: 'prof_salesforce_crm',
      tenantId: tenantA,
      vendorId: 'vnd_salesforce_inc',
      engagementName: 'Enterprise CRM',
      processorRole: 'data_processor',
      serviceDescription: 'Sales and customer relationship management platform',
      dataCategories: ['contact_details', 'sales_opportunities'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'DE'],
      linkedSystemAssetIds: ['asset_crm_01'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2026-01-01T00:00:00.000Z',
      nextReviewDate: '2027-01-01T00:00:00.000Z',
      status: 'active',
      notes: null,
      dpaSigned: true,
      dpaDate: '2025-01-01T00:00:00.000Z',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    };

    test('derives not_applicable for transfers strictly within the EEA', () => {
      const eeaTransfer: TransferArrangement = {
        id: 'trans_eea_germany',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_crm',
        vendorId: 'vnd_salesforce_inc',
        name: 'Frankfurt Local CRM Node',
        restrictedTransfer: false, // Within EEA
        destinationCountries: ['DE'],
        eeaStatus: 'within_eea',
        transferScopes: ['hosting'],
        transferMechanismType: 'other',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: null,
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: false,
        linkedTiaId: null,
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const status = deriveTransferArrangementTIAStatus(eeaTransfer, null, now);
      expect(status).toBe('not_applicable');

      const profilePosture = deriveProcessorTIAStatus(baseProfile, [eeaTransfer], [], now);
      expect(profilePosture).toBe('not_applicable');
    });

    test('derives tia_missing when restricted transfer has no linked TIA', () => {
      const unlinkedRestrictedTransfer: TransferArrangement = {
        id: 'trans_us_missing_tia',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_crm',
        vendorId: 'vnd_salesforce_inc',
        name: 'US Live Analytics Replication',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['analytics'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'TLS 1.3',
        subprocessorInvolvement: false,
        linkedTiaId: null, // NO TIA LINKED!
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const status = deriveTransferArrangementTIAStatus(unlinkedRestrictedTransfer, null, now);
      expect(status).toBe('tia_missing');

      const profilePosture = deriveProcessorTIAStatus(baseProfile, [unlinkedRestrictedTransfer], [], now);
      expect(profilePosture).toBe('tia_missing');
    });

    test('derives tia_in_progress when linked TIA is in draft or in_review', () => {
      const restrictedTransfer: TransferArrangement = {
        id: 'trans_us_in_progress',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_crm',
        vendorId: 'vnd_salesforce_inc',
        name: 'US Support Transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['support_access'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'TLS 1.3',
        subprocessorInvolvement: false,
        linkedTiaId: 'tia_sf_us_draft',
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const inReviewTIA = {
        id: 'tia_sf_us_draft',
        status: 'in_review',
        approvedAt: null,
        nextReviewDate: null,
      };

      const status = deriveTransferArrangementTIAStatus(restrictedTransfer, inReviewTIA, now);
      expect(status).toBe('tia_in_progress');

      const profilePosture = deriveProcessorTIAStatus(baseProfile, [restrictedTransfer], [inReviewTIA], now);
      expect(profilePosture).toBe('tia_in_progress');
    });

    test('derives tia_approved for freshly approved TIA and tia_stale for expired review dates', () => {
      const restrictedTransfer: TransferArrangement = {
        id: 'trans_us_approved',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_crm',
        vendorId: 'vnd_salesforce_inc',
        name: 'US Approved Transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'TLS 1.3 & AES-256 with KMS EU keys',
        subprocessorInvolvement: false,
        linkedTiaId: 'tia_sf_us_approved',
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // 1. Freshly approved TIA (approved within 3 months, future review date in 2027)
      const freshTIA = {
        id: 'tia_sf_us_approved',
        status: 'approved',
        approvedAt: '2026-06-01T00:00:00.000Z',
        nextReviewDate: '2027-06-01T00:00:00.000Z',
      };
      expect(deriveTransferArrangementTIAStatus(restrictedTransfer, freshTIA, now)).toBe('tia_approved');

      // 2. Stale TIA (approved in 2024, review date was in Jan 2025 - past current time Aug 2026)
      const staleTIA = {
        id: 'tia_sf_us_approved',
        status: 'approved',
        approvedAt: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
      };
      expect(deriveTransferArrangementTIAStatus(restrictedTransfer, staleTIA, now)).toBe('tia_stale');
      expect(deriveProcessorTIAStatus(baseProfile, [restrictedTransfer], [staleTIA], now)).toBe('tia_stale');
    });

    test('multi-transfer aggregation: reflects tia_missing if any single restricted transfer lacks a TIA', () => {
      const approvedTransfer: TransferArrangement = {
        id: 'trans_1_approved',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_crm',
        vendorId: 'vnd_salesforce_inc',
        name: 'US Transfer 1',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: false,
        linkedTiaId: 'tia_1',
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const missingTransfer: TransferArrangement = {
        ...approvedTransfer,
        id: 'trans_2_missing',
        name: 'India Support Transfer 2',
        destinationCountries: ['IN'],
        linkedTiaId: null, // Missing!
      };

      const tia1 = {
        id: 'tia_1',
        status: 'approved',
        approvedAt: '2026-06-01T00:00:00.000Z',
        nextReviewDate: '2027-06-01T00:00:00.000Z',
      };

      // Aggregation prioritizes highest risk indicator (tia_missing > tia_stale > tia_in_progress > tia_approved)
      const posture = deriveProcessorTIAStatus(baseProfile, [approvedTransfer, missingTransfer], [tia1], now);
      expect(posture).toBe('tia_missing');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Linking & Prefill Integrity via Firestore Security Rules
  // ---------------------------------------------------------------------------
  describe('2. Linking & Prefill Relationship Integrity', () => {
    test('Privacy Manager can link existing TIA to transfer arrangement and sync reciprocal identifiers', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const tiaId = 'tia_sec_us_2026';

      // 1. Link TIA to Transfer Arrangement
      await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_datadog_us`).update({
          linkedTiaId: tiaId,
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );

      // 3. Link Transfer Arrangement to TIA
      await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).update({
          transferArrangementId: 'trans_datadog_us',
          processorProfileId: 'prof_datadog_main',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );

      // Verify mutual linkage
      const arrSnap = await privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_datadog_us`).get();
      const tiaSnap = await privacyDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).get();

      expect(arrSnap.data()?.linkedTiaId).toBe(tiaId);
      expect(tiaSnap.data()?.transferArrangementId).toBe('trans_datadog_us');
      expect(tiaSnap.data()?.processorProfileId).toBe('prof_datadog_main');
    });

    test('Cross-tenant isolation: Tenant B admin cannot link or access Tenant A TIAs or transfer arrangements', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Tenant B Admin cannot mutate Tenant A transfer arrangement
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_datadog_us`).update({
          linkedTiaId: 'injected_tia_id',
        })
      );

      // Tenant B Admin cannot read Tenant A TIA assessments
      await assertFails(adminBDb.doc(`tenants/${tenantA}/tia_assessments/tia_sec_us_2026`).get());
    });
  });
});

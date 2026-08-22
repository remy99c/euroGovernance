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
  validateTransferArrangement,
  TransferMechanismType,
  TransferMechanismStatus,
  TransferScopeType,
  EEATransferStatus,
  Vendor,
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
      userId: PERSONAS.securityA.uid,
      tenantId: tenantA,
      role: PERSONAS.securityA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.contributorA.uid}`).set({
      userId: PERSONAS.contributorA.uid,
      tenantId: tenantA,
      role: PERSONAS.contributorA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.auditorA.uid}`).set({
      userId: PERSONAS.auditorA.uid,
      tenantId: tenantA,
      role: PERSONAS.auditorA.role,
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

    // 4. Seed Commercial Vendor & Processor Profile in Tenant A
    const masterVendor: Vendor = {
      id: 'vnd_snowflake_inc',
      tenantId: tenantA,
      name: 'Snowflake Computing Inc.',
      category: 'cloud_provider',
      riskTier: 'high',
      primaryContactName: 'Privacy Officer',
      primaryContactEmail: 'privacy@snowflake.com',
      dpaSigned: true,
      dpaDate: '2025-02-01T00:00:00.000Z',
      securityAssessmentDate: '2025-02-01T00:00:00.000Z',
      nextAssessmentDueDate: '2026-02-01T00:00:00.000Z',
      countryOfIncorporation: 'United States',
      dataHostingRegions: ['us-east-1', 'eu-west-1'],
      subprocessorsListed: ['AWS', 'Azure'],
      commercialStatus: 'active',
      hasProcessorProfile: true,
      activeProcessorProfileId: 'prof_snowflake_warehouse',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
      ownerId: PERSONAS.adminA.uid,
    };
    await db.doc(`tenants/${tenantA}/vendors/vnd_snowflake_inc`).set(masterVendor);

    const processorProfile: ProcessorProfile = {
      id: 'prof_snowflake_warehouse',
      tenantId: tenantA,
      vendorId: 'vnd_snowflake_inc',
      processorRole: 'data_processor',
      serviceDescription: 'Enterprise Cloud Data Lake and Analytics Warehouse',
      dataCategories: ['financial_data', 'customer_transactions', 'pseudonymized_ids'],
      dataSubjects: ['customers', 'business_partners'],
      isSpecialCategoryData: false,
      specialCategoryTypes: null,
      jurisdictions: ['US', 'DE', 'IE'],
      linkedSystemAssetIds: ['asset_snowflake_prod_01'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2025-02-01T00:00:00.000Z',
      nextReviewDate: '2026-02-01T00:00:00.000Z',
      status: 'active',
      notes: 'Global Data Processing Agreement signed with EU SCCs & DPF certification',
      dpaSigned: true,
      dpaDate: '2025-02-01T00:00:00.000Z',
      linkedDpaEvidenceId: 'ev_snowflake_dpa_2025',
      linkedTiaId: 'tia_snowflake_us_2025',
      linkedRopaIds: ['ropa_analytics_pipeline'],
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    };
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_snowflake_warehouse`).set(processorProfile);
  });
});

describe('Transfer Arrangements & Cross-Border Governance Suite', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Data Model Validation & Mechanism Guardrails
  // ---------------------------------------------------------------------------
  describe('1. Transfer Arrangement Data Model Validation', () => {
    test('validates complete, compliant transfer arrangement across mechanisms (SCC, Adequacy, BCR, Derogation)', () => {
      // Mechanism 1: Standard Contractual Clauses (SCC)
      const sccTransfer: TransferArrangement = {
        id: 'trans_scc_snowflake_us',
        tenantId: tenantA,
        processorProfileId: 'prof_snowflake_warehouse',
        vendorId: 'vnd_snowflake_inc',
        name: 'Snowflake US Tier 3 Engineering Support Remote Access',
        restrictedTransfer: true,
        destinationCountries: ['US', 'IN'],
        eeaStatus: 'third_country_non_adequate' as EEATransferStatus,
        transferScopes: ['support_access', 'maintenance'] as TransferScopeType[],
        transferScopeDescription: 'Read-only escalated support access to data warehouse cluster metadata',
        transferMechanismType: 'standard_contractual_clauses' as TransferMechanismType,
        transferMechanismStatus: 'active_valid' as TransferMechanismStatus,
        effectiveDate: '2025-02-01T00:00:00.000Z',
        reviewDueDate: '2026-02-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'Client-side encryption using Customer-Managed Keys (AWS KMS in Frankfurt); MFA and ephemeral session logging for support engineers.',
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['Snowflake India Private Limited'],
        linkedTiaId: 'tia_snowflake_us_2025',
        linkedEvidenceIds: ['ev_scc_module2_signed_pdf'],
        rationale: 'Necessary for 24/7 incident resolution under signed EU Standard Contractual Clauses (Module 2).',
        notes: 'Annual TIA review required.',
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const sccRes = validateTransferArrangement(sccTransfer);
      expect(sccRes.valid).toBe(true);
      expect(sccRes.errors.length).toBe(0);

      // Mechanism 2: Adequacy Decision (EU-US Data Privacy Framework)
      const adequacyTransfer: TransferArrangement = {
        ...sccTransfer,
        id: 'trans_dpf_snowflake_us',
        name: 'EU-US Data Privacy Framework Self-Certification Transfer',
        eeaStatus: 'third_country_adequate',
        transferMechanismType: 'adequacy_decision',
        transferMechanismStatus: 'active_valid',
        supplementaryMeasuresSummary: 'Active DPF active list verification conducted on DoC registry.',
        linkedEvidenceIds: ['ev_dpf_cert_verification_pdf'],
      };
      expect(validateTransferArrangement(adequacyTransfer).valid).toBe(true);

      // Mechanism 3: Binding Corporate Rules (BCR)
      const bcrTransfer: TransferArrangement = {
        ...sccTransfer,
        id: 'trans_bcr_snowflake_group',
        name: 'Intra-Group Transfers under Approved BCR-P',
        transferMechanismType: 'binding_corporate_rules',
        transferMechanismStatus: 'active_valid',
      };
      expect(validateTransferArrangement(bcrTransfer).valid).toBe(true);

      // Mechanism 4: GDPR Article 49 Derogation (Explicit Consent / Legal Claims)
      const derogationTransfer: TransferArrangement = {
        ...sccTransfer,
        id: 'trans_derogation_litigation',
        name: 'Ad-hoc Discovery Transfer under Art. 49(1)(e)',
        transferMechanismType: 'derogation_art49',
        transferMechanismStatus: 'active_valid',
        rationale: 'Occasional transfer strictly necessary for the establishment of legal claims.',
      };
      expect(validateTransferArrangement(derogationTransfer).valid).toBe(true);
    });

    test('rejects invalid payloads: missing processorProfileId, empty countries, or invalid enum values', () => {
      // 1. Missing processorProfileId
      const missingProfile = {
        tenantId: tenantA,
        name: 'Invalid transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: now,
      };
      expect(validateTransferArrangement(missingProfile).valid).toBe(false);

      // 2. Empty destination countries
      const emptyCountries = {
        ...missingProfile,
        processorProfileId: 'prof_123',
        destinationCountries: [],
      };
      expect(validateTransferArrangement(emptyCountries).valid).toBe(false);

      // 3. Invalid mechanism type
      const invalidMechanism = {
        ...missingProfile,
        processorProfileId: 'prof_123',
        transferMechanismType: 'unrecognized_loophole',
      };
      expect(validateTransferArrangement(invalidMechanism).valid).toBe(false);

      // 4. Invalid transfer scope
      const invalidScope = {
        ...missingProfile,
        processorProfileId: 'prof_123',
        transferScopes: ['unauthorized_data_leaking'],
      };
      expect(validateTransferArrangement(invalidScope).valid).toBe(false);

      // 5. Invalid date
      const invalidDate = {
        ...missingProfile,
        processorProfileId: 'prof_123',
        effectiveDate: 'not-a-valid-date-string',
      };
      expect(validateTransferArrangement(invalidDate).valid).toBe(false);
    });

    test('legal guardrail: rejects active restricted transfers with no_mechanism_selected', () => {
      const illegalActiveTransfer = {
        tenantId: tenantA,
        processorProfileId: 'prof_snowflake_warehouse',
        name: 'Unprotected US Live Replication',
        restrictedTransfer: true, // Data leaves EEA to third country
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate' as EEATransferStatus,
        transferScopes: ['hosting'] as TransferScopeType[],
        transferMechanismType: 'no_mechanism_selected' as TransferMechanismType,
        transferMechanismStatus: 'active_valid' as TransferMechanismStatus, // Cannot be active without legal mechanism!
        effectiveDate: now,
      };

      const result = validateTransferArrangement(illegalActiveTransfer);
      expect(result.valid).toBe(false);
      expect(result.errors).toContain(
        'An active restricted cross-border transfer must have an authorized transfer mechanism selected (e.g. SCC, Adequacy Decision, BCR, or Derogation).'
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Multiplicity: Multiple Arrangements per Processor
  // ---------------------------------------------------------------------------
  describe('2. Multiple Transfer Arrangements per Processor Profile', () => {
    test('supports multiple distinct transfer arrangements under a single processor profile', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Arrangement 1: Primary Hosting in Ireland/Germany (Within EEA)
      const eeaHosting: TransferArrangement = {
        id: 'trans_arr_01_eea_hosting',
        tenantId: tenantA,
        processorProfileId: 'prof_snowflake_warehouse',
        vendorId: 'vnd_snowflake_inc',
        name: 'EU Primary Data Warehouse Storage (Frankfurt / Dublin)',
        restrictedTransfer: false,
        destinationCountries: ['DE', 'IE'],
        eeaStatus: 'within_eea',
        transferScopes: ['hosting', 'backup'],
        transferScopeDescription: 'Primary active-active relational data warehouse and columnar storage',
        transferMechanismType: 'other',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'Within EEA boundaries; encrypted at rest (AES-256) and in transit (TLS 1.3).',
        subprocessorInvolvement: false,
        subprocessorsInvolved: [],
        linkedTiaId: null,
        linkedEvidenceIds: ['ev_eu_hosting_attestation'],
        rationale: 'Standard intra-EEA storage.',
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // Arrangement 2: Escalated Support Remote Access in United States (Restricted - SCCs)
      const usSupport: TransferArrangement = {
        id: 'trans_arr_02_us_support',
        tenantId: tenantA,
        processorProfileId: 'prof_snowflake_warehouse',
        vendorId: 'vnd_snowflake_inc',
        name: 'US Escalation & Tier-3 Support Access',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['support_access', 'maintenance'],
        transferScopeDescription: 'Escalated remote debugger access during production outages',
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-02-01T00:00:00.000Z',
        reviewDueDate: '2026-02-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'Zero-trust bastion session logging, client pseudonymization keys kept on-premise in Munich.',
        subprocessorInvolvement: false,
        subprocessorsInvolved: [],
        linkedTiaId: 'tia_snowflake_us_2025',
        linkedEvidenceIds: ['ev_scc_signed_2025_pdf'],
        rationale: 'Governed by Module 2 (Controller-to-Processor) Standard Contractual Clauses.',
        notes: 'Subject to Schrems II supplementary measures.',
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // Arrangement 3: Subprocessing & Follow-The-Sun Monitoring in India (Restricted - SCCs + Subprocessing)
      const inSubprocessing: TransferArrangement = {
        id: 'trans_arr_03_india_ops',
        tenantId: tenantA,
        processorProfileId: 'prof_snowflake_warehouse',
        vendorId: 'vnd_snowflake_inc',
        name: 'India 24/7 Security Operations Center Telemetry Monitoring',
        restrictedTransfer: true,
        destinationCountries: ['IN'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['subprocessing', 'analytics'],
        transferScopeDescription: 'Subprocessor monitoring of anonymized security logs and query performance metrics',
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-03-01T00:00:00.000Z',
        reviewDueDate: '2026-03-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'Data is strictly pseudonymized; no plain text financial records accessible from India.',
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['Snowflake India Private Limited'],
        linkedTiaId: 'tia_india_soc_2025',
        linkedEvidenceIds: ['ev_subprocessor_scc_in_pdf'],
        rationale: 'Subprocessor authorization under GDPR Art. 28(2) and Art. 46 SCCs.',
        notes: 'Annual audit certificate provided by auditor.',
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // Save all three arrangements
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_01_eea_hosting`).set(eeaHosting));
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_02_us_support`).set(usSupport));
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_03_india_ops`).set(inSubprocessing));

      // Verify all 3 are stored under the same processor profile
      const snap1 = await privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_01_eea_hosting`).get();
      const snap2 = await privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_02_us_support`).get();
      const snap3 = await privacyDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_arr_03_india_ops`).get();

      expect(snap1.exists).toBe(true);
      expect(snap2.exists).toBe(true);
      expect(snap3.exists).toBe(true);

      expect(snap1.data()?.processorProfileId).toBe('prof_snowflake_warehouse');
      expect(snap2.data()?.processorProfileId).toBe('prof_snowflake_warehouse');
      expect(snap3.data()?.processorProfileId).toBe('prof_snowflake_warehouse');

      expect(snap1.data()?.restrictedTransfer).toBe(false);
      expect(snap2.data()?.restrictedTransfer).toBe(true);
      expect(snap3.data()?.restrictedTransfer).toBe(true);
      expect(snap3.data()?.subprocessorInvolvement).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Security Rules, RBAC & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('3. Transfer Arrangements RBAC & Multi-Tenant Isolation', () => {
    test('Compliance Manager and Privacy Manager can create and update arrangements; Contributors cannot', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      const arrangementDoc = compDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_comp_test`);

      // 1. Compliance Manager creates arrangement
      await assertSucceeds(
        arrangementDoc.set({
          id: 'trans_comp_test',
          tenantId: tenantA,
          processorProfileId: 'prof_snowflake_warehouse',
          vendorId: 'vnd_snowflake_inc',
          name: 'Compliance Test Transfer',
          restrictedTransfer: false,
          destinationCountries: ['FR'],
          eeaStatus: 'within_eea',
          transferScopes: ['backup'],
          transferMechanismType: 'other',
          transferMechanismStatus: 'active_valid',
          effectiveDate: now,
          reviewDueDate: null,
          supplementaryMeasuresSummary: null,
          subprocessorInvolvement: false,
          subprocessorsInvolved: [],
          linkedTiaId: null,
          linkedEvidenceIds: [],
          rationale: 'Local backup testing',
          notes: null,
          status: 'active_valid',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          ownerId: PERSONAS.complianceA.uid,
        })
      );

      // 2. Contributor cannot mutate arrangement
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_comp_test`).update({
          notes: 'Unauthorized modification attempt',
        })
      );

      // 3. Contributor cannot create arrangement
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_contrib_attempt`).set({
          id: 'trans_contrib_attempt',
          tenantId: tenantA,
          processorProfileId: 'prof_snowflake_warehouse',
          name: 'Contributor Attempt',
          restrictedTransfer: false,
          destinationCountries: ['FR'],
          eeaStatus: 'within_eea',
          transferScopes: ['backup'],
          transferMechanismType: 'other',
          transferMechanismStatus: 'active_valid',
          effectiveDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.contributorA.uid,
          updatedBy: PERSONAS.contributorA.uid,
          ownerId: PERSONAS.contributorA.uid,
        })
      );
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or write Tenant A transfer arrangements', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Pre-seed arrangement in Tenant A
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/transfer_arrangements/trans_a_secret`).set({
          id: 'trans_a_secret',
          tenantId: tenantA,
          processorProfileId: 'prof_snowflake_warehouse',
          name: 'Confidential US Transfer',
          restrictedTransfer: true,
          destinationCountries: ['US'],
          eeaStatus: 'third_country_non_adequate',
          transferScopes: ['hosting'],
          transferMechanismType: 'standard_contractual_clauses',
          transferMechanismStatus: 'active_valid',
          effectiveDate: now,
          status: 'active_valid',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.privacyA.uid,
          updatedBy: PERSONAS.privacyA.uid,
          ownerId: PERSONAS.privacyA.uid,
        });
      });

      // Tenant B Admin cannot read Tenant A arrangement
      await assertFails(adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_a_secret`).get());

      // Tenant B Admin cannot write to Tenant A
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_b_injection`).set({
          id: 'trans_b_injection',
          tenantId: tenantA,
          processorProfileId: 'prof_snowflake_warehouse',
          name: 'Injected Transfer',
          restrictedTransfer: true,
          destinationCountries: ['US'],
          eeaStatus: 'third_country_non_adequate',
          transferScopes: ['hosting'],
          transferMechanismType: 'standard_contractual_clauses',
          transferMechanismStatus: 'active_valid',
          effectiveDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.adminB.uid,
          updatedBy: PERSONAS.adminB.uid,
          ownerId: PERSONAS.adminB.uid,
        })
      );
    });
  });
});

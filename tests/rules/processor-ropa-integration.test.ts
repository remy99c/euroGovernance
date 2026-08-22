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
  ROPAEntry,
  prefillROPAFromProcessors,
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

    // 4. Seed Processor Profile
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_hubspot_marketing`).set({
      id: 'prof_hubspot_marketing',
      tenantId: tenantA,
      vendorId: 'vnd_hubspot_inc',
      engagementName: 'Inbound Marketing & Lead Nurturing',
      processorRole: 'data_processor',
      serviceDescription: 'Marketing automation and newsletter delivery',
      dataCategories: ['email_address', 'ip_address', 'clickstream_behavior'],
      dataSubjects: ['prospects', 'newsletter_subscribers'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'IE'],
      linkedSystemAssetIds: ['asset_hubspot_portal'],
      criticality: 'medium',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: null,
      nextReviewDate: '2027-08-15T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-10T00:00:00.000Z',
      linkedDpaEvidenceId: 'evi_hubspot_dpa',
      linkedTiaId: null,
      linkedRopaIds: [],
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    // 5. Seed Transfer Arrangement
    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_hubspot_us`).set({
      id: 'trans_hubspot_us',
      tenantId: tenantA,
      processorProfileId: 'prof_hubspot_marketing',
      vendorId: 'vnd_hubspot_inc',
      name: 'HubSpot US Lead Sync',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_adequate', // EU-US DPF certified
      transferScopes: ['hosting', 'analytics'],
      transferMechanismType: 'adequacy_decision',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-01-01T00:00:00.000Z',
      reviewDueDate: '2027-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'EU-US Data Privacy Framework Self-Certification',
      subprocessorInvolvement: false,
      linkedTiaId: null,
      linkedEvidenceIds: [],
      rationale: 'Adequacy decision under Art. 45 GDPR',
      notes: null,
      status: 'active_valid',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    // 6. Seed initial ROPA Entry in Tenant A
    await db.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).set({
      id: 'ropa_marketing_outreach',
      tenantId: tenantA,
      activityCode: 'ROPA-MKT-01',
      activityName: 'Digital Marketing & Lead Generation',
      purpose: 'Sending marketing campaigns and measuring engagement',
      legalBasis: 'consent',
      legalBasisRationale: 'Explicit opt-in consent captured via website signup forms',
      isSpecialCategoryData: false,
      specialCategoryBasis: null,
      dataSubjectCategories: ['prospects', 'newsletter_subscribers'],
      personalDataCategories: ['email_address', 'ip_address'],
      retentionPeriodDescription: '24 months following last positive interaction or until consent withdrawal',
      retentionPeriodMonths: 24,
      dataSecurityMeasuresSummary: 'Role-based access control, TLS encryption',
      jointControllerInfo: null,
      processorIds: ['vnd_hubspot_inc'],
      processorProfileIds: ['prof_hubspot_marketing'],
      transferArrangementIds: ['trans_hubspot_us'],
      recipientCategories: ['marketing_agency'],
      involvesInternationalTransfer: true,
      destinationCountries: ['US', 'IE'],
      transferMechanism: 'adequacy_decision',
      dpiaRequired: false,
      linkedDpiaId: null,
      linkedTiaId: null,
      linkedSystemAssetIds: ['asset_hubspot_portal'],
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });
  });
});

describe('Processor Profiles & ROPA Entries Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. Prefill Synthesis & Synthesis Logic
  // ---------------------------------------------------------------------------
  describe('1. Pure Synthesis & Prefill Engine', () => {
    const profile1: ProcessorProfile = {
      id: 'prof_aws',
      tenantId: tenantA,
      vendorId: 'vnd_aws',
      processorRole: 'data_processor',
      serviceDescription: 'Hosting',
      dataCategories: ['user_login', 'ip_address'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE', 'IE'],
      linkedSystemAssetIds: ['asset_cloud'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: null,
      nextReviewDate: null,
      status: 'active',
      dpaSigned: true,
      dpaDate: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
      notes: null,
    };

    const profile2: ProcessorProfile = {
      id: 'prof_biometrics_vendor',
      tenantId: tenantA,
      vendorId: 'vnd_biometrics',
      processorRole: 'subprocessor',
      serviceDescription: 'Face Verification API',
      dataCategories: ['facial_geometry_template', 'photo_id'],
      dataSubjects: ['customers', 'employees'],
      isSpecialCategoryData: true, // Special category!
      specialCategoryTypes: ['biometrics'],
      jurisdictions: ['FR', 'US'],
      linkedSystemAssetIds: ['asset_kyc_gateway'],
      criticality: 'high',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: null,
      nextReviewDate: null,
      status: 'active',
      dpaSigned: true,
      dpaDate: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
      notes: null,
    };

    const transfer1: TransferArrangement = {
      id: 'trans_bio_us',
      tenantId: tenantA,
      processorProfileId: 'prof_biometrics_vendor',
      vendorId: 'vnd_biometrics',
      name: 'US Inference Pipeline',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['analytics'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-01-01T00:00:00.000Z',
      reviewDueDate: '2027-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'KMS Key encryption',
      subprocessorInvolvement: false,
      linkedTiaId: 'tia_bio_01',
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

    test('prefills ROPA fields combining categories, subjects, international transfers, and vendor normalization', () => {
      const prefill = prefillROPAFromProcessors([profile1, profile2], [transfer1]);

      expect(prefill.processorProfileIds).toEqual(['prof_aws', 'prof_biometrics_vendor']);
      expect(prefill.processorIds).toEqual(expect.arrayContaining(['vnd_aws', 'vnd_biometrics']));
      expect(prefill.transferArrangementIds).toEqual(['trans_bio_us']);
      expect(prefill.personalDataCategories).toEqual(
        expect.arrayContaining(['user_login', 'ip_address', 'facial_geometry_template', 'photo_id'])
      );
      expect(prefill.dataSubjectCategories).toEqual(expect.arrayContaining(['customers', 'employees']));
      expect(prefill.isSpecialCategoryData).toBe(true);
      expect(prefill.involvesInternationalTransfer).toBe(true);
      expect(prefill.destinationCountries).toEqual(expect.arrayContaining(['DE', 'IE', 'FR', 'US']));
      expect(prefill.transferMechanism).toBe('standard_contractual_clauses');
      expect(prefill.linkedSystemAssetIds).toEqual(expect.arrayContaining(['asset_cloud', 'asset_kyc_gateway']));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Linking & Reverse References via Firestore Security Rules
  // ---------------------------------------------------------------------------
  describe('2. Linking & Reverse References Security Rules', () => {
    test('Privacy Manager can link processor profile and transfer arrangement to ROPA', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Verify read of seeded ROPA
      const ropaSnap = await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).get()
      );
      expect(ropaSnap.exists).toBe(true);
      const data = ropaSnap.data() as ROPAEntry;
      expect(data.processorProfileIds).toContain('prof_hubspot_marketing');
      expect(data.transferArrangementIds).toContain('trans_hubspot_us');
      expect(data.processorIds).toContain('vnd_hubspot_inc');

      // Update ROPA with additional processor profile
      await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).update({
          processorProfileIds: ['prof_hubspot_marketing', 'prof_sendgrid_mail'],
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );

      // Verify updated ROPA
      const updatedSnap = await privacyDb.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).get();
      expect(updatedSnap.data()?.processorProfileIds).toEqual(['prof_hubspot_marketing', 'prof_sendgrid_mail']);
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or mutate Tenant A ROPA entries or processor links', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Cannot read Tenant A ROPA entry
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).get()
      );

      // Cannot update Tenant A ROPA entry
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/ropa_entries/ropa_marketing_outreach`).update({
          processorProfileIds: ['prof_injected'],
        })
      );
    });
  });
});

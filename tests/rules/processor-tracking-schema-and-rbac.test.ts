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
  validateProcessorProfile,
  computeNextReviewDate,
  ProcessorRole,
  ProcessorCriticality,
  ProcessorReviewCadence,
  ProcessorStatus,
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

    // 4. Seed Commercial Vendor in Tenant A
    const masterVendor: Vendor = {
      id: 'vnd_aws_emea',
      tenantId: tenantA,
      name: 'Amazon Web Services EMEA SARL',
      category: 'cloud_provider',
      riskTier: 'critical',
      primaryContactName: 'AWS Enterprise DPO',
      primaryContactEmail: 'aws-eu-dpo@amazon.com',
      dpaSigned: true,
      dpaDate: '2025-01-15T00:00:00.000Z',
      securityAssessmentDate: '2025-01-20T00:00:00.000Z',
      nextAssessmentDueDate: '2026-01-20T00:00:00.000Z',
      countryOfIncorporation: 'Luxembourg',
      dataHostingRegions: ['eu-central-1', 'eu-west-3'],
      subprocessorsListed: ['AWS Inc.', 'Annapurna Labs'],
      commercialStatus: 'active',
      hasProcessorProfile: false,
      activeProcessorProfileId: null,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
      ownerId: PERSONAS.adminA.uid,
    };
    await db.doc(`tenants/${tenantA}/vendors/vnd_aws_emea`).set(masterVendor);
  });
});

describe('Processor Tracking Schema, Validation & Multi-Tenant RBAC Suite', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Data Model Validation & Pure Helpers
  // ---------------------------------------------------------------------------
  describe('1. Processor Profile Model Validation', () => {
    test('validates complete, compliant processor profile payload', () => {
      const validProfile: ProcessorProfile = {
        id: 'proc_prof_aws_cloud',
        tenantId: tenantA,
        vendorId: 'vnd_aws_emea',
        processorRole: 'data_processor' as ProcessorRole,
        serviceDescription: 'Managed PostgreSQL Aurora & S3 Encrypted Storage for Customer Telemetry',
        dataCategories: ['contact_info', 'ip_address', 'usage_telemetry'],
        dataSubjects: ['customers', 'registered_users'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['DE', 'FR', 'EU'],
        linkedSystemAssetIds: ['asset_db_aurora_01', 'asset_s3_prod_01'],
        criticality: 'critical' as ProcessorCriticality,
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually' as ProcessorReviewCadence,
        lastReviewDate: '2026-01-10T10:00:00.000Z',
        nextReviewDate: '2027-01-10T10:00:00.000Z',
        status: 'active' as ProcessorStatus,
        notes: 'DPA and GDPR Art. 28 terms validated by DPO.',
        article28Checklist: {
          writtenInstructionsMandate: true,
          confidentialityDuty: true,
          securityMeasuresTOMs: true,
          subprocessorAuthorization: true,
          dataSubjectRightsAssistance: true,
          breachAssistance: true,
          dataReturnOrDeletion: true,
          auditInspectionRights: true,
        },
        dpaSigned: true,
        dpaDate: '2025-01-15T00:00:00.000Z',
        linkedDpaEvidenceId: 'ev_dpa_aws_2025',
        linkedTiaId: null,
        linkedRopaIds: ['ropa_cust_db_01'],
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const result = validateProcessorProfile(validProfile);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    test('rejects payloads missing vendorId, invalid roles, or empty data categories', () => {
      // 1. Missing vendorId
      const missingVendor = {
        tenantId: tenantA,
        processorRole: 'data_processor',
        serviceDescription: 'Telemetry storage',
        dataCategories: ['telemetry'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['DE'],
        criticality: 'high',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        status: 'active',
      };
      expect(validateProcessorProfile(missingVendor).valid).toBe(false);

      // 2. Invalid processor role
      const invalidRole = {
        ...missingVendor,
        vendorId: 'vnd_123',
        processorRole: 'unauthorized_entity',
      };
      expect(validateProcessorProfile(invalidRole).valid).toBe(false);

      // 3. Empty dataCategories
      const emptyDataCat = {
        ...missingVendor,
        vendorId: 'vnd_123',
        dataCategories: [],
      };
      expect(validateProcessorProfile(emptyDataCat).valid).toBe(false);

      // 4. Special category data true without types
      const missingSpecialCatTypes = {
        ...missingVendor,
        vendorId: 'vnd_123',
        isSpecialCategoryData: true,
        specialCategoryTypes: [],
      };
      expect(validateProcessorProfile(missingSpecialCatTypes).valid).toBe(false);

      // 5. Short service description (< 5 chars)
      const shortDesc = {
        ...missingVendor,
        vendorId: 'vnd_123',
        serviceDescription: 'db',
      };
      expect(validateProcessorProfile(shortDesc).valid).toBe(false);
    });

    test('computes nextReviewDate accurately for review cadences', () => {
      const baseDate = '2026-01-15T00:00:00.000Z';

      const nextMonthly = computeNextReviewDate(baseDate, 'monthly');
      expect(new Date(nextMonthly).getMonth()).toBe(1); // Feb

      const nextQuarterly = computeNextReviewDate(baseDate, 'quarterly');
      expect(new Date(nextQuarterly).getMonth()).toBe(3); // April

      const nextSemi = computeNextReviewDate(baseDate, 'semi_annually');
      expect(new Date(nextSemi).getMonth()).toBe(6); // July

      const nextAnnual = computeNextReviewDate(baseDate, 'annually');
      expect(new Date(nextAnnual).getFullYear()).toBe(2027);

      const nextBiennial = computeNextReviewDate(baseDate, 'biennially');
      expect(new Date(nextBiennial).getFullYear()).toBe(2028);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Security Rules & RBAC Tests
  // ---------------------------------------------------------------------------
  describe('2. Processor Profiles Firestore Security Rules & RBAC', () => {
    test('Privacy Manager and Compliance Manager can create and update processor profiles in Tenant A', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const profileDoc = privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_01`);

      // 1. Privacy Manager creates processor profile
      await assertSucceeds(
        profileDoc.set({
          id: 'prof_aws_01',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'data_processor',
          serviceDescription: 'Database Hosting',
          dataCategories: ['logs'],
          dataSubjects: ['employees'],
          isSpecialCategoryData: false,
          jurisdictions: ['DE'],
          linkedSystemAssetIds: [],
          criticality: 'high',
          ownerUserId: PERSONAS.privacyA.uid,
          reviewCadence: 'annually',
          lastReviewDate: now,
          nextReviewDate: computeNextReviewDate(now, 'annually'),
          status: 'active',
          dpaSigned: true,
          dpaDate: now,
          notes: 'Initial setup',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.privacyA.uid,
          updatedBy: PERSONAS.privacyA.uid,
          ownerId: PERSONAS.privacyA.uid,
        })
      );

      // 2. Compliance Manager updates review notes
      await assertSucceeds(
        compDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_01`).update({
          notes: 'DPA reviewed and approved for 2026.',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.complianceA.uid,
        })
      );
    });

    test('Contributors, Viewers, and Auditors cannot create or update processor profiles', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();
      const auditorDb = testEnv.authenticatedContext(PERSONAS.auditorA.uid).firestore();

      // Pre-seed profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/processor_profiles/prof_sec_01`).set({
          id: 'prof_sec_01',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'data_processor',
          serviceDescription: 'Security Monitoring',
          dataCategories: ['logs'],
          dataSubjects: ['users'],
          isSpecialCategoryData: false,
          jurisdictions: ['EU'],
          criticality: 'medium',
          ownerUserId: PERSONAS.securityA.uid,
          reviewCadence: 'annually',
          status: 'active',
          dpaSigned: true,
          dpaDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.securityA.uid,
          updatedBy: PERSONAS.securityA.uid,
          ownerId: PERSONAS.securityA.uid,
        });
      });

      // Contributor creation blocked
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/processor_profiles/prof_contrib_attempt`).set({
          id: 'prof_contrib_attempt',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'data_processor',
          serviceDescription: 'Unpermitted entry',
          dataCategories: ['test'],
          dataSubjects: ['test'],
          isSpecialCategoryData: false,
          jurisdictions: ['DE'],
          criticality: 'low',
          ownerUserId: PERSONAS.contributorA.uid,
          reviewCadence: 'annually',
          status: 'active',
          dpaSigned: false,
          dpaDate: null,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.contributorA.uid,
          updatedBy: PERSONAS.contributorA.uid,
          ownerId: PERSONAS.contributorA.uid,
        })
      );

      // Auditor cannot update
      await assertFails(
        auditorDb.doc(`tenants/${tenantA}/processor_profiles/prof_sec_01`).update({
          status: 'restricted',
        })
      );

      // Viewer cannot update
      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_sec_01`).update({
          notes: 'Tampered note',
        })
      );
    });

    test('Only Tenant Admin can delete processor profiles; Privacy Manager and Contributor cannot', async () => {
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      // Pre-seed profile
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/processor_profiles/prof_del_test`).set({
          id: 'prof_del_test',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'subprocessor',
          serviceDescription: 'Analytics Subprocessor',
          dataCategories: ['telemetry'],
          dataSubjects: ['users'],
          isSpecialCategoryData: false,
          jurisdictions: ['EU'],
          criticality: 'low',
          ownerUserId: PERSONAS.privacyA.uid,
          reviewCadence: 'annually',
          status: 'active',
          dpaSigned: true,
          dpaDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.privacyA.uid,
          updatedBy: PERSONAS.privacyA.uid,
          ownerId: PERSONAS.privacyA.uid,
        });
      });

      // Contributor deletion fails
      await assertFails(contribDb.doc(`tenants/${tenantA}/processor_profiles/prof_del_test`).delete());

      // Privacy Manager deletion fails
      await assertFails(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_del_test`).delete());

      // Tenant Admin deletion succeeds
      await assertSucceeds(adminDb.doc(`tenants/${tenantA}/processor_profiles/prof_del_test`).delete());
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Multi-Tenant Isolation & Relationship Integrity
  // ---------------------------------------------------------------------------
  describe('3. Multi-Tenant Isolation & Vendor Relationship Integrity', () => {
    test('cross-tenant isolation: Tenant B admin cannot read or mutate Tenant A processor profiles', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Pre-seed profile in Tenant A
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/processor_profiles/prof_confidential_a`).set({
          id: 'prof_confidential_a',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'data_processor',
          serviceDescription: 'Confidential Production Cloud',
          dataCategories: ['restricted_personal'],
          dataSubjects: ['executives'],
          isSpecialCategoryData: true,
          specialCategoryTypes: ['biometrics'],
          jurisdictions: ['DE'],
          criticality: 'critical',
          ownerUserId: PERSONAS.privacyA.uid,
          reviewCadence: 'quarterly',
          status: 'active',
          dpaSigned: true,
          dpaDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.privacyA.uid,
          updatedBy: PERSONAS.privacyA.uid,
          ownerId: PERSONAS.privacyA.uid,
        });
      });

      // Tenant B Admin cannot read Tenant A processor profile
      await assertFails(adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_confidential_a`).get());

      // Tenant B Admin cannot create profile inside Tenant A
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_injected_b`).set({
          id: 'prof_injected_b',
          tenantId: tenantA,
          vendorId: 'vnd_aws_emea',
          processorRole: 'data_processor',
          serviceDescription: 'Injected cross-tenant',
          dataCategories: ['logs'],
          dataSubjects: ['users'],
          isSpecialCategoryData: false,
          jurisdictions: ['FR'],
          criticality: 'high',
          ownerUserId: PERSONAS.adminB.uid,
          reviewCadence: 'annually',
          status: 'active',
          dpaSigned: false,
          dpaDate: null,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.adminB.uid,
          updatedBy: PERSONAS.adminB.uid,
          ownerId: PERSONAS.adminB.uid,
        })
      );
    });

    test('preserves vendor reuse across distinct processor profiles without duplicating master commercial vendor', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Profile 1: Primary Cloud Infrastructure
      const profile1: ProcessorProfile = {
        id: 'prof_aws_primary_infra',
        tenantId: tenantA,
        vendorId: 'vnd_aws_emea', // Links to same vendor
        processorRole: 'data_processor',
        serviceDescription: 'Core European SaaS Cloud Infrastructure',
        dataCategories: ['user_credentials', 'billing_data'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['DE', 'FR'],
        linkedSystemAssetIds: ['asset_app_cluster_01'],
        criticality: 'critical',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: now,
        nextReviewDate: computeNextReviewDate(now, 'annually'),
        status: 'active',
        notes: 'Primary production contract',
        dpaSigned: true,
        dpaDate: '2025-01-15T00:00:00.000Z',
        linkedDpaEvidenceId: 'ev_dpa_aws_primary',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // Profile 2: AI / ML Inference Service
      const profile2: ProcessorProfile = {
        id: 'prof_aws_bedrock_ai',
        tenantId: tenantA,
        vendorId: 'vnd_aws_emea', // Reuses the same master vendor entity!
        processorRole: 'subprocessor',
        serviceDescription: 'AWS Bedrock LLM Inference for Enterprise Search',
        dataCategories: ['support_tickets', 'query_telemetry'],
        dataSubjects: ['enterprise_clients'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['DE'],
        linkedSystemAssetIds: ['asset_ai_bedrock_01'],
        criticality: 'high',
        ownerUserId: PERSONAS.securityA.uid,
        reviewCadence: 'semi_annually',
        lastReviewDate: now,
        nextReviewDate: computeNextReviewDate(now, 'semi_annually'),
        status: 'active',
        notes: 'Specific subprocessing addendum for Bedrock models',
        dpaSigned: true,
        dpaDate: '2025-06-01T00:00:00.000Z',
        linkedDpaEvidenceId: 'ev_dpa_aws_ai_addendum',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_primary_infra`).set(profile1));
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_bedrock_ai`).set(profile2));

      // Verify both profiles exist independently and reference the same vendorId
      const p1Snap = await privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_primary_infra`).get();
      const p2Snap = await privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_aws_bedrock_ai`).get();

      expect(p1Snap.exists).toBe(true);
      expect(p2Snap.exists).toBe(true);
      expect(p1Snap.data()?.vendorId).toBe('vnd_aws_emea');
      expect(p2Snap.data()?.vendorId).toBe('vnd_aws_emea');
      expect(p1Snap.data()?.criticality).toBe('critical');
      expect(p2Snap.data()?.criticality).toBe('high');
    });
  });
});

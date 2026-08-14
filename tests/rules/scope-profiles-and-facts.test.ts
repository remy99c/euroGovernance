import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  TenantScopeProfile,
  TenantScopeFact,
  validateScopeProfile,
  calculateScopeCompleteness,
  validateScopeFactValue,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-scope-profiles-test';

beforeAll(async () => {
  const rules = getFirestoreRules();
  testEnv = await initializeTestEnvironment({
    projectId,
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
});

describe('Structured Scope Profiles & Scope Facts Suite', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Seed Tenant A Memberships
      await db.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await db.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
    });
  });

  // 1. Validation Logic by Scope Type
  describe('Scope Profile Validation by Type', () => {
    test('validates ISO ISMS scope profile requiring Clause 4.3 narrative statement and boundaries', () => {
      const validIsoProfile: Partial<TenantScopeProfile> = {
        title: 'EuroCorp Global ISMS Scope',
        profileType: 'iso_isms',
        version: '1.0',
        narrativeStatement: 'The Information Security Management System covers all cloud infrastructure, SaaS production platforms, and customer databases operated by EuroCorp Technologies SE.',
        includedLocations: ['Frankfurt AWS', 'Stockholm GCP'],
        includedBusinessUnits: ['Cloud Infrastructure', 'Product Engineering'],
        exclusionsJustification: 'Physical hardware manufacturing is excluded as organization is 100% cloud-native SaaS.',
      };

      const result = validateScopeProfile(validIsoProfile);
      expect(result.valid).toBe(true);

      const invalidIsoProfile: Partial<TenantScopeProfile> = {
        ...validIsoProfile,
        narrativeStatement: '', // Empty narrative
      };
      const invalidRes = validateScopeProfile(invalidIsoProfile);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.error).toContain('Clause 4.3 narrative scope statement');
    });

    test('validates GDPR privacy profile requiring personal data flag and jurisdictions', () => {
      const validGdprProfile: Partial<TenantScopeProfile> = {
        title: 'European Personal Data Processing Scope',
        profileType: 'gdpr_privacy',
        version: '1.0',
        processesPersonalData: true,
        includedJurisdictions: ['European Union', 'EEA', 'United Kingdom'],
      };

      expect(validateScopeProfile(validGdprProfile).valid).toBe(true);

      const invalidGdprProfile: Partial<TenantScopeProfile> = {
        ...validGdprProfile,
        processesPersonalData: false,
      };
      const invalidRes = validateScopeProfile(invalidGdprProfile);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.error).toContain('processesPersonalData to be explicitly true');
    });

    test('validates AI Governance profile requiring AI declarations and high-risk system links', () => {
      const validAiProfile: Partial<TenantScopeProfile> = {
        title: 'Customer Analytics & Risk AI Scope',
        profileType: 'ai_governance',
        version: '1.0',
        deploysAISystems: true,
        deploysHighRiskAI: true,
        inScopeAISystemIds: ['ai_sys_fraud_scoring_01'],
      };

      expect(validateScopeProfile(validAiProfile).valid).toBe(true);

      const invalidAiProfile: Partial<TenantScopeProfile> = {
        title: 'Customer Analytics AI Scope',
        profileType: 'ai_governance',
        version: '1.0',
        deploysAISystems: true,
        deploysHighRiskAI: true,
        inScopeAISystemIds: [], // High-risk declared but empty systems
      };
      const invalidRes = validateScopeProfile(invalidAiProfile);
      expect(invalidRes.valid).toBe(false);
      expect(invalidRes.error).toContain('must link inScopeAISystemIds');
    });

    test('calculateScopeCompleteness computes percentage and identifies missing facts', () => {
      const partialProfile: Partial<TenantScopeProfile> = {
        title: 'EuroCorp Scope',
        narrativeStatement: 'Comprehensive scope covering all production clouds.',
        includedLegalEntities: ['EuroCorp SE'],
        includedBusinessUnits: ['Engineering'],
        includedLocations: ['Frankfurt'],
        includedJurisdictions: ['Germany'],
        processesPersonalData: true,
        deploysAISystems: false,
        // cloudProviders missing
        // exclusionsJustification missing
      };

      const evalResult = calculateScopeCompleteness(partialProfile);
      expect(evalResult.completenessPercentage).toBe(80);
      expect(evalResult.isComplete).toBe(false);
      expect(evalResult.missingFactKeys).toContain('cloudProviders');
      expect(evalResult.missingFactKeys).toContain('exclusionsJustification');

      const completeProfile: Partial<TenantScopeProfile> = {
        ...partialProfile,
        cloudProviders: ['AWS', 'GCP'],
        exclusionsJustification: 'No physical data center operations.',
      };
      const completeEval = calculateScopeCompleteness(completeProfile);
      expect(completeEval.completenessPercentage).toBe(100);
      expect(completeEval.isComplete).toBe(true);
      expect(completeEval.missingFactKeys.length).toBe(0);
    });
  });

  // 2. Structured Scope Facts Validation
  describe('Structured Scope Facts Validation', () => {
    test('validates multi-category facts correctly', () => {
      const entitiesFact: Partial<TenantScopeFact> = {
        factKey: 'in_scope_legal_entities',
        category: 'organization',
        dataType: 'string_array',
        valueArray: ['EuroCorp Technologies SE', 'EuroCorp France SAS'],
      };
      expect(validateScopeFactValue(entitiesFact).valid).toBe(true);

      const transfersFact: Partial<TenantScopeFact> = {
        factKey: 'has_us_cross_border_transfers',
        category: 'third_parties',
        dataType: 'boolean',
        valueBoolean: true,
      };
      expect(validateScopeFactValue(transfersFact).valid).toBe(true);

      const invalidFact: Partial<TenantScopeFact> = {
        factKey: 'has_us_cross_border_transfers',
        category: 'third_parties',
        dataType: 'boolean',
        valueBoolean: 'yes' as any, // Mismatched type
      };
      expect(validateScopeFactValue(invalidFact).valid).toBe(false);
    });
  });

  // 3. Multi-Tenant Firestore Security Rules Isolation
  describe('Scope Profiles & Facts Security Rules Enforcement', () => {
    const now = new Date().toISOString();

    const sampleProfile: TenantScopeProfile = {
      id: 'prof_global_isms',
      tenantId: tenantA,
      ownerId: userAdminA,
      title: 'Global ISMS & Privacy Scope',
      description: 'Production boundaries for ISO 27001 and GDPR',
      profileType: 'integrated_grc',
      status: 'draft',
      version: '1.0',
      revisionNumber: 1,
      revisionRationale: 'Initial baseline',
      supersededProfileId: null,
      applicableFrameworkIds: ['gdpr', 'iso_27001'],
      narrativeStatement: 'Covers all production systems and customer data.',
      includedLegalEntities: ['EuroCorp SE'],
      includedBusinessUnits: ['Engineering', 'Security'],
      includedLocations: ['Frankfurt AWS'],
      includedJurisdictions: ['DE', 'EU'],
      processesPersonalData: true,
      processesSpecialCategoryData: false,
      deploysAISystems: false,
      deploysHighRiskAI: false,
      hasInternationalTransfers: false,
      cloudProviders: ['AWS'],
      inScopeAssetIds: ['asset_rds_01'],
      inScopeVendorIds: ['vendor_aws_01'],
      inScopeAISystemIds: [],
      inScopeRopaIds: ['ropa_01'],
      excludedOperations: ['Manufacturing'],
      exclusionsJustification: 'SaaS only',
      completenessPercentage: 100,
      isComplete: true,
      missingFactKeys: [],
      approvedBy: null,
      approvedAt: null,
      reviewFrequencyDays: 180,
      nextReviewDate: '2027-02-14',
      createdAt: now,
      updatedAt: now,
      createdBy: userAdminA,
      updatedBy: userAdminA,
    };

    test('compliance manager in Tenant A can create and update scope profile', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      const complianceProfile = {
        ...sampleProfile,
        ownerId: userComplianceA,
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      };

      await assertSucceeds(
        db.doc(`tenants/${tenantA}/scope_profiles/prof_global_isms`).set(complianceProfile)
      );

      const snap = await db.doc(`tenants/${tenantA}/scope_profiles/prof_global_isms`).get();
      expect(snap.exists).toBe(true);
      expect(snap.data()?.profileType).toBe('integrated_grc');
    });

    test('auditor in Tenant A can read but cannot create or update scope profile', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      await adminCtx.firestore().doc(`tenants/${tenantA}/scope_profiles/prof_global_isms`).set(sampleProfile);

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();

      // Read succeeds
      await assertSucceeds(db.doc(`tenants/${tenantA}/scope_profiles/prof_global_isms`).get());

      // Write fails
      await assertFails(
        db.doc(`tenants/${tenantA}/scope_profiles/prof_global_isms`).update({
          title: 'Tampered Title by Auditor',
        })
      );
    });

    test('Tenant A user cannot read or write scope profiles or facts in Tenant B partition', async () => {
      const compCtxA = testEnv.authenticatedContext(userComplianceA);
      const dbA = compCtxA.firestore();

      // Tenant A cannot write to Tenant B scope profiles
      await assertFails(
        dbA.doc(`tenants/${tenantB}/scope_profiles/prof_cross_tenant`).set({
          ...sampleProfile,
          tenantId: tenantB,
        })
      );

      // Tenant A cannot read Tenant B scope facts
      await assertFails(
        dbA.doc(`tenants/${tenantB}/scope_facts/operates_physical_datacenters`).get()
      );
    });
  });
});

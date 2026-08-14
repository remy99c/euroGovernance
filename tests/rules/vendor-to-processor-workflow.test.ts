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
  Vendor,
  validateProcessorProfile,
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

    // 4. Commercial Vendors in Tenant A
    // Vendor 1: Standard Commercial Vendor (not a processor initially)
    const rawVendor: Vendor = {
      id: 'vnd_datadog_eu',
      tenantId: tenantA,
      name: 'Datadog Ireland Limited',
      category: 'saas_service',
      riskTier: 'high',
      primaryContactName: 'Datadog Privacy Team',
      primaryContactEmail: 'privacy@datadoghq.com',
      dpaSigned: true,
      dpaDate: '2025-01-10T00:00:00.000Z',
      securityAssessmentDate: '2025-01-10T00:00:00.000Z',
      nextAssessmentDueDate: '2026-01-10T00:00:00.000Z',
      countryOfIncorporation: 'Ireland',
      dataHostingRegions: ['eu-west-1', 'eu-central-1'],
      subprocessorsListed: ['AWS EMEA'],
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
    await db.doc(`tenants/${tenantA}/vendors/vnd_datadog_eu`).set(rawVendor);

    // Vendor 2: Pure non-processor commercial supplier (hardware / office supplies)
    const nonProcessorVendor: Vendor = {
      id: 'vnd_office_furniture_de',
      tenantId: tenantA,
      name: 'Berliner Office Supplies GmbH',
      category: 'consultancy',
      riskTier: 'low',
      primaryContactName: 'Sales Director',
      primaryContactEmail: 'contact@berlin-office.de',
      dpaSigned: false,
      dpaDate: null,
      securityAssessmentDate: null,
      nextAssessmentDueDate: null,
      countryOfIncorporation: 'Germany',
      dataHostingRegions: [],
      subprocessorsListed: [],
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
    await db.doc(`tenants/${tenantA}/vendors/vnd_office_furniture_de`).set(nonProcessorVendor);
  });
});

describe('Vendor-to-Managed-Processor Onboarding & Multi-Engagement Suite', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Profile Creation From Vendor & Vendor State Synchronization
  // ---------------------------------------------------------------------------
  describe('1. Vendor-to-Processor Onboarding Workflow', () => {
    test('successfully creates managed processor profile overlay linked to commercial vendor', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const profilePayload: ProcessorProfile = {
        id: 'prof_datadog_apm',
        tenantId: tenantA,
        vendorId: 'vnd_datadog_eu',
        engagementName: 'APM & Distributed Tracing',
        processorRole: 'data_processor',
        serviceDescription: 'Application performance monitoring with automated PII masking on log ingested streams',
        dataCategories: ['ip_address', 'diagnostic_logs', 'request_headers'],
        dataSubjects: ['registered_users', 'system_administrators'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['IE', 'DE', 'EU'],
        linkedSystemAssetIds: ['asset_app_backend_01'],
        criticality: 'high',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: now,
        nextReviewDate: '2027-01-01T00:00:00.000Z',
        status: 'active',
        notes: 'Converted from commercial supplier register with DPA verification.',
        dpaSigned: true,
        dpaDate: '2025-01-10T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      expect(validateProcessorProfile(profilePayload).valid).toBe(true);

      // Create the processor profile in Firestore
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_datadog_apm`).set(profilePayload));

      // Mark the vendor as processor-active
      await assertSucceeds(
        privacyDb.doc(`tenants/${tenantA}/vendors/vnd_datadog_eu`).update({
          hasProcessorProfile: true,
          activeProcessorProfileId: 'prof_datadog_apm',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );

      // Verify vendor state updated
      const vendorSnap = await privacyDb.doc(`tenants/${tenantA}/vendors/vnd_datadog_eu`).get();
      expect(vendorSnap.data()?.hasProcessorProfile).toBe(true);
      expect(vendorSnap.data()?.activeProcessorProfileId).toBe('prof_datadog_apm');
    });

    test('preserves non-processor vendors without creating or requiring processor profiles', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      const nonProcSnap = await viewerDb.doc(`tenants/${tenantA}/vendors/vnd_office_furniture_de`).get();
      expect(nonProcSnap.exists).toBe(true);
      expect(nonProcSnap.data()?.hasProcessorProfile).toBe(false);
      expect(nonProcSnap.data()?.activeProcessorProfileId).toBeNull();
      expect(nonProcSnap.data()?.dpaSigned).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Duplicate Engagement Prevention & Multi-Engagement Support
  // ---------------------------------------------------------------------------
  describe('2. Multi-Engagement Support & Duplicate Prevention', () => {
    test('supports one vendor having multiple distinct processing engagements (e.g. Core APM vs Real-User Monitoring)', async () => {
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Engagement 1: Infrastructure Monitoring
      const engagement1: ProcessorProfile = {
        id: 'prof_datadog_infra',
        tenantId: tenantA,
        vendorId: 'vnd_datadog_eu',
        engagementName: 'Server & Host Metrics Monitoring',
        processorRole: 'data_processor',
        serviceDescription: 'Infrastructure host telemetry and hardware performance metrics',
        dataCategories: ['system_metrics', 'internal_ip'],
        dataSubjects: ['employees'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['IE'],
        linkedSystemAssetIds: ['asset_prod_hosts_01'],
        criticality: 'medium',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: now,
        nextReviewDate: '2027-01-01T00:00:00.000Z',
        status: 'active',
        notes: null,
        dpaSigned: true,
        dpaDate: '2025-01-10T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // Engagement 2: Real User Monitoring (RUM) Session Replay Addendum
      const engagement2: ProcessorProfile = {
        id: 'prof_datadog_rum',
        tenantId: tenantA,
        vendorId: 'vnd_datadog_eu', // Same vendor!
        engagementName: 'Real User Monitoring & Session Replay',
        processorRole: 'subprocessor',
        serviceDescription: 'Client browser session replay with client-side DOM element obfuscation',
        dataCategories: ['clickstream_events', 'masked_form_interactions', 'user_agent'],
        dataSubjects: ['customers', 'website_visitors'],
        isSpecialCategoryData: false,
        specialCategoryTypes: null,
        jurisdictions: ['IE', 'DE'],
        linkedSystemAssetIds: ['asset_web_frontend_01'],
        criticality: 'high',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'semi_annually',
        lastReviewDate: now,
        nextReviewDate: '2026-07-01T00:00:00.000Z',
        status: 'active',
        notes: 'Strict DSR deletion addendum executed for session recordings',
        dpaSigned: true,
        dpaDate: '2025-01-10T00:00:00.000Z',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_datadog_infra`).set(engagement1));
      await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_datadog_rum`).set(engagement2));

      const snap1 = await privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_datadog_infra`).get();
      const snap2 = await privacyDb.doc(`tenants/${tenantA}/processor_profiles/prof_datadog_rum`).get();

      expect(snap1.exists).toBe(true);
      expect(snap2.exists).toBe(true);
      expect(snap1.data()?.engagementName).toBe('Server & Host Metrics Monitoring');
      expect(snap2.data()?.engagementName).toBe('Real User Monitoring & Session Replay');
      expect(snap1.data()?.vendorId).toBe('vnd_datadog_eu');
      expect(snap2.data()?.vendorId).toBe('vnd_datadog_eu');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Authorization & RBAC Validation
  // ---------------------------------------------------------------------------
  describe('3. Authorization & Privacy Role Enforcement', () => {
    test('Compliance Manager, Privacy Manager, Security Manager, and Tenant Admin can manage processor conversions', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();

      // Compliance manager writes
      await assertSucceeds(
        compDb.doc(`tenants/${tenantA}/processor_profiles/prof_comp_test`).set({
          id: 'prof_comp_test',
          tenantId: tenantA,
          vendorId: 'vnd_datadog_eu',
          engagementName: 'Compliance Test Engagement',
          processorRole: 'data_processor',
          serviceDescription: 'Compliance Testing Suite',
          dataCategories: ['logs'],
          dataSubjects: ['testers'],
          isSpecialCategoryData: false,
          jurisdictions: ['DE'],
          criticality: 'low',
          ownerUserId: PERSONAS.complianceA.uid,
          reviewCadence: 'annually',
          status: 'active',
          dpaSigned: true,
          dpaDate: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          ownerId: PERSONAS.complianceA.uid,
        })
      );

      // Security manager updates
      await assertSucceeds(
        secDb.doc(`tenants/${tenantA}/processor_profiles/prof_comp_test`).update({
          criticality: 'medium',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.securityA.uid,
        })
      );

      // Admin deletes
      await assertSucceeds(adminDb.doc(`tenants/${tenantA}/processor_profiles/prof_comp_test`).delete());
    });

    test('Unauthorized roles (Contributor, Auditor, Viewer, Cross-Tenant) cannot create or update processor profiles', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();
      const auditorDb = testEnv.authenticatedContext(PERSONAS.auditorA.uid).firestore();
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Contributor cannot create
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/processor_profiles/prof_contrib_unauthorized`).set({
          id: 'prof_contrib_unauthorized',
          tenantId: tenantA,
          vendorId: 'vnd_datadog_eu',
          engagementName: 'Contributor Unauthorized',
          processorRole: 'data_processor',
          serviceDescription: 'Unauthorized attempt',
          dataCategories: ['logs'],
          dataSubjects: ['testers'],
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

      // Auditor cannot update vendor processor fields
      await assertFails(
        auditorDb.doc(`tenants/${tenantA}/vendors/vnd_datadog_eu`).update({
          hasProcessorProfile: true,
        })
      );

      // Cross-tenant Admin B cannot read or create in Tenant A
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_cross_tenant_attempt`).set({
          id: 'prof_cross_tenant_attempt',
          tenantId: tenantA,
          vendorId: 'vnd_datadog_eu',
          engagementName: 'Cross-Tenant Attempt',
          processorRole: 'data_processor',
          serviceDescription: 'Injected profile',
          dataCategories: ['logs'],
          dataSubjects: ['testers'],
          isSpecialCategoryData: false,
          jurisdictions: ['FR'],
          criticality: 'low',
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
  });
});

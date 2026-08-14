import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

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
});

describe('Vendor and System Asset Modules Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userSecurityA = 'usr_security_01';
  const userPrivacyA = 'usr_privacy_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const vendorId = 'vnd_aws_eu';
  const assetId = 'ast_postgres_db';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant A
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, name: 'EuroCorp Technologies SE' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userSecurityA}`).set({
        userId: userSecurityA,
        tenantId: tenantA,
        role: 'security_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userPrivacyA}`).set({
        userId: userPrivacyA,
        tenantId: tenantA,
        role: 'privacy_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userViewerA}`).set({
        userId: userViewerA,
        tenantId: tenantA,
        role: 'viewer',
        status: 'active',
      });

      // Seed Tenant B
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Existing Vendor in Tenant A
      await adminDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).set({
        id: vendorId,
        tenantId: tenantA,
        name: 'Amazon Web Services EMEA SARL',
        category: 'cloud_provider',
        riskTier: 'low',
        primaryContactEmail: 'dpa-compliance@amazon.lu',
        countryOfIncorporation: 'LU',
        dpaSigned: true,
      });

      // Seed Existing System Asset in Tenant A
      await adminDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).set({
        id: assetId,
        tenantId: tenantA,
        name: 'Production Multi-Tenant RDS PostgreSQL',
        assetType: 'database',
        criticality: 'mission_critical',
        dataClassification: 'confidential',
        hostingLocation: 'eu-central-1 (Frankfurt)',
        vendorId,
        containsPersonalData: true,
      });
    });
  });

  // 1. Vendors Create & Update RBAC
  test('Compliance and Security Managers can manage vendors; Contributors and Viewers cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Compliance & Security Managers CAN create and update
    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantA}/vendors/vnd_openai`).set({
        id: 'vnd_openai',
        tenantId: tenantA,
        name: 'OpenAI Ireland Ltd',
        category: 'ai_model_provider',
        riskTier: 'medium',
        countryOfIncorporation: 'IE',
      })
    );

    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).update({
        dpaSigned: true,
      })
    );

    // Contributor & Viewer CANNOT create or update
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/vendors/vnd_contrib`).set({
        id: 'vnd_contrib',
        tenantId: tenantA,
        name: 'Unauthorized Vendor',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).update({
        riskTier: 'critical',
      })
    );
  });

  // 2. System Assets Create & Update RBAC
  test('Security and Privacy Managers can manage system assets; Contributors cannot', async () => {
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Security & Privacy Managers CAN create & update assets
    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/system_assets/ast_redis_cache`).set({
        id: 'ast_redis_cache',
        tenantId: tenantA,
        name: 'Redis In-Memory Session Store',
        assetType: 'database',
        criticality: 'high',
        dataClassification: 'internal',
        hostingLocation: 'europe-west3',
      })
    );

    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).update({
        containsPersonalData: true,
      })
    );

    // Contributor CANNOT create system assets
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/system_assets/ast_dev_db`).set({
        id: 'ast_dev_db',
        tenantId: tenantA,
        name: 'Dev DB',
      })
    );
  });

  // 3. Read Permissions Across Tenant Members
  test('All active tenant members (including Auditor and Viewer) can read vendors and assets', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).get());

    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).get());
  });

  // 4. Delete Restrictions
  test('Only Tenant Admin can delete vendors and system assets', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();

    // Compliance Manager cannot delete
    await assertFails(complianceDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).delete());
    await assertFails(complianceDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).delete());

    // Tenant Admin CAN delete
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).delete());
  });

  // 5. Cross-Tenant Isolation
  test('User from Tenant B cannot read or mutate vendors or system assets in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/system_assets/${assetId}`).get());

    await assertFails(
      outsiderDb.doc(`tenants/${tenantA}/vendors/${vendorId}`).update({
        name: 'Tampered Vendor',
      })
    );
  });
});

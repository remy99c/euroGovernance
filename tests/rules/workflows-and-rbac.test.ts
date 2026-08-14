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

describe('RBAC & Privileged Workflow Security Rules Enforcement', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdmin = 'usr_admin_01';
  const userCompliance = 'usr_compliance_01';
  const userContributor = 'usr_contrib_01';
  const userAuditor = 'usr_auditor_01';

  beforeEach(async () => {
    // Seed Active Memberships
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      await adminDb.doc(`tenants/${tenantA}/memberships/${userAdmin}`).set({
        userId: userAdmin,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });

      await adminDb.doc(`tenants/${tenantA}/memberships/${userCompliance}`).set({
        userId: userCompliance,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });

      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributor}`).set({
        userId: userContributor,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });

      await adminDb.doc(`tenants/${tenantA}/memberships/${userAuditor}`).set({
        userId: userAuditor,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });
    });
  });

  // 1. Evidence Approval Isolation Test
  test('Contributor can create draft evidence with under_review, but CANNOT self-approve to valid', async () => {
    const contribDb = testEnv.authenticatedContext(userContributor, { email: 'dev@eurocorp.de' }).firestore();
    const evidenceRef = contribDb.doc(`tenants/${tenantA}/evidence/ev_test_01`);

    // Contributor creates draft evidence (Succeeds)
    await assertSucceeds(
      evidenceRef.set({
        id: 'ev_test_01',
        tenantId: tenantA,
        title: 'Encryption Verification Log',
        status: 'under_review',
        createdBy: userContributor,
        createdAt: new Date().toISOString(),
      })
    );

    // Contributor tries to self-approve evidence to 'valid' directly (Must Fail)
    await assertFails(
      evidenceRef.update({
        status: 'valid',
        updatedBy: userContributor,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  // 2. AI Risk Tier Client Immutability Test
  test('Client cannot arbitrarily modify AI System riskTier directly in Firestore', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantA}/ai_systems/ais_test_01`).set({
        id: 'ais_test_01',
        tenantId: tenantA,
        name: 'Credit Risk Model',
        riskTier: 'high_risk',
        status: 'production',
        createdBy: userCompliance,
        createdAt: new Date().toISOString(),
      });
    });

    const complianceDb = testEnv.authenticatedContext(userCompliance, { email: 'comp@eurocorp.de' }).firestore();
    const aiSystemRef = complianceDb.doc(`tenants/${tenantA}/ai_systems/ais_test_01`);

    // Compliance manager tries to bypass classification engine and downgrade tier directly (Must Fail)
    await assertFails(
      aiSystemRef.update({
        riskTier: 'minimal_risk',
        updatedBy: userCompliance,
        updatedAt: new Date().toISOString(),
      })
    );
  });

  // 3. Materialized Summary Metrics Immutability Test
  test('Client cannot write directly to /summary_metrics (Server Managed Only)', async () => {
    const adminDb = testEnv.authenticatedContext(userAdmin, { email: 'admin@eurocorp.de' }).firestore();
    const metricRef = adminDb.doc(`tenants/${tenantA}/summary_metrics/latest`);

    await assertFails(
      metricRef.set({
        tenantId: tenantA,
        overallHealthScore: 100,
        tampered: true,
      })
    );
  });

  // 5. Cross-Tenant Data Isolation Test
  test('User from Tenant A cannot read ISO SoA entries in Tenant B', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantB}/iso_soa_entries/soa_secret_b`).set({
        id: 'soa_secret_b',
        tenantId: tenantB,
        standard: 'iso_27001',
        controlCode: 'A.5.1',
        applicable: true,
      });
    });

    const complianceDb = testEnv.authenticatedContext(userCompliance, { email: 'comp@eurocorp.de' }).firestore();
    const crossTenantSoaRef = complianceDb.doc(`tenants/${tenantB}/iso_soa_entries/soa_secret_b`);

    await assertFails(crossTenantSoaRef.get());
  });
});

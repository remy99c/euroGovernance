import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

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
});

describe('Multi-Tenant Firestore Security Rules Isolation Tests', () => {
  const tenantA = 'tenant_org_a';
  const tenantB = 'tenant_org_b';
  const userA = 'user_alice';
  const userB = 'user_bob';

  test('Denies unauthenticated access to tenant controls', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const controlRef = unauthDb.collection('tenants').doc(tenantA).collection('controls').doc('ctl_01');

    await assertFails(controlRef.get());
  });

  test('Denies User A from reading Tenant B data (Cross-Tenant Isolation)', async () => {
    // Setup Tenant B membership for User B, and Tenant A membership for User A
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userA}`).set({
        userId: userA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userB}`).set({
        userId: userB,
        tenantId: tenantB,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantB}/controls/ctl_secret_b`).set({
        id: 'ctl_secret_b',
        tenantId: tenantB,
        title: 'Confidential Control B',
      });
    });

    const aliceDb = testEnv.authenticatedContext(userA, { email: 'alice@tenant-a.com' }).firestore();
    const crossTenantRef = aliceDb.doc(`tenants/${tenantB}/controls/ctl_secret_b`);

    await assertFails(crossTenantRef.get());
  });

  test('Requires Tenant A members to use governed control projections', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userA}`).set({
        userId: userA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/controls/ctl_01`).set({
        id: 'ctl_01',
        tenantId: tenantA,
        title: 'Access Control Policy Implementation',
      });
    });

    const aliceDb = testEnv.authenticatedContext(userA, { email: 'alice@tenant-a.com' }).firestore();
    const controlRef = aliceDb.doc(`tenants/${tenantA}/controls/ctl_01`);

    await assertFails(controlRef.get());
  });

  test('Auditor role is read-only and cannot mutate controls', async () => {
    const auditorUser = 'user_auditor';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${auditorUser}`).set({
        userId: auditorUser,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });
    });

    const auditorDb = testEnv.authenticatedContext(auditorUser, { email: 'auditor@kpmg.com' }).firestore();
    const controlRef = auditorDb.doc(`tenants/${tenantA}/controls/ctl_new`);

    await assertFails(
      controlRef.set({
        id: 'ctl_new',
        tenantId: tenantA,
        title: 'Auditor Created Control',
        createdBy: auditorUser,
        createdAt: new Date(),
      })
    );
  });

  test('Audit log is append-only and client direct modification is strictly denied', async () => {
    const adminUser = 'user_tenant_admin';
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${adminUser}`).set({
        userId: adminUser,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/audit_logs/log_01`).set({
        id: 'log_01',
        tenantId: tenantA,
        action: 'create',
        entityType: 'control',
      });
    });

    const adminDb = testEnv.authenticatedContext(adminUser, { email: 'admin@tenant-a.com' }).firestore();
    const logRef = adminDb.doc(`tenants/${tenantA}/audit_logs/log_01`);

    // Tenant admin cannot alter or delete audit logs
    await assertFails(logRef.update({ action: 'tampered_action' }));
    await assertFails(logRef.delete());
  });
});

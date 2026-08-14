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

describe('Safe Role Management & Privilege Guardrails Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_a';
  const userComplianceA = 'usr_compliance_a';
  const userSuspendedA = 'usr_suspended_a';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Tenant A setup
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
      await adminDb.doc(`tenants/${tenantA}/memberships/${userSuspendedA}`).set({
        userId: userSuspendedA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'suspended',
      });

      await adminDb.doc(`tenants/${tenantA}/controls/ctl_01`).set({
        id: 'ctl_01',
        tenantId: tenantA,
        title: 'Encryption Control A',
      });

      // Tenant B setup
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantB}/controls/ctl_secret_b`).set({
        id: 'ctl_secret_b',
        tenantId: tenantB,
        title: 'Confidential Control B',
      });
    });
  });

  // 1. Privilege Escalation Attempt: Standard member trying to grant admin role
  test('Standard compliance manager CANNOT self-elevate or mutate role documents via client SDK', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const ownMembershipRef = complianceDb.doc(`tenants/${tenantA}/memberships/${userComplianceA}`);

    // Self-elevation attack
    await assertFails(
      ownMembershipRef.update({
        role: 'tenant_admin',
      })
    );
  });

  // 2. Cross-Tenant Privilege Attack: Admin of Tenant A trying to mutate Tenant B memberships
  test('Tenant A Admin CANNOT modify or read memberships in Tenant B', async () => {
    const adminDbA = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const crossTenantMemberRef = adminDbA.doc(`tenants/${tenantB}/memberships/${userAdminB}`);
    const crossTenantControlRef = adminDbA.doc(`tenants/${tenantB}/controls/ctl_secret_b`);

    await assertFails(crossTenantMemberRef.get());
    await assertFails(crossTenantMemberRef.update({ status: 'suspended' }));
    await assertFails(crossTenantControlRef.get());
  });

  // 3. Suspended Membership Instant Access Cutoff
  test('Suspended member is immediately blocked from all reads and writes in the tenant', async () => {
    const suspendedDb = testEnv.authenticatedContext(userSuspendedA, { email: 'suspended@eurocorp.de' }).firestore();
    const tenantRef = suspendedDb.doc(`tenants/${tenantA}`);
    const controlRef = suspendedDb.doc(`tenants/${tenantA}/controls/ctl_01`);

    // Suspended member cannot read tenant root or child collections
    await assertFails(tenantRef.get());
    await assertFails(controlRef.get());

    // Suspended member cannot write
    await assertFails(
      controlRef.update({
        title: 'Tampered by suspended user',
      })
    );
  });

  // 4. Client Direct Removal of Membership Blocked
  test('Direct client delete of membership document is blocked (must use removeTenantMember Cloud Function)', async () => {
    const adminDbA = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const targetMemberRef = adminDbA.doc(`tenants/${tenantA}/memberships/${userComplianceA}`);

    // Admin can read memberships
    await assertSucceeds(targetMemberRef.get());

    // Direct deletion from client is blocked
    await assertFails(targetMemberRef.delete());
  });
});

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
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

describe('Core Identity, Tenant Isolation & RBAC Security Rules', () => {
  const tenantOrg = 'tenant_eurocorp_de';
  const founderAdmin = 'usr_founder_admin';
  const complianceUser = 'usr_compliance_mgr';
  const outsiderUser = 'usr_outsider_attacker';
  const platformAdmin = 'usr_platform_admin';

  beforeEach(async () => {
    // Seed initial tenant and memberships directly
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Tenant Root
      await adminDb.doc(`tenants/${tenantOrg}`).set({
        id: tenantOrg,
        name: 'EuroCorp Technologies SE',
        status: 'active',
        tier: 'enterprise',
      });

      // Founding Admin Membership
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${founderAdmin}`).set({
        userId: founderAdmin,
        tenantId: tenantOrg,
        role: 'tenant_admin',
        status: 'active',
      });

      // Compliance Manager Membership
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${complianceUser}`).set({
        userId: complianceUser,
        tenantId: tenantOrg,
        role: 'compliance_manager',
        status: 'active',
      });

      // Tenant Control
      await adminDb.doc(`tenants/${tenantOrg}/controls/ctl_01`).set({
        id: 'ctl_01',
        tenantId: tenantOrg,
        title: 'Encryption at Rest Policy',
      });
    });
  });

  // 1. Founder Access Test
  test('Founder admin can access tenant root and subcollections', async () => {
    const founderDb = testEnv.authenticatedContext(founderAdmin, { email: 'founder@eurocorp.de' }).firestore();
    const tenantDocRef = founderDb.doc(`tenants/${tenantOrg}`);
    const controlDocRef = founderDb.doc(`tenants/${tenantOrg}/controls/ctl_01`);

    await assertSucceeds(tenantDocRef.get());
    await assertSucceeds(controlDocRef.get());
  });

  // 2. Outsider Access Rejection Test
  test('Outsider with valid auth token CANNOT read tenant data or member lists', async () => {
    const outsiderDb = testEnv.authenticatedContext(outsiderUser, { email: 'attacker@evil.com' }).firestore();
    const tenantDocRef = outsiderDb.doc(`tenants/${tenantOrg}`);
    const membershipDocRef = outsiderDb.doc(`tenants/${tenantOrg}/memberships/${founderAdmin}`);
    const controlDocRef = outsiderDb.doc(`tenants/${tenantOrg}/controls/ctl_01`);

    await assertFails(tenantDocRef.get());
    await assertFails(membershipDocRef.get());
    await assertFails(controlDocRef.get());
  });

  // 3. Unauthenticated Access Rejection Test
  test('Unauthenticated client receives PERMISSION_DENIED on all tenant paths', async () => {
    const unauthDb = testEnv.unauthenticatedContext().firestore();
    const tenantDocRef = unauthDb.doc(`tenants/${tenantOrg}`);

    await assertFails(tenantDocRef.get());
  });

  // 4. Non-Admin Cannot Grant Roles (Client Privilege Elevation Prevention)
  test('Direct client writes to memberships subcollection are strictly denied for all roles', async () => {
    const complianceDb = testEnv.authenticatedContext(complianceUser, { email: 'comp@eurocorp.de' }).firestore();
    const adminDb = testEnv.authenticatedContext(founderAdmin, { email: 'founder@eurocorp.de' }).firestore();

    const targetMembershipRef = complianceDb.doc(`tenants/${tenantOrg}/memberships/${complianceUser}`);

    // Compliance manager tries to elevate self to tenant_admin directly in Firestore (Must Fail)
    await assertFails(
      targetMembershipRef.update({
        role: 'tenant_admin',
      })
    );

    // Even tenant_admin cannot directly write to membership doc from client (Must use Cloud Function)
    const adminTargetRef = adminDb.doc(`tenants/${tenantOrg}/memberships/${complianceUser}`);
    await assertFails(
      adminTargetRef.update({
        role: 'platform_admin',
      })
    );
  });

  // 5. Platform Admin Override Test
  test('Platform Admin with custom claim platform_admin: true can inspect global tenants', async () => {
    const platformAdminDb = testEnv.authenticatedContext(platformAdmin, {
      email: 'admin@eurogovernance.eu',
      platform_admin: true,
    }).firestore();

    const tenantListQuery = platformAdminDb.collection('tenants');
    await assertSucceeds(tenantListQuery.get());
  });

  // 6. User Profile Command Boundary
  test('browser clients cannot write identity profiles in /users/{userId}', async () => {
    const userDb = testEnv.authenticatedContext(founderAdmin, { email: 'founder@eurocorp.de' }).firestore();
    const ownProfileRef = userDb.doc(`users/${founderAdmin}`);
    const victimProfileRef = userDb.doc(`users/${complianceUser}`);

    // Even an own-profile write must use the trusted identity sync workflow.
    await assertFails(
      ownProfileRef.set({
        id: founderAdmin,
        email: 'founder@eurocorp.de',
        displayName: 'Marcus Vance',
      })
    );

    // Cannot write victim profile
    await assertFails(
      victimProfileRef.set({
        id: complianceUser,
        email: 'attacker@evil.com',
        displayName: 'Tampered Profile',
      })
    );
  });
});

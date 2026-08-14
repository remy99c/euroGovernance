import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  seedTenantWithMembers,
  FIXTURE_TENANT_A,
  PERSONAS,
  getFirestoreRules,
} from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-security-test',
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

describe('Invitation Workflow & Access Control Security Rules', () => {
  const tenantOrg = FIXTURE_TENANT_A;
  const adminUser = PERSONAS.adminA.uid;
  const memberUser = PERSONAS.complianceA.uid;
  const invitedUserEmail = 'newhire@eurocorp.de';
  const invitedUserId = 'usr_newhire_01';
  const eavesdropperEmail = 'attacker@evil.com';
  const eavesdropperId = 'usr_attacker_01';
  const invitationId = 'inv_01HQ9T_VALID';

  async function seedTestSetup() {
    await seedTenantWithMembers(
      testEnv,
      { tenantId: tenantOrg, name: 'EuroCorp Technologies SE' },
      [
        { tenantId: tenantOrg, userId: adminUser, role: 'tenant_admin' },
        { tenantId: tenantOrg, userId: memberUser, role: 'compliance_manager' },
      ]
    );

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`invitations/${invitationId}`).set({
        id: invitationId,
        tenantId: tenantOrg,
        tenantName: 'EuroCorp Technologies SE',
        email: invitedUserEmail,
        role: 'contributor',
        department: 'Engineering',
        status: 'pending',
        tokenHash: invitationId,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        createdAt: new Date().toISOString(),
        createdBy: adminUser,
      });
    });
  }

  test('Tenant Admin can read invitation issued for their tenant', async () => {
    await seedTestSetup();
    const adminDb = testEnv.authenticatedContext(adminUser, { email: 'admin@eurocorp.de' }).firestore();
    const inviteRef = adminDb.doc(`invitations/${invitationId}`);

    await assertSucceeds(inviteRef.get());
  });

  test('Intended recipient with matching email can read their invitation document', async () => {
    await seedTestSetup();
    const recipientDb = testEnv.authenticatedContext(invitedUserId, { email: invitedUserEmail }).firestore();
    const inviteRef = recipientDb.doc(`invitations/${invitationId}`);

    await assertSucceeds(inviteRef.get());
  });

  test('Unintended user with different email CANNOT read another persons invitation', async () => {
    await seedTestSetup();
    const eavesdropperDb = testEnv.authenticatedContext(eavesdropperId, { email: eavesdropperEmail }).firestore();
    const inviteRef = eavesdropperDb.doc(`invitations/${invitationId}`);

    await assertFails(inviteRef.get());
  });

  test('Standard non-admin member in tenant cannot read invitations not addressed to them', async () => {
    await seedTestSetup();
    const memberDb = testEnv.authenticatedContext(memberUser, { email: 'compliance@eurocorp.de' }).firestore();
    const inviteRef = memberDb.doc(`invitations/${invitationId}`);

    await assertFails(inviteRef.get());
  });

  test('Direct client writes, updates, and deletes to /invitations are strictly blocked', async () => {
    await seedTestSetup();
    const adminDb = testEnv.authenticatedContext(adminUser, { email: 'admin@eurocorp.de' }).firestore();
    const recipientDb = testEnv.authenticatedContext(invitedUserId, { email: invitedUserEmail }).firestore();

    const inviteRef = adminDb.doc(`invitations/${invitationId}`);
    const newInviteRef = adminDb.doc('invitations/inv_new_unauthorized');

    await assertFails(
      newInviteRef.set({
        id: 'inv_new_unauthorized',
        tenantId: tenantOrg,
        email: 'unauth@eurocorp.de',
        role: 'viewer',
        status: 'pending',
      })
    );

    await assertFails(
      recipientDb.doc(`invitations/${invitationId}`).update({
        status: 'accepted',
      })
    );

    await assertFails(inviteRef.delete());
  });
});

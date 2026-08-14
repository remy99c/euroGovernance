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

describe('Invitation Workflow & Access Control Security Rules', () => {
  const tenantOrg = 'tenant_eurocorp_de';
  const adminUser = 'usr_tenant_admin';
  const memberUser = 'usr_compliance_mgr';
  const invitedUserEmail = 'newhire@eurocorp.de';
  const invitedUserId = 'usr_newhire_01';
  const eavesdropperEmail = 'attacker@evil.com';
  const eavesdropperId = 'usr_attacker_01';
  const invitationId = 'inv_01HQ9T_VALID';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant
      await adminDb.doc(`tenants/${tenantOrg}`).set({
        id: tenantOrg,
        name: 'EuroCorp Technologies SE',
        status: 'active',
      });

      // Seed Admin Membership
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${adminUser}`).set({
        userId: adminUser,
        tenantId: tenantOrg,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Standard Member Membership
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${memberUser}`).set({
        userId: memberUser,
        tenantId: tenantOrg,
        role: 'compliance_manager',
        status: 'active',
      });

      // Seed Pending Invitation
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
  });

  // 1. Admin Can Read Invitation Test
  test('Tenant Admin can read invitation issued for their tenant', async () => {
    const adminDb = testEnv.authenticatedContext(adminUser, { email: 'admin@eurocorp.de' }).firestore();
    const inviteRef = adminDb.doc(`invitations/${invitationId}`);

    await assertSucceeds(inviteRef.get());
  });

  // 2. Intended Recipient Can Read Invitation Test
  test('Intended recipient with matching email can read their invitation document', async () => {
    const recipientDb = testEnv.authenticatedContext(invitedUserId, { email: invitedUserEmail }).firestore();
    const inviteRef = recipientDb.doc(`invitations/${invitationId}`);

    await assertSucceeds(inviteRef.get());
  });

  // 3. Eavesdropper / Non-Recipient Cannot Read Invitation Test
  test('Unintended user with different email CANNOT read another persons invitation', async () => {
    const eavesdropperDb = testEnv.authenticatedContext(eavesdropperId, { email: eavesdropperEmail }).firestore();
    const inviteRef = eavesdropperDb.doc(`invitations/${invitationId}`);

    await assertFails(inviteRef.get());
  });

  // 4. Standard Non-Admin Member Cannot Read Other Invites
  test('Standard non-admin member in tenant cannot read invitations not addressed to them', async () => {
    const memberDb = testEnv.authenticatedContext(memberUser, { email: 'compliance@eurocorp.de' }).firestore();
    const inviteRef = memberDb.doc(`invitations/${invitationId}`);

    await assertFails(inviteRef.get());
  });

  // 5. Direct Client Mutation Blocked
  test('Direct client writes, updates, and deletes to /invitations are strictly blocked', async () => {
    const adminDb = testEnv.authenticatedContext(adminUser, { email: 'admin@eurocorp.de' }).firestore();
    const recipientDb = testEnv.authenticatedContext(invitedUserId, { email: invitedUserEmail }).firestore();

    const inviteRef = adminDb.doc(`invitations/${invitationId}`);
    const newInviteRef = adminDb.doc('invitations/inv_new_unauthorized');

    // Admin cannot directly create invite from client SDK (Must use Cloud Function)
    await assertFails(
      newInviteRef.set({
        id: 'inv_new_unauthorized',
        tenantId: tenantOrg,
        email: 'unauth@eurocorp.de',
        role: 'viewer',
        status: 'pending',
      })
    );

    // Recipient cannot directly self-accept via client update (Must use acceptTenantInvite Cloud Function)
    await assertFails(
      recipientDb.doc(`invitations/${invitationId}`).update({
        status: 'accepted',
      })
    );

    // Admin cannot directly delete invite document from client
    await assertFails(inviteRef.delete());
  });
});

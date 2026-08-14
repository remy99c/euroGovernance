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

describe('Operational Support: Notifications & Summary Metrics Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userContributorA = 'usr_contrib_01';
  const userAdminB = 'usr_admin_b';

  const notifUserAId = 'notif_for_admin_a';
  const notifUserContribId = 'notif_for_contrib_a';

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
      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
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

      // Seed Materialized Summary Metrics in Tenant A
      await adminDb.doc(`tenants/${tenantA}/summary_metrics/current`).set({
        id: 'current',
        tenantId: tenantA,
        lastMaterializedAt: new Date().toISOString(),
        overallComplianceScore: 88,
        totalControlsCount: 45,
        implementedControlsCount: 40,
        openRisksCount: 3,
      });

      // Seed Notification addressed to Admin A
      await adminDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).set({
        id: notifUserAId,
        tenantId: tenantA,
        recipientId: userAdminA,
        title: 'Evidence Review Required',
        message: 'New technical documentation uploaded by engineering.',
        type: 'evidence_review_required',
        isRead: false,
        readAt: null,
      });

      // Seed Notification addressed to Contributor A
      await adminDb.doc(`tenants/${tenantA}/notifications/${notifUserContribId}`).set({
        id: notifUserContribId,
        tenantId: tenantA,
        recipientId: userContributorA,
        title: 'New Remediation Task Assigned',
        message: 'You have been assigned task TSK-01.',
        type: 'task_assigned',
        isRead: false,
        readAt: null,
      });
    });
  });

  // 1. Notification Backend-Only Creation & Deletion Protection
  test('Direct client creation and deletion of notifications is strictly blocked', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Client attempt to forge a notification is DENIED
    await assertFails(
      adminDb.doc(`tenants/${tenantA}/notifications/notif_forged`).set({
        id: 'notif_forged',
        tenantId: tenantA,
        recipientId: userAdminA,
        title: 'Forged Notification',
        isRead: false,
      })
    );

    // Client attempt to delete a notification is DENIED
    await assertFails(contribDb.doc(`tenants/${tenantA}/notifications/${notifUserContribId}`).delete());
  });

  // 2. Recipient-Scoped Notification Isolation
  test('Users can only read and update notifications addressed to themselves', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Admin A can read and mark their own notification as read
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).get());
    await assertSucceeds(
      adminDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).update({
        isRead: true,
        readAt: new Date().toISOString(),
      })
    );

    // Contributor cannot read or update Admin A's notification
    await assertFails(contribDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).get());
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).update({
        isRead: true,
      })
    );

    // Contributor CAN read and update their own notification
    await assertSucceeds(contribDb.doc(`tenants/${tenantA}/notifications/${notifUserContribId}`).get());
    await assertSucceeds(
      contribDb.doc(`tenants/${tenantA}/notifications/${notifUserContribId}`).update({
        isRead: true,
      })
    );
  });

  // 3. Summary Metrics Backend-Only Write Lock
  test('All tenant members can read summary metrics; direct client writes are forbidden', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // All tenant members can read derived summary metrics
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/summary_metrics/current`).get());
    await assertSucceeds(contribDb.doc(`tenants/${tenantA}/summary_metrics/current`).get());

    // Direct client attempts to tamper with compliance metrics are strictly blocked
    await assertFails(
      adminDb.doc(`tenants/${tenantA}/summary_metrics/current`).update({
        overallComplianceScore: 100,
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/summary_metrics/fake_metrics`).set({
        id: 'fake_metrics',
        tenantId: tenantA,
        overallComplianceScore: 100,
      })
    );
  });

  // 4. Cross-Tenant Denial
  test('User from Tenant B cannot read notifications or summary metrics in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/summary_metrics/current`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/notifications/${notifUserAId}`).get());
  });
});

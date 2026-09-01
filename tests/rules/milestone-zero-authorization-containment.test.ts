import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

const TENANT_A = 'tenant_authz_a';
const TENANT_B = 'tenant_authz_b';
const TENANT_SUSPENDED = 'tenant_authz_suspended';

const USERS = {
  activeAdminA: 'active_admin_a',
  suspendedAdminA: 'suspended_admin_a',
  activeContributorA: 'active_contributor_a',
  suspendedContributorA: 'suspended_contributor_a',
  activeAuditorA: 'active_auditor_a',
  activeViewerA: 'active_viewer_a',
  activeAdminB: 'active_admin_b',
  activeAdminSuspendedTenant: 'active_admin_suspended_tenant',
  nonmember: 'authenticated_nonmember',
};

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-milestone-zero-authz',
    firestore: {
      rules: getFirestoreRules(),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const memberships = [
      [TENANT_A, USERS.activeAdminA, 'tenant_admin', 'active'],
      [TENANT_A, USERS.suspendedAdminA, 'tenant_admin', 'suspended'],
      [TENANT_A, USERS.activeContributorA, 'contributor', 'active'],
      [TENANT_A, USERS.suspendedContributorA, 'contributor', 'suspended'],
      [TENANT_A, USERS.activeAuditorA, 'auditor', 'active'],
      [TENANT_A, USERS.activeViewerA, 'viewer', 'active'],
      [TENANT_B, USERS.activeAdminB, 'tenant_admin', 'active'],
      [TENANT_SUSPENDED, USERS.activeAdminSuspendedTenant, 'tenant_admin', 'active'],
    ];

    await db.doc(`tenants/${TENANT_A}`).set({
      status: 'active',
      id: TENANT_A,
      name: 'Tenant A',
    });
    await db.doc(`tenants/${TENANT_B}`).set({
      status: 'active',
      id: TENANT_B,
      name: 'Tenant B',
    });
    await db.doc(`tenants/${TENANT_SUSPENDED}`).set({
      id: TENANT_SUSPENDED,
      name: 'Suspended Tenant',
      status: 'suspended',
    });

    for (const [tenantId, userId, role, status] of memberships) {
      await db.doc(`tenants/${tenantId}/memberships/${userId}`).set({
        tenantId,
        userId,
        role,
        status,
      });
    }

    await db.doc(`tenants/${TENANT_A}/issues/existing_issue`).set({
      id: 'existing_issue',
      tenantId: TENANT_A,
      title: 'Existing issue',
      status: 'open',
    });
    await db.doc(`tenants/${TENANT_A}/tasks/existing_task`).set({
      id: 'existing_task',
      tenantId: TENANT_A,
      title: 'Existing task',
      status: 'open',
    });
    await db.doc(`tenants/${TENANT_A}/controls/existing_control`).set({
      id: 'existing_control',
      tenantId: TENANT_A,
      title: 'Existing control',
    });
    await db.doc(`tenants/${TENANT_A}/iso_internal_audits/existing_audit`).set({
      id: 'existing_audit',
      tenantId: TENANT_A,
      title: 'Existing audit',
    });
    await db.doc(`tenants/${TENANT_A}/command_receipts/existing_receipt`).set({
      id: 'existing_receipt',
      tenantId: TENANT_A,
      commandId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'committed',
    });
    await db.doc(`tenants/${TENANT_A}/command_outbox/existing_message`).set({
      id: 'existing_message',
      tenantId: TENANT_A,
      commandId: '550e8400-e29b-41d4-a716-446655440000',
      status: 'pending',
    });
    await db.doc(`command_rate_limits/${'a'.repeat(64)}`).set({
      schemaVersion: 1,
      actorHash: 'a'.repeat(64),
      totalAttempts: 1,
    });
    await db.doc(`tenants/${TENANT_SUSPENDED}/issues/existing_issue`).set({
      id: 'existing_issue',
      tenantId: TENANT_SUSPENDED,
      title: 'Suspended tenant issue',
      status: 'open',
    });
    await db.doc(`users/${USERS.activeAdminA}`).set({
      id: USERS.activeAdminA,
      email: 'admin-a@example.test',
    });
    await db.doc('invitations/invitation_a').set({
      id: 'invitation_a',
      tenantId: TENANT_A,
      email: 'invitee@example.test',
    });
  });
});

describe('Milestone 0 Firestore authorization containment', () => {
  test('active tenant admin retains scoped access but cannot mutate server-owned tenant configuration', async () => {
    const db = testEnv.authenticatedContext(USERS.activeAdminA).firestore();

    await assertSucceeds(db.doc(`tenants/${TENANT_A}`).get());
    await assertFails(db.doc(`tenants/${TENANT_A}`).update({ name: 'Tenant A Updated' }));
    await assertFails(db.doc(`tenants/${TENANT_A}`).update({ tier: 'enterprise' }));
    await assertFails(db.doc(`tenants/${TENANT_A}`).update({ status: 'suspended' }));
    await assertSucceeds(db.doc('invitations/invitation_a').get());

    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/admin_issue`).set({
        id: 'admin_issue',
        tenantId: TENANT_A,
        title: 'Admin-created issue',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/tasks/admin_task`).set({
        id: 'admin_task',
        tenantId: TENANT_A,
        title: 'Admin-created task',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/admin_issue`).delete());
    await assertFails(db.doc(`tenants/${TENANT_A}/tasks/admin_task`).delete());
  });

  test('active contributor cannot mutate authoritative issues or tasks directly', async () => {
    const db = testEnv.authenticatedContext(USERS.activeContributorA).firestore();
    const issue = db.doc(`tenants/${TENANT_A}/issues/contributor_issue`);
    const task = db.doc(`tenants/${TENANT_A}/tasks/contributor_task`);

    await assertFails(
      issue.set({
        id: 'contributor_issue',
        tenantId: TENANT_A,
        title: 'Contributor-created issue',
        createdBy: USERS.activeContributorA,
      })
    );
    await assertFails(issue.update({ title: 'Contributor-updated issue' }));
    await assertFails(
      task.set({
        id: 'contributor_task',
        tenantId: TENANT_A,
        title: 'Contributor-created task',
        createdBy: USERS.activeContributorA,
      })
    );
    await assertFails(task.update({ title: 'Contributor-updated task' }));
    await assertFails(issue.delete());
    await assertFails(task.delete());
  });

  test.each([
    ['suspended tenant admin', USERS.suspendedAdminA],
    ['suspended contributor', USERS.suspendedContributorA],
  ])('%s is immediately denied reads, creates, updates, deletes, and admin invitation access', async (_label, uid) => {
    const db = testEnv.authenticatedContext(uid).firestore();

    await assertFails(db.doc(`tenants/${TENANT_A}`).get());
    await assertFails(db.doc(`tenants/${TENANT_A}`).update({ name: 'Suspended tenant overwrite' }));
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).get());
    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/suspended_injection`).set({
        id: 'suspended_injection',
        tenantId: TENANT_A,
        title: 'Suspended injection',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/tasks/existing_task`).update({
        title: 'Suspended modification',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).delete());
    await assertFails(db.doc('invitations/invitation_a').get());
  });

  test('authenticated nonmember cannot exploit issue/task role negation', async () => {
    const db = testEnv.authenticatedContext(USERS.nonmember).firestore();

    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).get());
    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/nonmember_issue`).set({
        id: 'nonmember_issue',
        tenantId: TENANT_A,
        title: 'Injected issue',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/tasks/nonmember_task`).set({
        id: 'nonmember_task',
        tenantId: TENANT_A,
        title: 'Injected task',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).update({ title: 'Injected' }));
    await assertFails(db.doc(`tenants/${TENANT_A}/tasks/existing_task`).update({ title: 'Injected' }));
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).delete());
  });

  test('active membership does not grant access while the tenant is suspended', async () => {
    const db = testEnv.authenticatedContext(USERS.activeAdminSuspendedTenant).firestore();

    await assertFails(db.doc(`tenants/${TENANT_SUSPENDED}`).get());
    await assertFails(db.doc(`tenants/${TENANT_SUSPENDED}`).update({ name: 'Reactivated by client' }));
    await assertFails(db.doc(`tenants/${TENANT_SUSPENDED}/issues/existing_issue`).get());
    await assertFails(
      db.doc(`tenants/${TENANT_SUSPENDED}/issues/injected`).set({
        id: 'injected',
        tenantId: TENANT_SUSPENDED,
        title: 'Injected issue',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_SUSPENDED}/issues/existing_issue`).update({ title: 'Changed' })
    );
    await assertFails(db.doc(`tenants/${TENANT_SUSPENDED}/issues/existing_issue`).delete());
  });

  test('global user profiles are self-readable but not enumerable by another authenticated user', async () => {
    const ownerDb = testEnv.authenticatedContext(USERS.activeAdminA).firestore();
    const otherDb = testEnv.authenticatedContext(USERS.activeAdminB).firestore();

    await assertSucceeds(ownerDb.doc(`users/${USERS.activeAdminA}`).get());
    await assertFails(otherDb.doc(`users/${USERS.activeAdminA}`).get());
    await assertFails(otherDb.collection('users').get());
  });

  test('an invitation recipient must present a verified matching email before reading the invitation', async () => {
    const unverifiedDb = testEnv.authenticatedContext('invitee_unverified', {
      email: 'invitee@example.test',
      email_verified: false,
    }).firestore();
    const verifiedDb = testEnv.authenticatedContext('invitee_verified', {
      email: 'invitee@example.test',
      email_verified: true,
    }).firestore();
    const wrongEmailDb = testEnv.authenticatedContext('invitee_wrong', {
      email: 'other@example.test',
      email_verified: true,
    }).firestore();

    await assertFails(unverifiedDb.doc('invitations/invitation_a').get());
    await assertFails(wrongEmailDb.doc('invitations/invitation_a').get());
    await assertSucceeds(verifiedDb.doc('invitations/invitation_a').get());
  });

  test('active Tenant B admin cannot read or mutate Tenant A, including admin-only paths', async () => {
    const db = testEnv.authenticatedContext(USERS.activeAdminB).firestore();

    await assertSucceeds(db.doc(`tenants/${TENANT_B}`).get());
    await assertFails(db.doc(`tenants/${TENANT_B}`).update({ name: 'Tenant B Updated' }));

    await assertFails(db.doc(`tenants/${TENANT_A}`).get());
    await assertFails(db.doc(`tenants/${TENANT_A}`).update({ name: 'Cross-tenant overwrite' }));
    await assertFails(db.doc('invitations/invitation_a').get());
    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/cross_tenant_issue`).set({
        id: 'cross_tenant_issue',
        tenantId: TENANT_A,
        title: 'Cross-tenant issue',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/tasks/existing_task`).update({ title: 'Cross-tenant task' }));
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).delete());
  });

  test('tenant-scoped payload invariants reject a same-tenant user smuggling another tenant ID', async () => {
    const db = testEnv.authenticatedContext(USERS.activeAdminA).firestore();

    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/mismatched_issue`).set({
        id: 'mismatched_issue',
        tenantId: TENANT_B,
        title: 'Mismatched tenant',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/tasks/existing_task`).update({
        tenantId: TENANT_B,
      })
    );
  });

  test.each([
    ['auditor', USERS.activeAuditorA],
    ['viewer', USERS.activeViewerA],
  ])('%s uses governed operational projections and has zero direct mutation privileges', async (_role, uid) => {
    const db = testEnv.authenticatedContext(uid).firestore();

    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).get());
    await assertFails(db.doc(`tenants/${TENANT_A}/tasks/existing_task`).get());
    // Raw control documents are intentionally server-only. Every persona,
    // including auditors, must use the callable projection that verifies the
    // current version, command receipt, audit anchor, and review evidence.
    await assertFails(db.doc(`tenants/${TENANT_A}/controls/existing_control`).get());
    await assertSucceeds(db.doc(`tenants/${TENANT_A}/iso_internal_audits/existing_audit`).get());

    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/read_only_issue`).set({
        id: 'read_only_issue',
        tenantId: TENANT_A,
        title: 'Read-only mutation',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/tasks/existing_task`).update({ title: 'Read-only mutation' }));
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/existing_issue`).delete());
    await assertFails(
      db.doc(`tenants/${TENANT_A}/controls/existing_control/reviews/read_only_review`).set({
        id: 'read_only_review',
        tenantId: TENANT_A,
        reviewerId: uid,
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/iso_internal_audits/read_only_audit`).set({
        id: 'read_only_audit',
        tenantId: TENANT_A,
        title: 'Read-only audit mutation',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/iso_internal_audits/existing_audit/findings/read_only_finding`).set({
        id: 'read_only_finding',
        tenantId: TENANT_A,
        title: 'Read-only finding mutation',
      })
    );
    await assertFails(
      db.doc(`tenants/${TENANT_A}/export_jobs/read_only_export`).set({
        id: 'read_only_export',
        tenantId: TENANT_A,
        requestedBy: uid,
        status: 'pending',
      })
    );
  });

  test('platform administrator bypass remains available for trusted server-side operations', async () => {
    const db = testEnv.authenticatedContext('platform_operator', { platform_admin: true }).firestore();

    await assertSucceeds(db.doc(`tenants/${TENANT_A}`).get());
    await assertSucceeds(db.doc(`tenants/${TENANT_B}`).get());
    await assertFails(
      db.doc(`tenants/${TENANT_A}/issues/platform_issue`).set({
        id: 'platform_issue',
        tenantId: TENANT_A,
        title: 'Platform-operated issue',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_A}/issues/platform_issue`).delete());
  });

  test.each([
    ['ordinary member', USERS.activeContributorA, {}],
    ['tenant admin', USERS.activeAdminA, {}],
    ['platform-admin browser session', 'platform_operator', { platform_admin: true }],
  ])('%s cannot access command receipts, outbox records, or actor rate-limit state', async (_label, uid, claims) => {
    const db = testEnv.authenticatedContext(uid, claims).firestore();

    for (const [collection, existingId] of [
      ['command_receipts', 'existing_receipt'],
      ['command_outbox', 'existing_message'],
    ] as const) {
      const existingRef = db.doc(`tenants/${TENANT_A}/${collection}/${existingId}`);
      const injectedRef = db.doc(`tenants/${TENANT_A}/${collection}/browser_injection`);

      await assertFails(existingRef.get());
      await assertFails(
        injectedRef.set({
          id: 'browser_injection',
          tenantId: TENANT_A,
          status: 'committed',
        })
      );
      await assertFails(existingRef.update({ status: 'tampered' }));
      await assertFails(existingRef.delete());
    }

    const rateLimitRef = db.doc(`command_rate_limits/${'a'.repeat(64)}`);
    await assertFails(rateLimitRef.get());
    await assertFails(
      db.doc(`command_rate_limits/${'b'.repeat(64)}`).set({
        schemaVersion: 1,
        actorHash: 'b'.repeat(64),
        totalAttempts: 0,
      })
    );
    await assertFails(rateLimitRef.update({ totalAttempts: 0 }));
    await assertFails(rateLimitRef.delete());
  });
});

import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeFunctionsEmulatorAppCheck } from './app-check-emulator.mjs';

const requireFromFunctions = createRequire(
  new URL('../../functions/package.json', import.meta.url)
);
const requireFromWeb = createRequire(
  new URL('../../apps/web/package.json', import.meta.url)
);

const {
  initializeApp: initializeAdminApp,
  deleteApp: deleteAdminApp,
} = requireFromFunctions('firebase-admin/app');
const { getAuth: getAdminAuth } = requireFromFunctions('firebase-admin/auth');
const { getFirestore } = requireFromFunctions('firebase-admin/firestore');
const {
  initializeApp: initializeClientApp,
  deleteApp: deleteClientApp,
} = requireFromWeb('firebase/app');
const {
  connectAuthEmulator,
  getAuth,
  signInWithEmailAndPassword,
  signOut,
} = requireFromWeb('firebase/auth');
const {
  connectFunctionsEmulator,
  getFunctions,
  httpsCallable,
} = requireFromWeb('firebase/functions');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function requireEmulatorEnvironment() {
  if (!process.env.FIRESTORE_EMULATOR_HOST || !process.env.FIREBASE_AUTH_EMULATOR_HOST) {
    throw new Error(
      'Refusing to run tenant provisioning integration without Firestore and Auth emulators.'
    );
  }
}

async function expectCallableCode(operation, expectedCode) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === expectedCode,
      `Expected callable error ${expectedCode}, received ${error?.code || error}`
    );
    return;
  }
  throw new Error(`Expected callable error ${expectedCode}, but the request succeeded.`);
}

requireEmulatorEnvironment();
const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const suffix = randomUUID().replaceAll('-', '').toLowerCase();
const password = `Provision-${suffix.slice(0, 16)}-A1!`;
const entitledUid = `tenant_creator_${suffix}`;
const unentitledUid = `tenant_unentitled_${suffix}`;
const unverifiedUid = `tenant_unverified_${suffix}`;
const invalidLimitUid = `tenant_invalid_limit_${suffix}`;
const recipientUid = `tenant_recipient_${suffix}`;
const tenantSlug = `provision-${suffix.slice(0, 32)}`;

const adminApp = initializeAdminApp({ projectId }, `tenant-provision-admin-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getFirestore(adminApp);
const clientApp = initializeClientApp(
  {
    projectId,
    apiKey: 'emulator-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    appId: `1:000000000000:web:${suffix.slice(0, 24)}`,
  },
  `tenant-provision-client-${suffix}`
);
initializeFunctionsEmulatorAppCheck(clientApp);
const clientAuth = getAuth(clientApp);
connectAuthEmulator(clientAuth, `http://${authHost}`, { disableWarnings: true });
const clientFunctions = getFunctions(clientApp, 'europe-west3');
connectFunctionsEmulator(clientFunctions, '127.0.0.1', 5001);
const createTenant = httpsCallable(clientFunctions, 'createTenant', {
  limitedUseAppCheckTokens: true,
});
const inviteUser = httpsCallable(clientFunctions, 'inviteUserToTenant');
const acceptInvite = httpsCallable(clientFunctions, 'acceptTenantInvite');
const assignRole = httpsCallable(clientFunctions, 'assignTenantRole');

try {
  const users = [
    [entitledUid, true, { tenant_creator: true, tenant_creation_limit: 1 }],
    [unentitledUid, true, {}],
    [unverifiedUid, false, { tenant_creator: true, tenant_creation_limit: 1 }],
    [invalidLimitUid, true, { tenant_creator: true, tenant_creation_limit: 0 }],
    [recipientUid, true, {}],
  ];
  for (const [uid, emailVerified, claims] of users) {
    await adminAuth.createUser({
      uid,
      email: `${uid}@example.test`,
      emailVerified,
      password,
    });
    await adminAuth.setCustomUserClaims(uid, claims);
  }

  await signInWithEmailAndPassword(
    clientAuth,
    `${unentitledUid}@example.test`,
    password
  );
  await expectCallableCode(
    () => createTenant({ name: 'Unentitled Tenant', slug: `no-entitlement-${suffix.slice(0, 20)}` }),
    'functions/permission-denied'
  );
  await signOut(clientAuth);

  await signInWithEmailAndPassword(
    clientAuth,
    `${unverifiedUid}@example.test`,
    password
  );
  await expectCallableCode(
    () => createTenant({ name: 'Unverified Tenant', slug: `unverified-${suffix.slice(0, 20)}` }),
    'functions/permission-denied'
  );
  await signOut(clientAuth);

  await signInWithEmailAndPassword(
    clientAuth,
    `${invalidLimitUid}@example.test`,
    password
  );
  await expectCallableCode(
    () => createTenant({ name: 'Invalid Limit Tenant', slug: `invalid-limit-${suffix.slice(0, 20)}` }),
    'functions/failed-precondition'
  );
  await signOut(clientAuth);

  await signInWithEmailAndPassword(
    clientAuth,
    `${entitledUid}@example.test`,
    password
  );
  await expectCallableCode(
    () =>
      createTenant({
        name: 'Forged Enterprise Tenant',
        slug: tenantSlug,
        tier: 'enterprise',
        status: 'active',
      }),
    'functions/invalid-argument'
  );

  const request = { name: 'Provisioning Integration Tenant', slug: tenantSlug };
  const first = (await createTenant(request)).data;
  assert(first.success === true, 'Tenant provisioning did not report success.');
  assert(first.replayed === false, 'Initial tenant provisioning was marked as replayed.');
  assert(first.tenantId === tenantSlug, 'Tenant provisioning returned an unexpected ID.');

  const replay = (await createTenant(request)).data;
  assert(replay.replayed === true, 'Exact tenant provisioning retry was not idempotent.');
  assert(replay.tenantId === tenantSlug, 'Provisioning replay returned a different tenant.');

  await expectCallableCode(
    () => createTenant({ name: 'Conflicting Tenant Name', slug: tenantSlug }),
    'functions/already-exists'
  );
  await expectCallableCode(
    () =>
      createTenant({
        name: 'Over Quota Tenant',
        slug: `over-quota-${suffix.slice(0, 20)}`,
      }),
    'functions/resource-exhausted'
  );

  const [tenant, membership, quota, receipts, audits] = await Promise.all([
    adminDb.doc(`tenants/${tenantSlug}`).get(),
    adminDb.doc(`tenants/${tenantSlug}/memberships/${entitledUid}`).get(),
    adminDb.doc(`tenant_creation_quotas/${entitledUid}`).get(),
    adminDb
      .collection(`tenant_creation_quotas/${entitledUid}/provisioning_receipts`)
      .get(),
    adminDb.collection(`tenants/${tenantSlug}/audit_logs`).get(),
  ]);

  assert(tenant.exists, 'Provisioned tenant root is missing.');
  assert(tenant.data()?.tier === 'starter', 'Tenant tier was not server-owned.');
  assert(tenant.data()?.status === 'active', 'Tenant status was not server-owned.');
  assert(
    tenant.data()?.dataRegion === 'europe-west3',
    'Tenant region was not server-owned.'
  );
  assert(
    Array.isArray(tenant.data()?.enabledFrameworks) &&
      tenant.data().enabledFrameworks.length === 0,
    'Tenant frameworks were not server-owned.'
  );
  assert(membership.data()?.role === 'tenant_admin', 'Founding membership is incorrect.');
  assert(membership.data()?.userId === entitledUid, 'Founding membership identity is incorrect.');
  assert(quota.data()?.createdTenants === 1, 'Provisioning retry consumed quota twice.');
  assert(receipts.size === 1, 'Provisioning did not create exactly one idempotency receipt.');
  assert(audits.size === 1, 'Provisioning retry created duplicate or missing audit events.');
  assert(
    audits.docs[0]?.data().workflowContext === 'tenant_creation',
    'Tenant provisioning audit context is missing.'
  );

  const receiptAuditLogId = receipts.docs[0]?.data().auditLogId;
  assert(
    typeof receiptAuditLogId === 'string' && receiptAuditLogId.length > 0,
    'Provisioning receipt is missing its audit anchor.'
  );
  const receiptAuditRef = adminDb.doc(
    `tenants/${tenantSlug}/audit_logs/${receiptAuditLogId}`
  );
  await receiptAuditRef.update({ source: 'corrupted_test_source' });
  await expectCallableCode(
    () => createTenant(request),
    'functions/failed-precondition'
  );
  await receiptAuditRef.update({ source: 'cloud_function' });

  const invitationRequest = {
    tenantId: tenantSlug,
    email: `${recipientUid}@example.test`,
    role: 'auditor',
    department: 'Independent Assurance',
  };
  const duplicateInvitations = await Promise.allSettled([
    inviteUser(invitationRequest),
    inviteUser(invitationRequest),
  ]);
  const fulfilledInvitations = duplicateInvitations.filter(
    (result) => result.status === 'fulfilled'
  );
  const rejectedInvitations = duplicateInvitations.filter(
    (result) => result.status === 'rejected'
  );
  assert(
    fulfilledInvitations.length === 1 && rejectedInvitations.length === 1,
    'Concurrent duplicate invitations did not converge to one authoritative record.'
  );
  assert(
    rejectedInvitations[0]?.reason?.code === 'functions/already-exists',
    'Duplicate invitation was not rejected with already-exists.'
  );
  const invitationId = fulfilledInvitations[0]?.value?.data?.invitationId;
  assert(typeof invitationId === 'string', 'Invitation did not return its deterministic ID.');

  await signOut(clientAuth);
  await signInWithEmailAndPassword(
    clientAuth,
    `${recipientUid}@example.test`,
    password
  );
  const accepted = (await acceptInvite({ invitationId })).data;
  assert(accepted.replayed === false, 'Initial invitation acceptance was marked replayed.');
  const acceptedReplay = (await acceptInvite({ invitationId })).data;
  assert(acceptedReplay.replayed === true, 'Invitation acceptance retry was not idempotent.');

  await signOut(clientAuth);
  await signInWithEmailAndPassword(
    clientAuth,
    `${entitledUid}@example.test`,
    password
  );
  const roleAssignment = (
    await assignRole({
      tenantId: tenantSlug,
      targetUserId: recipientUid,
      newRole: 'contributor',
    })
  ).data;
  assert(roleAssignment.changed === true, 'Role assignment did not report its mutation.');

  await signOut(clientAuth);
  await signInWithEmailAndPassword(
    clientAuth,
    `${recipientUid}@example.test`,
    password
  );
  await expectCallableCode(
    () => acceptInvite({ invitationId }),
    'functions/failed-precondition'
  );

  const [recipientMembership, invitations, finalAudits] = await Promise.all([
    adminDb.doc(`tenants/${tenantSlug}/memberships/${recipientUid}`).get(),
    adminDb.collection('invitations').where('tenantId', '==', tenantSlug).get(),
    adminDb.collection(`tenants/${tenantSlug}/audit_logs`).get(),
  ]);
  assert(
    recipientMembership.data()?.role === 'contributor',
    'Atomic role assignment did not persist the expected role.'
  );
  assert(invitations.size === 1, 'Concurrent invitation calls created duplicate records.');
  assert(
    finalAudits.size === 4,
    'Provisioning, invitation, acceptance, and role assignment require one audit each.'
  );

  process.stdout.write('Tenant provisioning integration: PASS\n');
} finally {
  await signOut(clientAuth).catch(() => undefined);
  await Promise.all([deleteClientApp(clientApp), deleteAdminApp(adminApp)]);
}

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
  const firestoreHost = process.env.FIRESTORE_EMULATOR_HOST;
  const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST;
  if (!firestoreHost || !authHost) {
    throw new Error(
      'Refusing to run policy callable integration tests without Firestore and Auth emulator hosts.'
    );
  }
  return { authHost };
}

function command(tenantId, payload, expectedRevision) {
  return {
    envelopeVersion: 1,
    commandVersion: 1,
    tenantId,
    commandId: randomUUID(),
    expectedRevision,
    payload,
  };
}

function policyPayload(overrides = {}) {
  return {
    code: 'POL-INT-01',
    title: 'Integration Information Security Policy',
    version: '1.0',
    summary: 'Defines the integration tenant security control baseline.',
    scope: 'All integration tenant personnel and systems.',
    contentMarkdown:
      '# Security policy\n\n' +
      'All workforce identities must use phishing-resistant multi-factor authentication. ' +
      'Privileged access must be approved, time-bound, logged, and reviewed every quarter. ' +
      'Control owners must retain review evidence and remediate exceptions through the governed issue process.',
    storagePath: null,
    linkedControlIds: [],
    ...overrides,
  };
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
  throw new Error(`Expected callable error ${expectedCode}, but the command succeeded.`);
}

function createClient(projectId, suffix, name) {
  const app = initializeClientApp(
    {
      projectId,
      apiKey: 'emulator-api-key',
      authDomain: `${projectId}.firebaseapp.com`,
      appId: `1:000000000000:web:${suffix.slice(0, 18)}${name}`,
    },
    `policy-${name}-${suffix}`
  );
  initializeFunctionsEmulatorAppCheck(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const functions = getFunctions(app, 'europe-west3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  return { app, auth, functions };
}

const { authHost } = requireEmulatorEnvironment();
const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const suffix = randomUUID().replaceAll('-', '');
const tenantId = `tenant_policy_${suffix}`;
const reservationTenantId = `tenant_policy_reservation_${suffix}`;
const adminUid = `policy_admin_${suffix}`;
const approverUid = `policy_approver_${suffix}`;
const recoveryReviewerUid = `policy_recovery_reviewer_${suffix}`;
const adminEmail = `${adminUid}@example.test`;
const approverEmail = `${approverUid}@example.test`;
const recoveryReviewerEmail = `${recoveryReviewerUid}@example.test`;
const password = `Policy-${suffix.slice(0, 16)}-A1!`;

const adminApp = initializeAdminApp({ projectId }, `policy-admin-sdk-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getFirestore(adminApp);
const adminClient = createClient(projectId, suffix, 'author');
const approverClient = createClient(projectId, suffix, 'approver');
const recoveryReviewerClient = createClient(projectId, suffix, 'recovery-reviewer');

try {
  await Promise.all([
    adminAuth.createUser({
      uid: adminUid,
      email: adminEmail,
      emailVerified: true,
      password,
    }),
    adminAuth.createUser({
      uid: approverUid,
      email: approverEmail,
      emailVerified: true,
      password,
    }),
    adminAuth.createUser({
      uid: recoveryReviewerUid,
      email: recoveryReviewerEmail,
      emailVerified: true,
      password,
    }),
  ]);
  await adminDb.doc(`tenants/${tenantId}`).set({
    id: tenantId,
    name: 'Policy Command Integration Tenant',
    slug: `policy-${suffix.slice(0, 24)}`,
    status: 'active',
  });
  await adminDb.doc(`tenants/${reservationTenantId}`).set({
    id: reservationTenantId,
    name: 'Policy Reservation Integration Tenant',
    slug: `policy-reservation-${suffix.slice(0, 20)}`,
    status: 'active',
  });
  await Promise.all([
    adminDb.doc(`tenants/${tenantId}/memberships/${adminUid}`).set({
      id: adminUid,
      tenantId,
      userId: adminUid,
      role: 'tenant_admin',
      status: 'active',
    }),
    adminDb.doc(`tenants/${tenantId}/memberships/${approverUid}`).set({
      id: approverUid,
      tenantId,
      userId: approverUid,
      role: 'approver',
      status: 'active',
    }),
    adminDb.doc(`tenants/${tenantId}/memberships/${recoveryReviewerUid}`).set({
      id: recoveryReviewerUid,
      tenantId,
      userId: recoveryReviewerUid,
      role: 'approver',
      status: 'active',
    }),
    adminDb.doc(`tenants/${reservationTenantId}/memberships/${adminUid}`).set({
      id: adminUid,
      tenantId: reservationTenantId,
      userId: adminUid,
      role: 'tenant_admin',
      status: 'active',
    }),
  ]);

  await Promise.all([
    signInWithEmailAndPassword(adminClient.auth, adminEmail, password),
    signInWithEmailAndPassword(approverClient.auth, approverEmail, password),
    signInWithEmailAndPassword(
      recoveryReviewerClient.auth,
      recoveryReviewerEmail,
      password
    ),
  ]);

  const createPolicy = httpsCallable(adminClient.functions, 'createTenantPolicy');
  const updatePolicy = httpsCallable(adminClient.functions, 'updateTenantPolicy');
  const transitionAsAdmin = httpsCallable(
    adminClient.functions,
    'transitionPolicyStatus'
  );
  const transitionAsApprover = httpsCallable(
    approverClient.functions,
    'transitionPolicyStatus'
  );
  const transitionAsRecoveryReviewer = httpsCallable(
    recoveryReviewerClient.functions,
    'transitionPolicyStatus'
  );
  const updateAsRecoveryAdmin = httpsCallable(
    approverClient.functions,
    'updateTenantPolicy'
  );
  const retireAsRecoveryAdmin = httpsCallable(
    approverClient.functions,
    'deleteTenantPolicy'
  );
  const listPolicies = httpsCallable(
    approverClient.functions,
    'listTenantPolicies'
  );
  const getPolicyDetail = httpsCallable(
    approverClient.functions,
    'getTenantPolicyDetail'
  );
  const getPolicyHistory = httpsCallable(
    approverClient.functions,
    'getTenantPolicyHistory'
  );

  const duplicateCodePayload = policyPayload({
    code: 'POL-CONCURRENT-01',
    title: 'Concurrent Reservation Policy',
  });
  const duplicateCreateResults = await Promise.allSettled([
    createPolicy(command(reservationTenantId, duplicateCodePayload, null)),
    createPolicy(command(reservationTenantId, duplicateCodePayload, null)),
  ]);
  assert(
    duplicateCreateResults.filter((result) => result.status === 'fulfilled').length === 1,
    `Exactly one concurrent create with a duplicate policy code must commit: ${JSON.stringify(
      duplicateCreateResults.map((result) =>
        result.status === 'fulfilled'
          ? { status: result.status, data: result.value.data }
          : {
              status: result.status,
              code: result.reason?.code,
              message: result.reason?.message,
            }
      )
    )}`
  );
  const duplicateCreateFailure = duplicateCreateResults.find(
    (result) => result.status === 'rejected'
  );
  assert(
    duplicateCreateFailure?.reason?.code === 'functions/already-exists',
    `Concurrent duplicate policy code was not rejected authoritatively: ${
      duplicateCreateFailure?.reason?.code || duplicateCreateFailure?.reason
    }`
  );
  const [reservationPolicies, codeReservations] = await Promise.all([
    adminDb.collection(`tenants/${reservationTenantId}/policies`).get(),
    adminDb
      .collection(`tenants/${reservationTenantId}/policy_code_reservations`)
      .get(),
  ]);
  assert(
    reservationPolicies.size === 1 && codeReservations.size === 1,
    'Policy code uniqueness must be backed by one deterministic reservation.'
  );

  const malformedLegacyPolicyId = `malformed_legacy_${suffix}`;
  const malformedLegacyTimestamp = new Date(
    Date.now() - 180 * 24 * 60 * 60 * 1_000
  ).toISOString();
  await adminDb
    .doc(
      `tenants/${reservationTenantId}/policies/${malformedLegacyPolicyId}`
    )
    .set({
      id: malformedLegacyPolicyId,
      tenantId: reservationTenantId,
      code: 'POL-MALFORMED-01',
      title: 'Malformed Legacy Policy',
      version: '1.0',
      summary: 'A legacy draft with relationships that require governed repair.',
      scope: 'All legacy integration systems.',
      contentMarkdown: policyPayload().contentMarkdown,
      storagePath: null,
      linkedControlIds: ['duplicate_control', 'duplicate_control'],
      status: 'draft',
      ownerId: 'malformed/owner',
      approverId: null,
      approvedAt: null,
      effectiveDate: null,
      nextReviewDate: new Date(
        Date.now() + 180 * 24 * 60 * 60 * 1_000
      ).toISOString(),
      createdAt: malformedLegacyTimestamp,
      updatedAt: malformedLegacyTimestamp,
      createdBy: adminUid,
      updatedBy: adminUid,
    });
  const relationshipRepairResponse = await updatePolicy(
    command(
      reservationTenantId,
      {
        policyId: malformedLegacyPolicyId,
        title: 'Repaired Legacy Policy',
        ownerId: adminUid,
        linkedControlIds: [],
      },
      0
    )
  );
  assert(
    relationshipRepairResponse.data.result?.revision === 1,
    'A valid proposed after-state did not repair malformed legacy relationships.'
  );

  await expectCallableCode(
    () =>
      createPolicy(
        command(
          tenantId,
          policyPayload({
            code: 'POL-INVALID-OWNER-01',
            ownerId: approverUid,
          }),
          null
        )
    ),
    'functions/failed-precondition'
  );
  const crossTenantControlId = `control_other_tenant_${suffix}`;
  await adminDb
    .doc(
      `tenants/${reservationTenantId}/controls/${crossTenantControlId}`
    )
    .set({
      id: crossTenantControlId,
      tenantId: reservationTenantId,
      code: 'CTRL-OTHER-01',
      title: 'Other tenant control',
      status: 'active',
    });
  await expectCallableCode(
    () =>
      createPolicy(
        command(
          tenantId,
          policyPayload({
            code: 'POL-CROSS-TENANT-01',
            linkedControlIds: [crossTenantControlId],
          }),
          null
        )
      ),
    'functions/failed-precondition'
  );

  await expectCallableCode(
    () =>
      createPolicy(
        command(tenantId, policyPayload({ status: 'active' }), null)
      ),
    'functions/invalid-argument'
  );

  const createEnvelope = command(tenantId, policyPayload(), null);
  const createResponse = await createPolicy(createEnvelope);
  assert(createResponse.data.replayed === false, 'Initial policy create must not replay.');
  assert(
    createResponse.data.envelopeVersion === 1 && createResponse.data.commandVersion === 1,
    'Policy create response did not disclose the committed command protocol versions.'
  );
  assert(createResponse.data.result?.revision === 1, 'Policy must begin at revision 1.');
  const policyId = createResponse.data.result?.policyId;
  assert(typeof policyId === 'string', 'Policy create did not return a policy ID.');

  const replayResponse = await createPolicy(createEnvelope);
  assert(replayResponse.data.replayed === true, 'Exact policy create retry must replay.');
  assert(
    replayResponse.data.envelopeVersion === 1 && replayResponse.data.commandVersion === 1,
    'Policy receipt replay did not preserve its protocol versions.'
  );
  assert(
    replayResponse.data.result?.policyId === policyId,
    'Policy create replay returned a different policy.'
  );

  await expectCallableCode(
    () =>
      updatePolicy(
        command(
          tenantId,
          {
            policyId,
            title: 'Injected approval update',
            approverId: adminUid,
            status: 'approved',
          },
          1
        )
      ),
    'functions/invalid-argument'
  );

  const updateResponse = await updatePolicy(
    command(
      tenantId,
      { policyId, title: 'Updated Integration Information Security Policy' },
      1
    )
  );
  assert(updateResponse.data.result?.revision === 2, 'Draft update must increment revision.');

  await expectCallableCode(
    () =>
      updatePolicy(
        command(
          tenantId,
          { policyId, title: 'Updated Integration Information Security Policy' },
          2
        )
      ),
    'functions/failed-precondition'
  );
  await expectCallableCode(
    () =>
      transitionAsAdmin(
        command(
          tenantId,
          { policyId, targetStatus: 'under_review', decisionNotes: null },
          2
        )
      ),
    'functions/invalid-argument'
  );
  await expectCallableCode(
    () =>
      transitionAsAdmin(
        command(
          tenantId,
          {
            policyId,
            targetStatus: 'under_review',
            decisionNotes: null,
            reviewAssigneeId: adminUid,
          },
          2
        )
      ),
    'functions/failed-precondition'
  );

  const submitResponse = await transitionAsAdmin(
    command(
      tenantId,
      {
        policyId,
        targetStatus: 'under_review',
        decisionNotes: null,
        reviewAssigneeId: approverUid,
      },
      2
    )
  );
  assert(
    submitResponse.data.result?.revision === 3 &&
      submitResponse.data.result?.status === 'under_review',
    'Draft submission did not enter under_review at revision 3.'
  );

  await expectCallableCode(
    () =>
      transitionAsRecoveryReviewer(
        command(
          tenantId,
          {
            policyId,
            targetStatus: 'approved',
            decisionNotes: 'An unassigned reviewer attempts to approve this policy.',
          },
          3
        )
      ),
    'functions/failed-precondition'
  );

  await expectCallableCode(
    () =>
      transitionAsAdmin(
        command(
          tenantId,
          { policyId, targetStatus: 'active', decisionNotes: null },
          3
        )
      ),
    'functions/failed-precondition'
  );
  await expectCallableCode(
    () =>
      transitionAsAdmin(
        command(
          tenantId,
          {
            policyId,
            targetStatus: 'approved',
            decisionNotes: 'Admin attempts to approve their own authored policy.',
          },
          3
        )
      ),
    'functions/failed-precondition'
  );
  await expectCallableCode(
    () =>
      transitionAsApprover(
        command(
          tenantId,
          {
            policyId,
            targetStatus: 'approved',
            decisionNotes: 'Independent approval with injected identity rejected.',
            approverId: adminUid,
          },
          3
        )
    ),
    'functions/invalid-argument'
  );

  const submittedCommandId = submitResponse.data.commandId;
  assert(
    typeof submittedCommandId === 'string',
    'Review submission did not return its authoritative command anchor.'
  );
  await adminDb.doc(`tenants/${tenantId}/policies/${policyId}`).update({
    reviewSubmissionCommandId: randomUUID(),
  });
  await expectCallableCode(
    () =>
      transitionAsApprover(
        command(
          tenantId,
          {
            policyId,
            targetStatus: 'approved',
            decisionNotes: 'Approval must reject a forged review-submission anchor.',
          },
          3
        )
      ),
    'functions/failed-precondition'
  );
  await adminDb.doc(`tenants/${tenantId}/policies/${policyId}`).update({
    reviewSubmissionCommandId: submittedCommandId,
  });

  const approvalResponse = await transitionAsApprover(
    command(
      tenantId,
      {
        policyId,
        targetStatus: 'approved',
        decisionNotes: 'Independently reviewed and approved for controlled activation.',
      },
      3
    )
  );
  assert(
    approvalResponse.data.result?.revision === 4 &&
      approvalResponse.data.result?.status === 'approved',
    'Independent approval did not produce revision 4.'
  );

  const activationResponse = await transitionAsAdmin(
    command(
      tenantId,
      { policyId, targetStatus: 'active', decisionNotes: null },
      4
    )
  );
  assert(
    activationResponse.data.result?.revision === 5 &&
      activationResponse.data.result?.status === 'active',
    'Receipt-anchored approval did not activate at revision 5.'
  );

  await Promise.all([
    adminDb.doc(`tenants/${tenantId}/memberships/${adminUid}`).update({
      status: 'suspended',
    }),
    adminDb.doc(`tenants/${tenantId}/memberships/${approverUid}`).update({
      role: 'tenant_admin',
    }),
  ]);
  const recoveryReviewResponse = await transitionAsApprover(
    command(
      tenantId,
      {
        policyId,
        targetStatus: 'under_review',
        decisionNotes: null,
        reviewAssigneeId: recoveryReviewerUid,
      },
      5
    )
  );
  assert(
    recoveryReviewResponse.data.result?.revision === 6,
    'An offboarded owner must not deadlock an active policy review.'
  );
  const recoveryDraftResponse = await transitionAsApprover(
    command(
      tenantId,
      {
        policyId,
        targetStatus: 'draft',
        decisionNotes: 'Returning to draft so an active owner can be assigned.',
      },
      6
    )
  );
  assert(
    recoveryDraftResponse.data.result?.revision === 7,
    'Recovery review could not return the policy to an editable draft.'
  );
  const reassignmentResponse = await updateAsRecoveryAdmin(
    command(
      tenantId,
      {
        policyId,
        ownerId: approverUid,
        title: 'Recovered Integration Information Security Policy',
      },
      7
    )
  );
  assert(
    reassignmentResponse.data.result?.revision === 8,
    'Policy could not be reassigned after owner offboarding.'
  );

  const retirementResponse = await retireAsRecoveryAdmin(
    command(
      tenantId,
      {
        policyId,
        retirementReason: 'Superseded by a consolidated integration policy.',
      },
      8
    )
  );
  assert(retirementResponse.data.result?.revision === 9, 'Retirement must increment revision.');
  assert(
    retirementResponse.data.result?.deleted === false &&
      retirementResponse.data.result?.retired === true,
    'Policy retirement must disclose that no hard deletion occurred.'
  );

  const legacyPolicyId = `legacy_policy_${suffix}`;
  const legacyTimestamp = new Date(Date.now() - 365 * 24 * 60 * 60 * 1_000).toISOString();
  await adminDb.doc(`tenants/${tenantId}/policies/${legacyPolicyId}`).set({
    id: legacyPolicyId,
    tenantId,
    code: 'POL-LEGACY-01',
    title: 'Legacy Integration Security Policy',
    version: '1.0',
    summary: 'A legacy draft requiring its first authoritative policy mutation.',
    scope: 'All legacy integration systems and personnel.',
    contentMarkdown: policyPayload().contentMarkdown,
    storagePath: null,
    linkedControlIds: [],
    status: 'draft',
    ownerId: approverUid,
    approverId: null,
    approvedAt: null,
    effectiveDate: null,
    nextReviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
    createdAt: legacyTimestamp,
    updatedAt: legacyTimestamp,
    createdBy: approverUid,
    updatedBy: approverUid,
  });
  const legacyUpdateResponse = await updateAsRecoveryAdmin(
    command(
      tenantId,
      {
        policyId: legacyPolicyId,
        title: 'Governed Legacy Integration Security Policy',
      },
      0
    )
  );
  assert(
    legacyUpdateResponse.data.result?.revision === 1,
    'First governed legacy policy mutation must advance from implicit revision zero.'
  );

  const legacyPolicyRef = adminDb.doc(
    `tenants/${tenantId}/policies/${legacyPolicyId}`
  );
  await legacyPolicyRef.update({
    title: 'Out-of-band tampered legacy policy title',
  });
  await expectCallableCode(
    () =>
      updateAsRecoveryAdmin(
        command(
          tenantId,
          {
            policyId: legacyPolicyId,
            summary: 'This attempted update must not cross a divergent immutable version.',
          },
          1
        )
      ),
    'functions/failed-precondition'
  );
  await legacyPolicyRef.update({
    title: 'Governed Legacy Integration Security Policy',
  });

  const legacyActivePolicyId = `legacy_active_policy_${suffix}`;
  await adminDb.doc(`tenants/${tenantId}/policies/${legacyActivePolicyId}`).set({
    id: legacyActivePolicyId,
    tenantId,
    code: 'POL-LEGACY-ACTIVE-01',
    title: 'Unverified Legacy Active Policy',
    version: '1.0',
    summary: 'A historically active record without an authoritative lifecycle anchor.',
    scope: 'All legacy systems and personnel.',
    contentMarkdown: policyPayload().contentMarkdown,
    storagePath: null,
    linkedControlIds: [],
    status: 'active',
    ownerId: approverUid,
    approverId: approverUid,
    approvedAt: legacyTimestamp,
    effectiveDate: legacyTimestamp,
    nextReviewDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1_000).toISOString(),
    createdAt: legacyTimestamp,
    updatedAt: legacyTimestamp,
    createdBy: approverUid,
    updatedBy: approverUid,
  });

  const [retiredDetail, legacyActiveDetail, mainHistory, legacyHistory] =
    await Promise.all([
      getPolicyDetail({ tenantId, policyId }),
      getPolicyDetail({ tenantId, policyId: legacyActivePolicyId }),
      getPolicyHistory({ tenantId, policyId, pageSize: 20 }),
      getPolicyHistory({ tenantId, policyId: legacyPolicyId, pageSize: 20 }),
    ]);
  assert(
    retiredDetail.data.policy?.workflowTrust === 'retired' &&
      retiredDetail.data.policy?.assuranceStatus === 'retired',
    'Governed retirement detail did not preserve authoritative retirement provenance.'
  );
  assert(
    legacyActiveDetail.data.policy?.recordedStatus === 'active' &&
      legacyActiveDetail.data.policy?.assuranceStatus === 'legacy_unverified' &&
      legacyActiveDetail.data.policy?.workflowTrust === 'legacy_unverified',
    'A legacy active record was presented as authoritative without re-baselining.'
  );
  assert(
    mainHistory.data.history?.length === 9 &&
      mainHistory.data.history.every(
        (entry) => entry.integrityStatus === 'verified'
      ),
    'The governed policy history did not verify all command/version/audit anchors.'
  );
  assert(
    legacyHistory.data.history?.length === 2 &&
      legacyHistory.data.history[0]?.integrityStatus === 'verified' &&
      legacyHistory.data.history[1]?.integrityStatus ===
        'legacy_baseline_unverified',
    'Legacy history must distinguish the unverified captured baseline from governed revisions.'
  );

  const firstPolicyPage = await listPolicies({ tenantId, pageSize: 2 });
  assert(
    firstPolicyPage.data.policies?.length === 2 &&
      firstPolicyPage.data.truncated === true &&
      typeof firstPolicyPage.data.nextCursor === 'string' &&
      firstPolicyPage.data.policies.every(
        (policy) =>
          !Object.prototype.hasOwnProperty.call(policy, 'contentMarkdown') &&
          !Object.prototype.hasOwnProperty.call(policy, 'storagePath')
      ),
    'Policy listing must return a bounded summary page without document bodies.'
  );
  const secondPolicyPage = await listPolicies({
    tenantId,
    pageSize: 2,
    cursor: firstPolicyPage.data.nextCursor,
  });
  assert(
    secondPolicyPage.data.policies?.length === 1 &&
      secondPolicyPage.data.truncated === false,
    'Policy summary cursor did not return the remaining page.'
  );
  const activePolicyPage = await listPolicies({
    tenantId,
    status: 'active',
    pageSize: 10,
  });
  assert(
    activePolicyPage.data.policies?.length === 1 &&
      activePolicyPage.data.policies[0]?.status === 'legacy_unverified',
    'Active-status listing did not quarantine an unverified legacy lifecycle record.'
  );

  const [
    policySnapshot,
    versions,
    audits,
    receipts,
    legacyBaseline,
    legacyFirstVersion,
  ] = await Promise.all([
    adminDb.doc(`tenants/${tenantId}/policies/${policyId}`).get(),
    adminDb.collection(`tenants/${tenantId}/policies/${policyId}/versions`).get(),
    adminDb.collection(`tenants/${tenantId}/audit_logs`).get(),
    adminDb.collection(`tenants/${tenantId}/command_receipts`).get(),
    adminDb
      .doc(`tenants/${tenantId}/policies/${legacyPolicyId}/versions/r0000000000`)
      .get(),
    adminDb
      .doc(`tenants/${tenantId}/policies/${legacyPolicyId}/versions/r0000000001`)
      .get(),
  ]);
  assert(policySnapshot.exists, 'Retirement must preserve the policy record.');
  assert(policySnapshot.data()?.status === 'retired', 'Policy status was not retired.');
  assert(policySnapshot.data()?.revision === 9, 'Persisted policy revision is incorrect.');
  assert(
    policySnapshot.data()?.retiredBy === approverUid,
    'Retirement actor was not server-derived.'
  );
  assert(versions.size === 9, 'Every successful policy mutation requires one immutable version.');
  assert(audits.size === 10, 'Every successful policy mutation requires one audit event.');
  assert(receipts.size === 10, 'Every successful policy mutation requires one receipt.');
  assert(
    receipts.docs.every(
      (receipt) =>
        receipt.data().schemaVersion === 2 &&
        receipt.data().envelopeVersion === 1 &&
        receipt.data().commandVersion === 1
    ),
    'Policy receipts do not pin the command protocol versions.'
  );
  assert(legacyBaseline.exists, 'Legacy policy revision-zero baseline is missing.');
  assert(
    legacyBaseline.data()?.provenance ===
      'legacy_baseline_captured_on_first_command',
    'Legacy policy baseline does not disclose its migration provenance.'
  );
  assert(
    legacyFirstVersion.data()?.previousStateHash ===
      legacyBaseline.data()?.stateHash,
    'First governed legacy policy version is not chained to its captured baseline.'
  );

  const orderedVersions = versions.docs.sort(
    (left, right) => left.data().revision - right.data().revision
  );
  for (let index = 1; index < orderedVersions.length; index += 1) {
    assert(
      orderedVersions[index].data().previousStateHash ===
        orderedVersions[index - 1].data().stateHash,
      'Policy immutable-version hash chain is broken.'
    );
  }
  const approvalAudit = audits.docs.find((audit) => audit.data().action === 'approve');
  assert(approvalAudit, 'Policy approval audit event is missing.');
  assert(approvalAudit.data().actorId === approverUid, 'Approval actor was client-forged.');
  assert(
    approvalAudit.data().workflowContext?.startsWith('command:ev1:policy.approve:cv1:'),
    'Approval audit event is missing its command anchor.'
  );

  process.stdout.write('Policy command-boundary integration: PASS\n');
} finally {
  await Promise.all([
    signOut(adminClient.auth).catch(() => undefined),
    signOut(approverClient.auth).catch(() => undefined),
    signOut(recoveryReviewerClient.auth).catch(() => undefined),
  ]);
  await Promise.all([
    adminAuth.deleteUser(adminUid).catch(() => undefined),
    adminAuth.deleteUser(approverUid).catch(() => undefined),
    adminAuth.deleteUser(recoveryReviewerUid).catch(() => undefined),
  ]);
  await Promise.all([
    deleteClientApp(adminClient.app),
    deleteClientApp(approverClient.app),
    deleteClientApp(recoveryReviewerClient.app),
  ]);
  await deleteAdminApp(adminApp);
}

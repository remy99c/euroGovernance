import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeFunctionsEmulatorAppCheck } from './app-check-emulator.mjs';
import { stableTrustedValueHash } from '../../functions/dist/lib/command-boundary-values.js';

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
const { getFirestore: getAdminFirestore } = requireFromFunctions('firebase-admin/firestore');
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
  connectFirestoreEmulator,
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
} = requireFromWeb('firebase/firestore');
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
    throw new Error('Refusing to run control integration outside Firebase emulators.');
  }
  return { firestoreHost, authHost };
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

async function expectCallableCode(operation, expectedCode, label = 'callable') {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === expectedCode,
      `${label}: expected ${expectedCode}; received ${error?.code || error}`
    );
    return;
  }
  throw new Error(`${label}: expected ${expectedCode}, but the callable succeeded.`);
}

async function expectPermissionDenied(operation, label) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === 'permission-denied',
      `${label}: expected a Firestore permission-denied error; received ${
        error?.code || error
      }`
    );
    return;
  }
  throw new Error(`${label}: raw browser access unexpectedly succeeded.`);
}

const { firestoreHost, authHost } = requireEmulatorEnvironment();
const [firestoreHostname, firestorePort] = firestoreHost.split(':');
const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const suffix = randomUUID().replaceAll('-', '');
const tenantId = `tenant_controls_${suffix}`;
const password = `Controls-${suffix.slice(0, 16)}-A1!`;

const users = {
  manager: {
    uid: `controls_manager_${suffix}`,
    email: `controls-manager-${suffix}@example.test`,
    role: 'compliance_manager',
  },
  reviewer: {
    uid: `controls_reviewer_${suffix}`,
    email: `controls-reviewer-${suffix}@example.test`,
    role: 'approver',
  },
  scopeManager: {
    uid: `controls_scope_manager_${suffix}`,
    email: `controls-scope-manager-${suffix}@example.test`,
    role: 'compliance_manager',
  },
  contributor: {
    uid: `controls_contributor_${suffix}`,
    email: `controls-contributor-${suffix}@example.test`,
    role: 'contributor',
  },
  otherContributor: {
    uid: `controls_other_contributor_${suffix}`,
    email: `controls-other-contributor-${suffix}@example.test`,
    role: 'contributor',
  },
};

function controlPayload(overrides = {}) {
  return {
    code: `CTL-${suffix.slice(0, 8).toUpperCase()}`,
    title: 'Privileged access lifecycle review',
    description:
      'Privileged access is approved, time-bound, logged, and independently reviewed every quarter.',
    domain: 'security',
    frameworkIds: ['iso27001'],
    requirementIds: ['a.5.18'],
    enforcementMechanism: 'hybrid',
    reviewFrequencyDays: 90,
    ownerId: users.contributor.uid,
    implementationNotes:
      'The identity platform records approvals, expiry, revocation, and administrator activity.',
    ...overrides,
  };
}

const adminApp = initializeAdminApp({ projectId }, `controls-admin-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const clients = [];

async function createSignedInClient(user, label, withAppCheck = true) {
  const app = initializeClientApp(
    {
      projectId,
      apiKey: 'emulator-api-key',
      authDomain: `${projectId}.firebaseapp.com`,
      appId: `1:000000000000:web:${suffix.slice(0, 18)}${label.replaceAll('-', '')}`,
    },
    `controls-${label}-${suffix}`
  );
  if (withAppCheck) initializeFunctionsEmulatorAppCheck(app);
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${authHost}`, { disableWarnings: true });
  const firestore = getFirestore(app);
  connectFirestoreEmulator(firestore, firestoreHostname, Number(firestorePort));
  const functions = getFunctions(app, 'europe-west3');
  connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  await signInWithEmailAndPassword(auth, user.email, password);
  clients.push({ app, auth });
  return { firestore, functions };
}

try {
  for (const user of Object.values(users)) {
    await adminAuth.createUser({
      uid: user.uid,
      email: user.email,
      emailVerified: true,
      password,
    });
  }

  await adminDb.doc('frameworks/iso27001').set({
    id: 'iso27001',
    code: 'ISO27001',
    name: 'ISO/IEC 27001',
    version: '2022',
    status: 'active',
  });
  await adminDb.doc('frameworks/iso27001/requirements/a.5.18').set({
    id: 'a.5.18',
    frameworkId: 'iso27001',
    code: 'A.5.18',
    title: 'Access rights',
  });
  await adminDb.doc('frameworks/iso27001/master_controls/master_access').set({
    id: 'master_access',
    frameworkId: 'iso27001',
    code: 'MC-ACCESS',
    title: 'Access governance draft',
    description: 'Govern and periodically review access rights.',
    domain: 'security',
    recommendedFrequencyDays: 90,
    requirementIds: ['a.5.18'],
  });
  await adminDb.doc(`tenants/${tenantId}`).set({
    id: tenantId,
    name: 'Control Command Integration Tenant',
    slug: `controls-${suffix.slice(0, 20)}`,
    status: 'active',
  });
  await adminDb.doc(`tenants/${tenantId}/adopted_frameworks/iso27001`).set({
    id: 'iso27001',
    tenantId,
    frameworkId: 'iso27001',
    frameworkCode: 'ISO27001',
    frameworkName: 'ISO/IEC 27001',
    status: 'active',
    ownerId: users.manager.uid,
  });
  for (const user of Object.values(users)) {
    await adminDb.doc(`tenants/${tenantId}/memberships/${user.uid}`).set({
      id: user.uid,
      tenantId,
      userId: user.uid,
      email: user.email,
      displayName: user.uid,
      role: user.role,
      status: 'active',
    });
  }

  const manager = await createSignedInClient(users.manager, 'manager');
  const reviewer = await createSignedInClient(users.reviewer, 'reviewer');
  const scopeManager = await createSignedInClient(
    users.scopeManager,
    'scope-manager'
  );
  const contributor = await createSignedInClient(users.contributor, 'contributor');
  const otherContributor = await createSignedInClient(
    users.otherContributor,
    'other-contributor'
  );
  const missingAppCheck = await createSignedInClient(
    users.manager,
    'missing-app-check',
    false
  );

  const createControl = httpsCallable(manager.functions, 'createTenantControl');
  const instantiateFrameworkControls = httpsCallable(
    manager.functions,
    'instantiateFrameworkControls'
  );
  const instantiateTenantFrameworkControls = httpsCallable(
    manager.functions,
    'instantiateTenantFrameworkControls'
  );
  const updateControl = httpsCallable(manager.functions, 'updateTenantControl');
  const scopeManagerUpdateControl = httpsCallable(
    scopeManager.functions,
    'updateTenantControl'
  );
  const contributorUpdateControl = httpsCallable(
    contributor.functions,
    'updateTenantControl'
  );
  const otherContributorUpdateControl = httpsCallable(
    otherContributor.functions,
    'updateTenantControl'
  );
  const submitControlReview = httpsCallable(
    contributor.functions,
    'recordControlReview'
  );
  const decideControlReview = httpsCallable(
    reviewer.functions,
    'decideControlReview'
  );
  const retireControl = httpsCallable(manager.functions, 'deleteTenantControl');
  const listControls = httpsCallable(manager.functions, 'listTenantControls');
  const materializeMetrics = httpsCallable(
    manager.functions,
    'materializeTenantMetrics'
  );
  const getControlDetail = httpsCallable(
    manager.functions,
    'getTenantControlDetail'
  );
  const getControlHistory = httpsCallable(
    manager.functions,
    'getTenantControlHistory'
  );
  const createWithoutAppCheck = httpsCallable(
    missingAppCheck.functions,
    'createTenantControl'
  );

  await expectCallableCode(
    () => createWithoutAppCheck(command(tenantId, controlPayload(), null)),
    'functions/unauthenticated',
    'App Check enforcement'
  );

  await expectCallableCode(
    () =>
      createControl(
        command(tenantId, { ...controlPayload(), status: 'implemented' }, null)
      ),
    'functions/invalid-argument',
    'assurance field injection'
  );

  await adminDb.doc(`tenants/${tenantId}/summary_metrics/current`).set({
    id: 'current',
    tenantId,
    overallComplianceScore: 100,
  });
  const generatedDrafts = (
    await instantiateFrameworkControls({ tenantId, frameworkId: 'iso27001' })
  ).data;
  assert(
    generatedDrafts.createdControlsCount === 1,
    'Framework generation did not create its bounded draft.'
  );
  const generatedDraft = (
    await adminDb.doc(`tenants/${tenantId}/controls/ctl_iso27001_mc_access`).get()
  ).data();
  assert(
    JSON.stringify(generatedDraft?.requirementIds) === JSON.stringify(['a.5.18']),
    'Framework generation did not use the master control requirement mappings.'
  );
  assert(
    !(await adminDb.doc(`tenants/${tenantId}/summary_metrics/current`).get()).exists,
    'Framework generation left a stale materialized posture document.'
  );
  await adminDb.doc(`tenants/${tenantId}/adopted_frameworks/iso27001`).update({
    status: 'retired',
  });
  await expectCallableCode(
    () => instantiateFrameworkControls({ tenantId, frameworkId: 'iso27001' }),
    'functions/failed-precondition',
    'retired framework generation'
  );
  await expectCallableCode(
    () =>
      instantiateTenantFrameworkControls({
        tenantId,
        frameworkId: 'iso27001',
        defaultOwnerId: users.contributor.uid,
      }),
    'functions/failed-precondition',
    'retired framework compatibility generation'
  );
  await adminDb.doc(`tenants/${tenantId}/adopted_frameworks/iso27001`).update({
    status: 'active',
  });

  await adminDb.doc(`tenants/${tenantId}/summary_metrics/current`).set({
    id: 'current',
    tenantId,
    overallComplianceScore: 100,
  });
  const createEnvelope = command(tenantId, controlPayload(), null);
  const created = (await createControl(createEnvelope)).data;
  const controlId = created.result?.controlId;
  assert(typeof controlId === 'string', 'Control create did not return a control ID.');
  assert(created.result?.revision === 1, 'Control did not begin at revision 1.');
  assert(
    !(await adminDb.doc(`tenants/${tenantId}/summary_metrics/current`).get()).exists,
    'Control creation left a stale materialized posture document.'
  );
  assert(created.replayed === false, 'Initial control create was incorrectly replayed.');
  const replayed = (await createControl(createEnvelope)).data;
  assert(replayed.replayed === true, 'Exact control command retry did not replay.');
  assert(
    replayed.result?.controlId === controlId,
    'Control create replay returned a different control.'
  );

  const scopeControl = (
    await createControl(
      command(
        tenantId,
        controlPayload({
          code: `CTL-SCOPE-${suffix.slice(0, 5).toUpperCase()}`,
          title: 'Independent applicability decision sentinel',
        }),
        null
      )
    )
  ).data;
  const scopeControlId = scopeControl.result?.controlId;
  assert(typeof scopeControlId === 'string', 'Scope decision sentinel was not created.');
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          {
            controlId: scopeControlId,
            status: 'not_applicable',
            statusRationale: 'The creating manager cannot independently remove this control from scope.',
          },
          1
        )
      ),
    'functions/permission-denied',
    'creator applicability separation of duties'
  );
  const scopedOut = (
    await scopeManagerUpdateControl(
      command(
        tenantId,
        {
          controlId: scopeControlId,
          status: 'not_applicable',
          statusRationale:
            'The adopted requirement does not apply to the documented operating boundary.',
        },
        1
      )
    )
  ).data;
  assert(scopedOut.result?.revision === 2, 'Independent scope decision did not commit.');
  const scopedProjection = (
    await getControlDetail({ tenantId, controlId: scopeControlId })
  ).data.control;
  assert(
    scopedProjection?.status === 'not_applicable' &&
      scopedProjection?.assuranceStatus === 'not_applicable' &&
      scopedProjection?.assuranceReason === 'not_required' &&
      scopedProjection?.currentArtifactVerified === true &&
      typeof scopedProjection?.nextReviewDate === 'string' &&
      Date.parse(scopedProjection.nextReviewDate) > Date.now(),
    'Independent rationale-only scope decision was not projected accurately.'
  );

  await expectCallableCode(
    () =>
      createControl({
        ...createEnvelope,
        payload: controlPayload({ title: 'Receipt collision attack' }),
      }),
    'functions/already-exists',
    'command receipt collision'
  );

  const ownerUpdate = (
    await contributorUpdateControl(
      command(
        tenantId,
        {
          controlId,
          status: 'in_progress',
          implementationNotes:
            'The owner completed rollout and retained quarterly access-review artifacts.',
        },
        1
      )
    )
  ).data;
  assert(ownerUpdate.result?.revision === 2, 'Owner implementation update did not commit.');

  await expectCallableCode(
    () =>
      contributorUpdateControl(
        command(
          tenantId,
          { controlId, title: 'Contributor attempted governance-field rewrite' },
          2
        )
      ),
    'functions/permission-denied',
    'contributor field authority'
  );
  await expectCallableCode(
    () =>
      otherContributorUpdateControl(
        command(
          tenantId,
          {
            controlId,
            implementationNotes: 'A non-owner contributor attempted to modify the control.',
          },
          2
        )
      ),
    'functions/permission-denied',
    'non-owner contributor authority'
  );
  await expectCallableCode(
    () =>
      contributorUpdateControl(
        command(
          tenantId,
          {
            controlId,
            status: 'not_applicable',
            statusRationale: 'The owner cannot independently remove this control from scope.',
          },
          2
        )
      ),
    'functions/permission-denied',
    'contributor applicability decision'
  );
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          { controlId, implementationNotes: 'Stale manager update attempt.' },
          1
        )
      ),
    'functions/aborted',
    'stale revision'
  );

  const invalidEvidenceId = `invalid_evidence_${suffix}`;
  const validEvidenceId = `valid_evidence_${suffix}`;
  const storagePath = `tenants/${tenantId}/evidence/${validEvidenceId}/v1/control-test.pdf`;
  const hash = 'a'.repeat(64);
  const objectVerifiedAt = new Date(Date.now() - 2 * 60 * 60 * 1_000).toISOString();
  const evidenceReviewedAt = new Date(Date.now() - 60 * 60 * 1_000).toISOString();
  const evidenceBase = {
    tenantId,
    title: 'Privileged access review evidence',
    description: 'Immutable quarterly access review export.',
    category: 'access_review',
    status: 'valid',
    storagePath,
    fileSizeBytes: 8192,
    mimeType: 'application/pdf',
    fileHashSha256: hash,
    controlIds: [controlId],
    requirementIds: ['a.5.18'],
    policyIds: [],
    riskIds: [],
    assessmentIds: [],
    collectedAt: new Date().toISOString(),
    reviewDueDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    reviewedBy: users.manager.uid,
    reviewedAt: evidenceReviewedAt,
    rejectionReason: null,
    currentVersion: 1,
    ownerId: users.contributor.uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: users.contributor.uid,
    updatedBy: users.manager.uid,
  };
  await adminDb.doc(`tenants/${tenantId}/evidence/${invalidEvidenceId}`).set({
    ...evidenceBase,
    id: invalidEvidenceId,
  });

  const reviewPayload = (evidenceIds) => ({
    controlId,
    effectiveness: 'effective',
    notes:
      'A random sample of privileged access grants was traced from approval through revocation.',
    evidenceIds,
    reviewAssigneeId: users.reviewer.uid,
    testMethod:
      'Reconciled access approvals, platform activity, expiry, and revocation for a random sample.',
    testPeriodStart: '2026-04-01T00:00:00.000Z',
    testPeriodEnd: '2026-06-30T00:00:00.000Z',
    sampleSize: 25,
    exceptions: '',
  });

  await expectCallableCode(
    () =>
      submitControlReview(
        command(tenantId, reviewPayload([invalidEvidenceId]), 2)
      ),
    'functions/failed-precondition',
    'unverified evidence rejection'
  );

  const validEvidence = {
    ...evidenceBase,
    id: validEvidenceId,
    objectVerification: {
      status: 'verified',
      storagePath,
      storageGeneration: '1700000000000001',
      verifiedFileHashSha256: hash,
      verifiedFileSizeBytes: evidenceBase.fileSizeBytes,
      verifiedMimeType: evidenceBase.mimeType,
      verifiedAt: objectVerifiedAt,
      verifier: 'storage_finalize_function',
    },
  };
  await adminDb.doc(`tenants/${tenantId}/evidence/${validEvidenceId}`).set(validEvidence);

  const submitted = (
    await submitControlReview(
      command(tenantId, reviewPayload([validEvidenceId]), 2)
    )
  ).data;
  const reviewId = submitted.result?.reviewId;
  assert(typeof reviewId === 'string', 'Review submission did not return a review ID.');
  assert(submitted.result?.revision === 3, 'Review submission did not increment revision.');

  await adminDb.doc(`tenants/${tenantId}/evidence/${validEvidenceId}`).update({
    'objectVerification.storageGeneration': '',
  });
  await expectCallableCode(
    () =>
      decideControlReview(
        command(
          tenantId,
          {
            controlId,
            reviewId,
            decision: 'approved',
            decisionNotes:
              'The evidence sample supports the asserted operating effectiveness conclusion.',
          },
          3
        )
      ),
    'functions/failed-precondition',
    'evidence revalidation at decision'
  );
  await adminDb.doc(`tenants/${tenantId}/evidence/${validEvidenceId}`).set(validEvidence);

  const decided = (
    await decideControlReview(
      command(
        tenantId,
        {
          controlId,
          reviewId,
          decision: 'approved',
          decisionNotes:
            'The evidence sample supports the asserted operating effectiveness conclusion.',
        },
        3
      )
    )
  ).data;
  assert(decided.result?.revision === 4, 'Independent review decision did not commit.');

  const governedControl = (
    await adminDb.doc(`tenants/${tenantId}/controls/${controlId}`).get()
  ).data();
  assert(governedControl?.status === 'implemented', 'Approved effective review did not derive implemented status.');
  assert(governedControl?.healthScore === 100, 'Approved effective review did not derive health 100.');
  assert(
    governedControl?.lastReviewId === reviewId,
    'Control did not retain its approved review anchor.'
  );

  const history = (await getControlHistory({ tenantId, controlId })).data;
  assert(
    Array.isArray(history.history) && history.history.length === 4,
    'Control history did not return all governed revisions.'
  );
  assert(
    history.history.every((entry) => entry?.integrityStatus === 'verified') &&
      history.history.filter((entry) => entry?.review).length === 2 &&
      history.history
        .filter((entry) => entry?.review)
        .every((entry) => entry.review?.integrityStatus === 'verified'),
    'Review submissions and decisions were not independently joined to verified history artifacts.'
  );

  const retirementDependencies = [];
  for (let index = 0; index < 101; index += 1) {
    retirementDependencies.push(
      adminDb.doc(`tenants/${tenantId}/tasks/control_retirement_${suffix}_${index}`)
    );
  }
  const dependencyBatch = adminDb.batch();
  retirementDependencies.forEach((reference, index) => {
    dependencyBatch.set(reference, {
      id: reference.id,
      tenantId,
      title: `Closed control retirement dependency ${index}`,
      parentEntityType: 'control',
      parentEntityId: controlId,
      status: 'closed',
    });
  });
  await dependencyBatch.commit();
  await expectCallableCode(
    () =>
      retireControl(
        command(
          tenantId,
          {
            controlId,
            retirementReason:
              'This attempt must fail because dependency coverage is truncated.',
          },
          4
        )
      ),
    'functions/resource-exhausted',
    'bounded retirement dependency completeness'
  );
  const dependencyCleanup = adminDb.batch();
  retirementDependencies.forEach((reference) => dependencyCleanup.delete(reference));
  await dependencyCleanup.commit();

  const retired = (
    await retireControl(
      command(
        tenantId,
        {
          controlId,
          retirementReason:
            'Superseded by the consolidated identity and privileged-access lifecycle control.',
        },
        4
      )
    )
  ).data;
  assert(retired.result?.revision === 5, 'Soft retirement did not increment revision.');
  const retiredSnapshot = await adminDb
    .doc(`tenants/${tenantId}/controls/${controlId}`)
    .get();
  assert(retiredSnapshot.exists, 'Retirement hard-deleted the control.');
  assert(
    retiredSnapshot.data()?.workflowTrust === 'retired' &&
      typeof retiredSnapshot.data()?.retiredAt === 'string',
    'Retirement did not set the terminal retained-record metadata.'
  );
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          { controlId, implementationNotes: 'Post-retirement mutation attempt.' },
          5
        )
      ),
    'functions/failed-precondition',
    'retired control immutability'
  );

  const reviewRef = adminDb.doc(
    `tenants/${tenantId}/controls/${controlId}/reviews/${reviewId}`
  );
  const reviewBeforeHistoryTamper = (await reviewRef.get()).data();
  const decisionEventRef = adminDb.doc(
    `tenants/${tenantId}/controls/${controlId}/review_events/${reviewBeforeHistoryTamper?.decisionCommandId}`
  );
  const coherentlyTamperedReview = {
    ...reviewBeforeHistoryTamper,
    notes: 'Out-of-band rewrite of the test narrative after the recorded decision.',
  };
  await reviewRef.set(coherentlyTamperedReview);
  await decisionEventRef.update({
    reviewStateHash: stableTrustedValueHash(
      coherentlyTamperedReview,
      'coherently tampered control review'
    ),
  });
  const historyAfterReviewTamper = (
    await getControlHistory({ tenantId, controlId })
  ).data.history;
  assert(
    Array.isArray(historyAfterReviewTamper) &&
      historyAfterReviewTamper.some(
        (entry) =>
          entry?.command?.commandName === 'control.review_decide' &&
          entry?.integrityStatus === 'invalid' &&
          entry?.review?.integrityStatus === 'invalid'
      ),
    'A coherently rewritten review and event retained verified immutable-history status.'
  );

  const tamperCreate = (
    await createControl(
      command(
        tenantId,
        controlPayload({
          code: `CTL-TAMPER-${suffix.slice(0, 5).toUpperCase()}`,
          title: 'Control state tamper sentinel',
        }),
        null
      )
    )
  ).data;
  const tamperControlId = tamperCreate.result?.controlId;
  assert(typeof tamperControlId === 'string', 'Tamper sentinel control was not created.');
  await adminDb.doc(`tenants/${tenantId}/controls/${tamperControlId}`).update({
    title: 'Out-of-band Admin SDK mutation',
  });
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          { tamperControlId, implementationNotes: 'Attempt to hide state divergence.' },
          1
        )
      ),
    'functions/invalid-argument',
    'tamper sentinel rejects malformed field'
  );
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          {
            controlId: tamperControlId,
            implementationNotes: 'Attempt to hide state divergence.',
          },
          1
        )
      ),
    'functions/failed-precondition',
    'tampered state fail-closed mutation'
  );
  const coherentlyTamperedState = (
    await adminDb.doc(`tenants/${tenantId}/controls/${tamperControlId}`).get()
  ).data();
  const tamperedVersionRef = adminDb.doc(
    `tenants/${tenantId}/controls/${tamperControlId}/versions/r0000000001`
  );
  const tamperedVersion = (await tamperedVersionRef.get()).data();
  await tamperedVersionRef.set({
    ...tamperedVersion,
    state: coherentlyTamperedState,
    stateHash: stableTrustedValueHash(
      coherentlyTamperedState,
      'coherently tampered control state'
    ),
  });
  await expectCallableCode(
    () =>
      updateControl(
        command(
          tenantId,
          {
            controlId: tamperControlId,
            implementationNotes: 'Attempt to reuse an orphaned audit anchor.',
          },
          1
        )
      ),
    'functions/failed-precondition',
    'state and version rewrite without matching audit summary'
  );
  const tamperedDetail = (
    await getControlDetail({ tenantId, controlId: tamperControlId })
  ).data;
  assert(
    JSON.stringify(tamperedDetail).includes('legacy_unverified'),
    'Tampered control projection retained governed assurance.'
  );

  const legacyControlId = `legacy_control_${suffix}`;
  await adminDb.doc(`tenants/${tenantId}/controls/${legacyControlId}`).set({
    id: legacyControlId,
    tenantId,
    code: `CTL-LEGACY-${suffix.slice(0, 5).toUpperCase()}`,
    title: 'Legacy spreadsheet-imported control',
    description:
      'A legacy imported control with no immutable command, version, or audit provenance.',
    domain: 'security',
    frameworkIds: ['iso27001'],
    requirementIds: ['a.5.18'],
    status: 'implemented',
    healthScore: 100,
    enforcementMechanism: 'manual',
    reviewFrequencyDays: 90,
    lastReviewDate: new Date().toISOString(),
    nextReviewDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1_000).toISOString(),
    implementationNotes: 'Imported without authoritative provenance.',
    ownerId: users.manager.uid,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: users.manager.uid,
    updatedBy: users.manager.uid,
  });
  const listed = (await listControls({ tenantId, pageSize: 100 })).data;
  const legacyProjection = listed.controls?.find(
    (control) => control.id === legacyControlId
  );
  assert(legacyProjection, 'Legacy control was missing from the bounded projection.');
  assert(
    JSON.stringify(legacyProjection).includes('legacy_unverified'),
    'Legacy control projection fabricated governed assurance.'
  );

  for (const [label, operation] of [
    [
      'control document',
      () => getDoc(doc(manager.firestore, `tenants/${tenantId}/controls/${controlId}`)),
    ],
    [
      'control collection',
      () => getDocs(collection(manager.firestore, `tenants/${tenantId}/controls`)),
    ],
    [
      'control review',
      () =>
        getDoc(
          doc(
            manager.firestore,
            `tenants/${tenantId}/controls/${controlId}/reviews/${reviewId}`
          )
        ),
    ],
    [
      'control review event',
      () =>
        getDoc(
          doc(
            manager.firestore,
            `tenants/${tenantId}/controls/${controlId}/review_events/${reviewId}`
          )
        ),
    ],
    [
      'control version',
      () =>
        getDoc(
          doc(
            manager.firestore,
            `tenants/${tenantId}/controls/${controlId}/versions/r0000000001`
          )
        ),
    ],
    [
      'control code reservation',
      () =>
        getDocs(
          collection(
            manager.firestore,
            `tenants/${tenantId}/control_code_reservations`
          )
        ),
    ],
  ]) {
    await expectPermissionDenied(operation, label);
  }

  const [controls, versions, reviews, reviewEvents, receipts, audits] = await Promise.all([
    adminDb.collection(`tenants/${tenantId}/controls`).get(),
    adminDb.collection(`tenants/${tenantId}/controls/${controlId}/versions`).get(),
    adminDb.collection(`tenants/${tenantId}/controls/${controlId}/reviews`).get(),
    adminDb.collection(`tenants/${tenantId}/controls/${controlId}/review_events`).get(),
    adminDb.collection(`tenants/${tenantId}/command_receipts`).get(),
    adminDb.collection(`tenants/${tenantId}/audit_logs`).get(),
  ]);
  assert(
    controls.size === 5,
    'Retries or failed commands created unexpected controls.'
  );
  assert(versions.size === 5, 'Control lifecycle did not create one immutable version per mutation.');
  assert(reviews.size === 1, 'Review submission retry or decision created extra reviews.');
  assert(reviewEvents.size >= 2, 'Review submission and decision lack immutable review events.');
  const controlCommandAudits = audits.docs.filter(
    (document) => document.data().entityType === 'control'
  );
  assert(
    receipts.size === controlCommandAudits.length,
    'Successful control commands lack one-to-one audit anchors.'
  );
  assert(
    receipts.docs.every((receipt) => receipt.data().schemaVersion === 2),
    'Control command receipts do not use the current immutable schema.'
  );

  const materialized = (await materializeMetrics({ tenantId })).data.metrics;
  assert(
    /^[0-9a-f]{64}$/.test(materialized?.sourceFingerprint || ''),
    'Materialized metrics lack a stable source fingerprint.'
  );
  const materializedAt = Date.parse(materialized?.lastMaterializedAt || '');
  const validUntil = Date.parse(materialized?.validUntil || '');
  assert(
    Number.isFinite(materializedAt) &&
      Number.isFinite(validUntil) &&
      validUntil > materializedAt &&
      validUntil - materializedAt <= 5 * 60 * 1_000,
    'Materialized metrics do not fail closed within the bounded validity horizon.'
  );

  process.stdout.write('Control authoritative command-boundary integration: PASS\n');
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteClientApp(client.app).catch(() => undefined);
  }
  await deleteAdminApp(adminApp).catch(() => undefined);
}

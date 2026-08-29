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
  doc,
  getDoc,
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
    throw new Error('Refusing to run operational integration outside Firebase emulators.');
  }
  return { firestoreHost, authHost };
}

function command(tenantId, payload, expectedRevision) {
  const envelope = {
    envelopeVersion: 1,
    commandVersion: 1,
    tenantId,
    commandId: randomUUID(),
    payload,
  };
  if (expectedRevision !== undefined) envelope.expectedRevision = expectedRevision;
  return envelope;
}

async function expectCallableCode(operation, expectedCode) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === expectedCode,
      `Expected ${expectedCode}; received ${error?.code || error}`
    );
    return;
  }
  throw new Error(`Expected ${expectedCode}, but the callable succeeded.`);
}

async function expectPermissionDenied(operation, label) {
  try {
    await operation();
  } catch (error) {
    assert(
      error?.code === 'permission-denied',
      `${label} returned ${error?.code || error} instead of permission-denied.`
    );
    return;
  }
  throw new Error(`${label} unexpectedly succeeded.`);
}

const { firestoreHost, authHost } = requireEmulatorEnvironment();
const [firestoreHostname, firestorePort] = firestoreHost.split(':');
const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const suffix = randomUUID().replaceAll('-', '');
const tenantId = `tenant_operations_${suffix}`;
const password = `Operations-${suffix.slice(0, 16)}-A1!`;

const users = {
  manager: {
    uid: `operations_manager_${suffix}`,
    email: `operations-manager-${suffix}@example.test`,
    role: 'compliance_manager',
  },
  independent: {
    uid: `operations_reviewer_${suffix}`,
    email: `operations-reviewer-${suffix}@example.test`,
    role: 'security_manager',
  },
  contributor: {
    uid: `operations_contributor_${suffix}`,
    email: `operations-contributor-${suffix}@example.test`,
    role: 'contributor',
  },
  viewer: {
    uid: `operations_viewer_${suffix}`,
    email: `operations-viewer-${suffix}@example.test`,
    role: 'viewer',
  },
};

const adminApp = initializeAdminApp({ projectId }, `operations-admin-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getAdminFirestore(adminApp);
const clients = [];

async function createSignedInClient(user, label) {
  const app = initializeClientApp(
    {
      projectId,
      apiKey: 'emulator-api-key',
      authDomain: `${projectId}.firebaseapp.com`,
      appId: `1:000000000000:web:${suffix.slice(0, 20)}${label}`,
    },
    `operations-${label}-${suffix}`
  );
  initializeFunctionsEmulatorAppCheck(app);
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
  await adminDb.doc(`tenants/${tenantId}`).set({
    id: tenantId,
    name: 'Operational Command Integration Tenant',
    slug: `operations-${suffix.slice(0, 20)}`,
    status: 'active',
  });
  for (const user of Object.values(users)) {
    await adminDb.doc(`tenants/${tenantId}/memberships/${user.uid}`).set({
      id: user.uid,
      tenantId,
      userId: user.uid,
      role: user.role,
      status: 'active',
    });
  }

  const manager = await createSignedInClient(users.manager, 'manager');
  const independent = await createSignedInClient(users.independent, 'reviewer');
  const contributor = await createSignedInClient(users.contributor, 'contributor');

  const createRisk = httpsCallable(manager.functions, 'createTenantRisk');
  const updateRisk = httpsCallable(manager.functions, 'updateTenantRisk');
  const independentUpdateRisk = httpsCallable(
    independent.functions,
    'updateTenantRisk'
  );
  const retireRisk = httpsCallable(manager.functions, 'deleteTenantRisk');
  const listRisks = httpsCallable(manager.functions, 'listTenantRisks');
  const createIssue = httpsCallable(manager.functions, 'createTenantIssue');
  const managerUpdateIssue = httpsCallable(manager.functions, 'updateTenantIssue');
  const independentUpdateIssue = httpsCallable(
    independent.functions,
    'updateTenantIssue'
  );
  const contributorUpdateIssue = httpsCallable(
    contributor.functions,
    'updateTenantIssue'
  );
  const createTask = httpsCallable(manager.functions, 'createTenantTask');
  const syncDerivedRisks = httpsCallable(
    manager.functions,
    'syncDerivedProcessorRisks'
  );
  const contributorUpdateTask = httpsCallable(
    contributor.functions,
    'updateTenantTask'
  );
  const listTasks = httpsCallable(contributor.functions, 'listTenantTasks');
  const managerListAssignees = httpsCallable(
    manager.functions,
    'listTenantOperationalAssignees'
  );
  const contributorListAssignees = httpsCallable(
    contributor.functions,
    'listTenantOperationalAssignees'
  );

  const managerAssignees = (
    await managerListAssignees({ tenantId })
  ).data.assignees;
  assert(
    managerAssignees?.length === 3 &&
      !managerAssignees.some((assignee) => assignee.userId === users.viewer.uid),
    'Manager assignee directory did not exclude read-only tenant roles.'
  );
  const contributorAssignees = (
    await contributorListAssignees({ tenantId })
  ).data.assignees;
  assert(
    contributorAssignees?.length === 1 &&
      contributorAssignees[0].userId === users.contributor.uid,
    'Contributor assignee directory disclosed other member profiles.'
  );

  const riskPayload = {
    code: `RSK-${suffix.slice(0, 8).toUpperCase()}`,
    title: 'Operational integration data exposure risk',
    description: 'Restricted customer records could be exposed through a configuration error.',
    category: 'security',
    inherentLikelihood: 4,
    inherentImpact: 5,
    residualLikelihood: 3,
    residualImpact: 4,
    treatmentStrategy: 'mitigate',
    treatmentPlan: 'Enforce private access and continuously validate the storage boundary.',
    mitigatingControlIds: [],
    affectedAssetIds: [],
    processorProfileIds: [],
    transferArrangementIds: [],
    vendorIds: [],
    ownerId: users.manager.uid,
  };
  await expectCallableCode(
    () =>
      createRisk(
        command(tenantId, { ...riskPayload, status: 'closed' }, null)
      ),
    'functions/invalid-argument'
  );
  const createRiskEnvelope = command(tenantId, riskPayload, null);
  const createdRisk = (await createRisk(createRiskEnvelope)).data;
  const riskId = createdRisk.result?.riskId;
  assert(typeof riskId === 'string', 'Risk create did not return a risk ID.');
  assert(createdRisk.result?.revision === 1, 'Risk did not start at revision 1.');
  assert(
    (await createRisk(createRiskEnvelope)).data.replayed === true,
    'Exact risk create retry did not replay its receipt.'
  );
  await expectCallableCode(
    () =>
      updateRisk(
        command(
          tenantId,
          { riskId, status: 'closed' },
          1
        )
      ),
    'functions/failed-precondition'
  );
  const assessed = (
    await updateRisk(
      command(
        tenantId,
        {
          riskId,
          status: 'assessed',
          residualLikelihood: 2,
          residualImpact: 4,
        },
        1
      )
    )
  ).data;
  assert(assessed.result?.revision === 2, 'Risk update did not increment revision.');
  await expectCallableCode(
    () =>
      updateRisk(
        command(tenantId, { riskId, status: 'accepted' }, 2)
      ),
    'functions/permission-denied'
  );
  await expectCallableCode(
    () =>
      independentUpdateRisk(
        command(tenantId, { riskId, status: 'accepted' }, 2)
      ),
    'functions/failed-precondition'
  );
  await expectCallableCode(
    () =>
      updateRisk(
        command(tenantId, { riskId, title: 'Stale update attempt' }, 1)
      ),
    'functions/aborted'
  );

  const dueDate = new Date(Date.now() + 14 * 24 * 60 * 60 * 1_000).toISOString();
  const createdIssue = (
    await createIssue(
      command(
        tenantId,
        {
          code: `ISS-${suffix.slice(0, 8).toUpperCase()}`,
          title: 'Backup encryption remediation',
          description: 'The governed backup must use the approved tenant-managed key.',
          severity: 'high',
          source: 'risk_assessment',
          sourceEntityType: 'risk',
          sourceEntityId: riskId,
          dueDate,
          resolutionPlan: '',
          ownerId: users.contributor.uid,
        },
        null
      )
    )
  ).data;
  const issueId = createdIssue.result?.issueId;
  assert(typeof issueId === 'string', 'Issue create did not return an issue ID.');
  const issueInProgress = (
    await contributorUpdateIssue(
      command(tenantId, { issueId, status: 'in_progress' }, 1)
    )
  ).data;
  assert(issueInProgress.result?.revision === 2, 'Contributor issue work did not commit.');
  const issueUnderReview = (
    await contributorUpdateIssue(
      command(
        tenantId,
        {
          issueId,
          status: 'under_review',
          resolutionPlan:
            'Backup encryption was enabled and restoration evidence was independently checked.',
        },
        2
      )
    )
  ).data;
  assert(issueUnderReview.result?.revision === 3, 'Issue review submission did not commit.');
  await expectCallableCode(
    () =>
      managerUpdateIssue(
        command(tenantId, { issueId, status: 'resolved' }, 3)
      ),
    'functions/permission-denied'
  );
  const resolvedIssue = (
    await independentUpdateIssue(
      command(tenantId, { issueId, status: 'resolved' }, 3)
    )
  ).data;
  assert(resolvedIssue.result?.revision === 4, 'Independent issue verification failed.');
  await expectCallableCode(
    () =>
      independentUpdateIssue(
        command(tenantId, { issueId, title: 'Changed after verification' }, 4)
      ),
    'functions/failed-precondition'
  );

  const createdTask = (
    await createTask(
      command(
        tenantId,
        {
          title: 'Validate encrypted backup restoration',
          description: 'Restore a sample and confirm managed-key encryption remains effective.',
          parentEntityType: 'issue',
          parentEntityId: issueId,
          assigneeId: users.contributor.uid,
          dueDate,
        },
        null
      )
    )
  ).data;
  const taskId = createdTask.result?.taskId;
  assert(typeof taskId === 'string', 'Task create did not return a task ID.');
  const taskInProgress = (
    await contributorUpdateTask(
      command(tenantId, { taskId, status: 'in_progress' }, 1)
    )
  ).data;
  assert(taskInProgress.result?.revision === 2, 'Task start did not commit.');
  const completedTask = (
    await contributorUpdateTask(
      command(tenantId, { taskId, status: 'completed' }, 2)
    )
  ).data;
  assert(completedTask.result?.revision === 3, 'Task completion did not commit.');
  await expectCallableCode(
    () =>
      contributorUpdateTask(
        command(tenantId, { taskId, title: 'Changed after completion' }, 3)
      ),
    'functions/failed-precondition'
  );

  const processorProfileId = `processor_${suffix}`;
  const vendorId = `vendor_${suffix}`;
  const now = new Date().toISOString();
  await adminDb.doc(`tenants/${tenantId}/vendors/${vendorId}`).set({
    id: vendorId,
    tenantId,
    name: 'Operational Integration Vendor',
    status: 'active',
    ownerId: users.manager.uid,
    createdAt: now,
    updatedAt: now,
    createdBy: users.manager.uid,
    updatedBy: users.manager.uid,
  });
  await adminDb
    .doc(`tenants/${tenantId}/processor_profiles/${processorProfileId}`)
    .set({
      id: processorProfileId,
      tenantId,
      vendorId,
      engagementName: 'Sensitive analytics processor',
      processorRole: 'processor',
      serviceDescription: 'Processes restricted analytics records.',
      dataCategories: ['analytics_records'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: true,
      specialCategoryTypes: ['health_data'],
      jurisdictions: ['NL'],
      linkedSystemAssetIds: [],
      criticality: 'high',
      ownerUserId: users.manager.uid,
      reviewCadence: 'annual',
      lastReviewDate: null,
      nextReviewDate: new Date(Date.now() - 24 * 60 * 60 * 1_000).toISOString(),
      status: 'active',
      notes: null,
      dpaSigned: false,
      dpaDate: null,
      linkedRiskIds: [],
      ownerId: users.manager.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: users.manager.uid,
      updatedBy: users.manager.uid,
    });
  const firstDerivedSync = (
    await syncDerivedRisks(
      command(tenantId, { processorProfileId }, null)
    )
  ).data;
  assert(
    firstDerivedSync.result?.activeFlags === 2 &&
      firstDerivedSync.result?.created === 2,
    'Derived processor risks were not created from the complete current rule set.'
  );
  const secondDerivedSync = (
    await syncDerivedRisks(
      command(tenantId, { processorProfileId }, null)
    )
  ).data;
  assert(
    secondDerivedSync.result?.created === 0 &&
      secondDerivedSync.result?.updated === 0 &&
      secondDerivedSync.result?.closed === 0,
    'An unchanged derived-risk synchronization churned authoritative state.'
  );

  await expectPermissionDenied(
    () => getDoc(doc(manager.firestore, `tenants/${tenantId}/risks/${riskId}`)),
    'Raw risk read'
  );
  await expectPermissionDenied(
    () => getDoc(doc(contributor.firestore, `tenants/${tenantId}/issues/${issueId}`)),
    'Raw issue read'
  );
  await expectPermissionDenied(
    () => getDoc(doc(contributor.firestore, `tenants/${tenantId}/tasks/${taskId}`)),
    'Raw task read'
  );

  const riskProjection = (await listRisks({ tenantId, pageSize: 100 })).data;
  const projectedRisk = riskProjection.risks?.find((risk) => risk.id === riskId);
  assert(
    projectedRisk?.workflowTrust === 'governed' && projectedRisk.revision === 2,
    'Risk projection did not verify the immutable command artifacts.'
  );
  const derivedRisks = riskProjection.risks?.filter(
    (risk) => risk.sourceEntityType === 'processor_risk_engine'
  );
  assert(
    derivedRisks?.length === 2 &&
      derivedRisks.every((risk) => risk.workflowTrust === 'governed'),
    'Derived-risk projections did not verify the shared synchronization audit anchor.'
  );
  await expectCallableCode(
    () =>
      updateRisk(
        command(
          tenantId,
          { riskId: derivedRisks[0].id, status: 'assessed' },
          derivedRisks[0].revision
        )
      ),
    'functions/failed-precondition'
  );
  const taskProjection = (await listTasks({ tenantId, pageSize: 100 })).data;
  const projectedTask = taskProjection.tasks?.find((task) => task.id === taskId);
  assert(
    projectedTask?.workflowTrust === 'governed' && projectedTask.status === 'completed',
    'Contributor task projection did not return the assigned governed task.'
  );

  const riskVersions = await adminDb
    .collection(`tenants/${tenantId}/risks/${riskId}/versions`)
    .orderBy('revision')
    .get();
  assert(riskVersions.size === 2, 'Risk create/update did not produce two versions.');
  assert(
    riskVersions.docs[1].data().previousStateHash ===
      riskVersions.docs[0].data().stateHash,
    'Risk version hash continuity is broken.'
  );
  const issue = (
    await adminDb.doc(`tenants/${tenantId}/issues/${issueId}`).get()
  ).data();
  assert(
    issue.verifiedBy === users.independent.uid &&
      typeof issue.verifiedAt === 'string' &&
      issue.verifiedBy !== issue.ownerId &&
      issue.verifiedBy !== issue.createdBy,
    'Issue verification identity was not derived independently by the server.'
  );

  const phantomDpaEvidenceId = `phantom_dpa_${suffix}`;
  await adminDb.doc(`tenants/${tenantId}/evidence/${phantomDpaEvidenceId}`).set({
    id: phantomDpaEvidenceId,
    tenantId,
    title: 'Caller-declared DPA metadata without a verified object',
    category: 'contract',
    status: 'valid',
    storagePath: `tenants/${tenantId}/evidence/${phantomDpaEvidenceId}/dpa.pdf`,
    fileHashSha256: 'a'.repeat(64),
    fileSizeBytes: 1_024,
    mimeType: 'application/pdf',
    processorProfileIds: [processorProfileId],
    transferArrangementIds: [],
    ownerId: users.manager.uid,
    createdAt: now,
    updatedAt: now,
    createdBy: users.manager.uid,
    updatedBy: users.manager.uid,
  });
  await adminDb
    .doc(`tenants/${tenantId}/processor_profiles/${processorProfileId}`)
    .update({
      dpaSigned: true,
      linkedDpaEvidenceId: phantomDpaEvidenceId,
      nextReviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1_000).toISOString(),
      updatedAt: new Date().toISOString(),
    });
  const phantomEvidenceSync = (
    await syncDerivedRisks(
      command(tenantId, { processorProfileId }, null)
    )
  ).data;
  assert(
    phantomEvidenceSync.result?.activeFlags === 1 &&
      phantomEvidenceSync.result?.closed === 1,
    'Caller-declared DPA metadata incorrectly suppressed a derived compliance risk.'
  );

  await adminDb
    .doc(`tenants/${tenantId}/processor_profiles/${processorProfileId}`)
    .update({
      isSpecialCategoryData: false,
      updatedAt: new Date().toISOString(),
    });
  const clearedDerivedSync = (
    await syncDerivedRisks(
      command(tenantId, { processorProfileId }, null)
    )
  ).data;
  assert(
    clearedDerivedSync.result?.activeFlags === 0 &&
      clearedDerivedSync.result?.closed === 1,
    'Resolved processor conditions did not lifecycle-close stale derived risks.'
  );

  const retiredRisk = (
    await retireRisk(
      command(
        tenantId,
        {
          entityId: riskId,
          retirementReason: 'The superseding enterprise risk record is now authoritative.',
        },
        2
      )
    )
  ).data;
  assert(retiredRisk.result?.retired === true, 'Risk retirement did not soft-close the record.');
  const storedRisk = (
    await adminDb.doc(`tenants/${tenantId}/risks/${riskId}`).get()
  ).data();
  assert(
    storedRisk.status === 'closed' && storedRisk.retiredAt && storedRisk.revision === 3,
    'Risk retirement deleted or incompletely closed the record.'
  );

  const receipts = await adminDb
    .collection(`tenants/${tenantId}/command_receipts`)
    .get();
  const audits = await adminDb.collection(`tenants/${tenantId}/audit_logs`).get();
  assert(receipts.size === audits.size, 'A governed operational command is missing its atomic audit event.');
  assert(
    audits.docs.every((audit) => audit.data().workflowContext?.startsWith('command:ev1:')),
    'An operational audit event is missing its command anchor.'
  );

  process.stdout.write('Operational command-boundary integration: PASS\n');
} finally {
  for (const client of clients) {
    await signOut(client.auth).catch(() => undefined);
    await deleteClientApp(client.app).catch(() => undefined);
  }
  for (const user of Object.values(users)) {
    await adminAuth.deleteUser(user.uid).catch(() => undefined);
  }
  await deleteAdminApp(adminApp);
}

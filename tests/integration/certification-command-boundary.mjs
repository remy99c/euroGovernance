import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { initializeFunctionsEmulatorAppCheck } from './app-check-emulator.mjs';

// Resolve each SDK from the workspace that owns it. Keeping integration-only
// dependencies out of the root avoids a second production SDK installation
// while remaining stable whether npm hoists workspace packages or not.
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
      'Refusing to run callable integration tests without Firestore and Auth emulator hosts.'
    );
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

function certificationPayload(overrides = {}) {
  const now = Date.now();
  return {
    certificationName: 'Integration ISO 27001 Certificate',
    certificationType: 'iso_27001',
    issuingBody: 'Integration Accredited Registrar',
    certificateNumber: `INT-${randomUUID()}`,
    scopeDescription: 'Callable command-boundary integration scope',
    scopeDetails: {
      sites: [],
      products: [],
      cloudEnvironments: [],
      organizationalUnits: [],
    },
    applicableStandardVersion: 'ISO/IEC 27001:2022',
    issueDate: new Date(now - 24 * 60 * 60 * 1000).toISOString(),
    expiryDate: new Date(now + 3 * 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active_valid',
    statusRationale: null,
    surveillanceAuditDueDate: new Date(
      now + 365 * 24 * 60 * 60 * 1000
    ).toISOString(),
    leadAuditorName: null,
    leadAuditorContact: null,
    frameworkIds: [],
    linkedControlIds: [],
    linkedEvidenceIds: [],
    linkedVendorIds: [],
    linkedProcessorProfileIds: [],
    linkedSystemAssetIds: [],
    continuousComplianceStatus: 'not_assessed',
    unresolvedFindingsCount: 0,
    notes: null,
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

const { authHost } = requireEmulatorEnvironment();
const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const suffix = randomUUID().replaceAll('-', '');
const tenantId = `tenant_command_${suffix}`;
const managerUid = `manager_${suffix}`;
const managerEmail = `${managerUid}@example.test`;
const password = `Command-${suffix.slice(0, 16)}-A1!`;

const adminApp = initializeAdminApp({ projectId }, `command-admin-${suffix}`);
const adminAuth = getAdminAuth(adminApp);
const adminDb = getFirestore(adminApp);
const clientApp = initializeClientApp(
  {
    projectId,
    apiKey: 'emulator-api-key',
    authDomain: `${projectId}.firebaseapp.com`,
    appId: `1:000000000000:web:${suffix.slice(0, 24)}`,
  },
  `command-client-${suffix}`
);
initializeFunctionsEmulatorAppCheck(clientApp);
const clientAuth = getAuth(clientApp);
connectAuthEmulator(clientAuth, `http://${authHost}`, { disableWarnings: true });
const clientFunctions = getFunctions(clientApp, 'europe-west3');
connectFunctionsEmulator(clientFunctions, '127.0.0.1', 5001);

try {
  await adminAuth.createUser({
    uid: managerUid,
    email: managerEmail,
    emailVerified: true,
    password,
  });
  await adminDb.doc(`tenants/${tenantId}`).set({
    id: tenantId,
    name: 'Command Boundary Integration Tenant',
    slug: `command-${suffix.slice(0, 24)}`,
    status: 'active',
  });
  await adminDb.doc(`tenants/${tenantId}/memberships/${managerUid}`).set({
    id: managerUid,
    tenantId,
    userId: managerUid,
    role: 'compliance_manager',
    status: 'active',
  });

  await signInWithEmailAndPassword(clientAuth, managerEmail, password);
  const syncUserProfile = httpsCallable(clientFunctions, 'syncUserProfile');
  const createCertification = httpsCallable(clientFunctions, 'createTenantCertification');
  const updateCertification = httpsCallable(clientFunctions, 'updateTenantCertification');
  const archiveCertification = httpsCallable(clientFunctions, 'deleteTenantCertification');
  const listCertifications = httpsCallable(clientFunctions, 'listTenantCertifications');

  await expectCallableCode(
    () => syncUserProfile({ displayName: 42 }),
    'functions/invalid-argument'
  );
  await expectCallableCode(
    () =>
      createCertification(
        command(
          tenantId,
          certificationPayload({ continuousComplianceStatus: 'compliant' }),
          null
        )
      ),
    'functions/failed-precondition'
  );
  await expectCallableCode(
    () =>
      createCertification(
        command(
          tenantId,
          certificationPayload({
            issueDate: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
            expiryDate: new Date(Date.now() + 366 * 24 * 60 * 60 * 1000).toISOString(),
          }),
          null
        )
      ),
    'functions/invalid-argument'
  );

  const createEnvelope = command(tenantId, certificationPayload(), null);
  const createResponse = await createCertification(createEnvelope);
  const created = createResponse.data;
  assert(created.replayed === false, 'Initial command must not be marked as replayed.');
  assert(
    created.envelopeVersion === 1 && created.commandVersion === 1,
    'Create response did not disclose the committed command protocol versions.'
  );
  assert(created.result?.revision === 1, 'Created certification must begin at revision 1.');
  const certificationId = created.result?.certificationId;
  assert(typeof certificationId === 'string', 'Create command did not return a certification ID.');

  const replayResponse = await createCertification(createEnvelope);
  assert(replayResponse.data.replayed === true, 'Exact command retry must replay its receipt.');
  assert(
    replayResponse.data.envelopeVersion === 1 && replayResponse.data.commandVersion === 1,
    'Receipt replay did not preserve its original protocol versions.'
  );
  assert(
    replayResponse.data.result?.certificationId === certificationId,
    'Command replay created or returned a different certification.'
  );

  await expectCallableCode(
    () =>
      createCertification({
        ...createEnvelope,
        commandId: randomUUID(),
        commandVersion: 2,
      }),
    'functions/failed-precondition'
  );

  await expectCallableCode(
    () =>
      createCertification({
        ...createEnvelope,
        payload: certificationPayload({ certificationName: 'Different payload' }),
      }),
    'functions/already-exists'
  );

  const updatePayload = certificationPayload({
    certificationName: 'Updated Integration ISO 27001 Certificate',
  });
  const updateEnvelope = command(
    tenantId,
    { certificationId, ...updatePayload },
    1
  );
  const updateResponse = await updateCertification(updateEnvelope);
  assert(updateResponse.data.result?.revision === 2, 'Update must increment the revision.');

  const governedStateAfterUpdate = (
    await adminDb.doc(`tenants/${tenantId}/certifications/${certificationId}`).get()
  ).data();
  assert(governedStateAfterUpdate, 'Updated certification state is missing.');
  await adminDb.doc(`tenants/${tenantId}/certifications/${certificationId}`).update({
    notes: 'Simulated out-of-band Admin SDK mutation',
  });
  await expectCallableCode(
    () =>
      updateCertification(
        command(
          tenantId,
          { certificationId, ...updatePayload, notes: 'must not hide divergence' },
          2
        )
      ),
    'functions/failed-precondition'
  );
  await adminDb
    .doc(`tenants/${tenantId}/certifications/${certificationId}`)
    .set(governedStateAfterUpdate);

  await expectCallableCode(
    () =>
      updateCertification(
        command(
          tenantId,
          { certificationId, ...updatePayload, notes: 'stale change' },
          1
        )
      ),
    'functions/aborted'
  );

  await adminDb.doc(`tenants/${tenantId}/memberships/${managerUid}`).update({
    role: 'viewer',
  });
  await expectCallableCode(
    () =>
      updateCertification(
        command(
          tenantId,
          { certificationId, ...updatePayload, notes: 'unauthorized change' },
          2
        )
      ),
    'functions/permission-denied'
  );
  await adminDb.doc(`tenants/${tenantId}/memberships/${managerUid}`).update({
    role: 'compliance_manager',
  });

  const archiveResponse = await archiveCertification(
    command(
      tenantId,
      {
        certificationId,
        archiveReason: 'Superseded integration record retained for audit history.',
      },
      2
    )
  );
  assert(archiveResponse.data.result?.revision === 3, 'Archive must increment the revision.');

  const certSnapshot = await adminDb
    .doc(`tenants/${tenantId}/certifications/${certificationId}`)
    .get();
  assert(certSnapshot.exists, 'Archive must preserve the certification document.');
  assert(certSnapshot.data()?.status === 'archived', 'Archive did not set archived status.');
  assert(certSnapshot.data()?.revision === 3, 'Persisted certification revision is incorrect.');

  const legacyCertificationId = `legacy_${suffix}`;
  const { statusRationale: _legacyRationale, ...legacyFields } = certificationPayload({
    certificationName: 'Legacy certification requiring a provenance baseline',
  });
  await adminDb.doc(`tenants/${tenantId}/certifications/${legacyCertificationId}`).set({
    id: legacyCertificationId,
    tenantId,
    ...legacyFields,
    lastStatusRationale: null,
    ownerId: managerUid,
    createdBy: managerUid,
    updatedBy: managerUid,
    createdAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString(),
  });
  const migratedLegacyResponse = await updateCertification(
    command(
      tenantId,
      {
        certificationId: legacyCertificationId,
        ...certificationPayload({ certificationName: 'Governed legacy certification' }),
      },
      0
    )
  );
  assert(
    migratedLegacyResponse.data.result?.revision === 1,
    'First governed legacy mutation must advance from implicit revision zero.'
  );

  const [legacyBaseline, legacyFirstVersion] = await Promise.all([
    adminDb
      .doc(
        `tenants/${tenantId}/certifications/${legacyCertificationId}/versions/r0000000000`
      )
      .get(),
    adminDb
      .doc(
        `tenants/${tenantId}/certifications/${legacyCertificationId}/versions/r0000000001`
      )
      .get(),
  ]);
  assert(legacyBaseline.exists, 'Legacy revision-zero baseline was not captured.');
  assert(
    legacyBaseline.data()?.provenance === 'legacy_baseline_captured_on_first_command',
    'Legacy baseline must disclose its migration provenance.'
  );
  assert(
    legacyFirstVersion.data()?.previousStateHash === legacyBaseline.data()?.stateHash,
    'First governed legacy version is not chained to its captured baseline.'
  );

  const [certifications, audits, receipts, outbox, versions] = await Promise.all([
    adminDb.collection(`tenants/${tenantId}/certifications`).get(),
    adminDb.collection(`tenants/${tenantId}/audit_logs`).get(),
    adminDb.collection(`tenants/${tenantId}/command_receipts`).get(),
    adminDb.collection(`tenants/${tenantId}/command_outbox`).get(),
    adminDb.collection(`tenants/${tenantId}/certifications/${certificationId}/versions`).get(),
  ]);
  assert(certifications.size === 2, 'Command retries or migration created an unexpected record.');
  assert(audits.size === 4, 'Exactly four successful governed mutations must be audited.');
  assert(receipts.size === 4, 'Exactly four successful command receipts are required.');
  assert(
    receipts.docs.every(
      (receipt) =>
        receipt.data().schemaVersion === 2 &&
        receipt.data().envelopeVersion === 1 &&
        receipt.data().commandVersion === 1
    ),
    'Certification receipts do not pin the command protocol versions.'
  );
  assert(outbox.size === 0, 'Certification commands should not emit unrelated side effects.');
  assert(versions.size === 3, 'Create, update, and archive must each create one immutable version.');
  const orderedVersions = versions.docs.sort(
    (left, right) => left.data().revision - right.data().revision
  );
  for (let index = 1; index < orderedVersions.length; index += 1) {
    assert(
      orderedVersions[index].data().previousStateHash ===
        orderedVersions[index - 1].data().stateHash,
      'Certification version hash chain is broken.'
    );
  }
  for (const audit of audits.docs) {
    assert(
      audit.data().workflowContext?.startsWith('command:ev1:certification.'),
      'Audit event is missing its command anchor.'
    );
    assert(audit.data().actorId === managerUid, 'Audit actor was not server-derived.');
  }

  const verifiedList = await listCertifications({ tenantId });
  assert(
    verifiedList.data.certifications?.length === 2 &&
      verifiedList.data.certifications.every(
        (certification) => certification.currentArtifactVerified === true
      ),
    'Certification list did not verify each current immutable artifact chain.'
  );

  await adminDb.doc(`tenants/${tenantId}/certifications/${certificationId}`).update({
    notes: 'Out-of-band mutation that must invalidate the read projection.',
  });
  const divergedList = await listCertifications({ tenantId });
  const diverged = divergedList.data.certifications?.find(
    (certification) => certification.id === certificationId
  );
  assert(
    diverged?.currentArtifactVerified === false &&
      diverged?.assuranceStatus === 'legacy_unverified',
    'Out-of-band certification divergence was presented as verified assurance.'
  );

  process.stdout.write('Certification command-boundary integration: PASS\n');
} finally {
  await signOut(clientAuth).catch(() => undefined);
  await adminAuth.deleteUser(managerUid).catch(() => undefined);
  await deleteClientApp(clientApp);
  await deleteAdminApp(adminApp);
}

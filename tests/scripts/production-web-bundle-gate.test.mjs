import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

import {
  expectedDeploymentIdentity,
  inspectProductionWebBundle,
  validateDeploymentMetadata,
} from '../../scripts/verify-production-web-bundle.mjs';

const expected = Object.freeze({
  projectId: 'eurogovernance-prod',
  apiKey: 'AIzaSy1234567890abcdefghijklmnopqrstuvw',
  appId: '1:123456789012:web:aabbccddeeff0011',
  authDomain: 'eurogovernance-prod.firebaseapp.com',
  storageBucket: 'eurogovernance-prod.appspot.com',
  messagingSenderId: '123456789012',
  functionsRegion: 'europe-west3',
  appCheckSiteKey: '6LcI1234567890abcdefghijklmnopqrstuvwx',
});

function validMetadata(overrides = {}) {
  return {
    schemaVersion: 1,
    buildMode: 'production',
    ...expected,
    emulatorEnabled: false,
    appCheckMode: 'recaptcha_enterprise',
    devPersonaConfigurationPresent: false,
    ...overrides,
  };
}

async function withOutputDirectory(callback) {
  const directory = await mkdtemp(join(tmpdir(), 'eurogovernance-web-gate-'));
  try {
    await writeFile(
      join(directory, 'deployment-metadata.json'),
      `${JSON.stringify(validMetadata(), null, 2)}\n`,
      'utf8'
    );
    await writeFile(join(directory, 'index.html'), '<!doctype html><title>safe</title>', 'utf8');
    return await callback(directory);
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}

test('accepts a production bundle only for its exact declared Firebase identity', async () => {
  await withOutputDirectory(async (outputRoot) => {
    const result = await inspectProductionWebBundle({ outputRoot, expected });
    assert.equal(result.fileCount, 2);
    assert.equal(result.deploymentMetadata.projectId, expected.projectId);
  });
});

test('rejects a cloud bundle built for a different Firebase project', () => {
  assert.throws(
    () =>
      validateDeploymentMetadata(
        validMetadata({ projectId: 'eurogovernance-staging' }),
        expected
      ),
    /targets the wrong projectId/u
  );
});

test('rejects emulator, App Check, and persona deployment metadata drift', () => {
  assert.throws(
    () =>
      validateDeploymentMetadata(
        validMetadata({
          emulatorEnabled: true,
          appCheckMode: 'functions_emulator',
          devPersonaConfigurationPresent: true,
        }),
        expected
      ),
    /metadata is missing or unsafe/u
  );
});

test('requires complete, non-placeholder expected deployment identity', () => {
  assert.throws(
    () => expectedDeploymentIdentity({}),
    /requires EXPECTED_FIREBASE_PROJECT_ID/u
  );
  assert.throws(
    () =>
      expectedDeploymentIdentity({
        EXPECTED_FIREBASE_PROJECT_ID: expected.projectId,
        EXPECTED_FIREBASE_API_KEY: expected.apiKey,
        EXPECTED_FIREBASE_APP_ID: '1:123456789012:web:cibuildplaceholder',
        EXPECTED_FIREBASE_AUTH_DOMAIN: expected.authDomain,
        EXPECTED_FIREBASE_STORAGE_BUCKET: expected.storageBucket,
        EXPECTED_FIREBASE_MESSAGING_SENDER_ID: expected.messagingSenderId,
        EXPECTED_FIREBASE_FUNCTIONS_REGION: expected.functionsRegion,
        EXPECTED_FIREBASE_APP_CHECK_SITE_KEY: expected.appCheckSiteKey,
      }),
    /placeholder or local value/u
  );
});

test('requires the Firebase App ID project number to match the sender ID', () => {
  assert.throws(
    () =>
      expectedDeploymentIdentity({
        EXPECTED_FIREBASE_PROJECT_ID: expected.projectId,
        EXPECTED_FIREBASE_API_KEY: expected.apiKey,
        EXPECTED_FIREBASE_APP_ID: expected.appId,
        EXPECTED_FIREBASE_AUTH_DOMAIN: expected.authDomain,
        EXPECTED_FIREBASE_STORAGE_BUCKET: expected.storageBucket,
        EXPECTED_FIREBASE_MESSAGING_SENDER_ID: '999999999999',
        EXPECTED_FIREBASE_FUNCTIONS_REGION: expected.functionsRegion,
        EXPECTED_FIREBASE_APP_CHECK_SITE_KEY: expected.appCheckSiteKey,
      }),
    /project number does not match/u
  );
});

test('scans every deployed extension for forbidden local and placeholder markers', async () => {
  await withOutputDirectory(async (outputRoot) => {
    await writeFile(
      join(outputRoot, 'unlisted-extension.wasm'),
      Buffer.from('binary-prefix\u0000ci-build-placeholder\u0000binary-suffix', 'utf8')
    );
    await assert.rejects(
      () => inspectProductionWebBundle({ outputRoot, expected }),
      /unlisted-extension\.wasm: ci-build-placeholder/u
    );
  });
});

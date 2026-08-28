import assert from 'node:assert/strict';
import test from 'node:test';

import { verifyFunctionsSharedTypesVendor } from '../../scripts/sync-functions-shared-types.mjs';
import {
  verifyFirebaseFunctionsUploadArchive,
  verifyFunctionsDependencyLock,
} from '../../scripts/verify-functions-deploy-artifact.mjs';

test('the Functions deploy lock is standalone and pins the production graph', () => {
  const { packageManifest, lock } = verifyFunctionsDependencyLock();
  assert.equal(
    packageManifest.dependencies['@eurogovernance/shared-types'],
    'file:vendor/shared-types'
  );
  assert.equal(
    lock.packages['node_modules/@eurogovernance/shared-types'].resolved,
    'vendor/shared-types'
  );
  assert.equal(lock.packages['node_modules/gaxios'].version, '7.3.1');
  assert.equal(lock.packages['node_modules/@google-cloud/storage'].version, '8.0.1');
});

test('the checked-in shared-types vendor is an exact hashed build snapshot', () => {
  const manifest = verifyFunctionsSharedTypesVendor();
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.packageName, '@eurogovernance/shared-types');
  assert.ok(manifest.files.length > 0);
  assert.ok(manifest.files.every((file) => /^[0-9a-f]{64}$/u.test(file.sha256)));
});

test('the actual Firebase upload is self-contained and excludes local configuration', async () => {
  const result = await verifyFirebaseFunctionsUploadArchive();
  assert.ok(result.archiveEntries > result.vendorFiles);
  assert.ok(result.vendorFiles > 0);
});

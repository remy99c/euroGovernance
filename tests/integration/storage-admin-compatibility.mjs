import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

const requireFromFunctions = createRequire(
  new URL('../../functions/package.json', import.meta.url)
);

const {
  initializeApp: initializeAdminApp,
  deleteApp: deleteAdminApp,
} = requireFromFunctions('firebase-admin/app');
const { getStorage } = requireFromFunctions('firebase-admin/storage');

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const storageHost = process.env.FIREBASE_STORAGE_EMULATOR_HOST;
if (!storageHost) {
  throw new Error(
    'Refusing to run Storage compatibility integration without the Storage emulator host.'
  );
}

const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
const suffix = randomUUID().replaceAll('-', '').toLowerCase();
const bucketName = `${projectId}.appspot.com`;
const objectPath = `compatibility/${suffix}/verified-object.txt`;
const contents = Buffer.from(`storage-admin-compatibility:${suffix}`, 'utf8');
const adminApp = initializeAdminApp(
  { projectId, storageBucket: bucketName },
  `storage-compatibility-${suffix}`
);
const file = getStorage(adminApp).bucket(bucketName).file(objectPath);

try {
  await file.save(contents, {
    resumable: false,
    metadata: {
      contentType: 'text/plain; charset=utf-8',
      metadata: {
        integrationPurpose: 'firebase-admin-storage-compatibility',
      },
    },
  });

  const [metadata] = await file.getMetadata();
  assert(metadata.name === objectPath, 'Storage metadata returned the wrong object name.');
  assert(
    Number(metadata.size) === contents.byteLength,
    'Storage metadata returned the wrong object size.'
  );
  assert(
    typeof metadata.generation === 'string' && metadata.generation.length > 0,
    'Storage metadata did not include an object generation.'
  );
  assert(
    metadata.contentType === 'text/plain; charset=utf-8',
    'Storage metadata did not preserve the declared content type.'
  );
  assert(
    metadata.metadata?.integrationPurpose ===
      'firebase-admin-storage-compatibility',
    'Storage metadata did not preserve server-owned verification metadata.'
  );

  const [downloaded] = await file.download();
  assert(downloaded.equals(contents), 'Downloaded Storage bytes differ from uploaded bytes.');

  await file.delete({ ifGenerationMatch: Number(metadata.generation) });
  const [existsAfterDelete] = await file.exists();
  assert(existsAfterDelete === false, 'Generation-bound Storage delete did not remove the object.');

  process.stdout.write('Firebase Admin Storage compatibility integration: PASS\n');
} finally {
  try {
    const [exists] = await file.exists();
    if (exists) await file.delete();
  } catch {
    // Best-effort cleanup must not hide the compatibility assertion that failed.
  }
  await deleteAdminApp(adminApp);
}

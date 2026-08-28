import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, posix, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { verifyFunctionsSharedTypesVendor } from './sync-functions-shared-types.mjs';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const FUNCTIONS_DIRECTORY = resolve(REPOSITORY_ROOT, 'functions');
const FUNCTIONS_PACKAGE_PATH = resolve(FUNCTIONS_DIRECTORY, 'package.json');
const FUNCTIONS_LOCK_PATH = resolve(FUNCTIONS_DIRECTORY, 'package-lock.json');
const SHA256_INTEGRITY = /^sha512-[A-Za-z0-9+/]+={0,2}$/u;
const SEMVER = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u;

function numericVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/u.exec(version);
  return match ? match.slice(1).map(Number) : null;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function compareVersions(left, right) {
  const parsedLeft = numericVersion(left);
  const parsedRight = numericVersion(right);
  if (!parsedLeft || !parsedRight) return null;
  for (let index = 0; index < 3; index += 1) {
    if (parsedLeft[index] !== parsedRight[index]) {
      return parsedLeft[index] < parsedRight[index] ? -1 : 1;
    }
  }
  return 0;
}

function lockEntriesFor(lock, packageName) {
  const suffix = `node_modules/${packageName}`;
  return Object.entries(lock.packages ?? {}).filter(
    ([packagePath]) => packagePath === suffix || packagePath.endsWith(`/${suffix}`)
  );
}

function requireExactLockVersion(lock, packageName, version, purpose) {
  const entries = lockEntriesFor(lock, packageName);
  if (entries.length === 0 || entries.some(([, metadata]) => metadata.version !== version)) {
    throw new Error(
      `${purpose} must resolve every ${packageName} instance to ${version}; found ${entries.map(([path, metadata]) => `${path}@${metadata.version}`).join(', ') || 'none'}.`
    );
  }
}

export function verifyFunctionsDependencyLock() {
  const packageManifest = JSON.parse(readFileSync(FUNCTIONS_PACKAGE_PATH, 'utf8'));
  const lock = JSON.parse(readFileSync(FUNCTIONS_LOCK_PATH, 'utf8'));
  if (
    packageManifest.name !== '@eurogovernance/functions' ||
    packageManifest.engines?.node !== '22' ||
    packageManifest.dependencies?.['@eurogovernance/shared-types'] !==
      'file:vendor/shared-types' ||
    packageManifest.dependencies?.['firebase-admin'] !== '14.3.0' ||
    packageManifest.dependencies?.['firebase-functions'] !== '7.3.2' ||
    packageManifest.overrides?.gaxios !== '7.3.1' ||
    packageManifest.overrides?.['firebase-admin']?.['@google-cloud/storage']?.['.'] !==
      '8.0.1' ||
    packageManifest.overrides?.['firebase-admin']?.['@google-cloud/storage']?.[
      'teeny-request'
    ] !== '11.0.1'
  ) {
    throw new Error('Functions production manifest is missing its exact deploy dependency policy.');
  }
  if (
    lock.name !== packageManifest.name ||
    lock.version !== packageManifest.version ||
    lock.lockfileVersion !== 3 ||
    lock.packages?.['']?.name !== packageManifest.name ||
    lock.packages?.['']?.engines?.node !== '22' ||
    JSON.stringify(lock.packages?.['']?.dependencies) !==
      JSON.stringify(packageManifest.dependencies)
  ) {
    throw new Error('Functions package-lock.json is not synchronized with its deploy manifest.');
  }

  const localPackage = lock.packages?.['node_modules/@eurogovernance/shared-types'];
  const localPackageTarget = lock.packages?.['vendor/shared-types'];
  if (
    !localPackage ||
    localPackage.resolved !== 'vendor/shared-types' ||
    localPackage.link !== true ||
    localPackageTarget?.name !== '@eurogovernance/shared-types' ||
    localPackageTarget?.version !== '0.1.0'
  ) {
    throw new Error('Functions lock must install shared types from the packaged vendor directory.');
  }

  for (const [packagePath, metadata] of Object.entries(lock.packages ?? {})) {
    if (!packagePath.startsWith('node_modules/')) continue;
    if (packagePath === 'node_modules/@eurogovernance/shared-types') continue;
    if (
      metadata.link === true ||
      typeof metadata.version !== 'string' ||
      !SEMVER.test(metadata.version) ||
      typeof metadata.resolved !== 'string' ||
      !metadata.resolved.startsWith('https://registry.npmjs.org/') ||
      typeof metadata.integrity !== 'string' ||
      !SHA256_INTEGRITY.test(metadata.integrity)
    ) {
      throw new Error(`Functions production lock contains an unpinned package: ${packagePath}.`);
    }
  }

  requireExactLockVersion(lock, 'gaxios', '7.3.1', 'The Functions request-client override');
  requireExactLockVersion(
    lock,
    '@google-cloud/storage',
    '8.0.1',
    'The Firebase Admin Storage compatibility override'
  );
  const unsafeUuid = lockEntriesFor(lock, 'uuid').filter(([, metadata]) => {
    const version = metadata.version;
    if (typeof version !== 'string') return true;
    return !(
      compareVersions(version, '14.0.0') >= 0 ||
      (compareVersions(version, '13.0.1') >= 0 && compareVersions(version, '14.0.0') < 0) ||
      (compareVersions(version, '12.0.1') >= 0 && compareVersions(version, '13.0.0') < 0) ||
      (compareVersions(version, '11.1.1') >= 0 && compareVersions(version, '12.0.0') < 0)
    );
  });
  if (unsafeUuid.length > 0) {
    throw new Error(
      `Functions production lock contains UUID releases affected by GHSA-w5hq-g745-h8pq: ${unsafeUuid.map(([path, metadata]) => `${path}@${metadata.version}`).join(', ')}.`
    );
  }
  return { packageManifest, lock };
}

function findEndOfCentralDirectory(archive) {
  const minimumOffset = Math.max(0, archive.length - 65_557);
  for (let offset = archive.length - 22; offset >= minimumOffset; offset -= 1) {
    if (archive.readUInt32LE(offset) === 0x06054b50) return offset;
  }
  throw new Error('Functions deploy archive has no ZIP end-of-directory record.');
}

export function readZipEntries(archive) {
  const endOffset = findEndOfCentralDirectory(archive);
  const diskNumber = archive.readUInt16LE(endOffset + 4);
  const centralDisk = archive.readUInt16LE(endOffset + 6);
  const entriesOnDisk = archive.readUInt16LE(endOffset + 8);
  const entryCount = archive.readUInt16LE(endOffset + 10);
  const centralSize = archive.readUInt32LE(endOffset + 12);
  const centralOffset = archive.readUInt32LE(endOffset + 16);
  if (
    diskNumber !== 0 ||
    centralDisk !== 0 ||
    entriesOnDisk !== entryCount ||
    entryCount === 0xffff ||
    centralSize === 0xffffffff ||
    centralOffset === 0xffffffff ||
    centralOffset + centralSize > endOffset
  ) {
    throw new Error('Functions deploy archive uses an unsupported multi-disk or ZIP64 layout.');
  }

  const entries = new Map();
  let offset = centralOffset;
  for (let index = 0; index < entryCount; index += 1) {
    if (offset + 46 > archive.length || archive.readUInt32LE(offset) !== 0x02014b50) {
      throw new Error('Functions deploy archive central directory is malformed.');
    }
    const flags = archive.readUInt16LE(offset + 8);
    const compression = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const uncompressedSize = archive.readUInt32LE(offset + 24);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const externalAttributes = archive.readUInt32LE(offset + 38);
    const localOffset = archive.readUInt32LE(offset + 42);
    if (offset + 46 + nameLength + extraLength + commentLength > archive.length) {
      throw new Error('Functions deploy archive central-directory entry is truncated.');
    }
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString('utf8');
    const unixMode = externalAttributes >>> 16;
    if (
      flags & 0x1 ||
      (compression !== 0 && compression !== 8) ||
      name.length === 0 ||
      name.includes('\\') ||
      name.includes('\0') ||
      name.startsWith('/') ||
      posix.normalize(name) !== name ||
      name.split('/').includes('..') ||
      (unixMode & 0o170000) === 0o120000 ||
      entries.has(name)
    ) {
      throw new Error(`Functions deploy archive contains an unsafe ZIP entry: ${name || '<empty>'}.`);
    }
    if (
      localOffset + 30 > archive.length ||
      archive.readUInt32LE(localOffset) !== 0x04034b50
    ) {
      throw new Error(`Functions deploy archive has an invalid local header: ${name}.`);
    }
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const localName = archive
      .subarray(localOffset + 30, localOffset + 30 + localNameLength)
      .toString('utf8');
    if (localName !== name) {
      throw new Error(`Functions deploy archive local filename diverges: ${name}.`);
    }
    const dataOffset = localOffset + 30 + localNameLength + localExtraLength;
    if (dataOffset > archive.length || dataOffset + compressedSize > centralOffset) {
      throw new Error(`Functions deploy archive entry has invalid data bounds: ${name}.`);
    }
    const compressed = archive.subarray(dataOffset, dataOffset + compressedSize);
    if (compressed.byteLength !== compressedSize) {
      throw new Error(`Functions deploy archive entry is truncated: ${name}.`);
    }
    const contents = compression === 0 ? compressed : inflateRawSync(compressed);
    if (contents.byteLength !== uncompressedSize) {
      throw new Error(`Functions deploy archive entry size is inconsistent: ${name}.`);
    }
    entries.set(name, contents);
    offset += 46 + nameLength + extraLength + commentLength;
  }
  if (offset !== centralOffset + centralSize) {
    throw new Error('Functions deploy archive central-directory length is inconsistent.');
  }
  return entries;
}

async function createFirebaseFunctionsArchive() {
  const firebaseToolsUpload = await import(
    '../node_modules/firebase-tools/lib/deploy/functions/prepareFunctionsUpload.js'
  );
  const prepareFunctionsUpload =
    firebaseToolsUpload.prepareFunctionsUpload ??
    firebaseToolsUpload.default?.prepareFunctionsUpload;
  if (typeof prepareFunctionsUpload !== 'function') {
    throw new Error('Pinned firebase-tools no longer exposes the Functions packaging implementation.');
  }
  const firebaseConfig = JSON.parse(
    readFileSync(resolve(REPOSITORY_ROOT, 'firebase.json'), 'utf8')
  );
  const functionsConfig = Array.isArray(firebaseConfig.functions)
    ? firebaseConfig.functions.find((item) => item?.source === 'functions')
    : firebaseConfig.functions;
  if (!functionsConfig || functionsConfig.source !== 'functions') {
    throw new Error('firebase.json has no canonical Functions source configuration.');
  }
  const packaged = await prepareFunctionsUpload(
    REPOSITORY_ROOT,
    FUNCTIONS_DIRECTORY,
    functionsConfig,
    [],
    undefined,
    { exportType: 'zip', executablePaths: [] }
  );
  if (!packaged?.pathToSource) {
    throw new Error('firebase-tools did not produce a Functions upload archive.');
  }
  return packaged.pathToSource;
}

function removeFirebaseTemporaryArchive(archivePath) {
  if (
    resolve(archivePath).startsWith(`${resolve(tmpdir())}${sep}`) &&
    basename(archivePath).startsWith('firebase-functions-') &&
    basename(archivePath).endsWith('.zip')
  ) {
    rmSync(archivePath, { force: true });
  }
}

export async function readFirebaseFunctionsUploadEntries() {
  const archivePath = await createFirebaseFunctionsArchive();
  try {
    return readZipEntries(readFileSync(archivePath));
  } finally {
    removeFirebaseTemporaryArchive(archivePath);
  }
}

export async function verifyFirebaseFunctionsUploadArchive() {
  const vendorManifest = verifyFunctionsSharedTypesVendor();
  verifyFunctionsDependencyLock();
  const entries = await readFirebaseFunctionsUploadEntries();
    const names = [...entries.keys()];
    const forbidden = names.filter((name) => {
      const segments = name.split('/');
      return (
        segments.some(
          (segment) =>
            segment === '.env' || segment.startsWith('.env.') || segment.endsWith('.local')
        ) ||
        segments.includes('node_modules') ||
        segments.includes('.git')
      );
    });
    if (forbidden.length > 0) {
      throw new Error(
        `Functions deploy archive contains local configuration or dependencies: ${forbidden.join(', ')}.`
      );
    }
    const required = [
      'dist/index.js',
      'package.json',
      'package-lock.json',
      'vendor/shared-types/package.json',
      'vendor/shared-types/vendor-manifest.json',
      'vendor/shared-types/dist/index.js',
    ];
    const missing = required.filter((name) => !entries.has(name));
    if (missing.length > 0) {
      throw new Error(`Functions deploy archive is incomplete: ${missing.join(', ')}.`);
    }
    for (const [archiveName, diskPath] of [
      ['package.json', FUNCTIONS_PACKAGE_PATH],
      ['package-lock.json', FUNCTIONS_LOCK_PATH],
      [
        'vendor/shared-types/package.json',
        resolve(FUNCTIONS_DIRECTORY, 'vendor/shared-types/package.json'),
      ],
      [
        'vendor/shared-types/vendor-manifest.json',
        resolve(FUNCTIONS_DIRECTORY, 'vendor/shared-types/vendor-manifest.json'),
      ],
    ]) {
      if (!entries.get(archiveName).equals(readFileSync(diskPath))) {
        throw new Error(`Functions deploy archive changed ${archiveName} while packaging.`);
      }
    }
    for (const file of vendorManifest.files) {
      const archiveName = `vendor/shared-types/${file.path}`;
      const contents = entries.get(archiveName);
      if (
        !contents ||
        contents.byteLength !== file.bytes ||
        sha256(contents) !== file.sha256
      ) {
        throw new Error(`Functions deploy archive is missing exact vendor file ${archiveName}.`);
      }
    }
    return { archiveEntries: names.length, vendorFiles: vendorManifest.files.length };
}

async function run() {
  const result = await verifyFirebaseFunctionsUploadArchive();
  process.stdout.write(
    `Firebase Functions deploy artifact: PASS (${result.archiveEntries} files; ${result.vendorFiles} vendored shared-type files)\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await run();

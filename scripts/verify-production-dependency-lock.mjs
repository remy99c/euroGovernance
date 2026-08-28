import { readFileSync } from 'node:fs';

const repositoryRoot = new URL('../', import.meta.url);
const manifest = JSON.parse(
  readFileSync(new URL('package.json', repositoryRoot), 'utf8')
);
const lock = JSON.parse(
  readFileSync(new URL('package-lock.json', repositoryRoot), 'utf8')
);

function numericVersion(version) {
  const match = /^(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$/.exec(version);
  if (!match) return null;
  return match.slice(1).map(Number);
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

function entriesFor(packageName) {
  const suffix = `node_modules/${packageName}`;
  return Object.entries(lock.packages ?? {}).filter(
    ([packagePath]) => packagePath === suffix || packagePath.endsWith(`/${suffix}`)
  );
}

function rejectVersions(packageName, isUnsafe, advisory) {
  const unsafe = entriesFor(packageName)
    .filter(
      ([, metadata]) =>
        typeof metadata.version !== 'string' ||
        !numericVersion(metadata.version) ||
        isUnsafe(metadata.version)
    )
    .map(([packagePath, metadata]) => `${packagePath}@${metadata.version}`);
  if (unsafe.length > 0) {
    throw new Error(
      `Production lock contains ${packageName} releases affected by ${advisory}: ${unsafe.join(', ')}`
    );
  }
}

function requireExact(packagePath, version, purpose) {
  if (lock.packages?.[packagePath]?.version !== version) {
    throw new Error(`${purpose} must resolve ${packagePath} to ${version}.`);
  }
}

function isPatchedUuid(version) {
  const parsed = numericVersion(version);
  if (!parsed) return false;
  const [major, minor, patch] = parsed;
  if (major >= 14) return true;
  if (major === 13) return minor > 0 || (minor === 0 && patch >= 1);
  if (major === 12) return minor > 0 || (minor === 0 && patch >= 1);
  if (major === 11) return minor > 1 || (minor === 1 && patch >= 1);
  return false;
}

const unsafeUuidEntries = Object.entries(lock.packages ?? {})
  .filter(([packagePath]) => /(?:^|\/)node_modules\/uuid$/.test(packagePath))
  .filter(([, metadata]) => !isPatchedUuid(metadata.version))
  .map(([packagePath, metadata]) => `${packagePath || '<root>'}@${metadata.version}`);

if (unsafeUuidEntries.length > 0) {
  throw new Error(
    `Production lock contains UUID releases affected by GHSA-w5hq-g745-h8pq: ${unsafeUuidEntries.join(', ')}`
  );
}

rejectVersions(
  'gaxios',
  (version) =>
    compareVersions(version, '6.4.0') >= 0 && compareVersions(version, '6.7.1') <= 0,
  'GHSA-w5hq-g745-h8pq through its UUID dependency'
);
rejectVersions(
  '@opentelemetry/core',
  (version) => compareVersions(version, '2.8.0') < 0,
  'GHSA-8988-4f7v-96qf'
);
rejectVersions(
  're2',
  (version) => compareVersions(version, '1.26.1') < 0,
  'the node-re2 memory-safety and denial-of-service advisories'
);
rejectVersions(
  'tar',
  (version) => compareVersions(version, '7.5.21') < 0,
  'the node-tar path traversal and denial-of-service advisories'
);

requireExact(
  'node_modules/@google-cloud/pubsub',
  '6.0.1',
  'The Firebase CLI security override'
);
requireExact('node_modules/re2', '1.26.1', 'The Hosting emulator security override');

if (
  manifest.packageManager !== 'npm@10.9.4' ||
  manifest.engines?.node !== '22' ||
  !Array.isArray(manifest.workspaces) ||
  manifest.workspaces.includes('functions') ||
  lock.packages?.functions !== undefined ||
  lock.packages?.['']?.engines?.node !== '22'
) {
  throw new Error(
    'The root Node/npm policy must be synchronized and the deployable Functions graph must remain outside root workspaces.'
  );
}

if (entriesFor('gaxios').some(([, metadata]) => metadata.version !== '7.3.1')) {
  throw new Error(
    'Every root Firebase CLI request client must resolve to the reviewed gaxios 7.3.1 override.'
  );
}

process.stdout.write('Production dependency lock policy: PASS\n');

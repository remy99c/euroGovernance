import { lstat, readFile, readdir } from 'node:fs/promises';
import { relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const DEFAULT_OUTPUT_ROOT = resolve(REPOSITORY_ROOT, 'apps/web/out');
const DEPLOYMENT_METADATA_NAME = 'deployment-metadata.json';
const METADATA_KEYS = new Set([
  'schemaVersion',
  'buildMode',
  'projectId',
  'apiKey',
  'appId',
  'authDomain',
  'storageBucket',
  'messagingSenderId',
  'functionsRegion',
  'appCheckSiteKey',
  'emulatorEnabled',
  'appCheckMode',
  'devPersonaConfigurationPresent',
]);

const FORBIDDEN_APPLICATION_MARKERS = [
  'functions-emulator-only',
  'Emulator App Check tokens are unavailable outside local development.',
  'eurogovernance:tenant-command:v1:',
  'demo-api-key',
  'ci-build-placeholder',
  'ci-recaptcha-enterprise-site-key-placeholder',
  'http://127.0.0.1:9099',
  'eurogovernance-dev.firebaseapp.com',
  'eurogovernance-dev.appspot.com',
  '1:123456789012:web:abcdef123456',
];

function nonEmptyEnvironmentValue(environment, name) {
  const value = environment[name]?.trim();
  if (!value) throw new Error(`Production web bundle gate requires ${name}.`);
  return value;
}

export function expectedDeploymentIdentity(environment = process.env) {
  const expected = {
    projectId: nonEmptyEnvironmentValue(environment, 'EXPECTED_FIREBASE_PROJECT_ID'),
    apiKey: nonEmptyEnvironmentValue(environment, 'EXPECTED_FIREBASE_API_KEY'),
    appId: nonEmptyEnvironmentValue(environment, 'EXPECTED_FIREBASE_APP_ID'),
    authDomain: nonEmptyEnvironmentValue(environment, 'EXPECTED_FIREBASE_AUTH_DOMAIN'),
    storageBucket: nonEmptyEnvironmentValue(environment, 'EXPECTED_FIREBASE_STORAGE_BUCKET'),
    messagingSenderId: nonEmptyEnvironmentValue(
      environment,
      'EXPECTED_FIREBASE_MESSAGING_SENDER_ID'
    ),
    functionsRegion: nonEmptyEnvironmentValue(
      environment,
      'EXPECTED_FIREBASE_FUNCTIONS_REGION'
    ),
    appCheckSiteKey: nonEmptyEnvironmentValue(
      environment,
      'EXPECTED_FIREBASE_APP_CHECK_SITE_KEY'
    ),
  };

  if (!/^[a-z][a-z0-9-]{4,29}$/u.test(expected.projectId)) {
    throw new Error('EXPECTED_FIREBASE_PROJECT_ID is not a valid Firebase project identifier.');
  }
  if (!/^AIza[0-9A-Za-z_-]{35}$/u.test(expected.apiKey)) {
    throw new Error('EXPECTED_FIREBASE_API_KEY is not a valid Firebase Web API key.');
  }
  const appIdMatch = /^1:(\d+):web:[0-9A-Za-z]+$/u.exec(expected.appId);
  if (!appIdMatch) {
    throw new Error('EXPECTED_FIREBASE_APP_ID is not a valid Firebase Web App ID.');
  }
  if (!/^\d{6,20}$/u.test(expected.messagingSenderId)) {
    throw new Error(
      'EXPECTED_FIREBASE_MESSAGING_SENDER_ID is not a valid Google project number.'
    );
  }
  if (appIdMatch[1] !== expected.messagingSenderId) {
    throw new Error(
      'EXPECTED_FIREBASE_APP_ID project number does not match EXPECTED_FIREBASE_MESSAGING_SENDER_ID.'
    );
  }
  if (
    !/^[a-z0-9](?:[a-z0-9.-]{0,251}[a-z0-9])?$/u.test(expected.authDomain) ||
    expected.authDomain.includes('..')
  ) {
    throw new Error('EXPECTED_FIREBASE_AUTH_DOMAIN is not a valid hostname.');
  }
  if (
    !/^[a-z0-9](?:[a-z0-9._-]{0,220}[a-z0-9])?\.(?:appspot\.com|firebasestorage\.app)$/u.test(
      expected.storageBucket
    )
  ) {
    throw new Error('EXPECTED_FIREBASE_STORAGE_BUCKET is not an approved Firebase bucket name.');
  }
  if (!/^[a-z]+-[a-z]+\d$/u.test(expected.functionsRegion)) {
    throw new Error('EXPECTED_FIREBASE_FUNCTIONS_REGION is not a valid Google Cloud region.');
  }
  if (!/^[0-9A-Za-z_-]{30,100}$/u.test(expected.appCheckSiteKey)) {
    throw new Error(
      'EXPECTED_FIREBASE_APP_CHECK_SITE_KEY is not a valid reCAPTCHA Enterprise site key.'
    );
  }
  if (
    Object.values(expected).some((value) =>
      /(?:placeholder|demo|localhost|127\.0\.0\.1)/iu.test(value)
    )
  ) {
    throw new Error('Expected Firebase deployment identity contains a placeholder or local value.');
  }
  return expected;
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

export function validateDeploymentMetadata(metadata, expected) {
  if (
    !isPlainObject(metadata) ||
    Object.keys(metadata).length !== METADATA_KEYS.size ||
    Object.keys(metadata).some((key) => !METADATA_KEYS.has(key)) ||
    metadata.schemaVersion !== 1 ||
    metadata.buildMode !== 'production' ||
    metadata.emulatorEnabled !== false ||
    metadata.appCheckMode !== 'recaptcha_enterprise' ||
    metadata.devPersonaConfigurationPresent !== false
  ) {
    throw new Error('Production web deployment metadata is missing or unsafe.');
  }

  for (const [field, expectedValue] of Object.entries(expected)) {
    if (metadata[field] !== expectedValue) {
      throw new Error(
        `Production web bundle targets the wrong ${field}: expected ${expectedValue}, received ${String(metadata[field])}.`
      );
    }
  }
}

async function filesUnder(directory, outputRoot) {
  const entries = await readdir(directory);
  const files = [];
  for (const entry of entries.sort()) {
    const path = resolve(directory, entry);
    const relativePath = relative(outputRoot, path);
    if (
      relativePath === '..' ||
      relativePath.startsWith(`..${sep}`) ||
      resolve(outputRoot, relativePath) !== path
    ) {
      throw new Error(`Generated web asset escapes the Hosting output root: ${path}`);
    }
    const metadata = await lstat(path);
    if (metadata.isSymbolicLink()) {
      throw new Error(`Generated web assets cannot contain symbolic links: ${relativePath}`);
    }
    if (metadata.isDirectory()) files.push(...(await filesUnder(path, outputRoot)));
    else if (metadata.isFile()) files.push(path);
    else throw new Error(`Generated web output contains an unsupported entry: ${relativePath}`);
  }
  return files;
}

export async function inspectProductionWebBundle({ outputRoot, expected }) {
  const resolvedOutputRoot = resolve(outputRoot);
  const files = await filesUnder(resolvedOutputRoot, resolvedOutputRoot);
  const metadataPath = resolve(resolvedOutputRoot, DEPLOYMENT_METADATA_NAME);
  if (!files.includes(metadataPath)) {
    throw new Error(`Production web bundle is missing ${DEPLOYMENT_METADATA_NAME}.`);
  }

  let deploymentMetadata;
  try {
    deploymentMetadata = JSON.parse(await readFile(metadataPath, 'utf8'));
  } catch {
    throw new Error('Production web deployment metadata is not valid JSON.');
  }
  validateDeploymentMetadata(deploymentMetadata, expected);

  const forbiddenBuffers = FORBIDDEN_APPLICATION_MARKERS.map((marker) => ({
    marker,
    bytes: Buffer.from(marker, 'utf8'),
  }));
  const violations = [];
  for (const file of files) {
    const contents = await readFile(file);
    for (const { marker, bytes } of forbiddenBuffers) {
      if (contents.includes(bytes)) {
        violations.push(`${relative(resolvedOutputRoot, file)}: ${marker}`);
      }
    }
  }
  if (violations.length > 0) {
    throw new Error(
      `Production web bundle contains local-only, placeholder, or stale markers:\n${violations
        .map((violation) => `- ${violation}`)
        .join('\n')}`
    );
  }

  return { fileCount: files.length, deploymentMetadata };
}

async function run() {
  try {
    const result = await inspectProductionWebBundle({
      outputRoot: DEFAULT_OUTPUT_ROOT,
      expected: expectedDeploymentIdentity(),
    });
    process.stdout.write(
      `Production web bundle gate: PASS (${result.fileCount} deployed assets; ${result.deploymentMetadata.projectId}; ${result.deploymentMetadata.appId}).\n`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`${message}\n`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await run();

import { createHash } from 'node:crypto';
import {
  copyFileSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { dirname, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPOSITORY_ROOT = resolve(fileURLToPath(new URL('../', import.meta.url)));
const SOURCE_PACKAGE_DIRECTORY = resolve(REPOSITORY_ROOT, 'packages/shared-types');
const SOURCE_DIST_DIRECTORY = resolve(SOURCE_PACKAGE_DIRECTORY, 'dist');
const VENDOR_DIRECTORY = resolve(REPOSITORY_ROOT, 'functions/vendor/shared-types');
const VENDOR_MANIFEST_NAME = 'vendor-manifest.json';

function canonicalJson(value) {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

function relativePosixPath(parent, child) {
  return relative(parent, child).split(sep).join('/');
}

function listFiles(directory) {
  const files = [];
  const visit = (current) => {
    for (const name of readdirSync(current).sort()) {
      const absolutePath = resolve(current, name);
      const stat = lstatSync(absolutePath);
      if (stat.isSymbolicLink()) {
        throw new Error(`Vendored shared types cannot contain symbolic links: ${absolutePath}`);
      }
      if (stat.isDirectory()) {
        visit(absolutePath);
      } else if (stat.isFile()) {
        files.push(absolutePath);
      } else {
        throw new Error(`Vendored shared types contain an unsupported filesystem entry: ${absolutePath}`);
      }
    }
  };
  visit(directory);
  return files;
}

function sourcePackageMetadata() {
  const sourcePackage = JSON.parse(
    readFileSync(resolve(SOURCE_PACKAGE_DIRECTORY, 'package.json'), 'utf8')
  );
  if (
    sourcePackage.name !== '@eurogovernance/shared-types' ||
    typeof sourcePackage.version !== 'string' ||
    !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/u.test(sourcePackage.version)
  ) {
    throw new Error('Shared-types source package metadata is invalid.');
  }
  return sourcePackage;
}

function expectedVendorPackage(sourcePackage) {
  return {
    name: sourcePackage.name,
    version: sourcePackage.version,
    private: true,
    // The shared-types package currently compiles under NodeNext without a
    // source package `type`, so TypeScript emits CommonJS. Labeling this ESM
    // makes the deployed Functions process fail at module initialization.
    type: 'commonjs',
    main: './dist/index.js',
    types: './dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
      },
    },
    files: ['dist'],
  };
}

function expectedVendorSnapshot() {
  const sourcePackage = sourcePackageMetadata();
  const sourceFiles = listFiles(SOURCE_DIST_DIRECTORY);
  if (
    !sourceFiles.some((file) => relativePosixPath(SOURCE_DIST_DIRECTORY, file) === 'index.js') ||
    !sourceFiles.some((file) => relativePosixPath(SOURCE_DIST_DIRECTORY, file) === 'index.d.ts')
  ) {
    throw new Error('Build packages/shared-types before synchronizing the Functions vendor package.');
  }

  const files = sourceFiles.map((sourcePath) => {
    const contents = readFileSync(sourcePath);
    return {
      path: `dist/${relativePosixPath(SOURCE_DIST_DIRECTORY, sourcePath)}`,
      bytes: contents.byteLength,
      sha256: sha256(contents),
      sourcePath,
    };
  });
  return {
    vendorPackage: expectedVendorPackage(sourcePackage),
    manifest: {
      schemaVersion: 1,
      source: 'packages/shared-types/dist',
      packageName: sourcePackage.name,
      packageVersion: sourcePackage.version,
      files: files.map(({ path, bytes, sha256: digest }) => ({
        path,
        bytes,
        sha256: digest,
      })),
    },
    files,
  };
}

function assertVendorTargetIsSafe() {
  const expected = resolve(REPOSITORY_ROOT, 'functions/vendor/shared-types');
  if (VENDOR_DIRECTORY !== expected || !VENDOR_DIRECTORY.startsWith(`${REPOSITORY_ROOT}${sep}`)) {
    throw new Error('Refusing to modify an unexpected Functions vendor directory.');
  }
}

export function syncFunctionsSharedTypes() {
  assertVendorTargetIsSafe();
  const expected = expectedVendorSnapshot();
  rmSync(VENDOR_DIRECTORY, { recursive: true, force: true });
  mkdirSync(VENDOR_DIRECTORY, { recursive: true });

  for (const file of expected.files) {
    const targetPath = resolve(VENDOR_DIRECTORY, file.path);
    mkdirSync(dirname(targetPath), { recursive: true });
    copyFileSync(file.sourcePath, targetPath);
  }
  writeFileSync(
    resolve(VENDOR_DIRECTORY, 'package.json'),
    canonicalJson(expected.vendorPackage),
    { mode: 0o644 }
  );
  writeFileSync(
    resolve(VENDOR_DIRECTORY, VENDOR_MANIFEST_NAME),
    canonicalJson(expected.manifest),
    { mode: 0o644 }
  );
  return expected.manifest;
}

export function verifyFunctionsSharedTypesVendor() {
  const expected = expectedVendorSnapshot();
  const expectedFiles = new Set([
    'package.json',
    VENDOR_MANIFEST_NAME,
    ...expected.files.map(({ path }) => path),
  ]);
  const actualFiles = listFiles(VENDOR_DIRECTORY).map((file) =>
    relativePosixPath(VENDOR_DIRECTORY, file)
  );
  const unexpected = actualFiles.filter((file) => !expectedFiles.has(file));
  const missing = [...expectedFiles].filter((file) => !actualFiles.includes(file));
  if (unexpected.length > 0 || missing.length > 0) {
    throw new Error(
      `Functions shared-types vendor file set is stale (missing: ${missing.join(', ') || 'none'}; unexpected: ${unexpected.join(', ') || 'none'}). Run npm run sync:functions-vendor.`
    );
  }

  const vendorPackage = readFileSync(resolve(VENDOR_DIRECTORY, 'package.json'), 'utf8');
  if (vendorPackage !== canonicalJson(expected.vendorPackage)) {
    throw new Error('Functions shared-types vendor package.json is stale. Run npm run sync:functions-vendor.');
  }
  const vendorManifest = readFileSync(
    resolve(VENDOR_DIRECTORY, VENDOR_MANIFEST_NAME),
    'utf8'
  );
  if (vendorManifest !== canonicalJson(expected.manifest)) {
    throw new Error('Functions shared-types vendor manifest is stale. Run npm run sync:functions-vendor.');
  }

  for (const file of expected.files) {
    const actual = readFileSync(resolve(VENDOR_DIRECTORY, file.path));
    if (actual.byteLength !== file.bytes || sha256(actual) !== file.sha256) {
      throw new Error(
        `Functions shared-types vendor file is stale: ${file.path}. Run npm run sync:functions-vendor.`
      );
    }
  }
  return expected.manifest;
}

function run() {
  if (process.argv.includes('--check')) {
    const manifest = verifyFunctionsSharedTypesVendor();
    process.stdout.write(
      `Functions shared-types vendor: PASS (${manifest.files.length} hashed files)\n`
    );
    return;
  }
  if (process.argv.length > 2) {
    throw new Error('Usage: node scripts/sync-functions-shared-types.mjs [--check]');
  }
  const manifest = syncFunctionsSharedTypes();
  process.stdout.write(
    `Functions shared-types vendor synchronized (${manifest.files.length} hashed files).\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) run();

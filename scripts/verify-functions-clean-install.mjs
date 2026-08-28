import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

import {
  readFirebaseFunctionsUploadEntries,
  verifyFirebaseFunctionsUploadArchive,
} from './verify-functions-deploy-artifact.mjs';

const NPM_VERSION = '10.9.4';

function safeChildEnvironment() {
  const allowed = [
    'HOME',
    'PATH',
    'TMPDIR',
    'TMP',
    'TEMP',
    'SystemRoot',
    'ComSpec',
    'HTTP_PROXY',
    'HTTPS_PROXY',
    'NO_PROXY',
    'http_proxy',
    'https_proxy',
    'no_proxy',
  ];
  const environment = Object.fromEntries(
    allowed.flatMap((name) =>
      typeof process.env[name] === 'string' ? [[name, process.env[name]]] : []
    )
  );
  return {
    ...environment,
    CI: 'true',
    npm_config_fund: 'false',
    npm_config_update_notifier: 'false',
  };
}

function run(command, arguments_, cwd, label) {
  const result = spawnSync(command, arguments_, {
    cwd,
    env: safeChildEnvironment(),
    encoding: 'utf8',
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error || result.status !== 0) {
    const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim();
    throw new Error(
      `${label} failed${result.error ? `: ${result.error.message}` : ''}${output ? `\n${output}` : ''}`
    );
  }
  return result.stdout;
}

function runNpm(arguments_, cwd, label) {
  return run('npx', ['--yes', `npm@${NPM_VERSION}`, ...arguments_], cwd, label);
}

function extractArchive(entries, destination) {
  const root = resolve(destination);
  for (const [name, contents] of entries) {
    if (name.endsWith('/')) continue;
    const target = resolve(root, name);
    if (!target.startsWith(`${root}${sep}`)) {
      throw new Error(`Refusing to extract an unsafe Functions archive path: ${name}.`);
    }
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, contents, { mode: 0o644 });
  }
}

export async function verifyFunctionsCleanInstall() {
  await verifyFirebaseFunctionsUploadArchive();
  const entries = await readFirebaseFunctionsUploadEntries();
  const installDirectory = mkdtempSync(join(tmpdir(), 'eurogovernance-functions-install-'));
  try {
    extractArchive(entries, installDirectory);
    runNpm(
      ['ci', '--ignore-scripts', '--workspaces=false', '--audit=false'],
      installDirectory,
      `npm ${NPM_VERSION} clean Functions install`
    );
    runNpm(
      ['ls', '--all', '--workspaces=false', '--json'],
      installDirectory,
      `npm ${NPM_VERSION} Functions dependency-tree validation`
    );
    const auditOutput = runNpm(
      ['audit', '--omit=dev', '--audit-level=moderate', '--workspaces=false', '--json'],
      installDirectory,
      `npm ${NPM_VERSION} Functions production audit`
    );
    const audit = JSON.parse(auditOutput);
    if (audit.metadata?.vulnerabilities?.total !== 0) {
      throw new Error('Functions production audit did not report a zero-vulnerability graph.');
    }

    const installedSharedTypes = realpathSync(
      resolve(installDirectory, 'node_modules/@eurogovernance/shared-types')
    );
    const packagedSharedTypes = realpathSync(
      resolve(installDirectory, 'vendor/shared-types')
    );
    if (installedSharedTypes !== packagedSharedTypes) {
      throw new Error('Clean Functions install resolved shared types outside the upload artifact.');
    }
    run(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        "const shared = await import('@eurogovernance/shared-types'); await import('firebase-admin/app'); await import('firebase-admin/storage'); await import('firebase-functions/v2/https'); if (Object.keys(shared).length === 0) throw new Error('Shared-types runtime has no exports.');",
      ],
      installDirectory,
      'Functions runtime dependency import smoke test'
    );
    return { archiveEntries: entries.size, npmVersion: NPM_VERSION };
  } finally {
    if (
      resolve(installDirectory).startsWith(`${resolve(tmpdir())}${sep}`) &&
      installDirectory.includes('eurogovernance-functions-install-')
    ) {
      rmSync(installDirectory, { recursive: true, force: true });
    }
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  const result = await verifyFunctionsCleanInstall();
  process.stdout.write(
    `Clean Firebase Functions install: PASS (npm ${result.npmVersion}; ${result.archiveEntries} packaged files; dependency tree and production audit clean)\n`
  );
}

import { createHash } from 'node:crypto';
import { readFileSync, realpathSync, statSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const REQUIRED_RELEASE_BLOCKERS = new Map([
  ['authoritative-callable-migration', 'M1B'],
  ['least-privilege-read-projections', 'M1B'],
  ['verified-evidence-object-pipeline', 'M2'],
  ['reproducible-applicability-and-framework-provenance', 'M3'],
  ['tamper-evident-audit-chain-and-checkpoint', 'M3'],
  ['secure-auditor-export-delivery', 'M4'],
  ['recurring-operations-and-outbox-delivery', 'M4'],
  ['tenant-data-migration-and-reconciliation', 'M5'],
  ['cloud-app-check-and-regional-cutover', 'M5'],
  ['independent-security-dr-assurance', 'M5'],
]);

const DEFAULT_REPOSITORY_ROOT = fileURLToPath(new URL('../', import.meta.url));
const EVIDENCE_PATH = /^docs\/release-evidence\/[A-Za-z0-9_.\/-]{3,240}$/u;
const SHA256 = /^[0-9a-f]{64}$/u;
const ISO_TIMESTAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u;
const REVIEWER_ID = /^[A-Za-z0-9][A-Za-z0-9_.@-]{2,127}$/u;

function isCanonicalUtcTimestamp(value) {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return false;
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const canonicalWithMilliseconds = parsed.toISOString();
  return (
    value === canonicalWithMilliseconds ||
    value === canonicalWithMilliseconds.replace(/\.000Z$/u, 'Z')
  );
}

function assertEvidenceReference(evidence, repositoryRoot, seenEvidencePaths) {
  if (
    !evidence ||
    typeof evidence !== 'object' ||
    Array.isArray(evidence) ||
    Object.keys(evidence).sort().join('|') !== 'path|sha256' ||
    typeof evidence.path !== 'string' ||
    !EVIDENCE_PATH.test(evidence.path) ||
    isAbsolute(evidence.path) ||
    evidence.path.includes('//') ||
    evidence.path.split('/').some((segment) => segment === '.' || segment === '..') ||
    typeof evidence.sha256 !== 'string' ||
    !SHA256.test(evidence.sha256) ||
    seenEvidencePaths.has(evidence.path)
  ) {
    throw new Error('Production release readiness manifest contains invalid evidence.');
  }

  const canonicalRoot = realpathSync(repositoryRoot);
  const candidatePath = resolve(canonicalRoot, evidence.path);
  let canonicalEvidencePath;
  try {
    canonicalEvidencePath = realpathSync(candidatePath);
  } catch {
    throw new Error(`Release evidence file does not exist: ${evidence.path}`);
  }
  const evidenceRelativePath = relative(canonicalRoot, canonicalEvidencePath);
  if (
    evidenceRelativePath === '' ||
    evidenceRelativePath === '..' ||
    evidenceRelativePath.startsWith(`..${sep}`) ||
    isAbsolute(evidenceRelativePath) ||
    !EVIDENCE_PATH.test(evidenceRelativePath.split(sep).join('/')) ||
    seenEvidencePaths.has(`canonical:${canonicalEvidencePath}`) ||
    !statSync(canonicalEvidencePath).isFile()
  ) {
    throw new Error(`Release evidence must be a repository file: ${evidence.path}`);
  }

  const actualHash = createHash('sha256')
    .update(readFileSync(canonicalEvidencePath))
    .digest('hex');
  if (actualHash !== evidence.sha256) {
    throw new Error(`Release evidence hash mismatch: ${evidence.path}`);
  }
  seenEvidencePaths.add(evidence.path);
  seenEvidencePaths.add(`canonical:${canonicalEvidencePath}`);
}

export function validateReleaseManifest(
  manifest,
  { repositoryRoot = DEFAULT_REPOSITORY_ROOT } = {}
) {
  if (
    !manifest ||
    typeof manifest !== 'object' ||
    Array.isArray(manifest) ||
    manifest.schemaVersion !== 1 ||
    (manifest.releaseStatus !== 'blocked' && manifest.releaseStatus !== 'ready') ||
    !Array.isArray(manifest.blockers)
  ) {
    throw new Error('Production release readiness manifest has an unsupported schema.');
  }

  const seenIds = new Set();
  const seenEvidencePaths = new Set();
  for (const blocker of manifest.blockers) {
    if (
      !blocker ||
      typeof blocker !== 'object' ||
      Array.isArray(blocker) ||
      typeof blocker.id !== 'string' ||
      !/^[a-z][a-z0-9-]{2,79}$/u.test(blocker.id) ||
      seenIds.has(blocker.id) ||
      typeof blocker.milestone !== 'string' ||
      typeof blocker.description !== 'string' ||
      blocker.description.length < 20 ||
      (blocker.status !== 'open' && blocker.status !== 'cleared') ||
      !Array.isArray(blocker.evidence)
    ) {
      throw new Error('Production release readiness manifest contains an invalid blocker.');
    }

    for (const evidence of blocker.evidence) {
      assertEvidenceReference(evidence, repositoryRoot, seenEvidencePaths);
    }

    if (blocker.status === 'cleared') {
      if (
        blocker.evidence.length === 0 ||
        typeof blocker.clearedBy !== 'string' ||
        !REVIEWER_ID.test(blocker.clearedBy) ||
        !isCanonicalUtcTimestamp(blocker.clearedAt)
      ) {
        throw new Error(`Cleared release blocker lacks review evidence: ${blocker.id}`);
      }
    } else if (blocker.clearedBy !== undefined || blocker.clearedAt !== undefined) {
      throw new Error(`Open release blocker contains clearance metadata: ${blocker.id}`);
    }

    seenIds.add(blocker.id);
  }

  for (const [id, milestone] of REQUIRED_RELEASE_BLOCKERS) {
    const blocker = manifest.blockers.find((item) => item.id === id);
    if (!blocker || blocker.milestone !== milestone) {
      throw new Error(`Required production release blocker is missing or moved: ${id}`);
    }
  }

  const openBlockers = manifest.blockers.filter((blocker) => blocker.status !== 'cleared');
  if (
    (openBlockers.length === 0 && manifest.releaseStatus !== 'ready') ||
    (openBlockers.length > 0 && manifest.releaseStatus !== 'blocked')
  ) {
    throw new Error('Release status is inconsistent with the blocker register.');
  }

  return { openBlockers };
}

function readManifest(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch {
    throw new Error('Production release readiness manifest is missing or invalid JSON.');
  }
}

function run() {
  const defaultManifest = new URL('../docs/production-release-readiness.json', import.meta.url);
  const manifestPath = process.argv[2] ? resolve(process.argv[2]) : defaultManifest;
  const manifest = readManifest(manifestPath);
  const { openBlockers } = validateReleaseManifest(manifest);

  if (openBlockers.length > 0) {
    process.stderr.write('Production deployment is blocked by unresolved release gates:\n');
    for (const blocker of openBlockers) {
      process.stderr.write(`- [${blocker.milestone}] ${blocker.id}: ${blocker.description}\n`);
    }
    process.stderr.write(
      'Clear each gate with reviewable evidence and set releaseStatus to ready; there is no environment-variable bypass.\n'
    );
    process.exitCode = 1;
    return;
  }

  process.stdout.write(
    `Production release gate: PASS (${manifest.blockers.length} evidenced controls)\n`
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) run();

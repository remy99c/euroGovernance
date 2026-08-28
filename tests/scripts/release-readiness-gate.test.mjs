import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test, { after } from 'node:test';

import {
  REQUIRED_RELEASE_BLOCKERS,
  validateReleaseManifest,
} from '../../scripts/verify-production-release-readiness.mjs';

const manifest = JSON.parse(
  readFileSync(new URL('../../docs/production-release-readiness.json', import.meta.url), 'utf8')
);
const evidenceRepository = mkdtempSync(join(tmpdir(), 'eurogovernance-release-gate-'));
mkdirSync(join(evidenceRepository, 'docs', 'release-evidence'), { recursive: true });

after(() => {
  rmSync(evidenceRepository, { recursive: true, force: true });
});

function copy(value) {
  return JSON.parse(JSON.stringify(value));
}

function createEvidence(id, contents = `Reviewed release evidence for ${id}.\n`) {
  const path = `docs/release-evidence/${id}.md`;
  writeFileSync(join(evidenceRepository, path), contents, 'utf8');
  return {
    path,
    sha256: createHash('sha256').update(contents).digest('hex'),
  };
}

test('the checked-in manifest retains every mandatory release gate', () => {
  const { openBlockers } = validateReleaseManifest(manifest);
  assert.equal(openBlockers.length, REQUIRED_RELEASE_BLOCKERS.size);
  assert.equal(manifest.releaseStatus, 'blocked');
});

test('a mandatory gate cannot be deleted to make production appear ready', () => {
  const candidate = copy(manifest);
  candidate.blockers = candidate.blockers.slice(1);
  assert.throws(
    () => validateReleaseManifest(candidate),
    /Required production release blocker is missing or moved/u
  );
});

test('clearing a gate requires attributable, reviewable evidence', () => {
  const candidate = copy(manifest);
  candidate.blockers[0].status = 'cleared';
  assert.throws(
    () => validateReleaseManifest(candidate),
    /lacks review evidence/u
  );
});

test('clearance evidence must exist and match its pinned SHA-256', () => {
  const candidate = copy(manifest);
  candidate.blockers[0].status = 'cleared';
  candidate.blockers[0].clearedBy = 'independent-release-review';
  candidate.blockers[0].clearedAt = '2026-08-27T00:00:00Z';
  candidate.blockers[0].evidence = [
    {
      path: 'docs/release-evidence/missing.md',
      sha256: '0'.repeat(64),
    },
  ];
  assert.throws(
    () => validateReleaseManifest(candidate, { repositoryRoot: evidenceRepository }),
    /does not exist/u
  );

  candidate.blockers[0].evidence = [createEvidence('hash-mismatch')];
  candidate.blockers[0].evidence[0].sha256 = '0'.repeat(64);
  assert.throws(
    () => validateReleaseManifest(candidate, { repositoryRoot: evidenceRepository }),
    /hash mismatch/u
  );
});

test('clearance timestamps must be real canonical UTC calendar instants', () => {
  const candidate = copy(manifest);
  candidate.blockers[0].status = 'cleared';
  candidate.blockers[0].evidence = [createEvidence('invalid-calendar-date')];
  candidate.blockers[0].clearedBy = 'independent-release-review';
  candidate.blockers[0].clearedAt = '2026-02-30T00:00:00Z';
  assert.throws(
    () => validateReleaseManifest(candidate, { repositoryRoot: evidenceRepository }),
    /lacks review evidence/u
  );
});

test('clearance reviewer attribution must be a canonical identity', () => {
  const candidate = copy(manifest);
  candidate.blockers[0].status = 'cleared';
  candidate.blockers[0].evidence = [createEvidence('invalid-reviewer')];
  candidate.blockers[0].clearedBy = ' generic reviewer ';
  candidate.blockers[0].clearedAt = '2026-08-27T00:00:00Z';
  assert.throws(
    () => validateReleaseManifest(candidate, { repositoryRoot: evidenceRepository }),
    /lacks review evidence/u
  );
});

test('ready is accepted only when every gate has clearance evidence', () => {
  const candidate = copy(manifest);
  candidate.releaseStatus = 'ready';
  candidate.blockers = candidate.blockers.map((blocker) => ({
    ...blocker,
    status: 'cleared',
    evidence: [createEvidence(blocker.id)],
    clearedBy: 'independent-release-review',
    clearedAt: '2026-08-27T00:00:00Z',
  }));

  const { openBlockers } = validateReleaseManifest(candidate, {
    repositoryRoot: evidenceRepository,
  });
  assert.deepEqual(openBlockers, []);
});

import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getStorageRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment | null = null;
let storageAvailable = true;

const TENANT_A = 'tenant_eurocorp_de';
const TENANT_B = 'tenant_medtech_fr';
const SAMPLE_PDF = Buffer.from('%PDF-1.4 Mock PDF Content', 'utf8');

beforeAll(async () => {
  try {
    testEnv = await initializeTestEnvironment({
      projectId: 'eurogovernance-storage-test',
      storage: {
        rules: getStorageRules(),
        host: '127.0.0.1',
        port: 9199,
      },
    });
  } catch (err: any) {
    if (err?.message?.includes('ECONNREFUSED') || err?.code === 'ECONNREFUSED') {
      console.warn('Storage emulator not running on port 9199. Skipping storage rules tests.');
      storageAvailable = false;
      return;
    }
    throw err;
  }
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  if (!testEnv || !storageAvailable) {
    return;
  }

  await testEnv.clearStorage();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const storage = context.storage();
    await storage
      .ref(`tenants/${TENANT_A}/evidence/existing_evidence/report.pdf`)
      .put(SAMPLE_PDF, { contentType: 'application/pdf' });
    await storage
      .ref(`tenants/${TENANT_A}/exports/existing_export/dossier.zip`)
      .put(Buffer.from('server-generated export', 'utf8'), { contentType: 'application/zip' });
  });
});

async function assertDirectEvidenceAccessDenied(
  uid: string,
  claims: Record<string, unknown>,
  targetTenantId = TENANT_A
): Promise<void> {
  if (!testEnv || !storageAvailable) {
    return;
  }

  const storage = testEnv.authenticatedContext(uid, claims).storage();
  const existing = storage.ref(`tenants/${targetTenantId}/evidence/existing_evidence/report.pdf`);
  const attempted = storage.ref(`tenants/${targetTenantId}/evidence/attempted_evidence/new.pdf`);

  await assertFails(existing.getDownloadURL());
  await assertFails(Promise.resolve(attempted.put(SAMPLE_PDF, { contentType: 'application/pdf' })));
  await assertFails(existing.updateMetadata({ customMetadata: { tampered: 'true' } }));
  await assertFails(existing.delete());
}

describe('Cloud Storage server-only authorization boundary', () => {
  test.each([
    [
      'active tenant admin with current-looking tenant claims',
      'active_admin_a',
      { tenantId: TENANT_A, tenants: [TENANT_A], role: 'tenant_admin', membershipStatus: 'active' },
    ],
    [
      'active contributor with current-looking tenant claims',
      'active_contributor_a',
      { tenantId: TENANT_A, tenants: [TENANT_A], role: 'contributor', membershipStatus: 'active' },
    ],
    [
      'suspended administrator retaining stale privileged claims',
      'suspended_admin_a',
      { tenantId: TENANT_A, tenants: [TENANT_A], role: 'tenant_admin', membershipStatus: 'suspended' },
    ],
    ['authenticated nonmember without tenant claims', 'authenticated_nonmember', {}],
    [
      'forged tenant administrator claim without tenant binding',
      'forged_admin',
      { role: 'tenant_admin', membershipStatus: 'active' },
    ],
    [
      'client presenting a platform administrator claim',
      'claimed_platform_admin',
      { platform_admin: true },
    ],
  ])('%s cannot directly read, create, update, or delete evidence', async (_label, uid, claims) => {
    await assertDirectEvidenceAccessDenied(uid, claims);
  });

  test('Tenant B administrator cannot access Tenant A and cannot use Tenant A-style claims to delete either tenant', async () => {
    if (!testEnv || !storageAvailable) {
      return;
    }

    const claims = {
      tenantId: TENANT_B,
      tenants: [TENANT_B],
      role: 'tenant_admin',
      membershipStatus: 'active',
    };
    await assertDirectEvidenceAccessDenied('active_admin_b', claims, TENANT_A);

    const storage = testEnv.authenticatedContext('active_admin_b', claims).storage();
    const ownTenantAttempt = storage.ref(`tenants/${TENANT_B}/evidence/attempted_evidence/own.pdf`);
    await assertFails(Promise.resolve(ownTenantAttempt.put(SAMPLE_PDF, { contentType: 'application/pdf' })));
  });

  test.each([
    ['active tenant admin', 'active_admin_a', { tenantId: TENANT_A, tenants: [TENANT_A], role: 'tenant_admin' }],
    ['suspended tenant admin with stale claims', 'suspended_admin_a', { tenantId: TENANT_A, tenants: [TENANT_A], role: 'tenant_admin' }],
    ['Tenant B administrator', 'active_admin_b', { tenantId: TENANT_B, tenants: [TENANT_B], role: 'tenant_admin' }],
    ['authenticated nonmember', 'authenticated_nonmember', {}],
  ])('%s cannot directly read or write export artifacts', async (_label, uid, claims) => {
    if (!testEnv || !storageAvailable) {
      return;
    }

    const storage = testEnv.authenticatedContext(uid, claims).storage();
    const existing = storage.ref(`tenants/${TENANT_A}/exports/existing_export/dossier.zip`);
    const attempted = storage.ref(`tenants/${TENANT_A}/exports/attempted_export/forged.zip`);

    await assertFails(existing.getDownloadURL());
    await assertFails(
      Promise.resolve(attempted.put(Buffer.from('forged export', 'utf8'), { contentType: 'application/zip' }))
    );
    await assertFails(existing.delete());
  });

  test('default deny also blocks authenticated and anonymous clients outside managed artifact paths', async () => {
    if (!testEnv || !storageAvailable) {
      return;
    }

    const authenticated = testEnv.authenticatedContext('active_admin_a', {
      tenantId: TENANT_A,
      tenants: [TENANT_A],
      role: 'tenant_admin',
    }).storage();
    const anonymous = testEnv.unauthenticatedContext().storage();

    await assertFails(
      Promise.resolve(
        authenticated.ref(`tenants/${TENANT_A}/unmanaged/file.txt`).put(Buffer.from('blocked'), {
          contentType: 'text/plain',
        })
      )
    );
    await assertFails(anonymous.ref(`tenants/${TENANT_A}/evidence/existing_evidence/report.pdf`).getDownloadURL());
  });

  test('privileged backend context can still manage evidence and exports', async () => {
    if (!testEnv || !storageAvailable) {
      return;
    }

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const storage = context.storage();
      const evidence = storage.ref(`tenants/${TENANT_A}/evidence/server_evidence/report.pdf`);
      const exportArtifact = storage.ref(`tenants/${TENANT_A}/exports/server_export/dossier.zip`);

      await assertSucceeds(Promise.resolve(evidence.put(SAMPLE_PDF, { contentType: 'application/pdf' })));
      await assertSucceeds(
        Promise.resolve(
          exportArtifact.put(Buffer.from('trusted export', 'utf8'), { contentType: 'application/zip' })
        )
      );
      await assertSucceeds(evidence.delete());
      await assertSucceeds(exportArtifact.delete());
    });
  });
});

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const storageRulesPath = path.resolve(__dirname, '../../storage.rules');
  const storageRules = fs.readFileSync(storageRulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-storage-test',
    storage: {
      rules: storageRules,
      host: '127.0.0.1',
      port: 9199,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearStorage();
});

describe('Cloud Storage Security Rules & Tenant Isolation', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userContribA = 'usr_contrib_01';
  const userAdminB = 'usr_admin_b';

  const samplePdfBytes = Buffer.from('%PDF-1.4 Mock PDF Content', 'utf8');

  // 1. Evidence Storage Isolation & File Uploads
  test('Tenant A user can upload valid evidence to their own tenant path, but not to Tenant B path', async () => {
    const userAContext = testEnv.authenticatedContext(userContribA, {
      tenantId: tenantA,
      tenants: [tenantA],
      role: 'contributor',
    });

    const userBContext = testEnv.authenticatedContext(userAdminB, {
      tenantId: tenantB,
      tenants: [tenantB],
      role: 'tenant_admin',
    });

    const storageA = userAContext.storage();
    const storageB = userBContext.storage();

    // User A uploading to Tenant A path SUCCEEDS
    const validEvidenceRef = storageA.ref(`tenants/${tenantA}/evidence/ev_01/audit_report.pdf`);
    await assertSucceeds(Promise.resolve(validEvidenceRef.put(samplePdfBytes, { contentType: 'application/pdf' })));

    // User A attempting to upload to Tenant B path FAILS (Cross-tenant breach blocked)
    const crossTenantRef = storageA.ref(`tenants/${tenantB}/evidence/ev_foreign/stolen_report.pdf`);
    await assertFails(Promise.resolve(crossTenantRef.put(samplePdfBytes, { contentType: 'application/pdf' })));

    // User B attempting to read Tenant A evidence FAILS
    const foreignReadRef = storageB.ref(`tenants/${tenantA}/evidence/ev_01/audit_report.pdf`);
    await assertFails(foreignReadRef.getDownloadURL());
  });

  // 2. Evidence Immutability on Storage
  test('Direct overwrite of evidence files is strictly blocked', async () => {
    const adminAContext = testEnv.authenticatedContext(userAdminA, {
      tenantId: tenantA,
      tenants: [tenantA],
      role: 'tenant_admin',
    });

    const storage = adminAContext.storage();
    const fileRef = storage.ref(`tenants/${tenantA}/evidence/ev_01/initial_doc.pdf`);

    // Initial upload succeeds
    await assertSucceeds(Promise.resolve(fileRef.put(samplePdfBytes, { contentType: 'application/pdf' })));

    // Direct overwrite attempt is forbidden by rules
    await assertFails(
      Promise.resolve(fileRef.put(Buffer.from('%PDF-1.4 Overwritten file', 'utf8'), { contentType: 'application/pdf' }))
    );
  });

  // 3. Export Artifacts Backend-Only Write Protection
  test('Direct client writes to export directories are completely forbidden', async () => {
    const adminAContext = testEnv.authenticatedContext(userAdminA, {
      tenantId: tenantA,
      tenants: [tenantA],
      role: 'tenant_admin',
    });

    const storage = adminAContext.storage();
    const exportFileRef = storage.ref(`tenants/${tenantA}/exports/exp_01/forged_dossier.zip`);

    // Direct client upload to /exports/ is blocked (Cloud Functions Admin SDK write only)
    await assertFails(
      Promise.resolve(exportFileRef.put(Buffer.from('fake zip content', 'utf8'), { contentType: 'application/zip' }))
    );
  });
});

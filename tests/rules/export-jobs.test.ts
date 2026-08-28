import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

describe('Compliance Export Jobs & Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userAuditorA = 'usr_auditor_01';
  const userContributorA = 'usr_contrib_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const jobIdCompliance = 'job_exp_ropa_01';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant A
      await adminDb.doc(`tenants/${tenantA}`).set({ status: 'active', id: tenantA, name: 'EuroCorp Technologies SE' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userViewerA}`).set({
        userId: userViewerA,
        tenantId: tenantA,
        role: 'viewer',
        status: 'active',
      });

      // Seed Tenant B
      await adminDb.doc(`tenants/${tenantB}`).set({ status: 'active', id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Export Job requested by Compliance Manager
      await adminDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).set({
        id: jobIdCompliance,
        tenantId: tenantA,
        exportType: 'gdpr_ropa_xlsx',
        status: 'completed',
        requestedBy: userComplianceA,
        requestedAt: new Date().toISOString(),
        completedAt: new Date().toISOString(),
        fileStoragePath: `tenants/${tenantA}/exports/${jobIdCompliance}/gdpr_ropa_export.xlsx`,
      });
    });
  });

  // 1. Export Job Request RBAC
  test('export requests are server-only for all browser personas', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Compliance Manager must use the export command boundary.
    await assertFails(
      complianceDb.doc(`tenants/${tenantA}/export_jobs/job_new_comp`).set({
        id: 'job_new_comp',
        tenantId: tenantA,
        exportType: 'framework_readiness_pdf',
        status: 'queued',
        requestedBy: userComplianceA,
      })
    );

    // Auditor export requests must be routed through the authorized backend command
    await assertFails(
      auditorDb.doc(`tenants/${tenantA}/export_jobs/job_new_auditor`).set({
        id: 'job_new_auditor',
        tenantId: tenantA,
        exportType: 'tenant_evidence_package_zip',
        status: 'queued',
        requestedBy: userAuditorA,
      })
    );

    // Contributor & Viewer CANNOT request export jobs
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/export_jobs/job_contrib`).set({
        id: 'job_contrib',
        tenantId: tenantA,
        exportType: 'tenant_evidence_package_zip',
        status: 'queued',
        requestedBy: userContributorA,
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/export_jobs/job_viewer`).set({
        id: 'job_viewer',
        tenantId: tenantA,
        exportType: 'iso_soa_pdf',
        status: 'queued',
        requestedBy: userViewerA,
      })
    );
  });

  // 2. Export Job Update Protection (Backend-Only Status Transitions)
  test('Direct client updates to export jobs are completely forbidden', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();

    // Client attempt to forge completion status is DENIED
    await assertFails(
      complianceDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).update({
        status: 'failed',
      })
    );
  });

  // 3. Export Job Read Permissions (Requester + Admin Only)
  test('Requester and Tenant Admin can view export jobs; other non-admin members cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Requester (Compliance Manager) CAN view
    await assertSucceeds(complianceDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).get());

    // Tenant Admin CAN view
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).get());

    // Auditor & Contributor CANNOT view Compliance Manager's export job
    await assertFails(auditorDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).get());
    await assertFails(contribDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).get());
  });

  test('Non-admin list queries must be owner-scoped when export jobs have mixed requesters', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/export_jobs/job_exp_admin_01`).set({
        id: 'job_exp_admin_01',
        tenantId: tenantA,
        exportType: 'framework_readiness_pdf',
        status: 'completed',
        requestedBy: userAdminA,
      });
    });

    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const jobsPath = `tenants/${tenantA}/export_jobs`;

    // A non-admin collection listener is unsafe because its result set could
    // include another user's export. The UI must use this owner predicate.
    await assertFails(complianceDb.collection(jobsPath).get());
    await assertSucceeds(
      complianceDb.collection(jobsPath).where('requestedBy', '==', userComplianceA).get()
    );
    await assertFails(
      complianceDb.collection(jobsPath).where('requestedBy', '==', userAdminA).get()
    );

    // Tenant administrators are intentionally allowed to inspect the complete
    // export-job queue for operational support and audit preparation.
    await assertSucceeds(adminDb.collection(jobsPath).get());
  });

  // 4. Cross-Tenant Denial
  test('User from Tenant B cannot view or request export jobs in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/export_jobs/${jobIdCompliance}`).get());

    await assertFails(
      outsiderDb.doc(`tenants/${tenantA}/export_jobs/job_cross_tenant`).set({
        id: 'job_cross_tenant',
        tenantId: tenantA,
        exportType: 'gdpr_ropa_xlsx',
        status: 'queued',
        requestedBy: userAdminB,
      })
    );
  });
});

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

describe('Evidence Repository Security Rules & Immutability Test Suite', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const evidenceId = 'ev_ropa_signoff_2026';

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
      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
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

      // Seed Existing Evidence Record in Tenant A
      await adminDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).set({
        id: evidenceId,
        tenantId: tenantA,
        title: 'Article 30 Sign-off',
        category: 'assessment_doc',
        status: 'under_review',
        currentVersion: 1,
        storagePath: `tenants/${tenantA}/evidence/${evidenceId}/ropa_signoff.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: 'a1b2c3d4e5f6',
        createdAt: new Date().toISOString(),
        createdBy: userComplianceA,
      });

      // Seed Initial Version Record
      await adminDb.doc(`tenants/${tenantA}/evidence/${evidenceId}/versions/v1`).set({
        id: 'v1',
        tenantId: tenantA,
        evidenceId,
        versionNumber: 1,
        storagePath: `tenants/${tenantA}/evidence/${evidenceId}/ropa_signoff.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: 'a1b2c3d4e5f6',
        changeSummary: 'Initial upload',
        uploadedBy: userComplianceA,
        uploadedAt: new Date().toISOString(),
      });
    });
  });

  // 1. Server-only creation of Evidence & Versions
  test('Direct clients cannot create evidence metadata or append versions', async () => {
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Contributor creates evidence
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/evidence/ev_pen_test`).set({
        id: 'ev_pen_test',
        tenantId: tenantA,
        title: 'Q1 Penetration Test Report',
        status: 'under_review',
        createdAt: new Date().toISOString(),
        createdBy: userContributorA,
      })
    );

    // Contributor appends version v2
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/evidence/${evidenceId}/versions/v2`).set({
        id: 'v2',
        tenantId: tenantA,
        evidenceId,
        versionNumber: 2,
        storagePath: `tenants/${tenantA}/evidence/${evidenceId}/ropa_v2.pdf`,
        uploadedBy: userContributorA,
        uploadedAt: new Date().toISOString(),
      })
    );
  });

  // 2. Forbidden Direct Self-Approval
  test('Direct client update cannot change status from under_review to valid (Four-Eyes bypass prevention)', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();

    const evidenceRefCompliance = complianceDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`);
    const evidenceRefAdmin = adminDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`);

    // Direct self-approval via client update MUST fail
    await assertFails(
      evidenceRefCompliance.update({
        status: 'valid',
        reviewedBy: userComplianceA,
      })
    );

    // Even admin cannot mutate status directly from client SDK (must call approveEvidence Cloud Function)
    await assertFails(
      evidenceRefAdmin.update({
        status: 'valid',
        reviewedBy: userAdminA,
      })
    );
  });

  // 3. Forbidden Direct Overwrite of Versions (Version Immutability)
  test('Existing evidence version documents are immutable and cannot be updated', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const versionRef = adminDb.doc(`tenants/${tenantA}/evidence/${evidenceId}/versions/v1`);

    // Tampering with existing version record is strictly denied
    await assertFails(
      versionRef.update({
        fileHashSha256: 'tampered_hash_value',
      })
    );
  });

  // 4. Metadata Visibility by Tenant Membership
  test('All tenant members can read evidence metadata; outsider receives PERMISSION_DENIED', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'viewer@eurocorp.de' }).firestore();
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    // Auditor and Viewer in Tenant A can read
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/evidence/${evidenceId}/versions/v1`).get());

    // Outsider cannot read Tenant A evidence metadata
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/evidence/${evidenceId}/versions/v1`).get());
  });

  // 5. Forbidden Cross-Tenant Upload
  test('User from Tenant B cannot create or upload evidence records to Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(
      outsiderDb.doc(`tenants/${tenantA}/evidence/ev_cross_attack`).set({
        id: 'ev_cross_attack',
        tenantId: tenantA,
        title: 'Cross Tenant Injection',
        status: 'under_review',
      })
    );
  });

  // 6. Evidence lifecycle is server-only for every tenant role
  test('Contributor and tenant admin cannot mutate or delete evidence directly', async () => {
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();

    // Contributor attempt to reject evidence via direct client update is denied
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).update({
        status: 'rejected',
        rejectionReason: 'Unauthorized contributor rejection',
      })
    );

    // Contributor attempt to delete evidence is denied
    await assertFails(contribDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).delete());

    // Tenant Admin must use a future retention-aware server workflow.
    await assertFails(adminDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).delete());
  });
});

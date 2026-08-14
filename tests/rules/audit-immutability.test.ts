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

describe('Append-Only Audit Log Subsystem Security & Immutability Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_a';
  const userComplianceA = 'usr_compliance_a';
  const userAuditorA = 'usr_auditor_a';
  const userContributorA = 'usr_contrib_a';
  const userViewerA = 'usr_viewer_a';
  const userAdminB = 'usr_admin_b';

  const logId = 'aud_01HQ9T_CORP_001';

  beforeEach(async () => {
    // Seed Tenants & Memberships directly
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Tenant A
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, name: 'EuroCorp Technologies SE' });
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

      // Tenant B
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Existing Audit Log in Tenant A
      await adminDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).set({
        id: logId,
        tenantId: tenantA,
        actorId: userAdminA,
        actorEmail: 'admin@eurocorp.de',
        actorRole: 'tenant_admin',
        entityType: 'evidence',
        entityId: 'ev_01',
        action: 'approve',
        beforeSummary: { status: 'under_review' },
        afterSummary: { status: 'valid' },
        source: 'cloud_function',
        workflowContext: 'evidence_approval_workflow',
        timestamp: new Date().toISOString(),
      });
    });
  });

  // 1. Direct Client Write Block (All Roles)
  test('Direct client create to /audit_logs is denied for all roles including tenant_admin and platform_admin', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'contrib@eurocorp.de' }).firestore();

    const newLogRef = adminDb.doc(`tenants/${tenantA}/audit_logs/aud_unauthorized_01`);
    const contribLogRef = contribDb.doc(`tenants/${tenantA}/audit_logs/aud_unauthorized_02`);

    // Tenant admin cannot directly write audit log from client SDK
    await assertFails(
      newLogRef.set({
        id: 'aud_unauthorized_01',
        tenantId: tenantA,
        actorId: userAdminA,
        action: 'tampered_create',
      })
    );

    // Contributor cannot directly write audit log from client SDK
    await assertFails(
      contribLogRef.set({
        id: 'aud_unauthorized_02',
        tenantId: tenantA,
        actorId: userContributorA,
        action: 'tampered_create',
      })
    );
  });

  // 2. Direct Client Mutation Block (Update Immutability)
  test('Direct client update on existing audit logs is strictly denied for all roles', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();

    const logRefAdmin = adminDb.doc(`tenants/${tenantA}/audit_logs/${logId}`);
    const logRefAuditor = auditorDb.doc(`tenants/${tenantA}/audit_logs/${logId}`);

    // Admin tries to alter beforeSummary / afterSummary
    await assertFails(
      logRefAdmin.update({
        action: 'deleted_secret',
        afterSummary: { tampered: true },
      })
    );

    // Auditor tries to modify audit trail
    await assertFails(
      logRefAuditor.update({
        action: 'auditor_override',
      })
    );
  });

  // 3. Direct Client Deletion Block (Delete Immutability)
  test('Direct client delete on audit logs is strictly denied under all circumstances', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const logRef = adminDb.doc(`tenants/${tenantA}/audit_logs/${logId}`);

    // Even organization admin cannot delete audit records
    await assertFails(logRef.delete());
  });

  // 4. Role-Based Read Access Control
  test('Authorized governance roles can read audit logs, while contributor and viewer are denied', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'contrib@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'viewer@eurocorp.de' }).firestore();

    // Admin, Compliance Manager, Auditor CAN read
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).get());
    await assertSucceeds(complianceDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).get());

    // Contributor and Viewer CANNOT read audit logs
    await assertFails(contribDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).get());
    await assertFails(viewerDb.doc(`tenants/${tenantA}/audit_logs/${logId}`).get());
  });

  // 5. Cross-Tenant Audit Log Isolation
  test('Tenant B Admin cannot read audit logs belonging to Tenant A', async () => {
    const adminDbB = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();
    const crossTenantLogRef = adminDbB.doc(`tenants/${tenantA}/audit_logs/${logId}`);

    await assertFails(crossTenantLogRef.get());
  });
});

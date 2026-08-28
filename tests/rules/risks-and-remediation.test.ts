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

describe('Risk Register, Issues & Remediation Tasks Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userSecurityA = 'usr_security_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const riskId = 'rsk_data_breach_01';
  const issueId = 'iss_unencrypted_backup_01';
  const taskId = 'tsk_enable_kms_01';

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
      await adminDb.doc(`tenants/${tenantA}/memberships/${userSecurityA}`).set({
        userId: userSecurityA,
        tenantId: tenantA,
        role: 'security_manager',
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

      // Seed Existing Risk in Tenant A
      await adminDb.doc(`tenants/${tenantA}/risks/${riskId}`).set({
        id: riskId,
        tenantId: tenantA,
        code: 'RSK-SEC-01',
        title: 'Unauthorized Cloud Storage Exposure',
        category: 'security',
        status: 'assessed',
        inherentLikelihood: 4,
        inherentImpact: 4,
        inherentScore: 16,
        residualScore: 8,
        treatmentStrategy: 'mitigate',
      });

      // Seed Existing Issue in Tenant A
      await adminDb.doc(`tenants/${tenantA}/issues/${issueId}`).set({
        id: issueId,
        tenantId: tenantA,
        code: 'ISS-01',
        title: 'Unencrypted S3 Backup Bucket',
        severity: 'high',
        status: 'open',
        source: 'audit',
        sourceEntityType: 'risk',
        sourceEntityId: riskId,
      });

      // Seed Existing Task in Tenant A
      await adminDb.doc(`tenants/${tenantA}/tasks/${taskId}`).set({
        id: taskId,
        tenantId: tenantA,
        title: 'Enforce Cloud KMS Encryption on Backup Bucket',
        status: 'todo',
        parentEntityType: 'issue',
        parentEntityId: issueId,
        assigneeId: userContributorA,
      });
    });
  });

  // 1. Risks Create & Update Permissions
  test('risk creation and updates require server commands for every browser persona', async () => {
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();

    // Security Manager direct risk mutations are denied.
    await assertFails(
      securityDb.doc(`tenants/${tenantA}/risks/rsk_new_sec`).set({
        id: 'rsk_new_sec',
        tenantId: tenantA,
        code: 'RSK-AI-01',
        title: 'AI Model Drift Bias Risk',
        category: 'ai_bias',
        status: 'identified',
      })
    );

    await assertFails(
      securityDb.doc(`tenants/${tenantA}/risks/${riskId}`).update({
        residualScore: 4,
      })
    );

    // Contributor & Auditor CANNOT create or update risk
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/risks/rsk_new_contrib`).set({
        id: 'rsk_new_contrib',
        tenantId: tenantA,
        code: 'RSK-DEV-01',
        title: 'Dev Risk',
      })
    );

    await assertFails(
      auditorDb.doc(`tenants/${tenantA}/risks/${riskId}`).update({
        residualScore: 2,
      })
    );
  });

  // 2. Issues & Tasks Non-Read-Only Roles
  test('issue and task mutations require server commands for contributors and read-only roles', async () => {
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Contributor issue and task mutations require server commands.
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/issues/iss_dev_01`).set({
        id: 'iss_dev_01',
        tenantId: tenantA,
        code: 'ISS-02',
        title: 'Dependency Vulnerability in lodash',
        severity: 'medium',
        status: 'open',
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/tasks/${taskId}`).update({
        status: 'in_progress',
      })
    );

    // Auditor & Viewer CANNOT create or update issues/tasks
    await assertFails(
      auditorDb.doc(`tenants/${tenantA}/tasks/${taskId}`).update({
        status: 'completed',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/issues/iss_view_01`).set({
        id: 'iss_view_01',
        tenantId: tenantA,
        title: 'Viewer Issue',
      })
    );
  });

  // 3. Read Permissions Across Tenant Members
  test('All active tenant members can read risks, issues, and tasks', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/risks/${riskId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/issues/${issueId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/tasks/${taskId}`).get());

    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/risks/${riskId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/issues/${issueId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/tasks/${taskId}`).get());
  });

  // 4. Deletion Restrictions
  test('risks, issues, and tasks cannot be deleted directly even by Tenant Admin', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();

    // Security Manager cannot delete
    await assertFails(securityDb.doc(`tenants/${tenantA}/risks/${riskId}`).delete());
    await assertFails(securityDb.doc(`tenants/${tenantA}/issues/${issueId}`).delete());
    await assertFails(securityDb.doc(`tenants/${tenantA}/tasks/${taskId}`).delete());

    // Tenant Admin direct deletion is denied.
    await assertFails(adminDb.doc(`tenants/${tenantA}/risks/${riskId}`).delete());
    await assertFails(adminDb.doc(`tenants/${tenantA}/issues/${issueId}`).delete());
    await assertFails(adminDb.doc(`tenants/${tenantA}/tasks/${taskId}`).delete());
  });

  // 5. Cross-Tenant Access Denial
  test('User from Tenant B cannot read or mutate risks, issues, or tasks in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/risks/${riskId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/issues/${issueId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/tasks/${taskId}`).get());

    await assertFails(
      outsiderDb.doc(`tenants/${tenantA}/risks/${riskId}`).update({
        title: 'Tampered Risk Title',
      })
    );
  });
});

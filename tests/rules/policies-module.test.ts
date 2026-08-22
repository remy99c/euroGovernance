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

describe('Policies Module Security Rules & RBAC Permissions', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userPrivacyA = 'usr_privacy_01';
  const userSecurityA = 'usr_security_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const policyId = 'pol_info_sec_01';

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
      await adminDb.doc(`tenants/${tenantA}/memberships/${userPrivacyA}`).set({
        userId: userPrivacyA,
        tenantId: tenantA,
        role: 'privacy_manager',
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

      // Seed Existing Policy in Tenant A
      await adminDb.doc(`tenants/${tenantA}/policies/${policyId}`).set({
        id: policyId,
        tenantId: tenantA,
        code: 'POL-SEC-01',
        title: 'Information Security & Access Control Policy',
        version: '1.0',
        summary: 'Defines mandatory MFA, least privilege, and quarterly access review requirements.',
        scope: 'All employees, contractors, and cloud infrastructure.',
        status: 'active',
        ownerId: userSecurityA,
        createdAt: new Date().toISOString(),
        createdBy: userSecurityA,
      });
    });
  });

  // 1. Create Policy RBAC
  test('Compliance, Privacy, and Security Managers can create policies; Contributors and Viewers cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Compliance & Privacy Managers CAN create
    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantA}/policies/pol_ai_ethics`).set({
        id: 'pol_ai_ethics',
        tenantId: tenantA,
        code: 'POL-AI-01',
        title: 'AI Transparency & Governance Policy',
        version: '1.0',
        status: 'draft',
      })
    );

    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/policies/pol_data_retention`).set({
        id: 'pol_data_retention',
        tenantId: tenantA,
        code: 'POL-PRIV-02',
        title: 'Data Retention & Erasure Policy',
        version: '1.0',
        status: 'draft',
      })
    );

    // Contributor & Viewer CANNOT create
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/policies/pol_contrib_unauth`).set({
        id: 'pol_contrib_unauth',
        tenantId: tenantA,
        code: 'POL-DEV-01',
        title: 'Unauthorized Dev Policy',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/policies/pol_viewer_unauth`).set({
        id: 'pol_viewer_unauth',
        tenantId: tenantA,
        code: 'POL-VIEW-01',
        title: 'Unauthorized Viewer Policy',
      })
    );
  });

  // 2. Read Policy Permissions
  test('All tenant members can read policies; outsider receives PERMISSION_DENIED', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/policies/${policyId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/policies/${policyId}`).get());

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/policies/${policyId}`).get());
  });

  // 3. Update Policy Permissions
  test('Security Manager can update policy content; Read-only Auditor and Viewer cannot', async () => {
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Security Manager CAN update
    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/policies/${policyId}`).update({
        version: '1.1',
        summary: 'Updated with FIDO2 WebAuthn mandatory requirements',
      })
    );

    // Auditor and Viewer CANNOT update
    await assertFails(
      auditorDb.doc(`tenants/${tenantA}/policies/${policyId}`).update({
        summary: 'Auditor attempt to edit policy',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/policies/${policyId}`).update({
        summary: 'Viewer attempt to edit policy',
      })
    );
  });

  // 4. Delete Policy Restriction
  test('Only Tenant Admin can delete policies; Compliance Manager cannot', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();

    // Compliance manager CANNOT delete
    await assertFails(complianceDb.doc(`tenants/${tenantA}/policies/${policyId}`).delete());

    // Tenant Admin CAN delete
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/policies/${policyId}`).delete());
  });

  // 5. Cross-Tenant Policy Isolation
  test('User from Tenant B cannot modify policies in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(
      outsiderDb.doc(`tenants/${tenantA}/policies/${policyId}`).update({
        title: 'Cross Tenant Tampering Attempt',
      })
    );
  });
});

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

describe('Controls Module Security Rules & RBAC Permissions', () => {
  const tenantOrg = 'tenant_eurocorp_de';
  const outsiderOrg = 'tenant_medtech_fr';

  const userAdmin = 'usr_admin_01';
  const userCompliance = 'usr_compliance_01';
  const userSecurity = 'usr_security_01';
  const userContributor = 'usr_contrib_01';
  const userAuditor = 'usr_auditor_01';
  const userViewer = 'usr_viewer_01';
  const userOutsider = 'usr_outsider_01';

  const controlId = 'ctl_ropa_01';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant
      await adminDb.doc(`tenants/${tenantOrg}`).set({ id: tenantOrg, name: 'EuroCorp Technologies SE' });

      // Seed Memberships
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userAdmin}`).set({
        userId: userAdmin,
        tenantId: tenantOrg,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userCompliance}`).set({
        userId: userCompliance,
        tenantId: tenantOrg,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userSecurity}`).set({
        userId: userSecurity,
        tenantId: tenantOrg,
        role: 'security_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userContributor}`).set({
        userId: userContributor,
        tenantId: tenantOrg,
        role: 'contributor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userAuditor}`).set({
        userId: userAuditor,
        tenantId: tenantOrg,
        role: 'auditor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantOrg}/memberships/${userViewer}`).set({
        userId: userViewer,
        tenantId: tenantOrg,
        role: 'viewer',
        status: 'active',
      });

      // Seed Existing Control
      await adminDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).set({
        id: controlId,
        tenantId: tenantOrg,
        code: 'CTL-PRIV-01',
        title: 'Article 30 Processing Activity Register',
        domain: 'privacy',
        status: 'in_progress',
        healthScore: 50,
        ownerId: userCompliance,
        frameworkIds: ['gdpr'],
      });
    });
  });

  // 1. Create Control RBAC Permissions
  test('Compliance and Security Managers can create controls; Contributors, Viewers, and Outsiders cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userCompliance, { email: 'comp@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurity, { email: 'sec@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributor, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewer, { email: 'view@eurocorp.de' }).firestore();
    const outsiderDb = testEnv.authenticatedContext(userOutsider, { email: 'out@medtech.fr' }).firestore();

    // Compliance & Security Managers CAN create
    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantOrg}/controls/ctl_new_comp`).set({
        id: 'ctl_new_comp',
        tenantId: tenantOrg,
        code: 'CTL-NEW-01',
        title: 'New Compliance Control',
      })
    );

    await assertSucceeds(
      securityDb.doc(`tenants/${tenantOrg}/controls/ctl_new_sec`).set({
        id: 'ctl_new_sec',
        tenantId: tenantOrg,
        code: 'CTL-NEW-02',
        title: 'New Security Control',
      })
    );

    // Contributor, Viewer, Outsider CANNOT create
    await assertFails(
      contribDb.doc(`tenants/${tenantOrg}/controls/ctl_new_contrib`).set({
        id: 'ctl_new_contrib',
        tenantId: tenantOrg,
        code: 'CTL-NEW-03',
        title: 'Unauthorized Contributor Control',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantOrg}/controls/ctl_new_view`).set({
        id: 'ctl_new_view',
        tenantId: tenantOrg,
        code: 'CTL-NEW-04',
        title: 'Unauthorized Viewer Control',
      })
    );

    await assertFails(
      outsiderDb.doc(`tenants/${tenantOrg}/controls/ctl_new_out`).set({
        id: 'ctl_new_out',
        tenantId: tenantOrg,
        code: 'CTL-NEW-05',
        title: 'Unauthorized Outsider Control',
      })
    );
  });

  // 2. Read Permissions
  test('All active tenant members can read controls; outsiders cannot', async () => {
    const adminDb = testEnv.authenticatedContext(userAdmin, { email: 'admin@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditor, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewer, { email: 'view@eurocorp.de' }).firestore();
    const outsiderDb = testEnv.authenticatedContext(userOutsider, { email: 'out@medtech.fr' }).firestore();

    await assertSucceeds(adminDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).get());

    await assertFails(outsiderDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).get());
  });

  // 3. Update Permissions
  test('Contributors can update controls; Read-only Auditors and Viewers cannot', async () => {
    const contribDb = testEnv.authenticatedContext(userContributor, { email: 'dev@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditor, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewer, { email: 'view@eurocorp.de' }).firestore();

    // Contributor CAN update implementation details
    await assertSucceeds(
      contribDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).update({
        implementationNotes: 'Updated by engineering team with Jenkins pipeline link',
      })
    );

    // Auditor & Viewer CANNOT update
    await assertFails(
      auditorDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).update({
        implementationNotes: 'Auditor attempt to edit control',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).update({
        implementationNotes: 'Viewer attempt to edit control',
      })
    );
  });

  // 4. Delete Permissions
  test('Only Tenant Admin can delete controls; Compliance Managers and Contributors cannot', async () => {
    const adminDb = testEnv.authenticatedContext(userAdmin, { email: 'admin@eurocorp.de' }).firestore();
    const complianceDb = testEnv.authenticatedContext(userCompliance, { email: 'comp@eurocorp.de' }).firestore();

    // Compliance manager CANNOT delete
    await assertFails(complianceDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).delete());

    // Tenant admin CAN delete
    await assertSucceeds(adminDb.doc(`tenants/${tenantOrg}/controls/${controlId}`).delete());
  });

  // 5. Control Review Subcollection Permissions
  test('Auditors and Compliance Managers can submit review logs; reviews are append-only', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditor, { email: 'auditor@kpmg.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributor, { email: 'dev@eurocorp.de' }).firestore();

    const reviewRef = auditorDb.doc(`tenants/${tenantOrg}/controls/${controlId}/reviews/rev_01`);

    // Auditor CAN create review log
    await assertSucceeds(
      reviewRef.set({
        id: 'rev_01',
        tenantId: tenantOrg,
        controlId,
        status: 'approved',
        reviewerId: userAuditor,
        effectiveness: 'effective',
        notes: 'Verified processing register completeness according to Art. 30(1)(a)-(g).',
        reviewedAt: new Date().toISOString(),
      })
    );

    // Contributor CANNOT create review log
    await assertFails(
      contribDb.doc(`tenants/${tenantOrg}/controls/${controlId}/reviews/rev_02`).set({
        id: 'rev_02',
        tenantId: tenantOrg,
        controlId,
        status: 'approved',
        reviewerId: userContributor,
        effectiveness: 'effective',
        notes: 'Contributor self-review attempt',
      })
    );

    // Review logs are append-only: Update and Delete are denied
    await assertFails(reviewRef.update({ notes: 'Tampered review' }));
    await assertFails(reviewRef.delete());
  });

  // 6. Cross-Tenant Control Isolation
  test('User from outsider organization cannot read controls in Tenant A', async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();
      await adminDb.doc(`tenants/${outsiderOrg}`).set({ id: outsiderOrg, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${outsiderOrg}/memberships/${userOutsider}`).set({
        userId: userOutsider,
        tenantId: outsiderOrg,
        role: 'tenant_admin',
        status: 'active',
      });
    });

    const outsiderDb = testEnv.authenticatedContext(userOutsider, { email: 'out@medtech.fr' }).firestore();
    const crossTenantRef = outsiderDb.doc(`tenants/${tenantOrg}/controls/${controlId}`);

    await assertFails(crossTenantRef.get());
  });
});

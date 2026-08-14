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
  const rulesPath = path.resolve(__dirname, '../../firestore.rules');
  const rules = fs.readFileSync(rulesPath, 'utf8');

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

describe('ISO 27001 & ISO 42001 Management Layer Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userSecurityA = 'usr_security_01';
  const userComplianceA = 'usr_compliance_01';
  const userApproverA = 'usr_approver_01';
  const userAuditorA = 'usr_auditor_01';
  const userContributorA = 'usr_contrib_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const scopeId = 'scp_isms_global';
  const objId = 'obj_mfa_coverage';
  const soaId = 'soa_a_9_1';
  const auditId = 'adt_q1_surveillance';
  const findingId = 'fnd_01_access_review';
  const reviewId = 'mgt_rev_2026_h1';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant A
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, name: 'EuroCorp Technologies SE' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userSecurityA}`).set({
        userId: userSecurityA,
        tenantId: tenantA,
        role: 'security_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userApproverA}`).set({
        userId: userApproverA,
        tenantId: tenantA,
        role: 'approver',
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
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Existing ISO records in Tenant A
      await adminDb.doc(`tenants/${tenantA}/iso_scope_statements/${scopeId}`).set({
        id: scopeId,
        tenantId: tenantA,
        frameworkType: 'iso_27001',
        title: 'Global ISMS Scope Statement 2026',
        scopeBoundaries: 'All production cloud infrastructure and EU operations.',
      });

      await adminDb.doc(`tenants/${tenantA}/iso_objectives/${objId}`).set({
        id: objId,
        tenantId: tenantA,
        frameworkType: 'iso_27001',
        title: '100% MFA Enforcement Across Production',
        targetValue: '100%',
        status: 'in_progress',
      });

      await adminDb.doc(`tenants/${tenantA}/iso_soa_entries/${soaId}`).set({
        id: soaId,
        tenantId: tenantA,
        frameworkType: 'iso_27001',
        controlCode: 'A.9.1',
        controlTitle: 'Business Requirements of Access Control',
        isApplicable: true,
        justification: 'Core security safeguard requirement.',
      });

      await adminDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}`).set({
        id: auditId,
        tenantId: tenantA,
        frameworkType: 'iso_27001',
        auditPlanTitle: 'Q1 2026 Internal Information Security Audit',
        status: 'scheduled',
        leadAuditorName: 'Thomas Schmidt',
      });

      await adminDb
        .doc(`tenants/${tenantA}/iso_internal_audits/${auditId}/findings/${findingId}`)
        .set({
          id: findingId,
          tenantId: tenantA,
          auditId,
          frameworkType: 'iso_27001',
          findingType: 'minor_nonconformity',
          clauseReference: 'A.9.2.6',
          description: 'Delayed de-provisioning of departed contractor accounts',
          status: 'open',
        });

      await adminDb.doc(`tenants/${tenantA}/iso_management_reviews/${reviewId}`).set({
        id: reviewId,
        tenantId: tenantA,
        frameworkType: 'iso_27001',
        reviewPeriodStart: '2026-01-01',
        reviewPeriodEnd: '2026-06-30',
        meetingDate: '2026-07-05',
        keyDecisionsAndActionItems: 'Approved ISMS budget expansion for ISO 42001 certification.',
      });
    });
  });

  // 1. Scopes, Objectives, and SoA RBAC
  test('Security Manager can manage scopes, objectives, and SoA; Contributors cannot', async () => {
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Security Manager CAN create/update
    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/iso_objectives/obj_ai_safety`).set({
        id: 'obj_ai_safety',
        tenantId: tenantA,
        frameworkType: 'iso_42001',
        title: 'Zero High-Risk AI Bias Drift Incidents',
        targetValue: '0',
        status: 'planned',
      })
    );

    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/iso_soa_entries/${soaId}`).update({
        justification: 'Updated with WebAuthn technical requirement',
      })
    );

    // Contributor CANNOT create/update
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/iso_objectives/obj_contrib`).set({
        id: 'obj_contrib',
        tenantId: tenantA,
        title: 'Dev Objective',
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/iso_soa_entries/${soaId}`).update({
        isApplicable: false,
      })
    );
  });

  // 2. Internal Audits & Findings RBAC
  test('Auditors and Compliance Managers can log audits and findings; Viewers cannot', async () => {
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Auditor CAN create internal audit and log finding
    await assertSucceeds(
      auditorDb.doc(`tenants/${tenantA}/iso_internal_audits/adt_q2`).set({
        id: 'adt_q2',
        tenantId: tenantA,
        frameworkType: 'iso_42001',
        auditPlanTitle: 'Q2 2026 AIMS Model Governance Audit',
        status: 'scheduled',
      })
    );

    await assertSucceeds(
      auditorDb
        .doc(`tenants/${tenantA}/iso_internal_audits/${auditId}/findings/fnd_02`)
        .set({
          id: 'fnd_02',
          tenantId: tenantA,
          auditId,
          frameworkType: 'iso_27001',
          findingType: 'observation',
          clauseReference: 'A.12.1.2',
          description: 'Change management ticket documentation missing secondary review timestamp',
          status: 'open',
        })
    );

    // Viewer CANNOT create audit or finding
    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/iso_internal_audits/adt_view`).set({
        id: 'adt_view',
        tenantId: tenantA,
        title: 'Viewer Audit',
      })
    );
  });

  // 3. Management Reviews RBAC
  test('Approvers and Compliance Managers can create management reviews; Auditors and Contributors cannot', async () => {
    const approverDb = testEnv.authenticatedContext(userApproverA, { email: 'exec@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Approver CAN create review
    await assertSucceeds(
      approverDb.doc(`tenants/${tenantA}/iso_management_reviews/mgt_rev_q3`).set({
        id: 'mgt_rev_q3',
        tenantId: tenantA,
        frameworkType: 'integrated_isms_aims',
        reviewPeriodStart: '2026-07-01',
        reviewPeriodEnd: '2026-09-30',
        meetingDate: '2026-10-04',
        keyDecisionsAndActionItems: 'Approved Q3 ISMS & AIMS status report.',
      })
    );

    // Auditor and Contributor CANNOT create management reviews
    await assertFails(
      auditorDb.doc(`tenants/${tenantA}/iso_management_reviews/mgt_rev_auditor`).set({
        id: 'mgt_rev_auditor',
        tenantId: tenantA,
        meetingDate: '2026-10-04',
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/iso_management_reviews/mgt_rev_contrib`).set({
        id: 'mgt_rev_contrib',
        tenantId: tenantA,
      })
    );
  });

  // 4. Read Permissions Across Tenant Members
  test('All active tenant members can read ISO management records', async () => {
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/iso_scope_statements/${scopeId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/iso_objectives/${objId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/iso_soa_entries/${soaId}`).get());
    await assertSucceeds(viewerDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}`).get());
    await assertSucceeds(
      viewerDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}/findings/${findingId}`).get()
    );
    await assertSucceeds(contribDb.doc(`tenants/${tenantA}/iso_management_reviews/${reviewId}`).get());
  });

  // 5. Deletion Restriction Across ISO Collections
  test('Only Tenant Admin can delete ISO management records', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();

    // Security Manager cannot delete
    await assertFails(securityDb.doc(`tenants/${tenantA}/iso_scope_statements/${scopeId}`).delete());
    await assertFails(securityDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}`).delete());

    // Tenant Admin CAN delete
    await assertSucceeds(
      adminDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}/findings/${findingId}`).delete()
    );
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/iso_scope_statements/${scopeId}`).delete());
  });

  // 6. Cross-Tenant Denial
  test('User from Tenant B cannot access or modify ISO records in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/iso_scope_statements/${scopeId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/iso_internal_audits/${auditId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/iso_management_reviews/${reviewId}`).get());
  });
});

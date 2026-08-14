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

describe('GDPR Workflows & Privacy Subsystem Security Rules', () => {
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

  const ropaId = 'ropa_user_auth';
  const dpiaId = 'dpia_scoring_01';
  const tiaId = 'tia_aws_us';
  const dsrId = 'dsr_erasure_01';
  const breachId = 'brc_2026_001';

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
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Existing ROPA Entry in Tenant A
      await adminDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).set({
        id: ropaId,
        tenantId: tenantA,
        activityCode: 'ROPA-01',
        activityName: 'User Authentication Register',
        purpose: 'Identity & Access Management',
        legalBasis: 'contractual_necessity',
        status: 'active',
      });

      // Seed Existing DPIA Assessment
      await adminDb.doc(`tenants/${tenantA}/dpia_assessments/${dpiaId}`).set({
        id: dpiaId,
        tenantId: tenantA,
        code: 'DPIA-01',
        title: 'Credit Scoring Algorithm Impact Assessment',
        ropaEntryId: ropaId,
        status: 'in_review',
      });

      // Seed Existing TIA Assessment
      await adminDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).set({
        id: tiaId,
        tenantId: tenantA,
        code: 'TIA-01',
        title: 'AWS US Telemetry Transfer Assessment',
        vendorId: 'vnd_aws',
        destinationCountry: 'US',
        status: 'in_review',
      });

      // Seed Existing DSR Request
      await adminDb.doc(`tenants/${tenantA}/dsr_requests/${dsrId}`).set({
        id: dsrId,
        tenantId: tenantA,
        ticketNumber: 'DSR-001',
        requestType: 'erasure',
        status: 'received',
        requesterEmailMasked: 'j***@example.com',
      });

      // Seed Existing Breach Incident
      await adminDb.doc(`tenants/${tenantA}/breaches/${breachId}`).set({
        id: breachId,
        tenantId: tenantA,
        incidentReference: 'BRC-2026-001',
        title: 'Unauthorized S3 Bucket Access',
        severity: 'high',
        status: 'investigating',
        natureOfBreach: 'confidentiality',
      });
    });
  });

  // 1. ROPA Entries RBAC
  test('Privacy Manager can create and update ROPA entries; Contributors and Viewers cannot', async () => {
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();

    // Privacy Manager CAN create and update ROPA
    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/ropa_entries/ropa_payroll`).set({
        id: 'ropa_payroll',
        tenantId: tenantA,
        activityCode: 'ROPA-02',
        activityName: 'Employee Payroll Processing',
        purpose: 'Compensation & Tax',
        legalBasis: 'legal_obligation',
        status: 'active',
      })
    );

    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).update({
        purpose: 'Updated Authentication and Audit Logging',
      })
    );

    // Contributor & Viewer CANNOT create or update ROPA
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/ropa_entries/ropa_contrib`).set({
        id: 'ropa_contrib',
        tenantId: tenantA,
        activityCode: 'ROPA-03',
        activityName: 'Dev ROPA',
      })
    );

    await assertFails(
      viewerDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).update({
        purpose: 'Viewer Tampering',
      })
    );
  });

  // 2. DPIA and TIA Assessments RBAC
  test('Compliance and Privacy Managers can manage DPIAs and TIAs; Contributors cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // Compliance Manager CAN create DPIA & TIA
    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_new`).set({
        id: 'dpia_new',
        tenantId: tenantA,
        code: 'DPIA-02',
        title: 'Biometric Access DPIA',
        ropaEntryId: ropaId,
        status: 'draft',
      })
    );

    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantA}/tia_assessments/tia_new`).set({
        id: 'tia_new',
        tenantId: tenantA,
        code: 'TIA-02',
        title: 'OpenAI US Transfer Assessment',
        vendorId: 'vnd_openai',
        destinationCountry: 'US',
        status: 'draft',
      })
    );

    // Contributor CANNOT create DPIA or TIA
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_contrib`).set({
        id: 'dpia_contrib',
        tenantId: tenantA,
        code: 'DPIA-03',
        title: 'Dev DPIA',
      })
    );
  });

  // 3. DSR Requests Management RBAC
  test('Privacy Manager can manage DSR requests; Contributors cannot', async () => {
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/dsr_requests/dsr_access_01`).set({
        id: 'dsr_access_01',
        tenantId: tenantA,
        ticketNumber: 'DSR-002',
        requestType: 'access',
        status: 'received',
      })
    );

    await assertSucceeds(
      privacyDb.doc(`tenants/${tenantA}/dsr_requests/${dsrId}`).update({
        status: 'in_progress',
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/dsr_requests/dsr_contrib`).set({
        id: 'dsr_contrib',
        tenantId: tenantA,
        ticketNumber: 'DSR-003',
        requestType: 'rectification',
      })
    );
  });

  // 4. Personal Data Breach Confidentiality & RBAC
  test('Security & Privacy Managers can log breaches; Contributors & Viewers cannot read breach records', async () => {
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();
    const viewerDb = testEnv.authenticatedContext(userViewerA, { email: 'view@eurocorp.de' }).firestore();
    const auditorDb = testEnv.authenticatedContext(userAuditorA, { email: 'auditor@kpmg.de' }).firestore();

    // Security & Privacy Managers CAN log and read breaches
    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/breaches/brc_new_sec`).set({
        id: 'brc_new_sec',
        tenantId: tenantA,
        incidentReference: 'BRC-2026-002',
        title: 'Phishing Incident with Mailbox Compromise',
        severity: 'critical',
        status: 'suspected',
        natureOfBreach: 'confidentiality',
      })
    );

    await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/breaches/${breachId}`).get());
    await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/breaches/${breachId}`).get());

    // Contributor & Viewer CANNOT read breach records (Strict Breach Confidentiality)
    await assertFails(contribDb.doc(`tenants/${tenantA}/breaches/${breachId}`).get());
    await assertFails(viewerDb.doc(`tenants/${tenantA}/breaches/${breachId}`).get());
  });

  // 5. Deletion Restriction Across GDPR Entities
  test('Only Tenant Admin can delete GDPR records; Privacy Manager cannot delete', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const privacyDb = testEnv.authenticatedContext(userPrivacyA, { email: 'dpo@eurocorp.de' }).firestore();

    // Privacy Manager cannot delete
    await assertFails(privacyDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).delete());
    await assertFails(privacyDb.doc(`tenants/${tenantA}/dpia_assessments/${dpiaId}`).delete());
    await assertFails(privacyDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).delete());
    await assertFails(privacyDb.doc(`tenants/${tenantA}/dsr_requests/${dsrId}`).delete());
    await assertFails(privacyDb.doc(`tenants/${tenantA}/breaches/${breachId}`).delete());

    // Tenant Admin CAN delete
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/dpia_assessments/${dpiaId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/dsr_requests/${dsrId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/breaches/${breachId}`).delete());
  });

  // 6. Cross-Tenant Denial
  test('User from Tenant B cannot read or mutate GDPR records in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/ropa_entries/${ropaId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/dpia_assessments/${dpiaId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/tia_assessments/${tiaId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/dsr_requests/${dsrId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/breaches/${breachId}`).get());
  });
});

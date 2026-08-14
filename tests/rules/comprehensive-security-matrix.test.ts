import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import * as fs from 'fs';
import * as path from 'path';
import {
  seedTenantWithMembers,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const firestoreRulesPath = path.resolve(__dirname, '../../firestore.rules');
  const firestoreRules = fs.readFileSync(firestoreRulesPath, 'utf8');

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-security-test',
    firestore: {
      rules: firestoreRules,
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

  // 1. Seed Tenant A & All Persona Memberships
  await seedTenantWithMembers(
    testEnv,
    { tenantId: FIXTURE_TENANT_A, name: 'EuroCorp Technologies SE' },
    [
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.adminA.uid, role: PERSONAS.adminA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.complianceA.uid, role: PERSONAS.complianceA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.privacyA.uid, role: PERSONAS.privacyA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.securityA.uid, role: PERSONAS.securityA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.aiGovA.uid, role: PERSONAS.aiGovA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.approverA.uid, role: PERSONAS.approverA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.auditorA.uid, role: PERSONAS.auditorA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.contributorA.uid, role: PERSONAS.contributorA.role },
      { tenantId: FIXTURE_TENANT_A, userId: PERSONAS.viewerA.uid, role: PERSONAS.viewerA.role },
    ]
  );

  // 2. Seed Tenant B & External Memberships
  await seedTenantWithMembers(
    testEnv,
    { tenantId: FIXTURE_TENANT_B, name: 'MedTech France SAS' },
    [
      { tenantId: FIXTURE_TENANT_B, userId: PERSONAS.adminB.uid, role: PERSONAS.adminB.role },
      { tenantId: FIXTURE_TENANT_B, userId: PERSONAS.contributorB.uid, role: PERSONAS.contributorB.role },
    ]
  );

  // 3. Seed Tenant A Records Across Subsystems
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();
    const tA = FIXTURE_TENANT_A;

    // Controls & Policies
    await adminDb.doc(`tenants/${tA}/controls/ctl_01`).set({ id: 'ctl_01', tenantId: tA, code: 'CTL-SEC-01', title: 'MFA Gateway', status: 'implemented' });
    await adminDb.doc(`tenants/${tA}/policies/pol_01`).set({ id: 'pol_01', tenantId: tA, code: 'POL-SEC-01', title: 'Access Control Policy', status: 'active' });

    // Risks, Issues & Tasks
    await adminDb.doc(`tenants/${tA}/risks/rsk_01`).set({ id: 'rsk_01', tenantId: tA, code: 'RSK-01', title: 'Data Loss Risk', status: 'mitigating', residualScore: 6 });
    await adminDb.doc(`tenants/${tA}/issues/iss_01`).set({ id: 'iss_01', tenantId: tA, code: 'ISS-01', title: 'Missing MFA on VPN', status: 'open' });
    await adminDb.doc(`tenants/${tA}/tasks/tsk_01`).set({ id: 'tsk_01', tenantId: tA, title: 'Upgrade VPN', status: 'in_progress', assigneeId: PERSONAS.contributorA.uid });

    // Vendors & Assets
    await adminDb.doc(`tenants/${tA}/vendors/vnd_01`).set({ id: 'vnd_01', tenantId: tA, legalName: 'CloudEU GmbH', riskTier: 'low' });
    await adminDb.doc(`tenants/${tA}/system_assets/ast_01`).set({ id: 'ast_01', tenantId: tA, name: 'Core DB', criticality: 'high' });

    // GDPR Modules
    await adminDb.doc(`tenants/${tA}/ropa_entries/ropa_01`).set({ id: 'ropa_01', tenantId: tA, activityCode: 'ROPA-01', activityName: 'Customer Billing' });
    await adminDb.doc(`tenants/${tA}/dpia_assessments/dpia_01`).set({ id: 'dpia_01', tenantId: tA, code: 'DPIA-01', title: 'AI Screening DPIA', status: 'draft' });
    await adminDb.doc(`tenants/${tA}/breaches/brc_01`).set({ id: 'brc_01', tenantId: tA, incidentReference: 'BRC-2026-01', title: 'Phishing Event', severity: 'high' });

    // AI Act Modules
    await adminDb.doc(`tenants/${tA}/ai_systems/ai_01`).set({ id: 'ai_01', tenantId: tA, name: 'CV Screener', riskTier: 'high_risk' });

    // ISO Management
    await adminDb.doc(`tenants/${tA}/iso_scope_statements/scp_01`).set({ id: 'scp_01', tenantId: tA, statementCode: 'SCP-01', title: 'ISMS Scope 2026' });
    await adminDb.doc(`tenants/${tA}/iso_soa_entries/soa_01`).set({ id: 'soa_01', tenantId: tA, controlCode: 'A.5.1', isApplicable: true });

    // Evidence
    await adminDb.doc(`tenants/${tA}/evidence/ev_01`).set({
      id: 'ev_01',
      tenantId: tA,
      title: 'MFA Config Export',
      status: 'under_review',
      createdBy: PERSONAS.contributorA.uid,
      currentVersion: 1,
    });

    // Audit Log (Pre-existing)
    await adminDb.doc(`tenants/${tA}/audit_logs/log_01`).set({
      id: 'log_01',
      tenantId: tA,
      actorId: PERSONAS.adminA.uid,
      actorRole: 'tenant_admin',
      action: 'create',
      timestamp: new Date().toISOString(),
    });

    // Summary Metrics
    await adminDb.doc(`tenants/${tA}/summary_metrics/current`).set({
      id: 'current',
      tenantId: tA,
      overallComplianceScore: 92,
      lastMaterializedAt: new Date().toISOString(),
    });

    // Notifications
    await adminDb.doc(`tenants/${tA}/notifications/notif_admin`).set({
      id: 'notif_admin',
      tenantId: tA,
      recipientId: PERSONAS.adminA.uid,
      title: 'Review Required',
      isRead: false,
    });

    // Export Jobs
    await adminDb.doc(`tenants/${tA}/export_jobs/exp_01`).set({
      id: 'exp_01',
      tenantId: tA,
      exportType: 'gdpr_ropa_xlsx',
      status: 'completed',
      requestedBy: PERSONAS.complianceA.uid,
      requestedAt: new Date().toISOString(),
    });
  });
});

describe('Comprehensive Security Matrix & Invariant Test Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. TENANT ISOLATION ACROSS ALL MODULES
  // ---------------------------------------------------------------------------
  describe('1. Universal Cross-Tenant Data Isolation', () => {
    test('Tenant B Admin is denied read access across all Tenant A subcollections', async () => {
      const outsiderDb = testEnv.authenticatedContext(PERSONAS.adminB.uid, { email: PERSONAS.adminB.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      const forbiddenReads = [
        outsiderDb.doc(`tenants/${tA}/controls/ctl_01`).get(),
        outsiderDb.doc(`tenants/${tA}/policies/pol_01`).get(),
        outsiderDb.doc(`tenants/${tA}/risks/rsk_01`).get(),
        outsiderDb.doc(`tenants/${tA}/issues/iss_01`).get(),
        outsiderDb.doc(`tenants/${tA}/tasks/tsk_01`).get(),
        outsiderDb.doc(`tenants/${tA}/vendors/vnd_01`).get(),
        outsiderDb.doc(`tenants/${tA}/system_assets/ast_01`).get(),
        outsiderDb.doc(`tenants/${tA}/ropa_entries/ropa_01`).get(),
        outsiderDb.doc(`tenants/${tA}/dpia_assessments/dpia_01`).get(),
        outsiderDb.doc(`tenants/${tA}/breaches/brc_01`).get(),
        outsiderDb.doc(`tenants/${tA}/ai_systems/ai_01`).get(),
        outsiderDb.doc(`tenants/${tA}/iso_scope_statements/scp_01`).get(),
        outsiderDb.doc(`tenants/${tA}/iso_soa_entries/soa_01`).get(),
        outsiderDb.doc(`tenants/${tA}/evidence/ev_01`).get(),
        outsiderDb.doc(`tenants/${tA}/audit_logs/log_01`).get(),
        outsiderDb.doc(`tenants/${tA}/summary_metrics/current`).get(),
        outsiderDb.doc(`tenants/${tA}/export_jobs/exp_01`).get(),
      ];

      for (const req of forbiddenReads) {
        await assertFails(req);
      }
    });

    test('Tenant B User is denied write injection into Tenant A subcollections', async () => {
      const outsiderDb = testEnv.authenticatedContext(PERSONAS.contributorB.uid, { email: PERSONAS.contributorB.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      await assertFails(
        outsiderDb.doc(`tenants/${tA}/controls/ctl_injected`).set({
          id: 'ctl_injected',
          tenantId: tA,
          code: 'CTL-EVIL',
          title: 'Tampered Control',
        })
      );

      await assertFails(
        outsiderDb.doc(`tenants/${tA}/risks/rsk_injected`).set({
          id: 'rsk_injected',
          tenantId: tA,
          code: 'RSK-EVIL',
          title: 'Tampered Risk',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. ROLE-BASED ACCESS CONTROL & LEAST PRIVILEGE
  // ---------------------------------------------------------------------------
  describe('2. Role-Based Read/Write Restrictions', () => {
    test('Viewers have read-only access and are blocked from mutating controls or risks', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid, { email: PERSONAS.viewerA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      // Read succeeds
      await assertSucceeds(viewerDb.doc(`tenants/${tA}/controls/ctl_01`).get());
      await assertSucceeds(viewerDb.doc(`tenants/${tA}/risks/rsk_01`).get());

      // Write fails
      await assertFails(
        viewerDb.doc(`tenants/${tA}/controls/ctl_new_viewer`).set({
          id: 'ctl_new_viewer',
          tenantId: tA,
          code: 'CTL-V01',
          title: 'Viewer Control',
        })
      );

      await assertFails(
        viewerDb.doc(`tenants/${tA}/risks/rsk_01`).update({
          residualScore: 1,
        })
      );
    });

    test('Auditors have read access but cannot delete controls or modify policies', async () => {
      const auditorDb = testEnv.authenticatedContext(PERSONAS.auditorA.uid, { email: PERSONAS.auditorA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      await assertSucceeds(auditorDb.doc(`tenants/${tA}/controls/ctl_01`).get());
      await assertSucceeds(auditorDb.doc(`tenants/${tA}/policies/pol_01`).get());

      await assertFails(auditorDb.doc(`tenants/${tA}/controls/ctl_01`).delete());
      await assertFails(
        auditorDb.doc(`tenants/${tA}/policies/pol_01`).update({
          status: 'retired',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. AUDIT LOG IMMUTABILITY INVARIANT
  // ---------------------------------------------------------------------------
  describe('3. Append-Only Audit Log Protection', () => {
    test('All client direct creations, modifications, and deletions of audit logs are blocked', async () => {
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid, { email: PERSONAS.adminA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      // Direct create blocked
      await assertFails(
        adminDb.doc(`tenants/${tA}/audit_logs/log_client_forged`).set({
          id: 'log_client_forged',
          tenantId: tA,
          actorId: PERSONAS.adminA.uid,
          action: 'approve',
        })
      );

      // Direct update blocked
      await assertFails(
        adminDb.doc(`tenants/${tA}/audit_logs/log_01`).update({
          action: 'delete',
        })
      );

      // Direct delete blocked
      await assertFails(adminDb.doc(`tenants/${tA}/audit_logs/log_01`).delete());
    });
  });

  // ---------------------------------------------------------------------------
  // 4. MEMBERSHIP MANIPULATION GUARDRAILS
  // ---------------------------------------------------------------------------
  describe('4. Forbidden Membership Manipulation', () => {
    test('Non-admins cannot modify or promote membership roles', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid, { email: PERSONAS.contributorA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      // Contributor attempt to promote self to tenant_admin is DENIED
      await assertFails(
        contribDb.doc(`tenants/${tA}/memberships/${PERSONAS.contributorA.uid}`).update({
          role: 'tenant_admin',
        })
      );

      // Contributor attempt to delete other member is DENIED
      await assertFails(contribDb.doc(`tenants/${tA}/memberships/${PERSONAS.viewerA.uid}`).delete());
    });

    test('Cross-tenant user cannot inject memberships into Tenant A', async () => {
      const outsiderDb = testEnv.authenticatedContext(PERSONAS.adminB.uid, { email: PERSONAS.adminB.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      await assertFails(
        outsiderDb.doc(`tenants/${tA}/memberships/${PERSONAS.adminB.uid}`).set({
          userId: PERSONAS.adminB.uid,
          tenantId: tA,
          role: 'tenant_admin',
          status: 'active',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. EVIDENCE STATUS JUMP BARRIER
  // ---------------------------------------------------------------------------
  describe('5. Evidence Approval Protection & Four-Eyes Enforcement', () => {
    test('Direct client status modification on evidence is strictly blocked', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid, { email: PERSONAS.contributorA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      // Submitter cannot self-approve by mutating status to 'valid'
      await assertFails(
        contribDb.doc(`tenants/${tA}/evidence/ev_01`).update({
          status: 'valid',
          reviewedBy: PERSONAS.contributorA.uid,
        })
      );

      // Direct client deletion of evidence is blocked
      await assertFails(contribDb.doc(`tenants/${tA}/evidence/ev_01`).delete());
    });
  });

  // ---------------------------------------------------------------------------
  // 6. COMPLIANCE EXPORTS ACCESS CONTROLS
  // ---------------------------------------------------------------------------
  describe('6. Compliance Export Access & Status Protection', () => {
    test('Foreign tenants and unauthorized roles cannot access export jobs', async () => {
      const outsiderDb = testEnv.authenticatedContext(PERSONAS.adminB.uid, { email: PERSONAS.adminB.email }).firestore();
      const auditorDb = testEnv.authenticatedContext(PERSONAS.auditorA.uid, { email: PERSONAS.auditorA.email }).firestore();
      const complianceDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid, { email: PERSONAS.complianceA.email }).firestore();
      const tA = FIXTURE_TENANT_A;

      // Outsider denied
      await assertFails(outsiderDb.doc(`tenants/${tA}/export_jobs/exp_01`).get());

      // Peer auditor denied Compliance Manager's export job (requester isolation)
      await assertFails(auditorDb.doc(`tenants/${tA}/export_jobs/exp_01`).get());

      // Compliance Manager (requester) CAN read
      await assertSucceeds(complianceDb.doc(`tenants/${tA}/export_jobs/exp_01`).get());

      // Direct client status tampering is blocked
      await assertFails(
        complianceDb.doc(`tenants/${tA}/export_jobs/exp_01`).update({
          status: 'failed',
        })
      );
    });
  });
});

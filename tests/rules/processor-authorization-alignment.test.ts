import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-auth-alignment-test',
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

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

    // 1. Tenants
    await db.doc(`tenants/${tenantA}`).set({
      status: 'active',
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
      status: 'active',
      id: tenantB,
      name: 'MedTech France SAS',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships Tenant A
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.adminA.uid}`).set({
      userId: PERSONAS.adminA.uid,
      tenantId: tenantA,
      role: PERSONAS.adminA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.viewerA.uid}`).set({
      userId: PERSONAS.viewerA.uid,
      tenantId: tenantA,
      role: PERSONAS.viewerA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Base Records in Tenant A
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).set({
      id: 'prof_auth_01',
      tenantId: tenantA,
      vendorId: 'vnd_hyperscaler',
      engagementName: 'Cloud Backend Compute',
      processorRole: 'data_processor',
      criticality: 'critical',
      status: 'active',
      dpaSigned: true,
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    });

    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_auth_01`).set({
      id: 'trans_auth_01',
      tenantId: tenantA,
      processorProfileId: 'prof_auth_01',
      name: 'US Cloud Storage Feed',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: now,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    });

    await db.doc(`tenants/${tenantA}/evidence/ev_auth_01`).set({
      id: 'ev_auth_01',
      tenantId: tenantA,
      title: 'Cloud DPA Execution Copy',
      category: 'dpa',
      status: 'under_review',
      processorProfileIds: ['prof_auth_01'],
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    });

    await db.doc(`tenants/${tenantA}/tia_assessments/tia_auth_01`).set({
      id: 'tia_auth_01',
      tenantId: tenantA,
      code: 'TIA-AUTH-01',
      title: 'Cloud US TIA Safeguard Analysis',
      destinationCountry: 'US',
      status: 'draft',
      processorProfileId: 'prof_auth_01',
      transferArrangementId: 'trans_auth_01',
      ownerId: PERSONAS.privacyA.uid,
      createdBy: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
    });

    await db.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).set({
      id: 'notif_auth_privacy',
      tenantId: tenantA,
      recipientId: PERSONAS.privacyA.uid,
      type: 'policy_review_due',
      title: 'Annual Processor Review Due',
      body: 'Cloud Backend Compute requires annual re-assessment.',
      isRead: false,
      readAt: null,
      createdAt: now,
    });
  });
});

describe('Processor Governance & Transfer Authorization Alignment Suite', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Processor Profiles Access & Authorization
  // ---------------------------------------------------------------------------
  describe('1. Processor Profiles Rules', () => {
    test('Privacy Officer can create and update processor profiles', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/processor_profiles/prof_new`).set({
          id: 'prof_new',
          tenantId: tenantA,
          vendorId: 'vnd_saas_crm',
          engagementName: 'CRM Platform',
          processorRole: 'data_processor',
          criticality: 'high',
          status: 'active',
          createdBy: PERSONAS.privacyA.uid,
          createdAt: now,
        })
      );

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).update({
          criticality: 'high',
          updatedBy: PERSONAS.privacyA.uid,
          updatedAt: now,
        })
      );
    });

    test('Viewer can read processor profiles but cannot create, update, or delete', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      const snap = await assertSucceeds(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).get()
      );
      expect(snap.exists).toBe(true);

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_fail`).set({
          id: 'prof_fail',
          tenantId: tenantA,
          vendorId: 'vnd_x',
          engagementName: 'X',
          status: 'active',
        })
      );

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).update({
          criticality: 'low',
        })
      );

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).delete()
      );
    });

    test('Only Tenant Admin can delete a processor profile; Privacy Officer is denied delete', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();

      await assertFails(
        privDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).delete()
      );

      await assertSucceeds(
        adminDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).delete()
      );
    });

    test('Cross-Tenant Isolation: Tenant B cannot read or modify Tenant A processor profiles', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_auth_01`).update({
          status: 'suspended',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Transfer Arrangements Access & Authorization
  // ---------------------------------------------------------------------------
  describe('2. Transfer Arrangements Rules', () => {
    test('Compliance Manager and Privacy Officer can create transfer arrangements', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      await assertSucceeds(
        compDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_new`).set({
          id: 'trans_new',
          tenantId: tenantA,
          processorProfileId: 'prof_auth_01',
          name: 'EU to UK Adequacy Stream',
          restrictedTransfer: false,
          destinationCountries: ['GB'],
          transferMechanismType: 'adequacy_decision',
          transferMechanismStatus: 'active_valid',
          effectiveDate: now,
          status: 'active',
          createdBy: PERSONAS.complianceA.uid,
          createdAt: now,
        })
      );
    });

    test('Viewer is denied from modifying transfer arrangements', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_auth_01`).update({
          restrictedTransfer: false,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Evidence Repository & Linked References
  // ---------------------------------------------------------------------------
  describe('3. Evidence & Linked References Rules', () => {
    test('Authorized users cannot create evidence linkage metadata directly', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      await assertFails(
        privDb.doc(`tenants/${tenantA}/evidence/ev_scc_new`).set({
          id: 'ev_scc_new',
          tenantId: tenantA,
          title: 'Standard Contractual Clauses 2026',
          category: 'scc',
          status: 'under_review',
          processorProfileIds: ['prof_auth_01'],
          transferArrangementIds: ['trans_auth_01'],
          createdBy: PERSONAS.privacyA.uid,
          createdAt: now,
        })
      );
    });

    test('Direct client self-approval of evidence is strictly denied (must maintain unchanged status)', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Attempting to bypass approval workflow directly
      await assertFails(
        privDb.doc(`tenants/${tenantA}/evidence/ev_auth_01`).update({
          status: 'approved',
          updatedBy: PERSONAS.privacyA.uid,
          updatedAt: now,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. TIA Assessments Access & Authorization
  // ---------------------------------------------------------------------------
  describe('4. TIA Assessments Rules', () => {
    test('Privacy Officer can create and update TIA assessments', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/tia_assessments/tia_new`).set({
          id: 'tia_new',
          tenantId: tenantA,
          code: 'TIA-02',
          title: 'India Remote Access Assessment',
          destinationCountry: 'IN',
          status: 'draft',
          processorProfileId: 'prof_auth_01',
          createdBy: PERSONAS.privacyA.uid,
          createdAt: now,
        })
      );

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/tia_assessments/tia_auth_01`).update({
          supplementaryTechnicalMeasures: 'End-to-end client encryption',
          updatedBy: PERSONAS.privacyA.uid,
          updatedAt: now,
        })
      );
    });

    test('Viewer is read-only for TIA assessments', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      const snap = await assertSucceeds(
        viewerDb.doc(`tenants/${tenantA}/tia_assessments/tia_auth_01`).get()
      );
      expect(snap.exists).toBe(true);

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/tia_assessments/tia_auth_01`).update({
          status: 'approved',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Notifications & Reminders Authorization
  // ---------------------------------------------------------------------------
  describe('5. Reminders & Notifications Rules', () => {
    test('Direct client creation of notification is blocked (backend generated only)', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      await assertFails(
        privDb.doc(`tenants/${tenantA}/notifications/notif_client_forged`).set({
          id: 'notif_client_forged',
          tenantId: tenantA,
          recipientId: PERSONAS.privacyA.uid,
          type: 'task_assigned',
          title: 'Forged Alert',
          isRead: false,
          createdAt: now,
        })
      );
    });

    test('Recipient can read and mark their own notification as read', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const snap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).get()
      );
      expect(snap.exists).toBe(true);

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).update({
          isRead: true,
          readAt: now,
          recipientId: PERSONAS.privacyA.uid,
          tenantId: tenantA,
          type: 'policy_review_due',
        })
      );
    });

    test('Recipient cannot tamper with recipientId or notification type during update', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      await assertFails(
        privDb.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).update({
          recipientId: PERSONAS.adminA.uid, // Tampering with recipient
          isRead: true,
        })
      );
    });

    test('Other tenant member cannot read or update another user notification', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      await assertFails(
        compDb.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).get()
      );

      await assertFails(
        compDb.doc(`tenants/${tenantA}/notifications/notif_auth_privacy`).update({
          isRead: true,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Export Jobs Authorization & Scoping
  // ---------------------------------------------------------------------------
  describe('6. Export Jobs Scoping & Rules', () => {
    test('Privacy Officer can queue export job scoped to their UID', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const jobId = 'job_export_scoped';

      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'processor_inventory_report',
          status: 'queued',
          requestedBy: PERSONAS.privacyA.uid,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );
    });

    test('User cannot forge requestedBy with someone else UID in export job', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const jobId = 'job_export_forged';

      await assertFails(
        privDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'processor_inventory_report',
          status: 'queued',
          requestedBy: PERSONAS.adminA.uid, // Forged requestedBy
          requestedAt: now,
          filtersApplied: {},
        })
      );
    });

    test('Direct client status transition of export job is blocked', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const jobId = 'job_export_trans';

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'restricted_transfers_register',
          status: 'queued',
          requestedBy: PERSONAS.privacyA.uid,
          requestedAt: now,
        });
      });

      await assertFails(
        privDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).update({
          status: 'completed',
          fileStoragePath: 'fake_path.json',
        })
      );
    });
  });
});

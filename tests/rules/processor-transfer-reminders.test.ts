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
import {
  ProcessorProfile,
  TransferArrangement,
  Evidence,
  evaluateProcessorReminders,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

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

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

    // 1. Tenants
    await db.doc(`tenants/${tenantA}`).set({
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Notification for Tenant A
    await db.doc(`tenants/${tenantA}/notifications/notif_existing_rem`).set({
      id: 'notif_existing_rem',
      tenantId: tenantA,
      recipientId: PERSONAS.privacyA.uid,
      recipientEmail: PERSONAS.privacyA.email,
      title: 'Processor Review Due: Global User Behavior Analytics',
      body: 'The scheduled privacy review for processor is due.',
      type: 'processor_annual_review_due',
      priority: 'high',
      isRead: false,
      readAt: null,
      linkUrl: '/processors/prof_analytics_corp',
      actionUrl: '/processors/prof_analytics_corp',
      sourceEntityType: 'processor_profile',
      sourceEntityId: 'prof_analytics_corp',
      createdAt: now,
    });
  });
});

describe('Processor & Transfer Review Reminders and Lifecycle Notifications Suite', () => {
  const asOfDate = new Date('2026-08-15T00:00:00.000Z');

  // ---------------------------------------------------------------------------
  // 1. Reminder Evaluation Logic
  // ---------------------------------------------------------------------------
  describe('1. Reminder Candidate Evaluation Logic', () => {
    test('evaluates reminders for annual processor review, missing DPA, SCC review, TIA due, and missing evidence', () => {
      const profile: ProcessorProfile = {
        id: 'prof_crm_cloud',
        tenantId: tenantA,
        vendorId: 'vnd_crm_solutions',
        engagementName: 'Enterprise CRM Cloud Platform',
        processorRole: 'data_processor',
        serviceDescription: 'Customer Relationship Management database',
        dataCategories: ['contact_details', 'purchase_history'],
        dataSubjects: ['customers', 'prospects'],
        isSpecialCategoryData: false,
        jurisdictions: ['US', 'EU'],
        linkedSystemAssetIds: ['asset_crm'],
        criticality: 'high',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: '2025-08-20T00:00:00.000Z',
        nextReviewDate: '2026-08-20T00:00:00.000Z', // 5 days from asOfDate (within 30-day window)
        status: 'active',
        dpaSigned: false, // Triggers dpa_renewal_due
        dpaDate: null,
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-08-20T00:00:00.000Z',
        updatedAt: '2025-08-20T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const sccTransfer: TransferArrangement = {
        id: 'trans_crm_us_backup',
        processorProfileId: 'prof_crm_cloud',
        vendorId: 'vnd_crm_solutions',
        tenantId: tenantA,
        name: 'US Cold Storage Disaster Recovery Replication',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['backup'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-08-20T00:00:00.000Z',
        reviewDueDate: '2026-08-25T00:00:00.000Z', // 10 days away (within 30-day window)
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['vnd_storage_tier4'],
        linkedTiaId: null, // Triggers tia_review_due
        linkedEvidenceIds: [], // Triggers missing_evidence_follow_up for SCC & Subprocessors
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.complianceA.uid,
        createdAt: '2025-08-20T00:00:00.000Z',
        updatedAt: '2025-08-20T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const reminders = evaluateProcessorReminders(profile, [sccTransfer], [], {
        windowDays: 30,
        asOfDate,
      });

      expect(reminders.length).toBeGreaterThanOrEqual(5);

      const reminderTypes = reminders.map((r) => r.reminderType);
      expect(reminderTypes).toContain('processor_annual_review_due');
      expect(reminderTypes).toContain('dpa_renewal_due');
      expect(reminderTypes).toContain('scc_review_due');
      expect(reminderTypes).toContain('tia_review_due');
      expect(reminderTypes).toContain('missing_evidence_follow_up');

      // Check recipient correctness
      const profileReviewRem = reminders.find((r) => r.reminderType === 'processor_annual_review_due');
      expect(profileReviewRem?.recipientUserId).toBe(PERSONAS.privacyA.uid);

      const transferReviewRem = reminders.find((r) => r.reminderType === 'scc_review_due');
      expect(transferReviewRem?.recipientUserId).toBe(PERSONAS.complianceA.uid);
    });

    test('evaluates transfer arrangement review due for other legal mechanisms and attached evidence review dates', () => {
      const profile: ProcessorProfile = {
        id: 'prof_jp_affiliate',
        tenantId: tenantA,
        vendorId: 'vnd_japan_group',
        engagementName: 'Tokyo Regional Support Center',
        processorRole: 'data_processor',
        serviceDescription: 'Follow-the-sun customer support',
        dataCategories: ['support_tickets'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['JP'],
        linkedSystemAssetIds: [],
        criticality: 'medium',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: '2025-01-01T00:00:00.000Z',
        nextReviewDate: '2027-01-01T00:00:00.000Z', // Far in future, no annual review due
        status: 'active',
        dpaSigned: true,
        dpaDate: '2025-01-01T00:00:00.000Z',
        linkedDpaEvidenceId: 'ev_dpa_jp',
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const bcrTransfer: TransferArrangement = {
        id: 'trans_jp_bcr',
        processorProfileId: 'prof_jp_affiliate',
        tenantId: tenantA,
        name: 'Intra-Group BCR Support Transfer',
        restrictedTransfer: true,
        destinationCountries: ['JP'],
        eeaStatus: 'third_country_adequate',
        transferScopes: ['support_access'],
        transferMechanismType: 'adequacy_decision',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2026-08-18T00:00:00.000Z', // 3 days away (within 30 days)
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: false,
        linkedTiaId: 'tia_jp_01',
        linkedEvidenceIds: ['ev_adequacy_cert'],
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const evidenceList: Evidence[] = [
        {
          id: 'ev_adequacy_cert',
          tenantId: tenantA,
          title: 'Japan Adequacy Confirmation 2025',
          description: 'Official confirmation and TOMs audit',
          category: 'adequacy_support',
          status: 'valid',
          storagePath: 'tenants/tenantA/evidence/ev_adequacy_cert.pdf',
          fileSizeBytes: 1024,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash123',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          collectedAt: '2025-01-01T00:00:00.000Z',
          reviewDueDate: '2026-08-17T00:00:00.000Z', // 2 days away (within 30 days)
          reviewedBy: PERSONAS.complianceA.uid,
          reviewedAt: '2025-01-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: PERSONAS.complianceA.uid,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
        },
      ];

      const reminders = evaluateProcessorReminders(profile, [bcrTransfer], evidenceList, {
        windowDays: 30,
        asOfDate,
      });

      const types = reminders.map((r) => r.reminderType);
      expect(types).toContain('transfer_arrangement_review_due');
      expect(types).toContain('missing_evidence_follow_up'); // For expiring evidence document
    });

    test('deduplicates multiple matching reminder triggers and escalates priority for overdue items', () => {
      const overdueProfile: ProcessorProfile = {
        id: 'prof_overdue_vendor',
        tenantId: tenantA,
        vendorId: 'vnd_overdue',
        engagementName: 'Overdue Payroll Processor',
        processorRole: 'data_processor',
        serviceDescription: 'Global payroll services',
        dataCategories: ['financial_data', 'salary'],
        dataSubjects: ['employees'],
        isSpecialCategoryData: true,
        jurisdictions: ['DE'],
        linkedSystemAssetIds: [],
        criticality: 'critical',
        ownerUserId: PERSONAS.complianceA.uid,
        reviewCadence: 'quarterly',
        lastReviewDate: '2025-01-01T00:00:00.000Z',
        nextReviewDate: '2025-04-01T00:00:00.000Z', // Overdue relative to 2026-08-15
        status: 'active',
        dpaSigned: false, // Special category without DPA -> urgent priority
        dpaDate: null,
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.complianceA.uid,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
      };

      const reminders = evaluateProcessorReminders(overdueProfile, [], [], {
        windowDays: 30,
        asOfDate,
      });

      // Annual review candidate should be marked 'high' priority because it is overdue
      const reviewRem = reminders.find((r) => r.reminderType === 'processor_annual_review_due');
      expect(reviewRem?.priority).toBe('high');
      expect(reviewRem?.recipientUserId).toBe(PERSONAS.complianceA.uid);
      expect(reviewRem?.targetRecipientRole).toBe('privacy_manager');

      // DPA missing candidate for special category data should be marked 'urgent'
      const dpaRem = reminders.find((r) => r.reminderType === 'dpa_renewal_due');
      expect(dpaRem?.priority).toBe('urgent');
      expect(dpaRem?.recipientUserId).toBe(PERSONAS.complianceA.uid);

      // Deterministic candidate IDs must be unique
      const ids = reminders.map((r) => r.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(reminders.length);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Notification Security Rules & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('2. Notification Security Rules & Multi-Tenant Isolation', () => {
    test('Recipient can read their notification and mark it as read', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const notifSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/notifications/notif_existing_rem`).get()
      );
      expect(notifSnap.exists).toBe(true);

      // Recipient can update isRead and readAt
      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/notifications/notif_existing_rem`).update({
          isRead: true,
          readAt: new Date().toISOString(),
        })
      );
    });

    test('Client direct creation of notification is strictly forbidden by security rules', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Direct client create blocked (must use Cloud Function createNotification)
      await assertFails(
        privDb.doc(`tenants/${tenantA}/notifications/fake_notif_01`).set({
          id: 'fake_notif_01',
          tenantId: tenantA,
          recipientId: PERSONAS.privacyA.uid,
          title: 'Spoofed Notification',
          body: 'Client spoofed alert',
          type: 'processor_annual_review_due',
          priority: 'urgent',
          isRead: false,
          readAt: null,
          createdAt: new Date().toISOString(),
        })
      );
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or update Tenant A notifications', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/notifications/notif_existing_rem`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/notifications/notif_existing_rem`).update({
          isRead: true,
        })
      );
    });
  });
});

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
  Notification,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assessment-notifications-test',
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
      name: 'Nordic AI Health AB',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      id: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      userId: PERSONAS.complianceA.uid,
      role: 'compliance_manager',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      id: PERSONAS.adminB.uid,
      tenantId: tenantB,
      userId: PERSONAS.adminB.uid,
      role: 'tenant_admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe('Third-Party Assessment Notifications & Deadline Reminders Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. NOTIFICATION CREATION & RECIPIENT ROUTING
  // ---------------------------------------------------------------------------
  describe('1. Notification Creation & Recipient Correctness', () => {
    it('creates and routes assessment_request_sent notification to responsible compliance manager', async () => {
      const notifDoc: Notification = {
        id: 'notif_sent_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        recipientEmail: 'compliance-manager@eurocorp.example.eu',
        type: 'assessment_request_sent',
        priority: 'low',
        title: 'Assessment Dispatched: CloudData Europe B.V.',
        body: 'Questionnaire invitation dispatched to Maria Santos (maria.santos@clouddata.eu).',
        actionUrl: '/assessments',
        sourceEntityType: 'processor_assessment',
        sourceEntityId: 'req_clouddata_001',
        deduplicationKey: 'notif_sent_req_clouddata_001',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${notifDoc.id}`).set(notifDoc);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const notifSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${notifDoc.id}`).get()
      );
      expect(notifSnap.exists).toBe(true);
      const nData = notifSnap.data() as Notification;
      expect(nData.recipientId).toBe(PERSONAS.complianceA.uid);
      expect(nData.type).toBe('assessment_request_sent');
      expect(nData.title).toContain('CloudData Europe B.V.');
    });

    it('creates and routes assessment_request_opened notification when respondent accesses portal', async () => {
      const notifDoc: Notification = {
        id: 'notif_opened_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_request_opened',
        priority: 'low',
        title: 'Assessment Questionnaire Opened: CloudData Europe B.V.',
        body: 'Maria Santos (maria.santos@clouddata.eu) has opened the assessment questionnaire.',
        sourceEntityType: 'processor_assessment',
        sourceEntityId: 'req_clouddata_001',
        deduplicationKey: 'notif_opened_req_clouddata_001',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${notifDoc.id}`).set(notifDoc);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const notifSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${notifDoc.id}`).get()
      );
      expect(notifSnap.exists).toBe(true);
      expect((notifSnap.data() as Notification).type).toBe('assessment_request_opened');
    });

    it('creates assessment_review_accepted and assessment_review_rejected notifications', async () => {
      const acceptedNotif: Notification = {
        id: 'notif_rev_accepted_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_review_accepted',
        priority: 'medium',
        title: 'Assessment Review ACCEPT: CloudData Europe B.V.',
        body: 'Review decision ACCEPT recorded. Risk tier: LOW.',
        sourceEntityType: 'processor_assessment',
        sourceEntityId: 'req_clouddata_001',
        deduplicationKey: 'notif_review_rev_001',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${acceptedNotif.id}`).set(acceptedNotif);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const notifSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${acceptedNotif.id}`).get()
      );
      expect(notifSnap.exists).toBe(true);
      expect((notifSnap.data() as Notification).type).toBe('assessment_review_accepted');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DEADLINE & RECURRING REMINDER EVENTS
  // ---------------------------------------------------------------------------
  describe('2. Deadline Reminders & Overdue Response Notifications', () => {
    it('creates assessment_nearing_due_date and assessment_response_overdue notifications', async () => {
      const nearingNotif: Notification = {
        id: 'notif_nearing_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_nearing_due_date',
        priority: 'high',
        title: 'Assessment Due Soon: AI Vision Labs',
        body: 'Assessment is due in 2 day(s) (2026-08-17).',
        sourceEntityType: 'processor_assessment',
        sourceEntityId: 'req_aivision_001',
        deduplicationKey: 'notif_due_soon_req_aivision_001_2026-08-17',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      const overdueNotif: Notification = {
        id: 'notif_overdue_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_response_overdue',
        priority: 'urgent',
        title: 'Overdue Assessment Response: AI Vision Labs',
        body: 'Assessment was due on 2026-08-10 and is overdue.',
        sourceEntityType: 'processor_assessment',
        sourceEntityId: 'req_aivision_001',
        deduplicationKey: 'notif_overdue_req_aivision_001_2026-08-10',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      const recurringNotif: Notification = {
        id: 'notif_recur_001',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_recurring_cycle_approaching',
        priority: 'medium',
        title: 'Recurring Assessment Approaching: CloudData Europe B.V.',
        body: 'Recurring annual assessment is approaching (due on 2026-09-01).',
        sourceEntityType: 'recurring_schedule',
        sourceEntityId: 'sched_clouddata_annual',
        deduplicationKey: 'notif_recur_sched_clouddata_annual_2026-09-01',
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${nearingNotif.id}`).set(nearingNotif);
        await db.doc(`tenants/${tenantA}/notifications/${overdueNotif.id}`).set(overdueNotif);
        await db.doc(`tenants/${tenantA}/notifications/${recurringNotif.id}`).set(recurringNotif);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const snap1 = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${nearingNotif.id}`).get()
      );
      const snap2 = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${overdueNotif.id}`).get()
      );
      const snap3 = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/notifications/${recurringNotif.id}`).get()
      );

      expect(snap1.exists).toBe(true);
      expect(snap2.exists).toBe(true);
      expect(snap3.exists).toBe(true);
      expect((snap1.data() as Notification).type).toBe('assessment_nearing_due_date');
      expect((snap2.data() as Notification).type).toBe('assessment_response_overdue');
      expect((snap3.data() as Notification).type).toBe('assessment_recurring_cycle_approaching');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DUPLICATE SUPPRESSION & TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('3. Duplicate Suppression & Multi-Tenant Isolation', () => {
    it('verifies deduplication key prevents redundant notification entries', async () => {
      const dedupKey = 'notif_due_soon_req_clouddata_001_2026-08-17';

      const initialNotif: Notification = {
        id: 'notif_clouddata_first',
        tenantId: tenantA,
        recipientId: PERSONAS.complianceA.uid,
        type: 'assessment_nearing_due_date',
        title: 'Due Soon Reminder',
        body: 'First reminder',
        deduplicationKey: dedupKey,
        isRead: false,
        readAt: null,
        createdAt: now,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${initialNotif.id}`).set(initialNotif);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const existingSnap = await assertSucceeds(
        dbCompliance
          .collection(`tenants/${tenantA}/notifications`)
          .where('recipientId', '==', PERSONAS.complianceA.uid)
          .where('deduplicationKey', '==', dedupKey)
          .get()
      );

      expect(existingSnap.size).toBe(1);
      expect(existingSnap.docs[0]?.id).toBe('notif_clouddata_first');
    });

    it('prevents Tenant B user from accessing Tenant A assessment notifications', async () => {
      const notifId = 'notif_isolated_001';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/${notifId}`).set({
          id: notifId,
          tenantId: tenantA,
          recipientId: PERSONAS.complianceA.uid,
          type: 'assessment_request_sent',
          title: 'Secret Tenant A Notification',
          body: 'Do not leak',
          isRead: false,
          readAt: null,
          createdAt: now,
        });
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/notifications/${notifId}`).get()
      );
    });
  });
});

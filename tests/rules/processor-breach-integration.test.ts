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
  PersonalDataBreach,
  summarizeProcessorBreachHistory,
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
      userId: PERSONAS.securityA.uid,
      tenantId: tenantA,
      role: PERSONAS.securityA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Processor Profile
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_db`).set({
      id: 'prof_cloud_db',
      tenantId: tenantA,
      vendorId: 'vnd_managed_postgres_corp',
      engagementName: 'Primary Production Database Hosting',
      processorRole: 'data_processor',
      serviceDescription: 'Managed PostgreSQL cluster hosting',
      dataCategories: ['user_credentials', 'payment_logs'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE'],
      linkedSystemAssetIds: ['asset_db_cluster'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'semi_annually',
      lastReviewDate: null,
      nextReviewDate: '2027-02-15T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-01T00:00:00.000Z',
      linkedBreachIds: ['brk_db_leak_01'],
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    // 5. Seed Breach Incident
    await db.doc(`tenants/${tenantA}/breaches/brk_db_leak_01`).set({
      id: 'brk_db_leak_01',
      tenantId: tenantA,
      incidentReference: 'INC-2026-0042',
      title: 'PostgreSQL Read-Replica Unauthorized S3 Snapshot Exposure',
      discoveredAt: '2026-08-14T10:00:00.000Z',
      occurredAt: '2026-08-13T22:30:00.000Z',
      severity: 'high',
      status: 'investigating',
      description: 'Vendor alerted EuroCorp of misconfigured public snapshot permissions on backup bucket.',
      affectedDataCategories: ['payment_logs', 'email_address'],
      estimatedDataSubjectsCount: 1450,
      natureOfBreach: 'confidentiality',
      rootCauseAnalysis: 'Vendor engineer disabled bucket ACL restriction during maintenance window.',
      dpaNotificationDeadline72h: '2026-08-17T10:00:00.000Z',
      dpaNotifiedAt: null,
      dpaReferenceNumber: null,
      dataSubjectsNotifiedAt: null,
      containmentActionsTaken: 'Snapshot made private, KMS keys rotated immediately by processor.',
      remedialIssueIds: [],
      involvesProcessor: true,
      processorProfileIds: ['prof_cloud_db'],
      vendorIds: ['vnd_managed_postgres_corp'],
      reportingSource: 'reported_by_processor',
      processorNotificationReceivedAt: '2026-08-14T09:45:00.000Z',
      transferArrangementIds: [],
      affectedSystemAssetIds: ['asset_db_cluster'],
      processorIncidentNotes: 'Processor notified controller within 2 hours of discovery in accordance with GDPR Art. 33(2) and DPA Section 8.',
      ownerId: PERSONAS.securityA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
    });
  });
});

describe('Processor Profiles & Breach Records Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. Processor Breach History Summarizer Data Layer
  // ---------------------------------------------------------------------------
  describe('1. Breach History Data Layer', () => {
    const breach1: PersonalDataBreach = {
      id: 'brk_1',
      tenantId: tenantA,
      incidentReference: 'INC-2026-001',
      title: 'Vendor S3 Storage Leak',
      discoveredAt: '2026-02-10T12:00:00.000Z',
      occurredAt: null,
      severity: 'critical',
      status: 'closed',
      description: 'Storage leak',
      affectedDataCategories: ['financial_data'],
      estimatedDataSubjectsCount: 5000,
      natureOfBreach: 'confidentiality',
      rootCauseAnalysis: 'Misconfiguration',
      dpaNotificationDeadline72h: '2026-02-13T12:00:00.000Z',
      dpaNotifiedAt: '2026-02-11T10:00:00.000Z',
      dpaReferenceNumber: 'DPA-CNIL-2026-99',
      dataSubjectsNotifiedAt: null,
      containmentActionsTaken: 'Bucket secured',
      remedialIssueIds: [],
      involvesProcessor: true,
      processorProfileIds: ['prof_cloud_db'],
      reportingSource: 'reported_by_processor',
      processorNotificationReceivedAt: '2026-02-10T11:30:00.000Z',
      affectedSystemAssetIds: ['asset_db_cluster'],
      transferArrangementIds: [],
      ownerId: PERSONAS.securityA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
    };

    const breach2: PersonalDataBreach = {
      id: 'brk_2',
      tenantId: tenantA,
      incidentReference: 'INC-2026-002',
      title: 'Internal SOC Discovered Credential Exposure',
      discoveredAt: '2026-08-14T10:00:00.000Z',
      occurredAt: null,
      severity: 'high',
      status: 'investigating', // Active
      description: 'Credentials on GitHub',
      affectedDataCategories: ['credentials'],
      estimatedDataSubjectsCount: 200,
      natureOfBreach: 'confidentiality',
      rootCauseAnalysis: 'Contractor leaked key',
      dpaNotificationDeadline72h: '2026-08-17T10:00:00.000Z',
      dpaNotifiedAt: null,
      dpaReferenceNumber: null,
      dataSubjectsNotifiedAt: null,
      containmentActionsTaken: 'Keys invalidated',
      remedialIssueIds: [],
      involvesProcessor: true,
      processorProfileIds: ['prof_cloud_db'],
      reportingSource: 'identified_internally',
      processorNotificationReceivedAt: null,
      affectedSystemAssetIds: ['asset_db_cluster'],
      transferArrangementIds: ['trans_1'],
      ownerId: PERSONAS.securityA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
    };

    test('summarizes processor incident history accurately with reporting sources, severity, and active count', () => {
      const history = summarizeProcessorBreachHistory('prof_cloud_db', [breach1, breach2]);

      expect(history.processorProfileId).toBe('prof_cloud_db');
      expect(history.totalBreachCount).toBe(2);
      expect(history.activeBreachCount).toBe(1); // breach2 is investigating
      expect(history.reportedByProcessorCount).toBe(1); // breach1
      expect(history.identifiedInternallyCount).toBe(1); // breach2
      expect(history.hasCriticalOrHighBreaches).toBe(true);

      const items = history.breaches;
      expect(items.length).toBe(2);
      expect(items[0]?.dpaNotified).toBe(true);
      expect(items[1]?.transferArrangementIds).toContain('trans_1');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Breach Security Rules & Cross-Tenant Authorization
  // ---------------------------------------------------------------------------
  describe('2. Breach Security Rules & Multi-Tenant Isolation', () => {
    test('Security Officer can read and update processor-linked breach incident', async () => {
      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      const snap = await assertSucceeds(
        secDb.doc(`tenants/${tenantA}/breaches/brk_db_leak_01`).get()
      );
      expect(snap.exists).toBe(true);
      const data = snap.data() as PersonalDataBreach;
      expect(data.involvesProcessor).toBe(true);
      expect(data.processorProfileIds).toContain('prof_cloud_db');
      expect(data.reportingSource).toBe('reported_by_processor');

      // Update containment and DPA reference
      await assertSucceeds(
        secDb.doc(`tenants/${tenantA}/breaches/brk_db_leak_01`).update({
          dpaReferenceNumber: 'DPA-HESSEN-2026-4412',
          dpaNotifiedAt: new Date().toISOString(),
          status: 'dpa_notified',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.securityA.uid,
        })
      );
    });

    test('Cross-tenant isolation: Tenant B admin cannot view or modify Tenant A breach records', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Read blocked
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/breaches/brk_db_leak_01`).get()
      );

      // Write blocked
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/breaches/brk_db_leak_01`).update({
          status: 'closed',
        })
      );
    });
  });
});

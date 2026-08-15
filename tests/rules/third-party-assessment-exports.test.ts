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
  ThirdPartyAssessmentRequest,
  RecurringAssessmentSchedule,
  ExportJob,
  generateThirdPartyAssessmentInventoryExportPayload,
  generateLatestAcceptedAssessmentRegisterExportPayload,
  generateOverdueRecurringAssessmentsExportPayload,
  generateAssessmentControlAssuranceExportPayload,
  generateAssessmentOpenFollowUpsExportPayload,
  generateProspectAssessmentsUnlinkedExportPayload,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assessment-exports-test',
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.auditorA.uid}`).set({
      id: PERSONAS.auditorA.uid,
      tenantId: tenantA,
      userId: PERSONAS.auditorA.uid,
      role: 'auditor',
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

describe('Third-Party Assessment Exports & Compliance Reporting Test Pack', () => {
  const nowIso = '2026-08-15T12:00:00.000Z';
  const pastIso = '2026-08-01T00:00:00.000Z';
  const futureIso = '2026-09-01T00:00:00.000Z';

  const mockRequests: ThirdPartyAssessmentRequest[] = [
    {
      id: 'req_01',
      tenantId: tenantA,
      title: 'Stripe EU Due Diligence',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'Stripe Payments Europe',
      vendorId: 'vend_stripe_01',
      processorProfileId: 'proc_stripe_01',
      respondent: { name: 'Alex Stripe', email: 'alex@stripe.example.com', companyName: 'Stripe' },
      requestType: 'one_time_due_diligence',
      status: 'accepted',
      dueDate: futureIso,
      accessCount: 1,
      isRecurring: false,
      recurrenceCadence: 'annual',
      finalScorePercent: 92,
      overallRiskRating: 'low',
      isCompliant: true,
      reviewedBy: PERSONAS.complianceA.uid,
      reviewedAt: '2026-08-10T12:00:00.000Z',
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: ['ctrl_vendor_mgmt'],
      linkedEvidenceIds: ['ev_stripe_soc2'],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'req_02',
      tenantId: tenantA,
      title: 'Auth0 Old Assessment',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'Auth0 Ireland Ltd',
      vendorId: 'vend_auth0_01',
      processorProfileId: 'proc_auth0_01',
      respondent: { name: 'Sam Auth0', email: 'sam@auth0.example.com', companyName: 'Auth0' },
      requestType: 'recurring_periodic_review',
      status: 'accepted',
      dueDate: pastIso,
      accessCount: 2,
      isRecurring: true,
      recurrenceCadence: 'annual',
      finalScorePercent: 88,
      overallRiskRating: 'low',
      isCompliant: true,
      reviewedBy: PERSONAS.complianceA.uid,
      reviewedAt: '2025-01-01T00:00:00.000Z', // Expired assessment (>365 days ago)
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: ['ctrl_vendor_mgmt'],
      linkedEvidenceIds: ['ev_auth0_iso'],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'req_03',
      tenantId: tenantA,
      title: 'Legacy Vendor Requiring Revision',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'OldServer Host',
      vendorId: 'vend_oldhost_01',
      processorProfileId: null,
      respondent: { name: 'Host Tech', email: 'tech@oldhost.example.com', companyName: 'OldServer' },
      requestType: 'custom_deep_dive',
      status: 'revision_requested',
      dueDate: pastIso,
      accessCount: 1,
      isRecurring: false,
      recurrenceCadence: 'annual',
      finalScorePercent: 45,
      overallRiskRating: 'critical',
      isCompliant: false,
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: [],
      linkedEvidenceIds: [],
      linkedRiskIds: ['risk_plain_01'],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'req_04',
      tenantId: tenantA,
      title: 'Prospect AI Tool Screening',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'prospective_vendor',
      thirdPartyName: 'ProspectGen AI Inc',
      prospectCompanyName: 'ProspectGen AI Inc',
      prospectWebsite: 'https://prospectgen.example.com',
      vendorId: null,
      processorProfileId: null,
      respondent: { name: 'Prospect Founder', email: 'founder@prospectgen.example.com', companyName: 'ProspectGen' },
      requestType: 'one_time_due_diligence',
      status: 'in_progress',
      dueDate: pastIso, // Overdue
      accessCount: 1,
      isRecurring: false,
      recurrenceCadence: 'annual',
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: [],
      linkedEvidenceIds: [],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  const mockSchedules: RecurringAssessmentSchedule[] = [
    {
      id: 'sched_01',
      tenantId: tenantA,
      title: 'Auth0 Annual Recurrence',
      templateId: 'tmpl_01',
      targetType: 'vendor',
      vendorId: 'vend_auth0_01',
      thirdPartyName: 'Auth0 Ireland Ltd',
      contact: { name: 'Sam Auth0', email: 'sam@auth0.example.com', companyName: 'Auth0' },
      cadence: 'annual',
      leadTimeDays: 30,
      autoDispatch: true,
      status: 'active',
      nextScheduledDispatchDate: '2026-07-01T00:00:00.000Z',
      nextAssessmentDueDate: pastIso, // Overdue
      linkedControlIds: ['ctrl_vendor_mgmt'],
      ownerUserId: PERSONAS.complianceA.uid,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
  ];

  // ---------------------------------------------------------------------------
  // 1. EXPORT PAYLOAD GENERATION
  // ---------------------------------------------------------------------------
  describe('1. Export Payload Generation for All 6 Required Reports', () => {
    it('generates third_party_assessment_inventory payload', () => {
      const payload = generateThirdPartyAssessmentInventoryExportPayload(mockRequests, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
      });

      expect(payload.exportHeader.exportType).toBe('third_party_assessment_inventory');
      expect(payload.exportHeader.totalRecords).toBe(4);
      expect(payload.assessments.length).toBe(4);
      expect(payload.assessments[0]?.thirdPartyName).toBe('Stripe Payments Europe');
    });

    it('generates latest_accepted_assessment_register payload with expiration calculation', () => {
      const payload = generateLatestAcceptedAssessmentRegisterExportPayload(mockRequests, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
        maxValidityDays: 365,
      });

      expect(payload.exportHeader.exportType).toBe('latest_accepted_assessment_register');
      expect(payload.latestAssessments.length).toBe(2); // Stripe (valid) and Auth0 (expired)

      const stripeItem = payload.latestAssessments.find((a) => a.thirdPartyName === 'Stripe Payments Europe');
      expect(stripeItem).toBeDefined();
      expect(stripeItem?.isExpired).toBe(false);

      const auth0Item = payload.latestAssessments.find((a) => a.thirdPartyName === 'Auth0 Ireland Ltd');
      expect(auth0Item).toBeDefined();
      expect(auth0Item?.isExpired).toBe(true);
    });

    it('generates overdue_recurring_assessments_report payload', () => {
      const payload = generateOverdueRecurringAssessmentsExportPayload(mockRequests, mockSchedules, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
      });

      expect(payload.exportHeader.exportType).toBe('overdue_recurring_assessments_report');
      expect(payload.overdueRequests.length).toBe(1); // req_04 (in_progress, dueDate in past)
      expect(payload.overdueSchedules.length).toBe(1); // sched_01 (dueDate in past)
      expect(payload.exportHeader.totalRecords).toBe(2);
    });

    it('generates assessment_control_assurance_report payload', () => {
      const payload = generateAssessmentControlAssuranceExportPayload(mockRequests, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
        maxValidityDays: 365,
      });

      expect(payload.exportHeader.exportType).toBe('assessment_control_assurance_report');
      expect(payload.controlAssuranceMappings.length).toBe(2);

      const stripeMapping = payload.controlAssuranceMappings.find(
        (m) => m.thirdPartyName === 'Stripe Payments Europe'
      );
      expect(stripeMapping?.isSatisfied).toBe(true);
      expect(stripeMapping?.satisfactionStatus).toBe('satisfied');

      const auth0Mapping = payload.controlAssuranceMappings.find(
        (m) => m.thirdPartyName === 'Auth0 Ireland Ltd'
      );
      expect(auth0Mapping?.isSatisfied).toBe(false);
      expect(auth0Mapping?.satisfactionStatus).toBe('expired');
    });

    it('generates assessment_open_follow_ups_report payload', () => {
      const payload = generateAssessmentOpenFollowUpsExportPayload(mockRequests, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
      });

      expect(payload.exportHeader.exportType).toBe('assessment_open_follow_ups_report');
      expect(payload.followUpItems.length).toBe(1);
      expect(payload.followUpItems[0]?.requestId).toBe('req_03');
      expect(payload.followUpItems[0]?.status).toBe('revision_requested');
    });

    it('generates prospect_assessments_unlinked_report payload', () => {
      const payload = generateProspectAssessmentsUnlinkedExportPayload(mockRequests, {
        tenantId: tenantA,
        asOfDate: new Date(nowIso),
      });

      expect(payload.exportHeader.exportType).toBe('prospect_assessments_unlinked_report');
      expect(payload.prospectAssessments.length).toBe(1);
      expect(payload.prospectAssessments[0]?.prospectCompanyName).toBe('ProspectGen AI Inc');
      expect(payload.prospectAssessments[0]?.prospectWebsite).toBe('https://prospectgen.example.com');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. AUTHORIZATION & TENANT ISOLATION
  // ---------------------------------------------------------------------------
  describe('2. Authorization & Tenant Isolation in Firestore', () => {
    it('allows compliance manager to create export job and view completed job', async () => {
      const jobId = 'job_export_001';
      const exportJob: ExportJob = {
        id: jobId,
        tenantId: tenantA,
        exportType: 'third_party_assessment_inventory',
        status: 'completed',
        requestedBy: PERSONAS.complianceA.uid,
        requestedAt: nowIso,
        completedAt: nowIso,
        fileStoragePath: `tenants/${tenantA}/exports/${jobId}/inventory.json`,
        fileDownloadUrl: 'https://storage.googleapis.com/download/test',
        fileSizeBytes: 1024,
        errorMessage: null,
        filtersApplied: {},
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set(exportJob);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const jobSnap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/export_jobs/${jobId}`).get()
      );
      expect(jobSnap.exists).toBe(true);
    });

    it('prevents Tenant B user from reading Tenant A export jobs', async () => {
      const jobId = 'job_export_secret_002';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'latest_accepted_assessment_register',
          status: 'completed',
          requestedBy: PERSONAS.complianceA.uid,
          requestedAt: nowIso,
          completedAt: nowIso,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        });
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/export_jobs/${jobId}`).get()
      );
    });
  });
});

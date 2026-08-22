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
  ThirdPartyAssessmentSummaryMetrics,
  calculateThirdPartyAssessmentSummaryMetrics,
  filterThirdPartyAssessments,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assessment-summary-test',
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

describe('Third-Party Assessment Summary Widgets & List Views Test Pack', () => {
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
      status: 'sent',
      dueDate: futureIso,
      accessCount: 1,
      isRecurring: false,
      recurrenceCadence: 'annual',
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: ['ctrl_vendor_mgmt'],
      linkedEvidenceIds: [],
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
      title: 'Auth0 Annual Review',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'Auth0 Ireland Ltd',
      vendorId: 'vend_auth0_01',
      processorProfileId: 'proc_auth0_01',
      respondent: { name: 'Sam Auth0', email: 'sam@auth0.example.com', companyName: 'Auth0' },
      requestType: 'recurring_periodic_review',
      status: 'submitted',
      dueDate: futureIso,
      accessCount: 2,
      isRecurring: true,
      recurrenceCadence: 'annual',
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: ['ctrl_vendor_mgmt'],
      linkedEvidenceIds: ['ev_cert_01'],
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
      title: 'AWS Security Review',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'Amazon Web Services EMEA',
      vendorId: 'vend_aws_01',
      processorProfileId: 'proc_aws_01',
      respondent: { name: 'AWS Security', email: 'sec@aws.example.com', companyName: 'AWS' },
      requestType: 'recurring_periodic_review',
      status: 'accepted',
      dueDate: futureIso,
      accessCount: 3,
      isRecurring: true,
      recurrenceCadence: 'annual',
      finalScorePercent: 95,
      overallRiskRating: 'low',
      isCompliant: true,
      ownerUserId: PERSONAS.complianceA.uid,
      linkedSystemAssetIds: [],
      linkedControlIds: ['ctrl_cloud_sec', 'ctrl_vendor_mgmt'],
      linkedEvidenceIds: ['ev_soc2_aws'],
      linkedRiskIds: [],
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: nowIso,
      updatedAt: nowIso,
    },
    {
      id: 'req_04',
      tenantId: tenantA,
      title: 'Legacy Hosting Vendor',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'existing_vendor',
      thirdPartyName: 'OldServer Host',
      vendorId: 'vend_oldhost_01',
      processorProfileId: null,
      respondent: { name: 'Host Tech', email: 'tech@oldhost.example.com', companyName: 'OldServer' },
      requestType: 'custom_deep_dive',
      status: 'rejected',
      dueDate: pastIso,
      accessCount: 1,
      isRecurring: false,
      recurrenceCadence: 'annual',
      finalScorePercent: 40,
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
      id: 'req_05',
      tenantId: tenantA,
      title: 'Marketing Automation Overdue',
      templateId: 'tmpl_01',
      templateSnapshot: {} as any,
      targetType: 'prospective_vendor',
      thirdPartyName: 'LeadBlast Inc',
      vendorId: null,
      processorProfileId: null,
      respondent: { name: 'Sales Lead', email: 'sales@leadblast.example.com', companyName: 'LeadBlast' },
      requestType: 'one_time_due_diligence',
      status: 'in_progress',
      dueDate: pastIso, // Overdue!
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
      title: 'Auth0 Annual Schedule',
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
      nextAssessmentDueDate: pastIso, // Overdue recurring schedule!
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
  // 1. AGGREGATION METRICS CORRECTNESS
  // ---------------------------------------------------------------------------
  describe('1. Summary Metric Aggregations', () => {
    it('accurately aggregates outstanding, waiting review, accepted, rejected, overdue, and linkage counts', () => {
      const metrics = calculateThirdPartyAssessmentSummaryMetrics(
        tenantA,
        mockRequests,
        mockSchedules,
        {
          criticalProcessorProfileIds: ['proc_aws_01'],
          criticalVendorIds: ['vend_stripe_01'],
          nowDate: new Date(nowIso),
        }
      );

      expect(metrics.totalRequestsCount).toBe(5);
      expect(metrics.outstandingRequestsCount).toBe(2); // req_01 (sent), req_05 (in_progress)
      expect(metrics.submittedWaitingReviewCount).toBe(1); // req_02 (submitted)
      expect(metrics.acceptedAssessmentsCount).toBe(1); // req_03 (accepted)
      expect(metrics.rejectedOrFollowUpCount).toBe(1); // req_04 (rejected)
      expect(metrics.overdueResponsesCount).toBe(1); // req_05 (in_progress, past due date)
      expect(metrics.overdueRecurringSchedulesCount).toBe(1); // sched_01 (past due date)
      expect(metrics.criticalProcessorAssessmentsCount).toBe(2); // req_01 (vend_stripe_01) and req_03 (proc_aws_01)
      expect(metrics.controlEvidenceAssessmentsCount).toBe(3); // req_01, req_02, req_03
      expect(metrics.riskTierDistribution.low).toBe(1);
      expect(metrics.riskTierDistribution.critical).toBe(1);
      expect(metrics.riskTierDistribution.unrated).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LIST VIEW FILTER BEHAVIOR
  // ---------------------------------------------------------------------------
  describe('2. List View Filtering Behavior', () => {
    const options = {
      criticalProcessorProfileIds: ['proc_aws_01'],
      criticalVendorIds: ['vend_stripe_01'],
      nowDate: new Date(nowIso),
    };

    it('filters by viewPreset: outstanding', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'outstanding' }, options);
      expect(filtered.length).toBe(2);
      expect(filtered.map((r) => r.id)).toEqual(['req_01', 'req_05']);
    });

    it('filters by viewPreset: waiting_review', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'waiting_review' }, options);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('req_02');
    });

    it('filters by viewPreset: accepted', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'accepted' }, options);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('req_03');
    });

    it('filters by viewPreset: follow_up_needed', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'follow_up_needed' }, options);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('req_04');
    });

    it('filters by viewPreset: overdue', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'overdue' }, options);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('req_05');
    });

    it('filters by viewPreset: critical_processors', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'critical_processors' }, options);
      expect(filtered.length).toBe(2);
      expect(filtered.map((r) => r.id)).toEqual(['req_01', 'req_03']);
    });

    it('filters by viewPreset: control_evidence', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { viewPreset: 'control_evidence' }, options);
      expect(filtered.length).toBe(3);
      expect(filtered.map((r) => r.id)).toEqual(['req_01', 'req_02', 'req_03']);
    });

    it('filters by search term (case-insensitive across name, title, and email)', () => {
      const filtered = filterThirdPartyAssessments(mockRequests, { searchTerm: 'alex@stripe' }, options);
      expect(filtered.length).toBe(1);
      expect(filtered[0]?.id).toBe('req_01');

      const byTitle = filterThirdPartyAssessments(mockRequests, { searchTerm: 'Security Review' }, options);
      expect(byTitle.length).toBe(1);
      expect(byTitle[0]?.id).toBe('req_03');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. FIRESTORE MATERIALIZED SUMMARY READS & ISOLATION
  // ---------------------------------------------------------------------------
  describe('3. Materialized Summary Metrics & Tenant Isolation', () => {
    it('allows Tenant A compliance manager to read summary_metrics/third_party_assessments', async () => {
      const metricsDoc: ThirdPartyAssessmentSummaryMetrics = {
        id: 'third_party_assessments',
        tenantId: tenantA,
        totalRequestsCount: 5,
        outstandingRequestsCount: 2,
        submittedWaitingReviewCount: 1,
        acceptedAssessmentsCount: 1,
        rejectedOrFollowUpCount: 1,
        overdueResponsesCount: 1,
        overdueRecurringSchedulesCount: 1,
        criticalProcessorAssessmentsCount: 2,
        controlEvidenceAssessmentsCount: 3,
        averageComplianceScorePercent: 68,
        riskTierDistribution: { critical: 1, high: 0, medium: 0, low: 1, unrated: 3 },
        lastMaterializedAt: nowIso,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/summary_metrics/third_party_assessments`).set(metricsDoc);
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      const snap = await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/summary_metrics/third_party_assessments`).get()
      );
      expect(snap.exists).toBe(true);
      const data = snap.data() as ThirdPartyAssessmentSummaryMetrics;
      expect(data.outstandingRequestsCount).toBe(2);
      expect(data.acceptedAssessmentsCount).toBe(1);
    });

    it('blocks Tenant B user from reading Tenant A summary metrics', async () => {
      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/summary_metrics/third_party_assessments`).get()
      );
    });

    it('blocks direct client write to summary_metrics', async () => {
      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      await assertFails(
        dbCompliance.doc(`tenants/${tenantA}/summary_metrics/third_party_assessments`).set({
          totalRequestsCount: 999,
        })
      );
    });
  });
});

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  auditActorFromVerifiedContext,
  recordAuditLog,
  VerifiedAuditActor,
} from '../lib/audit.js';
import {
  TenantSummaryMetrics,
  Control,
  Risk,
  Evidence,
  PersonalDataBreach,
  DSRRequest,
  AISystem,
  Issue,
  computeTenantFrameworkCoverage,
  CANONICAL_FRAMEWORKS,
  CANONICAL_REQUIREMENTS,
  TenantApplicabilityDecision,
  TenantRequirementInstance,
  TenantControlInstance,
  StatutoryObligationFlag,
  Framework,
  Requirement,
} from '@eurogovernance/shared-types';

export interface MaterializeMetricsInput {
  tenantId: string;
}

export interface GetMetricsInput {
  tenantId: string;
}

/**
 * Derives and materializes real summary metrics from tenant database records.
 * Saves to /tenants/{tenantId}/summary_metrics/current.
 */
export async function computeAndStoreTenantMetrics(
  tenantId: string,
  auditActor: VerifiedAuditActor
): Promise<TenantSummaryMetrics> {
  const tenantRef = db.collection('tenants').doc(tenantId);

  // 1. Controls Aggregate
  const controlsSnap = await tenantRef.collection('controls').get();
  const controls = controlsSnap.docs.map((d) => d.data() as Control);
  const totalControlsCount = controls.length;
  const implementedControls = controls.filter((c) => c.status === 'implemented');
  const implementedControlsCount = implementedControls.length;

  const frameworkCounts: Record<string, { total: number; implemented: number }> = {
    gdpr: { total: 0, implemented: 0 },
    eu_ai_act: { total: 0, implemented: 0 },
    eu_data_act: { total: 0, implemented: 0 },
    iso_27001: { total: 0, implemented: 0 },
    iso_42001: { total: 0, implemented: 0 },
  };

  controls.forEach((c) => {
    const fws = c.frameworkIds || [];
    fws.forEach((fw) => {
      if (frameworkCounts[fw]) {
        frameworkCounts[fw].total += 1;
        if (c.status === 'implemented') {
          frameworkCounts[fw].implemented += 1;
        }
      }
    });
  });

  const calcPercentage = (implemented: number, total: number) =>
    total > 0 ? Math.round((implemented / total) * 100) : 0;

  const gdprObj = frameworkCounts.gdpr || { total: 0, implemented: 0 };
  const aiActObj = frameworkCounts.eu_ai_act || { total: 0, implemented: 0 };
  const dataActObj = frameworkCounts.eu_data_act || { total: 0, implemented: 0 };
  const iso27Obj = frameworkCounts.iso_27001 || { total: 0, implemented: 0 };
  const iso42Obj = frameworkCounts.iso_42001 || { total: 0, implemented: 0 };

  const frameworkReadiness = {
    gdpr: calcPercentage(gdprObj.implemented, gdprObj.total),
    eu_ai_act: calcPercentage(aiActObj.implemented, aiActObj.total),
    eu_data_act: calcPercentage(dataActObj.implemented, dataActObj.total),
    iso_27001: calcPercentage(iso27Obj.implemented, iso27Obj.total),
    iso_42001: calcPercentage(iso42Obj.implemented, iso42Obj.total),
  };

  const overallComplianceScore = calcPercentage(implementedControlsCount, totalControlsCount);

  // 2. Risks Aggregate
  const risksSnap = await tenantRef.collection('risks').get();
  const risks = risksSnap.docs.map((d) => d.data() as Risk);
  const openRisks = risks.filter((r) => r.status !== 'closed' && r.status !== 'accepted');
  const highOrCriticalRisks = openRisks.filter((r) => r.residualScore >= 12);

  // 3. Evidence Aggregate
  const evidenceSnap = await tenantRef.collection('evidence').get();
  const evidence = evidenceSnap.docs.map((d) => d.data() as Evidence);
  const pendingEvidenceReviews = evidence.filter((e) => e.status === 'under_review');

  // 4. Breaches Aggregate
  const breachesSnap = await tenantRef.collection('breaches').get();
  const breaches = breachesSnap.docs.map((d) => d.data() as PersonalDataBreach);
  const activeBreaches = breaches.filter((b) => b.status === 'suspected' || b.status === 'investigating');

  // 5. DSR Requests Aggregate
  const dsrSnap = await tenantRef.collection('dsr_requests').get();
  const dsrs = dsrSnap.docs.map((d) => d.data() as DSRRequest);
  const openDSRs = dsrs.filter((d) => d.status !== 'completed' && d.status !== 'rejected');

  // 6. AI Systems Aggregate
  const aiSnap = await tenantRef.collection('ai_systems').get();
  const aiSystems = aiSnap.docs.map((d) => d.data() as AISystem);
  const highRiskAISystems = aiSystems.filter((a) => a.riskTier === 'high_risk' || a.riskTier === 'prohibited');

  // 7. Issues Aggregate
  const issuesSnap = await tenantRef.collection('issues').get();
  const issues = issuesSnap.docs.map((d) => d.data() as Issue);
  const openIssues = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');

  const now = new Date().toISOString();

  const metricsDoc: TenantSummaryMetrics = {
    id: 'current',
    tenantId,
    lastMaterializedAt: now,
    totalControlsCount,
    implementedControlsCount,
    overallComplianceScore,
    frameworkReadiness,
    openRisksCount: openRisks.length,
    highOrCriticalRisksCount: highOrCriticalRisks.length,
    pendingEvidenceReviewsCount: pendingEvidenceReviews.length,
    activeBreachesCount: activeBreaches.length,
    openDsrRequestsCount: openDSRs.length,
    registeredAISystemsCount: aiSystems.length,
    highRiskAISystemsCount: highRiskAISystems.length,
    openIssuesCount: openIssues.length,
  };

  await tenantRef.collection('summary_metrics').doc('current').set(metricsDoc);

  await recordAuditLog({
    tenantId,
    ...auditActorFromVerifiedContext(auditActor),
    entityType: 'summary_metrics',
    entityId: 'current',
    action: 'update',
    afterSummary: {
      overallComplianceScore,
      totalControlsCount,
      implementedControlsCount,
      openRisksCount: metricsDoc.openRisksCount,
    },
    source: 'cloud_function',
    workflowContext: 'metrics_materialization',
  });

  return metricsDoc;
}

/**
 * Callable Function: materializeTenantMetrics
 * Triggers on-demand materialization of summary metrics for governance managers
 */
export const materializeTenantMetrics = onCall<MaterializeMetricsInput>(async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const metrics = await computeAndStoreTenantMetrics(tenantId, authContext);
  return { success: true, metrics };
});

/**
 * Callable Function: getTenantSummaryMetrics
 * Retrieves the latest materialized metrics without mutating tenant state.
 * Materialization is a separate manager-only command.
 */
export const getTenantSummaryMetrics = onCall<GetMetricsInput>(async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  const metricsRef = db.collection('tenants').doc(tenantId).collection('summary_metrics').doc('current');
  const snap = await metricsRef.get();

  if (snap.exists) {
    return { success: true, metrics: snap.data() as TenantSummaryMetrics };
  }

  return { success: true, metrics: null, materialized: false };
});

/**
 * Callable Function: getTenantFrameworkCoverageDashboard
 * Real derivation of multi-framework coverage, requirements status, harmonized controls, and gap indicators.
 */
export const getTenantFrameworkCoverageDashboard = onCall<GetMetricsInput>(async (request) => {
  const { tenantId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  const tenantRef = db.collection('tenants').doc(tenantId);

  // 1. Fetch Adopted Frameworks
  const adoptedSnap = await tenantRef.collection('adopted_frameworks').get();
  const adoptedFrameworkIds: string[] = [];
  for (const doc of adoptedSnap.docs) {
    const data = doc.data();
    if (data.frameworkId) {
      adoptedFrameworkIds.push(data.frameworkId);
    }
  }

  // 2. Fetch Applicability Decisions
  const decisionsSnap = await tenantRef.collection('applicability_decisions').get();
  const decisions = decisionsSnap.docs.map((d) => d.data() as TenantApplicabilityDecision);

  // 3. Fetch Requirement Instances
  const reqInstancesSnap = await tenantRef.collection('requirement_instances').get();
  const requirementInstances = reqInstancesSnap.docs.map((d) => d.data() as TenantRequirementInstance);

  // 4. Fetch Tenant Controls
  const controlsSnap = await tenantRef.collection('controls').get();
  const controls = controlsSnap.docs.map((d) => d.data() as (TenantControlInstance | Control));

  // 5. Fetch Evidence
  const evidenceSnap = await tenantRef.collection('evidence').get();
  const evidence = evidenceSnap.docs.map((d) => d.data() as Evidence);

  // 6. Fetch Statutory Obligations
  const obligationsSnap = await tenantRef.collection('statutory_obligations').get();
  const statutoryObligations = obligationsSnap.docs.map((d) => d.data() as StatutoryObligationFlag);

  // 7. Load Master Frameworks and Requirements (with fallback to canonical data)
  let frameworks: Framework[] = [];
  const frameworksSnap = await db.collection('frameworks').get();
  if (!frameworksSnap.empty) {
    frameworks = frameworksSnap.docs.map((d) => d.data() as Framework);
  } else {
    frameworks = CANONICAL_FRAMEWORKS;
  }

  let requirements: Requirement[] = [];
  const reqsGroupSnap = await db.collectionGroup('requirements').get();
  if (!reqsGroupSnap.empty) {
    requirements = reqsGroupSnap.docs.map((d) => d.data() as Requirement);
  } else {
    requirements = CANONICAL_REQUIREMENTS;
  }

  // 8. Compute Coverage Dashboard Data
  const coverageData = computeTenantFrameworkCoverage({
    tenantId,
    adoptedFrameworkIds,
    frameworks,
    requirements,
    decisions,
    requirementInstances,
    controls,
    evidence,
    statutoryObligations,
  });

  return { success: true, coverage: coverageData };
});

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type {
  QuerySnapshot,
  Transaction,
} from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  auditActorFromVerifiedContext,
  appendAuditLogInTransaction,
  VerifiedAuditActor,
} from '../lib/audit.js';
import {
  AUTHORITATIVE_CALLABLE_OPTIONS,
  stableTrustedValueHash,
} from '../lib/command-boundary.js';
import {
  verifyControlCurrentArtifact,
  type ControlTrustResult,
} from './controls.js';
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

const MAX_TENANT_AGGREGATE_RECORDS = 1_000;
const MAX_ADOPTED_FRAMEWORKS = 50;
const MAX_MASTER_FRAMEWORKS = 100;
const MAX_MASTER_REQUIREMENTS = 5_000;
const MAX_MATERIALIZED_METRICS_AGE_MS = 5 * 60 * 1_000;

async function boundedSnapshot(
  query: FirebaseFirestore.Query,
  maximum: number,
  label: string,
  transaction?: Transaction
): Promise<FirebaseFirestore.QuerySnapshot> {
  const boundedQuery = query.limit(maximum + 1);
  const snapshot = transaction
    ? await transaction.get(boundedQuery)
    : await boundedQuery.get();
  if (snapshot.size > maximum) {
    throw new HttpsError(
      'resource-exhausted',
      `${label} exceeds the bounded synchronous metrics limit.`
    );
  }
  return snapshot;
}

function projectControlsForCoverage(
  controls: (TenantControlInstance | Control)[],
  trust: ControlTrustResult[]
): (TenantControlInstance | Control)[] {
  return controls
    .map((control, index) => {
      const result = trust[index]!;
      const governed = control as Control;
      if (result.workflowTrusted && result.assuranceTrusted) {
        return {
          ...control,
          currentArtifactVerified: true,
          assuranceTrusted: true,
        };
      }
      return {
        ...control,
        currentArtifactVerified: result.workflowTrusted,
        assuranceTrusted: false,
        status:
          control.status === 'implemented' ||
          control.status === 'partially_implemented'
            ? ('in_progress' as const)
            : control.status,
        healthScore: 0,
        workflowTrust: result.workflowTrusted
          ? governed.workflowTrust
          : ('legacy_unverified' as const),
        assuranceStatus:
          result.assuranceReason === 'expired'
            ? ('expired' as const)
            : governed.assuranceStatus === 'pending_review' &&
                result.workflowTrusted
              ? ('pending_review' as const)
              : ('untested' as const),
      };
    })
    .filter((control) => !(control as Control).retiredAt);
}

function independentlyReviewedEvidence(evidence: Evidence[]): Evidence[] {
  return evidence.filter(
    (item) =>
      typeof item.createdBy === 'string' &&
      typeof item.reviewedBy === 'string' &&
      item.reviewedBy.length > 0 &&
      item.reviewedBy !== item.createdBy &&
      typeof item.reviewedAt === 'string' &&
      Number.isFinite(Date.parse(item.reviewedAt))
  );
}

interface MetricsSourceSnapshots {
  controls: QuerySnapshot;
  adoptedFrameworks: QuerySnapshot;
  applicabilityDecisions: QuerySnapshot;
  requirementInstances: QuerySnapshot;
  evidence: QuerySnapshot;
  statutoryObligations: QuerySnapshot;
  frameworks: QuerySnapshot;
  requirements: QuerySnapshot;
  risks: QuerySnapshot;
  breaches: QuerySnapshot;
  dataSubjectRequests: QuerySnapshot;
  aiSystems: QuerySnapshot;
  issues: QuerySnapshot;
}

async function loadMetricsSourceSnapshots(
  tenantRef: FirebaseFirestore.DocumentReference,
  transaction?: Transaction
): Promise<MetricsSourceSnapshots> {
  const [
    controls,
    adoptedSnapshot,
    decisionsSnapshot,
    requirementInstancesSnapshot,
    evidenceSnapshot,
    obligationsSnapshot,
    frameworksSnapshot,
    requirementsSnapshot,
    risks,
    breaches,
    dataSubjectRequests,
    aiSystems,
    issues,
  ] = await Promise.all([
    boundedSnapshot(
      tenantRef.collection('controls'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Control register',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('adopted_frameworks'),
      MAX_ADOPTED_FRAMEWORKS,
      'Adopted frameworks',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('applicability_decisions'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Applicability decisions',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('requirement_instances'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Requirement instances',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('evidence'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Evidence records',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('statutory_obligations'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Statutory obligations',
      transaction
    ),
    boundedSnapshot(
      db.collection('frameworks'),
      MAX_MASTER_FRAMEWORKS,
      'Master frameworks',
      transaction
    ),
    boundedSnapshot(
      db.collectionGroup('requirements'),
      MAX_MASTER_REQUIREMENTS,
      'Master requirements',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('risks'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Risk register',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('breaches'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Breach register',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('dsr_requests'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Data subject request register',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('ai_systems'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'AI system register',
      transaction
    ),
    boundedSnapshot(
      tenantRef.collection('issues'),
      MAX_TENANT_AGGREGATE_RECORDS,
      'Issue register',
      transaction
    ),
  ]);

  return {
    controls,
    adoptedFrameworks: adoptedSnapshot,
    applicabilityDecisions: decisionsSnapshot,
    requirementInstances: requirementInstancesSnapshot,
    evidence: evidenceSnapshot,
    statutoryObligations: obligationsSnapshot,
    frameworks: frameworksSnapshot,
    requirements: requirementsSnapshot,
    risks,
    breaches,
    dataSubjectRequests,
    aiSystems,
    issues,
  };
}

function metricsSourceFingerprint(sources: MetricsSourceSnapshots): string {
  const documentVersions = (Object.keys(sources) as Array<keyof MetricsSourceSnapshots>).map((source) => ({
    source,
    documents: sources[source].docs.map((document: FirebaseFirestore.QueryDocumentSnapshot) => ({
      path: document.ref.path,
      updateSeconds: document.updateTime?.seconds ?? null,
      updateNanoseconds: document.updateTime?.nanoseconds ?? null,
    })),
  }));
  return stableTrustedValueHash(
    documentVersions,
    'summary metrics source snapshot'
  );
}

function coverageContextFromSources(sources: MetricsSourceSnapshots): {
  adoptedFrameworkIds: string[];
  decisions: TenantApplicabilityDecision[];
  requirementInstances: TenantRequirementInstance[];
  evidence: Evidence[];
  allEvidence: Evidence[];
  statutoryObligations: StatutoryObligationFlag[];
  frameworks: Framework[];
  requirements: Requirement[];
} {
  const allEvidence = sources.evidence.docs.map(
    (document) => document.data() as Evidence
  );

  return {
    adoptedFrameworkIds: sources.adoptedFrameworks.docs.flatMap((document) => {
      const adoption = document.data();
      const frameworkId = adoption.frameworkId;
      return adoption.tenantId === document.ref.parent.parent?.id &&
        frameworkId === document.id &&
        ['in_scoping', 'adopted', 'active', 'under_audit'].includes(
          String(adoption.status)
        )
        ? [frameworkId]
        : [];
    }),
    decisions: sources.applicabilityDecisions.docs.map(
      (document) => document.data() as TenantApplicabilityDecision
    ),
    requirementInstances: sources.requirementInstances.docs.map(
      (document) => document.data() as TenantRequirementInstance
    ),
    evidence: independentlyReviewedEvidence(allEvidence),
    allEvidence,
    statutoryObligations: sources.statutoryObligations.docs.map(
      (document) => document.data() as StatutoryObligationFlag
    ),
    frameworks: sources.frameworks.empty
      ? CANONICAL_FRAMEWORKS
      : sources.frameworks.docs.map(
          (document) => document.data() as Framework
        ),
    requirements: sources.requirements.empty
      ? CANONICAL_REQUIREMENTS
      : sources.requirements.docs.map(
          (document) => document.data() as Requirement
        ),
  };
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
  const calculationAsOf = new Date().toISOString();
  const calculationAsOfMillis = Date.parse(calculationAsOf);
  const sources = await loadMetricsSourceSnapshots(tenantRef);
  const sourceFingerprint = metricsSourceFingerprint(sources);

  // 1. Controls Aggregate
  const controlsSnap = sources.controls;
  const controls = controlsSnap.docs.map((d) => d.data() as Control);
  const controlTrust = await Promise.all(
    controlsSnap.docs.map((document) =>
      verifyControlCurrentArtifact(tenantId, document, calculationAsOf)
    )
  );
  const activeApplicableControls = controls.filter((control, index) => {
    const trust = controlTrust[index]!;
    return (
      !control.retiredAt &&
      !(
        trust.workflowTrusted &&
        trust.assuranceReason === 'not_required' &&
        control.status === 'not_applicable'
      )
    );
  });
  const totalControlsCount = activeApplicableControls.length;
  const implementedControls = controls.filter(
    (control, index) =>
      !control.retiredAt &&
      control.status === 'implemented' &&
      controlTrust[index]?.assuranceTrusted === true
  );
  const implementedControlsCount = implementedControls.length;

  const coverageContext = coverageContextFromSources(sources);
  const risksSnap = sources.risks;
  const breachesSnap = sources.breaches;
  const dsrSnap = sources.dataSubjectRequests;
  const aiSnap = sources.aiSystems;
  const issuesSnap = sources.issues;

  const coverage = computeTenantFrameworkCoverage({
    tenantId,
    adoptedFrameworkIds: coverageContext.adoptedFrameworkIds,
    frameworks: coverageContext.frameworks,
    requirements: coverageContext.requirements,
    decisions: coverageContext.decisions,
    requirementInstances: coverageContext.requirementInstances,
    controls: projectControlsForCoverage(controls, controlTrust),
    evidence: coverageContext.evidence,
    statutoryObligations: coverageContext.statutoryObligations,
  });
  const readinessByFramework = new Map(
    coverage.frameworks.map((framework) => [
      framework.frameworkId,
      framework.isAdopted ? framework.readinessPercentage : 0,
    ])
  );
  const frameworkReadiness = {
    gdpr: readinessByFramework.get('gdpr') ?? 0,
    eu_ai_act: readinessByFramework.get('eu_ai_act') ?? 0,
    eu_data_act: readinessByFramework.get('eu_data_act') ?? 0,
    iso_27001: readinessByFramework.get('iso_27001') ?? 0,
    iso_42001: readinessByFramework.get('iso_42001') ?? 0,
  };
  const overallComplianceScore = coverage.overallReadinessScore;

  // 2. Risks Aggregate
  const risks = risksSnap.docs.map((d) => d.data() as Risk);
  const openRisks = risks.filter((r) => r.status !== 'closed' && r.status !== 'accepted');
  const highOrCriticalRisks = openRisks.filter((r) => r.residualScore >= 12);

  // 3. Evidence Aggregate
  const evidence = coverageContext.allEvidence;
  const pendingEvidenceReviews = evidence.filter((e) => e.status === 'under_review');

  // 4. Breaches Aggregate
  const breaches = breachesSnap.docs.map((d) => d.data() as PersonalDataBreach);
  const activeBreaches = breaches.filter((b) => b.status === 'suspected' || b.status === 'investigating');

  // 5. DSR Requests Aggregate
  const dsrs = dsrSnap.docs.map((d) => d.data() as DSRRequest);
  const openDSRs = dsrs.filter((d) => d.status !== 'completed' && d.status !== 'rejected');

  // 6. AI Systems Aggregate
  const aiSystems = aiSnap.docs.map((d) => d.data() as AISystem);
  const highRiskAISystems = aiSystems.filter((a) => a.riskTier === 'high_risk' || a.riskTier === 'prohibited');

  // 7. Issues Aggregate
  const issues = issuesSnap.docs.map((d) => d.data() as Issue);
  const openIssues = issues.filter((i) => i.status !== 'resolved' && i.status !== 'closed');

  const now = new Date().toISOString();
  const nowMillis = Date.parse(now);
  const timeSensitiveDeadlines = [
    ...controls.flatMap((control, index) => {
      const trust = controlTrust[index]!;
      if (!trust.assuranceTrusted && trust.assuranceReason !== 'not_required') return [];
      const deadline = Date.parse(control.nextReviewDate ?? '');
      return Number.isFinite(deadline) && deadline >= calculationAsOfMillis
        ? [deadline]
        : [];
    }),
    ...coverageContext.evidence.flatMap((evidenceRecord) => {
      const deadline = Date.parse(evidenceRecord.reviewDueDate ?? '');
      return Number.isFinite(deadline) && deadline >= calculationAsOfMillis
        ? [deadline]
        : [];
    }),
  ];
  const validUntilMillis = Math.min(
    nowMillis + MAX_MATERIALIZED_METRICS_AGE_MS,
    ...timeSensitiveDeadlines
  );
  const validUntil = new Date(validUntilMillis).toISOString();

  const metricsDoc: TenantSummaryMetrics = {
    id: 'current',
    tenantId,
    lastMaterializedAt: now,
    validUntil,
    sourceFingerprint,
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

  await db.runTransaction(async (transaction) => {
    const metricsRef = tenantRef.collection('summary_metrics').doc('current');
    const currentSources = await loadMetricsSourceSnapshots(tenantRef, transaction);
    if (metricsSourceFingerprint(currentSources) !== sourceFingerprint) {
      throw new HttpsError(
        'aborted',
        'Governance records changed while metrics were being calculated. Retry materialization against the new snapshot.'
      );
    }
    const previous = await transaction.get(metricsRef);
    transaction.set(metricsRef, metricsDoc);
    appendAuditLogInTransaction(transaction, {
      tenantId,
      ...auditActorFromVerifiedContext(auditActor),
      entityType: 'summary_metrics',
      entityId: 'current',
      action: 'update',
      beforeSummary: previous.exists ? previous.data() || null : null,
      afterSummary: {
        overallComplianceScore,
        totalControlsCount,
        implementedControlsCount,
        openRisksCount: metricsDoc.openRisksCount,
        sourceFingerprint,
        validUntil,
      },
      source: 'cloud_function',
      workflowContext: 'metrics_materialization_stable_verified_source_snapshot',
    });
  });

  return metricsDoc;
}

/**
 * Callable Function: materializeTenantMetrics
 * Triggers on-demand materialization of summary metrics for governance managers
 */
export const materializeTenantMetrics = onCall<MaterializeMetricsInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
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
export const getTenantSummaryMetrics = onCall<GetMetricsInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const { tenantId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  const metricsRef = db.collection('tenants').doc(tenantId).collection('summary_metrics').doc('current');
  const snap = await metricsRef.get();

  if (snap.exists) {
    const metrics = snap.data() as Partial<TenantSummaryMetrics>;
    const validUntilMillis = Date.parse(metrics.validUntil ?? '');
    if (Number.isFinite(validUntilMillis) && validUntilMillis > Date.now()) {
      return { success: true, metrics: metrics as TenantSummaryMetrics };
    }
    return { success: true, metrics: null, materialized: true, expired: true };
  }

  return { success: true, metrics: null, materialized: false };
});

/**
 * Callable Function: getTenantFrameworkCoverageDashboard
 * Real derivation of multi-framework coverage, requirements status, harmonized controls, and gap indicators.
 */
export const getTenantFrameworkCoverageDashboard = onCall<GetMetricsInput>(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const { tenantId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  const tenantRef = db.collection('tenants').doc(tenantId);

  const sources = await loadMetricsSourceSnapshots(tenantRef);
  const coverageContext = coverageContextFromSources(sources);
  const controlsSnap = sources.controls;
  const rawControls = controlsSnap.docs.map((d) => d.data() as (TenantControlInstance | Control));
  const trust = await Promise.all(
    controlsSnap.docs.map((document) =>
      verifyControlCurrentArtifact(tenantId, document)
    )
  );
  const controls = projectControlsForCoverage(rawControls, trust);

  // 8. Compute Coverage Dashboard Data
  const coverageData = computeTenantFrameworkCoverage({
    tenantId,
    adoptedFrameworkIds: coverageContext.adoptedFrameworkIds,
    frameworks: coverageContext.frameworks,
    requirements: coverageContext.requirements,
    decisions: coverageContext.decisions,
    requirementInstances: coverageContext.requirementInstances,
    controls,
    evidence: coverageContext.evidence,
    statutoryObligations: coverageContext.statutoryObligations,
  });

  return { success: true, coverage: coverageData };
});

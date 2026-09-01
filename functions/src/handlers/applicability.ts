import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  appendAuditLogInBatch,
  appendAuditLogInTransaction,
} from '../lib/audit.js';
import { AUTHORITATIVE_CALLABLE_OPTIONS } from '../lib/command-boundary.js';
import {
  ControlTrustResult,
  verifyControlCurrentArtifact,
} from './controls.js';
import {
  ApplicabilityRule,
  TenantScopeFact,
  TenantApplicabilityDecision,
  RequirementApplicability,
  TenantRequirementInstance,
  TenantControlInstance,
  evaluateApplicabilityRule,
  evaluateFrameworkApplicabilityRules,
  validateApplicabilityRule,
  instantiateTenantGRC,
  buildControlCoverageSummary,
  deriveStatutoryObligations,
  applyApplicabilityOverride,
  revertApplicabilityOverride,
  ApplicabilityStatus,
  CANONICAL_APPLICABILITY_RULES,
  CANONICAL_MASTER_DATA,
  Control,
  ControlImplementationStatus,
  Framework,
  Requirement,
  CanonicalControlMapping,
} from '@eurogovernance/shared-types';

const COMPLIANCE_WRITE_ROLES = [
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
] as const;

export interface EvaluateTenantApplicabilityInput {
  tenantId: string;
  frameworkId?: string;
  overrideExistingDecisions?: boolean;
}

export interface TestRuleEvaluationInput {
  tenantId: string;
  rule: ApplicabilityRule;
}

const COVERAGE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CONTROL_LIST_PAGE_SIZE_DEFAULT = 50;
const CONTROL_LIST_PAGE_SIZE_MAX = 100;
const COVERAGE_LIBRARY_QUERY_LIMIT = 200;
const CONTROL_IMPLEMENTATION_STATUSES = new Set<ControlImplementationStatus>([
  'not_started',
  'in_progress',
  'partially_implemented',
  'implemented',
  'not_applicable',
]);

function requireCoverageId(value: unknown, fieldName: string): string {
  if (typeof value !== 'string' || !COVERAGE_ID_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', `${fieldName} is invalid.`);
  }
  return value;
}

function optionalCoverageId(value: unknown, fieldName: string): string | undefined {
  return value === undefined || value === null || value === ''
    ? undefined
    : requireCoverageId(value, fieldName);
}

function boundedText(value: unknown, fallback: string, maximumLength: number): string {
  if (typeof value !== 'string') return fallback;
  const normalized = value.trim();
  return normalized.length > 0 && normalized.length <= maximumLength
    ? normalized
    : fallback;
}

function boundedIds(value: unknown, maximumItems: number): string[] {
  if (!Array.isArray(value) || value.length > maximumItems) return [];
  const result: string[] = [];
  for (const candidate of value) {
    if (typeof candidate !== 'string' || !COVERAGE_ID_PATTERN.test(candidate)) return [];
    if (!result.includes(candidate)) result.push(candidate);
  }
  return result.sort();
}

function truthfulControlProjection(
  document: FirebaseFirestore.DocumentSnapshot,
  trust: ControlTrustResult
): Record<string, unknown> {
  const raw = document.data() as Partial<Control> | undefined;
  const recordedStatus = CONTROL_IMPLEMENTATION_STATUSES.has(raw?.status as ControlImplementationStatus)
    ? (raw?.status as ControlImplementationStatus)
    : 'not_started';
  const status =
    trust.assuranceTrusted ||
    (recordedStatus !== 'implemented' && recordedStatus !== 'partially_implemented')
      ? recordedStatus
      : 'in_progress';
  const frameworkIds = trust.workflowTrusted ? boundedIds(raw?.frameworkIds, 10) : [];
  const requirementIds = trust.workflowTrusted ? boundedIds(raw?.requirementIds, 20) : [];
  const workflowTrust = trust.workflowTrusted
    ? raw?.workflowTrust ?? 'governed_unassured'
    : 'legacy_unverified';
  const assuranceStatus = trust.assuranceTrusted
    ? raw?.assuranceStatus ?? 'effective'
    : trust.assuranceReason === 'expired'
      ? 'expired'
      : raw?.assuranceStatus === 'not_applicable' && trust.workflowTrusted
        ? 'not_applicable'
        : raw?.assuranceStatus === 'pending_review' && trust.workflowTrusted
          ? 'pending_review'
          : 'untested';

  return {
    id: document.id,
    code: boundedText(raw?.code, 'UNVERIFIED', 64),
    title: boundedText(raw?.title, 'Unverified control record', 240),
    domain: boundedText(raw?.domain, 'unverified', 80),
    frameworkIds,
    requirementIds,
    status,
    recordedStatus,
    healthScore:
      trust.assuranceTrusted && typeof raw?.healthScore === 'number'
        ? Math.min(100, Math.max(0, raw.healthScore))
        : 0,
    workflowTrust,
    assuranceStatus,
    assuranceReason: trust.assuranceReason,
    currentArtifactVerified: trust.workflowTrusted,
    assuranceTrusted: trust.assuranceTrusted,
    isHarmonized: frameworkIds.length > 1,
    lastReviewDate: trust.assuranceTrusted ? raw?.lastReviewDate ?? null : null,
    nextReviewDate: trust.workflowTrusted ? raw?.nextReviewDate ?? null : null,
    retiredAt: trust.workflowTrusted ? raw?.retiredAt ?? null : null,
  };
}

async function loadCoverageLibrary(
  frameworkIds: string[],
  requirementIds: string[]
): Promise<{
  frameworks: Framework[];
  requirements: Requirement[];
  canonicalMappings: CanonicalControlMapping[];
}> {
  if (frameworkIds.length > 10 || requirementIds.length > 20) {
    throw new HttpsError(
      'resource-exhausted',
      'The control mapping exceeds the bounded coverage-report limit.'
    );
  }

  const canonicalFrameworks = new Map(
    CANONICAL_MASTER_DATA.frameworks.map((framework) => [framework.id, framework])
  );
  const canonicalRequirements = new Map(
    CANONICAL_MASTER_DATA.requirements.map((requirement) => [requirement.id, requirement])
  );
  const frameworkRefs = frameworkIds.map((frameworkId) =>
    db.doc(`frameworks/${frameworkId}`)
  );
  const requirementRefs = requirementIds.flatMap((requirementId) =>
    frameworkIds.map((frameworkId) =>
      db.doc(`frameworks/${frameworkId}/requirements/${requirementId}`)
    )
  );
  const snapshots =
    frameworkRefs.length + requirementRefs.length > 0
      ? await db.getAll(...frameworkRefs, ...requirementRefs)
      : [];
  const frameworks = frameworkIds.flatMap((frameworkId, index) => {
    const snapshot = snapshots[index];
    const data = snapshot?.data() as Framework | undefined;
    if (
      snapshot?.exists &&
      (data?.id === undefined || data.id === frameworkId)
    ) {
      return [{ ...data, id: frameworkId } as Framework];
    }
    const canonical = canonicalFrameworks.get(frameworkId);
    return canonical ? [canonical] : [];
  });
  const requirementOffset = frameworkRefs.length;
  const requirements = requirementIds.flatMap((requirementId, requirementIndex) => {
    for (let frameworkIndex = 0; frameworkIndex < frameworkIds.length; frameworkIndex++) {
      const snapshot = snapshots[
        requirementOffset + requirementIndex * frameworkIds.length + frameworkIndex
      ];
      const data = snapshot?.data() as Requirement | undefined;
      const frameworkId = frameworkIds[frameworkIndex]!;
      if (
        snapshot?.exists &&
        (data?.id === undefined || data.id === requirementId) &&
        (data?.frameworkId === undefined || data.frameworkId === frameworkId)
      ) {
        return [{ ...data, id: requirementId, frameworkId } as Requirement];
      }
    }
    const canonical = canonicalRequirements.get(requirementId);
    return canonical && frameworkIds.includes(canonical.frameworkId) ? [canonical] : [];
  });

  const canonicalMappings = CANONICAL_MASTER_DATA.canonicalControlMappings.filter(
    (mapping) =>
      requirementIds.includes(mapping.sourceRequirementId) ||
      requirementIds.includes(mapping.targetRequirementId)
  );
  if (requirementIds.length === 0) {
    return { frameworks, requirements, canonicalMappings };
  }
  const [sourceMappings, targetMappings] = await Promise.all([
    db
      .collection('control_mappings')
      .where('sourceRequirementId', 'in', requirementIds)
      .limit(COVERAGE_LIBRARY_QUERY_LIMIT + 1)
      .get(),
    db
      .collection('control_mappings')
      .where('targetRequirementId', 'in', requirementIds)
      .limit(COVERAGE_LIBRARY_QUERY_LIMIT + 1)
      .get(),
  ]);
  if (
    sourceMappings.size > COVERAGE_LIBRARY_QUERY_LIMIT ||
    targetMappings.size > COVERAGE_LIBRARY_QUERY_LIMIT
  ) {
    throw new HttpsError(
      'resource-exhausted',
      'The canonical mapping set exceeds the bounded coverage-report limit.'
    );
  }
  const mappingsById = new Map(canonicalMappings.map((mapping) => [mapping.id, mapping]));
  for (const document of [...sourceMappings.docs, ...targetMappings.docs]) {
    const data = document.data() as CanonicalControlMapping;
    if (
      (data.id === undefined || data.id === document.id) &&
      (requirementIds.includes(data.sourceRequirementId) ||
        requirementIds.includes(data.targetRequirementId))
    ) {
      mappingsById.set(document.id, { ...data, id: document.id });
    }
  }
  return {
    frameworks,
    requirements,
    canonicalMappings: [...mappingsById.values()],
  };
}

/**
 * 1. Evaluate Applicability Rules for a Tenant and Synchronize Decisions & Requirements
 */
export const evaluateTenantApplicability = onCall<EvaluateTenantApplicabilityInput>(async (request) => {
  const { tenantId, frameworkId } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);
  const tenantRef = db.collection('tenants').doc(tenantId);

  // Applicability is evaluated only for explicitly adopted, non-retired
  // frameworks. An empty adoption set must never silently activate every
  // canonical regulatory regime.
  const adoptedSnap = await tenantRef.collection('adopted_frameworks').get();
  const adoptedFrameworkIds = new Set(
    adoptedSnap.docs
      .filter((doc) => doc.data().status !== 'retired')
      .map((doc) => String(doc.data().frameworkId || doc.id))
  );
  if (frameworkId && !adoptedFrameworkIds.has(frameworkId)) {
    throw new HttpsError(
      'failed-precondition',
      `Framework '${frameworkId}' must be adopted before applicability can be evaluated.`
    );
  }
  const evaluatedFrameworkIds = frameworkId
    ? new Set([frameworkId])
    : adoptedFrameworkIds;
  if (evaluatedFrameworkIds.size === 0) {
    throw new HttpsError(
      'failed-precondition',
      'Adopt at least one framework before running applicability evaluation.'
    );
  }

  // 1. Fetch all tenant scope facts
  const factsSnap = await tenantRef.collection('scope_facts').get();
  const factsMap: Record<string, TenantScopeFact> = {};
  for (const doc of factsSnap.docs) {
    factsMap[doc.id] = doc.data() as TenantScopeFact;
  }

  // 2. Fetch applicability rules
  let rulesSnap: FirebaseFirestore.QuerySnapshot;
  if (frameworkId) {
    rulesSnap = await db.collection('applicability_rules').where('frameworkId', '==', frameworkId).get();
  } else {
    rulesSnap = await db.collection('applicability_rules').get();
  }

  let rules: ApplicabilityRule[] = [];
  if (!rulesSnap.empty) {
    rules = rulesSnap.docs.map((d) => d.data() as ApplicabilityRule);
  } else {
    rules = frameworkId
      ? CANONICAL_APPLICABILITY_RULES.filter((r) => r.frameworkId === frameworkId)
      : CANONICAL_APPLICABILITY_RULES;
  }
  rules = rules.filter((rule) => evaluatedFrameworkIds.has(rule.frameworkId));
  if (rules.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No applicability rules are available for the selected adopted framework scope.'
    );
  }

  // 3. Evaluate rules
  const evaluationResults = evaluateFrameworkApplicabilityRules(rules, factsMap);
  const now = new Date().toISOString();
  const batch = db.batch();
  const [existingDecisionsSnap, existingRequirementApplicabilitySnap] = await Promise.all([
    tenantRef.collection('applicability_decisions').get(),
    tenantRef.collection('requirement_applicability').get(),
  ]);
  const existingDecisions = new Map(
    existingDecisionsSnap.docs.map((doc) => [doc.id, doc.data() as TenantApplicabilityDecision])
  );
  const existingRequirementApplicability = new Map(
    existingRequirementApplicabilitySnap.docs.map((doc) => [
      doc.id,
      doc.data() as RequirementApplicability,
    ])
  );
  let preservedOverrideCount = 0;

  for (const res of evaluationResults) {
    const isApplicable = !['not_applicable', 'deferred', 'pending_evaluation'].includes(
      res.resultingOutcome
    );

    const decisionRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('applicability_decisions')
      .doc(res.targetRequirementId);

    const existingDecision = existingDecisions.get(res.targetRequirementId);
    const isProtectedOverride =
      existingDecision?.isOverridden === true ||
      existingDecision?.decisionSource === 'user_override' ||
      existingDecision?.decisionSource === 'reviewer_override' ||
      existingDecision?.applicabilityType === 'manual_exclusion' ||
      existingDecision?.applicabilityType === 'manual_inclusion';
    if (isProtectedOverride) {
      preservedOverrideCount += 1;
      continue;
    }

    const decisionPayload: TenantApplicabilityDecision = {
      ...existingDecision,
      id: res.targetRequirementId,
      tenantId,
      ownerId: existingDecision?.ownerId || authCtx.userId,
      requirementId: res.targetRequirementId,
      frameworkId: res.frameworkId,
      sectionCode: res.targetRequirementId,
      requirementTitle: res.ruleName,
      isApplicable,
      status: res.resultingOutcome,
      applicabilityType: 'rule_derived',
      decisionSource: 'auto',
      isOverridden: false,
      autoResult: {
        isApplicable,
        status: res.resultingOutcome,
        matchedRuleId: res.ruleId,
        ruleEvaluationSummary: res.explanation,
        evaluatedAt: now,
      },
      matchedRuleId: res.ruleId,
      ruleEvaluationSummary: res.explanation,
      rationale: res.explanation,
      overrideReason: null,
      previousStatus: existingDecision?.status || null,
      assessedBy: authCtx.userId,
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      history: existingDecision?.history || [],
      createdAt: existingDecision?.createdAt || now,
      updatedAt: now,
      createdBy: existingDecision?.createdBy || authCtx.userId,
      updatedBy: authCtx.userId,
    };

    batch.set(decisionRef, decisionPayload);

    // Update /tenants/{tenantId}/requirement_applicability/{reqId}
    const reqAppRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('requirement_applicability')
      .doc(res.targetRequirementId);

    const existingReqApp = existingRequirementApplicability.get(res.targetRequirementId);
    const reqAppUpdate: RequirementApplicability = {
      ...existingReqApp,
      id: res.targetRequirementId,
      tenantId,
      ownerId: existingReqApp?.ownerId || authCtx.userId,
      requirementId: res.targetRequirementId,
      frameworkId: res.frameworkId,
      sectionCode: res.targetRequirementId,
      requirementTitle: res.ruleName,
      isApplicable,
      status: res.resultingOutcome,
      justification: res.explanation,
      scopingNotes: existingReqApp?.scopingNotes || '',
      assessedBy: authCtx.userId,
      assessedAt: now,
      createdAt: existingReqApp?.createdAt || now,
      updatedAt: now,
      createdBy: existingReqApp?.createdBy || authCtx.userId,
      updatedBy: authCtx.userId,
    };

    batch.set(reqAppRef, reqAppUpdate);
  }

  appendAuditLogInBatch(batch, {
    tenantId,
    actorId: authCtx.userId,
    actorEmail: authCtx.email,
    actorRole: authCtx.role,
    entityType: 'applicability_decision',
    entityId: frameworkId || 'all_frameworks',
    action: 'update',
    afterSummary: {
      rulesEvaluated: evaluationResults.length,
      matchedCount: evaluationResults.filter((r) => r.matched).length,
      frameworkId: frameworkId || 'all',
      evaluatedFrameworkIds: Array.from(evaluatedFrameworkIds),
      preservedOverrideCount,
    },
    source: 'cloud_function',
    workflowContext: `Automated applicability evaluation for ${evaluationResults.length} statutory rules`,
  });
  await batch.commit();

  return {
    success: true,
    totalEvaluated: evaluationResults.length,
    matchedCount: evaluationResults.filter((r) => r.matched).length,
    preservedOverrideCount,
    results: evaluationResults,
  };
});

/**
 * 2. Test Single Rule Evaluation in Sandbox (Dry-Run)
 */
export const testRuleEvaluation = onCall<TestRuleEvaluationInput>(async (request) => {
  const { tenantId, rule } = request.data || {};

  if (!tenantId || !rule) {
    throw new HttpsError('invalid-argument', 'tenantId and rule payload are required.');
  }

  await requireTenantMember(request, tenantId);

  const validation = validateApplicabilityRule(rule);
  if (!validation.valid) {
    throw new HttpsError('invalid-argument', `Invalid rule schema: ${validation.error}`);
  }

  const factsSnap = await db.collection('tenants').doc(tenantId).collection('scope_facts').get();
  const factsMap: Record<string, TenantScopeFact> = {};
  for (const doc of factsSnap.docs) {
    factsMap[doc.id] = doc.data() as TenantScopeFact;
  }

  const result = evaluateApplicabilityRule(rule, factsMap);
  return { result };
});

/**
 * 3. List Tenant Applicability Decisions
 */
export const listTenantApplicabilityDecisions = onCall(async (request) => {
  const { tenantId, frameworkId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('applicability_decisions') as FirebaseFirestore.Query;
  if (frameworkId) {
    q = q.where('frameworkId', '==', frameworkId);
  }

  const snap = await q.get();
  const decisions = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { decisions };
});

export interface InstantiateTenantControlsInput {
  tenantId: string;
  frameworkId?: string;
  defaultOwnerId?: string;
}

/**
 * 4. Tenant GRC Instantiation from Applicability Decisions
 */
export const instantiateTenantFrameworkControls = onCall<InstantiateTenantControlsInput>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
  const input = request.data;
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new HttpsError('invalid-argument', 'Instantiation input must be an object.');
  }
  const unknown = Object.keys(input).filter(
    (key) => !['tenantId', 'frameworkId', 'defaultOwnerId'].includes(key)
  );
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Instantiation input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const tenantId = requireCoverageId(input.tenantId, 'tenantId');
  const frameworkId = optionalCoverageId(input.frameworkId, 'frameworkId');
  const defaultOwnerId = optionalCoverageId(input.defaultOwnerId, 'defaultOwnerId');

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);
  const ownerId = defaultOwnerId || authCtx.userId;
  const ownerSnapshot = await db
    .doc(`tenants/${tenantId}/memberships/${ownerId}`)
    .get();
  const owner = ownerSnapshot.data();
  if (
    !ownerSnapshot.exists ||
    owner?.tenantId !== tenantId ||
    (owner?.userId !== undefined && owner.userId !== ownerId) ||
    owner?.status !== 'active' ||
    ![
      'tenant_admin',
      'compliance_manager',
      'security_manager',
      'privacy_manager',
      'ai_governance_manager',
      'contributor',
    ].includes(String(owner?.role))
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The default control owner must be an active tenant implementation role.'
    );
  }

  // 1. Fetch adopted frameworks for tenant
  const adoptedSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('adopted_frameworks')
    .limit(21)
    .get();
  if (adoptedSnap.size > 20) {
    throw new HttpsError(
      'resource-exhausted',
      'Adopted framework scope exceeds the synchronous instantiation limit.'
    );
  }
  const eligibleAdoptions = adoptedSnap.docs.filter((document) => {
    const adoption = document.data();
    return (
      adoption.tenantId === tenantId &&
      adoption.frameworkId === document.id &&
      ['in_scoping', 'adopted', 'active'].includes(String(adoption.status)) &&
      (!frameworkId || document.id === frameworkId)
    );
  });
  const adoptedFrameworkIds = eligibleAdoptions.map((document) => document.id);
  if (frameworkId && !adoptedFrameworkIds.includes(frameworkId)) {
    throw new HttpsError(
      'failed-precondition',
      'The requested framework is not in an active adopted lifecycle state.'
    );
  }
  if (adoptedFrameworkIds.length === 0) {
    throw new HttpsError(
      'failed-precondition',
      'No active adopted frameworks are available for control instantiation.'
    );
  }

  // 2. Fetch applicability decisions
  const decisionsSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('applicability_decisions')
    .limit(1_001)
    .get();
  if (decisionsSnap.size > 1_000) {
    throw new HttpsError(
      'resource-exhausted',
      'Applicability decisions exceed the synchronous instantiation limit.'
    );
  }
  const decisions: TenantApplicabilityDecision[] = decisionsSnap.docs.map((d) => d.data() as TenantApplicabilityDecision);

  // 3. Fetch existing requirement instances and control instances
  const reqInstSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('requirement_instances')
    .limit(1_001)
    .get();
  if (reqInstSnap.size > 1_000) {
    throw new HttpsError(
      'resource-exhausted',
      'Requirement instances exceed the synchronous instantiation limit.'
    );
  }
  const existingReqInstances: TenantRequirementInstance[] = reqInstSnap.docs.map((d) => d.data() as TenantRequirementInstance);

  const ctrlInstSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('controls')
    .limit(1_001)
    .get();
  if (ctrlInstSnap.size > 1_000) {
    throw new HttpsError(
      'resource-exhausted',
      'Control instances exceed the synchronous instantiation limit.'
    );
  }
  const existingControlInstances: TenantControlInstance[] = ctrlInstSnap.docs.map((d) => d.data() as TenantControlInstance);

  // 4. Fetch Master Catalog
  const requirements = CANONICAL_MASTER_DATA.requirements.filter(
    (r) => adoptedFrameworkIds.includes(r.frameworkId)
  );
  const masterControls = CANONICAL_MASTER_DATA.masterControls;
  const requirementControlMappings = CANONICAL_MASTER_DATA.requirementControlMappings;
  const canonicalControlMappings = CANONICAL_MASTER_DATA.canonicalControlMappings;

  // 5. Execute instantiation & harmonization engine
  const result = instantiateTenantGRC({
    tenantId,
    defaultOwnerId: ownerId,
    decisions,
    requirements,
    masterControls,
    requirementControlMappings,
    canonicalControlMappings,
    existingRequirementInstances: existingReqInstances,
    existingControlInstances: existingControlInstances,
  });

  // 6. Commit against a transactionally revalidated adoption snapshot. This
  // compatibility generator remains create-only for controls, but it must not
  // resurrect or generate from a framework retired after the initial read.
  let safeControlInstances: Array<TenantControlInstance & {
    workflowTrust: 'legacy_unverified';
    assuranceStatus: 'untested';
  }> = [];

  if (
    result.requirementInstances.length +
      result.controlInstances.length +
      result.controlMappings.length +
      2 >
    450
  ) {
    throw new HttpsError(
      'resource-exhausted',
      'Instantiation exceeds the bounded atomic write limit; split the framework scope.'
    );
  }

  await db.runTransaction(async (transaction) => {
    const adoptionRefs = eligibleAdoptions.map((document) => document.ref);
    const controlRefs = result.controlInstances.map((control) =>
      db.doc(`tenants/${tenantId}/controls/${control.id}`)
    );
    const [adoptionSnapshots, controlSnapshots] = await Promise.all([
      transaction.getAll(...adoptionRefs),
      controlRefs.length > 0 ? transaction.getAll(...controlRefs) : Promise.resolve([]),
    ]);
    for (const adoptionSnapshot of adoptionSnapshots) {
      const adoption = adoptionSnapshot.data();
      if (
        !adoptionSnapshot.exists ||
        adoption?.tenantId !== tenantId ||
        adoption?.frameworkId !== adoptionSnapshot.id ||
        !['in_scoping', 'adopted', 'active'].includes(String(adoption?.status))
      ) {
        throw new HttpsError(
          'failed-precondition',
          'An adopted framework was retired or changed while controls were being generated.'
        );
      }
    }

    for (const reqInst of result.requirementInstances) {
      transaction.set(
        db.doc(`tenants/${tenantId}/requirement_instances/${reqInst.id}`),
        reqInst,
        { merge: true }
      );
    }

    const nextSafeControls: typeof safeControlInstances = [];
    for (let index = 0; index < result.controlInstances.length; index += 1) {
      if (controlSnapshots[index]?.exists) continue;
      const ctrlInst = result.controlInstances[index]!;
      const safeControl = {
        ...ctrlInst,
        status: 'not_started' as const,
        healthScore: 0,
        lastReviewDate: null,
        nextReviewDate: null,
        workflowTrust: 'legacy_unverified' as const,
        assuranceStatus: 'untested' as const,
        implementationNotes: ctrlInst.implementationNotes
          ? `${ctrlInst.implementationNotes} This framework-derived draft is not assurance until governed and independently reviewed.`
          : 'Framework-derived draft. Rebaseline and independently review before relying on it as assurance.',
      };
      nextSafeControls.push(safeControl);
      transaction.create(controlRefs[index]!, safeControl);
    }

    for (const mapping of result.controlMappings) {
      transaction.set(
        db.doc(`tenants/${tenantId}/control_mappings/${mapping.id}`),
        mapping,
        { merge: true }
      );
    }

    safeControlInstances = nextSafeControls;
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authCtx.userId,
      actorEmail: authCtx.email,
      actorRole: authCtx.role,
      entityType: 'control',
      entityId: frameworkId || 'harmonized_catalog',
      action: 'create',
      afterSummary: {
        createdRequirementsCount: result.createdRequirementsCount,
        updatedRequirementsCount: result.updatedRequirementsCount,
        createdControlsCount: nextSafeControls.length,
        updatedControlsCount: 0,
        governedControlsSkipped:
          result.controlInstances.length - nextSafeControls.length,
        harmonizedControlsCount: result.harmonizedControlsCount,
      },
      source: 'cloud_function',
      workflowContext: `Instantiated ${nextSafeControls.length} unassured control drafts and synchronized ${result.requirementInstances.length} requirements from active adopted frameworks`,
    });
    transaction.delete(db.doc(`tenants/${tenantId}/summary_metrics/current`));
  });

  return {
    success: true,
    ...result,
    createdControlsCount: safeControlInstances.length,
    updatedControlsCount: 0,
    controlInstances: safeControlInstances,
  };
  }
);

/**
 * 5. List Tenant Requirement Instances
 */
export const listTenantRequirementInstances = onCall(async (request) => {
  const { tenantId, frameworkId, complianceStatus } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('requirement_instances') as FirebaseFirestore.Query;
  if (frameworkId) {
    q = q.where('frameworkId', '==', frameworkId);
  }
  if (complianceStatus) {
    q = q.where('complianceStatus', '==', complianceStatus);
  }

  const snap = await q.get();
  const instances = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { instances };
});

/**
 * 6. List Tenant Control Instances
 */
export const listTenantControlInstances = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = request.data || {};
    const tenantId = requireCoverageId(input.tenantId, 'tenantId');
    const frameworkId = optionalCoverageId(input.frameworkId, 'frameworkId');
    const domain = optionalCoverageId(input.domain, 'domain');
    const cursor = optionalCoverageId(input.cursor, 'cursor');
    const isHarmonized =
      typeof input.isHarmonized === 'boolean' ? input.isHarmonized : undefined;
    const pageSize =
      input.pageSize === undefined
        ? CONTROL_LIST_PAGE_SIZE_DEFAULT
        : input.pageSize;
    if (
      !Number.isSafeInteger(pageSize) ||
      pageSize < 1 ||
      pageSize > CONTROL_LIST_PAGE_SIZE_MAX
    ) {
      throw new HttpsError(
        'invalid-argument',
        `pageSize must be an integer from 1 to ${CONTROL_LIST_PAGE_SIZE_MAX}.`
      );
    }

    await requireTenantMember(request, tenantId);

    let query: FirebaseFirestore.Query = db
      .collection(`tenants/${tenantId}/controls`)
      .orderBy(FieldPath.documentId());
    if (frameworkId) query = query.where('frameworkIds', 'array-contains', frameworkId);
    if (domain) query = query.where('domain', '==', domain);
    if (cursor) query = query.startAfter(cursor);

    // This compatibility endpoint intentionally returns the same kind of
    // bounded, verified projection as the governed controls API. It never
    // spreads raw Firestore records into the response.
    const snapshot = await query.limit(pageSize + 1).get();
    const pageDocuments = snapshot.docs.slice(0, pageSize);
    const trust = await Promise.all(
      pageDocuments.map((document) =>
        verifyControlCurrentArtifact(tenantId, document)
      )
    );
    const projected = pageDocuments.map((document, index) =>
      truthfulControlProjection(document, trust[index]!)
    );
    const controls =
      isHarmonized === undefined
        ? projected
        : projected.filter((control) => control.isHarmonized === isHarmonized);
    const truncated = snapshot.size > pageSize;

    return {
      controls,
      count: controls.length,
      truncated,
      nextCursor: truncated ? pageDocuments.at(-1)?.id ?? null : null,
      projectionTrust: 'server_verified_fail_closed',
    };
  }
);

/**
 * 7. Get Tenant Control Harmonized Coverage Report ("One Control, Many Obligations")
 */
export const getTenantControlCoverageReport = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = request.data || {};
    const tenantId = requireCoverageId(input.tenantId, 'tenantId');
    const controlId = requireCoverageId(input.controlId, 'controlId');

    await requireTenantMember(request, tenantId);

    const controlSnapshot = await db.doc(`tenants/${tenantId}/controls/${controlId}`).get();
    if (!controlSnapshot.exists) {
      throw new HttpsError('not-found', `Control '${controlId}' not found.`);
    }
    const trust = await verifyControlCurrentArtifact(tenantId, controlSnapshot);
    const projection = truthfulControlProjection(controlSnapshot, trust);
    const frameworkIds = projection.frameworkIds as string[];
    const requirementIds = projection.requirementIds as string[];
    const library = await loadCoverageLibrary(frameworkIds, requirementIds);
    const raw = controlSnapshot.data() as Partial<Control>;
    const control: TenantControlInstance = {
      id: controlId,
      tenantId,
      ownerId: trust.workflowTrusted
        ? boundedText(raw.ownerId, 'unassigned', 128)
        : 'unverified',
      masterControlId:
        trust.workflowTrusted && typeof raw.masterControlId === 'string'
          ? raw.masterControlId
          : null,
      code: projection.code as string,
      title: projection.title as string,
      description: '',
      domain: projection.domain as string,
      frameworkIds,
      requirementIds,
      status: projection.status as ControlImplementationStatus,
      healthScore: projection.healthScore as number,
      enforcementMechanism: 'manual',
      reviewFrequencyDays: 0,
      lastReviewDate: projection.lastReviewDate as string | null,
      nextReviewDate: projection.nextReviewDate as string | null,
      implementationNotes: '',
      isHarmonized: projection.isHarmonized as boolean,
      canonicalMappingIds: [],
      createdAt: '',
      updatedAt: '',
      createdBy: 'server_projection',
      updatedBy: 'server_projection',
    };
    const coverage = buildControlCoverageSummary(
      control,
      library.requirements,
      library.canonicalMappings,
      library.frameworks,
      {
        currentArtifactVerified: trust.workflowTrusted,
        assuranceTrusted: trust.assuranceTrusted,
        assuranceReason: trust.assuranceReason,
      }
    );

    return {
      coverage,
      projectionTrust: 'server_verified_fail_closed',
    };
  }
);

/**
 * 8. List Tenant Control Mappings
 */
export const listTenantControlMappings = onCall(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  async (request) => {
    const input = request.data || {};
    const tenantId = requireCoverageId(input.tenantId, 'tenantId');
    const controlId = optionalCoverageId(input.controlId, 'controlId');
    const frameworkId = optionalCoverageId(input.frameworkId, 'frameworkId');
    const requirementId = optionalCoverageId(input.requirementId, 'requirementId');
    const cursor = optionalCoverageId(input.cursor, 'cursor');
    const pageSize = input.pageSize === undefined ? 50 : input.pageSize;
    if (!Number.isSafeInteger(pageSize) || pageSize < 1 || pageSize > 100) {
      throw new HttpsError('invalid-argument', 'pageSize must be an integer from 1 to 100.');
    }

    await requireTenantMember(request, tenantId);

    let query: FirebaseFirestore.Query = db
      .collection(`tenants/${tenantId}/control_mappings`)
      .orderBy(FieldPath.documentId());
    if (controlId) query = query.where('controlId', '==', controlId);
    if (frameworkId) query = query.where('frameworkId', '==', frameworkId);
    if (requirementId) query = query.where('requirementId', '==', requirementId);
    if (cursor) query = query.startAfter(cursor);
    const snapshot = await query.limit(pageSize + 1).get();
    const documents = snapshot.docs.slice(0, pageSize);
    const mappings = documents.map((document) => {
      const raw = document.data();
      const mappingCoverageRatio =
        typeof raw.coverageRatio === 'number' &&
        Number.isFinite(raw.coverageRatio) &&
        raw.coverageRatio >= 0 &&
        raw.coverageRatio <= 1
          ? raw.coverageRatio
          : 0;
      return {
        id: document.id,
        controlId: boundedText(raw.controlId, 'unverified', 128),
        frameworkId: boundedText(raw.frameworkId, 'unverified', 128),
        requirementId: boundedText(raw.requirementId, 'unverified', 128),
        mappingType: boundedText(raw.mappingType, 'unverified', 40),
        mappingCoverageRatio,
        coverageRatio: 0,
        countsAsCovered: false,
        verificationStatus: 'legacy_unverified',
        mappingRationale: boundedText(
          raw.mappingRationale,
          'Legacy mapping has not been verified by the governed control workflow.',
          1_000
        ),
      };
    });
    const truncated = snapshot.size > pageSize;
    return {
      mappings,
      count: mappings.length,
      truncated,
      nextCursor: truncated ? documents.at(-1)?.id ?? null : null,
      warning: 'Legacy mapping records do not establish control effectiveness or requirement coverage.',
    };
  }
);

/**
 * 9. Evaluate Statutory Obligations (GDPR, EU AI Act, EU Data Act)
 */
export const evaluateStatutoryObligations = onCall(async (request) => {
  const { tenantId, persistFlags = true } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  const authContext = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  // 1. Fetch Adopted Frameworks
  const tenantRef = db.collection('tenants').doc(tenantId);
  const adoptSnap = await tenantRef.collection('adopted_frameworks').get();
  const adoptedFrameworks: string[] = adoptSnap.docs
    .filter((doc) => doc.data().status !== 'retired')
    .map((doc) => doc.data().frameworkId || doc.id);

  // 2. Fetch Scope Facts
  const factsSnap = await tenantRef.collection('scope_facts').get();
  const scopeFacts: TenantScopeFact[] = factsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // 3. Fetch Applicability Decisions
  const decSnap = await tenantRef.collection('applicability_decisions').get();
  const decisions: TenantApplicabilityDecision[] = decSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // 4. Derive Statutory Obligations
  const result = deriveStatutoryObligations({
    tenantId,
    defaultOwnerId: authContext.userId,
    scopeFacts,
    decisions,
    adoptedFrameworks,
  });

  // 5. Batch Persist Obligation Flags if requested
  if (persistFlags) {
    const existingFlagsSnap = await tenantRef.collection('statutory_obligations').get();
    const existingFlags = new Map(existingFlagsSnap.docs.map((doc) => [doc.id, doc.data()]));
    const activeFlagIds = new Set(result.obligationFlags.map((flag) => flag.id));
    const batch = db.batch();
    for (const flag of result.obligationFlags) {
      const existing = existingFlags.get(flag.id);
      const docRef = tenantRef.collection('statutory_obligations').doc(flag.id);
      batch.set(docRef, {
        ...flag,
        ownerId: existing?.ownerId || flag.ownerId,
        createdAt: existing?.createdAt || flag.createdAt,
        createdBy: existing?.createdBy || flag.createdBy,
      });
    }
    let retiredFlagsCount = 0;
    for (const existingDoc of existingFlagsSnap.docs) {
      if (!activeFlagIds.has(existingDoc.id) && existingDoc.data().status !== 'retired') {
        batch.update(existingDoc.ref, {
          status: 'retired',
          rationale: `${existingDoc.data().rationale || ''}\nNo longer derived from the current adopted-framework and scope-fact set.`.trim(),
          updatedAt: new Date().toISOString(),
          updatedBy: authContext.userId,
        });
        retiredFlagsCount += 1;
      }
    }
    appendAuditLogInBatch(batch, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'tenant_statutory_obligations',
      entityId: `stat_obl_${tenantId}`,
      action: 'update',
      afterSummary: {
        activeObligations: result.obligationFlags.length,
        retiredObligations: retiredFlagsCount,
        adoptedFrameworks,
        requiredRegisters: result.requiredRegisters.length,
        requiredAssessments: result.requiredAssessments.length,
        requiredOperationalRecords: result.requiredOperationalRecords.length,
      },
      source: 'cloud_function',
      workflowContext: 'statutory_obligation_reconciliation',
    });
    await batch.commit();
  }

  return { success: true, ...result };
});

/**
 * 10. List Tenant Statutory Obligation Flags
 */
export const listTenantObligationFlags = onCall(async (request) => {
  const { tenantId, frameworkId, artifactKind, status } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('statutory_obligations') as FirebaseFirestore.Query;
  if (frameworkId) q = q.where('frameworkId', '==', frameworkId);
  if (artifactKind) q = q.where('artifactKind', '==', artifactKind);
  if (status) q = q.where('status', '==', status);

  const snap = await q.get();
  const obligationFlags = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { obligationFlags };
});

/**
 * 11. Override Tenant Applicability Decision
 */
export interface OverrideApplicabilityDecisionInput {
  tenantId: string;
  decisionId: string;
  newStatus: ApplicabilityStatus;
  isApplicable: boolean;
  overrideRationale: string;
  decisionSource?: 'user_override';
  notes?: string | null;
}

export const overrideTenantApplicabilityDecision = onCall<OverrideApplicabilityDecisionInput>(async (request) => {
  const input = request.data;
  const allowedKeys = new Set([
    'tenantId',
    'decisionId',
    'newStatus',
    'isApplicable',
    'overrideRationale',
    'decisionSource',
    'notes',
  ]);
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !allowedKeys.has(key))
  ) {
    throw new HttpsError('invalid-argument', 'Unsupported applicability override fields.');
  }
  const {
    tenantId,
    decisionId,
    newStatus,
    isApplicable,
    overrideRationale,
    decisionSource = 'user_override',
    notes,
  } = input;

  const allowedStatuses = new Set<ApplicabilityStatus>([
    'applicable',
    'not_applicable',
    'review_required',
    'inherited',
    'deferred',
  ]);
  const expectedApplicable = newStatus === 'applicable' || newStatus === 'inherited';
  if (
    typeof tenantId !== 'string' ||
    tenantId.length < 1 ||
    tenantId.length > 128 ||
    tenantId.includes('/') ||
    typeof decisionId !== 'string' ||
    decisionId.length < 1 ||
    decisionId.length > 256 ||
    decisionId.includes('/') ||
    !allowedStatuses.has(newStatus) ||
    typeof isApplicable !== 'boolean' ||
    isApplicable !== expectedApplicable ||
    typeof overrideRationale !== 'string' ||
    overrideRationale.trim().length < 10 ||
    overrideRationale.trim().length > 4000 ||
    decisionSource !== 'user_override' ||
    (notes !== undefined && notes !== null &&
      (typeof notes !== 'string' || notes.length > 4000))
  ) {
    throw new HttpsError(
      'invalid-argument',
      'Applicability override fields are invalid or internally inconsistent.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  const docRef = db.collection('tenants').doc(tenantId).collection('applicability_decisions').doc(decisionId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Applicability decision '${decisionId}' not found.`);
  }

  const prevDecision = snap.data() as TenantApplicabilityDecision;

  const overridden = applyApplicabilityOverride({
    decision: prevDecision,
    newStatus,
    isApplicable,
    overrideRationale,
    actorId: authContext.userId,
    actorRole: authContext.role,
    decisionSource: 'user_override',
    reviewerId: null,
    reviewerRole: null,
    notes,
  });

  const batch = db.batch();
  batch.set(docRef, overridden, { merge: true });
  appendAuditLogInBatch(batch, {
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tenant_applicability_decision',
    entityId: decisionId,
    action: 'update',
    beforeSummary: { status: prevDecision.status, isApplicable: prevDecision.isApplicable },
    afterSummary: { status: overridden.status, isApplicable: overridden.isApplicable, overrideRationale },
    source: 'cloud_function',
    workflowContext: 'applicability_decision_override',
  });
  await batch.commit();

  return { success: true, decision: overridden };
});

/**
 * 12. Revert Tenant Applicability Decision Back to Automatic Baseline
 */
export interface RevertApplicabilityDecisionInput {
  tenantId: string;
  decisionId: string;
  reason: string;
}

export const revertTenantApplicabilityDecision = onCall<RevertApplicabilityDecisionInput>(async (request) => {
  const input = request.data;
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !['tenantId', 'decisionId', 'reason'].includes(key))
  ) {
    throw new HttpsError('invalid-argument', 'Unsupported applicability reversion fields.');
  }
  const { tenantId, decisionId, reason } = input;
  if (
    typeof tenantId !== 'string' ||
    tenantId.length < 1 ||
    tenantId.length > 128 ||
    tenantId.includes('/') ||
    typeof decisionId !== 'string' ||
    decisionId.length < 1 ||
    decisionId.length > 256 ||
    decisionId.includes('/') ||
    typeof reason !== 'string' ||
    reason.trim().length < 10 ||
    reason.trim().length > 4000
  ) {
    throw new HttpsError('invalid-argument', 'Applicability reversion fields are invalid.');
  }

  const authContext = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  const docRef = db.collection('tenants').doc(tenantId).collection('applicability_decisions').doc(decisionId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Applicability decision '${decisionId}' not found.`);
  }

  const prevDecision = snap.data() as TenantApplicabilityDecision;

  const reverted = revertApplicabilityOverride({
    decision: prevDecision,
    actorId: authContext.userId,
    actorRole: authContext.role,
    reason: reason.trim(),
  });

  const batch = db.batch();
  batch.set(docRef, reverted, { merge: true });
  appendAuditLogInBatch(batch, {
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tenant_applicability_decision',
    entityId: decisionId,
    action: 'update',
    beforeSummary: { status: prevDecision.status, isApplicable: prevDecision.isApplicable },
    afterSummary: { status: reverted.status, isApplicable: reverted.isApplicable, revertedToAuto: true },
    source: 'cloud_function',
    workflowContext: 'applicability_decision_reversion',
  });
  await batch.commit();

  return { success: true, decision: reverted };
});

/**
 * 13. Get Applicability Decision History
 */
export const getTenantApplicabilityDecisionHistory = onCall(async (request) => {
  const { tenantId, decisionId } = request.data || {};
  if (!tenantId || !decisionId) {
    throw new HttpsError('invalid-argument', 'tenantId and decisionId are required.');
  }

  await requireTenantMember(request, tenantId);

  const docRef = db.collection('tenants').doc(tenantId).collection('applicability_decisions').doc(decisionId);
  const snap = await docRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', `Applicability decision '${decisionId}' not found.`);
  }

  const decision = snap.data() as TenantApplicabilityDecision;

  return {
    decisionId,
    requirementId: decision.requirementId,
    decisionSource: decision.decisionSource || 'auto',
    isOverridden: decision.isOverridden || false,
    autoResult: decision.autoResult || null,
    history: decision.history || [],
  };
});

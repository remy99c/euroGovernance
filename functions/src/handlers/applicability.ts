import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
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
  DecisionSource,
  ApplicabilityStatus,
  CANONICAL_APPLICABILITY_RULES,
  CANONICAL_MASTER_DATA,
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

/**
 * 1. Evaluate Applicability Rules for a Tenant and Synchronize Decisions & Requirements
 */
export const evaluateTenantApplicability = onCall<EvaluateTenantApplicabilityInput>(async (request) => {
  const { tenantId, frameworkId, overrideExistingDecisions = true } = request.data || {};

  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);

  // 1. Fetch all tenant scope facts
  const factsSnap = await db.collection('tenants').doc(tenantId).collection('scope_facts').get();
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

  // 3. Evaluate rules
  const evaluationResults = evaluateFrameworkApplicabilityRules(rules, factsMap);
  const now = new Date().toISOString();
  const batch = db.batch();

  for (const res of evaluationResults) {
    const isApplicable = res.resultingOutcome === 'applicable' || res.resultingOutcome === 'conditionally_applicable';

    const decisionRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('applicability_decisions')
      .doc(res.targetRequirementId);

    if (!overrideExistingDecisions) {
      const existingSnap = await decisionRef.get();
      if (existingSnap.exists && existingSnap.data()?.applicabilityType === 'manual_exclusion') {
        continue;
      }
    }

    const decisionPayload: TenantApplicabilityDecision = {
      id: res.targetRequirementId,
      tenantId,
      ownerId: authCtx.userId,
      requirementId: res.targetRequirementId,
      frameworkId: res.frameworkId,
      sectionCode: res.targetRequirementId,
      requirementTitle: res.ruleName,
      isApplicable,
      status: res.resultingOutcome,
      applicabilityType: 'rule_derived',
      matchedRuleId: res.ruleId,
      ruleEvaluationSummary: res.explanation,
      rationale: res.explanation,
      overrideReason: null,
      previousStatus: null,
      assessedBy: authCtx.userId,
      assessedAt: now,
      reviewedBy: null,
      reviewedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: authCtx.userId,
      updatedBy: authCtx.userId,
    };

    batch.set(decisionRef, decisionPayload, { merge: true });

    // Update /tenants/{tenantId}/requirement_applicability/{reqId}
    const reqAppRef = db
      .collection('tenants')
      .doc(tenantId)
      .collection('requirement_applicability')
      .doc(res.targetRequirementId);

    const reqAppUpdate: Partial<RequirementApplicability> = {
      isApplicable,
      status: isApplicable ? 'implemented' : 'not_applicable',
      justification: res.explanation,
      assessedBy: authCtx.userId,
      assessedAt: now,
      updatedAt: now,
      updatedBy: authCtx.userId,
    };

    batch.set(reqAppRef, reqAppUpdate, { merge: true });
  }

  await batch.commit();

  await recordAuditLog({
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
    },
    source: 'cloud_function',
    workflowContext: `Automated applicability evaluation for ${evaluationResults.length} statutory rules`,
  });

  return {
    success: true,
    totalEvaluated: evaluationResults.length,
    matchedCount: evaluationResults.filter((r) => r.matched).length,
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
export const instantiateTenantFrameworkControls = onCall<InstantiateTenantControlsInput>(async (request) => {
  const { tenantId, frameworkId, defaultOwnerId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing or invalid tenantId.');
  }

  const authCtx = await requireTenantMember(request, tenantId, [...COMPLIANCE_WRITE_ROLES]);
  const ownerId = defaultOwnerId || authCtx.userId;

  // 1. Fetch adopted frameworks for tenant
  const adoptedSnap = await db.collection('tenants').doc(tenantId).collection('adopted_frameworks').get();
  const adoptedFrameworkIds = adoptedSnap.docs
    .map((d) => d.id)
    .filter((id) => !frameworkId || id === frameworkId);

  // 2. Fetch applicability decisions
  const decisionsSnap = await db.collection('tenants').doc(tenantId).collection('applicability_decisions').get();
  const decisions: TenantApplicabilityDecision[] = decisionsSnap.docs.map((d) => d.data() as TenantApplicabilityDecision);

  // 3. Fetch existing requirement instances and control instances
  const reqInstSnap = await db.collection('tenants').doc(tenantId).collection('requirement_instances').get();
  const existingReqInstances: TenantRequirementInstance[] = reqInstSnap.docs.map((d) => d.data() as TenantRequirementInstance);

  const ctrlInstSnap = await db.collection('tenants').doc(tenantId).collection('controls').get();
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

  // 6. Batch commit requirement instances & control instances
  const batch = db.batch();

    for (const reqInst of result.requirementInstances) {
    const docRef = db.collection('tenants').doc(tenantId).collection('requirement_instances').doc(reqInst.id);
    batch.set(docRef, reqInst, { merge: true });
  }

  for (const ctrlInst of result.controlInstances) {
    const docRef = db.collection('tenants').doc(tenantId).collection('controls').doc(ctrlInst.id);
    batch.set(docRef, ctrlInst, { merge: true });
  }

  for (const mapping of result.controlMappings) {
    const docRef = db.collection('tenants').doc(tenantId).collection('control_mappings').doc(mapping.id);
    batch.set(docRef, mapping, { merge: true });
  }

  await batch.commit();

  await recordAuditLog({
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
      createdControlsCount: result.createdControlsCount,
      updatedControlsCount: result.updatedControlsCount,
      harmonizedControlsCount: result.harmonizedControlsCount,
    },
    source: 'cloud_function',
    workflowContext: `Instantiated ${result.createdControlsCount} controls and synchronized ${result.requirementInstances.length} requirements`,
  });

  return {
    success: true,
    ...result,
  };
});

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
export const listTenantControlInstances = onCall(async (request) => {
  const { tenantId, frameworkId, domain, isHarmonized } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('controls') as FirebaseFirestore.Query;
  if (frameworkId) {
    q = q.where('frameworkIds', 'array-contains', frameworkId);
  }
  if (domain) {
    q = q.where('domain', '==', domain);
  }
  if (typeof isHarmonized === 'boolean') {
    q = q.where('isHarmonized', '==', isHarmonized);
  }

  const snap = await q.get();
  const controls = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { controls };
});

/**
 * 7. Get Tenant Control Harmonized Coverage Report ("One Control, Many Obligations")
 */
export const getTenantControlCoverageReport = onCall(async (request) => {
  const { tenantId, controlId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }
  if (!controlId || typeof controlId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing controlId.');
  }

  await requireTenantMember(request, tenantId);

  const ctrlSnap = await db.collection('tenants').doc(tenantId).collection('controls').doc(controlId).get();
  if (!ctrlSnap.exists) {
    throw new HttpsError('not-found', `Control '${controlId}' not found.`);
  }

  const control = { id: ctrlSnap.id, ...ctrlSnap.data() } as TenantControlInstance;

  // Load requirements & canonical mappings
  const reqSnap = await db.collection('requirements').get();
  const requirements = reqSnap.empty
    ? CANONICAL_MASTER_DATA.requirements
    : reqSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const mappingSnap = await db.collection('control_mappings').get();
  const canonicalMappings = mappingSnap.empty
    ? CANONICAL_MASTER_DATA.canonicalControlMappings
    : mappingSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const fwSnap = await db.collection('frameworks').get();
  const frameworks = fwSnap.empty
    ? CANONICAL_MASTER_DATA.frameworks
    : fwSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  const coverage = buildControlCoverageSummary(control, requirements, canonicalMappings, frameworks);

  return { coverage };
});

/**
 * 8. List Tenant Control Mappings
 */
export const listTenantControlMappings = onCall(async (request) => {
  const { tenantId, controlId, frameworkId, requirementId } = request.data || {};
  if (!tenantId || typeof tenantId !== 'string') {
    throw new HttpsError('invalid-argument', 'Missing tenantId.');
  }

  await requireTenantMember(request, tenantId);

  let q = db.collection('tenants').doc(tenantId).collection('control_mappings') as FirebaseFirestore.Query;
  if (controlId) {
    q = q.where('controlId', '==', controlId);
  }
  if (frameworkId) {
    q = q.where('frameworkId', '==', frameworkId);
  }
  if (requirementId) {
    q = q.where('requirementId', '==', requirementId);
  }

  const snap = await q.get();
  const mappings = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  return { mappings };
});

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
  const adoptSnap = await db.collection('tenants').doc(tenantId).collection('adopted_frameworks').get();
  const adoptedFrameworks: string[] = adoptSnap.empty
    ? ['gdpr', 'eu_ai_act', 'eu_data_act', 'iso_27001']
    : adoptSnap.docs.map((d) => d.data().frameworkId || d.id);

  // 2. Fetch Scope Facts
  const factsSnap = await db.collection('tenants').doc(tenantId).collection('scope_facts').get();
  const scopeFacts: TenantScopeFact[] = factsSnap.docs.map((d) => ({ id: d.id, ...d.data() } as any));

  // 3. Fetch Applicability Decisions
  const decSnap = await db.collection('tenants').doc(tenantId).collection('applicability_decisions').get();
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
  if (persistFlags && result.obligationFlags.length > 0) {
    const batch = db.batch();
    for (const flag of result.obligationFlags) {
      const docRef = db.collection('tenants').doc(tenantId).collection('statutory_obligations').doc(flag.id);
      batch.set(docRef, flag, { merge: true });
    }
    await batch.commit();
  }

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tenant_statutory_obligations',
    entityId: `stat_obl_${tenantId}`,
    action: 'update',
    afterSummary: {
      totalObligations: result.obligationFlags.length,
      requiredRegisters: result.requiredRegisters.length,
      requiredAssessments: result.requiredAssessments.length,
      requiredOperationalRecords: result.requiredOperationalRecords.length,
    },
    source: 'cloud_function',
    workflowContext: 'statutory_obligation_evaluation',
  });

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
  decisionSource?: DecisionSource;
  reviewerId?: string | null;
  reviewerRole?: string | null;
  notes?: string | null;
}

export const overrideTenantApplicabilityDecision = onCall<OverrideApplicabilityDecisionInput>(async (request) => {
  const {
    tenantId,
    decisionId,
    newStatus,
    isApplicable,
    overrideRationale,
    decisionSource = 'user_override',
    reviewerId,
    reviewerRole,
    notes,
  } = request.data || {};

  if (!tenantId || !decisionId || !newStatus || isApplicable === undefined || !overrideRationale) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, decisionId, newStatus, isApplicable, and overrideRationale are required.'
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
    decisionSource,
    reviewerId: reviewerId || (decisionSource === 'reviewer_override' ? authContext.userId : null),
    reviewerRole: reviewerRole || (decisionSource === 'reviewer_override' ? authContext.role : null),
    notes,
  });

  await docRef.set(overridden, { merge: true });

  await recordAuditLog({
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
  const { tenantId, decisionId, reason } = request.data || {};
  if (!tenantId || !decisionId || !reason) {
    throw new HttpsError('invalid-argument', 'tenantId, decisionId, and reason are required.');
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
    reason,
  });

  await docRef.set(reverted, { merge: true });

  await recordAuditLog({
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

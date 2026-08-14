import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  ApplicabilityRule,
  TenantScopeFact,
  TenantApplicabilityDecision,
  RequirementApplicability,
  evaluateApplicabilityRule,
  evaluateFrameworkApplicabilityRules,
  validateApplicabilityRule,
  CANONICAL_APPLICABILITY_RULES,
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

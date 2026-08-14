import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  Policy,
  PolicyStatus,
  DPIA,
  DPIAStatus,
  TIA,
  TIAStatus,
  AIRiskTier,
  AIClassificationAssessment,
  AIAssessmentStatus,
  AIImpactAssessment,
  FRIA,
  AIIncident,
  AIIncidentSeverity,
  ROPAEntry,
  LegalBasisType,
} from '@eurogovernance/shared-types';

export interface TransitionPolicyInput {
  tenantId: string;
  policyId: string;
  targetStatus: PolicyStatus;
}

export interface TransitionDPIAInput {
  tenantId: string;
  dpiaId: string;
  targetStatus: DPIAStatus;
  dpoOpinionNotes?: string;
}

export interface TransitionTIAInput {
  tenantId: string;
  tiaId: string;
  targetStatus: TIAStatus;
}

export interface ClassifyAISystemInput {
  tenantId: string;
  aiSystemId: string;
  prohibitedPracticesCheck: {
    cognitiveBehavioralManipulation: boolean;
    vulnerabilityExploitation: boolean;
    socialScoring: boolean;
    predictivePolicing: boolean;
    untargetedFacialScraping: boolean;
    emotionRecognitionInWorkplaceOrEducation: boolean;
    biometricCategorizationSensitive: boolean;
    realTimeRemoteBiometricIdentification: boolean;
  };
  annexThreeCategory:
    | 'none'
    | 'biometrics'
    | 'critical_infrastructure'
    | 'education_vocational'
    | 'employment_worker_management'
    | 'essential_services_benefits'
    | 'law_enforcement'
    | 'migration_asylum'
    | 'justice_democracy';
  isGeneralPurposeAI: boolean;
  justificationSummary: string;
}

export interface LogAIIncidentInput {
  tenantId: string;
  aiSystemId: string;
  title: string;
  severity: AIIncidentSeverity;
  description: string;
  isFatalOrSevereHealthImpact: boolean;
  isCriticalInfrastructureDisruption: boolean;
  isFundamentalRightsBreach: boolean;
  rootCauseAnalysis: string;
  immediateCorrectiveAction: string;
}

/**
 * Callable Function: transitionPolicyStatus
 */
export const transitionPolicyStatus = onCall<TransitionPolicyInput>(async (request) => {
  const { tenantId, policyId, targetStatus } = request.data;
  if (!tenantId || !policyId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, policyId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'approver',
    'tenant_admin',
  ]);

  const policyRef = db.collection('tenants').doc(tenantId).collection('policies').doc(policyId);
  const snap = await policyRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Policy not found.');
  }

  const policy = snap.data() as Policy;
  const now = new Date().toISOString();

  const updatePayload: Partial<Policy> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved' || targetStatus === 'active') {
    updatePayload.approverId = authContext.userId;
    updatePayload.approvedAt = now;
    updatePayload.effectiveDate = now;
  }

  await policyRef.update(updatePayload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'policy',
    entityId: policyId,
    action: 'status_transition',
    beforeSummary: { status: policy.status },
    afterSummary: { status: targetStatus },
    source: 'cloud_function',
    workflowContext: 'policy_lifecycle',
  });

  return { success: true, policyId, status: targetStatus };
});

/**
 * Callable Function: transitionDPIAStatus
 */
export const transitionDPIAStatus = onCall<TransitionDPIAInput>(async (request) => {
  const { tenantId, dpiaId, targetStatus, dpoOpinionNotes } = request.data;
  if (!tenantId || !dpiaId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, dpiaId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'privacy_manager',
    'compliance_manager',
    'approver',
    'tenant_admin',
  ]);

  const dpiaRef = db.collection('tenants').doc(tenantId).collection('dpia_assessments').doc(dpiaId);
  const snap = await dpiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'DPIA assessment not found.');
  }

  const dpia = snap.data() as DPIA;
  const now = new Date().toISOString();

  const updatePayload: Partial<DPIA> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (dpoOpinionNotes) {
    updatePayload.dpoOpinionNotes = dpoOpinionNotes;
    updatePayload.dpoApprovalDate = now;
  }

  await dpiaRef.update(updatePayload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'dpia_assessment',
    entityId: dpiaId,
    action: 'status_transition',
    beforeSummary: { status: dpia.status },
    afterSummary: { status: targetStatus, dpoOpinionNotes: dpoOpinionNotes ?? null },
    source: 'cloud_function',
    workflowContext: 'dpia_lifecycle',
  });

  return { success: true, dpiaId, status: targetStatus };
});

/**
 * Callable Function: transitionTIAStatus
 */
export const transitionTIAStatus = onCall<TransitionTIAInput>(async (request) => {
  const { tenantId, tiaId, targetStatus } = request.data;
  if (!tenantId || !tiaId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, tiaId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'privacy_manager',
    'compliance_manager',
    'approver',
    'tenant_admin',
  ]);

  const tiaRef = db.collection('tenants').doc(tenantId).collection('tia_assessments').doc(tiaId);
  const snap = await tiaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'TIA assessment not found.');
  }

  const tia = snap.data() as TIA;
  const now = new Date().toISOString();

  const updatePayload: Partial<TIA> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved') {
    updatePayload.approvedBy = authContext.userId;
    updatePayload.approvedAt = now;
  }

  await tiaRef.update(updatePayload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'tia_assessment',
    entityId: tiaId,
    action: 'status_transition',
    beforeSummary: { status: tia.status },
    afterSummary: { status: targetStatus },
    source: 'cloud_function',
    workflowContext: 'tia_lifecycle',
  });

  return { success: true, tiaId, status: targetStatus };
});

/**
 * Callable Function: classifyAISystem
 * Evaluates EU AI Act classification rules deterministically and persists classification record.
 */
export const classifyAISystem = onCall<ClassifyAISystemInput>(async (request) => {
  const { tenantId, aiSystemId, prohibitedPracticesCheck, annexThreeCategory, isGeneralPurposeAI, justificationSummary } = request.data;
  if (!tenantId || !aiSystemId) {
    throw new HttpsError('invalid-argument', 'tenantId and aiSystemId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'ai_governance_manager',
    'compliance_manager',
    'security_manager',
    'tenant_admin',
  ]);

  const aiSystemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await aiSystemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  // Deterministic classification logic based on EU AI Act Regulation (EU) 2024/1689
  const hasProhibitedPractices = Object.values(prohibitedPracticesCheck).some((val) => val === true);

  let determinedTier: AIRiskTier = 'minimal_risk';
  if (hasProhibitedPractices) {
    determinedTier = 'prohibited';
  } else if (annexThreeCategory && annexThreeCategory !== 'none') {
    determinedTier = 'high_risk';
  } else if (isGeneralPurposeAI) {
    determinedTier = 'general_purpose_ai';
  }

  const now = new Date().toISOString();
  const assessmentRef = db.collection('tenants').doc(tenantId).collection('ai_assessments').doc();

  const assessmentDoc: AIClassificationAssessment = {
    id: assessmentRef.id,
    tenantId,
    status: 'approved',
    ownerId: authContext.userId,
    aiSystemId,
    assessmentType: 'high_risk_classification',
    prohibitedPracticesCheck,
    annexThreeCategory,
    determinedRiskTier: determinedTier,
    justificationSummary,
    assessedBy: authContext.userId,
    assessedAt: now,
    approvedBy: authContext.userId,
    approvedAt: now,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const batch = db.batch();
  batch.set(assessmentRef, assessmentDoc);
  batch.update(aiSystemRef, {
    riskTier: determinedTier,
    updatedAt: now,
    updatedBy: authContext.userId,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_system',
    entityId: aiSystemId,
    action: 'status_transition',
    afterSummary: { riskTier: determinedTier, assessmentId: assessmentRef.id },
    source: 'cloud_function',
    workflowContext: 'ai_act_classification',
  });

  return { success: true, aiSystemId, determinedRiskTier: determinedTier, assessmentId: assessmentRef.id };
});

/**
 * Callable Function: logAIIncident
 * Records serious AI incidents or malfunctions with regulatory notification deadlines.
 */
export const logAIIncident = onCall<LogAIIncidentInput>(async (request) => {
  const {
    tenantId,
    aiSystemId,
    title,
    severity,
    description,
    isFatalOrSevereHealthImpact,
    isCriticalInfrastructureDisruption,
    isFundamentalRightsBreach,
    rootCauseAnalysis,
    immediateCorrectiveAction,
  } = request.data;

  if (!tenantId || !aiSystemId || !title || !severity) {
    throw new HttpsError('invalid-argument', 'tenantId, aiSystemId, title, and severity are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'ai_governance_manager',
    'compliance_manager',
    'security_manager',
    'tenant_admin',
    'contributor',
  ]);

  const incidentRef = db.collection('tenants').doc(tenantId).collection('ai_incidents').doc();
  const now = new Date();

  // Regulatory deadline: Art. 73 requires notification within 15 days (or 2 days for critical incidents)
  const notificationDeadlineDays = (isFatalOrSevereHealthImpact || isCriticalInfrastructureDisruption) ? 2 : 15;
  const deadlineDate = new Date(now.getTime() + notificationDeadlineDays * 24 * 60 * 60 * 1000).toISOString();

  const incidentDoc: AIIncident = {
    id: incidentRef.id,
    tenantId,
    status: 'reported',
    ownerId: authContext.userId,
    aiSystemId,
    incidentReference: `INC-AI-${Date.now().toString().slice(-6)}`,
    title,
    description,
    severity,
    discoveredAt: now.toISOString(),
    occurredAt: now.toISOString(),
    isFatalOrSevereHealthImpact,
    isCriticalInfrastructureDisruption,
    isFundamentalRightsBreach,
    marketSurveillanceAuthorityNotified: false,
    authorityNotificationDeadline: deadlineDate,
    authorityNotificationDate: null,
    rootCauseAnalysis,
    immediateCorrectiveAction,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await incidentRef.set(incidentDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_incident',
    entityId: incidentRef.id,
    action: 'create',
    afterSummary: { incidentReference: incidentDoc.incidentReference, severity, title },
    source: 'cloud_function',
    workflowContext: 'ai_incident_logging',
  });

  return { success: true, incidentId: incidentRef.id, incidentReference: incidentDoc.incidentReference };
});

export interface CreateROPAFromTemplateInput {
  tenantId: string;
  activityCode: string;
  activityName: string;
  purpose: string;
  legalBasis: LegalBasisType;
  legalBasisRationale: string;
  isSpecialCategoryData: boolean;
  dataSubjectCategories: string[];
  personalDataCategories: string[];
  retentionPeriodDescription: string;
  retentionPeriodMonths: number;
  dataSecurityMeasuresSummary: string;
  processorIds?: string[];
  involvesInternationalTransfer?: boolean;
  dpiaRequired?: boolean;
}

/**
 * Callable Function: createROPAFromTemplate
 * Standardized ROPA activity creation with validation and audit trail.
 */
export const createROPAFromTemplate = onCall<CreateROPAFromTemplateInput>(async (request) => {
  const {
    tenantId,
    activityCode,
    activityName,
    purpose,
    legalBasis,
    legalBasisRationale,
    isSpecialCategoryData,
    dataSubjectCategories,
    personalDataCategories,
    retentionPeriodDescription,
    retentionPeriodMonths,
    dataSecurityMeasuresSummary,
    processorIds = [],
    involvesInternationalTransfer = false,
    dpiaRequired = false,
  } = request.data;

  if (!tenantId || !activityCode || !activityName || !legalBasis) {
    throw new HttpsError('invalid-argument', 'tenantId, activityCode, activityName, and legalBasis are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'privacy_manager',
    'compliance_manager',
    'tenant_admin',
  ]);

  const ropaRef = db.collection('tenants').doc(tenantId).collection('ropa_entries').doc();
  const now = new Date().toISOString();

  const ropaDoc: ROPAEntry = {
    id: ropaRef.id,
    tenantId,
    activityCode,
    activityName,
    purpose,
    legalBasis,
    legalBasisRationale,
    isSpecialCategoryData,
    specialCategoryBasis: null,
    dataSubjectCategories,
    personalDataCategories,
    retentionPeriodDescription,
    retentionPeriodMonths,
    dataSecurityMeasuresSummary,
    jointControllerInfo: null,
    processorIds,
    recipientCategories: [],
    involvesInternationalTransfer,
    destinationCountries: [],
    transferMechanism: null,
    dpiaRequired,
    linkedDpiaId: null,
    linkedTiaId: null,
    linkedSystemAssetIds: [],
    status: 'draft',
    ownerId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await ropaRef.set(ropaDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ropa_entry',
    entityId: ropaRef.id,
    action: 'create',
    afterSummary: { activityCode, activityName, legalBasis },
    source: 'cloud_function',
    workflowContext: 'ropa_creation_workflow',
  });

  return { success: true, ropaId: ropaRef.id, activityCode };
});

export interface TransitionAIAssessmentInput {
  tenantId: string;
  assessmentId: string;
  targetStatus: AIAssessmentStatus;
}

/**
 * Callable Function: transitionAIAssessmentStatus
 * Transitions AI assessment (FRIA / Impact Assessment) with authorized sign-off.
 */
export const transitionAIAssessmentStatus = onCall<TransitionAIAssessmentInput>(async (request) => {
  const { tenantId, assessmentId, targetStatus } = request.data;
  if (!tenantId || !assessmentId || !targetStatus) {
    throw new HttpsError('invalid-argument', 'tenantId, assessmentId, and targetStatus are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'ai_governance_manager',
    'compliance_manager',
    'approver',
    'tenant_admin',
  ]);

  const assessmentRef = db.collection('tenants').doc(tenantId).collection('ai_assessments').doc(assessmentId);
  const snap = await assessmentRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI assessment not found.');
  }

  const now = new Date().toISOString();
  const updatePayload: Partial<AIClassificationAssessment | AIImpactAssessment | FRIA> = {
    status: targetStatus,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (targetStatus === 'approved') {
    (updatePayload as Record<string, unknown>).approvedBy = authContext.userId;
    (updatePayload as Record<string, unknown>).approvedAt = now;
  }

  await assessmentRef.update(updatePayload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_assessment',
    entityId: assessmentId,
    action: 'status_transition',
    afterSummary: { status: targetStatus },
    source: 'cloud_function',
    workflowContext: 'ai_assessment_lifecycle',
  });

  return { success: true, assessmentId, status: targetStatus };
});

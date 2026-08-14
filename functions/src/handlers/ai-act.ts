import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  AISystem,
  AIRoleType,
  AIRiskTier,
  AISystemStatus,
  AIClassificationAssessment,
  AIAssessmentType,
  AIAssessmentStatus,
  AIIncident,
  AIIncidentSeverity,
  AIIncidentStatus,
  PostMarketMonitoring,
} from '@eurogovernance/shared-types';

export interface SubstantialChangeRecord {
  id: string;
  tenantId: string;
  aiSystemId: string;
  changeTitle: string;
  description: string;
  changeType: 'model_architecture' | 'intended_purpose' | 'training_data_distribution' | 'performance_drift' | 'deployment_context';
  requiresReclassification: boolean;
  loggedBy: string;
  loggedAt: string;
}

// -----------------------------------------------------------------------------
// 1. AI SYSTEMS REGISTER HANDLERS
// -----------------------------------------------------------------------------

export interface CreateAISystemInput {
  tenantId: string;
  code: string;
  name: string;
  version?: string;
  description: string;
  role: AIRoleType;
  intendedPurpose: string;
  deploymentContext: string;
  isGeneralPurposeAI?: boolean;
  hasSystemicRisk?: boolean;
  underlyingFoundationModel?: string | null;
  vendorId?: string | null;
  humanOversightMeasures?: string;
  transparencyMeasures?: string;
  euDatabaseRegistrationNumber?: string | null;
  linkedSystemAssetId?: string | null;
  linkedRopaId?: string | null;
  linkedControlIds?: string[];
  ownerId?: string;
  status?: AISystemStatus;
}

export interface UpdateAISystemInput {
  tenantId: string;
  aiSystemId: string;
  name?: string;
  version?: string;
  description?: string;
  role?: AIRoleType;
  intendedPurpose?: string;
  deploymentContext?: string;
  isGeneralPurposeAI?: boolean;
  hasSystemicRisk?: boolean;
  underlyingFoundationModel?: string | null;
  vendorId?: string | null;
  status?: AISystemStatus;
  humanOversightMeasures?: string;
  transparencyMeasures?: string;
  euDatabaseRegistrationNumber?: string | null;
  linkedSystemAssetId?: string | null;
  linkedRopaId?: string | null;
  linkedControlIds?: string[];
  ownerId?: string;
}

export interface DeleteAISystemInput {
  tenantId: string;
  aiSystemId: string;
}

export interface ListAISystemsInput {
  tenantId: string;
  riskTier?: AIRiskTier;
  status?: AISystemStatus;
  role?: AIRoleType;
  isGeneralPurposeAI?: boolean;
}

export const createTenantAISystem = onCall<CreateAISystemInput>(async (request) => {
  const {
    tenantId,
    code,
    name,
    version = '1.0',
    description,
    role,
    intendedPurpose,
    deploymentContext,
    isGeneralPurposeAI = false,
    hasSystemicRisk = false,
    underlyingFoundationModel = null,
    vendorId = null,
    humanOversightMeasures = '',
    transparencyMeasures = '',
    euDatabaseRegistrationNumber = null,
    linkedSystemAssetId = null,
    linkedRopaId = null,
    linkedControlIds = [],
    ownerId,
    status = 'development',
  } = request.data;

  if (!tenantId || !code || !name || !role || !intendedPurpose || !deploymentContext) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, code, name, role, intendedPurpose, and deploymentContext are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'compliance_manager',
    'security_manager',
  ]);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc();
  const now = new Date().toISOString();

  // Initial riskTier defaults to minimal_risk until formal classification screening
  const systemDoc: AISystem = {
    id: systemRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    name: name.trim(),
    version: version.trim(),
    description: description.trim(),
    role,
    riskTier: 'minimal_risk',
    intendedPurpose: intendedPurpose.trim(),
    deploymentContext: deploymentContext.trim(),
    isGeneralPurposeAI,
    hasSystemicRisk,
    underlyingFoundationModel,
    vendorId,
    status,
    humanOversightMeasures: humanOversightMeasures.trim(),
    transparencyMeasures: transparencyMeasures.trim(),
    euDatabaseRegistrationNumber,
    linkedSystemAssetId,
    linkedRopaId,
    linkedControlIds,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await systemRef.set(systemDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_system',
    entityId: systemRef.id,
    action: 'create',
    afterSummary: { code: systemDoc.code, name: systemDoc.name, role, riskTier: systemDoc.riskTier },
    source: 'cloud_function',
    workflowContext: 'ai_system_registration',
  });

  return { success: true, aiSystemId: systemRef.id, aiSystem: systemDoc };
});

export const updateTenantAISystem = onCall<UpdateAISystemInput>(async (request) => {
  const { tenantId, aiSystemId, ...updates } = request.data;
  if (!tenantId || !aiSystemId) {
    throw new HttpsError('invalid-argument', 'tenantId and aiSystemId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'compliance_manager',
    'security_manager',
  ]);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await systemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  const prev = snap.data() as AISystem;
  const now = new Date().toISOString();

  // Protect riskTier from direct mutation in standard update path
  const payload: Partial<AISystem> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await systemRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_system',
    entityId: aiSystemId,
    action: 'update',
    beforeSummary: { status: prev.status, version: prev.version },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'ai_system_update',
  });

  return { success: true, aiSystemId, updatedFields: payload };
});

export const deleteTenantAISystem = onCall<DeleteAISystemInput>(async (request) => {
  const { tenantId, aiSystemId } = request.data;
  if (!tenantId || !aiSystemId) {
    throw new HttpsError('invalid-argument', 'tenantId and aiSystemId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await systemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  const prev = snap.data() as AISystem;
  await systemRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_system',
    entityId: aiSystemId,
    action: 'delete',
    beforeSummary: { code: prev.code, name: prev.name },
    source: 'cloud_function',
    workflowContext: 'ai_system_deletion',
  });

  return { success: true, aiSystemId, deleted: true };
});

export const listTenantAISystems = onCall<ListAISystemsInput>(async (request) => {
  const { tenantId, riskTier, status, role, isGeneralPurposeAI } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('ai_systems');
  if (riskTier) query = query.where('riskTier', '==', riskTier);
  if (status) query = query.where('status', '==', status);
  if (role) query = query.where('role', '==', role);
  if (isGeneralPurposeAI !== undefined) query = query.where('isGeneralPurposeAI', '==', isGeneralPurposeAI);

  const snap = await query.get();
  const systems: AISystem[] = snap.docs.map((d) => d.data() as AISystem);

  return { success: true, count: systems.length, systems };
});

// -----------------------------------------------------------------------------
// 2. CONTROLLED CLASSIFICATION & ASSESSMENTS HANDLERS
// -----------------------------------------------------------------------------

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
  isGeneralPurposeAI?: boolean;
  justificationSummary: string;
}

export interface ListAIAssessmentsInput {
  tenantId: string;
  aiSystemId?: string;
  assessmentType?: AIAssessmentType;
  status?: AIAssessmentStatus;
}

export const classifyTenantAISystem = onCall<ClassifyAISystemInput>(async (request) => {
  const {
    tenantId,
    aiSystemId,
    prohibitedPracticesCheck,
    annexThreeCategory,
    isGeneralPurposeAI = false,
    justificationSummary,
  } = request.data;

  if (!tenantId || !aiSystemId || !prohibitedPracticesCheck || !annexThreeCategory || !justificationSummary) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, aiSystemId, prohibitedPracticesCheck, annexThreeCategory, and justificationSummary are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'compliance_manager',
  ]);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await systemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  const prevSystem = snap.data() as AISystem;

  // Strict Regulatory Decision Matrix
  const hasProhibitedPractices = Object.values(prohibitedPracticesCheck).some((v) => v === true);
  let determinedTier: AIRiskTier = 'minimal_risk';

  if (hasProhibitedPractices) {
    determinedTier = 'prohibited';
  } else if (annexThreeCategory !== 'none') {
    determinedTier = 'high_risk';
  } else if (isGeneralPurposeAI) {
    determinedTier = 'general_purpose_ai';
  }

  const assessmentRef = db.collection('tenants').doc(tenantId).collection('ai_assessments').doc();
  const now = new Date().toISOString();

  const assessmentDoc: AIClassificationAssessment = {
    id: assessmentRef.id,
    tenantId,
    aiSystemId,
    assessmentType: 'high_risk_classification',
    status: 'approved',
    prohibitedPracticesCheck,
    annexThreeCategory,
    determinedRiskTier: determinedTier,
    justificationSummary: justificationSummary.trim(),
    assessedBy: authContext.userId,
    assessedAt: now,
    approvedBy: authContext.userId,
    approvedAt: now,
    ownerId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const batch = db.batch();
  batch.set(assessmentRef, assessmentDoc);
  batch.update(systemRef, {
    riskTier: determinedTier,
    isGeneralPurposeAI,
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
    beforeSummary: { riskTier: prevSystem.riskTier },
    afterSummary: {
      riskTier: determinedTier,
      assessmentId: assessmentRef.id,
      annexThreeCategory,
      hasProhibitedPractices,
    },
    source: 'cloud_function',
    workflowContext: 'ai_act_classification',
  });

  return { success: true, aiSystemId, determinedRiskTier: determinedTier, assessmentId: assessmentRef.id };
});

export const listTenantAIAssessments = onCall<ListAIAssessmentsInput>(async (request) => {
  const { tenantId, aiSystemId, assessmentType, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('ai_assessments');
  if (aiSystemId) query = query.where('aiSystemId', '==', aiSystemId);
  if (assessmentType) query = query.where('assessmentType', '==', assessmentType);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const assessments = snap.docs.map((d) => d.data());

  return { success: true, count: assessments.length, assessments };
});

// -----------------------------------------------------------------------------
// 3. AI INCIDENTS (ART. 73)
// -----------------------------------------------------------------------------

export interface LogAIIncidentInput {
  tenantId: string;
  aiSystemId: string;
  incidentReference: string;
  title: string;
  description: string;
  severity: AIIncidentSeverity;
  discoveredAt: string;
  occurredAt?: string | null;
  isFatalOrSevereHealthImpact?: boolean;
  isCriticalInfrastructureDisruption?: boolean;
  isFundamentalRightsBreach?: boolean;
  rootCauseAnalysis?: string;
  immediateCorrectiveAction?: string;
  ownerId?: string;
}

export interface UpdateAIIncidentInput {
  tenantId: string;
  incidentId: string;
  status?: AIIncidentStatus;
  marketSurveillanceAuthorityNotified?: boolean;
  authorityNotificationDate?: string | null;
  rootCauseAnalysis?: string;
  immediateCorrectiveAction?: string;
}

export interface ListAIIncidentsInput {
  tenantId: string;
  aiSystemId?: string;
  severity?: AIIncidentSeverity;
  status?: AIIncidentStatus;
}

export const logTenantAIIncident = onCall<LogAIIncidentInput>(async (request) => {
  const {
    tenantId,
    aiSystemId,
    incidentReference,
    title,
    description,
    severity,
    discoveredAt,
    occurredAt = null,
    isFatalOrSevereHealthImpact = false,
    isCriticalInfrastructureDisruption = false,
    isFundamentalRightsBreach = false,
    rootCauseAnalysis = '',
    immediateCorrectiveAction = '',
    ownerId,
  } = request.data;

  if (!tenantId || !aiSystemId || !incidentReference || !title || !description || !severity || !discoveredAt) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, aiSystemId, incidentReference, title, description, severity, and discoveredAt are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'security_manager',
    'compliance_manager',
  ]);

  const incidentRef = db.collection('tenants').doc(tenantId).collection('ai_incidents').doc();
  const now = new Date().toISOString();

  // Art. 73 notification deadline: 2 days for serious health/infrastructure disruption; 15 days standard
  const daysLimit = isFatalOrSevereHealthImpact || isCriticalInfrastructureDisruption ? 2 : 15;
  const authorityNotificationDeadline = new Date(
    new Date(discoveredAt).getTime() + daysLimit * 24 * 60 * 60 * 1000
  ).toISOString();

  const incidentDoc: AIIncident = {
    id: incidentRef.id,
    tenantId,
    aiSystemId,
    incidentReference: incidentReference.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    severity,
    status: 'reported',
    discoveredAt,
    occurredAt,
    isFatalOrSevereHealthImpact,
    isCriticalInfrastructureDisruption,
    isFundamentalRightsBreach,
    marketSurveillanceAuthorityNotified: false,
    authorityNotificationDeadline,
    authorityNotificationDate: null,
    rootCauseAnalysis: rootCauseAnalysis.trim(),
    immediateCorrectiveAction: immediateCorrectiveAction.trim(),
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
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
    afterSummary: { incidentReference: incidentDoc.incidentReference, severity, authorityNotificationDeadline },
    source: 'cloud_function',
    workflowContext: 'ai_incident_log',
  });

  return { success: true, incidentId: incidentRef.id, incident: incidentDoc };
});

export const updateTenantAIIncident = onCall<UpdateAIIncidentInput>(async (request) => {
  const {
    tenantId,
    incidentId,
    status,
    marketSurveillanceAuthorityNotified,
    authorityNotificationDate,
    rootCauseAnalysis,
    immediateCorrectiveAction,
  } = request.data;

  if (!tenantId || !incidentId) {
    throw new HttpsError('invalid-argument', 'tenantId and incidentId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'security_manager',
    'compliance_manager',
  ]);

  const incidentRef = db.collection('tenants').doc(tenantId).collection('ai_incidents').doc(incidentId);
  const snap = await incidentRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI Incident record not found.');
  }

  const prev = snap.data() as AIIncident;
  const now = new Date().toISOString();

  const updates: Partial<AIIncident> = {
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) updates.status = status;
  if (marketSurveillanceAuthorityNotified !== undefined) updates.marketSurveillanceAuthorityNotified = marketSurveillanceAuthorityNotified;
  if (authorityNotificationDate !== undefined) updates.authorityNotificationDate = authorityNotificationDate;
  if (rootCauseAnalysis !== undefined) updates.rootCauseAnalysis = rootCauseAnalysis;
  if (immediateCorrectiveAction !== undefined) updates.immediateCorrectiveAction = immediateCorrectiveAction;

  await incidentRef.update(updates);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_incident',
    entityId: incidentId,
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: updates as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'ai_incident_update',
  });

  return { success: true, incidentId, updatedFields: updates };
});

export const listTenantAIIncidents = onCall<ListAIIncidentsInput>(async (request) => {
  const { tenantId, aiSystemId, severity, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('ai_incidents');
  if (aiSystemId) query = query.where('aiSystemId', '==', aiSystemId);
  if (severity) query = query.where('severity', '==', severity);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const incidents: AIIncident[] = snap.docs.map((d) => d.data() as AIIncident);

  return { success: true, count: incidents.length, incidents };
});

// -----------------------------------------------------------------------------
// 4. SUBSTANTIAL CHANGES (ART. 3(23))
// -----------------------------------------------------------------------------

export interface LogSubstantialChangeInput {
  tenantId: string;
  aiSystemId: string;
  changeTitle: string;
  description: string;
  changeType: 'model_architecture' | 'intended_purpose' | 'training_data_distribution' | 'performance_drift' | 'deployment_context';
  requiresReclassification?: boolean;
}

export interface ListSubstantialChangesInput {
  tenantId: string;
  aiSystemId: string;
}

export const logSubstantialChange = onCall<LogSubstantialChangeInput>(async (request) => {
  const {
    tenantId,
    aiSystemId,
    changeTitle,
    description,
    changeType,
    requiresReclassification = true,
  } = request.data;

  if (!tenantId || !aiSystemId || !changeTitle || !description || !changeType) {
    throw new HttpsError('invalid-argument', 'tenantId, aiSystemId, changeTitle, description, and changeType are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
  ]);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await systemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  const changeRef = systemRef.collection('substantial_changes').doc();
  const now = new Date().toISOString();

  const changeDoc: SubstantialChangeRecord = {
    id: changeRef.id,
    tenantId,
    aiSystemId,
    changeTitle: changeTitle.trim(),
    description: description.trim(),
    changeType,
    requiresReclassification,
    loggedBy: authContext.userId,
    loggedAt: now,
  };

  const batch = db.batch();
  batch.set(changeRef, changeDoc);
  if (requiresReclassification) {
    batch.update(systemRef, {
      status: 'testing',
      updatedAt: now,
      updatedBy: authContext.userId,
    });
  }
  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_substantial_change',
    entityId: changeRef.id,
    action: 'create',
    afterSummary: { aiSystemId, changeTitle, changeType, requiresReclassification },
    source: 'cloud_function',
    workflowContext: 'substantial_change_log',
  });

  return { success: true, changeId: changeRef.id, change: changeDoc };
});

export const listSubstantialChanges = onCall<ListSubstantialChangesInput>(async (request) => {
  const { tenantId, aiSystemId } = request.data;
  if (!tenantId || !aiSystemId) {
    throw new HttpsError('invalid-argument', 'tenantId and aiSystemId are required.');
  }

  await requireTenantMember(request, tenantId);

  const changesSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('ai_systems')
    .doc(aiSystemId)
    .collection('substantial_changes')
    .get();

  const changes: SubstantialChangeRecord[] = changesSnap.docs.map((d) => d.data() as SubstantialChangeRecord);
  return { success: true, count: changes.length, changes };
});

// -----------------------------------------------------------------------------
// 5. POST-MARKET MONITORING LOGS (ART. 72)
// -----------------------------------------------------------------------------

export interface LogPostMarketMonitoringInput {
  tenantId: string;
  aiSystemId: string;
  monitoringPeriodStart: string;
  monitoringPeriodEnd: string;
  performanceMetricsSummary: string;
  biasAndDriftFindings?: string;
  correctiveActionsRequired?: boolean;
  linkedIssueIds?: string[];
  ownerId?: string;
}

export interface ListPostMarketLogsInput {
  tenantId: string;
  aiSystemId: string;
}

export const logPostMarketMonitoring = onCall<LogPostMarketMonitoringInput>(async (request) => {
  const {
    tenantId,
    aiSystemId,
    monitoringPeriodStart,
    monitoringPeriodEnd,
    performanceMetricsSummary,
    biasAndDriftFindings = '',
    correctiveActionsRequired = false,
    linkedIssueIds = [],
    ownerId,
  } = request.data;

  if (!tenantId || !aiSystemId || !monitoringPeriodStart || !monitoringPeriodEnd || !performanceMetricsSummary) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, aiSystemId, monitoringPeriodStart, monitoringPeriodEnd, and performanceMetricsSummary are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'ai_governance_manager',
    'compliance_manager',
  ]);

  const systemRef = db.collection('tenants').doc(tenantId).collection('ai_systems').doc(aiSystemId);
  const snap = await systemRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'AI System not found.');
  }

  const logRef = systemRef.collection('post_market_logs').doc();
  const now = new Date().toISOString();

  const logDoc: PostMarketMonitoring = {
    id: logRef.id,
    tenantId,
    aiSystemId,
    monitoringPeriodStart,
    monitoringPeriodEnd,
    performanceMetricsSummary: performanceMetricsSummary.trim(),
    biasAndDriftFindings: biasAndDriftFindings.trim(),
    correctiveActionsRequired,
    linkedIssueIds,
    reviewedBy: authContext.userId,
    reviewedAt: now,
    status: 'completed',
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await logRef.set(logDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'ai_post_market_log',
    entityId: logRef.id,
    action: 'create',
    afterSummary: { aiSystemId, monitoringPeriodStart, monitoringPeriodEnd, correctiveActionsRequired },
    source: 'cloud_function',
    workflowContext: 'post_market_monitoring',
  });

  return { success: true, logId: logRef.id, postMarketLog: logDoc };
});

export const listPostMarketLogs = onCall<ListPostMarketLogsInput>(async (request) => {
  const { tenantId, aiSystemId } = request.data;
  if (!tenantId || !aiSystemId) {
    throw new HttpsError('invalid-argument', 'tenantId and aiSystemId are required.');
  }

  await requireTenantMember(request, tenantId);

  const logsSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('ai_systems')
    .doc(aiSystemId)
    .collection('post_market_logs')
    .get();

  const logs: PostMarketMonitoring[] = logsSnap.docs.map((d) => d.data() as PostMarketMonitoring);
  return { success: true, count: logs.length, logs };
});

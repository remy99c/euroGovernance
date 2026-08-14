import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  ISOFrameworkType,
  ISOScopeStatement,
  ISOObjective,
  ObjectiveStatus,
  StatementOfApplicabilityEntry,
  ISOInternalAudit,
  AuditStatus,
  ISOFinding,
  FindingType,
  FindingStatus,
  ISOManagementReview,
} from '@eurogovernance/shared-types';

// -----------------------------------------------------------------------------
// 1. SCOPE STATEMENTS (CLAUSE 4.3)
// -----------------------------------------------------------------------------

export interface CreateScopeInput {
  tenantId: string;
  frameworkType: ISOFrameworkType;
  title: string;
  scopeBoundaries: string;
  includedLocations: string[];
  includedBusinessUnits: string[];
  exclusionsJustification?: string;
  version?: string;
  ownerId?: string;
}

export interface UpdateScopeInput {
  tenantId: string;
  scopeId: string;
  title?: string;
  scopeBoundaries?: string;
  includedLocations?: string[];
  includedBusinessUnits?: string[];
  exclusionsJustification?: string;
  version?: string;
}

export interface DeleteScopeInput {
  tenantId: string;
  scopeId: string;
}

export interface ListScopesInput {
  tenantId: string;
  frameworkType?: ISOFrameworkType;
}

export const createISOScopeStatement = onCall<CreateScopeInput>(async (request) => {
  const {
    tenantId,
    frameworkType,
    title,
    scopeBoundaries,
    includedLocations,
    includedBusinessUnits,
    exclusionsJustification = 'No exclusions from normative requirements.',
    version = '1.0',
    ownerId,
  } = request.data;

  if (!tenantId || !frameworkType || !title || !scopeBoundaries || !includedLocations || !includedBusinessUnits) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, frameworkType, title, scopeBoundaries, includedLocations, and includedBusinessUnits are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const scopeRef = db.collection('tenants').doc(tenantId).collection('iso_scope_statements').doc();
  const now = new Date().toISOString();

  const scopeDoc: ISOScopeStatement = {
    id: scopeRef.id,
    tenantId,
    frameworkType,
    title: title.trim(),
    scopeBoundaries: scopeBoundaries.trim(),
    includedLocations,
    includedBusinessUnits,
    exclusionsJustification: exclusionsJustification.trim(),
    approvedBy: authContext.userId,
    approvedAt: now,
    version: version.trim(),
    status: 'active',
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await scopeRef.set(scopeDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_scope_statement',
    entityId: scopeRef.id,
    action: 'create',
    afterSummary: { frameworkType, title: scopeDoc.title, version: scopeDoc.version },
    source: 'cloud_function',
    workflowContext: 'iso_scope_definition',
  });

  return { success: true, scopeId: scopeRef.id, scopeStatement: scopeDoc };
});

export const updateISOScopeStatement = onCall<UpdateScopeInput>(async (request) => {
  const { tenantId, scopeId, ...updates } = request.data;
  if (!tenantId || !scopeId) {
    throw new HttpsError('invalid-argument', 'tenantId and scopeId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const scopeRef = db.collection('tenants').doc(tenantId).collection('iso_scope_statements').doc(scopeId);
  const snap = await scopeRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Scope statement not found.');
  }

  const prev = snap.data() as ISOScopeStatement;
  const now = new Date().toISOString();

  const payload: Partial<ISOScopeStatement> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await scopeRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_scope_statement',
    entityId: scopeId,
    action: 'update',
    beforeSummary: { title: prev.title, version: prev.version },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_scope_update',
  });

  return { success: true, scopeId, updatedFields: payload };
});

export const deleteISOScopeStatement = onCall<DeleteScopeInput>(async (request) => {
  const { tenantId, scopeId } = request.data;
  if (!tenantId || !scopeId) {
    throw new HttpsError('invalid-argument', 'tenantId and scopeId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const scopeRef = db.collection('tenants').doc(tenantId).collection('iso_scope_statements').doc(scopeId);
  const snap = await scopeRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Scope statement not found.');
  }

  const prev = snap.data() as ISOScopeStatement;
  await scopeRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_scope_statement',
    entityId: scopeId,
    action: 'delete',
    beforeSummary: { title: prev.title, frameworkType: prev.frameworkType },
    source: 'cloud_function',
    workflowContext: 'iso_scope_deletion',
  });

  return { success: true, scopeId, deleted: true };
});

export const listISOScopeStatements = onCall<ListScopesInput>(async (request) => {
  const { tenantId, frameworkType } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('iso_scope_statements');
  if (frameworkType) query = query.where('frameworkType', '==', frameworkType);

  const snap = await query.get();
  const scopes: ISOScopeStatement[] = snap.docs.map((d) => d.data() as ISOScopeStatement);

  return { success: true, count: scopes.length, scopeStatements: scopes };
});

// -----------------------------------------------------------------------------
// 2. OBJECTIVES & MEASURABLE TARGETS (CLAUSE 6.2)
// -----------------------------------------------------------------------------

export interface CreateObjectiveInput {
  tenantId: string;
  frameworkType: ISOFrameworkType;
  title: string;
  targetKpiDescription: string;
  baselineValue: string;
  targetValue: string;
  currentValue?: string;
  targetDate: string;
  responsibleRole: string;
  status?: ObjectiveStatus;
  ownerId?: string;
}

export interface UpdateObjectiveInput {
  tenantId: string;
  objId: string;
  title?: string;
  targetKpiDescription?: string;
  targetValue?: string;
  currentValue?: string;
  status?: ObjectiveStatus;
  targetDate?: string;
  responsibleRole?: string;
}

export interface DeleteObjectiveInput {
  tenantId: string;
  objId: string;
}

export interface ListObjectivesInput {
  tenantId: string;
  frameworkType?: ISOFrameworkType;
  status?: ObjectiveStatus;
}

export const createISOObjective = onCall<CreateObjectiveInput>(async (request) => {
  const {
    tenantId,
    frameworkType,
    title,
    targetKpiDescription,
    baselineValue,
    targetValue,
    currentValue = baselineValue,
    targetDate,
    responsibleRole,
    status = 'planned',
    ownerId,
  } = request.data;

  if (!tenantId || !frameworkType || !title || !targetKpiDescription || !baselineValue || !targetValue || !targetDate || !responsibleRole) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, frameworkType, title, targetKpiDescription, baselineValue, targetValue, targetDate, and responsibleRole are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const objRef = db.collection('tenants').doc(tenantId).collection('iso_objectives').doc();
  const now = new Date().toISOString();

  const objDoc: ISOObjective = {
    id: objRef.id,
    tenantId,
    frameworkType,
    title: title.trim(),
    targetKpiDescription: targetKpiDescription.trim(),
    baselineValue: baselineValue.trim(),
    targetValue: targetValue.trim(),
    currentValue: currentValue.trim(),
    status,
    targetDate,
    responsibleRole: responsibleRole.trim(),
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await objRef.set(objDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_objective',
    entityId: objRef.id,
    action: 'create',
    afterSummary: { frameworkType, title: objDoc.title, targetValue, targetDate },
    source: 'cloud_function',
    workflowContext: 'iso_objective_creation',
  });

  return { success: true, objId: objRef.id, objective: objDoc };
});

export const updateISOObjective = onCall<UpdateObjectiveInput>(async (request) => {
  const { tenantId, objId, ...updates } = request.data;
  if (!tenantId || !objId) {
    throw new HttpsError('invalid-argument', 'tenantId and objId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const objRef = db.collection('tenants').doc(tenantId).collection('iso_objectives').doc(objId);
  const snap = await objRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Objective not found.');
  }

  const prev = snap.data() as ISOObjective;
  const now = new Date().toISOString();

  const payload: Partial<ISOObjective> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await objRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_objective',
    entityId: objId,
    action: 'update',
    beforeSummary: { status: prev.status, currentValue: prev.currentValue },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_objective_update',
  });

  return { success: true, objId, updatedFields: payload };
});

export const deleteISOObjective = onCall<DeleteObjectiveInput>(async (request) => {
  const { tenantId, objId } = request.data;
  if (!tenantId || !objId) {
    throw new HttpsError('invalid-argument', 'tenantId and objId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const objRef = db.collection('tenants').doc(tenantId).collection('iso_objectives').doc(objId);
  const snap = await objRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Objective not found.');
  }

  const prev = snap.data() as ISOObjective;
  await objRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_objective',
    entityId: objId,
    action: 'delete',
    beforeSummary: { title: prev.title, frameworkType: prev.frameworkType },
    source: 'cloud_function',
    workflowContext: 'iso_objective_deletion',
  });

  return { success: true, objId, deleted: true };
});

export const listISOObjectives = onCall<ListObjectivesInput>(async (request) => {
  const { tenantId, frameworkType, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('iso_objectives');
  if (frameworkType) query = query.where('frameworkType', '==', frameworkType);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const objectives: ISOObjective[] = snap.docs.map((d) => d.data() as ISOObjective);

  return { success: true, count: objectives.length, objectives };
});

// -----------------------------------------------------------------------------
// 3. STATEMENT OF APPLICABILITY (SoA - CLAUSE 6.1.3)
// -----------------------------------------------------------------------------

export interface CreateSoAEntryInput {
  tenantId: string;
  frameworkType: ISOFrameworkType;
  controlCode: string;
  controlTitle: string;
  isApplicable: boolean;
  justification: string;
  linkedTenantControlId?: string | null;
  ownerId?: string;
}

export interface UpdateSoAEntryInput {
  tenantId: string;
  soaId: string;
  isApplicable?: boolean;
  justification?: string;
  linkedTenantControlId?: string | null;
}

export interface DeleteSoAEntryInput {
  tenantId: string;
  soaId: string;
}

export interface ListSoAEntriesInput {
  tenantId: string;
  frameworkType?: ISOFrameworkType;
  isApplicable?: boolean;
}

export const createISOSoAEntry = onCall<CreateSoAEntryInput>(async (request) => {
  const {
    tenantId,
    frameworkType,
    controlCode,
    controlTitle,
    isApplicable,
    justification,
    linkedTenantControlId = null,
    ownerId,
  } = request.data;

  if (!tenantId || !frameworkType || !controlCode || !controlTitle || isApplicable === undefined || !justification) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, frameworkType, controlCode, controlTitle, isApplicable, and justification are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const soaRef = db.collection('tenants').doc(tenantId).collection('iso_soa_entries').doc();
  const now = new Date().toISOString();

  const soaDoc: StatementOfApplicabilityEntry = {
    id: soaRef.id,
    tenantId,
    frameworkType,
    controlCode: controlCode.trim().toUpperCase(),
    controlTitle: controlTitle.trim(),
    isApplicable,
    justification: justification.trim(),
    linkedTenantControlId,
    reviewedAt: now,
    status: 'active',
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await soaRef.set(soaDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_soa_entry',
    entityId: soaRef.id,
    action: 'create',
    afterSummary: { frameworkType, controlCode: soaDoc.controlCode, isApplicable },
    source: 'cloud_function',
    workflowContext: 'iso_soa_entry_creation',
  });

  return { success: true, soaId: soaRef.id, soaEntry: soaDoc };
});

export const updateISOSoAEntry = onCall<UpdateSoAEntryInput>(async (request) => {
  const { tenantId, soaId, ...updates } = request.data;
  if (!tenantId || !soaId) {
    throw new HttpsError('invalid-argument', 'tenantId and soaId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
  ]);

  const soaRef = db.collection('tenants').doc(tenantId).collection('iso_soa_entries').doc(soaId);
  const snap = await soaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'SoA entry not found.');
  }

  const prev = snap.data() as StatementOfApplicabilityEntry;
  const now = new Date().toISOString();

  const payload: Partial<StatementOfApplicabilityEntry> = {
    ...updates,
    reviewedAt: now,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await soaRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_soa_entry',
    entityId: soaId,
    action: 'update',
    beforeSummary: { isApplicable: prev.isApplicable, justification: prev.justification },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_soa_update',
  });

  return { success: true, soaId, updatedFields: payload };
});

export const deleteISOSoAEntry = onCall<DeleteSoAEntryInput>(async (request) => {
  const { tenantId, soaId } = request.data;
  if (!tenantId || !soaId) {
    throw new HttpsError('invalid-argument', 'tenantId and soaId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const soaRef = db.collection('tenants').doc(tenantId).collection('iso_soa_entries').doc(soaId);
  const snap = await soaRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'SoA entry not found.');
  }

  const prev = snap.data() as StatementOfApplicabilityEntry;
  await soaRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_soa_entry',
    entityId: soaId,
    action: 'delete',
    beforeSummary: { controlCode: prev.controlCode, frameworkType: prev.frameworkType },
    source: 'cloud_function',
    workflowContext: 'iso_soa_deletion',
  });

  return { success: true, soaId, deleted: true };
});

export const listISOSoAEntries = onCall<ListSoAEntriesInput>(async (request) => {
  const { tenantId, frameworkType, isApplicable } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('iso_soa_entries');
  if (frameworkType) query = query.where('frameworkType', '==', frameworkType);
  if (isApplicable !== undefined) query = query.where('isApplicable', '==', isApplicable);

  const snap = await query.get();
  const entries: StatementOfApplicabilityEntry[] = snap.docs.map((d) => d.data() as StatementOfApplicabilityEntry);

  return { success: true, count: entries.length, soaEntries: entries };
});

// -----------------------------------------------------------------------------
// 4. INTERNAL AUDITS (CLAUSE 9.2)
// -----------------------------------------------------------------------------

export interface CreateInternalAuditInput {
  tenantId: string;
  frameworkType: ISOFrameworkType;
  auditPlanTitle: string;
  leadAuditorName: string;
  auditTeamNames?: string[];
  startDate: string;
  endDate: string;
  auditScope: string;
  summaryReportStoragePath?: string | null;
  status?: AuditStatus;
  ownerId?: string;
}

export interface UpdateInternalAuditInput {
  tenantId: string;
  auditId: string;
  auditPlanTitle?: string;
  status?: AuditStatus;
  leadAuditorName?: string;
  auditTeamNames?: string[];
  startDate?: string;
  endDate?: string;
  auditScope?: string;
  summaryReportStoragePath?: string | null;
}

export interface DeleteInternalAuditInput {
  tenantId: string;
  auditId: string;
}

export interface ListInternalAuditsInput {
  tenantId: string;
  frameworkType?: ISOFrameworkType;
  status?: AuditStatus;
}

export const createISOInternalAudit = onCall<CreateInternalAuditInput>(async (request) => {
  const {
    tenantId,
    frameworkType,
    auditPlanTitle,
    leadAuditorName,
    auditTeamNames = [],
    startDate,
    endDate,
    auditScope,
    summaryReportStoragePath = null,
    status = 'scheduled',
    ownerId,
  } = request.data;

  if (!tenantId || !frameworkType || !auditPlanTitle || !leadAuditorName || !startDate || !endDate || !auditScope) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, frameworkType, auditPlanTitle, leadAuditorName, startDate, endDate, and auditScope are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const auditRef = db.collection('tenants').doc(tenantId).collection('iso_internal_audits').doc();
  const now = new Date().toISOString();

  const auditDoc: ISOInternalAudit = {
    id: auditRef.id,
    tenantId,
    frameworkType,
    auditPlanTitle: auditPlanTitle.trim(),
    status,
    leadAuditorName: leadAuditorName.trim(),
    auditTeamNames,
    startDate,
    endDate,
    auditScope: auditScope.trim(),
    summaryReportStoragePath,
    findingsCount: 0,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await auditRef.set(auditDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_internal_audit',
    entityId: auditRef.id,
    action: 'create',
    afterSummary: { frameworkType, auditPlanTitle: auditDoc.auditPlanTitle, leadAuditorName, startDate },
    source: 'cloud_function',
    workflowContext: 'iso_internal_audit_creation',
  });

  return { success: true, auditId: auditRef.id, internalAudit: auditDoc };
});

export const updateISOInternalAudit = onCall<UpdateInternalAuditInput>(async (request) => {
  const { tenantId, auditId, ...updates } = request.data;
  if (!tenantId || !auditId) {
    throw new HttpsError('invalid-argument', 'tenantId and auditId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const auditRef = db.collection('tenants').doc(tenantId).collection('iso_internal_audits').doc(auditId);
  const snap = await auditRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Internal audit not found.');
  }

  const prev = snap.data() as ISOInternalAudit;
  const now = new Date().toISOString();

  const payload: Partial<ISOInternalAudit> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await auditRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_internal_audit',
    entityId: auditId,
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_internal_audit_update',
  });

  return { success: true, auditId, updatedFields: payload };
});

export const deleteISOInternalAudit = onCall<DeleteInternalAuditInput>(async (request) => {
  const { tenantId, auditId } = request.data;
  if (!tenantId || !auditId) {
    throw new HttpsError('invalid-argument', 'tenantId and auditId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const auditRef = db.collection('tenants').doc(tenantId).collection('iso_internal_audits').doc(auditId);
  const snap = await auditRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Internal audit not found.');
  }

  const prev = snap.data() as ISOInternalAudit;
  await auditRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_internal_audit',
    entityId: auditId,
    action: 'delete',
    beforeSummary: { auditPlanTitle: prev.auditPlanTitle, frameworkType: prev.frameworkType },
    source: 'cloud_function',
    workflowContext: 'iso_internal_audit_deletion',
  });

  return { success: true, auditId, deleted: true };
});

export const listISOInternalAudits = onCall<ListInternalAuditsInput>(async (request) => {
  const { tenantId, frameworkType, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('iso_internal_audits');
  if (frameworkType) query = query.where('frameworkType', '==', frameworkType);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const audits: ISOInternalAudit[] = snap.docs.map((d) => d.data() as ISOInternalAudit);

  return { success: true, count: audits.length, internalAudits: audits };
});

// -----------------------------------------------------------------------------
// 5. FINDINGS / NONCONFORMITIES (CLAUSE 10.1)
// -----------------------------------------------------------------------------

export interface LogFindingInput {
  tenantId: string;
  auditId: string;
  frameworkType: ISOFrameworkType;
  findingType: FindingType;
  clauseReference: string;
  description: string;
  rootCauseAnalysis?: string;
  correctiveActionPlan?: string;
  remedialIssueId?: string | null;
  targetClosureDate: string;
  ownerId?: string;
}

export interface UpdateFindingInput {
  tenantId: string;
  auditId: string;
  findingId: string;
  status?: FindingStatus;
  rootCauseAnalysis?: string;
  correctiveActionPlan?: string;
  targetClosureDate?: string;
  verifiedClosed?: boolean;
}

export interface ListFindingsInput {
  tenantId: string;
  auditId: string;
  findingType?: FindingType;
  status?: FindingStatus;
}

export const logISOFinding = onCall<LogFindingInput>(async (request) => {
  const {
    tenantId,
    auditId,
    frameworkType,
    findingType,
    clauseReference,
    description,
    rootCauseAnalysis = '',
    correctiveActionPlan = '',
    remedialIssueId = null,
    targetClosureDate,
    ownerId,
  } = request.data;

  if (!tenantId || !auditId || !frameworkType || !findingType || !clauseReference || !description || !targetClosureDate) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, auditId, frameworkType, findingType, clauseReference, description, and targetClosureDate are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const auditRef = db.collection('tenants').doc(tenantId).collection('iso_internal_audits').doc(auditId);
  const auditSnap = await auditRef.get();
  if (!auditSnap.exists) {
    throw new HttpsError('not-found', 'Parent internal audit record not found.');
  }

  const findingRef = auditRef.collection('findings').doc();
  const now = new Date().toISOString();

  const findingDoc: ISOFinding = {
    id: findingRef.id,
    tenantId,
    auditId,
    frameworkType,
    findingType,
    status: 'open',
    clauseReference: clauseReference.trim(),
    description: description.trim(),
    rootCauseAnalysis: rootCauseAnalysis.trim(),
    correctiveActionPlan: correctiveActionPlan.trim(),
    remedialIssueId,
    targetClosureDate,
    verifiedClosedAt: null,
    verifiedBy: null,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  const batch = db.batch();
  batch.set(findingRef, findingDoc);
  batch.update(auditRef, {
    findingsCount: (auditSnap.data()?.findingsCount || 0) + 1,
    updatedAt: now,
  });
  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_finding',
    entityId: findingRef.id,
    action: 'create',
    afterSummary: { auditId, findingType, clauseReference, targetClosureDate },
    source: 'cloud_function',
    workflowContext: 'iso_finding_logged',
  });

  return { success: true, findingId: findingRef.id, finding: findingDoc };
});

export const updateISOFinding = onCall<UpdateFindingInput>(async (request) => {
  const { tenantId, auditId, findingId, verifiedClosed, ...updates } = request.data;
  if (!tenantId || !auditId || !findingId) {
    throw new HttpsError('invalid-argument', 'tenantId, auditId, and findingId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const findingRef = db
    .collection('tenants')
    .doc(tenantId)
    .collection('iso_internal_audits')
    .doc(auditId)
    .collection('findings')
    .doc(findingId);

  const snap = await findingRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Finding not found.');
  }

  const prev = snap.data() as ISOFinding;
  const now = new Date().toISOString();

  const payload: Partial<ISOFinding> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (verifiedClosed) {
    payload.status = 'verified_closed';
    payload.verifiedClosedAt = now;
    payload.verifiedBy = authContext.userId;
  }

  await findingRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_finding',
    entityId: findingId,
    action: 'update',
    beforeSummary: { status: prev.status },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_finding_update',
  });

  return { success: true, findingId, updatedFields: payload };
});

export const listISOFindings = onCall<ListFindingsInput>(async (request) => {
  const { tenantId, auditId, findingType, status } = request.data;
  if (!tenantId || !auditId) {
    throw new HttpsError('invalid-argument', 'tenantId and auditId are required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db
    .collection('tenants')
    .doc(tenantId)
    .collection('iso_internal_audits')
    .doc(auditId)
    .collection('findings');

  if (findingType) query = query.where('findingType', '==', findingType);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const findings: ISOFinding[] = snap.docs.map((d) => d.data() as ISOFinding);

  return { success: true, count: findings.length, findings };
});

// -----------------------------------------------------------------------------
// 6. MANAGEMENT REVIEWS (CLAUSE 9.3)
// -----------------------------------------------------------------------------

export interface CreateManagementReviewInput {
  tenantId: string;
  frameworkType: ISOFrameworkType;
  reviewPeriodStart: string;
  reviewPeriodEnd: string;
  meetingDate: string;
  attendeeNames: string[];
  changesInExternalInternalIssuesReviewed: boolean;
  riskAssessmentResultsReviewed: boolean;
  auditResultsReviewed: boolean;
  resourceAdequacyReviewed: boolean;
  keyDecisionsAndActionItems: string;
  ownerId?: string;
}

export interface UpdateManagementReviewInput {
  tenantId: string;
  reviewId: string;
  keyDecisionsAndActionItems?: string;
  attendeeNames?: string[];
  meetingDate?: string;
}

export interface DeleteManagementReviewInput {
  tenantId: string;
  reviewId: string;
}

export interface ListManagementReviewsInput {
  tenantId: string;
  frameworkType?: ISOFrameworkType;
}

export const createISOManagementReview = onCall<CreateManagementReviewInput>(async (request) => {
  const {
    tenantId,
    frameworkType,
    reviewPeriodStart,
    reviewPeriodEnd,
    meetingDate,
    attendeeNames,
    changesInExternalInternalIssuesReviewed,
    riskAssessmentResultsReviewed,
    auditResultsReviewed,
    resourceAdequacyReviewed,
    keyDecisionsAndActionItems,
    ownerId,
  } = request.data;

  if (
    !tenantId ||
    !frameworkType ||
    !reviewPeriodStart ||
    !reviewPeriodEnd ||
    !meetingDate ||
    !attendeeNames ||
    !keyDecisionsAndActionItems
  ) {
    throw new HttpsError(
      'invalid-argument',
      'tenantId, frameworkType, reviewPeriodStart, reviewPeriodEnd, meetingDate, attendeeNames, and keyDecisionsAndActionItems are required.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'approver',
  ]);

  const reviewRef = db.collection('tenants').doc(tenantId).collection('iso_management_reviews').doc();
  const now = new Date().toISOString();

  const reviewDoc: ISOManagementReview = {
    id: reviewRef.id,
    tenantId,
    frameworkType,
    reviewPeriodStart,
    reviewPeriodEnd,
    meetingDate,
    attendeeNames,
    changesInExternalInternalIssuesReviewed,
    riskAssessmentResultsReviewed,
    auditResultsReviewed,
    resourceAdequacyReviewed,
    keyDecisionsAndActionItems: keyDecisionsAndActionItems.trim(),
    managementSignoffBy: authContext.userId,
    managementSignoffAt: now,
    status: 'completed',
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await reviewRef.set(reviewDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_management_review',
    entityId: reviewRef.id,
    action: 'create',
    afterSummary: { frameworkType, meetingDate, managementSignoffBy: reviewDoc.managementSignoffBy },
    source: 'cloud_function',
    workflowContext: 'iso_management_review_creation',
  });

  return { success: true, reviewId: reviewRef.id, managementReview: reviewDoc };
});

export const updateISOManagementReview = onCall<UpdateManagementReviewInput>(async (request) => {
  const { tenantId, reviewId, ...updates } = request.data;
  if (!tenantId || !reviewId) {
    throw new HttpsError('invalid-argument', 'tenantId and reviewId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'ai_governance_manager',
    'approver',
  ]);

  const reviewRef = db.collection('tenants').doc(tenantId).collection('iso_management_reviews').doc(reviewId);
  const snap = await reviewRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Management review not found.');
  }

  const prev = snap.data() as ISOManagementReview;
  const now = new Date().toISOString();

  const payload: Partial<ISOManagementReview> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await reviewRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_management_review',
    entityId: reviewId,
    action: 'update',
    beforeSummary: { meetingDate: prev.meetingDate },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'iso_management_review_update',
  });

  return { success: true, reviewId, updatedFields: payload };
});

export const deleteISOManagementReview = onCall<DeleteManagementReviewInput>(async (request) => {
  const { tenantId, reviewId } = request.data;
  if (!tenantId || !reviewId) {
    throw new HttpsError('invalid-argument', 'tenantId and reviewId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const reviewRef = db.collection('tenants').doc(tenantId).collection('iso_management_reviews').doc(reviewId);
  const snap = await reviewRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Management review not found.');
  }

  const prev = snap.data() as ISOManagementReview;
  await reviewRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'iso_management_review',
    entityId: reviewId,
    action: 'delete',
    beforeSummary: { frameworkType: prev.frameworkType, meetingDate: prev.meetingDate },
    source: 'cloud_function',
    workflowContext: 'iso_management_review_deletion',
  });

  return { success: true, reviewId, deleted: true };
});

export const listISOManagementReviews = onCall<ListManagementReviewsInput>(async (request) => {
  const { tenantId, frameworkType } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('iso_management_reviews');
  if (frameworkType) query = query.where('frameworkType', '==', frameworkType);

  const snap = await query.get();
  const reviews: ISOManagementReview[] = snap.docs.map((d) => d.data() as ISOManagementReview);

  return { success: true, count: reviews.length, managementReviews: reviews };
});

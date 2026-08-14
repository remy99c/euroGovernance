import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  Risk,
  RiskStatus,
  Issue,
  IssueStatus,
  IssueSeverity,
  Task,
  TaskStatus,
} from '@eurogovernance/shared-types';

export interface CreateRiskInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  category: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
  inherentLikelihood: number; // 1-5
  inherentImpact: number; // 1-5
  residualLikelihood?: number; // 1-5
  residualImpact?: number; // 1-5
  treatmentStrategy?: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan?: string;
  mitigatingControlIds?: string[];
  affectedAssetIds?: string[];
  ownerId?: string;
  status?: RiskStatus;
}

export interface UpdateRiskInput {
  tenantId: string;
  riskId: string;
  title?: string;
  description?: string;
  category?: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
  status?: RiskStatus;
  inherentLikelihood?: number;
  inherentImpact?: number;
  residualLikelihood?: number;
  residualImpact?: number;
  treatmentStrategy?: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan?: string;
  mitigatingControlIds?: string[];
  affectedAssetIds?: string[];
  ownerId?: string;
}

export interface DeleteRiskInput {
  tenantId: string;
  riskId: string;
}

export interface ListRisksInput {
  tenantId: string;
  status?: RiskStatus;
  category?: string;
}

export interface CreateIssueInput {
  tenantId: string;
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  source: 'audit' | 'risk_assessment' | 'incident' | 'manual_flag' | 'automated_test';
  sourceEntityId?: string | null;
  sourceEntityType?: string | null;
  dueDate: string;
  resolutionPlan?: string;
  ownerId?: string;
}

export interface UpdateIssueInput {
  tenantId: string;
  issueId: string;
  title?: string;
  description?: string;
  severity?: IssueSeverity;
  status?: IssueStatus;
  dueDate?: string;
  resolutionPlan?: string;
  verifiedBy?: string;
}

export interface DeleteIssueInput {
  tenantId: string;
  issueId: string;
}

export interface ListIssuesInput {
  tenantId: string;
  status?: IssueStatus;
  severity?: IssueSeverity;
  sourceEntityType?: string;
  sourceEntityId?: string;
}

export interface CreateTaskInput {
  tenantId: string;
  title: string;
  description: string;
  parentEntityType: 'control' | 'evidence' | 'policy' | 'risk' | 'issue' | 'dpia' | 'ai_system';
  parentEntityId: string;
  assigneeId?: string;
  dueDate: string;
  status?: TaskStatus;
}

export interface UpdateTaskInput {
  tenantId: string;
  taskId: string;
  title?: string;
  description?: string;
  status?: TaskStatus;
  assigneeId?: string;
  dueDate?: string;
}

export interface DeleteTaskInput {
  tenantId: string;
  taskId: string;
}

export interface ListTasksInput {
  tenantId: string;
  parentEntityType?: string;
  parentEntityId?: string;
  assigneeId?: string;
  status?: TaskStatus;
}

// -----------------------------------------------------------------------------
// RISKS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantRisk = onCall<CreateRiskInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    category,
    inherentLikelihood,
    inherentImpact,
    residualLikelihood = inherentLikelihood,
    residualImpact = inherentImpact,
    treatmentStrategy = 'mitigate',
    treatmentPlan = '',
    mitigatingControlIds = [],
    affectedAssetIds = [],
    ownerId,
    status = 'identified',
  } = request.data;

  if (!tenantId || !code || !title || !category || !inherentLikelihood || !inherentImpact) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, category, inherentLikelihood, and inherentImpact are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc();
  const now = new Date().toISOString();

  const riskDoc: Risk = {
    id: riskRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    category,
    status,
    inherentLikelihood,
    inherentImpact,
    inherentScore: inherentLikelihood * inherentImpact,
    residualLikelihood,
    residualImpact,
    residualScore: residualLikelihood * residualImpact,
    treatmentStrategy,
    treatmentPlan,
    mitigatingControlIds,
    affectedAssetIds,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await riskRef.set(riskDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskRef.id,
    action: 'create',
    afterSummary: { code: riskDoc.code, title: riskDoc.title, category, inherentScore: riskDoc.inherentScore },
    source: 'cloud_function',
    workflowContext: 'risk_creation',
  });

  return { success: true, riskId: riskRef.id, risk: riskDoc };
});

export const updateTenantRisk = onCall<UpdateRiskInput>(async (request) => {
  const { tenantId, riskId, ...updates } = request.data;
  if (!tenantId || !riskId) {
    throw new HttpsError('invalid-argument', 'tenantId and riskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
  const snap = await riskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Risk document not found.');
  }

  const prev = snap.data() as Risk;
  const now = new Date().toISOString();

  const resLikelihood = updates.residualLikelihood ?? prev.residualLikelihood;
  const resImpact = updates.residualImpact ?? prev.residualImpact;

  const payload: Partial<Risk> = {
    ...updates,
    residualScore: resLikelihood * resImpact,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  await riskRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskId,
    action: 'update',
    beforeSummary: { status: prev.status, residualScore: prev.residualScore },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'risk_update',
  });

  return { success: true, riskId, updatedFields: payload };
});

export const deleteTenantRisk = onCall<DeleteRiskInput>(async (request) => {
  const { tenantId, riskId } = request.data;
  if (!tenantId || !riskId) {
    throw new HttpsError('invalid-argument', 'tenantId and riskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
  const snap = await riskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Risk document not found.');
  }

  const prev = snap.data() as Risk;
  await riskRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'risk',
    entityId: riskId,
    action: 'delete',
    beforeSummary: { code: prev.code, title: prev.title },
    source: 'cloud_function',
    workflowContext: 'risk_deletion',
  });

  return { success: true, riskId, deleted: true };
});

export const listTenantRisks = onCall<ListRisksInput>(async (request) => {
  const { tenantId, status, category } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('risks');
  if (status) query = query.where('status', '==', status);
  if (category) query = query.where('category', '==', category);

  const snap = await query.get();
  const risks: Risk[] = snap.docs.map((d) => d.data() as Risk);

  return { success: true, count: risks.length, risks };
});

// -----------------------------------------------------------------------------
// ISSUES & REMEDIATIONS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantIssue = onCall<CreateIssueInput>(async (request) => {
  const {
    tenantId,
    code,
    title,
    description,
    severity,
    source,
    sourceEntityId = null,
    sourceEntityType = null,
    dueDate,
    resolutionPlan = '',
    ownerId,
  } = request.data;

  if (!tenantId || !code || !title || !severity || !source || !dueDate) {
    throw new HttpsError('invalid-argument', 'tenantId, code, title, severity, source, and dueDate are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc();
  const now = new Date().toISOString();

  const issueDoc: Issue = {
    id: issueRef.id,
    tenantId,
    code: code.trim().toUpperCase(),
    title: title.trim(),
    description: description.trim(),
    severity,
    status: 'open',
    source,
    sourceEntityId,
    sourceEntityType,
    dueDate,
    resolutionPlan,
    resolvedAt: null,
    verifiedBy: null,
    ownerId: ownerId || authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await issueRef.set(issueDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueRef.id,
    action: 'create',
    afterSummary: { code: issueDoc.code, title: issueDoc.title, severity, source, dueDate },
    source: 'cloud_function',
    workflowContext: 'issue_creation',
  });

  return { success: true, issueId: issueRef.id, issue: issueDoc };
});

export const updateTenantIssue = onCall<UpdateIssueInput>(async (request) => {
  const { tenantId, issueId, status, ...updates } = request.data;
  if (!tenantId || !issueId) {
    throw new HttpsError('invalid-argument', 'tenantId and issueId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc(issueId);
  const snap = await issueRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Issue document not found.');
  }

  const prev = snap.data() as Issue;
  const now = new Date().toISOString();

  const payload: Partial<Issue> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    payload.status = status;
    if (status === 'resolved' || status === 'closed') {
      payload.resolvedAt = now;
      payload.verifiedBy = authContext.userId;
    }
  }

  await issueRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueId,
    action: 'update',
    beforeSummary: { status: prev.status, severity: prev.severity },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'issue_update',
  });

  return { success: true, issueId, updatedFields: payload };
});

export const deleteTenantIssue = onCall<DeleteIssueInput>(async (request) => {
  const { tenantId, issueId } = request.data;
  if (!tenantId || !issueId) {
    throw new HttpsError('invalid-argument', 'tenantId and issueId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const issueRef = db.collection('tenants').doc(tenantId).collection('issues').doc(issueId);
  const snap = await issueRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Issue document not found.');
  }

  const prev = snap.data() as Issue;
  await issueRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'issue',
    entityId: issueId,
    action: 'delete',
    beforeSummary: { code: prev.code, title: prev.title },
    source: 'cloud_function',
    workflowContext: 'issue_deletion',
  });

  return { success: true, issueId, deleted: true };
});

export const listTenantIssues = onCall<ListIssuesInput>(async (request) => {
  const { tenantId, status, severity, sourceEntityType, sourceEntityId } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('issues');
  if (status) query = query.where('status', '==', status);
  if (severity) query = query.where('severity', '==', severity);
  if (sourceEntityType) query = query.where('sourceEntityType', '==', sourceEntityType);
  if (sourceEntityId) query = query.where('sourceEntityId', '==', sourceEntityId);

  const snap = await query.get();
  const issues: Issue[] = snap.docs.map((d) => d.data() as Issue);

  return { success: true, count: issues.length, issues };
});

// -----------------------------------------------------------------------------
// TASKS HANDLERS
// -----------------------------------------------------------------------------

export const createTenantTask = onCall<CreateTaskInput>(async (request) => {
  const {
    tenantId,
    title,
    description,
    parentEntityType,
    parentEntityId,
    assigneeId,
    dueDate,
    status = 'todo',
  } = request.data;

  if (!tenantId || !title || !parentEntityType || !parentEntityId || !dueDate) {
    throw new HttpsError('invalid-argument', 'tenantId, title, parentEntityType, parentEntityId, and dueDate are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc();
  const now = new Date().toISOString();

  const taskDoc: Task = {
    id: taskRef.id,
    tenantId,
    title: title.trim(),
    description: description.trim(),
    status,
    assigneeId: assigneeId || authContext.userId,
    parentEntityType,
    parentEntityId,
    dueDate,
    completedAt: null,
    ownerId: authContext.userId,
    createdAt: now,
    updatedAt: now,
    createdBy: authContext.userId,
    updatedBy: authContext.userId,
  };

  await taskRef.set(taskDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskRef.id,
    action: 'create',
    afterSummary: { title: taskDoc.title, parentEntityType, parentEntityId, dueDate, assigneeId: taskDoc.assigneeId },
    source: 'cloud_function',
    workflowContext: 'task_creation',
  });

  if (taskDoc.assigneeId && taskDoc.assigneeId !== authContext.userId) {
    await createNotification({
      tenantId,
      recipientId: taskDoc.assigneeId,
      title: 'New Remediation Task Assigned',
      message: `You have been assigned task: "${taskDoc.title}" due on ${dueDate}.`,
      type: 'task_assigned',
      priority: 'medium',
      sourceEntityType: 'task',
      sourceEntityId: taskRef.id,
    });
  }

  return { success: true, taskId: taskRef.id, task: taskDoc };
});

export const updateTenantTask = onCall<UpdateTaskInput>(async (request) => {
  const { tenantId, taskId, status, ...updates } = request.data;
  if (!tenantId || !taskId) {
    throw new HttpsError('invalid-argument', 'tenantId and taskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Task document not found.');
  }

  const prev = snap.data() as Task;
  const now = new Date().toISOString();

  const payload: Partial<Task> = {
    ...updates,
    updatedAt: now,
    updatedBy: authContext.userId,
  };

  if (status !== undefined) {
    payload.status = status;
    if (status === 'completed') {
      payload.completedAt = now;
    }
  }

  await taskRef.update(payload);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskId,
    action: 'update',
    beforeSummary: { status: prev.status, assigneeId: prev.assigneeId },
    afterSummary: payload as Record<string, unknown>,
    source: 'cloud_function',
    workflowContext: 'task_update',
  });

  return { success: true, taskId, updatedFields: payload };
});

export const deleteTenantTask = onCall<DeleteTaskInput>(async (request) => {
  const { tenantId, taskId } = request.data;
  if (!tenantId || !taskId) {
    throw new HttpsError('invalid-argument', 'tenantId and taskId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, ['tenant_admin']);

  const taskRef = db.collection('tenants').doc(tenantId).collection('tasks').doc(taskId);
  const snap = await taskRef.get();
  if (!snap.exists) {
    throw new HttpsError('not-found', 'Task document not found.');
  }

  const prev = snap.data() as Task;
  await taskRef.delete();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'task',
    entityId: taskId,
    action: 'delete',
    beforeSummary: { title: prev.title, parentEntityType: prev.parentEntityType, parentEntityId: prev.parentEntityId },
    source: 'cloud_function',
    workflowContext: 'task_deletion',
  });

  return { success: true, taskId, deleted: true };
});

export const listTenantTasks = onCall<ListTasksInput>(async (request) => {
  const { tenantId, parentEntityType, parentEntityId, assigneeId, status } = request.data;
  if (!tenantId) {
    throw new HttpsError('invalid-argument', 'tenantId is required.');
  }

  await requireTenantMember(request, tenantId);

  let query: FirebaseFirestore.Query = db.collection('tenants').doc(tenantId).collection('tasks');
  if (parentEntityType) query = query.where('parentEntityType', '==', parentEntityType);
  if (parentEntityId) query = query.where('parentEntityId', '==', parentEntityId);
  if (assigneeId) query = query.where('assigneeId', '==', assigneeId);
  if (status) query = query.where('status', '==', status);

  const snap = await query.get();
  const tasks: Task[] = snap.docs.map((d) => d.data() as Task);

  return { success: true, count: tasks.length, tasks };
});

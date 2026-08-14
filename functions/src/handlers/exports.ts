import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { ExportJob, ExportType } from '@eurogovernance/shared-types';

export interface GenerateExportInput {
  tenantId: string;
  exportType: ExportType;
  filters?: Record<string, unknown>;
}

/**
 * Callable Function: generateTenantEvidenceExport
 * Queues and initializes an export job for compliance packaging.
 */
export const generateTenantEvidenceExport = onCall<GenerateExportInput>(async (request) => {
  const { tenantId, exportType, filters = {} } = request.data;
  if (!tenantId || !exportType) {
    throw new HttpsError('invalid-argument', 'tenantId and exportType are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'auditor',
  ]);

  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc();
  const now = new Date().toISOString();

  const exportJobDoc: ExportJob = {
    id: jobRef.id,
    tenantId,
    exportType,
    status: 'queued',
    requestedBy: authContext.userId,
    requestedAt: now,
    completedAt: null,
    fileStoragePath: null,
    fileDownloadUrl: null,
    fileSizeBytes: null,
    errorMessage: null,
    filtersApplied: filters,
  };

  await jobRef.set(exportJobDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'export_job',
    entityId: jobRef.id,
    action: 'export_generated',
    afterSummary: { exportType, jobId: jobRef.id },
    source: 'cloud_function',
    workflowContext: 'compliance_export_generation',
  });

  return { success: true, jobId: jobRef.id, status: 'queued' };
});

export interface ReadinessReportInput {
  tenantId: string;
  frameworkId: string;
}

/**
 * Callable Function: generateFrameworkReadinessReport
 * Queues on-demand framework readiness PDF summary compilation.
 */
export const generateFrameworkReadinessReport = onCall<ReadinessReportInput>(async (request) => {
  const { tenantId, frameworkId } = request.data;
  if (!tenantId || !frameworkId) {
    throw new HttpsError('invalid-argument', 'tenantId and frameworkId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'auditor',
    'approver',
  ]);

  const jobRef = db.collection('tenants').doc(tenantId).collection('export_jobs').doc();
  const now = new Date().toISOString();

  const exportJobDoc: ExportJob = {
    id: jobRef.id,
    tenantId,
    exportType: 'framework_readiness_pdf',
    status: 'queued',
    requestedBy: authContext.userId,
    requestedAt: now,
    completedAt: null,
    fileStoragePath: null,
    fileDownloadUrl: null,
    fileSizeBytes: null,
    errorMessage: null,
    filtersApplied: { frameworkId },
  };

  await jobRef.set(exportJobDoc);

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'export_job',
    entityId: jobRef.id,
    action: 'export_generated',
    afterSummary: { exportType: 'framework_readiness_pdf', frameworkId, jobId: jobRef.id },
    source: 'cloud_function',
    workflowContext: 'framework_readiness_report_generation',
  });

  return { success: true, jobId: jobRef.id, status: 'queued' };
});

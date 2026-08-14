import { ActionSource, UserRole } from './core.js';

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'status_transition'
  | 'export_generated'
  | 'permission_assigned'
  | 'login_mfa_success'
  | 'login_mfa_failed';

export type ExportJobStatus = 'queued' | 'processing' | 'completed' | 'failed';
export type ExportType =
  | 'tenant_evidence_package_zip'
  | 'framework_readiness_pdf'
  | 'gdpr_ropa_xlsx'
  | 'eu_ai_act_technical_file_pdf'
  | 'iso_soa_pdf';

export type NotificationType =
  | 'evidence_expiry_warning'
  | 'evidence_approval_requested'
  | 'task_overdue'
  | 'policy_review_due'
  | 'dpia_review_due'
  | 'export_ready'
  | 'breach_72h_alert';

/**
 * Immutable Audit Log Event (/tenants/{tenantId}/audit_logs/{logId})
 * Append-only; client modification/deletion is strictly prohibited.
 */
export interface AuditLogEvent {
  id: string;
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: UserRole;
  entityType: string; // e.g. 'control', 'evidence', 'ropa_entry', 'ai_system', 'tenant_membership'
  entityId: string;
  action: AuditActionType;
  beforeSummary: Record<string, unknown> | null;
  afterSummary: Record<string, unknown> | null;
  timestamp: string;
  ipAddress: string | null;
  userAgent: string | null;
  source: ActionSource;
  workflowContext: string | null; // e.g. 'evidence_approval_flow'
}

/**
 * Compliance Export Generation Job (/tenants/{tenantId}/export_jobs/{jobId})
 */
export interface ExportJob {
  id: string;
  tenantId: string;
  exportType: ExportType;
  status: ExportJobStatus;
  requestedBy: string;
  requestedAt: string;
  completedAt: string | null;
  fileStoragePath: string | null;
  fileDownloadUrl: string | null;
  fileSizeBytes: number | null;
  errorMessage: string | null;
  filtersApplied: Record<string, unknown>;
}

/**
 * In-App & Email Notification Record (/tenants/{tenantId}/notifications/{notificationId})
 */
export interface Notification {
  id: string;
  tenantId: string;
  recipientId: string;
  type: NotificationType;
  title: string;
  body: string;
  actionUrl: string;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

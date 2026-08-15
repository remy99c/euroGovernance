import { ActionSource, UserRole } from './core.js';

export type AuditActionType =
  | 'create'
  | 'update'
  | 'delete'
  | 'approve'
  | 'reject'
  | 'link'
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
  | 'iso_soa_pdf'
  | 'iso_soa_report'
  | 'adopted_frameworks_summary'
  | 'applicability_decisions_report'
  | 'tenant_control_coverage_report'
  | 'framework_gap_report'
  | 'processor_inventory_report'
  | 'restricted_transfers_register'
  | 'transfer_mechanisms_report'
  | 'processor_governance_gaps_report'
  | 'processor_review_schedule_report'
  | 'processor_system_mapping_report'
  | 'processor_ropa_mapping_report'
  | 'certification_register_report'
  | 'processor_assurance_register'
  | 'processor_expiring_certifications_report'
  | 'processor_expired_insufficient_assurance_report'
  | 'processor_by_certification_type_matrix'
  | 'processor_assurance_coverage_by_systems'
  | 'critical_processors_missing_assurance'
  | 'processor_assessment_report'
  | 'processor_assessment_summary_matrix';

export type NotificationPriority = 'low' | 'medium' | 'high' | 'urgent';

export type NotificationType =
  | 'evidence_expiry_warning'
  | 'evidence_approval_requested'
  | 'evidence_approved'
  | 'evidence_rejected'
  | 'task_assigned'
  | 'task_overdue'
  | 'policy_review_due'
  | 'dpia_review_due'
  | 'export_ready'
  | 'breach_72h_alert'
  | 'breach_deadline_warning'
  | 'dsr_deadline_warning'
  | 'ai_incident_reported'
  | 'audit_scheduled'
  | 'processor_annual_review_due'
  | 'dpa_renewal_due'
  | 'scc_review_due'
  | 'transfer_arrangement_review_due'
  | 'tia_review_due'
  | 'missing_evidence_follow_up'
  | 'certification_expiry_warning_90d'
  | 'certification_expiry_warning_30d'
  | 'certification_expired'
  | 'certification_surveillance_audit_due'
  | 'certification_missing_evidence_follow_up'
  | 'processor_cert_expiry_warning_60d'
  | 'processor_cert_expiry_warning_30d'
  | 'processor_cert_expiry_warning_14d'
  | 'processor_cert_expired'
  | 'processor_cert_review_overdue'
  | 'processor_cert_stale_report'
  | 'processor_cert_missing_replacement_evidence'
  | 'processor_cert_grace_period_expiring'
  | 'processor_assessment_submitted'
  | 'processor_assessment_review_due'
  | 'processor_assessment_overdue'
  | 'processor_assessment_revision_requested'
  | 'processor_assessment_accepted'
  | 'processor_assessment_rejected'
  | 'processor_assessment_recurring_due';

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
  recipientEmail?: string;
  type: NotificationType;
  priority?: NotificationPriority;
  title: string;
  body: string;
  actionUrl?: string | null;
  linkUrl?: string | null;
  sourceEntityType?: string | null;
  sourceEntityId?: string | null;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
}

export type TenantNotification = Notification;

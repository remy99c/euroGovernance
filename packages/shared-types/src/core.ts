/**
 * Standard Roles for euroGovernance Multi-Tenant GRC SaaS
 */
export type UserRole =
  | 'platform_admin'
  | 'tenant_admin'
  | 'compliance_manager'
  | 'privacy_manager'
  | 'ai_governance_manager'
  | 'security_manager'
  | 'auditor'
  | 'contributor'
  | 'viewer'
  | 'approver';

export const VALID_USER_ROLES: readonly UserRole[] = [
  'platform_admin',
  'tenant_admin',
  'compliance_manager',
  'privacy_manager',
  'ai_governance_manager',
  'security_manager',
  'auditor',
  'contributor',
  'viewer',
  'approver',
] as const;

export const READ_ONLY_ROLES: readonly UserRole[] = ['auditor', 'viewer'] as const;

export function isValidUserRole(role: unknown): role is UserRole {
  return typeof role === 'string' && VALID_USER_ROLES.includes(role as UserRole);
}

export function isReadOnlyRole(role: UserRole): boolean {
  return READ_ONLY_ROLES.includes(role as 'auditor' | 'viewer');
}

/**
 * Standard Action Execution Source
 */
export type ActionSource = 'client' | 'cloud_function' | 'scheduled_job';

/**
 * Common Audit and Lifecycle Metadata Contract
 * Enforced across all tenant-scoped entities.
 */
export interface BaseEntity {
  /** Unique document identifier (UUID or Firestore auto-ID) */
  id: string;
  /** Tenant organization boundary identifier */
  tenantId: string;
  /** Primary operational or workflow status */
  status: string;
  /** Primary responsible individual (User ID) */
  ownerId: string;
  /** Creation timestamp in ISO 8601 string format */
  createdAt: string;
  /** Last update timestamp in ISO 8601 string format */
  updatedAt: string;
  /** User ID who created the record */
  createdBy: string;
  /** User ID who last updated the record */
  updatedBy: string;
}

/**
 * Timestamp representation compatible with Firestore server timestamps and client representations
 */
export interface EntityTimestamp {
  seconds: number;
  nanoseconds: number;
}

/**
 * Materialized Derived Summary Metrics (/tenants/{tenantId}/summary_metrics/{metricId})
 */
export interface TenantSummaryMetrics {
  id: string;
  tenantId: string;
  lastMaterializedAt: string;
  /** Latest instant at which this cached projection may be displayed. */
  validUntil: string;
  /** Hash of every source document path and update version used. */
  sourceFingerprint: string;
  totalControlsCount: number;
  implementedControlsCount: number;
  overallComplianceScore: number;
  frameworkReadiness: {
    gdpr: number;
    eu_ai_act: number;
    eu_data_act: number;
    iso_27001: number;
    iso_42001: number;
  };
  openRisksCount: number;
  highOrCriticalRisksCount: number;
  pendingEvidenceReviewsCount: number;
  activeBreachesCount: number;
  openDsrRequestsCount: number;
  registeredAISystemsCount: number;
  highRiskAISystemsCount: number;
  openIssuesCount: number;
}

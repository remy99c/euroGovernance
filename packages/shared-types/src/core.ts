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

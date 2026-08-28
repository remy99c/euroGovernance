/**
 * Standard Roles for euroGovernance Multi-Tenant GRC SaaS
 */
export type UserRole = 'platform_admin' | 'tenant_admin' | 'compliance_manager' | 'privacy_manager' | 'ai_governance_manager' | 'security_manager' | 'auditor' | 'contributor' | 'viewer' | 'approver';
export declare const VALID_USER_ROLES: readonly UserRole[];
export declare const READ_ONLY_ROLES: readonly UserRole[];
export declare function isValidUserRole(role: unknown): role is UserRole;
export declare function isReadOnlyRole(role: UserRole): boolean;
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
//# sourceMappingURL=core.d.ts.map
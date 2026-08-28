import { BaseEntity } from './core.js';
import { MasterControl } from './grc.js';
import { TenantApplicabilityDecision, TenantControlInstance } from './scoping-and-harmonization.js';
export type ISOFrameworkType = 'iso_27001' | 'iso_42001' | 'integrated_isms_aims';
export type ObjectiveStatus = 'planned' | 'in_progress' | 'achieved' | 'missed';
export type AuditStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';
export type FindingType = 'major_nonconformity' | 'minor_nonconformity' | 'opportunity_for_improvement' | 'observation';
export type FindingStatus = 'open' | 'corrective_action_planned' | 'verified_closed';
export type SoADecisionType = 'included' | 'excluded';
export type SoASourceType = 'automatic_suggestion' | 'manual_override' | 'audit_review';
export type SoAApprovalStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type SoAExclusionCategory = 'not_in_scope' | 'no_technical_basis' | 'statutory_exemption' | 'risk_transferred' | 'compensating_control' | 'custom_rationale';
/**
 * Management System Scope Statement (/tenants/{tenantId}/iso_management/scopes_{frameworkType})
 */
export interface ISOScopeStatement extends BaseEntity {
    frameworkType: ISOFrameworkType;
    title: string;
    scopeBoundaries: string;
    includedLocations: string[];
    includedBusinessUnits: string[];
    exclusionsJustification: string;
    approvedBy: string;
    approvedAt: string;
    version: string;
}
/**
 * Quantifiable Security or AI Governance Objective (/tenants/{tenantId}/iso_management/objectives_{id})
 */
export interface ISOObjective extends BaseEntity {
    frameworkType: ISOFrameworkType;
    title: string;
    targetKpiDescription: string;
    baselineValue: string;
    targetValue: string;
    currentValue: string;
    status: ObjectiveStatus;
    targetDate: string;
    responsibleRole: string;
}
/**
 * Statement of Applicability Entry (SoA) (/tenants/{tenantId}/iso_soa_entries/{soaId})
 */
export interface StatementOfApplicabilityEntry extends BaseEntity {
    frameworkType: ISOFrameworkType;
    controlCode: string;
    controlTitle: string;
    isApplicable: boolean;
    decisionType: SoADecisionType;
    sourceType: SoASourceType;
    approvalStatus: SoAApprovalStatus;
    justification: string;
    exclusionCategory?: SoAExclusionCategory | null;
    linkedScopeStatementId?: string | null;
    linkedTenantControlId: string | null;
    requirementId?: string | null;
    reviewedBy?: string | null;
    reviewedAt: string;
    approvedBy?: string | null;
    approvedAt?: string | null;
    rejectionReason?: string | null;
    version: string;
}
export interface SoASummaryReport {
    frameworkType: ISOFrameworkType;
    scopeStatementId?: string | null;
    scopeTitle?: string | null;
    totalControls: number;
    includedCount: number;
    excludedCount: number;
    approvedCount: number;
    pendingApprovalCount: number;
    draftCount: number;
    exclusionCategoryBreakdown: Record<string, number>;
    entries: StatementOfApplicabilityEntry[];
    generatedAt: string;
}
/**
 * Internal Audit Plan & Execution Record
 */
export interface ISOInternalAudit extends BaseEntity {
    frameworkType: ISOFrameworkType;
    auditPlanTitle: string;
    status: AuditStatus;
    leadAuditorName: string;
    auditTeamNames: string[];
    startDate: string;
    endDate: string;
    auditScope: string;
    summaryReportStoragePath: string | null;
    findingsCount: number;
}
/**
 * ISO Finding / Nonconformity
 */
export interface ISOFinding extends BaseEntity {
    frameworkType: ISOFrameworkType;
    auditId: string;
    findingType: FindingType;
    status: FindingStatus;
    clauseReference: string;
    description: string;
    rootCauseAnalysis: string;
    correctiveActionPlan: string;
    remedialIssueId: string | null;
    targetClosureDate: string;
    verifiedClosedAt: string | null;
    verifiedBy: string | null;
}
/**
 * Executive Management Review Record (Clause 9.3)
 */
export interface ISOManagementReview extends BaseEntity {
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
    managementSignoffBy: string;
    managementSignoffAt: string;
}
/**
 * Validates a Statement of Applicability entry.
 * Strictly enforces that excluded controls MUST have a comprehensive justification rationale.
 */
export declare function validateSoAEntry(entry: Partial<StatementOfApplicabilityEntry>): {
    valid: boolean;
    error?: string;
};
/**
 * Transitions an SoA entry through the formal review and approval lifecycle.
 */
export declare function transitionSoAApproval(entry: StatementOfApplicabilityEntry, action: 'submit_for_approval' | 'approve' | 'reject', actorId: string, notes?: string): StatementOfApplicabilityEntry;
/**
 * Compiles a draft Statement of Applicability from an approved ISO Scope Statement and GRC applicability decisions.
 * Preserves a clear distinction between automatic suggestions (`draft`) and approved entries.
 */
export declare function generateSoAFromScopeAndDecisions(params: {
    tenantId: string;
    defaultOwnerId: string;
    scopeStatement: ISOScopeStatement;
    decisions: TenantApplicabilityDecision[];
    masterControls: MasterControl[];
    tenantControls?: TenantControlInstance[];
}): StatementOfApplicabilityEntry[];
/**
 * Builds an executive SoA Summary Report for external auditors and ISO certification bodies.
 */
export declare function buildSoASummaryReport(frameworkType: ISOFrameworkType, entries: StatementOfApplicabilityEntry[], scopeStatement?: ISOScopeStatement): SoASummaryReport;
//# sourceMappingURL=iso.d.ts.map
import { BaseEntity } from './core.js';

export type ISOFrameworkType = 'iso_27001' | 'iso_42001' | 'integrated_isms_aims';
export type ObjectiveStatus = 'planned' | 'in_progress' | 'achieved' | 'missed';
export type AuditStatus = 'scheduled' | 'in_progress' | 'completed' | 'canceled';
export type FindingType = 'major_nonconformity' | 'minor_nonconformity' | 'opportunity_for_improvement' | 'observation';
export type FindingStatus = 'open' | 'corrective_action_planned' | 'verified_closed';

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
 * Statement of Applicability Entry (SoA)
 */
export interface StatementOfApplicabilityEntry extends BaseEntity {
  frameworkType: ISOFrameworkType;
  controlCode: string;
  controlTitle: string;
  isApplicable: boolean;
  justification: string;
  linkedTenantControlId: string | null;
  reviewedAt: string;
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

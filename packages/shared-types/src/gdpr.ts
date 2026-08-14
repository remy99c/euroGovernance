import { BaseEntity } from './core.js';

export type ROPAStatus = 'draft' | 'active' | 'under_review' | 'archived';
export type LegalBasisType =
  | 'consent'
  | 'contractual_necessity'
  | 'legal_obligation'
  | 'vital_interests'
  | 'public_task'
  | 'legitimate_interests';

export type DPIAStatus =
  | 'screening'
  | 'not_required'
  | 'draft'
  | 'in_review'
  | 'dpo_consulted'
  | 'approved'
  | 'rejected'
  | 'prior_consultation_required';

export type TIAStatus = 'draft' | 'in_review' | 'approved' | 'restricted' | 'rejected';
export type TransferMechanism =
  | 'adequacy_decision'
  | 'standard_contractual_clauses'
  | 'binding_corporate_rules'
  | 'derogation_art49'
  | 'other';

export type BreachSeverity = 'low' | 'medium' | 'high' | 'critical';
export type BreachStatus =
  | 'suspected'
  | 'investigating'
  | 'confirmed_non_reportable'
  | 'dpa_notified'
  | 'data_subjects_notified'
  | 'closed';

export type DSRType =
  | 'access'
  | 'rectification'
  | 'erasure'
  | 'restriction'
  | 'data_portability'
  | 'object'
  | 'automated_decision_making';

export type DSRStatus = 'received' | 'identity_verified' | 'in_progress' | 'completed' | 'rejected';

/**
 * Record of Processing Activities Entry (/tenants/{tenantId}/ropa_entries/{ropaId})
 */
export interface ROPAEntry extends BaseEntity {
  activityCode: string;
  activityName: string;
  purpose: string;
  legalBasis: LegalBasisType;
  legalBasisRationale: string;
  isSpecialCategoryData: boolean;
  specialCategoryBasis: string | null;
  dataSubjectCategories: string[]; // e.g. ['employees', 'customers', 'suppliers']
  personalDataCategories: string[]; // e.g. ['contact_info', 'financial_data', 'biometric_data']
  retentionPeriodDescription: string;
  retentionPeriodMonths: number;
  dataSecurityMeasuresSummary: string;
  jointControllerInfo: string | null;
  processorIds: string[]; // Linked Vendor IDs
  recipientCategories: string[];
  involvesInternationalTransfer: boolean;
  destinationCountries: string[];
  transferMechanism: TransferMechanism | null;
  dpiaRequired: boolean;
  linkedDpiaId: string | null;
  linkedTiaId: string | null;
  linkedSystemAssetIds: string[];
  status: ROPAStatus;
}

/**
 * Data Protection Impact Assessment (/tenants/{tenantId}/dpia_assessments/{dpiaId})
 */
export interface DPIA extends BaseEntity {
  code: string;
  title: string;
  description: string;
  ropaEntryId: string;
  status: DPIAStatus;
  screeningQuestionsAnswers: {
    systematicEvaluation: boolean;
    automatedDecisionMaking: boolean;
    largeScaleSpecialCategories: boolean;
    vulnerableSubjects: boolean;
    innovativeTechUsage: boolean;
    preventsExercisingRights: boolean;
  };
  necessityAndProportionalityAssessment: string;
  dpoOpinionNotes: string | null;
  dpoApprovalDate: string | null;
  residualRiskLevel: 'low' | 'medium' | 'high';
  mitigatingControlIds: string[];
  nextReviewDate: string;
}

/**
 * Transfer Impact Assessment (/tenants/{tenantId}/tia_assessments/{tiaId})
 */
export interface TIA extends BaseEntity {
  code: string;
  title: string;
  vendorId: string;
  destinationCountry: string;
  legalMechanism: TransferMechanism;
  destinationCountryLegalAssessment: string;
  supplementaryTechnicalMeasures: string;
  supplementaryContractualMeasures: string;
  status: TIAStatus;
  residualRiskLevel: 'low' | 'medium' | 'high';
  approvedBy: string | null;
  approvedAt: string | null;
  transferArrangementId?: string | null;
  processorProfileId?: string | null;
  nextReviewDate?: string | null;
}

/**
 * Personal Data Breach Register & 72h Tracker (/tenants/{tenantId}/breaches/{breachId})
 */
export interface PersonalDataBreach extends BaseEntity {
  incidentReference: string;
  title: string;
  discoveredAt: string;
  occurredAt: string | null;
  severity: BreachSeverity;
  status: BreachStatus;
  description: string;
  affectedDataCategories: string[];
  estimatedDataSubjectsCount: number;
  natureOfBreach: 'confidentiality' | 'integrity' | 'availability';
  rootCauseAnalysis: string;
  dpaNotificationDeadline72h: string;
  dpaNotifiedAt: string | null;
  dpaReferenceNumber: string | null;
  dataSubjectsNotifiedAt: string | null;
  containmentActionsTaken: string;
  remedialIssueIds: string[];
}

/**
 * Data Subject Rights Request Tracker (/tenants/{tenantId}/dsr_requests/{dsrId})
 */
export interface DSRRequest extends BaseEntity {
  ticketNumber: string;
  requestType: DSRType;
  status: DSRStatus;
  requesterEmailMasked: string;
  requesterVerifiedAt: string | null;
  receivedAt: string;
  statutoryDeadlineDate: string; // 30 calendar days from receipt
  extensionReason: string | null;
  extendedDeadlineDate: string | null;
  processingNotes: string;
  fulfilledAt: string | null;
  rejectionReason: string | null;
  affectedRopaIds: string[];
}

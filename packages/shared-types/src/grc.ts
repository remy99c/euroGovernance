import { BaseEntity } from './core.js';

export type ControlImplementationStatus =
  | 'not_started'
  | 'in_progress'
  | 'implemented'
  | 'partially_implemented'
  | 'not_applicable';

export const VALID_CONTROL_STATUSES: readonly ControlImplementationStatus[] = [
  'not_started',
  'in_progress',
  'implemented',
  'partially_implemented',
  'not_applicable',
] as const;

export function isValidControlStatus(status: unknown): status is ControlImplementationStatus {
  return typeof status === 'string' && VALID_CONTROL_STATUSES.includes(status as ControlImplementationStatus);
}

export type ControlReviewStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type EvidenceStatus = 'valid' | 'expired' | 'under_review' | 'rejected' | 'archived';
export type PolicyStatus = 'draft' | 'under_review' | 'approved' | 'active' | 'retired';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'identified' | 'assessed' | 'mitigating' | 'accepted' | 'closed';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'in_progress' | 'under_review' | 'resolved' | 'closed';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'canceled';
export type VendorRiskTier = 'low' | 'medium' | 'high' | 'critical';
export type SystemCriticality = 'low' | 'medium' | 'high' | 'mission_critical';

export type FrameworkType =
  | 'regulation'
  | 'directive'
  | 'international_standard'
  | 'national_standard'
  | 'industry_standard';

export type FrameworkStatus = 'active' | 'draft' | 'deprecated' | 'superseded';

export type FrameworkCategory =
  | 'privacy'
  | 'ai_governance'
  | 'data_governance'
  | 'security'
  | 'cross_domain'
  | 'financial_resilience'
  | 'critical_infrastructure';

/**
 * Global Reference Framework (/frameworks/{frameworkId})
 */
export interface Framework {
  id: string; // e.g. 'gdpr', 'eu_ai_act', 'eu_data_act', 'iso_27001_2022', 'iso_42001_2023'
  code: string;
  name: string;
  version: string;
  category: FrameworkCategory;
  jurisdiction: string; // e.g. 'European Union', 'International'
  type: FrameworkType;
  status: FrameworkStatus;
  description: string;
  officialReferenceUrl: string;
  totalRequirementsCount: number;
  totalMasterControlsCount: number;
  isSystem: boolean;
  effectiveDate?: string;
  enforcementDate?: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Global Framework Requirement (/frameworks/{frameworkId}/requirements/{reqId})
 */
export interface Requirement {
  id: string;
  frameworkId: string;
  sectionCode: string; // e.g. 'Art. 30', 'Art. 9', 'Clause 5.1', 'Annex A.5.1'
  title: string;
  description: string;
  guidanceText: string;
  category: string;
  isMandatory: boolean;
  parentRequirementId: string | null;
  sortOrder: number;
  jurisdiction?: string;
  legalBasisUrl?: string | null;
  mappedMasterControlIds?: string[];
}

export interface MasterControlApplicabilityProfile {
  mandatoryExclusionsAllowed: boolean;
  standardInclusionCriteria: string;
  standardExclusionCriteria: string;
  recommendedGuidance: string;
}

/**
 * Global Master Control Catalog (/frameworks/{frameworkId}/master_controls/{controlId})
 */
export interface MasterControl {
  id: string;
  frameworkId: string;
  code: string; // e.g. 'CTL-GDPR-30', 'CTL-AIA-09', 'A.8.24'
  title: string;
  description: string;
  domain: string;
  controlObjective: string;
  evidenceExpectations: string[];
  recommendedFrequencyDays: number;
  applicabilityProfile: MasterControlApplicabilityProfile;
  canonicalControlMappingKey: string | null; // e.g. 'harmonized_encryption_at_rest'
  requirementIds?: string[];
}

/**
 * Requirement to Control Master Mapping (/frameworks/{frameworkId}/mappings/{mappingId})
 */
export interface MasterRequirementControlMapping {
  id: string;
  frameworkId: string;
  requirementId: string;
  masterControlId: string;
  coverageType: 'full' | 'partial' | 'supporting';
  rationale: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tenant Adopted Control (/tenants/{tenantId}/controls/{controlId})
 */
export interface Control extends BaseEntity {
  masterControlId: string | null;
  code: string;
  title: string;
  description: string;
  domain: string;
  frameworkIds: string[]; // List of frameworks this control maps to
  requirementIds: string[]; // Specific requirements satisfied
  status: ControlImplementationStatus;
  healthScore: number; // 0-100%
  enforcementMechanism: 'automated' | 'manual' | 'policy' | 'hybrid';
  reviewFrequencyDays: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  implementationNotes: string;
}

/**
 * Tenant Control Review Log (/tenants/{tenantId}/controls/{controlId}/reviews/{reviewId})
 */
export interface ControlReview {
  id: string;
  tenantId: string;
  controlId: string;
  status: ControlReviewStatus;
  reviewerId: string;
  effectiveness: 'effective' | 'ineffective' | 'needs_improvement';
  notes: string;
  reviewedAt: string;
}

/**
 * Evidence Record (/tenants/{tenantId}/evidence/{evidenceId})
 */
export interface Evidence extends BaseEntity {
  title: string;
  description: string;
  category: 'audit_log' | 'screenshot' | 'policy_doc' | 'export_report' | 'assessment_doc' | 'configuration';
  status: EvidenceStatus;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  fileHashSha256: string;
  controlIds: string[];
  requirementIds: string[];
  policyIds: string[];
  riskIds: string[];
  assessmentIds: string[];
  collectedAt: string;
  reviewDueDate: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  rejectionReason: string | null;
  currentVersion: number;
}

/**
 * Evidence Version (/tenants/{tenantId}/evidence/{evidenceId}/versions/{versionId})
 */
export interface EvidenceVersion {
  id: string;
  tenantId: string;
  evidenceId: string;
  versionNumber: number;
  storagePath: string;
  fileSizeBytes: number;
  mimeType: string;
  fileHashSha256: string;
  changeSummary: string;
  uploadedBy: string;
  uploadedAt: string;
}

/**
 * Policy Document (/tenants/{tenantId}/policies/{policyId})
 */
export interface Policy extends BaseEntity {
  code: string;
  title: string;
  version: string;
  summary: string;
  storagePath: string | null;
  contentMarkdown: string | null;
  status: PolicyStatus;
  scope: string;
  approverId: string | null;
  approvedAt: string | null;
  effectiveDate: string | null;
  nextReviewDate: string;
  linkedControlIds: string[];
}

/**
 * Risk Register Entry (/tenants/{tenantId}/risks/{riskId})
 */
export interface Risk extends BaseEntity {
  code: string;
  title: string;
  description: string;
  category: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
  status: RiskStatus;
  inherentLikelihood: number; // 1-5
  inherentImpact: number; // 1-5
  inherentScore: number; // likelihood * impact
  residualLikelihood: number; // 1-5
  residualImpact: number; // 1-5
  residualScore: number;
  treatmentStrategy: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan: string;
  mitigatingControlIds: string[];
  affectedAssetIds: string[];
}

/**
 * Issue and Remediation (/tenants/{tenantId}/issues/{issueId})
 */
export interface Issue extends BaseEntity {
  code: string;
  title: string;
  description: string;
  severity: IssueSeverity;
  status: IssueStatus;
  source: 'audit' | 'risk_assessment' | 'incident' | 'manual_flag' | 'automated_test';
  sourceEntityId: string | null;
  sourceEntityType: string | null;
  dueDate: string;
  resolutionPlan: string;
  resolvedAt: string | null;
  verifiedBy: string | null;
}

/**
 * Task Execution Item (/tenants/{tenantId}/tasks/{taskId})
 */
export interface Task extends BaseEntity {
  title: string;
  description: string;
  status: TaskStatus;
  assigneeId: string;
  parentEntityType: 'control' | 'evidence' | 'policy' | 'risk' | 'issue' | 'dpia' | 'ai_system';
  parentEntityId: string;
  dueDate: string;
  completedAt: string | null;
}

export type VendorCommercialStatus = 'evaluating' | 'active' | 'contract_pending' | 'terminated';

/**
 * Vendor Register (/tenants/{tenantId}/vendors/{vendorId})
 * Master commercial third-party entity.
 */
export interface Vendor extends BaseEntity {
  name: string;
  category: 'cloud_provider' | 'saas_service' | 'ai_model_provider' | 'subprocessor' | 'consultancy';
  riskTier: VendorRiskTier;
  primaryContactName: string;
  primaryContactEmail: string;
  dpaSigned: boolean;
  dpaDate: string | null;
  securityAssessmentDate: string | null;
  nextAssessmentDueDate: string | null;
  countryOfIncorporation: string;
  dataHostingRegions: string[];
  subprocessorsListed: string[];
  hasProcessorProfile?: boolean;
  activeProcessorProfileId?: string | null;
  commercialStatus?: VendorCommercialStatus;
  businessOwnerUserId?: string | null;
  annualSpendEur?: number | null;
}

/**
 * System and Asset Register (/tenants/{tenantId}/system_assets/{assetId})
 */
export interface SystemAsset extends BaseEntity {
  name: string;
  assetType: 'cloud_infrastructure' | 'internal_software' | 'database' | 'ai_model' | 'endpoint' | 'network';
  criticality: SystemCriticality;
  dataClassification: 'public' | 'internal' | 'confidential' | 'restricted_personal';
  hostingLocation: string;
  vendorId: string | null;
  containsPersonalData: boolean;
  containsSpecialCategoryData: boolean;
  containsTrainingData: boolean;
}

export type AdoptedFrameworkStatus =
  | 'evaluating'
  | 'in_scoping'
  | 'adopted'
  | 'active'
  | 'retired';

/**
 * Tenant Adopted Framework (/tenants/{tenantId}/adopted_frameworks/{frameworkId})
 */
export interface AdoptedFramework extends BaseEntity {
  frameworkId: string; // matches /frameworks/{frameworkId}
  frameworkCode: string;
  frameworkName: string;
  frameworkVersion?: string;
  pinnedVersion?: string | null;
  versionPinnedAt?: string | null;
  status: AdoptedFrameworkStatus;
  scopeDescription: string;
  scopingBoundaries: string[]; // e.g. ['Frankfurt Cloud Services', 'Customer Data Processing', 'AI Recommendation Engine']
  targetCertificationDate: string | null;
  totalMasterControlsCount: number;
  instantiatedControlsCount: number;
  applicableControlsCount: number;
  notApplicableControlsCount: number;
  adoptedBy: string;
  adoptedAt: string;
  lastInstantiatedAt: string | null;
}

/**
 * Tenant Requirement Applicability & Scoping (/tenants/{tenantId}/requirement_applicability/{reqId})
 */
export interface RequirementApplicability extends BaseEntity {
  requirementId: string;
  frameworkId: string;
  sectionCode: string;
  requirementTitle: string;
  isApplicable: boolean;
  justification: string;
  scopingNotes: string;
  assessedBy: string;
  assessedAt: string;
}

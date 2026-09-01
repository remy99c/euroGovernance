import { BaseEntity, UserRole } from './core.js';
export type ControlImplementationStatus = 'not_started' | 'in_progress' | 'implemented' | 'partially_implemented' | 'not_applicable';
export declare const VALID_CONTROL_STATUSES: readonly ControlImplementationStatus[];
export declare function isValidControlStatus(status: unknown): status is ControlImplementationStatus;
export type ControlReviewStatus = 'draft' | 'pending_approval' | 'approved' | 'rejected';
export type ControlWorkflowTrust = 'legacy_unverified' | 'governed_unassured' | 'review_pending' | 'authoritative' | 'retired';
export type ControlAssuranceStatus = 'untested' | 'pending_review' | 'effective' | 'needs_improvement' | 'ineffective' | 'expired' | 'not_applicable';
export type EvidenceStatus = 'valid' | 'expired' | 'under_review' | 'rejected' | 'archived';
export type PolicyStatus = 'draft' | 'under_review' | 'approved' | 'active' | 'retired';
export type PolicyWorkflowTrust = 'legacy_unverified' | 'governed_draft' | 'governed_under_review' | 'authoritative' | 'retired';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';
export type RiskStatus = 'identified' | 'assessed' | 'mitigating' | 'accepted' | 'closed';
export type IssueSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IssueStatus = 'open' | 'in_progress' | 'under_review' | 'resolved' | 'closed';
export type TaskStatus = 'todo' | 'in_progress' | 'blocked' | 'completed' | 'canceled';
export type VendorRiskTier = 'low' | 'medium' | 'high' | 'critical';
export type SystemCriticality = 'low' | 'medium' | 'high' | 'mission_critical';
export interface GovernedOperationalMetadata {
    /** Monotonic command-boundary revision; absent only on legacy records. */
    revision?: number;
    /** Server-owned workflow contract version; absent only on legacy records. */
    workflowSchemaVersion?: number;
    /** Soft-retirement metadata. Authoritative records are never hard-deleted. */
    retiredAt?: string | null;
    retiredBy?: string | null;
    retirementReason?: string | null;
}
export type FrameworkType = 'regulation' | 'directive' | 'international_standard' | 'national_standard' | 'industry_standard';
export type FrameworkStatus = 'active' | 'draft' | 'deprecated' | 'superseded';
export type FrameworkCategory = 'privacy' | 'ai_governance' | 'data_governance' | 'security' | 'cross_domain' | 'financial_resilience' | 'critical_infrastructure';
/**
 * Global Reference Framework (/frameworks/{frameworkId})
 */
export interface Framework {
    id: string;
    code: string;
    name: string;
    version: string;
    category: FrameworkCategory;
    jurisdiction: string;
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
    sectionCode: string;
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
    code: string;
    title: string;
    description: string;
    domain: string;
    controlObjective: string;
    evidenceExpectations: string[];
    recommendedFrequencyDays: number;
    applicabilityProfile: MasterControlApplicabilityProfile;
    canonicalControlMappingKey: string | null;
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
export interface Control extends BaseEntity, GovernedOperationalMetadata {
    masterControlId: string | null;
    code: string;
    title: string;
    description: string;
    domain: string;
    frameworkIds: string[];
    requirementIds: string[];
    status: ControlImplementationStatus;
    healthScore: number;
    enforcementMechanism: 'automated' | 'manual' | 'policy' | 'hybrid';
    reviewFrequencyDays: number;
    lastReviewDate: string | null;
    nextReviewDate: string | null;
    implementationNotes: string;
    /** Stored workflow projection; read APIs independently verify its artifact chain. */
    workflowTrust?: ControlWorkflowTrust;
    /** Server-derived assurance state. Browser callers cannot set this field. */
    assuranceStatus?: ControlAssuranceStatus;
    /** Server-maintained authors whose implementation changes require independent review. */
    implementationContributorIds?: string[];
    /** Server-derived not-applicable decision attribution. */
    statusRationale?: string | null;
    statusDecidedBy?: string | null;
    statusDecidedAt?: string | null;
    /** Current review anchor. Effectiveness assurance is invalid without its command artifacts. */
    lastReviewId?: string | null;
    lastReviewCommandId?: string | null;
    lastReviewEffectiveness?: 'effective' | 'ineffective' | 'needs_improvement' | null;
    lastReviewEvidenceIds?: string[];
    lastReviewEvidenceAnchors?: ControlEvidenceAnchor[];
    pendingReviewId?: string | null;
    pendingReviewAssigneeId?: string | null;
    pendingReviewSubmittedAt?: string | null;
    pendingReviewSubmittedBy?: string | null;
    lastReviewDecisionCommandId?: string | null;
    assuranceInvalidatedAt?: string | null;
    assuranceInvalidatedBy?: string | null;
    processorCertificationIds?: string[];
    processorProfileIds?: string[];
}
/** Immutable Storage/object facts captured when a control test is submitted. */
export interface ControlEvidenceAnchor {
    evidenceId: string;
    evidenceVersion: number;
    evidenceCreatedBy: string;
    evidenceReviewedBy: string;
    evidenceReviewedAt: string;
    storagePath: string;
    storageGeneration: string;
    fileHashSha256: string;
    fileSizeBytes: number;
    mimeType: string;
    objectVerifiedAt: string;
    reviewDueDate: string | null;
}
/**
 * Tenant Control Review Log (/tenants/{tenantId}/controls/{controlId}/reviews/{reviewId})
 */
export interface ControlReview {
    id: string;
    tenantId: string;
    controlId: string;
    status: ControlReviewStatus;
    assignedReviewerId: string;
    submittedBy: string;
    submittedAt: string;
    submissionCommandId: string;
    reviewerId: string | null;
    reviewerRole?: UserRole | null;
    effectiveness: 'effective' | 'ineffective' | 'needs_improvement';
    notes: string;
    testMethod: string;
    testPeriodStart: string | null;
    testPeriodEnd: string | null;
    sampleSize: number | null;
    exceptions: string;
    evidenceIds: string[];
    evidenceAnchors: ControlEvidenceAnchor[];
    implementationContributorIds: string[];
    reviewedControlRevision: number;
    reviewedStateHash: string;
    reviewedVersionArtifactHash: string;
    resultingControlRevision: number;
    decision?: 'approved' | 'rejected' | null;
    decisionNotes?: string | null;
    decisionCommandId?: string | null;
    commandId?: string;
    reviewedAt: string | null;
}
export type EvidenceCategory = 'audit_log' | 'screenshot' | 'policy_doc' | 'export_report' | 'assessment_doc' | 'configuration' | 'dpa' | 'scc' | 'addendum' | 'adequacy_support' | 'toms' | 'security_report' | 'iso_certificate' | 'soc_report' | 'subprocessor_list' | 'transfer_assessment_support' | 'incident_notice' | 'bridge_letter' | 'management_assertion' | 'penetration_test_report' | 'code_of_conduct_doc' | 'industry_label_evidence' | 'custom_assurance_doc';
export declare const VALID_EVIDENCE_CATEGORIES: readonly EvidenceCategory[];
export type EvidenceSourceType = 'manual_upload' | 'external_questionnaire_submission' | 'automated_collector' | 'system_generated';
export interface EvidenceObjectVerification {
    status: 'verified' | 'failed';
    storagePath: string;
    storageGeneration: string;
    verifiedFileHashSha256: string;
    verifiedFileSizeBytes: number;
    verifiedMimeType: string;
    verifiedAt: string;
    verifier: 'storage_finalize_function';
}
/**
 * Evidence Record (/tenants/{tenantId}/evidence/{evidenceId})
 */
export interface Evidence extends BaseEntity {
    title: string;
    description: string;
    category: EvidenceCategory;
    status: EvidenceStatus;
    storagePath: string;
    fileSizeBytes: number;
    mimeType: string;
    fileHashSha256: string;
    /** Absent on legacy/caller-declared metadata and therefore never audit-grade. */
    objectVerification?: EvidenceObjectVerification | null;
    controlIds: string[];
    requirementIds: string[];
    policyIds: string[];
    riskIds: string[];
    assessmentIds: string[];
    processorProfileIds?: string[];
    transferArrangementIds?: string[];
    vendorIds?: string[];
    certificationIds?: string[];
    processorCertificationIds?: string[];
    sourceType?: EvidenceSourceType;
    isExternalSubmissionArtifact?: boolean;
    sourceAssessmentRequestId?: string | null;
    sourceSubmissionId?: string | null;
    sourceQuestionId?: string | null;
    sourceThirdPartyName?: string | null;
    sourceRespondentEmail?: string | null;
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
    /** Monotonic optimistic-concurrency revision; legacy records default to 0. */
    revision?: number;
    /** Server-owned workflow contract and assurance provenance. */
    workflowSchemaVersion?: number;
    workflowTrust?: PolicyWorkflowTrust;
    /** Server-recorded rationale for the most recent lifecycle decision. */
    lastDecisionNotes?: string | null;
    /** Command receipt anchor proving approval used the authoritative workflow. */
    approvalCommandId?: string | null;
    /** Server-maintained authors of the draft presented for the current approval cycle. */
    draftContributorIds?: string[];
    /** Server-derived identity and time of the current review submission. */
    reviewSubmittedBy?: string | null;
    reviewSubmittedAt?: string | null;
    reviewSubmissionCommandId?: string | null;
    reviewAssigneeId?: string | null;
    retiredAt?: string | null;
    retiredBy?: string | null;
    retirementReason?: string | null;
}
/**
 * Risk Register Entry (/tenants/{tenantId}/risks/{riskId})
 */
export interface Risk extends BaseEntity, GovernedOperationalMetadata {
    code: string;
    title: string;
    description: string;
    category: 'legal_compliance' | 'security' | 'privacy' | 'ai_bias' | 'operational' | 'third_party';
    status: RiskStatus;
    inherentLikelihood: number;
    inherentImpact: number;
    inherentScore: number;
    residualLikelihood: number;
    residualImpact: number;
    residualScore: number;
    treatmentStrategy: 'mitigate' | 'accept' | 'transfer' | 'avoid';
    treatmentPlan: string;
    mitigatingControlIds: string[];
    affectedAssetIds: string[];
    processorProfileIds?: string[];
    transferArrangementIds?: string[];
    processorCertificationIds?: string[];
    vendorIds?: string[];
    derivedRuleCode?: string | null;
    deduplicationKey?: string | null;
    sourceEntityType?: string | null;
    sourceEntityId?: string | null;
    /** Server-derived four-eyes acceptance attribution for accepted residual risk. */
    acceptedBy?: string | null;
    acceptedAt?: string | null;
    /** Server-derived independent closure attribution for manually managed risks. */
    closedBy?: string | null;
    closedAt?: string | null;
}
/**
 * Issue and Remediation (/tenants/{tenantId}/issues/{issueId})
 */
export interface Issue extends BaseEntity, GovernedOperationalMetadata {
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
    verifiedAt?: string | null;
}
/**
 * Task Execution Item (/tenants/{tenantId}/tasks/{taskId})
 */
export interface Task extends BaseEntity, GovernedOperationalMetadata {
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
    latestAssessmentRequestId?: string | null;
    latestAssessmentSubmissionId?: string | null;
    latestAssessmentScorePercent?: number | null;
    latestAssessmentRiskTier?: VendorRiskTier | null;
}
export type ProcessorSystemRelationshipType = 'hosting' | 'analytics' | 'support' | 'storage' | 'ai_provider' | 'messaging' | 'payroll' | 'crm' | 'identity_auth' | 'payment_gateway' | 'security_monitoring' | 'backup_dr' | 'other';
export interface ProcessorSystemRelationship {
    processorProfileId: string;
    relationshipType: ProcessorSystemRelationshipType;
    relationshipDescription?: string | null;
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
    processorProfileIds?: string[];
    processorRelationships?: ProcessorSystemRelationship[];
}
export type AdoptedFrameworkStatus = 'evaluating' | 'in_scoping' | 'adopted' | 'active' | 'retired';
/**
 * Tenant Adopted Framework (/tenants/{tenantId}/adopted_frameworks/{frameworkId})
 */
export interface AdoptedFramework extends BaseEntity {
    frameworkId: string;
    frameworkCode: string;
    frameworkName: string;
    frameworkVersion?: string;
    pinnedVersion?: string | null;
    versionPinnedAt?: string | null;
    status: AdoptedFrameworkStatus;
    scopeDescription: string;
    scopingBoundaries: string[];
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
//# sourceMappingURL=grc.d.ts.map
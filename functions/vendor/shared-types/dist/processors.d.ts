import { BaseEntity, UserRole } from './core.js';
import { Evidence, EvidenceCategory, EvidenceStatus, ProcessorSystemRelationshipType, SystemAsset, Control, Vendor } from './grc.js';
import { PersonalDataBreach, BreachReportingSource, BreachSeverity, BreachStatus } from './gdpr.js';
import { NotificationType, NotificationPriority } from './audit.js';
export type ProcessorRole = 'data_processor' | 'subprocessor' | 'joint_controller' | 'third_party_recipient';
export declare const VALID_PROCESSOR_ROLES: readonly ProcessorRole[];
export type ProcessorCriticality = 'low' | 'medium' | 'high' | 'critical';
export declare const VALID_PROCESSOR_CRITICALITIES: readonly ProcessorCriticality[];
export type ProcessorReviewCadence = 'monthly' | 'quarterly' | 'semi_annually' | 'annually' | 'biennially';
export declare const VALID_PROCESSOR_REVIEW_CADENCES: readonly ProcessorReviewCadence[];
export type ProcessorStatus = 'active' | 'under_review' | 'restricted' | 'suspended' | 'offboarded';
export declare const VALID_PROCESSOR_STATUSES: readonly ProcessorStatus[];
/**
 * GDPR Article 28 Mandatory Terms Checklist
 */
export interface GDPRArticle28Checklist {
    writtenInstructionsMandate: boolean;
    confidentialityDuty: boolean;
    securityMeasuresTOMs: boolean;
    subprocessorAuthorization: boolean;
    dataSubjectRightsAssistance: boolean;
    breachAssistance: boolean;
    dataReturnOrDeletion: boolean;
    auditInspectionRights: boolean;
}
/**
 * Data Processor Profile (/tenants/{tenantId}/processor_profiles/{profileId})
 * Privacy and data-processing overlay linked to a master commercial Vendor record.
 */
export interface ProcessorProfile extends BaseEntity {
    vendorId: string;
    tenantId: string;
    engagementName?: string | null;
    processorRole: ProcessorRole;
    serviceDescription: string;
    dataCategories: string[];
    dataSubjects: string[];
    isSpecialCategoryData: boolean;
    specialCategoryTypes?: string[] | null;
    jurisdictions: string[];
    linkedSystemAssetIds: string[];
    criticality: ProcessorCriticality;
    ownerUserId: string;
    reviewCadence: ProcessorReviewCadence;
    lastReviewDate: string | null;
    nextReviewDate: string | null;
    status: ProcessorStatus;
    notes: string | null;
    article28Checklist?: GDPRArticle28Checklist | null;
    dpaSigned: boolean;
    dpaDate: string | null;
    linkedDpaEvidenceId?: string | null;
    linkedTiaId?: string | null;
    linkedRopaIds?: string[];
    linkedBreachIds?: string[];
    linkedRiskIds?: string[];
    systemAssetRelationships?: Array<{
        systemAssetId: string;
        relationshipType: ProcessorSystemRelationshipType;
        relationshipDescription?: string | null;
    }>;
    latestAssessmentRequestId?: string | null;
    latestAssessmentSubmissionId?: string | null;
    latestAssessmentScorePercent?: number | null;
    latestAssessmentDate?: string | null;
}
export interface ValidateProcessorProfileResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validates a ProcessorProfile payload for data integrity and business rules.
 */
export declare function validateProcessorProfile(input: unknown): ValidateProcessorProfileResult;
/**
 * Calculates review date based on last review date and cadence.
 */
export declare function computeNextReviewDate(lastReviewDateISO: string, cadence: ProcessorReviewCadence): string;
export type TransferScopeType = 'hosting' | 'support_access' | 'onward_transfer' | 'subprocessing' | 'analytics' | 'backup' | 'maintenance' | 'other';
export declare const VALID_TRANSFER_SCOPES: readonly TransferScopeType[];
export type TransferMechanismType = 'standard_contractual_clauses' | 'adequacy_decision' | 'derogation_art49' | 'binding_corporate_rules' | 'intra_group_agreement' | 'code_of_conduct_or_certification' | 'no_mechanism_selected' | 'other';
export declare const VALID_TRANSFER_MECHANISM_TYPES: readonly TransferMechanismType[];
export type TransferMechanismStatus = 'active_valid' | 'pending_execution' | 'under_review' | 'restricted' | 'expired' | 'superseded' | 'revoked';
export declare const VALID_TRANSFER_MECHANISM_STATUSES: readonly TransferMechanismStatus[];
export type EEATransferStatus = 'within_eea' | 'third_country_adequate' | 'third_country_non_adequate' | 'mixed';
export declare const VALID_EEA_TRANSFER_STATUSES: readonly EEATransferStatus[];
/**
 * Structured Transfer Arrangement (/tenants/{tenantId}/transfer_arrangements/{arrangementId})
 * Models international cross-border data transfers and legal mechanisms linked to a ProcessorProfile.
 */
export interface TransferArrangement extends BaseEntity {
    processorProfileId: string;
    vendorId?: string;
    tenantId: string;
    name: string;
    restrictedTransfer: boolean;
    destinationCountries: string[];
    eeaStatus: EEATransferStatus;
    transferScopes: TransferScopeType[];
    transferScopeDescription?: string | null;
    transferMechanismType: TransferMechanismType;
    transferMechanismStatus: TransferMechanismStatus;
    effectiveDate: string;
    reviewDueDate: string | null;
    supplementaryMeasuresSummary: string | null;
    subprocessorInvolvement: boolean;
    subprocessorsInvolved?: string[];
    linkedTiaId: string | null;
    linkedEvidenceIds: string[];
    linkedRiskIds?: string[];
    rationale: string | null;
    notes: string | null;
}
export interface ValidateTransferArrangementResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validates a TransferArrangement payload for data consistency and legal mechanism guardrails.
 */
export declare function validateTransferArrangement(input: unknown): ValidateTransferArrangementResult;
export type AssuranceArtifactKind = 'accredited_certification' | 'independent_attestation_report' | 'regulatory_declaration' | 'code_of_conduct' | 'industry_label' | 'self_assessment' | 'custom_assurance';
export declare const VALID_ASSURANCE_ARTIFACT_KINDS: readonly AssuranceArtifactKind[];
export type AssuranceStandardFamily = 'iso_27001' | 'iso_27701' | 'iso_42001' | 'iso_22301' | 'soc1_type2' | 'soc2_type1' | 'soc2_type2' | 'soc3' | 'bsi_c5' | 'tisax' | 'cyber_essentials_plus' | 'gdpr_art42_europrivacy' | 'pci_dss_aoc' | 'hipaa_security' | 'dpf_self_certification' | 'csa_star' | 'other';
export declare const VALID_ASSURANCE_STANDARD_FAMILIES: readonly AssuranceStandardFamily[];
export type AssuranceIssuingBodyType = 'accredited_registrar' | 'cpa_firm_auditor' | 'regulatory_authority' | 'industry_consortium' | 'self_attestation' | 'other';
export type AssuranceCategory = 'information_security' | 'privacy_dataprotection' | 'business_continuity' | 'ai_governance' | 'cloud_security' | 'industry_compliance' | 'regulatory_trade' | 'custom';
export interface AssuranceStandardTaxonomyDefinition {
    family: AssuranceStandardFamily;
    displayName: string;
    shortLabel: string;
    defaultArtifactKind: AssuranceArtifactKind;
    description: string;
    issuingBodyType: AssuranceIssuingBodyType;
    standardValidityMonths: number | null;
    requiresReportPeriod: boolean;
    supportsPointInTime: boolean;
    requiresAnnualSurveillance: boolean;
    category: AssuranceCategory;
}
export declare const ASSURANCE_ARTIFACT_KIND_LABELS: Record<AssuranceArtifactKind, {
    label: string;
    description: string;
    shortLabel: string;
}>;
export declare const ASSURANCE_TAXONOMY_MAP: Record<AssuranceStandardFamily, AssuranceStandardTaxonomyDefinition>;
/**
 * Returns taxonomy metadata for a given assurance standard family.
 */
export declare function getAssuranceTaxonomy(family: AssuranceStandardFamily): AssuranceStandardTaxonomyDefinition;
/**
 * Returns user-facing formatted display name for an assurance standard.
 */
export declare function getAssuranceDisplayName(family: AssuranceStandardFamily, customName?: string | null): string;
/**
 * Returns user-facing label for an assurance artifact kind.
 */
export declare function getAssuranceArtifactKindLabel(kind: AssuranceArtifactKind): string;
/**
 * Validates metadata rules for an assurance artifact (e.g. period-of-time rules for SOC 2 Type II vs point-in-time certificates).
 */
export declare function validateAssuranceMetadataRules(cert: Partial<ProcessorCertification>): {
    valid: boolean;
    errors: string[];
};
export type ProcessorCertificationStatus = 'active_valid' | 'expiring_soon' | 'expired' | 'under_review' | 'superseded' | 'revoked' | 'suspended';
export declare const VALID_PROCESSOR_CERTIFICATION_STATUSES: readonly ProcessorCertificationStatus[];
export type ProcessorCertificationReviewStatus = 'pending' | 'in_review' | 'accepted' | 'rejected' | 'insufficient' | 'expired' | 'superseded';
export declare const VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES: readonly ProcessorCertificationReviewStatus[];
/**
 * Structured Processor Certification / Attestation Record
 * Firestore path: /tenants/{tenantId}/processor_certifications/{certId}
 * Models third-party security, privacy, and regulatory assurance linked to a ProcessorProfile.
 */
export interface ProcessorCertification extends BaseEntity {
    tenantId: string;
    processorProfileId: string;
    vendorId?: string;
    artifactKind: AssuranceArtifactKind;
    standardFamily: AssuranceStandardFamily;
    customStandardName?: string | null;
    issuingBodyOrAuditor: string;
    leadAuditorName?: string | null;
    certificateOrReportNumber: string;
    reportPeriodStart?: string | null;
    reportPeriodEnd?: string | null;
    validFrom: string;
    validUntil: string;
    status: ProcessorCertificationStatus;
    assuranceScopeSummary: string;
    legalEntityOrRegionalScope: string;
    systemsOrServicesCovered: string[];
    notes?: string | null;
    reviewOwnerUserId: string;
    reviewStatus: ProcessorCertificationReviewStatus;
    reviewNotes?: string | null;
    rejectionReason?: string | null;
    reviewedBy?: string | null;
    reviewerEmail?: string | null;
    reviewedAt?: string | null;
    isInsufficient?: boolean;
    insufficientRationale?: string | null;
    replacedByCertificationId?: string | null;
    replacesCertificationId?: string | null;
    versionNumber?: number;
    isHistoricVersion?: boolean;
    reviewDueDate: string | null;
    lastReviewedAt?: string | null;
    lastReviewedBy?: string | null;
    linkedEvidenceIds: string[];
    linkedControlIds?: string[];
    linkedTransferArrangementIds?: string[];
    unresolvedFindingsCount: number;
    hasMajorDeficiencies: boolean;
    ownerId: string;
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface ReviewStateTransitionResult {
    allowed: boolean;
    reason?: string;
}
/**
 * Validates processor certification review state transitions to enforce auditability and state integrity.
 */
export declare function validateProcessorCertificationReviewTransition(currentStatus: ProcessorCertificationReviewStatus, nextStatus: ProcessorCertificationReviewStatus): ReviewStateTransitionResult;
export interface ValidateProcessorCertificationResult {
    valid: boolean;
    errors: string[];
}
/**
 * Validates a ProcessorCertification payload for data consistency and relationship integrity.
 */
export declare function validateProcessorCertification(input: unknown): ValidateProcessorCertificationResult;
export interface ProcessorCertificationEvidenceCompleteness {
    certificationId: string;
    isComplete: boolean;
    hasAttachedEvidence: boolean;
    attachedEvidenceCount: number;
    attachedEvidences: Array<{
        id: string;
        title: string;
        category: EvidenceCategory;
        status: EvidenceStatus;
        fileHashSha256: string;
    }>;
    isExpired: boolean;
    isExpiringSoon: boolean;
    daysUntilExpiry: number;
    isReviewOverdue: boolean;
    daysUntilReviewDue: number | null;
    gaps: Array<{
        code: string;
        description: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        suggestedAction: string;
    }>;
}
/**
 * Resolves all attached evidence records for a processor certification.
 * Supports multi-evidence resolution (e.g. main report, bridge letter, management assertion, SOC 3 summary).
 */
export declare function findEvidenceForProcessorCertification(cert: ProcessorCertification, evidenceDocs?: Evidence[]): Evidence[];
/**
 * Reverse lookup: Resolves all processor certifications referencing or linked to a specific evidence record.
 */
export declare function findProcessorCertificationsForEvidence(evidence: Evidence, certs?: ProcessorCertification[]): ProcessorCertification[];
/**
 * Pure evaluator for single processor certification evidence completeness and review health.
 */
export declare function evaluateProcessorCertificationCompleteness(cert: ProcessorCertification, evidenceDocs?: Evidence[], asOfDate?: Date): ProcessorCertificationEvidenceCompleteness;
export interface ProcessorCertificationRiskFlag {
    id: string;
    certificationId: string;
    processorProfileId: string;
    standardFamily?: AssuranceStandardFamily;
    certificateOrReportNumber?: string;
    ruleCode: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    title: string;
    description: string;
    suggestedTreatment: string;
    inherentScore: number;
    isActionable: boolean;
    dedupKey: string;
}
export interface EvaluateProcessorCertificationRiskFlagsOptions {
    evidenceDocs?: Evidence[];
    processorProfiles?: ProcessorProfile[];
    requiredSystemsMap?: Record<string, string[]>;
    asOfDate?: Date;
}
/**
 * Evaluates risk flags across processor certifications and profiles:
 * - Critical processor with no certification/assurance record
 * - Certification expired (with criticality multiplier)
 * - Certification expiring soon with no replacement in progress
 * - Report rejected or marked insufficient
 * - Processor claims assurance but has no evidence attached
 * - Assurance scope does not cover linked service/system
 */
export declare function evaluateProcessorCertificationRiskFlags(certs: ProcessorCertification[], evidenceDocsOrOptions?: Evidence[] | EvaluateProcessorCertificationRiskFlagsOptions, asOfDate?: Date): ProcessorCertificationRiskFlag[];
export interface ProcessorCertificationReminderCandidate {
    recipientUserId: string;
    recipientRoles?: UserRole[];
    tenantId: string;
    processorProfileId: string;
    certificationId: string;
    certificateOrReportNumber: string;
    standardFamily: AssuranceStandardFamily;
    reminderType: NotificationType;
    title: string;
    message: string;
    dueDate: string;
    severity: NotificationPriority;
    dedupKey: string;
    gracePeriodDaysRemaining?: number | null;
    isStaleReport?: boolean;
}
export interface EvaluateProcessorCertificationRemindersOptions {
    asOfDate?: Date;
    windowDays?: number;
    gracePeriodDays?: number;
    maxReportAgeDays?: number;
}
/**
 * Evaluates reminder candidates for processor certifications:
 * - Upcoming expiries (60d, 30d, 14d)
 * - Grace period consumption and expired assurance
 * - Overdue compliance reviews
 * - Stale period-of-time reports (e.g. SOC 2 / BSI C5 > 12 months)
 * - Missing replacement documents for expired/superseded records
 */
export declare function evaluateProcessorCertificationReminders(certs: ProcessorCertification[], options?: EvaluateProcessorCertificationRemindersOptions): ProcessorCertificationReminderCandidate[];
export type ProcessorTIAStatus = 'not_applicable' | 'tia_missing' | 'tia_in_progress' | 'tia_approved' | 'tia_stale';
export declare const VALID_PROCESSOR_TIA_STATUSES: readonly ProcessorTIAStatus[];
export interface MinimalTIARecord {
    id: string;
    status: string;
    approvedAt?: string | null;
    nextReviewDate?: string | null;
    updatedAt?: string | null;
}
/**
 * Evaluates TIA status for a single TransferArrangement.
 */
export declare function deriveTransferArrangementTIAStatus(arrangement: TransferArrangement, tia: MinimalTIARecord | null, nowISO?: string): ProcessorTIAStatus;
/**
 * Aggregates and derives overall TIA posture for a ProcessorProfile based on all linked transfers.
 */
export declare function deriveProcessorTIAStatus(profile: ProcessorProfile, transfers: TransferArrangement[], tias: MinimalTIARecord[], nowISO?: string): ProcessorTIAStatus;
export interface ProcessorEvidenceRequirement {
    key: string;
    label: string;
    category: EvidenceCategory;
    status: 'satisfied' | 'missing' | 'expired';
    linkedEvidenceId?: string | null;
    reason: string;
}
export interface ProcessorEvidenceCompleteness {
    isComplete: boolean;
    missingCount: number;
    satisfiedCount: number;
    requirements: ProcessorEvidenceRequirement[];
}
export interface TransferEvidenceRequirement {
    key: string;
    label: string;
    category: EvidenceCategory;
    status: 'satisfied' | 'missing' | 'expired';
    linkedEvidenceId?: string | null;
    reason: string;
}
export interface TransferEvidenceCompleteness {
    isComplete: boolean;
    missingCount: number;
    satisfiedCount: number;
    requirements: TransferEvidenceRequirement[];
}
/**
 * Evaluates whether all required compliance evidence artifacts exist for a processor profile.
 */
export declare function evaluateProcessorEvidenceCompleteness(profile: ProcessorProfile, evidences: Evidence[], nowISO?: string): ProcessorEvidenceCompleteness;
/**
 * Evaluates whether all required legal and supplementary evidence artifacts exist for a transfer arrangement.
 */
export declare function evaluateTransferEvidenceCompleteness(arrangement: TransferArrangement, evidences: Evidence[], nowISO?: string): TransferEvidenceCompleteness;
export interface ROPAPrefillResult {
    processorProfileIds: string[];
    processorIds: string[];
    transferArrangementIds: string[];
    personalDataCategories: string[];
    dataSubjectCategories: string[];
    isSpecialCategoryData: boolean;
    specialCategoryBasis: string | null;
    linkedSystemAssetIds: string[];
    involvesInternationalTransfer: boolean;
    destinationCountries: string[];
    transferMechanism: 'standard_contractual_clauses' | 'adequacy_decision' | 'binding_corporate_rules' | 'derogation_art49' | 'other' | null;
    dataSecurityMeasuresSummary: string;
}
/**
 * Synthesizes ROPA fields from one or more linked processor profiles and optional transfer arrangements.
 */
export declare function prefillROPAFromProcessors(profiles: ProcessorProfile[], transfers?: TransferArrangement[]): ROPAPrefillResult;
export interface DPIAProcessorSummaryItem {
    id: string;
    vendorId: string;
    engagementName?: string | null;
    processorRole: ProcessorRole;
    criticality: ProcessorCriticality;
    dpaSigned: boolean;
    isSpecialCategoryData: boolean;
    dataCategories: string[];
    dataSubjects: string[];
}
export interface DPIATransferSummaryItem {
    id: string;
    processorProfileId: string;
    name: string;
    restrictedTransfer: boolean;
    destinationCountries: string[];
    eeaStatus: string;
    transferMechanismType: string;
    transferMechanismStatus: string;
    subprocessorInvolvement: boolean;
    linkedTiaId?: string | null;
}
export interface DPIAProcessorRiskSummary {
    highestCriticality: ProcessorCriticality;
    hasSpecialCategoryData: boolean;
    hasRestrictedTransfers: boolean;
    hasSubprocessors: boolean;
    missingDpaCount: number;
    missingTiaCount: number;
    riskHighlights: string[];
}
export interface DPIAProcessorContext {
    processorCount: number;
    transferCount: number;
    processors: DPIAProcessorSummaryItem[];
    transfers: DPIATransferSummaryItem[];
    safeguardsSummary: string;
    riskSummary: DPIAProcessorRiskSummary;
}
/**
 * Synthesizes DPIA third-party processor context, safeguards, and risk indicators.
 */
export declare function synthesizeDPIAProcessorContext(profiles: ProcessorProfile[], transfers?: TransferArrangement[]): DPIAProcessorContext;
export interface ProcessorBreachSummaryItem {
    id: string;
    incidentReference: string;
    title: string;
    severity: BreachSeverity;
    status: BreachStatus;
    discoveredAt: string;
    reportingSource: BreachReportingSource | null;
    processorNotificationReceivedAt: string | null;
    dpaNotified: boolean;
    affectedSystemAssetIds: string[];
    transferArrangementIds: string[];
}
export interface ProcessorBreachHistory {
    processorProfileId: string;
    totalBreachCount: number;
    activeBreachCount: number;
    reportedByProcessorCount: number;
    identifiedInternallyCount: number;
    hasCriticalOrHighBreaches: boolean;
    breaches: ProcessorBreachSummaryItem[];
}
/**
 * Summarizes the personal data breach history involving a specific processor profile.
 */
export declare function summarizeProcessorBreachHistory(processorProfileId: string, breaches: PersonalDataBreach[]): ProcessorBreachHistory;
export interface SystemProcessorLinkItem {
    processorProfileId: string;
    vendorId: string;
    engagementName?: string | null;
    processorRole: ProcessorRole;
    criticality: ProcessorCriticality;
    relationshipType: ProcessorSystemRelationshipType;
    relationshipDescription?: string | null;
    dpaSigned: boolean;
    isSpecialCategoryData: boolean;
}
export interface SystemProcessorView {
    systemAssetId: string;
    systemAssetName: string;
    assetType: string;
    criticality: string;
    dataClassification: string;
    processorCount: number;
    processors: SystemProcessorLinkItem[];
}
export interface ProcessorSystemLinkItem {
    systemAssetId: string;
    systemAssetName: string;
    assetType: string;
    criticality: string;
    dataClassification: string;
    relationshipType: ProcessorSystemRelationshipType;
    relationshipDescription?: string | null;
    containsPersonalData: boolean;
    containsSpecialCategoryData: boolean;
}
export interface ProcessorSystemView {
    processorProfileId: string;
    vendorId: string;
    processorRole: ProcessorRole;
    criticality: ProcessorCriticality;
    systemCount: number;
    systems: ProcessorSystemLinkItem[];
}
/**
 * Builds reverse visibility view: Processors used by a system asset.
 */
export declare function buildSystemProcessorView(system: SystemAsset, profiles: ProcessorProfile[]): SystemProcessorView;
/**
 * Builds reverse visibility view: Systems supported by a processor profile.
 */
export declare function buildProcessorSystemView(profile: ProcessorProfile, systems: SystemAsset[]): ProcessorSystemView;
export type DerivedProcessorRiskRuleCode = 'RESTRICTED_TRANSFER_NO_MECHANISM' | 'SCC_NO_EVIDENCE_ATTACHED' | 'TRANSFER_MECHANISM_EXPIRED_OR_REVIEW_OVERDUE' | 'HIGH_CRITICALITY_REVIEW_OVERDUE' | 'SUBPROCESSORS_NO_SUPPORTING_DOCS' | 'RESTRICTED_TRANSFER_MISSING_TIA' | 'SPECIAL_CATEGORY_MISSING_DPA';
export interface DerivedProcessorRiskFlag {
    ruleCode: DerivedProcessorRiskRuleCode;
    severity: 'low' | 'medium' | 'high' | 'critical';
    title: string;
    description: string;
    suggestedTreatment: string;
    inherentLikelihood: number;
    inherentImpact: number;
    inherentScore: number;
    entityType: 'processor_profile' | 'transfer_arrangement';
    entityId: string;
    processorProfileId: string;
    transferArrangementId?: string;
    isActionable: boolean;
}
export interface ProcessorRiskEvaluationSummary {
    processorProfileId: string;
    overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
    totalDerivedFlagsCount: number;
    criticalFlagsCount: number;
    highFlagsCount: number;
    mediumFlagsCount: number;
    lowFlagsCount: number;
    flags: DerivedProcessorRiskFlag[];
    linkedRiskIds: string[];
}
/**
 * Pure deterministic risk rule engine for processor and transfer arrangements.
 * Evaluates risk flags for compliance gaps, overdue reviews, missing safeguards, and missing evidence.
 */
export declare function evaluateProcessorRiskFlags(profile: ProcessorProfile, transfers?: TransferArrangement[], evidenceDocs?: Evidence[], asOfDate?: Date): ProcessorRiskEvaluationSummary;
export interface ProcessorReminderCandidate {
    id: string;
    reminderType: NotificationType;
    priority: NotificationPriority;
    title: string;
    message: string;
    sourceEntityType: 'processor_profile' | 'transfer_arrangement';
    sourceEntityId: string;
    processorProfileId: string;
    transferArrangementId?: string;
    targetRecipientRole?: 'privacy_manager' | 'compliance_manager' | 'security_manager';
    recipientUserId?: string | null;
    dueDate?: string | null;
    linkUrl: string;
}
export interface EvaluateRemindersOptions {
    windowDays?: number;
    asOfDate?: Date;
}
/**
 * Pure evaluator for periodic review reminders, DPA renewals, SCC checks, TIA deadlines, and missing evidence follow-ups.
 */
export declare function evaluateProcessorReminders(profile: ProcessorProfile, transfers?: TransferArrangement[], evidenceDocs?: Evidence[], options?: EvaluateRemindersOptions): ProcessorReminderCandidate[];
export interface ListProcessorInventoryInput {
    tenantId: string;
    status?: ProcessorStatus;
    criticality?: ProcessorCriticality;
    restrictedTransfer?: boolean;
    transferMechanismType?: TransferMechanismType;
    tiaStatus?: 'has_approved_tia' | 'has_in_review_tia' | 'missing_tia' | 'not_required';
    reviewStatus?: 'overdue' | 'due_soon_30d' | 'due_soon_90d' | 'on_track' | 'no_review_scheduled';
    missingEvidence?: boolean;
    destinationCountry?: string;
    linkedSystemAssetId?: string;
    searchQuery?: string;
    limit?: number;
    offset?: number;
}
export interface ProcessorInventoryItem {
    profile: ProcessorProfile;
    vendorName: string | null;
    vendorCategory: string | null;
    vendorRiskTier: string | null;
    transferArrangementsCount: number;
    hasRestrictedTransfer: boolean;
    destinationCountries: string[];
    transferMechanismTypes: TransferMechanismType[];
    tiaStatus: 'approved' | 'in_review' | 'missing' | 'not_required';
    linkedTiaIds: string[];
    linkedSystemAssetIds: string[];
    linkedSystemNames: string[];
    isReviewOverdue: boolean;
    reviewStatus: 'overdue' | 'due_soon_30d' | 'due_soon_90d' | 'on_track' | 'no_review_scheduled';
    evidenceCompleteness: {
        isComplete: boolean;
        missingCount: number;
        missingCategories: string[];
    };
    governanceRiskLevel: 'critical' | 'high' | 'medium' | 'low';
}
export interface ProcessorInventoryResponse {
    success: boolean;
    count: number;
    total: number;
    items: ProcessorInventoryItem[];
}
/**
 * Finds all processor certifications linked to a specific Control.
 * Checks both `cert.linkedControlIds` and `control.processorCertificationIds`.
 */
export declare function findProcessorCertificationsForControl(controlOrId: Control | string, certs: ProcessorCertification[]): ProcessorCertification[];
/**
 * Finds all Controls linked to a specific ProcessorCertification.
 * Checks both `cert.linkedControlIds` and `control.processorCertificationIds`.
 */
export declare function findControlsForProcessorCertification(certOrId: ProcessorCertification | string, controls: Control[]): Control[];
export interface ControlProcessorAssuranceItem {
    certificationId: string;
    processorProfileId: string;
    processorName: string;
    standardFamily: AssuranceStandardFamily;
    standardDisplayName: string;
    certificateOrReportNumber: string;
    status: ProcessorCertificationStatus;
    reviewStatus: ProcessorCertificationReviewStatus;
    validFrom: string;
    validUntil: string;
    isCurrent: boolean;
    isSufficient: boolean;
    hasAttachedEvidence: boolean;
    evidenceDocuments: Array<{
        id: string;
        title: string;
        category: EvidenceCategory;
        fileHashSha256: string | null;
    }>;
    unresolvedFindingsCount: number;
    hasMajorDeficiencies: boolean;
}
export interface SupportingProcessorAssuranceGroup {
    processorProfileId: string;
    engagementName: string;
    criticality: ProcessorCriticality;
    hasCurrentAssurance: boolean;
    certifications: ControlProcessorAssuranceItem[];
}
export interface ControlProcessorAssuranceSupport {
    controlId: string;
    controlCode: string;
    controlTitle: string;
    totalLinkedCertifications: number;
    validAssuranceCount: number;
    expiredAssuranceCount: number;
    hasSufficientAssurance: boolean;
    assuranceCoverageScore: number;
    supportingProcessorsCount: number;
    supportingProcessors: SupportingProcessorAssuranceGroup[];
    items: ControlProcessorAssuranceItem[];
}
/**
 * Evaluates the third-party assurance and evidence support context for a specific Control.
 * Calculates whether the control's vendor assurance expectations are satisfied by active, non-expired certifications.
 */
export declare function evaluateControlProcessorAssuranceSupport(control: Control, certs: ProcessorCertification[], evidenceDocs?: Evidence[], profiles?: ProcessorProfile[], asOfDate?: Date): ControlProcessorAssuranceSupport;
export interface ProcessorControlMatrixEntry {
    processorProfileId: string;
    engagementName: string;
    criticality: ProcessorCriticality;
    supportedControlsCount: number;
    validControlsCount: number;
    gapsCount: number;
    controlSupportMap: Record<string, {
        controlCode: string;
        controlTitle: string;
        hasCurrentAssurance: boolean;
        certificationIds: string[];
        standardFamilies: AssuranceStandardFamily[];
    }>;
}
/**
 * Builds a multi-processor to controls assurance matrix.
 * Visualizes which third-party processors provide verified assurance backing for each adopted tenant control.
 */
export declare function mapProcessorsToControlsAssuranceMatrix(profiles: ProcessorProfile[], certs: ProcessorCertification[], controls: Control[], evidenceDocs?: Evidence[], asOfDate?: Date): ProcessorControlMatrixEntry[];
export interface ProcessorAssuranceInventoryItem {
    certification: ProcessorCertification;
    processorProfile: {
        id: string;
        name: string;
        criticality: ProcessorCriticality;
        processorRole: ProcessorRole;
        serviceDescription: string;
        status: ProcessorStatus;
        ownerUserId?: string;
        vendorId?: string | null;
    };
    vendor: {
        id: string;
        name: string;
        riskTier?: string;
    } | null;
    validityStatus: 'valid_now' | 'expiring_soon' | 'expired' | 'superseded';
    daysUntilExpiry: number;
    isExpired: boolean;
    isExpiringSoon: boolean;
    isReviewOverdue: boolean;
    daysUntilReviewDue: number | null;
    isCriticalProcessor: boolean;
    hasAttachedEvidence: boolean;
    attachedEvidenceCount: number;
    attachedEvidenceSummaries: Array<{
        id: string;
        title: string;
        category: string;
        status: string;
        fileHashSha256?: string;
    }>;
    coveredSystemsCount: number;
    coveredSystems: string[];
    linkedSystemAssetIds: string[];
    linkedSystemNames: string[];
    isInsufficientOrRejected: boolean;
    gaps: Array<{
        code: string;
        description: string;
        severity: 'critical' | 'high' | 'medium' | 'low';
        suggestedAction: string;
    }>;
    completeness: ProcessorCertificationEvidenceCompleteness;
}
export interface ListProcessorAssuranceInventoryInput {
    tenantId: string;
    processorProfileId?: string;
    vendorId?: string;
    artifactKind?: AssuranceArtifactKind;
    standardFamily?: AssuranceStandardFamily;
    status?: ProcessorCertificationStatus;
    validityStatus?: 'valid_now' | 'expiring_soon' | 'expired' | 'all';
    reviewStatus?: ProcessorCertificationReviewStatus;
    criticalProcessorOnly?: boolean;
    issuerQuery?: string;
    issuingBodyOrAuditor?: string;
    linkedSystemAssetId?: string;
    coveredSystemOrService?: string;
    missingEvidenceOnly?: boolean;
    insufficientOrRejectedOnly?: boolean;
    searchQuery?: string;
    includeHistoric?: boolean;
    limit?: number;
    offset?: number;
}
export interface ProcessorAssuranceInventorySummary {
    totalAssuranceRecords: number;
    activeValidCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    supersededCount: number;
    criticalProcessorsCount: number;
    missingEvidenceCount: number;
    insufficientOrRejectedCount: number;
    pendingReviewCount: number;
    standardBreakdown: Record<string, number>;
}
export interface ProcessorAssuranceInventoryResponse {
    success: boolean;
    total: number;
    count: number;
    summary: ProcessorAssuranceInventorySummary;
    items: ProcessorAssuranceInventoryItem[];
}
/**
 * Synthesizes cross-entity correlated assurance inventory items from raw Firestore collections.
 */
export declare function synthesizeProcessorAssuranceInventory(certs: ProcessorCertification[], profiles: ProcessorProfile[], vendors?: Vendor[], assets?: SystemAsset[], evidenceList?: Evidence[], asOfDate?: Date): ProcessorAssuranceInventoryItem[];
/**
 * Pure filter evaluator for processor assurance inventory items.
 */
export declare function filterProcessorAssuranceInventory(items: ProcessorAssuranceInventoryItem[], filters: ListProcessorAssuranceInventoryInput): ProcessorAssuranceInventoryItem[];
/**
 * Calculates high-level summary KPIs for assurance inventory views.
 */
export declare function summarizeProcessorAssuranceInventory(items: ProcessorAssuranceInventoryItem[]): ProcessorAssuranceInventorySummary;
export interface BaseAssuranceExportOptions {
    tenantId: string;
    requestedBy: string;
    generatedAt?: string;
}
/**
 * 1. Processor Assurance Register Export Payload
 */
export interface ProcessorAssuranceRegisterExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'processor_assurance_register';
        title: string;
        generatedAt: string;
        requestedBy: string;
        totalAssuranceRecords: number;
        activeValidCount: number;
        expiringSoonCount: number;
        expiredCount: number;
        criticalProcessorsCount: number;
        missingEvidenceCount: number;
        insufficientOrRejectedCount: number;
    };
    summary: ProcessorAssuranceInventorySummary;
    records: Array<{
        certificationId: string;
        certificateOrReportNumber: string;
        standardFamily: AssuranceStandardFamily;
        standardDisplayName: string;
        artifactKind: AssuranceArtifactKind;
        artifactKindLabel: string;
        processorProfileId: string;
        processorName: string;
        processorRole: string;
        processorCriticality: string;
        vendorId: string | null;
        vendorName: string | null;
        vendorRiskTier: string | null;
        issuingBodyOrAuditor: string;
        leadAuditorName: string | null;
        validFrom: string;
        validUntil: string;
        reportPeriodStart: string | null;
        reportPeriodEnd: string | null;
        daysUntilExpiry: number;
        validityStatus: string;
        assuranceScopeSummary: string;
        legalEntityOrRegionalScope: string | null;
        systemsOrServicesCovered: string[];
        linkedSystemAssetNames: string[];
        reviewStatus: string;
        reviewOwnerUserId: string;
        reviewDueDate: string | null;
        reviewNotes: string | null;
        rejectionReason: string | null;
        insufficientRationale: string | null;
        isInsufficient: boolean;
        hasMajorDeficiencies: boolean;
        unresolvedFindingsCount: number;
        hasAttachedEvidence: boolean;
        attachedEvidenceCount: number;
        attachedEvidenceSummaries: Array<{
            id: string;
            title: string;
            category: string;
            status: string;
            fileHashSha256?: string;
        }>;
        gaps: Array<{
            code: string;
            description: string;
            suggestedAction: string;
        }>;
        isHistoricVersion: boolean;
        versionNumber: number;
    }>;
}
export declare function generateProcessorAssuranceRegisterExportPayload(items: ProcessorAssuranceInventoryItem[], options: BaseAssuranceExportOptions): ProcessorAssuranceRegisterExportPayload;
/**
 * 2. Expiring Certifications Report Payload
 */
export interface ProcessorExpiringCertificationsExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'processor_expiring_certifications_report';
        title: string;
        generatedAt: string;
        requestedBy: string;
        expiryWindowDays: number;
        expiringCertificationsCount: number;
    };
    expiringCertifications: Array<{
        certificationId: string;
        certificateOrReportNumber: string;
        standardDisplayName: string;
        artifactKindLabel: string;
        processorName: string;
        processorCriticality: string;
        vendorName: string | null;
        issuingBodyOrAuditor: string;
        validUntil: string;
        daysUntilExpiry: number;
        reviewOwnerUserId: string;
        reviewDueDate: string | null;
        hasAttachedEvidence: boolean;
        actionRequired: string;
    }>;
}
export declare function generateProcessorExpiringCertificationsExportPayload(items: ProcessorAssuranceInventoryItem[], options: BaseAssuranceExportOptions & {
    expiryWindowDays?: number;
}): ProcessorExpiringCertificationsExportPayload;
/**
 * 3. Expired / Insufficient Assurance Report Payload
 */
export interface ProcessorExpiredInsufficientAssuranceExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'processor_expired_insufficient_assurance_report';
        title: string;
        generatedAt: string;
        requestedBy: string;
        totalDeficienciesCount: number;
        expiredCount: number;
        rejectedCount: number;
        insufficientCount: number;
        missingEvidenceCount: number;
    };
    deficiencies: Array<{
        certificationId: string;
        certificateOrReportNumber: string;
        standardDisplayName: string;
        processorName: string;
        processorCriticality: string;
        vendorName: string | null;
        deficiencyType: 'expired' | 'rejected' | 'insufficient' | 'missing_evidence';
        reasonOrRationale: string;
        validUntil: string;
        reviewOwnerUserId: string;
        gaps: Array<{
            code: string;
            description: string;
            suggestedAction: string;
        }>;
        remediationAction: string;
    }>;
}
export declare function generateProcessorExpiredInsufficientAssuranceExportPayload(items: ProcessorAssuranceInventoryItem[], options: BaseAssuranceExportOptions): ProcessorExpiredInsufficientAssuranceExportPayload;
/**
 * 4. Processor-by-Certification-Type Matrix Export Payload
 */
export interface ProcessorByCertificationTypeMatrixExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'processor_by_certification_type_matrix';
        title: string;
        generatedAt: string;
        requestedBy: string;
        totalProcessors: number;
        standardsEvaluatedCount: number;
    };
    standardCatalog: Array<{
        standardFamily: AssuranceStandardFamily;
        displayName: string;
        description: string;
    }>;
    matrix: Array<{
        processorProfileId: string;
        processorName: string;
        processorRole: string;
        criticality: string;
        vendorName: string | null;
        totalActiveCertifications: number;
        coverageByStandard: Record<string, {
            covered: boolean;
            status: 'active_valid' | 'expiring_soon' | 'expired' | 'missing' | 'insufficient';
            certificateOrReportNumber?: string;
            validUntil?: string;
            daysUntilExpiry?: number;
            hasAttachedEvidence?: boolean;
        }>;
    }>;
    standardAdoptionRates: Record<string, {
        totalHoldingProcessors: number;
        adoptionPercentage: number;
    }>;
}
export declare function generateProcessorByCertificationTypeMatrixExportPayload(profiles: ProcessorProfile[], certifications: ProcessorCertification[], vendors: Vendor[], options: BaseAssuranceExportOptions): ProcessorByCertificationTypeMatrixExportPayload;
/**
 * 5. Assurance Coverage by Linked Systems/Services Export Payload
 */
export interface ProcessorAssuranceCoverageBySystemsExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'processor_assurance_coverage_by_systems';
        title: string;
        generatedAt: string;
        requestedBy: string;
        totalSystemsEvaluated: number;
        compliantSystemsCount: number;
        warningSystemsCount: number;
        criticalGapSystemsCount: number;
    };
    systemCoverage: Array<{
        systemAssetId: string;
        systemName: string;
        assetType: string;
        systemCriticality: string;
        dataClassification: string;
        containsPersonalData: boolean;
        linkedProcessorsCount: number;
        overallSystemAssuranceStatus: 'compliant' | 'warning' | 'critical_gap' | 'no_processors';
        processors: Array<{
            processorProfileId: string;
            processorName: string;
            criticality: string;
            activeCertifications: Array<{
                certificationId: string;
                standardDisplayName: string;
                certificateOrReportNumber: string;
                validUntil: string;
                hasAttachedEvidence: boolean;
                coversThisSystemExplicitly: boolean;
            }>;
            processorAssuranceHealth: 'active_valid' | 'expiring_soon' | 'expired' | 'no_assurance';
        }>;
        gapsIdentified: string[];
    }>;
}
export declare function generateProcessorAssuranceCoverageBySystemsExportPayload(systemAssets: SystemAsset[], profiles: ProcessorProfile[], certifications: ProcessorCertification[], _vendors: Vendor[], options: BaseAssuranceExportOptions): ProcessorAssuranceCoverageBySystemsExportPayload;
/**
 * 6. Critical Processors Missing Current Assurance Export Payload
 */
export interface CriticalProcessorsMissingAssuranceExportPayload {
    exportHeader: {
        tenantId: string;
        exportType: 'critical_processors_missing_assurance';
        title: string;
        generatedAt: string;
        requestedBy: string;
        totalCriticalProcessorsCount: number;
        criticalProcessorsAtRiskCount: number;
        nonComplianceRatePercentage: number;
    };
    criticalProcessorsAtRisk: Array<{
        processorProfileId: string;
        processorName: string;
        processorRole: string;
        serviceDescription: string;
        dataCategories: string[];
        jurisdictions: string[];
        vendorName: string | null;
        vendorRiskTier: string | null;
        riskCategory: 'no_certifications' | 'all_expired' | 'review_rejected' | 'missing_evidence';
        findingsSummary: string;
        urgentRemediationAction: string;
    }>;
}
export declare function generateCriticalProcessorsMissingAssuranceExportPayload(profiles: ProcessorProfile[], certifications: ProcessorCertification[], vendors: Vendor[], _evidenceList: Evidence[], options: BaseAssuranceExportOptions): CriticalProcessorsMissingAssuranceExportPayload;
//# sourceMappingURL=processors.d.ts.map
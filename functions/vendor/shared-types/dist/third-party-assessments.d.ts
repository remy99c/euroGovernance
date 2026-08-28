import { BaseEntity } from './core.js';
import { AssessmentQuestionOption, AssessmentRiskTier, AssessmentRecurrenceCadence } from './processor-assessments.js';
import { AssessmentQuestionType } from './questionnaire-engine.js';
export type QuestionnaireTemplateCategory = 'gdpr_article_28' | 'iso_27001_supplier' | 'eu_ai_act_provider' | 'security_toms' | 'schrems_ii_importer' | 'nis2_supply_chain' | 'general_due_diligence' | 'custom';
export type QuestionnaireTemplateStatus = 'draft' | 'published' | 'archived' | 'deprecated';
export type QuestionnaireTargetScope = 'prospective_vendor' | 'existing_processor' | 'subprocessor' | 'any';
export interface QuestionnaireQuestion {
    id: string;
    tenantId: string;
    templateId: string;
    sectionId: string;
    code: string;
    title: string;
    description?: string;
    questionType: AssessmentQuestionType;
    required: boolean;
    weight: number;
    sortOrder: number;
    options?: AssessmentQuestionOption[];
    requiresEvidence?: boolean;
    acceptedEvidenceCategories?: string[];
    guidanceNotes?: string;
    statutoryCitations?: string[];
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface QuestionnaireSection {
    id: string;
    tenantId: string;
    templateId: string;
    code: string;
    title: string;
    description?: string;
    sortOrder: number;
    weight: number;
    passingThresholdPercent?: number;
    questions: QuestionnaireQuestion[];
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
/**
 * Tenant-Scoped Questionnaire Template
 * /tenants/{tenantId}/questionnaire_templates/{templateId}
 */
export interface QuestionnaireTemplate extends BaseEntity {
    code: string;
    title: string;
    description: string;
    version: string;
    status: QuestionnaireTemplateStatus;
    category: QuestionnaireTemplateCategory;
    targetScope: QuestionnaireTargetScope;
    passingScoreThreshold: number;
    defaultValidDays: number;
    defaultRecurrenceCadence: AssessmentRecurrenceCadence;
    sectionCount: number;
    questionCount: number;
    isSystemDefault: boolean;
    sections: QuestionnaireSection[];
    tags?: string[];
    createdBy: string;
    updatedBy: string;
}
export type AssessmentTargetType = 'prospective_vendor' | 'existing_vendor' | 'active_processor' | 'subprocessor';
export type AssessmentRequestType = 'one_time_due_diligence' | 'recurring_periodic_review' | 'incident_investigation' | 'custom_deep_dive';
export type AssessmentRequestStatus = 'draft' | 'sent' | 'dispatched' | 'opened' | 'in_progress' | 'submitted' | 'under_review' | 'revision_requested' | 'accepted' | 'rejected' | 'expired' | 'canceled' | 'superseded';
/**
 * Validates whether a state transition is permitted in the assessment request lifecycle.
 */
export declare function isValidRequestStateTransition(fromState: AssessmentRequestStatus, toState: AssessmentRequestStatus): boolean;
export interface AssessmentRespondentContact {
    name: string;
    email: string;
    title?: string;
    companyName: string;
    phone?: string;
}
export interface TemplateSnapshotHeader {
    templateId: string;
    templateCode: string;
    title: string;
    version: string;
    passingScoreThreshold: number;
    sectionsCount: number;
    questionsCount: number;
}
/**
 * Third-Party Assessment Campaign (Batch / Group Campaign)
 * /tenants/{tenantId}/assessment_campaigns/{campaignId}
 */
export interface ThirdPartyAssessmentCampaign extends BaseEntity {
    title: string;
    description: string;
    templateId: string;
    templateSnapshot: TemplateSnapshotHeader;
    campaignType: 'annual_audit_cycle' | 'gdpr_subprocessor_review' | 'prospective_vendor_screening' | 'ad_hoc';
    status: 'draft' | 'active' | 'completed' | 'archived';
    dueDate: string;
    targetCount: number;
    dispatchedCount: number;
    submittedCount: number;
    acceptedCount: number;
    rejectedCount: number;
    overdueCount: number;
    ownerUserId: string;
    tags?: string[];
    createdBy: string;
    updatedBy: string;
}
/**
 * Individual Third-Party Assessment Request
 * /tenants/{tenantId}/assessment_requests/{requestId}
 *
 * Supports both:
 * 1. Prospective Third Parties (no existing vendorId / processorProfileId)
 * 2. Existing Onboarded Vendors & Processors
 */
export interface ThirdPartyAssessmentRequest extends BaseEntity {
    title: string;
    campaignId?: string | null;
    templateId: string;
    templateSnapshot: QuestionnaireTemplate;
    targetType: AssessmentTargetType;
    thirdPartyName: string;
    vendorId?: string | null;
    processorProfileId?: string | null;
    prospectCompanyName?: string | null;
    prospectWebsite?: string | null;
    respondent: AssessmentRespondentContact;
    accessTokenHash?: string | null;
    tokenExpiresAt?: string | null;
    accessCount: number;
    lastAccessedAt?: string | null;
    requestType: AssessmentRequestType;
    status: AssessmentRequestStatus;
    dueDate: string;
    dispatchedAt?: string | null;
    startedAt?: string | null;
    submittedAt?: string | null;
    activeSubmissionId?: string | null;
    isRecurring: boolean;
    recurrenceCadence: AssessmentRecurrenceCadence;
    recurrenceScheduleId?: string | null;
    previousRequestId?: string | null;
    renewalRequestId?: string | null;
    nextDueDate?: string | null;
    ownerUserId: string;
    linkedSystemAssetIds: string[];
    linkedControlIds: string[];
    linkedEvidenceIds: string[];
    linkedRiskIds: string[];
    finalScorePercent?: number | null;
    respondentScorePercent?: number | null;
    respondentPassedThreshold?: boolean | null;
    overallRiskRating?: AssessmentRiskTier | null;
    isCompliant?: boolean | null;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    createdBy: string;
    updatedBy: string;
}
export type RecurringScheduleStatus = 'active' | 'paused' | 'terminated';
/**
 * Recurring Assessment Schedule
 * /tenants/{tenantId}/recurring_schedules/{scheduleId}
 */
export interface RecurringAssessmentSchedule extends BaseEntity {
    title: string;
    templateId: string;
    targetType: 'vendor' | 'processor_profile';
    vendorId?: string | null;
    processorProfileId?: string | null;
    thirdPartyName: string;
    contact: AssessmentRespondentContact;
    cadence: AssessmentRecurrenceCadence;
    leadTimeDays: number;
    autoDispatch: boolean;
    status: RecurringScheduleStatus;
    lastAssessmentRequestId?: string | null;
    lastAssessmentCompletedAt?: string | null;
    nextScheduledDispatchDate: string;
    nextAssessmentDueDate: string;
    linkedControlIds?: string[];
    ownerUserId: string;
    createdBy: string;
    updatedBy: string;
}
export interface AssessmentAnswerItem {
    questionId: string;
    questionCode: string;
    sectionId: string;
    value: string | string[] | boolean | number | null;
    comment?: string;
    attachedEvidenceIds: string[];
    attachedFileMetadata?: Array<{
        fileName: string;
        fileSizeBytes: number;
        mimeType: string;
        storagePath: string;
        fileHashSha256?: string;
    }>;
    calculatedScore?: number;
    reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
    reviewerComment?: string;
    updatedAt: string;
}
export type SubmissionStatus = 'draft_saved' | 'submitted' | 'under_review' | 'revision_pending' | 'reviewed';
/**
 * External Assessment Submission
 * /tenants/{tenantId}/assessment_submissions/{submissionId}
 */
export interface ExternalAssessmentSubmission extends BaseEntity {
    requestId: string;
    templateId: string;
    targetType: AssessmentTargetType;
    vendorId?: string | null;
    processorProfileId?: string | null;
    thirdPartyName: string;
    status: SubmissionStatus;
    submittedBy: {
        name: string;
        email: string;
        title?: string;
        companyName: string;
        submittedAt: string;
    };
    computedScorePercent: number;
    isPassingThreshold: boolean;
    sectionScores: Record<string, {
        sectionTitle: string;
        earnedPoints: number;
        possiblePoints: number;
        scorePercent: number;
    }>;
    answers: Record<string, AssessmentAnswerItem>;
    unansweredRequiredCount: number;
    totalQuestionsCount: number;
    answeredQuestionsCount: number;
    ipAddressMasked?: string | null;
    userAgent?: string | null;
    createdBy: string;
    updatedBy: string;
}
export type SubmissionReviewDecision = 'accept' | 'reject' | 'request_revision';
export interface QuestionReviewFinding {
    questionId: string;
    questionCode: string;
    flag: 'ok' | 'concern' | 'gap' | 'critical_finding';
    reviewerNotes?: string;
    remediationRequired?: boolean;
}
/**
 * Submission Review Sign-off Document
 * /tenants/{tenantId}/submission_reviews/{reviewId}
 */
export interface SubmissionReview extends BaseEntity {
    submissionId: string;
    requestId: string;
    vendorId?: string | null;
    processorProfileId?: string | null;
    thirdPartyName: string;
    decision: SubmissionReviewDecision;
    finalScorePercent: number;
    determinedRiskTier: AssessmentRiskTier;
    isCompliant: boolean;
    rejectionReason?: string | null;
    revisionInstructions?: string | null;
    internalNotes?: string | null;
    remediationActionPlan?: string | null;
    questionFindings: Record<string, QuestionReviewFinding>;
    derivedRiskFlagIds: string[];
    generatedEvidenceIds: string[];
    reviewerUserId: string;
    reviewerEmail: string;
    reviewedAt: string;
    createdBy: string;
    updatedBy: string;
}
export interface ValidationResult {
    valid: boolean;
    errors: string[];
}
export declare function validateQuestionnaireTemplate(input: unknown): ValidationResult;
export declare function validateThirdPartyAssessmentRequest(input: unknown): ValidationResult;
export declare function validateRecurringAssessmentSchedule(input: unknown): ValidationResult;
export declare function validateExternalAssessmentSubmission(input: unknown): ValidationResult;
export declare function validateSubmissionReview(input: unknown): ValidationResult;
export type ControlAssessmentSatisfactionStatus = 'satisfied' | 'expired' | 'missing' | 'non_compliant' | 'under_review';
export interface ControlAssessmentSatisfactionResult {
    controlId: string;
    isSatisfied: boolean;
    satisfactionStatus: ControlAssessmentSatisfactionStatus;
    latestAssessmentRequestId?: string | null;
    latestAssessmentTitle?: string | null;
    latestAssessmentScorePercent?: number | null;
    latestAssessmentCompletedAt?: string | null;
    daysSinceAssessment?: number | null;
    daysUntilExpiry?: number | null;
    isExpired: boolean;
    supportingVendorNames: string[];
    supportingEvidenceIds: string[];
    explanation: string;
}
export interface ControlAssessmentTraceabilityRecord {
    controlId: string;
    controlCode: string;
    controlTitle: string;
    recurringScheduleId?: string | null;
    recurringCadence?: AssessmentRecurrenceCadence | null;
    assessmentRequestId: string;
    assessmentTitle: string;
    thirdPartyName: string;
    vendorId?: string | null;
    processorProfileId?: string | null;
    submissionId: string;
    submissionDate: string;
    reviewId?: string | null;
    reviewDecision?: SubmissionReviewDecision | null;
    reviewerEmail?: string | null;
    reviewedAt?: string | null;
    evidenceIds: string[];
    isCompliant: boolean;
    finalScorePercent: number;
    satisfactionStatus: ControlAssessmentSatisfactionStatus;
}
/**
 * Evaluates whether a control is satisfied by linked third-party assessment requests.
 * Evaluates review acceptance, compliance score, and validity window.
 */
export declare function evaluateControlAssessmentSatisfaction(controlId: string, linkedRequests: ThirdPartyAssessmentRequest[], options?: {
    maxValidityDays?: number;
    nowDate?: Date;
}): ControlAssessmentSatisfactionResult;
export interface ThirdPartyAssessmentSummaryMetrics {
    id: string;
    tenantId: string;
    totalRequestsCount: number;
    outstandingRequestsCount: number;
    submittedWaitingReviewCount: number;
    acceptedAssessmentsCount: number;
    rejectedOrFollowUpCount: number;
    overdueResponsesCount: number;
    overdueRecurringSchedulesCount: number;
    criticalProcessorAssessmentsCount: number;
    controlEvidenceAssessmentsCount: number;
    averageComplianceScorePercent: number;
    riskTierDistribution: {
        critical: number;
        high: number;
        medium: number;
        low: number;
        unrated: number;
    };
    lastMaterializedAt: string;
}
export interface ThirdPartyAssessmentFilterOptions {
    viewPreset?: 'all' | 'outstanding' | 'waiting_review' | 'accepted' | 'follow_up_needed' | 'overdue' | 'critical_processors' | 'control_evidence';
    status?: AssessmentRequestStatus[];
    targetType?: AssessmentTargetType;
    riskTier?: AssessmentRiskTier[];
    vendorId?: string;
    processorProfileId?: string;
    linkedControlId?: string;
    isCriticalProcessor?: boolean;
    hasControlEvidence?: boolean;
    searchTerm?: string;
}
/**
 * Deterministically aggregates summary metrics for third-party assessments across the tenant.
 */
export declare function calculateThirdPartyAssessmentSummaryMetrics(tenantId: string, requests: ThirdPartyAssessmentRequest[], schedules?: RecurringAssessmentSchedule[], options?: {
    criticalProcessorProfileIds?: string[];
    criticalVendorIds?: string[];
    nowDate?: Date;
}): ThirdPartyAssessmentSummaryMetrics;
/**
 * In-memory filter implementation matching Firestore index capabilities.
 */
export declare function filterThirdPartyAssessments(requests: ThirdPartyAssessmentRequest[], filters: ThirdPartyAssessmentFilterOptions, options?: {
    criticalProcessorProfileIds?: string[];
    criticalVendorIds?: string[];
    nowDate?: Date;
}): ThirdPartyAssessmentRequest[];
export interface BaseExportHeader {
    exportType: string;
    title: string;
    generatedAt: string;
    tenantId: string;
    totalRecords: number;
}
export declare function generateThirdPartyAssessmentInventoryExportPayload(requests: ThirdPartyAssessmentRequest[], options: {
    tenantId: string;
    asOfDate?: Date;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    assessments: {
        requestId: string;
        title: string;
        targetType: AssessmentTargetType;
        thirdPartyName: string;
        vendorId: string | null;
        processorProfileId: string | null;
        respondentName: string;
        respondentEmail: string;
        status: AssessmentRequestStatus;
        dueDate: string;
        finalScorePercent: number | null;
        overallRiskRating: AssessmentRiskTier | null;
        isCompliant: boolean | null;
        reviewedBy: string | null;
        reviewedAt: string | null;
        linkedControlIds: string[];
        linkedEvidenceIds: string[];
        linkedRiskIds: string[];
        createdAt: string;
        updatedAt: string;
    }[];
};
export declare function generateLatestAcceptedAssessmentRegisterExportPayload(requests: ThirdPartyAssessmentRequest[], options: {
    tenantId: string;
    asOfDate?: Date;
    maxValidityDays?: number;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    latestAssessments: {
        requestId: string;
        thirdPartyName: string;
        vendorId: string | null;
        processorProfileId: string | null;
        assessmentTitle: string;
        finalScorePercent: number;
        overallRiskRating: AssessmentRiskTier;
        reviewedBy: string | null;
        reviewedAt: string;
        daysSinceCompletion: number;
        daysRemainingValidity: number;
        isExpired: boolean;
        supportingEvidenceIds: string[];
    }[];
};
export declare function generateOverdueRecurringAssessmentsExportPayload(requests: ThirdPartyAssessmentRequest[], schedules: RecurringAssessmentSchedule[], options: {
    tenantId: string;
    asOfDate?: Date;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    overdueRequests: {
        itemType: string;
        id: string;
        title: string;
        thirdPartyName: string;
        respondentEmail: string;
        dueDate: string;
        daysOverdue: number;
        ownerUserId: string;
    }[];
    overdueSchedules: {
        itemType: string;
        id: string;
        title: string;
        thirdPartyName: string;
        respondentEmail: string;
        dueDate: string;
        daysOverdue: number;
        cadence: AssessmentRecurrenceCadence;
        ownerUserId: string;
    }[];
};
export declare function generateAssessmentControlAssuranceExportPayload(requests: ThirdPartyAssessmentRequest[], options: {
    tenantId: string;
    asOfDate?: Date;
    maxValidityDays?: number;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    controlAssuranceMappings: {
        controlId: string;
        assessmentRequestId: string;
        assessmentTitle: string;
        thirdPartyName: string;
        status: AssessmentRequestStatus;
        scorePercent: number | null;
        satisfactionStatus: ControlAssessmentSatisfactionStatus;
        isSatisfied: boolean;
        isExpired: boolean;
        supportingEvidenceIds: string[];
        reviewedAt: string | null;
        explanation: string;
    }[];
};
export declare function generateAssessmentOpenFollowUpsExportPayload(requests: ThirdPartyAssessmentRequest[], options: {
    tenantId: string;
    asOfDate?: Date;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    followUpItems: {
        requestId: string;
        title: string;
        thirdPartyName: string;
        status: AssessmentRequestStatus;
        overallRiskRating: string;
        finalScorePercent: number | null;
        dueDate: string;
        ownerUserId: string;
        linkedRiskIds: string[];
        reviewedBy: string | null;
        reviewedAt: string | null;
    }[];
};
export declare function generateProspectAssessmentsUnlinkedExportPayload(requests: ThirdPartyAssessmentRequest[], options: {
    tenantId: string;
    asOfDate?: Date;
}): {
    exportHeader: {
        exportType: string;
        title: string;
        generatedAt: string;
        tenantId: string;
        totalRecords: number;
    };
    prospectAssessments: {
        requestId: string;
        title: string;
        prospectCompanyName: string;
        prospectWebsite: string | null;
        respondentName: string;
        respondentEmail: string;
        status: AssessmentRequestStatus;
        finalScorePercent: number | null;
        overallRiskRating: AssessmentRiskTier | null;
        dueDate: string;
        ownerUserId: string;
        createdAt: string;
    }[];
};
//# sourceMappingURL=third-party-assessments.d.ts.map
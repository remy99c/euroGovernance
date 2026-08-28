import { BaseEntity } from './core.js';
export type ProcessorAssessmentType = 'pre_contract_due_diligence' | 'periodic_assurance_review' | 'security_posture_deep_dive' | 'ai_supplier_governance' | 'cross_border_transfer_diligence' | 'incident_followup';
export type ProcessorAssessmentStatus = 'draft' | 'sent' | 'in_progress' | 'submitted' | 'under_review' | 'revision_requested' | 'accepted' | 'rejected' | 'expired' | 'superseded';
export type AssessmentRecurrenceCadence = 'none' | 'quarterly' | 'semi_annual' | 'annual' | 'biennial';
export type AssessmentRiskTier = 'critical' | 'high' | 'medium' | 'low';
export type QuestionType = 'text' | 'textarea' | 'single_select' | 'multi_select' | 'boolean' | 'file_upload' | 'rating_scale';
export interface AssessmentQuestionOption {
    label: string;
    value: string;
    score: number;
    isRiskTrigger?: boolean;
    riskCode?: string;
    riskSeverity?: AssessmentRiskTier;
    riskRationale?: string;
}
export interface ProcessorAssessmentQuestion {
    id: string;
    sectionId: string;
    code: string;
    title: string;
    description?: string;
    type: QuestionType;
    options?: AssessmentQuestionOption[];
    required: boolean;
    weight: number;
    applicableFrameworks: Array<'gdpr' | 'iso_27001' | 'iso_27701' | 'eu_ai_act' | 'dora' | 'nis2'>;
    gdprArticleCitation?: string;
    guidanceForRespondent?: string;
    requiresEvidenceAttachment?: boolean;
}
export interface ProcessorAssessmentSection {
    id: string;
    title: string;
    description: string;
    order: number;
    weight: number;
    questions: ProcessorAssessmentQuestion[];
}
export interface ProcessorAssessmentTemplate {
    id: string;
    code: string;
    name: string;
    assessmentType: ProcessorAssessmentType;
    description: string;
    version: string;
    targetRole: 'data_processor' | 'subprocessor' | 'ai_provider' | 'cloud_infrastructure' | 'general_vendor';
    sections: ProcessorAssessmentSection[];
    passingScoreThreshold: number;
}
export interface ProcessorAssessmentAnswer {
    questionId: string;
    value: string | string[] | boolean | number | null;
    comment?: string;
    attachedEvidenceIds: string[];
    attachedFileNames?: string[];
    calculatedScore?: number;
    reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
    reviewerComment?: string;
    updatedAt: string;
}
export interface ExternalRespondentContact {
    name: string;
    email: string;
    title?: string;
    companyName?: string;
    phone?: string;
}
/**
 * Main Processor Assessment Document Entity
 * /tenants/{tenantId}/processor_assessments/{assessmentId}
 */
export interface ProcessorAssessment extends BaseEntity {
    title: string;
    assessmentType: ProcessorAssessmentType;
    templateId?: string;
    templateCode?: string;
    vendorId?: string;
    vendorName: string;
    processorProfileId?: string;
    processorEngagementName?: string;
    transferArrangementId?: string;
    linkedSystemAssetIds: string[];
    linkedControlIds: string[];
    linkedEvidenceIds: string[];
    linkedRiskRegisterIds: string[];
    isRecurring: boolean;
    recurrenceCadence: AssessmentRecurrenceCadence;
    previousAssessmentId?: string;
    renewalAssessmentId?: string;
    nextDueDate?: string | null;
    respondent: ExternalRespondentContact;
    accessTokenHash?: string;
    tokenExpiresAt?: string;
    accessCount: number;
    lastAccessedAt?: string | null;
    magicLinkSentAt?: string | null;
    status: ProcessorAssessmentStatus;
    sentAt?: string | null;
    startedAt?: string | null;
    submittedAt?: string | null;
    dueDate: string;
    reviewOwnerUserId: string;
    reviewedBy?: string | null;
    reviewedAt?: string | null;
    reviewNotes?: string | null;
    rejectionReason?: string | null;
    revisionRequestNotes?: string | null;
    overallScorePercent?: number | null;
    overallRiskRating?: AssessmentRiskTier | null;
    isCompliant?: boolean | null;
    sections: ProcessorAssessmentSection[];
    answers: Record<string, ProcessorAssessmentAnswer>;
}
export interface AssessmentRiskFlag {
    id: string;
    assessmentId: string;
    processorProfileId?: string;
    vendorId?: string;
    ruleCode: string;
    severity: AssessmentRiskTier;
    title: string;
    description: string;
    suggestedRemediation: string;
    questionId?: string;
    questionCode?: string;
    isActionable: boolean;
    dedupKey: string;
}
export declare const CANONICAL_ASSESSMENT_TEMPLATES: readonly ProcessorAssessmentTemplate[];
/**
 * Calculates deterministic overall compliance percentage score for an assessment.
 */
export declare function calculateProcessorAssessmentScore(assessment: Pick<ProcessorAssessment, 'sections' | 'answers'>): {
    overallScore: number;
    sectionScores: Record<string, number>;
    isPassing: boolean;
};
/**
 * Derives actionable compliance risk flags from assessment answers and status.
 */
export declare function evaluateProcessorAssessmentRiskFlags(assessment: ProcessorAssessment, asOfDate?: Date): AssessmentRiskFlag[];
/**
 * Pure evaluator for assessment reminder notifications.
 */
export interface AssessmentReminderCandidate {
    assessmentId: string;
    vendorId?: string;
    vendorName: string;
    reminderType: 'processor_assessment_review_due' | 'processor_assessment_overdue' | 'processor_assessment_recurring_due';
    priority: 'low' | 'medium' | 'high' | 'urgent';
    targetUserId: string;
    title: string;
    message: string;
    actionUrl: string;
    dedupKey: string;
}
export declare function evaluateProcessorAssessmentReminders(assessments: ProcessorAssessment[], asOfDate?: Date): AssessmentReminderCandidate[];
export interface ProcessorAssessmentReportExportPayload {
    exportHeader: {
        exportType: 'processor_assessment_report';
        title: string;
        generatedAt: string;
        tenantId: string;
        assessmentCount: number;
    };
    assessments: Array<{
        assessmentId: string;
        title: string;
        assessmentType: ProcessorAssessmentType;
        status: ProcessorAssessmentStatus;
        vendorName: string;
        respondentEmail: string;
        scorePercent: number | null;
        riskRating: AssessmentRiskTier | null;
        dueDate: string;
        submittedAt: string | null;
        reviewedBy: string | null;
        reviewedAt: string | null;
        sectionsSummary: Array<{
            title: string;
            score: number;
        }>;
        riskFlags: AssessmentRiskFlag[];
    }>;
}
export declare function generateProcessorAssessmentReportPayload(assessments: ProcessorAssessment[], options: {
    tenantId: string;
    asOfDate?: Date;
}): ProcessorAssessmentReportExportPayload;
export interface ProcessorAssessmentSummaryMatrixPayload {
    exportHeader: {
        exportType: 'processor_assessment_summary_matrix';
        title: string;
        generatedAt: string;
        tenantId: string;
        totalAssessments: number;
        completedCount: number;
        overdueCount: number;
    };
    matrix: Array<{
        vendorName: string;
        assessmentType: string;
        status: string;
        score: number;
        riskTier: string;
        isRecurring: boolean;
        cadence: string;
        dueDate: string;
        submittedDate: string;
        reviewer: string;
        openRisksCount: number;
    }>;
}
export declare function generateProcessorAssessmentSummaryMatrixPayload(assessments: ProcessorAssessment[], options: {
    tenantId: string;
    asOfDate?: Date;
}): ProcessorAssessmentSummaryMatrixPayload;
//# sourceMappingURL=processor-assessments.d.ts.map
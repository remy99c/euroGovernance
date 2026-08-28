import { AssessmentRiskTier } from './processor-assessments.js';
import type { AssessmentAnswerItem } from './third-party-assessments.js';
export type AssessmentQuestionType = 'yes_no' | 'boolean' | 'single_select' | 'multi_select' | 'text' | 'textarea' | 'numeric' | 'date' | 'file_upload' | 'rating_scale';
export declare const VALID_QUESTION_TYPES: readonly AssessmentQuestionType[];
export interface QuestionOption {
    id?: string;
    label: string;
    value: string;
    score: number;
    isRiskTrigger?: boolean;
    riskCode?: string;
    riskSeverity?: AssessmentRiskTier;
    riskRationale?: string;
    description?: string;
}
export type ConditionalOperator = 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'contains_any' | 'greater_than' | 'less_than' | 'greater_or_equal' | 'less_or_equal' | 'is_truthy' | 'is_falsy' | 'is_empty' | 'is_not_empty';
export type ConditionalAction = 'show' | 'hide' | 'require' | 'make_optional';
export interface ConditionalVisibilityRule {
    id?: string;
    dependsOnQuestionId: string;
    operator: ConditionalOperator;
    targetValue?: string | string[] | number | boolean | null;
    action: ConditionalAction;
}
export type RiskTriggerOperator = 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'contains_any' | 'greater_than' | 'less_than' | 'is_falsy' | 'is_empty';
export interface RiskTriggerRule {
    id?: string;
    operator: RiskTriggerOperator;
    triggerValue?: string | string[] | number | boolean | null;
    riskCode: string;
    riskTitle: string;
    riskSeverity: AssessmentRiskTier;
    riskCategory: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
    suggestedRemediation: string;
    statutoryCitation?: string;
}
export interface TriggeredRiskFlag {
    questionId: string;
    questionCode: string;
    riskCode: string;
    riskTitle: string;
    riskSeverity: AssessmentRiskTier;
    riskCategory: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
    answerValue: unknown;
    suggestedRemediation: string;
    statutoryCitation?: string;
}
export interface NumericScoreRange {
    min?: number;
    max?: number;
    score: number;
    label?: string;
}
export interface QuestionScoringConfig {
    weight: number;
    maxPoints?: number;
    passingThresholdScore?: number;
    numericRanges?: NumericScoreRange[];
    evidenceBonusPoints?: number;
    evidencePenaltyWhenMissing?: number;
}
export interface NumericConstraints {
    min?: number;
    max?: number;
    step?: number;
    unit?: string;
}
export interface DateConstraints {
    minDate?: string;
    maxDate?: string;
    allowPast?: boolean;
    allowFuture?: boolean;
}
export interface FileUploadConstraints {
    acceptedFileTypes?: string[];
    maxSizeBytes?: number;
    acceptedEvidenceCategories?: string[];
}
export interface RatingScaleConstraints {
    minRating: number;
    maxRating: number;
    minLabel?: string;
    maxLabel?: string;
}
/**
 * Rich Questionnaire Question Specification
 */
export interface DynamicQuestionnaireQuestion {
    id: string;
    tenantId: string;
    templateId: string;
    sectionId: string;
    code: string;
    title: string;
    description?: string;
    guidanceNotes?: string;
    questionType: AssessmentQuestionType;
    required: boolean;
    sortOrder: number;
    scoring: QuestionScoringConfig;
    options?: QuestionOption[];
    numericConstraints?: NumericConstraints;
    dateConstraints?: DateConstraints;
    fileConstraints?: FileUploadConstraints;
    ratingConstraints?: RatingScaleConstraints;
    requiresEvidence?: boolean;
    acceptedEvidenceCategories?: string[];
    conditionalRules?: ConditionalVisibilityRule[];
    riskTriggers?: RiskTriggerRule[];
    statutoryCitations?: string[];
    certificationEquivalents?: string[];
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface DynamicQuestionnaireSection {
    id: string;
    tenantId: string;
    templateId: string;
    code: string;
    title: string;
    description?: string;
    sortOrder: number;
    weight: number;
    passingThresholdPercent?: number;
    conditionalRules?: ConditionalVisibilityRule[];
    questions: DynamicQuestionnaireQuestion[];
    createdBy: string;
    updatedBy: string;
    createdAt: string;
    updatedAt: string;
}
export interface AttachedFileMetadata {
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    storagePath: string;
    fileHashSha256?: string;
    uploadedAt: string;
}
export interface QuestionnaireAnswer {
    questionId: string;
    questionCode: string;
    sectionId: string;
    value: string | string[] | boolean | number | null;
    comment?: string;
    attachedEvidenceIds: string[];
    attachedFileMetadata?: AttachedFileMetadata[];
    calculatedScore?: number;
    isPassing?: boolean;
    reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
    reviewerComment?: string;
    updatedAt: string;
}
export interface QuestionVisibilityResult {
    isVisible: boolean;
    isRequired: boolean;
    reason?: string;
}
/**
 * Pure evaluator checking single conditional operator against answer value.
 */
export declare function evaluateCondition(actualValue: unknown, operator: ConditionalOperator, targetValue?: unknown): boolean;
/**
 * Pure evaluator resolving whether a question is visible and required based on conditional rules.
 */
export declare function evaluateQuestionVisibility(question: DynamicQuestionnaireQuestion, answers: Record<string, QuestionnaireAnswer | undefined>): QuestionVisibilityResult;
export interface QuestionScoreResult {
    earnedPoints: number;
    maxPoints: number;
    scorePercent: number;
    isPassing: boolean;
}
/**
 * Calculates score for a single question response.
 */
export declare function evaluateQuestionScore(question: DynamicQuestionnaireQuestion, answer?: QuestionnaireAnswer): QuestionScoreResult;
/**
 * Evaluates configured risk triggers against question answer.
 */
export declare function evaluateQuestionRiskFlags(question: DynamicQuestionnaireQuestion, answer?: QuestionnaireAnswer): TriggeredRiskFlag[];
export interface RiskFactorExplanation {
    factorCode: string;
    category: 'score_threshold' | 'critical_finding' | 'missing_mandatory_evidence' | 'unanswered_critical_questions' | 'statutory_gap';
    severity: AssessmentRiskTier;
    title: string;
    reason: string;
    impactOnPosture: string;
    remediationAdvice: string;
    sourceQuestionCode?: string;
    statutoryCitation?: string;
}
export interface RecommendedRiskRegisterEntry {
    code: string;
    title: string;
    description: string;
    category: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
    inherentLikelihood: number;
    inherentImpact: number;
    inherentScore: number;
    treatmentStrategy: 'mitigate' | 'accept' | 'transfer' | 'avoid';
    treatmentPlan: string;
    deduplicationKey: string;
    statutoryCitation?: string;
}
export interface SubmissionRiskPostureAnalysis {
    overallRiskTier: AssessmentRiskTier;
    overallScorePercent: number;
    isCompliant: boolean;
    requiresReviewFollowUp: boolean;
    postureSummaryText: string;
    explanations: RiskFactorExplanation[];
    triggeredFlags: TriggeredRiskFlag[];
    deduplicatedRiskCodes: string[];
    sectionBreakdown: Record<string, {
        sectionId: string;
        sectionTitle: string;
        scorePercent: number;
        riskTier: AssessmentRiskTier;
        flagCount: number;
        missingEvidenceCount: number;
    }>;
    recommendedRegisterEntries: RecommendedRiskRegisterEntry[];
}
/**
 * Evaluates full questionnaire responses against sections, scoring thresholds,
 * risk triggers, and missing evidence requirements to produce an explainable
 * posture analysis with deduplicated risk flags.
 */
export declare function analyzeSubmissionRiskPosture(sections: DynamicQuestionnaireSection[], answers: Record<string, QuestionnaireAnswer | AssessmentAnswerItem>, options?: {
    passingScoreThreshold?: number;
    thirdPartyName?: string;
    vendorId?: string | null;
}): SubmissionRiskPostureAnalysis;
export interface ValidationEngineResult {
    valid: boolean;
    errors: string[];
}
export declare function validateQuestionDefinition(q: unknown): ValidationEngineResult;
export declare function validateAnswer(question: DynamicQuestionnaireQuestion, answer: unknown, options?: {
    checkRequired?: boolean;
    checkEvidence?: boolean;
}): ValidationEngineResult;
/**
 * Canonical answer-presence predicate used by required-field gates and
 * completion metrics. Whitespace-only text and empty selections are not
 * evidence of an answered question.
 */
export declare function isQuestionnaireAnswerValuePresent(value: QuestionnaireAnswer['value'] | undefined): boolean;
export interface MissingEvidenceQuestionIndicator {
    questionId: string;
    questionCode: string;
    questionTitle: string;
    sectionId: string;
    sectionTitle: string;
    acceptedEvidenceCategories: string[];
    isRequired: boolean;
    scoringWeight: number;
}
export interface MissingEvidenceEvaluationResult {
    hasMissingEvidence: boolean;
    totalRequestedCount: number;
    providedEvidenceCount: number;
    missingEvidenceCount: number;
    missingQuestions: MissingEvidenceQuestionIndicator[];
}
/**
 * Evaluates a questionnaire submission to identify any visible questions requiring supporting evidence
 * where no evidence document has been attached.
 */
export declare function evaluateMissingEvidenceRequirements(sections: DynamicQuestionnaireSection[], answers: Record<string, QuestionnaireAnswer | AssessmentAnswerItem>): MissingEvidenceEvaluationResult;
//# sourceMappingURL=questionnaire-engine.d.ts.map
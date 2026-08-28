import { BaseEntity } from './core.js';
import { ConditionalVisibilityRule, DateConstraints, DynamicQuestionnaireQuestion, DynamicQuestionnaireSection, FileUploadConstraints, NumericConstraints, QuestionnaireAnswer, RatingScaleConstraints } from './questionnaire-engine.js';
import type { ThirdPartyAssessmentRequest } from './third-party-assessments.js';
export type AccessTokenStatus = 'active' | 'used' | 'expired' | 'revoked' | 'superseded';
export type AccessTokenType = 'single_use' | 'multi_use_session' | 'time_bound';
/**
 * Tenant-Scoped Tokenized Assessment Access Record
 * Stored at: /tenants/{tenantId}/assessment_access_tokens/{tokenId}
 * and mirrored at root /assessment_access_tokens/{tokenId} for global lookup.
 */
export interface AssessmentAccessToken extends BaseEntity {
    requestId: string;
    templateId: string;
    recipientEmail: string;
    recipientName: string;
    thirdPartyName: string;
    tokenHash: string;
    tokenType: AccessTokenType;
    status: AccessTokenStatus;
    maxUses: number;
    useCount: number;
    expiresAt: string;
    lastAccessedAt: string | null;
    lastAccessedIpMasked: string | null;
    revokedAt: string | null;
    revokedBy: string | null;
    revocationReason: string | null;
    requireEmailVerificationCode: boolean;
    emailVerificationCodeHash?: string | null;
    emailVerificationCodeExpiresAt?: string | null;
    emailVerifiedAt?: string | null;
    issuedByUserId: string;
    issuedAt: string;
    createdBy: string;
    updatedBy: string;
}
/**
 * Sanitized Public Assessment Payload returned to external unauthenticated respondents.
 * Strictly strips internal tenant details, internal comments, reviewer notes, and other third-party records.
 */
export interface SanitizedPublicAssessmentView {
    requestId: string;
    tenantId: string;
    templateTitle: string;
    templateDescription?: string;
    thirdPartyName: string;
    recipientName: string;
    recipientEmail: string;
    dueDate: string;
    status: string;
    sections: PublicQuestionnaireSection[];
    existingAnswers: Record<string, QuestionnaireAnswer>;
    tokenExpiresAt: string;
    requiresEmailVerification: boolean;
    isEmailVerified: boolean;
}
/**
 * Public questionnaire shapes deliberately omit internal scoring, risk-trigger,
 * ownership, tenant, and change-control metadata. Those fields would let an
 * external respondent reverse-engineer scoring or expose internal user IDs.
 */
export interface PublicQuestionnaireOption {
    label: string;
    value: string;
    description?: string;
}
export interface PublicQuestionnaireQuestion {
    id: string;
    sectionId: string;
    code: string;
    title: string;
    description?: string;
    guidanceNotes?: string;
    questionType: DynamicQuestionnaireQuestion['questionType'];
    required: boolean;
    sortOrder: number;
    options?: PublicQuestionnaireOption[];
    numericConstraints?: NumericConstraints;
    dateConstraints?: DateConstraints;
    fileConstraints?: FileUploadConstraints;
    ratingConstraints?: RatingScaleConstraints;
    requiresEvidence?: boolean;
    acceptedEvidenceCategories?: string[];
    conditionalRules?: ConditionalVisibilityRule[];
}
export interface PublicQuestionnaireSection {
    id: string;
    code: string;
    title: string;
    description?: string;
    sortOrder: number;
    conditionalRules?: ConditionalVisibilityRule[];
    questions: PublicQuestionnaireQuestion[];
}
export declare const PUBLIC_ASSESSMENT_LIMITS: {
    readonly maxRequestBytes: number;
    readonly maxPublicViewBytes: number;
    readonly maxAnswers: 2000;
    readonly maxTextLength: 10000;
    readonly maxCommentLength: 4000;
    readonly maxMultiSelectItems: 100;
    readonly maxOptionValueLength: 256;
    readonly maxIdentifierLength: 128;
};
export type AssessmentTokenActivity = 'view' | 'draft' | 'final_submission';
export interface AssessmentTokenActivityUpdate {
    lastAccessedAt: string;
    lastAccessedIpMasked: string | null;
    updatedAt: string;
    useCount?: number;
    status?: AccessTokenStatus;
}
/**
 * Viewing a questionnaire or saving a draft is not a submission and must not
 * consume a token's final-submission allowance. This also prevents refreshes or
 * automated link scanners from exhausting a respondent's invitation.
 */
export declare function createAssessmentTokenActivityUpdate(token: AssessmentAccessToken, activity: AssessmentTokenActivity, nowIso: string, clientIpMasked?: string | null): AssessmentTokenActivityUpdate;
export interface PublicAssessmentAnswerValidationResult {
    valid: boolean;
    errors: string[];
    normalizedAnswers: Record<string, QuestionnaireAnswer>;
}
/**
 * Validates an untrusted public answer map against the immutable questionnaire
 * snapshot. It rejects question injection, server-owned review/scoring fields,
 * and all attachment references until a verified upload service issues them.
 */
export declare function validateAndNormalizePublicAssessmentAnswers(sections: DynamicQuestionnaireSection[], input: unknown, nowIso: string): PublicAssessmentAnswerValidationResult;
export declare function sanitizePublicQuestionnaireSections(sections: DynamicQuestionnaireSection[]): PublicQuestionnaireSection[];
export declare function buildAssessmentPortalAccessUrl(input: {
    portalBaseUrl: string;
    tenantId: string;
    requestId: string;
    tokenId: string;
    rawToken: string;
}): string;
export interface IssueAssessmentAccessTokenInput {
    tenantId: string;
    requestId: string;
    recipientEmail: string;
    recipientName: string;
    thirdPartyName: string;
    templateId: string;
    validityDays?: number;
    tokenType?: AccessTokenType;
    maxUses?: number;
    requireEmailVerificationCode?: boolean;
}
export interface IssueAssessmentAccessTokenResult {
    success: boolean;
    tokenId: string;
    rawToken: string;
    accessUrl: string;
    expiresAt: string;
    recipientEmail: string;
}
export interface ValidateAssessmentAccessTokenInput {
    tenantId: string;
    requestId: string;
    tokenId: string;
    rawToken: string;
    emailVerificationCode?: string;
}
export interface RevokeAssessmentAccessTokenInput {
    tenantId: string;
    tokenId: string;
    requestId: string;
    reason: string;
}
export interface RegenerateAssessmentAccessTokenInput {
    tenantId: string;
    requestId: string;
    reason?: string;
    validityDays?: number;
    requireEmailVerificationCode?: boolean;
}
export interface TokenValidationResult {
    isValid: boolean;
    error?: string;
    errorCode?: 'TOKEN_NOT_FOUND' | 'TOKEN_REVOKED' | 'TOKEN_EXPIRED' | 'TOKEN_EXHAUSTED' | 'TOKEN_HASH_MISMATCH' | 'EMAIL_VERIFICATION_REQUIRED';
}
/**
 * Pure evaluator checking token validity against current time and usage constraints.
 */
export declare function evaluateAccessTokenValidity(tokenRecord: AssessmentAccessToken | null | undefined, computedHash: string, now?: Date): TokenValidationResult;
/**
 * Constructs a least-privilege sanitized view for external unauthenticated respondents,
 * stripping internal control linkages, risk IDs, and tenant metadata.
 */
export declare function createSanitizedPublicAssessmentView(request: ThirdPartyAssessmentRequest, tokenData: AssessmentAccessToken, existingAnswers?: Record<string, QuestionnaireAnswer>): SanitizedPublicAssessmentView;
//# sourceMappingURL=assessment-access-tokens.d.ts.map
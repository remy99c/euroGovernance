import { BaseEntity } from './core.js';
import {
  ConditionalVisibilityRule,
  DateConstraints,
  DynamicQuestionnaireQuestion,
  DynamicQuestionnaireSection,
  FileUploadConstraints,
  NumericConstraints,
  QuestionnaireAnswer,
  RatingScaleConstraints,
} from './questionnaire-engine.js';
import type { ThirdPartyAssessmentRequest } from './third-party-assessments.js';

// =============================================================================
// 1. TOKEN TYPES & STATUSES
// =============================================================================

export type AccessTokenStatus =
  | 'active'      // Usable for accessing / filling questionnaire
  | 'used'        // Fully exhausted single-use link
  | 'expired'     // Deadline / validity time window lapsed
  | 'revoked'     // Manually invalidated by compliance team
  | 'superseded'; // Replaced by a newly regenerated access token

export type AccessTokenType =
  | 'single_use'         // Invalidated immediately after final submission
  | 'multi_use_session'  // Allows saving drafts multiple times up to submission
  | 'time_bound';        // Time-limited window with unlimited draft saves

/**
 * Tenant-Scoped Tokenized Assessment Access Record
 * Stored at: /tenants/{tenantId}/assessment_access_tokens/{tokenId}
 * and mirrored at root /assessment_access_tokens/{tokenId} for global lookup.
 */
export interface AssessmentAccessToken extends BaseEntity {
  requestId: string;                      // Link to ThirdPartyAssessmentRequest or ProcessorAssessment
  templateId: string;                     // Link to QuestionnaireTemplate
  recipientEmail: string;                 // Lowercased email of target respondent
  recipientName: string;
  thirdPartyName: string;
  tokenHash: string;                      // Cryptographic SHA-256 hash of the 256-bit secret token
  tokenType: AccessTokenType;
  status: AccessTokenStatus;
  maxUses: number;                        // E.g. 1 for single-use, 50 for multi-use drafts
  useCount: number;
  expiresAt: string;                      // ISO timestamp when token ceases to be valid
  lastAccessedAt: string | null;
  lastAccessedIpMasked: string | null;
  revokedAt: string | null;
  revokedBy: string | null;               // User ID who revoked the token
  revocationReason: string | null;

  // Email-Bound Two-Factor Verification
  requireEmailVerificationCode: boolean;  // When true, requires entering 6-digit code sent to email
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

export const PUBLIC_ASSESSMENT_LIMITS = {
  maxRequestBytes: 512 * 1024,
  maxPublicViewBytes: 1024 * 1024,
  maxAnswers: 2_000,
  maxTextLength: 10_000,
  maxCommentLength: 4_000,
  maxMultiSelectItems: 100,
  maxOptionValueLength: 256,
  maxIdentifierLength: 128,
} as const;

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
export function createAssessmentTokenActivityUpdate(
  token: AssessmentAccessToken,
  activity: AssessmentTokenActivity,
  nowIso: string,
  clientIpMasked: string | null = null
): AssessmentTokenActivityUpdate {
  const update: AssessmentTokenActivityUpdate = {
    lastAccessedAt: nowIso,
    lastAccessedIpMasked: clientIpMasked,
    updatedAt: nowIso,
  };

  if (activity === 'final_submission') {
    update.useCount = token.useCount + 1;
    if (token.tokenType === 'single_use') update.status = 'used';
  }

  return update;
}

export interface PublicAssessmentAnswerValidationResult {
  valid: boolean;
  errors: string[];
  normalizedAnswers: Record<string, QuestionnaireAnswer>;
}

const ALLOWED_PUBLIC_ANSWER_FIELDS = new Set([
  'questionId',
  'questionCode',
  'sectionId',
  'value',
  'comment',
  'attachedEvidenceIds',
  'updatedAt',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isSafeQuestionIdentifier(value: string): boolean {
  return (
    value.length > 0 &&
    value.length <= PUBLIC_ASSESSMENT_LIMITS.maxIdentifierLength &&
    !value.includes('/') &&
    value !== '__proto__' &&
    value !== 'constructor' &&
    value !== 'prototype'
  );
}

function isValidCalendarDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}

/**
 * Validates an untrusted public answer map against the immutable questionnaire
 * snapshot. It rejects question injection, server-owned review/scoring fields,
 * and all attachment references until a verified upload service issues them.
 */
export function validateAndNormalizePublicAssessmentAnswers(
  sections: DynamicQuestionnaireSection[],
  input: unknown,
  nowIso: string
): PublicAssessmentAnswerValidationResult {
  const errors: string[] = [];
  const normalizedAnswers: Record<string, QuestionnaireAnswer> = {};
  const addError = (message: string) => {
    if (errors.length < 25) errors.push(message);
  };

  if (!isRecord(input)) {
    return { valid: false, errors: ['answers must be an object keyed by question ID.'], normalizedAnswers };
  }

  const answerKeys = Object.keys(input);
  if (answerKeys.length > PUBLIC_ASSESSMENT_LIMITS.maxAnswers) {
    return {
      valid: false,
      errors: [`answers exceeds the ${PUBLIC_ASSESSMENT_LIMITS.maxAnswers} question limit.`],
      normalizedAnswers,
    };
  }

  const questionById = new Map<string, { question: DynamicQuestionnaireQuestion; sectionId: string }>();
  for (const section of sections) {
    if (!isSafeQuestionIdentifier(section.id)) {
      addError('The questionnaire contains an unsafe section identifier.');
      continue;
    }
    for (const question of section.questions) {
      if (!isSafeQuestionIdentifier(question.id) || questionById.has(question.id)) {
        addError('The questionnaire contains an unsafe or duplicate question identifier.');
        continue;
      }
      questionById.set(question.id, { question, sectionId: section.id });
    }
  }

  if (questionById.size > PUBLIC_ASSESSMENT_LIMITS.maxAnswers) {
    addError(`The questionnaire exceeds the ${PUBLIC_ASSESSMENT_LIMITS.maxAnswers} question limit.`);
  }

  for (const key of answerKeys) {
    const definition = questionById.get(key);
    if (!definition) {
      addError(`Answer key '${key.slice(0, PUBLIC_ASSESSMENT_LIMITS.maxIdentifierLength)}' is not part of this questionnaire.`);
      continue;
    }

    const rawAnswer = input[key];
    if (!isRecord(rawAnswer)) {
      addError(`Answer '${definition.question.code}' must be an object.`);
      continue;
    }

    const unknownFields = Object.keys(rawAnswer).filter((field) => !ALLOWED_PUBLIC_ANSWER_FIELDS.has(field));
    if (unknownFields.length > 0) {
      addError(`Answer '${definition.question.code}' contains unsupported or server-owned fields.`);
      continue;
    }

    if ('attachedFileMetadata' in rawAnswer || 'storagePath' in rawAnswer) {
      addError(`Answer '${definition.question.code}' contains unverified attachment metadata.`);
      continue;
    }

    if (
      rawAnswer.questionId !== key ||
      rawAnswer.questionCode !== definition.question.code ||
      rawAnswer.sectionId !== definition.sectionId
    ) {
      addError(`Answer identity does not match question '${definition.question.code}'.`);
      continue;
    }

    if (
      rawAnswer.attachedEvidenceIds !== undefined &&
      (!Array.isArray(rawAnswer.attachedEvidenceIds) || rawAnswer.attachedEvidenceIds.length > 0)
    ) {
      addError(`Answer '${definition.question.code}' contains an unverified evidence reference.`);
      continue;
    }

    const { question } = definition;
    const value = rawAnswer.value;
    let valueIsValid = value === null || value === '';

    if (value !== null && value !== '') {
      switch (question.questionType) {
        case 'yes_no':
        case 'boolean':
          valueIsValid = typeof value === 'boolean';
          break;
        case 'single_select':
          valueIsValid =
            typeof value === 'string' &&
            value.length <= PUBLIC_ASSESSMENT_LIMITS.maxOptionValueLength &&
            Boolean(question.options?.some((option) => option.value === value));
          break;
        case 'multi_select':
          valueIsValid =
            Array.isArray(value) &&
            value.length <= PUBLIC_ASSESSMENT_LIMITS.maxMultiSelectItems &&
            new Set(value).size === value.length &&
            value.every(
              (item) =>
                typeof item === 'string' &&
                item.length <= PUBLIC_ASSESSMENT_LIMITS.maxOptionValueLength &&
                Boolean(question.options?.some((option) => option.value === item))
            );
          break;
        case 'text':
        case 'textarea':
          valueIsValid =
            typeof value === 'string' && value.length <= PUBLIC_ASSESSMENT_LIMITS.maxTextLength;
          break;
        case 'numeric':
          if (typeof value !== 'number' || !Number.isFinite(value)) {
            valueIsValid = false;
            break;
          }
          valueIsValid =
            (question.numericConstraints?.min === undefined || value >= question.numericConstraints.min) &&
            (question.numericConstraints?.max === undefined || value <= question.numericConstraints.max);
          break;
        case 'date':
          if (typeof value !== 'string' || !isValidCalendarDate(value)) {
            valueIsValid = false;
            break;
          }
          valueIsValid =
            (!question.dateConstraints?.minDate || value >= question.dateConstraints.minDate) &&
            (!question.dateConstraints?.maxDate || value <= question.dateConstraints.maxDate);
          break;
        case 'rating_scale':
          if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
            valueIsValid = false;
            break;
          }
          valueIsValid =
            !question.ratingConstraints ||
            (value >= question.ratingConstraints.minRating && value <= question.ratingConstraints.maxRating);
          break;
        case 'file_upload':
          // File answers remain empty until a server-verified upload handshake exists.
          valueIsValid = false;
          break;
        default:
          valueIsValid = false;
      }
    }

    if (!valueIsValid) {
      addError(`Answer value for '${question.code}' does not match its question type or constraints.`);
      continue;
    }

    if (
      rawAnswer.comment !== undefined &&
      (typeof rawAnswer.comment !== 'string' || rawAnswer.comment.length > PUBLIC_ASSESSMENT_LIMITS.maxCommentLength)
    ) {
      addError(`Comment for '${question.code}' exceeds the allowed shape or length.`);
      continue;
    }

    normalizedAnswers[key] = {
      questionId: key,
      questionCode: question.code,
      sectionId: definition.sectionId,
      value: value as QuestionnaireAnswer['value'],
      ...(typeof rawAnswer.comment === 'string' ? { comment: rawAnswer.comment } : {}),
      attachedEvidenceIds: [],
      updatedAt: nowIso,
    };
  }

  return { valid: errors.length === 0, errors, normalizedAnswers };
}

export function sanitizePublicQuestionnaireSections(
  sections: DynamicQuestionnaireSection[]
): PublicQuestionnaireSection[] {
  return sections.map((section) => ({
    id: section.id,
    code: section.code,
    title: section.title,
    ...(section.description ? { description: section.description } : {}),
    sortOrder: section.sortOrder,
    ...(section.conditionalRules
      ? { conditionalRules: section.conditionalRules.map((rule) => ({ ...rule })) }
      : {}),
    questions: section.questions.map((question) => ({
      id: question.id,
      sectionId: question.sectionId,
      code: question.code,
      title: question.title,
      ...(question.description ? { description: question.description } : {}),
      ...(question.guidanceNotes ? { guidanceNotes: question.guidanceNotes } : {}),
      questionType: question.questionType,
      required: question.required,
      sortOrder: question.sortOrder,
      ...(question.options
        ? {
            options: question.options.map((option) => ({
              label: option.label,
              value: option.value,
              ...(option.description ? { description: option.description } : {}),
            })),
          }
        : {}),
      ...(question.numericConstraints ? { numericConstraints: { ...question.numericConstraints } } : {}),
      ...(question.dateConstraints ? { dateConstraints: { ...question.dateConstraints } } : {}),
      ...(question.fileConstraints ? { fileConstraints: { ...question.fileConstraints } } : {}),
      ...(question.ratingConstraints ? { ratingConstraints: { ...question.ratingConstraints } } : {}),
      ...(question.requiresEvidence !== undefined ? { requiresEvidence: question.requiresEvidence } : {}),
      ...(question.acceptedEvidenceCategories
        ? { acceptedEvidenceCategories: [...question.acceptedEvidenceCategories] }
        : {}),
      ...(question.conditionalRules
        ? { conditionalRules: question.conditionalRules.map((rule) => ({ ...rule })) }
        : {}),
    })),
  }));
}

export function buildAssessmentPortalAccessUrl(input: {
  portalBaseUrl: string;
  tenantId: string;
  requestId: string;
  tokenId: string;
  rawToken: string;
}): string {
  const portalOrigin = new URL(input.portalBaseUrl);
  if (
    portalOrigin.protocol !== 'https:' ||
    portalOrigin.username ||
    portalOrigin.password ||
    (portalOrigin.pathname !== '/' && portalOrigin.pathname !== '') ||
    portalOrigin.search ||
    portalOrigin.hash
  ) {
    throw new Error('portalBaseUrl must be an HTTPS origin without credentials, path, query, or fragment.');
  }
  const queryPairs: Array<readonly [string, string]> = [
    ['tenantId', input.tenantId],
    ['requestId', input.requestId],
    ['tokenId', input.tokenId],
  ];
  const query = queryPairs
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  // The bearer secret is kept in the fragment so browsers do not send it to
  // Firebase Hosting/CDN access logs or in the HTTP Referer header.
  return `${portalOrigin.origin}/portal/assessments/?${query}#token=${encodeURIComponent(input.rawToken)}`;
}

// =============================================================================
// 2. INPUT & OUTPUT SCHEMAS FOR FUNCTIONS
// =============================================================================

export interface IssueAssessmentAccessTokenInput {
  tenantId: string;
  requestId: string;
  recipientEmail: string;
  recipientName: string;
  thirdPartyName: string;
  templateId: string;
  validityDays?: number;                  // Defaults to 30 days
  tokenType?: AccessTokenType;            // Defaults to 'multi_use_session'
  maxUses?: number;                       // Defaults to 50
  requireEmailVerificationCode?: boolean; // Defaults to false
}

export interface IssueAssessmentAccessTokenResult {
  success: boolean;
  tokenId: string;
  rawToken: string;                       // Only returned ONCE upon creation
  accessUrl: string;                      // Magic link: https://portal.domain.eu/assessments/{requestId}?token={rawToken}
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

// =============================================================================
// 3. PURE TOKEN VALIDATION & EXPIRY EVALUATOR
// =============================================================================

export interface TokenValidationResult {
  isValid: boolean;
  error?: string;
  errorCode?: 'TOKEN_NOT_FOUND' | 'TOKEN_REVOKED' | 'TOKEN_EXPIRED' | 'TOKEN_EXHAUSTED' | 'TOKEN_HASH_MISMATCH' | 'EMAIL_VERIFICATION_REQUIRED';
}

/**
 * Pure evaluator checking token validity against current time and usage constraints.
 */
export function evaluateAccessTokenValidity(
  tokenRecord: AssessmentAccessToken | null | undefined,
  computedHash: string,
  now: Date = new Date()
): TokenValidationResult {
  if (!tokenRecord) {
    return { isValid: false, error: 'Access token not found.', errorCode: 'TOKEN_NOT_FOUND' };
  }

  // 1. Hash Match
  if (tokenRecord.tokenHash !== computedHash) {
    return { isValid: false, error: 'Invalid access token secret.', errorCode: 'TOKEN_HASH_MISMATCH' };
  }

  // 2. Revocation Check
  if (tokenRecord.status === 'revoked' || tokenRecord.revokedAt) {
    return { isValid: false, error: 'Access link has been revoked by compliance.', errorCode: 'TOKEN_REVOKED' };
  }

  if (tokenRecord.status === 'superseded') {
    return { isValid: false, error: 'Access link has been superseded by a newer link.', errorCode: 'TOKEN_REVOKED' };
  }

  // 3. Expiry Check
  const expiresAtTime = new Date(tokenRecord.expiresAt).getTime();
  if (isNaN(expiresAtTime) || now.getTime() > expiresAtTime || tokenRecord.status === 'expired') {
    return { isValid: false, error: 'Access link has expired.', errorCode: 'TOKEN_EXPIRED' };
  }

  // 4. Usage Exhaustion Check
  if (tokenRecord.useCount >= tokenRecord.maxUses || tokenRecord.status === 'used') {
    return { isValid: false, error: 'Access link maximum usage limit reached.', errorCode: 'TOKEN_EXHAUSTED' };
  }

  // 5. Active Status Check
  if (tokenRecord.status !== 'active') {
    return { isValid: false, error: `Access link is not active (${tokenRecord.status}).`, errorCode: 'TOKEN_NOT_FOUND' };
  }

  return { isValid: true };
}

/**
 * Constructs a least-privilege sanitized view for external unauthenticated respondents,
 * stripping internal control linkages, risk IDs, and tenant metadata.
 */
export function createSanitizedPublicAssessmentView(
  request: ThirdPartyAssessmentRequest,
  tokenData: AssessmentAccessToken,
  existingAnswers: Record<string, QuestionnaireAnswer> = {}
): SanitizedPublicAssessmentView {
  const internalSections = (request.templateSnapshot?.sections || []) as unknown as DynamicQuestionnaireSection[];
  const answerCandidates: Record<string, QuestionnaireAnswer> = {};

  for (const section of internalSections) {
    for (const question of section.questions) {
      const existing = existingAnswers[question.id];
      if (!existing) continue;
      answerCandidates[question.id] = {
        questionId: question.id,
        questionCode: question.code,
        sectionId: section.id,
        value: existing.value,
        ...(typeof existing.comment === 'string' ? { comment: existing.comment } : {}),
        attachedEvidenceIds: [],
        updatedAt: existing.updatedAt,
      };
    }
  }

  const sanitizedAnswers = validateAndNormalizePublicAssessmentAnswers(
    internalSections,
    answerCandidates,
    tokenData.lastAccessedAt || request.updatedAt
  ).normalizedAnswers;

  return {
    requestId: request.id,
    tenantId: request.tenantId,
    templateTitle: request.templateSnapshot?.title || request.title,
    templateDescription: request.templateSnapshot?.description,
    thirdPartyName: request.thirdPartyName,
    recipientName: request.respondent?.name || tokenData.recipientName,
    recipientEmail: request.respondent?.email || tokenData.recipientEmail,
    dueDate: request.dueDate,
    status: request.status,
    sections: sanitizePublicQuestionnaireSections(internalSections),
    existingAnswers: sanitizedAnswers,
    tokenExpiresAt: tokenData.expiresAt,
    requiresEmailVerification: !!tokenData.requireEmailVerificationCode,
    isEmailVerified: !!tokenData.emailVerifiedAt,
  };
}

import { BaseEntity } from './core.js';
import { DynamicQuestionnaireSection, QuestionnaireAnswer } from './questionnaire-engine.js';

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
  sections: DynamicQuestionnaireSection[];
  existingAnswers: Record<string, QuestionnaireAnswer>;
  tokenExpiresAt: string;
  requiresEmailVerification: boolean;
  isEmailVerified: boolean;
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
  rawToken: string;
  emailVerificationCode?: string;
  clientIpMasked?: string;
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

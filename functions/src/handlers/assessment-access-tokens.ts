import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { createNotification } from '../lib/notifications.js';
import { appendAuditLogInTransaction } from '../lib/audit.js';
import { buildDeploymentAssessmentPortalAccessUrl } from '../lib/assessment-portal-url.js';
import {
  AssessmentAccessToken,
  IssueAssessmentAccessTokenInput,
  IssueAssessmentAccessTokenResult,
  ValidateAssessmentAccessTokenInput,
  RevokeAssessmentAccessTokenInput,
  RegenerateAssessmentAccessTokenInput,
  SanitizedPublicAssessmentView,
  evaluateAccessTokenValidity,
  ThirdPartyAssessmentRequest,
  DynamicQuestionnaireSection,
  ExternalAssessmentSubmission,
  QuestionnaireAnswer,
  evaluateQuestionVisibility,
  evaluateQuestionScore,
  validateAnswer,
  isQuestionnaireAnswerValuePresent,
  createAssessmentTokenActivityUpdate,
  createSanitizedPublicAssessmentView,
  validateAndNormalizePublicAssessmentAnswers,
  PUBLIC_ASSESSMENT_LIMITS,
} from '@eurogovernance/shared-types';

const SAFE_IDENTIFIER_PATTERN = /^[A-Za-z0-9_-]{1,128}$/;
const RAW_TOKEN_PATTERN = /^[a-f0-9]{64}$/;
const PUBLIC_RESPONSE_STATUSES = new Set(['sent', 'dispatched', 'opened', 'in_progress', 'revision_requested']);
const TOKEN_ISSUABLE_REQUEST_STATUSES = new Set(['draft', 'sent', 'dispatched', 'opened', 'in_progress', 'revision_requested', 'expired']);

function assertSafeIdentifier(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_IDENTIFIER_PATTERN.test(value)) {
    throw new HttpsError('invalid-argument', `${fieldName} has an invalid format.`);
  }
}

function assertRawToken(value: unknown): asserts value is string {
  if (typeof value !== 'string' || !RAW_TOKEN_PATTERN.test(value)) {
    throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
  }
}

function assertPayloadWithinLimit(value: unknown, maxBytes: number): void {
  let payloadBytes: number;
  try {
    payloadBytes = Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    throw new HttpsError('invalid-argument', 'Request payload is not serializable.');
  }
  if (payloadBytes > maxBytes) {
    throw new HttpsError('resource-exhausted', `Request payload exceeds the ${maxBytes}-byte limit.`);
  }
}

function maskRequestIp(ip: string | undefined): string | null {
  if (!ip) return null;
  const normalized = ip.startsWith('::ffff:') ? ip.slice(7) : ip;
  const ipv4 = normalized.split('.');
  if (ipv4.length === 4 && ipv4.every((part) => /^\d{1,3}$/.test(part))) {
    return `${ipv4[0]}.${ipv4[1]}.***.***`;
  }
  const ipv6 = normalized.split(':').filter(Boolean);
  if (ipv6.length >= 2 && ipv6.every((part) => /^[a-fA-F0-9]{1,4}$/.test(part))) {
    return `${ipv6.slice(0, 2).join(':')}::****`;
  }
  return null;
}

function normalizeQuestionnaireSections(requestData: ThirdPartyAssessmentRequest): DynamicQuestionnaireSection[] {
  const rawSections = (requestData.templateSnapshot?.sections || []) as unknown as DynamicQuestionnaireSection[];
  return rawSections.map((section) => ({
    ...section,
    questions: section.questions.map((question) => ({
      ...question,
      sectionId: section.id,
      scoring:
        question.scoring || {
          weight: (question as unknown as { weight?: number }).weight || 1,
        },
    })),
  }));
}

function assertTokenRequestBinding(
  token: AssessmentAccessToken,
  requestData: ThirdPartyAssessmentRequest,
  tenantId: string,
  requestId: string,
  tokenId: string
): void {
  const respondentEmail = requestData.respondent?.email?.toLowerCase().trim();
  if (
    token.id !== tokenId ||
    token.tenantId !== tenantId ||
    token.requestId !== requestId ||
    requestData.id !== requestId ||
    requestData.tenantId !== tenantId ||
    token.templateId !== requestData.templateId ||
    !respondentEmail ||
    respondentEmail !== token.recipientEmail.toLowerCase().trim()
  ) {
    throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
  }
}

function assertRequestAcceptsResponses(requestData: ThirdPartyAssessmentRequest): void {
  if (!PUBLIC_RESPONSE_STATUSES.has(requestData.status)) {
    throw new HttpsError('failed-precondition', 'This assessment is not open for responses.');
  }
}

export function assertSubmissionRequestBinding(
  submission: Pick<ExternalAssessmentSubmission, 'id' | 'tenantId' | 'requestId' | 'templateId'>,
  tenantId: string,
  requestId: string,
  templateId: string,
  submissionId: string
): void {
  if (
    submission.id !== submissionId ||
    submission.tenantId !== tenantId ||
    submission.requestId !== requestId ||
    submission.templateId !== templateId
  ) {
    throw new HttpsError(
      'failed-precondition',
      'The saved assessment response is not bound to this assessment request.'
    );
  }
}

async function settlePostCommitOperations(
  operationName: string,
  operations: Array<Promise<unknown>>
): Promise<void> {
  const results = await Promise.allSettled(operations);
  const failedCount = results.filter((result) => result.status === 'rejected').length;
  if (failedCount > 0) {
    // Do not turn an already-committed command into a client-visible failure.
    // Security-relevant audit events are written atomically in the command
    // transaction; this path is limited to best-effort notification delivery.
    console.error(JSON.stringify({
      severity: 'ERROR',
      event: 'post_commit_side_effect_failed',
      operationName,
      failedCount,
    }));
  }
}

/**
 * Generates a cryptographically secure 256-bit random token and its SHA-256 hash.
 */
export function generateSecureAccessToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

export function hashAccessToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// -----------------------------------------------------------------------------
// 1. ISSUE ASSESSMENT ACCESS TOKEN (Authenticated Tenant Compliance / Admin)
// -----------------------------------------------------------------------------

export const issueAssessmentAccessToken = onCall<IssueAssessmentAccessTokenInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'Authentication is required to issue assessment access tokens.');
  }

  assertPayloadWithinLimit(data, 16 * 1024);
  const { tenantId, requestId, validityDays = 30, tokenType = 'multi_use_session', maxUses = 50 } = data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(requestId, 'requestId');
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 90) {
    throw new HttpsError('invalid-argument', 'validityDays must be an integer between 1 and 90.');
  }
  if (!['single_use', 'multi_use_session', 'time_bound'].includes(tokenType)) {
    throw new HttpsError('invalid-argument', 'tokenType is not supported.');
  }
  if (!Number.isInteger(maxUses) || maxUses < 1 || maxUses > 100) {
    throw new HttpsError('invalid-argument', 'maxUses must be an integer between 1 and 100.');
  }
  if (typeof data.requireEmailVerificationCode !== 'boolean' && data.requireEmailVerificationCode !== undefined) {
    throw new HttpsError('invalid-argument', 'requireEmailVerificationCode must be a boolean.');
  }
  if (data.requireEmailVerificationCode === true) {
    throw new HttpsError(
      'failed-precondition',
      'Email verification cannot be enabled until the verification delivery and confirmation workflow is configured.'
    );
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const requireEmailVerificationCode = data.requireEmailVerificationCode ?? false;
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  const { token: rawToken, tokenHash } = generateSecureAccessToken();
  const tokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;
  // Resolve and validate the deployment origin before committing a bearer
  // credential; otherwise a missing parameter could strand the only raw token.
  const accessUrl = buildDeploymentAssessmentPortalAccessUrl({ tenantId, requestId, tokenId, rawToken });

  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const tenantTokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
  const activeTokensQuery = db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('status', '==', 'active');

  const issued = await db.runTransaction(async (transaction) => {
    const reqSnap = await transaction.get(reqRef);
    const activeTokensSnap = await transaction.get(activeTokensQuery);
    if (!reqSnap.exists) throw new HttpsError('not-found', 'Assessment request not found.');
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    if (
      reqData.id !== requestId ||
      reqData.tenantId !== tenantId ||
      !TOKEN_ISSUABLE_REQUEST_STATUSES.has(reqData.status)
    ) {
      throw new HttpsError('failed-precondition', 'Assessment request cannot receive an access token in its current state.');
    }
    if (!reqData.respondent?.email) {
      throw new HttpsError('failed-precondition', 'Assessment request does not have a valid respondent.');
    }
    const cleanEmail = reqData.respondent.email.toLowerCase().trim();
    if (
      typeof data.recipientEmail !== 'string' ||
      typeof data.templateId !== 'string' ||
      typeof data.thirdPartyName !== 'string' ||
      data.recipientEmail.toLowerCase().trim() !== cleanEmail ||
      data.templateId !== reqData.templateId ||
      data.thirdPartyName !== reqData.thirdPartyName
    ) {
      throw new HttpsError('invalid-argument', 'Invitation details must match the assessment request.');
    }

    for (const activeTokenDoc of activeTokensSnap.docs) {
      transaction.update(activeTokenDoc.ref, {
        status: 'superseded',
        revokedAt: nowIso,
        revokedBy: authContext.userId,
        revocationReason: 'Superseded by a newly issued access link.',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
      transaction.set(
        db.collection('assessment_access_tokens').doc(activeTokenDoc.id),
        { status: 'superseded', updatedAt: nowIso },
        { merge: true }
      );
    }

    const tokenRecord: AssessmentAccessToken = {
      id: tokenId,
      tenantId,
      requestId,
      templateId: reqData.templateId,
      recipientEmail: cleanEmail,
      recipientName: reqData.respondent.name || cleanEmail,
      thirdPartyName: reqData.thirdPartyName,
      tokenHash,
      tokenType,
      status: 'active',
      maxUses: tokenType === 'single_use' ? 1 : maxUses,
      useCount: 0,
      expiresAt,
      lastAccessedAt: null,
      lastAccessedIpMasked: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      requireEmailVerificationCode,
      emailVerificationCodeHash: null,
      emailVerificationCodeExpiresAt: null,
      emailVerifiedAt: null,
      issuedByUserId: authContext.userId,
      issuedAt: nowIso,
      ownerId: authContext.userId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    transaction.set(tenantTokenRef, tokenRecord);
    transaction.set(globalTokenRef, {
      tokenId,
      tenantId,
      requestId,
      tokenHash,
      status: 'active',
      expiresAt,
      updatedAt: nowIso,
    });
    transaction.update(reqRef, {
      status: 'dispatched',
      dispatchedAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'processor_assessment',
      entityId: requestId,
      action: 'create',
      afterSummary: {
        action: 'assessment_token_issued',
        tokenId,
        recipientEmail: cleanEmail,
        tokenType,
        expiresAt,
        requireEmailVerificationCode,
        supersededCount: activeTokensSnap.size,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_dispatch',
    });
    return { cleanEmail, supersededCount: activeTokensSnap.size };
  });

  const result: IssueAssessmentAccessTokenResult = {
    success: true,
    tokenId,
    rawToken,
    accessUrl,
    expiresAt,
    recipientEmail: issued.cleanEmail,
  };

  return result;
});

// -----------------------------------------------------------------------------
// 2. VALIDATE ASSESSMENT ACCESS TOKEN (Public External Respondent)
// -----------------------------------------------------------------------------

export const validateAssessmentAccessToken = onCall<ValidateAssessmentAccessTokenInput>(async (request) => {
  assertPayloadWithinLimit(request.data, 16 * 1024);
  const { tenantId, requestId, tokenId, rawToken } = request.data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(requestId, 'requestId');
  assertSafeIdentifier(tokenId, 'tokenId');
  assertRawToken(rawToken);
  const computedHash = hashAccessToken(rawToken);
  const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const now = new Date();
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const nowIso = now.toISOString();
  const clientIpMasked = maskRequestIp(request.rawRequest.ip);
  const access = await db.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef);
    const reqSnap = await transaction.get(reqRef);
    if (!tokenSnap.exists || !reqSnap.exists) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }
    const tokenData = tokenSnap.data() as AssessmentAccessToken;
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    const validation = evaluateAccessTokenValidity(tokenData, computedHash, now);
    if (!validation.isValid) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }
    assertTokenRequestBinding(tokenData, reqData, tenantId, requestId, tokenId);
    assertRequestAcceptsResponses(reqData);

    const sections = normalizeQuestionnaireSections(reqData);
    if (sections.length === 0 || sections.length > 100) {
      throw new HttpsError('failed-precondition', 'Assessment questionnaire is missing or exceeds the section limit.');
    }
    const templateValidation = validateAndNormalizePublicAssessmentAnswers(sections, {}, nowIso);
    if (!templateValidation.valid) {
      throw new HttpsError('failed-precondition', 'Assessment questionnaire definition is invalid.');
    }

    const requiresEmailVerification =
      tokenData.requireEmailVerificationCode && !tokenData.emailVerifiedAt;
    const wasOpened = reqData.status === 'sent' || reqData.status === 'dispatched';
    if (!requiresEmailVerification) {
      transaction.update(tokenRef, {
        ...createAssessmentTokenActivityUpdate(tokenData, 'view', nowIso, clientIpMasked),
      });
      if (wasOpened) {
        transaction.update(reqRef, {
          status: 'opened',
          openedAt: nowIso,
          updatedAt: nowIso,
          updatedBy: 'external_respondent',
        });
      }
    }
    return { tokenData, reqData, sections, requiresEmailVerification, wasOpened };
  });

  if (access.requiresEmailVerification) {
    return {
      requiresEmailVerification: true,
      recipientEmailMasked: access.tokenData.recipientEmail.replace(/(.{2})(.*)(?=@)/, '$1***'),
      isEmailVerified: false,
    };
  }

  let existingAnswers: Record<string, QuestionnaireAnswer> = {};
  if (access.reqData.activeSubmissionId) {
    assertSafeIdentifier(access.reqData.activeSubmissionId, 'activeSubmissionId');
    const subSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('assessment_submissions')
      .doc(access.reqData.activeSubmissionId)
      .get();
    if (subSnap.exists) {
      const existingSubmission = subSnap.data() as ExternalAssessmentSubmission;
      assertSubmissionRequestBinding(
        existingSubmission,
        tenantId,
        requestId,
        access.reqData.templateId,
        access.reqData.activeSubmissionId
      );
      existingAnswers = (existingSubmission.answers || {}) as Record<string, QuestionnaireAnswer>;
    }
  }

  if (access.wasOpened && access.reqData.ownerUserId) {
      await settlePostCommitOperations('open_assessment_access_link', [createNotification({
        tenantId,
        recipientId: access.reqData.ownerUserId,
        title: `Assessment Questionnaire Opened: ${access.reqData.thirdPartyName}`,
        message: `${access.tokenData.recipientName} (${access.tokenData.recipientEmail}) has opened the assessment questionnaire '${access.reqData.templateSnapshot.title || access.reqData.title}'.`,
        type: 'assessment_request_opened',
        priority: 'low',
        linkUrl: `/assessments`,
        sourceEntityType: 'processor_assessment',
        sourceEntityId: requestId,
        deduplicationKey: `notif_opened_${requestId}`,
      })]);
  }

  const publicRequest = {
    ...access.reqData,
    status: access.wasOpened ? 'opened' : access.reqData.status,
    templateSnapshot: {
      ...access.reqData.templateSnapshot,
      sections: access.sections as unknown as typeof access.reqData.templateSnapshot.sections,
    },
  } as ThirdPartyAssessmentRequest;
  const sanitizedView: SanitizedPublicAssessmentView = createSanitizedPublicAssessmentView(
    publicRequest,
    { ...access.tokenData, lastAccessedAt: nowIso },
    existingAnswers
  );
  assertPayloadWithinLimit(sanitizedView, PUBLIC_ASSESSMENT_LIMITS.maxPublicViewBytes);
  return sanitizedView;
});

// -----------------------------------------------------------------------------
// 3. REVOKE ASSESSMENT ACCESS TOKEN (Compliance / Admin)
// -----------------------------------------------------------------------------

export const revokeAssessmentAccessToken = onCall<RevokeAssessmentAccessTokenInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to revoke tokens.');
  }

  assertPayloadWithinLimit(data, 8 * 1024);
  const { tenantId, tokenId, reason } = data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(tokenId, 'tokenId');
  if (typeof reason !== 'string' || reason.trim().length < 3 || reason.length > 2_000) {
    throw new HttpsError('invalid-argument', 'A revocation reason between 3 and 2,000 characters is required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const nowIso = new Date().toISOString();
  const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
  await db.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef);
    if (!tokenSnap.exists) {
      throw new HttpsError('not-found', 'Assessment access token not found.');
    }
    const tokenData = tokenSnap.data() as AssessmentAccessToken;
    if (tokenData.id !== tokenId || tokenData.tenantId !== tenantId) {
      throw new HttpsError('failed-precondition', 'Assessment access token record is not correctly tenant-bound.');
    }

    transaction.update(tokenRef, {
      status: 'revoked',
      revokedAt: nowIso,
      revokedBy: authContext.userId,
      revocationReason: reason.trim(),
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
    transaction.update(globalTokenRef, {
      status: 'revoked',
      updatedAt: nowIso,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'processor_assessment',
      entityId: tokenData.requestId,
      action: 'delete',
      afterSummary: {
        action: 'assessment_token_revoked',
        tokenId,
        reason: reason.trim(),
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_revocation',
    });
  });

  return { success: true, tokenId, status: 'revoked' };
});

// -----------------------------------------------------------------------------
// 4. REGENERATE ASSESSMENT ACCESS TOKEN (Compliance / Admin)
// -----------------------------------------------------------------------------

export const regenerateAssessmentAccessToken = onCall<RegenerateAssessmentAccessTokenInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to regenerate tokens.');
  }

  assertPayloadWithinLimit(data, 8 * 1024);
  const { tenantId, requestId, reason, validityDays = 30, requireEmailVerificationCode = false } = data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(requestId, 'requestId');
  if (!Number.isInteger(validityDays) || validityDays < 1 || validityDays > 90) {
    throw new HttpsError('invalid-argument', 'validityDays must be an integer between 1 and 90.');
  }
  if (typeof requireEmailVerificationCode !== 'boolean') {
    throw new HttpsError('invalid-argument', 'requireEmailVerificationCode must be a boolean.');
  }
  if (requireEmailVerificationCode) {
    throw new HttpsError(
      'failed-precondition',
      'Email verification cannot be enabled until the verification delivery and confirmation workflow is configured.'
    );
  }
  if (reason !== undefined && (typeof reason !== 'string' || reason.length > 2_000)) {
    throw new HttpsError('invalid-argument', 'reason must be a string no longer than 2,000 characters.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const now = new Date();
  const nowIso = now.toISOString();

  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const activeTokensQuery = db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('status', '==', 'active');

  const { token: rawToken, tokenHash } = generateSecureAccessToken();
  const newTokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();
  const accessUrl = buildDeploymentAssessmentPortalAccessUrl({
    tenantId,
    requestId,
    tokenId: newTokenId,
    rawToken,
  });
  const newTokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(newTokenId);
  const globalTokenRef = db.collection('assessment_access_tokens').doc(newTokenId);

  const regenerated = await db.runTransaction(async (transaction) => {
    const reqSnap = await transaction.get(reqRef);
    const existingTokensSnap = await transaction.get(activeTokensQuery);
    if (!reqSnap.exists) throw new HttpsError('not-found', 'Assessment request not found.');
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    if (
      reqData.id !== requestId ||
      reqData.tenantId !== tenantId ||
      !TOKEN_ISSUABLE_REQUEST_STATUSES.has(reqData.status) ||
      !reqData.respondent?.email
    ) {
      throw new HttpsError('failed-precondition', 'Assessment request cannot receive a replacement token in its current state.');
    }

    for (const existingTokenDoc of existingTokensSnap.docs) {
      transaction.update(existingTokenDoc.ref, {
        status: 'superseded',
        revokedAt: nowIso,
        revokedBy: authContext.userId,
        revocationReason: reason || 'Superseded by newly regenerated access link.',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
      transaction.set(
        db.collection('assessment_access_tokens').doc(existingTokenDoc.id),
        { status: 'superseded', updatedAt: nowIso },
        { merge: true }
      );
    }

    const recipientEmail = reqData.respondent.email.toLowerCase().trim();
    const newTokenRecord: AssessmentAccessToken = {
      id: newTokenId,
      tenantId,
      requestId,
      templateId: reqData.templateId,
      recipientEmail,
      recipientName: reqData.respondent.name,
      thirdPartyName: reqData.thirdPartyName,
      tokenHash,
      tokenType: 'multi_use_session',
      status: 'active',
      maxUses: 50,
      useCount: 0,
      expiresAt,
      lastAccessedAt: null,
      lastAccessedIpMasked: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      requireEmailVerificationCode: false,
      emailVerificationCodeHash: null,
      emailVerificationCodeExpiresAt: null,
      emailVerifiedAt: null,
      issuedByUserId: authContext.userId,
      issuedAt: nowIso,
      ownerId: authContext.userId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };
    transaction.set(newTokenRef, newTokenRecord);
    transaction.set(globalTokenRef, {
      tokenId: newTokenId,
      tenantId,
      requestId,
      tokenHash,
      status: 'active',
      expiresAt,
      updatedAt: nowIso,
    });
    transaction.update(reqRef, {
      status: 'dispatched',
      dispatchedAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: authContext.userId,
      actorEmail: authContext.email,
      actorRole: authContext.role,
      entityType: 'processor_assessment',
      entityId: requestId,
      action: 'update',
      afterSummary: {
        action: 'assessment_token_regenerated',
        newTokenId,
        supersededCount: existingTokensSnap.size,
        expiresAt,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_regeneration',
    });
    return { recipientEmail, supersededCount: existingTokensSnap.size };
  });

  return {
    success: true,
    tokenId: newTokenId,
    rawToken,
    accessUrl,
    expiresAt,
    recipientEmail: regenerated.recipientEmail,
  };
});

// -----------------------------------------------------------------------------
// 5. SAVE PUBLIC ASSESSMENT DRAFT (Public External Respondent with Valid Token)
// -----------------------------------------------------------------------------

export interface SavePublicAssessmentDraftInput {
  tenantId: string;
  requestId: string;
  tokenId: string;
  rawToken: string;
  answers: Record<string, QuestionnaireAnswer>;
}

export const savePublicAssessmentDraft = onCall<SavePublicAssessmentDraftInput>(async (request) => {
  assertPayloadWithinLimit(request.data, PUBLIC_ASSESSMENT_LIMITS.maxRequestBytes);
  const { tenantId, requestId, tokenId, rawToken, answers } = request.data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(requestId, 'requestId');
  assertSafeIdentifier(tokenId, 'tokenId');
  assertRawToken(rawToken);
  const computedHash = hashAccessToken(rawToken);
  const nowIso = new Date().toISOString();
  const clientIpMasked = maskRequestIp(request.rawRequest.ip);
  const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  return db.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef);
    const reqSnap = await transaction.get(reqRef);
    if (!tokenSnap.exists || !reqSnap.exists) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }

    const tokenData = tokenSnap.data() as AssessmentAccessToken;
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    const validation = evaluateAccessTokenValidity(tokenData, computedHash, new Date(nowIso));
    if (!validation.isValid || (tokenData.requireEmailVerificationCode && !tokenData.emailVerifiedAt)) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }
    assertTokenRequestBinding(tokenData, reqData, tenantId, requestId, tokenId);
    assertRequestAcceptsResponses(reqData);

    const sections = normalizeQuestionnaireSections(reqData);
    const answerValidation = validateAndNormalizePublicAssessmentAnswers(sections, answers, nowIso);
    if (!answerValidation.valid) {
      throw new HttpsError(
        'invalid-argument',
        `Draft answers are invalid: ${answerValidation.errors.slice(0, 5).join('; ')}`
      );
    }
    const normalizedAnswers = answerValidation.normalizedAnswers;
    const submissionId = reqData.activeSubmissionId || `sub_${requestId}`;
    if (reqData.activeSubmissionId) assertSafeIdentifier(reqData.activeSubmissionId, 'activeSubmissionId');
    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const subSnap = await transaction.get(subRef);
    if (subSnap.exists) {
      assertSubmissionRequestBinding(
        subSnap.data() as ExternalAssessmentSubmission,
        tenantId,
        requestId,
        reqData.templateId,
        submissionId
      );
    }

    let totalQuestionsCount = 0;
    let unansweredRequiredCount = 0;
    for (const section of sections) {
      for (const question of section.questions) {
        const visibility = evaluateQuestionVisibility(question, normalizedAnswers);
        if (!visibility.isVisible) continue;
        totalQuestionsCount += 1;
        const value = normalizedAnswers[question.id]?.value;
        if (visibility.isRequired && !isQuestionnaireAnswerValuePresent(value)) {
          unansweredRequiredCount += 1;
        }
      }
    }
    const answeredQuestionsCount = Object.values(normalizedAnswers).filter((answer) =>
      isQuestionnaireAnswerValuePresent(answer.value)
    ).length;

    const submissionDoc: ExternalAssessmentSubmission = {
      id: submissionId,
      tenantId,
      requestId,
      templateId: reqData.templateId,
      targetType: reqData.targetType,
      vendorId: reqData.vendorId || null,
      processorProfileId: reqData.processorProfileId || null,
      thirdPartyName: reqData.thirdPartyName,
      status: 'draft_saved',
      submittedBy: {
        name: tokenData.recipientName,
        email: tokenData.recipientEmail,
        companyName: tokenData.thirdPartyName,
        submittedAt: nowIso,
      },
      computedScorePercent: 0,
      isPassingThreshold: false,
      sectionScores: {},
      answers: normalizedAnswers,
      unansweredRequiredCount,
      totalQuestionsCount,
      answeredQuestionsCount,
      ipAddressMasked: clientIpMasked,
      userAgent: null,
      ownerId: tokenData.issuedByUserId,
      createdBy: 'external_respondent',
      updatedBy: 'external_respondent',
      createdAt: subSnap.exists ? (subSnap.data() as ExternalAssessmentSubmission).createdAt : nowIso,
      updatedAt: nowIso,
    };

    transaction.set(subRef, submissionDoc);
    transaction.update(reqRef, {
      activeSubmissionId: submissionId,
      status: 'in_progress',
      startedAt: reqData.startedAt || nowIso,
      updatedAt: nowIso,
      updatedBy: 'external_respondent',
    });
    transaction.update(
      tokenRef,
      { ...createAssessmentTokenActivityUpdate(tokenData, 'draft', nowIso, clientIpMasked) }
    );

    return { success: true, submissionId, savedAt: nowIso, answeredCount: answeredQuestionsCount };
  });
});

// -----------------------------------------------------------------------------
// 6. SUBMIT PUBLIC ASSESSMENT (Public External Respondent with Valid Token)
// -----------------------------------------------------------------------------

export interface SubmitPublicAssessmentInput {
  tenantId: string;
  requestId: string;
  tokenId: string;
  rawToken: string;
  answers: Record<string, QuestionnaireAnswer>;
  respondentInfo?: {
    name?: string;
    email?: string;
    title?: string;
    companyName?: string;
  };
}

export const submitPublicAssessment = onCall<SubmitPublicAssessmentInput>(async (request) => {
  assertPayloadWithinLimit(request.data, PUBLIC_ASSESSMENT_LIMITS.maxRequestBytes);
  const { tenantId, requestId, tokenId, rawToken, answers, respondentInfo } = request.data;
  assertSafeIdentifier(tenantId, 'tenantId');
  assertSafeIdentifier(requestId, 'requestId');
  assertSafeIdentifier(tokenId, 'tokenId');
  assertRawToken(rawToken);
  if (respondentInfo !== undefined && (typeof respondentInfo !== 'object' || respondentInfo === null || Array.isArray(respondentInfo))) {
    throw new HttpsError('invalid-argument', 'respondentInfo must be an object.');
  }
  const computedHash = hashAccessToken(rawToken);
  const nowIso = new Date().toISOString();
  const clientIpMasked = maskRequestIp(request.rawRequest.ip);
  const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const submission = await db.runTransaction(async (transaction) => {
    const tokenSnap = await transaction.get(tokenRef);
    const reqSnap = await transaction.get(reqRef);
    if (!tokenSnap.exists || !reqSnap.exists) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }

    const tokenData = tokenSnap.data() as AssessmentAccessToken;
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    const validation = evaluateAccessTokenValidity(tokenData, computedHash, new Date(nowIso));
    if (!validation.isValid || (tokenData.requireEmailVerificationCode && !tokenData.emailVerifiedAt)) {
      throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
    }
    assertTokenRequestBinding(tokenData, reqData, tenantId, requestId, tokenId);
    assertRequestAcceptsResponses(reqData);

    if (respondentInfo) {
      const suppliedName = respondentInfo.name?.trim();
      const suppliedEmail = respondentInfo.email?.toLowerCase().trim();
      const suppliedCompany = respondentInfo.companyName?.trim();
      if (
        (suppliedName !== undefined && suppliedName !== tokenData.recipientName.trim()) ||
        (suppliedEmail !== undefined && suppliedEmail !== tokenData.recipientEmail.toLowerCase().trim()) ||
        (suppliedCompany !== undefined && suppliedCompany !== tokenData.thirdPartyName.trim()) ||
        (respondentInfo.title !== undefined &&
          (typeof respondentInfo.title !== 'string' || respondentInfo.title.length > 200))
      ) {
        throw new HttpsError('invalid-argument', 'Respondent identity must match the issued invitation.');
      }
    }

    const sections = normalizeQuestionnaireSections(reqData);
    if (sections.length === 0 || sections.length > 100) {
      throw new HttpsError('failed-precondition', 'Assessment questionnaire is missing or exceeds the section limit.');
    }
    const answerValidation = validateAndNormalizePublicAssessmentAnswers(sections, answers, nowIso);
    if (!answerValidation.valid) {
      throw new HttpsError(
        'invalid-argument',
        `Submission answers are invalid: ${answerValidation.errors.slice(0, 5).join('; ')}`
      );
    }
    const normalizedAnswers = answerValidation.normalizedAnswers;
    const sectionScores: ExternalAssessmentSubmission['sectionScores'] = {};
    const validationErrors: string[] = [];
    let totalEarnedPoints = 0;
    let totalPossiblePoints = 0;
    let totalQuestionsCount = 0;

    for (const section of sections) {
      let sectionEarnedPoints = 0;
      let sectionPossiblePoints = 0;
      for (const question of section.questions) {
        const visibility = evaluateQuestionVisibility(question, normalizedAnswers);
        if (!visibility.isVisible) continue;
        totalQuestionsCount += 1;
        const answer = normalizedAnswers[question.id];
        const answerValidationResult = validateAnswer(
          { ...question, required: visibility.isRequired },
          answer,
          { checkRequired: visibility.isRequired, checkEvidence: Boolean(question.requiresEvidence) }
        );
        if (!answerValidationResult.valid) validationErrors.push(...answerValidationResult.errors);

        const score = evaluateQuestionScore(question, answer);
        sectionEarnedPoints += score.earnedPoints;
        sectionPossiblePoints += score.maxPoints;
        if (answer) {
          answer.calculatedScore = score.scorePercent;
          answer.isPassing = score.isPassing;
        }
      }
      sectionScores[section.id] = {
        sectionTitle: section.title,
        earnedPoints: sectionEarnedPoints,
        possiblePoints: sectionPossiblePoints,
        scorePercent:
          sectionPossiblePoints > 0
            ? Math.round((sectionEarnedPoints / sectionPossiblePoints) * 100)
            : 0,
      };
      totalEarnedPoints += sectionEarnedPoints;
      totalPossiblePoints += sectionPossiblePoints;
    }

    if (validationErrors.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Submission incomplete: ${validationErrors.slice(0, 5).join('; ')}`
      );
    }
    if (totalQuestionsCount === 0 || totalPossiblePoints <= 0) {
      throw new HttpsError('failed-precondition', 'Assessment questionnaire has no visible, scorable questions.');
    }

    const passingThreshold = reqData.templateSnapshot.passingScoreThreshold;
    if (!Number.isFinite(passingThreshold) || passingThreshold < 0 || passingThreshold > 100) {
      throw new HttpsError('failed-precondition', 'Assessment passing threshold is invalid.');
    }
    const computedScorePercent = Math.round((totalEarnedPoints / totalPossiblePoints) * 100);
    const isPassingThreshold = computedScorePercent >= passingThreshold;
    const submissionId = reqData.activeSubmissionId || `sub_${requestId}`;
    if (reqData.activeSubmissionId) assertSafeIdentifier(reqData.activeSubmissionId, 'activeSubmissionId');
    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const existingSubSnap = await transaction.get(subRef);
    if (existingSubSnap.exists) {
      assertSubmissionRequestBinding(
        existingSubSnap.data() as ExternalAssessmentSubmission,
        tenantId,
        requestId,
        reqData.templateId,
        submissionId
      );
    }
    const reviewOwnerUserId = reqData.ownerUserId || tokenData.issuedByUserId;
    const answeredQuestionsCount = Object.values(normalizedAnswers).filter(
      (answer) =>
        answer.value !== null &&
        answer.value !== undefined &&
        answer.value !== '' &&
        (!Array.isArray(answer.value) || answer.value.length > 0)
    ).length;

    const submissionDoc: ExternalAssessmentSubmission = {
      id: submissionId,
      tenantId,
      requestId,
      templateId: reqData.templateId,
      targetType: reqData.targetType,
      vendorId: reqData.vendorId || null,
      processorProfileId: reqData.processorProfileId || null,
      thirdPartyName: reqData.thirdPartyName,
      status: 'submitted',
      submittedBy: {
        name: tokenData.recipientName,
        email: tokenData.recipientEmail,
        title: respondentInfo?.title?.trim() || '',
        companyName: tokenData.thirdPartyName,
        submittedAt: nowIso,
      },
      computedScorePercent,
      isPassingThreshold,
      sectionScores,
      answers: normalizedAnswers,
      unansweredRequiredCount: 0,
      totalQuestionsCount,
      answeredQuestionsCount,
      ipAddressMasked: clientIpMasked,
      userAgent: null,
      ownerId: reviewOwnerUserId,
      createdBy: 'external_respondent',
      updatedBy: 'external_respondent',
      createdAt: existingSubSnap.exists
        ? (existingSubSnap.data() as ExternalAssessmentSubmission).createdAt
        : nowIso,
      updatedAt: nowIso,
    };

    transaction.set(subRef, submissionDoc);
    transaction.update(reqRef, {
      status: 'submitted',
      submittedAt: nowIso,
      activeSubmissionId: submissionId,
      respondentScorePercent: computedScorePercent,
      respondentPassedThreshold: isPassingThreshold,
      finalScorePercent: null,
      isCompliant: null,
      updatedAt: nowIso,
      updatedBy: 'external_respondent',
    });
    const tokenActivity = createAssessmentTokenActivityUpdate(
      tokenData,
      'final_submission',
      nowIso,
      clientIpMasked
    );
    transaction.update(tokenRef, { ...tokenActivity });
    if (tokenActivity.status) {
      transaction.set(globalTokenRef, { status: tokenActivity.status, updatedAt: nowIso }, { merge: true });
    }
    appendAuditLogInTransaction(transaction, {
      tenantId,
      actorId: 'external_respondent',
      actorEmail: tokenData.recipientEmail,
      actorRole: 'external_respondent',
      actorType: 'external_respondent',
      entityType: 'processor_assessment',
      entityId: requestId,
      action: 'update',
      afterSummary: {
        action: 'assessment_submitted',
        submissionId,
        computedScorePercent,
        isPassingThreshold,
        thirdPartyName: tokenData.thirdPartyName,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_submission',
      ipAddress: clientIpMasked,
    });

    return {
      tokenData,
      submissionId,
      computedScorePercent,
      isPassingThreshold,
      reviewOwnerUserId,
    };
  });

  const postCommitOperations: Array<Promise<unknown>> = [];
  if (submission.reviewOwnerUserId) {
    postCommitOperations.push(createNotification({
      tenantId,
      recipientId: submission.reviewOwnerUserId,
      type: 'processor_assessment_submitted',
      title: 'Assessment Submitted for Review',
      message: `${submission.tokenData.thirdPartyName} has submitted their compliance questionnaire (${submission.computedScorePercent}% respondent self-score) for independent review.`,
      linkUrl: `/assessments/${requestId}`,
      sourceEntityType: 'processor_assessment',
      sourceEntityId: requestId,
      priority: 'high',
      deduplicationKey: `notif_submitted_${requestId}_${submission.submissionId}`,
    }));
  }

  if (postCommitOperations.length > 0) {
    await settlePostCommitOperations('submit_public_assessment', postCommitOperations);
  }

  return {
    success: true,
    submissionId: submission.submissionId,
    submittedAt: nowIso,
    computedScorePercent: submission.computedScorePercent,
    isPassingThreshold: submission.isPassingThreshold,
    message: 'Thank you. Your assessment response has been submitted successfully.',
  };
});

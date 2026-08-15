import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { createNotification } from '../lib/notifications.js';
import { recordAuditLog } from '../lib/audit.js';
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
  ProcessorAssessment,
  DynamicQuestionnaireSection,
  ExternalAssessmentSubmission,
  QuestionnaireAnswer,
  evaluateQuestionVisibility,
  evaluateQuestionScore,
  validateAnswer,
} from '@eurogovernance/shared-types';

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

  const {
    tenantId,
    requestId,
    recipientEmail,
    recipientName,
    thirdPartyName,
    templateId,
    validityDays = 30,
    tokenType = 'multi_use_session',
    maxUses = 50,
    requireEmailVerificationCode = false,
  } = data;

  if (!tenantId || !requestId || !recipientEmail) {
    throw new HttpsError('invalid-argument', 'tenantId, requestId, and recipientEmail are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const cleanEmail = recipientEmail.toLowerCase().trim();
  const now = new Date();
  const nowIso = now.toISOString();
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  const { token: rawToken, tokenHash } = generateSecureAccessToken();
  const tokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;

  const tokenRecord: AssessmentAccessToken = {
    id: tokenId,
    tenantId,
    requestId,
    templateId,
    recipientEmail: cleanEmail,
    recipientName: recipientName || cleanEmail,
    thirdPartyName: thirdPartyName || 'Third Party',
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

  const batch = db.batch();

  // 1. Write tenant-scoped token doc
  const tenantTokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  batch.set(tenantTokenRef, tokenRecord);

  // 2. Write global lookup token doc (keyed by tokenId, storing tenantId & hash for O(1) public lookup)
  const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
  batch.set(globalTokenRef, {
    tokenId,
    tenantId,
    requestId,
    tokenHash,
    status: 'active',
    expiresAt,
    updatedAt: nowIso,
  });

  // 3. Update parent assessment request if exists
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const reqSnap = await reqRef.get();
  if (reqSnap.exists) {
    batch.update(reqRef, {
      status: 'dispatched',
      dispatchedAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
  }

  // 4. Update legacy processor_assessments if exists
  const legacyReqRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(requestId);
  const legacySnap = await legacyReqRef.get();
  if (legacySnap.exists) {
    batch.update(legacyReqRef, {
      status: 'sent',
      sentAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
  }

  await batch.commit();

  await recordAuditLog({
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
    },
    source: 'cloud_function',
    workflowContext: 'third_party_assessment_dispatch',
  });

  const accessUrl = `https://app.eurogovernance.eu/portal/assessments/${requestId}?tokenId=${tokenId}&token=${rawToken}`;

  const result: IssueAssessmentAccessTokenResult = {
    success: true,
    tokenId,
    rawToken,
    accessUrl,
    expiresAt,
    recipientEmail: cleanEmail,
  };

  return result;
});

// -----------------------------------------------------------------------------
// 2. VALIDATE ASSESSMENT ACCESS TOKEN (Public External Respondent)
// -----------------------------------------------------------------------------

export const validateAssessmentAccessToken = onCall<ValidateAssessmentAccessTokenInput>(async (request) => {
  const { tenantId, requestId, rawToken, clientIpMasked } = request.data;

  if (!tenantId || !requestId || !rawToken) {
    throw new HttpsError('invalid-argument', 'tenantId, requestId, and rawToken are required.');
  }

  const computedHash = hashAccessToken(rawToken);

  // Query token in tenant collection
  const tokenQuerySnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('tokenHash', '==', computedHash)
    .limit(1)
    .get();

  if (tokenQuerySnap.empty || !tokenQuerySnap.docs[0]) {
    throw new HttpsError('permission-denied', 'Invalid or unverified access link.');
  }

  const tokenDoc = tokenQuerySnap.docs[0];
  const tokenData = tokenDoc.data() as AssessmentAccessToken;

  const now = new Date();
  const validation = evaluateAccessTokenValidity(tokenData, computedHash, now);

  if (!validation.isValid) {
    throw new HttpsError('permission-denied', validation.error || 'Access link is not valid.');
  }

  // Check email 2FA if required
  if (tokenData.requireEmailVerificationCode && !tokenData.emailVerifiedAt) {
    // Return partial response signaling email code is needed
    return {
      requiresEmailVerification: true,
      recipientEmailMasked: tokenData.recipientEmail.replace(/(.{2})(.*)(?=@)/, '$1***'),
      isEmailVerified: false,
    };
  }

  // Increment usage count and record last access
  const nowIso = now.toISOString();
  await tokenDoc.ref.update({
    useCount: (tokenData.useCount || 0) + 1,
    lastAccessedAt: nowIso,
    lastAccessedIpMasked: clientIpMasked || null,
    updatedAt: nowIso,
  });

  // Fetch Assessment Request to get sanitized questionnaire
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const reqSnap = await reqRef.get();

  let sections: DynamicQuestionnaireSection[] = [];
  let existingAnswers = {};
  let templateTitle = 'Third-Party Compliance & Risk Assessment';
  let templateDescription = '';
  let thirdPartyName = tokenData.thirdPartyName;
  let recipientName = tokenData.recipientName;
  let recipientEmail = tokenData.recipientEmail;
  let dueDate = tokenData.expiresAt;
  let status = 'in_progress';

  if (reqSnap.exists) {
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    templateTitle = reqData.templateSnapshot?.title || reqData.title || templateTitle;
    templateDescription = reqData.templateSnapshot?.description || '';
    thirdPartyName = reqData.thirdPartyName || thirdPartyName;
    recipientName = reqData.respondent?.name || recipientName;
    recipientEmail = reqData.respondent?.email || recipientEmail;
    dueDate = reqData.dueDate || dueDate;
    status = reqData.status;

    if (reqData.templateSnapshot?.sections) {
      sections = reqData.templateSnapshot.sections as unknown as DynamicQuestionnaireSection[];
    }

    // If active submission exists, load saved answers
    if (reqData.activeSubmissionId) {
      const subSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('assessment_submissions')
        .doc(reqData.activeSubmissionId)
        .get();
      if (subSnap.exists) {
        existingAnswers = subSnap.data()?.answers || {};
      }
    }
  } else {
    // Check legacy processor_assessments collection
    const legacyRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(requestId);
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists) {
      const legacyData = legacySnap.data() as ProcessorAssessment;
      templateTitle = legacyData.title;
      thirdPartyName = legacyData.vendorName;
      recipientName = legacyData.respondent?.name || recipientName;
      recipientEmail = legacyData.respondent?.email || recipientEmail;
      dueDate = legacyData.dueDate;
      status = legacyData.status;
      sections = (legacyData.sections || []) as unknown as DynamicQuestionnaireSection[];
      existingAnswers = legacyData.answers || {};
    }
  }

  // Construct sanitized public view
  const sanitizedView: SanitizedPublicAssessmentView = {
    requestId,
    tenantId,
    templateTitle,
    templateDescription,
    thirdPartyName,
    recipientName,
    recipientEmail,
    dueDate,
    status,
    sections,
    existingAnswers: existingAnswers as any,
    tokenExpiresAt: tokenData.expiresAt,
    requiresEmailVerification: tokenData.requireEmailVerificationCode,
    isEmailVerified: true,
  };

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

  const { tenantId, tokenId, requestId, reason } = data;
  if (!tenantId || !tokenId) {
    throw new HttpsError('invalid-argument', 'tenantId and tokenId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
  const tokenSnap = await tokenRef.get();

  if (!tokenSnap.exists) {
    throw new HttpsError('not-found', 'Assessment access token not found.');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  batch.update(tokenRef, {
    status: 'revoked',
    revokedAt: nowIso,
    revokedBy: authContext.userId,
    revocationReason: reason || 'Revoked by compliance administrator.',
    updatedAt: nowIso,
    updatedBy: authContext.userId,
  });

  // Mirror update on global token doc
  const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
  batch.update(globalTokenRef, {
    status: 'revoked',
    updatedAt: nowIso,
  });

  await batch.commit();

  await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType: 'processor_assessment',
    entityId: requestId || tokenId,
    action: 'delete',
    afterSummary: {
      action: 'assessment_token_revoked',
      tokenId,
      reason,
    },
    source: 'cloud_function',
    workflowContext: 'third_party_assessment_revocation',
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

  const { tenantId, requestId, reason, validityDays = 30, requireEmailVerificationCode = false } = data;
  if (!tenantId || !requestId) {
    throw new HttpsError('invalid-argument', 'tenantId and requestId are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const now = new Date();
  const nowIso = now.toISOString();

  // Find and supersede existing active tokens for this requestId
  const existingTokensSnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('status', '==', 'active')
    .get();

  const batch = db.batch();

  for (const doc of existingTokensSnap.docs) {
    batch.update(doc.ref, {
      status: 'superseded',
      revokedAt: nowIso,
      revokedBy: authContext.userId,
      revocationReason: reason || 'Superseded by newly regenerated access link.',
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
    batch.update(db.collection('assessment_access_tokens').doc(doc.id), {
      status: 'superseded',
      updatedAt: nowIso,
    });
  }

  // Fetch assessment request to obtain recipient info
  let recipientEmail = 'respondent@example.eu';
  let recipientName = 'Respondent';
  let thirdPartyName = 'Third Party';
  let templateId = 'tmpl_default';

  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const reqSnap = await reqRef.get();

  if (reqSnap.exists) {
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    recipientEmail = reqData.respondent?.email || recipientEmail;
    recipientName = reqData.respondent?.name || recipientName;
    thirdPartyName = reqData.thirdPartyName || thirdPartyName;
    templateId = reqData.templateId || templateId;
  }

  const { token: rawToken, tokenHash } = generateSecureAccessToken();
  const newTokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;
  const expiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

  const newTokenRecord: AssessmentAccessToken = {
    id: newTokenId,
    tenantId,
    requestId,
    templateId,
    recipientEmail: recipientEmail.toLowerCase().trim(),
    recipientName,
    thirdPartyName,
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

  const newTokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(newTokenId);
  batch.set(newTokenRef, newTokenRecord);

  const globalTokenRef = db.collection('assessment_access_tokens').doc(newTokenId);
  batch.set(globalTokenRef, {
    tokenId: newTokenId,
    tenantId,
    requestId,
    tokenHash,
    status: 'active',
    expiresAt,
    updatedAt: nowIso,
  });

  if (reqSnap.exists) {
    batch.update(reqRef, {
      status: 'dispatched',
      dispatchedAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt: expiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });
  }

  await batch.commit();

  await recordAuditLog({
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

  const accessUrl = `https://app.eurogovernance.eu/portal/assessments/${requestId}?tokenId=${newTokenId}&token=${rawToken}`;

  return {
    success: true,
    tokenId: newTokenId,
    rawToken,
    accessUrl,
    expiresAt,
    recipientEmail,
  };
});

// -----------------------------------------------------------------------------
// 5. SAVE PUBLIC ASSESSMENT DRAFT (Public External Respondent with Valid Token)
// -----------------------------------------------------------------------------

export interface SavePublicAssessmentDraftInput {
  tenantId: string;
  requestId: string;
  rawToken: string;
  answers: Record<string, QuestionnaireAnswer>;
  clientIpMasked?: string;
}

export const savePublicAssessmentDraft = onCall<SavePublicAssessmentDraftInput>(async (request) => {
  const { tenantId, requestId, rawToken, answers, clientIpMasked } = request.data;
  if (!tenantId || !requestId || !rawToken || !answers) {
    throw new HttpsError('invalid-argument', 'tenantId, requestId, rawToken, and answers are required.');
  }

  const computedHash = hashAccessToken(rawToken);

  const tokenQuerySnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('tokenHash', '==', computedHash)
    .limit(1)
    .get();

  if (tokenQuerySnap.empty || !tokenQuerySnap.docs[0]) {
    throw new HttpsError('permission-denied', 'Invalid access token.');
  }

  const tokenDoc = tokenQuerySnap.docs[0];
  const tokenData = tokenDoc.data() as AssessmentAccessToken;

  const validation = evaluateAccessTokenValidity(tokenData, computedHash, new Date());
  if (!validation.isValid) {
    throw new HttpsError('permission-denied', validation.error || 'Access token is no longer valid.');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  // 1. Fetch Assessment Request
  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const reqSnap = await reqRef.get();

  let submissionId = tokenData.requestId ? `sub_${tokenData.requestId}` : `sub_${crypto.randomBytes(12).toString('hex')}`;

  if (reqSnap.exists) {
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    if (reqData.activeSubmissionId) {
      submissionId = reqData.activeSubmissionId;
    }

    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const subSnap = await subRef.get();

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
      answers,
      unansweredRequiredCount: 0,
      totalQuestionsCount: Object.keys(answers).length,
      answeredQuestionsCount: Object.values(answers).filter((a) => a.value !== null && a.value !== undefined && a.value !== '').length,
      ipAddressMasked: clientIpMasked || null,
      userAgent: null,
      ownerId: tokenData.issuedByUserId,
      createdBy: 'external_respondent',
      updatedBy: 'external_respondent',
      createdAt: subSnap.exists ? (subSnap.data() as ExternalAssessmentSubmission).createdAt : nowIso,
      updatedAt: nowIso,
    };

    batch.set(subRef, submissionDoc);

    const updateReqPayload: Partial<ThirdPartyAssessmentRequest> = {
      activeSubmissionId: submissionId,
      updatedAt: nowIso,
      updatedBy: 'external_respondent',
    };

    if (reqData.status === 'sent' || reqData.status === 'dispatched' || reqData.status === 'opened') {
      updateReqPayload.status = 'in_progress';
      updateReqPayload.startedAt = reqData.startedAt || nowIso;
    }

    batch.update(reqRef, updateReqPayload);
  } else {
    // Legacy processor_assessments fallback
    const legacyRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(requestId);
    const legacySnap = await legacyRef.get();
    if (legacySnap.exists) {
      batch.update(legacyRef, {
        answers,
        status: 'in_progress',
        updatedAt: nowIso,
      });
    }
  }

  // Update token usage
  batch.update(tokenDoc.ref, {
    useCount: (tokenData.useCount || 0) + 1,
    lastAccessedAt: nowIso,
    updatedAt: nowIso,
  });

  await batch.commit();

  return {
    success: true,
    submissionId,
    savedAt: nowIso,
    answeredCount: Object.values(answers).filter((a) => a.value !== null && a.value !== undefined && a.value !== '').length,
  };
});

// -----------------------------------------------------------------------------
// 6. SUBMIT PUBLIC ASSESSMENT (Public External Respondent with Valid Token)
// -----------------------------------------------------------------------------

export interface SubmitPublicAssessmentInput {
  tenantId: string;
  requestId: string;
  rawToken: string;
  answers: Record<string, QuestionnaireAnswer>;
  respondentInfo?: {
    name?: string;
    email?: string;
    title?: string;
    companyName?: string;
  };
  clientIpMasked?: string;
}

export const submitPublicAssessment = onCall<SubmitPublicAssessmentInput>(async (request) => {
  const { tenantId, requestId, rawToken, answers, respondentInfo, clientIpMasked } = request.data;
  if (!tenantId || !requestId || !rawToken || !answers) {
    throw new HttpsError('invalid-argument', 'tenantId, requestId, rawToken, and answers are required.');
  }

  const computedHash = hashAccessToken(rawToken);

  const tokenQuerySnap = await db
    .collection('tenants')
    .doc(tenantId)
    .collection('assessment_access_tokens')
    .where('requestId', '==', requestId)
    .where('tokenHash', '==', computedHash)
    .limit(1)
    .get();

  if (tokenQuerySnap.empty || !tokenQuerySnap.docs[0]) {
    throw new HttpsError('permission-denied', 'Invalid access token.');
  }

  const tokenDoc = tokenQuerySnap.docs[0];
  const tokenData = tokenDoc.data() as AssessmentAccessToken;

  const validation = evaluateAccessTokenValidity(tokenData, computedHash, new Date());
  if (!validation.isValid) {
    throw new HttpsError('permission-denied', validation.error || 'Access token is no longer valid.');
  }

  const nowIso = new Date().toISOString();
  const batch = db.batch();

  const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
  const reqSnap = await reqRef.get();

  let computedScorePercent = 100;
  let isPassingThreshold = true;
  let sectionScores: Record<string, any> = {};
  let submissionId = `sub_${requestId}`;
  let reviewOwnerUserId = tokenData.issuedByUserId;

  if (reqSnap.exists) {
    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    reviewOwnerUserId = reqData.ownerUserId || reviewOwnerUserId;
    if (reqData.activeSubmissionId) {
      submissionId = reqData.activeSubmissionId;
    }

    const sections = (reqData.templateSnapshot?.sections || []) as unknown as DynamicQuestionnaireSection[];
    const passingThreshold = reqData.templateSnapshot?.passingScoreThreshold || 70;

    let totalEarnedPoints = 0;
    let totalPossiblePoints = 0;
    let missingRequiredQuestions: string[] = [];

    // Evaluate answers across all sections
    for (const sec of sections) {
      let secEarned = 0;
      let secPossible = 0;

      for (const q of sec.questions) {
        const vis = evaluateQuestionVisibility(q, answers);
        if (vis.isVisible) {
          const ans = answers[q.id];
          const ansValidation = validateAnswer(q, ans, {
            checkRequired: vis.isRequired,
            checkEvidence: q.requiresEvidence,
          });

          if (!ansValidation.valid) {
            missingRequiredQuestions.push(...ansValidation.errors);
          }

          const scoreRes = evaluateQuestionScore(q, ans);
          secEarned += scoreRes.earnedPoints;
          secPossible += scoreRes.maxPoints;

          // Annotate answer with calculated score
          if (ans) {
            ans.calculatedScore = scoreRes.scorePercent;
            ans.isPassing = scoreRes.isPassing;
          }
        }
      }

      const secScorePercent = secPossible > 0 ? Math.round((secEarned / secPossible) * 100) : 100;
      sectionScores[sec.id] = {
        sectionTitle: sec.title,
        earnedPoints: secEarned,
        possiblePoints: secPossible,
        scorePercent: secScorePercent,
      };

      totalEarnedPoints += secEarned;
      totalPossiblePoints += secPossible;
    }

    if (missingRequiredQuestions.length > 0) {
      throw new HttpsError(
        'failed-precondition',
        `Submission incomplete: ${missingRequiredQuestions.slice(0, 5).join('; ')}`
      );
    }

    computedScorePercent = totalPossiblePoints > 0 ? Math.round((totalEarnedPoints / totalPossiblePoints) * 100) : 100;
    isPassingThreshold = computedScorePercent >= passingThreshold;

    const subDoc: ExternalAssessmentSubmission = {
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
        name: respondentInfo?.name || tokenData.recipientName,
        email: respondentInfo?.email || tokenData.recipientEmail,
        title: respondentInfo?.title || '',
        companyName: respondentInfo?.companyName || tokenData.thirdPartyName,
        submittedAt: nowIso,
      },
      computedScorePercent,
      isPassingThreshold,
      sectionScores,
      answers,
      unansweredRequiredCount: 0,
      totalQuestionsCount: sections.reduce((acc, s) => acc + s.questions.length, 0),
      answeredQuestionsCount: Object.values(answers).filter((a) => a.value !== null && a.value !== undefined && a.value !== '').length,
      ipAddressMasked: clientIpMasked || null,
      userAgent: null,
      ownerId: reviewOwnerUserId,
      createdBy: 'external_respondent',
      updatedBy: 'external_respondent',
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    batch.set(subRef, subDoc);

    batch.update(reqRef, {
      status: 'submitted',
      submittedAt: nowIso,
      activeSubmissionId: submissionId,
      finalScorePercent: computedScorePercent,
      isCompliant: isPassingThreshold,
      updatedAt: nowIso,
      updatedBy: 'external_respondent',
    });
  }

  // Exhaust token if single-use
  if (tokenData.tokenType === 'single_use') {
    batch.update(tokenDoc.ref, {
      status: 'used',
      useCount: (tokenData.useCount || 0) + 1,
      lastAccessedAt: nowIso,
      updatedAt: nowIso,
    });
  } else {
    batch.update(tokenDoc.ref, {
      useCount: (tokenData.useCount || 0) + 1,
      lastAccessedAt: nowIso,
      updatedAt: nowIso,
    });
  }

  await batch.commit();

  // Create In-App Notification for internal compliance reviewer
  if (reviewOwnerUserId) {
    await createNotification({
      tenantId,
      recipientId: reviewOwnerUserId,
      type: 'processor_assessment_submitted',
      title: 'Assessment Submitted for Review',
      message: `${tokenData.thirdPartyName} has submitted their compliance questionnaire (${computedScorePercent}% score).`,
      linkUrl: `/assessments/${requestId}`,
      sourceEntityType: 'processor_assessment',
      sourceEntityId: requestId,
      priority: 'high',
    });
  }

  await recordAuditLog({
    tenantId,
    actorId: 'external_respondent',
    actorEmail: tokenData.recipientEmail,
    actorRole: 'contributor',
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
  });

  return {
    success: true,
    submissionId,
    submittedAt: nowIso,
    computedScorePercent,
    isPassingThreshold,
    message: 'Thank you. Your assessment response has been submitted successfully.',
  };
});

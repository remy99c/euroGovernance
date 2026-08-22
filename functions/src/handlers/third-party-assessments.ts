import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { appendAuditLogInTransaction, recordAuditLog } from '../lib/audit.js';
import { buildDeploymentAssessmentPortalAccessUrl } from '../lib/assessment-portal-url.js';
import { createNotification } from '../lib/notifications.js';
import {
  ThirdPartyAssessmentRequest,
  AssessmentTargetType,
  AssessmentRequestType,
  AssessmentRespondentContact,
  AssessmentRecurrenceCadence,
  QuestionnaireTemplate,
  AssessmentAccessToken,
  ExternalAssessmentSubmission,
  SubmissionReview,
  SubmissionReviewDecision,
  QuestionReviewFinding,
  AssessmentRiskTier,
  Vendor,
  VendorRiskTier,
  Risk,
  RecurringAssessmentSchedule,
  DynamicQuestionnaireSection,
  NotificationType,
  ThirdPartyAssessmentSummaryMetrics,
  calculateThirdPartyAssessmentSummaryMetrics,
  analyzeSubmissionRiskPosture,
  validateThirdPartyAssessmentRequest,
  isValidRequestStateTransition,
} from '@eurogovernance/shared-types';

/**
 * Generates a cryptographically secure 256-bit token and its SHA-256 hash.
 */
function generateTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

function rejectLegacyAssessmentTokenIssuance(): void {
  throw new HttpsError(
    'failed-precondition',
    'Use the hardened assessment access-token commands to issue or regenerate external links.'
  );
}

const SAFE_DOCUMENT_ID = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const ASSESSMENT_RISK_TIERS = new Set<AssessmentRiskTier>(['low', 'medium', 'high', 'critical']);

function assertSafeDocumentId(value: unknown, fieldName: string): asserts value is string {
  if (typeof value !== 'string' || !SAFE_DOCUMENT_ID.test(value)) {
    throw new HttpsError('invalid-argument', `${fieldName} must be a valid document identifier.`);
  }
}

function boundedReviewText(value: unknown, fieldName: string, required: boolean): string | null {
  if (value === undefined || value === null) {
    if (required) throw new HttpsError('invalid-argument', `${fieldName} is required.`);
    return null;
  }
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${fieldName} must be text.`);
  }
  const normalized = value.trim();
  if ((required && normalized.length < 10) || normalized.length > 5000) {
    throw new HttpsError(
      'invalid-argument',
      `${fieldName} must be ${required ? 'between 10 and 5000' : 'at most 5000'} characters.`
    );
  }
  return normalized || null;
}

function validateQuestionReviewFindings(
  value: unknown,
  submission: ExternalAssessmentSubmission
): Record<string, QuestionReviewFinding> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const entries = Object.entries(value);
  if (entries.length > 500) {
    throw new HttpsError('invalid-argument', 'questionFindings exceeds the 500-item limit.');
  }

  const normalized: Record<string, QuestionReviewFinding> = {};
  for (const [questionId, rawFinding] of entries) {
    if (!SAFE_DOCUMENT_ID.test(questionId) || !submission.answers[questionId]) {
      throw new HttpsError('invalid-argument', 'Every finding must reference an answer in the bound submission.');
    }
    if (!rawFinding || typeof rawFinding !== 'object' || Array.isArray(rawFinding)) {
      throw new HttpsError('invalid-argument', `Finding '${questionId}' must be an object.`);
    }
    const finding = rawFinding as Partial<QuestionReviewFinding>;
    if (
      finding.questionId !== questionId ||
      typeof finding.questionCode !== 'string' ||
      finding.questionCode !== submission.answers[questionId]?.questionCode ||
      !['ok', 'concern', 'gap', 'critical_finding'].includes(finding.flag || '') ||
      (finding.remediationRequired !== undefined && typeof finding.remediationRequired !== 'boolean')
    ) {
      throw new HttpsError('invalid-argument', `Finding '${questionId}' does not match the bound submission answer.`);
    }
    const reviewerFindingNotes = boundedReviewText(
      finding.reviewerNotes,
      `questionFindings.${questionId}.reviewerNotes`,
      false
    );
    normalized[questionId] = {
      questionId,
      questionCode: finding.questionCode,
      flag: finding.flag!,
      reviewerNotes: reviewerFindingNotes || undefined,
      remediationRequired: finding.remediationRequired ?? false,
    };
  }
  return normalized;
}

// -----------------------------------------------------------------------------
// 1. CREATE ASSESSMENT REQUEST (Tenant Compliance / Admin)
// -----------------------------------------------------------------------------

export interface CreateThirdPartyAssessmentRequestInput {
  tenantId: string;
  title: string;
  templateId: string;
  targetType: AssessmentTargetType;
  thirdPartyName: string;
  vendorId?: string | null;
  processorProfileId?: string | null;
  prospectCompanyName?: string | null;
  prospectWebsite?: string | null;
  respondent: AssessmentRespondentContact;
  requestType?: AssessmentRequestType;
  dueDate: string;
  isRecurring?: boolean;
  recurrenceCadence?: AssessmentRecurrenceCadence;
  ownerUserId: string;
  linkedSystemAssetIds?: string[];
  linkedControlIds?: string[];
  linkedEvidenceIds?: string[];
  linkedRiskIds?: string[];
  autoSend?: boolean;
  validityDays?: number;
}

export const createThirdPartyAssessmentRequest = onCall<CreateThirdPartyAssessmentRequestInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      tenantId,
      title,
      templateId,
      targetType,
      thirdPartyName,
      vendorId = null,
      processorProfileId = null,
      prospectCompanyName = null,
      prospectWebsite = null,
      respondent,
      requestType = 'one_time_due_diligence',
      dueDate,
      isRecurring = false,
      recurrenceCadence = 'none',
      ownerUserId,
      linkedSystemAssetIds = [],
      linkedControlIds = [],
      linkedEvidenceIds = [],
      linkedRiskIds = [],
      autoSend = false,
      validityDays = 30,
    } = data;

    if (!tenantId || !title || !templateId || !thirdPartyName || !respondent?.email) {
      throw new HttpsError('invalid-argument', 'tenantId, title, templateId, thirdPartyName, and respondent.email are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
    ]);

    if (autoSend) {
      rejectLegacyAssessmentTokenIssuance();
    }

    // Fetch Template snapshot
    const templateRef = db.collection('tenants').doc(tenantId).collection('questionnaire_templates').doc(templateId);
    const templateSnap = await templateRef.get();

    if (!templateSnap.exists) {
      throw new HttpsError('failed-precondition', 'A published tenant questionnaire template is required.');
    }
    const templateSnapshot = templateSnap.data() as QuestionnaireTemplate;
    if (
      templateSnapshot.id !== templateId ||
      templateSnapshot.tenantId !== tenantId ||
      templateSnapshot.status !== 'published' ||
      !Array.isArray(templateSnapshot.sections) ||
      templateSnapshot.sections.length === 0
    ) {
      throw new HttpsError('failed-precondition', 'The questionnaire template is not published or has no questions.');
    }

    const requestId = `req_${crypto.randomBytes(12).toString('hex')}`;
    const now = new Date();
    const nowIso = now.toISOString();

    const requestDoc: ThirdPartyAssessmentRequest = {
      id: requestId,
      tenantId,
      title,
      campaignId: null,
      templateId,
      templateSnapshot,
      targetType,
      thirdPartyName,
      vendorId: vendorId || null,
      processorProfileId: processorProfileId || null,
      prospectCompanyName: prospectCompanyName || (targetType === 'prospective_vendor' ? thirdPartyName : null),
      prospectWebsite: prospectWebsite || null,
      respondent: {
        name: respondent.name || respondent.email,
        email: respondent.email.toLowerCase().trim(),
        title: respondent.title || '',
        companyName: respondent.companyName || thirdPartyName,
        phone: respondent.phone || '',
      },
      accessTokenHash: undefined,
      tokenExpiresAt: undefined,
      accessCount: 0,
      lastAccessedAt: null,
      requestType,
      status: 'draft',
      dueDate,
      dispatchedAt: null,
      startedAt: null,
      submittedAt: null,
      activeSubmissionId: null,
      isRecurring,
      recurrenceCadence,
      recurrenceScheduleId: null,
      previousRequestId: null,
      renewalRequestId: null,
      nextDueDate: null,
      ownerUserId: ownerUserId || authContext.userId,
      linkedSystemAssetIds,
      linkedControlIds,
      linkedEvidenceIds,
      linkedRiskIds,
      finalScorePercent: null,
      overallRiskRating: null,
      isCompliant: null,
      reviewedBy: null,
      reviewedAt: null,
      ownerId: authContext.userId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const validation = validateThirdPartyAssessmentRequest(requestDoc);
    if (!validation.valid) {
      throw new HttpsError('invalid-argument', `Invalid assessment request payload: ${validation.errors.join(', ')}`);
    }

    const batch = db.batch();
    const requestRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);

    let rawToken: string | undefined;
    let accessUrl: string | undefined;

    if (autoSend) {
      const tokenPair = generateTokenPair();
      rawToken = tokenPair.rawToken;
      const tokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;
      const tokenExpiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

      requestDoc.status = 'sent';
      requestDoc.dispatchedAt = nowIso;
      requestDoc.accessTokenHash = tokenPair.tokenHash;
      requestDoc.tokenExpiresAt = tokenExpiresAt;

      const tokenRecord: AssessmentAccessToken = {
        id: tokenId,
        tenantId,
        requestId,
        templateId,
        recipientEmail: requestDoc.respondent.email,
        recipientName: requestDoc.respondent.name,
        thirdPartyName: requestDoc.thirdPartyName,
        tokenHash: tokenPair.tokenHash,
        tokenType: 'multi_use_session',
        status: 'active',
        maxUses: 50,
        useCount: 0,
        expiresAt: tokenExpiresAt,
        lastAccessedAt: null,
        lastAccessedIpMasked: null,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
        requireEmailVerificationCode: false,
        issuedByUserId: authContext.userId,
        issuedAt: nowIso,
        ownerId: authContext.userId,
        createdBy: authContext.userId,
        updatedBy: authContext.userId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
      batch.set(tokenRef, tokenRecord);

      const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
      batch.set(globalTokenRef, {
        tokenId,
        tenantId,
        requestId,
        tokenHash: tokenPair.tokenHash,
        status: 'active',
        expiresAt: tokenExpiresAt,
        updatedAt: nowIso,
      });

      accessUrl = buildDeploymentAssessmentPortalAccessUrl({ tenantId, requestId, tokenId, rawToken });
    }

    batch.set(requestRef, requestDoc);
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
        title,
        targetType,
        thirdPartyName,
        recipientEmail: requestDoc.respondent.email,
        status: requestDoc.status,
        autoSend,
      },
      source: 'cloud_function',
      workflowContext: 'assessment_request_creation',
    });

    return {
      success: true,
      requestId,
      status: requestDoc.status,
      rawToken,
      accessUrl,
    };
  }
);

// -----------------------------------------------------------------------------
// 2. SEND ASSESSMENT REQUEST WITH DUPLICATE PROTECTION (Compliance / Admin)
// -----------------------------------------------------------------------------

export interface SendThirdPartyAssessmentRequestInput {
  tenantId: string;
  requestId: string;
  validityDays?: number;
  forceResend?: boolean;
}

export const sendThirdPartyAssessmentRequest = onCall<SendThirdPartyAssessmentRequestInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId, requestId, validityDays = 30, forceResend = false } = data;
    if (!tenantId || !requestId) {
      throw new HttpsError('invalid-argument', 'tenantId and requestId are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
    ]);

    rejectLegacyAssessmentTokenIssuance();

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Assessment request not found.');
    }

    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;

    // Duplicate Send Protection
    if (!forceResend) {
      if (reqData.status === 'sent' || reqData.status === 'opened' || reqData.status === 'in_progress') {
        const tokenExpiresTime = reqData.tokenExpiresAt ? new Date(reqData.tokenExpiresAt).getTime() : 0;
        if (tokenExpiresTime > Date.now()) {
          throw new HttpsError(
            'failed-precondition',
            `Assessment request is already dispatched and active until ${reqData.tokenExpiresAt}. Pass forceResend: true to regenerate and resend.`
          );
        }
      }
    }

    const now = new Date();
    const nowIso = now.toISOString();
    const tokenExpiresAt = new Date(now.getTime() + validityDays * 24 * 60 * 60 * 1000).toISOString();

    const batch = db.batch();

    // If forceResend or resend, supersede any previous active tokens
    const existingTokensSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('assessment_access_tokens')
      .where('requestId', '==', requestId)
      .where('status', '==', 'active')
      .get();

    for (const doc of existingTokensSnap.docs) {
      batch.update(doc.ref, {
        status: 'superseded',
        revokedAt: nowIso,
        revokedBy: authContext.userId,
        revocationReason: 'Superseded by re-dispatched access link.',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
      batch.update(db.collection('assessment_access_tokens').doc(doc.id), {
        status: 'superseded',
        updatedAt: nowIso,
      });
    }

    const { rawToken, tokenHash } = generateTokenPair();
    const tokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;

    const tokenRecord: AssessmentAccessToken = {
      id: tokenId,
      tenantId,
      requestId,
      templateId: reqData.templateId,
      recipientEmail: reqData.respondent.email,
      recipientName: reqData.respondent.name,
      thirdPartyName: reqData.thirdPartyName,
      tokenHash,
      tokenType: 'multi_use_session',
      status: 'active',
      maxUses: 50,
      useCount: 0,
      expiresAt: tokenExpiresAt,
      lastAccessedAt: null,
      lastAccessedIpMasked: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      requireEmailVerificationCode: false,
      issuedByUserId: authContext.userId,
      issuedAt: nowIso,
      ownerId: authContext.userId,
      createdBy: authContext.userId,
      updatedBy: authContext.userId,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(tokenId);
    batch.set(tokenRef, tokenRecord);

    const globalTokenRef = db.collection('assessment_access_tokens').doc(tokenId);
    batch.set(globalTokenRef, {
      tokenId,
      tenantId,
      requestId,
      tokenHash,
      status: 'active',
      expiresAt: tokenExpiresAt,
      updatedAt: nowIso,
    });

    batch.update(reqRef, {
      status: 'sent',
      dispatchedAt: nowIso,
      accessTokenHash: tokenHash,
      tokenExpiresAt,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });

    // Validate the per-environment portal origin before committing the only
    // copy of the raw bearer credential.
    const accessUrl = buildDeploymentAssessmentPortalAccessUrl({ tenantId, requestId, tokenId, rawToken });
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
        action: 'assessment_request_dispatched',
        recipientEmail: reqData.respondent.email,
        tokenId,
        tokenExpiresAt,
        forceResend,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_dispatch',
    });

    const notifRecipient = reqData.ownerUserId || authContext.userId;
    await createNotification({
      tenantId,
      recipientId: notifRecipient,
      title: `Assessment Dispatched: ${reqData.thirdPartyName}`,
      message: `Questionnaire invitation dispatched to ${reqData.respondent.name} (${reqData.respondent.email}).`,
      type: 'assessment_request_sent',
      priority: 'low',
      linkUrl: `/assessments`,
      sourceEntityType: 'processor_assessment',
      sourceEntityId: requestId,
      deduplicationKey: `notif_sent_${requestId}`,
    });

    return {
      success: true,
      requestId,
      status: 'sent',
      tokenId,
      rawToken,
      accessUrl,
      expiresAt: tokenExpiresAt,
    };
  }
);

// -----------------------------------------------------------------------------
// 3. CANCEL ASSESSMENT REQUEST (Compliance / Admin)
// -----------------------------------------------------------------------------

export interface CancelThirdPartyAssessmentRequestInput {
  tenantId: string;
  requestId: string;
  reason: string;
}

export const cancelThirdPartyAssessmentRequest = onCall<CancelThirdPartyAssessmentRequestInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId, requestId, reason } = data;
    if (!tenantId || !requestId) {
      throw new HttpsError('invalid-argument', 'tenantId and requestId are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
    ]);

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Assessment request not found.');
    }

    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    if (!isValidRequestStateTransition(reqData.status, 'canceled')) {
      throw new HttpsError('failed-precondition', `Cannot cancel assessment in status '${reqData.status}'.`);
    }

    const nowIso = new Date().toISOString();
    const batch = db.batch();

    // Revoke any active access tokens
    const tokensSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('assessment_access_tokens')
      .where('requestId', '==', requestId)
      .where('status', '==', 'active')
      .get();

    for (const doc of tokensSnap.docs) {
      batch.update(doc.ref, {
        status: 'revoked',
        revokedAt: nowIso,
        revokedBy: authContext.userId,
        revocationReason: reason || 'Assessment request was canceled.',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
      batch.update(db.collection('assessment_access_tokens').doc(doc.id), {
        status: 'revoked',
        updatedAt: nowIso,
      });
    }

    batch.update(reqRef, {
      status: 'canceled',
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });

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
        action: 'assessment_request_canceled',
        reason,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_cancellation',
    });

    return {
      success: true,
      requestId,
      status: 'canceled',
    };
  }
);

// -----------------------------------------------------------------------------
// 4. REVIEW THIRD-PARTY ASSESSMENT SUBMISSION (Compliance / Admin / Approver)
// -----------------------------------------------------------------------------

export interface ReviewThirdPartyAssessmentSubmissionInput {
  tenantId: string;
  requestId: string;
  submissionId?: string;
  decision: SubmissionReviewDecision;
  determinedRiskTier?: AssessmentRiskTier;
  isCompliant?: boolean;
  reviewerNotes?: string;
  rejectionReason?: string;
  revisionInstructions?: string;
  questionFindings?: Record<string, QuestionReviewFinding>;
  remediationActionPlan?: string;
  reissueQuestionnaire?: boolean;
  validityDays?: number;
}

export const reviewThirdPartyAssessmentSubmission = onCall<ReviewThirdPartyAssessmentSubmissionInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      tenantId,
      requestId,
      submissionId: providedSubmissionId,
      decision,
      determinedRiskTier = 'low',
      reviewerNotes = '',
      rejectionReason = null,
      revisionInstructions = null,
      questionFindings = {},
      remediationActionPlan = null,
      reissueQuestionnaire = false,
    } = data;

    if (!tenantId || !requestId || !decision) {
      throw new HttpsError('invalid-argument', 'tenantId, requestId, and decision are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'approver',
    ]);

    if (!['accept', 'reject', 'request_revision'].includes(decision)) {
      throw new HttpsError('invalid-argument', 'decision must be accept, reject, or request_revision.');
    }
    if (!ASSESSMENT_RISK_TIERS.has(determinedRiskTier)) {
      throw new HttpsError('invalid-argument', 'determinedRiskTier is invalid.');
    }
    if (reissueQuestionnaire) {
      rejectLegacyAssessmentTokenIssuance();
    }
    assertSafeDocumentId(requestId, 'requestId');
    if (providedSubmissionId !== undefined) {
      assertSafeDocumentId(providedSubmissionId, 'submissionId');
    }

    const normalizedReviewerNotes = boundedReviewText(reviewerNotes, 'reviewerNotes', true)!;
    const normalizedRejectionReason = boundedReviewText(
      rejectionReason,
      'rejectionReason',
      decision === 'reject'
    );
    const normalizedRevisionInstructions = boundedReviewText(
      revisionInstructions,
      'revisionInstructions',
      decision === 'request_revision'
    );
    const normalizedRemediationPlan = boundedReviewText(
      remediationActionPlan,
      'remediationActionPlan',
      false
    );
    const isCompliant = decision === 'accept';

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const nowIso = new Date().toISOString();
    const reviewId = `rev_${crypto.randomBytes(12).toString('hex')}`;
    const reviewRef = db.collection('tenants').doc(tenantId).collection('submission_reviews').doc(reviewId);
    const committed = await db.runTransaction(async (transaction) => {
      const reqSnap = await transaction.get(reqRef);
      if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Assessment request not found.');
      }
      const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
      if (
        reqData.id !== requestId ||
        reqData.tenantId !== tenantId ||
        reqData.status !== 'submitted' ||
        !reqData.activeSubmissionId
      ) {
        throw new HttpsError('failed-precondition', 'Only a bound submitted assessment can be reviewed.');
      }
      const submissionId = providedSubmissionId || reqData.activeSubmissionId;
      if (submissionId !== reqData.activeSubmissionId) {
        throw new HttpsError('failed-precondition', 'submissionId does not match the request active submission.');
      }
      assertSafeDocumentId(submissionId, 'submissionId');
      const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
      const subSnap = await transaction.get(subRef);
      if (!subSnap.exists) {
        throw new HttpsError('failed-precondition', 'The bound assessment submission does not exist.');
      }
      const submission = subSnap.data() as ExternalAssessmentSubmission;
      if (
        submission.id !== submissionId ||
        submission.tenantId !== tenantId ||
        submission.requestId !== requestId ||
        submission.templateId !== reqData.templateId ||
        submission.status !== 'submitted' ||
        !Number.isFinite(submission.computedScorePercent) ||
        submission.computedScorePercent < 0 ||
        submission.computedScorePercent > 100
      ) {
        throw new HttpsError('failed-precondition', 'The assessment submission binding or score is invalid.');
      }

      const normalizedFindings = validateQuestionReviewFindings(questionFindings, submission);
      const nextRequestStatus: ThirdPartyAssessmentRequest['status'] =
        decision === 'accept'
          ? 'accepted'
          : decision === 'reject'
            ? 'rejected'
            : 'revision_requested';
      const reviewDoc: SubmissionReview = {
        id: reviewId,
        tenantId,
        status: 'completed',
        submissionId,
        requestId,
        vendorId: reqData.vendorId || null,
        processorProfileId: reqData.processorProfileId || null,
        thirdPartyName: reqData.thirdPartyName,
        decision,
        finalScorePercent: submission.computedScorePercent,
        determinedRiskTier,
        isCompliant,
        rejectionReason: decision === 'reject' ? normalizedRejectionReason : null,
        revisionInstructions: decision === 'request_revision' ? normalizedRevisionInstructions : null,
        internalNotes: normalizedReviewerNotes,
        remediationActionPlan: normalizedRemediationPlan,
        questionFindings: normalizedFindings,
        derivedRiskFlagIds: [],
        generatedEvidenceIds: [],
        reviewerUserId: authContext.userId,
        reviewerEmail: authContext.email,
        reviewedAt: nowIso,
        ownerId: authContext.userId,
        createdBy: authContext.userId,
        updatedBy: authContext.userId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      transaction.create(reviewRef, reviewDoc);
      transaction.update(subRef, {
        status: decision === 'request_revision' ? 'revision_pending' : 'reviewed',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
      transaction.update(reqRef, {
        status: nextRequestStatus,
        reviewedBy: authContext.userId,
        reviewedAt: nowIso,
        finalScorePercent: submission.computedScorePercent,
        isCompliant: decision === 'request_revision' ? null : isCompliant,
        overallRiskRating: determinedRiskTier,
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
        beforeSummary: { status: reqData.status, submissionStatus: submission.status },
        afterSummary: {
          action: 'assessment_review_completed',
          reviewId,
          submissionId,
          decision,
          finalScorePercent: submission.computedScorePercent,
          determinedRiskTier,
          isCompliant: decision === 'request_revision' ? null : isCompliant,
        },
        source: 'cloud_function',
        workflowContext: 'third_party_assessment_review',
      });
      return {
        requestStatus: nextRequestStatus,
        submissionId,
        thirdPartyName: reqData.thirdPartyName,
        notificationRecipient: reqData.ownerUserId || authContext.userId,
      };
    });

    const reviewNotifType: NotificationType =
      decision === 'accept'
        ? 'assessment_review_accepted'
        : decision === 'reject'
        ? 'assessment_review_rejected'
        : 'assessment_revision_requested';

    await createNotification({
      tenantId,
      recipientId: committed.notificationRecipient,
      title: `Assessment Review ${decision.toUpperCase()}: ${committed.thirdPartyName}`,
      message: `Review decision '${decision}' recorded by ${authContext.email}. Risk tier: ${determinedRiskTier.toUpperCase()}.`,
      type: reviewNotifType,
      priority: decision === 'accept' ? 'medium' : 'high',
      linkUrl: `/assessments`,
      sourceEntityType: 'processor_assessment',
      sourceEntityId: requestId,
      deduplicationKey: `notif_review_${reviewId}`,
    }).catch((error) => {
      console.error('Post-commit assessment review notification failed', {
        tenantId,
        requestId,
        reviewId,
        error: error instanceof Error ? error.message : String(error),
      });
    });

    return {
      success: true,
      reviewId,
      decision,
      requestStatus: committed.requestStatus,
    };
  }
);

// -----------------------------------------------------------------------------
// 5. LINK ASSESSMENT TO VENDOR / PROCESSOR & PROSPECT CONVERSION
// -----------------------------------------------------------------------------

export interface LinkAssessmentToVendorOrProcessorInput {
  tenantId: string;
  requestId: string;
  vendorId?: string | null;
  processorProfileId?: string | null;
  convertProspectToVendor?: boolean;
  vendorCategory?: 'cloud_provider' | 'saas_service' | 'ai_model_provider' | 'subprocessor' | 'consultancy';
  countryOfIncorporation?: string;
  dataHostingRegions?: string[];
}

export const linkAssessmentToVendorOrProcessor = onCall<LinkAssessmentToVendorOrProcessorInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const {
      tenantId,
      requestId,
      vendorId: providedVendorId,
      processorProfileId = null,
      convertProspectToVendor = false,
      vendorCategory = 'saas_service',
      countryOfIncorporation = 'EU',
      dataHostingRegions = ['EU'],
    } = data;

    if (!tenantId || !requestId) {
      throw new HttpsError('invalid-argument', 'tenantId and requestId are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'approver',
    ]);

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Assessment request not found.');
    }

    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    const nowIso = new Date().toISOString();
    const batch = db.batch();

    let finalVendorId = providedVendorId || reqData.vendorId;

    // Handle Prospect-to-Vendor Conversion
    if (convertProspectToVendor || (!finalVendorId && reqData.targetType === 'prospective_vendor')) {
      finalVendorId = finalVendorId || `vend_${crypto.randomBytes(8).toString('hex')}`;

      let determinedRiskTier: VendorRiskTier = 'low';
      if (reqData.overallRiskRating === 'high' || reqData.overallRiskRating === 'critical') {
        determinedRiskTier = 'high';
      } else if (reqData.overallRiskRating === 'medium') {
        determinedRiskTier = 'medium';
      }

      const vendorDoc: Vendor = {
        id: finalVendorId,
        tenantId,
        name: reqData.prospectCompanyName || reqData.thirdPartyName,
        category: vendorCategory,
        riskTier: determinedRiskTier,
        primaryContactName: reqData.respondent.name,
        primaryContactEmail: reqData.respondent.email,
        dpaSigned: reqData.isCompliant || false,
        dpaDate: reqData.reviewedAt || null,
        securityAssessmentDate: reqData.reviewedAt || reqData.submittedAt || nowIso,
        nextAssessmentDueDate: reqData.nextDueDate || null,
        countryOfIncorporation,
        dataHostingRegions,
        subprocessorsListed: [],
        hasProcessorProfile: !!processorProfileId,
        activeProcessorProfileId: processorProfileId || null,
        commercialStatus: 'active',
        businessOwnerUserId: authContext.userId,
        annualSpendEur: null,
        latestAssessmentRequestId: requestId,
        latestAssessmentSubmissionId: reqData.activeSubmissionId || null,
        latestAssessmentScorePercent: reqData.finalScorePercent || null,
        latestAssessmentRiskTier: determinedRiskTier,
        status: 'active',
        ownerId: authContext.userId,
        createdBy: authContext.userId,
        updatedBy: authContext.userId,
        createdAt: nowIso,
        updatedAt: nowIso,
      };

      const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(finalVendorId);
      batch.set(vendorRef, vendorDoc);
    } else if (finalVendorId) {
      // Update existing vendor with latest assessment metrics
      const vendorRef = db.collection('tenants').doc(tenantId).collection('vendors').doc(finalVendorId);
      const vendorSnap = await vendorRef.get();

      if (vendorSnap.exists) {
        let determinedRiskTier: VendorRiskTier = 'low';
        if (reqData.overallRiskRating === 'high' || reqData.overallRiskRating === 'critical') {
          determinedRiskTier = 'high';
        } else if (reqData.overallRiskRating === 'medium') {
          determinedRiskTier = 'medium';
        }

        batch.update(vendorRef, {
          latestAssessmentRequestId: requestId,
          latestAssessmentSubmissionId: reqData.activeSubmissionId || null,
          latestAssessmentScorePercent: reqData.finalScorePercent || null,
          latestAssessmentRiskTier: determinedRiskTier,
          securityAssessmentDate: reqData.reviewedAt || reqData.submittedAt || nowIso,
          updatedAt: nowIso,
          updatedBy: authContext.userId,
        });
      }
    }

    // If processor profile is linked, update processor profile record
    if (processorProfileId) {
      const procRef = db.collection('tenants').doc(tenantId).collection('processor_profiles').doc(processorProfileId);
      const procSnap = await procRef.get();

      if (procSnap.exists) {
        batch.update(procRef, {
          latestAssessmentRequestId: requestId,
          latestAssessmentSubmissionId: reqData.activeSubmissionId || null,
          latestAssessmentScorePercent: reqData.finalScorePercent || null,
          latestAssessmentDate: reqData.reviewedAt || reqData.submittedAt || nowIso,
          updatedAt: nowIso,
          updatedBy: authContext.userId,
        });
      }
    }

    // Update Assessment Request with explicit Foreign Keys
    const updateReqPayload: Partial<ThirdPartyAssessmentRequest> = {
      vendorId: finalVendorId || null,
      processorProfileId: processorProfileId || null,
      targetType: processorProfileId ? 'active_processor' : 'existing_vendor',
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    };
    batch.update(reqRef, updateReqPayload);

    // Update linked Assessment Submissions
    const submissionsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('assessment_submissions')
      .where('requestId', '==', requestId)
      .get();

    for (const doc of submissionsSnap.docs) {
      batch.update(doc.ref, {
        vendorId: finalVendorId || null,
        processorProfileId: processorProfileId || null,
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
    }

    // Update linked Submission Reviews
    const reviewsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('submission_reviews')
      .where('requestId', '==', requestId)
      .get();

    for (const doc of reviewsSnap.docs) {
      batch.update(doc.ref, {
        vendorId: finalVendorId || null,
        processorProfileId: processorProfileId || null,
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
        action: convertProspectToVendor ? 'prospect_converted_to_vendor' : 'assessment_linked_to_vendor',
        vendorId: finalVendorId,
        processorProfileId,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_vendor_linkage',
    });

    return {
      success: true,
      requestId,
      vendorId: finalVendorId,
      processorProfileId,
      converted: !!convertProspectToVendor,
    };
  }
);

// -----------------------------------------------------------------------------
// 6. SYNC DERIVED ASSESSMENT RISKS TO RISK REGISTER (Compliance / Admin)
// -----------------------------------------------------------------------------

export interface SyncAssessmentRisksToRegisterInput {
  tenantId: string;
  requestId: string;
  submissionId?: string;
  riskCodesToSync?: string[];
}

export const syncAssessmentRisksToRegister = onCall<SyncAssessmentRisksToRegisterInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId, requestId, submissionId: providedSubmissionId, riskCodesToSync } = data;
    if (!tenantId || !requestId) {
      throw new HttpsError('invalid-argument', 'tenantId and requestId are required.');
    }
    assertSafeDocumentId(requestId, 'requestId');
    if (providedSubmissionId !== undefined) {
      assertSafeDocumentId(providedSubmissionId, 'submissionId');
    }
    if (
      riskCodesToSync !== undefined &&
      (!Array.isArray(riskCodesToSync) ||
        riskCodesToSync.length > 200 ||
        riskCodesToSync.some((code) => typeof code !== 'string' || code.length === 0 || code.length > 128))
    ) {
      throw new HttpsError('invalid-argument', 'riskCodesToSync must contain at most 200 bounded risk codes.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'approver',
    ]);

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Assessment request not found.');
    }

    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    if (
      reqData.id !== requestId ||
      reqData.tenantId !== tenantId ||
      !['submitted', 'accepted', 'rejected'].includes(reqData.status) ||
      !reqData.activeSubmissionId
    ) {
      throw new HttpsError('failed-precondition', 'Only a bound completed submission can produce risk records.');
    }
    const submissionId = providedSubmissionId || reqData.activeSubmissionId;
    if (submissionId !== reqData.activeSubmissionId) {
      throw new HttpsError('failed-precondition', 'submissionId does not match the request active submission.');
    }
    assertSafeDocumentId(submissionId, 'submissionId');

    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists) {
      throw new HttpsError('not-found', 'Assessment submission not found.');
    }

    const subData = subSnap.data() as ExternalAssessmentSubmission;
    if (
      subData.id !== submissionId ||
      subData.tenantId !== tenantId ||
      subData.requestId !== requestId ||
      subData.templateId !== reqData.templateId ||
      !['submitted', 'reviewed'].includes(subData.status) ||
      !subData.answers ||
      typeof subData.answers !== 'object'
    ) {
      throw new HttpsError('failed-precondition', 'The assessment submission binding or lifecycle state is invalid.');
    }

    // Get Sections from template snapshot or live template
    let sections: DynamicQuestionnaireSection[] = [];
    if (reqData.templateSnapshot?.sections && reqData.templateSnapshot.sections.length > 0) {
      sections = reqData.templateSnapshot.sections as unknown as DynamicQuestionnaireSection[];
    } else {
      const tmplRef = db.collection('tenants').doc(tenantId).collection('questionnaire_templates').doc(reqData.templateId);
      const tmplSnap = await tmplRef.get();
      if (tmplSnap.exists) {
        sections = ((tmplSnap.data() as any).sections || []) as DynamicQuestionnaireSection[];
      }
    }

    const postureAnalysis = analyzeSubmissionRiskPosture(sections, subData.answers, {
      passingScoreThreshold: reqData.templateSnapshot?.passingScoreThreshold || 70,
      thirdPartyName: reqData.thirdPartyName,
      vendorId: reqData.vendorId,
    });

    const nowIso = new Date().toISOString();
    const batch = db.batch();

    const createdRiskIds: string[] = [];
    const updatedRiskIds: string[] = [];

    const existingLinkedRiskIds = new Set<string>(reqData.linkedRiskIds || []);

    for (const entry of postureAnalysis.recommendedRegisterEntries) {
      if (riskCodesToSync && !riskCodesToSync.includes(entry.code)) {
        continue;
      }

      // Check deduplication key in tenant risk register
      const existingRiskSnap = await db
        .collection('tenants')
        .doc(tenantId)
        .collection('risks')
        .where('deduplicationKey', '==', entry.deduplicationKey)
        .limit(1)
        .get();

      if (!existingRiskSnap.empty && existingRiskSnap.docs[0]) {
        const existingDoc = existingRiskSnap.docs[0];
        const existingId = existingDoc.id;
        batch.update(existingDoc.ref, {
          sourceEntityId: requestId,
          inherentScore: entry.inherentScore,
          treatmentPlan: entry.treatmentPlan,
          updatedAt: nowIso,
          updatedBy: authContext.userId,
        });
        updatedRiskIds.push(existingId);
        existingLinkedRiskIds.add(existingId);
      } else {
        const riskId = `risk_${crypto.randomBytes(8).toString('hex')}`;
        const newRisk: Risk = {
          id: riskId,
          tenantId,
          code: entry.code,
          title: entry.title,
          description: entry.description,
          category: 'third_party',
          status: 'identified',
          inherentLikelihood: entry.inherentLikelihood,
          inherentImpact: entry.inherentImpact,
          inherentScore: entry.inherentScore,
          residualLikelihood: entry.inherentLikelihood,
          residualImpact: entry.inherentImpact,
          residualScore: entry.inherentScore,
          treatmentStrategy: entry.treatmentStrategy,
          treatmentPlan: entry.treatmentPlan,
          mitigatingControlIds: [],
          affectedAssetIds: reqData.linkedSystemAssetIds || [],
          vendorIds: reqData.vendorId ? [reqData.vendorId] : [],
          processorProfileIds: reqData.processorProfileId ? [reqData.processorProfileId] : [],
          sourceEntityType: 'third_party_assessment',
          sourceEntityId: requestId,
          derivedRuleCode: entry.code,
          deduplicationKey: entry.deduplicationKey,
          ownerId: authContext.userId,
          createdBy: authContext.userId,
          updatedBy: authContext.userId,
          createdAt: nowIso,
          updatedAt: nowIso,
        };

        const riskRef = db.collection('tenants').doc(tenantId).collection('risks').doc(riskId);
        batch.set(riskRef, newRisk);
        createdRiskIds.push(riskId);
        existingLinkedRiskIds.add(riskId);
      }
    }

    batch.update(reqRef, {
      linkedRiskIds: Array.from(existingLinkedRiskIds),
      overallRiskRating: postureAnalysis.overallRiskTier,
      updatedAt: nowIso,
      updatedBy: authContext.userId,
    });

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
        action: 'assessment_risks_synced_to_register',
        createdRiskCount: createdRiskIds.length,
        updatedRiskCount: updatedRiskIds.length,
        overallRiskTier: postureAnalysis.overallRiskTier,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_risk_sync',
    });

    return {
      success: true,
      requestId,
      createdRiskIds,
      updatedRiskIds,
      postureAnalysis,
    };
  }
);

// -----------------------------------------------------------------------------
// 7. LINK ASSESSMENTS & RECURRING SCHEDULES TO CONTROLS
// -----------------------------------------------------------------------------

export interface LinkAssessmentToControlsInput {
  tenantId: string;
  controlIds: string[];
  requestId?: string;
  scheduleId?: string;
  action?: 'add' | 'replace' | 'remove';
}

export const linkAssessmentToControls = onCall<LinkAssessmentToControlsInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId, controlIds, requestId, scheduleId, action = 'add' } = data;
    if (!tenantId || (!requestId && !scheduleId) || !Array.isArray(controlIds)) {
      throw new HttpsError('invalid-argument', 'tenantId, controlIds, and either requestId or scheduleId are required.');
    }

    const authContext = await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'approver',
    ]);

    const nowIso = new Date().toISOString();
    const batch = db.batch();
    let resultingControlIds: string[] = [];

    if (requestId) {
      const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
      const reqSnap = await reqRef.get();

      if (!reqSnap.exists) {
        throw new HttpsError('not-found', 'Assessment request not found.');
      }

      const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
      const current = new Set<string>(reqData.linkedControlIds || []);

      if (action === 'replace') {
        resultingControlIds = [...controlIds];
      } else if (action === 'remove') {
        for (const c of controlIds) current.delete(c);
        resultingControlIds = Array.from(current);
      } else {
        // 'add'
        for (const c of controlIds) current.add(c);
        resultingControlIds = Array.from(current);
      }

      batch.update(reqRef, {
        linkedControlIds: resultingControlIds,
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
    }

    if (scheduleId) {
      const schedRef = db.collection('tenants').doc(tenantId).collection('recurring_schedules').doc(scheduleId);
      const schedSnap = await schedRef.get();

      if (!schedSnap.exists) {
        throw new HttpsError('not-found', 'Recurring assessment schedule not found.');
      }

      const schedData = schedSnap.data() as RecurringAssessmentSchedule;
      const current = new Set<string>(schedData.linkedControlIds || []);

      if (action === 'replace') {
        resultingControlIds = [...controlIds];
      } else if (action === 'remove') {
        for (const c of controlIds) current.delete(c);
        resultingControlIds = Array.from(current);
      } else {
        // 'add'
        for (const c of controlIds) current.add(c);
        resultingControlIds = Array.from(current);
      }

      batch.update(schedRef, {
        linkedControlIds: resultingControlIds,
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
      entityType: 'control',
      entityId: requestId || scheduleId || 'batch',
      action: 'update',
      afterSummary: {
        action: 'assessment_control_linkage_updated',
        requestId,
        scheduleId,
        controlIds: resultingControlIds,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_control_integration',
    });

    return {
      success: true,
      requestId,
      scheduleId,
      linkedControlIds: resultingControlIds,
    };
  }
);

// -----------------------------------------------------------------------------
// 8. ASSESSMENT DEADLINES & RECURRING REMINDERS CHECK JOB (Scheduled / OnCall)
// -----------------------------------------------------------------------------

export interface CheckThirdPartyAssessmentDeadlinesInput {
  tenantId: string;
  simulatedNowIso?: string;
}

export const checkThirdPartyAssessmentDeadlines = onCall<CheckThirdPartyAssessmentDeadlinesInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId, simulatedNowIso } = data;
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required.');
    }

    await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'approver',
    ]);

    const now = simulatedNowIso ? new Date(simulatedNowIso) : new Date();
    const nowTime = now.getTime();
    const nowIso = now.toISOString();

    let nearingDueDateCount = 0;
    let overdueCount = 0;
    let recurringCycleApproachingCount = 0;

    // 1. Check Active Assessment Requests
    const activeStatuses: string[] = ['sent', 'opened', 'in_progress'];
    const reqsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('assessment_requests')
      .where('status', 'in', activeStatuses)
      .get();

    for (const doc of reqsSnap.docs) {
      const req = doc.data() as ThirdPartyAssessmentRequest;
      if (!req.dueDate) continue;

      const dueTime = new Date(req.dueDate).getTime();
      const diffDays = Math.ceil((dueTime - nowTime) / (1000 * 60 * 60 * 24));
      const recipientId = req.ownerUserId || auth.uid;

      if (nowTime > dueTime) {
        // Overdue Response
        overdueCount++;
        await createNotification({
          tenantId,
          recipientId,
          title: `Overdue Assessment Response: ${req.thirdPartyName}`,
          message: `Assessment '${req.title}' for ${req.thirdPartyName} was due on ${req.dueDate.substring(0, 10)} and is overdue.`,
          type: 'assessment_response_overdue',
          priority: 'urgent',
          linkUrl: `/assessments`,
          sourceEntityType: 'processor_assessment',
          sourceEntityId: req.id,
          deduplicationKey: `notif_overdue_${req.id}_${req.dueDate.substring(0, 10)}`,
        });
      } else if (diffDays <= 3 && diffDays >= 0) {
        // Nearing Due Date (within 3 days)
        nearingDueDateCount++;
        await createNotification({
          tenantId,
          recipientId,
          title: `Assessment Due Soon: ${req.thirdPartyName}`,
          message: `Assessment '${req.title}' for ${req.thirdPartyName} is due in ${diffDays} day(s) (${req.dueDate.substring(0, 10)}).`,
          type: 'assessment_nearing_due_date',
          priority: 'high',
          linkUrl: `/assessments`,
          sourceEntityType: 'processor_assessment',
          sourceEntityId: req.id,
          deduplicationKey: `notif_due_soon_${req.id}_${req.dueDate.substring(0, 10)}`,
        });
      }
    }

    // 2. Check Recurring Assessment Schedules
    const schedsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('recurring_schedules')
      .where('status', '==', 'active')
      .get();

    for (const doc of schedsSnap.docs) {
      const sched = doc.data() as RecurringAssessmentSchedule;
      if (!sched.nextAssessmentDueDate) continue;

      const dueTime = new Date(sched.nextAssessmentDueDate).getTime();
      const leadDays = sched.leadTimeDays || 30;
      const diffDays = Math.ceil((dueTime - nowTime) / (1000 * 60 * 60 * 24));
      const recipientId = sched.ownerUserId || auth.uid;

      if (diffDays <= leadDays && diffDays >= 0) {
        recurringCycleApproachingCount++;
        await createNotification({
          tenantId,
          recipientId,
          title: `Recurring Assessment Approaching: ${sched.thirdPartyName}`,
          message: `Recurring ${sched.cadence} assessment for ${sched.thirdPartyName} is approaching (due on ${sched.nextAssessmentDueDate.substring(0, 10)}).`,
          type: 'assessment_recurring_cycle_approaching',
          priority: 'medium',
          linkUrl: `/assessments`,
          sourceEntityType: 'recurring_schedule',
          sourceEntityId: sched.id,
          deduplicationKey: `notif_recur_${sched.id}_${sched.nextAssessmentDueDate.substring(0, 10)}`,
        });
      }
    }

    return {
      success: true,
      timestamp: nowIso,
      checkedRequestsCount: reqsSnap.docs.length,
      checkedSchedulesCount: schedsSnap.docs.length,
      nearingDueDateCount,
      overdueCount,
      recurringCycleApproachingCount,
    };
  }
);

// -----------------------------------------------------------------------------
// 9. MATERIALIZE THIRD-PARTY ASSESSMENT SUMMARY METRICS
// -----------------------------------------------------------------------------

export interface MaterializeThirdPartyAssessmentSummaryMetricsInput {
  tenantId: string;
}

export const materializeThirdPartyAssessmentSummaryMetrics = onCall<MaterializeThirdPartyAssessmentSummaryMetricsInput>(
  async (request) => {
    const { auth, data } = request;
    if (!auth) {
      throw new HttpsError('unauthenticated', 'User must be authenticated.');
    }

    const { tenantId } = data;
    if (!tenantId) {
      throw new HttpsError('invalid-argument', 'tenantId is required.');
    }

    await requireTenantMember(request, tenantId, [
      'tenant_admin',
      'compliance_manager',
      'privacy_manager',
      'security_manager',
      'auditor',
      'approver',
      'contributor',
    ]);

    // 1. Fetch all requests
    const reqsSnap = await db.collection('tenants').doc(tenantId).collection('assessment_requests').get();
    const requests = reqsSnap.docs.map((d) => d.data() as ThirdPartyAssessmentRequest);

    // 2. Fetch all schedules
    const schedsSnap = await db.collection('tenants').doc(tenantId).collection('recurring_schedules').get();
    const schedules = schedsSnap.docs.map((d) => d.data() as RecurringAssessmentSchedule);

    // 3. Fetch critical processor profile IDs
    const procsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('processor_profiles')
      .where('riskTier', '==', 'critical')
      .get();
    const criticalProcessorProfileIds = procsSnap.docs.map((d) => d.id);

    // 4. Fetch critical vendor IDs
    const vendsSnap = await db
      .collection('tenants')
      .doc(tenantId)
      .collection('vendors')
      .where('riskTier', '==', 'critical')
      .get();
    const criticalVendorIds = vendsSnap.docs.map((d) => d.id);

    // 5. Aggregate metrics
    const metrics: ThirdPartyAssessmentSummaryMetrics = calculateThirdPartyAssessmentSummaryMetrics(
      tenantId,
      requests,
      schedules,
      {
        criticalProcessorProfileIds,
        criticalVendorIds,
      }
    );

    // 6. Save to /tenants/{tenantId}/summary_metrics/third_party_assessments
    await db
      .collection('tenants')
      .doc(tenantId)
      .collection('summary_metrics')
      .doc('third_party_assessments')
      .set(metrics);

    return {
      success: true,
      metrics,
    };
  }
);

import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import {
  ThirdPartyAssessmentRequest,
  AssessmentTargetType,
  AssessmentRequestType,
  AssessmentRespondentContact,
  AssessmentRecurrenceCadence,
  QuestionnaireTemplate,
  AssessmentAccessToken,
  SubmissionReview,
  SubmissionReviewDecision,
  QuestionReviewFinding,
  AssessmentRiskTier,
  Vendor,
  VendorRiskTier,
  Risk,
  DynamicQuestionnaireSection,
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

    // Fetch Template snapshot
    const templateRef = db.collection('tenants').doc(tenantId).collection('questionnaire_templates').doc(templateId);
    const templateSnap = await templateRef.get();

    let templateSnapshot: QuestionnaireTemplate;
    if (templateSnap.exists) {
      templateSnapshot = templateSnap.data() as QuestionnaireTemplate;
    } else {
      // Fallback default snapshot
      templateSnapshot = {
        id: templateId,
        tenantId,
        code: 'TMPL-DEFAULT',
        title: 'Standard Third-Party Compliance Assessment',
        description: 'Comprehensive compliance and technical security due diligence questionnaire.',
        version: '1.0.0',
        status: 'published',
        category: 'gdpr_article_28',
        targetScope: 'any',
        passingScoreThreshold: 70,
        defaultValidDays: 30,
        defaultRecurrenceCadence: 'annual',
        sectionCount: 0,
        questionCount: 0,
        isSystemDefault: true,
        sections: [],
        ownerId: authContext.userId,
        createdBy: authContext.userId,
        updatedBy: authContext.userId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
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

      accessUrl = `https://app.eurogovernance.eu/portal/assessments/${requestId}?tokenId=${tokenId}&token=${rawToken}`;
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

    const accessUrl = `https://app.eurogovernance.eu/portal/assessments/${requestId}?tokenId=${tokenId}&token=${rawToken}`;

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
      isCompliant = decision === 'accept',
      reviewerNotes = '',
      rejectionReason = null,
      revisionInstructions = null,
      questionFindings = {},
      remediationActionPlan = null,
      reissueQuestionnaire = false,
      validityDays = 14,
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

    const reqRef = db.collection('tenants').doc(tenantId).collection('assessment_requests').doc(requestId);
    const reqSnap = await reqRef.get();

    if (!reqSnap.exists) {
      throw new HttpsError('not-found', 'Assessment request not found.');
    }

    const reqData = reqSnap.data() as ThirdPartyAssessmentRequest;
    const submissionId = providedSubmissionId || reqData.activeSubmissionId || `sub_${requestId}`;

    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const subSnap = await subRef.get();

    const nowIso = new Date().toISOString();
    const batch = db.batch();

    const reviewId = `rev_${crypto.randomBytes(12).toString('hex')}`;

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
      finalScorePercent: reqData.finalScorePercent || 0,
      determinedRiskTier,
      isCompliant,
      rejectionReason: decision === 'reject' ? rejectionReason || reviewerNotes : null,
      revisionInstructions: decision === 'request_revision' ? revisionInstructions || reviewerNotes : null,
      internalNotes: reviewerNotes || null,
      remediationActionPlan: remediationActionPlan || null,
      questionFindings,
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

    const reviewRef = db.collection('tenants').doc(tenantId).collection('submission_reviews').doc(reviewId);
    batch.set(reviewRef, reviewDoc);

    // Update Submission Status while preserving full answer and document history
    if (subSnap.exists) {
      batch.update(subRef, {
        status: decision === 'request_revision' ? 'revision_pending' : 'reviewed',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
    }

    let nextRequestStatus = reqData.status;
    let reissuedToken: string | undefined;
    let reissuedAccessUrl: string | undefined;

    if (decision === 'accept') {
      nextRequestStatus = 'accepted';
      batch.update(reqRef, {
        status: 'accepted',
        reviewedBy: authContext.userId,
        reviewedAt: nowIso,
        isCompliant: true,
        overallRiskRating: determinedRiskTier,
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
    } else if (decision === 'reject') {
      nextRequestStatus = 'rejected';
      batch.update(reqRef, {
        status: 'rejected',
        reviewedBy: authContext.userId,
        reviewedAt: nowIso,
        isCompliant: false,
        overallRiskRating: determinedRiskTier || 'high',
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      });
    } else if (decision === 'request_revision') {
      nextRequestStatus = 'revision_requested';
      const updateReq: Partial<ThirdPartyAssessmentRequest> = {
        status: 'revision_requested',
        reviewedBy: authContext.userId,
        reviewedAt: nowIso,
        updatedAt: nowIso,
        updatedBy: authContext.userId,
      };

      if (reissueQuestionnaire) {
        const { rawToken, tokenHash } = generateTokenPair();
        const newTokenId = `tok_${crypto.randomBytes(12).toString('hex')}`;
        const tokenExpiresAt = new Date(Date.now() + validityDays * 24 * 60 * 60 * 1000).toISOString();

        const tokenRecord: AssessmentAccessToken = {
          id: newTokenId,
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

        const tokenRef = db.collection('tenants').doc(tenantId).collection('assessment_access_tokens').doc(newTokenId);
        batch.set(tokenRef, tokenRecord);

        const globalTokenRef = db.collection('assessment_access_tokens').doc(newTokenId);
        batch.set(globalTokenRef, {
          tokenId: newTokenId,
          tenantId,
          requestId,
          tokenHash,
          status: 'active',
          expiresAt: tokenExpiresAt,
          updatedAt: nowIso,
        });

        updateReq.accessTokenHash = tokenHash;
        updateReq.tokenExpiresAt = tokenExpiresAt;
        updateReq.status = 'sent';
        nextRequestStatus = 'sent';

        reissuedToken = rawToken;
        reissuedAccessUrl = `https://app.eurogovernance.eu/portal/assessments/${requestId}?tokenId=${newTokenId}&token=${rawToken}`;
      }

      batch.update(reqRef, updateReq);
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
        action: 'assessment_review_completed',
        reviewId,
        submissionId,
        decision,
        determinedRiskTier,
        isCompliant,
        reissueQuestionnaire,
        reviewerNotes,
      },
      source: 'cloud_function',
      workflowContext: 'third_party_assessment_review',
    });

    return {
      success: true,
      reviewId,
      decision,
      requestStatus: nextRequestStatus,
      reissuedToken,
      reissuedAccessUrl,
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
    const submissionId = providedSubmissionId || reqData.activeSubmissionId || `sub_${requestId}`;

    const subRef = db.collection('tenants').doc(tenantId).collection('assessment_submissions').doc(submissionId);
    const subSnap = await subRef.get();

    if (!subSnap.exists) {
      throw new HttpsError('not-found', 'Assessment submission not found.');
    }

    const subData = subSnap.data() as { answers: Record<string, any> };

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

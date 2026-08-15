import { HttpsError, onCall } from 'firebase-functions/v2/https';
import * as crypto from 'crypto';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { createNotification } from '../lib/notifications.js';
import {
  ProcessorAssessment,
  ProcessorAssessmentStatus,
  ProcessorAssessmentType,
  AssessmentRecurrenceCadence,
  ProcessorAssessmentAnswer,
  ProcessorAssessmentSection,
  CANONICAL_ASSESSMENT_TEMPLATES,
  calculateProcessorAssessmentScore,
  evaluateProcessorAssessmentRiskFlags,
} from '@eurogovernance/shared-types';

/**
 * Generates a cryptographically secure random token and its SHA-256 hash.
 */
function generateAccessToken(): { token: string; tokenHash: string } {
  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  return { token, tokenHash };
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

// -----------------------------------------------------------------------------
// 1. CREATE PROCESSOR ASSESSMENT (Authenticated Tenant Member)
// -----------------------------------------------------------------------------

export interface CreateProcessorAssessmentInput {
  tenantId: string;
  title: string;
  assessmentType: ProcessorAssessmentType;
  templateId?: string;
  vendorId?: string;
  vendorName: string;
  processorProfileId?: string;
  processorEngagementName?: string;
  transferArrangementId?: string;
  linkedSystemAssetIds?: string[];
  linkedControlIds?: string[];
  linkedEvidenceIds?: string[];
  isRecurring?: boolean;
  recurrenceCadence?: AssessmentRecurrenceCadence;
  nextDueDate?: string | null;
  respondentName: string;
  respondentEmail: string;
  respondentTitle?: string;
  respondentCompanyName?: string;
  dueDate: string;
  reviewOwnerUserId: string;
  customSections?: ProcessorAssessmentSection[];
  autoSend?: boolean;
}

export const createProcessorAssessment = onCall<CreateProcessorAssessmentInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to create an assessment.');
  }

  const {
    tenantId,
    title,
    assessmentType,
    templateId,
    vendorId,
    vendorName,
    processorProfileId,
    processorEngagementName,
    transferArrangementId,
    linkedSystemAssetIds = [],
    linkedControlIds = [],
    linkedEvidenceIds = [],
    isRecurring = false,
    recurrenceCadence = 'none',
    nextDueDate = null,
    respondentName,
    respondentEmail,
    respondentTitle,
    respondentCompanyName,
    dueDate,
    reviewOwnerUserId,
    customSections,
    autoSend = false,
  } = data || {};

  if (!tenantId || !title || !assessmentType || !vendorName || !respondentEmail || !dueDate) {
    throw new HttpsError('invalid-argument', 'Missing required fields for processor assessment creation.');
  }

  // Verify caller authorization
  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  // Determine sections from template or custom input
  let sections: ProcessorAssessmentSection[] = customSections || [];
  let templateCode: string | undefined;

  if (!sections || sections.length === 0) {
    const template = templateId
      ? CANONICAL_ASSESSMENT_TEMPLATES.find((t) => t.id === templateId || t.code === templateId)
      : CANONICAL_ASSESSMENT_TEMPLATES.find((t) => t.assessmentType === assessmentType) || CANONICAL_ASSESSMENT_TEMPLATES[0];

    if (template) {
      sections = template.sections;
      templateCode = template.code;
    }
  }

  const now = new Date().toISOString();
  const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 days validity
  const { token, tokenHash } = generateAccessToken();

  const assessmentRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc();
  const assessmentId = assessmentRef.id;

  const assessmentDoc: ProcessorAssessment = {
    id: assessmentId,
    tenantId,
    title,
    assessmentType,
    templateId: templateId || undefined,
    templateCode,
    vendorId: vendorId || undefined,
    vendorName,
    processorProfileId: processorProfileId || undefined,
    processorEngagementName: processorEngagementName || undefined,
    transferArrangementId: transferArrangementId || undefined,
    linkedSystemAssetIds,
    linkedControlIds,
    linkedEvidenceIds,
    linkedRiskRegisterIds: [],
    isRecurring,
    recurrenceCadence: isRecurring ? recurrenceCadence : 'none',
    nextDueDate: isRecurring ? nextDueDate : null,
    respondent: {
      name: respondentName,
      email: respondentEmail,
      title: respondentTitle,
      companyName: respondentCompanyName || vendorName,
    },
    accessTokenHash: tokenHash,
    tokenExpiresAt: tokenExpiry,
    accessCount: 0,
    lastAccessedAt: null,
    status: autoSend ? 'sent' : 'draft',
    sentAt: autoSend ? now : null,
    startedAt: null,
    submittedAt: null,
    dueDate,
    reviewOwnerUserId: reviewOwnerUserId || auth.uid,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    rejectionReason: null,
    revisionRequestNotes: null,
    overallScorePercent: null,
    overallRiskRating: null,
    isCompliant: null,
    sections,
    answers: {},
    ownerId: reviewOwnerUserId || auth.uid,
    createdBy: auth.uid,
    updatedBy: auth.uid,
    createdAt: now,
    updatedAt: now,
  };

  await assessmentRef.set(assessmentDoc);

  // Emit Audit Log
  await recordAuditLog({
    tenantId,
    actorId: auth.uid,
    actorEmail: auth.token?.email || 'system',
    actorRole: 'compliance_manager',
    entityType: 'processor_assessment',
    entityId: assessmentId,
    action: autoSend ? 'create' : 'create',
    beforeSummary: null,
    afterSummary: {
      title,
      vendorName,
      assessmentType,
      status: assessmentDoc.status,
      dueDate,
      respondentEmail,
      isRecurring,
    },
    source: 'cloud_function',
    workflowContext: 'createProcessorAssessment',
  });

  return {
    success: true,
    assessmentId,
    accessToken: token,
    status: assessmentDoc.status,
  };
});

// -----------------------------------------------------------------------------
// 2. SEND / ACTIVATE PROCESSOR ASSESSMENT (Authenticated Tenant Member)
// -----------------------------------------------------------------------------

export interface SendProcessorAssessmentInput {
  tenantId: string;
  assessmentId: string;
  regenerateToken?: boolean;
}

export const sendProcessorAssessment = onCall<SendProcessorAssessmentInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to send an assessment.');
  }

  const { tenantId, assessmentId, regenerateToken = false } = data || {};
  if (!tenantId || !assessmentId) {
    throw new HttpsError('invalid-argument', 'Missing tenantId or assessmentId.');
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const docRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(assessmentId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Processor assessment not found.');
  }

  const assessment = snap.data() as ProcessorAssessment;
  const now = new Date().toISOString();

  let token = '';
  let tokenHash = assessment.accessTokenHash;

  if (regenerateToken || !tokenHash) {
    const generated = generateAccessToken();
    token = generated.token;
    tokenHash = generated.tokenHash;
  }

  const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  await docRef.update({
    status: 'sent',
    sentAt: now,
    accessTokenHash: tokenHash,
    tokenExpiresAt: tokenExpiry,
    updatedBy: auth.uid,
    updatedAt: now,
  });

  await recordAuditLog({
    tenantId,
    actorId: auth.uid,
    actorEmail: auth.token?.email || 'system',
    actorRole: 'compliance_manager',
    entityType: 'processor_assessment',
    entityId: assessmentId,
    action: 'status_transition',
    beforeSummary: { status: assessment.status },
    afterSummary: { status: 'sent', sentAt: now, respondentEmail: assessment.respondent.email },
    source: 'cloud_function',
    workflowContext: 'sendProcessorAssessment',
  });

  return {
    success: true,
    assessmentId,
    accessToken: token || undefined,
    status: 'sent',
    respondentEmail: assessment.respondent.email,
  };
});

// -----------------------------------------------------------------------------
// 3. GET PUBLIC PROCESSOR ASSESSMENT (External Respondent - Least Privilege)
// -----------------------------------------------------------------------------

export interface GetPublicProcessorAssessmentInput {
  tenantId: string;
  assessmentId: string;
  token: string;
}

export const getPublicProcessorAssessment = onCall<GetPublicProcessorAssessmentInput>(async (request) => {
  const { tenantId, assessmentId, token } = request.data || {};
  if (!tenantId || !assessmentId || !token) {
    throw new HttpsError('invalid-argument', 'Missing tenantId, assessmentId, or security token.');
  }

  const docRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(assessmentId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Assessment not found or access link is invalid.');
  }

  const assessment = snap.data() as ProcessorAssessment;

  // Validate Token Hash
  const incomingHash = hashToken(token);
  if (assessment.accessTokenHash !== incomingHash) {
    throw new HttpsError('permission-denied', 'Invalid assessment access token.');
  }

  // Validate Expiry
  const now = new Date();
  if (assessment.tokenExpiresAt && new Date(assessment.tokenExpiresAt) < now) {
    throw new HttpsError('deadline-exceeded', 'This assessment access token has expired. Please contact the requester.');
  }

  if (['superseded'].includes(assessment.status)) {
    throw new HttpsError('failed-precondition', 'This assessment cycle has been superseded by a renewed review.');
  }

  const nowISO = now.toISOString();
  const updates: Partial<ProcessorAssessment> = {
    accessCount: (assessment.accessCount || 0) + 1,
    lastAccessedAt: nowISO,
  };

  if (assessment.status === 'sent') {
    updates.status = 'in_progress';
    updates.startedAt = nowISO;
  }

  await docRef.update({
    ...updates,
    updatedAt: nowISO,
  });

  // Return sanitized public payload (no internal user IDs, no raw token hashes)
  return {
    assessment: {
      id: assessment.id,
      tenantId: assessment.tenantId,
      title: assessment.title,
      assessmentType: assessment.assessmentType,
      vendorName: assessment.vendorName,
      status: updates.status || assessment.status,
      dueDate: assessment.dueDate,
      respondent: assessment.respondent,
      sections: assessment.sections,
      answers: assessment.answers || {},
      isRecurring: assessment.isRecurring,
      recurrenceCadence: assessment.recurrenceCadence,
    },
  };
});

// -----------------------------------------------------------------------------
// 4. SAVE PUBLIC PROCESSOR ASSESSMENT DRAFT (External Respondent)
// -----------------------------------------------------------------------------

export interface SavePublicProcessorAssessmentDraftInput {
  tenantId: string;
  assessmentId: string;
  token: string;
  answers: Record<string, ProcessorAssessmentAnswer>;
}

export const savePublicProcessorAssessmentDraft = onCall<SavePublicProcessorAssessmentDraftInput>(async (request) => {
  const { tenantId, assessmentId, token, answers } = request.data || {};
  if (!tenantId || !assessmentId || !token || !answers) {
    throw new HttpsError('invalid-argument', 'Missing tenantId, assessmentId, token, or answers.');
  }

  const docRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(assessmentId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Assessment not found.');
  }

  const assessment = snap.data() as ProcessorAssessment;
  if (assessment.accessTokenHash !== hashToken(token)) {
    throw new HttpsError('permission-denied', 'Invalid assessment access token.');
  }

  if (!['sent', 'in_progress', 'revision_requested'].includes(assessment.status)) {
    throw new HttpsError('failed-precondition', `Cannot save draft while assessment is in status: ${assessment.status}`);
  }

  const now = new Date().toISOString();
  const mergedAnswers = {
    ...(assessment.answers || {}),
    ...answers,
  };

  await docRef.update({
    answers: mergedAnswers,
    status: assessment.status === 'sent' ? 'in_progress' : assessment.status,
    updatedAt: now,
  });

  return {
    success: true,
    savedAt: now,
  };
});

// -----------------------------------------------------------------------------
// 5. SUBMIT PUBLIC PROCESSOR ASSESSMENT (External Respondent)
// -----------------------------------------------------------------------------

export interface SubmitPublicProcessorAssessmentInput {
  tenantId: string;
  assessmentId: string;
  token: string;
  answers: Record<string, ProcessorAssessmentAnswer>;
  respondentName?: string;
  respondentRole?: string;
  submissionComments?: string;
}

export const submitPublicProcessorAssessment = onCall<SubmitPublicProcessorAssessmentInput>(async (request) => {
  const {
    tenantId,
    assessmentId,
    token,
    answers,
    respondentName,
    respondentRole,
  } = request.data || {};

  if (!tenantId || !assessmentId || !token || !answers) {
    throw new HttpsError('invalid-argument', 'Missing tenantId, assessmentId, token, or answers.');
  }

  const docRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(assessmentId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Assessment not found.');
  }

  const assessment = snap.data() as ProcessorAssessment;
  if (assessment.accessTokenHash !== hashToken(token)) {
    throw new HttpsError('permission-denied', 'Invalid assessment access token.');
  }

  if (!['sent', 'in_progress', 'revision_requested'].includes(assessment.status)) {
    throw new HttpsError('failed-precondition', `Assessment cannot be submitted in status: ${assessment.status}`);
  }

  // Validate required questions
  const mergedAnswers = { ...(assessment.answers || {}), ...answers };
  for (const section of assessment.sections || []) {
    for (const q of section.questions || []) {
      if (q.required) {
        const ans = mergedAnswers[q.id];
        if (!ans || ans.value === null || ans.value === undefined || ans.value === '') {
          throw new HttpsError('invalid-argument', `Required question "${q.title}" (${q.code}) has not been answered.`);
        }
      }
    }
  }

  const now = new Date().toISOString();
  const scoreResult = calculateProcessorAssessmentScore({
    sections: assessment.sections,
    answers: mergedAnswers,
  });

  const updatedRespondent = {
    ...assessment.respondent,
    name: respondentName || assessment.respondent.name,
    title: respondentRole || assessment.respondent.title,
  };

  await docRef.update({
    answers: mergedAnswers,
    respondent: updatedRespondent,
    status: 'submitted',
    submittedAt: now,
    overallScorePercent: scoreResult.overallScore,
    updatedAt: now,
  });

  // Notify Review Owner
  if (assessment.reviewOwnerUserId) {
    await createNotification({
      tenantId,
      recipientId: assessment.reviewOwnerUserId,
      type: 'processor_assessment_submitted',
      title: `Assessment Submitted: ${assessment.vendorName}`,
      message: `${updatedRespondent.name} submitted the assessment "${assessment.title}". Initial score: ${scoreResult.overallScore}%.`,
      priority: 'high',
      linkUrl: `/assessments/${assessmentId}`,
      sourceEntityType: 'processor_assessment',
      sourceEntityId: assessmentId,
    });
  }

  return {
    success: true,
    status: 'submitted',
    submittedAt: now,
    initialScore: scoreResult.overallScore,
  };
});

// -----------------------------------------------------------------------------
// 6. REVIEW PROCESSOR ASSESSMENT (Internal Compliance Reviewer)
// -----------------------------------------------------------------------------

export interface ReviewProcessorAssessmentInput {
  tenantId: string;
  assessmentId: string;
  decision: 'start_review' | 'accept' | 'reject' | 'request_revision';
  reviewNotes?: string;
  rejectionReason?: string;
  revisionRequestNotes?: string;
  questionReviews?: Record<string, { reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding'; reviewerComment?: string }>;
}

export const reviewProcessorAssessment = onCall<ReviewProcessorAssessmentInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to review an assessment.');
  }

  const {
    tenantId,
    assessmentId,
    decision,
    reviewNotes,
    rejectionReason,
    revisionRequestNotes,
    questionReviews = {},
  } = data || {};

  if (!tenantId || !assessmentId || !decision) {
    throw new HttpsError('invalid-argument', 'Missing tenantId, assessmentId, or review decision.');
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
    'approver',
  ]);

  const docRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(assessmentId);
  const snap = await docRef.get();

  if (!snap.exists) {
    throw new HttpsError('not-found', 'Assessment not found.');
  }

  const assessment = snap.data() as ProcessorAssessment;
  const now = new Date().toISOString();

  // Apply question reviews
  const updatedAnswers = { ...(assessment.answers || {}) };
  for (const [qId, review] of Object.entries(questionReviews)) {
    if (updatedAnswers[qId]) {
      updatedAnswers[qId] = {
        ...updatedAnswers[qId],
        reviewerFlag: review.reviewerFlag || updatedAnswers[qId].reviewerFlag,
        reviewerComment: review.reviewerComment ?? updatedAnswers[qId].reviewerComment,
        updatedAt: now,
      };
    }
  }

  const scoreResult = calculateProcessorAssessmentScore({
    sections: assessment.sections,
    answers: updatedAnswers,
  });

  const nextStatusMap: Record<string, ProcessorAssessmentStatus> = {
    start_review: 'under_review',
    accept: 'accepted',
    reject: 'rejected',
    request_revision: 'revision_requested',
  };

  const nextStatus = nextStatusMap[decision];
  if (!nextStatus) {
    throw new HttpsError('invalid-argument', `Invalid review decision: ${decision}`);
  }

  // Compute next recurrence date if accepted
  let nextDueDate: string | null = assessment.nextDueDate || null;
  if (decision === 'accept' && assessment.isRecurring) {
    const daysToAddMap: Record<AssessmentRecurrenceCadence, number> = {
      quarterly: 90,
      semi_annual: 180,
      annual: 365,
      biennial: 730,
      none: 0,
    };
    const daysToAdd = daysToAddMap[assessment.recurrenceCadence] || 365;
    const nextDate = new Date(Date.now() + daysToAdd * 24 * 60 * 60 * 1000);
    nextDueDate = nextDate.toISOString();
  }

  const riskFlags = evaluateProcessorAssessmentRiskFlags({
    ...assessment,
    status: nextStatus,
    answers: updatedAnswers,
  });

  const hasCriticalRisk = riskFlags.some((f) => f.severity === 'critical');
  const hasHighRisk = riskFlags.some((f) => f.severity === 'high');
  const calculatedRiskTier = hasCriticalRisk ? 'critical' : hasHighRisk ? 'high' : scoreResult.overallScore < 70 ? 'medium' : 'low';

  const updates: Partial<ProcessorAssessment> = {
    answers: updatedAnswers,
    status: nextStatus,
    reviewedBy: auth.uid,
    reviewedAt: now,
    reviewNotes: reviewNotes || assessment.reviewNotes,
    rejectionReason: decision === 'reject' ? rejectionReason || 'Assessment rejected during compliance review.' : assessment.rejectionReason,
    revisionRequestNotes: decision === 'request_revision' ? revisionRequestNotes || 'Please clarify highlighted items.' : assessment.revisionRequestNotes,
    overallScorePercent: scoreResult.overallScore,
    overallRiskRating: calculatedRiskTier,
    isCompliant: decision === 'accept' ? scoreResult.isPassing : false,
    nextDueDate,
    updatedBy: auth.uid,
    updatedAt: now,
  };

  await docRef.update(updates);

  // Emit Audit Log
  await recordAuditLog({
    tenantId,
    actorId: auth.uid,
    actorEmail: auth.token?.email || 'system',
    actorRole: 'compliance_manager',
    entityType: 'processor_assessment',
    entityId: assessmentId,
    action: decision === 'accept' ? 'approve' : decision === 'reject' ? 'reject' : 'status_transition',
    beforeSummary: { status: assessment.status, score: assessment.overallScorePercent },
    afterSummary: {
      status: nextStatus,
      decision,
      score: scoreResult.overallScore,
      riskTier: calculatedRiskTier,
      isCompliant: updates.isCompliant,
    },
    source: 'cloud_function',
    workflowContext: 'reviewProcessorAssessment',
  });

  return {
    success: true,
    status: nextStatus,
    score: scoreResult.overallScore,
    riskRating: calculatedRiskTier,
    riskFlags,
  };
});

// -----------------------------------------------------------------------------
// 7. RENEW RECURRING PROCESSOR ASSESSMENT (Authenticated Tenant Member)
// -----------------------------------------------------------------------------

export interface RenewRecurringProcessorAssessmentInput {
  tenantId: string;
  previousAssessmentId: string;
  dueDate?: string;
  reviewOwnerUserId?: string;
}

export const renewRecurringProcessorAssessment = onCall<RenewRecurringProcessorAssessmentInput>(async (request) => {
  const { auth, data } = request;
  if (!auth) {
    throw new HttpsError('unauthenticated', 'User must be authenticated to renew an assessment.');
  }

  const { tenantId, previousAssessmentId, dueDate, reviewOwnerUserId } = data || {};
  if (!tenantId || !previousAssessmentId) {
    throw new HttpsError('invalid-argument', 'Missing tenantId or previousAssessmentId.');
  }

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'security_manager',
  ]);

  const prevRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc(previousAssessmentId);
  const prevSnap = await prevRef.get();

  if (!prevSnap.exists) {
    throw new HttpsError('not-found', 'Previous assessment record not found.');
  }

  const prevAssessment = prevSnap.data() as ProcessorAssessment;
  const now = new Date().toISOString();
  const targetDueDate = dueDate || prevAssessment.nextDueDate || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

  const { token, tokenHash } = generateAccessToken();
  const tokenExpiry = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000).toISOString();

  const newRef = db.collection('tenants').doc(tenantId).collection('processor_assessments').doc();
  const newAssessmentId = newRef.id;

  const newAssessmentDoc: ProcessorAssessment = {
    ...prevAssessment,
    id: newAssessmentId,
    title: `${prevAssessment.title} (Renewal ${new Date().getFullYear()})`,
    status: 'sent',
    previousAssessmentId,
    renewalAssessmentId: undefined,
    accessTokenHash: tokenHash,
    tokenExpiresAt: tokenExpiry,
    accessCount: 0,
    lastAccessedAt: null,
    sentAt: now,
    startedAt: null,
    submittedAt: null,
    dueDate: targetDueDate,
    reviewOwnerUserId: reviewOwnerUserId || prevAssessment.reviewOwnerUserId || auth.uid,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    rejectionReason: null,
    revisionRequestNotes: null,
    overallScorePercent: null,
    overallRiskRating: null,
    isCompliant: null,
    answers: {}, // Clean slate for renewal cycle
    ownerId: reviewOwnerUserId || auth.uid,
    createdBy: auth.uid,
    updatedBy: auth.uid,
    createdAt: now,
    updatedAt: now,
  };

  await newRef.set(newAssessmentDoc);

  // Mark previous assessment as superseded
  await prevRef.update({
    status: 'superseded',
    renewalAssessmentId: newAssessmentId,
    updatedBy: auth.uid,
    updatedAt: now,
  });

  await recordAuditLog({
    tenantId,
    actorId: auth.uid,
    actorEmail: auth.token?.email || 'system',
    actorRole: 'compliance_manager',
    entityType: 'processor_assessment',
    entityId: newAssessmentId,
    action: 'create',
    beforeSummary: { previousAssessmentId, status: prevAssessment.status },
    afterSummary: {
      newAssessmentId,
      title: newAssessmentDoc.title,
      vendorName: newAssessmentDoc.vendorName,
      status: 'sent',
      dueDate: targetDueDate,
    },
    source: 'cloud_function',
    workflowContext: 'renewRecurringProcessorAssessment',
  });

  return {
    success: true,
    newAssessmentId,
    accessToken: token,
    previousAssessmentId,
    status: 'sent',
  };
});

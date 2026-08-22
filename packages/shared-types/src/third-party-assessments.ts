import { BaseEntity } from './core.js';
import {
  AssessmentQuestionOption,
  AssessmentRiskTier,
  AssessmentRecurrenceCadence,
} from './processor-assessments.js';
import { AssessmentQuestionType } from './questionnaire-engine.js';

// =============================================================================
// 1. QUESTIONNAIRE TEMPLATES, SECTIONS & QUESTIONS
// =============================================================================

export type QuestionnaireTemplateCategory =
  | 'gdpr_article_28'         // GDPR Processor & Subprocessor Due Diligence
  | 'iso_27001_supplier'       // ISO/IEC 27001 Supplier Security Governance
  | 'eu_ai_act_provider'       // EU AI Act Third-Party Model & Data Governance
  | 'security_toms'            // Technical & Organizational Security Measures
  | 'schrems_ii_importer'      // Cross-Border Data Importer & Surveillance Diligence
  | 'nis2_supply_chain'        // NIS2 Critical Supply Chain Risk Assessment
  | 'general_due_diligence'    // Broad Commercial & Vendor Risk Assessment
  | 'custom';                  // Tenant-defined bespoke questionnaire

export type QuestionnaireTemplateStatus =
  | 'draft'
  | 'published'
  | 'archived'
  | 'deprecated';

export type QuestionnaireTargetScope =
  | 'prospective_vendor'       // Pre-contract evaluation for prospects
  | 'existing_processor'       // Recurring / active data processors
  | 'subprocessor'             // Onward third-party subprocessors
  | 'any';                     // Applicable to any supplier type

export interface QuestionnaireQuestion {
  id: string;
  tenantId: string;
  templateId: string;
  sectionId: string;
  code: string; // e.g. 'GOV-01', 'TOM-03', 'SUB-02'
  title: string;
  description?: string;
  questionType: AssessmentQuestionType;
  required: boolean;
  weight: number; // Weight in section calculation (e.g. 1 to 10)
  sortOrder: number;
  options?: AssessmentQuestionOption[];
  requiresEvidence?: boolean;
  acceptedEvidenceCategories?: string[]; // e.g. ['toms', 'soc_report', 'iso_certificate']
  guidanceNotes?: string;
  statutoryCitations?: string[]; // e.g. ['GDPR Art. 28(3)', 'ISO 27001 A.15.1']
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface QuestionnaireSection {
  id: string;
  tenantId: string;
  templateId: string;
  code: string; // e.g. 'SEC-01', 'SEC-TOMS'
  title: string;
  description?: string;
  sortOrder: number;
  weight: number; // Weight in overall template score (e.g. 1 to 10)
  passingThresholdPercent?: number; // Minimum passing % for section
  questions: QuestionnaireQuestion[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

/**
 * Tenant-Scoped Questionnaire Template
 * /tenants/{tenantId}/questionnaire_templates/{templateId}
 */
export interface QuestionnaireTemplate extends BaseEntity {
  code: string; // Unique human-readable code e.g. 'TMPL-GDPR-ART28-V1'
  title: string;
  description: string;
  version: string; // Semantic version e.g. '1.0.0'
  status: QuestionnaireTemplateStatus;
  category: QuestionnaireTemplateCategory;
  targetScope: QuestionnaireTargetScope;
  passingScoreThreshold: number; // 0 - 100% (default: 70)
  defaultValidDays: number; // Submission deadline window in days (default: 30)
  defaultRecurrenceCadence: AssessmentRecurrenceCadence;
  sectionCount: number;
  questionCount: number;
  isSystemDefault: boolean; // Flag if derived from master catalog
  sections: QuestionnaireSection[];
  tags?: string[];
  createdBy: string;
  updatedBy: string;
}

// =============================================================================
// 2. ASSESSMENT CAMPAIGNS & ASSESSMENT REQUESTS
// =============================================================================

export type AssessmentTargetType =
  | 'prospective_vendor' // Prospective supplier (not yet fully onboarded)
  | 'existing_vendor'    // Onboarded Vendor
  | 'active_processor'   // Formally designated GDPR Data Processor Profile
  | 'subprocessor';      // Subprocessor in processing chain

export type AssessmentRequestType =
  | 'one_time_due_diligence'
  | 'recurring_periodic_review'
  | 'incident_investigation'
  | 'custom_deep_dive';

export type AssessmentRequestStatus =
  | 'draft'               // Created internally
  | 'sent'                // Dispatched to external respondent
  | 'dispatched'          // Token generated and link created (alias for sent)
  | 'opened'              // Respondent opened magic link
  | 'in_progress'         // Respondent opened link and saved answers
  | 'submitted'           // Completed and submitted by respondent
  | 'under_review'        // Internal compliance team reviewing
  | 'revision_requested'  // Clarification returned to respondent
  | 'accepted'            // Approved & signed off
  | 'rejected'            // Rejected / non-compliant
  | 'expired'             // Deadline lapsed without submission
  | 'canceled'            // Withdrawn internally
  | 'superseded';         // Replaced by newer assessment cycle

/**
 * Validates whether a state transition is permitted in the assessment request lifecycle.
 */
export function isValidRequestStateTransition(
  fromState: AssessmentRequestStatus,
  toState: AssessmentRequestStatus
): boolean {
  if (fromState === toState) return true;

  const allowedTransitions: Record<AssessmentRequestStatus, AssessmentRequestStatus[]> = {
    draft: ['sent', 'dispatched', 'canceled'],
    sent: ['opened', 'in_progress', 'sent', 'dispatched', 'expired', 'canceled'],
    dispatched: ['opened', 'in_progress', 'sent', 'dispatched', 'expired', 'canceled'],
    opened: ['in_progress', 'submitted', 'expired', 'canceled', 'sent'],
    in_progress: ['submitted', 'expired', 'canceled', 'sent', 'opened'],
    submitted: ['under_review', 'accepted', 'rejected', 'revision_requested', 'canceled'],
    under_review: ['accepted', 'rejected', 'revision_requested', 'canceled'],
    revision_requested: ['sent', 'dispatched', 'opened', 'in_progress', 'canceled'],
    accepted: ['superseded'],
    rejected: ['superseded', 'draft'],
    expired: ['sent', 'dispatched', 'draft', 'canceled'],
    canceled: ['draft'],
    superseded: [],
  };

  return allowedTransitions[fromState]?.includes(toState) ?? false;
}

export interface AssessmentRespondentContact {
  name: string;
  email: string;
  title?: string;
  companyName: string;
  phone?: string;
}

export interface TemplateSnapshotHeader {
  templateId: string;
  templateCode: string;
  title: string;
  version: string;
  passingScoreThreshold: number;
  sectionsCount: number;
  questionsCount: number;
}

/**
 * Third-Party Assessment Campaign (Batch / Group Campaign)
 * /tenants/{tenantId}/assessment_campaigns/{campaignId}
 */
export interface ThirdPartyAssessmentCampaign extends BaseEntity {
  title: string;
  description: string;
  templateId: string;
  templateSnapshot: TemplateSnapshotHeader;
  campaignType: 'annual_audit_cycle' | 'gdpr_subprocessor_review' | 'prospective_vendor_screening' | 'ad_hoc';
  status: 'draft' | 'active' | 'completed' | 'archived';
  dueDate: string;
  targetCount: number;
  dispatchedCount: number;
  submittedCount: number;
  acceptedCount: number;
  rejectedCount: number;
  overdueCount: number;
  ownerUserId: string;
  tags?: string[];
  createdBy: string;
  updatedBy: string;
}

/**
 * Individual Third-Party Assessment Request
 * /tenants/{tenantId}/assessment_requests/{requestId}
 *
 * Supports both:
 * 1. Prospective Third Parties (no existing vendorId / processorProfileId)
 * 2. Existing Onboarded Vendors & Processors
 */
export interface ThirdPartyAssessmentRequest extends BaseEntity {
  title: string;
  campaignId?: string | null; // Optional parent campaign
  templateId: string;
  templateSnapshot: QuestionnaireTemplate; // Immutable snapshot at dispatch time

  // Target Third-Party Entity Linkages (Optional for prospects, required for existing)
  targetType: AssessmentTargetType;
  thirdPartyName: string;
  vendorId?: string | null;                  // Link to /tenants/{tenantId}/vendors/{id}
  processorProfileId?: string | null;        // Link to /tenants/{tenantId}/processor_profiles/{id}
  prospectCompanyName?: string | null;       // Populated when prospective vendor
  prospectWebsite?: string | null;

  // External Respondent Details
  respondent: AssessmentRespondentContact;

  // Tokenized Least-Privilege Access Security
  accessTokenHash?: string | null;                  // SHA-256 hash of random access token
  tokenExpiresAt?: string | null;                   // ISO date
  accessCount: number;
  lastAccessedAt?: string | null;

  // Workflow, Cadence & Timeline
  requestType: AssessmentRequestType;
  status: AssessmentRequestStatus;
  dueDate: string;
  dispatchedAt?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  activeSubmissionId?: string | null;        // Link to /tenants/{tenantId}/assessment_submissions/{id}

  // Recurrence Configuration
  isRecurring: boolean;
  recurrenceCadence: AssessmentRecurrenceCadence;
  recurrenceScheduleId?: string | null;      // Link to /tenants/{tenantId}/recurring_schedules/{id}
  previousRequestId?: string | null;         // Link to prior completed cycle
  renewalRequestId?: string | null;          // Link to next active cycle
  nextDueDate?: string | null;

  // Internal Ownership & Linkages
  ownerUserId: string;                       // Primary compliance officer responsible
  linkedSystemAssetIds: string[];            // /tenants/{tenantId}/system_assets/{id}
  linkedControlIds: string[];                // /tenants/{tenantId}/controls/{id}
  linkedEvidenceIds: string[];               // /tenants/{tenantId}/evidence/{id}
  linkedRiskIds: string[];                   // /tenants/{tenantId}/risks/{id}

  // Final Review Summary (Mirrored from SubmissionReview for quick filtering)
  finalScorePercent?: number | null;
  respondentScorePercent?: number | null;
  respondentPassedThreshold?: boolean | null;
  overallRiskRating?: AssessmentRiskTier | null;
  isCompliant?: boolean | null;
  reviewedBy?: string | null;
  reviewedAt?: string | null;

  createdBy: string;
  updatedBy: string;
}

// =============================================================================
// 3. RECURRING ASSESSMENT SCHEDULES
// =============================================================================

export type RecurringScheduleStatus = 'active' | 'paused' | 'terminated';

/**
 * Recurring Assessment Schedule
 * /tenants/{tenantId}/recurring_schedules/{scheduleId}
 */
export interface RecurringAssessmentSchedule extends BaseEntity {
  title: string;
  templateId: string;
  targetType: 'vendor' | 'processor_profile';
  vendorId?: string | null;
  processorProfileId?: string | null;
  thirdPartyName: string;
  contact: AssessmentRespondentContact;
  cadence: AssessmentRecurrenceCadence; // e.g. 'annual', 'semi_annual', 'quarterly', 'biennial'
  leadTimeDays: number; // Days before due date to dispatch invitation (default: 30)
  autoDispatch: boolean;
  status: RecurringScheduleStatus;
  lastAssessmentRequestId?: string | null;
  lastAssessmentCompletedAt?: string | null;
  nextScheduledDispatchDate: string; // ISO date
  nextAssessmentDueDate: string;     // ISO date
  linkedControlIds?: string[];       // Foreign Keys to /tenants/{tenantId}/controls/{controlId}
  ownerUserId: string;
  createdBy: string;
  updatedBy: string;
}

// =============================================================================
// 4. EXTERNAL SUBMISSIONS & INTERNAL REVIEWS
// =============================================================================

export interface AssessmentAnswerItem {
  questionId: string;
  questionCode: string;
  sectionId: string;
  value: string | string[] | boolean | number | null;
  comment?: string;
  attachedEvidenceIds: string[];
  attachedFileMetadata?: Array<{
    fileName: string;
    fileSizeBytes: number;
    mimeType: string;
    storagePath: string;
    fileHashSha256?: string;
  }>;
  calculatedScore?: number;
  reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
  reviewerComment?: string;
  updatedAt: string;
}

export type SubmissionStatus =
  | 'draft_saved'
  | 'submitted'
  | 'under_review'
  | 'revision_pending'
  | 'reviewed';

/**
 * External Assessment Submission
 * /tenants/{tenantId}/assessment_submissions/{submissionId}
 */
export interface ExternalAssessmentSubmission extends BaseEntity {
  requestId: string;
  templateId: string;
  targetType: AssessmentTargetType;
  vendorId?: string | null;
  processorProfileId?: string | null;
  thirdPartyName: string;
  status: SubmissionStatus;
  submittedBy: {
    name: string;
    email: string;
    title?: string;
    companyName: string;
    submittedAt: string;
  };
  computedScorePercent: number;
  isPassingThreshold: boolean;
  sectionScores: Record<
    string,
    {
      sectionTitle: string;
      earnedPoints: number;
      possiblePoints: number;
      scorePercent: number;
    }
  >;
  answers: Record<string, AssessmentAnswerItem>; // Keyed by questionId
  unansweredRequiredCount: number;
  totalQuestionsCount: number;
  answeredQuestionsCount: number;
  ipAddressMasked?: string | null;
  userAgent?: string | null;
  createdBy: string;
  updatedBy: string;
}

export type SubmissionReviewDecision =
  | 'accept'
  | 'reject'
  | 'request_revision';

export interface QuestionReviewFinding {
  questionId: string;
  questionCode: string;
  flag: 'ok' | 'concern' | 'gap' | 'critical_finding';
  reviewerNotes?: string;
  remediationRequired?: boolean;
}

/**
 * Submission Review Sign-off Document
 * /tenants/{tenantId}/submission_reviews/{reviewId}
 */
export interface SubmissionReview extends BaseEntity {
  submissionId: string;
  requestId: string;
  vendorId?: string | null;
  processorProfileId?: string | null;
  thirdPartyName: string;
  decision: SubmissionReviewDecision;
  finalScorePercent: number;
  determinedRiskTier: AssessmentRiskTier;
  isCompliant: boolean;
  rejectionReason?: string | null;
  revisionInstructions?: string | null;
  internalNotes?: string | null;
  remediationActionPlan?: string | null;
  questionFindings: Record<string, QuestionReviewFinding>;
  derivedRiskFlagIds: string[];
  generatedEvidenceIds: string[];
  reviewerUserId: string;
  reviewerEmail: string;
  reviewedAt: string;
  createdBy: string;
  updatedBy: string;
}

// =============================================================================
// 5. VALIDATION & RELATIONSHIP INTEGRITY ENGINES
// =============================================================================

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validateQuestionnaireTemplate(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['QuestionnaireTemplate must be a non-null object.'] };
  }

  const t = input as Partial<QuestionnaireTemplate>;
  if (!t.tenantId || typeof t.tenantId !== 'string' || t.tenantId.trim() === '') {
    errors.push('tenantId is required.');
  }
  if (!t.code || typeof t.code !== 'string' || t.code.trim() === '') {
    errors.push('code is required.');
  }
  if (!t.title || typeof t.title !== 'string' || t.title.trim() === '') {
    errors.push('title is required.');
  }
  if (!t.status || !['draft', 'published', 'archived', 'deprecated'].includes(t.status)) {
    errors.push('Invalid status for QuestionnaireTemplate.');
  }
  if (typeof t.passingScoreThreshold !== 'number' || t.passingScoreThreshold < 0 || t.passingScoreThreshold > 100) {
    errors.push('passingScoreThreshold must be a number between 0 and 100.');
  }
  if (!Array.isArray(t.sections) || t.sections.length === 0) {
    errors.push('Template must contain at least one section.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateThirdPartyAssessmentRequest(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['ThirdPartyAssessmentRequest must be a non-null object.'] };
  }

  const r = input as Partial<ThirdPartyAssessmentRequest>;
  if (!r.tenantId || typeof r.tenantId !== 'string') {
    errors.push('tenantId is required.');
  }
  if (!r.title || typeof r.title !== 'string' || r.title.trim() === '') {
    errors.push('title is required.');
  }
  if (!r.templateId || typeof r.templateId !== 'string') {
    errors.push('templateId is required.');
  }
  if (!r.thirdPartyName || typeof r.thirdPartyName !== 'string' || r.thirdPartyName.trim() === '') {
    errors.push('thirdPartyName is required.');
  }
  if (!r.respondent || typeof r.respondent !== 'object' || !r.respondent.email) {
    errors.push('respondent.email is required.');
  }
  if (!r.dueDate || isNaN(Date.parse(r.dueDate))) {
    errors.push('dueDate must be a valid ISO date string.');
  }
  if (!r.ownerUserId || typeof r.ownerUserId !== 'string') {
    errors.push('ownerUserId is required.');
  }

  // Integrity Check: If targetType is 'existing_vendor', vendorId should be present
  if (r.targetType === 'existing_vendor' && !r.vendorId) {
    errors.push('vendorId is required when targetType is existing_vendor.');
  }

  // Integrity Check: If targetType is 'active_processor', processorProfileId should be present
  if (r.targetType === 'active_processor' && !r.processorProfileId) {
    errors.push('processorProfileId is required when targetType is active_processor.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateRecurringAssessmentSchedule(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['RecurringAssessmentSchedule must be a non-null object.'] };
  }

  const s = input as Partial<RecurringAssessmentSchedule>;
  if (!s.tenantId || typeof s.tenantId !== 'string') {
    errors.push('tenantId is required.');
  }
  if (!s.title || typeof s.title !== 'string') {
    errors.push('title is required.');
  }
  if (!s.templateId || typeof s.templateId !== 'string') {
    errors.push('templateId is required.');
  }
  if (!s.cadence || !['quarterly', 'semi_annual', 'annual', 'biennial'].includes(s.cadence)) {
    errors.push('cadence must be quarterly, semi_annual, annual, or biennial.');
  }
  if (!s.nextScheduledDispatchDate || isNaN(Date.parse(s.nextScheduledDispatchDate))) {
    errors.push('nextScheduledDispatchDate must be a valid ISO date string.');
  }
  if (!s.nextAssessmentDueDate || isNaN(Date.parse(s.nextAssessmentDueDate))) {
    errors.push('nextAssessmentDueDate must be a valid ISO date string.');
  }
  if (!s.ownerUserId || typeof s.ownerUserId !== 'string') {
    errors.push('ownerUserId is required.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateExternalAssessmentSubmission(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['ExternalAssessmentSubmission must be a non-null object.'] };
  }

  const sub = input as Partial<ExternalAssessmentSubmission>;
  if (!sub.tenantId || typeof sub.tenantId !== 'string') {
    errors.push('tenantId is required.');
  }
  if (!sub.requestId || typeof sub.requestId !== 'string') {
    errors.push('requestId is required.');
  }
  if (!sub.templateId || typeof sub.templateId !== 'string') {
    errors.push('templateId is required.');
  }
  if (!sub.submittedBy || typeof sub.submittedBy !== 'object' || !sub.submittedBy.email) {
    errors.push('submittedBy with a valid email is required.');
  }
  if (typeof sub.computedScorePercent !== 'number' || sub.computedScorePercent < 0 || sub.computedScorePercent > 100) {
    errors.push('computedScorePercent must be a number between 0 and 100.');
  }

  return { valid: errors.length === 0, errors };
}

export function validateSubmissionReview(input: unknown): ValidationResult {
  const errors: string[] = [];
  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['SubmissionReview must be a non-null object.'] };
  }

  const rev = input as Partial<SubmissionReview>;
  if (!rev.tenantId || typeof rev.tenantId !== 'string') {
    errors.push('tenantId is required.');
  }
  if (!rev.submissionId || typeof rev.submissionId !== 'string') {
    errors.push('submissionId is required.');
  }
  if (!rev.requestId || typeof rev.requestId !== 'string') {
    errors.push('requestId is required.');
  }
  if (!rev.decision || !['accept', 'reject', 'request_revision'].includes(rev.decision)) {
    errors.push('decision must be accept, reject, or request_revision.');
  }
  if (!rev.reviewerUserId || typeof rev.reviewerUserId !== 'string') {
    errors.push('reviewerUserId is required.');
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// 6. CONTROL SATISFACTION & TRACEABILITY ENGINE
// =============================================================================

export type ControlAssessmentSatisfactionStatus =
  | 'satisfied'
  | 'expired'
  | 'missing'
  | 'non_compliant'
  | 'under_review';

export interface ControlAssessmentSatisfactionResult {
  controlId: string;
  isSatisfied: boolean;
  satisfactionStatus: ControlAssessmentSatisfactionStatus;
  latestAssessmentRequestId?: string | null;
  latestAssessmentTitle?: string | null;
  latestAssessmentScorePercent?: number | null;
  latestAssessmentCompletedAt?: string | null;
  daysSinceAssessment?: number | null;
  daysUntilExpiry?: number | null;
  isExpired: boolean;
  supportingVendorNames: string[];
  supportingEvidenceIds: string[];
  explanation: string;
}

export interface ControlAssessmentTraceabilityRecord {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  recurringScheduleId?: string | null;
  recurringCadence?: AssessmentRecurrenceCadence | null;
  assessmentRequestId: string;
  assessmentTitle: string;
  thirdPartyName: string;
  vendorId?: string | null;
  processorProfileId?: string | null;
  submissionId: string;
  submissionDate: string;
  reviewId?: string | null;
  reviewDecision?: SubmissionReviewDecision | null;
  reviewerEmail?: string | null;
  reviewedAt?: string | null;
  evidenceIds: string[];
  isCompliant: boolean;
  finalScorePercent: number;
  satisfactionStatus: ControlAssessmentSatisfactionStatus;
}

/**
 * Evaluates whether a control is satisfied by linked third-party assessment requests.
 * Evaluates review acceptance, compliance score, and validity window.
 */
export function evaluateControlAssessmentSatisfaction(
  controlId: string,
  linkedRequests: ThirdPartyAssessmentRequest[],
  options: {
    maxValidityDays?: number; // e.g. 365 days for annual review
    nowDate?: Date;
  } = {}
): ControlAssessmentSatisfactionResult {
  const maxValidityDays = options.maxValidityDays ?? 365;
  const now = options.nowDate ? options.nowDate.getTime() : Date.now();

  const matchingRequests = linkedRequests.filter((r) =>
    r.linkedControlIds?.includes(controlId)
  );

  if (matchingRequests.length === 0) {
    return {
      controlId,
      isSatisfied: false,
      satisfactionStatus: 'missing',
      supportingVendorNames: [],
      supportingEvidenceIds: [],
      isExpired: false,
      explanation: 'No third-party assessment request is linked to this control.',
    };
  }

  // Sort by reviewedAt / updatedAt descending
  const sorted = [...matchingRequests].sort((a, b) => {
    const timeA = a.reviewedAt || a.submittedAt || a.updatedAt;
    const timeB = b.reviewedAt || b.submittedAt || b.updatedAt;
    return new Date(timeB).getTime() - new Date(timeA).getTime();
  });

  const latest = sorted[0];
  if (!latest) {
    return {
      controlId,
      isSatisfied: false,
      satisfactionStatus: 'missing',
      supportingVendorNames: [],
      supportingEvidenceIds: [],
      isExpired: false,
      explanation: 'No assessments available.',
    };
  }

  const completionIso = latest.reviewedAt || latest.submittedAt;
  const completionTime = completionIso ? new Date(completionIso).getTime() : null;

  let daysSinceAssessment: number | null = null;
  let daysUntilExpiry: number | null = null;
  let isExpired = false;

  if (completionTime) {
    daysSinceAssessment = Math.floor((now - completionTime) / (1000 * 60 * 60 * 24));
    daysUntilExpiry = maxValidityDays - daysSinceAssessment;
    isExpired = daysSinceAssessment > maxValidityDays;
  }

  const allSupportingVendorNames = Array.from(
    new Set(matchingRequests.map((r) => r.thirdPartyName).filter(Boolean))
  );
  const allSupportingEvidenceIds = Array.from(
    new Set(matchingRequests.flatMap((r) => r.linkedEvidenceIds || []))
  );

  if (latest.status === 'submitted' || latest.status === 'under_review') {
    return {
      controlId,
      isSatisfied: false,
      satisfactionStatus: 'under_review',
      latestAssessmentRequestId: latest.id,
      latestAssessmentTitle: latest.title,
      latestAssessmentScorePercent: latest.finalScorePercent || null,
      latestAssessmentCompletedAt: completionIso,
      daysSinceAssessment,
      daysUntilExpiry,
      isExpired: false,
      supportingVendorNames: allSupportingVendorNames,
      supportingEvidenceIds: allSupportingEvidenceIds,
      explanation: `Latest assessment for '${latest.thirdPartyName}' was submitted on ${completionIso?.substring(0, 10)} and is pending internal compliance review.`,
    };
  }

  if (latest.status !== 'accepted') {
    return {
      controlId,
      isSatisfied: false,
      satisfactionStatus: 'non_compliant',
      latestAssessmentRequestId: latest.id,
      latestAssessmentTitle: latest.title,
      latestAssessmentScorePercent: latest.finalScorePercent || null,
      latestAssessmentCompletedAt: completionIso,
      daysSinceAssessment,
      daysUntilExpiry,
      isExpired: false,
      supportingVendorNames: allSupportingVendorNames,
      supportingEvidenceIds: allSupportingEvidenceIds,
      explanation: `Latest assessment for '${latest.thirdPartyName}' was not accepted (status: ${latest.status}).`,
    };
  }

  if (isExpired) {
    return {
      controlId,
      isSatisfied: false,
      satisfactionStatus: 'expired',
      latestAssessmentRequestId: latest.id,
      latestAssessmentTitle: latest.title,
      latestAssessmentScorePercent: latest.finalScorePercent || null,
      latestAssessmentCompletedAt: completionIso,
      daysSinceAssessment,
      daysUntilExpiry,
      isExpired: true,
      supportingVendorNames: allSupportingVendorNames,
      supportingEvidenceIds: allSupportingEvidenceIds,
      explanation: `Latest accepted assessment was completed ${daysSinceAssessment} days ago (exceeds ${maxValidityDays}-day review validity). Re-assessment renewal required.`,
    };
  }

  return {
    controlId,
    isSatisfied: true,
    satisfactionStatus: 'satisfied',
    latestAssessmentRequestId: latest.id,
    latestAssessmentTitle: latest.title,
    latestAssessmentScorePercent: latest.finalScorePercent || null,
    latestAssessmentCompletedAt: completionIso,
    daysSinceAssessment,
    daysUntilExpiry,
    isExpired: false,
    supportingVendorNames: allSupportingVendorNames,
    supportingEvidenceIds: allSupportingEvidenceIds,
    explanation: `Satisfied by accepted assessment '${latest.title}' (${latest.thirdPartyName}) scored ${latest.finalScorePercent || 100}% on ${completionIso?.substring(0, 10)}. Valid for ${daysUntilExpiry} more days.`,
  };
}

// =============================================================================
// 7. SUMMARY METRICS & LIST VIEW AGGREGATION ENGINE
// =============================================================================

export interface ThirdPartyAssessmentSummaryMetrics {
  id: string; // 'third_party_assessments'
  tenantId: string;
  totalRequestsCount: number;
  outstandingRequestsCount: number;      // draft, sent, opened, in_progress
  submittedWaitingReviewCount: number;   // submitted, under_review
  acceptedAssessmentsCount: number;      // accepted
  rejectedOrFollowUpCount: number;       // rejected, revision_requested
  overdueResponsesCount: number;         // active requests with dueDate in past
  overdueRecurringSchedulesCount: number;// recurring schedules past due date
  criticalProcessorAssessmentsCount: number; // requests linked to critical processors/vendors
  controlEvidenceAssessmentsCount: number;   // requests linked to controls & evidence
  averageComplianceScorePercent: number;
  riskTierDistribution: {
    critical: number;
    high: number;
    medium: number;
    low: number;
    unrated: number;
  };
  lastMaterializedAt: string;
}

export interface ThirdPartyAssessmentFilterOptions {
  viewPreset?:
    | 'all'
    | 'outstanding'
    | 'waiting_review'
    | 'accepted'
    | 'follow_up_needed'
    | 'overdue'
    | 'critical_processors'
    | 'control_evidence';
  status?: AssessmentRequestStatus[];
  targetType?: AssessmentTargetType;
  riskTier?: AssessmentRiskTier[];
  vendorId?: string;
  processorProfileId?: string;
  linkedControlId?: string;
  isCriticalProcessor?: boolean;
  hasControlEvidence?: boolean;
  searchTerm?: string;
}

/**
 * Deterministically aggregates summary metrics for third-party assessments across the tenant.
 */
export function calculateThirdPartyAssessmentSummaryMetrics(
  tenantId: string,
  requests: ThirdPartyAssessmentRequest[],
  schedules: RecurringAssessmentSchedule[] = [],
  options: {
    criticalProcessorProfileIds?: string[];
    criticalVendorIds?: string[];
    nowDate?: Date;
  } = {}
): ThirdPartyAssessmentSummaryMetrics {
  const now = options.nowDate ? options.nowDate.getTime() : Date.now();
  const criticalProcSet = new Set(options.criticalProcessorProfileIds || []);
  const criticalVendSet = new Set(options.criticalVendorIds || []);

  let outstandingRequestsCount = 0;
  let submittedWaitingReviewCount = 0;
  let acceptedAssessmentsCount = 0;
  let rejectedOrFollowUpCount = 0;
  let overdueResponsesCount = 0;
  let criticalProcessorAssessmentsCount = 0;
  let controlEvidenceAssessmentsCount = 0;

  let totalScoreSum = 0;
  let scoredCount = 0;

  const riskTierDistribution = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    unrated: 0,
  };

  const outstandingStatuses: AssessmentRequestStatus[] = ['draft', 'sent', 'opened', 'in_progress'];
  const waitingReviewStatuses: AssessmentRequestStatus[] = ['submitted', 'under_review'];

  for (const req of requests) {
    if (outstandingStatuses.includes(req.status)) {
      outstandingRequestsCount++;
    } else if (waitingReviewStatuses.includes(req.status)) {
      submittedWaitingReviewCount++;
    } else if (req.status === 'accepted') {
      acceptedAssessmentsCount++;
    } else if (req.status === 'rejected') {
      rejectedOrFollowUpCount++;
    }

    // Overdue check
    if (req.dueDate && ['sent', 'opened', 'in_progress'].includes(req.status)) {
      const dueTime = new Date(req.dueDate).getTime();
      if (now > dueTime) {
        overdueResponsesCount++;
      }
    }

    // Critical processor / vendor check
    const isCritical =
      (req.processorProfileId && criticalProcSet.has(req.processorProfileId)) ||
      (req.vendorId && criticalVendSet.has(req.vendorId));
    if (isCritical) {
      criticalProcessorAssessmentsCount++;
    }

    // Control & Evidence linkage check
    if (
      (req.linkedControlIds && req.linkedControlIds.length > 0) ||
      (req.linkedEvidenceIds && req.linkedEvidenceIds.length > 0)
    ) {
      controlEvidenceAssessmentsCount++;
    }

    // Scores
    if (typeof req.finalScorePercent === 'number') {
      totalScoreSum += req.finalScorePercent;
      scoredCount++;
    }

    // Risk Tiers
    if (req.overallRiskRating === 'critical') {
      riskTierDistribution.critical++;
    } else if (req.overallRiskRating === 'high') {
      riskTierDistribution.high++;
    } else if (req.overallRiskRating === 'medium') {
      riskTierDistribution.medium++;
    } else if (req.overallRiskRating === 'low') {
      riskTierDistribution.low++;
    } else {
      riskTierDistribution.unrated++;
    }
  }

  // Overdue recurring schedules
  let overdueRecurringSchedulesCount = 0;
  for (const sched of schedules) {
    if (sched.status === 'active' && sched.nextAssessmentDueDate) {
      const dueTime = new Date(sched.nextAssessmentDueDate).getTime();
      if (now > dueTime) {
        overdueRecurringSchedulesCount++;
      }
    }
  }

  const averageComplianceScorePercent =
    scoredCount > 0 ? Math.round(totalScoreSum / scoredCount) : 0;

  return {
    id: 'third_party_assessments',
    tenantId,
    totalRequestsCount: requests.length,
    outstandingRequestsCount,
    submittedWaitingReviewCount,
    acceptedAssessmentsCount,
    rejectedOrFollowUpCount,
    overdueResponsesCount,
    overdueRecurringSchedulesCount,
    criticalProcessorAssessmentsCount,
    controlEvidenceAssessmentsCount,
    averageComplianceScorePercent,
    riskTierDistribution,
    lastMaterializedAt: new Date(now).toISOString(),
  };
}

/**
 * In-memory filter implementation matching Firestore index capabilities.
 */
export function filterThirdPartyAssessments(
  requests: ThirdPartyAssessmentRequest[],
  filters: ThirdPartyAssessmentFilterOptions,
  options: {
    criticalProcessorProfileIds?: string[];
    criticalVendorIds?: string[];
    nowDate?: Date;
  } = {}
): ThirdPartyAssessmentRequest[] {
  const now = options.nowDate ? options.nowDate.getTime() : Date.now();
  const criticalProcSet = new Set(options.criticalProcessorProfileIds || []);
  const criticalVendSet = new Set(options.criticalVendorIds || []);

  return requests.filter((req) => {
    // 1. Preset filter
    if (filters.viewPreset === 'outstanding') {
      if (!['draft', 'sent', 'opened', 'in_progress'].includes(req.status)) return false;
    } else if (filters.viewPreset === 'waiting_review') {
      if (!['submitted', 'under_review'].includes(req.status)) return false;
    } else if (filters.viewPreset === 'accepted') {
      if (req.status !== 'accepted') return false;
    } else if (filters.viewPreset === 'follow_up_needed') {
      if (req.status !== 'rejected') return false;
    } else if (filters.viewPreset === 'overdue') {
      if (!['sent', 'opened', 'in_progress'].includes(req.status)) return false;
      if (!req.dueDate || new Date(req.dueDate).getTime() >= now) return false;
    } else if (filters.viewPreset === 'critical_processors') {
      const isCritical =
        (req.processorProfileId && criticalProcSet.has(req.processorProfileId)) ||
        (req.vendorId && criticalVendSet.has(req.vendorId));
      if (!isCritical) return false;
    } else if (filters.viewPreset === 'control_evidence') {
      const hasLinkage =
        (req.linkedControlIds && req.linkedControlIds.length > 0) ||
        (req.linkedEvidenceIds && req.linkedEvidenceIds.length > 0);
      if (!hasLinkage) return false;
    }

    // 2. Explicit Status filter
    if (filters.status && filters.status.length > 0) {
      if (!filters.status.includes(req.status)) return false;
    }

    // 3. Target Type filter
    if (filters.targetType && req.targetType !== filters.targetType) {
      return false;
    }

    // 4. Risk Tier filter
    if (filters.riskTier && filters.riskTier.length > 0) {
      if (!req.overallRiskRating || !filters.riskTier.includes(req.overallRiskRating)) {
        return false;
      }
    }

    // 5. VendorId filter
    if (filters.vendorId && req.vendorId !== filters.vendorId) {
      return false;
    }

    // 6. ProcessorProfileId filter
    if (filters.processorProfileId && req.processorProfileId !== filters.processorProfileId) {
      return false;
    }

    // 7. Linked Control filter
    if (filters.linkedControlId && !req.linkedControlIds?.includes(filters.linkedControlId)) {
      return false;
    }

    // 8. Search Term filter
    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase().trim();
      const titleMatch = req.title.toLowerCase().includes(term);
      const nameMatch = req.thirdPartyName.toLowerCase().includes(term);
      const emailMatch = req.respondent?.email?.toLowerCase().includes(term);
      if (!titleMatch && !nameMatch && !emailMatch) return false;
    }

    return true;
  });
}

// =============================================================================
// 8. EXPORT & REPORTING PAYLOAD GENERATORS
// =============================================================================

export interface BaseExportHeader {
  exportType: string;
  title: string;
  generatedAt: string;
  tenantId: string;
  totalRecords: number;
}

export function generateThirdPartyAssessmentInventoryExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  options: { tenantId: string; asOfDate?: Date }
) {
  const asOfDate = options.asOfDate || new Date();

  return {
    exportHeader: {
      exportType: 'third_party_assessment_inventory',
      title: 'Third-Party Assessment Inventory Report',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: requests.length,
    },
    assessments: requests.map((r) => ({
      requestId: r.id,
      title: r.title,
      targetType: r.targetType,
      thirdPartyName: r.thirdPartyName,
      vendorId: r.vendorId || null,
      processorProfileId: r.processorProfileId || null,
      respondentName: r.respondent?.name || '',
      respondentEmail: r.respondent?.email || '',
      status: r.status,
      dueDate: r.dueDate,
      finalScorePercent: r.finalScorePercent ?? null,
      overallRiskRating: r.overallRiskRating ?? null,
      isCompliant: r.isCompliant ?? null,
      reviewedBy: r.reviewedBy || null,
      reviewedAt: r.reviewedAt || null,
      linkedControlIds: r.linkedControlIds || [],
      linkedEvidenceIds: r.linkedEvidenceIds || [],
      linkedRiskIds: r.linkedRiskIds || [],
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    })),
  };
}

export function generateLatestAcceptedAssessmentRegisterExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  options: { tenantId: string; asOfDate?: Date; maxValidityDays?: number }
) {
  const asOfDate = options.asOfDate || new Date();
  const maxValidityDays = options.maxValidityDays || 365;

  // Filter accepted assessments
  const accepted = requests.filter((r) => r.status === 'accepted');

  // Group by vendor/processor/thirdPartyName
  const grouped = new Map<string, ThirdPartyAssessmentRequest>();
  for (const r of accepted) {
    const key = r.processorProfileId || r.vendorId || r.thirdPartyName;
    const existing = grouped.get(key);
    if (!existing) {
      grouped.set(key, r);
    } else {
      const timeA = new Date(r.reviewedAt || r.updatedAt).getTime();
      const timeB = new Date(existing.reviewedAt || existing.updatedAt).getTime();
      if (timeA > timeB) {
        grouped.set(key, r);
      }
    }
  }

  const latestAccepted = Array.from(grouped.values()).map((r) => {
    const completionIso = r.reviewedAt || r.updatedAt;
    const completionTime = new Date(completionIso).getTime();
    const daysSince = Math.floor((asOfDate.getTime() - completionTime) / (1000 * 60 * 60 * 24));
    const daysRemaining = maxValidityDays - daysSince;

    return {
      requestId: r.id,
      thirdPartyName: r.thirdPartyName,
      vendorId: r.vendorId || null,
      processorProfileId: r.processorProfileId || null,
      assessmentTitle: r.title,
      finalScorePercent: r.finalScorePercent ?? 100,
      overallRiskRating: r.overallRiskRating || 'low',
      reviewedBy: r.reviewedBy || null,
      reviewedAt: completionIso,
      daysSinceCompletion: daysSince,
      daysRemainingValidity: daysRemaining,
      isExpired: daysSince > maxValidityDays,
      supportingEvidenceIds: r.linkedEvidenceIds || [],
    };
  });

  return {
    exportHeader: {
      exportType: 'latest_accepted_assessment_register',
      title: 'Latest Accepted Assessment Register',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: latestAccepted.length,
    },
    latestAssessments: latestAccepted,
  };
}

export function generateOverdueRecurringAssessmentsExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  schedules: RecurringAssessmentSchedule[],
  options: { tenantId: string; asOfDate?: Date }
) {
  const asOfDate = options.asOfDate || new Date();
  const nowTime = asOfDate.getTime();

  const overdueRequests = requests
    .filter((r) => ['sent', 'opened', 'in_progress'].includes(r.status) && r.dueDate && new Date(r.dueDate).getTime() < nowTime)
    .map((r) => {
      const dueTime = new Date(r.dueDate).getTime();
      const daysOverdue = Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24));
      return {
        itemType: 'assessment_request',
        id: r.id,
        title: r.title,
        thirdPartyName: r.thirdPartyName,
        respondentEmail: r.respondent?.email || '',
        dueDate: r.dueDate,
        daysOverdue,
        ownerUserId: r.ownerUserId,
      };
    });

  const overdueSchedules = schedules
    .filter((s) => s.status === 'active' && s.nextAssessmentDueDate && new Date(s.nextAssessmentDueDate).getTime() < nowTime)
    .map((s) => {
      const dueTime = new Date(s.nextAssessmentDueDate).getTime();
      const daysOverdue = Math.floor((nowTime - dueTime) / (1000 * 60 * 60 * 24));
      return {
        itemType: 'recurring_schedule',
        id: s.id,
        title: s.title,
        thirdPartyName: s.thirdPartyName,
        respondentEmail: s.contact?.email || '',
        dueDate: s.nextAssessmentDueDate,
        daysOverdue,
        cadence: s.cadence,
        ownerUserId: s.ownerUserId,
      };
    });

  return {
    exportHeader: {
      exportType: 'overdue_recurring_assessments_report',
      title: 'Overdue Third-Party Assessments & Recurring Cycles',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: overdueRequests.length + overdueSchedules.length,
    },
    overdueRequests,
    overdueSchedules,
  };
}

export function generateAssessmentControlAssuranceExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  options: { tenantId: string; asOfDate?: Date; maxValidityDays?: number }
) {
  const asOfDate = options.asOfDate || new Date();
  const maxValidityDays = options.maxValidityDays || 365;

  const controlLinked = requests.filter((r) => r.linkedControlIds && r.linkedControlIds.length > 0);

  const mappings = controlLinked.flatMap((r) => {
    return (r.linkedControlIds || []).map((controlId) => {
      const satisfaction = evaluateControlAssessmentSatisfaction(controlId, [r], {
        maxValidityDays,
        nowDate: asOfDate,
      });

      return {
        controlId,
        assessmentRequestId: r.id,
        assessmentTitle: r.title,
        thirdPartyName: r.thirdPartyName,
        status: r.status,
        scorePercent: r.finalScorePercent ?? null,
        satisfactionStatus: satisfaction.satisfactionStatus,
        isSatisfied: satisfaction.isSatisfied,
        isExpired: satisfaction.isExpired,
        supportingEvidenceIds: r.linkedEvidenceIds || [],
        reviewedAt: r.reviewedAt || null,
        explanation: satisfaction.explanation,
      };
    });
  });

  return {
    exportHeader: {
      exportType: 'assessment_control_assurance_report',
      title: 'Third-Party Assessment Control Assurance Report',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: mappings.length,
    },
    controlAssuranceMappings: mappings,
  };
}

export function generateAssessmentOpenFollowUpsExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  options: { tenantId: string; asOfDate?: Date }
) {
  const asOfDate = options.asOfDate || new Date();

  const followUps = requests.filter(
    (r) =>
      r.status === 'revision_requested' ||
      r.status === 'rejected' ||
      r.overallRiskRating === 'critical' ||
      r.overallRiskRating === 'high'
  );

  return {
    exportHeader: {
      exportType: 'assessment_open_follow_ups_report',
      title: 'Third-Party Assessment Open Follow-Ups & Gaps Report',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: followUps.length,
    },
    followUpItems: followUps.map((r) => ({
      requestId: r.id,
      title: r.title,
      thirdPartyName: r.thirdPartyName,
      status: r.status,
      overallRiskRating: r.overallRiskRating || 'unrated',
      finalScorePercent: r.finalScorePercent ?? null,
      dueDate: r.dueDate,
      ownerUserId: r.ownerUserId,
      linkedRiskIds: r.linkedRiskIds || [],
      reviewedBy: r.reviewedBy || null,
      reviewedAt: r.reviewedAt || null,
    })),
  };
}

export function generateProspectAssessmentsUnlinkedExportPayload(
  requests: ThirdPartyAssessmentRequest[],
  options: { tenantId: string; asOfDate?: Date }
) {
  const asOfDate = options.asOfDate || new Date();

  const unlinkedProspects = requests.filter(
    (r) => r.targetType === 'prospective_vendor' && !r.vendorId && !r.processorProfileId
  );

  return {
    exportHeader: {
      exportType: 'prospect_assessments_unlinked_report',
      title: 'Prospect Assessments Not Yet Linked to Onboarded Vendors',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalRecords: unlinkedProspects.length,
    },
    prospectAssessments: unlinkedProspects.map((r) => ({
      requestId: r.id,
      title: r.title,
      prospectCompanyName: r.prospectCompanyName || r.thirdPartyName,
      prospectWebsite: r.prospectWebsite || null,
      respondentName: r.respondent?.name || '',
      respondentEmail: r.respondent?.email || '',
      status: r.status,
      finalScorePercent: r.finalScorePercent ?? null,
      overallRiskRating: r.overallRiskRating || null,
      dueDate: r.dueDate,
      ownerUserId: r.ownerUserId,
      createdAt: r.createdAt,
    })),
  };
}

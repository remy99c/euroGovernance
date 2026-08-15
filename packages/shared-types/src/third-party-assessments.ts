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

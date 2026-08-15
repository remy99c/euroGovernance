import { BaseEntity } from './core.js';

// -----------------------------------------------------------------------------
// PROCESSOR / VENDOR ASSESSMENTS & DUE DILIGENCE QUESTIONNAIRES
// -----------------------------------------------------------------------------

export type ProcessorAssessmentType =
  | 'pre_contract_due_diligence'      // One-time onboarding assessment for prospective processors
  | 'periodic_assurance_review'       // Recurring assurance review for existing processors
  | 'security_posture_deep_dive'      // Technical security & TOMs evaluation
  | 'ai_supplier_governance'          // EU AI Act third-party model & data provider review
  | 'cross_border_transfer_diligence' // Schrems II third-country data importer assessment
  | 'incident_followup';              // Post-incident or breach follow-up questionnaire

export type ProcessorAssessmentStatus =
  | 'draft'               // Created internally, not yet sent
  | 'sent'                // Dispatched with active external access token
  | 'in_progress'         // Respondent opened / started completing answers
  | 'submitted'           // Respondent completed and submitted all responses
  | 'under_review'        // Internal compliance/security team reviewing
  | 'revision_requested'  // Reviewer returned to respondent for clarification
  | 'accepted'            // Formally approved with verified score
  | 'rejected'            // Rejected due to unacceptable risk or deficiencies
  | 'expired'             // Deadline lapsed without submission
  | 'superseded';         // Archived prior cycle replaced by renewal

export type AssessmentRecurrenceCadence =
  | 'none'          // One-time assessment
  | 'quarterly'     // Every 90 days
  | 'semi_annual'   // Every 180 days
  | 'annual'        // Every 365 days
  | 'biennial';     // Every 730 days

export type AssessmentRiskTier = 'critical' | 'high' | 'medium' | 'low';

export type QuestionType =
  | 'text'
  | 'textarea'
  | 'single_select'
  | 'multi_select'
  | 'boolean'
  | 'file_upload'
  | 'rating_scale';

export interface AssessmentQuestionOption {
  label: string;
  value: string;
  score: number; // 0 to 100
  isRiskTrigger?: boolean;
  riskCode?: string;
  riskSeverity?: AssessmentRiskTier;
  riskRationale?: string;
}

export interface ProcessorAssessmentQuestion {
  id: string;
  sectionId: string;
  code: string;
  title: string;
  description?: string;
  type: QuestionType;
  options?: AssessmentQuestionOption[];
  required: boolean;
  weight: number; // e.g. 1 to 10
  applicableFrameworks: Array<'gdpr' | 'iso_27001' | 'iso_27701' | 'eu_ai_act' | 'dora' | 'nis2'>;
  gdprArticleCitation?: string;
  guidanceForRespondent?: string;
  requiresEvidenceAttachment?: boolean;
}

export interface ProcessorAssessmentSection {
  id: string;
  title: string;
  description: string;
  order: number;
  weight: number;
  questions: ProcessorAssessmentQuestion[];
}

export interface ProcessorAssessmentTemplate {
  id: string;
  code: string;
  name: string;
  assessmentType: ProcessorAssessmentType;
  description: string;
  version: string;
  targetRole: 'data_processor' | 'subprocessor' | 'ai_provider' | 'cloud_infrastructure' | 'general_vendor';
  sections: ProcessorAssessmentSection[];
  passingScoreThreshold: number; // e.g. 70 (%)
}

export interface ProcessorAssessmentAnswer {
  questionId: string;
  value: string | string[] | boolean | number | null;
  comment?: string;
  attachedEvidenceIds: string[]; // Linked /tenants/{tenantId}/evidence/{id}
  attachedFileNames?: string[];
  calculatedScore?: number;      // 0 - 100
  reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
  reviewerComment?: string;
  updatedAt: string;
}

export interface ExternalRespondentContact {
  name: string;
  email: string;
  title?: string;
  companyName?: string;
  phone?: string;
}

/**
 * Main Processor Assessment Document Entity
 * /tenants/{tenantId}/processor_assessments/{assessmentId}
 */
export interface ProcessorAssessment extends BaseEntity {
  // Assessment Identity & Type
  title: string;
  assessmentType: ProcessorAssessmentType;
  templateId?: string;
  templateCode?: string;

  // Commercial & Governance Entity Links
  vendorId?: string;                       // /tenants/{tenantId}/vendors/{id}
  vendorName: string;
  processorProfileId?: string;             // /tenants/{tenantId}/processor_profiles/{id}
  processorEngagementName?: string;
  transferArrangementId?: string;          // /tenants/{tenantId}/transfer_arrangements/{id}
  linkedSystemAssetIds: string[];          // /tenants/{tenantId}/system_assets/{id}
  linkedControlIds: string[];              // /tenants/{tenantId}/controls/{id}
  linkedEvidenceIds: string[];             // /tenants/{tenantId}/evidence/{id}
  linkedRiskRegisterIds: string[];         // /tenants/{tenantId}/risks/{id}

  // Recurrence Configuration
  isRecurring: boolean;
  recurrenceCadence: AssessmentRecurrenceCadence;
  previousAssessmentId?: string;           // Links to previous completed cycle
  renewalAssessmentId?: string;            // Links to next active cycle
  nextDueDate?: string | null;             // ISO date

  // External Respondent & Access Token (Least-Privilege Token Access)
  respondent: ExternalRespondentContact;
  accessTokenHash?: string;                // SHA-256 hash of random access token
  tokenExpiresAt?: string;                 // ISO date
  accessCount: number;
  lastAccessedAt?: string | null;
  magicLinkSentAt?: string | null;

  // Status & Timeline
  status: ProcessorAssessmentStatus;
  sentAt?: string | null;
  startedAt?: string | null;
  submittedAt?: string | null;
  dueDate: string;                         // Target submission deadline

  // Review & Scoring
  reviewOwnerUserId: string;               // Assigned internal reviewer
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewNotes?: string | null;
  rejectionReason?: string | null;
  revisionRequestNotes?: string | null;
  overallScorePercent?: number | null;     // 0 - 100
  overallRiskRating?: AssessmentRiskTier | null;
  isCompliant?: boolean | null;

  // Structured Sections & Answers
  sections: ProcessorAssessmentSection[];
  answers: Record<string, ProcessorAssessmentAnswer>; // Keyed by questionId
}

// -----------------------------------------------------------------------------
// RISK FLAGS DERIVED FROM ASSESSMENTS
// -----------------------------------------------------------------------------

export interface AssessmentRiskFlag {
  id: string;
  assessmentId: string;
  processorProfileId?: string;
  vendorId?: string;
  ruleCode: string;
  severity: AssessmentRiskTier;
  title: string;
  description: string;
  suggestedRemediation: string;
  questionId?: string;
  questionCode?: string;
  isActionable: boolean;
  dedupKey: string;
}

// -----------------------------------------------------------------------------
// CANONICAL MASTER ASSESSMENT TEMPLATES
// -----------------------------------------------------------------------------

export const CANONICAL_ASSESSMENT_TEMPLATES: readonly ProcessorAssessmentTemplate[] = [
  {
    id: 'templ_gdpr_art28_due_diligence',
    code: 'GDPR_ART28_DUE_DILIGENCE',
    name: 'GDPR Article 28 Processor Due Diligence & Security Assessment',
    assessmentType: 'pre_contract_due_diligence',
    description: 'Statutory pre-contractual due diligence verifying sufficient technical, organizational, and subprocessor guarantees under GDPR Art. 28.',
    version: '1.0.0',
    targetRole: 'data_processor',
    passingScoreThreshold: 75,
    sections: [
      {
        id: 'sec_gov',
        title: '1. Privacy Governance & Article 28 Guarantees',
        description: 'Organizational compliance structure, designated DPO, and contractual commitments.',
        order: 1,
        weight: 2,
        questions: [
          {
            id: 'q_gov_dpo',
            sectionId: 'sec_gov',
            code: 'GOV-01',
            title: 'Designated Data Protection Officer / Privacy Lead',
            description: 'Does your organization have a formally appointed Data Protection Officer (DPO) or designated Privacy Lead under GDPR Art. 37?',
            type: 'single_select',
            required: true,
            weight: 3,
            applicableFrameworks: ['gdpr', 'iso_27701'],
            gdprArticleCitation: 'Article 37',
            options: [
              { label: 'Yes, formally appointed statutory DPO registered with supervisory authority', value: 'yes_statutory', score: 100 },
              { label: 'Yes, designated internal Privacy Lead / Compliance Team', value: 'yes_internal', score: 80 },
              { label: 'No formal privacy designation', value: 'no', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_NO_DPO', riskSeverity: 'medium', riskRationale: 'Processor lacks formal privacy lead.' },
            ],
          },
          {
            id: 'q_gov_dpa_agreement',
            sectionId: 'sec_gov',
            code: 'GOV-02',
            title: 'Willingness to Execute Standard GDPR Article 28 DPA',
            description: 'Will your organization execute our standard Data Processing Agreement (DPA) without material deletions to Article 28(3) mandatory clauses?',
            type: 'single_select',
            required: true,
            weight: 4,
            applicableFrameworks: ['gdpr'],
            gdprArticleCitation: 'Article 28(3)',
            options: [
              { label: 'Yes, full acceptance of Controller standard Article 28 DPA', value: 'accept_controller_dpa', score: 100 },
              { label: 'Acceptance of standard DPA subject to mutual negotiation', value: 'accept_with_negotiation', score: 80 },
              { label: 'Only accept vendor standard terms with liability caps below contract value', value: 'vendor_terms_only', score: 40, isRiskTrigger: true, riskCode: 'ASSESSMENT_DPA_RESISTANCE', riskSeverity: 'high', riskRationale: 'Supplier rejects standard Article 28 DPA.' },
              { label: 'Refuse to sign separate DPA', value: 'refuse_dpa', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_REFUSE_DPA', riskSeverity: 'critical', riskRationale: 'Supplier refuses mandatory Article 28 DPA.' },
            ],
          },
        ],
      },
      {
        id: 'sec_toms',
        title: '2. Technical & Organizational Security Measures (TOMs)',
        description: 'Article 32 security controls, cryptographic safeguards, and access governance.',
        order: 2,
        weight: 3,
        questions: [
          {
            id: 'q_toms_encryption',
            sectionId: 'sec_toms',
            code: 'TOM-01',
            title: 'Encryption of Personal Data in Transit & at Rest',
            description: 'Are all customer personal data encrypted using strong cryptography (AES-256 at rest, TLS 1.3 in transit)?',
            type: 'single_select',
            required: true,
            weight: 5,
            applicableFrameworks: ['gdpr', 'iso_27001'],
            gdprArticleCitation: 'Article 32(1)(a)',
            requiresEvidenceAttachment: true,
            options: [
              { label: 'Yes, AES-256 at rest and TLS 1.2+ in transit enforced everywhere', value: 'full_encryption', score: 100 },
              { label: 'Encrypted in transit; rest encryption in progress', value: 'partial_encryption', score: 50, isRiskTrigger: true, riskCode: 'ASSESSMENT_INCOMPLETE_ENCRYPTION', riskSeverity: 'high', riskRationale: 'Customer data not fully encrypted at rest.' },
              { label: 'No systematic encryption enforced', value: 'no_encryption', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_NO_ENCRYPTION', riskSeverity: 'critical', riskRationale: 'Unencrypted processing of personal data.' },
            ],
          },
          {
            id: 'q_toms_mfa',
            sectionId: 'sec_toms',
            code: 'TOM-02',
            title: 'Multi-Factor Authentication (MFA) & Least Privilege',
            description: 'Is multi-factor authentication (MFA) strictly enforced for all administrative and employee access to processing infrastructure?',
            type: 'single_select',
            required: true,
            weight: 4,
            applicableFrameworks: ['gdpr', 'iso_27001'],
            gdprArticleCitation: 'Article 32(1)(b)',
            options: [
              { label: 'Yes, mandatory hardware/app-based MFA for 100% of personnel', value: 'mandatory_mfa', score: 100 },
              { label: 'Enforced for administrators only', value: 'admin_only_mfa', score: 60, isRiskTrigger: true, riskCode: 'ASSESSMENT_PARTIAL_MFA', riskSeverity: 'medium', riskRationale: 'MFA not enforced for all workforce members.' },
              { label: 'Optional / Not enforced', value: 'no_mfa', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_NO_MFA', riskSeverity: 'critical', riskRationale: 'Workforce lacks mandatory MFA.' },
            ],
          },
        ],
      },
      {
        id: 'sec_subproc',
        title: '3. Subprocessor Governance & Onward Authorization',
        description: 'Rules for engaging third-party subprocessors under Article 28(2) and 28(4).',
        order: 3,
        weight: 3,
        questions: [
          {
            id: 'q_subproc_notice',
            sectionId: 'sec_subproc',
            code: 'SUB-01',
            title: 'Subprocessor Prior Written Notification & Objection Window',
            description: 'Do you maintain an updated subprocessor list and provide at least 30 days prior written notice to controllers before onboarding new subprocessors?',
            type: 'single_select',
            required: true,
            weight: 4,
            applicableFrameworks: ['gdpr'],
            gdprArticleCitation: 'Article 28(2)',
            options: [
              { label: 'Yes, published list + >= 30 days advance notice with right to object', value: 'formal_notice_30d', score: 100 },
              { label: 'Yes, but shorter notice period (< 14 days)', value: 'short_notice', score: 60 },
              { label: 'No advance notice; changes published post-hoc', value: 'post_hoc_notice', score: 20, isRiskTrigger: true, riskCode: 'ASSESSMENT_UNAUTHORIZED_SUBPROCESSORS', riskSeverity: 'high', riskRationale: 'No prior notice before engaging subprocessors.' },
              { label: 'No subprocessor tracking mechanism', value: 'no_tracking', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_NO_SUBPROCESSOR_GOVERNANCE', riskSeverity: 'critical', riskRationale: 'Uncontrolled subprocessor engagement.' },
            ],
          },
        ],
      },
      {
        id: 'sec_breach',
        title: '4. Incident Management & Breach Notification SLA',
        description: 'Procedures for detecting and escalating personal data breaches under Article 33/34.',
        order: 4,
        weight: 3,
        questions: [
          {
            id: 'q_breach_sla',
            sectionId: 'sec_breach',
            code: 'BRC-01',
            title: 'Controller Breach Notification SLA (Hours)',
            description: 'What is your guaranteed contractual SLA to notify the Controller upon discovering a confirmed or suspected personal data breach?',
            type: 'single_select',
            required: true,
            weight: 5,
            applicableFrameworks: ['gdpr'],
            gdprArticleCitation: 'Article 33(2)',
            options: [
              { label: 'Within 24 hours of discovery', value: 'sla_24h', score: 100 },
              { label: 'Within 48 hours of discovery', value: 'sla_48h', score: 85 },
              { label: 'Within 72 hours of discovery', value: 'sla_72h', score: 70 },
              { label: 'Over 72 hours / "Without undue delay" without hourly cap', value: 'sla_slow', score: 30, isRiskTrigger: true, riskCode: 'ASSESSMENT_BREACH_SLA_RISK', riskSeverity: 'high', riskRationale: 'Breach notification SLA exceeds 72h controller statutory deadline.' },
            ],
          },
        ],
      },
      {
        id: 'sec_certs',
        title: '5. Third-Party Certifications & Independent Audits',
        description: 'Accredited assurance artifacts supporting Article 28(3)(h) guarantees.',
        order: 5,
        weight: 2,
        questions: [
          {
            id: 'q_certs_held',
            sectionId: 'sec_certs',
            code: 'CRT-01',
            title: 'Active Third-Party Certifications & Audit Reports',
            description: 'Which formal third-party assurance credentials does your processing infrastructure currently maintain?',
            type: 'multi_select',
            required: true,
            weight: 4,
            applicableFrameworks: ['gdpr', 'iso_27001'],
            requiresEvidenceAttachment: true,
            options: [
              { label: 'ISO/IEC 27001:2022 Certified (ISMS)', value: 'iso_27001', score: 100 },
              { label: 'SOC 2 Type II Report (Operating Effectiveness)', value: 'soc2_type2', score: 100 },
              { label: 'ISO/IEC 27701:2019 Certified (PIMS)', value: 'iso_27701', score: 100 },
              { label: 'BSI C5 / Cloud Security Alliance STAR', value: 'csa_c5', score: 80 },
              { label: 'No formal third-party certification held', value: 'none', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_NO_ASSURANCE_CERTS', riskSeverity: 'medium', riskRationale: 'Vendor maintains no independent security certifications.' },
            ],
          },
        ],
      },
    ],
  },
  {
    id: 'templ_periodic_annual_review',
    code: 'PERIODIC_ANNUAL_REVIEW',
    name: 'Annual Periodic Processor & Vendor Assurance Review',
    assessmentType: 'periodic_assurance_review',
    description: 'Recurring annual verification of existing processor security posture, subprocessor changes, and renewed SOC/ISO reports.',
    version: '1.0.0',
    targetRole: 'data_processor',
    passingScoreThreshold: 70,
    sections: [
      {
        id: 'sec_changes',
        title: '1. Service Scope & Infrastructure Changes',
        description: 'Evaluate any modifications to hosting regions, data categories, or architecture over the past 12 months.',
        order: 1,
        weight: 2,
        questions: [
          {
            id: 'q_scope_changes',
            sectionId: 'sec_changes',
            code: 'CHG-01',
            title: 'Material Changes to Hosting Regions or Processing Architecture',
            description: 'Have there been any material changes to data hosting locations, third-country transfer routes, or infrastructure over the past 12 months?',
            type: 'single_select',
            required: true,
            weight: 3,
            applicableFrameworks: ['gdpr'],
            options: [
              { label: 'No material changes; processing unchanged', value: 'no_changes', score: 100 },
              { label: 'Yes, notified Controller in advance with updated TOMs', value: 'notified_changes', score: 90 },
              { label: 'Yes, new regions/subprocessors added without advance notice', value: 'unnotified_changes', score: 0, isRiskTrigger: true, riskCode: 'ASSESSMENT_UNNOTIFIED_CHANGES', riskSeverity: 'high', riskRationale: 'Infrastructure changes occurred without controller notification.' },
            ],
          },
        ],
      },
      {
        id: 'sec_annual_audit',
        title: '2. Updated Audit Reports & Renewals',
        description: 'Collect newly issued SOC 2 Type II or ISO surveillance certificates.',
        order: 2,
        weight: 3,
        questions: [
          {
            id: 'q_renewed_report',
            sectionId: 'sec_annual_audit',
            code: 'AUD-01',
            title: 'Provision of Current SOC 2 / ISO Certificate (< 12 Months Old)',
            description: 'Please upload your most recent SOC 2 Type II report or ISO 27001 surveillance audit certificate covering the current period.',
            type: 'file_upload',
            required: true,
            weight: 5,
            applicableFrameworks: ['iso_27001', 'gdpr'],
            requiresEvidenceAttachment: true,
          },
        ],
      },
    ],
  },
] as const;

// -----------------------------------------------------------------------------
// PURE DOMAIN EVALUATION ENGINES
// -----------------------------------------------------------------------------

/**
 * Calculates deterministic overall compliance percentage score for an assessment.
 */
export function calculateProcessorAssessmentScore(
  assessment: Pick<ProcessorAssessment, 'sections' | 'answers'>
): { overallScore: number; sectionScores: Record<string, number>; isPassing: boolean } {
  let totalWeightedPossible = 0;
  let totalWeightedEarned = 0;
  const sectionScores: Record<string, number> = {};

  for (const section of assessment.sections || []) {
    let sectionPossible = 0;
    let sectionEarned = 0;

    for (const q of section.questions || []) {
      const answer = assessment.answers?.[q.id];
      const qWeight = q.weight || 1;
      sectionPossible += 100 * qWeight;

      if (!answer || answer.value === null || answer.value === undefined) {
        // Unanswered: 0 earned
        continue;
      }

      if (q.type === 'single_select') {
        const option = q.options?.find((o) => o.value === answer.value);
        const score = option ? option.score : 0;
        sectionEarned += score * qWeight;
      } else if (q.type === 'multi_select' && Array.isArray(answer.value)) {
        if (answer.value.length === 0) {
          sectionEarned += 0;
        } else {
          let maxOptionScore = 0;
          for (const val of answer.value) {
            const option = q.options?.find((o) => o.value === val);
            if (option && option.score > maxOptionScore) {
              maxOptionScore = option.score;
            }
          }
          sectionEarned += maxOptionScore * qWeight;
        }
      } else if (q.type === 'boolean') {
        sectionEarned += (answer.value === true ? 100 : 0) * qWeight;
      } else if (q.type === 'file_upload') {
        // If evidence attached and not empty, award 100
        const hasFiles = (answer.attachedEvidenceIds && answer.attachedEvidenceIds.length > 0) ||
                         (answer.attachedFileNames && answer.attachedFileNames.length > 0);
        sectionEarned += (hasFiles ? 100 : 0) * qWeight;
      } else if (q.type === 'rating_scale' && typeof answer.value === 'number') {
        const normalized = Math.min(Math.max(answer.value, 0), 100);
        sectionEarned += normalized * qWeight;
      } else {
        // Text / Textarea: Default full if answered
        const hasText = typeof answer.value === 'string' && answer.value.trim().length > 0;
        sectionEarned += (hasText ? 100 : 0) * qWeight;
      }
    }

    const sectionPct = sectionPossible > 0 ? Math.round((sectionEarned / sectionPossible) * 100) : 100;
    sectionScores[section.id] = sectionPct;

    const sWeight = section.weight || 1;
    totalWeightedPossible += sectionPossible * sWeight;
    totalWeightedEarned += sectionEarned * sWeight;
  }

  const overallScore = totalWeightedPossible > 0
    ? Math.round((totalWeightedEarned / totalWeightedPossible) * 100)
    : 100;

  return {
    overallScore,
    sectionScores,
    isPassing: overallScore >= 70,
  };
}

/**
 * Derives actionable compliance risk flags from assessment answers and status.
 */
export function evaluateProcessorAssessmentRiskFlags(
  assessment: ProcessorAssessment,
  asOfDate: Date = new Date()
): AssessmentRiskFlag[] {
  const flags: AssessmentRiskFlag[] = [];
  const nowMillis = asOfDate.getTime();
  const dueMillis = new Date(assessment.dueDate).getTime();

  // 1. Overdue Submission Warning
  if (
    ['sent', 'in_progress'].includes(assessment.status) &&
    dueMillis < nowMillis
  ) {
    flags.push({
      id: `flag_overdue_${assessment.id}`,
      assessmentId: assessment.id,
      processorProfileId: assessment.processorProfileId,
      vendorId: assessment.vendorId,
      ruleCode: 'ASSESSMENT_OVERDUE_SUBMISSION',
      severity: 'high',
      title: `Assessment Overdue: ${assessment.vendorName}`,
      description: `Assessment for ${assessment.vendorName} was due on ${assessment.dueDate} and remains unsubmitted.`,
      suggestedRemediation: 'Send reminder notice or escalate to procurement contact.',
      isActionable: true,
      dedupKey: `${assessment.id}_ASSESSMENT_OVERDUE_SUBMISSION`,
    });
  }

  // 2. Assessment Rejected Warning
  if (assessment.status === 'rejected') {
    flags.push({
      id: `flag_rejected_${assessment.id}`,
      assessmentId: assessment.id,
      processorProfileId: assessment.processorProfileId,
      vendorId: assessment.vendorId,
      ruleCode: 'ASSESSMENT_REJECTED',
      severity: 'critical',
      title: `Assessment Rejected: ${assessment.vendorName}`,
      description: `Due diligence assessment was formally rejected: ${assessment.rejectionReason || 'Deficiencies identified.'}`,
      suggestedRemediation: 'Suspend onboarding or execute supplier risk mitigation plan.',
      isActionable: true,
      dedupKey: `${assessment.id}_ASSESSMENT_REJECTED`,
    });
  }

  // 3. Question-Level Risk Triggers
  for (const section of assessment.sections || []) {
    for (const q of section.questions || []) {
      const answer = assessment.answers?.[q.id];
      if (!answer) continue;

      if (q.type === 'single_select' && typeof answer.value === 'string') {
        const option = q.options?.find((o) => o.value === answer.value);
        if (option?.isRiskTrigger) {
          flags.push({
            id: `flag_${assessment.id}_${q.id}`,
            assessmentId: assessment.id,
            processorProfileId: assessment.processorProfileId,
            vendorId: assessment.vendorId,
            ruleCode: option.riskCode || 'ASSESSMENT_QUESTION_RISK',
            severity: option.riskSeverity || 'high',
            title: `Assessment Gap: ${q.title}`,
            description: option.riskRationale || `Respondent selected: ${option.label}`,
            suggestedRemediation: `Require corrective measure for ${q.title}.`,
            questionId: q.id,
            questionCode: q.code,
            isActionable: true,
            dedupKey: `${assessment.id}_${q.id}_${option.riskCode}`,
          });
        }
      }

      // Reviewer flagged items
      if (answer.reviewerFlag === 'critical_finding' || answer.reviewerFlag === 'gap') {
        flags.push({
          id: `flag_rev_${assessment.id}_${q.id}`,
          assessmentId: assessment.id,
          processorProfileId: assessment.processorProfileId,
          vendorId: assessment.vendorId,
          ruleCode: 'ASSESSMENT_REVIEWER_FINDING',
          severity: answer.reviewerFlag === 'critical_finding' ? 'critical' : 'high',
          title: `Reviewer Finding: ${q.title}`,
          description: answer.reviewerComment || `Reviewer noted compliance gap on ${q.code}.`,
          suggestedRemediation: 'Demand formal remediation plan from supplier.',
          questionId: q.id,
          questionCode: q.code,
          isActionable: true,
          dedupKey: `${assessment.id}_${q.id}_REVIEWER_FINDING`,
        });
      }
    }
  }

  return flags;
}

/**
 * Pure evaluator for assessment reminder notifications.
 */
export interface AssessmentReminderCandidate {
  assessmentId: string;
  vendorId?: string;
  vendorName: string;
  reminderType:
    | 'processor_assessment_review_due'
    | 'processor_assessment_overdue'
    | 'processor_assessment_recurring_due';
  priority: 'low' | 'medium' | 'high' | 'urgent';
  targetUserId: string;
  title: string;
  message: string;
  actionUrl: string;
  dedupKey: string;
}

export function evaluateProcessorAssessmentReminders(
  assessments: ProcessorAssessment[],
  asOfDate: Date = new Date()
): AssessmentReminderCandidate[] {
  const reminders: AssessmentReminderCandidate[] = [];
  const nowMillis = asOfDate.getTime();

  for (const a of assessments) {
    // 1. Overdue Submission Reminder
    if (['sent', 'in_progress'].includes(a.status)) {
      const dueMillis = new Date(a.dueDate).getTime();
      const daysOverdue = Math.ceil((nowMillis - dueMillis) / (1000 * 60 * 60 * 24));
      if (daysOverdue > 0) {
        reminders.push({
          assessmentId: a.id,
          vendorId: a.vendorId,
          vendorName: a.vendorName,
          reminderType: 'processor_assessment_overdue',
          priority: daysOverdue > 7 ? 'urgent' : 'high',
          targetUserId: a.reviewOwnerUserId,
          title: `Assessment Overdue: ${a.vendorName}`,
          message: `Assessment for ${a.vendorName} is ${daysOverdue} days past target deadline (${a.dueDate}).`,
          actionUrl: `/assessments/${a.id}`,
          dedupKey: `${a.id}_overdue_${Math.floor(nowMillis / (1000 * 60 * 60 * 24 * 7))}`, // dedup weekly
        });
      }
    }

    // 2. Pending Review Reminder
    if (a.status === 'submitted' && a.submittedAt) {
      const submittedMillis = new Date(a.submittedAt).getTime();
      const daysPending = Math.ceil((nowMillis - submittedMillis) / (1000 * 60 * 60 * 24));
      if (daysPending >= 3) {
        reminders.push({
          assessmentId: a.id,
          vendorId: a.vendorId,
          vendorName: a.vendorName,
          reminderType: 'processor_assessment_review_due',
          priority: daysPending > 7 ? 'high' : 'medium',
          targetUserId: a.reviewOwnerUserId,
          title: `Assessment Review Pending: ${a.vendorName}`,
          message: `Completed assessment for ${a.vendorName} submitted ${daysPending} days ago is awaiting compliance review.`,
          actionUrl: `/assessments/${a.id}`,
          dedupKey: `${a.id}_review_pending_${Math.floor(nowMillis / (1000 * 60 * 60 * 24 * 7))}`,
        });
      }
    }

    // 3. Recurring Next Assessment Due Reminder
    if (a.isRecurring && a.status === 'accepted' && a.nextDueDate) {
      const nextDueMillis = new Date(a.nextDueDate).getTime();
      const daysUntilNext = Math.ceil((nextDueMillis - nowMillis) / (1000 * 60 * 60 * 24));
      if (daysUntilNext <= 30 && daysUntilNext >= 0) {
        reminders.push({
          assessmentId: a.id,
          vendorId: a.vendorId,
          vendorName: a.vendorName,
          reminderType: 'processor_assessment_recurring_due',
          priority: 'medium',
          targetUserId: a.reviewOwnerUserId,
          title: `Recurring Assessment Renewal Due: ${a.vendorName}`,
          message: `Periodic assessment cycle for ${a.vendorName} is due for renewal in ${daysUntilNext} days (${a.nextDueDate}).`,
          actionUrl: `/assessments/${a.id}`,
          dedupKey: `${a.id}_renewal_${Math.floor(nowMillis / (1000 * 60 * 60 * 24 * 14))}`,
        });
      }
    }
  }

  return reminders;
}

// -----------------------------------------------------------------------------
// EXPORT PAYLOAD GENERATORS
// -----------------------------------------------------------------------------

export interface ProcessorAssessmentReportExportPayload {
  exportHeader: {
    exportType: 'processor_assessment_report';
    title: string;
    generatedAt: string;
    tenantId: string;
    assessmentCount: number;
  };
  assessments: Array<{
    assessmentId: string;
    title: string;
    assessmentType: ProcessorAssessmentType;
    status: ProcessorAssessmentStatus;
    vendorName: string;
    respondentEmail: string;
    scorePercent: number | null;
    riskRating: AssessmentRiskTier | null;
    dueDate: string;
    submittedAt: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    sectionsSummary: Array<{
      title: string;
      score: number;
    }>;
    riskFlags: AssessmentRiskFlag[];
  }>;
}

export function generateProcessorAssessmentReportPayload(
  assessments: ProcessorAssessment[],
  options: { tenantId: string; asOfDate?: Date }
): ProcessorAssessmentReportExportPayload {
  const asOfDate = options.asOfDate || new Date();

  return {
    exportHeader: {
      exportType: 'processor_assessment_report',
      title: 'Processor & Vendor Assessment Due Diligence Report',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      assessmentCount: assessments.length,
    },
    assessments: assessments.map((a) => {
      const scoreResult = calculateProcessorAssessmentScore(a);
      const riskFlags = evaluateProcessorAssessmentRiskFlags(a, asOfDate);

      return {
        assessmentId: a.id,
        title: a.title,
        assessmentType: a.assessmentType,
        status: a.status,
        vendorName: a.vendorName,
        respondentEmail: a.respondent?.email || '',
        scorePercent: a.overallScorePercent ?? scoreResult.overallScore,
        riskRating: a.overallRiskRating ?? (scoreResult.isPassing ? 'low' : 'high'),
        dueDate: a.dueDate,
        submittedAt: a.submittedAt || null,
        reviewedBy: a.reviewedBy || null,
        reviewedAt: a.reviewedAt || null,
        sectionsSummary: (a.sections || []).map((s) => ({
          title: s.title,
          score: scoreResult.sectionScores[s.id] ?? 0,
        })),
        riskFlags,
      };
    }),
  };
}

export interface ProcessorAssessmentSummaryMatrixPayload {
  exportHeader: {
    exportType: 'processor_assessment_summary_matrix';
    title: string;
    generatedAt: string;
    tenantId: string;
    totalAssessments: number;
    completedCount: number;
    overdueCount: number;
  };
  matrix: Array<{
    vendorName: string;
    assessmentType: string;
    status: string;
    score: number;
    riskTier: string;
    isRecurring: boolean;
    cadence: string;
    dueDate: string;
    submittedDate: string;
    reviewer: string;
    openRisksCount: number;
  }>;
}

export function generateProcessorAssessmentSummaryMatrixPayload(
  assessments: ProcessorAssessment[],
  options: { tenantId: string; asOfDate?: Date }
): ProcessorAssessmentSummaryMatrixPayload {
  const asOfDate = options.asOfDate || new Date();

  let completedCount = 0;
  let overdueCount = 0;

  const matrix = assessments.map((a) => {
    const scoreResult = calculateProcessorAssessmentScore(a);
    const flags = evaluateProcessorAssessmentRiskFlags(a, asOfDate);

    if (a.status === 'accepted') completedCount++;
    if (flags.some((f) => f.ruleCode === 'ASSESSMENT_OVERDUE_SUBMISSION')) overdueCount++;

    return {
      vendorName: a.vendorName,
      assessmentType: a.assessmentType,
      status: a.status,
      score: a.overallScorePercent ?? scoreResult.overallScore,
      riskTier: a.overallRiskRating ?? (scoreResult.isPassing ? 'low' : 'high'),
      isRecurring: a.isRecurring || false,
      cadence: a.recurrenceCadence || 'none',
      dueDate: a.dueDate,
      submittedDate: a.submittedAt || 'N/A',
      reviewer: a.reviewedBy || 'Unassigned',
      openRisksCount: flags.length,
    };
  });

  return {
    exportHeader: {
      exportType: 'processor_assessment_summary_matrix',
      title: 'Processor Assessment & Due Diligence Matrix',
      generatedAt: asOfDate.toISOString(),
      tenantId: options.tenantId,
      totalAssessments: assessments.length,
      completedCount,
      overdueCount,
    },
    matrix,
  };
}

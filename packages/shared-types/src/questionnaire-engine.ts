import { AssessmentRiskTier } from './processor-assessments.js';
import type { AssessmentAnswerItem } from './third-party-assessments.js';

// =============================================================================
// 1. QUESTION TYPES & OPTIONS
// =============================================================================

export type AssessmentQuestionType =
  | 'yes_no'
  | 'boolean'
  | 'single_select'
  | 'multi_select'
  | 'text'
  | 'textarea'
  | 'numeric'
  | 'date'
  | 'file_upload'
  | 'rating_scale';

export const VALID_QUESTION_TYPES: readonly AssessmentQuestionType[] = [
  'yes_no',
  'boolean',
  'single_select',
  'multi_select',
  'text',
  'textarea',
  'numeric',
  'date',
  'file_upload',
  'rating_scale',
] as const;

export interface QuestionOption {
  id?: string;
  label: string;
  value: string;
  score: number; // 0 - 100
  isRiskTrigger?: boolean;
  riskCode?: string;
  riskSeverity?: AssessmentRiskTier;
  riskRationale?: string;
  description?: string;
}

// =============================================================================
// 2. CONDITIONAL VISIBILITY & DYNAMIC FOLLOW-UP RULES
// =============================================================================

export type ConditionalOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'contains_any'
  | 'greater_than'
  | 'less_than'
  | 'greater_or_equal'
  | 'less_or_equal'
  | 'is_truthy'
  | 'is_falsy'
  | 'is_empty'
  | 'is_not_empty';

export type ConditionalAction =
  | 'show'
  | 'hide'
  | 'require'
  | 'make_optional';

export interface ConditionalVisibilityRule {
  id?: string;
  dependsOnQuestionId: string; // Foreign question ID in questionnaire
  operator: ConditionalOperator;
  targetValue?: string | string[] | number | boolean | null;
  action: ConditionalAction; // Default action is 'show' when condition matches
}

// =============================================================================
// 3. RISK TRIGGER RULES
// =============================================================================

export type RiskTriggerOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'contains_any'
  | 'greater_than'
  | 'less_than'
  | 'is_falsy'
  | 'is_empty';

export interface RiskTriggerRule {
  id?: string;
  operator: RiskTriggerOperator;
  triggerValue?: string | string[] | number | boolean | null;
  riskCode: string; // e.g. 'RISK_NO_ENCRYPTION_AT_REST', 'RISK_BREACH_SLA_GT_72H'
  riskTitle: string;
  riskSeverity: AssessmentRiskTier;
  riskCategory: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
  suggestedRemediation: string;
  statutoryCitation?: string; // e.g. 'GDPR Art. 32(1)(a)', 'ISO 27001 A.8.24'
}

export interface TriggeredRiskFlag {
  questionId: string;
  questionCode: string;
  riskCode: string;
  riskTitle: string;
  riskSeverity: AssessmentRiskTier;
  riskCategory: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
  answerValue: unknown;
  suggestedRemediation: string;
  statutoryCitation?: string;
}

// =============================================================================
// 4. SCORING & WEIGHTING METADATA
// =============================================================================

export interface NumericScoreRange {
  min?: number;
  max?: number;
  score: number; // 0 - 100
  label?: string;
}

export interface QuestionScoringConfig {
  weight: number; // Question weight within section (e.g. 1 - 10)
  maxPoints?: number; // Base max points (defaults to 100)
  passingThresholdScore?: number; // Minimum passing score % for question
  numericRanges?: NumericScoreRange[]; // For 'numeric' question types
  evidenceBonusPoints?: number; // Bonus points awarded when verified evidence is attached
  evidencePenaltyWhenMissing?: number; // Penalty points deducted if evidence is missing
}

// =============================================================================
// 5. QUESTIONNAIRE QUESTION SCHEMA
// =============================================================================

export interface NumericConstraints {
  min?: number;
  max?: number;
  step?: number;
  unit?: string; // e.g. 'hours', 'days', 'EUR', 'users'
}

export interface DateConstraints {
  minDate?: string; // ISO format YYYY-MM-DD
  maxDate?: string;
  allowPast?: boolean;
  allowFuture?: boolean;
}

export interface FileUploadConstraints {
  acceptedFileTypes?: string[]; // e.g. ['.pdf', '.docx', '.xlsx', '.png']
  maxSizeBytes?: number; // e.g. 25MB = 26214400
  acceptedEvidenceCategories?: string[]; // e.g. ['toms', 'soc_report', 'iso_certificate', 'dpa']
}

export interface RatingScaleConstraints {
  minRating: number; // e.g. 1
  maxRating: number; // e.g. 5 or 10
  minLabel?: string; // e.g. 'Poor / Non-Existent'
  maxLabel?: string; // e.g. 'Industry Leading / Fully Automated'
}

/**
 * Rich Questionnaire Question Specification
 */
export interface DynamicQuestionnaireQuestion {
  id: string;
  tenantId: string;
  templateId: string;
  sectionId: string;
  code: string; // e.g. 'TOM-01', 'GOV-02', 'ISO-15.1'
  title: string;
  description?: string;
  guidanceNotes?: string;
  questionType: AssessmentQuestionType;
  required: boolean;
  sortOrder: number;
  scoring: QuestionScoringConfig;

  // Options for single_select, multi_select, yes_no
  options?: QuestionOption[];

  // Constraints by Question Type
  numericConstraints?: NumericConstraints;
  dateConstraints?: DateConstraints;
  fileConstraints?: FileUploadConstraints;
  ratingConstraints?: RatingScaleConstraints;

  // Evidence Attachments
  requiresEvidence?: boolean;
  acceptedEvidenceCategories?: string[];

  // Conditional Logic & Follow-Up Questions
  conditionalRules?: ConditionalVisibilityRule[];

  // Automated Risk Triggers
  riskTriggers?: RiskTriggerRule[];

  // Statutory Citations & Assurance Mappings
  statutoryCitations?: string[]; // e.g. ['GDPR Art. 28(3)(c)', 'ISO 27001 Clause 5.1']
  certificationEquivalents?: string[]; // e.g. ['iso_27001', 'soc2_type2', 'c5']

  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// 6. QUESTIONNAIRE SECTION & TEMPLATE SCHEMAS
// =============================================================================

export interface DynamicQuestionnaireSection {
  id: string;
  tenantId: string;
  templateId: string;
  code: string; // e.g. 'SEC-GOV', 'SEC-TOMS'
  title: string;
  description?: string;
  sortOrder: number;
  weight: number; // Weight in total template score
  passingThresholdPercent?: number; // Minimum passing % for section
  conditionalRules?: ConditionalVisibilityRule[]; // Section-level visibility rules
  questions: DynamicQuestionnaireQuestion[];
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// 7. ANSWER SCHEMA & ATTACHED EVIDENCE
// =============================================================================

export interface AttachedFileMetadata {
  fileName: string;
  fileSizeBytes: number;
  mimeType: string;
  storagePath: string;
  fileHashSha256?: string;
  uploadedAt: string;
}

export interface QuestionnaireAnswer {
  questionId: string;
  questionCode: string;
  sectionId: string;
  value: string | string[] | boolean | number | null;
  comment?: string;
  attachedEvidenceIds: string[];
  attachedFileMetadata?: AttachedFileMetadata[];
  calculatedScore?: number;
  isPassing?: boolean;
  reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding';
  reviewerComment?: string;
  updatedAt: string;
}

// =============================================================================
// 8. CONDITIONAL LOGIC & VISIBILITY EVALUATOR
// =============================================================================

export interface QuestionVisibilityResult {
  isVisible: boolean;
  isRequired: boolean;
  reason?: string;
}

/**
 * Pure evaluator checking single conditional operator against answer value.
 */
export function evaluateCondition(
  actualValue: unknown,
  operator: ConditionalOperator,
  targetValue?: unknown
): boolean {
  if (operator === 'is_truthy') {
    return Boolean(actualValue) && actualValue !== 'no' && actualValue !== 'false';
  }

  if (operator === 'is_falsy') {
    return !actualValue || actualValue === 'no' || actualValue === 'false' || actualValue === 0;
  }

  if (operator === 'is_empty') {
    if (actualValue === null || actualValue === undefined) return true;
    if (typeof actualValue === 'string') return actualValue.trim() === '';
    if (Array.isArray(actualValue)) return actualValue.length === 0;
    return false;
  }

  if (operator === 'is_not_empty') {
    if (actualValue === null || actualValue === undefined) return false;
    if (typeof actualValue === 'string') return actualValue.trim() !== '';
    if (Array.isArray(actualValue)) return actualValue.length > 0;
    return true;
  }

  if (operator === 'equals') {
    return String(actualValue) === String(targetValue);
  }

  if (operator === 'not_equals') {
    return String(actualValue) !== String(targetValue);
  }

  if (operator === 'in') {
    if (!Array.isArray(targetValue)) return false;
    return targetValue.some((v) => String(v) === String(actualValue));
  }

  if (operator === 'not_in') {
    if (!Array.isArray(targetValue)) return true;
    return !targetValue.some((v) => String(v) === String(actualValue));
  }

  if (operator === 'contains') {
    if (Array.isArray(actualValue)) {
      return actualValue.some((v) => String(v) === String(targetValue));
    }
    if (typeof actualValue === 'string') {
      return actualValue.includes(String(targetValue));
    }
    return false;
  }

  if (operator === 'contains_any') {
    if (Array.isArray(actualValue) && Array.isArray(targetValue)) {
      return targetValue.some((t) => actualValue.includes(t));
    }
    return false;
  }

  const numActual = Number(actualValue);
  const numTarget = Number(targetValue);

  if (operator === 'greater_than') {
    return !isNaN(numActual) && !isNaN(numTarget) && numActual > numTarget;
  }

  if (operator === 'less_than') {
    return !isNaN(numActual) && !isNaN(numTarget) && numActual < numTarget;
  }

  if (operator === 'greater_or_equal') {
    return !isNaN(numActual) && !isNaN(numTarget) && numActual >= numTarget;
  }

  if (operator === 'less_or_equal') {
    return !isNaN(numActual) && !isNaN(numTarget) && numActual <= numTarget;
  }

  return false;
}

/**
 * Pure evaluator resolving whether a question is visible and required based on conditional rules.
 */
export function evaluateQuestionVisibility(
  question: DynamicQuestionnaireQuestion,
  answers: Record<string, QuestionnaireAnswer | undefined>
): QuestionVisibilityResult {
  let isVisible = true;
  let isRequired = question.required;

  if (!question.conditionalRules || question.conditionalRules.length === 0) {
    return { isVisible, isRequired };
  }

  for (const rule of question.conditionalRules) {
    const parentAnswer = answers[rule.dependsOnQuestionId];
    const parentVal = parentAnswer ? parentAnswer.value : null;

    const conditionMet = evaluateCondition(parentVal, rule.operator, rule.targetValue);

    if (rule.action === 'show') {
      isVisible = conditionMet;
    } else if (rule.action === 'hide') {
      isVisible = !conditionMet;
    } else if (rule.action === 'require' && conditionMet) {
      isRequired = true;
    } else if (rule.action === 'make_optional' && conditionMet) {
      isRequired = false;
    }
  }

  return { isVisible, isRequired };
}

// =============================================================================
// 9. SCORING ENGINE FOR QUESTION RESPONSES
// =============================================================================

export interface QuestionScoreResult {
  earnedPoints: number;
  maxPoints: number;
  scorePercent: number;
  isPassing: boolean;
}

/**
 * Calculates score for a single question response.
 */
export function evaluateQuestionScore(
  question: DynamicQuestionnaireQuestion,
  answer?: QuestionnaireAnswer
): QuestionScoreResult {
  const maxPoints = question.scoring.maxPoints || 100;
  const passingThreshold = question.scoring.passingThresholdScore || 70;

  if (!answer || answer.value === null || answer.value === undefined || answer.value === '') {
    return { earnedPoints: 0, maxPoints, scorePercent: 0, isPassing: false };
  }

  let rawScore = 0;
  const { questionType, options, scoring } = question;

  if (questionType === 'yes_no' || questionType === 'boolean') {
    if (answer.value === true || answer.value === 'yes' || answer.value === 'true') {
      rawScore = 100;
    } else {
      rawScore = 0;
    }
  } else if (questionType === 'single_select' && options) {
    const matchingOption = options.find((opt) => opt.value === String(answer.value));
    rawScore = matchingOption ? matchingOption.score : 0;
  } else if (questionType === 'multi_select' && options) {
    const selectedValues = Array.isArray(answer.value) ? answer.value : [String(answer.value)];
    if (selectedValues.length === 0) {
      rawScore = 0;
    } else {
      let sum = 0;
      for (const val of selectedValues) {
        const matchingOption = options.find((opt) => opt.value === val);
        if (matchingOption) {
          sum += matchingOption.score;
        }
      }
      rawScore = Math.min(100, Math.round(sum / selectedValues.length));
    }
  } else if (questionType === 'numeric') {
    const numVal = Number(answer.value);
    if (isNaN(numVal)) {
      rawScore = 0;
    } else if (scoring.numericRanges && scoring.numericRanges.length > 0) {
      const match = scoring.numericRanges.find((r) => {
        const meetsMin = r.min === undefined || numVal >= r.min;
        const meetsMax = r.max === undefined || numVal <= r.max;
        return meetsMin && meetsMax;
      });
      rawScore = match ? match.score : 0;
    } else {
      // Default: valid numeric response receives 100% unless constrained
      rawScore = 100;
    }
  } else if (questionType === 'rating_scale') {
    const rating = Number(answer.value);
    const minRating = question.ratingConstraints?.minRating || 1;
    const maxRating = question.ratingConstraints?.maxRating || 5;
    if (isNaN(rating) || rating < minRating) {
      rawScore = 0;
    } else {
      rawScore = Math.min(100, Math.round(((rating - minRating) / (maxRating - minRating)) * 100));
    }
  } else if (questionType === 'file_upload') {
    const hasEvidence =
      (answer.attachedEvidenceIds && answer.attachedEvidenceIds.length > 0) ||
      (answer.attachedFileMetadata && answer.attachedFileMetadata.length > 0);
    rawScore = hasEvidence ? 100 : 0;
  } else if (questionType === 'text' || questionType === 'textarea') {
    const textVal = String(answer.value).trim();
    rawScore = textVal.length > 0 ? 100 : 0;
  }

  // Evidence Bonus / Penalty Adjustments
  if (scoring.evidenceBonusPoints && answer.attachedEvidenceIds?.length > 0) {
    rawScore = Math.min(100, rawScore + scoring.evidenceBonusPoints);
  }
  if (scoring.evidencePenaltyWhenMissing && question.requiresEvidence && (!answer.attachedEvidenceIds || answer.attachedEvidenceIds.length === 0)) {
    rawScore = Math.max(0, rawScore - scoring.evidencePenaltyWhenMissing);
  }

  const scorePercent = rawScore;
  const earnedPoints = Math.round((rawScore / 100) * maxPoints);
  const isPassing = scorePercent >= passingThreshold;

  return { earnedPoints, maxPoints, scorePercent, isPassing };
}

// =============================================================================
// 10. RISK FLAGS DERIVATION ENGINE
// =============================================================================

/**
 * Evaluates configured risk triggers against question answer.
 */
export function evaluateQuestionRiskFlags(
  question: DynamicQuestionnaireQuestion,
  answer?: QuestionnaireAnswer
): TriggeredRiskFlag[] {
  const flags: TriggeredRiskFlag[] = [];
  if (!answer) return flags;

  // 1. Option-Level Risk Triggers (single_select / multi_select)
  if (question.options && question.options.length > 0) {
    const answerVals = Array.isArray(answer.value)
      ? answer.value
      : answer.value !== null && answer.value !== undefined
      ? [String(answer.value)]
      : [];

    for (const val of answerVals) {
      const opt = question.options.find((o) => o.value === val);
      if (opt && opt.isRiskTrigger) {
        flags.push({
          questionId: question.id,
          questionCode: question.code,
          riskCode: opt.riskCode || `RISK_${question.code}_${opt.value.toUpperCase()}`,
          riskTitle: opt.riskRationale || `Deficient Response for ${question.title}`,
          riskSeverity: opt.riskSeverity || 'high',
          riskCategory: 'third_party',
          answerValue: val,
          suggestedRemediation: `Follow up with vendor to address non-compliant answer: '${opt.label}'.`,
          statutoryCitation: question.statutoryCitations?.[0],
        });
      }
    }
  }

  // 2. Explicit Risk Trigger Rules
  if (question.riskTriggers && question.riskTriggers.length > 0) {
    for (const rule of question.riskTriggers) {
      const isTriggered = evaluateCondition(
        answer.value,
        rule.operator as ConditionalOperator,
        rule.triggerValue
      );

      if (isTriggered) {
        flags.push({
          questionId: question.id,
          questionCode: question.code,
          riskCode: rule.riskCode,
          riskTitle: rule.riskTitle,
          riskSeverity: rule.riskSeverity,
          riskCategory: rule.riskCategory,
          answerValue: answer.value,
          suggestedRemediation: rule.suggestedRemediation,
          statutoryCitation: rule.statutoryCitation || question.statutoryCitations?.[0],
        });
      }
    }
  }

  return flags;
}

// =============================================================================
// 10. RISK DERIVATION & POSTURE ANALYSIS ENGINE
// =============================================================================

export interface RiskFactorExplanation {
  factorCode: string;
  category:
    | 'score_threshold'
    | 'critical_finding'
    | 'missing_mandatory_evidence'
    | 'unanswered_critical_questions'
    | 'statutory_gap';
  severity: AssessmentRiskTier;
  title: string;
  reason: string;
  impactOnPosture: string;
  remediationAdvice: string;
  sourceQuestionCode?: string;
  statutoryCitation?: string;
}

export interface RecommendedRiskRegisterEntry {
  code: string;
  title: string;
  description: string;
  category: 'security' | 'privacy' | 'legal_compliance' | 'third_party' | 'operational';
  inherentLikelihood: number;
  inherentImpact: number;
  inherentScore: number;
  treatmentStrategy: 'mitigate' | 'accept' | 'transfer' | 'avoid';
  treatmentPlan: string;
  deduplicationKey: string;
  statutoryCitation?: string;
}

export interface SubmissionRiskPostureAnalysis {
  overallRiskTier: AssessmentRiskTier;
  overallScorePercent: number;
  isCompliant: boolean;
  requiresReviewFollowUp: boolean;
  postureSummaryText: string;
  explanations: RiskFactorExplanation[];
  triggeredFlags: TriggeredRiskFlag[];
  deduplicatedRiskCodes: string[];
  sectionBreakdown: Record<
    string,
    {
      sectionId: string;
      sectionTitle: string;
      scorePercent: number;
      riskTier: AssessmentRiskTier;
      flagCount: number;
      missingEvidenceCount: number;
    }
  >;
  recommendedRegisterEntries: RecommendedRiskRegisterEntry[];
}

/**
 * Evaluates full questionnaire responses against sections, scoring thresholds,
 * risk triggers, and missing evidence requirements to produce an explainable
 * posture analysis with deduplicated risk flags.
 */
export function analyzeSubmissionRiskPosture(
  sections: DynamicQuestionnaireSection[],
  answers: Record<string, QuestionnaireAnswer | AssessmentAnswerItem>,
  options: {
    passingScoreThreshold?: number;
    thirdPartyName?: string;
    vendorId?: string | null;
  } = {}
): SubmissionRiskPostureAnalysis {
  const passingScoreThreshold = options.passingScoreThreshold ?? 70;
  const thirdPartyName = options.thirdPartyName || 'Third Party';
  const vendorPrefix = options.vendorId || thirdPartyName.toLowerCase().replace(/[^a-z0-9]/g, '_');

  let totalEarnedPoints = 0;
  let totalPossiblePoints = 0;
  const allTriggeredFlags: TriggeredRiskFlag[] = [];
  const explanations: RiskFactorExplanation[] = [];
  const sectionBreakdown: SubmissionRiskPostureAnalysis['sectionBreakdown'] = {};

  // 1. Process Sections & Questions
  for (const sec of sections) {
    let secEarned = 0;
    let secPossible = 0;
    let secFlagCount = 0;
    let secMissingEvidence = 0;

    for (const q of sec.questions) {
      const vis = evaluateQuestionVisibility(q, answers as Record<string, QuestionnaireAnswer>);
      if (!vis.isVisible) continue;

      const qWeight = q.scoring?.weight || 1;
      secPossible += 100 * qWeight;

      const ans = answers[q.id];
      if (ans) {
        const scoreRes = evaluateQuestionScore(q, ans as QuestionnaireAnswer);
        secEarned += scoreRes.scorePercent * qWeight;

        // Evaluate question risk flags
        const qFlags = evaluateQuestionRiskFlags(q, ans as QuestionnaireAnswer);
        for (const flag of qFlags) {
          allTriggeredFlags.push(flag);
          secFlagCount++;
        }

        // Check missing evidence on question
        if (q.requiresEvidence) {
          const hasEvidence =
            (ans.attachedEvidenceIds && ans.attachedEvidenceIds.length > 0) ||
            (ans.attachedFileMetadata && ans.attachedFileMetadata.length > 0);
          if (!hasEvidence) {
            secMissingEvidence++;
          }
        }
      } else if (vis.isRequired) {
        if (q.requiresEvidence) secMissingEvidence++;
      }
    }

    totalEarnedPoints += secEarned;
    totalPossiblePoints += secPossible;

    const secScorePercent = secPossible > 0 ? Math.round((secEarned / secPossible) * 100) : 100;
    let secRiskTier: AssessmentRiskTier = 'low';
    if (secScorePercent < 50 || secFlagCount > 1) {
      secRiskTier = 'critical';
    } else if (secScorePercent < passingScoreThreshold || secFlagCount === 1) {
      secRiskTier = 'high';
    } else if (secScorePercent < 85) {
      secRiskTier = 'medium';
    }

    sectionBreakdown[sec.id] = {
      sectionId: sec.id,
      sectionTitle: sec.title,
      scorePercent: secScorePercent,
      riskTier: secRiskTier,
      flagCount: secFlagCount,
      missingEvidenceCount: secMissingEvidence,
    };
  }

  // 2. Compute Overall Score
  const overallScorePercent =
    totalPossiblePoints > 0 ? Math.round((totalEarnedPoints / totalPossiblePoints) * 100) : 100;
  const isCompliant = overallScorePercent >= passingScoreThreshold;

  // 3. Deduplicate Triggered Flags
  const seenRiskCodes = new Set<string>();
  const deduplicatedFlags: TriggeredRiskFlag[] = [];

  for (const flag of allTriggeredFlags) {
    if (!seenRiskCodes.has(flag.riskCode)) {
      seenRiskCodes.add(flag.riskCode);
      deduplicatedFlags.push(flag);
    }
  }

  const deduplicatedRiskCodes = Array.from(seenRiskCodes);

  // 4. Derive Overall Risk Tier & Explainability
  let overallRiskTier: AssessmentRiskTier = 'low';
  const hasCriticalFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'critical');
  const hasHighFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'high');
  const hasMediumFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'medium');

  if (hasCriticalFlags || overallScorePercent < 50) {
    overallRiskTier = 'critical';
  } else if (hasHighFlags || !isCompliant) {
    overallRiskTier = 'high';
  } else if (hasMediumFlags || overallScorePercent < 85) {
    overallRiskTier = 'medium';
  }

  // 5. Generate Transparent Explanations
  if (overallScorePercent < passingScoreThreshold) {
    explanations.push({
      factorCode: 'SCORE_BELOW_PASSING_THRESHOLD',
      category: 'score_threshold',
      severity: overallScorePercent < 50 ? 'critical' : 'high',
      title: 'Overall Score Below Compliance Threshold',
      reason: `The third party scored ${overallScorePercent}%, which is below the mandatory passing threshold of ${passingScoreThreshold}%.`,
      impactOnPosture: 'Indicates widespread gaps across technical, organizational, or privacy security assurances.',
      remediationAdvice: 'Require corrective action plan or reject engagement until deficient controls are remediated.',
    });
  }

  for (const flag of deduplicatedFlags) {
    explanations.push({
      factorCode: flag.riskCode,
      category: flag.statutoryCitation ? 'statutory_gap' : 'critical_finding',
      severity: flag.riskSeverity,
      title: flag.riskTitle,
      reason: `Triggered by response to question ${flag.questionCode}.`,
      impactOnPosture: `Direct operational vulnerability with ${flag.riskSeverity.toUpperCase()} risk severity.`,
      remediationAdvice: flag.suggestedRemediation,
      sourceQuestionCode: flag.questionCode,
      statutoryCitation: flag.statutoryCitation,
    });
  }

  // 6. Check Missing Evidence Indicators
  const missingEvResult = evaluateMissingEvidenceRequirements(sections, answers);
  if (missingEvResult.hasMissingEvidence) {
    explanations.push({
      factorCode: 'MISSING_MANDATORY_EVIDENCE',
      category: 'missing_mandatory_evidence',
      severity: missingEvResult.missingEvidenceCount > 2 ? 'high' : 'medium',
      title: 'Missing Required Assurance Evidence',
      reason: `${missingEvResult.missingEvidenceCount} question(s) require supporting evidence documents which have not yet been provided.`,
      impactOnPosture: 'Self-attested answers cannot be verified against certified audit standards without documentation.',
      remediationAdvice: 'Request submission of mandatory certificates, audit reports, or DPAs.',
    });
  }

  const requiresReviewFollowUp =
    overallRiskTier === 'critical' ||
    overallRiskTier === 'high' ||
    !isCompliant ||
    deduplicatedFlags.length > 0 ||
    missingEvResult.hasMissingEvidence;

  // 7. Summary Posture Narrative
  let postureSummaryText = `${thirdPartyName} demonstrates a ${overallRiskTier.toUpperCase()} risk posture with a weighted compliance score of ${overallScorePercent}%.`;
  if (requiresReviewFollowUp) {
    postureSummaryText += ` Internal review follow-up is required due to ${deduplicatedFlags.length} triggered risk flag(s) and ${missingEvResult.missingEvidenceCount} missing evidence attachment(s).`;
  } else {
    postureSummaryText += ` All mandatory questions, assurance controls, and evidence attachments meet compliance standards.`;
  }

  // 8. Recommended Risk Register Entries with Deduplication Keys
  const recommendedRegisterEntries: RecommendedRiskRegisterEntry[] = deduplicatedFlags.map((flag) => {
    let inherentLikelihood = 3;
    let inherentImpact = 3;
    if (flag.riskSeverity === 'critical') {
      inherentLikelihood = 4;
      inherentImpact = 5;
    } else if (flag.riskSeverity === 'high') {
      inherentLikelihood = 3;
      inherentImpact = 4;
    } else if (flag.riskSeverity === 'medium') {
      inherentLikelihood = 3;
      inherentImpact = 2;
    }

    return {
      code: flag.riskCode,
      title: `${flag.riskTitle} (${thirdPartyName})`,
      description: `Risk identified from external assessment response on question ${flag.questionCode}. ${flag.suggestedRemediation}`,
      category: flag.riskCategory,
      inherentLikelihood,
      inherentImpact,
      inherentScore: inherentLikelihood * inherentImpact,
      treatmentStrategy: flag.riskSeverity === 'critical' ? 'avoid' : 'mitigate',
      treatmentPlan: flag.suggestedRemediation,
      deduplicationKey: `TP_RISK_${vendorPrefix}_${flag.riskCode}`.toUpperCase(),
      statutoryCitation: flag.statutoryCitation,
    };
  });

  return {
    overallRiskTier,
    overallScorePercent,
    isCompliant,
    requiresReviewFollowUp,
    postureSummaryText,
    explanations,
    triggeredFlags: deduplicatedFlags,
    deduplicatedRiskCodes,
    sectionBreakdown,
    recommendedRegisterEntries,
  };
}

// =============================================================================
// 11. SCHEMA & ANSWER VALIDATORS
// =============================================================================

export interface ValidationEngineResult {
  valid: boolean;
  errors: string[];
}

export function validateQuestionDefinition(q: unknown): ValidationEngineResult {
  const errors: string[] = [];
  if (!q || typeof q !== 'object') {
    return { valid: false, errors: ['Question definition must be a non-null object.'] };
  }

  const question = q as Partial<DynamicQuestionnaireQuestion>;

  if (!question.id || typeof question.id !== 'string') {
    errors.push('id is required.');
  }
  if (!question.code || typeof question.code !== 'string' || question.code.trim() === '') {
    errors.push('code is required.');
  }
  if (!question.title || typeof question.title !== 'string' || question.title.trim() === '') {
    errors.push('title is required.');
  }
  if (!question.questionType || !VALID_QUESTION_TYPES.includes(question.questionType)) {
    errors.push(`questionType must be one of: ${VALID_QUESTION_TYPES.join(', ')}.`);
  }

  if (
    (question.questionType === 'single_select' || question.questionType === 'multi_select') &&
    (!Array.isArray(question.options) || question.options.length < 2)
  ) {
    errors.push('Select questions must specify at least 2 options.');
  }

  if (question.scoring) {
    if (typeof question.scoring.weight !== 'number' || question.scoring.weight < 0) {
      errors.push('scoring.weight must be a non-negative number.');
    }
  }

  return { valid: errors.length === 0, errors };
}

export function validateAnswer(
  question: DynamicQuestionnaireQuestion,
  answer: unknown,
  options: { checkRequired?: boolean; checkEvidence?: boolean } = {}
): ValidationEngineResult {
  const errors: string[] = [];
  if (!answer || typeof answer !== 'object') {
    return { valid: false, errors: ['Answer must be an object.'] };
  }

  const a = answer as Partial<QuestionnaireAnswer>;
  const isAnswered = a.value !== null && a.value !== undefined && a.value !== '';

  if (options.checkRequired && question.required && !isAnswered) {
    errors.push(`Question '${question.code}' is mandatory and must be answered.`);
    return { valid: false, errors };
  }

  if (!isAnswered) {
    return { valid: true, errors: [] };
  }

  // Type-specific value validation
  if (question.questionType === 'yes_no' || question.questionType === 'boolean') {
    if (typeof a.value !== 'boolean' && a.value !== 'yes' && a.value !== 'no' && a.value !== 'true' && a.value !== 'false') {
      errors.push(`Value for '${question.code}' must be a boolean or 'yes'/'no'.`);
    }
  } else if (question.questionType === 'single_select') {
    const stringVal = String(a.value);
    const validOpt = question.options?.some((opt) => opt.value === stringVal);
    if (!validOpt) {
      errors.push(`Value '${stringVal}' is not a valid option for question '${question.code}'.`);
    }
  } else if (question.questionType === 'multi_select') {
    if (!Array.isArray(a.value)) {
      errors.push(`Value for '${question.code}' must be an array.`);
    } else {
      for (const val of a.value) {
        const validOpt = question.options?.some((opt) => opt.value === String(val));
        if (!validOpt) {
          errors.push(`Value '${val}' is not a valid option for '${question.code}'.`);
        }
      }
    }
  } else if (question.questionType === 'numeric') {
    const num = Number(a.value);
    if (isNaN(num)) {
      errors.push(`Value for '${question.code}' must be a valid number.`);
    } else if (question.numericConstraints) {
      if (question.numericConstraints.min !== undefined && num < question.numericConstraints.min) {
        errors.push(`Value ${num} is below minimum allowed ${question.numericConstraints.min}.`);
      }
      if (question.numericConstraints.max !== undefined && num > question.numericConstraints.max) {
        errors.push(`Value ${num} exceeds maximum allowed ${question.numericConstraints.max}.`);
      }
    }
  } else if (question.questionType === 'date') {
    if (typeof a.value !== 'string' || isNaN(Date.parse(a.value))) {
      errors.push(`Value for '${question.code}' must be a valid ISO date string.`);
    }
  }

  // Check evidence requirement
  if (options.checkEvidence && question.requiresEvidence) {
    const hasEvidence =
      (a.attachedEvidenceIds && a.attachedEvidenceIds.length > 0) ||
      (a.attachedFileMetadata && a.attachedFileMetadata.length > 0);
    if (!hasEvidence) {
      errors.push(`Question '${question.code}' requires supporting evidence attachment.`);
    }
  }

  return { valid: errors.length === 0, errors };
}

// =============================================================================
// 7. MISSING EVIDENCE REQUIREMENTS EVALUATOR
// =============================================================================

export interface MissingEvidenceQuestionIndicator {
  questionId: string;
  questionCode: string;
  questionTitle: string;
  sectionId: string;
  sectionTitle: string;
  acceptedEvidenceCategories: string[];
  isRequired: boolean;
  scoringWeight: number;
}

export interface MissingEvidenceEvaluationResult {
  hasMissingEvidence: boolean;
  totalRequestedCount: number;
  providedEvidenceCount: number;
  missingEvidenceCount: number;
  missingQuestions: MissingEvidenceQuestionIndicator[];
}

/**
 * Evaluates a questionnaire submission to identify any visible questions requiring supporting evidence
 * where no evidence document has been attached.
 */
export function evaluateMissingEvidenceRequirements(
  sections: DynamicQuestionnaireSection[],
  answers: Record<string, QuestionnaireAnswer | AssessmentAnswerItem>
): MissingEvidenceEvaluationResult {
  let totalRequestedCount = 0;
  let providedEvidenceCount = 0;
  const missingQuestions: MissingEvidenceQuestionIndicator[] = [];

  for (const sec of sections) {
    for (const q of sec.questions) {
      const vis = evaluateQuestionVisibility(q, answers as Record<string, QuestionnaireAnswer>);
      if (vis.isVisible && q.requiresEvidence) {
        totalRequestedCount++;
        const ans = answers[q.id];
        const hasEvidence =
          (ans?.attachedEvidenceIds && ans.attachedEvidenceIds.length > 0) ||
          (ans?.attachedFileMetadata && ans.attachedFileMetadata.length > 0);

        if (hasEvidence) {
          providedEvidenceCount++;
        } else {
          missingQuestions.push({
            questionId: q.id,
            questionCode: q.code,
            questionTitle: q.title,
            sectionId: sec.id,
            sectionTitle: sec.title,
            acceptedEvidenceCategories: (q.acceptedEvidenceCategories || []) as string[],
            isRequired: vis.isRequired,
            scoringWeight: q.scoring?.weight || 1,
          });
        }
      }
    }
  }

  const missingEvidenceCount = missingQuestions.length;

  return {
    hasMissingEvidence: missingEvidenceCount > 0,
    totalRequestedCount,
    providedEvidenceCount,
    missingEvidenceCount,
    missingQuestions,
  };
}

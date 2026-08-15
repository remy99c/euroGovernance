import { AssessmentRiskTier } from './processor-assessments.js';

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

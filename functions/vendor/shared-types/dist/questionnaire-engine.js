"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_QUESTION_TYPES = void 0;
exports.evaluateCondition = evaluateCondition;
exports.evaluateQuestionVisibility = evaluateQuestionVisibility;
exports.evaluateQuestionScore = evaluateQuestionScore;
exports.evaluateQuestionRiskFlags = evaluateQuestionRiskFlags;
exports.analyzeSubmissionRiskPosture = analyzeSubmissionRiskPosture;
exports.validateQuestionDefinition = validateQuestionDefinition;
exports.validateAnswer = validateAnswer;
exports.isQuestionnaireAnswerValuePresent = isQuestionnaireAnswerValuePresent;
exports.evaluateMissingEvidenceRequirements = evaluateMissingEvidenceRequirements;
exports.VALID_QUESTION_TYPES = [
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
];
/**
 * Pure evaluator checking single conditional operator against answer value.
 */
function evaluateCondition(actualValue, operator, targetValue) {
    if (operator === 'is_truthy') {
        return Boolean(actualValue) && actualValue !== 'no' && actualValue !== 'false';
    }
    if (operator === 'is_falsy') {
        return !actualValue || actualValue === 'no' || actualValue === 'false' || actualValue === 0;
    }
    if (operator === 'is_empty') {
        if (actualValue === null || actualValue === undefined)
            return true;
        if (typeof actualValue === 'string')
            return actualValue.trim() === '';
        if (Array.isArray(actualValue))
            return actualValue.length === 0;
        return false;
    }
    if (operator === 'is_not_empty') {
        if (actualValue === null || actualValue === undefined)
            return false;
        if (typeof actualValue === 'string')
            return actualValue.trim() !== '';
        if (Array.isArray(actualValue))
            return actualValue.length > 0;
        return true;
    }
    if (operator === 'equals') {
        return String(actualValue) === String(targetValue);
    }
    if (operator === 'not_equals') {
        return String(actualValue) !== String(targetValue);
    }
    if (operator === 'in') {
        if (!Array.isArray(targetValue))
            return false;
        return targetValue.some((v) => String(v) === String(actualValue));
    }
    if (operator === 'not_in') {
        if (!Array.isArray(targetValue))
            return true;
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
function evaluateQuestionVisibility(question, answers) {
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
        }
        else if (rule.action === 'hide') {
            isVisible = !conditionMet;
        }
        else if (rule.action === 'require' && conditionMet) {
            isRequired = true;
        }
        else if (rule.action === 'make_optional' && conditionMet) {
            isRequired = false;
        }
    }
    return { isVisible, isRequired };
}
/**
 * Calculates score for a single question response.
 */
function evaluateQuestionScore(question, answer) {
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
        }
        else {
            rawScore = 0;
        }
    }
    else if (questionType === 'single_select' && options) {
        const matchingOption = options.find((opt) => opt.value === String(answer.value));
        rawScore = matchingOption ? matchingOption.score : 0;
    }
    else if (questionType === 'multi_select' && options) {
        const selectedValues = Array.isArray(answer.value) ? answer.value : [String(answer.value)];
        if (selectedValues.length === 0) {
            rawScore = 0;
        }
        else {
            let sum = 0;
            for (const val of selectedValues) {
                const matchingOption = options.find((opt) => opt.value === val);
                if (matchingOption) {
                    sum += matchingOption.score;
                }
            }
            rawScore = Math.min(100, Math.round(sum / selectedValues.length));
        }
    }
    else if (questionType === 'numeric') {
        const numVal = Number(answer.value);
        if (isNaN(numVal)) {
            rawScore = 0;
        }
        else if (scoring.numericRanges && scoring.numericRanges.length > 0) {
            const match = scoring.numericRanges.find((r) => {
                const meetsMin = r.min === undefined || numVal >= r.min;
                const meetsMax = r.max === undefined || numVal <= r.max;
                return meetsMin && meetsMax;
            });
            rawScore = match ? match.score : 0;
        }
        else {
            // Default: valid numeric response receives 100% unless constrained
            rawScore = 100;
        }
    }
    else if (questionType === 'rating_scale') {
        const rating = Number(answer.value);
        const minRating = question.ratingConstraints?.minRating || 1;
        const maxRating = question.ratingConstraints?.maxRating || 5;
        if (isNaN(rating) || rating < minRating) {
            rawScore = 0;
        }
        else {
            rawScore = Math.min(100, Math.round(((rating - minRating) / (maxRating - minRating)) * 100));
        }
    }
    else if (questionType === 'file_upload') {
        const hasEvidence = (answer.attachedEvidenceIds && answer.attachedEvidenceIds.length > 0) ||
            (answer.attachedFileMetadata && answer.attachedFileMetadata.length > 0);
        rawScore = hasEvidence ? 100 : 0;
    }
    else if (questionType === 'text' || questionType === 'textarea') {
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
function evaluateQuestionRiskFlags(question, answer) {
    const flags = [];
    if (!answer)
        return flags;
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
            const isTriggered = evaluateCondition(answer.value, rule.operator, rule.triggerValue);
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
/**
 * Evaluates full questionnaire responses against sections, scoring thresholds,
 * risk triggers, and missing evidence requirements to produce an explainable
 * posture analysis with deduplicated risk flags.
 */
function analyzeSubmissionRiskPosture(sections, answers, options = {}) {
    const passingScoreThreshold = options.passingScoreThreshold ?? 70;
    const thirdPartyName = options.thirdPartyName || 'Third Party';
    const vendorPrefix = options.vendorId || thirdPartyName.toLowerCase().replace(/[^a-z0-9]/g, '_');
    let totalEarnedPoints = 0;
    let totalPossiblePoints = 0;
    const allTriggeredFlags = [];
    const explanations = [];
    const sectionBreakdown = {};
    // 1. Process Sections & Questions
    for (const sec of sections) {
        let secEarned = 0;
        let secPossible = 0;
        let secFlagCount = 0;
        let secMissingEvidence = 0;
        for (const q of sec.questions) {
            const vis = evaluateQuestionVisibility(q, answers);
            if (!vis.isVisible)
                continue;
            const qWeight = q.scoring?.weight || 1;
            secPossible += 100 * qWeight;
            const ans = answers[q.id];
            if (ans) {
                const scoreRes = evaluateQuestionScore(q, ans);
                secEarned += scoreRes.scorePercent * qWeight;
                // Evaluate question risk flags
                const qFlags = evaluateQuestionRiskFlags(q, ans);
                for (const flag of qFlags) {
                    allTriggeredFlags.push(flag);
                    secFlagCount++;
                }
                // Check missing evidence on question
                if (q.requiresEvidence) {
                    const hasEvidence = (ans.attachedEvidenceIds && ans.attachedEvidenceIds.length > 0) ||
                        (ans.attachedFileMetadata && ans.attachedFileMetadata.length > 0);
                    if (!hasEvidence) {
                        secMissingEvidence++;
                    }
                }
            }
            else if (vis.isRequired) {
                if (q.requiresEvidence)
                    secMissingEvidence++;
            }
        }
        totalEarnedPoints += secEarned;
        totalPossiblePoints += secPossible;
        const secScorePercent = secPossible > 0 ? Math.round((secEarned / secPossible) * 100) : 100;
        let secRiskTier = 'low';
        if (secScorePercent < 50 || secFlagCount > 1) {
            secRiskTier = 'critical';
        }
        else if (secScorePercent < passingScoreThreshold || secFlagCount === 1) {
            secRiskTier = 'high';
        }
        else if (secScorePercent < 85) {
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
    const overallScorePercent = totalPossiblePoints > 0 ? Math.round((totalEarnedPoints / totalPossiblePoints) * 100) : 100;
    const isCompliant = overallScorePercent >= passingScoreThreshold;
    // 3. Deduplicate Triggered Flags
    const seenRiskCodes = new Set();
    const deduplicatedFlags = [];
    for (const flag of allTriggeredFlags) {
        if (!seenRiskCodes.has(flag.riskCode)) {
            seenRiskCodes.add(flag.riskCode);
            deduplicatedFlags.push(flag);
        }
    }
    const deduplicatedRiskCodes = Array.from(seenRiskCodes);
    // 4. Derive Overall Risk Tier & Explainability
    let overallRiskTier = 'low';
    const hasCriticalFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'critical');
    const hasHighFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'high');
    const hasMediumFlags = deduplicatedFlags.some((f) => f.riskSeverity === 'medium');
    if (hasCriticalFlags || overallScorePercent < 50) {
        overallRiskTier = 'critical';
    }
    else if (hasHighFlags || !isCompliant) {
        overallRiskTier = 'high';
    }
    else if (hasMediumFlags || overallScorePercent < 85) {
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
    const requiresReviewFollowUp = overallRiskTier === 'critical' ||
        overallRiskTier === 'high' ||
        !isCompliant ||
        deduplicatedFlags.length > 0 ||
        missingEvResult.hasMissingEvidence;
    // 7. Summary Posture Narrative
    let postureSummaryText = `${thirdPartyName} demonstrates a ${overallRiskTier.toUpperCase()} risk posture with a weighted compliance score of ${overallScorePercent}%.`;
    if (requiresReviewFollowUp) {
        postureSummaryText += ` Internal review follow-up is required due to ${deduplicatedFlags.length} triggered risk flag(s) and ${missingEvResult.missingEvidenceCount} missing evidence attachment(s).`;
    }
    else {
        postureSummaryText += ` All mandatory questions, assurance controls, and evidence attachments meet compliance standards.`;
    }
    // 8. Recommended Risk Register Entries with Deduplication Keys
    const recommendedRegisterEntries = deduplicatedFlags.map((flag) => {
        let inherentLikelihood = 3;
        let inherentImpact = 3;
        if (flag.riskSeverity === 'critical') {
            inherentLikelihood = 4;
            inherentImpact = 5;
        }
        else if (flag.riskSeverity === 'high') {
            inherentLikelihood = 3;
            inherentImpact = 4;
        }
        else if (flag.riskSeverity === 'medium') {
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
function validateQuestionDefinition(q) {
    const errors = [];
    if (!q || typeof q !== 'object') {
        return { valid: false, errors: ['Question definition must be a non-null object.'] };
    }
    const question = q;
    if (!question.id || typeof question.id !== 'string') {
        errors.push('id is required.');
    }
    if (!question.code || typeof question.code !== 'string' || question.code.trim() === '') {
        errors.push('code is required.');
    }
    if (!question.title || typeof question.title !== 'string' || question.title.trim() === '') {
        errors.push('title is required.');
    }
    if (!question.questionType || !exports.VALID_QUESTION_TYPES.includes(question.questionType)) {
        errors.push(`questionType must be one of: ${exports.VALID_QUESTION_TYPES.join(', ')}.`);
    }
    if ((question.questionType === 'single_select' || question.questionType === 'multi_select') &&
        (!Array.isArray(question.options) || question.options.length < 2)) {
        errors.push('Select questions must specify at least 2 options.');
    }
    if (question.scoring) {
        if (typeof question.scoring.weight !== 'number' || question.scoring.weight < 0) {
            errors.push('scoring.weight must be a non-negative number.');
        }
    }
    return { valid: errors.length === 0, errors };
}
function validateAnswer(question, answer, options = {}) {
    const errors = [];
    if (!answer || typeof answer !== 'object') {
        return { valid: false, errors: ['Answer must be an object.'] };
    }
    const a = answer;
    const isAnswered = isQuestionnaireAnswerValuePresent(a.value);
    // Callers pass the evaluated requirement state here. It may be stricter than
    // question.required when a conditional rule makes an otherwise optional
    // question mandatory.
    if (options.checkRequired && !isAnswered) {
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
    }
    else if (question.questionType === 'single_select') {
        const stringVal = String(a.value);
        const validOpt = question.options?.some((opt) => opt.value === stringVal);
        if (!validOpt) {
            errors.push(`Value '${stringVal}' is not a valid option for question '${question.code}'.`);
        }
    }
    else if (question.questionType === 'multi_select') {
        if (!Array.isArray(a.value)) {
            errors.push(`Value for '${question.code}' must be an array.`);
        }
        else {
            for (const val of a.value) {
                const validOpt = question.options?.some((opt) => opt.value === String(val));
                if (!validOpt) {
                    errors.push(`Value '${val}' is not a valid option for '${question.code}'.`);
                }
            }
        }
    }
    else if (question.questionType === 'numeric') {
        const num = Number(a.value);
        if (isNaN(num)) {
            errors.push(`Value for '${question.code}' must be a valid number.`);
        }
        else if (question.numericConstraints) {
            if (question.numericConstraints.min !== undefined && num < question.numericConstraints.min) {
                errors.push(`Value ${num} is below minimum allowed ${question.numericConstraints.min}.`);
            }
            if (question.numericConstraints.max !== undefined && num > question.numericConstraints.max) {
                errors.push(`Value ${num} exceeds maximum allowed ${question.numericConstraints.max}.`);
            }
        }
    }
    else if (question.questionType === 'date') {
        if (typeof a.value !== 'string' || isNaN(Date.parse(a.value))) {
            errors.push(`Value for '${question.code}' must be a valid ISO date string.`);
        }
    }
    // Check evidence requirement
    if (options.checkEvidence && question.requiresEvidence) {
        const hasEvidence = (a.attachedEvidenceIds && a.attachedEvidenceIds.length > 0) ||
            (a.attachedFileMetadata && a.attachedFileMetadata.length > 0);
        if (!hasEvidence) {
            errors.push(`Question '${question.code}' requires supporting evidence attachment.`);
        }
    }
    return { valid: errors.length === 0, errors };
}
/**
 * Canonical answer-presence predicate used by required-field gates and
 * completion metrics. Whitespace-only text and empty selections are not
 * evidence of an answered question.
 */
function isQuestionnaireAnswerValuePresent(value) {
    if (value === null || value === undefined)
        return false;
    if (typeof value === 'string')
        return value.trim().length > 0;
    if (Array.isArray(value))
        return value.length > 0;
    return true;
}
/**
 * Evaluates a questionnaire submission to identify any visible questions requiring supporting evidence
 * where no evidence document has been attached.
 */
function evaluateMissingEvidenceRequirements(sections, answers) {
    let totalRequestedCount = 0;
    let providedEvidenceCount = 0;
    const missingQuestions = [];
    for (const sec of sections) {
        for (const q of sec.questions) {
            const vis = evaluateQuestionVisibility(q, answers);
            if (vis.isVisible && q.requiresEvidence) {
                totalRequestedCount++;
                const ans = answers[q.id];
                const hasEvidence = (ans?.attachedEvidenceIds && ans.attachedEvidenceIds.length > 0) ||
                    (ans?.attachedFileMetadata && ans.attachedFileMetadata.length > 0);
                if (hasEvidence) {
                    providedEvidenceCount++;
                }
                else {
                    missingQuestions.push({
                        questionId: q.id,
                        questionCode: q.code,
                        questionTitle: q.title,
                        sectionId: sec.id,
                        sectionTitle: sec.title,
                        acceptedEvidenceCategories: (q.acceptedEvidenceCategories || []),
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
//# sourceMappingURL=questionnaire-engine.js.map
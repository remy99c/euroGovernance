"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_CONTROL_MAPPING_TYPES = exports.VALID_REQUIREMENT_COMPLIANCE_STATUSES = exports.VALID_APPLICABILITY_STATUSES = exports.VALID_APPLICABILITY_OUTCOMES = exports.VALID_APPLICABILITY_TYPES = exports.VALID_CONDITION_GROUP_OPERATORS = exports.VALID_APPLICABILITY_OPERATORS = exports.VALID_SCOPE_FACT_CATEGORIES = exports.VALID_SCOPE_PROFILE_STATUSES = exports.VALID_SCOPE_PROFILE_TYPES = exports.VALID_FRAMEWORK_ADOPTION_STATUSES = void 0;
exports.isValidFrameworkAdoptionStatus = isValidFrameworkAdoptionStatus;
exports.isValidScopeProfileType = isValidScopeProfileType;
exports.isValidScopeProfileStatus = isValidScopeProfileStatus;
exports.calculateScopeCompleteness = calculateScopeCompleteness;
exports.validateScopeProfile = validateScopeProfile;
exports.isValidApplicabilityType = isValidApplicabilityType;
exports.isValidApplicabilityStatus = isValidApplicabilityStatus;
exports.isValidRequirementComplianceStatus = isValidRequirementComplianceStatus;
exports.isValidControlMappingType = isValidControlMappingType;
exports.validateScopeFactValue = validateScopeFactValue;
exports.validateApplicabilityDecision = validateApplicabilityDecision;
exports.validateScopeAnswer = validateScopeAnswer;
exports.mapAnswerToScopeFact = mapAnswerToScopeFact;
exports.calculateQuestionnaireProgress = calculateQuestionnaireProgress;
exports.composeTenantQuestionnaire = composeTenantQuestionnaire;
exports.extractScopeFactRawValue = extractScopeFactRawValue;
exports.validateApplicabilityRule = validateApplicabilityRule;
exports.evaluateConditionClause = evaluateConditionClause;
exports.evaluateConditionGroup = evaluateConditionGroup;
exports.evaluateApplicabilityRule = evaluateApplicabilityRule;
exports.evaluateFrameworkApplicabilityRules = evaluateFrameworkApplicabilityRules;
exports.validateApplicabilityOverride = validateApplicabilityOverride;
exports.applyApplicabilityOverride = applyApplicabilityOverride;
exports.revertApplicabilityOverride = revertApplicabilityOverride;
exports.mapOutcomeToComplianceStatus = mapOutcomeToComplianceStatus;
exports.mapOutcomeToControlStatus = mapOutcomeToControlStatus;
exports.instantiateTenantGRC = instantiateTenantGRC;
exports.buildControlCoverageSummary = buildControlCoverageSummary;
exports.deriveStatutoryObligations = deriveStatutoryObligations;
exports.computeTenantFrameworkCoverage = computeTenantFrameworkCoverage;
exports.VALID_FRAMEWORK_ADOPTION_STATUSES = [
    'evaluating',
    'in_scoping',
    'adopted',
    'active',
    'under_audit',
    'retired',
];
exports.VALID_SCOPE_PROFILE_TYPES = [
    'general_compliance',
    'iso_isms',
    'iso_aims',
    'gdpr_privacy',
    'ai_governance',
    'data_act',
    'integrated_grc',
];
exports.VALID_SCOPE_PROFILE_STATUSES = [
    'draft',
    'under_review',
    'approved',
    'superseded',
];
exports.VALID_SCOPE_FACT_CATEGORIES = [
    'organization',
    'infrastructure',
    'data_processing',
    'ai_systems',
    'third_parties',
    'geography',
    'governance',
];
exports.VALID_APPLICABILITY_OPERATORS = [
    'equals',
    'not_equals',
    'in',
    'not_in',
    'contains',
    'not_contains',
    'contains_any',
    'contains_all',
    'greater_than',
    'less_than',
    'greater_than_or_equal',
    'less_than_or_equal',
    'is_true',
    'is_false',
    'is_empty',
    'is_not_empty',
    'exists',
    'not_exists',
];
exports.VALID_CONDITION_GROUP_OPERATORS = [
    'all',
    'any',
    'none',
    'not',
];
exports.VALID_APPLICABILITY_TYPES = [
    'statutory_mandatory',
    'rule_derived',
    'manual_inclusion',
    'manual_exclusion',
];
exports.VALID_APPLICABILITY_OUTCOMES = [
    'applicable',
    'not_applicable',
    'review_required',
    'inherited',
    'deferred',
    'conditionally_applicable',
    'pending_evaluation',
];
exports.VALID_APPLICABILITY_STATUSES = exports.VALID_APPLICABILITY_OUTCOMES;
exports.VALID_REQUIREMENT_COMPLIANCE_STATUSES = [
    'not_evaluated',
    'non_compliant',
    'partially_compliant',
    'compliant',
    'not_applicable',
];
exports.VALID_CONTROL_MAPPING_TYPES = [
    'equivalent',
    'subset',
    'superset',
    'intersecting',
    'compensating',
];
// =============================================================================
// VALIDATORS & TYPE GUARDS
// =============================================================================
function isValidFrameworkAdoptionStatus(status) {
    return typeof status === 'string' && exports.VALID_FRAMEWORK_ADOPTION_STATUSES.includes(status);
}
function isValidScopeProfileType(type) {
    return typeof type === 'string' && exports.VALID_SCOPE_PROFILE_TYPES.includes(type);
}
function isValidScopeProfileStatus(status) {
    return typeof status === 'string' && exports.VALID_SCOPE_PROFILE_STATUSES.includes(status);
}
/**
 * Calculates scope completeness percentage and identifies missing fact keys.
 */
function calculateScopeCompleteness(profile) {
    const checks = [
        { key: 'title', passed: !!profile.title && profile.title.trim().length > 0 },
        { key: 'narrativeStatement', passed: !!profile.narrativeStatement && profile.narrativeStatement.trim().length >= 10 },
        { key: 'includedLegalEntities', passed: Array.isArray(profile.includedLegalEntities) && profile.includedLegalEntities.length > 0 },
        { key: 'includedBusinessUnits', passed: Array.isArray(profile.includedBusinessUnits) && profile.includedBusinessUnits.length > 0 },
        { key: 'includedLocations', passed: Array.isArray(profile.includedLocations) && profile.includedLocations.length > 0 },
        { key: 'includedJurisdictions', passed: Array.isArray(profile.includedJurisdictions) && profile.includedJurisdictions.length > 0 },
        { key: 'processesPersonalData', passed: typeof profile.processesPersonalData === 'boolean' },
        { key: 'deploysAISystems', passed: typeof profile.deploysAISystems === 'boolean' },
        { key: 'cloudProviders', passed: Array.isArray(profile.cloudProviders) && profile.cloudProviders.length > 0 },
        { key: 'exclusionsJustification', passed: typeof profile.exclusionsJustification === 'string' && profile.exclusionsJustification.trim().length > 0 },
    ];
    const missingFactKeys = checks.filter((c) => !c.passed).map((c) => c.key);
    const passedCount = checks.length - missingFactKeys.length;
    const completenessPercentage = Math.round((passedCount / checks.length) * 100);
    const isComplete = missingFactKeys.length === 0;
    return { completenessPercentage, isComplete, missingFactKeys };
}
/**
 * Validates a TenantScopeProfile conforming to its declared profileType.
 */
function validateScopeProfile(profile) {
    if (!profile.title || typeof profile.title !== 'string' || profile.title.trim().length === 0) {
        return { valid: false, error: 'Scope profile title is required.' };
    }
    if (!profile.profileType || !isValidScopeProfileType(profile.profileType)) {
        return { valid: false, error: `Invalid or missing profileType: ${profile.profileType}` };
    }
    if (!profile.version || typeof profile.version !== 'string') {
        return { valid: false, error: 'Scope profile version string is required.' };
    }
    // Type-specific statutory & standard validations
    switch (profile.profileType) {
        case 'iso_isms':
        case 'iso_aims':
            if (!profile.narrativeStatement || profile.narrativeStatement.trim().length < 15) {
                return { valid: false, error: 'ISO scope profiles require a formal Clause 4.3 narrative scope statement.' };
            }
            if (!profile.includedLocations || profile.includedLocations.length === 0) {
                return { valid: false, error: 'ISO scope profiles require at least one included location/data center.' };
            }
            if (!profile.includedBusinessUnits || profile.includedBusinessUnits.length === 0) {
                return { valid: false, error: 'ISO scope profiles require at least one included business unit.' };
            }
            if (!profile.exclusionsJustification || profile.exclusionsJustification.trim().length === 0) {
                return { valid: false, error: 'ISO scope profiles require an explicit exclusions justification.' };
            }
            break;
        case 'gdpr_privacy':
            if (profile.processesPersonalData !== true) {
                return { valid: false, error: 'GDPR privacy scope profiles require processesPersonalData to be explicitly true.' };
            }
            if (!profile.includedJurisdictions || profile.includedJurisdictions.length === 0) {
                return { valid: false, error: 'GDPR privacy scope profiles require at least one target jurisdiction.' };
            }
            break;
        case 'ai_governance':
            if (typeof profile.deploysAISystems !== 'boolean') {
                return { valid: false, error: 'AI Governance scope profiles require an explicit deploysAISystems declaration.' };
            }
            if (profile.deploysHighRiskAI && (!profile.inScopeAISystemIds || profile.inScopeAISystemIds.length === 0)) {
                return { valid: false, error: 'AI Governance scope profiles declaring high-risk AI must link inScopeAISystemIds.' };
            }
            break;
    }
    return { valid: true };
}
function isValidApplicabilityType(type) {
    return typeof type === 'string' && exports.VALID_APPLICABILITY_TYPES.includes(type);
}
function isValidApplicabilityStatus(status) {
    return typeof status === 'string' && exports.VALID_APPLICABILITY_STATUSES.includes(status);
}
function isValidRequirementComplianceStatus(status) {
    return typeof status === 'string' && exports.VALID_REQUIREMENT_COMPLIANCE_STATUSES.includes(status);
}
function isValidControlMappingType(type) {
    return typeof type === 'string' && exports.VALID_CONTROL_MAPPING_TYPES.includes(type);
}
/**
 * Validates that a TenantScopeFact conforms to its declared data type.
 */
function validateScopeFactValue(fact) {
    if (!fact.factKey || typeof fact.factKey !== 'string' || fact.factKey.trim().length === 0) {
        return { valid: false, error: 'factKey is required and cannot be empty.' };
    }
    if (!fact.dataType || !['boolean', 'string', 'number', 'string_array'].includes(fact.dataType)) {
        return { valid: false, error: `Invalid fact dataType: ${fact.dataType}` };
    }
    switch (fact.dataType) {
        case 'boolean':
            if (typeof fact.valueBoolean !== 'boolean') {
                return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'boolean' but valueBoolean is not boolean.` };
            }
            break;
        case 'string':
            if (typeof fact.valueString !== 'string' || fact.valueString.length > 10_000) {
                return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'string' but valueString is not string.` };
            }
            break;
        case 'number':
            if (typeof fact.valueNumber !== 'number' || !Number.isFinite(fact.valueNumber)) {
                return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'number' but valueNumber is not a valid number.` };
            }
            break;
        case 'string_array':
            if (!Array.isArray(fact.valueArray) ||
                fact.valueArray.length > 100 ||
                fact.valueArray.some((item) => typeof item !== 'string' || item.trim().length === 0 || item.length > 500)) {
                return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'string_array' but valueArray is not an array of strings.` };
            }
            break;
    }
    return { valid: true };
}
/**
 * Validates an applicability decision payload, enforcing justification & override requirements.
 */
function validateApplicabilityDecision(decision) {
    if (!decision.requirementId || !decision.frameworkId) {
        return { valid: false, error: 'requirementId and frameworkId are required.' };
    }
    if (decision.isApplicable === undefined || typeof decision.isApplicable !== 'boolean') {
        return { valid: false, error: 'isApplicable must be an explicit boolean.' };
    }
    if (!decision.applicabilityType || !isValidApplicabilityType(decision.applicabilityType)) {
        return { valid: false, error: `Invalid applicabilityType: ${decision.applicabilityType}` };
    }
    // Non-applicable requires mandatory rationale
    if (!decision.isApplicable && (!decision.rationale || decision.rationale.trim().length === 0)) {
        return { valid: false, error: 'A clear rationale is mandatory when marking a requirement non-applicable.' };
    }
    // Manual exclusions or inclusions require overrideReason if overriding a rule
    if ((decision.applicabilityType === 'manual_exclusion' || decision.applicabilityType === 'manual_inclusion') &&
        decision.matchedRuleId &&
        (!decision.overrideReason || decision.overrideReason.trim().length === 0)) {
        return { valid: false, error: 'An overrideReason is strictly required when manually overriding an automated rule decision.' };
    }
    return { valid: true };
}
/**
 * Validates a TenantScopeAnswer against its target ScopeQuestion definition.
 */
function validateScopeAnswer(question, answer) {
    if (question.isRequired) {
        const hasValue = (answer.answerBoolean !== undefined && answer.answerBoolean !== null) ||
            (typeof answer.answerString === 'string' && answer.answerString.trim().length > 0) ||
            (typeof answer.answerNumber === 'number' && !isNaN(answer.answerNumber)) ||
            (Array.isArray(answer.answerArray) && answer.answerArray.length > 0);
        if (!hasValue) {
            return { valid: false, error: `Question '${question.prompt}' is mandatory.` };
        }
    }
    switch (question.responseType) {
        case 'boolean':
            if (answer.answerBoolean !== undefined && answer.answerBoolean !== null && typeof answer.answerBoolean !== 'boolean') {
                return { valid: false, error: `Question '${question.id}' expects boolean response.` };
            }
            break;
        case 'single_choice':
            if (typeof answer.answerString === 'string' && question.options && question.options.length > 0) {
                const allowed = question.options.map((o) => String(o.value));
                if (!allowed.includes(answer.answerString)) {
                    return { valid: false, error: `Invalid option '${answer.answerString}' for question '${question.id}'.` };
                }
            }
            break;
        case 'multi_choice':
        case 'string_array':
            if (Array.isArray(answer.answerArray) && question.options && question.options.length > 0) {
                const allowed = question.options.map((o) => String(o.value));
                for (const item of answer.answerArray) {
                    if (!allowed.includes(item)) {
                        return { valid: false, error: `Invalid option '${item}' for question '${question.id}'.` };
                    }
                }
            }
            break;
        case 'numeric':
            if (answer.answerNumber !== undefined && answer.answerNumber !== null && (typeof answer.answerNumber !== 'number' || isNaN(answer.answerNumber))) {
                return { valid: false, error: `Question '${question.id}' expects a valid number.` };
            }
            break;
    }
    return { valid: true };
}
/**
 * Maps a TenantScopeAnswer to a structured TenantScopeFact.
 */
function mapAnswerToScopeFact(tenantId, question, answer, userId) {
    const now = new Date().toISOString();
    let dataType = 'string';
    if (question.responseType === 'boolean')
        dataType = 'boolean';
    else if (question.responseType === 'numeric')
        dataType = 'number';
    else if (question.responseType === 'multi_choice' || question.responseType === 'string_array')
        dataType = 'string_array';
    return {
        id: question.factKey,
        tenantId,
        ownerId: userId,
        scopeProfileId: null,
        frameworkId: question.isTriggerForFrameworks[0] || null,
        factKey: question.factKey,
        factTitle: question.prompt,
        category: question.category,
        dataType,
        valueBoolean: answer.answerBoolean ?? null,
        valueString: answer.answerString ?? null,
        valueNumber: answer.answerNumber ?? null,
        valueArray: answer.answerArray ?? null,
        source: 'questionnaire',
        sourceQuestionId: question.id,
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userId,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
    };
}
/**
 * Calculates progress for a questionnaire given an array of questions and existing answers.
 */
function calculateQuestionnaireProgress(questions, answers) {
    const totalQuestions = questions.length;
    const requiredQuestions = questions.filter((q) => q.isRequired).length;
    let answeredQuestions = 0;
    let answeredRequiredQuestions = 0;
    const missingRequiredQuestionIds = [];
    for (const q of questions) {
        const ans = answers[q.id];
        const isAnswered = ans &&
            ((ans.answerBoolean !== undefined && ans.answerBoolean !== null) ||
                (typeof ans.answerString === 'string' && ans.answerString.trim().length > 0) ||
                (typeof ans.answerNumber === 'number' && !isNaN(ans.answerNumber)) ||
                (Array.isArray(ans.answerArray) && ans.answerArray.length > 0));
        if (isAnswered) {
            answeredQuestions++;
            if (q.isRequired) {
                answeredRequiredQuestions++;
            }
        }
        else if (q.isRequired) {
            missingRequiredQuestionIds.push(q.id);
        }
    }
    const progressPercentage = totalQuestions === 0 ? 100 : Math.round((answeredQuestions / totalQuestions) * 100);
    const isComplete = missingRequiredQuestionIds.length === 0 && (requiredQuestions === 0 ? answeredQuestions === totalQuestions : true);
    return {
        totalQuestions,
        requiredQuestions,
        answeredQuestions,
        answeredRequiredQuestions,
        progressPercentage,
        isComplete,
        missingRequiredQuestionIds,
    };
}
/**
 * Composes a unified questionnaire across multiple adopted frameworks, deduplicating shared questions.
 */
function composeTenantQuestionnaire(adoptedFrameworkIds, allQuestionnaires, allQuestions) {
    const relevantQuestionnaires = allQuestionnaires.filter((qnr) => qnr.frameworkIds.some((fid) => adoptedFrameworkIds.includes(fid)) || qnr.frameworkIds.length === 0);
    const seenFactKeys = new Set();
    const sections = [];
    let totalQuestionsCount = 0;
    let requiredQuestionsCount = 0;
    for (const qnr of relevantQuestionnaires) {
        const qnrQuestions = allQuestions
            .filter((q) => q.questionnaireId === qnr.id)
            .sort((a, b) => a.sortOrder - b.sortOrder);
        const sectionQuestions = [];
        for (const q of qnrQuestions) {
            if (!seenFactKeys.has(q.factKey)) {
                seenFactKeys.add(q.factKey);
                sectionQuestions.push(q);
                totalQuestionsCount++;
                if (q.isRequired) {
                    requiredQuestionsCount++;
                }
            }
        }
        if (sectionQuestions.length > 0) {
            sections.push({
                id: qnr.id,
                title: qnr.title,
                description: qnr.description,
                category: qnr.category,
                frameworkIds: qnr.frameworkIds.filter((fid) => adoptedFrameworkIds.includes(fid)),
                questions: sectionQuestions,
            });
        }
    }
    const sortedIds = [...adoptedFrameworkIds].sort();
    return {
        id: `composed_${sortedIds.join('_')}`,
        title: 'Harmonized Scope Discovery Questionnaire',
        description: `Multi-framework scoping assessment for adopted frameworks: ${adoptedFrameworkIds.join(', ')}`,
        applicableFrameworkIds: [...adoptedFrameworkIds],
        sections,
        totalQuestionsCount,
        requiredQuestionsCount,
    };
}
/**
 * Helper to extract raw value from a TenantScopeFact or primitive.
 */
function extractScopeFactRawValue(factOrVal) {
    if (factOrVal === null || factOrVal === undefined)
        return null;
    if (typeof factOrVal === 'object' &&
        ('valueBoolean' in factOrVal ||
            'valueString' in factOrVal ||
            'valueNumber' in factOrVal ||
            'valueArray' in factOrVal)) {
        const f = factOrVal;
        if (f.valueBoolean !== null && f.valueBoolean !== undefined)
            return f.valueBoolean;
        if (f.valueNumber !== null && f.valueNumber !== undefined)
            return f.valueNumber;
        if (f.valueArray !== null && f.valueArray !== undefined)
            return f.valueArray;
        if (f.valueString !== null && f.valueString !== undefined)
            return f.valueString;
        return null;
    }
    return factOrVal;
}
/**
 * Validates an ApplicabilityRule schema for structural correctness and condition integrity.
 */
function validateApplicabilityRule(rule) {
    if (!rule.id || typeof rule.id !== 'string' || rule.id.trim().length === 0) {
        return { valid: false, error: 'Rule id is required and cannot be empty.' };
    }
    if (!rule.frameworkId || typeof rule.frameworkId !== 'string' || rule.frameworkId.trim().length === 0) {
        return { valid: false, error: 'frameworkId is required.' };
    }
    if (!rule.targetRequirementId || typeof rule.targetRequirementId !== 'string' || rule.targetRequirementId.trim().length === 0) {
        return { valid: false, error: 'targetRequirementId is required.' };
    }
    if (!rule.resultingStatusIfMatched || !exports.VALID_APPLICABILITY_OUTCOMES.includes(rule.resultingStatusIfMatched)) {
        return { valid: false, error: `Invalid resultingStatusIfMatched: '${rule.resultingStatusIfMatched}'.` };
    }
    if (rule.resultingStatusIfNotMatched && !exports.VALID_APPLICABILITY_OUTCOMES.includes(rule.resultingStatusIfNotMatched)) {
        return { valid: false, error: `Invalid resultingStatusIfNotMatched: '${rule.resultingStatusIfNotMatched}'.` };
    }
    // Validate condition or conditionGroup
    const group = rule.conditionGroup || (rule.condition ? { logicalOperator: 'all', clauses: [rule.condition] } : null);
    if (!group) {
        return { valid: false, error: 'Rule must define either conditionGroup or condition.' };
    }
    return validateConditionGroupStructure(group);
}
function validateConditionGroupStructure(group) {
    if (!group.logicalOperator || !exports.VALID_CONDITION_GROUP_OPERATORS.includes(group.logicalOperator)) {
        return { valid: false, error: `Invalid group logicalOperator: '${group.logicalOperator}'. Must be all, any, none, or not.` };
    }
    if (!Array.isArray(group.clauses) && !Array.isArray(group.nestedGroups)) {
        return { valid: false, error: 'Condition group must define clauses or nestedGroups.' };
    }
    if (Array.isArray(group.clauses)) {
        for (const c of group.clauses) {
            if (!c.factKey || typeof c.factKey !== 'string' || c.factKey.trim().length === 0) {
                return { valid: false, error: 'Condition clause factKey is required.' };
            }
            if (!c.operator || !exports.VALID_APPLICABILITY_OPERATORS.includes(c.operator)) {
                return { valid: false, error: `Invalid clause operator: '${c.operator}'.` };
            }
            // Check operator expected value compatibility
            if (['greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal'].includes(c.operator)) {
                if (typeof c.expectedValue !== 'number') {
                    return { valid: false, error: `Operator '${c.operator}' on fact '${c.factKey}' requires numeric expectedValue.` };
                }
            }
            if (['contains_any', 'contains_all'].includes(c.operator)) {
                if (!Array.isArray(c.expectedValue)) {
                    return { valid: false, error: `Operator '${c.operator}' on fact '${c.factKey}' requires array expectedValue.` };
                }
            }
        }
    }
    if (Array.isArray(group.nestedGroups)) {
        for (const nested of group.nestedGroups) {
            const nestedVal = validateConditionGroupStructure(nested);
            if (!nestedVal.valid)
                return nestedVal;
        }
    }
    return { valid: true };
}
/**
 * Evaluates a single condition clause against known tenant scope facts.
 */
function evaluateConditionClause(clause, facts) {
    const actualRaw = facts[clause.factKey];
    const actual = extractScopeFactRawValue(actualRaw);
    const expected = clause.expectedValue;
    let passed = false;
    let reason = '';
    switch (clause.operator) {
        case 'equals':
            if (typeof actual === 'string' && typeof expected === 'string') {
                passed = actual.trim().toLowerCase() === expected.trim().toLowerCase();
            }
            else {
                passed = actual === expected;
            }
            reason = passed
                ? `Fact '${clause.factKey}' equals expected '${String(expected)}'`
                : `Fact '${clause.factKey}' value '${String(actual)}' does not equal expected '${String(expected)}'`;
            break;
        case 'not_equals':
            if (typeof actual === 'string' && typeof expected === 'string') {
                passed = actual.trim().toLowerCase() !== expected.trim().toLowerCase();
            }
            else {
                passed = actual !== expected;
            }
            reason = passed
                ? `Fact '${clause.factKey}' differs from '${String(expected)}'`
                : `Fact '${clause.factKey}' unexpectedly equals '${String(expected)}'`;
            break;
        case 'in':
            if (Array.isArray(expected)) {
                passed = expected.some((exp) => (typeof actual === 'string' && typeof exp === 'string' ? actual.toLowerCase() === exp.toLowerCase() : actual === exp));
            }
            reason = passed
                ? `Fact '${clause.factKey}' (${String(actual)}) is in [${Array.isArray(expected) ? expected.join(', ') : ''}]`
                : `Fact '${clause.factKey}' (${String(actual)}) is not in expected set`;
            break;
        case 'not_in':
            if (Array.isArray(expected)) {
                passed = !expected.some((exp) => (typeof actual === 'string' && typeof exp === 'string' ? actual.toLowerCase() === exp.toLowerCase() : actual === exp));
            }
            reason = passed
                ? `Fact '${clause.factKey}' (${String(actual)}) is not in [${Array.isArray(expected) ? expected.join(', ') : ''}]`
                : `Fact '${clause.factKey}' (${String(actual)}) was found in excluded set`;
            break;
        case 'contains':
            if (Array.isArray(actual)) {
                passed = actual.some((item) => (typeof item === 'string' && typeof expected === 'string' ? item.toLowerCase() === expected.toLowerCase() : item === expected));
            }
            else if (typeof actual === 'string' && typeof expected === 'string') {
                passed = actual.toLowerCase().includes(expected.toLowerCase());
            }
            reason = passed
                ? `Fact '${clause.factKey}' contains '${String(expected)}'`
                : `Fact '${clause.factKey}' does not contain '${String(expected)}'`;
            break;
        case 'not_contains':
            if (Array.isArray(actual)) {
                passed = !actual.some((item) => (typeof item === 'string' && typeof expected === 'string' ? item.toLowerCase() === expected.toLowerCase() : item === expected));
            }
            else if (typeof actual === 'string' && typeof expected === 'string') {
                passed = !actual.toLowerCase().includes(expected.toLowerCase());
            }
            reason = passed
                ? `Fact '${clause.factKey}' does not contain '${String(expected)}'`
                : `Fact '${clause.factKey}' contains excluded '${String(expected)}'`;
            break;
        case 'contains_any':
            if (Array.isArray(actual) && Array.isArray(expected)) {
                const actualLower = actual.map((a) => (typeof a === 'string' ? a.toLowerCase() : a));
                passed = expected.some((exp) => actualLower.includes(typeof exp === 'string' ? exp.toLowerCase() : exp));
            }
            reason = passed
                ? `Fact '${clause.factKey}' matches at least one expected entry in [${Array.isArray(expected) ? expected.join(', ') : ''}]`
                : `Fact '${clause.factKey}' shares no values with [${Array.isArray(expected) ? expected.join(', ') : ''}]`;
            break;
        case 'contains_all':
            if (Array.isArray(actual) && Array.isArray(expected)) {
                const actualLower = actual.map((a) => (typeof a === 'string' ? a.toLowerCase() : a));
                passed = expected.every((exp) => actualLower.includes(typeof exp === 'string' ? exp.toLowerCase() : exp));
            }
            reason = passed
                ? `Fact '${clause.factKey}' contains all required entries in [${Array.isArray(expected) ? expected.join(', ') : ''}]`
                : `Fact '${clause.factKey}' is missing one or more required entries from [${Array.isArray(expected) ? expected.join(', ') : ''}]`;
            break;
        case 'greater_than':
            passed = typeof actual === 'number' && typeof expected === 'number' && actual > expected;
            reason = passed
                ? `Fact '${clause.factKey}' (${actual}) > ${expected}`
                : `Fact '${clause.factKey}' (${actual}) is not > ${expected}`;
            break;
        case 'less_than':
            passed = typeof actual === 'number' && typeof expected === 'number' && actual < expected;
            reason = passed
                ? `Fact '${clause.factKey}' (${actual}) < ${expected}`
                : `Fact '${clause.factKey}' (${actual}) is not < ${expected}`;
            break;
        case 'greater_than_or_equal':
            passed = typeof actual === 'number' && typeof expected === 'number' && actual >= expected;
            reason = passed
                ? `Fact '${clause.factKey}' (${actual}) >= ${expected}`
                : `Fact '${clause.factKey}' (${actual}) is not >= ${expected}`;
            break;
        case 'less_than_or_equal':
            passed = typeof actual === 'number' && typeof expected === 'number' && actual <= expected;
            reason = passed
                ? `Fact '${clause.factKey}' (${actual}) <= ${expected}`
                : `Fact '${clause.factKey}' (${actual}) is not <= ${expected}`;
            break;
        case 'is_true':
            passed = actual === true;
            reason = passed ? `Fact '${clause.factKey}' is true` : `Fact '${clause.factKey}' is not true (${String(actual)})`;
            break;
        case 'is_false':
            passed = actual === false;
            reason = passed ? `Fact '${clause.factKey}' is false` : `Fact '${clause.factKey}' is not false (${String(actual)})`;
            break;
        case 'is_empty':
            passed = actual === null || actual === undefined || actual === '' || (Array.isArray(actual) && actual.length === 0);
            reason = passed ? `Fact '${clause.factKey}' is empty` : `Fact '${clause.factKey}' has value (${String(actual)})`;
            break;
        case 'is_not_empty':
            passed = actual !== null && actual !== undefined && actual !== '' && (!Array.isArray(actual) || actual.length > 0);
            reason = passed ? `Fact '${clause.factKey}' is populated` : `Fact '${clause.factKey}' is empty`;
            break;
        case 'exists':
            passed = actual !== null && actual !== undefined;
            reason = passed ? `Fact '${clause.factKey}' is recorded` : `Fact '${clause.factKey}' is not recorded`;
            break;
        case 'not_exists':
            passed = actual === null || actual === undefined;
            reason = passed ? `Fact '${clause.factKey}' is absent` : `Fact '${clause.factKey}' unexpectedly exists`;
            break;
    }
    return { passed, actualValue: actual, reason };
}
/**
 * Evaluates a condition group (with support for 'all', 'any', 'none', 'not' and nested groups).
 */
function evaluateConditionGroup(group, facts) {
    const clauseDetails = [];
    const auditTrail = [];
    const clauseResults = [];
    if (Array.isArray(group.clauses)) {
        for (const clause of group.clauses) {
            const evalRes = evaluateConditionClause(clause, facts);
            clauseDetails.push({
                factKey: clause.factKey,
                operator: clause.operator,
                expectedValue: clause.expectedValue ?? null,
                actualValue: evalRes.actualValue,
                passed: evalRes.passed,
                reason: evalRes.reason,
            });
            auditTrail.push(`[Clause: ${clause.factKey} ${clause.operator}] ${evalRes.reason} -> ${evalRes.passed ? 'PASS' : 'FAIL'}`);
            clauseResults.push(evalRes.passed);
        }
    }
    if (Array.isArray(group.nestedGroups)) {
        let groupIdx = 1;
        for (const nestedGroup of group.nestedGroups) {
            if (!nestedGroup)
                continue;
            const nestedRes = evaluateConditionGroup(nestedGroup, facts);
            clauseDetails.push(...nestedRes.clauseDetails);
            auditTrail.push(`[Nested Group ${groupIdx} (${nestedGroup.logicalOperator})] -> ${nestedRes.passed ? 'PASS' : 'FAIL'}`);
            auditTrail.push(...nestedRes.auditTrail.map((t) => `  ${t}`));
            clauseResults.push(nestedRes.passed);
            groupIdx++;
        }
    }
    let passed = false;
    switch (group.logicalOperator) {
        case 'all':
            passed = clauseResults.length === 0 || clauseResults.every(Boolean);
            break;
        case 'any':
            passed = clauseResults.some(Boolean);
            break;
        case 'none':
            passed = clauseResults.every((r) => !r);
            break;
        case 'not':
            passed = !(clauseResults.length === 0 || clauseResults.every(Boolean));
            break;
    }
    auditTrail.push(`[Group Summary (${group.logicalOperator})] Overall Result: ${passed ? 'MATCHED' : 'UNMATCHED'}`);
    return { passed, clauseDetails, auditTrail };
}
/**
 * Evaluates an ApplicabilityRule against tenant scope facts and returns structured audit explanation.
 */
function evaluateApplicabilityRule(rule, facts) {
    const group = rule.conditionGroup ||
        (rule.condition ? { logicalOperator: 'all', clauses: [rule.condition] } : { logicalOperator: 'all', clauses: [] });
    const evalGroup = evaluateConditionGroup(group, facts);
    const matched = evalGroup.passed;
    const now = new Date().toISOString();
    let resultingOutcome;
    let explanation = '';
    if (matched) {
        resultingOutcome = rule.resultingStatusIfMatched;
        explanation = `Rule '${rule.ruleName}' evaluated to MATCHED. Condition group (${group.logicalOperator}) satisfied. Statutory rationale: ${rule.statutoryRationale}`;
    }
    else {
        resultingOutcome = rule.resultingStatusIfNotMatched || (rule.resultingStatusIfMatched === 'applicable' ? 'not_applicable' : 'applicable');
        explanation = `Rule '${rule.ruleName}' did not match condition group (${group.logicalOperator}). Derived outcome: ${resultingOutcome}.`;
    }
    return {
        ruleId: rule.id,
        ruleName: rule.ruleName,
        frameworkId: rule.frameworkId,
        targetRequirementId: rule.targetRequirementId,
        targetMasterControlId: rule.targetMasterControlId || null,
        matched,
        resultingOutcome,
        explanation,
        auditTrail: evalGroup.auditTrail,
        clauseDetails: evalGroup.clauseDetails,
        evaluatedAt: now,
    };
}
/**
 * Evaluates an entire suite of ApplicabilityRules for a tenant against their scope facts.
 */
function evaluateFrameworkApplicabilityRules(rules, facts) {
    return rules.map((r) => evaluateApplicabilityRule(r, facts));
}
// =============================================================================
// APPLICABILITY OVERRIDE & REVIEW LIFECYCLE HELPERS
// =============================================================================
/**
 * Validates an applicability decision override request.
 * Strictly enforces non-empty override rationale (minimum 10 characters).
 */
function validateApplicabilityOverride(params) {
    const { newStatus, overrideRationale, decisionSource, reviewerId } = params;
    if (!isValidApplicabilityStatus(newStatus)) {
        return { valid: false, error: `Invalid applicability status: '${newStatus}'.` };
    }
    if (!overrideRationale || typeof overrideRationale !== 'string' || overrideRationale.trim().length < 10) {
        return {
            valid: false,
            error: 'Mandatory override rationale (minimum 10 characters) is required when manually overriding an applicability decision.',
        };
    }
    if (decisionSource === 'reviewer_override' && (!reviewerId || reviewerId.trim().length === 0)) {
        return {
            valid: false,
            error: 'Reviewer attribution (reviewerId) is required for reviewer_override decision source.',
        };
    }
    return { valid: true };
}
/**
 * Applies a manual or reviewer override to an applicability decision,
 * preserving original automatic baseline results for comparison and logging full historical attribution.
 */
function applyApplicabilityOverride(params) {
    const { decision, newStatus, isApplicable, overrideRationale, actorId, actorRole, decisionSource, reviewerId, reviewerRole, notes, } = params;
    const validation = validateApplicabilityOverride({
        newStatus,
        isApplicable,
        overrideRationale,
        decisionSource,
        reviewerId,
    });
    if (!validation.valid) {
        throw new Error(`Invalid override: ${validation.error}`);
    }
    const now = new Date().toISOString();
    // 1. Establish baseline auto result if not already captured
    const autoResult = decision.autoResult || {
        isApplicable: decision.isApplicable,
        status: decision.status,
        matchedRuleId: decision.matchedRuleId,
        ruleEvaluationSummary: decision.ruleEvaluationSummary,
        evaluatedAt: decision.assessedAt || decision.createdAt || now,
    };
    // 2. Build History Entry
    const historyEntry = {
        timestamp: now,
        actorId,
        actorRole,
        decisionSource,
        previousStatus: decision.status,
        newStatus,
        previousIsApplicable: decision.isApplicable,
        newIsApplicable: isApplicable,
        overrideRationale: overrideRationale.trim(),
        reviewerId: reviewerId || (decisionSource === 'reviewer_override' ? actorId : null),
        reviewerRole: reviewerRole || (decisionSource === 'reviewer_override' ? actorRole : null),
        notes: notes?.trim() || null,
    };
    const existingHistory = Array.isArray(decision.history) ? [...decision.history] : [];
    existingHistory.push(historyEntry);
    return {
        ...decision,
        status: newStatus,
        isApplicable,
        decisionSource,
        isOverridden: true,
        autoResult,
        overrideReason: overrideRationale.trim(),
        overrideRationale: overrideRationale.trim(),
        previousStatus: decision.status,
        reviewedBy: reviewerId || actorId,
        reviewedAt: now,
        reviewerRole: reviewerRole || actorRole,
        history: existingHistory,
        updatedAt: now,
        updatedBy: actorId,
    };
}
/**
 * Reverts an overridden applicability decision back to its automatic baseline result,
 * preserving full audit history of the reversion event.
 */
function revertApplicabilityOverride(params) {
    const { decision, actorId, actorRole, reason } = params;
    if (!decision.autoResult) {
        throw new Error('Cannot revert applicability decision: No automatic baseline result (autoResult) found on record.');
    }
    const now = new Date().toISOString();
    const baseline = decision.autoResult;
    const historyEntry = {
        timestamp: now,
        actorId,
        actorRole,
        decisionSource: 'auto',
        previousStatus: decision.status,
        newStatus: baseline.status,
        previousIsApplicable: decision.isApplicable,
        newIsApplicable: baseline.isApplicable,
        overrideRationale: `Reverted to automatic baseline: ${reason.trim()}`,
        reviewerId: actorId,
        reviewerRole: actorRole,
        notes: 'Reversion to automatic rule-evaluated baseline result.',
    };
    const existingHistory = Array.isArray(decision.history) ? [...decision.history] : [];
    existingHistory.push(historyEntry);
    return {
        ...decision,
        status: baseline.status,
        isApplicable: baseline.isApplicable,
        decisionSource: 'auto',
        isOverridden: false,
        matchedRuleId: baseline.matchedRuleId,
        ruleEvaluationSummary: baseline.ruleEvaluationSummary,
        overrideReason: null,
        overrideRationale: null,
        previousStatus: decision.status,
        reviewedBy: actorId,
        reviewedAt: now,
        reviewerRole: actorRole,
        history: existingHistory,
        updatedAt: now,
        updatedBy: actorId,
    };
}
function mapOutcomeToComplianceStatus(outcome) {
    switch (outcome) {
        case 'applicable':
            return 'not_evaluated';
        case 'not_applicable':
            return 'not_applicable';
        case 'review_required':
            return 'not_evaluated';
        case 'inherited':
            return 'compliant';
        case 'deferred':
            return 'not_evaluated';
        default:
            return 'not_evaluated';
    }
}
function mapOutcomeToControlStatus(outcome) {
    switch (outcome) {
        case 'applicable':
            return 'not_started';
        case 'not_applicable':
            return 'not_applicable';
        case 'review_required':
            return 'not_started';
        case 'inherited':
            return 'implemented';
        case 'deferred':
            return 'not_started';
        default:
            return 'not_started';
    }
}
/**
 * Deterministically instantiates or synchronizes tenant requirement instances and control instances.
 * Guarantees cross-framework harmonization (non-duplication) and lifecycle safety on rerun.
 */
function instantiateTenantGRC(input) {
    const now = new Date().toISOString();
    const reqMap = new Map();
    const ctrlMap = new Map();
    const controlMappings = [];
    if (input.existingRequirementInstances) {
        for (const req of input.existingRequirementInstances) {
            reqMap.set(req.requirementId, { ...req });
        }
    }
    if (input.existingControlInstances) {
        for (const ctrl of input.existingControlInstances) {
            ctrlMap.set(ctrl.id, { ...ctrl });
        }
    }
    const decisionsMap = new Map();
    for (const d of input.decisions) {
        decisionsMap.set(d.requirementId, d);
    }
    const masterControlById = new Map();
    for (const mc of input.masterControls) {
        masterControlById.set(mc.id, mc);
    }
    // Canonical mapping lookups
    const canonicalMapByMasterControl = new Map();
    if (input.canonicalControlMappings) {
        for (const ccm of input.canonicalControlMappings) {
            for (const mc of input.masterControls) {
                if (mc.canonicalControlMappingKey === ccm.id || mc.domain.toLowerCase() === ccm.harmonizedDomain.toLowerCase()) {
                    const list = canonicalMapByMasterControl.get(mc.id) || [];
                    if (!list.includes(ccm.id))
                        list.push(ccm.id);
                    canonicalMapByMasterControl.set(mc.id, list);
                }
            }
        }
    }
    let createdRequirementsCount = 0;
    let updatedRequirementsCount = 0;
    let createdControlsCount = 0;
    let updatedControlsCount = 0;
    for (const req of input.requirements) {
        const decision = decisionsMap.get(req.id);
        const outcome = decision?.status || (req.isMandatory ? 'applicable' : 'pending_evaluation');
        const isApplicable = outcome === 'applicable' ||
            outcome === 'conditionally_applicable' ||
            outcome === 'inherited' ||
            outcome === 'review_required';
        // Find master control IDs mapped to this requirement
        const targetMasterControlIds = input.requirementControlMappings
            .filter((rcm) => rcm.requirementId === req.id)
            .map((rcm) => rcm.masterControlId);
        const satisfyingControlIds = [];
        for (const mcId of targetMasterControlIds) {
            const masterControl = masterControlById.get(mcId);
            if (!masterControl)
                continue;
            const canonicalIds = canonicalMapByMasterControl.get(mcId) || (masterControl.canonicalControlMappingKey ? [masterControl.canonicalControlMappingKey] : []);
            // Check if control already instantiated with explicit harmonization merge permission
            let existingControl;
            let matchedCanonicalMapping;
            for (const candidate of ctrlMap.values()) {
                if (candidate.masterControlId === masterControl.id) {
                    existingControl = candidate;
                    break;
                }
                // Check canonical cross-walk mapping allowing automatic merge
                if (input.canonicalControlMappings && candidate.masterControlId) {
                    const mapping = input.canonicalControlMappings.find((ccm) => ccm.allowAutomaticMerge !== false &&
                        ['equivalent', 'superset'].includes(ccm.mappingType) &&
                        ((ccm.sourceMasterControlId === candidate.masterControlId && ccm.targetMasterControlId === masterControl.id) ||
                            (ccm.targetMasterControlId === candidate.masterControlId && ccm.sourceMasterControlId === masterControl.id)));
                    if (mapping) {
                        existingControl = candidate;
                        matchedCanonicalMapping = mapping;
                        break;
                    }
                }
            }
            let assignedControlId;
            if (existingControl) {
                // Update existing control (non-duplication / harmonization)
                let modified = false;
                if (!existingControl.frameworkIds.includes(req.frameworkId)) {
                    existingControl.frameworkIds.push(req.frameworkId);
                    modified = true;
                }
                if (!existingControl.requirementIds.includes(req.id)) {
                    existingControl.requirementIds.push(req.id);
                    modified = true;
                }
                for (const cid of canonicalIds) {
                    if (!existingControl.canonicalMappingIds.includes(cid)) {
                        existingControl.canonicalMappingIds.push(cid);
                        modified = true;
                    }
                }
                if (existingControl.frameworkIds.length > 1 && !existingControl.isHarmonized) {
                    existingControl.isHarmonized = true;
                    modified = true;
                }
                if (outcome === 'inherited' && existingControl.status === 'not_started') {
                    existingControl.status = 'implemented';
                    existingControl.healthScore = 100;
                    modified = true;
                }
                if (modified) {
                    existingControl.updatedAt = now;
                    existingControl.updatedBy = input.defaultOwnerId;
                    updatedControlsCount++;
                }
                assignedControlId = existingControl.id;
                satisfyingControlIds.push(existingControl.id);
            }
            else {
                // Instantiate new control
                const initialStatus = mapOutcomeToControlStatus(outcome);
                const newControlId = `ctrl_${masterControl.id.replace(/^ctl_master_/, '')}`;
                const newControl = {
                    id: newControlId,
                    tenantId: input.tenantId,
                    ownerId: input.defaultOwnerId,
                    masterControlId: masterControl.id,
                    code: masterControl.code,
                    title: masterControl.title,
                    description: masterControl.description,
                    domain: masterControl.domain,
                    frameworkIds: [req.frameworkId],
                    requirementIds: [req.id],
                    status: initialStatus,
                    healthScore: initialStatus === 'implemented' ? 100 : 0,
                    enforcementMechanism: 'manual',
                    reviewFrequencyDays: 90,
                    lastReviewDate: null,
                    nextReviewDate: null,
                    implementationNotes: outcome === 'inherited'
                        ? 'Control inherited from enterprise parent scope.'
                        : outcome === 'review_required'
                            ? 'Requires scoping review.'
                            : outcome === 'not_applicable'
                                ? 'Control not applicable based on current scope facts.'
                                : '',
                    isHarmonized: false,
                    canonicalMappingIds: canonicalIds,
                    createdAt: now,
                    updatedAt: now,
                    createdBy: input.defaultOwnerId,
                    updatedBy: input.defaultOwnerId,
                };
                ctrlMap.set(newControl.id, newControl);
                assignedControlId = newControl.id;
                satisfyingControlIds.push(newControl.id);
                createdControlsCount++;
            }
            // Record TenantControlMapping link
            const mappingId = `tcm_${assignedControlId}_${req.id}`;
            controlMappings.push({
                id: mappingId,
                tenantId: input.tenantId,
                ownerId: input.defaultOwnerId,
                controlId: assignedControlId,
                frameworkId: req.frameworkId,
                requirementId: req.id,
                sectionCode: req.sectionCode,
                requirementTitle: req.title,
                canonicalMappingId: matchedCanonicalMapping?.id || null,
                mappingType: matchedCanonicalMapping?.mappingType || 'equivalent',
                coverageRatio: matchedCanonicalMapping?.coverageRatio ?? 1.0,
                isDirectRequirement: matchedCanonicalMapping ? false : true,
                status: 'active',
                mappingRationale: matchedCanonicalMapping?.mappingRationale ||
                    `Control satisfies ${req.frameworkId.toUpperCase()} ${req.sectionCode} (${req.title}).`,
                compensatingControlsJustification: null,
                verifiedBy: null,
                verifiedAt: null,
                createdAt: now,
                updatedAt: now,
                createdBy: input.defaultOwnerId,
                updatedBy: input.defaultOwnerId,
            });
        }
        // Update or create TenantRequirementInstance
        const existingReqInstance = reqMap.get(req.id);
        let complianceStatus = mapOutcomeToComplianceStatus(outcome);
        // If existing requirement has already achieved compliant status and is still applicable, retain progress
        if (existingReqInstance && isApplicable && ['compliant', 'partially_compliant'].includes(existingReqInstance.complianceStatus)) {
            complianceStatus = existingReqInstance.complianceStatus;
        }
        if (existingReqInstance) {
            existingReqInstance.applicabilityDecisionId = decision?.id || req.id;
            existingReqInstance.complianceStatus = complianceStatus;
            existingReqInstance.satisfyingControlIds = Array.from(new Set([...existingReqInstance.satisfyingControlIds, ...satisfyingControlIds]));
            existingReqInstance.assessmentNotes = decision?.rationale || existingReqInstance.assessmentNotes;
            existingReqInstance.updatedAt = now;
            existingReqInstance.updatedBy = input.defaultOwnerId;
            updatedRequirementsCount++;
        }
        else {
            const newReqInstance = {
                id: `req_inst_${req.id}`,
                tenantId: input.tenantId,
                ownerId: input.defaultOwnerId,
                requirementId: req.id,
                frameworkId: req.frameworkId,
                sectionCode: req.sectionCode,
                title: req.title,
                description: req.description,
                category: req.category,
                isMandatory: req.isMandatory,
                applicabilityDecisionId: decision?.id || req.id,
                status: complianceStatus,
                complianceStatus,
                satisfyingControlIds,
                primaryAssigneeId: input.defaultOwnerId,
                department: 'Compliance',
                lastAssessmentDate: null,
                nextAssessmentDate: null,
                assessmentNotes: decision?.rationale ||
                    (outcome === 'deferred'
                        ? 'Obligation deferred per scoping timeline.'
                        : outcome === 'review_required'
                            ? 'Applicability pending formal scoping review.'
                            : ''),
                createdAt: now,
                updatedAt: now,
                createdBy: input.defaultOwnerId,
                updatedBy: input.defaultOwnerId,
            };
            reqMap.set(req.id, newReqInstance);
            createdRequirementsCount++;
        }
    }
    const requirementInstances = Array.from(reqMap.values());
    const controlInstances = Array.from(ctrlMap.values());
    const harmonizedControlsCount = controlInstances.filter((c) => c.isHarmonized).length;
    return {
        requirementInstances,
        controlInstances,
        controlMappings,
        createdRequirementsCount,
        updatedRequirementsCount,
        createdControlsCount,
        updatedControlsCount,
        harmonizedControlsCount,
    };
}
/**
 * Builds an explainable "One Control, Many Obligations" coverage report for users and auditors.
 */
function buildControlCoverageSummary(control, allRequirements, canonicalMappings, frameworks) {
    const reqMap = new Map();
    for (const r of allRequirements) {
        reqMap.set(r.id, r);
    }
    const frameworkTitleMap = new Map();
    if (frameworks) {
        for (const f of frameworks) {
            frameworkTitleMap.set(f.id, f.name);
        }
    }
    const obligations = [];
    for (const reqId of control.requirementIds) {
        const req = reqMap.get(reqId);
        if (!req)
            continue;
        const fwTitle = frameworkTitleMap.get(req.frameworkId) || req.frameworkId.toUpperCase();
        const isDirect = control.masterControlId ? true : false;
        // Find if canonical mapping explains this relationship
        const mapping = canonicalMappings?.find((m) => (m.sourceRequirementId === reqId || m.targetRequirementId === reqId) &&
            (m.sourceMasterControlId === control.masterControlId || m.targetMasterControlId === control.masterControlId));
        const mappingType = mapping?.mappingType || 'equivalent';
        const coverageRatio = mapping?.coverageRatio ?? 1.0;
        const statutoryRationale = mapping?.mappingRationale || `Operational control satisfies ${fwTitle} ${req.sectionCode} (${req.title}).`;
        const auditExplanation = `[${fwTitle} - ${req.sectionCode}] Coverage: ${(coverageRatio * 100).toFixed(0)}% via ${mappingType} mapping. ${statutoryRationale}`;
        obligations.push({
            frameworkId: req.frameworkId,
            frameworkTitle: fwTitle,
            requirementId: req.id,
            sectionCode: req.sectionCode,
            requirementTitle: req.title,
            mappingType,
            coverageRatio,
            isDirect,
            statutoryRationale,
            auditExplanation,
        });
    }
    const frameworksCovered = Array.from(new Set(obligations.map((o) => o.frameworkId)));
    const isHarmonized = frameworksCovered.length > 1;
    const coverageSummaryExplanation = isHarmonized
        ? `Single harmonized control '${control.code}' simultaneously satisfies ${obligations.length} statutory obligations across ${frameworksCovered.length} adopted frameworks (${frameworksCovered.join(', ')}).`
        : `Control '${control.code}' addresses ${obligations.length} requirement(s) under ${frameworksCovered.join(', ')}.`;
    return {
        controlId: control.id,
        controlCode: control.code,
        controlTitle: control.title,
        domain: control.domain,
        status: control.status,
        healthScore: control.healthScore,
        isHarmonized,
        totalObligationsSatisfied: obligations.length,
        frameworksCovered,
        obligations,
        coverageSummaryExplanation,
    };
}
/**
 * Evaluates tenant regulatory scope facts against adopted frameworks to derive
 * explicit, typed statutory obligations, required registers, assessments, and operational records.
 *
 * Distinctly models regulation-oriented requirements (GDPR, EU AI Act, EU Data Act) without
 * forcing them into an ISO-style control-only model.
 */
function deriveStatutoryObligations(params) {
    const { tenantId, defaultOwnerId, scopeFacts, decisions, adoptedFrameworks } = params;
    const now = new Date().toISOString();
    const factsMap = new Map();
    for (const fact of scopeFacts) {
        factsMap.set(fact.factKey, extractScopeFactRawValue(fact));
    }
    const decisionMap = new Map();
    for (const d of decisions) {
        decisionMap.set(d.requirementId, d);
    }
    const obligationFlags = [];
    const requiredRegisters = [];
    const requiredAssessments = [];
    const requiredOperationalRecords = [];
    const addObligation = (spec) => {
        const derivedDecision = spec.requirementId ? decisionMap.get(spec.requirementId) : undefined;
        const flagId = `obl_${spec.frameworkId}_${spec.obligationType}_${tenantId.substring(0, 8)}`;
        const flag = {
            id: flagId,
            tenantId,
            ownerId: defaultOwnerId,
            frameworkId: spec.frameworkId,
            obligationType: spec.obligationType,
            title: spec.title,
            description: spec.description,
            artifactKind: spec.artifactKind,
            targetCollection: spec.targetCollection,
            isMandatory: spec.isMandatory,
            status: 'active',
            triggeringFactKeys: spec.triggeringFactKeys,
            statutoryBasis: spec.statutoryBasis,
            suggestedArtifactTemplate: spec.suggestedArtifactTemplate,
            rationale: spec.rationale,
            derivedFromDecisionId: derivedDecision ? derivedDecision.id : null,
            createdAt: now,
            updatedAt: now,
            createdBy: defaultOwnerId,
            updatedBy: defaultOwnerId,
        };
        obligationFlags.push(flag);
        if (spec.artifactKind === 'required_register') {
            requiredRegisters.push({
                collection: spec.targetCollection,
                title: spec.title,
                obligationType: spec.obligationType,
                statutoryBasis: spec.statutoryBasis,
                rationale: spec.rationale,
                initialEntryDraft: spec.suggestedArtifactTemplate,
            });
        }
        else if (spec.artifactKind === 'required_assessment') {
            requiredAssessments.push({
                assessmentType: spec.obligationType,
                collection: spec.targetCollection,
                title: spec.title,
                obligationType: spec.obligationType,
                statutoryBasis: spec.statutoryBasis,
                rationale: spec.rationale,
            });
        }
        else if (spec.artifactKind === 'required_operational_record') {
            requiredOperationalRecords.push({
                recordType: spec.obligationType,
                collection: spec.targetCollection,
                title: spec.title,
                obligationType: spec.obligationType,
                statutoryBasis: spec.statutoryBasis,
                rationale: spec.rationale,
            });
        }
    };
    // 1. GDPR REGIME OBLIGATIONS
    if (adoptedFrameworks.includes('gdpr')) {
        const processesPersonalData = factsMap.get('processes_personal_data') === true ||
            factsMap.get('processesPersonalData') === true ||
            factsMap.get('gdpr.processesPersonalData') === true ||
            (Array.isArray(factsMap.get('dataCategories')) && factsMap.get('dataCategories').length > 0);
        if (processesPersonalData) {
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_ropa_register',
                title: 'Records of Processing Activities (ROPA)',
                description: 'Maintain centralized records of personal data processing operations under Article 30.',
                artifactKind: 'required_register',
                targetCollection: 'ropa_entries',
                isMandatory: true,
                triggeringFactKeys: ['processes_personal_data'],
                statutoryBasis: 'GDPR Article 30',
                rationale: 'Processing of personal data triggers statutory inventory and legal basis documentation.',
                requirementId: 'gdpr_art_30',
            });
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_breach_register',
                title: 'Personal Data Breach Incident Register',
                description: 'Log and track personal data security incidents within statutory 72-hour notification window.',
                artifactKind: 'required_operational_record',
                targetCollection: 'breach_logs',
                isMandatory: true,
                triggeringFactKeys: ['processes_personal_data'],
                statutoryBasis: 'GDPR Articles 33 & 34',
                rationale: 'Mandatory breach notification and documentation obligations under Article 33(5).',
                requirementId: 'gdpr_art_33',
            });
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_dsr_portal',
                title: 'Data Subject Rights (DSR) Request Intake & Fulfillment Log',
                description: 'Track and fulfill rights of access, erasure, rectification, and portability within 30 days.',
                artifactKind: 'required_operational_record',
                targetCollection: 'dsr_requests',
                isMandatory: true,
                triggeringFactKeys: ['processes_personal_data'],
                statutoryBasis: 'GDPR Chapter III (Articles 12-23)',
                rationale: 'Direct statutory individual rights obligations for data controllers.',
                requirementId: 'gdpr_art_15',
            });
        }
        const specialCategory = factsMap.get('processes_special_category_data') === true ||
            factsMap.get('processesSpecialCategoryData') === true ||
            factsMap.get('gdpr.processesSpecialCategoryData') === true ||
            factsMap.get('highRiskProcessing') === true;
        if (specialCategory) {
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_dpia_assessment',
                title: 'Data Protection Impact Assessment (DPIA)',
                description: 'Conduct and document formal risk assessment for high-risk and special category processing.',
                artifactKind: 'required_assessment',
                targetCollection: 'dpia_assessments',
                isMandatory: true,
                triggeringFactKeys: ['processes_special_category_data'],
                statutoryBasis: 'GDPR Article 35',
                rationale: 'High-risk processing operations likely to result in a high risk to rights and freedoms require prior DPIA.',
                requirementId: 'gdpr_art_35',
            });
        }
        const internationalTransfers = factsMap.get('has_international_transfers') === true ||
            factsMap.get('internationalDataTransfers') === true ||
            factsMap.get('gdpr.transfersDataOutsideEEA') === true;
        if (internationalTransfers) {
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_tia_assessment',
                title: 'Transfer Impact Assessment (TIA)',
                description: 'Evaluate destination country legal safeguards and supplementary technical measures (Schrems II).',
                artifactKind: 'required_assessment',
                targetCollection: 'tia_assessments',
                isMandatory: true,
                triggeringFactKeys: ['has_international_transfers'],
                statutoryBasis: 'GDPR Chapter V (Articles 44-49)',
                rationale: 'Data transfers outside EEA require documented verification of essentially equivalent protection.',
                requirementId: 'gdpr_art_46',
            });
            addObligation({
                frameworkId: 'gdpr',
                obligationType: 'gdpr_cross_border_safeguards',
                title: 'Standard Contractual Clauses (SCC) & Safeguards Register',
                description: 'Maintain executed SCCs, BCRs, and supplementary transfer measures.',
                artifactKind: 'obligation_flag',
                targetCollection: 'transfer_safeguards',
                isMandatory: true,
                triggeringFactKeys: ['has_international_transfers'],
                statutoryBasis: 'GDPR Article 46(2)(c)',
                rationale: 'Statutory basis verification for international third-party processors.',
                requirementId: 'gdpr_art_46',
            });
        }
    }
    // 2. EU AI ACT REGIME OBLIGATIONS
    if (adoptedFrameworks.includes('eu_ai_act')) {
        const deploysAI = factsMap.get('deploys_ai_systems') === true ||
            factsMap.get('deploysAISystems') === true ||
            factsMap.get('ai.deploysAISystems') === true ||
            factsMap.get('usesAI') === true;
        if (deploysAI) {
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_system_register',
                title: 'EU AI Act AI System Register',
                description: 'Maintain comprehensive inventory of all AI models, foundation models, and deployed systems.',
                artifactKind: 'required_register',
                targetCollection: 'ai_systems',
                isMandatory: true,
                triggeringFactKeys: ['deploys_ai_systems'],
                statutoryBasis: 'EU AI Act Articles 4, 49, 71',
                rationale: 'Mandatory organizational visibility into AI models, capabilities, and supply chain dependencies.',
                requirementId: 'ai_act_art_49',
            });
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_incident_register',
                title: 'AI Serious Incident & Malfunction Register',
                description: 'Log, investigate, and report serious AI incidents and malfunctions to national supervisory authorities.',
                artifactKind: 'required_operational_record',
                targetCollection: 'ai_incidents',
                isMandatory: true,
                triggeringFactKeys: ['deploys_ai_systems'],
                statutoryBasis: 'EU AI Act Article 73',
                rationale: 'Statutory notification obligations for high-risk and general AI system incidents.',
                requirementId: 'ai_act_art_73',
            });
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_transparency_notice',
                title: 'AI Transparency & Synthetic Content Disclosures',
                description: 'Provide clear user-facing disclosures when interacting with AI systems and synthetic media.',
                artifactKind: 'obligation_flag',
                targetCollection: 'ai_transparency_notices',
                isMandatory: true,
                triggeringFactKeys: ['deploys_ai_systems'],
                statutoryBasis: 'EU AI Act Article 50',
                rationale: 'Direct statutory disclosure obligations for deployers of generative AI and interactive systems.',
                requirementId: 'ai_act_art_50',
            });
        }
        const highRiskAI = factsMap.get('deploys_high_risk_ai') === true ||
            factsMap.get('highRiskAIUsage') === true ||
            factsMap.get('ai.highRiskUsage') === true ||
            factsMap.get('isHighRiskAI') === true;
        if (highRiskAI) {
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_risk_classification',
                title: 'AI Classification Assessment (Annex III & Prohibited Practices)',
                description: 'Formal risk tier determination verifying conformity with Annex III critical use cases.',
                artifactKind: 'required_assessment',
                targetCollection: 'ai_assessments',
                isMandatory: true,
                triggeringFactKeys: ['deploys_high_risk_ai'],
                statutoryBasis: 'EU AI Act Articles 6, 9 & Annex III',
                rationale: 'High-risk AI systems must undergo formal classification and continuous risk management system review.',
                requirementId: 'ai_act_art_9',
            });
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_fria_assessment',
                title: 'Fundamental Rights Impact Assessment (FRIA)',
                description: 'Document impact on fundamental rights, non-discrimination, privacy, and human oversight.',
                artifactKind: 'required_assessment',
                targetCollection: 'fria_assessments',
                isMandatory: true,
                triggeringFactKeys: ['deploys_high_risk_ai'],
                statutoryBasis: 'EU AI Act Article 27',
                rationale: 'Deployers of high-risk AI systems in critical public and commercial services must conduct a FRIA.',
                requirementId: 'ai_act_art_27',
            });
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_post_market_monitoring',
                title: 'Post-Market Monitoring Plan & Log',
                description: 'Continuous monitoring of high-risk AI system performance, drift, and bias during active operations.',
                artifactKind: 'required_operational_record',
                targetCollection: 'post_market_logs',
                isMandatory: true,
                triggeringFactKeys: ['deploys_high_risk_ai'],
                statutoryBasis: 'EU AI Act Article 72',
                rationale: 'Proactive post-deployment performance and reliability verification.',
                requirementId: 'ai_act_art_72',
            });
            addObligation({
                frameworkId: 'eu_ai_act',
                obligationType: 'ai_act_substantial_change_log',
                title: 'Substantial Modification Audit Log',
                description: 'Track model weight updates, retraining, and architectural changes requiring re-assessment.',
                artifactKind: 'required_operational_record',
                targetCollection: 'substantial_changes',
                isMandatory: true,
                triggeringFactKeys: ['deploys_high_risk_ai'],
                statutoryBasis: 'EU AI Act Article 43(4)',
                rationale: 'Substantial changes to high-risk AI require triggering new conformity assessment.',
                requirementId: 'ai_act_art_43',
            });
        }
    }
    // 3. EU DATA ACT REGIME OBLIGATIONS
    if (adoptedFrameworks.includes('eu_data_act')) {
        const isDataHolderOrConnected = factsMap.get('is_b2b_data_holder') === true ||
            factsMap.get('manufacturesConnectedProducts') === true ||
            factsMap.get('dataAct.isDataHolder') === true ||
            factsMap.get('providesConnectedServices') === true;
        if (isDataHolderOrConnected) {
            addObligation({
                frameworkId: 'eu_data_act',
                obligationType: 'data_act_asset_register',
                title: 'Connected Product & IoT Data Asset Register',
                description: 'Catalog accessible product data, metadata endpoints, and default formats for users and recipients.',
                artifactKind: 'required_register',
                targetCollection: 'data_act_assets',
                isMandatory: true,
                triggeringFactKeys: ['is_b2b_data_holder'],
                statutoryBasis: 'EU Data Act Chapter II (Articles 3-7)',
                rationale: 'Data holders must make generated data easily, securely, and freely accessible to users.',
                requirementId: 'data_act_art_3',
            });
            addObligation({
                frameworkId: 'eu_data_act',
                obligationType: 'data_act_b2b_sharing_register',
                title: 'B2B Data Sharing & FRAND Terms Register',
                description: 'Log third-party data access requests, compensation calculations, and trade secret safeguards.',
                artifactKind: 'required_register',
                targetCollection: 'data_sharing_requests',
                isMandatory: true,
                triggeringFactKeys: ['is_b2b_data_holder'],
                statutoryBasis: 'EU Data Act Chapter III & IV (Articles 8-13)',
                rationale: 'Mandatory fulfillment of fair, reasonable, and non-discriminatory (FRAND) data sharing obligations.',
                requirementId: 'data_act_art_8',
            });
        }
        const usesCloud = factsMap.get('uses_cloud_infrastructure') === true ||
            factsMap.get('usesCloudInfrastructure') === true ||
            (Array.isArray(factsMap.get('cloud_providers')) &&
                factsMap.get('cloud_providers').length > 0) ||
            (Array.isArray(factsMap.get('cloudProviders')) &&
                factsMap.get('cloudProviders').length > 0) ||
            factsMap.get('dataAct.usesCloudServices') === true;
        if (usesCloud) {
            addObligation({
                frameworkId: 'eu_data_act',
                obligationType: 'data_act_cloud_switching_register',
                title: 'Cloud Switching & Provider Interoperability Register',
                description: 'Document provider egress terms, functional equivalence assessments, and switching timelines.',
                artifactKind: 'required_register',
                targetCollection: 'switching_dependencies',
                isMandatory: true,
                triggeringFactKeys: ['uses_cloud_infrastructure'],
                statutoryBasis: 'EU Data Act Chapter VI (Articles 23-31)',
                rationale: 'Customer rights to switch cloud data processing services without obstacle.',
                requirementId: 'data_act_art_23',
            });
        }
    }
    return {
        obligationFlags,
        requiredRegisters,
        requiredAssessments,
        requiredOperationalRecords,
    };
}
/**
 * Computes deterministic framework coverage, obligation counts, gap indicators, and readiness metrics.
 */
function computeTenantFrameworkCoverage(params) {
    const { tenantId, adoptedFrameworkIds = [], frameworks = [], requirements = [], decisions = [], requirementInstances = [], controls = [], evidence = [], statutoryObligations = [], } = params;
    const now = new Date().toISOString();
    // Maps for fast lookup
    const reqInstanceMap = new Map();
    for (const ri of requirementInstances) {
        reqInstanceMap.set(ri.requirementId, ri);
    }
    const decisionMap = new Map();
    for (const d of decisions) {
        decisionMap.set(d.requirementId, d);
    }
    // Evidence linked to controls
    const evidenceControlIds = new Set();
    for (const ev of evidence) {
        if (ev && typeof ev === 'object') {
            if ('controlId' in ev && ev.controlId) {
                evidenceControlIds.add(ev.controlId);
            }
            if ('controlIds' in ev && Array.isArray(ev.controlIds)) {
                for (const cid of ev.controlIds)
                    evidenceControlIds.add(cid);
            }
        }
    }
    const frameworkMetricsList = [];
    let globalTotalRequirements = 0;
    let globalTotalApplicable = 0;
    let globalTotalNonApplicable = 0;
    let globalTotalReviewNeeded = 0;
    let globalTotalOpenGaps = 0;
    let globalTotalOverdueReviews = 0;
    let globalTotalMissingEvidence = 0;
    for (const fw of frameworks) {
        const isAdopted = adoptedFrameworkIds.includes(fw.id);
        const fwReqs = requirements.filter((r) => r.frameworkId === fw.id);
        const totalRequirementsCount = fwReqs.length;
        // Filter controls mapping to this framework
        const fwControls = controls.filter((c) => {
            const fws = c.frameworkIds || [];
            const singleFw = c.frameworkId;
            return fws.includes(fw.id) || singleFw === fw.id;
        });
        const totalControlsCount = fwControls.length;
        const implementedControlsCount = fwControls.filter((c) => c.status === 'implemented').length;
        const harmonizedControlsCount = fwControls.filter((c) => c.isHarmonized || (c.frameworkIds && c.frameworkIds.length > 1)).length;
        let applicableRequirementsCount = 0;
        let nonApplicableRequirementsCount = 0;
        let reviewNeededRequirementsCount = 0;
        let inheritedRequirementsCount = 0;
        let deferredRequirementsCount = 0;
        let openGapsCount = 0;
        let overdueReviewsCount = 0;
        for (const req of fwReqs) {
            const decision = decisionMap.get(req.id);
            const reqInstance = reqInstanceMap.get(req.id);
            const status = decision?.status || (req.isMandatory ? 'applicable' : 'applicable');
            if (status === 'applicable') {
                applicableRequirementsCount++;
                // Check if there are satisfying controls
                const satisfyingCount = reqInstance?.satisfyingControlIds?.length || 0;
                const hasImplementedControl = fwControls.some((c) => (reqInstance?.satisfyingControlIds || []).includes(c.id) && c.status === 'implemented');
                if (satisfyingCount === 0 || !hasImplementedControl) {
                    openGapsCount++;
                }
            }
            else if (status === 'not_applicable') {
                nonApplicableRequirementsCount++;
            }
            else if (status === 'review_required') {
                reviewNeededRequirementsCount++;
                overdueReviewsCount++;
            }
            else if (status === 'inherited') {
                inheritedRequirementsCount++;
            }
            else if (status === 'deferred') {
                deferredRequirementsCount++;
            }
            // Check overdue assessment dates on requirement instances
            if (reqInstance?.nextAssessmentDate && reqInstance.nextAssessmentDate < now) {
                overdueReviewsCount++;
            }
        }
        // Missing evidence: controls without verified evidence
        let missingEvidenceCount = 0;
        for (const c of fwControls) {
            if (!evidenceControlIds.has(c.id)) {
                missingEvidenceCount++;
            }
        }
        const readinessPercentage = totalRequirementsCount > 0
            ? Math.round(((implementedControlsCount + inheritedRequirementsCount) /
                Math.max(1, applicableRequirementsCount || totalRequirementsCount)) *
                100)
            : 0;
        const clampedReadiness = Math.min(100, Math.max(0, readinessPercentage));
        if (isAdopted) {
            globalTotalRequirements += totalRequirementsCount;
            globalTotalApplicable += applicableRequirementsCount;
            globalTotalNonApplicable += nonApplicableRequirementsCount;
            globalTotalReviewNeeded += reviewNeededRequirementsCount;
            globalTotalOpenGaps += openGapsCount;
            globalTotalOverdueReviews += overdueReviewsCount;
            globalTotalMissingEvidence += missingEvidenceCount;
        }
        frameworkMetricsList.push({
            frameworkId: fw.id,
            frameworkCode: fw.code,
            frameworkTitle: fw.name,
            category: fw.category,
            jurisdiction: fw.jurisdiction,
            version: fw.version,
            isAdopted,
            totalRequirementsCount,
            applicableRequirementsCount,
            nonApplicableRequirementsCount,
            reviewNeededRequirementsCount,
            inheritedRequirementsCount,
            deferredRequirementsCount,
            totalControlsCount,
            implementedControlsCount,
            harmonizedControlsCount,
            openGapsCount,
            overdueReviewsCount,
            missingEvidenceCount,
            readinessPercentage: clampedReadiness,
        });
    }
    const globalTotalControls = controls.length;
    const globalTotalHarmonized = controls.filter((c) => c.isHarmonized || (c.frameworkIds && c.frameworkIds.length > 1)).length;
    const globalImplementedControls = controls.filter((c) => c.status === 'implemented').length;
    const overallReadinessScore = globalTotalApplicable > 0
        ? Math.min(100, Math.round((globalImplementedControls / Math.max(1, globalTotalApplicable)) * 100))
        : 0;
    // Statutory obligations summary
    const byFramework = {};
    for (const obl of statutoryObligations) {
        byFramework[obl.frameworkId] = (byFramework[obl.frameworkId] || 0) + 1;
    }
    return {
        tenantId,
        generatedAt: now,
        adoptedFrameworksCount: adoptedFrameworkIds.length,
        totalRequirementsCount: globalTotalRequirements,
        totalApplicableCount: globalTotalApplicable,
        totalNonApplicableCount: globalTotalNonApplicable,
        totalReviewNeededCount: globalTotalReviewNeeded,
        totalControlsCount: globalTotalControls,
        totalHarmonizedControlsCount: globalTotalHarmonized,
        totalOpenGapsCount: globalTotalOpenGaps,
        totalOverdueReviewsCount: globalTotalOverdueReviews,
        totalMissingEvidenceCount: globalTotalMissingEvidence,
        overallReadinessScore,
        frameworks: frameworkMetricsList,
        statutoryObligationsSummary: {
            totalActiveObligations: statutoryObligations.length,
            byFramework,
        },
    };
}
//# sourceMappingURL=scoping-and-harmonization.js.map
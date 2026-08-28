"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PUBLIC_ASSESSMENT_LIMITS = void 0;
exports.createAssessmentTokenActivityUpdate = createAssessmentTokenActivityUpdate;
exports.validateAndNormalizePublicAssessmentAnswers = validateAndNormalizePublicAssessmentAnswers;
exports.sanitizePublicQuestionnaireSections = sanitizePublicQuestionnaireSections;
exports.buildAssessmentPortalAccessUrl = buildAssessmentPortalAccessUrl;
exports.evaluateAccessTokenValidity = evaluateAccessTokenValidity;
exports.createSanitizedPublicAssessmentView = createSanitizedPublicAssessmentView;
exports.PUBLIC_ASSESSMENT_LIMITS = {
    maxRequestBytes: 512 * 1024,
    maxPublicViewBytes: 1024 * 1024,
    maxAnswers: 2_000,
    maxTextLength: 10_000,
    maxCommentLength: 4_000,
    maxMultiSelectItems: 100,
    maxOptionValueLength: 256,
    maxIdentifierLength: 128,
};
/**
 * Viewing a questionnaire or saving a draft is not a submission and must not
 * consume a token's final-submission allowance. This also prevents refreshes or
 * automated link scanners from exhausting a respondent's invitation.
 */
function createAssessmentTokenActivityUpdate(token, activity, nowIso, clientIpMasked = null) {
    const update = {
        lastAccessedAt: nowIso,
        lastAccessedIpMasked: clientIpMasked,
        updatedAt: nowIso,
    };
    if (activity === 'final_submission') {
        update.useCount = token.useCount + 1;
        if (token.tokenType === 'single_use')
            update.status = 'used';
    }
    return update;
}
const ALLOWED_PUBLIC_ANSWER_FIELDS = new Set([
    'questionId',
    'questionCode',
    'sectionId',
    'value',
    'comment',
    'attachedEvidenceIds',
    'updatedAt',
]);
function isRecord(value) {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function isSafeQuestionIdentifier(value) {
    return (value.length > 0 &&
        value.length <= exports.PUBLIC_ASSESSMENT_LIMITS.maxIdentifierLength &&
        !value.includes('/') &&
        value !== '__proto__' &&
        value !== 'constructor' &&
        value !== 'prototype');
}
function isValidCalendarDate(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value))
        return false;
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return Number.isFinite(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
}
/**
 * Validates an untrusted public answer map against the immutable questionnaire
 * snapshot. It rejects question injection, server-owned review/scoring fields,
 * and all attachment references until a verified upload service issues them.
 */
function validateAndNormalizePublicAssessmentAnswers(sections, input, nowIso) {
    const errors = [];
    const normalizedAnswers = {};
    const addError = (message) => {
        if (errors.length < 25)
            errors.push(message);
    };
    if (!isRecord(input)) {
        return { valid: false, errors: ['answers must be an object keyed by question ID.'], normalizedAnswers };
    }
    const answerKeys = Object.keys(input);
    if (answerKeys.length > exports.PUBLIC_ASSESSMENT_LIMITS.maxAnswers) {
        return {
            valid: false,
            errors: [`answers exceeds the ${exports.PUBLIC_ASSESSMENT_LIMITS.maxAnswers} question limit.`],
            normalizedAnswers,
        };
    }
    const questionById = new Map();
    for (const section of sections) {
        if (!isSafeQuestionIdentifier(section.id)) {
            addError('The questionnaire contains an unsafe section identifier.');
            continue;
        }
        for (const question of section.questions) {
            if (!isSafeQuestionIdentifier(question.id) || questionById.has(question.id)) {
                addError('The questionnaire contains an unsafe or duplicate question identifier.');
                continue;
            }
            questionById.set(question.id, { question, sectionId: section.id });
        }
    }
    if (questionById.size > exports.PUBLIC_ASSESSMENT_LIMITS.maxAnswers) {
        addError(`The questionnaire exceeds the ${exports.PUBLIC_ASSESSMENT_LIMITS.maxAnswers} question limit.`);
    }
    for (const key of answerKeys) {
        const definition = questionById.get(key);
        if (!definition) {
            addError(`Answer key '${key.slice(0, exports.PUBLIC_ASSESSMENT_LIMITS.maxIdentifierLength)}' is not part of this questionnaire.`);
            continue;
        }
        const rawAnswer = input[key];
        if (!isRecord(rawAnswer)) {
            addError(`Answer '${definition.question.code}' must be an object.`);
            continue;
        }
        const unknownFields = Object.keys(rawAnswer).filter((field) => !ALLOWED_PUBLIC_ANSWER_FIELDS.has(field));
        if (unknownFields.length > 0) {
            addError(`Answer '${definition.question.code}' contains unsupported or server-owned fields.`);
            continue;
        }
        if ('attachedFileMetadata' in rawAnswer || 'storagePath' in rawAnswer) {
            addError(`Answer '${definition.question.code}' contains unverified attachment metadata.`);
            continue;
        }
        if (rawAnswer.questionId !== key ||
            rawAnswer.questionCode !== definition.question.code ||
            rawAnswer.sectionId !== definition.sectionId) {
            addError(`Answer identity does not match question '${definition.question.code}'.`);
            continue;
        }
        if (rawAnswer.attachedEvidenceIds !== undefined &&
            (!Array.isArray(rawAnswer.attachedEvidenceIds) || rawAnswer.attachedEvidenceIds.length > 0)) {
            addError(`Answer '${definition.question.code}' contains an unverified evidence reference.`);
            continue;
        }
        const { question } = definition;
        const value = rawAnswer.value;
        let valueIsValid = value === null || value === '';
        if (value !== null && value !== '') {
            switch (question.questionType) {
                case 'yes_no':
                case 'boolean':
                    valueIsValid = typeof value === 'boolean';
                    break;
                case 'single_select':
                    valueIsValid =
                        typeof value === 'string' &&
                            value.length <= exports.PUBLIC_ASSESSMENT_LIMITS.maxOptionValueLength &&
                            Boolean(question.options?.some((option) => option.value === value));
                    break;
                case 'multi_select':
                    valueIsValid =
                        Array.isArray(value) &&
                            value.length <= exports.PUBLIC_ASSESSMENT_LIMITS.maxMultiSelectItems &&
                            new Set(value).size === value.length &&
                            value.every((item) => typeof item === 'string' &&
                                item.length <= exports.PUBLIC_ASSESSMENT_LIMITS.maxOptionValueLength &&
                                Boolean(question.options?.some((option) => option.value === item)));
                    break;
                case 'text':
                case 'textarea':
                    valueIsValid =
                        typeof value === 'string' && value.length <= exports.PUBLIC_ASSESSMENT_LIMITS.maxTextLength;
                    break;
                case 'numeric':
                    if (typeof value !== 'number' || !Number.isFinite(value)) {
                        valueIsValid = false;
                        break;
                    }
                    valueIsValid =
                        (question.numericConstraints?.min === undefined || value >= question.numericConstraints.min) &&
                            (question.numericConstraints?.max === undefined || value <= question.numericConstraints.max);
                    break;
                case 'date':
                    if (typeof value !== 'string' || !isValidCalendarDate(value)) {
                        valueIsValid = false;
                        break;
                    }
                    valueIsValid =
                        (!question.dateConstraints?.minDate || value >= question.dateConstraints.minDate) &&
                            (!question.dateConstraints?.maxDate || value <= question.dateConstraints.maxDate);
                    break;
                case 'rating_scale':
                    if (typeof value !== 'number' || !Number.isFinite(value) || !Number.isInteger(value)) {
                        valueIsValid = false;
                        break;
                    }
                    valueIsValid =
                        !question.ratingConstraints ||
                            (value >= question.ratingConstraints.minRating && value <= question.ratingConstraints.maxRating);
                    break;
                case 'file_upload':
                    // File answers remain empty until a server-verified upload handshake exists.
                    valueIsValid = false;
                    break;
                default:
                    valueIsValid = false;
            }
        }
        if (!valueIsValid) {
            addError(`Answer value for '${question.code}' does not match its question type or constraints.`);
            continue;
        }
        if (rawAnswer.comment !== undefined &&
            (typeof rawAnswer.comment !== 'string' || rawAnswer.comment.length > exports.PUBLIC_ASSESSMENT_LIMITS.maxCommentLength)) {
            addError(`Comment for '${question.code}' exceeds the allowed shape or length.`);
            continue;
        }
        normalizedAnswers[key] = {
            questionId: key,
            questionCode: question.code,
            sectionId: definition.sectionId,
            value: value,
            ...(typeof rawAnswer.comment === 'string' ? { comment: rawAnswer.comment } : {}),
            attachedEvidenceIds: [],
            updatedAt: nowIso,
        };
    }
    return { valid: errors.length === 0, errors, normalizedAnswers };
}
function sanitizePublicQuestionnaireSections(sections) {
    return sections.map((section) => ({
        id: section.id,
        code: section.code,
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        sortOrder: section.sortOrder,
        ...(section.conditionalRules
            ? { conditionalRules: section.conditionalRules.map((rule) => ({ ...rule })) }
            : {}),
        questions: section.questions.map((question) => ({
            id: question.id,
            sectionId: question.sectionId,
            code: question.code,
            title: question.title,
            ...(question.description ? { description: question.description } : {}),
            ...(question.guidanceNotes ? { guidanceNotes: question.guidanceNotes } : {}),
            questionType: question.questionType,
            required: question.required,
            sortOrder: question.sortOrder,
            ...(question.options
                ? {
                    options: question.options.map((option) => ({
                        label: option.label,
                        value: option.value,
                        ...(option.description ? { description: option.description } : {}),
                    })),
                }
                : {}),
            ...(question.numericConstraints ? { numericConstraints: { ...question.numericConstraints } } : {}),
            ...(question.dateConstraints ? { dateConstraints: { ...question.dateConstraints } } : {}),
            ...(question.fileConstraints ? { fileConstraints: { ...question.fileConstraints } } : {}),
            ...(question.ratingConstraints ? { ratingConstraints: { ...question.ratingConstraints } } : {}),
            ...(question.requiresEvidence !== undefined ? { requiresEvidence: question.requiresEvidence } : {}),
            ...(question.acceptedEvidenceCategories
                ? { acceptedEvidenceCategories: [...question.acceptedEvidenceCategories] }
                : {}),
            ...(question.conditionalRules
                ? { conditionalRules: question.conditionalRules.map((rule) => ({ ...rule })) }
                : {}),
        })),
    }));
}
function buildAssessmentPortalAccessUrl(input) {
    const portalOrigin = new URL(input.portalBaseUrl);
    if (portalOrigin.protocol !== 'https:' ||
        portalOrigin.username ||
        portalOrigin.password ||
        (portalOrigin.pathname !== '/' && portalOrigin.pathname !== '') ||
        portalOrigin.search ||
        portalOrigin.hash) {
        throw new Error('portalBaseUrl must be an HTTPS origin without credentials, path, query, or fragment.');
    }
    const queryPairs = [
        ['tenantId', input.tenantId],
        ['requestId', input.requestId],
        ['tokenId', input.tokenId],
    ];
    const query = queryPairs
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join('&');
    // The bearer secret is kept in the fragment so browsers do not send it to
    // Firebase Hosting/CDN access logs or in the HTTP Referer header.
    return `${portalOrigin.origin}/portal/assessments/?${query}#token=${encodeURIComponent(input.rawToken)}`;
}
/**
 * Pure evaluator checking token validity against current time and usage constraints.
 */
function evaluateAccessTokenValidity(tokenRecord, computedHash, now = new Date()) {
    if (!tokenRecord) {
        return { isValid: false, error: 'Access token not found.', errorCode: 'TOKEN_NOT_FOUND' };
    }
    // 1. Hash Match
    if (tokenRecord.tokenHash !== computedHash) {
        return { isValid: false, error: 'Invalid access token secret.', errorCode: 'TOKEN_HASH_MISMATCH' };
    }
    // 2. Revocation Check
    if (tokenRecord.status === 'revoked' || tokenRecord.revokedAt) {
        return { isValid: false, error: 'Access link has been revoked by compliance.', errorCode: 'TOKEN_REVOKED' };
    }
    if (tokenRecord.status === 'superseded') {
        return { isValid: false, error: 'Access link has been superseded by a newer link.', errorCode: 'TOKEN_REVOKED' };
    }
    // 3. Expiry Check
    const expiresAtTime = new Date(tokenRecord.expiresAt).getTime();
    if (isNaN(expiresAtTime) || now.getTime() > expiresAtTime || tokenRecord.status === 'expired') {
        return { isValid: false, error: 'Access link has expired.', errorCode: 'TOKEN_EXPIRED' };
    }
    // 4. Usage Exhaustion Check
    if (tokenRecord.useCount >= tokenRecord.maxUses || tokenRecord.status === 'used') {
        return { isValid: false, error: 'Access link maximum usage limit reached.', errorCode: 'TOKEN_EXHAUSTED' };
    }
    // 5. Active Status Check
    if (tokenRecord.status !== 'active') {
        return { isValid: false, error: `Access link is not active (${tokenRecord.status}).`, errorCode: 'TOKEN_NOT_FOUND' };
    }
    return { isValid: true };
}
/**
 * Constructs a least-privilege sanitized view for external unauthenticated respondents,
 * stripping internal control linkages, risk IDs, and tenant metadata.
 */
function createSanitizedPublicAssessmentView(request, tokenData, existingAnswers = {}) {
    const internalSections = (request.templateSnapshot?.sections || []);
    const answerCandidates = {};
    for (const section of internalSections) {
        for (const question of section.questions) {
            const existing = existingAnswers[question.id];
            if (!existing)
                continue;
            answerCandidates[question.id] = {
                questionId: question.id,
                questionCode: question.code,
                sectionId: section.id,
                value: existing.value,
                ...(typeof existing.comment === 'string' ? { comment: existing.comment } : {}),
                attachedEvidenceIds: [],
                updatedAt: existing.updatedAt,
            };
        }
    }
    const sanitizedAnswers = validateAndNormalizePublicAssessmentAnswers(internalSections, answerCandidates, tokenData.lastAccessedAt || request.updatedAt).normalizedAnswers;
    return {
        requestId: request.id,
        tenantId: request.tenantId,
        templateTitle: request.templateSnapshot?.title || request.title,
        templateDescription: request.templateSnapshot?.description,
        thirdPartyName: request.thirdPartyName,
        recipientName: request.respondent?.name || tokenData.recipientName,
        recipientEmail: request.respondent?.email || tokenData.recipientEmail,
        dueDate: request.dueDate,
        status: request.status,
        sections: sanitizePublicQuestionnaireSections(internalSections),
        existingAnswers: sanitizedAnswers,
        tokenExpiresAt: tokenData.expiresAt,
        requiresEmailVerification: !!tokenData.requireEmailVerificationCode,
        isEmailVerified: !!tokenData.emailVerifiedAt,
    };
}
//# sourceMappingURL=assessment-access-tokens.js.map
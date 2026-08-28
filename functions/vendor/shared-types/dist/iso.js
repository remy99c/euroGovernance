"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.validateSoAEntry = validateSoAEntry;
exports.transitionSoAApproval = transitionSoAApproval;
exports.generateSoAFromScopeAndDecisions = generateSoAFromScopeAndDecisions;
exports.buildSoASummaryReport = buildSoASummaryReport;
// =============================================================================
// ISO VALIDATION & SOA LIFECYCLE HELPERS
// =============================================================================
/**
 * Validates a Statement of Applicability entry.
 * Strictly enforces that excluded controls MUST have a comprehensive justification rationale.
 */
function validateSoAEntry(entry) {
    if (!entry.controlCode || typeof entry.controlCode !== 'string' || entry.controlCode.trim().length === 0) {
        return { valid: false, error: 'Control code is required.' };
    }
    if (!entry.controlTitle || typeof entry.controlTitle !== 'string' || entry.controlTitle.trim().length === 0) {
        return { valid: false, error: 'Control title is required.' };
    }
    if (!entry.frameworkType) {
        return { valid: false, error: 'Framework type is required.' };
    }
    const isExcluded = entry.isApplicable === false || entry.decisionType === 'excluded';
    if (isExcluded) {
        if (!entry.justification || typeof entry.justification !== 'string' || entry.justification.trim().length < 10) {
            return {
                valid: false,
                error: 'Mandatory justification rationale (minimum 10 characters) is required when excluding a control from the Statement of Applicability.',
            };
        }
    }
    return { valid: true };
}
/**
 * Transitions an SoA entry through the formal review and approval lifecycle.
 */
function transitionSoAApproval(entry, action, actorId, notes) {
    const now = new Date().toISOString();
    const updated = { ...entry, updatedAt: now, updatedBy: actorId };
    switch (action) {
        case 'submit_for_approval': {
            const validation = validateSoAEntry(updated);
            if (!validation.valid) {
                throw new Error(`Cannot submit for approval: ${validation.error}`);
            }
            updated.approvalStatus = 'pending_approval';
            updated.reviewedBy = actorId;
            updated.reviewedAt = now;
            break;
        }
        case 'approve': {
            if (updated.approvalStatus !== 'pending_approval' && updated.approvalStatus !== 'draft') {
                throw new Error(`Cannot approve an entry in status: ${updated.approvalStatus}`);
            }
            const validation = validateSoAEntry(updated);
            if (!validation.valid) {
                throw new Error(`Cannot approve invalid entry: ${validation.error}`);
            }
            updated.approvalStatus = 'approved';
            updated.approvedBy = actorId;
            updated.approvedAt = now;
            updated.rejectionReason = null;
            break;
        }
        case 'reject': {
            if (!notes || notes.trim().length === 0) {
                throw new Error('A rejection reason is required when rejecting an SoA applicability entry.');
            }
            updated.approvalStatus = 'rejected';
            updated.rejectionReason = notes.trim();
            break;
        }
    }
    return updated;
}
/**
 * Compiles a draft Statement of Applicability from an approved ISO Scope Statement and GRC applicability decisions.
 * Preserves a clear distinction between automatic suggestions (`draft`) and approved entries.
 */
function generateSoAFromScopeAndDecisions(params) {
    const { tenantId, defaultOwnerId, scopeStatement, decisions, masterControls, tenantControls } = params;
    const now = new Date().toISOString();
    const decisionMap = new Map();
    for (const d of decisions) {
        decisionMap.set(d.requirementId, d);
    }
    const tenantCtrlMap = new Map();
    if (tenantControls) {
        for (const tc of tenantControls) {
            if (tc.masterControlId) {
                tenantCtrlMap.set(tc.masterControlId, tc);
            }
            tenantCtrlMap.set(tc.code.toUpperCase(), tc);
        }
    }
    const soaEntries = [];
    // Filter master controls relevant to the ISO framework
    const relevantControls = masterControls.filter((mc) => mc.frameworkId === scopeStatement.frameworkType || mc.frameworkId === 'iso_27001');
    for (const mc of relevantControls) {
        // Find applicability decision for any requirement mapped to this control
        let matchedDecision;
        if (mc.requirementIds && mc.requirementIds.length > 0) {
            for (const reqId of mc.requirementIds) {
                const d = decisionMap.get(reqId);
                if (d) {
                    matchedDecision = d;
                    break;
                }
            }
        }
        const isApplicable = matchedDecision ? matchedDecision.isApplicable : true;
        const linkedControl = tenantCtrlMap.get(mc.id) || tenantCtrlMap.get(mc.code.toUpperCase());
        const justification = !isApplicable
            ? matchedDecision?.rationale ||
                scopeStatement.exclusionsJustification ||
                'Excluded per organizational scope statement and lack of applicable technical/statutory processing.'
            : mc.description || 'Statutory requirement applicable to organizational management system scope.';
        const entryId = `soa_${scopeStatement.frameworkType}_${mc.code.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
        soaEntries.push({
            id: entryId,
            tenantId,
            ownerId: defaultOwnerId,
            frameworkType: scopeStatement.frameworkType,
            controlCode: mc.code,
            controlTitle: mc.title,
            isApplicable,
            decisionType: isApplicable ? 'included' : 'excluded',
            sourceType: 'automatic_suggestion',
            approvalStatus: 'draft',
            justification,
            exclusionCategory: !isApplicable ? 'not_in_scope' : null,
            linkedScopeStatementId: scopeStatement.id,
            linkedTenantControlId: linkedControl ? linkedControl.id : null,
            requirementId: mc.requirementIds?.[0] || null,
            reviewedBy: null,
            reviewedAt: now,
            approvedBy: null,
            approvedAt: null,
            rejectionReason: null,
            version: scopeStatement.version || '1.0',
            status: 'active',
            createdAt: now,
            updatedAt: now,
            createdBy: defaultOwnerId,
            updatedBy: defaultOwnerId,
        });
    }
    return soaEntries;
}
/**
 * Builds an executive SoA Summary Report for external auditors and ISO certification bodies.
 */
function buildSoASummaryReport(frameworkType, entries, scopeStatement) {
    let includedCount = 0;
    let excludedCount = 0;
    let approvedCount = 0;
    let pendingApprovalCount = 0;
    let draftCount = 0;
    const exclusionCategoryBreakdown = {};
    for (const entry of entries) {
        if (entry.isApplicable) {
            includedCount++;
        }
        else {
            excludedCount++;
            const cat = entry.exclusionCategory || 'custom_rationale';
            exclusionCategoryBreakdown[cat] = (exclusionCategoryBreakdown[cat] || 0) + 1;
        }
        if (entry.approvalStatus === 'approved')
            approvedCount++;
        else if (entry.approvalStatus === 'pending_approval')
            pendingApprovalCount++;
        else if (entry.approvalStatus === 'draft')
            draftCount++;
    }
    return {
        frameworkType,
        scopeStatementId: scopeStatement?.id || null,
        scopeTitle: scopeStatement?.title || null,
        totalControls: entries.length,
        includedCount,
        excludedCount,
        approvedCount,
        pendingApprovalCount,
        draftCount,
        exclusionCategoryBreakdown,
        entries,
        generatedAt: new Date().toISOString(),
    };
}
//# sourceMappingURL=iso.js.map
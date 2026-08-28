"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VALID_EVIDENCE_CATEGORIES = exports.VALID_CONTROL_STATUSES = void 0;
exports.isValidControlStatus = isValidControlStatus;
exports.VALID_CONTROL_STATUSES = [
    'not_started',
    'in_progress',
    'implemented',
    'partially_implemented',
    'not_applicable',
];
function isValidControlStatus(status) {
    return typeof status === 'string' && exports.VALID_CONTROL_STATUSES.includes(status);
}
exports.VALID_EVIDENCE_CATEGORIES = [
    'audit_log',
    'screenshot',
    'policy_doc',
    'export_report',
    'assessment_doc',
    'configuration',
    'dpa',
    'scc',
    'addendum',
    'adequacy_support',
    'toms',
    'security_report',
    'iso_certificate',
    'soc_report',
    'subprocessor_list',
    'transfer_assessment_support',
    'incident_notice',
    'bridge_letter',
    'management_assertion',
    'penetration_test_report',
    'code_of_conduct_doc',
    'industry_label_evidence',
    'custom_assurance_doc',
];
//# sourceMappingURL=grc.js.map
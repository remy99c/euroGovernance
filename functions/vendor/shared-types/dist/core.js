"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.READ_ONLY_ROLES = exports.VALID_USER_ROLES = void 0;
exports.isValidUserRole = isValidUserRole;
exports.isReadOnlyRole = isReadOnlyRole;
exports.VALID_USER_ROLES = [
    'platform_admin',
    'tenant_admin',
    'compliance_manager',
    'privacy_manager',
    'ai_governance_manager',
    'security_manager',
    'auditor',
    'contributor',
    'viewer',
    'approver',
];
exports.READ_ONLY_ROLES = ['auditor', 'viewer'];
function isValidUserRole(role) {
    return typeof role === 'string' && exports.VALID_USER_ROLES.includes(role);
}
function isReadOnlyRole(role) {
    return exports.READ_ONLY_ROLES.includes(role);
}
//# sourceMappingURL=core.js.map
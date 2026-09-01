import type { UserRole } from '@eurogovernance/shared-types';

export type TenantPermissionRole = Exclude<UserRole, 'platform_admin'>;

/**
 * Server-owned action permission matrix. Command handlers reference an action
 * key; they do not invent role arrays at individual call sites.
 */
export const TENANT_ACTION_PERMISSIONS = Object.freeze({
  'certification.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'certification.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'certification.archive': ['tenant_admin', 'compliance_manager'],
  'policy.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'policy.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'policy.submit_review': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'policy.return_draft': ['tenant_admin', 'approver'],
  'policy.approve': ['tenant_admin', 'approver'],
  'policy.activate': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'policy.retire': ['tenant_admin', 'compliance_manager'],
  'control.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'control.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'control.review_submit': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'control.review_decide': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'approver',
  ],
  'control.retire': ['tenant_admin', 'compliance_manager'],
  'risk.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'risk.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'risk.link': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ],
  'risk.sync_derived': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
  ],
  'risk.retire': ['tenant_admin', 'compliance_manager'],
  'issue.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'issue.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'issue.retire': ['tenant_admin', 'compliance_manager'],
  'task.create': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'task.update': [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ],
  'task.retire': ['tenant_admin', 'compliance_manager'],
} as const satisfies Record<string, readonly TenantPermissionRole[]>);

export type TenantPermissionAction = keyof typeof TENANT_ACTION_PERMISSIONS;

export function rolesForTenantAction(
  action: TenantPermissionAction
): readonly TenantPermissionRole[] {
  return TENANT_ACTION_PERMISSIONS[action];
}

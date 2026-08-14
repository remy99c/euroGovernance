import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { requireTenantMember } from '../lib/auth-helpers.js';
import { recordAuditLog } from '../lib/audit.js';
import { AuditActionType, ActionSource } from '@eurogovernance/shared-types';

export interface CreateAuditLogEventInput {
  tenantId: string;
  entityType: string;
  entityId: string;
  action: AuditActionType;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  workflowContext?: string | null;
}

/**
 * Callable Function: createAuditLogEvent
 * Allows privileged frontend operations or external webhook integrations to record a verified audit event.
 */
export const createAuditLogEvent = onCall<CreateAuditLogEventInput>(async (request) => {
  const { tenantId, entityType, entityId, action, beforeSummary, afterSummary, workflowContext } = request.data;
  if (!tenantId || !entityType || !entityId || !action) {
    throw new HttpsError('invalid-argument', 'tenantId, entityType, entityId, and action are required.');
  }

  const authContext = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'approver',
  ]);

  const ipAddress = (request.rawRequest.headers['x-forwarded-for'] as string) || request.rawRequest.ip || null;
  const userAgent = (request.rawRequest.headers['user-agent'] as string) || null;

  const logId = await recordAuditLog({
    tenantId,
    actorId: authContext.userId,
    actorEmail: authContext.email,
    actorRole: authContext.role,
    entityType,
    entityId,
    action,
    beforeSummary,
    afterSummary,
    source: 'cloud_function' as ActionSource,
    workflowContext,
    ipAddress,
    userAgent,
  });

  return { success: true, logId };
});

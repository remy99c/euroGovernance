/**
 * euroGovernance - Server-Written Append-Only Audit Log Subsystem
 *
 * Trust Boundaries & Invariants:
 * 1. Client-Immutability Invariant: Direct write and update operations to `/tenants/{tenantId}/audit_logs/{id}`
 *    are forbidden in `firestore.rules`. Logs can only be written through this server-side module using Admin SDK.
 * 2. Immutability Invariant: Audit log documents are strictly append-only. No deletion or mutation endpoints exist.
 * 3. Traceability: Every entry captures `actorId`, `actorEmail`, `actorRole`, `timestamp`, `source`,
 *    and entity snapshots (`beforeSummary`, `afterSummary`).
 * 4. Storage Safety: Payload sizes exceeding 50KB are sanitized to prevent unbounded document bloat.
 */

import { db } from './firebase.js';
import type { Transaction, WriteBatch } from 'firebase-admin/firestore';
import {
  AuditLogEvent,
  AuditActionType,
  ActionSource,
  UserRole,
  AuditActorRole,
  AuditActorType,
  isValidUserRole,
} from '@eurogovernance/shared-types';

export type TrustedAuditSource = Exclude<ActionSource, 'client'>;

export interface VerifiedAuditActor {
  userId: string;
  email: string;
  role: UserRole;
}

export interface CreateAuditLogParams {
  tenantId: string;
  actorId: string;
  actorEmail: string;
  actorRole: AuditActorRole;
  actorType?: AuditActorType;
  entityType: string;
  entityId: string;
  action: AuditActionType;
  beforeSummary?: Record<string, unknown> | null;
  afterSummary?: Record<string, unknown> | null;
  source: TrustedAuditSource;
  workflowContext?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
}

/**
 * Produces audit actor fields from a context already verified by
 * requireTenantMember. Domain handlers should spread this result rather than
 * inventing a role or reading identity fields from request.data.
 */
export function auditActorFromVerifiedContext(actor: VerifiedAuditActor): Pick<
  CreateAuditLogParams,
  'actorId' | 'actorEmail' | 'actorRole'
> {
  if (!actor.userId || !isValidUserRole(actor.role)) {
    throw new Error('A verified user ID and role are required for audit attribution.');
  }

  return {
    actorId: actor.userId,
    actorEmail: actor.email || '[email-unavailable]',
    actorRole: actor.role,
  };
}

function assertTrustedAuditParameters(params: CreateAuditLogParams): void {
  if (!params.tenantId || !params.actorId || !params.entityType || !params.entityId) {
    throw new Error('Audit events require tenant, actor, entity type, and entity ID attribution.');
  }
  if (params.source !== 'cloud_function' && params.source !== 'scheduled_job') {
    throw new Error('Audit events may only be recorded by a trusted server source.');
  }
  const isExternalActor = params.actorRole === 'external_respondent';
  const isSystemActor = params.actorRole === 'system';
  if (!isValidUserRole(params.actorRole) && !isExternalActor && !isSystemActor) {
    throw new Error('Audit events require a valid server-derived actor classification.');
  }
  if (isExternalActor && params.actorType !== 'external_respondent') {
    throw new Error('External respondent audit events require explicit external actor attribution.');
  }
}

/**
 * Sanitizes before/after payload summaries to prevent malicious payload attacks or document size overflow.
 */
function sanitizeSummaryPayload(payload?: Record<string, unknown> | null): Record<string, unknown> | null {
  if (!payload) return null;
  const jsonString = JSON.stringify(payload);
  if (jsonString.length > 50000) {
    return {
      _warning: 'Payload exceeded 50KB threshold and was truncated for storage safety',
      truncatedKeys: Object.keys(payload).slice(0, 10),
    };
  }
  return payload;
}

/**
 * Writes an append-only audit log entry directly to `/tenants/{tenantId}/audit_logs/{logId}`.
 *
 * @param params Audit record parameters including actor details and entity state change.
 * @returns The unique auto-generated log document ID.
 */
export async function recordAuditLog(params: CreateAuditLogParams): Promise<string> {
  const { docRef, auditEvent } = createAuditLogWrite(params);
  await docRef.create(auditEvent);
  return docRef.id;
}

function createAuditLogWrite(params: CreateAuditLogParams) {
  assertTrustedAuditParameters(params);

  const auditLogsRef = db.collection('tenants').doc(params.tenantId).collection('audit_logs');
  const docRef = auditLogsRef.doc();

  const auditEvent: AuditLogEvent = {
    id: docRef.id,
    tenantId: params.tenantId,
    actorId: params.actorId,
    actorEmail: params.actorEmail,
    actorRole: params.actorRole,
    actorType:
      params.actorType ||
      (params.actorRole === 'external_respondent'
        ? 'external_respondent'
        : params.actorRole === 'system'
          ? 'system'
          : 'tenant_user'),
    entityType: params.entityType,
    entityId: params.entityId,
    action: params.action,
    beforeSummary: sanitizeSummaryPayload(params.beforeSummary),
    afterSummary: sanitizeSummaryPayload(params.afterSummary),
    timestamp: new Date().toISOString(),
    ipAddress: params.ipAddress ?? null,
    userAgent: params.userAgent ?? null,
    source: params.source,
    workflowContext: params.workflowContext ?? null,
  };

  return { docRef, auditEvent };
}

/**
 * Appends an audit entry in the same transaction as its authoritative state
 * change. This prevents a committed workflow transition from existing without
 * its corresponding immutable audit event.
 */
export function appendAuditLogInTransaction(
  transaction: Transaction,
  params: CreateAuditLogParams
): string {
  const { docRef, auditEvent } = createAuditLogWrite(params);
  transaction.create(docRef, auditEvent);
  return docRef.id;
}

/**
 * Appends an audit entry to the same atomic write batch as its authoritative
 * state changes. Callers remain responsible for keeping the batch below
 * Firestore's operation limit.
 */
export function appendAuditLogInBatch(
  batch: WriteBatch,
  params: CreateAuditLogParams
): string {
  const { docRef, auditEvent } = createAuditLogWrite(params);
  batch.create(docRef, auditEvent);
  return docRef.id;
}

import { HttpsError, onCall } from 'firebase-functions/v2/https';

/**
 * One-release retirement tombstone for the formerly permissive generic audit
 * callable. It remains exported under the deployed function name so the next
 * deployment replaces any reachable legacy revision with this fail-closed
 * implementation. Audit events are assertions made
 * by the trusted command which performed a state transition; accepting caller-
 * defined entity IDs, actions or before/after snapshots would let a client forge
 * an apparently authoritative history.
 *
 * New and existing domain handlers must call recordAuditLog themselves after
 * deriving the actor from requireTenantMember.
 */
export function rejectClientDefinedAuditEvent(): never {
  throw new HttpsError(
    'failed-precondition',
    'Client-defined audit events are disabled. Use the authorized domain workflow that performs the underlying change.'
  );
}

export const createAuditLogEvent = onCall(async () => rejectClientDefinedAuditEvent());

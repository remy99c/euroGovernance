import {
  isValidUserRole,
  type AuditActionType,
  type UserRole,
} from '@eurogovernance/shared-types';
import {
  COMMAND_RECEIPT_SCHEMA_VERSION,
  CURRENT_COMMAND_ENVELOPE_VERSION,
  commandJsonByteLength,
  normalizeCommandId,
  serializeTrustedCommandJson,
  stableTrustedValueHash,
} from './command-boundary-values.js';
import {
  rolesForTenantAction,
  type TenantPermissionAction,
} from './action-permissions.js';

const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CERTIFICATION_COMMAND_VERSION = 1;

export interface CertificationArtifactBundle {
  tenantId: string;
  certificationId: string;
  certification: unknown;
  currentVersionId: string;
  currentVersion: unknown;
  previousVersionId: string | null;
  previousVersion: unknown;
  commandId: string;
  receipt: unknown;
  auditId: string;
  audit: unknown;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function validIsoTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

function certificationVersionId(revision: number): string {
  return `r${String(revision).padStart(10, '0')}`;
}

function commandArtifact(commandName: unknown): {
  commandName: TenantPermissionAction;
  auditAction: AuditActionType;
  workflowContext: string;
} | null {
  switch (commandName) {
    case 'certification.create':
      return {
        commandName,
        auditAction: 'create',
        workflowContext: 'certification_created',
      };
    case 'certification.archive':
      return {
        commandName,
        auditAction: 'status_transition',
        workflowContext: 'certification_archived',
      };
    case 'certification.update':
      return {
        commandName,
        auditAction: 'update',
        workflowContext: 'certification_updated',
      };
    default:
      return null;
  }
}

function safeHash(value: unknown, label: string): string | null {
  try {
    return isPlainRecord(value) ? stableTrustedValueHash(value, label) : null;
  } catch {
    return null;
  }
}

function versionEnvelopeValid(
  value: unknown,
  versionId: string,
  tenantId: string,
  certificationId: string,
  revision: number
): value is Record<string, unknown> {
  if (!isPlainRecord(value) || !isPlainRecord(value.state)) return false;
  const stateHash = safeHash(value.state, 'certification assurance version state');
  return (
    value.schemaVersion === 1 &&
    value.id === versionId &&
    value.tenantId === tenantId &&
    value.certificationId === certificationId &&
    value.revision === revision &&
    value.state.id === certificationId &&
    value.state.tenantId === tenantId &&
    (revision === 0
      ? value.state.revision === undefined || value.state.revision === 0
      : value.state.revision === revision) &&
    typeof value.stateHash === 'string' &&
    SHA256_PATTERN.test(value.stateHash) &&
    value.stateHash === stateHash &&
    Array.isArray(value.changedFields) &&
    value.changedFields.length <= 100 &&
    value.changedFields.every((field) => typeof field === 'string') &&
    new Set(value.changedFields).size === value.changedFields.length &&
    validIsoTimestamp(value.recordedAt)
  );
}

/**
 * Verifies the exact current certification state against its immutable version,
 * idempotency receipt, and audit event. It is deliberately fail closed: legacy
 * or partially migrated records return false and cannot contribute assurance.
 */
export function isCurrentCertificationArtifactVerified(
  bundle: CertificationArtifactBundle
): boolean {
  const certification = isPlainRecord(bundle.certification)
    ? bundle.certification
    : null;
  if (!certification) return false;
  const revision = certification.revision;
  if (!Number.isSafeInteger(revision) || (revision as number) < 1) return false;
  const numericRevision = revision as number;
  if (
    certification.id !== bundle.certificationId ||
    certification.tenantId !== bundle.tenantId ||
    bundle.currentVersionId !== certificationVersionId(numericRevision) ||
    !versionEnvelopeValid(
      bundle.currentVersion,
      bundle.currentVersionId,
      bundle.tenantId,
      bundle.certificationId,
      numericRevision
    )
  ) {
    return false;
  }
  const currentVersion = bundle.currentVersion;
  if (
    currentVersion.stateHash !==
      safeHash(certification, 'current certification assurance state') ||
    currentVersion.commandId !== bundle.commandId
  ) {
    return false;
  }

  let commandId: string;
  try {
    commandId = normalizeCommandId(bundle.commandId);
  } catch {
    return false;
  }
  if (commandId !== bundle.commandId) return false;

  const receipt = isPlainRecord(bundle.receipt) ? bundle.receipt : null;
  const audit = isPlainRecord(bundle.audit) ? bundle.audit : null;
  if (!receipt || !audit) return false;
  let artifact = commandArtifact(receipt.commandName);
  if (!artifact) return false;

  const previousVersion = isPlainRecord(bundle.previousVersion)
    ? bundle.previousVersion
    : null;
  const previousState = previousVersion && isPlainRecord(previousVersion.state)
    ? previousVersion.state
    : null;
  const currentState = currentVersion.state as Record<string, unknown>;
  if (artifact.commandName === 'certification.update') {
    if (!previousState) return false;
    const statusChanged = previousState.status !== currentState.status;
    artifact = {
      ...artifact,
      auditAction: statusChanged ? 'status_transition' : 'update',
      workflowContext: statusChanged
        ? 'certification_status_changed'
        : 'certification_updated',
    };
  }

  const createCommand = artifact.commandName === 'certification.create';
  const previousValid = createCommand
    ? numericRevision === 1 &&
      bundle.previousVersionId === null &&
      bundle.previousVersion === null &&
      currentVersion.previousVersionId === null &&
      currentVersion.previousStateHash === null
    : numericRevision > 0 &&
      bundle.previousVersionId === certificationVersionId(numericRevision - 1) &&
      versionEnvelopeValid(
        previousVersion,
        bundle.previousVersionId!,
        bundle.tenantId,
        bundle.certificationId,
        numericRevision - 1
      ) &&
      currentVersion.previousVersionId === bundle.previousVersionId &&
      currentVersion.previousStateHash === previousVersion?.stateHash;
  if (!previousValid) return false;

  const result = isPlainRecord(receipt.result) ? receipt.result : null;
  let resultHash: string | null = null;
  let resultByteLength: number | null = null;
  try {
    if (result) {
      const serialized = serializeTrustedCommandJson(
        result,
        'certification assurance receipt result'
      );
      resultHash = stableTrustedValueHash(
        result,
        'certification assurance receipt result'
      );
      resultByteLength = commandJsonByteLength(serialized);
    }
  } catch {
    return false;
  }

  const actorRole = receipt.actorRole;
  const expectedWorkflowContext =
    `command:ev${CURRENT_COMMAND_ENVELOPE_VERSION}:${artifact.commandName}:cv${CERTIFICATION_COMMAND_VERSION}:${commandId} | ${artifact.workflowContext}`;
  const beforeSummary = isPlainRecord(audit.beforeSummary)
    ? audit.beforeSummary
    : null;
  const afterSummary = isPlainRecord(audit.afterSummary)
    ? audit.afterSummary
    : null;
  return Boolean(
    currentVersion.recordedBy === receipt.actorId &&
      receipt.schemaVersion === COMMAND_RECEIPT_SCHEMA_VERSION &&
      receipt.envelopeVersion === CURRENT_COMMAND_ENVELOPE_VERSION &&
      receipt.commandVersion === CERTIFICATION_COMMAND_VERSION &&
      receipt.id === commandId &&
      receipt.commandId === commandId &&
      receipt.tenantId === bundle.tenantId &&
      receipt.commandName === artifact.commandName &&
      receipt.status === 'completed' &&
      isValidUserRole(actorRole) &&
      actorRole !== 'platform_admin' &&
      rolesForTenantAction(artifact.commandName).includes(
        actorRole as Exclude<UserRole, 'platform_admin'>
      ) &&
      receipt.payloadHashVersion === 'sha256-canonical-json-v1' &&
      typeof receipt.payloadHash === 'string' &&
      SHA256_PATTERN.test(receipt.payloadHash) &&
      Number.isSafeInteger(receipt.payloadByteLength) &&
      (receipt.payloadByteLength as number) >= 0 &&
      (receipt.payloadByteLength as number) <= 64 * 1024 &&
      receipt.expectedRevisionWasProvided === true &&
      receipt.expectedRevision === (createCommand ? null : numericRevision - 1) &&
      result !== null &&
      result.certificationId === bundle.certificationId &&
      result.revision === numericRevision &&
      receipt.resultHash === resultHash &&
      receipt.resultByteLength === resultByteLength &&
      Number.isSafeInteger(receipt.resultByteLength) &&
      (receipt.resultByteLength as number) >= 0 &&
      (receipt.resultByteLength as number) <= 32 * 1024 &&
      receipt.entityType === 'certification' &&
      receipt.entityId === bundle.certificationId &&
      receipt.auditAction === artifact.auditAction &&
      receipt.auditLogId === bundle.auditId &&
      receipt.auditWorkflowContext === expectedWorkflowContext &&
      Array.isArray(receipt.outboxEventIds) &&
      receipt.outboxEventIds.length === 0 &&
      validIsoTimestamp(receipt.committedAt) &&
      audit.id === bundle.auditId &&
      audit.tenantId === bundle.tenantId &&
      audit.actorId === receipt.actorId &&
      audit.actorRole === actorRole &&
      audit.actorType === 'tenant_user' &&
      typeof audit.actorEmail === 'string' &&
      audit.actorEmail.length > 0 &&
      audit.entityType === 'certification' &&
      audit.entityId === bundle.certificationId &&
      audit.action === artifact.auditAction &&
      audit.source === 'cloud_function' &&
      audit.workflowContext === expectedWorkflowContext &&
      validIsoTimestamp(audit.timestamp) &&
      (createCommand
        ? audit.beforeSummary === null
        : beforeSummary?.versionId === bundle.previousVersionId &&
          beforeSummary?.stateHash === previousVersion?.stateHash) &&
      afterSummary?.versionId === bundle.currentVersionId &&
      afterSummary?.stateHash === currentVersion.stateHash &&
      (artifact.commandName !== 'certification.archive' ||
        (currentState.status === 'archived' && result.archived === true))
  );
}

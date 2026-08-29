import { createHash } from 'node:crypto';
import { HttpsError, onCall } from 'firebase-functions/v2/https';
import { FieldPath } from 'firebase-admin/firestore';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import type {
  Evidence,
  Issue,
  IssueSeverity,
  ProcessorProfile,
  Risk,
  Task,
  TransferArrangement,
  UserRole,
} from '@eurogovernance/shared-types';
import {
  evaluateProcessorRiskFlags,
  isValidUserRole,
} from '@eurogovernance/shared-types';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  AUTHORITATIVE_CALLABLE_OPTIONS,
  COMMAND_RECEIPT_SCHEMA_VERSION,
  executeTenantCommand,
  stableTrustedValueHash,
  type TenantCommandEnvelope,
} from '../lib/command-boundary.js';
import {
  ISSUE_LEGAL_TRANSITIONS,
  RISK_LEGAL_TRANSITIONS,
  TASK_LEGAL_TRANSITIONS,
  assertOperationalDueDateIsReasonable,
  assertOperationalTransition,
  normalizeCreateIssuePayload,
  normalizeCreateRiskPayload,
  normalizeCreateTaskPayload,
  normalizeLinkRiskPayload,
  normalizeOperationalDocumentId,
  normalizeRetireOperationalPayload,
  normalizeSyncDerivedRiskPayload,
  normalizeUpdateIssuePayload,
  normalizeUpdateRiskPayload,
  normalizeUpdateTaskPayload,
  type NormalizedCreateIssuePayload,
  type NormalizedCreateRiskPayload,
  type NormalizedCreateTaskPayload,
  type NormalizedLinkRiskPayload,
  type NormalizedRetireOperationalPayload,
  type NormalizedSyncDerivedRiskPayload,
  type NormalizedUpdateIssuePayload,
  type NormalizedUpdateRiskPayload,
  type NormalizedUpdateTaskPayload,
  type TaskParentEntityType,
} from '../lib/operational-validation.js';

const OPERATIONAL_WORKFLOW_SCHEMA_VERSION = 1;
const OPERATIONAL_VERSION_SCHEMA_VERSION = 1;
const DEFAULT_PAGE_SIZE = 50;
const MAX_PAGE_SIZE = 100;
const MAX_PROCESSOR_CONTEXT_RECORDS = 200;
const READ_RISK_STATUSES = new Set(['identified', 'assessed', 'mitigating', 'accepted', 'closed']);
const READ_RISK_CATEGORIES = new Set(['legal_compliance', 'security', 'privacy', 'ai_bias', 'operational', 'third_party']);
const READ_ISSUE_STATUSES = new Set(['open', 'in_progress', 'under_review', 'resolved', 'closed']);
const READ_ISSUE_SEVERITIES = new Set(['low', 'medium', 'high', 'critical']);
const READ_TASK_STATUSES = new Set(['todo', 'in_progress', 'blocked', 'completed', 'canceled']);
const READ_TASK_PARENT_TYPES = new Set(['control', 'evidence', 'policy', 'risk', 'issue', 'dpia', 'ai_system']);
const OPERATIONAL_WORK_ASSIGNEE_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
  'contributor',
]);

type OperationalEntity = Risk | Issue | Task;
type OperationalCollection = 'risks' | 'issues' | 'tasks';
type OperationalEntityType = 'risk' | 'issue' | 'task';

interface VersionAnchor {
  versionId: string;
  stateHash: string;
}

interface ReadPageInput {
  tenantId: string;
  pageSize?: number;
  cursor?: string;
  status?: string;
  category?: string;
  severity?: IssueSeverity;
  sourceEntityType?: string;
  sourceEntityId?: string;
  parentEntityType?: string;
  parentEntityId?: string;
  assigneeId?: string;
  processorProfileId?: string;
  transferArrangementId?: string;
  vendorId?: string;
  derivedRuleCode?: string;
}

const FULL_OPERATIONAL_READ_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
  'auditor',
  'approver',
]);

function canonicalState<T extends OperationalEntity>(entity: T): T {
  return JSON.parse(JSON.stringify(entity)) as T;
}

function operationalRevision(entity: OperationalEntity): number {
  const revision = entity.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new HttpsError(
      'failed-precondition',
      'Operational record revision metadata is invalid and must be repaired before mutation.'
    );
  }
  return revision;
}

function versionId(revision: number): string {
  return `r${String(revision).padStart(10, '0')}`;
}

function changedFields(before: OperationalEntity | null, after: OperationalEntity): string[] {
  if (!before) return Object.keys(after).sort();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter(
      (key) =>
        JSON.stringify(before[key as keyof OperationalEntity]) !==
        JSON.stringify(after[key as keyof OperationalEntity])
    )
    .sort();
}

async function ensureVersionContinuity(
  transaction: Transaction,
  reference: DocumentReference,
  entityType: OperationalEntityType,
  entity: OperationalEntity,
  actorId: string,
  commandId: string,
  recordedAt: string
): Promise<VersionAnchor> {
  const state = canonicalState(entity);
  const revision = operationalRevision(state);
  const id = versionId(revision);
  const versionReference = reference.collection('versions').doc(id);
  const snapshot = await transaction.get(versionReference);

  return validateVersionContinuitySnapshot(
    transaction,
    versionReference,
    snapshot,
    entityType,
    entity,
    actorId,
    commandId,
    recordedAt
  );
}

function validateVersionContinuitySnapshot(
  transaction: Transaction,
  versionReference: DocumentReference,
  snapshot: FirebaseFirestore.DocumentSnapshot,
  entityType: OperationalEntityType,
  entity: OperationalEntity,
  actorId: string,
  commandId: string,
  recordedAt: string
): VersionAnchor {
  const state = canonicalState(entity);
  const revision = operationalRevision(state);
  const id = versionId(revision);
  const stateHash = stableTrustedValueHash(state, `${entityType} state`);

  if (!snapshot.exists) {
    if (revision !== 0) {
      throw new HttpsError(
        'failed-precondition',
        `${entityType} history is incomplete. Repair its immutable version chain before mutation.`
      );
    }
    transaction.create(versionReference, {
      schemaVersion: OPERATIONAL_VERSION_SCHEMA_VERSION,
      id,
      tenantId: entity.tenantId,
      entityType,
      entityId: entity.id,
      revision,
      state,
      stateHash,
      previousVersionId: null,
      previousStateHash: null,
      changedFields: Object.keys(state).sort(),
      commandId,
      provenance: 'legacy_baseline_captured_on_first_command',
      recordedBy: actorId,
      recordedAt,
    });
    return { versionId: id, stateHash };
  }

  const stored = snapshot.data();
  let storedStateHash: string;
  try {
    storedStateHash = stableTrustedValueHash(stored?.state, `stored ${entityType} state`);
  } catch {
    throw new HttpsError(
      'failed-precondition',
      `${entityType} history is invalid. Repair it before mutation.`
    );
  }
  if (
    stored?.schemaVersion !== OPERATIONAL_VERSION_SCHEMA_VERSION ||
    stored?.id !== id ||
    stored?.tenantId !== entity.tenantId ||
    stored?.entityType !== entityType ||
    stored?.entityId !== entity.id ||
    stored?.revision !== revision ||
    stored?.stateHash !== stateHash ||
    storedStateHash !== stateHash
  ) {
    throw new HttpsError(
      'failed-precondition',
      `${entityType} state diverges from its immutable history. Repair it before mutation.`
    );
  }
  return { versionId: id, stateHash };
}

function writeVersion(
  transaction: Transaction,
  reference: DocumentReference,
  entityType: OperationalEntityType,
  after: OperationalEntity,
  before: OperationalEntity | null,
  previousAnchor: VersionAnchor | null,
  actorId: string,
  commandId: string,
  recordedAt: string
): VersionAnchor & { changedFields: string[] } {
  const state = canonicalState(after);
  const revision = operationalRevision(state);
  const id = versionId(revision);
  const stateHash = stableTrustedValueHash(state, `${entityType} state`);
  const changed = changedFields(before, after);
  transaction.create(reference.collection('versions').doc(id), {
    schemaVersion: OPERATIONAL_VERSION_SCHEMA_VERSION,
    id,
    tenantId: after.tenantId,
    entityType,
    entityId: after.id,
    revision,
    state,
    stateHash,
    previousVersionId: previousAnchor?.versionId ?? null,
    previousStateHash: previousAnchor?.stateHash ?? null,
    changedFields: changed,
    commandId,
    provenance: before ? 'governed_command' : 'governed_creation',
    recordedBy: actorId,
    recordedAt,
  });
  return { versionId: id, stateHash, changedFields: changed };
}

function auditSummary(
  entity: OperationalEntity,
  version: VersionAnchor & { changedFields?: string[] }
): Record<string, unknown> {
  return {
    id: entity.id,
    code: 'code' in entity ? entity.code : null,
    title: entity.title,
    status: entity.status,
    ownerId: entity.ownerId,
    revision: operationalRevision(entity),
    versionId: version.versionId,
    stateHash: version.stateHash,
    changedFields: version.changedFields ?? [],
  };
}

function deterministicDocumentId(namespace: string, commandId: string): string {
  return `${namespace}_${createHash('sha256')
    .update(`${namespace}:${commandId}`, 'utf8')
    .digest('hex')
    .slice(0, 32)}`;
}

function assertIdentity(
  entity: OperationalEntity,
  tenantId: string,
  documentId: string,
  entityType: OperationalEntityType
): void {
  if (entity.id !== documentId || entity.tenantId !== tenantId) {
    throw new HttpsError(
      'failed-precondition',
      `${entityType} identity metadata does not match its authoritative path.`
    );
  }
}

async function resolveRevision(
  transaction: Transaction,
  tenantId: string,
  collection: OperationalCollection,
  entityId: string,
  entityType: OperationalEntityType
): Promise<number | null> {
  const reference = db.doc(`tenants/${tenantId}/${collection}/${entityId}`);
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) return null;
  const entity = snapshot.data() as OperationalEntity;
  assertIdentity(entity, tenantId, entityId, entityType);
  return operationalRevision(entity);
}

async function assertActiveMember(
  transaction: Transaction,
  tenantId: string,
  userId: string,
  label: string,
  allowedRoles?: ReadonlySet<UserRole>
): Promise<void> {
  const snapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/memberships/${userId}`)
  );
  const membership = snapshot.data();
  if (
    !snapshot.exists ||
    membership?.tenantId !== tenantId ||
    membership?.userId !== userId ||
    membership?.status !== 'active' ||
    typeof membership?.role !== 'string' ||
    (allowedRoles && !allowedRoles.has(membership.role as UserRole))
  ) {
    throw new HttpsError('failed-precondition', `${label} must be an active tenant member.`);
  }
}

async function assertTenantDocument(
  transaction: Transaction,
  tenantId: string,
  collection: string,
  documentId: string,
  label: string
): Promise<Record<string, unknown>> {
  let normalizedDocumentId: string;
  try {
    normalizedDocumentId = normalizeOperationalDocumentId(documentId, label);
  } catch {
    throw new HttpsError(
      'failed-precondition',
      `${label} contains an invalid stored identifier.`
    );
  }
  const snapshot = await transaction.get(
    db.doc(`tenants/${tenantId}/${collection}/${normalizedDocumentId}`)
  );
  const value = snapshot.data();
  if (!snapshot.exists || value?.tenantId !== tenantId || value?.id !== normalizedDocumentId) {
    throw new HttpsError('failed-precondition', `${label} does not exist in this tenant.`);
  }
  if (value?.retiredAt || ['retired', 'archived', 'deleted'].includes(value?.status)) {
    throw new HttpsError('failed-precondition', `${label} is not active.`);
  }
  return value as Record<string, unknown>;
}

function storedDocumentId(value: unknown, label: string): string {
  try {
    return normalizeOperationalDocumentId(value, label);
  } catch {
    throw new HttpsError(
      'failed-precondition',
      `${label} contains an invalid stored identifier.`
    );
  }
}

async function assertRiskRelationships(
  transaction: Transaction,
  tenantId: string,
  risk: Pick<
    Risk,
    | 'mitigatingControlIds'
    | 'affectedAssetIds'
    | 'processorProfileIds'
    | 'transferArrangementIds'
    | 'vendorIds'
  >
): Promise<void> {
  const relationships = [
    ...risk.mitigatingControlIds.map((id) => ['controls', id, `Control '${id}'`] as const),
    ...risk.affectedAssetIds.map((id) => ['system_assets', id, `System asset '${id}'`] as const),
    ...(risk.processorProfileIds ?? []).map((id) => ['processor_profiles', id, `Processor profile '${id}'`] as const),
    ...(risk.transferArrangementIds ?? []).map((id) => ['transfer_arrangements', id, `Transfer arrangement '${id}'`] as const),
    ...(risk.vendorIds ?? []).map((id) => ['vendors', id, `Vendor '${id}'`] as const),
  ];
  for (const [collection, id, label] of relationships) {
    await assertTenantDocument(transaction, tenantId, collection, id, label);
  }
}

const ISSUE_SOURCE_COLLECTIONS: Readonly<Record<string, string>> = Object.freeze({
  risk: 'risks',
  control: 'controls',
  evidence: 'evidence',
  policy: 'policies',
  processor_assessment: 'processor_assessments',
  third_party_assessment: 'assessment_requests',
  personal_data_breach: 'breach_incidents',
  ai_incident: 'ai_incidents',
  processor_certification: 'processor_certifications',
});

async function assertIssueSource(
  transaction: Transaction,
  tenantId: string,
  sourceEntityType: string | null,
  sourceEntityId: string | null
): Promise<void> {
  if (!sourceEntityType || !sourceEntityId) return;
  const collection = ISSUE_SOURCE_COLLECTIONS[sourceEntityType];
  if (!collection) {
    throw new HttpsError(
      'invalid-argument',
      'sourceEntityType is unsupported for a governed issue.'
    );
  }
  await assertTenantDocument(
    transaction,
    tenantId,
    collection,
    sourceEntityId,
    `Issue source '${sourceEntityType}/${sourceEntityId}'`
  );
}

const TASK_PARENT_COLLECTIONS: Readonly<Record<TaskParentEntityType, string>> = Object.freeze({
  control: 'controls',
  evidence: 'evidence',
  policy: 'policies',
  risk: 'risks',
  issue: 'issues',
  dpia: 'dpia_assessments',
  ai_system: 'ai_systems',
});

async function assertTaskParent(
  transaction: Transaction,
  tenantId: string,
  parentEntityType: TaskParentEntityType,
  parentEntityId: string
): Promise<void> {
  const parent = await assertTenantDocument(
    transaction,
    tenantId,
    TASK_PARENT_COLLECTIONS[parentEntityType],
    parentEntityId,
    `Task parent '${parentEntityType}/${parentEntityId}'`
  );
  if (
    (parentEntityType === 'risk' || parentEntityType === 'issue') &&
    parent.status === 'closed'
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Remediation tasks cannot be attached to a closed operational record.'
    );
  }
}

function verifiedEvidenceForProcessor(
  evidence: Evidence[],
  processorProfileId: string,
  transferIds: Set<string>
): Evidence[] {
  return evidence.filter((record) => {
    const verification = record.objectVerification;
    const relationshipMatches =
      record.processorProfileIds?.includes(processorProfileId) ||
      record.transferArrangementIds?.some((id) => transferIds.has(id));
    return Boolean(
      relationshipMatches &&
        record.status === 'valid' &&
        verification?.status === 'verified' &&
        verification.storagePath === record.storagePath &&
        verification.verifiedFileHashSha256 === record.fileHashSha256 &&
        verification.verifiedFileSizeBytes === record.fileSizeBytes &&
        verification.verifiedMimeType === record.mimeType &&
        typeof verification.storageGeneration === 'string' &&
        verification.storageGeneration.length > 0 &&
        verification.verifier === 'storage_finalize_function' &&
        Number.isFinite(Date.parse(verification.verifiedAt))
    );
  });
}

function riskMaterialChanged(before: Risk, after: Risk): boolean {
  const fields: Array<keyof Risk> = [
    'title',
    'description',
    'category',
    'status',
    'inherentLikelihood',
    'inherentImpact',
    'inherentScore',
    'residualLikelihood',
    'residualImpact',
    'residualScore',
    'treatmentStrategy',
    'treatmentPlan',
    'mitigatingControlIds',
    'affectedAssetIds',
    'processorProfileIds',
    'transferArrangementIds',
    'vendorIds',
    'derivedRuleCode',
    'deduplicationKey',
    'sourceEntityType',
    'sourceEntityId',
    'ownerId',
    'acceptedBy',
    'acceptedAt',
    'closedBy',
    'closedAt',
    'retiredAt',
    'retiredBy',
    'retirementReason',
  ];
  return fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function issueMaterialChanged(before: Issue, after: Issue): boolean {
  const fields: Array<keyof Issue> = [
    'title',
    'description',
    'severity',
    'status',
    'dueDate',
    'resolutionPlan',
    'ownerId',
    'resolvedAt',
    'verifiedBy',
    'verifiedAt',
    'retiredAt',
    'retiredBy',
    'retirementReason',
  ];
  return fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function taskMaterialChanged(before: Task, after: Task): boolean {
  const fields: Array<keyof Task> = [
    'title',
    'description',
    'status',
    'assigneeId',
    'dueDate',
    'completedAt',
    'retiredAt',
    'retiredBy',
    'retirementReason',
  ];
  return fields.some((field) => JSON.stringify(before[field]) !== JSON.stringify(after[field]));
}

function treatmentPlanRequired(risk: Risk): void {
  if (
    ['mitigating', 'accepted', 'closed'].includes(risk.status) &&
    (typeof risk.treatmentPlan !== 'string' || risk.treatmentPlan.trim().length < 20)
  ) {
    throw new HttpsError(
      'failed-precondition',
      'A treatment plan of at least 20 characters is required for this risk status.'
    );
  }
}

function assertManualRisk(risk: Risk): void {
  if (risk.sourceEntityType === 'processor_risk_engine') {
    throw new HttpsError(
      'failed-precondition',
      'Derived processor risks are reconciled only by the verified risk engine.'
    );
  }
}

function assertStatusOnlyPatch(
  patch: Record<string, unknown>,
  label: string
): void {
  if (Object.keys(patch).length !== 1 || typeof patch.status !== 'string') {
    throw new HttpsError(
      'failed-precondition',
      `${label} must be reopened before substantive fields are changed.`
    );
  }
}

export const createTenantRisk = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedCreateRiskPayload, { success: true; riskId: string; revision: number }>(request, {
      commandName: 'risk.create',
      commandVersion: 1,
      validatePayload: normalizeCreateRiskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: async () => null,
      mutateInTransaction: async (context) => {
        const riskId = deterministicDocumentId('risk', context.commandId);
        const reference = db.doc(`tenants/${context.tenantId}/risks/${riskId}`);
        const duplicateCode = await context.transaction.get(
          db.collection(`tenants/${context.tenantId}/risks`).where('code', '==', context.payload.code).limit(1)
        );
        if (!duplicateCode.empty) {
          throw new HttpsError('already-exists', 'A risk with this code already exists.');
        }
        const ownerId = context.payload.ownerId ?? context.actor.userId;
        await assertActiveMember(context.transaction, context.tenantId, ownerId, 'Risk owner');
        await assertRiskRelationships(context.transaction, context.tenantId, context.payload);

        const risk: Risk = canonicalState({
          id: riskId,
          tenantId: context.tenantId,
          code: context.payload.code,
          title: context.payload.title,
          description: context.payload.description,
          category: context.payload.category,
          status: 'identified',
          inherentLikelihood: context.payload.inherentLikelihood,
          inherentImpact: context.payload.inherentImpact,
          inherentScore: context.payload.inherentLikelihood * context.payload.inherentImpact,
          residualLikelihood: context.payload.residualLikelihood,
          residualImpact: context.payload.residualImpact,
          residualScore: context.payload.residualLikelihood * context.payload.residualImpact,
          treatmentStrategy: context.payload.treatmentStrategy,
          treatmentPlan: context.payload.treatmentPlan,
          mitigatingControlIds: context.payload.mitigatingControlIds,
          affectedAssetIds: context.payload.affectedAssetIds,
          processorProfileIds: context.payload.processorProfileIds,
          transferArrangementIds: context.payload.transferArrangementIds,
          vendorIds: context.payload.vendorIds,
          derivedRuleCode: null,
          deduplicationKey: null,
          sourceEntityType: null,
          sourceEntityId: null,
          acceptedBy: null,
          acceptedAt: null,
          closedBy: null,
          closedAt: null,
          ownerId,
          revision: 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
          createdAt: context.requestedAt,
          updatedAt: context.requestedAt,
          createdBy: context.actor.userId,
          updatedBy: context.actor.userId,
        });
        context.transaction.create(reference, risk);
        const version = writeVersion(
          context.transaction,
          reference,
          'risk',
          risk,
          null,
          null,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        return {
          result: { success: true, riskId, revision: 1 },
          audit: {
            entityType: 'risk',
            entityId: riskId,
            action: 'create',
            beforeSummary: null,
            afterSummary: auditSummary(risk, version),
            workflowContext: 'risk_created',
          },
        };
      },
    })
);

export const updateTenantRisk = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedUpdateRiskPayload, { success: true; riskId: string; revision: number }>(request, {
      commandName: 'risk.update',
      commandVersion: 1,
      validatePayload: normalizeUpdateRiskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveRevision(context.transaction, context.tenantId, 'risks', context.payload.riskId, 'risk'),
      mutateInTransaction: async (context) => {
        const { riskId, ...patch } = context.payload;
        const reference = db.doc(`tenants/${context.tenantId}/risks/${riskId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Risk does not exist.');
        const before = snapshot.data() as Risk;
        assertIdentity(before, context.tenantId, riskId, 'risk');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Retired risks are immutable.');
        assertManualRisk(before);
        if (before.status === 'closed') {
          throw new HttpsError('failed-precondition', 'Closed risks are immutable.');
        }
        if (before.status === 'accepted') {
          assertStatusOnlyPatch(patch, 'An accepted risk');
        }
        if (patch.status !== undefined) {
          assertOperationalTransition(before.status, patch.status, RISK_LEGAL_TRANSITIONS, 'risk status');
        }
        const after: Risk = canonicalState({
          ...before,
          ...patch,
          inherentScore: (patch.inherentLikelihood ?? before.inherentLikelihood) * (patch.inherentImpact ?? before.inherentImpact),
          residualScore: (patch.residualLikelihood ?? before.residualLikelihood) * (patch.residualImpact ?? before.residualImpact),
          revision: operationalRevision(before) + 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        if (patch.status === 'accepted') {
          if (
            context.actor.userId === before.ownerId ||
            context.actor.userId === after.ownerId ||
            context.actor.userId === before.createdBy
          ) {
            throw new HttpsError(
              'permission-denied',
              'Residual-risk acceptance requires an independent manager.'
            );
          }
          if (after.treatmentStrategy !== 'accept') {
            throw new HttpsError(
              'failed-precondition',
              'Risk status may be accepted only when the treatment strategy is accept.'
            );
          }
          after.acceptedBy = context.actor.userId;
          after.acceptedAt = context.requestedAt;
        } else if (
          before.status === 'accepted' &&
          (patch.status === 'assessed' || patch.status === 'mitigating')
        ) {
          after.acceptedBy = null;
          after.acceptedAt = null;
        }
        if (patch.status === 'closed') {
          if (
            context.actor.userId === before.ownerId ||
            context.actor.userId === after.ownerId ||
            context.actor.userId === before.createdBy
          ) {
            throw new HttpsError(
              'permission-denied',
              'Risk closure requires an independent manager.'
            );
          }
          after.closedBy = context.actor.userId;
          after.closedAt = context.requestedAt;
        }
        treatmentPlanRequired(after);
        await assertActiveMember(context.transaction, context.tenantId, after.ownerId, 'Risk owner');
        await assertRiskRelationships(context.transaction, context.tenantId, after);
        if (!riskMaterialChanged(before, after)) {
          throw new HttpsError('failed-precondition', 'Risk update contains no material change.');
        }
        const previous = await ensureVersionContinuity(
          context.transaction,
          reference,
          'risk',
          before,
          context.actor.userId,
          context.commandId,
          context.requestedAt
        );
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'risk', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, riskId, revision: after.revision! },
          audit: {
            entityType: 'risk',
            entityId: riskId,
            action: patch.status ? 'status_transition' : 'update',
            beforeSummary: auditSummary(before, previous),
            afterSummary: auditSummary(after, version),
            workflowContext: patch.status ? 'risk_status_changed' : 'risk_updated',
          },
        };
      },
    })
);

export const deleteTenantRisk = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedRetireOperationalPayload, { success: true; riskId: string; retired: true; revision: number }>(request, {
      commandName: 'risk.retire',
      commandVersion: 1,
      validatePayload: normalizeRetireOperationalPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveRevision(context.transaction, context.tenantId, 'risks', context.payload.entityId, 'risk'),
      mutateInTransaction: async (context) => {
        const reference = db.doc(`tenants/${context.tenantId}/risks/${context.payload.entityId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Risk does not exist.');
        const before = snapshot.data() as Risk;
        assertIdentity(before, context.tenantId, reference.id, 'risk');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Risk is already retired.');
        assertManualRisk(before);
        const previous = await ensureVersionContinuity(context.transaction, reference, 'risk', before, context.actor.userId, context.commandId, context.requestedAt);
        const after: Risk = canonicalState({
          ...before,
          status: 'closed',
          retiredAt: context.requestedAt,
          retiredBy: context.actor.userId,
          retirementReason: context.payload.retirementReason,
          revision: operationalRevision(before) + 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'risk', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, riskId: reference.id, retired: true, revision: after.revision! },
          audit: {
            entityType: 'risk',
            entityId: reference.id,
            action: 'status_transition',
            beforeSummary: auditSummary(before, previous),
            afterSummary: auditSummary(after, version),
            workflowContext: 'risk_retired',
          },
        };
      },
    })
);

export const linkRiskToProcessorOrTransfer = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedLinkRiskPayload, { success: true; riskId: string; revision: number }>(request, {
      commandName: 'risk.link',
      commandVersion: 1,
      validatePayload: normalizeLinkRiskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) =>
        resolveRevision(context.transaction, context.tenantId, 'risks', context.payload.riskId, 'risk'),
      mutateInTransaction: async (context) => {
        const reference = db.doc(`tenants/${context.tenantId}/risks/${context.payload.riskId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Risk does not exist.');
        const before = snapshot.data() as Risk;
        assertIdentity(before, context.tenantId, reference.id, 'risk');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Retired risks are immutable.');
        assertManualRisk(before);
        const processorProfileIds = [...(before.processorProfileIds ?? [])];
        const transferArrangementIds = [...(before.transferArrangementIds ?? [])];
        const vendorIds = [...(before.vendorIds ?? [])];
        if (context.payload.processorProfileId && !processorProfileIds.includes(context.payload.processorProfileId)) processorProfileIds.push(context.payload.processorProfileId);
        if (context.payload.transferArrangementId && !transferArrangementIds.includes(context.payload.transferArrangementId)) transferArrangementIds.push(context.payload.transferArrangementId);
        if (context.payload.vendorId && !vendorIds.includes(context.payload.vendorId)) vendorIds.push(context.payload.vendorId);
        const after: Risk = canonicalState({
          ...before,
          processorProfileIds,
          transferArrangementIds,
          vendorIds,
          revision: operationalRevision(before) + 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        await assertRiskRelationships(context.transaction, context.tenantId, after);
        if (!riskMaterialChanged(before, after)) throw new HttpsError('failed-precondition', 'All requested links already exist.');
        const previous = await ensureVersionContinuity(context.transaction, reference, 'risk', before, context.actor.userId, context.commandId, context.requestedAt);
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'risk', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, riskId: reference.id, revision: after.revision! },
          audit: {
            entityType: 'risk',
            entityId: reference.id,
            action: 'link',
            beforeSummary: auditSummary(before, previous),
            afterSummary: auditSummary(after, version),
            workflowContext: 'risk_relationships_linked',
          },
        };
      },
    })
);

export const createTenantIssue = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedCreateIssuePayload, { success: true; issueId: string; revision: number }>(request, {
      commandName: 'issue.create',
      commandVersion: 1,
      validatePayload: normalizeCreateIssuePayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: async () => null,
      mutateInTransaction: async (context) => {
        assertOperationalDueDateIsReasonable(context.payload.dueDate, context.requestedAt);
        const issueId = deterministicDocumentId('issue', context.commandId);
        const reference = db.doc(`tenants/${context.tenantId}/issues/${issueId}`);
        const duplicateCode = await context.transaction.get(db.collection(`tenants/${context.tenantId}/issues`).where('code', '==', context.payload.code).limit(1));
        if (!duplicateCode.empty) throw new HttpsError('already-exists', 'An issue with this code already exists.');
        const ownerId = context.payload.ownerId ?? context.actor.userId;
        if (context.actor.role === 'contributor' && ownerId !== context.actor.userId) {
          throw new HttpsError('permission-denied', 'Contributors may only assign issues to themselves.');
        }
        await assertActiveMember(
          context.transaction,
          context.tenantId,
          ownerId,
          'Issue owner',
          OPERATIONAL_WORK_ASSIGNEE_ROLES
        );
        await assertIssueSource(context.transaction, context.tenantId, context.payload.sourceEntityType, context.payload.sourceEntityId);
        const issue: Issue = canonicalState({
          id: issueId,
          tenantId: context.tenantId,
          code: context.payload.code,
          title: context.payload.title,
          description: context.payload.description,
          severity: context.payload.severity,
          status: 'open',
          source: context.payload.source,
          sourceEntityId: context.payload.sourceEntityId,
          sourceEntityType: context.payload.sourceEntityType,
          dueDate: context.payload.dueDate,
          resolutionPlan: context.payload.resolutionPlan,
          resolvedAt: null,
          verifiedBy: null,
          verifiedAt: null,
          ownerId,
          revision: 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
          createdAt: context.requestedAt,
          updatedAt: context.requestedAt,
          createdBy: context.actor.userId,
          updatedBy: context.actor.userId,
        });
        context.transaction.create(reference, issue);
        const version = writeVersion(context.transaction, reference, 'issue', issue, null, null, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, issueId, revision: 1 },
          audit: { entityType: 'issue', entityId: issueId, action: 'create', beforeSummary: null, afterSummary: auditSummary(issue, version), workflowContext: 'issue_created' },
        };
      },
    })
);

export const updateTenantIssue = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedUpdateIssuePayload, { success: true; issueId: string; revision: number }>(request, {
      commandName: 'issue.update',
      commandVersion: 1,
      validatePayload: normalizeUpdateIssuePayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) => resolveRevision(context.transaction, context.tenantId, 'issues', context.payload.issueId, 'issue'),
      mutateInTransaction: async (context) => {
        const { issueId, ...patch } = context.payload;
        const reference = db.doc(`tenants/${context.tenantId}/issues/${issueId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Issue does not exist.');
        const before = snapshot.data() as Issue;
        assertIdentity(before, context.tenantId, issueId, 'issue');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Retired issues are immutable.');
        if (before.status === 'closed') {
          throw new HttpsError('failed-precondition', 'Closed issues are immutable.');
        }
        if (before.status === 'under_review' || before.status === 'resolved') {
          assertStatusOnlyPatch(
            patch,
            before.status === 'under_review'
              ? 'An issue under review'
              : 'A resolved issue'
          );
        }
        if (context.actor.role === 'contributor') {
          if (before.ownerId !== context.actor.userId && before.createdBy !== context.actor.userId) {
            throw new HttpsError('permission-denied', 'Contributors may only update their own issues.');
          }
          if (patch.ownerId && patch.ownerId !== before.ownerId) {
            throw new HttpsError('permission-denied', 'Contributors cannot reassign issues.');
          }
        }
        if (patch.status !== undefined) assertOperationalTransition(before.status, patch.status, ISSUE_LEGAL_TRANSITIONS, 'issue status');
        const after: Issue = canonicalState({
          ...before,
          ...patch,
          revision: operationalRevision(before) + 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        if (patch.dueDate) assertOperationalDueDateIsReasonable(patch.dueDate, context.requestedAt);
        await assertActiveMember(
          context.transaction,
          context.tenantId,
          after.ownerId,
          'Issue owner',
          OPERATIONAL_WORK_ASSIGNEE_ROLES
        );
        if (
          patch.status === 'under_review' &&
          (typeof after.resolutionPlan !== 'string' ||
            after.resolutionPlan.trim().length < 20)
        ) {
          throw new HttpsError(
            'failed-precondition',
            'A corrective-action summary of at least 20 characters is required before review.'
          );
        }
        if (patch.status === 'resolved') {
          if (context.actor.role === 'contributor' || context.actor.userId === before.ownerId || context.actor.userId === before.createdBy) {
            throw new HttpsError('permission-denied', 'Issue resolution requires an independent manager.');
          }
          if (after.resolutionPlan.trim().length < 20) {
            throw new HttpsError('failed-precondition', 'A resolution plan of at least 20 characters is required.');
          }
          after.resolvedAt = context.requestedAt;
          after.verifiedBy = context.actor.userId;
          after.verifiedAt = context.requestedAt;
        } else if (patch.status === 'in_progress' && before.status === 'resolved') {
          after.resolvedAt = null;
          after.verifiedBy = null;
          after.verifiedAt = null;
        } else if (patch.status === 'closed' && (!before.verifiedBy || !before.verifiedAt || !before.resolvedAt)) {
          throw new HttpsError('failed-precondition', 'Only a previously independently verified issue may be closed.');
        }
        if (!issueMaterialChanged(before, after)) {
          throw new HttpsError('failed-precondition', 'Issue update contains no material change.');
        }
        const previous = await ensureVersionContinuity(context.transaction, reference, 'issue', before, context.actor.userId, context.commandId, context.requestedAt);
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'issue', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, issueId, revision: after.revision! },
          audit: { entityType: 'issue', entityId: issueId, action: patch.status ? 'status_transition' : 'update', beforeSummary: auditSummary(before, previous), afterSummary: auditSummary(after, version), workflowContext: patch.status ? 'issue_status_changed' : 'issue_updated' },
        };
      },
    })
);

export const deleteTenantIssue = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedRetireOperationalPayload, { success: true; issueId: string; retired: true; revision: number }>(request, {
      commandName: 'issue.retire',
      commandVersion: 1,
      validatePayload: normalizeRetireOperationalPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) => resolveRevision(context.transaction, context.tenantId, 'issues', context.payload.entityId, 'issue'),
      mutateInTransaction: async (context) => {
        const reference = db.doc(`tenants/${context.tenantId}/issues/${context.payload.entityId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Issue does not exist.');
        const before = snapshot.data() as Issue;
        assertIdentity(before, context.tenantId, reference.id, 'issue');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Issue is already retired.');
        const previous = await ensureVersionContinuity(context.transaction, reference, 'issue', before, context.actor.userId, context.commandId, context.requestedAt);
        const after: Issue = canonicalState({ ...before, status: 'closed', retiredAt: context.requestedAt, retiredBy: context.actor.userId, retirementReason: context.payload.retirementReason, revision: operationalRevision(before) + 1, workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION, updatedAt: context.requestedAt, updatedBy: context.actor.userId });
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'issue', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, issueId: reference.id, retired: true, revision: after.revision! },
          audit: { entityType: 'issue', entityId: reference.id, action: 'status_transition', beforeSummary: auditSummary(before, previous), afterSummary: auditSummary(after, version), workflowContext: 'issue_retired' },
        };
      },
    })
);

export const createTenantTask = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedCreateTaskPayload, { success: true; taskId: string; revision: number }>(request, {
      commandName: 'task.create',
      commandVersion: 1,
      validatePayload: normalizeCreateTaskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: async () => null,
      mutateInTransaction: async (context) => {
        assertOperationalDueDateIsReasonable(context.payload.dueDate, context.requestedAt);
        const taskId = deterministicDocumentId('task', context.commandId);
        const reference = db.doc(`tenants/${context.tenantId}/tasks/${taskId}`);
        const assigneeId = context.payload.assigneeId ?? context.actor.userId;
        if (context.actor.role === 'contributor' && assigneeId !== context.actor.userId) {
          throw new HttpsError('permission-denied', 'Contributors may only assign tasks to themselves.');
        }
        await assertActiveMember(
          context.transaction,
          context.tenantId,
          assigneeId,
          'Task assignee',
          OPERATIONAL_WORK_ASSIGNEE_ROLES
        );
        await assertTaskParent(context.transaction, context.tenantId, context.payload.parentEntityType, context.payload.parentEntityId);
        const task: Task = canonicalState({
          id: taskId,
          tenantId: context.tenantId,
          title: context.payload.title,
          description: context.payload.description,
          status: 'todo',
          assigneeId,
          parentEntityType: context.payload.parentEntityType,
          parentEntityId: context.payload.parentEntityId,
          dueDate: context.payload.dueDate,
          completedAt: null,
          ownerId: context.actor.userId,
          revision: 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          retiredAt: null,
          retiredBy: null,
          retirementReason: null,
          createdAt: context.requestedAt,
          updatedAt: context.requestedAt,
          createdBy: context.actor.userId,
          updatedBy: context.actor.userId,
        });
        context.transaction.create(reference, task);
        const version = writeVersion(context.transaction, reference, 'task', task, null, null, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, taskId, revision: 1 },
          audit: { entityType: 'task', entityId: taskId, action: 'create', beforeSummary: null, afterSummary: auditSummary(task, version), workflowContext: 'task_created' },
          outboxEvents: assigneeId === context.actor.userId ? [] : [{ type: 'task.assignment.requested', payload: { taskId, assigneeId, title: task.title, dueDate: task.dueDate } }],
        };
      },
    })
);

export const updateTenantTask = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedUpdateTaskPayload, { success: true; taskId: string; revision: number }>(request, {
      commandName: 'task.update',
      commandVersion: 1,
      validatePayload: normalizeUpdateTaskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) => resolveRevision(context.transaction, context.tenantId, 'tasks', context.payload.taskId, 'task'),
      mutateInTransaction: async (context) => {
        const { taskId, ...patch } = context.payload;
        const reference = db.doc(`tenants/${context.tenantId}/tasks/${taskId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Task does not exist.');
        const before = snapshot.data() as Task;
        assertIdentity(before, context.tenantId, taskId, 'task');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Retired tasks are immutable.');
        if (before.status === 'completed' || before.status === 'canceled') {
          throw new HttpsError('failed-precondition', 'Completed and canceled tasks are immutable.');
        }
        if (context.actor.role === 'contributor') {
          if (before.assigneeId !== context.actor.userId && before.createdBy !== context.actor.userId) {
            throw new HttpsError('permission-denied', 'Contributors may only update their own or assigned tasks.');
          }
          if (patch.assigneeId && patch.assigneeId !== before.assigneeId) {
            throw new HttpsError('permission-denied', 'Contributors cannot reassign tasks.');
          }
        }
        if (patch.status !== undefined) assertOperationalTransition(before.status, patch.status, TASK_LEGAL_TRANSITIONS, 'task status');
        const after: Task = canonicalState({
          ...before,
          ...patch,
          completedAt: patch.status === 'completed' ? context.requestedAt : before.completedAt,
          revision: operationalRevision(before) + 1,
          workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
          updatedAt: context.requestedAt,
          updatedBy: context.actor.userId,
        });
        if (patch.dueDate) assertOperationalDueDateIsReasonable(patch.dueDate, context.requestedAt);
        await assertActiveMember(
          context.transaction,
          context.tenantId,
          after.assigneeId,
          'Task assignee',
          OPERATIONAL_WORK_ASSIGNEE_ROLES
        );
        if (!taskMaterialChanged(before, after)) {
          throw new HttpsError('failed-precondition', 'Task update contains no material change.');
        }
        const previous = await ensureVersionContinuity(context.transaction, reference, 'task', before, context.actor.userId, context.commandId, context.requestedAt);
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'task', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, taskId, revision: after.revision! },
          audit: { entityType: 'task', entityId: taskId, action: patch.status ? 'status_transition' : 'update', beforeSummary: auditSummary(before, previous), afterSummary: auditSummary(after, version), workflowContext: patch.status ? 'task_status_changed' : 'task_updated' },
          outboxEvents: patch.assigneeId && patch.assigneeId !== before.assigneeId ? [{ type: 'task.assignment.requested', payload: { taskId, assigneeId: patch.assigneeId, title: after.title, dueDate: after.dueDate } }] : [],
        };
      },
    })
);

export const deleteTenantTask = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedRetireOperationalPayload, { success: true; taskId: string; retired: true; revision: number }>(request, {
      commandName: 'task.retire',
      commandVersion: 1,
      validatePayload: normalizeRetireOperationalPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: (context) => resolveRevision(context.transaction, context.tenantId, 'tasks', context.payload.entityId, 'task'),
      mutateInTransaction: async (context) => {
        const reference = db.doc(`tenants/${context.tenantId}/tasks/${context.payload.entityId}`);
        const snapshot = await context.transaction.get(reference);
        if (!snapshot.exists) throw new HttpsError('not-found', 'Task does not exist.');
        const before = snapshot.data() as Task;
        assertIdentity(before, context.tenantId, reference.id, 'task');
        if (before.retiredAt) throw new HttpsError('failed-precondition', 'Task is already retired.');
        const previous = await ensureVersionContinuity(context.transaction, reference, 'task', before, context.actor.userId, context.commandId, context.requestedAt);
        const after: Task = canonicalState({ ...before, status: 'canceled', retiredAt: context.requestedAt, retiredBy: context.actor.userId, retirementReason: context.payload.retirementReason, revision: operationalRevision(before) + 1, workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION, updatedAt: context.requestedAt, updatedBy: context.actor.userId });
        context.transaction.set(reference, after);
        const version = writeVersion(context.transaction, reference, 'task', after, before, previous, context.actor.userId, context.commandId, context.requestedAt);
        return {
          result: { success: true, taskId: reference.id, retired: true, revision: after.revision! },
          audit: { entityType: 'task', entityId: reference.id, action: 'status_transition', beforeSummary: auditSummary(before, previous), afterSummary: auditSummary(after, version), workflowContext: 'task_retired' },
        };
      },
    })
);

export const syncDerivedProcessorRisks = onCall<TenantCommandEnvelope>(
  AUTHORITATIVE_CALLABLE_OPTIONS,
  (request) =>
    executeTenantCommand<NormalizedSyncDerivedRiskPayload, { success: true; processorProfileId: string; activeFlags: number; created: number; updated: number; closed: number }>(request, {
      commandName: 'risk.sync_derived',
      commandVersion: 1,
      validatePayload: normalizeSyncDerivedRiskPayload,
      requireExpectedRevision: true,
      resolveCurrentRevision: async () => null,
      mutateInTransaction: async (context) => {
        const profileReference = db.doc(`tenants/${context.tenantId}/processor_profiles/${context.payload.processorProfileId}`);
        const profileSnapshot = await context.transaction.get(profileReference);
        if (!profileSnapshot.exists) throw new HttpsError('not-found', 'Processor profile does not exist.');
        const profile = profileSnapshot.data() as ProcessorProfile;
        if (profile.id !== profileReference.id || profile.tenantId !== context.tenantId) {
          throw new HttpsError('failed-precondition', 'Processor profile identity metadata is invalid.');
        }
        const transferSnapshot = await context.transaction.get(
          db.collection(`tenants/${context.tenantId}/transfer_arrangements`).where('processorProfileId', '==', profile.id).limit(MAX_PROCESSOR_CONTEXT_RECORDS + 1)
        );
        const evidenceSnapshot = await context.transaction.get(
          db.collection(`tenants/${context.tenantId}/evidence`).where('processorProfileIds', 'array-contains', profile.id).limit(MAX_PROCESSOR_CONTEXT_RECORDS + 1)
        );
        const existingSnapshot = await context.transaction.get(
          db.collection(`tenants/${context.tenantId}/risks`).where('processorProfileIds', 'array-contains', profile.id).limit(MAX_PROCESSOR_CONTEXT_RECORDS + 1)
        );
        if (transferSnapshot.size > MAX_PROCESSOR_CONTEXT_RECORDS || evidenceSnapshot.size > MAX_PROCESSOR_CONTEXT_RECORDS || existingSnapshot.size > MAX_PROCESSOR_CONTEXT_RECORDS) {
          throw new HttpsError('resource-exhausted', 'Processor risk context exceeds the governed synchronization limit.');
        }
        const transfers = transferSnapshot.docs.map((document) => document.data() as TransferArrangement);
        for (let index = 0; index < transfers.length; index += 1) {
          const transfer = transfers[index]!;
          const document = transferSnapshot.docs[index]!;
          if (
            transfer.id !== document.id ||
            transfer.tenantId !== context.tenantId ||
            transfer.processorProfileId !== profile.id
          ) {
            throw new HttpsError(
              'failed-precondition',
              'A transfer arrangement in the processor context has invalid identity metadata.'
            );
          }
        }
        const explicitlyLinkedEvidenceIds = new Set<string>([
          ...(typeof profile.linkedDpaEvidenceId === 'string'
            ? [storedDocumentId(profile.linkedDpaEvidenceId, 'linkedDpaEvidenceId')]
            : []),
          ...transfers.flatMap((transfer) =>
            (transfer.linkedEvidenceIds ?? []).map((evidenceId, index) =>
              storedDocumentId(
                evidenceId,
                `transfer '${transfer.id}' linkedEvidenceIds[${index}]`
              )
            )
          ),
        ]);
        if (explicitlyLinkedEvidenceIds.size > MAX_PROCESSOR_CONTEXT_RECORDS) {
          throw new HttpsError(
            'resource-exhausted',
            'Processor evidence links exceed the governed synchronization limit.'
          );
        }
        const explicitlyLinkedEvidence = explicitlyLinkedEvidenceIds.size
          ? await context.transaction.getAll(
              ...[...explicitlyLinkedEvidenceIds].map((evidenceId) =>
                db.doc(`tenants/${context.tenantId}/evidence/${evidenceId}`)
              )
            )
          : [];
        const transferIds = new Set(transfers.map((transfer) => transfer.id));
        const evidenceById = new Map<string, Evidence>();
        for (const document of [
          ...evidenceSnapshot.docs,
          ...explicitlyLinkedEvidence,
        ]) {
          if (!document.exists) continue;
          const record = document.data() as Evidence;
          if (record.id === document.id && record.tenantId === context.tenantId) {
            evidenceById.set(document.id, record);
          }
        }
        const evidence = verifiedEvidenceForProcessor(
          [...evidenceById.values()],
          profile.id,
          transferIds
        );
        const verifiedEvidenceIds = new Set(evidence.map((record) => record.id));
        const assuredProfile: ProcessorProfile = {
          ...profile,
          dpaSigned: Boolean(
            profile.dpaSigned &&
              profile.linkedDpaEvidenceId &&
              verifiedEvidenceIds.has(profile.linkedDpaEvidenceId) &&
              evidenceById
                .get(profile.linkedDpaEvidenceId)
                ?.processorProfileIds?.includes(profile.id)
          ),
        };
        const assuredTransfers = transfers.map((transfer) => ({
          ...transfer,
          linkedEvidenceIds: (transfer.linkedEvidenceIds ?? []).filter((evidenceId) =>
            verifiedEvidenceIds.has(evidenceId) &&
            evidenceById
              .get(evidenceId)
              ?.transferArrangementIds?.includes(transfer.id)
          ),
        }));
        const summary = evaluateProcessorRiskFlags(
          assuredProfile,
          assuredTransfers,
          evidence,
          new Date(context.requestedAt)
        );
        const governedExisting = existingSnapshot.docs
          .map((document) => ({ reference: document.ref, risk: document.data() as Risk }))
          .filter(({ risk }) => risk.sourceEntityType === 'processor_risk_engine' && risk.sourceEntityId === profile.id);
        const byDeduplicationKey = new Map<string, { reference: DocumentReference; risk: Risk }>();
        for (const item of governedExisting) {
          if (!item.risk.deduplicationKey) continue;
          if (byDeduplicationKey.has(item.risk.deduplicationKey)) {
            throw new HttpsError('failed-precondition', 'Duplicate derived risks exist and must be reconciled before synchronization.');
          }
          assertIdentity(item.risk, context.tenantId, item.reference.id, 'risk');
          byDeduplicationKey.set(item.risk.deduplicationKey, item);
        }

        const desiredKeys = new Set(summary.flags.map((flag) => `${flag.ruleCode}:${flag.entityId}`));
        const planned: Array<{ reference: DocumentReference; before: Risk | null; after: Risk }> = [];
        for (const flag of summary.flags) {
          const key = `${flag.ruleCode}:${flag.entityId}`;
          const existing = byDeduplicationKey.get(key);
          if (existing) {
            const candidate: Risk = canonicalState({
              ...existing.risk,
              title: flag.title,
              description: flag.description,
              status: existing.risk.status === 'closed' ? 'identified' : existing.risk.status,
              inherentLikelihood: flag.inherentLikelihood,
              inherentImpact: flag.inherentImpact,
              inherentScore: flag.inherentScore,
              residualLikelihood: flag.inherentLikelihood,
              residualImpact: flag.inherentImpact,
              residualScore: flag.inherentScore,
              treatmentPlan: flag.suggestedTreatment,
              affectedAssetIds: profile.linkedSystemAssetIds ?? [],
              processorProfileIds: [profile.id],
              transferArrangementIds: flag.transferArrangementId ? [flag.transferArrangementId] : [],
              vendorIds: profile.vendorId ? [profile.vendorId] : [],
              derivedRuleCode: flag.ruleCode,
              deduplicationKey: key,
              sourceEntityType: 'processor_risk_engine',
              sourceEntityId: profile.id,
              retiredAt: null,
              retiredBy: null,
              retirementReason: null,
              workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
            });
            if (riskMaterialChanged(existing.risk, candidate)) {
              candidate.revision = operationalRevision(existing.risk) + 1;
              candidate.updatedAt = context.requestedAt;
              candidate.updatedBy = context.actor.userId;
              planned.push({ reference: existing.reference, before: existing.risk, after: candidate });
            }
            continue;
          }
          const riskId = `derived_${createHash('sha256').update(`${context.tenantId}:${profile.id}:${key}`, 'utf8').digest('hex').slice(0, 32)}`;
          const reference = db.doc(`tenants/${context.tenantId}/risks/${riskId}`);
          const risk: Risk = canonicalState({
            id: riskId,
            tenantId: context.tenantId,
            code: `RSK-PROC-${createHash('sha256').update(key, 'utf8').digest('hex').slice(0, 8).toUpperCase()}`,
            title: flag.title,
            description: flag.description,
            category: 'third_party',
            status: 'identified',
            inherentLikelihood: flag.inherentLikelihood,
            inherentImpact: flag.inherentImpact,
            inherentScore: flag.inherentScore,
            residualLikelihood: flag.inherentLikelihood,
            residualImpact: flag.inherentImpact,
            residualScore: flag.inherentScore,
            treatmentStrategy: 'mitigate',
            treatmentPlan: flag.suggestedTreatment,
            mitigatingControlIds: [],
            affectedAssetIds: profile.linkedSystemAssetIds ?? [],
            processorProfileIds: [profile.id],
            transferArrangementIds: flag.transferArrangementId ? [flag.transferArrangementId] : [],
            vendorIds: profile.vendorId ? [profile.vendorId] : [],
            derivedRuleCode: flag.ruleCode,
            deduplicationKey: key,
            sourceEntityType: 'processor_risk_engine',
            sourceEntityId: profile.id,
            ownerId: context.actor.userId,
            revision: 1,
            workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION,
            retiredAt: null,
            retiredBy: null,
            retirementReason: null,
            createdAt: context.requestedAt,
            updatedAt: context.requestedAt,
            createdBy: context.actor.userId,
            updatedBy: context.actor.userId,
          });
          planned.push({ reference, before: null, after: risk });
        }
        for (const item of governedExisting) {
          if (!item.risk.deduplicationKey || desiredKeys.has(item.risk.deduplicationKey) || item.risk.status === 'closed') continue;
          const after: Risk = canonicalState({ ...item.risk, status: 'closed', retiredAt: context.requestedAt, retiredBy: context.actor.userId, retirementReason: 'Derived condition is no longer present in the verified processor context.', revision: operationalRevision(item.risk) + 1, workflowSchemaVersion: OPERATIONAL_WORKFLOW_SCHEMA_VERSION, updatedAt: context.requestedAt, updatedBy: context.actor.userId });
          planned.push({ reference: item.reference, before: item.risk, after });
        }

        for (const item of planned) {
          await assertRiskRelationships(
            context.transaction,
            context.tenantId,
            item.after
          );
        }

        // Firestore transactions require every read before the first write. Load
        // collision records and prior version anchors in one read phase, then
        // validate/queue all version and state writes below.
        const anchorReferences = planned.map((item) =>
          item.before
            ? item.reference.collection('versions').doc(versionId(operationalRevision(item.before)))
            : item.reference
        );
        const anchorSnapshots = anchorReferences.length
          ? await context.transaction.getAll(...anchorReferences)
          : [];
        const touched: Array<{
          reference: DocumentReference;
          before: Risk | null;
          after: Risk;
          previous: VersionAnchor | null;
        }> = [];
        for (let index = 0; index < planned.length; index += 1) {
          const item = planned[index]!;
          const anchorSnapshot = anchorSnapshots[index]!;
          if (!item.before) {
            if (anchorSnapshot.exists) {
              throw new HttpsError(
                'failed-precondition',
                'A derived risk identifier collision requires manual repair.'
              );
            }
            touched.push({ ...item, previous: null });
            continue;
          }
          const previous = validateVersionContinuitySnapshot(
            context.transaction,
            anchorReferences[index]!,
            anchorSnapshot,
            'risk',
            item.before,
            context.actor.userId,
            context.commandId,
            context.requestedAt
          );
          touched.push({ ...item, previous });
        }

        let created = 0;
        let updated = 0;
        let closed = 0;
        const changedIds: string[] = [];
        for (const item of touched) {
          if (item.before) context.transaction.set(item.reference, item.after);
          else context.transaction.create(item.reference, item.after);
          writeVersion(context.transaction, item.reference, 'risk', item.after, item.before, item.previous, context.actor.userId, context.commandId, context.requestedAt);
          changedIds.push(item.reference.id);
          if (!item.before) created += 1;
          else if (item.after.status === 'closed' && item.before.status !== 'closed') closed += 1;
          else updated += 1;
        }
        return {
          result: { success: true, processorProfileId: profile.id, activeFlags: summary.flags.length, created, updated, closed },
          audit: {
            entityType: 'processor_profile',
            entityId: profile.id,
            action: 'update',
            beforeSummary: { derivedRiskCount: governedExisting.filter(({ risk }) => risk.status !== 'closed').length },
            afterSummary: { activeFlags: summary.flags.length, created, updated, closed, changedRiskIds: changedIds },
            workflowContext: 'derived_processor_risks_reconciled',
          },
        };
      },
    })
);

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function normalizePageInput(input: unknown, allowedFilters: readonly string[]): ReadPageInput {
  if (!isPlainObject(input)) throw new HttpsError('invalid-argument', 'List input must be an object.');
  const allowed = new Set(['tenantId', 'pageSize', 'cursor', ...allowedFilters]);
  const unknown = Object.keys(input).filter((key) => !allowed.has(key));
  if (unknown.length) throw new HttpsError('invalid-argument', `List input contains unsupported field(s): ${unknown.join(', ')}.`);
  const tenantId = normalizeOperationalDocumentId(input.tenantId, 'tenantId');
  const pageSize = input.pageSize === undefined ? DEFAULT_PAGE_SIZE : input.pageSize;
  if (!Number.isSafeInteger(pageSize) || (pageSize as number) < 1 || (pageSize as number) > MAX_PAGE_SIZE) {
    throw new HttpsError('invalid-argument', `pageSize must be an integer from 1 to ${MAX_PAGE_SIZE}.`);
  }
  const normalized: ReadPageInput = { tenantId, pageSize: pageSize as number };
  for (const key of allowedFilters) {
    if (input[key] !== undefined) normalized[key as keyof ReadPageInput] = normalizeOperationalDocumentId(input[key], key) as never;
  }
  if (input.cursor !== undefined) normalized.cursor = normalizeOperationalDocumentId(input.cursor, 'cursor');
  return normalized;
}

function assertReadFilter(
  value: string | undefined,
  allowed: ReadonlySet<string>,
  label: string
): void {
  if (value !== undefined && !allowed.has(value)) {
    throw new HttpsError('invalid-argument', `${label} contains an unsupported value.`);
  }
}

function timestampWithinCommandWindow(earlier: unknown, later: unknown): boolean {
  if (typeof earlier !== 'string' || typeof later !== 'string') return false;
  const earlierTime = Date.parse(earlier);
  const laterTime = Date.parse(later);
  return (
    Number.isFinite(earlierTime) &&
    Number.isFinite(laterTime) &&
    earlierTime <= laterTime &&
    laterTime - earlierTime <= 5 * 60 * 1_000
  );
}

async function verifiedWorkflowTrust(
  tenantId: string,
  entityType: OperationalEntityType,
  documents: Array<{ id: string; data: OperationalEntity }>
): Promise<Map<string, boolean>> {
  const result = new Map<string, boolean>();
  const candidates = documents.filter(({ data }) => data.workflowSchemaVersion === OPERATIONAL_WORKFLOW_SCHEMA_VERSION && Number.isSafeInteger(data.revision) && (data.revision ?? 0) > 0);
  if (!candidates.length) return result;
  const versionReferences = candidates.map(({ id, data }) => db.doc(`tenants/${tenantId}/${entityType === 'risk' ? 'risks' : entityType === 'issue' ? 'issues' : 'tasks'}/${id}/versions/${versionId(data.revision!)}`));
  const versionSnapshots = await db.getAll(...versionReferences);
  const receiptReferences: DocumentReference[] = [];
  const validVersionsByCommand = new Map<
    string,
    Array<{
      entityId: string;
      data: OperationalEntity;
      recordedBy: string;
      recordedAt: string;
    }>
  >();
  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index]!;
    const version = versionSnapshots[index]?.data();
    let stateHash = '';
    let storedStateHash = '';
    try {
      stateHash = stableTrustedValueHash(candidate.data, `${entityType} projection state`);
      storedStateHash = stableTrustedValueHash(version?.state, `${entityType} version state`);
    } catch {
      continue;
    }
    if (
      version?.schemaVersion !== OPERATIONAL_VERSION_SCHEMA_VERSION ||
      version?.id !== versionId(candidate.data.revision!) ||
      version?.tenantId !== tenantId ||
      version?.entityType !== entityType ||
      version?.entityId !== candidate.id ||
      version?.revision !== candidate.data.revision ||
      version?.stateHash !== stateHash ||
      storedStateHash !== stateHash ||
      typeof version?.commandId !== 'string' ||
      typeof version?.recordedBy !== 'string' ||
      typeof version?.recordedAt !== 'string' ||
      !['governed_creation', 'governed_command'].includes(version?.provenance)
    ) continue;
    const entries = validVersionsByCommand.get(version.commandId) ?? [];
    entries.push({
      entityId: candidate.id,
      data: candidate.data,
      recordedBy: version.recordedBy,
      recordedAt: version.recordedAt,
    });
    validVersionsByCommand.set(version.commandId, entries);
  }
  for (const commandId of validVersionsByCommand.keys()) {
    receiptReferences.push(db.doc(`tenants/${tenantId}/command_receipts/${commandId}`));
  }
  if (!receiptReferences.length) return result;
  const receiptSnapshots = await db.getAll(...receiptReferences);
  const auditReferences: DocumentReference[] = [];
  const validReceiptsByAudit = new Map<
    string,
    Array<{
      entityId: string;
      direct: boolean;
      processorProfileId: string | null;
      actorId: string;
      actorRole: string;
      auditAction: string;
      auditWorkflowContext: string;
      committedAt: string;
      recordedAt: string;
    }>
  >();
  for (const snapshot of receiptSnapshots) {
    const receipt = snapshot.data();
    const candidatesForCommand = validVersionsByCommand.get(snapshot.id);
    if (
      !candidatesForCommand ||
      receipt?.schemaVersion !== COMMAND_RECEIPT_SCHEMA_VERSION ||
      receipt?.envelopeVersion !== 1 ||
      receipt?.commandVersion !== 1 ||
      receipt?.id !== snapshot.id ||
      receipt?.tenantId !== tenantId ||
      receipt?.commandId !== snapshot.id ||
      receipt?.status !== 'completed' ||
      typeof receipt?.commandName !== 'string' ||
      typeof receipt?.actorId !== 'string' ||
      typeof receipt?.actorRole !== 'string' ||
      typeof receipt?.auditAction !== 'string' ||
      typeof receipt?.auditLogId !== 'string' ||
      typeof receipt?.auditWorkflowContext !== 'string' ||
      typeof receipt?.committedAt !== 'string'
    ) continue;
    const verifiedCandidates = candidatesForCommand.flatMap(({ entityId, data, recordedBy, recordedAt }) => {
      if (
        recordedBy !== receipt.actorId ||
        !timestampWithinCommandWindow(recordedAt, receipt.committedAt)
      ) return [];
      const direct =
        receipt.entityId === entityId &&
        receipt.entityType === entityType &&
        receipt.commandName.startsWith(`${entityType}.`);
      const processorProfileId =
        entityType === 'risk' &&
        receipt.commandName === 'risk.sync_derived' &&
        receipt.entityType === 'processor_profile' &&
        'sourceEntityType' in data &&
        data.sourceEntityType === 'processor_risk_engine' &&
        typeof data.sourceEntityId === 'string' &&
        data.sourceEntityId === receipt.entityId
          ? data.sourceEntityId
          : null;
      return direct || processorProfileId
        ? [{
            entityId,
            direct,
            processorProfileId,
            actorId: receipt.actorId,
            actorRole: receipt.actorRole,
            auditAction: receipt.auditAction,
            auditWorkflowContext: receipt.auditWorkflowContext,
            committedAt: receipt.committedAt,
            recordedAt,
          }]
        : [];
    });
    if (!verifiedCandidates.length) continue;
    validReceiptsByAudit.set(receipt.auditLogId, verifiedCandidates);
    auditReferences.push(db.doc(`tenants/${tenantId}/audit_logs/${receipt.auditLogId}`));
  }
  if (!auditReferences.length) return result;
  const auditSnapshots = await db.getAll(...auditReferences);
  for (const snapshot of auditSnapshots) {
    const audit = snapshot.data();
    const candidatesForAudit = validReceiptsByAudit.get(snapshot.id) ?? [];
    if (
      audit?.id !== snapshot.id ||
      audit?.tenantId !== tenantId ||
      audit?.source !== 'cloud_function'
    ) continue;
    for (const candidate of candidatesForAudit) {
      if (
        audit.actorId !== candidate.actorId ||
        audit.actorRole !== candidate.actorRole ||
        audit.action !== candidate.auditAction ||
        audit.workflowContext !== candidate.auditWorkflowContext ||
        !timestampWithinCommandWindow(candidate.recordedAt, audit.timestamp) ||
        !timestampWithinCommandWindow(audit.timestamp, candidate.committedAt)
      ) continue;
      if (
        (candidate.direct && audit.entityId === candidate.entityId && audit.entityType === entityType) ||
        (!candidate.direct &&
          audit.entityId === candidate.processorProfileId &&
          audit.entityType === 'processor_profile' &&
          Array.isArray(audit.afterSummary?.changedRiskIds) &&
          audit.afterSummary.changedRiskIds.includes(candidate.entityId))
      ) {
        result.set(candidate.entityId, true);
      }
    }
  }
  return result;
}

function projectRisk(risk: Risk, full: boolean, trusted: boolean): Record<string, unknown> {
  const common = { id: risk.id, tenantId: risk.tenantId, code: risk.code, title: risk.title, category: risk.category, status: risk.status, inherentScore: risk.inherentScore, residualScore: risk.residualScore, treatmentStrategy: risk.treatmentStrategy, ownerId: risk.ownerId, updatedAt: risk.updatedAt, revision: risk.revision ?? 0, retiredAt: risk.retiredAt ?? null, workflowTrust: trusted ? 'governed' : 'legacy_unverified' };
  return full ? { ...risk, workflowTrust: common.workflowTrust } : common;
}

function projectIssue(issue: Issue, full: boolean, trusted: boolean): Record<string, unknown> {
  const common = { id: issue.id, tenantId: issue.tenantId, code: issue.code, title: issue.title, severity: issue.severity, status: issue.status, dueDate: issue.dueDate, ownerId: issue.ownerId, verifiedAt: issue.verifiedAt ?? null, updatedAt: issue.updatedAt, revision: issue.revision ?? 0, retiredAt: issue.retiredAt ?? null, workflowTrust: trusted ? 'governed' : 'legacy_unverified' };
  return full ? { ...issue, workflowTrust: common.workflowTrust } : common;
}

function projectTask(task: Task, full: boolean, trusted: boolean): Record<string, unknown> {
  const common = { id: task.id, tenantId: task.tenantId, title: task.title, status: task.status, assigneeId: task.assigneeId, parentEntityType: task.parentEntityType, parentEntityId: task.parentEntityId, dueDate: task.dueDate, completedAt: task.completedAt, ownerId: task.ownerId, updatedAt: task.updatedAt, revision: task.revision ?? 0, retiredAt: task.retiredAt ?? null, workflowTrust: trusted ? 'governed' : 'legacy_unverified' };
  return full ? { ...task, workflowTrust: common.workflowTrust } : common;
}

export const listTenantRisks = onCall(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const input = normalizePageInput(request.data, ['status', 'category', 'processorProfileId', 'transferArrangementId', 'vendorId', 'derivedRuleCode']);
  assertReadFilter(input.status, READ_RISK_STATUSES, 'status');
  assertReadFilter(input.category, READ_RISK_CATEGORIES, 'category');
  const auth = await requireTenantMember(request, input.tenantId);
  let query: FirebaseFirestore.Query = db.collection(`tenants/${input.tenantId}/risks`).orderBy(FieldPath.documentId());
  if (input.status) query = query.where('status', '==', input.status);
  if (input.category) query = query.where('category', '==', input.category);
  const arrayFilters = [['processorProfileIds', input.processorProfileId], ['transferArrangementIds', input.transferArrangementId], ['vendorIds', input.vendorId]].filter(([, value]) => value);
  if (arrayFilters.length > 1) throw new HttpsError('invalid-argument', 'Only one relationship filter may be used per risk page.');
  if (arrayFilters[0]) query = query.where(arrayFilters[0][0]!, 'array-contains', arrayFilters[0][1]);
  if (input.derivedRuleCode) query = query.where('derivedRuleCode', '==', input.derivedRuleCode);
  if (input.cursor) query = query.startAfter(input.cursor);
  const snapshot = await query.limit(input.pageSize! + 1).get();
  const docs = snapshot.docs.slice(0, input.pageSize!).map((document) => {
    const data = document.data() as Risk;
    assertIdentity(data, input.tenantId, document.id, 'risk');
    return { id: document.id, data };
  });
  const trust = await verifiedWorkflowTrust(input.tenantId, 'risk', docs);
  const full = FULL_OPERATIONAL_READ_ROLES.has(auth.role);
  const risks = docs.map(({ data }) => projectRisk(data, full, trust.get(data.id) === true));
  return { success: true, risks, count: risks.length, truncated: snapshot.size > input.pageSize!, nextCursor: snapshot.size > input.pageSize! ? docs.at(-1)?.id ?? null : null };
});

export const listTenantIssues = onCall(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const input = normalizePageInput(request.data, ['status', 'severity', 'sourceEntityType', 'sourceEntityId']);
  assertReadFilter(input.status, READ_ISSUE_STATUSES, 'status');
  assertReadFilter(input.severity, READ_ISSUE_SEVERITIES, 'severity');
  const auth = await requireTenantMember(request, input.tenantId);
  let query: FirebaseFirestore.Query = db.collection(`tenants/${input.tenantId}/issues`).orderBy(FieldPath.documentId());
  if (input.status) query = query.where('status', '==', input.status);
  if (input.severity) query = query.where('severity', '==', input.severity);
  if (input.sourceEntityType) query = query.where('sourceEntityType', '==', input.sourceEntityType);
  if (input.sourceEntityId) query = query.where('sourceEntityId', '==', input.sourceEntityId);
  if (input.cursor) query = query.startAfter(input.cursor);
  const snapshot = await query.limit(input.pageSize! + 1).get();
  const docs = snapshot.docs.slice(0, input.pageSize!).map((document) => {
    const data = document.data() as Issue;
    assertIdentity(data, input.tenantId, document.id, 'issue');
    return { id: document.id, data };
  });
  const trust = await verifiedWorkflowTrust(input.tenantId, 'issue', docs);
  const full = FULL_OPERATIONAL_READ_ROLES.has(auth.role);
  const issues = docs.map(({ data }) => projectIssue(data, full, trust.get(data.id) === true));
  return { success: true, issues, count: issues.length, truncated: snapshot.size > input.pageSize!, nextCursor: snapshot.size > input.pageSize! ? docs.at(-1)?.id ?? null : null };
});

export const listTenantTasks = onCall(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const input = normalizePageInput(request.data, ['status', 'parentEntityType', 'parentEntityId', 'assigneeId']);
  assertReadFilter(input.status, READ_TASK_STATUSES, 'status');
  assertReadFilter(input.parentEntityType, READ_TASK_PARENT_TYPES, 'parentEntityType');
  const auth = await requireTenantMember(request, input.tenantId);
  let query: FirebaseFirestore.Query = db.collection(`tenants/${input.tenantId}/tasks`).orderBy(FieldPath.documentId());
  if (input.status) query = query.where('status', '==', input.status);
  if (input.parentEntityType) query = query.where('parentEntityType', '==', input.parentEntityType);
  if (input.parentEntityId) query = query.where('parentEntityId', '==', input.parentEntityId);
  if (auth.role === 'contributor') query = query.where('assigneeId', '==', auth.userId);
  else if (input.assigneeId) query = query.where('assigneeId', '==', input.assigneeId);
  if (input.cursor) query = query.startAfter(input.cursor);
  const snapshot = await query.limit(input.pageSize! + 1).get();
  const docs = snapshot.docs.slice(0, input.pageSize!).map((document) => {
    const data = document.data() as Task;
    assertIdentity(data, input.tenantId, document.id, 'task');
    return { id: document.id, data };
  });
  const trust = await verifiedWorkflowTrust(input.tenantId, 'task', docs);
  const full = FULL_OPERATIONAL_READ_ROLES.has(auth.role) || auth.role === 'contributor';
  const tasks = docs.map(({ data }) => projectTask(data, full, trust.get(data.id) === true));
  return { success: true, tasks, count: tasks.length, truncated: snapshot.size > input.pageSize!, nextCursor: snapshot.size > input.pageSize! ? docs.at(-1)?.id ?? null : null };
});

export const listTenantOperationalAssignees = onCall(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  if (!isPlainObject(request.data)) {
    throw new HttpsError('invalid-argument', 'Assignee list input must be an object.');
  }
  const unknown = Object.keys(request.data).filter((key) => key !== 'tenantId');
  if (unknown.length) {
    throw new HttpsError(
      'invalid-argument',
      `Assignee list input contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
  const tenantId = normalizeOperationalDocumentId(request.data.tenantId, 'tenantId');
  const auth = await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
    'contributor',
  ]);
  const memberships = await db
    .collection(`tenants/${tenantId}/memberships`)
    .where('status', '==', 'active')
    .limit(501)
    .get();
  if (memberships.size > 500) {
    throw new HttpsError(
      'resource-exhausted',
      'The active member directory exceeds the governed assignee-list limit.'
    );
  }
  const validMemberships = memberships.docs.map((document) => {
    const membership = document.data();
    if (
      membership.id !== document.id ||
      membership.userId !== document.id ||
      membership.tenantId !== tenantId ||
      membership.status !== 'active' ||
      typeof membership.role !== 'string' ||
      !isValidUserRole(membership.role)
    ) {
      throw new HttpsError(
        'failed-precondition',
        'An active membership has invalid identity metadata.'
      );
    }
    return { document, membership };
  }).filter(
    ({ document, membership }) =>
      OPERATIONAL_WORK_ASSIGNEE_ROLES.has(membership.role) &&
      (auth.role !== 'contributor' || document.id === auth.userId)
  );
  const profiles = validMemberships.length
    ? await db.getAll(
        ...validMemberships.map(({ document }) => db.doc(`users/${document.id}`))
      )
    : [];
  const assignees = validMemberships
    .map(({ document, membership }, index) => {
      const profile = profiles[index]?.data();
      return {
        userId: document.id,
        displayName:
          profile?.id === document.id &&
          typeof profile?.displayName === 'string' &&
          profile.displayName.trim().length > 0
            ? profile.displayName.trim().slice(0, 200)
            : null,
        role: membership.role,
        department:
          typeof membership.department === 'string'
            ? membership.department.slice(0, 200)
            : '',
        title:
          typeof membership.title === 'string'
            ? membership.title.slice(0, 200)
            : '',
      };
    })
    .sort((left, right) =>
      (left.displayName || left.title || left.userId).localeCompare(
        right.displayName || right.title || right.userId
      )
    );
  return { success: true, assignees, count: assignees.length };
});

export const getProcessorRiskSummary = onCall(AUTHORITATIVE_CALLABLE_OPTIONS, async (request) => {
  const input = normalizePageInput(request.data, ['processorProfileId']);
  if (!input.processorProfileId) throw new HttpsError('invalid-argument', 'processorProfileId is required.');
  await requireTenantMember(request, input.tenantId);
  const profileSnapshot = await db.doc(`tenants/${input.tenantId}/processor_profiles/${input.processorProfileId}`).get();
  if (!profileSnapshot.exists) throw new HttpsError('not-found', 'Processor profile does not exist.');
  const profile = profileSnapshot.data() as ProcessorProfile;
  if (profile.id !== input.processorProfileId || profile.tenantId !== input.tenantId) throw new HttpsError('failed-precondition', 'Processor profile identity metadata is invalid.');
  const [transferSnapshot, evidenceSnapshot] = await Promise.all([
    db.collection(`tenants/${input.tenantId}/transfer_arrangements`).where('processorProfileId', '==', profile.id).limit(MAX_PROCESSOR_CONTEXT_RECORDS + 1).get(),
    db.collection(`tenants/${input.tenantId}/evidence`).where('processorProfileIds', 'array-contains', profile.id).limit(MAX_PROCESSOR_CONTEXT_RECORDS + 1).get(),
  ]);
  if (transferSnapshot.size > MAX_PROCESSOR_CONTEXT_RECORDS || evidenceSnapshot.size > MAX_PROCESSOR_CONTEXT_RECORDS) throw new HttpsError('resource-exhausted', 'Processor risk context exceeds the governed summary limit.');
  const transfers = transferSnapshot.docs.map((document) => document.data() as TransferArrangement);
  for (let index = 0; index < transfers.length; index += 1) {
    const transfer = transfers[index]!;
    const document = transferSnapshot.docs[index]!;
    if (
      transfer.id !== document.id ||
      transfer.tenantId !== input.tenantId ||
      transfer.processorProfileId !== profile.id
    ) {
      throw new HttpsError(
        'failed-precondition',
        'A transfer arrangement in the processor context has invalid identity metadata.'
      );
    }
  }
  const explicitlyLinkedEvidenceIds = new Set<string>([
    ...(typeof profile.linkedDpaEvidenceId === 'string'
      ? [storedDocumentId(profile.linkedDpaEvidenceId, 'linkedDpaEvidenceId')]
      : []),
    ...transfers.flatMap((transfer) =>
      (transfer.linkedEvidenceIds ?? []).map((evidenceId, index) =>
        storedDocumentId(
          evidenceId,
          `transfer '${transfer.id}' linkedEvidenceIds[${index}]`
        )
      )
    ),
  ]);
  if (explicitlyLinkedEvidenceIds.size > MAX_PROCESSOR_CONTEXT_RECORDS) {
    throw new HttpsError(
      'resource-exhausted',
      'Processor evidence links exceed the governed summary limit.'
    );
  }
  const explicitlyLinkedEvidence = explicitlyLinkedEvidenceIds.size
    ? await db.getAll(
        ...[...explicitlyLinkedEvidenceIds].map((evidenceId) =>
          db.doc(`tenants/${input.tenantId}/evidence/${evidenceId}`)
        )
      )
    : [];
  const evidenceById = new Map<string, Evidence>();
  for (const document of [
    ...evidenceSnapshot.docs,
    ...explicitlyLinkedEvidence,
  ]) {
    if (!document.exists) continue;
    const record = document.data() as Evidence;
    if (record.id === document.id && record.tenantId === input.tenantId) {
      evidenceById.set(document.id, record);
    }
  }
  const evidence = verifiedEvidenceForProcessor(
    [...evidenceById.values()],
    profile.id,
    new Set(transfers.map((transfer) => transfer.id))
  );
  const verifiedEvidenceIds = new Set(evidence.map((record) => record.id));
  const assuredProfile: ProcessorProfile = {
    ...profile,
    dpaSigned: Boolean(
      profile.dpaSigned &&
        profile.linkedDpaEvidenceId &&
        verifiedEvidenceIds.has(profile.linkedDpaEvidenceId) &&
        evidenceById
          .get(profile.linkedDpaEvidenceId)
          ?.processorProfileIds?.includes(profile.id)
    ),
  };
  const assuredTransfers = transfers.map((transfer) => ({
    ...transfer,
    linkedEvidenceIds: (transfer.linkedEvidenceIds ?? []).filter((evidenceId) =>
      verifiedEvidenceIds.has(evidenceId) &&
      evidenceById
        .get(evidenceId)
        ?.transferArrangementIds?.includes(transfer.id)
    ),
  }));
  const summary = evaluateProcessorRiskFlags(assuredProfile, assuredTransfers, evidence);
  return { success: true, summary, evidenceAssurance: 'server_verified_objects_only' };
});

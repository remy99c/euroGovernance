import { HttpsError, onCall } from 'firebase-functions/v2/https';
import type { DocumentReference, Transaction } from 'firebase-admin/firestore';
import {
  Certification,
  CertificationType,
  CertificationStatus,
  CERTIFICATION_TYPE_METADATA,
  evaluateCertificationCompleteness,
  evaluateCertificationRiskFlags,
  Evidence,
} from '@eurogovernance/shared-types';
import { db } from '../lib/firebase.js';
import { requireTenantMember } from '../lib/auth-helpers.js';
import {
  AUTHORITATIVE_CALLABLE_OPTIONS,
  executeTenantCommand,
  stableTrustedValueHash,
  type TenantCommandEnvelope,
} from '../lib/command-boundary.js';
import {
  deriveTemporalCertificationStatus,
  normalizeArchiveCertificationPayload,
  normalizeCertificationFields,
  normalizeCertificationDocumentId,
  normalizeUpdateCertificationPayload,
  type NormalizedCertificationFields,
  type UpdateCertificationPayload,
} from '../lib/certification-validation.js';
import { loadCurrentCertificationArtifactVerification } from '../lib/certification-assurance-store.js';

export interface ListCertificationsInput {
  tenantId: string;
  certificationType?: CertificationType;
  status?: CertificationStatus;
}

export interface LinkEvidenceToCertificationInput {
  tenantId: string;
  certificationId: string;
  evidenceId: string;
}

const CERTIFICATION_VERSION_SCHEMA_VERSION = 1;

function isPlainInput(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function certificationVersionId(revision: number): string {
  return `r${String(revision).padStart(10, '0')}`;
}

function canonicalCertificationState(certification: Certification): Certification {
  return JSON.parse(JSON.stringify(certification)) as Certification;
}

function changedCertificationFields(
  before: Certification | null,
  after: Certification
): string[] {
  if (!before) return Object.keys(after).sort();
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  return [...keys]
    .filter((key) => JSON.stringify(before[key as keyof Certification]) !== JSON.stringify(after[key as keyof Certification]))
    .sort();
}

interface CertificationVersionAnchor {
  versionId: string;
  stateHash: string;
}

async function ensureCertificationVersionContinuity(
  transaction: Transaction,
  certificationRef: DocumentReference,
  certification: Certification,
  actor: { userId: string },
  commandId: string,
  recordedAt: string
): Promise<CertificationVersionAnchor> {
  const state = canonicalCertificationState(certification);
  const revision = certificationRevision(state);
  const versionId = certificationVersionId(revision);
  const stateHash = stableTrustedValueHash(state, 'previous certification state');
  const versionRef = certificationRef.collection('versions').doc(versionId);
  const versionSnapshot = await transaction.get(versionRef);

  if (!versionSnapshot.exists) {
    if (revision !== 0) {
      throw new HttpsError(
        'failed-precondition',
        'Certification history is incomplete. Repair the immutable version chain before mutation.'
      );
    }

    // Legacy records pre-date the command boundary. Capture their exact current
    // state as revision zero before the first governed mutation so the new chain
    // never pretends that the legacy provenance was independently verified.
    transaction.create(versionRef, {
      schemaVersion: CERTIFICATION_VERSION_SCHEMA_VERSION,
      id: versionId,
      tenantId: certification.tenantId,
      certificationId: certification.id,
      revision,
      state,
      stateHash,
      previousVersionId: null,
      previousStateHash: null,
      changedFields: Object.keys(state).sort(),
      commandId,
      provenance: 'legacy_baseline_captured_on_first_command',
      recordedBy: actor.userId,
      recordedAt,
    });
    return { versionId, stateHash };
  }

  const version = versionSnapshot.data();
  let storedStateHash: string;
  try {
    storedStateHash = stableTrustedValueHash(version?.state, 'stored certification version state');
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Certification history is invalid. Repair the immutable version chain before mutation.'
    );
  }
  if (
    version?.schemaVersion !== CERTIFICATION_VERSION_SCHEMA_VERSION ||
    version?.id !== versionId ||
    version?.tenantId !== certification.tenantId ||
    version?.certificationId !== certification.id ||
    version?.revision !== revision ||
    version?.stateHash !== stateHash ||
    storedStateHash !== stateHash
  ) {
    throw new HttpsError(
      'failed-precondition',
      'Certification state diverges from its immutable history. Repair the record before mutation.'
    );
  }

  return { versionId, stateHash };
}

function writeCertificationVersion(
  transaction: Transaction,
  certificationRef: DocumentReference,
  certification: Certification,
  previous: Certification | null,
  previousAnchor: CertificationVersionAnchor | null,
  actor: { userId: string },
  commandId: string,
  recordedAt: string
): { versionId: string; stateHash: string; changedFields: string[] } {
  const state = canonicalCertificationState(certification);
  const previousState = previous ? canonicalCertificationState(previous) : null;
  const revision = certificationRevision(state);
  const versionId = certificationVersionId(revision);
  const stateHash = stableTrustedValueHash(state, 'certification state');
  const changedFields = changedCertificationFields(previousState, state);
  const versionRef = certificationRef.collection('versions').doc(versionId);

  transaction.create(versionRef, {
    schemaVersion: CERTIFICATION_VERSION_SCHEMA_VERSION,
    id: versionId,
    tenantId: certification.tenantId,
    certificationId: certification.id,
    revision,
    state,
    stateHash,
    previousVersionId: previousAnchor?.versionId ?? null,
    previousStateHash: previousAnchor?.stateHash ?? null,
    changedFields,
    commandId,
    recordedBy: actor.userId,
    recordedAt,
  });

  return { versionId, stateHash, changedFields };
}

function certificationAuditSummary(
  certification: Certification,
  version: { versionId: string | null; stateHash: string; changedFields?: string[] }
): Record<string, unknown> {
  return {
    versionId: version.versionId,
    stateHash: version.stateHash,
    changedFields: version.changedFields ?? [],
    certificationName: certification.certificationName,
    certificationType: certification.certificationType,
    issuingBody: certification.issuingBody,
    certificateNumber: certification.certificateNumber,
    issueDate: certification.issueDate,
    expiryDate: certification.expiryDate,
    status: certification.status,
    continuousComplianceStatus: certification.continuousComplianceStatus,
    unresolvedFindingsCount: certification.unresolvedFindingsCount,
    revision: certificationRevision(certification),
  };
}

function certificationRevision(certification: Certification): number {
  const revision = certification.revision ?? 0;
  if (!Number.isSafeInteger(revision) || revision < 0) {
    throw new HttpsError(
      'failed-precondition',
      'Certification revision metadata is invalid and must be repaired before mutation.'
    );
  }
  return revision;
}

async function resolveCertificationRevision(
  transaction: Transaction,
  tenantId: string,
  certificationId: string
): Promise<number | null> {
  const reference = db.doc(`tenants/${tenantId}/certifications/${certificationId}`);
  const snapshot = await transaction.get(reference);
  if (!snapshot.exists) return null;
  const certification = snapshot.data() as Certification;
  if (certification.id !== certificationId || certification.tenantId !== tenantId) {
    throw new HttpsError(
      'failed-precondition',
      'Certification identity metadata does not match its authoritative path.'
    );
  }
  return certificationRevision(certification);
}

async function assertCertificationRelationshipsExist(
  transaction: Transaction,
  tenantId: string,
  fields: NormalizedCertificationFields
): Promise<void> {
  const references = [
    ...fields.frameworkIds.map((id) => ({
      label: `adopted framework '${id}'`,
      reference: db.doc(`tenants/${tenantId}/adopted_frameworks/${id}`),
    })),
    ...fields.linkedControlIds.map((id) => ({
      label: `control '${id}'`,
      reference: db.doc(`tenants/${tenantId}/controls/${id}`),
    })),
    ...fields.linkedVendorIds.map((id) => ({
      label: `vendor '${id}'`,
      reference: db.doc(`tenants/${tenantId}/vendors/${id}`),
    })),
    ...fields.linkedProcessorProfileIds.map((id) => ({
      label: `processor profile '${id}'`,
      reference: db.doc(`tenants/${tenantId}/processor_profiles/${id}`),
    })),
    ...fields.linkedSystemAssetIds.map((id) => ({
      label: `system asset '${id}'`,
      reference: db.doc(`tenants/${tenantId}/system_assets/${id}`),
    })),
  ];

  if (fields.linkedEvidenceIds.length > 0) {
    throw new HttpsError(
      'failed-precondition',
      'Evidence linking is unavailable until each Storage object can be server-verified.'
    );
  }

  if (references.length === 0) return;
  const snapshots = await transaction.getAll(...references.map(({ reference }) => reference));
  snapshots.forEach((snapshot, index) => {
    const relationship = references[index]!;
    if (!snapshot.exists) {
      throw new HttpsError(
        'failed-precondition',
        `Referenced ${relationship.label} does not exist in this tenant.`
      );
    }
    const related = snapshot.data();
    if (
      related?.id !== relationship.reference.id ||
      related?.tenantId !== tenantId
    ) {
      throw new HttpsError(
        'failed-precondition',
        `Referenced ${relationship.label} has invalid tenant or identity metadata.`
      );
    }
    if (['retired', 'archived', 'deleted', 'offboarded', 'terminated'].includes(related.status)) {
      throw new HttpsError(
        'failed-precondition',
        `Referenced ${relationship.label} is not active enough for a current assurance record.`
      );
    }
  });
}

export interface GetCertificationCompletenessInput {
  tenantId: string;
  certificationId: string;
}

/**
 * 1. Create Structured Certification Record
 */
export const createTenantCertification = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand(request, {
    commandName: 'certification.create',
    commandVersion: 1,
    validatePayload: normalizeCertificationFields,
    requireExpectedRevision: true,
    resolveCurrentRevision: async () => null,
    mutateInTransaction: async (context) => {
      const certRef = db.collection(`tenants/${context.tenantId}/certifications`).doc();
      await assertCertificationRelationshipsExist(
        context.transaction,
        context.tenantId,
        context.payload
      );
      const derivedStatus = deriveTemporalCertificationStatus(
        context.payload.status,
        context.payload.expiryDate,
        new Date(context.requestedAt)
      );
      if (Date.parse(context.payload.issueDate) > Date.parse(context.requestedAt)) {
        throw new HttpsError(
          'invalid-argument',
          'issueDate cannot be in the future.'
        );
      }
      if (
        derivedStatus !== context.payload.status &&
        ['under_audit', 'suspended', 'revoked'].includes(context.payload.status)
      ) {
        throw new HttpsError('invalid-argument', 'Certification status is inconsistent.');
      }
      if (
        ['under_audit', 'suspended', 'revoked'].includes(derivedStatus) &&
        (!context.payload.statusRationale || context.payload.statusRationale.length < 10)
      ) {
        throw new HttpsError(
          'invalid-argument',
          'A status rationale of at least 10 characters is required for exceptional states.'
        );
      }

      const now = context.requestedAt;
      const { statusRationale, ...fields } = context.payload;
      const certification: Certification = {
        id: certRef.id,
        tenantId: context.tenantId,
        ...fields,
        status: derivedStatus,
        lastStatusRationale: statusRationale,
        revision: 1,
        archivedAt: null,
        archivedBy: null,
        archiveReason: null,
        ownerId: context.actor.userId,
        createdBy: context.actor.userId,
        updatedBy: context.actor.userId,
        createdAt: now,
        updatedAt: now,
      };
      context.transaction.create(certRef, certification);
      const version = writeCertificationVersion(
        context.transaction,
        certRef,
        certification,
        null,
        null,
        context.actor,
        context.commandId,
        context.requestedAt
      );

      return {
        result: {
          success: true,
          certificationId: certRef.id,
          revision: certification.revision!,
        },
        audit: {
          entityType: 'certification',
          entityId: certRef.id,
          action: 'create',
          beforeSummary: null,
          afterSummary: certificationAuditSummary(certification, version),
          workflowContext: 'certification_created',
        },
      };
    },
  })
);

/**
 * 2. Update Structured Certification Record
 */
export const updateTenantCertification = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand<UpdateCertificationPayload, {
    success: true;
    certificationId: string;
    revision: number;
  }>(request, {
    commandName: 'certification.update',
    commandVersion: 1,
    validatePayload: normalizeUpdateCertificationPayload,
    requireExpectedRevision: true,
    resolveCurrentRevision: (context) =>
      resolveCertificationRevision(
        context.transaction,
        context.tenantId,
        context.payload.certificationId
      ),
    mutateInTransaction: async (context) => {
      const certRef = db.doc(
        `tenants/${context.tenantId}/certifications/${context.payload.certificationId}`
      );
      const snapshot = await context.transaction.get(certRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Certification does not exist.');
      }
      const before = snapshot.data() as Certification;
      if (
        before.id !== context.payload.certificationId ||
        before.tenantId !== context.tenantId
      ) {
        throw new HttpsError('failed-precondition', 'Certification identity metadata is invalid.');
      }
      if (before.status === 'archived') {
        throw new HttpsError('failed-precondition', 'Archived certifications are immutable.');
      }

      await assertCertificationRelationshipsExist(
        context.transaction,
        context.tenantId,
        context.payload
      );
      const derivedStatus = deriveTemporalCertificationStatus(
        context.payload.status,
        context.payload.expiryDate,
        new Date(context.requestedAt)
      );
      if (Date.parse(context.payload.issueDate) > Date.parse(context.requestedAt)) {
        throw new HttpsError(
          'invalid-argument',
          'issueDate cannot be in the future.'
        );
      }
      const statusChanged = derivedStatus !== before.status;
      if (
        statusChanged &&
        (!context.payload.statusRationale || context.payload.statusRationale.length < 10)
      ) {
        throw new HttpsError(
          'invalid-argument',
          'A status rationale of at least 10 characters is required when status changes.'
        );
      }

      const { certificationId: _certificationId, statusRationale, ...fields } = context.payload;
      const after = canonicalCertificationState({
        ...before,
        ...fields,
        status: derivedStatus,
        lastStatusRationale: statusChanged
          ? statusRationale
          : before.lastStatusRationale ?? null,
        revision: certificationRevision(before) + 1,
        updatedBy: context.actor.userId,
        updatedAt: context.requestedAt,
      } as Certification);
      const previousAnchor = await ensureCertificationVersionContinuity(
        context.transaction,
        certRef,
        before,
        context.actor,
        context.commandId,
        context.requestedAt
      );
      context.transaction.update(certRef, after);
      const version = writeCertificationVersion(
        context.transaction,
        certRef,
        after,
        before,
        previousAnchor,
        context.actor,
        context.commandId,
        context.requestedAt
      );

      return {
        result: {
          success: true,
          certificationId: after.id,
          revision: after.revision!,
        },
        audit: {
          entityType: 'certification',
          entityId: after.id,
          action: statusChanged ? 'status_transition' : 'update',
          beforeSummary: certificationAuditSummary(before, {
            versionId: previousAnchor.versionId,
            stateHash: previousAnchor.stateHash,
          }),
          afterSummary: certificationAuditSummary(after, version),
          workflowContext: statusChanged
            ? 'certification_status_changed'
            : 'certification_updated',
        },
      };
    },
  })
);

/**
 * 3. Delete Structured Certification Record
 */
export const deleteTenantCertification = onCall<TenantCommandEnvelope>(AUTHORITATIVE_CALLABLE_OPTIONS, (request) =>
  executeTenantCommand(request, {
    commandName: 'certification.archive',
    commandVersion: 1,
    validatePayload: normalizeArchiveCertificationPayload,
    requireExpectedRevision: true,
    resolveCurrentRevision: (context) =>
      resolveCertificationRevision(
        context.transaction,
        context.tenantId,
        context.payload.certificationId
      ),
    mutateInTransaction: async (context) => {
      const certRef = db.doc(
        `tenants/${context.tenantId}/certifications/${context.payload.certificationId}`
      );
      const snapshot = await context.transaction.get(certRef);
      if (!snapshot.exists) {
        throw new HttpsError('not-found', 'Certification does not exist.');
      }
      const before = snapshot.data() as Certification;
      if (before.id !== certRef.id || before.tenantId !== context.tenantId) {
        throw new HttpsError('failed-precondition', 'Certification identity metadata is invalid.');
      }
      if (before.status === 'archived') {
        throw new HttpsError('failed-precondition', 'Certification is already archived.');
      }

      const revision = certificationRevision(before) + 1;
      const archivePatch = {
        status: 'archived' as const,
        archiveReason: context.payload.archiveReason,
        archivedAt: context.requestedAt,
        archivedBy: context.actor.userId,
        revision,
        updatedAt: context.requestedAt,
        updatedBy: context.actor.userId,
      };
      const after = canonicalCertificationState({ ...before, ...archivePatch });
      const previousAnchor = await ensureCertificationVersionContinuity(
        context.transaction,
        certRef,
        before,
        context.actor,
        context.commandId,
        context.requestedAt
      );
      context.transaction.update(certRef, archivePatch);
      const version = writeCertificationVersion(
        context.transaction,
        certRef,
        after,
        before,
        previousAnchor,
        context.actor,
        context.commandId,
        context.requestedAt
      );

      return {
        result: {
          success: true,
          certificationId: certRef.id,
          archived: true,
          revision,
        },
        audit: {
          entityType: 'certification',
          entityId: certRef.id,
          action: 'status_transition',
          beforeSummary: certificationAuditSummary(before, {
            versionId: previousAnchor.versionId,
            stateHash: previousAnchor.stateHash,
          }),
          afterSummary: certificationAuditSummary(after, version),
          workflowContext: 'certification_archived',
        },
      };
    },
  })
);

/**
 * 4. List Tenant Certifications
 */
export const listTenantCertifications = onCall<ListCertificationsInput>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainInput(input)) {
    throw new HttpsError('invalid-argument', 'Certification list input must be an object.');
  }
  const unknownFields = Object.keys(input).filter(
    (field) => !['tenantId', 'certificationType', 'status'].includes(field)
  );
  if (unknownFields.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `Certification list input contains unsupported field(s): ${unknownFields.join(', ')}.`
    );
  }
  const tenantId = normalizeCertificationDocumentId(input.tenantId, 'tenantId');
  const certificationType = input.certificationType as CertificationType | undefined;
  const status = input.status as CertificationStatus | undefined;

  await requireTenantMember(request, tenantId);

  if (
    certificationType !== undefined &&
    !Object.prototype.hasOwnProperty.call(CERTIFICATION_TYPE_METADATA, certificationType)
  ) {
    throw new HttpsError('invalid-argument', 'certificationType is unsupported.');
  }
  const allowedStatuses = new Set<CertificationStatus>([
    'active_valid',
    'expiring_soon',
    'expired',
    'under_audit',
    'suspended',
    'revoked',
    'archived',
  ]);
  if (status !== undefined && !allowedStatuses.has(status)) {
    throw new HttpsError('invalid-argument', 'status is unsupported.');
  }

  let query: FirebaseFirestore.Query = db.collection(`tenants/${tenantId}/certifications`);

  if (certificationType) {
    query = query.where('certificationType', '==', certificationType);
  }
  if (status) {
    query = query.where('status', '==', status);
  }

  const snap = await query.limit(501).get();
  const records = snap.docs.slice(0, 500).map((document) => ({
    documentId: document.id,
    certification: document.data() as Certification,
  }));
  const artifactVerification = await loadCurrentCertificationArtifactVerification(
    tenantId,
    records
  );
  const asOfDate = new Date();
  const certifications = records.map(({ documentId, certification }) => {
    const identityValid =
      certification.id === documentId && certification.tenantId === tenantId;
    const currentArtifactVerified =
      identityValid && artifactVerification.get(documentId) === true;
    const recordedStatus = allowedStatuses.has(certification.status)
      ? certification.status
      : 'invalid_recorded_status';
    const temporalStatus =
      recordedStatus === 'invalid_recorded_status'
        ? 'invalid_recorded_status'
        : deriveTemporalCertificationStatus(
            recordedStatus,
            certification.expiryDate,
            asOfDate
          );
    const assuranceStatus = currentArtifactVerified
      ? temporalStatus
      : 'legacy_unverified';
    return {
      ...certification,
      id: documentId,
      tenantId,
      recordedStatus,
      assuranceStatus,
      currentArtifactVerified,
    };
  });

  return { certifications, truncated: snap.size > 500 };
});

/**
 * 5. Link Evidence to Certification
 */
export const linkEvidenceToCertification = onCall<LinkEvidenceToCertificationInput>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainInput(input)) {
    throw new HttpsError('invalid-argument', 'Evidence-link input must be an object.');
  }
  const unknownFields = Object.keys(input).filter(
    (field) => !['tenantId', 'certificationId', 'evidenceId'].includes(field)
  );
  if (unknownFields.length > 0) {
    throw new HttpsError('invalid-argument', 'Evidence-link input contains unsupported fields.');
  }
  const tenantId = normalizeCertificationDocumentId(input.tenantId, 'tenantId');
  normalizeCertificationDocumentId(input.certificationId, 'certificationId');
  normalizeCertificationDocumentId(input.evidenceId, 'evidenceId');

  await requireTenantMember(request, tenantId, [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ]);

  throw new HttpsError(
    'failed-precondition',
    'Certification evidence linking is unavailable until the evidence object is server-verified.'
  );
});

/**
 * 6. Get Certification Completeness & Gap Summary
 */
export const getCertificationCompletenessSummary = onCall<GetCertificationCompletenessInput>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainInput(input)) {
    throw new HttpsError('invalid-argument', 'Completeness input must be an object.');
  }
  const unknownFields = Object.keys(input).filter(
    (field) => !['tenantId', 'certificationId'].includes(field)
  );
  if (unknownFields.length > 0) {
    throw new HttpsError('invalid-argument', 'Completeness input contains unsupported fields.');
  }
  const tenantId = normalizeCertificationDocumentId(input.tenantId, 'tenantId');
  const certificationId = normalizeCertificationDocumentId(
    input.certificationId,
    'certificationId'
  );

  await requireTenantMember(request, tenantId);

  const certSnap = await db.doc(`tenants/${tenantId}/certifications/${certificationId}`).get();
  if (!certSnap.exists) {
    throw new HttpsError('not-found', `Certification "${certificationId}" not found.`);
  }

  const cert = certSnap.data() as Certification;
  if (cert.tenantId !== tenantId || cert.id !== certificationId) {
    throw new HttpsError('failed-precondition', 'Certification identity metadata is invalid.');
  }
  if (!Array.isArray(cert.linkedEvidenceIds) || cert.linkedEvidenceIds.length > 100) {
    throw new HttpsError(
      'failed-precondition',
      'Certification evidence references require data repair before evaluation.'
    );
  }
  let linkedEvidenceIds: string[];
  try {
    linkedEvidenceIds = cert.linkedEvidenceIds.map((evidenceId, index) =>
      normalizeCertificationDocumentId(evidenceId, `linkedEvidenceIds[${index}]`)
    );
    if (new Set(linkedEvidenceIds).size !== linkedEvidenceIds.length) {
      throw new Error('Duplicate evidence ID.');
    }
  } catch {
    throw new HttpsError(
      'failed-precondition',
      'Certification evidence references require data repair before evaluation.'
    );
  }
  const evidenceSnapshots = linkedEvidenceIds.length
    ? await db.getAll(
        ...linkedEvidenceIds.map((evidenceId) =>
          db.doc(`tenants/${tenantId}/evidence/${evidenceId}`)
        )
      )
    : [];
  const evidenceDocs = evidenceSnapshots
    .filter((snapshot) => snapshot.exists)
    .map((snapshot) => snapshot.data() as Evidence);

  const baseCompleteness = evaluateCertificationCompleteness(cert, evidenceDocs);
  const artifactVerification = await loadCurrentCertificationArtifactVerification(
    tenantId,
    [{ documentId: certificationId, certification: cert }]
  );
  const currentArtifactVerified = artifactVerification.get(certificationId) === true;
  const completeness = currentArtifactVerified
    ? baseCompleteness
    : {
        ...baseCompleteness,
        isComplete: false,
        totalRequired: baseCompleteness.totalRequired + 1,
        missingCount: baseCompleteness.missingCount + 1,
        gaps: [
          ...baseCompleteness.gaps,
          {
            code: 'CERTIFICATION_RECORD_CHAIN_UNVERIFIED',
            description:
              'The current certification record does not match a valid immutable version, command receipt, and audit anchor.',
            severity: 'high' as const,
            suggestedAction:
              'Reconcile or migrate the record before using it as assurance.',
          },
        ],
      };

  return { completeness, currentArtifactVerified };
});

/**
 * 7. Get Tenant Certification Risk Dashboard
 */
export const getTenantCertificationRiskDashboard = onCall<{ tenantId: string }>(async (request) => {
  const input = request.data as unknown;
  if (!isPlainInput(input) || Object.keys(input).some((field) => field !== 'tenantId')) {
    throw new HttpsError('invalid-argument', 'Risk-dashboard input must contain only tenantId.');
  }
  const tenantId = normalizeCertificationDocumentId(input.tenantId, 'tenantId');

  await requireTenantMember(request, tenantId);

  const [certSnap, evSnap] = await Promise.all([
    db.collection(`tenants/${tenantId}/certifications`).limit(501).get(),
    db.collection(`tenants/${tenantId}/evidence`).limit(501).get(),
  ]);

  if (certSnap.size > 500 || evSnap.size > 500) {
    throw new HttpsError(
      'resource-exhausted',
      'Certification risk evaluation requires a paged materialization for registers over 500 records.'
    );
  }

  const records = certSnap.docs.map((document) => ({
    documentId: document.id,
    certification: document.data() as Certification,
  }));
  const certifications = records.map(({ certification }) => certification);
  const evidenceDocs = evSnap.docs.map((d) => d.data() as Evidence);
  const artifactVerification = await loadCurrentCertificationArtifactVerification(
    tenantId,
    records
  );
  const baseRiskSummary = evaluateCertificationRiskFlags(certifications, evidenceDocs);
  const verifiedAssuranceCount = records.filter(({ documentId, certification }) => {
    const completeness = evaluateCertificationCompleteness(certification, evidenceDocs);
    return (
      artifactVerification.get(documentId) === true &&
      completeness.isComplete &&
      completeness.hasValidCertificateDocument &&
      (certification.status === 'active_valid' ||
        certification.status === 'expiring_soon') &&
      !completeness.isExpired
    );
  }).length;
  const unverifiedArtifactFlags = records.flatMap(({ documentId, certification }) =>
    artifactVerification.get(documentId) === true
      ? []
      : [{
          id: `certification_record_chain_unverified_${documentId}`,
          certificationId: documentId,
          certificationName:
            typeof certification.certificationName === 'string'
              ? certification.certificationName
              : documentId,
          ruleCode: 'CERTIFICATION_RECORD_CHAIN_UNVERIFIED',
          severity: 'high' as const,
          title: 'Certification record chain is unverified',
          description:
            'The current record does not match a valid immutable version, command receipt, and audit anchor.',
          suggestedTreatment:
            'Reconcile or migrate the record before using it as assurance.',
          inherentScore: 16,
          isActionable: true,
        }]
  );
  const riskSummary = {
    ...baseRiskSummary,
    activeValidCount: verifiedAssuranceCount,
    verifiedAssuranceCount,
    invalidCurrentArtifactCount: unverifiedArtifactFlags.length,
    flags: [...baseRiskSummary.flags, ...unverifiedArtifactFlags],
    overallAssuranceRiskLevel:
      unverifiedArtifactFlags.length > 0 &&
      (baseRiskSummary.overallAssuranceRiskLevel === 'low' ||
        baseRiskSummary.overallAssuranceRiskLevel === 'medium')
        ? 'high'
        : baseRiskSummary.overallAssuranceRiskLevel,
  };

  return { riskSummary };
});

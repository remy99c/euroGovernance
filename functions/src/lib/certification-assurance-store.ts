import type { Certification } from '@eurogovernance/shared-types';
import { db } from './firebase.js';
import { isCurrentCertificationArtifactVerified } from './certification-assurance.js';

function safeDocumentId(value: unknown): string | null {
  return typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value.trim() === value &&
    !value.includes('/')
    ? value
    : null;
}

/**
 * Loads and verifies the immutable assurance artifacts for a bounded set of
 * certification records. Invalid or legacy records remain in the returned map
 * with `false`; callers must never infer assurance from mutable state fields.
 */
export async function loadCurrentCertificationArtifactVerification(
  tenantId: string,
  records: Array<{ documentId: string; certification: Certification }>
): Promise<Map<string, boolean>> {
  const tenantRef = db.collection('tenants').doc(tenantId);
  const verified = new Map(records.map(({ documentId }) => [documentId, false]));
  const candidates = records.flatMap(({ documentId, certification }) => {
    const revision = certification.revision;
    return Number.isSafeInteger(revision) && (revision as number) >= 1
      ? [{
          documentId,
          certification,
          versionId: `r${String(revision).padStart(10, '0')}`,
        }]
      : [];
  });
  if (candidates.length === 0) return verified;

  const currentSnapshots = await db.getAll(
    ...candidates.map(({ documentId, versionId }) =>
      tenantRef.collection('certifications').doc(documentId).collection('versions').doc(versionId)
    )
  );
  const currentVersions = new Map(
    currentSnapshots.map((snapshot) => [
      `${snapshot.ref.parent.parent?.id ?? ''}:${snapshot.id}`,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );
  const commandIds = [...new Set(currentSnapshots.flatMap((snapshot) => {
    const commandId = safeDocumentId(snapshot.data()?.commandId);
    return commandId ? [commandId] : [];
  }))];
  const receiptSnapshots = commandIds.length
    ? await db.getAll(
        ...commandIds.map((commandId) =>
          tenantRef.collection('command_receipts').doc(commandId)
        )
      )
    : [];
  const receipts = new Map(
    receiptSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );
  const auditIds = [...new Set(receiptSnapshots.flatMap((snapshot) => {
    const auditId = safeDocumentId(snapshot.data()?.auditLogId);
    return auditId ? [auditId] : [];
  }))];
  const auditSnapshots = auditIds.length
    ? await db.getAll(
        ...auditIds.map((auditId) => tenantRef.collection('audit_logs').doc(auditId))
      )
    : [];
  const audits = new Map(
    auditSnapshots.map((snapshot) => [
      snapshot.id,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  const previousReferences = candidates.flatMap(({ documentId, versionId }) => {
    const current = currentVersions.get(`${documentId}:${versionId}`);
    const previousVersionId = current?.previousVersionId;
    return typeof previousVersionId === 'string' && /^r[0-9]{10}$/u.test(previousVersionId)
      ? [{ documentId, versionId: previousVersionId }]
      : [];
  });
  const previousSnapshots = previousReferences.length
    ? await db.getAll(
        ...previousReferences.map(({ documentId, versionId }) =>
          tenantRef.collection('certifications').doc(documentId).collection('versions').doc(versionId)
        )
      )
    : [];
  const previousVersions = new Map(
    previousSnapshots.map((snapshot) => [
      `${snapshot.ref.parent.parent?.id ?? ''}:${snapshot.id}`,
      snapshot.exists ? snapshot.data() : undefined,
    ])
  );

  candidates.forEach(({ documentId, certification, versionId }) => {
    const currentVersion = currentVersions.get(`${documentId}:${versionId}`);
    const commandId = safeDocumentId(currentVersion?.commandId);
    const receipt = commandId ? receipts.get(commandId) : undefined;
    const auditId = safeDocumentId(receipt?.auditLogId);
    const previousVersionId =
      typeof currentVersion?.previousVersionId === 'string'
        ? currentVersion.previousVersionId
        : null;
    verified.set(
      documentId,
      isCurrentCertificationArtifactVerified({
        tenantId,
        certificationId: documentId,
        certification,
        currentVersionId: versionId,
        currentVersion,
        previousVersionId,
        previousVersion: previousVersionId
          ? previousVersions.get(`${documentId}:${previousVersionId}`)
          : null,
        commandId: commandId ?? '',
        receipt,
        auditId: auditId ?? '',
        audit: auditId ? audits.get(auditId) : undefined,
      })
    );
  });
  return verified;
}

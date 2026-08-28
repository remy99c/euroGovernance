import {
  isCurrentCertificationArtifactVerified,
  type CertificationArtifactBundle,
} from '../../functions/src/lib/certification-assurance.js';
import {
  commandJsonByteLength,
  serializeTrustedCommandJson,
  stableTrustedValueHash,
} from '../../functions/src/lib/command-boundary-values.js';

const COMMAND_ID = '550e8400-e29b-41d4-a716-446655440000';
const AUDIT_ID = 'audit_certification_create_01';
const RECORDED_AT = '2026-08-26T10:00:00.000Z';

function validBundle(): CertificationArtifactBundle {
  const certification = {
    id: 'cert_01',
    tenantId: 'tenant_01',
    revision: 1,
    certificationName: 'ISO 27001 Certificate',
    certificationType: 'iso_27001',
    issuingBody: 'Accredited Registrar',
    certificateNumber: 'CERT-001',
    scopeDescription: 'Information security management system',
    applicableStandardVersion: 'ISO/IEC 27001:2022',
    issueDate: '2026-01-01T00:00:00.000Z',
    expiryDate: '2029-01-01T00:00:00.000Z',
    status: 'active_valid',
    surveillanceAuditDueDate: null,
    leadAuditorName: null,
    leadAuditorContact: null,
    frameworkIds: ['iso_27001'],
    linkedControlIds: [],
    linkedEvidenceIds: ['evidence_01'],
    linkedVendorIds: [],
    linkedProcessorProfileIds: [],
    linkedSystemAssetIds: [],
    continuousComplianceStatus: 'not_assessed',
    unresolvedFindingsCount: 0,
    notes: null,
    archivedAt: null,
    archivedBy: null,
    archiveReason: null,
    ownerId: 'manager_01',
    createdBy: 'manager_01',
    updatedBy: 'manager_01',
    createdAt: RECORDED_AT,
    updatedAt: RECORDED_AT,
  };
  const stateHash = stableTrustedValueHash(certification, 'test certification');
  const currentVersion = {
    schemaVersion: 1,
    id: 'r0000000001',
    tenantId: 'tenant_01',
    certificationId: 'cert_01',
    revision: 1,
    state: certification,
    stateHash,
    previousVersionId: null,
    previousStateHash: null,
    changedFields: Object.keys(certification).sort(),
    commandId: COMMAND_ID,
    recordedBy: 'manager_01',
    recordedAt: RECORDED_AT,
  };
  const result = {
    success: true,
    certificationId: 'cert_01',
    revision: 1,
  };
  const serializedResult = serializeTrustedCommandJson(result, 'test result');
  const workflowContext =
    `command:ev1:certification.create:cv1:${COMMAND_ID} | certification_created`;
  const receipt = {
    schemaVersion: 2,
    envelopeVersion: 1,
    commandVersion: 1,
    id: COMMAND_ID,
    commandId: COMMAND_ID,
    tenantId: 'tenant_01',
    commandName: 'certification.create',
    actorId: 'manager_01',
    actorRole: 'compliance_manager',
    payloadHashVersion: 'sha256-canonical-json-v1',
    payloadHash: 'a'.repeat(64),
    payloadByteLength: 100,
    expectedRevisionWasProvided: true,
    expectedRevision: null,
    status: 'completed',
    result,
    resultHash: stableTrustedValueHash(result, 'test result'),
    resultByteLength: commandJsonByteLength(serializedResult),
    entityType: 'certification',
    entityId: 'cert_01',
    auditAction: 'create',
    auditLogId: AUDIT_ID,
    auditWorkflowContext: workflowContext,
    outboxEventIds: [],
    committedAt: RECORDED_AT,
  };
  const audit = {
    id: AUDIT_ID,
    tenantId: 'tenant_01',
    actorId: 'manager_01',
    actorEmail: 'manager@example.test',
    actorRole: 'compliance_manager',
    actorType: 'tenant_user',
    entityType: 'certification',
    entityId: 'cert_01',
    action: 'create',
    source: 'cloud_function',
    workflowContext,
    beforeSummary: null,
    afterSummary: {
      versionId: 'r0000000001',
      stateHash,
    },
    timestamp: RECORDED_AT,
  };
  return {
    tenantId: 'tenant_01',
    certificationId: 'cert_01',
    certification,
    currentVersionId: 'r0000000001',
    currentVersion,
    previousVersionId: null,
    previousVersion: null,
    commandId: COMMAND_ID,
    receipt,
    auditId: AUDIT_ID,
    audit,
  };
}

describe('Certification assurance artifact verification', () => {
  test('accepts an exact current state, version, receipt, and audit chain', () => {
    expect(isCurrentCertificationArtifactVerified(validBundle())).toBe(true);
  });

  test('fails closed for mutable-state, protocol-version, and audit-anchor divergence', () => {
    const changedState = validBundle();
    changedState.certification = {
      ...(changedState.certification as Record<string, unknown>),
      certificationName: 'Forged certificate name',
    };
    expect(isCurrentCertificationArtifactVerified(changedState)).toBe(false);

    const oldReceiptProtocol = validBundle();
    oldReceiptProtocol.receipt = {
      ...(oldReceiptProtocol.receipt as Record<string, unknown>),
      schemaVersion: 1,
    };
    expect(isCurrentCertificationArtifactVerified(oldReceiptProtocol)).toBe(false);

    const changedAudit = validBundle();
    changedAudit.audit = {
      ...(changedAudit.audit as Record<string, unknown>),
      workflowContext: `command:certification.create:${COMMAND_ID} | certification_created`,
    };
    expect(isCurrentCertificationArtifactVerified(changedAudit)).toBe(false);
  });
});

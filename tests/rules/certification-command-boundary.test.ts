import { readFileSync } from 'node:fs';
import { jest } from '@jest/globals';
import { rolesForTenantAction } from '../../functions/src/lib/action-permissions.js';
import { isCertificationEvidenceRuntimeVerified } from '../../packages/shared-types/src/certifications.js';

jest.unstable_mockModule('firebase-functions/v2/https', () => ({
  HttpsError: class HttpsError extends Error {
    constructor(readonly code: string, message: string) {
      super(message);
    }
  },
}));

const {
  deriveTemporalCertificationStatus,
  normalizeArchiveCertificationPayload,
  normalizeCertificationFields,
  normalizeUpdateCertificationPayload,
} = await import('../../functions/src/lib/certification-validation.js');

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

const validCertification = {
  certificationName: ' ISO/IEC 27001 Certificate ',
  certificationType: 'iso_27001',
  issuingBody: ' Accredited Registrar ',
  certificateNumber: ' CERT-2026-001 ',
  scopeDescription: 'Production platform',
  scopeDetails: {
    sites: ['Amsterdam'],
    products: ['euroGovernance'],
    cloudEnvironments: ['EU production'],
    organizationalUnits: ['Engineering'],
  },
  applicableStandardVersion: 'ISO/IEC 27001:2022',
  issueDate: '2026-01-01',
  expiryDate: '2028-12-31',
  status: 'active_valid',
  statusRationale: null,
  surveillanceAuditDueDate: '2027-01-01',
  leadAuditorName: 'Auditor One',
  leadAuditorContact: 'auditor@example.com',
  frameworkIds: [],
  linkedControlIds: [],
  linkedEvidenceIds: [],
  linkedVendorIds: [],
  linkedProcessorProfileIds: [],
  linkedSystemAssetIds: [],
  continuousComplianceStatus: 'not_assessed',
  unresolvedFindingsCount: 0,
  notes: null,
};

describe('Certification audited command contract', () => {
  test('strict normalization bounds and canonicalizes certification input', () => {
    const normalized = normalizeCertificationFields(validCertification);
    expect(normalized.certificationName).toBe('ISO/IEC 27001 Certificate');
    expect(normalized.issuingBody).toBe('Accredited Registrar');
    expect(normalized.issueDate).toBe('2026-01-01T00:00:00.000Z');
    expect(normalized.expiryDate).toBe('2028-12-31T00:00:00.000Z');

    expect(() =>
      normalizeCertificationFields({ ...validCertification, actorRole: 'tenant_admin' })
    ).toThrow('unsupported field');
    expect(() =>
      normalizeCertificationFields({ ...validCertification, certificationType: 'fabricated' })
    ).toThrow('unsupported value');
    expect(() =>
      normalizeCertificationFields({
        ...validCertification,
        expiryDate: '2025-01-01',
      })
    ).toThrow('later than issueDate');
    expect(() =>
      normalizeCertificationFields({
        ...validCertification,
        frameworkIds: ['iso_27001', 'iso_27001'],
      })
    ).toThrow('duplicate');
    expect(() =>
      normalizeCertificationFields({
        ...validCertification,
        continuousComplianceStatus: 'compliant',
        unresolvedFindingsCount: 1,
      })
    ).toThrow('cannot declare unresolved findings');
    expect(() =>
      normalizeCertificationFields({
        ...validCertification,
        continuousComplianceStatus: 'compliant',
      })
    ).toThrow('server-verified');
  });

  test('update and archive payloads require bounded authoritative identifiers and rationale', () => {
    const update = normalizeUpdateCertificationPayload({
      certificationId: 'cert_001',
      ...validCertification,
    });
    expect(update.certificationId).toBe('cert_001');
    expect(() =>
      normalizeUpdateCertificationPayload({ certificationId: '../escape', ...validCertification })
    ).toThrow('valid document identifier');
    expect(() =>
      normalizeArchiveCertificationPayload({
        certificationId: 'cert_001',
        archiveReason: 'short',
      })
    ).toThrow('10-2000');
  });

  test('date-derived lifecycle status cannot be falsely declared active', () => {
    expect(
      deriveTemporalCertificationStatus(
        'active_valid',
        '2025-01-01T00:00:00.000Z',
        new Date('2026-01-01T00:00:00.000Z')
      )
    ).toBe('expired');
    expect(
      deriveTemporalCertificationStatus(
        'active_valid',
        '2026-02-01T00:00:00.000Z',
        new Date('2026-01-01T00:00:00.000Z')
      )
    ).toBe('expiring_soon');
    expect(
      deriveTemporalCertificationStatus(
        'suspended',
        '2028-01-01T00:00:00.000Z',
        new Date('2026-01-01T00:00:00.000Z')
      )
    ).toBe('suspended');
  });

  test('evidence assurance requires a current server-verified Storage object generation', () => {
    const certification = {
      id: 'cert_001',
      tenantId: 'tenant_001',
      linkedEvidenceIds: ['evidence_001'],
    } as Parameters<typeof isCertificationEvidenceRuntimeVerified>[1];
    const evidence = {
      id: 'evidence_001',
      tenantId: 'tenant_001',
      category: 'iso_certificate',
      status: 'valid',
      storagePath: 'tenants/tenant_001/evidence/evidence_001/certificate.pdf',
      currentVersion: 1,
      fileSizeBytes: 4_096,
      fileHashSha256: 'a'.repeat(64),
      mimeType: 'application/pdf',
      reviewedBy: 'reviewer_001',
      reviewedAt: '2026-08-25T10:00:00.000Z',
      reviewDueDate: '2027-08-25T10:00:00.000Z',
      rejectionReason: null,
      objectVerification: {
        status: 'verified',
        storagePath: 'tenants/tenant_001/evidence/evidence_001/certificate.pdf',
        storageGeneration: '123456789',
        verifiedFileHashSha256: 'a'.repeat(64),
        verifiedFileSizeBytes: 4_096,
        verifiedMimeType: 'application/pdf',
        verifiedAt: '2026-08-25T09:00:00.000Z',
        verifier: 'storage_finalize_function',
      },
    } as Parameters<typeof isCertificationEvidenceRuntimeVerified>[0];
    const asOf = new Date('2026-08-26T10:00:00.000Z');

    expect(isCertificationEvidenceRuntimeVerified(evidence, certification, asOf)).toBe(true);
    expect(
      isCertificationEvidenceRuntimeVerified(
        { ...evidence, objectVerification: null },
        certification,
        asOf
      )
    ).toBe(false);
    expect(
      isCertificationEvidenceRuntimeVerified(
        {
          ...evidence,
          objectVerification: {
            ...evidence.objectVerification!,
            storageGeneration: '0',
          },
        },
        certification,
        asOf
      )
    ).toBe(false);
  });

  test('permission matrix excludes read-only and generic approver personas from editing', () => {
    expect(rolesForTenantAction('certification.create')).toContain('compliance_manager');
    expect(rolesForTenantAction('certification.update')).not.toContain('approver');
    expect(rolesForTenantAction('certification.update')).not.toContain('auditor');
    expect(rolesForTenantAction('certification.archive')).toEqual([
      'tenant_admin',
      'compliance_manager',
    ]);
  });

  test('handler and UI use revisioned commands, atomic writes, and soft archival', () => {
    const handler = source('functions/src/handlers/certifications.ts');
    const ui = source('apps/web/src/app/certifications-manager.tsx');
    const page = source('apps/web/src/app/page.tsx');
    const commandClient = source('apps/web/src/lib/commands.ts');

    expect(handler).toContain("commandName: 'certification.create'");
    expect(handler).toContain("commandName: 'certification.update'");
    expect(handler).toContain("commandName: 'certification.archive'");
    expect(handler.match(/commandVersion: 1/g)?.length).toBeGreaterThanOrEqual(3);
    expect(handler).toContain('requireExpectedRevision: true');
    expect(handler).toContain('context.transaction.create(certRef, certification)');
    expect(handler).toContain("status: 'archived'");
    expect(handler).not.toContain('await certRef.delete()');
    expect(handler).toContain('Evidence linking is unavailable');
    expect(handler).toContain('issueDate cannot be in the future');
    expect(handler).toContain('ensureCertificationVersionContinuity');
    expect(handler).toContain('legacy_baseline_captured_on_first_command');
    expect(handler).toContain('state diverges from its immutable history');
    expect(handler).toContain('previousStateHash: previousAnchor?.stateHash ?? null');
    expect(handler).toContain('loadCurrentCertificationArtifactVerification');
    expect(handler).toContain("assuranceStatus = currentArtifactVerified");

    expect(ui).toContain('retryableTenantCommand');
    expect(ui).toContain('clearRetryableTenantCommand');
    expect(ui).not.toContain('useRef');
    expect(ui).toContain('selectedCert.revision ?? 0');
    expect(ui).not.toMatch(/\b(setDoc|updateDoc|deleteDoc)\s*\(/);
    expect(ui).toContain('Evidence linking unavailable');
    expect(ui).toContain('currentArtifactVerified');
    expect(ui).toContain('record chain and evidence verified');
    expect(page).toContain("functions, 'listTenantCertifications'");
    expect(page).not.toContain("collection(db, 'tenants', tenantId, 'certifications')");

    expect(commandClient).toContain("subtle.digest(\n    'SHA-256'");
    expect(commandClient).toContain('globalThis.localStorage');
    expect(commandClient).toContain('memoryRetryMetadata');
    expect(commandClient).toContain('7 * 24 * 60 * 60 * 1000');
    expect(commandClient).toContain('logicalKey: string');
    expect(commandClient).toContain('payloadHash: string');
    expect(commandClient).toContain('previous.payloadHash === payloadHash');
    expect(commandClient).toContain('envelopeVersion: COMMAND_ENVELOPE_VERSION');
    expect(commandClient).toContain('previous.commandVersion === commandVersion');
    expect(commandClient).toContain('eurogovernance:tenant-command:v2:');
  });
});

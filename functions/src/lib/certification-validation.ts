import { HttpsError } from 'firebase-functions/v2/https';
import type {
  CertificationScope,
  CertificationStatus,
  CertificationType,
  ContinuousComplianceStatus,
} from '@eurogovernance/shared-types';

const CERTIFICATION_TYPES = new Set<CertificationType>([
  'iso_27001',
  'iso_42001',
  'iso_27701',
  'iso_22301',
  'soc2_type1',
  'soc2_type2',
  'soc1_type2',
  'bsi_c5',
  'tisax',
  'cyber_essentials',
  'gdpr_art42',
  'pci_dss',
  'hipaa',
  'other',
]);

const MUTABLE_CERTIFICATION_STATUSES = new Set<CertificationStatus>([
  'active_valid',
  'expiring_soon',
  'expired',
  'under_audit',
  'suspended',
  'revoked',
]);

const CONTINUOUS_COMPLIANCE_STATUSES = new Set<ContinuousComplianceStatus>([
  'not_assessed',
  'compliant',
  'minor_non_conformity',
  'major_non_conformity',
  'opportunity_for_improvement',
]);

const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/;
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const CERTIFICATION_FIELD_KEYS = [
  'certificationName',
  'certificationType',
  'issuingBody',
  'certificateNumber',
  'scopeDescription',
  'scopeDetails',
  'applicableStandardVersion',
  'issueDate',
  'expiryDate',
  'status',
  'statusRationale',
  'surveillanceAuditDueDate',
  'leadAuditorName',
  'leadAuditorContact',
  'frameworkIds',
  'linkedControlIds',
  'linkedEvidenceIds',
  'linkedVendorIds',
  'linkedProcessorProfileIds',
  'linkedSystemAssetIds',
  'continuousComplianceStatus',
  'unresolvedFindingsCount',
  'notes',
] as const;

export interface NormalizedCertificationFields {
  certificationName: string;
  certificationType: CertificationType;
  issuingBody: string;
  certificateNumber: string;
  scopeDescription: string;
  scopeDetails: CertificationScope;
  applicableStandardVersion: string;
  issueDate: string;
  expiryDate: string;
  status: CertificationStatus;
  statusRationale: string | null;
  surveillanceAuditDueDate: string | null;
  leadAuditorName: string | null;
  leadAuditorContact: string | null;
  frameworkIds: string[];
  linkedControlIds: string[];
  linkedEvidenceIds: string[];
  linkedVendorIds: string[];
  linkedProcessorProfileIds: string[];
  linkedSystemAssetIds: string[];
  continuousComplianceStatus: ContinuousComplianceStatus;
  unresolvedFindingsCount: number;
  notes: string | null;
}

export interface UpdateCertificationPayload extends NormalizedCertificationFields {
  certificationId: string;
}

export interface ArchiveCertificationPayload {
  certificationId: string;
  archiveReason: string;
}

export interface LinkCertificationEvidencePayload {
  certificationId: string;
  evidenceId: string;
}

function requirePlainObject(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new HttpsError('invalid-argument', `${label} must be an object.`);
  }
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) {
    throw new HttpsError('invalid-argument', `${label} must be a plain object.`);
  }
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  allowedKeys: readonly string[],
  label: string
): void {
  const allowed = new Set(allowedKeys);
  const unknown = Object.keys(value).filter((key) => !allowed.has(key));
  if (unknown.length > 0) {
    throw new HttpsError(
      'invalid-argument',
      `${label} contains unsupported field(s): ${unknown.join(', ')}.`
    );
  }
}

function normalizedString(
  value: unknown,
  label: string,
  minimumLength: number,
  maximumLength: number
): string {
  if (typeof value !== 'string') {
    throw new HttpsError('invalid-argument', `${label} must be a string.`);
  }
  const normalized = value.trim();
  if (normalized.length < minimumLength || normalized.length > maximumLength) {
    throw new HttpsError(
      'invalid-argument',
      `${label} must contain ${minimumLength}-${maximumLength} characters.`
    );
  }
  return normalized;
}

function nullableString(value: unknown, label: string, maximumLength: number): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizedString(value, label, 1, maximumLength);
}

export function normalizeCertificationDocumentId(value: unknown, label: string): string {
  const normalized = normalizedString(value, label, 1, 128);
  if (!DOCUMENT_ID_PATTERN.test(normalized)) {
    throw new HttpsError('invalid-argument', `${label} is not a valid document identifier.`);
  }
  return normalized;
}

function normalizedIsoDate(value: unknown, label: string): string {
  const raw = normalizedString(value, label, 10, 40);
  const timestamp = Date.parse(raw);
  if (!Number.isFinite(timestamp)) {
    throw new HttpsError('invalid-argument', `${label} must be a valid ISO 8601 date.`);
  }
  return new Date(timestamp).toISOString();
}

function nullableIsoDate(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  return normalizedIsoDate(value, label);
}

function normalizedIdArray(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError('invalid-argument', `${label} must be an array of at most 50 IDs.`);
  }
  const normalized = value.map((entry, index) =>
    normalizeCertificationDocumentId(entry, `${label}[${index}]`)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError('invalid-argument', `${label} must not contain duplicate IDs.`);
  }
  return normalized;
}

function normalizedScopeList(value: unknown, label: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 50) {
    throw new HttpsError('invalid-argument', `${label} must contain at most 50 entries.`);
  }
  const normalized = value.map((entry, index) =>
    normalizedString(entry, `${label}[${index}]`, 1, 160)
  );
  if (new Set(normalized).size !== normalized.length) {
    throw new HttpsError('invalid-argument', `${label} must not contain duplicate entries.`);
  }
  return normalized;
}

function normalizedScope(value: unknown): CertificationScope {
  if (value === undefined) {
    return { sites: [], products: [], cloudEnvironments: [], organizationalUnits: [] };
  }
  const scope = requirePlainObject(value, 'scopeDetails');
  rejectUnknownKeys(
    scope,
    ['sites', 'products', 'cloudEnvironments', 'organizationalUnits'],
    'scopeDetails'
  );
  return {
    sites: normalizedScopeList(scope.sites, 'scopeDetails.sites'),
    products: normalizedScopeList(scope.products, 'scopeDetails.products'),
    cloudEnvironments: normalizedScopeList(
      scope.cloudEnvironments,
      'scopeDetails.cloudEnvironments'
    ),
    organizationalUnits: normalizedScopeList(
      scope.organizationalUnits,
      'scopeDetails.organizationalUnits'
    ),
  };
}

function normalizedEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<T>,
  label: string
): T {
  if (typeof value !== 'string' || !allowed.has(value as T)) {
    throw new HttpsError('invalid-argument', `${label} contains an unsupported value.`);
  }
  return value as T;
}

export function deriveTemporalCertificationStatus(
  requestedStatus: CertificationStatus,
  expiryDate: string,
  asOf: Date
): CertificationStatus {
  if (requestedStatus === 'under_audit' || requestedStatus === 'suspended' || requestedStatus === 'revoked') {
    return requestedStatus;
  }
  const daysUntilExpiry = Math.ceil(
    (Date.parse(expiryDate) - asOf.getTime()) / (24 * 60 * 60 * 1000)
  );
  if (daysUntilExpiry <= 0) return 'expired';
  if (daysUntilExpiry <= 90) return 'expiring_soon';
  return 'active_valid';
}

export function normalizeCertificationFields(payload: unknown): NormalizedCertificationFields {
  const input = requirePlainObject(payload, 'Certification payload');
  rejectUnknownKeys(input, CERTIFICATION_FIELD_KEYS, 'Certification payload');

  const certificationType = normalizedEnum(
    input.certificationType,
    CERTIFICATION_TYPES,
    'certificationType'
  );
  const requestedStatus = normalizedEnum(
    input.status ?? 'active_valid',
    MUTABLE_CERTIFICATION_STATUSES,
    'status'
  );
  const continuousComplianceStatus = normalizedEnum(
    input.continuousComplianceStatus ?? 'not_assessed',
    CONTINUOUS_COMPLIANCE_STATUSES,
    'continuousComplianceStatus'
  );
  const issueDate = normalizedIsoDate(input.issueDate, 'issueDate');
  const expiryDate = normalizedIsoDate(input.expiryDate, 'expiryDate');
  if (Date.parse(expiryDate) <= Date.parse(issueDate)) {
    throw new HttpsError('invalid-argument', 'expiryDate must be later than issueDate.');
  }
  const surveillanceAuditDueDate = nullableIsoDate(
    input.surveillanceAuditDueDate,
    'surveillanceAuditDueDate'
  );
  if (
    surveillanceAuditDueDate &&
    (Date.parse(surveillanceAuditDueDate) < Date.parse(issueDate) ||
      Date.parse(surveillanceAuditDueDate) > Date.parse(expiryDate))
  ) {
    throw new HttpsError(
      'invalid-argument',
      'surveillanceAuditDueDate must fall within the certification validity period.'
    );
  }

  const leadAuditorContact = nullableString(
    input.leadAuditorContact,
    'leadAuditorContact',
    254
  );
  if (leadAuditorContact && !EMAIL_PATTERN.test(leadAuditorContact)) {
    throw new HttpsError('invalid-argument', 'leadAuditorContact must be a valid email address.');
  }

  const unresolvedFindingsCount = input.unresolvedFindingsCount ?? 0;
  if (
    !Number.isSafeInteger(unresolvedFindingsCount) ||
    (unresolvedFindingsCount as number) < 0 ||
    (unresolvedFindingsCount as number) > 100_000
  ) {
    throw new HttpsError(
      'invalid-argument',
      'unresolvedFindingsCount must be an integer between 0 and 100000.'
    );
  }
  if (continuousComplianceStatus === 'compliant' && unresolvedFindingsCount !== 0) {
    throw new HttpsError(
      'invalid-argument',
      'A compliant certification cannot declare unresolved findings.'
    );
  }
  if (continuousComplianceStatus === 'compliant') {
    throw new HttpsError(
      'failed-precondition',
      'Compliance cannot be marked compliant until the certificate object and review evidence are server-verified.'
    );
  }

  const relationshipArrays = {
    frameworkIds: normalizedIdArray(input.frameworkIds, 'frameworkIds'),
    linkedControlIds: normalizedIdArray(input.linkedControlIds, 'linkedControlIds'),
    linkedEvidenceIds: normalizedIdArray(input.linkedEvidenceIds, 'linkedEvidenceIds'),
    linkedVendorIds: normalizedIdArray(input.linkedVendorIds, 'linkedVendorIds'),
    linkedProcessorProfileIds: normalizedIdArray(
      input.linkedProcessorProfileIds,
      'linkedProcessorProfileIds'
    ),
    linkedSystemAssetIds: normalizedIdArray(
      input.linkedSystemAssetIds,
      'linkedSystemAssetIds'
    ),
  };
  const relationshipCount = Object.values(relationshipArrays).reduce(
    (total, ids) => total + ids.length,
    0
  );
  if (relationshipCount > 100) {
    throw new HttpsError(
      'invalid-argument',
      'Certification payload may reference at most 100 related records in total.'
    );
  }

  return {
    certificationName: normalizedString(
      input.certificationName,
      'certificationName',
      2,
      200
    ),
    certificationType,
    issuingBody: normalizedString(input.issuingBody, 'issuingBody', 2, 200),
    certificateNumber: normalizedString(
      input.certificateNumber,
      'certificateNumber',
      1,
      160
    ),
    scopeDescription: normalizedString(
      input.scopeDescription ?? '',
      'scopeDescription',
      0,
      5000
    ),
    scopeDetails: normalizedScope(input.scopeDetails),
    applicableStandardVersion: normalizedString(
      input.applicableStandardVersion,
      'applicableStandardVersion',
      1,
      160
    ),
    issueDate,
    expiryDate,
    status: requestedStatus,
    statusRationale: nullableString(input.statusRationale, 'statusRationale', 2000),
    surveillanceAuditDueDate,
    leadAuditorName: nullableString(input.leadAuditorName, 'leadAuditorName', 200),
    leadAuditorContact,
    ...relationshipArrays,
    continuousComplianceStatus,
    unresolvedFindingsCount: unresolvedFindingsCount as number,
    notes: nullableString(input.notes, 'notes', 10_000),
  };
}

export function normalizeUpdateCertificationPayload(payload: unknown): UpdateCertificationPayload {
  const input = requirePlainObject(payload, 'Certification update payload');
  rejectUnknownKeys(
    input,
    ['certificationId', ...CERTIFICATION_FIELD_KEYS],
    'Certification update payload'
  );
  const { certificationId, ...fields } = input;
  return {
    certificationId: normalizeCertificationDocumentId(
      certificationId,
      'certificationId'
    ),
    ...normalizeCertificationFields(fields),
  };
}

export function normalizeArchiveCertificationPayload(payload: unknown): ArchiveCertificationPayload {
  const input = requirePlainObject(payload, 'Certification archive payload');
  rejectUnknownKeys(input, ['certificationId', 'archiveReason'], 'Certification archive payload');
  return {
    certificationId: normalizeCertificationDocumentId(
      input.certificationId,
      'certificationId'
    ),
    archiveReason: normalizedString(input.archiveReason, 'archiveReason', 10, 2000),
  };
}

export function normalizeLinkCertificationEvidencePayload(
  payload: unknown
): LinkCertificationEvidencePayload {
  const input = requirePlainObject(payload, 'Certification evidence link payload');
  rejectUnknownKeys(
    input,
    ['certificationId', 'evidenceId'],
    'Certification evidence link payload'
  );
  return {
    certificationId: normalizeCertificationDocumentId(
      input.certificationId,
      'certificationId'
    ),
    evidenceId: normalizeCertificationDocumentId(input.evidenceId, 'evidenceId'),
  };
}

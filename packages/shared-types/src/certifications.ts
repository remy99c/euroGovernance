import { BaseEntity } from './core.js';
import { Evidence } from './grc.js';

export type CertificationType =
  | 'iso_27001'
  | 'iso_42001'
  | 'iso_27701'
  | 'iso_22301'
  | 'soc2_type1'
  | 'soc2_type2'
  | 'soc1_type2'
  | 'bsi_c5'
  | 'tisax'
  | 'cyber_essentials'
  | 'gdpr_art42'
  | 'pci_dss'
  | 'hipaa'
  | 'other';

export type CertificationStatus =
  | 'active_valid'
  | 'expiring_soon'
  | 'expired'
  | 'under_audit'
  | 'suspended'
  | 'revoked'
  | 'archived';

export type ContinuousComplianceStatus =
  | 'not_assessed'
  | 'compliant'
  | 'minor_non_conformity'
  | 'major_non_conformity'
  | 'opportunity_for_improvement';

export interface CertificationScope {
  sites: string[];
  products: string[];
  cloudEnvironments: string[];
  organizationalUnits: string[];
}

/**
 * Structured Certification & External Assurance Record
 * Firestore path: /tenants/{tenantId}/certifications/{certificationId}
 */
export interface Certification extends BaseEntity {
  /** Monotonic optimistic-concurrency revision; legacy records default to 0. */
  revision?: number;
  certificationName: string;
  certificationType: CertificationType;
  issuingBody: string;
  certificateNumber: string;
  scopeDescription: string;
  scopeDetails?: CertificationScope;
  applicableStandardVersion: string;
  issueDate: string; // ISO Date string
  expiryDate: string; // ISO Date string
  status: CertificationStatus;
  lastStatusRationale?: string | null;
  surveillanceAuditDueDate: string | null; // ISO Date string
  leadAuditorName: string | null;
  leadAuditorContact: string | null;
  frameworkIds: string[];
  linkedControlIds: string[];
  linkedEvidenceIds: string[];
  linkedVendorIds?: string[];
  linkedProcessorProfileIds?: string[];
  linkedSystemAssetIds?: string[];
  continuousComplianceStatus: ContinuousComplianceStatus;
  unresolvedFindingsCount: number;
  notes: string | null;
  archivedAt?: string | null;
  archivedBy?: string | null;
  archiveReason?: string | null;
  ownerId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface CertificationEvidenceCompleteness {
  certificationId: string;
  isComplete: boolean;
  totalRequired: number;
  attachedValidCount: number;
  missingCount: number;
  hasValidCertificateDocument: boolean;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number;
  surveillanceAuditOverdue: boolean;
  gaps: Array<{
    code: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }>;
}

export interface CertificationRiskFlag {
  id: string;
  certificationId: string;
  certificationName: string;
  ruleCode: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedTreatment: string;
  inherentScore: number;
  isActionable: boolean;
}

export interface CertificationRiskEvaluationSummary {
  tenantId: string;
  evaluatedAt: string;
  totalCertifications: number;
  activeValidCount: number;
  expiredCount: number;
  expiringSoonCount: number;
  overallAssuranceRiskLevel: 'critical' | 'high' | 'medium' | 'low';
  flags: CertificationRiskFlag[];
}

export type CertificationReminderType =
  | 'certification_expiry_warning_90d'
  | 'certification_expiry_warning_60d'
  | 'certification_expiry_warning_30d'
  | 'certification_expired'
  | 'certification_surveillance_audit_due'
  | 'certification_missing_evidence_follow_up';

export interface CertificationReminderCandidate {
  recipientUserId: string;
  tenantId: string;
  certificationId: string;
  certificationName: string;
  reminderType: CertificationReminderType;
  title: string;
  message: string;
  dueDate: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

export const CERTIFICATION_TYPE_METADATA: Record<
  CertificationType,
  { label: string; defaultValidityYears: number; standardCode: string }
> = {
  iso_27001: { label: 'ISO/IEC 27001 (ISMS)', defaultValidityYears: 3, standardCode: 'ISO/IEC 27001:2022' },
  iso_42001: { label: 'ISO/IEC 42001 (AIMS)', defaultValidityYears: 3, standardCode: 'ISO/IEC 42001:2023' },
  iso_27701: { label: 'ISO/IEC 27701 (PIMS)', defaultValidityYears: 3, standardCode: 'ISO/IEC 27701:2019' },
  iso_22301: { label: 'ISO 22301 (BCMS)', defaultValidityYears: 3, standardCode: 'ISO 22301:2019' },
  soc2_type1: { label: 'SOC 2 Type I Report', defaultValidityYears: 1, standardCode: 'AICPA TSP 100' },
  soc2_type2: { label: 'SOC 2 Type II Report', defaultValidityYears: 1, standardCode: 'AICPA TSP 100' },
  soc1_type2: { label: 'SOC 1 Type II Report', defaultValidityYears: 1, standardCode: 'SSAE 18 / ISAE 3402' },
  bsi_c5: { label: 'BSI C5:2020 Attestation', defaultValidityYears: 1, standardCode: 'BSI C5:2020' },
  tisax: { label: 'TISAX Assessment Label', defaultValidityYears: 3, standardCode: 'VDA ISA 5.1' },
  cyber_essentials: { label: 'Cyber Essentials Plus', defaultValidityYears: 1, standardCode: 'NCSC CE+' },
  gdpr_art42: { label: 'GDPR Art. 42 Europrivacy', defaultValidityYears: 3, standardCode: 'Europrivacy v1.0' },
  pci_dss: { label: 'PCI-DSS Attestation of Compliance', defaultValidityYears: 1, standardCode: 'PCI-DSS v4.0' },
  hipaa: { label: 'HIPAA Security Assessment', defaultValidityYears: 1, standardCode: '45 CFR Part 164' },
  other: { label: 'Custom Security Assurance / Certificate', defaultValidityYears: 1, standardCode: 'Custom' },
};

const CERTIFICATION_EVIDENCE_SHA256_PATTERN = /^[0-9a-f]{64}$/;
const CERTIFICATION_EVIDENCE_STORAGE_GENERATION_PATTERN = /^[1-9][0-9]{0,29}$/;
const CERTIFICATION_EVIDENCE_MIME_TYPE_PATTERN = /^[a-z0-9][a-z0-9!#$&^_.+-]{0,63}\/[a-z0-9][a-z0-9!#$&^_.+-]{0,63}$/;
const CERTIFICATION_EVIDENCE_CATEGORIES = new Set([
  'iso_certificate',
  'soc_report',
  'security_report',
  'assessment_doc',
  'toms',
]);

function isPlainRuntimeObject(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function isCanonicalRuntimeTimestamp(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) && new Date(timestamp).toISOString() === value;
}

/**
 * Runtime, fail-closed evidence verification used by assurance calculations.
 * TypeScript interfaces alone cannot prove that Firestore metadata came from a
 * Storage finalize event or that its review is still current.
 */
export function isCertificationEvidenceRuntimeVerified(
  evidence: Evidence,
  certification: Certification,
  asOfDate: Date = new Date()
): boolean {
  const verification = evidence.objectVerification;
  if (!isPlainRuntimeObject(verification)) return false;
  const asOfMillis = asOfDate.getTime();
  const verifiedAtMillis = Date.parse(String(verification.verifiedAt));
  const reviewedAtMillis = Date.parse(String(evidence.reviewedAt));
  const reviewDueMillis = evidence.reviewDueDate
    ? Date.parse(evidence.reviewDueDate)
    : null;
  return (
    Number.isFinite(asOfMillis) &&
    typeof evidence.id === 'string' &&
    evidence.id.length > 0 &&
    evidence.tenantId === certification.tenantId &&
    Array.isArray(certification.linkedEvidenceIds) &&
    certification.linkedEvidenceIds.includes(evidence.id) &&
    evidence.status === 'valid' &&
    CERTIFICATION_EVIDENCE_CATEGORIES.has(evidence.category) &&
    typeof evidence.storagePath === 'string' &&
    evidence.storagePath.startsWith(
      `tenants/${certification.tenantId}/evidence/`
    ) &&
    !evidence.storagePath.includes('..') &&
    Number.isSafeInteger(evidence.currentVersion) &&
    evidence.currentVersion >= 1 &&
    Number.isSafeInteger(evidence.fileSizeBytes) &&
    evidence.fileSizeBytes > 0 &&
    typeof evidence.fileHashSha256 === 'string' &&
    CERTIFICATION_EVIDENCE_SHA256_PATTERN.test(evidence.fileHashSha256) &&
    typeof evidence.mimeType === 'string' &&
    CERTIFICATION_EVIDENCE_MIME_TYPE_PATTERN.test(evidence.mimeType) &&
    typeof evidence.reviewedBy === 'string' &&
    evidence.reviewedBy.length > 0 &&
    isCanonicalRuntimeTimestamp(evidence.reviewedAt) &&
    reviewedAtMillis <= asOfMillis &&
    evidence.rejectionReason === null &&
    (reviewDueMillis === null ||
      (Number.isFinite(reviewDueMillis) && reviewDueMillis >= asOfMillis)) &&
    verification.status === 'verified' &&
    verification.storagePath === evidence.storagePath &&
    CERTIFICATION_EVIDENCE_STORAGE_GENERATION_PATTERN.test(
      String(verification.storageGeneration)
    ) &&
    verification.verifiedFileHashSha256 === evidence.fileHashSha256 &&
    verification.verifiedFileSizeBytes === evidence.fileSizeBytes &&
    verification.verifiedMimeType === evidence.mimeType &&
    isCanonicalRuntimeTimestamp(verification.verifiedAt) &&
    verifiedAtMillis <= asOfMillis &&
    verification.verifier === 'storage_finalize_function'
  );
}

/**
 * Pure evaluator for single certification evidence completeness
 */
export function evaluateCertificationCompleteness(
  cert: Certification,
  evidenceDocs: Evidence[],
  asOfDate: Date = new Date()
): CertificationEvidenceCompleteness {
  const nowMillis = asOfDate.getTime();
  const expiryMillis = new Date(cert.expiryDate).getTime();
  const daysUntilExpiry = Number.isFinite(expiryMillis)
    ? Math.ceil((expiryMillis - nowMillis) / (1000 * 60 * 60 * 24))
    : 0;
  const isExpired = !Number.isFinite(expiryMillis) || expiryMillis <= nowMillis;
  const isExpiringSoon = !isExpired && daysUntilExpiry <= 60;

  const surveillanceMillis = cert.surveillanceAuditDueDate
    ? new Date(cert.surveillanceAuditDueDate).getTime()
    : null;
  const surveillanceAuditOverdue =
    surveillanceMillis !== null && surveillanceMillis < nowMillis && cert.status === 'active_valid';

  // Find linked evidence matching cert
  const linkedEvidences = evidenceDocs.filter((e) =>
    cert.linkedEvidenceIds && cert.linkedEvidenceIds.includes(e.id)
  );

  const hasValidCertificateDoc = linkedEvidences.some((e) =>
    isCertificationEvidenceRuntimeVerified(e, cert, asOfDate)
  );

  const gaps: Array<{
    code: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }> = [];

  if (isExpired) {
    gaps.push({
      code: 'CERTIFICATION_EXPIRED',
      description: `Certification "${cert.certificationName}" expired on ${cert.expiryDate}.`,
      severity: 'critical',
      suggestedAction: 'Conduct recertification audit or upload renewed certificate.',
    });
  } else if (isExpiringSoon) {
    gaps.push({
      code: 'CERTIFICATION_EXPIRING_SOON',
      description: `Certification "${cert.certificationName}" expires in ${daysUntilExpiry} days.`,
      severity: 'high',
      suggestedAction: 'Schedule external audit with accredited certification body.',
    });
  }

  if (!hasValidCertificateDoc) {
    gaps.push({
      code: 'CERTIFICATION_MISSING_EVIDENCE',
      description: `Certification "${cert.certificationName}" has no attached valid evidence document in the Evidence Repository.`,
      severity: 'high',
      suggestedAction: 'Upload the formal accredited certificate or audit report PDF.',
    });
  }

  if (surveillanceAuditOverdue) {
    gaps.push({
      code: 'SURVEILLANCE_AUDIT_OVERDUE',
      description: `Scheduled periodic surveillance audit due on ${cert.surveillanceAuditDueDate} is overdue.`,
      severity: 'high',
      suggestedAction: 'Complete surveillance audit with certification body.',
    });
  }

  if (cert.continuousComplianceStatus === 'major_non_conformity') {
    gaps.push({
      code: 'MAJOR_NON_CONFORMITY_ACTIVE',
      description: `Certification has active unresolved Major Non-Conformities.`,
      severity: 'critical',
      suggestedAction: 'Implement immediate corrective actions to avoid certificate suspension.',
    });
  }

  const isComplete = gaps.length === 0;

  return {
    certificationId: cert.id,
    isComplete,
    totalRequired: 1,
    attachedValidCount: hasValidCertificateDoc ? 1 : 0,
    missingCount: hasValidCertificateDoc ? 0 : 1,
    hasValidCertificateDocument: hasValidCertificateDoc,
    isExpired,
    isExpiringSoon,
    daysUntilExpiry,
    surveillanceAuditOverdue,
    gaps,
  };
}

/**
 * Evaluates risk flags across all certifications
 */
export function evaluateCertificationRiskFlags(
  certifications: Certification[],
  evidenceDocs: Evidence[],
  asOfDate: Date = new Date()
): CertificationRiskEvaluationSummary {
  const flags: CertificationRiskFlag[] = [];
  let expiredCount = 0;
  let expiringSoonCount = 0;
  let activeValidCount = 0;

  for (const cert of certifications) {
    if (cert.status === 'archived') continue;
    const completeness = evaluateCertificationCompleteness(cert, evidenceDocs, asOfDate);

    if (completeness.isExpired) {
      expiredCount++;
      flags.push({
        id: `flag_${cert.id}_expired`,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        ruleCode: 'CERTIFICATION_EXPIRED',
        severity: 'critical',
        title: `Certification Expired: ${cert.certificationName}`,
        description: `Certificate (${cert.certificateNumber}) expired on ${cert.expiryDate}. Active external assurance is invalidated.`,
        suggestedTreatment: 'Undergo formal recertification audit with accredited registrars.',
        inherentScore: 20,
        isActionable: true,
      });
    } else if (completeness.isExpiringSoon) {
      expiringSoonCount++;
      flags.push({
        id: `flag_${cert.id}_expiring_soon`,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        ruleCode: 'CERTIFICATION_EXPIRING_SOON',
        severity: 'high',
        title: `Certification Expiring Soon: ${cert.certificationName}`,
        description: `Certificate (${cert.certificateNumber}) will expire in ${completeness.daysUntilExpiry} days on ${cert.expiryDate}.`,
        suggestedTreatment: 'Schedule and execute renewal assessment.',
        inherentScore: 12,
        isActionable: true,
      });
    } else if (cert.status === 'active_valid' && completeness.hasValidCertificateDocument) {
      activeValidCount++;
    }

    if (!completeness.hasValidCertificateDocument) {
      flags.push({
        id: `flag_${cert.id}_no_evidence`,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        ruleCode: 'CERTIFICATION_MISSING_EVIDENCE',
        severity: 'high',
        title: `Missing Evidence Document for ${cert.certificationName}`,
        description: `Structured certificate record (${cert.certificateNumber}) has no approved formal document attached.`,
        suggestedTreatment: 'Attach verified certificate PDF with digital seal.',
        inherentScore: 12,
        isActionable: true,
      });
    }

    if (completeness.surveillanceAuditOverdue) {
      flags.push({
        id: `flag_${cert.id}_surveillance_overdue`,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        ruleCode: 'SURVEILLANCE_AUDIT_OVERDUE',
        severity: 'high',
        title: `Surveillance Audit Overdue: ${cert.certificationName}`,
        description: `Annual surveillance audit due date (${cert.surveillanceAuditDueDate}) has lapsed without recorded closure.`,
        suggestedTreatment: 'Complete surveillance review with lead auditor.',
        inherentScore: 12,
        isActionable: true,
      });
    }

    if (cert.continuousComplianceStatus === 'major_non_conformity') {
      flags.push({
        id: `flag_${cert.id}_major_nc`,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        ruleCode: 'MAJOR_NON_CONFORMITY_ACTIVE',
        severity: 'critical',
        title: `Major Non-Conformity on ${cert.certificationName}`,
        description: `Certificate has ${cert.unresolvedFindingsCount} open major findings requiring urgent remediation.`,
        suggestedTreatment: 'Implement root cause remediation and submit CAP to registrar.',
        inherentScore: 20,
        isActionable: true,
      });
    }
  }

  let overallAssuranceRiskLevel: 'critical' | 'high' | 'medium' | 'low' = 'low';
  if (flags.some((f) => f.severity === 'critical')) {
    overallAssuranceRiskLevel = 'critical';
  } else if (flags.some((f) => f.severity === 'high')) {
    overallAssuranceRiskLevel = 'high';
  } else if (flags.some((f) => f.severity === 'medium')) {
    overallAssuranceRiskLevel = 'medium';
  }

  return {
    tenantId: certifications[0]?.tenantId || '',
    evaluatedAt: asOfDate.toISOString(),
    totalCertifications: certifications.filter((cert) => cert.status !== 'archived').length,
    activeValidCount,
    expiredCount,
    expiringSoonCount,
    overallAssuranceRiskLevel,
    flags,
  };
}

/**
 * Pure evaluator for certification lifecycle reminders and audit milestones
 */
export function evaluateCertificationReminders(
  certifications: Certification[],
  _evidenceDocs: Evidence[] = [],
  options: { asOfDate?: Date; windowDays?: number } = {}
): CertificationReminderCandidate[] {
  const asOf = options.asOfDate || new Date();
  const windowDays = options.windowDays || 90;
  const nowMillis = asOf.getTime();
  const windowMillis = windowDays * 24 * 60 * 60 * 1000;
  const reminders: CertificationReminderCandidate[] = [];

  for (const cert of certifications) {
    if (cert.status === 'archived') continue;
    const recipientId = cert.ownerId || cert.createdBy;
    const expiryMillis = new Date(cert.expiryDate).getTime();
    const daysUntilExpiry = Math.ceil((expiryMillis - nowMillis) / (1000 * 60 * 60 * 24));

    if (expiryMillis <= nowMillis) {
      reminders.push({
        recipientUserId: recipientId,
        tenantId: cert.tenantId,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        reminderType: 'certification_expired',
        title: `Certificate Expired: ${cert.certificationName}`,
        message: `Your accredited ${cert.certificationType.toUpperCase()} certification (${cert.certificateNumber}) expired on ${cert.expiryDate}.`,
        dueDate: cert.expiryDate,
        severity: 'critical',
      });
    } else if (daysUntilExpiry <= 30) {
      reminders.push({
        recipientUserId: recipientId,
        tenantId: cert.tenantId,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        reminderType: 'certification_expiry_warning_30d',
        title: `Urgent Expiry Warning (30d): ${cert.certificationName}`,
        message: `Certificate (${cert.certificateNumber}) will expire in ${daysUntilExpiry} days on ${cert.expiryDate}.`,
        dueDate: cert.expiryDate,
        severity: 'high',
      });
    } else if (daysUntilExpiry <= 90) {
      reminders.push({
        recipientUserId: recipientId,
        tenantId: cert.tenantId,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        reminderType: 'certification_expiry_warning_90d',
        title: `Recertification Window (90d): ${cert.certificationName}`,
        message: `Certificate (${cert.certificateNumber}) enters recertification window. Expiry due on ${cert.expiryDate}.`,
        dueDate: cert.expiryDate,
        severity: 'medium',
      });
    }

    if (cert.surveillanceAuditDueDate) {
      const survMillis = new Date(cert.surveillanceAuditDueDate).getTime();
      if (survMillis <= nowMillis + windowMillis && cert.status === 'active_valid') {
        const isOverdue = survMillis < nowMillis;
        reminders.push({
          recipientUserId: recipientId,
          tenantId: cert.tenantId,
          certificationId: cert.id,
          certificationName: cert.certificationName,
          reminderType: 'certification_surveillance_audit_due',
          title: isOverdue
            ? `Surveillance Audit Overdue: ${cert.certificationName}`
            : `Surveillance Audit Upcoming: ${cert.certificationName}`,
          message: `Periodic surveillance audit scheduled for ${cert.surveillanceAuditDueDate} requires lead auditor confirmation.`,
          dueDate: cert.surveillanceAuditDueDate,
          severity: isOverdue ? 'high' : 'medium',
        });
      }
    }

    // Check evidence link
    const hasEvidence = cert.linkedEvidenceIds && cert.linkedEvidenceIds.length > 0;
    if (!hasEvidence && cert.status === 'active_valid') {
      reminders.push({
        recipientUserId: recipientId,
        tenantId: cert.tenantId,
        certificationId: cert.id,
        certificationName: cert.certificationName,
        reminderType: 'certification_missing_evidence_follow_up',
        title: `Missing Evidence: ${cert.certificationName}`,
        message: `Please attach the formal certificate or attestation report PDF to the Evidence repository.`,
        dueDate: cert.issueDate,
        severity: 'medium',
      });
    }
  }

  return reminders;
}

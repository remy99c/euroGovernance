import { BaseEntity } from './core.js';
import { Evidence } from './grc.js';
export type CertificationType = 'iso_27001' | 'iso_42001' | 'iso_27701' | 'iso_22301' | 'soc2_type1' | 'soc2_type2' | 'soc1_type2' | 'bsi_c5' | 'tisax' | 'cyber_essentials' | 'gdpr_art42' | 'pci_dss' | 'hipaa' | 'other';
export type CertificationStatus = 'active_valid' | 'expiring_soon' | 'expired' | 'under_audit' | 'suspended' | 'revoked' | 'archived';
export type ContinuousComplianceStatus = 'not_assessed' | 'compliant' | 'minor_non_conformity' | 'major_non_conformity' | 'opportunity_for_improvement';
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
    issueDate: string;
    expiryDate: string;
    status: CertificationStatus;
    lastStatusRationale?: string | null;
    surveillanceAuditDueDate: string | null;
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
export type CertificationReminderType = 'certification_expiry_warning_90d' | 'certification_expiry_warning_60d' | 'certification_expiry_warning_30d' | 'certification_expired' | 'certification_surveillance_audit_due' | 'certification_missing_evidence_follow_up';
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
export declare const CERTIFICATION_TYPE_METADATA: Record<CertificationType, {
    label: string;
    defaultValidityYears: number;
    standardCode: string;
}>;
/**
 * Runtime, fail-closed evidence verification used by assurance calculations.
 * TypeScript interfaces alone cannot prove that Firestore metadata came from a
 * Storage finalize event or that its review is still current.
 */
export declare function isCertificationEvidenceRuntimeVerified(evidence: Evidence, certification: Certification, asOfDate?: Date): boolean;
/**
 * Pure evaluator for single certification evidence completeness
 */
export declare function evaluateCertificationCompleteness(cert: Certification, evidenceDocs: Evidence[], asOfDate?: Date): CertificationEvidenceCompleteness;
/**
 * Evaluates risk flags across all certifications
 */
export declare function evaluateCertificationRiskFlags(certifications: Certification[], evidenceDocs: Evidence[], asOfDate?: Date): CertificationRiskEvaluationSummary;
/**
 * Pure evaluator for certification lifecycle reminders and audit milestones
 */
export declare function evaluateCertificationReminders(certifications: Certification[], _evidenceDocs?: Evidence[], options?: {
    asOfDate?: Date;
    windowDays?: number;
}): CertificationReminderCandidate[];
//# sourceMappingURL=certifications.d.ts.map
import { BaseEntity } from './core.js';
import { Evidence, EvidenceCategory, ProcessorSystemRelationshipType, SystemAsset } from './grc.js';
import { PersonalDataBreach, BreachReportingSource, BreachSeverity, BreachStatus } from './gdpr.js';
import { NotificationType, NotificationPriority } from './audit.js';

export type ProcessorRole =
  | 'data_processor'
  | 'subprocessor'
  | 'joint_controller'
  | 'third_party_recipient';

export const VALID_PROCESSOR_ROLES: readonly ProcessorRole[] = [
  'data_processor',
  'subprocessor',
  'joint_controller',
  'third_party_recipient',
] as const;

export type ProcessorCriticality = 'low' | 'medium' | 'high' | 'critical';

export const VALID_PROCESSOR_CRITICALITIES: readonly ProcessorCriticality[] = [
  'low',
  'medium',
  'high',
  'critical',
] as const;

export type ProcessorReviewCadence =
  | 'monthly'
  | 'quarterly'
  | 'semi_annually'
  | 'annually'
  | 'biennially';

export const VALID_PROCESSOR_REVIEW_CADENCES: readonly ProcessorReviewCadence[] = [
  'monthly',
  'quarterly',
  'semi_annually',
  'annually',
  'biennially',
] as const;

export type ProcessorStatus =
  | 'active'
  | 'under_review'
  | 'restricted'
  | 'suspended'
  | 'offboarded';

export const VALID_PROCESSOR_STATUSES: readonly ProcessorStatus[] = [
  'active',
  'under_review',
  'restricted',
  'suspended',
  'offboarded',
] as const;

/**
 * GDPR Article 28 Mandatory Terms Checklist
 */
export interface GDPRArticle28Checklist {
  writtenInstructionsMandate: boolean; // Art. 28(3)(a)
  confidentialityDuty: boolean; // Art. 28(3)(b)
  securityMeasuresTOMs: boolean; // Art. 28(3)(c)
  subprocessorAuthorization: boolean; // Art. 28(3)(d)
  dataSubjectRightsAssistance: boolean; // Art. 28(3)(e)
  breachAssistance: boolean; // Art. 28(3)(f)
  dataReturnOrDeletion: boolean; // Art. 28(3)(g)
  auditInspectionRights: boolean; // Art. 28(3)(h))
}

/**
 * Data Processor Profile (/tenants/{tenantId}/processor_profiles/{profileId})
 * Privacy and data-processing overlay linked to a master commercial Vendor record.
 */
export interface ProcessorProfile extends BaseEntity {
  vendorId: string; // Foreign Key to /tenants/{tenantId}/vendors/{vendorId}
  tenantId: string;
  engagementName?: string | null; // e.g. 'Primary SaaS Infrastructure', 'AI LLM Inference Addendum'
  processorRole: ProcessorRole;
  serviceDescription: string;
  dataCategories: string[]; // e.g. ['contact_data', 'billing_records', 'ip_addresses']
  dataSubjects: string[]; // e.g. ['customers', 'employees', 'end_users', 'minors']
  isSpecialCategoryData: boolean;
  specialCategoryTypes?: string[] | null; // e.g. ['health_data', 'biometrics']
  jurisdictions: string[]; // Primary processing and storage locations e.g. ['DE', 'FR', 'US', 'EU']
  linkedSystemAssetIds: string[]; // Foreign Keys to /tenants/{tenantId}/system_assets/{assetId}
  criticality: ProcessorCriticality;
  ownerUserId: string; // Responsible privacy officer / internal owner UID
  reviewCadence: ProcessorReviewCadence;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  status: ProcessorStatus;
  notes: string | null;
  article28Checklist?: GDPRArticle28Checklist | null;
  dpaSigned: boolean;
  dpaDate: string | null;
  linkedDpaEvidenceId?: string | null; // Link to Evidence document in Evidence repository
  linkedTiaId?: string | null; // Link to TIA if cross-border transfer is involved
  linkedRopaIds?: string[]; // Link to ROPA processing activities
  linkedBreachIds?: string[]; // Link to Breach incident records
  linkedRiskIds?: string[]; // Link to Risk register entries
  systemAssetRelationships?: Array<{
    systemAssetId: string;
    relationshipType: ProcessorSystemRelationshipType;
    relationshipDescription?: string | null;
  }>;
}

export interface ValidateProcessorProfileResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a ProcessorProfile payload for data integrity and business rules.
 */
export function validateProcessorProfile(input: unknown): ValidateProcessorProfileResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object.'] };
  }

  const p = input as Partial<ProcessorProfile>;

  // 1. Mandatory Identifiers
  if (!p.vendorId || typeof p.vendorId !== 'string' || p.vendorId.trim() === '') {
    errors.push('vendorId is required and must be a non-empty string referencing a valid Vendor.');
  }

  if (!p.tenantId || typeof p.tenantId !== 'string' || p.tenantId.trim() === '') {
    errors.push('tenantId is required and must be a non-empty string.');
  }

  // 2. Role & Service Description
  if (!p.processorRole || !VALID_PROCESSOR_ROLES.includes(p.processorRole)) {
    errors.push(`processorRole must be one of: ${VALID_PROCESSOR_ROLES.join(', ')}.`);
  }

  if (!p.serviceDescription || typeof p.serviceDescription !== 'string' || p.serviceDescription.trim().length < 5) {
    errors.push('serviceDescription is required and must be at least 5 characters long.');
  }

  // 3. Data Categories & Subjects
  if (!Array.isArray(p.dataCategories) || p.dataCategories.length === 0 || !p.dataCategories.every(c => typeof c === 'string' && c.trim() !== '')) {
    errors.push('dataCategories must be a non-empty array of non-empty strings.');
  }

  if (!Array.isArray(p.dataSubjects) || p.dataSubjects.length === 0 || !p.dataSubjects.every(s => typeof s === 'string' && s.trim() !== '')) {
    errors.push('dataSubjects must be a non-empty array of non-empty strings.');
  }

  // 4. Special Category Data Guardrail
  if (typeof p.isSpecialCategoryData !== 'boolean') {
    errors.push('isSpecialCategoryData must be a boolean.');
  } else if (p.isSpecialCategoryData === true) {
    if (!Array.isArray(p.specialCategoryTypes) || p.specialCategoryTypes.length === 0) {
      errors.push('specialCategoryTypes must contain at least one special data category when isSpecialCategoryData is true.');
    }
  }

  // 5. Jurisdictions
  if (!Array.isArray(p.jurisdictions) || p.jurisdictions.length === 0 || !p.jurisdictions.every(j => typeof j === 'string' && j.trim() !== '')) {
    errors.push('jurisdictions must be a non-empty array of valid country/region identifiers.');
  }

  // 6. Linked Assets
  if (p.linkedSystemAssetIds !== undefined && (!Array.isArray(p.linkedSystemAssetIds) || !p.linkedSystemAssetIds.every(id => typeof id === 'string'))) {
    errors.push('linkedSystemAssetIds must be an array of string identifiers if provided.');
  }

  // 7. Criticality & Ownership
  if (!p.criticality || !VALID_PROCESSOR_CRITICALITIES.includes(p.criticality)) {
    errors.push(`criticality must be one of: ${VALID_PROCESSOR_CRITICALITIES.join(', ')}.`);
  }

  if (!p.ownerUserId || typeof p.ownerUserId !== 'string' || p.ownerUserId.trim() === '') {
    errors.push('ownerUserId is required and must specify the responsible internal owner UID.');
  }

  // 8. Review Cadence & Status
  if (!p.reviewCadence || !VALID_PROCESSOR_REVIEW_CADENCES.includes(p.reviewCadence)) {
    errors.push(`reviewCadence must be one of: ${VALID_PROCESSOR_REVIEW_CADENCES.join(', ')}.`);
  }

  if (!p.status || !VALID_PROCESSOR_STATUSES.includes(p.status)) {
    errors.push(`status must be one of: ${VALID_PROCESSOR_STATUSES.join(', ')}.`);
  }

  // 9. DPA Consistency
  if (p.dpaSigned === true && (!p.dpaDate || typeof p.dpaDate !== 'string')) {
    errors.push('dpaDate must be provided when dpaSigned is true.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Calculates review date based on last review date and cadence.
 */
export function computeNextReviewDate(lastReviewDateISO: string, cadence: ProcessorReviewCadence): string {
  const date = new Date(lastReviewDateISO);
  if (isNaN(date.getTime())) {
    throw new Error('Invalid lastReviewDate ISO string.');
  }

  switch (cadence) {
    case 'monthly':
      date.setMonth(date.getMonth() + 1);
      break;
    case 'quarterly':
      date.setMonth(date.getMonth() + 3);
      break;
    case 'semi_annually':
      date.setMonth(date.getMonth() + 6);
      break;
    case 'annually':
      date.setFullYear(date.getFullYear() + 1);
      break;
    case 'biennially':
      date.setFullYear(date.getFullYear() + 2);
      break;
  }

  return date.toISOString();
}

// -----------------------------------------------------------------------------
// TRANSFER ARRANGEMENTS & CROSS-BORDER DATA FLOWS
// -----------------------------------------------------------------------------

export type TransferScopeType =
  | 'hosting'
  | 'support_access'
  | 'onward_transfer'
  | 'subprocessing'
  | 'analytics'
  | 'backup'
  | 'maintenance'
  | 'other';

export const VALID_TRANSFER_SCOPES: readonly TransferScopeType[] = [
  'hosting',
  'support_access',
  'onward_transfer',
  'subprocessing',
  'analytics',
  'backup',
  'maintenance',
  'other',
] as const;

export type TransferMechanismType =
  | 'standard_contractual_clauses'
  | 'adequacy_decision'
  | 'derogation_art49'
  | 'binding_corporate_rules'
  | 'intra_group_agreement'
  | 'code_of_conduct_or_certification'
  | 'no_mechanism_selected'
  | 'other';

export const VALID_TRANSFER_MECHANISM_TYPES: readonly TransferMechanismType[] = [
  'standard_contractual_clauses',
  'adequacy_decision',
  'derogation_art49',
  'binding_corporate_rules',
  'intra_group_agreement',
  'code_of_conduct_or_certification',
  'no_mechanism_selected',
  'other',
] as const;

export type TransferMechanismStatus =
  | 'active_valid'
  | 'pending_execution'
  | 'under_review'
  | 'restricted'
  | 'expired'
  | 'superseded'
  | 'revoked';

export const VALID_TRANSFER_MECHANISM_STATUSES: readonly TransferMechanismStatus[] = [
  'active_valid',
  'pending_execution',
  'under_review',
  'restricted',
  'expired',
  'superseded',
  'revoked',
] as const;

export type EEATransferStatus =
  | 'within_eea'
  | 'third_country_adequate'
  | 'third_country_non_adequate'
  | 'mixed';

export const VALID_EEA_TRANSFER_STATUSES: readonly EEATransferStatus[] = [
  'within_eea',
  'third_country_adequate',
  'third_country_non_adequate',
  'mixed',
] as const;

/**
 * Structured Transfer Arrangement (/tenants/{tenantId}/transfer_arrangements/{arrangementId})
 * Models international cross-border data transfers and legal mechanisms linked to a ProcessorProfile.
 */
export interface TransferArrangement extends BaseEntity {
  processorProfileId: string; // Foreign Key to /tenants/{tenantId}/processor_profiles/{profileId}
  vendorId?: string; // Foreign Key to /tenants/{tenantId}/vendors/{vendorId} for direct correlation
  tenantId: string;
  name: string; // e.g. 'US Customer Support Remote Access Transfer'
  restrictedTransfer: boolean; // True if data leaves the EU/EEA to a non-EEA third country
  destinationCountries: string[]; // e.g. ['US', 'IN', 'GB', 'JP']
  eeaStatus: EEATransferStatus; // Status of destination territories under GDPR Chapter V
  transferScopes: TransferScopeType[]; // e.g. ['hosting', 'support_access']
  transferScopeDescription?: string | null;
  transferMechanismType: TransferMechanismType; // e.g. 'standard_contractual_clauses', 'adequacy_decision'
  transferMechanismStatus: TransferMechanismStatus; // e.g. 'active_valid', 'pending_execution'
  effectiveDate: string; // ISO 8601 UTC
  reviewDueDate: string | null; // ISO 8601 UTC
  supplementaryMeasuresSummary: string | null; // Technical & organizational safeguards (e.g. EU key custody)
  subprocessorInvolvement: boolean;
  subprocessorsInvolved?: string[]; // Names or IDs of third-country subprocessors
  linkedTiaId: string | null; // Foreign Key to /tenants/{tenantId}/tia_assessments/{tiaId}
  linkedEvidenceIds: string[]; // Foreign Keys to Evidence documents (e.g. executed SCC PDF, DPF cert)
  linkedRiskIds?: string[]; // Foreign Keys to linked Risk register entries
  rationale: string | null;
  notes: string | null;
}

export interface ValidateTransferArrangementResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a TransferArrangement payload for data consistency and legal mechanism guardrails.
 */
export function validateTransferArrangement(input: unknown): ValidateTransferArrangementResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object.'] };
  }

  const t = input as Partial<TransferArrangement>;

  // 1. Identifiers
  if (!t.processorProfileId || typeof t.processorProfileId !== 'string' || t.processorProfileId.trim() === '') {
    errors.push('processorProfileId is required and must reference a valid ProcessorProfile.');
  }

  if (!t.tenantId || typeof t.tenantId !== 'string' || t.tenantId.trim() === '') {
    errors.push('tenantId is required and must be a non-empty string.');
  }

  if (!t.name || typeof t.name !== 'string' || t.name.trim().length < 3) {
    errors.push('name is required and must be at least 3 characters long.');
  }

  // 2. Restricted Transfer & Destination Countries
  if (typeof t.restrictedTransfer !== 'boolean') {
    errors.push('restrictedTransfer must be a boolean.');
  }

  if (!Array.isArray(t.destinationCountries) || t.destinationCountries.length === 0 || !t.destinationCountries.every(c => typeof c === 'string' && c.trim() !== '')) {
    errors.push('destinationCountries must be a non-empty array of country/jurisdiction codes.');
  }

  if (!t.eeaStatus || !VALID_EEA_TRANSFER_STATUSES.includes(t.eeaStatus)) {
    errors.push(`eeaStatus must be one of: ${VALID_EEA_TRANSFER_STATUSES.join(', ')}.`);
  }

  // 3. Transfer Scopes
  if (!Array.isArray(t.transferScopes) || t.transferScopes.length === 0 || !t.transferScopes.every(s => VALID_TRANSFER_SCOPES.includes(s))) {
    errors.push(`transferScopes must be a non-empty array with valid scopes (${VALID_TRANSFER_SCOPES.join(', ')}).`);
  }

  // 4. Mechanism Type & Status
  if (!t.transferMechanismType || !VALID_TRANSFER_MECHANISM_TYPES.includes(t.transferMechanismType)) {
    errors.push(`transferMechanismType must be one of: ${VALID_TRANSFER_MECHANISM_TYPES.join(', ')}.`);
  }

  if (!t.transferMechanismStatus || !VALID_TRANSFER_MECHANISM_STATUSES.includes(t.transferMechanismStatus)) {
    errors.push(`transferMechanismStatus must be one of: ${VALID_TRANSFER_MECHANISM_STATUSES.join(', ')}.`);
  }

  // 5. Legal Guardrail: An active restricted transfer cannot have 'no_mechanism_selected'
  if (
    t.restrictedTransfer === true &&
    t.transferMechanismType === 'no_mechanism_selected' &&
    t.transferMechanismStatus === 'active_valid'
  ) {
    errors.push('An active restricted cross-border transfer must have an authorized transfer mechanism selected (e.g. SCC, Adequacy Decision, BCR, or Derogation).');
  }

  // 6. Effective Date
  if (!t.effectiveDate || typeof t.effectiveDate !== 'string' || isNaN(new Date(t.effectiveDate).getTime())) {
    errors.push('effectiveDate must be a valid ISO date string.');
  }

  // 7. Subprocessor Consistency
  if (typeof t.subprocessorInvolvement !== 'boolean') {
    errors.push('subprocessorInvolvement must be a boolean.');
  } else if (t.subprocessorInvolvement === true) {
    if (t.subprocessorsInvolved !== undefined && !Array.isArray(t.subprocessorsInvolved)) {
      errors.push('subprocessorsInvolved must be an array of strings when subprocessorInvolvement is true.');
    }
  }

  // 8. Evidence Links
  if (t.linkedEvidenceIds !== undefined && (!Array.isArray(t.linkedEvidenceIds) || !t.linkedEvidenceIds.every(id => typeof id === 'string'))) {
    errors.push('linkedEvidenceIds must be an array of string identifiers.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// -----------------------------------------------------------------------------
// TIA INTEGRATION & DERIVED INDICATORS
// -----------------------------------------------------------------------------

export type ProcessorTIAStatus =
  | 'not_applicable'
  | 'tia_missing'
  | 'tia_in_progress'
  | 'tia_approved'
  | 'tia_stale';

export const VALID_PROCESSOR_TIA_STATUSES: readonly ProcessorTIAStatus[] = [
  'not_applicable',
  'tia_missing',
  'tia_in_progress',
  'tia_approved',
  'tia_stale',
] as const;

export interface MinimalTIARecord {
  id: string;
  status: string;
  approvedAt?: string | null;
  nextReviewDate?: string | null;
  updatedAt?: string | null;
}

/**
 * Evaluates TIA status for a single TransferArrangement.
 */
export function deriveTransferArrangementTIAStatus(
  arrangement: TransferArrangement,
  tia: MinimalTIARecord | null,
  nowISO: string = new Date().toISOString()
): ProcessorTIAStatus {
  if (!arrangement.restrictedTransfer) {
    return 'not_applicable';
  }

  if (!arrangement.linkedTiaId || !tia) {
    return 'tia_missing';
  }

  if (tia.status === 'draft' || tia.status === 'in_review' || tia.status === 'under_review') {
    return 'tia_in_progress';
  }

  if (tia.status === 'approved') {
    const nowTime = new Date(nowISO).getTime();

    // Check nextReviewDate if present
    if (tia.nextReviewDate) {
      const reviewTime = new Date(tia.nextReviewDate).getTime();
      if (!isNaN(reviewTime) && nowTime > reviewTime) {
        return 'tia_stale';
      }
    }

    // Check if approved more than 365 days ago
    if (tia.approvedAt) {
      const approvedTime = new Date(tia.approvedAt).getTime();
      const oneYearMs = 365 * 24 * 60 * 60 * 1000;
      if (!isNaN(approvedTime) && nowTime - approvedTime > oneYearMs) {
        return 'tia_stale';
      }
    }

    return 'tia_approved';
  }

  return 'tia_in_progress';
}

/**
 * Aggregates and derives overall TIA posture for a ProcessorProfile based on all linked transfers.
 */
export function deriveProcessorTIAStatus(
  profile: ProcessorProfile,
  transfers: TransferArrangement[],
  tias: MinimalTIARecord[],
  nowISO: string = new Date().toISOString()
): ProcessorTIAStatus {
  const restrictedTransfers = transfers.filter((t) => t.restrictedTransfer && t.processorProfileId === profile.id);

  if (restrictedTransfers.length === 0) {
    return 'not_applicable';
  }

  const tiaMap = new Map<string, MinimalTIARecord>();
  tias.forEach((t) => tiaMap.set(t.id, t));

  const statuses = restrictedTransfers.map((tr) => {
    const tia = tr.linkedTiaId ? tiaMap.get(tr.linkedTiaId) || null : null;
    return deriveTransferArrangementTIAStatus(tr, tia, nowISO);
  });

  // If any transfer has a missing TIA, the overall status is tia_missing (highest risk)
  if (statuses.includes('tia_missing')) {
    return 'tia_missing';
  }

  // Next, if any is stale
  if (statuses.includes('tia_stale')) {
    return 'tia_stale';
  }

  // Next, if any is in progress
  if (statuses.includes('tia_in_progress')) {
    return 'tia_in_progress';
  }

  // All approved
  if (statuses.every((s) => s === 'tia_approved')) {
    return 'tia_approved';
  }

  return 'tia_missing';
}

// -----------------------------------------------------------------------------
// EVIDENCE INTEGRATION & GAP ANALYSIS
// -----------------------------------------------------------------------------

export interface ProcessorEvidenceRequirement {
  key: string;
  label: string;
  category: EvidenceCategory;
  status: 'satisfied' | 'missing' | 'expired';
  linkedEvidenceId?: string | null;
  reason: string;
}

export interface ProcessorEvidenceCompleteness {
  isComplete: boolean;
  missingCount: number;
  satisfiedCount: number;
  requirements: ProcessorEvidenceRequirement[];
}

export interface TransferEvidenceRequirement {
  key: string;
  label: string;
  category: EvidenceCategory;
  status: 'satisfied' | 'missing' | 'expired';
  linkedEvidenceId?: string | null;
  reason: string;
}

export interface TransferEvidenceCompleteness {
  isComplete: boolean;
  missingCount: number;
  satisfiedCount: number;
  requirements: TransferEvidenceRequirement[];
}

/**
 * Evaluates whether all required compliance evidence artifacts exist for a processor profile.
 */
export function evaluateProcessorEvidenceCompleteness(
  profile: ProcessorProfile,
  evidences: Evidence[],
  nowISO: string = new Date().toISOString()
): ProcessorEvidenceCompleteness {
  const requirements: ProcessorEvidenceRequirement[] = [];
  const nowTime = new Date(nowISO).getTime();

  // Helper to find valid evidence by category or explicit ID
  const findEvidence = (predicate: (e: Evidence) => boolean) => {
    return evidences.find(predicate) || null;
  };

  const getEvidenceStatus = (evidence: Evidence | null): 'satisfied' | 'missing' | 'expired' => {
    if (!evidence || evidence.status === 'rejected' || evidence.status === 'archived') {
      return 'missing';
    }
    if (evidence.reviewDueDate) {
      const dueTime = new Date(evidence.reviewDueDate).getTime();
      if (!isNaN(dueTime) && nowTime > dueTime) {
        return 'expired';
      }
    }
    if (evidence.status === 'expired') {
      return 'expired';
    }
    return 'satisfied';
  };

  // 1. DPA Evidence Requirement (Mandatory if DPA signed)
  if (profile.dpaSigned) {
    const dpaEvidence = findEvidence(
      (e) =>
        (e.id === profile.linkedDpaEvidenceId || e.category === 'dpa') &&
        Boolean(e.processorProfileIds?.includes(profile.id) || (profile.vendorId && e.vendorIds?.includes(profile.vendorId)) || e.id === profile.linkedDpaEvidenceId)
    );
    const dpaStatus = getEvidenceStatus(dpaEvidence);
    requirements.push({
      key: 'dpa',
      label: 'Signed Data Processing Agreement (DPA)',
      category: 'dpa',
      status: dpaStatus,
      linkedEvidenceId: dpaEvidence?.id || null,
      reason: 'Article 28(3) GDPR requires a binding written contract governing processor commitments.',
    });
  }

  // 2. Security Assurance / TOMs Requirement (Mandatory for High & Critical tier processors)
  if (profile.criticality === 'critical' || profile.criticality === 'high') {
    const securityEvidence = findEvidence(
      (e) =>
        ['soc_report', 'iso_certificate', 'security_report', 'toms'].includes(e.category) &&
        Boolean(e.processorProfileIds?.includes(profile.id) || (profile.vendorId && e.vendorIds?.includes(profile.vendorId)))
    );
    const secStatus = getEvidenceStatus(securityEvidence);
    requirements.push({
      key: 'security_assurance',
      label: 'Technical & Organizational Security Assurance (SOC2 / ISO 27001 / TOMs)',
      category: securityEvidence ? securityEvidence.category : 'security_report',
      status: secStatus,
      linkedEvidenceId: securityEvidence?.id || null,
      reason: 'Critical and High risk processors require verifiable third-party security assurance or TOM audit documentation.',
    });
  }

  // 3. Subprocessor Authorization / Addendum (Mandatory if role is subprocessor)
  if (profile.processorRole === 'subprocessor') {
    const subEvidence = findEvidence(
      (e) =>
        ['addendum', 'subprocessor_list'].includes(e.category) &&
        Boolean(e.processorProfileIds?.includes(profile.id) || (profile.vendorId && e.vendorIds?.includes(profile.vendorId)))
    );
    const subStatus = getEvidenceStatus(subEvidence);
    requirements.push({
      key: 'subprocessor_authorization',
      label: 'Subprocessor Authorization & Engagement Addendum',
      category: subEvidence ? subEvidence.category : 'addendum',
      status: subStatus,
      linkedEvidenceId: subEvidence?.id || null,
      reason: 'Subprocessors require explicit controller authorization under Article 28(2) GDPR.',
    });
  }

  const missingCount = requirements.filter((r) => r.status === 'missing' || r.status === 'expired').length;
  const satisfiedCount = requirements.filter((r) => r.status === 'satisfied').length;

  return {
    isComplete: missingCount === 0,
    missingCount,
    satisfiedCount,
    requirements,
  };
}

/**
 * Evaluates whether all required legal and supplementary evidence artifacts exist for a transfer arrangement.
 */
export function evaluateTransferEvidenceCompleteness(
  arrangement: TransferArrangement,
  evidences: Evidence[],
  nowISO: string = new Date().toISOString()
): TransferEvidenceCompleteness {
  const requirements: TransferEvidenceRequirement[] = [];
  const nowTime = new Date(nowISO).getTime();

  const getEvidenceStatus = (evidence: Evidence | null): 'satisfied' | 'missing' | 'expired' => {
    if (!evidence || evidence.status === 'rejected' || evidence.status === 'archived') {
      return 'missing';
    }
    if (evidence.reviewDueDate) {
      const dueTime = new Date(evidence.reviewDueDate).getTime();
      if (!isNaN(dueTime) && nowTime > dueTime) {
        return 'expired';
      }
    }
    if (evidence.status === 'expired') {
      return 'expired';
    }
    return 'satisfied';
  };

  // 1. SCC Instrument (Mandatory for SCC-based transfers)
  if (arrangement.restrictedTransfer && arrangement.transferMechanismType === 'standard_contractual_clauses') {
    const sccEvidence = evidences.find(
      (e) =>
        (arrangement.linkedEvidenceIds?.includes(e.id) || e.category === 'scc') &&
        Boolean(e.transferArrangementIds?.includes(arrangement.id) || arrangement.linkedEvidenceIds?.includes(e.id))
    ) || null;
    const sccStatus = getEvidenceStatus(sccEvidence);
    requirements.push({
      key: 'scc_instrument',
      label: 'Executed Standard Contractual Clauses (SCCs)',
      category: 'scc',
      status: sccStatus,
      linkedEvidenceId: sccEvidence?.id || null,
      reason: 'Chapter V GDPR Article 46 requires executed SCC modules and completed annexes.',
    });
  }

  // 2. Adequacy Documentation (Mandatory for Adequacy-based transfers e.g. EU-US DPF)
  if (arrangement.restrictedTransfer && arrangement.transferMechanismType === 'adequacy_decision') {
    const adequacyEvidence = evidences.find(
      (e) =>
        (arrangement.linkedEvidenceIds?.includes(e.id) || e.category === 'adequacy_support') &&
        Boolean(e.transferArrangementIds?.includes(arrangement.id) || arrangement.linkedEvidenceIds?.includes(e.id))
    ) || null;
    const adqStatus = getEvidenceStatus(adequacyEvidence);
    requirements.push({
      key: 'adequacy_support',
      label: 'Adequacy Decision Verification & Certification Proof',
      category: 'adequacy_support',
      status: adqStatus,
      linkedEvidenceId: adequacyEvidence?.id || null,
      reason: 'Adequacy transfers (e.g. EU-US DPF) require proof of current self-certification status.',
    });
  }

  // 3. Subprocessor List (Mandatory if subprocessor involvement is true)
  if (arrangement.subprocessorInvolvement) {
    const subListEvidence = evidences.find(
      (e) =>
        (arrangement.linkedEvidenceIds?.includes(e.id) || e.category === 'subprocessor_list') &&
        Boolean(e.transferArrangementIds?.includes(arrangement.id) || arrangement.linkedEvidenceIds?.includes(e.id))
    ) || null;
    const subListStatus = getEvidenceStatus(subListEvidence);
    requirements.push({
      key: 'subprocessor_list',
      label: 'Approved Subprocessor Roster & Territory Map',
      category: 'subprocessor_list',
      status: subListStatus,
      linkedEvidenceId: subListEvidence?.id || null,
      reason: 'Transfers involving onward subprocessing require transparent documentation of subprocessor locations.',
    });
  }

  const missingCount = requirements.filter((r) => r.status === 'missing' || r.status === 'expired').length;
  const satisfiedCount = requirements.filter((r) => r.status === 'satisfied').length;

  return {
    isComplete: missingCount === 0,
    missingCount,
    satisfiedCount,
    requirements,
  };
}

// -----------------------------------------------------------------------------
// ROPA INTEGRATION & SYNTHESIS
// -----------------------------------------------------------------------------

export interface ROPAPrefillResult {
  processorProfileIds: string[];
  processorIds: string[];
  transferArrangementIds: string[];
  personalDataCategories: string[];
  dataSubjectCategories: string[];
  isSpecialCategoryData: boolean;
  specialCategoryBasis: string | null;
  linkedSystemAssetIds: string[];
  involvesInternationalTransfer: boolean;
  destinationCountries: string[];
  transferMechanism:
    | 'standard_contractual_clauses'
    | 'adequacy_decision'
    | 'binding_corporate_rules'
    | 'derogation_art49'
    | 'other'
    | null;
  dataSecurityMeasuresSummary: string;
}

/**
 * Synthesizes ROPA fields from one or more linked processor profiles and optional transfer arrangements.
 */
export function prefillROPAFromProcessors(
  profiles: ProcessorProfile[],
  transfers: TransferArrangement[] = []
): ROPAPrefillResult {
  const dataCategoriesSet = new Set<string>();
  const dataSubjectsSet = new Set<string>();
  const systemAssetsSet = new Set<string>();
  const countriesSet = new Set<string>();
  const vendorIdsSet = new Set<string>();
  let hasSpecialCategory = false;
  let hasInternationalTransfer = false;
  let derivedTransferMechanism: ROPAPrefillResult['transferMechanism'] = null;

  for (const profile of profiles) {
    if (profile.vendorId) vendorIdsSet.add(profile.vendorId);
    (profile.dataCategories || []).forEach((c) => dataCategoriesSet.add(c));
    (profile.dataSubjects || []).forEach((s) => dataSubjectsSet.add(s));
    (profile.linkedSystemAssetIds || []).forEach((a) => systemAssetsSet.add(a));
    (profile.jurisdictions || []).forEach((j) => countriesSet.add(j));
    if (profile.isSpecialCategoryData) hasSpecialCategory = true;
  }

  for (const transfer of transfers) {
    (transfer.destinationCountries || []).forEach((c) => countriesSet.add(c));
    if (transfer.restrictedTransfer) {
      hasInternationalTransfer = true;
      if (!derivedTransferMechanism && transfer.transferMechanismType) {
        if (transfer.transferMechanismType === 'standard_contractual_clauses') {
          derivedTransferMechanism = 'standard_contractual_clauses';
        } else if (transfer.transferMechanismType === 'adequacy_decision') {
          derivedTransferMechanism = 'adequacy_decision';
        } else if (transfer.transferMechanismType === 'binding_corporate_rules') {
          derivedTransferMechanism = 'binding_corporate_rules';
        } else if (transfer.transferMechanismType === 'derogation_art49') {
          derivedTransferMechanism = 'derogation_art49';
        } else if (transfer.transferMechanismType === 'other') {
          derivedTransferMechanism = 'other';
        }
      }
    }
  }

  const securitySummary =
    profiles.length > 0
      ? `Processor engagements covered under GDPR Art. 28 DPAs; Security TOMs verified across ${profiles.length} processor profile(s).`
      : '';

  return {
    processorProfileIds: profiles.map((p) => p.id),
    processorIds: Array.from(vendorIdsSet),
    transferArrangementIds: transfers.map((t) => t.id),
    personalDataCategories: Array.from(dataCategoriesSet),
    dataSubjectCategories: Array.from(dataSubjectsSet),
    isSpecialCategoryData: hasSpecialCategory,
    specialCategoryBasis: hasSpecialCategory ? 'Explicit consent (Art. 9(2)(a)) or Employment law (Art. 9(2)(b))' : null,
    linkedSystemAssetIds: Array.from(systemAssetsSet),
    involvesInternationalTransfer: hasInternationalTransfer,
    destinationCountries: Array.from(countriesSet),
    transferMechanism: derivedTransferMechanism,
    dataSecurityMeasuresSummary: securitySummary,
  };
}

// -----------------------------------------------------------------------------
// DPIA INTEGRATION & PROCESSOR RISK CONTEXT
// -----------------------------------------------------------------------------

export interface DPIAProcessorSummaryItem {
  id: string;
  vendorId: string;
  engagementName?: string | null;
  processorRole: ProcessorRole;
  criticality: ProcessorCriticality;
  dpaSigned: boolean;
  isSpecialCategoryData: boolean;
  dataCategories: string[];
  dataSubjects: string[];
}

export interface DPIATransferSummaryItem {
  id: string;
  processorProfileId: string;
  name: string;
  restrictedTransfer: boolean;
  destinationCountries: string[];
  eeaStatus: string;
  transferMechanismType: string;
  transferMechanismStatus: string;
  subprocessorInvolvement: boolean;
  linkedTiaId?: string | null;
}

export interface DPIAProcessorRiskSummary {
  highestCriticality: ProcessorCriticality;
  hasSpecialCategoryData: boolean;
  hasRestrictedTransfers: boolean;
  hasSubprocessors: boolean;
  missingDpaCount: number;
  missingTiaCount: number;
  riskHighlights: string[];
}

export interface DPIAProcessorContext {
  processorCount: number;
  transferCount: number;
  processors: DPIAProcessorSummaryItem[];
  transfers: DPIATransferSummaryItem[];
  safeguardsSummary: string;
  riskSummary: DPIAProcessorRiskSummary;
}

/**
 * Synthesizes DPIA third-party processor context, safeguards, and risk indicators.
 */
export function synthesizeDPIAProcessorContext(
  profiles: ProcessorProfile[],
  transfers: TransferArrangement[] = []
): DPIAProcessorContext {
  const processors: DPIAProcessorSummaryItem[] = profiles.map((p) => ({
    id: p.id,
    vendorId: p.vendorId,
    engagementName: p.engagementName || null,
    processorRole: p.processorRole,
    criticality: p.criticality,
    dpaSigned: p.dpaSigned,
    isSpecialCategoryData: p.isSpecialCategoryData,
    dataCategories: p.dataCategories || [],
    dataSubjects: p.dataSubjects || [],
  }));

  const transferItems: DPIATransferSummaryItem[] = transfers.map((t) => ({
    id: t.id,
    processorProfileId: t.processorProfileId,
    name: t.name,
    restrictedTransfer: t.restrictedTransfer,
    destinationCountries: t.destinationCountries || [],
    eeaStatus: t.eeaStatus,
    transferMechanismType: t.transferMechanismType,
    transferMechanismStatus: t.transferMechanismStatus,
    subprocessorInvolvement: t.subprocessorInvolvement,
    linkedTiaId: t.linkedTiaId || null,
  }));

  let highestCriticality: ProcessorCriticality = 'low';
  const criticalityRank: Record<ProcessorCriticality, number> = {
    low: 1,
    medium: 2,
    high: 3,
    critical: 4,
  };

  let hasSpecialCategory = false;
  let missingDpaCount = 0;
  for (const p of profiles) {
    if (criticalityRank[p.criticality] > criticalityRank[highestCriticality]) {
      highestCriticality = p.criticality;
    }
    if (p.isSpecialCategoryData) hasSpecialCategory = true;
    if (!p.dpaSigned) missingDpaCount++;
  }

  const hasRestricted = transfers.some((t) => t.restrictedTransfer);
  const hasSubprocessors =
    transfers.some((t) => t.subprocessorInvolvement) || profiles.some((p) => p.processorRole === 'subprocessor');
  const missingTiaCount = transfers.filter((t) => t.restrictedTransfer && !t.linkedTiaId).length;

  const riskHighlights: string[] = [];
  if (highestCriticality === 'critical' || highestCriticality === 'high') {
    riskHighlights.push(
      `High/Critical supply chain dependence: Processing involves ${highestCriticality} criticality external processors.`
    );
  }
  if (hasSpecialCategory) {
    riskHighlights.push('Article 9 Special Category Data processed by external processors.');
  }
  if (missingDpaCount > 0) {
    riskHighlights.push(`Article 28 DPA Warning: ${missingDpaCount} processor(s) do not have countersigned DPAs recorded.`);
  }
  if (hasRestricted) {
    const dests = transfers
      .filter((t) => t.restrictedTransfer)
      .map((t) => t.destinationCountries.join(', '))
      .join('; ');
    riskHighlights.push(`Chapter V Cross-Border Transfers: Personal data transferred outside EEA (${dests}).`);
  }
  if (missingTiaCount > 0) {
    riskHighlights.push(
      `TIA Gap: ${missingTiaCount} restricted transfer arrangement(s) lack linked Transfer Impact Assessments.`
    );
  }

  const safeguardsList: string[] = [];
  if (profiles.length > 0) {
    safeguardsList.push(
      `Article 28 Controller-Processor binding commitments verified for ${
        profiles.filter((p) => p.dpaSigned).length
      }/${profiles.length} processors.`
    );
  }
  if (transfers.length > 0) {
    const mechanisms = Array.from(new Set(transfers.map((t) => t.transferMechanismType)));
    safeguardsList.push(`Transfer safeguards established: ${mechanisms.join(', ')}.`);
  }

  return {
    processorCount: profiles.length,
    transferCount: transfers.length,
    processors,
    transfers: transferItems,
    safeguardsSummary: safeguardsList.join(' ') || 'Standard internal organizational measures.',
    riskSummary: {
      highestCriticality,
      hasSpecialCategoryData: hasSpecialCategory,
      hasRestrictedTransfers: hasRestricted,
      hasSubprocessors,
      missingDpaCount,
      missingTiaCount,
      riskHighlights,
    },
  };
}

// -----------------------------------------------------------------------------
// PROCESSOR BREACH & INCIDENT HISTORY
// -----------------------------------------------------------------------------

export interface ProcessorBreachSummaryItem {
  id: string;
  incidentReference: string;
  title: string;
  severity: BreachSeverity;
  status: BreachStatus;
  discoveredAt: string;
  reportingSource: BreachReportingSource | null;
  processorNotificationReceivedAt: string | null;
  dpaNotified: boolean;
  affectedSystemAssetIds: string[];
  transferArrangementIds: string[];
}

export interface ProcessorBreachHistory {
  processorProfileId: string;
  totalBreachCount: number;
  activeBreachCount: number;
  reportedByProcessorCount: number;
  identifiedInternallyCount: number;
  hasCriticalOrHighBreaches: boolean;
  breaches: ProcessorBreachSummaryItem[];
}

/**
 * Summarizes the personal data breach history involving a specific processor profile.
 */
export function summarizeProcessorBreachHistory(
  processorProfileId: string,
  breaches: PersonalDataBreach[]
): ProcessorBreachHistory {
  const relevantBreaches = breaches.filter((b) => b.processorProfileIds?.includes(processorProfileId));

  const items: ProcessorBreachSummaryItem[] = relevantBreaches.map((b) => ({
    id: b.id,
    incidentReference: b.incidentReference,
    title: b.title,
    severity: b.severity,
    status: b.status,
    discoveredAt: b.discoveredAt,
    reportingSource: b.reportingSource || null,
    processorNotificationReceivedAt: b.processorNotificationReceivedAt || null,
    dpaNotified: Boolean(b.dpaNotifiedAt),
    affectedSystemAssetIds: b.affectedSystemAssetIds || [],
    transferArrangementIds: b.transferArrangementIds || [],
  }));

  const activeBreaches = items.filter((b) => b.status !== 'closed');
  const reportedByProcessor = items.filter((b) => b.reportingSource === 'reported_by_processor');
  const identifiedInternally = items.filter((b) => b.reportingSource === 'identified_internally');
  const hasCriticalOrHigh = items.some((b) => b.severity === 'critical' || b.severity === 'high');

  return {
    processorProfileId,
    totalBreachCount: items.length,
    activeBreachCount: activeBreaches.length,
    reportedByProcessorCount: reportedByProcessor.length,
    identifiedInternallyCount: identifiedInternally.length,
    hasCriticalOrHighBreaches: hasCriticalOrHigh,
    breaches: items,
  };
}

// -----------------------------------------------------------------------------
// PROCESSOR & SYSTEM ASSET RELATIONSHIPS & REVERSE VISIBILITY
// -----------------------------------------------------------------------------

export interface SystemProcessorLinkItem {
  processorProfileId: string;
  vendorId: string;
  engagementName?: string | null;
  processorRole: ProcessorRole;
  criticality: ProcessorCriticality;
  relationshipType: ProcessorSystemRelationshipType;
  relationshipDescription?: string | null;
  dpaSigned: boolean;
  isSpecialCategoryData: boolean;
}

export interface SystemProcessorView {
  systemAssetId: string;
  systemAssetName: string;
  assetType: string;
  criticality: string;
  dataClassification: string;
  processorCount: number;
  processors: SystemProcessorLinkItem[];
}

export interface ProcessorSystemLinkItem {
  systemAssetId: string;
  systemAssetName: string;
  assetType: string;
  criticality: string;
  dataClassification: string;
  relationshipType: ProcessorSystemRelationshipType;
  relationshipDescription?: string | null;
  containsPersonalData: boolean;
  containsSpecialCategoryData: boolean;
}

export interface ProcessorSystemView {
  processorProfileId: string;
  vendorId: string;
  processorRole: ProcessorRole;
  criticality: ProcessorCriticality;
  systemCount: number;
  systems: ProcessorSystemLinkItem[];
}

/**
 * Builds reverse visibility view: Processors used by a system asset.
 */
export function buildSystemProcessorView(
  system: SystemAsset,
  profiles: ProcessorProfile[]
): SystemProcessorView {
  const relMap = new Map<string, { type: ProcessorSystemRelationshipType; desc?: string | null }>();
  (system.processorRelationships || []).forEach((r) => {
    relMap.set(r.processorProfileId, { type: r.relationshipType, desc: r.relationshipDescription });
  });

  const relevantProfiles = profiles.filter(
    (p) =>
      system.processorProfileIds?.includes(p.id) ||
      p.linkedSystemAssetIds?.includes(system.id) ||
      relMap.has(p.id)
  );

  const processors: SystemProcessorLinkItem[] = relevantProfiles.map((p) => {
    let relType: ProcessorSystemRelationshipType = 'other';
    let relDesc: string | null = null;

    const fromMap = relMap.get(p.id);
    if (fromMap) {
      relType = fromMap.type;
      relDesc = fromMap.desc || null;
    } else {
      const fromProfile = p.systemAssetRelationships?.find((r) => r.systemAssetId === system.id);
      if (fromProfile) {
        relType = fromProfile.relationshipType;
        relDesc = fromProfile.relationshipDescription || null;
      }
    }

    return {
      processorProfileId: p.id,
      vendorId: p.vendorId,
      engagementName: p.engagementName || null,
      processorRole: p.processorRole,
      criticality: p.criticality,
      relationshipType: relType,
      relationshipDescription: relDesc,
      dpaSigned: p.dpaSigned,
      isSpecialCategoryData: p.isSpecialCategoryData,
    };
  });

  return {
    systemAssetId: system.id,
    systemAssetName: system.name,
    assetType: system.assetType,
    criticality: system.criticality,
    dataClassification: system.dataClassification,
    processorCount: processors.length,
    processors,
  };
}

/**
 * Builds reverse visibility view: Systems supported by a processor profile.
 */
export function buildProcessorSystemView(
  profile: ProcessorProfile,
  systems: SystemAsset[]
): ProcessorSystemView {
  const relMap = new Map<string, { type: ProcessorSystemRelationshipType; desc?: string | null }>();
  (profile.systemAssetRelationships || []).forEach((r) => {
    relMap.set(r.systemAssetId, { type: r.relationshipType, desc: r.relationshipDescription });
  });

  const relevantSystems = systems.filter(
    (s) =>
      profile.linkedSystemAssetIds?.includes(s.id) ||
      s.processorProfileIds?.includes(profile.id) ||
      relMap.has(s.id)
  );

  const systemItems: ProcessorSystemLinkItem[] = relevantSystems.map((s) => {
    let relType: ProcessorSystemRelationshipType = 'other';
    let relDesc: string | null = null;

    const fromMap = relMap.get(s.id);
    if (fromMap) {
      relType = fromMap.type;
      relDesc = fromMap.desc || null;
    } else {
      const fromSystem = s.processorRelationships?.find((r) => r.processorProfileId === profile.id);
      if (fromSystem) {
        relType = fromSystem.relationshipType;
        relDesc = fromSystem.relationshipDescription || null;
      }
    }

    return {
      systemAssetId: s.id,
      systemAssetName: s.name,
      assetType: s.assetType,
      criticality: s.criticality,
      dataClassification: s.dataClassification,
      relationshipType: relType,
      relationshipDescription: relDesc,
      containsPersonalData: s.containsPersonalData,
      containsSpecialCategoryData: s.containsSpecialCategoryData,
    };
  });

  return {
    processorProfileId: profile.id,
    vendorId: profile.vendorId,
    processorRole: profile.processorRole,
    criticality: profile.criticality,
    systemCount: systemItems.length,
    systems: systemItems,
  };
}

// -----------------------------------------------------------------------------
// PROCESSOR RISK EVALUATION & DERIVED RISK FLAGS
// -----------------------------------------------------------------------------

export type DerivedProcessorRiskRuleCode =
  | 'RESTRICTED_TRANSFER_NO_MECHANISM'
  | 'SCC_NO_EVIDENCE_ATTACHED'
  | 'TRANSFER_MECHANISM_EXPIRED_OR_REVIEW_OVERDUE'
  | 'HIGH_CRITICALITY_REVIEW_OVERDUE'
  | 'SUBPROCESSORS_NO_SUPPORTING_DOCS'
  | 'RESTRICTED_TRANSFER_MISSING_TIA'
  | 'SPECIAL_CATEGORY_MISSING_DPA';

export interface DerivedProcessorRiskFlag {
  ruleCode: DerivedProcessorRiskRuleCode;
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  description: string;
  suggestedTreatment: string;
  inherentLikelihood: number; // 1-5
  inherentImpact: number; // 1-5
  inherentScore: number;
  entityType: 'processor_profile' | 'transfer_arrangement';
  entityId: string;
  processorProfileId: string;
  transferArrangementId?: string;
  isActionable: boolean;
}

export interface ProcessorRiskEvaluationSummary {
  processorProfileId: string;
  overallRiskLevel: 'low' | 'medium' | 'high' | 'critical';
  totalDerivedFlagsCount: number;
  criticalFlagsCount: number;
  highFlagsCount: number;
  mediumFlagsCount: number;
  lowFlagsCount: number;
  flags: DerivedProcessorRiskFlag[];
  linkedRiskIds: string[];
}

/**
 * Pure deterministic risk rule engine for processor and transfer arrangements.
 * Evaluates risk flags for compliance gaps, overdue reviews, missing safeguards, and missing evidence.
 */
export function evaluateProcessorRiskFlags(
  profile: ProcessorProfile,
  transfers: TransferArrangement[] = [],
  evidenceDocs: Evidence[] = [],
  asOfDate: Date = new Date()
): ProcessorRiskEvaluationSummary {
  const flags: DerivedProcessorRiskFlag[] = [];
  const seenFlagKeys = new Set<string>();

  const addFlag = (flag: DerivedProcessorRiskFlag) => {
    const key = `${flag.ruleCode}_${flag.entityId}`;
    if (!seenFlagKeys.has(key)) {
      seenFlagKeys.add(key);
      flags.push(flag);
    }
  };

  const nowMillis = asOfDate.getTime();

  // 1. HIGH_CRITICALITY_REVIEW_OVERDUE
  if (
    (profile.criticality === 'critical' || profile.criticality === 'high') &&
    profile.nextReviewDate &&
    new Date(profile.nextReviewDate).getTime() < nowMillis
  ) {
    addFlag({
      ruleCode: 'HIGH_CRITICALITY_REVIEW_OVERDUE',
      severity: 'high',
      title: `High Criticality Processor Review Overdue (${profile.engagementName || profile.id})`,
      description: `Processor engagement "${profile.engagementName || profile.id}" is designated as ${profile.criticality} criticality, but its scheduled privacy review due on ${profile.nextReviewDate} is overdue.`,
      suggestedTreatment: 'Conduct formal Article 28 supplier assessment and update next review schedule.',
      inherentLikelihood: 3,
      inherentImpact: 4,
      inherentScore: 12,
      entityType: 'processor_profile',
      entityId: profile.id,
      processorProfileId: profile.id,
      isActionable: true,
    });
  }

  // 2. SPECIAL_CATEGORY_MISSING_DPA
  if (profile.isSpecialCategoryData && !profile.dpaSigned) {
    addFlag({
      ruleCode: 'SPECIAL_CATEGORY_MISSING_DPA',
      severity: 'critical',
      title: `Special Category Data Processed Without Executed DPA (${profile.engagementName || profile.id})`,
      description: `Processor engagement "${profile.engagementName || profile.id}" processes GDPR Article 9 Special Category Data without a countersigned Data Processing Agreement.`,
      suggestedTreatment: 'Immediately execute binding Article 28 DPA or halt special category data flows.',
      inherentLikelihood: 4,
      inherentImpact: 5,
      inherentScore: 20,
      entityType: 'processor_profile',
      entityId: profile.id,
      processorProfileId: profile.id,
      isActionable: true,
    });
  }

  // 3. SUBPROCESSORS_NO_SUPPORTING_DOCS (Profile level)
  const hasSubprocessorListEvidence = evidenceDocs.some(
    (e) =>
      e.category === 'subprocessor_list' ||
      e.category === 'security_report' ||
      e.category === 'soc_report' ||
      e.category === 'iso_certificate'
  );
  if (profile.processorRole === 'subprocessor' && !hasSubprocessorListEvidence) {
    addFlag({
      ruleCode: 'SUBPROCESSORS_NO_SUPPORTING_DOCS',
      severity: 'medium',
      title: `Subprocessor Role Lacks Supporting Audit Evidence (${profile.engagementName || profile.id})`,
      description: `Processor is classified as a downstream subprocessor but has no attached subprocessor authorization or third-party security assurance reports.`,
      suggestedTreatment: 'Attach vendor subprocessor notification, ISO 27001 certificate, or SOC 2 Type II report.',
      inherentLikelihood: 3,
      inherentImpact: 3,
      inherentScore: 9,
      entityType: 'processor_profile',
      entityId: profile.id,
      processorProfileId: profile.id,
      isActionable: true,
    });
  }

  // Transfer Arrangement level checks
  for (const t of transfers) {
    // 4. RESTRICTED_TRANSFER_NO_MECHANISM
    if (t.restrictedTransfer && (t.transferMechanismType === 'no_mechanism_selected' || !t.transferMechanismType)) {
      addFlag({
        ruleCode: 'RESTRICTED_TRANSFER_NO_MECHANISM',
        severity: 'critical',
        title: `Restricted International Transfer without Valid GDPR Transfer Mechanism (${t.name})`,
        description: `Transfer "${t.name}" transfers personal data outside the EU/EEA to non-adequate third countries (${t.destinationCountries.join(', ')}) without a selected Chapter V legal transfer mechanism.`,
        suggestedTreatment: 'Execute Standard Contractual Clauses (SCC) or verify Binding Corporate Rules (BCR).',
        inherentLikelihood: 4,
        inherentImpact: 5,
        inherentScore: 20,
        entityType: 'transfer_arrangement',
        entityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        isActionable: true,
      });
    }

    // 5. SCC_NO_EVIDENCE_ATTACHED
    if (
      t.transferMechanismType === 'standard_contractual_clauses' &&
      (!t.linkedEvidenceIds || t.linkedEvidenceIds.length === 0)
    ) {
      addFlag({
        ruleCode: 'SCC_NO_EVIDENCE_ATTACHED',
        severity: 'high',
        title: `Standard Contractual Clauses Selected Without Executed Evidence (${t.name})`,
        description: `Transfer "${t.name}" relies on Standard Contractual Clauses (SCC) but has no executed SCC agreement attached in the evidence repository.`,
        suggestedTreatment: 'Upload signed SCC agreement with Module annexes to Evidence repository.',
        inherentLikelihood: 3,
        inherentImpact: 4,
        inherentScore: 12,
        entityType: 'transfer_arrangement',
        entityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        isActionable: true,
      });
    }

    // 6. TRANSFER_MECHANISM_EXPIRED_OR_REVIEW_OVERDUE
    if (
      t.transferMechanismStatus === 'expired' ||
      (t.reviewDueDate && new Date(t.reviewDueDate).getTime() < nowMillis)
    ) {
      addFlag({
        ruleCode: 'TRANSFER_MECHANISM_EXPIRED_OR_REVIEW_OVERDUE',
        severity: 'high',
        title: `Transfer Mechanism Expired or Review Overdue (${t.name})`,
        description: `Transfer "${t.name}" mechanism status is ${t.transferMechanismStatus} or its scheduled review date (${t.reviewDueDate}) is past due.`,
        suggestedTreatment: 'Conduct transfer mechanism re-assessment and renew documentation.',
        inherentLikelihood: 3,
        inherentImpact: 4,
        inherentScore: 12,
        entityType: 'transfer_arrangement',
        entityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        isActionable: true,
      });
    }

    // 7. RESTRICTED_TRANSFER_MISSING_TIA
    if (t.restrictedTransfer && !t.linkedTiaId) {
      addFlag({
        ruleCode: 'RESTRICTED_TRANSFER_MISSING_TIA',
        severity: 'high',
        title: `Restricted Third-Country Transfer Missing TIA (${t.name})`,
        description: `Transfer "${t.name}" transfers personal data to ${t.destinationCountries.join(', ')} without a linked Transfer Impact Assessment (Schrems II requirement).`,
        suggestedTreatment: 'Create and complete a Transfer Impact Assessment assessing destination country legal surveillance risks.',
        inherentLikelihood: 4,
        inherentImpact: 4,
        inherentScore: 16,
        entityType: 'transfer_arrangement',
        entityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        isActionable: true,
      });
    }

    // 8. SUBPROCESSORS_NO_SUPPORTING_DOCS (Transfer level)
    if (t.subprocessorInvolvement && (!t.linkedEvidenceIds || t.linkedEvidenceIds.length === 0)) {
      addFlag({
        ruleCode: 'SUBPROCESSORS_NO_SUPPORTING_DOCS',
        severity: 'medium',
        title: `Subprocessors Involved in Transfer Without Attached Documentation (${t.name})`,
        description: `Transfer arrangement "${t.name}" involves third-country onward subprocessors without attached subprocessor list or SOC/ISO audit evidence.`,
        suggestedTreatment: 'Link subprocessor schedule or security certification evidence to transfer arrangement.',
        inherentLikelihood: 3,
        inherentImpact: 3,
        inherentScore: 9,
        entityType: 'transfer_arrangement',
        entityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        isActionable: true,
      });
    }
  }

  const criticalCount = flags.filter((f) => f.severity === 'critical').length;
  const highCount = flags.filter((f) => f.severity === 'high').length;
  const mediumCount = flags.filter((f) => f.severity === 'medium').length;
  const lowCount = flags.filter((f) => f.severity === 'low').length;

  let overallRiskLevel: 'low' | 'medium' | 'high' | 'critical' = 'low';
  if (criticalCount > 0) overallRiskLevel = 'critical';
  else if (highCount > 0) overallRiskLevel = 'high';
  else if (mediumCount > 0) overallRiskLevel = 'medium';

  return {
    processorProfileId: profile.id,
    overallRiskLevel,
    totalDerivedFlagsCount: flags.length,
    criticalFlagsCount: criticalCount,
    highFlagsCount: highCount,
    mediumFlagsCount: mediumCount,
    lowFlagsCount: lowCount,
    flags,
    linkedRiskIds: profile.linkedRiskIds || [],
  };
}

// -----------------------------------------------------------------------------
// PROCESSOR & TRANSFER REVIEW REMINDERS & LIFECYCLE NOTIFICATIONS
// -----------------------------------------------------------------------------

export interface ProcessorReminderCandidate {
  id: string; // Idempotency key: e.g. `${reminderType}_${sourceEntityId}_${dueDate || 'pending'}`
  reminderType: NotificationType;
  priority: NotificationPriority;
  title: string;
  message: string;
  sourceEntityType: 'processor_profile' | 'transfer_arrangement';
  sourceEntityId: string;
  processorProfileId: string;
  transferArrangementId?: string;
  targetRecipientRole?: 'privacy_manager' | 'compliance_manager' | 'security_manager';
  recipientUserId?: string | null;
  dueDate?: string | null;
  linkUrl: string;
}

export interface EvaluateRemindersOptions {
  windowDays?: number; // default 30 days ahead of due date
  asOfDate?: Date;
}

/**
 * Pure evaluator for periodic review reminders, DPA renewals, SCC checks, TIA deadlines, and missing evidence follow-ups.
 */
export function evaluateProcessorReminders(
  profile: ProcessorProfile,
  transfers: TransferArrangement[] = [],
  evidenceDocs: Evidence[] = [],
  options: EvaluateRemindersOptions = {}
): ProcessorReminderCandidate[] {
  const { windowDays = 30, asOfDate = new Date() } = options;
  const nowMillis = asOfDate.getTime();
  const windowMillis = windowDays * 24 * 60 * 60 * 1000;
  const reminders: ProcessorReminderCandidate[] = [];
  const seenIds = new Set<string>();

  const addReminder = (candidate: ProcessorReminderCandidate) => {
    if (!seenIds.has(candidate.id)) {
      seenIds.add(candidate.id);
      reminders.push(candidate);
    }
  };

  const recipientId = profile.ownerUserId || profile.ownerId || null;

  // 1. Annual / Periodic Processor Review Due
  if (profile.nextReviewDate) {
    const nextReviewMillis = new Date(profile.nextReviewDate).getTime();
    const isOverdue = nextReviewMillis < nowMillis;
    const isUpcoming = nextReviewMillis - nowMillis <= windowMillis && !isOverdue;

    if (isOverdue || isUpcoming) {
      const priority: NotificationPriority = isOverdue ? 'high' : 'medium';
      const statusText = isOverdue ? 'is OVERDUE' : `is due on ${profile.nextReviewDate.slice(0, 10)}`;
      addReminder({
        id: `processor_annual_review_due_${profile.id}_${profile.nextReviewDate.slice(0, 10)}`,
        reminderType: 'processor_annual_review_due',
        priority,
        title: `Processor Review Due: ${profile.engagementName || profile.id}`,
        message: `The scheduled privacy review for processor "${profile.engagementName || profile.id}" ${statusText}. Please conduct Article 28 supplier review.`,
        sourceEntityType: 'processor_profile',
        sourceEntityId: profile.id,
        processorProfileId: profile.id,
        targetRecipientRole: 'privacy_manager',
        recipientUserId: recipientId,
        dueDate: profile.nextReviewDate,
        linkUrl: `/processors/${profile.id}`,
      });
    }
  }

  // 2. DPA Renewal Due / Missing DPA
  if (!profile.dpaSigned) {
    addReminder({
      id: `dpa_renewal_due_${profile.id}_missing`,
      reminderType: 'dpa_renewal_due',
      priority: profile.isSpecialCategoryData ? 'urgent' : 'high',
      title: `Missing Executed DPA: ${profile.engagementName || profile.id}`,
      message: `Processor engagement "${profile.engagementName || profile.id}" lacks a signed Article 28 Data Processing Agreement.`,
      sourceEntityType: 'processor_profile',
      sourceEntityId: profile.id,
      processorProfileId: profile.id,
      targetRecipientRole: 'privacy_manager',
      recipientUserId: recipientId,
      dueDate: null,
      linkUrl: `/processors/${profile.id}`,
    });
  }

  // 3. Missing Evidence Follow-up on Profile
  if (profile.dpaSigned && !profile.linkedDpaEvidenceId) {
    addReminder({
      id: `missing_evidence_follow_up_${profile.id}_dpa_doc`,
      reminderType: 'missing_evidence_follow_up',
      priority: 'medium',
      title: `Attach Executed DPA PDF: ${profile.engagementName || profile.id}`,
      message: `Processor "${profile.engagementName || profile.id}" is marked as DPA signed, but no countersigned DPA document has been linked in the Evidence Repository.`,
      sourceEntityType: 'processor_profile',
      sourceEntityId: profile.id,
      processorProfileId: profile.id,
      targetRecipientRole: 'compliance_manager',
      recipientUserId: recipientId,
      dueDate: null,
      linkUrl: `/processors/${profile.id}`,
    });
  }

  // Transfer Arrangement Level Reminders
  for (const t of transfers) {
    const transferRecipientId = t.ownerId || recipientId;

    // 4. SCC Review Due
    if (t.transferMechanismType === 'standard_contractual_clauses') {
      if (t.reviewDueDate) {
        const sccReviewMillis = new Date(t.reviewDueDate).getTime();
        const isOverdue = sccReviewMillis < nowMillis;
        const isUpcoming = sccReviewMillis - nowMillis <= windowMillis && !isOverdue;

        if (isOverdue || isUpcoming) {
          addReminder({
            id: `scc_review_due_${t.id}_${t.reviewDueDate.slice(0, 10)}`,
            reminderType: 'scc_review_due',
            priority: isOverdue ? 'high' : 'medium',
            title: `Standard Contractual Clauses Review Due: ${t.name}`,
            message: `The Standard Contractual Clauses (SCC) mechanism for transfer "${t.name}" ${isOverdue ? 'is OVERDUE' : `is due for periodic review on ${t.reviewDueDate.slice(0, 10)}`}.`,
            sourceEntityType: 'transfer_arrangement',
            sourceEntityId: t.id,
            processorProfileId: profile.id,
            transferArrangementId: t.id,
            targetRecipientRole: 'privacy_manager',
            recipientUserId: transferRecipientId,
            dueDate: t.reviewDueDate,
            linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
          });
        }
      }

      // Missing SCC Evidence
      if (!t.linkedEvidenceIds || t.linkedEvidenceIds.length === 0) {
        addReminder({
          id: `missing_evidence_follow_up_${t.id}_scc_doc`,
          reminderType: 'missing_evidence_follow_up',
          priority: 'high',
          title: `Upload Signed SCC Contract: ${t.name}`,
          message: `Transfer arrangement "${t.name}" designates SCCs as its Chapter V legal mechanism but has no attached contract PDF in the evidence repository.`,
          sourceEntityType: 'transfer_arrangement',
          sourceEntityId: t.id,
          processorProfileId: profile.id,
          transferArrangementId: t.id,
          targetRecipientRole: 'compliance_manager',
          recipientUserId: transferRecipientId,
          dueDate: null,
          linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
        });
      }
    }

    // 5. Transfer Arrangement Review Due (Other mechanisms)
    if (t.transferMechanismType !== 'standard_contractual_clauses' && t.reviewDueDate) {
      const reviewMillis = new Date(t.reviewDueDate).getTime();
      const isOverdue = reviewMillis < nowMillis;
      const isUpcoming = reviewMillis - nowMillis <= windowMillis && !isOverdue;

      if (isOverdue || isUpcoming) {
        addReminder({
          id: `transfer_arrangement_review_due_${t.id}_${t.reviewDueDate.slice(0, 10)}`,
          reminderType: 'transfer_arrangement_review_due',
          priority: isOverdue ? 'high' : 'medium',
          title: `Transfer Arrangement Review Due: ${t.name}`,
          message: `Transfer arrangement "${t.name}" (${t.transferMechanismType}) review ${isOverdue ? 'is OVERDUE' : `is due on ${t.reviewDueDate.slice(0, 10)}`}.`,
          sourceEntityType: 'transfer_arrangement',
          sourceEntityId: t.id,
          processorProfileId: profile.id,
          transferArrangementId: t.id,
          targetRecipientRole: 'privacy_manager',
          recipientUserId: transferRecipientId,
          dueDate: t.reviewDueDate,
          linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
        });
      }
    }

    // 6. TIA Stale / Review Due
    if (t.restrictedTransfer && !t.linkedTiaId) {
      addReminder({
        id: `tia_review_due_${t.id}_missing`,
        reminderType: 'tia_review_due',
        priority: 'high',
        title: `Transfer Impact Assessment (TIA) Required: ${t.name}`,
        message: `Restricted transfer "${t.name}" to non-adequate third countries (${t.destinationCountries.join(', ')}) requires a completed Transfer Impact Assessment (TIA).`,
        sourceEntityType: 'transfer_arrangement',
        sourceEntityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        targetRecipientRole: 'privacy_manager',
        recipientUserId: transferRecipientId,
        dueDate: null,
        linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
      });
    }

    // 7. Missing Subprocessor documentation
    if (t.subprocessorInvolvement && (!t.linkedEvidenceIds || t.linkedEvidenceIds.length === 0)) {
      addReminder({
        id: `missing_evidence_follow_up_${t.id}_subprocessors`,
        reminderType: 'missing_evidence_follow_up',
        priority: 'medium',
        title: `Attach Subprocessor Authorization Schedule: ${t.name}`,
        message: `Transfer arrangement "${t.name}" indicates subprocessor involvement without attached subprocessor authorization or SOC/ISO audit reports.`,
        sourceEntityType: 'transfer_arrangement',
        sourceEntityId: t.id,
        processorProfileId: profile.id,
        transferArrangementId: t.id,
        targetRecipientRole: 'compliance_manager',
        recipientUserId: transferRecipientId,
        dueDate: null,
        linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
      });
    }

    // 8. Evidence Expiring Soon / Expired
    if (t.linkedEvidenceIds && t.linkedEvidenceIds.length > 0 && evidenceDocs.length > 0) {
      for (const evId of t.linkedEvidenceIds) {
        const evDoc = evidenceDocs.find((e) => e.id === evId);
        if (evDoc?.reviewDueDate) {
          const evExpiryMillis = new Date(evDoc.reviewDueDate).getTime();
          const isExpired = evExpiryMillis < nowMillis;
          const isExpiring = evExpiryMillis - nowMillis <= windowMillis && !isExpired;

          if (isExpired || isExpiring) {
            addReminder({
              id: `missing_evidence_follow_up_${t.id}_evidence_expired_${evId}`,
              reminderType: 'missing_evidence_follow_up',
              priority: isExpired ? 'high' : 'medium',
              title: `Evidence Review Due: ${evDoc.title || evId}`,
              message: `Evidence document "${evDoc.title || evId}" attached to transfer "${t.name}" ${isExpired ? 'is OVERDUE for review' : `is due for renewal/review on ${evDoc.reviewDueDate.slice(0, 10)}`}. Please obtain updated compliance documentation.`,
              sourceEntityType: 'transfer_arrangement',
              sourceEntityId: t.id,
              processorProfileId: profile.id,
              transferArrangementId: t.id,
              targetRecipientRole: 'compliance_manager',
              recipientUserId: transferRecipientId,
              dueDate: evDoc.reviewDueDate,
              linkUrl: `/processors/${profile.id}/transfers/${t.id}`,
            });
          }
        }
      }
    }
  }

  return reminders;
}

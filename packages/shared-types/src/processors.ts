import { BaseEntity } from './core.js';

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

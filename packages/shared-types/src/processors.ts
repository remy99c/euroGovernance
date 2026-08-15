import { BaseEntity, UserRole } from './core.js';
import { Evidence, EvidenceCategory, EvidenceStatus, ProcessorSystemRelationshipType, SystemAsset, Control, Vendor } from './grc.js';
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
  latestAssessmentRequestId?: string | null;
  latestAssessmentSubmissionId?: string | null;
  latestAssessmentScorePercent?: number | null;
  latestAssessmentDate?: string | null;
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
// STRUCTURED PROCESSOR CERTIFICATIONS & ASSURANCE
// -----------------------------------------------------------------------------

export type AssuranceArtifactKind =
  | 'accredited_certification'
  | 'independent_attestation_report'
  | 'regulatory_declaration'
  | 'code_of_conduct'
  | 'industry_label'
  | 'self_assessment'
  | 'custom_assurance';

export const VALID_ASSURANCE_ARTIFACT_KINDS: readonly AssuranceArtifactKind[] = [
  'accredited_certification',
  'independent_attestation_report',
  'regulatory_declaration',
  'code_of_conduct',
  'industry_label',
  'self_assessment',
  'custom_assurance',
] as const;

export type AssuranceStandardFamily =
  | 'iso_27001'
  | 'iso_27701'
  | 'iso_42001'
  | 'iso_22301'
  | 'soc1_type2'
  | 'soc2_type1'
  | 'soc2_type2'
  | 'soc3'
  | 'bsi_c5'
  | 'tisax'
  | 'cyber_essentials_plus'
  | 'gdpr_art42_europrivacy'
  | 'pci_dss_aoc'
  | 'hipaa_security'
  | 'dpf_self_certification'
  | 'csa_star'
  | 'other';

export const VALID_ASSURANCE_STANDARD_FAMILIES: readonly AssuranceStandardFamily[] = [
  'iso_27001',
  'iso_27701',
  'iso_42001',
  'iso_22301',
  'soc1_type2',
  'soc2_type1',
  'soc2_type2',
  'soc3',
  'bsi_c5',
  'tisax',
  'cyber_essentials_plus',
  'gdpr_art42_europrivacy',
  'pci_dss_aoc',
  'hipaa_security',
  'dpf_self_certification',
  'csa_star',
  'other',
] as const;

export type AssuranceIssuingBodyType =
  | 'accredited_registrar'
  | 'cpa_firm_auditor'
  | 'regulatory_authority'
  | 'industry_consortium'
  | 'self_attestation'
  | 'other';

export type AssuranceCategory =
  | 'information_security'
  | 'privacy_dataprotection'
  | 'business_continuity'
  | 'ai_governance'
  | 'cloud_security'
  | 'industry_compliance'
  | 'regulatory_trade'
  | 'custom';

export interface AssuranceStandardTaxonomyDefinition {
  family: AssuranceStandardFamily;
  displayName: string;
  shortLabel: string;
  defaultArtifactKind: AssuranceArtifactKind;
  description: string;
  issuingBodyType: AssuranceIssuingBodyType;
  standardValidityMonths: number | null;
  requiresReportPeriod: boolean;
  supportsPointInTime: boolean;
  requiresAnnualSurveillance: boolean;
  category: AssuranceCategory;
}

export const ASSURANCE_ARTIFACT_KIND_LABELS: Record<
  AssuranceArtifactKind,
  { label: string; description: string; shortLabel: string }
> = {
  accredited_certification: {
    label: 'Accredited Certification',
    description: 'Formal ISO/IEC or statutory certificate issued by an accredited certification body.',
    shortLabel: 'Certification',
  },
  independent_attestation_report: {
    label: 'Independent Attestation Report',
    description: 'Independent CPA / auditor opinion report over controls design and operating effectiveness (e.g. SOC 1, SOC 2, BSI C5).',
    shortLabel: 'Attestation',
  },
  regulatory_declaration: {
    label: 'Regulatory Declaration',
    description: 'Statutory registration or public compliance declaration (e.g. EU-US DPF, HIPAA statement).',
    shortLabel: 'Declaration',
  },
  code_of_conduct: {
    label: 'Approved Code of Conduct',
    description: 'Adherence to an officially approved sector-specific Code of Conduct under GDPR Article 40.',
    shortLabel: 'Code of Conduct',
  },
  industry_label: {
    label: 'Industry Trust Label',
    description: 'Industry-recognized assurance label or assessment exchange credential (e.g. TISAX, CSA STAR, Cyber Essentials Plus).',
    shortLabel: 'Industry Label',
  },
  self_assessment: {
    label: 'Vendor Self-Assessment',
    description: 'First-party security questionnaire, CAIQ, or vendor compliance self-attestation.',
    shortLabel: 'Self-Assessment',
  },
  custom_assurance: {
    label: 'Custom Assurance / Audit',
    description: 'Bespoke customer security audit, penetration test summary, or custom assurance artifact.',
    shortLabel: 'Custom Assurance',
  },
};

export const ASSURANCE_TAXONOMY_MAP: Record<AssuranceStandardFamily, AssuranceStandardTaxonomyDefinition> = {
  iso_27001: {
    family: 'iso_27001',
    displayName: 'ISO/IEC 27001:2022 (ISMS)',
    shortLabel: 'ISO 27001',
    defaultArtifactKind: 'accredited_certification',
    description: 'Information Security Management System accredited certification.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'information_security',
  },
  iso_27701: {
    family: 'iso_27701',
    displayName: 'ISO/IEC 27701:2019 (PIMS)',
    shortLabel: 'ISO 27701',
    defaultArtifactKind: 'accredited_certification',
    description: 'Privacy Information Management System accredited extension to ISO 27001.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'privacy_dataprotection',
  },
  iso_42001: {
    family: 'iso_42001',
    displayName: 'ISO/IEC 42001:2023 (AIMS)',
    shortLabel: 'ISO 42001',
    defaultArtifactKind: 'accredited_certification',
    description: 'Artificial Intelligence Management System accredited certification.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'ai_governance',
  },
  iso_22301: {
    family: 'iso_22301',
    displayName: 'ISO 22301:2019 (BCMS)',
    shortLabel: 'ISO 22301',
    defaultArtifactKind: 'accredited_certification',
    description: 'Security and resilience — Business continuity management systems.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'business_continuity',
  },
  soc1_type2: {
    family: 'soc1_type2',
    displayName: 'SOC 1 Type II (SSAE 18 / ISAE 3402)',
    shortLabel: 'SOC 1 Type II',
    defaultArtifactKind: 'independent_attestation_report',
    description: 'Report on controls relevant to user entities internal control over financial reporting.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: true,
    supportsPointInTime: false,
    requiresAnnualSurveillance: false,
    category: 'industry_compliance',
  },
  soc2_type1: {
    family: 'soc2_type1',
    displayName: 'SOC 2 Type I (Point-in-Time Design)',
    shortLabel: 'SOC 2 Type I',
    defaultArtifactKind: 'independent_attestation_report',
    description: 'Report on controls design at a specified point in time for Trust Services Criteria.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'information_security',
  },
  soc2_type2: {
    family: 'soc2_type2',
    displayName: 'SOC 2 Type II (Operating Effectiveness)',
    shortLabel: 'SOC 2 Type II',
    defaultArtifactKind: 'independent_attestation_report',
    description: 'Report on controls operating effectiveness over a testing period for Trust Services Criteria.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: true,
    supportsPointInTime: false,
    requiresAnnualSurveillance: false,
    category: 'information_security',
  },
  soc3: {
    family: 'soc3',
    displayName: 'SOC 3 General Use Attestation Report',
    shortLabel: 'SOC 3',
    defaultArtifactKind: 'independent_attestation_report',
    description: 'Public Trust Services Report based on SOC 2 criteria.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: true,
    supportsPointInTime: false,
    requiresAnnualSurveillance: false,
    category: 'information_security',
  },
  bsi_c5: {
    family: 'bsi_c5',
    displayName: 'BSI C5:2020 (Cloud Computing Compliance Criteria)',
    shortLabel: 'BSI C5',
    defaultArtifactKind: 'independent_attestation_report',
    description: 'German Federal Office for Information Security Cloud Computing Compliance Criteria Catalogue (Type 2).',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: true,
    supportsPointInTime: false,
    requiresAnnualSurveillance: false,
    category: 'cloud_security',
  },
  tisax: {
    family: 'tisax',
    displayName: 'TISAX (Trusted Information Security Assessment Exchange)',
    shortLabel: 'TISAX',
    defaultArtifactKind: 'industry_label',
    description: 'Automotive industry information security standard administered by ENX.',
    issuingBodyType: 'industry_consortium',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'industry_compliance',
  },
  cyber_essentials_plus: {
    family: 'cyber_essentials_plus',
    displayName: 'Cyber Essentials Plus (NCSC UK)',
    shortLabel: 'Cyber Essentials Plus',
    defaultArtifactKind: 'industry_label',
    description: 'UK National Cyber Security Centre hands-on technical verification.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 12,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'information_security',
  },
  gdpr_art42_europrivacy: {
    family: 'gdpr_art42_europrivacy',
    displayName: 'Europrivacy GDPR Article 42 Certification',
    shortLabel: 'Europrivacy Art. 42',
    defaultArtifactKind: 'accredited_certification',
    description: 'Official EDPB-approved European Data Protection Seal under GDPR Article 42.',
    issuingBodyType: 'accredited_registrar',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'privacy_dataprotection',
  },
  pci_dss_aoc: {
    family: 'pci_dss_aoc',
    displayName: 'PCI-DSS Attestation of Compliance (AoC v4.0)',
    shortLabel: 'PCI-DSS AoC',
    defaultArtifactKind: 'industry_label',
    description: 'Payment Card Industry Data Security Standard formal Attestation of Compliance.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'industry_compliance',
  },
  hipaa_security: {
    family: 'hipaa_security',
    displayName: 'HIPAA Security & Privacy Assessment Report',
    shortLabel: 'HIPAA Assessment',
    defaultArtifactKind: 'custom_assurance',
    description: 'Health Insurance Portability and Accountability Act third-party security evaluation.',
    issuingBodyType: 'cpa_firm_auditor',
    standardValidityMonths: 12,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'privacy_dataprotection',
  },
  dpf_self_certification: {
    family: 'dpf_self_certification',
    displayName: 'EU-US Data Privacy Framework (DPF) Self-Certification',
    shortLabel: 'EU-US DPF',
    defaultArtifactKind: 'regulatory_declaration',
    description: 'US Department of Commerce active DPF List registration and adequacy declaration.',
    issuingBodyType: 'regulatory_authority',
    standardValidityMonths: 12,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'regulatory_trade',
  },
  csa_star: {
    family: 'csa_star',
    displayName: 'CSA STAR (Cloud Security Alliance Level 1 / Level 2)',
    shortLabel: 'CSA STAR',
    defaultArtifactKind: 'industry_label',
    description: 'Security Trust Assurance and Risk registry based on Cloud Controls Matrix (CCM).',
    issuingBodyType: 'industry_consortium',
    standardValidityMonths: 36,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: true,
    category: 'cloud_security',
  },
  other: {
    family: 'other',
    displayName: 'Custom Third-Party Assurance / Audit Report',
    shortLabel: 'Custom Assurance',
    defaultArtifactKind: 'custom_assurance',
    description: 'Bespoke third-party security assessment, penetration test, or client audit.',
    issuingBodyType: 'other',
    standardValidityMonths: null,
    requiresReportPeriod: false,
    supportsPointInTime: true,
    requiresAnnualSurveillance: false,
    category: 'custom',
  },
};

/**
 * Returns taxonomy metadata for a given assurance standard family.
 */
export function getAssuranceTaxonomy(family: AssuranceStandardFamily): AssuranceStandardTaxonomyDefinition {
  return ASSURANCE_TAXONOMY_MAP[family] || ASSURANCE_TAXONOMY_MAP.other;
}

/**
 * Returns user-facing formatted display name for an assurance standard.
 */
export function getAssuranceDisplayName(family: AssuranceStandardFamily, customName?: string | null): string {
  if (family === 'other' && customName?.trim()) {
    return customName.trim();
  }
  return ASSURANCE_TAXONOMY_MAP[family]?.displayName || 'Third-Party Assurance';
}

/**
 * Returns user-facing label for an assurance artifact kind.
 */
export function getAssuranceArtifactKindLabel(kind: AssuranceArtifactKind): string {
  return ASSURANCE_ARTIFACT_KIND_LABELS[kind]?.label || 'Assurance Artifact';
}

/**
 * Validates metadata rules for an assurance artifact (e.g. period-of-time rules for SOC 2 Type II vs point-in-time certificates).
 */
export function validateAssuranceMetadataRules(cert: Partial<ProcessorCertification>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!cert.standardFamily || !VALID_ASSURANCE_STANDARD_FAMILIES.includes(cert.standardFamily)) {
    errors.push(`standardFamily must be one of: ${VALID_ASSURANCE_STANDARD_FAMILIES.join(', ')}.`);
    return { valid: false, errors };
  }

  const taxonomy = getAssuranceTaxonomy(cert.standardFamily);

  // Custom standard validation
  if (cert.standardFamily === 'other') {
    if (!cert.customStandardName || typeof cert.customStandardName !== 'string' || cert.customStandardName.trim().length < 2) {
      errors.push('customStandardName is required and must be at least 2 characters long when standardFamily is "other".');
    }
  }

  // Report period enforcement
  if (taxonomy.requiresReportPeriod) {
    if (!cert.reportPeriodStart || typeof cert.reportPeriodStart !== 'string' || isNaN(new Date(cert.reportPeriodStart).getTime())) {
      errors.push(`reportPeriodStart is required for period-of-time assurance reports (${taxonomy.displayName}).`);
    }
    if (!cert.reportPeriodEnd || typeof cert.reportPeriodEnd !== 'string' || isNaN(new Date(cert.reportPeriodEnd).getTime())) {
      errors.push(`reportPeriodEnd is required for period-of-time assurance reports (${taxonomy.displayName}).`);
    }
  }

  if (cert.reportPeriodStart && cert.reportPeriodEnd) {
    if (new Date(cert.reportPeriodStart).getTime() > new Date(cert.reportPeriodEnd).getTime()) {
      errors.push('reportPeriodStart cannot be after reportPeriodEnd.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export type ProcessorCertificationStatus =
  | 'active_valid'
  | 'expiring_soon'
  | 'expired'
  | 'under_review'
  | 'superseded'
  | 'revoked'
  | 'suspended';

export const VALID_PROCESSOR_CERTIFICATION_STATUSES: readonly ProcessorCertificationStatus[] = [
  'active_valid',
  'expiring_soon',
  'expired',
  'under_review',
  'superseded',
  'revoked',
  'suspended',
] as const;

export type ProcessorCertificationReviewStatus =
  | 'pending'
  | 'in_review'
  | 'accepted'
  | 'rejected'
  | 'insufficient'
  | 'expired'
  | 'superseded';

export const VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES: readonly ProcessorCertificationReviewStatus[] = [
  'pending',
  'in_review',
  'accepted',
  'rejected',
  'insufficient',
  'expired',
  'superseded',
] as const;

/**
 * Structured Processor Certification / Attestation Record
 * Firestore path: /tenants/{tenantId}/processor_certifications/{certId}
 * Models third-party security, privacy, and regulatory assurance linked to a ProcessorProfile.
 */
export interface ProcessorCertification extends BaseEntity {
  tenantId: string;
  processorProfileId: string; // FK to /tenants/{tenantId}/processor_profiles/{profileId}
  vendorId?: string; // FK to /tenants/{tenantId}/vendors/{vendorId} for denormalized querying
  artifactKind: AssuranceArtifactKind;
  standardFamily: AssuranceStandardFamily;
  customStandardName?: string | null;
  issuingBodyOrAuditor: string; // e.g. 'TÜV Rheinland', 'PwC GmbH', 'BSI Group', 'Schellman'
  leadAuditorName?: string | null;
  certificateOrReportNumber: string; // e.g. '01 104 219804', 'PWC-SOC2-2025'
  reportPeriodStart?: string | null; // ISO 8601 UTC date (relevant for SOC 1/2/3, C5 period-of-time attestations)
  reportPeriodEnd?: string | null; // ISO 8601 UTC date
  validFrom: string; // ISO 8601 UTC date (issue date or start of validity)
  validUntil: string; // ISO 8601 UTC date (expiry date or renewal deadline)
  status: ProcessorCertificationStatus;
  assuranceScopeSummary: string; // Narrative of systems, infrastructure, and physical boundaries covered
  legalEntityOrRegionalScope: string; // e.g. 'Amazon Web Services EMEA SARL (Frankfurt, Dublin, Paris)'
  systemsOrServicesCovered: string[]; // e.g. ['Compute', 'Storage', 'Database', 'Telemetry']
  notes?: string | null;
  reviewOwnerUserId: string; // UID of assigned internal risk/compliance reviewer
  reviewStatus: ProcessorCertificationReviewStatus;
  reviewNotes?: string | null; // Reviewer rationale / review observations
  rejectionReason?: string | null; // Reason if rejected
  reviewedBy?: string | null; // User UID of reviewer
  reviewerEmail?: string | null; // Email of reviewer
  reviewedAt?: string | null; // ISO timestamp of review action
  isInsufficient?: boolean; // True if marked insufficient despite active validity dates
  insufficientRationale?: string | null; // Compliance rationale explaining why artifact is deemed insufficient
  replacedByCertificationId?: string | null; // Forward pointer to newer replacing certification
  replacesCertificationId?: string | null; // Backward pointer to superseded historic certification
  versionNumber?: number; // Sequential assurance version (1, 2, 3...)
  isHistoricVersion?: boolean; // True if superseded or archived
  reviewDueDate: string | null; // ISO 8601 UTC date
  lastReviewedAt?: string | null;
  lastReviewedBy?: string | null;
  linkedEvidenceIds: string[]; // FKs to /tenants/{tenantId}/evidence/{evidenceId}
  linkedControlIds?: string[]; // FKs to /tenants/{tenantId}/controls/{controlId}
  linkedTransferArrangementIds?: string[]; // FKs to /tenants/{tenantId}/transfer_arrangements/{arrangementId}
  unresolvedFindingsCount: number;
  hasMajorDeficiencies: boolean;
  ownerId: string;
  createdBy: string;
  updatedBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewStateTransitionResult {
  allowed: boolean;
  reason?: string;
}

/**
 * Validates processor certification review state transitions to enforce auditability and state integrity.
 */
export function validateProcessorCertificationReviewTransition(
  currentStatus: ProcessorCertificationReviewStatus,
  nextStatus: ProcessorCertificationReviewStatus
): ReviewStateTransitionResult {
  if (currentStatus === nextStatus) {
    return { allowed: true };
  }

  // Superseded is a preserved historic state
  if (currentStatus === 'superseded') {
    return {
      allowed: false,
      reason: 'A superseded certification is a preserved historic audit record and cannot transition to an active review status.',
    };
  }

  const validTransitions: Record<ProcessorCertificationReviewStatus, ProcessorCertificationReviewStatus[]> = {
    pending: ['in_review', 'accepted', 'rejected', 'insufficient', 'expired', 'superseded'],
    in_review: ['accepted', 'rejected', 'insufficient', 'pending', 'expired', 'superseded'],
    accepted: ['in_review', 'insufficient', 'expired', 'superseded'],
    rejected: ['in_review', 'pending', 'superseded'],
    insufficient: ['in_review', 'accepted', 'expired', 'superseded'],
    expired: ['in_review', 'superseded'],
    superseded: [],
  };

  const allowedNext = validTransitions[currentStatus] || [];
  if (!allowedNext.includes(nextStatus)) {
    return {
      allowed: false,
      reason: `Invalid review status transition from "${currentStatus}" to "${nextStatus}".`,
    };
  }

  return { allowed: true };
}

export interface ValidateProcessorCertificationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a ProcessorCertification payload for data consistency and relationship integrity.
 */
export function validateProcessorCertification(input: unknown): ValidateProcessorCertificationResult {
  const errors: string[] = [];

  if (!input || typeof input !== 'object') {
    return { valid: false, errors: ['Payload must be a non-null object.'] };
  }

  const c = input as Partial<ProcessorCertification>;

  // 1. Identifiers & Relationship Integrity
  if (!c.tenantId || typeof c.tenantId !== 'string' || c.tenantId.trim() === '') {
    errors.push('tenantId is required and must be a non-empty string.');
  }

  if (!c.processorProfileId || typeof c.processorProfileId !== 'string' || c.processorProfileId.trim() === '') {
    errors.push('processorProfileId is required and must reference a valid ProcessorProfile.');
  }

  if (c.vendorId !== undefined && (typeof c.vendorId !== 'string' || c.vendorId.trim() === '')) {
    errors.push('vendorId, if provided, must be a non-empty string referencing a valid Vendor.');
  }

  // 2. Artifact Kind & Standard Family
  if (!c.artifactKind || !VALID_ASSURANCE_ARTIFACT_KINDS.includes(c.artifactKind)) {
    errors.push(`artifactKind must be one of: ${VALID_ASSURANCE_ARTIFACT_KINDS.join(', ')}.`);
  }

  if (!c.standardFamily || !VALID_ASSURANCE_STANDARD_FAMILIES.includes(c.standardFamily)) {
    errors.push(`standardFamily must be one of: ${VALID_ASSURANCE_STANDARD_FAMILIES.join(', ')}.`);
  } else {
    // Check specific metadata rules
    const metaCheck = validateAssuranceMetadataRules(c);
    if (!metaCheck.valid) {
      errors.push(...metaCheck.errors);
    }
  }

  // 3. Issuing Body & Reference Number
  if (!c.issuingBodyOrAuditor || typeof c.issuingBodyOrAuditor !== 'string' || c.issuingBodyOrAuditor.trim().length < 2) {
    errors.push('issuingBodyOrAuditor is required and must be at least 2 characters long.');
  }

  if (!c.certificateOrReportNumber || typeof c.certificateOrReportNumber !== 'string' || c.certificateOrReportNumber.trim().length < 2) {
    errors.push('certificateOrReportNumber is required and must be at least 2 characters long.');
  }

  // 4. Validity Window & Date Sanity
  if (!c.validFrom || typeof c.validFrom !== 'string' || isNaN(new Date(c.validFrom).getTime())) {
    errors.push('validFrom must be a valid ISO date string.');
  }

  if (!c.validUntil || typeof c.validUntil !== 'string' || isNaN(new Date(c.validUntil).getTime())) {
    errors.push('validUntil must be a valid ISO date string.');
  }

  if (c.validFrom && c.validUntil && new Date(c.validFrom).getTime() > new Date(c.validUntil).getTime()) {
    errors.push('validFrom date cannot be after validUntil date.');
  }

  // 5. Report Period Dates (where present)
  if (c.reportPeriodStart) {
    if (typeof c.reportPeriodStart !== 'string' || isNaN(new Date(c.reportPeriodStart).getTime())) {
      errors.push('reportPeriodStart must be a valid ISO date string if provided.');
    }
  }

  if (c.reportPeriodEnd) {
    if (typeof c.reportPeriodEnd !== 'string' || isNaN(new Date(c.reportPeriodEnd).getTime())) {
      errors.push('reportPeriodEnd must be a valid ISO date string if provided.');
    }
  }

  if (c.reportPeriodStart && c.reportPeriodEnd) {
    if (new Date(c.reportPeriodStart).getTime() > new Date(c.reportPeriodEnd).getTime()) {
      errors.push('reportPeriodStart cannot be after reportPeriodEnd.');
    }
  }

  // 6. Status & Scope
  if (!c.status || !VALID_PROCESSOR_CERTIFICATION_STATUSES.includes(c.status)) {
    errors.push(`status must be one of: ${VALID_PROCESSOR_CERTIFICATION_STATUSES.join(', ')}.`);
  }

  if (!c.assuranceScopeSummary || typeof c.assuranceScopeSummary !== 'string' || c.assuranceScopeSummary.trim().length < 3) {
    errors.push('assuranceScopeSummary is required and must describe the certified scope.');
  }

  if (!c.legalEntityOrRegionalScope || typeof c.legalEntityOrRegionalScope !== 'string' || c.legalEntityOrRegionalScope.trim().length < 2) {
    errors.push('legalEntityOrRegionalScope is required and must specify the in-scope legal entities/territories.');
  }

  if (!Array.isArray(c.systemsOrServicesCovered) || !c.systemsOrServicesCovered.every(s => typeof s === 'string' && s.trim() !== '')) {
    errors.push('systemsOrServicesCovered must be an array of covered systems or services.');
  }

  // 6. Review Governance & Attribution
  if (!c.reviewOwnerUserId || typeof c.reviewOwnerUserId !== 'string' || c.reviewOwnerUserId.trim() === '') {
    errors.push('reviewOwnerUserId is required and must specify the internal review owner.');
  }

  if (!c.reviewStatus || !VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES.includes(c.reviewStatus)) {
    errors.push(`reviewStatus must be one of: ${VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES.join(', ')}.`);
  }

  if (c.reviewDueDate !== null && c.reviewDueDate !== undefined && (typeof c.reviewDueDate !== 'string' || isNaN(new Date(c.reviewDueDate).getTime()))) {
    errors.push('reviewDueDate must be a valid ISO date string or null.');
  }

  if (c.reviewedAt !== null && c.reviewedAt !== undefined && (typeof c.reviewedAt !== 'string' || isNaN(new Date(c.reviewedAt).getTime()))) {
    errors.push('reviewedAt must be a valid ISO date string when review is executed.');
  }

  if (c.reviewStatus === 'rejected' && (!c.rejectionReason || typeof c.rejectionReason !== 'string' || c.rejectionReason.trim() === '')) {
    errors.push('rejectionReason is required when reviewStatus is "rejected".');
  }

  if ((c.isInsufficient === true || c.reviewStatus === 'insufficient') && (!c.insufficientRationale || typeof c.insufficientRationale !== 'string' || c.insufficientRationale.trim() === '')) {
    errors.push('insufficientRationale is required when certification is marked insufficient.');
  }

  if (c.versionNumber !== undefined && (typeof c.versionNumber !== 'number' || c.versionNumber < 1)) {
    errors.push('versionNumber must be an integer >= 1.');
  }

  if (c.isHistoricVersion !== undefined && typeof c.isHistoricVersion !== 'boolean') {
    errors.push('isHistoricVersion must be a boolean flag.');
  }

  // 7. Evidence Links
  if (!Array.isArray(c.linkedEvidenceIds) || !c.linkedEvidenceIds.every(id => typeof id === 'string')) {
    errors.push('linkedEvidenceIds must be an array of string identifiers referencing Evidence records.');
  }

  // 8. Deficiencies & Findings
  if (typeof c.unresolvedFindingsCount !== 'number' || c.unresolvedFindingsCount < 0) {
    errors.push('unresolvedFindingsCount must be a non-negative integer.');
  }

  if (typeof c.hasMajorDeficiencies !== 'boolean') {
    errors.push('hasMajorDeficiencies must be a boolean flag.');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

export interface ProcessorCertificationEvidenceCompleteness {
  certificationId: string;
  isComplete: boolean;
  hasAttachedEvidence: boolean;
  attachedEvidenceCount: number;
  attachedEvidences: Array<{
    id: string;
    title: string;
    category: EvidenceCategory;
    status: EvidenceStatus;
    fileHashSha256: string;
  }>;
  isExpired: boolean;
  isExpiringSoon: boolean;
  daysUntilExpiry: number;
  isReviewOverdue: boolean;
  daysUntilReviewDue: number | null;
  gaps: Array<{
    code: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }>;
}

/**
 * Resolves all attached evidence records for a processor certification.
 * Supports multi-evidence resolution (e.g. main report, bridge letter, management assertion, SOC 3 summary).
 */
export function findEvidenceForProcessorCertification(
  cert: ProcessorCertification,
  evidenceDocs: Evidence[] = []
): Evidence[] {
  if (!cert) return [];
  const certEvidenceIds = new Set(cert.linkedEvidenceIds || []);
  return evidenceDocs.filter((e) => {
    if (certEvidenceIds.has(e.id)) return true;
    if (e.processorCertificationIds && e.processorCertificationIds.includes(cert.id)) return true;
    if (e.certificationIds && e.certificationIds.includes(cert.id)) return true;
    return false;
  });
}

/**
 * Reverse lookup: Resolves all processor certifications referencing or linked to a specific evidence record.
 */
export function findProcessorCertificationsForEvidence(
  evidence: Evidence,
  certs: ProcessorCertification[] = []
): ProcessorCertification[] {
  if (!evidence) return [];
  return certs.filter((c) => {
    if (c.linkedEvidenceIds && c.linkedEvidenceIds.includes(evidence.id)) return true;
    if (evidence.processorCertificationIds && evidence.processorCertificationIds.includes(c.id)) return true;
    if (evidence.certificationIds && evidence.certificationIds.includes(c.id)) return true;
    return false;
  });
}

/**
 * Pure evaluator for single processor certification evidence completeness and review health.
 */
export function evaluateProcessorCertificationCompleteness(
  cert: ProcessorCertification,
  evidenceDocs: Evidence[] = [],
  asOfDate: Date = new Date()
): ProcessorCertificationEvidenceCompleteness {
  const nowMillis = asOfDate.getTime();
  const validUntilMillis = new Date(cert.validUntil).getTime();
  const daysUntilExpiry = Math.ceil((validUntilMillis - nowMillis) / (1000 * 60 * 60 * 24));
  const isExpired = daysUntilExpiry <= 0 || cert.status === 'expired' || cert.status === 'revoked' || cert.status === 'suspended';
  const isExpiringSoon = !isExpired && daysUntilExpiry <= 60;

  let isReviewOverdue = false;
  let daysUntilReviewDue: number | null = null;
  if (cert.reviewDueDate) {
    const dueMillis = new Date(cert.reviewDueDate).getTime();
    daysUntilReviewDue = Math.ceil((dueMillis - nowMillis) / (1000 * 60 * 60 * 24));
    isReviewOverdue = dueMillis < nowMillis && cert.status === 'active_valid';
  }

  const linkedEvidences = findEvidenceForProcessorCertification(cert, evidenceDocs);
  const validAttachedEvidences = linkedEvidences.filter((e) => e.status === 'valid');
  const hasAttachedEvidence = validAttachedEvidences.length > 0;

  const gaps: Array<{
    code: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }> = [];

  // Superseded historic records are preserved for audit and exempt from active gaps
  if (cert.isHistoricVersion || cert.reviewStatus === 'superseded') {
    return {
      certificationId: cert.id,
      isComplete: true,
      hasAttachedEvidence,
      attachedEvidenceCount: linkedEvidences.length,
      attachedEvidences: linkedEvidences.map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        status: e.status,
        fileHashSha256: e.fileHashSha256,
      })),
      isExpired,
      isExpiringSoon,
      daysUntilExpiry,
      isReviewOverdue: false,
      daysUntilReviewDue,
      gaps: [],
    };
  }

  if (isExpired) {
    gaps.push({
      code: 'PROCESSOR_CERT_EXPIRED',
      description: `Processor assurance (${cert.standardFamily.toUpperCase()} - ${cert.certificateOrReportNumber}) expired on ${cert.validUntil}.`,
      severity: 'critical',
      suggestedAction: 'Request renewed SOC 2 report or accredited ISO certificate from vendor.',
    });
  } else if (isExpiringSoon) {
    gaps.push({
      code: 'PROCESSOR_CERT_EXPIRING_SOON',
      description: `Processor assurance (${cert.certificateOrReportNumber}) expires in ${daysUntilExpiry} days on ${cert.validUntil}.`,
      severity: 'high',
      suggestedAction: 'Initiate vendor assurance renewal request.',
    });
  }

  if (!hasAttachedEvidence) {
    gaps.push({
      code: 'PROCESSOR_CERT_MISSING_EVIDENCE',
      description: `Processor assurance record (${cert.certificateOrReportNumber}) has no attached verified evidence file in the Evidence repository.`,
      severity: 'high',
      suggestedAction: 'Upload formal PDF report or certificate to Evidence repository and link it.',
    });
  }

  if (isReviewOverdue) {
    gaps.push({
      code: 'PROCESSOR_CERT_REVIEW_OVERDUE',
      description: `Periodic internal review for assurance (${cert.certificateOrReportNumber}) was due on ${cert.reviewDueDate}.`,
      severity: 'high',
      suggestedAction: 'Complete reviewer assessment and sign off reviewStatus.',
    });
  }

  if (cert.isInsufficient || cert.reviewStatus === 'insufficient') {
    gaps.push({
      code: 'PROCESSOR_CERT_INSUFFICIENT',
      description: cert.insufficientRationale || `Assurance artifact (${cert.certificateOrReportNumber}) was marked insufficient during compliance review.`,
      severity: 'high',
      suggestedAction: 'Request compensating controls, Bridge Letter, or management corrective action plan.',
    });
  }

  if (cert.reviewStatus === 'rejected') {
    gaps.push({
      code: 'PROCESSOR_CERT_REJECTED',
      description: cert.rejectionReason || `Assurance artifact (${cert.certificateOrReportNumber}) was formally rejected.`,
      severity: 'critical',
      suggestedAction: 'Vendor must provide valid in-scope certificate/report meeting required standards.',
    });
  }

  if (cert.hasMajorDeficiencies || cert.unresolvedFindingsCount > 0) {
    gaps.push({
      code: 'PROCESSOR_CERT_MAJOR_DEFICIENCIES',
      description: `Assurance report has recorded major audit exceptions or qualified opinion.`,
      severity: 'critical',
      suggestedAction: 'Review Bridge Letter / Corrective Action Plan from vendor and trigger risk mitigation.',
    });
  }

  return {
    certificationId: cert.id,
    isComplete: gaps.length === 0,
    hasAttachedEvidence,
    attachedEvidenceCount: linkedEvidences.length,
    attachedEvidences: linkedEvidences.map((e) => ({
      id: e.id,
      title: e.title,
      category: e.category,
      status: e.status,
      fileHashSha256: e.fileHashSha256,
    })),
    isExpired,
    isExpiringSoon,
    daysUntilExpiry,
    isReviewOverdue,
    daysUntilReviewDue,
    gaps,
  };
}

export interface ProcessorCertificationRiskFlag {
  id: string;
  certificationId: string;
  processorProfileId: string;
  standardFamily?: AssuranceStandardFamily;
  certificateOrReportNumber?: string;
  ruleCode: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  title: string;
  description: string;
  suggestedTreatment: string;
  inherentScore: number;
  isActionable: boolean;
  dedupKey: string;
}

export interface EvaluateProcessorCertificationRiskFlagsOptions {
  evidenceDocs?: Evidence[];
  processorProfiles?: ProcessorProfile[];
  requiredSystemsMap?: Record<string, string[]>;
  asOfDate?: Date;
}

/**
 * Evaluates risk flags across processor certifications and profiles:
 * - Critical processor with no certification/assurance record
 * - Certification expired (with criticality multiplier)
 * - Certification expiring soon with no replacement in progress
 * - Report rejected or marked insufficient
 * - Processor claims assurance but has no evidence attached
 * - Assurance scope does not cover linked service/system
 */
export function evaluateProcessorCertificationRiskFlags(
  certs: ProcessorCertification[],
  evidenceDocsOrOptions: Evidence[] | EvaluateProcessorCertificationRiskFlagsOptions = [],
  asOfDate: Date = new Date()
): ProcessorCertificationRiskFlag[] {
  let evidenceDocs: Evidence[] = [];
  let processorProfiles: ProcessorProfile[] = [];
  let requiredSystemsMap: Record<string, string[]> = {};
  let asOf = asOfDate;

  if (Array.isArray(evidenceDocsOrOptions)) {
    evidenceDocs = evidenceDocsOrOptions;
  } else if (evidenceDocsOrOptions && typeof evidenceDocsOrOptions === 'object') {
    evidenceDocs = evidenceDocsOrOptions.evidenceDocs || [];
    processorProfiles = evidenceDocsOrOptions.processorProfiles || [];
    requiredSystemsMap = evidenceDocsOrOptions.requiredSystemsMap || {};
    asOf = evidenceDocsOrOptions.asOfDate || asOfDate;
  }

  const nowMillis = asOf.getTime();
  const flags: ProcessorCertificationRiskFlag[] = [];
  const profileMap = new Map<string, ProcessorProfile>();
  for (const p of processorProfiles) {
    profileMap.set(p.id, p);
  }

  // 1. Evaluate Individual Certification Gaps & Rules
  for (const cert of certs) {
    if (cert.isHistoricVersion || cert.reviewStatus === 'superseded') {
      continue;
    }

    const completeness = evaluateProcessorCertificationCompleteness(cert, evidenceDocs, asOf);
    const profile = profileMap.get(cert.processorProfileId);
    const isCriticalProcessor = profile?.criticality === 'critical';
    const isHighCriticalProcessor = profile?.criticality === 'high';

    // A. Completeness Gaps (Expired, Review Overdue, Insufficient, Rejected, Missing Evidence)
    for (const gap of completeness.gaps) {
      let severity = gap.severity;
      let score = gap.severity === 'critical' ? 20 : gap.severity === 'high' ? 12 : 6;

      if (isCriticalProcessor) {
        if (gap.code === 'PROCESSOR_CERT_EXPIRED' || gap.code === 'PROCESSOR_CERT_REJECTED' || gap.code === 'PROCESSOR_CERT_INSUFFICIENT') {
          severity = 'critical';
          score = 25;
        } else if (gap.code === 'PROCESSOR_CERT_MISSING_EVIDENCE') {
          severity = 'high';
          score = 18;
        }
      } else if (isHighCriticalProcessor) {
        if (gap.code === 'PROCESSOR_CERT_EXPIRED' || gap.code === 'PROCESSOR_CERT_REJECTED' || gap.code === 'PROCESSOR_CERT_INSUFFICIENT') {
          severity = 'high';
          score = 20;
        } else if (gap.code === 'PROCESSOR_CERT_MISSING_EVIDENCE') {
          severity = 'high';
          score = 16;
        }
      }

      flags.push({
        id: `flag_${cert.id}_${gap.code.toLowerCase()}`,
        certificationId: cert.id,
        processorProfileId: cert.processorProfileId,
        standardFamily: cert.standardFamily,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        ruleCode: gap.code,
        severity,
        title: `${gap.code.replace(/_/g, ' ')}: ${cert.certificateOrReportNumber}`,
        description: gap.description,
        suggestedTreatment: gap.suggestedAction,
        inherentScore: score,
        isActionable: true,
        dedupKey: `${cert.tenantId}_risk_${gap.code}_${cert.processorProfileId}_${cert.id}`,
      });
    }

    // B. Expiring Soon with No Replacement in Progress
    if (completeness.isExpiringSoon) {
      const hasReplacement = certs.some(
        (c) =>
          c.id !== cert.id &&
          c.processorProfileId === cert.processorProfileId &&
          (c.replacesCertificationId === cert.id ||
            c.status === 'active_valid' ||
            c.reviewStatus === 'in_review' ||
            c.reviewStatus === 'pending')
      );

      if (!hasReplacement && !cert.replacedByCertificationId) {
        flags.push({
          id: `flag_${cert.id}_expiring_unreplaced`,
          certificationId: cert.id,
          processorProfileId: cert.processorProfileId,
          standardFamily: cert.standardFamily,
          certificateOrReportNumber: cert.certificateOrReportNumber,
          ruleCode: 'PROCESSOR_CERT_EXPIRING_SOON_UNREPLACED',
          severity: isCriticalProcessor ? 'high' : 'medium',
          title: `Assurance Expiring Soon Without Replacement: ${cert.certificateOrReportNumber}`,
          description: `Assurance artifact (${cert.standardFamily.toUpperCase()}) expires in ${completeness.daysUntilExpiry} days on ${cert.validUntil} with no renewal or replacement report on file.`,
          suggestedTreatment: 'Request current audit renewal package from vendor.',
          inherentScore: isCriticalProcessor ? 18 : 10,
          isActionable: true,
          dedupKey: `${cert.tenantId}_risk_expiring_unreplaced_${cert.processorProfileId}_${cert.id}`,
        });
      }
    }

    // C. Scope Mismatch against Required Systems/Services
    const requiredSystems = requiredSystemsMap[cert.processorProfileId] || [];
    if (requiredSystems.length > 0 && Array.isArray(cert.systemsOrServicesCovered) && cert.systemsOrServicesCovered.length > 0) {
      const coversAll = cert.systemsOrServicesCovered.some(
        (s) => s.toLowerCase().includes('all') || s.toLowerCase().includes('global') || s.toLowerCase().includes('commercial')
      );

      if (!coversAll) {
        const coveredLower = cert.systemsOrServicesCovered.map((s) => s.toLowerCase());
        const missingSystems = requiredSystems.filter(
          (req) => !coveredLower.some((c) => c.includes(req.toLowerCase()) || req.toLowerCase().includes(c))
        );

        if (missingSystems.length > 0) {
          flags.push({
            id: `flag_${cert.id}_scope_mismatch`,
            certificationId: cert.id,
            processorProfileId: cert.processorProfileId,
            standardFamily: cert.standardFamily,
            certificateOrReportNumber: cert.certificateOrReportNumber,
            ruleCode: 'PROCESSOR_CERT_SCOPE_MISMATCH',
            severity: isCriticalProcessor ? 'high' : 'medium',
            title: `Assurance Scope Mismatch: ${cert.certificateOrReportNumber}`,
            description: `Certified assurance scope (${cert.systemsOrServicesCovered.join(', ')}) does not explicitly cover engaged systems/services: ${missingSystems.join(', ')}.`,
            suggestedTreatment: 'Request SOC 2 / ISO scope expansion or supplementary third-party attestation covering all engaged services.',
            inherentScore: isCriticalProcessor ? 16 : 10,
            isActionable: true,
            dedupKey: `${cert.tenantId}_risk_scope_mismatch_${cert.processorProfileId}_${cert.id}`,
          });
        }
      }
    }
  }

  // 2. Evaluate Processor-Level Assurance Absence (Critical Processors with No Valid Assurance)
  for (const profile of processorProfiles) {
    if (profile.criticality === 'critical' || profile.criticality === 'high') {
      const validCerts = certs.filter(
        (c) =>
          c.processorProfileId === profile.id &&
          !c.isHistoricVersion &&
          c.reviewStatus !== 'superseded' &&
          c.reviewStatus !== 'rejected' &&
          !c.isInsufficient &&
          c.status !== 'expired' &&
          c.status !== 'revoked' &&
          new Date(c.validUntil).getTime() > nowMillis
      );

      if (validCerts.length === 0) {
        const isCritical = profile.criticality === 'critical';
        flags.push({
          id: `flag_${profile.id}_missing_assurance`,
          certificationId: 'none',
          processorProfileId: profile.id,
          ruleCode: 'CRITICAL_PROCESSOR_MISSING_ASSURANCE',
          severity: isCritical ? 'critical' : 'high',
          title: `Critical Processor Missing External Assurance: ${profile.engagementName || profile.id}`,
          description: `Processor profile has criticality "${profile.criticality}" but possesses zero valid, unexpired third-party security or privacy certifications.`,
          suggestedTreatment: 'Obtain accredited ISO 27001 certificate or SOC 2 Type II attestation report from vendor as a mandatory supply chain control.',
          inherentScore: isCritical ? 25 : 18,
          isActionable: true,
          dedupKey: `${profile.tenantId}_risk_missing_assurance_${profile.id}`,
        });
      }
    }
  }

  return flags;
}

export interface ProcessorCertificationReminderCandidate {
  recipientUserId: string;
  recipientRoles?: UserRole[];
  tenantId: string;
  processorProfileId: string;
  certificationId: string;
  certificateOrReportNumber: string;
  standardFamily: AssuranceStandardFamily;
  reminderType: NotificationType;
  title: string;
  message: string;
  dueDate: string;
  severity: NotificationPriority;
  dedupKey: string;
  gracePeriodDaysRemaining?: number | null;
  isStaleReport?: boolean;
}

export interface EvaluateProcessorCertificationRemindersOptions {
  asOfDate?: Date;
  windowDays?: number;
  gracePeriodDays?: number; // Configurable grace period in days (default: 30)
  maxReportAgeDays?: number; // Max allowed age for period-of-time reports (default: 365 days)
}

/**
 * Evaluates reminder candidates for processor certifications:
 * - Upcoming expiries (60d, 30d, 14d)
 * - Grace period consumption and expired assurance
 * - Overdue compliance reviews
 * - Stale period-of-time reports (e.g. SOC 2 / BSI C5 > 12 months)
 * - Missing replacement documents for expired/superseded records
 */
export function evaluateProcessorCertificationReminders(
  certs: ProcessorCertification[],
  options: EvaluateProcessorCertificationRemindersOptions = {}
): ProcessorCertificationReminderCandidate[] {
  const asOf = options.asOfDate || new Date();
  const gracePeriodDays = options.gracePeriodDays ?? 30;
  const maxReportAgeDays = options.maxReportAgeDays ?? 365;
  const nowMillis = asOf.getTime();
  const reminders: ProcessorCertificationReminderCandidate[] = [];

  for (const cert of certs) {
    // Superseded historic records are archived and exempt from routine operational alarms
    if (cert.isHistoricVersion || cert.reviewStatus === 'superseded') {
      continue;
    }

    const recipient = cert.reviewOwnerUserId || cert.ownerId || cert.createdBy;
    const recipientRoles: UserRole[] = ['compliance_manager', 'privacy_manager', 'security_manager'];
    const expiryMillis = new Date(cert.validUntil).getTime();
    const daysUntilExpiry = Math.ceil((expiryMillis - nowMillis) / (1000 * 60 * 60 * 24));
    const daysPastExpiry = Math.ceil((nowMillis - expiryMillis) / (1000 * 60 * 60 * 24));

    // 1. Expiry & Grace Period Notifications
    if (expiryMillis <= nowMillis) {
      if (daysPastExpiry <= gracePeriodDays) {
        const graceRemaining = Math.max(0, gracePeriodDays - daysPastExpiry);
        reminders.push({
          recipientUserId: recipient,
          recipientRoles,
          tenantId: cert.tenantId,
          processorProfileId: cert.processorProfileId,
          certificationId: cert.id,
          certificateOrReportNumber: cert.certificateOrReportNumber,
          standardFamily: cert.standardFamily,
          reminderType: 'processor_cert_grace_period_expiring',
          title: `Processor Assurance in Grace Period (${graceRemaining}d remaining): ${cert.certificateOrReportNumber}`,
          message: `Assurance artifact (${cert.standardFamily.toUpperCase()}) expired on ${cert.validUntil}. Vendor is currently operating under a ${gracePeriodDays}-day grace period (${graceRemaining} days remaining). Request renewed certification immediately.`,
          dueDate: cert.validUntil,
          severity: 'urgent',
          dedupKey: `${cert.tenantId}_${cert.id}_grace_${cert.validUntil}`,
          gracePeriodDaysRemaining: graceRemaining,
        });
      } else {
        reminders.push({
          recipientUserId: recipient,
          recipientRoles,
          tenantId: cert.tenantId,
          processorProfileId: cert.processorProfileId,
          certificationId: cert.id,
          certificateOrReportNumber: cert.certificateOrReportNumber,
          standardFamily: cert.standardFamily,
          reminderType: 'processor_cert_expired',
          title: `Processor Assurance Grace Period Expired: ${cert.certificateOrReportNumber}`,
          message: `Third-party assurance (${cert.standardFamily.toUpperCase()}) for processor profile ${cert.processorProfileId} expired on ${cert.validUntil} and has exceeded the ${gracePeriodDays}-day grace period. Vendor assurance is unverified.`,
          dueDate: cert.validUntil,
          severity: 'urgent',
          dedupKey: `${cert.tenantId}_${cert.id}_expired_${cert.validUntil}`,
        });
      }
    } else if (daysUntilExpiry <= 14) {
      reminders.push({
        recipientUserId: recipient,
        recipientRoles,
        tenantId: cert.tenantId,
        processorProfileId: cert.processorProfileId,
        certificationId: cert.id,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        standardFamily: cert.standardFamily,
        reminderType: 'processor_cert_expiry_warning_14d',
        title: `Critical Processor Assurance Expiry (14d): ${cert.certificateOrReportNumber}`,
        message: `Assurance (${cert.standardFamily.toUpperCase()}) expires in ${daysUntilExpiry} days on ${cert.validUntil}. Final renewal escalation required.`,
        dueDate: cert.validUntil,
        severity: 'urgent',
        dedupKey: `${cert.tenantId}_${cert.id}_14d_${cert.validUntil}`,
      });
    } else if (daysUntilExpiry <= 30) {
      reminders.push({
        recipientUserId: recipient,
        recipientRoles,
        tenantId: cert.tenantId,
        processorProfileId: cert.processorProfileId,
        certificationId: cert.id,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        standardFamily: cert.standardFamily,
        reminderType: 'processor_cert_expiry_warning_30d',
        title: `Urgent Processor Assurance Expiry (30d): ${cert.certificateOrReportNumber}`,
        message: `Assurance (${cert.standardFamily.toUpperCase()}) expires in ${daysUntilExpiry} days on ${cert.validUntil}. Initiate vendor renewal outreach.`,
        dueDate: cert.validUntil,
        severity: 'high',
        dedupKey: `${cert.tenantId}_${cert.id}_30d_${cert.validUntil}`,
      });
    } else if (daysUntilExpiry <= 60) {
      reminders.push({
        recipientUserId: recipient,
        recipientRoles,
        tenantId: cert.tenantId,
        processorProfileId: cert.processorProfileId,
        certificationId: cert.id,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        standardFamily: cert.standardFamily,
        reminderType: 'processor_cert_expiry_warning_60d',
        title: `Processor Assurance Renewal Window (60d): ${cert.certificateOrReportNumber}`,
        message: `Assurance (${cert.standardFamily.toUpperCase()}) expires in ${daysUntilExpiry} days on ${cert.validUntil}. Request updated report or bridge letter.`,
        dueDate: cert.validUntil,
        severity: 'medium',
        dedupKey: `${cert.tenantId}_${cert.id}_60d_${cert.validUntil}`,
      });
    }

    // 2. Overdue Internal Review Reminders
    if (cert.reviewDueDate) {
      const reviewMillis = new Date(cert.reviewDueDate).getTime();
      if (reviewMillis < nowMillis && (cert.reviewStatus === 'pending' || cert.reviewStatus === 'in_review')) {
        reminders.push({
          recipientUserId: recipient,
          recipientRoles,
          tenantId: cert.tenantId,
          processorProfileId: cert.processorProfileId,
          certificationId: cert.id,
          certificateOrReportNumber: cert.certificateOrReportNumber,
          standardFamily: cert.standardFamily,
          reminderType: 'processor_cert_review_overdue',
          title: `Processor Assurance Review Overdue: ${cert.certificateOrReportNumber}`,
          message: `Periodic compliance review for assurance artifact (${cert.certificateOrReportNumber}) was due on ${cert.reviewDueDate} and remains in status "${cert.reviewStatus}".`,
          dueDate: cert.reviewDueDate,
          severity: 'high',
          dedupKey: `${cert.tenantId}_${cert.id}_review_overdue_${cert.reviewDueDate}`,
        });
      }
    }

    // 3. Stale Period-of-Time Report Reminders (e.g. SOC 2 Type II / BSI C5)
    if (cert.reportPeriodEnd) {
      const reportEndMillis = new Date(cert.reportPeriodEnd).getTime();
      const reportAgeDays = Math.floor((nowMillis - reportEndMillis) / (1000 * 60 * 60 * 24));

      if (reportAgeDays > maxReportAgeDays && expiryMillis > nowMillis) {
        reminders.push({
          recipientUserId: recipient,
          recipientRoles,
          tenantId: cert.tenantId,
          processorProfileId: cert.processorProfileId,
          certificationId: cert.id,
          certificateOrReportNumber: cert.certificateOrReportNumber,
          standardFamily: cert.standardFamily,
          reminderType: 'processor_cert_stale_report',
          title: `Stale Audit Attestation Report (>12m): ${cert.certificateOrReportNumber}`,
          message: `Audit testing period for ${cert.standardFamily.toUpperCase()} ended ${reportAgeDays} days ago on ${cert.reportPeriodEnd}. Request the latest annual SOC 2 / C5 report or Q4 Bridge Letter from vendor.`,
          dueDate: cert.reportPeriodEnd,
          severity: 'high',
          dedupKey: `${cert.tenantId}_${cert.id}_stale_${cert.reportPeriodEnd}`,
          isStaleReport: true,
        });
      }
    }

    // 4. Missing Replacement Document Reminders
    if ((!cert.linkedEvidenceIds || cert.linkedEvidenceIds.length === 0) && cert.status === 'active_valid') {
      reminders.push({
        recipientUserId: recipient,
        recipientRoles,
        tenantId: cert.tenantId,
        processorProfileId: cert.processorProfileId,
        certificationId: cert.id,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        standardFamily: cert.standardFamily,
        reminderType: 'processor_cert_missing_replacement_evidence',
        title: `Missing Supporting Assurance File: ${cert.certificateOrReportNumber}`,
        message: `No verified document file is attached to processor assurance record ${cert.certificateOrReportNumber}. Upload official audit report or certificate PDF.`,
        dueDate: cert.validFrom,
        severity: 'urgent',
        dedupKey: `${cert.tenantId}_${cert.id}_missing_doc_${cert.validFrom}`,
      });
    }
  }

  return reminders;
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

// -----------------------------------------------------------------------------
// 7. PROCESSOR INVENTORY LIST & SEARCH TYPES
// -----------------------------------------------------------------------------

export interface ListProcessorInventoryInput {
  tenantId: string;
  status?: ProcessorStatus;
  criticality?: ProcessorCriticality;
  restrictedTransfer?: boolean;
  transferMechanismType?: TransferMechanismType;
  tiaStatus?: 'has_approved_tia' | 'has_in_review_tia' | 'missing_tia' | 'not_required';
  reviewStatus?: 'overdue' | 'due_soon_30d' | 'due_soon_90d' | 'on_track' | 'no_review_scheduled';
  missingEvidence?: boolean;
  destinationCountry?: string;
  linkedSystemAssetId?: string;
  searchQuery?: string;
  limit?: number;
  offset?: number;
}

export interface ProcessorInventoryItem {
  profile: ProcessorProfile;
  vendorName: string | null;
  vendorCategory: string | null;
  vendorRiskTier: string | null;
  transferArrangementsCount: number;
  hasRestrictedTransfer: boolean;
  destinationCountries: string[];
  transferMechanismTypes: TransferMechanismType[];
  tiaStatus: 'approved' | 'in_review' | 'missing' | 'not_required';
  linkedTiaIds: string[];
  linkedSystemAssetIds: string[];
  linkedSystemNames: string[];
  isReviewOverdue: boolean;
  reviewStatus: 'overdue' | 'due_soon_30d' | 'due_soon_90d' | 'on_track' | 'no_review_scheduled';
  evidenceCompleteness: {
    isComplete: boolean;
    missingCount: number;
    missingCategories: string[];
  };
  governanceRiskLevel: 'critical' | 'high' | 'medium' | 'low';
}

export interface ProcessorInventoryResponse {
  success: boolean;
  count: number;
  total: number;
  items: ProcessorInventoryItem[];
}

// -----------------------------------------------------------------------------
// 8. CONTROL IMPLEMENTATION & THIRD-PARTY ASSURANCE INTEGRATION
// -----------------------------------------------------------------------------

/**
 * Finds all processor certifications linked to a specific Control.
 * Checks both `cert.linkedControlIds` and `control.processorCertificationIds`.
 */
export function findProcessorCertificationsForControl(
  controlOrId: Control | string,
  certs: ProcessorCertification[]
): ProcessorCertification[] {
  const controlId = typeof controlOrId === 'string' ? controlOrId : controlOrId.id;
  const directLinkedCertIds = typeof controlOrId === 'object' && Array.isArray(controlOrId.processorCertificationIds)
    ? controlOrId.processorCertificationIds
    : [];

  return certs.filter(
    (c) =>
      Boolean(c.linkedControlIds?.includes(controlId)) ||
      directLinkedCertIds.includes(c.id)
  );
}

/**
 * Finds all Controls linked to a specific ProcessorCertification.
 * Checks both `cert.linkedControlIds` and `control.processorCertificationIds`.
 */
export function findControlsForProcessorCertification(
  certOrId: ProcessorCertification | string,
  controls: Control[]
): Control[] {
  const certId = typeof certOrId === 'string' ? certOrId : certOrId.id;
  const directLinkedControlIds = typeof certOrId === 'object' && Array.isArray(certOrId.linkedControlIds)
    ? certOrId.linkedControlIds
    : [];

  return controls.filter(
    (ctl) =>
      directLinkedControlIds.includes(ctl.id) ||
      Boolean(ctl.processorCertificationIds?.includes(certId))
  );
}

export interface ControlProcessorAssuranceItem {
  certificationId: string;
  processorProfileId: string;
  processorName: string;
  standardFamily: AssuranceStandardFamily;
  standardDisplayName: string;
  certificateOrReportNumber: string;
  status: ProcessorCertificationStatus;
  reviewStatus: ProcessorCertificationReviewStatus;
  validFrom: string;
  validUntil: string;
  isCurrent: boolean;
  isSufficient: boolean;
  hasAttachedEvidence: boolean;
  evidenceDocuments: Array<{
    id: string;
    title: string;
    category: EvidenceCategory;
    fileHashSha256: string | null;
  }>;
  unresolvedFindingsCount: number;
  hasMajorDeficiencies: boolean;
}

export interface SupportingProcessorAssuranceGroup {
  processorProfileId: string;
  engagementName: string;
  criticality: ProcessorCriticality;
  hasCurrentAssurance: boolean;
  certifications: ControlProcessorAssuranceItem[];
}

export interface ControlProcessorAssuranceSupport {
  controlId: string;
  controlCode: string;
  controlTitle: string;
  totalLinkedCertifications: number;
  validAssuranceCount: number;
  expiredAssuranceCount: number;
  hasSufficientAssurance: boolean;
  assuranceCoverageScore: number; // 0-100%
  supportingProcessorsCount: number;
  supportingProcessors: SupportingProcessorAssuranceGroup[];
  items: ControlProcessorAssuranceItem[];
}

/**
 * Evaluates the third-party assurance and evidence support context for a specific Control.
 * Calculates whether the control's vendor assurance expectations are satisfied by active, non-expired certifications.
 */
export function evaluateControlProcessorAssuranceSupport(
  control: Control,
  certs: ProcessorCertification[],
  evidenceDocs: Evidence[] = [],
  profiles: ProcessorProfile[] = [],
  asOfDate: Date = new Date()
): ControlProcessorAssuranceSupport {
  const nowMillis = asOfDate.getTime();
  const linkedCerts = findProcessorCertificationsForControl(control, certs);

  const profileMap = new Map<string, ProcessorProfile>();
  for (const p of profiles) {
    profileMap.set(p.id, p);
  }

  const items: ControlProcessorAssuranceItem[] = [];
  let validAssuranceCount = 0;
  let expiredAssuranceCount = 0;

  for (const cert of linkedCerts) {
    if (cert.isHistoricVersion || cert.reviewStatus === 'superseded') {
      continue;
    }

    const taxonomy = getAssuranceTaxonomy(cert.standardFamily);
    const profile = profileMap.get(cert.processorProfileId);
    const processorName = profile?.engagementName || cert.processorProfileId;

    const expiryMillis = new Date(cert.validUntil).getTime();
    const isCurrent = cert.status === 'active_valid' && expiryMillis > nowMillis;
    const isSufficient = !cert.isInsufficient && cert.reviewStatus === 'accepted' && !cert.hasMajorDeficiencies;

    if (isCurrent && isSufficient) {
      validAssuranceCount++;
    } else {
      expiredAssuranceCount++;
    }

    const attachedEvidences = (cert.linkedEvidenceIds || [])
      .map((evId) => evidenceDocs.find((e) => e.id === evId))
      .filter((e): e is Evidence => e !== undefined && e !== null && e.status === 'valid')
      .map((e) => ({
        id: e.id,
        title: e.title,
        category: e.category,
        fileHashSha256: e.fileHashSha256 || null,
      }));

    items.push({
      certificationId: cert.id,
      processorProfileId: cert.processorProfileId,
      processorName,
      standardFamily: cert.standardFamily,
      standardDisplayName: taxonomy.displayName,
      certificateOrReportNumber: cert.certificateOrReportNumber,
      status: cert.status,
      reviewStatus: cert.reviewStatus,
      validFrom: cert.validFrom,
      validUntil: cert.validUntil,
      isCurrent,
      isSufficient,
      hasAttachedEvidence: attachedEvidences.length > 0,
      evidenceDocuments: attachedEvidences,
      unresolvedFindingsCount: cert.unresolvedFindingsCount || 0,
      hasMajorDeficiencies: cert.hasMajorDeficiencies || false,
    });
  }

  // Group by processor
  const processorGroupMap = new Map<string, ControlProcessorAssuranceItem[]>();
  for (const item of items) {
    if (!processorGroupMap.has(item.processorProfileId)) {
      processorGroupMap.set(item.processorProfileId, []);
    }
    processorGroupMap.get(item.processorProfileId)!.push(item);
  }

  const supportingProcessors: SupportingProcessorAssuranceGroup[] = [];
  for (const [pId, groupItems] of processorGroupMap.entries()) {
    const profile = profileMap.get(pId);
    const hasCurrent = groupItems.some((i) => i.isCurrent && i.isSufficient);
    supportingProcessors.push({
      processorProfileId: pId,
      engagementName: profile?.engagementName || pId,
      criticality: profile?.criticality || 'medium',
      hasCurrentAssurance: hasCurrent,
      certifications: groupItems,
    });
  }

  const totalLinked = items.length;
  const coverageScore = totalLinked > 0 ? Math.round((validAssuranceCount / totalLinked) * 100) : 0;
  const hasSufficientAssurance = validAssuranceCount > 0 && validAssuranceCount === totalLinked;

  return {
    controlId: control.id,
    controlCode: control.code,
    controlTitle: control.title,
    totalLinkedCertifications: totalLinked,
    validAssuranceCount,
    expiredAssuranceCount,
    hasSufficientAssurance,
    assuranceCoverageScore: coverageScore,
    supportingProcessorsCount: supportingProcessors.length,
    supportingProcessors,
    items,
  };
}

export interface ProcessorControlMatrixEntry {
  processorProfileId: string;
  engagementName: string;
  criticality: ProcessorCriticality;
  supportedControlsCount: number;
  validControlsCount: number;
  gapsCount: number;
  controlSupportMap: Record<
    string,
    {
      controlCode: string;
      controlTitle: string;
      hasCurrentAssurance: boolean;
      certificationIds: string[];
      standardFamilies: AssuranceStandardFamily[];
    }
  >;
}

/**
 * Builds a multi-processor to controls assurance matrix.
 * Visualizes which third-party processors provide verified assurance backing for each adopted tenant control.
 */
export function mapProcessorsToControlsAssuranceMatrix(
  profiles: ProcessorProfile[],
  certs: ProcessorCertification[],
  controls: Control[],
  evidenceDocs: Evidence[] = [],
  asOfDate: Date = new Date()
): ProcessorControlMatrixEntry[] {
  const matrix: ProcessorControlMatrixEntry[] = [];

  for (const profile of profiles) {
    const profileCerts = certs.filter(
      (c) => c.processorProfileId === profile.id && !c.isHistoricVersion && c.reviewStatus !== 'superseded'
    );

    const controlSupportMap: ProcessorControlMatrixEntry['controlSupportMap'] = {};
    let validControlsCount = 0;
    let gapsCount = 0;

    for (const ctl of controls) {
      const matchingCerts = findProcessorCertificationsForControl(ctl, profileCerts);

      if (matchingCerts.length > 0) {
        const support = evaluateControlProcessorAssuranceSupport(ctl, matchingCerts, evidenceDocs, [profile], asOfDate);
        const hasCurrent = support.validAssuranceCount > 0;

        if (hasCurrent) {
          validControlsCount++;
        } else {
          gapsCount++;
        }

        controlSupportMap[ctl.id] = {
          controlCode: ctl.code,
          controlTitle: ctl.title,
          hasCurrentAssurance: hasCurrent,
          certificationIds: matchingCerts.map((c) => c.id),
          standardFamilies: matchingCerts.map((c) => c.standardFamily),
        };
      }
    }

    matrix.push({
      processorProfileId: profile.id,
      engagementName: profile.engagementName || profile.id,
      criticality: profile.criticality,
      supportedControlsCount: Object.keys(controlSupportMap).length,
      validControlsCount,
      gapsCount,
      controlSupportMap,
    });
  }

  return matrix;
}

// -----------------------------------------------------------------------------
// 9. PROCESSOR ASSURANCE INVENTORY & MULTI-DIMENSIONAL FILTERS
// -----------------------------------------------------------------------------

export interface ProcessorAssuranceInventoryItem {
  certification: ProcessorCertification;
  processorProfile: {
    id: string;
    name: string;
    criticality: ProcessorCriticality;
    processorRole: ProcessorRole;
    serviceDescription: string;
    status: ProcessorStatus;
    ownerUserId?: string;
    vendorId?: string | null;
  };
  vendor: {
    id: string;
    name: string;
    riskTier?: string;
  } | null;
  validityStatus: 'valid_now' | 'expiring_soon' | 'expired' | 'superseded';
  daysUntilExpiry: number;
  isExpired: boolean;
  isExpiringSoon: boolean;
  isReviewOverdue: boolean;
  daysUntilReviewDue: number | null;
  isCriticalProcessor: boolean;
  hasAttachedEvidence: boolean;
  attachedEvidenceCount: number;
  attachedEvidenceSummaries: Array<{
    id: string;
    title: string;
    category: string;
    status: string;
    fileHashSha256?: string;
  }>;
  coveredSystemsCount: number;
  coveredSystems: string[];
  linkedSystemAssetIds: string[];
  linkedSystemNames: string[];
  isInsufficientOrRejected: boolean;
  gaps: Array<{
    code: string;
    description: string;
    severity: 'critical' | 'high' | 'medium' | 'low';
    suggestedAction: string;
  }>;
  completeness: ProcessorCertificationEvidenceCompleteness;
}

export interface ListProcessorAssuranceInventoryInput {
  tenantId: string;
  processorProfileId?: string;
  vendorId?: string;
  artifactKind?: AssuranceArtifactKind;
  standardFamily?: AssuranceStandardFamily;
  status?: ProcessorCertificationStatus;
  validityStatus?: 'valid_now' | 'expiring_soon' | 'expired' | 'all';
  reviewStatus?: ProcessorCertificationReviewStatus;
  criticalProcessorOnly?: boolean;
  issuerQuery?: string;
  issuingBodyOrAuditor?: string;
  linkedSystemAssetId?: string;
  coveredSystemOrService?: string;
  missingEvidenceOnly?: boolean;
  insufficientOrRejectedOnly?: boolean;
  searchQuery?: string;
  includeHistoric?: boolean;
  limit?: number;
  offset?: number;
}

export interface ProcessorAssuranceInventorySummary {
  totalAssuranceRecords: number;
  activeValidCount: number;
  expiringSoonCount: number;
  expiredCount: number;
  supersededCount: number;
  criticalProcessorsCount: number;
  missingEvidenceCount: number;
  insufficientOrRejectedCount: number;
  pendingReviewCount: number;
  standardBreakdown: Record<string, number>;
}

export interface ProcessorAssuranceInventoryResponse {
  success: boolean;
  total: number;
  count: number;
  summary: ProcessorAssuranceInventorySummary;
  items: ProcessorAssuranceInventoryItem[];
}

/**
 * Synthesizes cross-entity correlated assurance inventory items from raw Firestore collections.
 */
export function synthesizeProcessorAssuranceInventory(
  certs: ProcessorCertification[],
  profiles: ProcessorProfile[],
  vendors: Vendor[] = [],
  assets: SystemAsset[] = [],
  evidenceList: Evidence[] = [],
  asOfDate: Date = new Date()
): ProcessorAssuranceInventoryItem[] {
  const profilesMap = new Map<string, ProcessorProfile>();
  profiles.forEach((p) => profilesMap.set(p.id, p));

  const vendorsMap = new Map<string, Vendor>();
  vendors.forEach((v) => vendorsMap.set(v.id, v));

  const assetsMap = new Map<string, SystemAsset>();
  assets.forEach((a) => assetsMap.set(a.id, a));

  const nowMillis = asOfDate.getTime();

  return certs.map((cert) => {
    const profile = profilesMap.get(cert.processorProfileId) || ({
      id: cert.processorProfileId,
      engagementName: cert.processorProfileId,
      criticality: 'medium' as ProcessorCriticality,
      processorRole: 'data_processor' as ProcessorRole,
      serviceDescription: '',
      status: 'active' as ProcessorStatus,
      vendorId: cert.vendorId || null,
      linkedSystemAssetIds: [],
    } as unknown as ProcessorProfile);

    const vendor = profile.vendorId
      ? vendorsMap.get(profile.vendorId) || null
      : cert.vendorId
      ? vendorsMap.get(cert.vendorId) || null
      : null;

    const completeness = evaluateProcessorCertificationCompleteness(cert, evidenceList, asOfDate);

    const validUntilMillis = new Date(cert.validUntil).getTime();
    const daysUntilExpiry = Math.ceil((validUntilMillis - nowMillis) / (1000 * 60 * 60 * 24));
    const isExpired = daysUntilExpiry <= 0 || cert.status === 'expired' || cert.status === 'revoked' || cert.status === 'suspended';
    const isExpiringSoon = !isExpired && daysUntilExpiry <= 60;
    const isSuperseded = cert.isHistoricVersion || cert.reviewStatus === 'superseded';

    let validityStatus: 'valid_now' | 'expiring_soon' | 'expired' | 'superseded' = 'valid_now';
    if (isSuperseded) {
      validityStatus = 'superseded';
    } else if (isExpired) {
      validityStatus = 'expired';
    } else if (isExpiringSoon) {
      validityStatus = 'expiring_soon';
    }

    const isReviewOverdue = completeness.isReviewOverdue;
    const daysUntilReviewDue = completeness.daysUntilReviewDue;
    const isCriticalProcessor = profile.criticality === 'critical';
    const isInsufficientOrRejected = cert.isInsufficient || cert.reviewStatus === 'insufficient' || cert.reviewStatus === 'rejected';

    // Linked system assets resolution
    const linkedAssetIds = Array.from(
      new Set([
        ...(profile.linkedSystemAssetIds || []),
        ...assets
          .filter((a) => a.processorProfileIds?.includes(profile.id) || cert.systemsOrServicesCovered?.includes(a.name) || cert.systemsOrServicesCovered?.includes(a.id))
          .map((a) => a.id),
      ])
    );

    const linkedSystemNames = linkedAssetIds
      .map((id) => assetsMap.get(id)?.name)
      .filter((name): name is string => Boolean(name));

    return {
      certification: cert,
      processorProfile: {
        id: profile.id,
        name: profile.engagementName || profile.id,
        criticality: profile.criticality,
        processorRole: profile.processorRole,
        serviceDescription: profile.serviceDescription,
        status: profile.status,
        ownerUserId: profile.ownerUserId || profile.ownerId,
        vendorId: profile.vendorId,
      },
      vendor: vendor
        ? {
            id: vendor.id,
            name: vendor.name,
            riskTier: vendor.riskTier,
          }
        : null,
      validityStatus,
      daysUntilExpiry,
      isExpired,
      isExpiringSoon,
      isReviewOverdue,
      daysUntilReviewDue,
      isCriticalProcessor,
      hasAttachedEvidence: completeness.hasAttachedEvidence,
      attachedEvidenceCount: completeness.attachedEvidenceCount,
      attachedEvidenceSummaries: completeness.attachedEvidences,
      coveredSystemsCount: (cert.systemsOrServicesCovered || []).length,
      coveredSystems: cert.systemsOrServicesCovered || [],
      linkedSystemAssetIds: linkedAssetIds,
      linkedSystemNames,
      isInsufficientOrRejected,
      gaps: completeness.gaps,
      completeness,
    };
  });
}

/**
 * Pure filter evaluator for processor assurance inventory items.
 */
export function filterProcessorAssuranceInventory(
  items: ProcessorAssuranceInventoryItem[],
  filters: ListProcessorAssuranceInventoryInput
): ProcessorAssuranceInventoryItem[] {
  return items.filter((item) => {
    const { certification: cert, processorProfile: profile, vendor } = item;

    // 1. Historic Filter
    if (!filters.includeHistoric && (cert.isHistoricVersion || cert.reviewStatus === 'superseded')) {
      return false;
    }

    // 2. Specific Processor or Vendor Filter
    if (filters.processorProfileId && cert.processorProfileId !== filters.processorProfileId) {
      return false;
    }
    if (filters.vendorId && profile.vendorId !== filters.vendorId && cert.vendorId !== filters.vendorId) {
      return false;
    }

    // 3. Certification / Report Type
    if (filters.artifactKind && cert.artifactKind !== filters.artifactKind) {
      return false;
    }
    if (filters.standardFamily && cert.standardFamily !== filters.standardFamily) {
      return false;
    }

    // 4. Status
    if (filters.status && cert.status !== filters.status) {
      return false;
    }

    // 5. Validity Status (valid_now, expiring_soon, expired, all)
    if (filters.validityStatus && filters.validityStatus !== 'all') {
      if (item.validityStatus !== filters.validityStatus) {
        return false;
      }
    }

    // 6. Review Status
    if (filters.reviewStatus && cert.reviewStatus !== filters.reviewStatus) {
      return false;
    }

    // 7. Critical Processor Only
    if (filters.criticalProcessorOnly && !item.isCriticalProcessor) {
      return false;
    }

    // 8. Issuer (Exact or Query)
    if (filters.issuingBodyOrAuditor) {
      if (cert.issuingBodyOrAuditor.toLowerCase() !== filters.issuingBodyOrAuditor.toLowerCase()) {
        return false;
      }
    }
    if (filters.issuerQuery) {
      const q = filters.issuerQuery.toLowerCase().trim();
      const matchIssuer = cert.issuingBodyOrAuditor?.toLowerCase().includes(q);
      const matchAuditor = cert.leadAuditorName?.toLowerCase().includes(q);
      if (!matchIssuer && !matchAuditor) {
        return false;
      }
    }

    // 9. Linked System / Service Covered
    if (filters.linkedSystemAssetId) {
      const hasAsset = item.linkedSystemAssetIds.includes(filters.linkedSystemAssetId);
      if (!hasAsset) return false;
    }
    if (filters.coveredSystemOrService) {
      const coveredQuery = filters.coveredSystemOrService.toLowerCase().trim();
      const matchesCovered = (cert.systemsOrServicesCovered || []).some((s) => s.toLowerCase().includes(coveredQuery));
      const matchesSystemName = item.linkedSystemNames.some((n) => n.toLowerCase().includes(coveredQuery));
      if (!matchesCovered && !matchesSystemName) return false;
    }

    // 10. Missing Evidence Only
    if (filters.missingEvidenceOnly && item.hasAttachedEvidence) {
      return false;
    }

    // 11. Insufficient / Rejected Only
    if (filters.insufficientOrRejectedOnly && !item.isInsufficientOrRejected) {
      return false;
    }

    // 12. Freeform Search Query
    if (filters.searchQuery && filters.searchQuery.trim()) {
      const q = filters.searchQuery.toLowerCase().trim();
      const matchNum = cert.certificateOrReportNumber?.toLowerCase().includes(q);
      const matchIssuer = cert.issuingBodyOrAuditor?.toLowerCase().includes(q);
      const matchAuditor = cert.leadAuditorName?.toLowerCase().includes(q);
      const matchStandard = cert.standardFamily?.toLowerCase().includes(q) || cert.customStandardName?.toLowerCase().includes(q);
      const matchScope = cert.assuranceScopeSummary?.toLowerCase().includes(q) || cert.legalEntityOrRegionalScope?.toLowerCase().includes(q);
      const matchProfile = profile.name?.toLowerCase().includes(q);
      const matchVendor = vendor?.name?.toLowerCase().includes(q);
      const matchServices = (cert.systemsOrServicesCovered || []).some((s) => s.toLowerCase().includes(q));

      if (
        !matchNum &&
        !matchIssuer &&
        !matchAuditor &&
        !matchStandard &&
        !matchScope &&
        !matchProfile &&
        !matchVendor &&
        !matchServices
      ) {
        return false;
      }
    }

    return true;
  });
}

/**
 * Calculates high-level summary KPIs for assurance inventory views.
 */
export function summarizeProcessorAssuranceInventory(
  items: ProcessorAssuranceInventoryItem[]
): ProcessorAssuranceInventorySummary {
  let activeValidCount = 0;
  let expiringSoonCount = 0;
  let expiredCount = 0;
  let supersededCount = 0;
  let criticalProcessorsCount = 0;
  let missingEvidenceCount = 0;
  let insufficientOrRejectedCount = 0;
  let pendingReviewCount = 0;
  const standardBreakdown: Record<string, number> = {};

  const criticalProfileIds = new Set<string>();

  for (const item of items) {
    if (item.validityStatus === 'superseded') {
      supersededCount++;
    } else if (item.validityStatus === 'expired') {
      expiredCount++;
    } else if (item.validityStatus === 'expiring_soon') {
      expiringSoonCount++;
      activeValidCount++;
    } else {
      activeValidCount++;
    }

    if (item.isCriticalProcessor) {
      criticalProfileIds.add(item.processorProfile.id);
    }

    if (!item.hasAttachedEvidence && !item.certification.isHistoricVersion && item.certification.reviewStatus !== 'superseded') {
      missingEvidenceCount++;
    }

    if (item.isInsufficientOrRejected) {
      insufficientOrRejectedCount++;
    }

    if (item.certification.reviewStatus === 'pending' || item.certification.reviewStatus === 'in_review') {
      pendingReviewCount++;
    }

    const std = item.certification.standardFamily;
    standardBreakdown[std] = (standardBreakdown[std] || 0) + 1;
  }

  criticalProcessorsCount = criticalProfileIds.size;

  return {
    totalAssuranceRecords: items.length,
    activeValidCount,
    expiringSoonCount,
    expiredCount,
    supersededCount,
    criticalProcessorsCount,
    missingEvidenceCount,
    insufficientOrRejectedCount,
    pendingReviewCount,
    standardBreakdown,
  };
}

// =============================================================================
// SECTION 10: PROCESSOR ASSURANCE EXPORT REPORTING PAYLOADS & GENERATORS
// =============================================================================

export interface BaseAssuranceExportOptions {
  tenantId: string;
  requestedBy: string;
  generatedAt?: string;
}

/**
 * 1. Processor Assurance Register Export Payload
 */
export interface ProcessorAssuranceRegisterExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'processor_assurance_register';
    title: string;
    generatedAt: string;
    requestedBy: string;
    totalAssuranceRecords: number;
    activeValidCount: number;
    expiringSoonCount: number;
    expiredCount: number;
    criticalProcessorsCount: number;
    missingEvidenceCount: number;
    insufficientOrRejectedCount: number;
  };
  summary: ProcessorAssuranceInventorySummary;
  records: Array<{
    certificationId: string;
    certificateOrReportNumber: string;
    standardFamily: AssuranceStandardFamily;
    standardDisplayName: string;
    artifactKind: AssuranceArtifactKind;
    artifactKindLabel: string;
    processorProfileId: string;
    processorName: string;
    processorRole: string;
    processorCriticality: string;
    vendorId: string | null;
    vendorName: string | null;
    vendorRiskTier: string | null;
    issuingBodyOrAuditor: string;
    leadAuditorName: string | null;
    validFrom: string;
    validUntil: string;
    reportPeriodStart: string | null;
    reportPeriodEnd: string | null;
    daysUntilExpiry: number;
    validityStatus: string;
    assuranceScopeSummary: string;
    legalEntityOrRegionalScope: string | null;
    systemsOrServicesCovered: string[];
    linkedSystemAssetNames: string[];
    reviewStatus: string;
    reviewOwnerUserId: string;
    reviewDueDate: string | null;
    reviewNotes: string | null;
    rejectionReason: string | null;
    insufficientRationale: string | null;
    isInsufficient: boolean;
    hasMajorDeficiencies: boolean;
    unresolvedFindingsCount: number;
    hasAttachedEvidence: boolean;
    attachedEvidenceCount: number;
    attachedEvidenceSummaries: Array<{ id: string; title: string; category: string; status: string; fileHashSha256?: string }>;
    gaps: Array<{ code: string; description: string; suggestedAction: string }>;
    isHistoricVersion: boolean;
    versionNumber: number;
  }>;
}

export function generateProcessorAssuranceRegisterExportPayload(
  items: ProcessorAssuranceInventoryItem[],
  options: BaseAssuranceExportOptions
): ProcessorAssuranceRegisterExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const summary = summarizeProcessorAssuranceInventory(items);

  const records = items.map((item) => {
    const { certification: cert, processorProfile: profile, vendor } = item;
    const taxonomy = getAssuranceTaxonomy(cert.standardFamily);

    return {
      certificationId: cert.id,
      certificateOrReportNumber: cert.certificateOrReportNumber,
      standardFamily: cert.standardFamily,
      standardDisplayName: taxonomy.displayName,
      artifactKind: cert.artifactKind,
      artifactKindLabel: getAssuranceArtifactKindLabel(cert.artifactKind),
      processorProfileId: profile.id,
      processorName: profile.name,
      processorRole: profile.processorRole,
      processorCriticality: profile.criticality,
      vendorId: vendor ? vendor.id : null,
      vendorName: vendor ? vendor.name : null,
      vendorRiskTier: vendor && vendor.riskTier ? vendor.riskTier : null,
      issuingBodyOrAuditor: cert.issuingBodyOrAuditor,
      leadAuditorName: cert.leadAuditorName || null,
      validFrom: cert.validFrom,
      validUntil: cert.validUntil,
      reportPeriodStart: cert.reportPeriodStart || null,
      reportPeriodEnd: cert.reportPeriodEnd || null,
      daysUntilExpiry: item.daysUntilExpiry,
      validityStatus: item.validityStatus,
      assuranceScopeSummary: cert.assuranceScopeSummary,
      legalEntityOrRegionalScope: cert.legalEntityOrRegionalScope || null,
      systemsOrServicesCovered: cert.systemsOrServicesCovered || [],
      linkedSystemAssetNames: item.linkedSystemNames,
      reviewStatus: cert.reviewStatus,
      reviewOwnerUserId: cert.reviewOwnerUserId,
      reviewDueDate: cert.reviewDueDate || null,
      reviewNotes: cert.reviewNotes || null,
      rejectionReason: cert.rejectionReason || null,
      insufficientRationale: cert.insufficientRationale || null,
      isInsufficient: Boolean(cert.isInsufficient),
      hasMajorDeficiencies: Boolean(cert.hasMajorDeficiencies),
      unresolvedFindingsCount: cert.unresolvedFindingsCount || 0,
      hasAttachedEvidence: item.hasAttachedEvidence,
      attachedEvidenceCount: item.attachedEvidenceCount,
      attachedEvidenceSummaries: item.attachedEvidenceSummaries,
      gaps: item.gaps,
      isHistoricVersion: Boolean(cert.isHistoricVersion),
      versionNumber: cert.versionNumber || 1,
    };
  });

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'processor_assurance_register',
      title: 'Processor Assurance & External Certification Register',
      generatedAt,
      requestedBy: options.requestedBy,
      totalAssuranceRecords: summary.totalAssuranceRecords,
      activeValidCount: summary.activeValidCount,
      expiringSoonCount: summary.expiringSoonCount,
      expiredCount: summary.expiredCount,
      criticalProcessorsCount: summary.criticalProcessorsCount,
      missingEvidenceCount: summary.missingEvidenceCount,
      insufficientOrRejectedCount: summary.insufficientOrRejectedCount,
    },
    summary,
    records,
  };
}

/**
 * 2. Expiring Certifications Report Payload
 */
export interface ProcessorExpiringCertificationsExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'processor_expiring_certifications_report';
    title: string;
    generatedAt: string;
    requestedBy: string;
    expiryWindowDays: number;
    expiringCertificationsCount: number;
  };
  expiringCertifications: Array<{
    certificationId: string;
    certificateOrReportNumber: string;
    standardDisplayName: string;
    artifactKindLabel: string;
    processorName: string;
    processorCriticality: string;
    vendorName: string | null;
    issuingBodyOrAuditor: string;
    validUntil: string;
    daysUntilExpiry: number;
    reviewOwnerUserId: string;
    reviewDueDate: string | null;
    hasAttachedEvidence: boolean;
    actionRequired: string;
  }>;
}

export function generateProcessorExpiringCertificationsExportPayload(
  items: ProcessorAssuranceInventoryItem[],
  options: BaseAssuranceExportOptions & { expiryWindowDays?: number }
): ProcessorExpiringCertificationsExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const expiryWindowDays = options.expiryWindowDays !== undefined ? options.expiryWindowDays : 60;

  // Filter only items expiring within window (and not superseded)
  const expiringItems = items
    .filter(
      (item) =>
        !item.certification.isHistoricVersion &&
        item.certification.status !== 'superseded' &&
        item.certification.status !== 'revoked' &&
        item.daysUntilExpiry <= expiryWindowDays &&
        item.daysUntilExpiry >= 0
    )
    .sort((a, b) => a.daysUntilExpiry - b.daysUntilExpiry);

  const expiringCertifications = expiringItems.map((item) => {
    const { certification: cert, processorProfile: profile, vendor } = item;
    const taxonomy = getAssuranceTaxonomy(cert.standardFamily);

    return {
      certificationId: cert.id,
      certificateOrReportNumber: cert.certificateOrReportNumber,
      standardDisplayName: taxonomy.displayName,
      artifactKindLabel: getAssuranceArtifactKindLabel(cert.artifactKind),
      processorName: profile.name,
      processorCriticality: profile.criticality,
      vendorName: vendor ? vendor.name : null,
      issuingBodyOrAuditor: cert.issuingBodyOrAuditor,
      validUntil: cert.validUntil,
      daysUntilExpiry: item.daysUntilExpiry,
      reviewOwnerUserId: cert.reviewOwnerUserId,
      reviewDueDate: cert.reviewDueDate || null,
      hasAttachedEvidence: item.hasAttachedEvidence,
      actionRequired:
        item.daysUntilExpiry <= 14
          ? 'URGENT: Request renewed certification / bridge letter immediately from vendor.'
          : 'Initiate annual assurance renewal review with vendor.',
    };
  });

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'processor_expiring_certifications_report',
      title: `Expiring Processor Certifications Report (Next ${expiryWindowDays} Days)`,
      generatedAt,
      requestedBy: options.requestedBy,
      expiryWindowDays,
      expiringCertificationsCount: expiringCertifications.length,
    },
    expiringCertifications,
  };
}

/**
 * 3. Expired / Insufficient Assurance Report Payload
 */
export interface ProcessorExpiredInsufficientAssuranceExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'processor_expired_insufficient_assurance_report';
    title: string;
    generatedAt: string;
    requestedBy: string;
    totalDeficienciesCount: number;
    expiredCount: number;
    rejectedCount: number;
    insufficientCount: number;
    missingEvidenceCount: number;
  };
  deficiencies: Array<{
    certificationId: string;
    certificateOrReportNumber: string;
    standardDisplayName: string;
    processorName: string;
    processorCriticality: string;
    vendorName: string | null;
    deficiencyType: 'expired' | 'rejected' | 'insufficient' | 'missing_evidence';
    reasonOrRationale: string;
    validUntil: string;
    reviewOwnerUserId: string;
    gaps: Array<{ code: string; description: string; suggestedAction: string }>;
    remediationAction: string;
  }>;
}

export function generateProcessorExpiredInsufficientAssuranceExportPayload(
  items: ProcessorAssuranceInventoryItem[],
  options: BaseAssuranceExportOptions
): ProcessorExpiredInsufficientAssuranceExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();

  let expiredCount = 0;
  let rejectedCount = 0;
  let insufficientCount = 0;
  let missingEvidenceCount = 0;

  const deficienciesList: ProcessorExpiredInsufficientAssuranceExportPayload['deficiencies'] = [];

  for (const item of items) {
    if (item.certification.isHistoricVersion || item.certification.status === 'superseded') {
      continue;
    }

    const { certification: cert, processorProfile: profile, vendor } = item;
    const taxonomy = getAssuranceTaxonomy(cert.standardFamily);

    let isDeficient = false;
    let defType: 'expired' | 'rejected' | 'insufficient' | 'missing_evidence' = 'expired';
    let rationale = '';
    let remediation = '';

    if (item.isExpired || cert.status === 'expired') {
      isDeficient = true;
      defType = 'expired';
      expiredCount++;
      rationale = `Certification lapsed on ${cert.validUntil.slice(0, 10)} (${Math.abs(item.daysUntilExpiry)} days overdue).`;
      remediation = 'Obtain active ISO certificate / renewed SOC report or reassess processor criticality.';
    } else if (cert.reviewStatus === 'rejected') {
      isDeficient = true;
      defType = 'rejected';
      rejectedCount++;
      rationale = cert.rejectionReason || 'Assurance artifact rejected during governance review.';
      remediation = 'Request revised report covering correct scope or trigger processor termination review.';
    } else if (cert.isInsufficient || cert.reviewStatus === 'insufficient') {
      isDeficient = true;
      defType = 'insufficient';
      insufficientCount++;
      rationale = cert.insufficientRationale || 'Assurance marked insufficient (e.g. missing carve-outs or CUECs).';
      remediation = 'Request complementary documentation or bridge letter addressing identified deficiency.';
    } else if (!item.hasAttachedEvidence) {
      isDeficient = true;
      defType = 'missing_evidence';
      missingEvidenceCount++;
      rationale = 'Certification record has 0 linked verification files or attestations in evidence locker.';
      remediation = 'Upload signed PDF certificate or auditor attestation report to evidence store.';
    }

    if (isDeficient) {
      deficienciesList.push({
        certificationId: cert.id,
        certificateOrReportNumber: cert.certificateOrReportNumber,
        standardDisplayName: taxonomy.displayName,
        processorName: profile.name,
        processorCriticality: profile.criticality,
        vendorName: vendor ? vendor.name : null,
        deficiencyType: defType,
        reasonOrRationale: rationale,
        validUntil: cert.validUntil,
        reviewOwnerUserId: cert.reviewOwnerUserId,
        gaps: item.gaps,
        remediationAction: remediation,
      });
    }
  }

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'processor_expired_insufficient_assurance_report',
      title: 'Expired, Rejected & Insufficient Processor Assurance Deficiencies Report',
      generatedAt,
      requestedBy: options.requestedBy,
      totalDeficienciesCount: deficienciesList.length,
      expiredCount,
      rejectedCount,
      insufficientCount,
      missingEvidenceCount,
    },
    deficiencies: deficienciesList,
  };
}

/**
 * 4. Processor-by-Certification-Type Matrix Export Payload
 */
export interface ProcessorByCertificationTypeMatrixExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'processor_by_certification_type_matrix';
    title: string;
    generatedAt: string;
    requestedBy: string;
    totalProcessors: number;
    standardsEvaluatedCount: number;
  };
  standardCatalog: Array<{
    standardFamily: AssuranceStandardFamily;
    displayName: string;
    description: string;
  }>;
  matrix: Array<{
    processorProfileId: string;
    processorName: string;
    processorRole: string;
    criticality: string;
    vendorName: string | null;
    totalActiveCertifications: number;
    coverageByStandard: Record<
      string,
      {
        covered: boolean;
        status: 'active_valid' | 'expiring_soon' | 'expired' | 'missing' | 'insufficient';
        certificateOrReportNumber?: string;
        validUntil?: string;
        daysUntilExpiry?: number;
        hasAttachedEvidence?: boolean;
      }
    >;
  }>;
  standardAdoptionRates: Record<string, { totalHoldingProcessors: number; adoptionPercentage: number }>;
}

export function generateProcessorByCertificationTypeMatrixExportPayload(
  profiles: ProcessorProfile[],
  certifications: ProcessorCertification[],
  vendors: Vendor[],
  options: BaseAssuranceExportOptions
): ProcessorByCertificationTypeMatrixExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const asOf = new Date(generatedAt);

  const activeStandards: AssuranceStandardFamily[] = [
    'iso_27001',
    'iso_27701',
    'iso_42001',
    'soc1_type2',
    'soc2_type1',
    'soc2_type2',
    'soc3',
    'csa_star',
    'pci_dss_aoc',
    'bsi_c5',
    'tisax',
    'cyber_essentials_plus',
    'gdpr_art42_europrivacy',
    'hipaa_security',
    'dpf_self_certification',
  ];

  const standardCatalog = activeStandards.map((s) => {
    const tax = getAssuranceTaxonomy(s);
    return {
      standardFamily: s,
      displayName: tax.displayName,
      description: tax.description,
    };
  });

  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const matrix: ProcessorByCertificationTypeMatrixExportPayload['matrix'] = [];
  const standardHoldingCounts: Record<string, number> = {};

  activeStandards.forEach((s) => {
    standardHoldingCounts[s] = 0;
  });

  for (const prof of profiles) {
    const vendor = prof.vendorId ? vendorMap.get(prof.vendorId) || null : null;
    const profCerts = certifications.filter(
      (c) => c.processorProfileId === prof.id && !c.isHistoricVersion && c.status !== 'superseded'
    );

    const coverageByStandard: ProcessorByCertificationTypeMatrixExportPayload['matrix'][0]['coverageByStandard'] = {};
    let totalActive = 0;

    for (const std of activeStandards) {
      const match = profCerts.find((c) => c.standardFamily === std);

      if (match) {
        const expiryDate = new Date(match.validUntil);
        const daysRemaining = Math.ceil((expiryDate.getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24));
        const isExp = daysRemaining < 0;
        const isExpSoon = daysRemaining <= 60 && daysRemaining >= 0;
        const isInsuff = match.isInsufficient || match.reviewStatus === 'insufficient' || match.reviewStatus === 'rejected';

        let status: 'active_valid' | 'expiring_soon' | 'expired' | 'missing' | 'insufficient' = 'active_valid';
        if (isInsuff) status = 'insufficient';
        else if (isExp) status = 'expired';
        else if (isExpSoon) status = 'expiring_soon';

        if (status === 'active_valid' || status === 'expiring_soon') {
          totalActive++;
          standardHoldingCounts[std] = (standardHoldingCounts[std] || 0) + 1;
        }

        coverageByStandard[std] = {
          covered: status === 'active_valid' || status === 'expiring_soon',
          status,
          certificateOrReportNumber: match.certificateOrReportNumber,
          validUntil: match.validUntil,
          daysUntilExpiry: daysRemaining,
          hasAttachedEvidence: Boolean(match.linkedEvidenceIds && match.linkedEvidenceIds.length > 0),
        };
      } else {
        coverageByStandard[std] = {
          covered: false,
          status: 'missing',
        };
      }
    }

    matrix.push({
      processorProfileId: prof.id,
      processorName: prof.engagementName || (prof as any).name || prof.id,
      processorRole: prof.processorRole,
      criticality: prof.criticality,
      vendorName: vendor ? vendor.name : null,
      totalActiveCertifications: totalActive,
      coverageByStandard,
    });
  }

  const standardAdoptionRates: ProcessorByCertificationTypeMatrixExportPayload['standardAdoptionRates'] = {};
  const totalProfs = profiles.length || 1;

  for (const std of activeStandards) {
    const count = standardHoldingCounts[std] || 0;
    standardAdoptionRates[std] = {
      totalHoldingProcessors: count,
      adoptionPercentage: Math.round((count / totalProfs) * 100),
    };
  }

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'processor_by_certification_type_matrix',
      title: 'Processor Assurance Standard Coverage Matrix',
      generatedAt,
      requestedBy: options.requestedBy,
      totalProcessors: profiles.length,
      standardsEvaluatedCount: activeStandards.length,
    },
    standardCatalog,
    matrix,
    standardAdoptionRates,
  };
}

/**
 * 5. Assurance Coverage by Linked Systems/Services Export Payload
 */
export interface ProcessorAssuranceCoverageBySystemsExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'processor_assurance_coverage_by_systems';
    title: string;
    generatedAt: string;
    requestedBy: string;
    totalSystemsEvaluated: number;
    compliantSystemsCount: number;
    warningSystemsCount: number;
    criticalGapSystemsCount: number;
  };
  systemCoverage: Array<{
    systemAssetId: string;
    systemName: string;
    assetType: string;
    systemCriticality: string;
    dataClassification: string;
    containsPersonalData: boolean;
    linkedProcessorsCount: number;
    overallSystemAssuranceStatus: 'compliant' | 'warning' | 'critical_gap' | 'no_processors';
    processors: Array<{
      processorProfileId: string;
      processorName: string;
      criticality: string;
      activeCertifications: Array<{
        certificationId: string;
        standardDisplayName: string;
        certificateOrReportNumber: string;
        validUntil: string;
        hasAttachedEvidence: boolean;
        coversThisSystemExplicitly: boolean;
      }>;
      processorAssuranceHealth: 'active_valid' | 'expiring_soon' | 'expired' | 'no_assurance';
    }>;
    gapsIdentified: string[];
  }>;
}

export function generateProcessorAssuranceCoverageBySystemsExportPayload(
  systemAssets: SystemAsset[],
  profiles: ProcessorProfile[],
  certifications: ProcessorCertification[],
  _vendors: Vendor[],
  options: BaseAssuranceExportOptions
): ProcessorAssuranceCoverageBySystemsExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const asOf = new Date(generatedAt);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  let compliantCount = 0;
  let warningCount = 0;
  let criticalGapCount = 0;

  const systemCoverage: ProcessorAssuranceCoverageBySystemsExportPayload['systemCoverage'] = [];

  for (const asset of systemAssets) {
    const linkedProfIds = asset.processorProfileIds || [];
    const gaps: string[] = [];

    if (linkedProfIds.length === 0) {
      systemCoverage.push({
        systemAssetId: asset.id,
        systemName: asset.name,
        assetType: asset.assetType,
        systemCriticality: asset.criticality,
        dataClassification: asset.dataClassification,
        containsPersonalData: Boolean(asset.containsPersonalData),
        linkedProcessorsCount: 0,
        overallSystemAssuranceStatus: 'no_processors',
        processors: [],
        gapsIdentified: [],
      });
      continue;
    }

    const processorsList: ProcessorAssuranceCoverageBySystemsExportPayload['systemCoverage'][0]['processors'] = [];
    let hasCriticalGap = false;
    let hasWarning = false;

    for (const profId of linkedProfIds) {
      const prof = profileMap.get(profId);
      if (!prof) continue;

      const profCerts = certifications.filter(
        (c) => c.processorProfileId === profId && !c.isHistoricVersion && c.status !== 'superseded'
      );

      const activeCerts = profCerts.map((c) => {
        const tax = getAssuranceTaxonomy(c.standardFamily);
        const coversExplicitly = Boolean(
          c.systemsOrServicesCovered &&
            c.systemsOrServicesCovered.some(
              (sys) =>
                sys.toLowerCase().includes(asset.name.toLowerCase()) ||
                asset.name.toLowerCase().includes(sys.toLowerCase())
            )
        );

        return {
          certificationId: c.id,
          standardDisplayName: tax.displayName,
          certificateOrReportNumber: c.certificateOrReportNumber,
          validUntil: c.validUntil,
          hasAttachedEvidence: Boolean(c.linkedEvidenceIds && c.linkedEvidenceIds.length > 0),
          coversThisSystemExplicitly: coversExplicitly,
        };
      });

      let health: 'active_valid' | 'expiring_soon' | 'expired' | 'no_assurance' = 'active_valid';

      if (profCerts.length === 0) {
        health = 'no_assurance';
        hasCriticalGap = true;
        gaps.push(`Processor "${prof.engagementName || (prof as any).name}" has zero registered certifications.`);
      } else {
        const anyActive = profCerts.some((c) => {
          const rem = Math.ceil((new Date(c.validUntil).getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24));
          return rem >= 0 && c.status === 'active_valid' && c.reviewStatus !== 'rejected';
        });

        const anyExpSoon = profCerts.some((c) => {
          const rem = Math.ceil((new Date(c.validUntil).getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24));
          return rem <= 60 && rem >= 0;
        });

        if (!anyActive) {
          health = 'expired';
          hasCriticalGap = true;
          gaps.push(`All certifications for processor "${prof.engagementName || (prof as any).name}" have expired or are rejected.`);
        } else if (anyExpSoon) {
          health = 'expiring_soon';
          hasWarning = true;
          gaps.push(`Processor "${prof.engagementName || (prof as any).name}" has assurance expiring within 60 days.`);
        }
      }

      processorsList.push({
        processorProfileId: prof.id,
        processorName: prof.engagementName || (prof as any).name || prof.id,
        criticality: prof.criticality,
        activeCertifications: activeCerts,
        processorAssuranceHealth: health,
      });
    }

    let overallStatus: 'compliant' | 'warning' | 'critical_gap' | 'no_processors' = 'compliant';
    if (hasCriticalGap) {
      overallStatus = 'critical_gap';
      criticalGapCount++;
    } else if (hasWarning) {
      overallStatus = 'warning';
      warningCount++;
    } else {
      compliantCount++;
    }

    systemCoverage.push({
      systemAssetId: asset.id,
      systemName: asset.name,
      assetType: asset.assetType,
      systemCriticality: asset.criticality,
      dataClassification: asset.dataClassification,
      containsPersonalData: Boolean(asset.containsPersonalData),
      linkedProcessorsCount: processorsList.length,
      overallSystemAssuranceStatus: overallStatus,
      processors: processorsList,
      gapsIdentified: gaps,
    });
  }

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'processor_assurance_coverage_by_systems',
      title: 'Assurance & Certification Coverage by Linked Systems / Services',
      generatedAt,
      requestedBy: options.requestedBy,
      totalSystemsEvaluated: systemAssets.length,
      compliantSystemsCount: compliantCount,
      warningSystemsCount: warningCount,
      criticalGapSystemsCount: criticalGapCount,
    },
    systemCoverage,
  };
}

/**
 * 6. Critical Processors Missing Current Assurance Export Payload
 */
export interface CriticalProcessorsMissingAssuranceExportPayload {
  exportHeader: {
    tenantId: string;
    exportType: 'critical_processors_missing_assurance';
    title: string;
    generatedAt: string;
    requestedBy: string;
    totalCriticalProcessorsCount: number;
    criticalProcessorsAtRiskCount: number;
    nonComplianceRatePercentage: number;
  };
  criticalProcessorsAtRisk: Array<{
    processorProfileId: string;
    processorName: string;
    processorRole: string;
    serviceDescription: string;
    dataCategories: string[];
    jurisdictions: string[];
    vendorName: string | null;
    vendorRiskTier: string | null;
    riskCategory: 'no_certifications' | 'all_expired' | 'review_rejected' | 'missing_evidence';
    findingsSummary: string;
    urgentRemediationAction: string;
  }>;
}

export function generateCriticalProcessorsMissingAssuranceExportPayload(
  profiles: ProcessorProfile[],
  certifications: ProcessorCertification[],
  vendors: Vendor[],
  _evidenceList: Evidence[],
  options: BaseAssuranceExportOptions
): CriticalProcessorsMissingAssuranceExportPayload {
  const generatedAt = options.generatedAt || new Date().toISOString();
  const asOf = new Date(generatedAt);

  const vendorMap = new Map(vendors.map((v) => [v.id, v]));
  const criticalProfiles = profiles.filter((p) => p.criticality === 'critical');

  const atRiskList: CriticalProcessorsMissingAssuranceExportPayload['criticalProcessorsAtRisk'] = [];

  for (const prof of criticalProfiles) {
    const vendor = prof.vendorId ? vendorMap.get(prof.vendorId) || null : null;
    const profCerts = certifications.filter(
      (c) => c.processorProfileId === prof.id && !c.isHistoricVersion && c.status !== 'superseded'
    );

    let isAtRisk = false;
    let riskCat: 'no_certifications' | 'all_expired' | 'review_rejected' | 'missing_evidence' = 'no_certifications';
    let findings = '';
    let action = '';

    if (profCerts.length === 0) {
      isAtRisk = true;
      riskCat = 'no_certifications';
      findings = 'Critical processor has 0 external certifications or SOC reports recorded.';
      action = 'Require vendor to produce current ISO 27001/27701 certificate or SOC 2 report immediately.';
    } else {
      const validCerts = profCerts.filter((c) => {
        const rem = Math.ceil((new Date(c.validUntil).getTime() - asOf.getTime()) / (1000 * 60 * 60 * 24));
        return rem >= 0 && c.status === 'active_valid';
      });

      if (validCerts.length === 0) {
        isAtRisk = true;
        riskCat = 'all_expired';
        findings = `All ${profCerts.length} certification records for this critical processor have lapsed / expired.`;
        action = 'Escalate to Vendor Management to request renewed certification package.';
      } else {
        const anyRejected = validCerts.some((c) => c.reviewStatus === 'rejected' || c.isInsufficient);
        const anyWithEvidence = validCerts.some(
          (c) => c.linkedEvidenceIds && c.linkedEvidenceIds.length > 0
        );

        if (anyRejected) {
          isAtRisk = true;
          riskCat = 'review_rejected';
          findings = 'Critical processor assurance was rejected or marked insufficient during governance review.';
          action = 'Review rejection rationale with DPO/CISO and issue formal remediation notice to vendor.';
        } else if (!anyWithEvidence) {
          isAtRisk = true;
          riskCat = 'missing_evidence';
          findings = 'Critical processor has valid records registered but lacks supporting files in evidence locker.';
          action = 'Upload signed certificate files to complete audit trail compliance.';
        }
      }
    }

    if (isAtRisk) {
      atRiskList.push({
        processorProfileId: prof.id,
        processorName: prof.engagementName || (prof as any).name || prof.id,
        processorRole: prof.processorRole,
        serviceDescription: prof.serviceDescription || '',
        dataCategories: prof.dataCategories || [],
        jurisdictions: prof.jurisdictions || [],
        vendorName: vendor ? vendor.name : null,
        vendorRiskTier: vendor && vendor.riskTier ? vendor.riskTier : null,
        riskCategory: riskCat,
        findingsSummary: findings,
        urgentRemediationAction: action,
      });
    }
  }

  const totalCrit = criticalProfiles.length || 1;
  const nonComplianceRate = Math.round((atRiskList.length / totalCrit) * 100);

  return {
    exportHeader: {
      tenantId: options.tenantId,
      exportType: 'critical_processors_missing_assurance',
      title: 'Critical Processors Missing Current Assurance Compliance Report',
      generatedAt,
      requestedBy: options.requestedBy,
      totalCriticalProcessorsCount: criticalProfiles.length,
      criticalProcessorsAtRiskCount: atRiskList.length,
      nonComplianceRatePercentage: nonComplianceRate,
    },
    criticalProcessorsAtRisk: atRiskList,
  };
}

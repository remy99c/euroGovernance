import { BaseEntity } from './core.js';
import { ControlImplementationStatus } from './grc.js';

// =============================================================================
// ENUMS & CONSTANTS
// =============================================================================

export type FrameworkAdoptionStatus =
  | 'evaluating'
  | 'in_scoping'
  | 'adopted'
  | 'active'
  | 'under_audit'
  | 'retired';

export const VALID_FRAMEWORK_ADOPTION_STATUSES: readonly FrameworkAdoptionStatus[] = [
  'evaluating',
  'in_scoping',
  'adopted',
  'active',
  'under_audit',
  'retired',
] as const;

export type ScopeProfileStatus = 'draft' | 'under_review' | 'approved' | 'superseded';

export const VALID_SCOPE_PROFILE_STATUSES: readonly ScopeProfileStatus[] = [
  'draft',
  'under_review',
  'approved',
  'superseded',
] as const;

export type ScopeFactCategory =
  | 'organization'
  | 'infrastructure'
  | 'data_processing'
  | 'ai_systems'
  | 'third_parties'
  | 'geography'
  | 'governance';

export const VALID_SCOPE_FACT_CATEGORIES: readonly ScopeFactCategory[] = [
  'organization',
  'infrastructure',
  'data_processing',
  'ai_systems',
  'third_parties',
  'geography',
  'governance',
] as const;

export type ScopeFactDataType = 'boolean' | 'string' | 'number' | 'string_array';

export type QuestionnaireCategory =
  | 'privacy'
  | 'ai_governance'
  | 'security'
  | 'data_governance'
  | 'general';

export type QuestionResponseType =
  | 'single_choice'
  | 'multi_choice'
  | 'boolean'
  | 'text'
  | 'numeric';

export type ApplicabilityConditionOperator =
  | 'equals'
  | 'not_equals'
  | 'in'
  | 'not_in'
  | 'contains'
  | 'greater_than'
  | 'less_than';

export type ApplicabilityType =
  | 'statutory_mandatory'
  | 'rule_derived'
  | 'manual_inclusion'
  | 'manual_exclusion';

export const VALID_APPLICABILITY_TYPES: readonly ApplicabilityType[] = [
  'statutory_mandatory',
  'rule_derived',
  'manual_inclusion',
  'manual_exclusion',
] as const;

export type ApplicabilityStatus =
  | 'applicable'
  | 'not_applicable'
  | 'conditionally_applicable'
  | 'pending_evaluation';

export const VALID_APPLICABILITY_STATUSES: readonly ApplicabilityStatus[] = [
  'applicable',
  'not_applicable',
  'conditionally_applicable',
  'pending_evaluation',
] as const;

export type RequirementComplianceStatus =
  | 'not_evaluated'
  | 'non_compliant'
  | 'partially_compliant'
  | 'compliant'
  | 'not_applicable';

export const VALID_REQUIREMENT_COMPLIANCE_STATUSES: readonly RequirementComplianceStatus[] = [
  'not_evaluated',
  'non_compliant',
  'partially_compliant',
  'compliant',
  'not_applicable',
] as const;

export type ControlMappingType =
  | 'equivalent'
  | 'subset'
  | 'superset'
  | 'intersecting'
  | 'compensating';

export const VALID_CONTROL_MAPPING_TYPES: readonly ControlMappingType[] = [
  'equivalent',
  'subset',
  'superset',
  'intersecting',
  'compensating',
] as const;

export type ControlMappingConfidence = 'high' | 'medium' | 'low';

// =============================================================================
// GLOBAL MASTER LIBRARY INTERFACES
// =============================================================================

/**
 * Global Scope Discovery Questionnaire (/scope_questionnaires/{questionnaireId})
 * Master questions used to elicit organizational facts from tenants.
 */
export interface ScopeQuestionnaire {
  id: string; // e.g. 'qnr_general_scoping_v1', 'qnr_ai_act_scoping_v1'
  title: string;
  description: string;
  category: QuestionnaireCategory;
  version: string;
  frameworkIds: string[]; // Frameworks informed by this questionnaire
  isPublished: boolean;
  questionsCount: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * Question Item in Scope Questionnaire (/scope_questionnaires/{questionnaireId}/questions/{questionId})
 */
export interface ScopeQuestion {
  id: string;
  questionnaireId: string;
  factKey: string; // Target ScopeFact key set by this question (e.g. 'processes_eu_resident_data')
  prompt: string;
  guidanceText: string;
  category: ScopeFactCategory;
  responseType: QuestionResponseType;
  options?: Array<{ label: string; value: string | boolean | number }>;
  defaultValue?: string | boolean | number | string[];
  sortOrder: number;
  isRequired: boolean;
  isTriggerForFrameworks: string[]; // e.g. ['gdpr', 'eu_ai_act']
}

/**
 * Global Applicability Rule (/applicability_rules/{ruleId})
 * Deterministic rules that evaluate tenant scope facts to derive requirement applicability.
 */
export interface ApplicabilityRule {
  id: string; // e.g. 'rule_gdpr_art30_threshold', 'rule_iso_a71_physical_dc'
  frameworkId: string;
  targetRequirementId: string;
  ruleName: string;
  description: string;
  condition: ApplicabilityRuleCondition;
  resultingStatusIfMatched: ApplicabilityStatus;
  statutoryRationale: string;
  isMandatoryUnlessExempt: boolean;
  version: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApplicabilityRuleCondition {
  factKey: string;
  operator: ApplicabilityConditionOperator;
  expectedValue: boolean | string | number | string[];
}

/**
 * Global Canonical Control Mapping (/control_mappings/{mappingId})
 * Cross-walk harmonization matrix linking controls and requirements across frameworks.
 */
export interface CanonicalControlMapping {
  id: string; // e.g. 'map_enc_gdpr_iso27001_ai_act'
  harmonizedDomain: string; // e.g. 'cryptography', 'incident_management', 'human_oversight'
  title: string;
  description: string;
  sourceFrameworkId: string;
  sourceRequirementId: string;
  sourceMasterControlId: string | null;
  targetFrameworkId: string;
  targetRequirementId: string;
  targetMasterControlId: string | null;
  mappingType: ControlMappingType;
  confidence: ControlMappingConfidence;
  mappingRationale: string;
  createdAt: string;
  updatedAt: string;
}

// =============================================================================
// TENANT-SCOPED ENTITIES
// =============================================================================

/**
 * 1. Tenant Framework Adoption (/tenants/{tenantId}/adopted_frameworks/{frameworkId})
 * Lifecycle state of a regulatory framework adopted by a tenant.
 */
export interface TenantFrameworkAdoption extends BaseEntity {
  frameworkId: string; // Foreign key -> /frameworks/{frameworkId}
  frameworkCode: string;
  frameworkName: string;
  frameworkVersion: string;
  status: FrameworkAdoptionStatus;
  scopeProfileId: string | null; // Pointer to primary Scope Profile
  scopeDescription: string;
  scopingBoundaries: string[]; // Geographical / Organizational regions
  targetCertificationDate: string | null;
  totalMasterControlsCount: number;
  instantiatedControlsCount: number;
  applicableControlsCount: number;
  notApplicableControlsCount: number;
  adoptedBy: string; // User UID
  adoptedAt: string; // ISO 8601
  lastInstantiatedAt: string | null;
  lastAuditedAt: string | null;
  auditCycleMonths: number;
}

/**
 * 2. Tenant Scope Profile (/tenants/{tenantId}/scope_profiles/{profileId})
 * Formal organizational boundary definition linking in-scope business entities and assets.
 */
export interface TenantScopeProfile extends BaseEntity {
  title: string;
  description: string;
  status: ScopeProfileStatus;
  version: string;
  applicableFrameworkIds: string[];
  // Relational Entity Bindings
  inScopeAssetIds: string[]; // -> /system_assets
  inScopeVendorIds: string[]; // -> /vendors
  inScopeAISystemIds: string[]; // -> /ai_systems
  inScopeRopaIds: string[]; // -> /ropa_entries
  includedLocations: string[]; // e.g. ['Frankfurt DC', 'Stockholm Office']
  includedLegalEntities: string[]; // e.g. ['EuroCorp SE', 'EuroCorp France SAS']
  excludedOperations: string[]; // Formal exclusions
  exclusionsJustification: string;
  approvedBy: string | null;
  approvedAt: string | null;
  reviewFrequencyDays: number;
  nextReviewDate: string | null;
}

/**
 * 3. Tenant Scope Fact (/tenants/{tenantId}/scope_facts/{factId})
 * Discrete factual declaration evaluated by applicability rules.
 */
export interface TenantScopeFact extends BaseEntity {
  factKey: string; // Unique within tenant e.g. 'operates_physical_datacenters'
  category: ScopeFactCategory;
  dataType: ScopeFactDataType;
  valueBoolean: boolean | null;
  valueString: string | null;
  valueNumber: number | null;
  valueArray: string[] | null;
  source: 'questionnaire' | 'manual_entry' | 'system_detected' | 'api_sync';
  sourceQuestionId: string | null;
  confidence: 'verified' | 'self_declared' | 'inferred';
  verificationEvidenceId: string | null; // Pointer to supporting evidence doc
  assessedBy: string;
  assessedAt: string;
}

/**
 * 4. Tenant Scope Answer (/tenants/{tenantId}/scope_answers/{answerId})
 * Tenant's recorded responses to global scope discovery questionnaires.
 */
export interface TenantScopeAnswer extends BaseEntity {
  questionnaireId: string;
  questionId: string;
  factKey: string;
  responseType: QuestionResponseType;
  answerBoolean: boolean | null;
  answerString: string | null;
  answerNumber: number | null;
  answerArray: string[] | null;
  notes: string;
  answeredBy: string;
  answeredAt: string;
}

/**
 * 5. Tenant Applicability Decision (/tenants/{tenantId}/applicability_decisions/{decisionId})
 * Formal statement on whether a specific statutory requirement is applicable to the tenant.
 */
export interface TenantApplicabilityDecision extends BaseEntity {
  requirementId: string; // Foreign key -> /frameworks/{frameworkId}/requirements/{reqId}
  frameworkId: string;
  sectionCode: string;
  requirementTitle: string;
  isApplicable: boolean;
  status: ApplicabilityStatus;
  applicabilityType: ApplicabilityType;
  // Audit-friendly justifications & overrides
  matchedRuleId: string | null; // Rule that derived this decision
  ruleEvaluationSummary: string | null;
  rationale: string;
  overrideReason: string | null; // Mandatory if manual_exclusion or manual_inclusion contradicts rule
  previousStatus: ApplicabilityStatus | null;
  assessedBy: string;
  assessedAt: string;
  reviewedBy: string | null;
  reviewedAt: string | null;
}

/**
 * 6. Tenant Requirement Instance (/tenants/{tenantId}/requirement_instances/{instanceId})
 * Tenant-scoped operational tracker for an adopted requirement, connecting decisions to controls.
 */
export interface TenantRequirementInstance extends BaseEntity {
  requirementId: string;
  frameworkId: string;
  sectionCode: string;
  title: string;
  description: string;
  category: string;
  isMandatory: boolean;
  applicabilityDecisionId: string; // Pointer to /applicability_decisions
  complianceStatus: RequirementComplianceStatus;
  satisfyingControlIds: string[]; // -> /tenants/{tenantId}/controls/{controlId}
  primaryAssigneeId: string | null;
  department: string;
  lastAssessmentDate: string | null;
  nextAssessmentDate: string | null;
  assessmentNotes: string;
}

/**
 * 7. Tenant Control Instance (/tenants/{tenantId}/controls/{controlId})
 * Concrete operational control implementing one or more framework requirements.
 */
export interface TenantControlInstance extends BaseEntity {
  masterControlId: string | null; // Link to master template (null if custom bespoke control)
  code: string; // e.g. 'CTL-CORP-SEC-01'
  title: string;
  description: string;
  domain: string;
  frameworkIds: string[]; // e.g. ['gdpr', 'iso_27001', 'eu_ai_act']
  requirementIds: string[]; // Specific requirements satisfied
  status: ControlImplementationStatus;
  healthScore: number; // 0-100%
  enforcementMechanism: 'automated' | 'manual' | 'policy' | 'hybrid';
  reviewFrequencyDays: number;
  lastReviewDate: string | null;
  nextReviewDate: string | null;
  implementationNotes: string;
  isHarmonized: boolean; // True if this control satisfies multiple frameworks
  canonicalMappingIds: string[]; // Pointers to /control_mappings
}

/**
 * 8. Tenant Control Mapping (/tenants/{tenantId}/control_mappings/{mappingId})
 * Tenant-specific mapping connecting an adopted control to requirements, risks, or policies.
 */
export interface TenantControlMapping extends BaseEntity {
  controlId: string;
  frameworkId: string;
  requirementId: string;
  mappingType: ControlMappingType;
  coverageRatio: number; // 0.0 to 1.0 (1.0 = fully satisfies requirement)
  mappingRationale: string;
  compensatingControlsJustification: string | null;
  verifiedBy: string | null;
  verifiedAt: string | null;
}

// =============================================================================
// VALIDATORS & TYPE GUARDS
// =============================================================================

export function isValidFrameworkAdoptionStatus(status: unknown): status is FrameworkAdoptionStatus {
  return typeof status === 'string' && VALID_FRAMEWORK_ADOPTION_STATUSES.includes(status as FrameworkAdoptionStatus);
}

export function isValidScopeProfileStatus(status: unknown): status is ScopeProfileStatus {
  return typeof status === 'string' && VALID_SCOPE_PROFILE_STATUSES.includes(status as ScopeProfileStatus);
}

export function isValidApplicabilityType(type: unknown): type is ApplicabilityType {
  return typeof type === 'string' && VALID_APPLICABILITY_TYPES.includes(type as ApplicabilityType);
}

export function isValidApplicabilityStatus(status: unknown): status is ApplicabilityStatus {
  return typeof status === 'string' && VALID_APPLICABILITY_STATUSES.includes(status as ApplicabilityStatus);
}

export function isValidRequirementComplianceStatus(status: unknown): status is RequirementComplianceStatus {
  return typeof status === 'string' && VALID_REQUIREMENT_COMPLIANCE_STATUSES.includes(status as RequirementComplianceStatus);
}

export function isValidControlMappingType(type: unknown): type is ControlMappingType {
  return typeof type === 'string' && VALID_CONTROL_MAPPING_TYPES.includes(type as ControlMappingType);
}

/**
 * Validates that a TenantScopeFact conforms to its declared data type.
 */
export function validateScopeFactValue(fact: Partial<TenantScopeFact>): { valid: boolean; error?: string } {
  if (!fact.factKey || typeof fact.factKey !== 'string' || fact.factKey.trim().length === 0) {
    return { valid: false, error: 'factKey is required and cannot be empty.' };
  }
  if (!fact.dataType || !['boolean', 'string', 'number', 'string_array'].includes(fact.dataType)) {
    return { valid: false, error: `Invalid fact dataType: ${fact.dataType}` };
  }

  switch (fact.dataType) {
    case 'boolean':
      if (typeof fact.valueBoolean !== 'boolean') {
        return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'boolean' but valueBoolean is not boolean.` };
      }
      break;
    case 'string':
      if (typeof fact.valueString !== 'string') {
        return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'string' but valueString is not string.` };
      }
      break;
    case 'number':
      if (typeof fact.valueNumber !== 'number' || isNaN(fact.valueNumber)) {
        return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'number' but valueNumber is not a valid number.` };
      }
      break;
    case 'string_array':
      if (!Array.isArray(fact.valueArray) || fact.valueArray.some((i) => typeof i !== 'string')) {
        return { valid: false, error: `factKey '${fact.factKey}' declared dataType 'string_array' but valueArray is not an array of strings.` };
      }
      break;
  }

  return { valid: true };
}

/**
 * Validates an applicability decision payload, enforcing justification & override requirements.
 */
export function validateApplicabilityDecision(
  decision: Partial<TenantApplicabilityDecision>
): { valid: boolean; error?: string } {
  if (!decision.requirementId || !decision.frameworkId) {
    return { valid: false, error: 'requirementId and frameworkId are required.' };
  }
  if (decision.isApplicable === undefined || typeof decision.isApplicable !== 'boolean') {
    return { valid: false, error: 'isApplicable must be an explicit boolean.' };
  }
  if (!decision.applicabilityType || !isValidApplicabilityType(decision.applicabilityType)) {
    return { valid: false, error: `Invalid applicabilityType: ${decision.applicabilityType}` };
  }

  // Non-applicable requires mandatory rationale
  if (!decision.isApplicable && (!decision.rationale || decision.rationale.trim().length === 0)) {
    return { valid: false, error: 'A clear rationale is mandatory when marking a requirement non-applicable.' };
  }

  // Manual exclusions or inclusions require overrideReason if overriding a rule
  if (
    (decision.applicabilityType === 'manual_exclusion' || decision.applicabilityType === 'manual_inclusion') &&
    decision.matchedRuleId &&
    (!decision.overrideReason || decision.overrideReason.trim().length === 0)
  ) {
    return { valid: false, error: 'An overrideReason is strictly required when manually overriding an automated rule decision.' };
  }

  return { valid: true };
}

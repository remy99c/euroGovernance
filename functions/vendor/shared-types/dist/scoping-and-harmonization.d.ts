import { BaseEntity } from './core.js';
import { ControlImplementationStatus, Framework, Requirement, MasterControl, MasterRequirementControlMapping, Control, Evidence } from './grc.js';
export type FrameworkAdoptionStatus = 'evaluating' | 'in_scoping' | 'adopted' | 'active' | 'under_audit' | 'retired';
export declare const VALID_FRAMEWORK_ADOPTION_STATUSES: readonly FrameworkAdoptionStatus[];
export type ScopeProfileType = 'general_compliance' | 'iso_isms' | 'iso_aims' | 'gdpr_privacy' | 'ai_governance' | 'data_act' | 'integrated_grc';
export declare const VALID_SCOPE_PROFILE_TYPES: readonly ScopeProfileType[];
export type ScopeProfileStatus = 'draft' | 'under_review' | 'approved' | 'superseded';
export declare const VALID_SCOPE_PROFILE_STATUSES: readonly ScopeProfileStatus[];
export type ScopeFactCategory = 'organization' | 'infrastructure' | 'data_processing' | 'ai_systems' | 'third_parties' | 'geography' | 'governance';
export declare const VALID_SCOPE_FACT_CATEGORIES: readonly ScopeFactCategory[];
export type ScopeFactDataType = 'boolean' | 'string' | 'number' | 'string_array';
export type QuestionnaireCategory = 'privacy' | 'ai_governance' | 'security' | 'data_governance' | 'general';
export type QuestionResponseType = 'single_choice' | 'multi_choice' | 'boolean' | 'text' | 'numeric' | 'string_array';
export type ApplicabilityConditionOperator = 'equals' | 'not_equals' | 'in' | 'not_in' | 'contains' | 'not_contains' | 'contains_any' | 'contains_all' | 'greater_than' | 'less_than' | 'greater_than_or_equal' | 'less_than_or_equal' | 'is_true' | 'is_false' | 'is_empty' | 'is_not_empty' | 'exists' | 'not_exists';
export declare const VALID_APPLICABILITY_OPERATORS: readonly ApplicabilityConditionOperator[];
export type ConditionGroupLogicalOperator = 'all' | 'any' | 'none' | 'not';
export declare const VALID_CONDITION_GROUP_OPERATORS: readonly ConditionGroupLogicalOperator[];
export type ApplicabilityType = 'statutory_mandatory' | 'rule_derived' | 'manual_inclusion' | 'manual_exclusion';
export declare const VALID_APPLICABILITY_TYPES: readonly ApplicabilityType[];
export type ApplicabilityOutcome = 'applicable' | 'not_applicable' | 'review_required' | 'inherited' | 'deferred' | 'conditionally_applicable' | 'pending_evaluation';
export declare const VALID_APPLICABILITY_OUTCOMES: readonly ApplicabilityOutcome[];
export type ApplicabilityStatus = ApplicabilityOutcome;
export declare const VALID_APPLICABILITY_STATUSES: readonly ApplicabilityOutcome[];
export type RequirementComplianceStatus = 'not_evaluated' | 'non_compliant' | 'partially_compliant' | 'compliant' | 'not_applicable';
export declare const VALID_REQUIREMENT_COMPLIANCE_STATUSES: readonly RequirementComplianceStatus[];
export type ControlMappingType = 'equivalent' | 'subset' | 'superset' | 'intersecting' | 'compensating';
export declare const VALID_CONTROL_MAPPING_TYPES: readonly ControlMappingType[];
export type ControlMappingConfidence = 'high' | 'medium' | 'low';
/**
 * Global Scope Discovery Questionnaire (/scope_questionnaires/{questionnaireId})
 * Master questions used to elicit organizational facts from tenants.
 */
export interface ScopeQuestionnaire {
    id: string;
    title: string;
    description: string;
    category: QuestionnaireCategory;
    version: string;
    frameworkIds: string[];
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
    sectionId?: string;
    sectionTitle?: string;
    factKey: string;
    prompt: string;
    guidanceText: string;
    category: ScopeFactCategory;
    responseType: QuestionResponseType;
    options?: Array<{
        label: string;
        value: string | boolean | number;
    }>;
    defaultValue?: string | boolean | number | string[];
    sortOrder: number;
    isRequired: boolean;
    isTriggerForFrameworks: string[];
}
export interface ComposedQuestionnaireSection {
    id: string;
    title: string;
    description: string;
    category: QuestionnaireCategory;
    frameworkIds: string[];
    questions: ScopeQuestion[];
}
export interface ComposedQuestionnaire {
    id: string;
    title: string;
    description: string;
    applicableFrameworkIds: string[];
    sections: ComposedQuestionnaireSection[];
    totalQuestionsCount: number;
    requiredQuestionsCount: number;
}
export interface QuestionnaireProgress {
    totalQuestions: number;
    requiredQuestions: number;
    answeredQuestions: number;
    answeredRequiredQuestions: number;
    progressPercentage: number;
    isComplete: boolean;
    missingRequiredQuestionIds: string[];
}
export interface ApplicabilityConditionClause {
    factKey: string;
    operator: ApplicabilityConditionOperator;
    expectedValue?: boolean | string | number | string[] | null;
    description?: string;
}
export type ApplicabilityRuleCondition = ApplicabilityConditionClause;
export interface ApplicabilityConditionGroup {
    logicalOperator: ConditionGroupLogicalOperator;
    clauses: ApplicabilityConditionClause[];
    nestedGroups?: ApplicabilityConditionGroup[];
}
export interface ClauseEvaluationDetail {
    factKey: string;
    operator: ApplicabilityConditionOperator;
    expectedValue: unknown;
    actualValue: unknown;
    passed: boolean;
    reason: string;
}
export interface ApplicabilityRuleEvaluationResult {
    ruleId: string;
    ruleName: string;
    frameworkId: string;
    targetRequirementId: string;
    targetMasterControlId?: string | null;
    matched: boolean;
    resultingOutcome: ApplicabilityOutcome;
    explanation: string;
    auditTrail: string[];
    clauseDetails: ClauseEvaluationDetail[];
    evaluatedAt: string;
}
/**
 * Global Applicability Rule (/applicability_rules/{ruleId})
 * Deterministic rules that evaluate tenant scope facts to derive requirement applicability.
 */
export interface ApplicabilityRule {
    id: string;
    frameworkId: string;
    targetRequirementId: string;
    targetMasterControlId?: string | null;
    ruleName: string;
    description: string;
    conditionGroup?: ApplicabilityConditionGroup;
    condition?: ApplicabilityConditionClause;
    resultingStatusIfMatched: ApplicabilityOutcome;
    resultingStatusIfNotMatched?: ApplicabilityOutcome;
    statutoryRationale: string;
    isMandatoryUnlessExempt: boolean;
    priority?: number;
    version: string;
    createdAt: string;
    updatedAt: string;
}
/**
 * Global Canonical Control Mapping (/control_mappings/{mappingId})
 * Cross-walk harmonization matrix linking controls and requirements across frameworks.
 */
export interface CanonicalControlMapping {
    id: string;
    canonicalGroupKey?: string;
    harmonizedDomain: string;
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
    allowAutomaticMerge?: boolean;
    coverageRatio?: number;
    mappingRationale: string;
    createdAt: string;
    updatedAt: string;
}
export interface ControlObligationCoverage {
    frameworkId: string;
    frameworkTitle: string;
    requirementId: string;
    sectionCode: string;
    requirementTitle: string;
    mappingType: ControlMappingType;
    coverageRatio: number;
    isDirect: boolean;
    statutoryRationale: string;
    auditExplanation: string;
}
export interface ControlHarmonizedCoverage {
    controlId: string;
    controlCode: string;
    controlTitle: string;
    domain: string;
    status: ControlImplementationStatus;
    healthScore: number;
    isHarmonized: boolean;
    totalObligationsSatisfied: number;
    frameworksCovered: string[];
    obligations: ControlObligationCoverage[];
    coverageSummaryExplanation: string;
}
/**
 * 1. Tenant Framework Adoption (/tenants/{tenantId}/adopted_frameworks/{frameworkId})
 * Lifecycle state of a regulatory framework adopted by a tenant.
 */
export interface TenantFrameworkAdoption extends BaseEntity {
    frameworkId: string;
    frameworkCode: string;
    frameworkName: string;
    frameworkVersion: string;
    status: FrameworkAdoptionStatus;
    scopeProfileId: string | null;
    scopeDescription: string;
    scopingBoundaries: string[];
    targetCertificationDate: string | null;
    totalMasterControlsCount: number;
    instantiatedControlsCount: number;
    applicableControlsCount: number;
    notApplicableControlsCount: number;
    adoptedBy: string;
    adoptedAt: string;
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
    profileType: ScopeProfileType;
    status: ScopeProfileStatus;
    version: string;
    revisionNumber: number;
    revisionRationale: string;
    supersededProfileId: string | null;
    applicableFrameworkIds: string[];
    narrativeStatement: string;
    includedLegalEntities: string[];
    includedBusinessUnits: string[];
    includedLocations: string[];
    includedJurisdictions: string[];
    processesPersonalData: boolean;
    processesSpecialCategoryData: boolean;
    deploysAISystems: boolean;
    deploysHighRiskAI: boolean;
    hasInternationalTransfers: boolean;
    cloudProviders: string[];
    inScopeAssetIds: string[];
    inScopeVendorIds: string[];
    inScopeAISystemIds: string[];
    inScopeRopaIds: string[];
    excludedOperations: string[];
    exclusionsJustification: string;
    frameworkSpecificFacts?: Record<string, unknown>;
    completenessPercentage: number;
    isComplete: boolean;
    missingFactKeys: string[];
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
    scopeProfileId: string | null;
    frameworkId: string | null;
    factKey: string;
    factTitle?: string;
    category: ScopeFactCategory;
    dataType: ScopeFactDataType;
    valueBoolean: boolean | null;
    valueString: string | null;
    valueNumber: number | null;
    valueArray: string[] | null;
    source: 'questionnaire' | 'manual_entry' | 'system_detected' | 'api_sync';
    sourceQuestionId: string | null;
    confidence: 'verified' | 'self_declared' | 'inferred';
    verificationEvidenceId: string | null;
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
export type DecisionSource = 'auto' | 'user_override' | 'reviewer_override';
export interface AutoApplicabilityBaseline {
    isApplicable: boolean;
    status: ApplicabilityStatus;
    matchedRuleId: string | null;
    ruleEvaluationSummary: string | null;
    evaluatedAt: string;
}
export interface ApplicabilityDecisionHistoryEntry {
    timestamp: string;
    actorId: string;
    actorRole: string;
    decisionSource: DecisionSource;
    previousStatus: ApplicabilityStatus;
    newStatus: ApplicabilityStatus;
    previousIsApplicable: boolean;
    newIsApplicable: boolean;
    overrideRationale: string;
    reviewerId?: string | null;
    reviewerRole?: string | null;
    notes?: string | null;
}
/**
 * 5. Tenant Applicability Decision (/tenants/{tenantId}/applicability_decisions/{decisionId})
 * Formal statement on whether a specific statutory requirement is applicable to the tenant.
 */
export interface TenantApplicabilityDecision extends BaseEntity {
    requirementId: string;
    frameworkId: string;
    sectionCode: string;
    requirementTitle: string;
    isApplicable: boolean;
    status: ApplicabilityStatus;
    applicabilityType: ApplicabilityType;
    decisionSource?: DecisionSource;
    isOverridden?: boolean;
    autoResult?: AutoApplicabilityBaseline | null;
    overrideReason: string | null;
    overrideRationale?: string | null;
    matchedRuleId: string | null;
    ruleEvaluationSummary: string | null;
    rationale: string;
    previousStatus: ApplicabilityStatus | null;
    assessedBy: string;
    assessedAt: string;
    reviewedBy: string | null;
    reviewedAt: string | null;
    reviewerRole?: string | null;
    history?: ApplicabilityDecisionHistoryEntry[];
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
    applicabilityDecisionId: string;
    complianceStatus: RequirementComplianceStatus;
    satisfyingControlIds: string[];
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
    masterControlId: string | null;
    code: string;
    title: string;
    description: string;
    domain: string;
    frameworkIds: string[];
    requirementIds: string[];
    status: ControlImplementationStatus;
    healthScore: number;
    enforcementMechanism: 'automated' | 'manual' | 'policy' | 'hybrid';
    reviewFrequencyDays: number;
    lastReviewDate: string | null;
    nextReviewDate: string | null;
    implementationNotes: string;
    isHarmonized: boolean;
    canonicalMappingIds: string[];
}
/**
 * 8. Tenant Control Mapping (/tenants/{tenantId}/control_mappings/{mappingId})
 * Tenant-specific mapping connecting an adopted control to requirements, risks, or policies.
 */
export interface TenantControlMapping extends BaseEntity {
    controlId: string;
    frameworkId: string;
    requirementId: string;
    sectionCode?: string;
    requirementTitle?: string;
    canonicalMappingId?: string | null;
    mappingType: ControlMappingType;
    coverageRatio: number;
    isDirectRequirement?: boolean;
    mappingRationale: string;
    compensatingControlsJustification: string | null;
    verifiedBy: string | null;
    verifiedAt: string | null;
}
export type StatutoryArtifactKind = 'control_instance' | 'obligation_flag' | 'required_register' | 'required_assessment' | 'required_operational_record';
export type StatutoryObligationType = 'gdpr_ropa_register' | 'gdpr_dpia_assessment' | 'gdpr_tia_assessment' | 'gdpr_dsr_portal' | 'gdpr_breach_register' | 'gdpr_dpo_appointment' | 'gdpr_cross_border_safeguards' | 'ai_act_system_register' | 'ai_act_risk_classification' | 'ai_act_fria_assessment' | 'ai_act_incident_register' | 'ai_act_post_market_monitoring' | 'ai_act_substantial_change_log' | 'ai_act_transparency_notice' | 'data_act_asset_register' | 'data_act_b2b_sharing_register' | 'data_act_cloud_switching_register' | 'data_act_smart_contract_safeguard';
/**
 * 9. Statutory Obligation Flag (/tenants/{tenantId}/statutory_obligations/{flagId})
 * Explicit statutory obligation or required register/assessment triggered by regulatory scope facts.
 */
export interface StatutoryObligationFlag extends BaseEntity {
    frameworkId: string;
    obligationType: StatutoryObligationType;
    title: string;
    description: string;
    artifactKind: StatutoryArtifactKind;
    targetCollection: string;
    isMandatory: boolean;
    status: 'active' | 'waived' | 'fulfilled' | 'deferred' | 'retired';
    triggeringFactKeys: string[];
    statutoryBasis: string;
    suggestedArtifactTemplate?: Record<string, unknown>;
    rationale: string;
    derivedFromDecisionId?: string | null;
}
export interface RequiredRegisterSpec {
    collection: string;
    title: string;
    obligationType: StatutoryObligationType;
    statutoryBasis: string;
    rationale: string;
    initialEntryDraft?: Record<string, unknown>;
}
export interface RequiredAssessmentSpec {
    assessmentType: string;
    collection: string;
    title: string;
    obligationType: StatutoryObligationType;
    statutoryBasis: string;
    rationale: string;
}
export interface RequiredOperationalRecordSpec {
    recordType: string;
    collection: string;
    title: string;
    obligationType: StatutoryObligationType;
    statutoryBasis: string;
    rationale: string;
}
export interface StatutoryArtifactInstantiationResult {
    obligationFlags: StatutoryObligationFlag[];
    requiredRegisters: RequiredRegisterSpec[];
    requiredAssessments: RequiredAssessmentSpec[];
    requiredOperationalRecords: RequiredOperationalRecordSpec[];
}
export declare function isValidFrameworkAdoptionStatus(status: unknown): status is FrameworkAdoptionStatus;
export declare function isValidScopeProfileType(type: unknown): type is ScopeProfileType;
export declare function isValidScopeProfileStatus(status: unknown): status is ScopeProfileStatus;
/**
 * Calculates scope completeness percentage and identifies missing fact keys.
 */
export declare function calculateScopeCompleteness(profile: Partial<TenantScopeProfile>): {
    completenessPercentage: number;
    isComplete: boolean;
    missingFactKeys: string[];
};
/**
 * Validates a TenantScopeProfile conforming to its declared profileType.
 */
export declare function validateScopeProfile(profile: Partial<TenantScopeProfile>): {
    valid: boolean;
    error?: string;
};
export declare function isValidApplicabilityType(type: unknown): type is ApplicabilityType;
export declare function isValidApplicabilityStatus(status: unknown): status is ApplicabilityStatus;
export declare function isValidRequirementComplianceStatus(status: unknown): status is RequirementComplianceStatus;
export declare function isValidControlMappingType(type: unknown): type is ControlMappingType;
/**
 * Validates that a TenantScopeFact conforms to its declared data type.
 */
export declare function validateScopeFactValue(fact: Partial<TenantScopeFact>): {
    valid: boolean;
    error?: string;
};
/**
 * Validates an applicability decision payload, enforcing justification & override requirements.
 */
export declare function validateApplicabilityDecision(decision: Partial<TenantApplicabilityDecision>): {
    valid: boolean;
    error?: string;
};
/**
 * Validates a TenantScopeAnswer against its target ScopeQuestion definition.
 */
export declare function validateScopeAnswer(question: ScopeQuestion, answer: Partial<TenantScopeAnswer>): {
    valid: boolean;
    error?: string;
};
/**
 * Maps a TenantScopeAnswer to a structured TenantScopeFact.
 */
export declare function mapAnswerToScopeFact(tenantId: string, question: ScopeQuestion, answer: TenantScopeAnswer, userId: string): TenantScopeFact;
/**
 * Calculates progress for a questionnaire given an array of questions and existing answers.
 */
export declare function calculateQuestionnaireProgress(questions: ScopeQuestion[], answers: Record<string, Partial<TenantScopeAnswer>>): QuestionnaireProgress;
/**
 * Composes a unified questionnaire across multiple adopted frameworks, deduplicating shared questions.
 */
export declare function composeTenantQuestionnaire(adoptedFrameworkIds: string[], allQuestionnaires: ScopeQuestionnaire[], allQuestions: ScopeQuestion[]): ComposedQuestionnaire;
/**
 * Helper to extract raw value from a TenantScopeFact or primitive.
 */
export declare function extractScopeFactRawValue(factOrVal: unknown): unknown;
/**
 * Validates an ApplicabilityRule schema for structural correctness and condition integrity.
 */
export declare function validateApplicabilityRule(rule: Partial<ApplicabilityRule>): {
    valid: boolean;
    error?: string;
};
/**
 * Evaluates a single condition clause against known tenant scope facts.
 */
export declare function evaluateConditionClause(clause: ApplicabilityConditionClause, facts: Record<string, TenantScopeFact | unknown>): {
    passed: boolean;
    actualValue: unknown;
    reason: string;
};
/**
 * Evaluates a condition group (with support for 'all', 'any', 'none', 'not' and nested groups).
 */
export declare function evaluateConditionGroup(group: ApplicabilityConditionGroup, facts: Record<string, TenantScopeFact | unknown>): {
    passed: boolean;
    clauseDetails: ClauseEvaluationDetail[];
    auditTrail: string[];
};
/**
 * Evaluates an ApplicabilityRule against tenant scope facts and returns structured audit explanation.
 */
export declare function evaluateApplicabilityRule(rule: ApplicabilityRule, facts: Record<string, TenantScopeFact | unknown>): ApplicabilityRuleEvaluationResult;
/**
 * Evaluates an entire suite of ApplicabilityRules for a tenant against their scope facts.
 */
export declare function evaluateFrameworkApplicabilityRules(rules: ApplicabilityRule[], facts: Record<string, TenantScopeFact | unknown>): ApplicabilityRuleEvaluationResult[];
/**
 * Validates an applicability decision override request.
 * Strictly enforces non-empty override rationale (minimum 10 characters).
 */
export declare function validateApplicabilityOverride(params: {
    newStatus: ApplicabilityStatus;
    isApplicable: boolean;
    overrideRationale: string;
    decisionSource: DecisionSource;
    reviewerId?: string | null;
}): {
    valid: boolean;
    error?: string;
};
/**
 * Applies a manual or reviewer override to an applicability decision,
 * preserving original automatic baseline results for comparison and logging full historical attribution.
 */
export declare function applyApplicabilityOverride(params: {
    decision: TenantApplicabilityDecision;
    newStatus: ApplicabilityStatus;
    isApplicable: boolean;
    overrideRationale: string;
    actorId: string;
    actorRole: string;
    decisionSource: DecisionSource;
    reviewerId?: string | null;
    reviewerRole?: string | null;
    notes?: string | null;
}): TenantApplicabilityDecision;
/**
 * Reverts an overridden applicability decision back to its automatic baseline result,
 * preserving full audit history of the reversion event.
 */
export declare function revertApplicabilityOverride(params: {
    decision: TenantApplicabilityDecision;
    actorId: string;
    actorRole: string;
    reason: string;
}): TenantApplicabilityDecision;
export interface InstantiationInput {
    tenantId: string;
    defaultOwnerId: string;
    decisions: TenantApplicabilityDecision[];
    requirements: Requirement[];
    masterControls: MasterControl[];
    requirementControlMappings: MasterRequirementControlMapping[];
    canonicalControlMappings?: CanonicalControlMapping[];
    existingRequirementInstances?: TenantRequirementInstance[];
    existingControlInstances?: TenantControlInstance[];
}
export interface InstantiationResult {
    requirementInstances: TenantRequirementInstance[];
    controlInstances: TenantControlInstance[];
    controlMappings: TenantControlMapping[];
    createdRequirementsCount: number;
    updatedRequirementsCount: number;
    createdControlsCount: number;
    updatedControlsCount: number;
    harmonizedControlsCount: number;
}
export declare function mapOutcomeToComplianceStatus(outcome: ApplicabilityOutcome): RequirementComplianceStatus;
export declare function mapOutcomeToControlStatus(outcome: ApplicabilityOutcome): ControlImplementationStatus;
/**
 * Deterministically instantiates or synchronizes tenant requirement instances and control instances.
 * Guarantees cross-framework harmonization (non-duplication) and lifecycle safety on rerun.
 */
export declare function instantiateTenantGRC(input: InstantiationInput): InstantiationResult;
/**
 * Builds an explainable "One Control, Many Obligations" coverage report for users and auditors.
 */
export declare function buildControlCoverageSummary(control: TenantControlInstance, allRequirements: Requirement[], canonicalMappings?: CanonicalControlMapping[], frameworks?: Framework[]): ControlHarmonizedCoverage;
/**
 * Evaluates tenant regulatory scope facts against adopted frameworks to derive
 * explicit, typed statutory obligations, required registers, assessments, and operational records.
 *
 * Distinctly models regulation-oriented requirements (GDPR, EU AI Act, EU Data Act) without
 * forcing them into an ISO-style control-only model.
 */
export declare function deriveStatutoryObligations(params: {
    tenantId: string;
    defaultOwnerId: string;
    scopeFacts: TenantScopeFact[];
    decisions: TenantApplicabilityDecision[];
    adoptedFrameworks: string[];
}): StatutoryArtifactInstantiationResult;
export interface FrameworkCoverageMetrics {
    frameworkId: string;
    frameworkCode: string;
    frameworkTitle: string;
    category: string;
    jurisdiction: string;
    version: string;
    isAdopted: boolean;
    totalRequirementsCount: number;
    applicableRequirementsCount: number;
    nonApplicableRequirementsCount: number;
    reviewNeededRequirementsCount: number;
    inheritedRequirementsCount: number;
    deferredRequirementsCount: number;
    totalControlsCount: number;
    implementedControlsCount: number;
    harmonizedControlsCount: number;
    openGapsCount: number;
    overdueReviewsCount: number;
    missingEvidenceCount: number;
    readinessPercentage: number;
}
export interface TenantFrameworkCoverageDashboardData {
    tenantId: string;
    generatedAt: string;
    adoptedFrameworksCount: number;
    totalRequirementsCount: number;
    totalApplicableCount: number;
    totalNonApplicableCount: number;
    totalReviewNeededCount: number;
    totalControlsCount: number;
    totalHarmonizedControlsCount: number;
    totalOpenGapsCount: number;
    totalOverdueReviewsCount: number;
    totalMissingEvidenceCount: number;
    overallReadinessScore: number;
    frameworks: FrameworkCoverageMetrics[];
    statutoryObligationsSummary: {
        totalActiveObligations: number;
        byFramework: Record<string, number>;
    };
}
/**
 * Computes deterministic framework coverage, obligation counts, gap indicators, and readiness metrics.
 */
export declare function computeTenantFrameworkCoverage(params: {
    tenantId: string;
    adoptedFrameworkIds: string[];
    frameworks: Framework[];
    requirements: Requirement[];
    decisions: TenantApplicabilityDecision[];
    requirementInstances?: TenantRequirementInstance[];
    controls: (TenantControlInstance | Control)[];
    evidence?: (Evidence | any)[];
    statutoryObligations?: StatutoryObligationFlag[];
}): TenantFrameworkCoverageDashboardData;
//# sourceMappingURL=scoping-and-harmonization.d.ts.map
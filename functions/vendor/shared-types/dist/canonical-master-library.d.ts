import { Framework, Requirement, MasterControl, MasterRequirementControlMapping } from './grc.js';
import { CanonicalControlMapping, ScopeQuestionnaire, ScopeQuestion, ApplicabilityRule } from './scoping-and-harmonization.js';
export interface CanonicalMasterDataset {
    frameworks: Framework[];
    requirements: Requirement[];
    masterControls: MasterControl[];
    requirementControlMappings: MasterRequirementControlMapping[];
    canonicalControlMappings: CanonicalControlMapping[];
}
export declare const CANONICAL_FRAMEWORKS: Framework[];
export declare const CANONICAL_REQUIREMENTS: Requirement[];
export declare const CANONICAL_MASTER_CONTROLS: MasterControl[];
export declare const CANONICAL_REQUIREMENT_CONTROL_MAPPINGS: MasterRequirementControlMapping[];
export declare const CANONICAL_CROSS_WALK_MAPPINGS: CanonicalControlMapping[];
export declare const CANONICAL_SCOPE_QUESTIONNAIRES: ScopeQuestionnaire[];
export declare const CANONICAL_SCOPE_QUESTIONS: ScopeQuestion[];
export declare const CANONICAL_APPLICABILITY_RULES: ApplicabilityRule[];
export interface CanonicalMasterDataset {
    frameworks: Framework[];
    requirements: Requirement[];
    masterControls: MasterControl[];
    requirementControlMappings: MasterRequirementControlMapping[];
    canonicalControlMappings: CanonicalControlMapping[];
    scopeQuestionnaires: ScopeQuestionnaire[];
    scopeQuestions: ScopeQuestion[];
    applicabilityRules: ApplicabilityRule[];
}
export declare const CANONICAL_MASTER_DATA: CanonicalMasterDataset;
//# sourceMappingURL=canonical-master-library.d.ts.map
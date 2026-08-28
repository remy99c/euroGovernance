import { BaseEntity } from './core.js';
export type AIRoleType = 'provider' | 'deployer' | 'importer' | 'distributor' | 'authorized_representative';
export type AIRiskTier = 'prohibited' | 'high_risk' | 'transparency_only' | 'minimal_risk' | 'general_purpose_ai';
export type AISystemStatus = 'design' | 'development' | 'testing' | 'deployed' | 'deprecated';
export type AIAssessmentType = 'prohibited_check' | 'high_risk_classification' | 'fria' | 'conformity_assessment';
export type AIAssessmentStatus = 'draft' | 'under_review' | 'approved' | 'rejected';
export type AIIncidentSeverity = 'serious_incident' | 'malfunction' | 'near_miss' | 'adverse_event';
export type AIIncidentStatus = 'reported' | 'investigating' | 'authority_notified' | 'mitigated' | 'closed';
/**
 * EU AI Act AI System Register (/tenants/{tenantId}/ai_systems/{systemId})
 */
export interface AISystem extends BaseEntity {
    code: string;
    name: string;
    version: string;
    description: string;
    role: AIRoleType;
    riskTier: AIRiskTier;
    intendedPurpose: string;
    deploymentContext: string;
    isGeneralPurposeAI: boolean;
    hasSystemicRisk: boolean;
    underlyingFoundationModel: string | null;
    vendorId: string | null;
    status: AISystemStatus;
    humanOversightMeasures: string;
    transparencyMeasures: string;
    euDatabaseRegistrationNumber: string | null;
    linkedSystemAssetId: string | null;
    linkedRopaId: string | null;
    linkedControlIds: string[];
}
/**
 * EU AI Act Classification Assessment (/tenants/{tenantId}/ai_assessments/{assessmentId})
 */
export interface AIClassificationAssessment extends BaseEntity {
    aiSystemId: string;
    assessmentType: AIAssessmentType;
    status: AIAssessmentStatus;
    prohibitedPracticesCheck: {
        cognitiveBehavioralManipulation: boolean;
        vulnerabilityExploitation: boolean;
        socialScoring: boolean;
        predictivePolicing: boolean;
        untargetedFacialScraping: boolean;
        emotionRecognitionInWorkplaceOrEducation: boolean;
        biometricCategorizationSensitive: boolean;
        realTimeRemoteBiometricIdentification: boolean;
    };
    annexThreeCategory: 'none' | 'biometrics' | 'critical_infrastructure' | 'education_vocational' | 'employment_worker_management' | 'essential_services_benefits' | 'law_enforcement' | 'migration_asylum' | 'justice_democracy';
    determinedRiskTier: AIRiskTier;
    justificationSummary: string;
    assessedBy: string;
    assessedAt: string;
    approvedBy: string | null;
    approvedAt: string | null;
}
/**
 * Fundamental Rights Impact Assessment - FRIA (Art. 27 EU AI Act)
 */
export interface FRIA extends BaseEntity {
    aiSystemId: string;
    title: string;
    status: AIAssessmentStatus;
    affectedTargetGroups: string[];
    impactOnDignityAndPrivacy: string;
    impactOnNonDiscriminationAndEquality: string;
    impactOnFreedomOfExpression: string;
    humanOversightGovernanceDetails: string;
    mitigationMeasuresIdentified: string[];
    dpoOrStakeholderConsultationNotes: string;
    residualImpactRating: 'acceptable' | 'tolerable_with_mitigations' | 'unacceptable';
    nextReviewDate: string;
}
/**
 * General AI Risk and Impact Assessment (/tenants/{tenantId}/ai_assessments/{assessmentId})
 */
export interface AIImpactAssessment extends BaseEntity {
    aiSystemId: string;
    assessmentTitle: string;
    scope: string;
    status: AIAssessmentStatus;
    dataQualityEvaluation: string;
    biasAndFairnessEvaluation: string;
    transparencyEvaluation: string;
    cybersecurityEvaluation: string;
    humanOversightEvaluation: string;
    overallRiskLevel: 'low' | 'medium' | 'high' | 'unacceptable';
    requiredMitigations: string[];
    nextReviewDate: string;
    assessedBy: string;
    assessedAt: string;
}
/**
 * Serious Incident & Malfunctioning Register (Art. 73 EU AI Act)
 */
export interface AIIncident extends BaseEntity {
    aiSystemId: string;
    incidentReference: string;
    title: string;
    description: string;
    severity: AIIncidentSeverity;
    status: AIIncidentStatus;
    discoveredAt: string;
    occurredAt: string | null;
    isFatalOrSevereHealthImpact: boolean;
    isCriticalInfrastructureDisruption: boolean;
    isFundamentalRightsBreach: boolean;
    marketSurveillanceAuthorityNotified: boolean;
    authorityNotificationDeadline: string;
    authorityNotificationDate: string | null;
    rootCauseAnalysis: string;
    immediateCorrectiveAction: string;
}
/**
 * Post-Market Monitoring Record (Art. 72 EU AI Act)
 */
export interface PostMarketMonitoring extends BaseEntity {
    aiSystemId: string;
    monitoringPeriodStart: string;
    monitoringPeriodEnd: string;
    performanceMetricsSummary: string;
    biasAndDriftFindings: string;
    correctiveActionsRequired: boolean;
    linkedIssueIds: string[];
    reviewedBy: string;
    reviewedAt: string;
}
//# sourceMappingURL=ai-act.d.ts.map
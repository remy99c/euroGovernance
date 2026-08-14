import {
  TenantFrameworkAdoption,
  TenantScopeProfile,
  TenantScopeFact,
  ScopeQuestionnaire,
  TenantScopeAnswer,
  ApplicabilityRule,
  TenantApplicabilityDecision,
  TenantRequirementInstance,
  TenantControlInstance,
  CanonicalControlMapping,
  TenantControlMapping,
  isValidFrameworkAdoptionStatus,
  isValidScopeProfileStatus,
  isValidApplicabilityType,
  isValidApplicabilityStatus,
  isValidRequirementComplianceStatus,
  isValidControlMappingType,
  validateScopeFactValue,
  validateApplicabilityDecision,
} from '@eurogovernance/shared-types';

describe('Framework Scoping, Applicability & Harmonization Data Models & Validators', () => {
  const tenantId = 'tenant_eurocorp_de';
  const now = new Date().toISOString();
  const userId = 'usr_compliance_01';

  // 1. Enum and Status Type Guards
  describe('Status & Enum Type Guards', () => {
    test('isValidFrameworkAdoptionStatus validates correct statuses', () => {
      expect(isValidFrameworkAdoptionStatus('evaluating')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('in_scoping')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('adopted')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('active')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('under_audit')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('retired')).toBe(true);
      expect(isValidFrameworkAdoptionStatus('invalid_status')).toBe(false);
      expect(isValidFrameworkAdoptionStatus(null)).toBe(false);
    });

    test('isValidScopeProfileStatus validates scope profile lifecycle', () => {
      expect(isValidScopeProfileStatus('draft')).toBe(true);
      expect(isValidScopeProfileStatus('under_review')).toBe(true);
      expect(isValidScopeProfileStatus('approved')).toBe(true);
      expect(isValidScopeProfileStatus('superseded')).toBe(true);
      expect(isValidScopeProfileStatus('active')).toBe(false);
    });

    test('isValidApplicabilityType validates statutory vs rule vs override types', () => {
      expect(isValidApplicabilityType('statutory_mandatory')).toBe(true);
      expect(isValidApplicabilityType('rule_derived')).toBe(true);
      expect(isValidApplicabilityType('manual_inclusion')).toBe(true);
      expect(isValidApplicabilityType('manual_exclusion')).toBe(true);
      expect(isValidApplicabilityType('unknown')).toBe(false);
    });

    test('isValidApplicabilityStatus validates applicability states', () => {
      expect(isValidApplicabilityStatus('applicable')).toBe(true);
      expect(isValidApplicabilityStatus('not_applicable')).toBe(true);
      expect(isValidApplicabilityStatus('conditionally_applicable')).toBe(true);
      expect(isValidApplicabilityStatus('pending_evaluation')).toBe(true);
      expect(isValidApplicabilityStatus('approved')).toBe(false);
    });

    test('isValidRequirementComplianceStatus validates requirement progress', () => {
      expect(isValidRequirementComplianceStatus('not_evaluated')).toBe(true);
      expect(isValidRequirementComplianceStatus('non_compliant')).toBe(true);
      expect(isValidRequirementComplianceStatus('partially_compliant')).toBe(true);
      expect(isValidRequirementComplianceStatus('compliant')).toBe(true);
      expect(isValidRequirementComplianceStatus('not_applicable')).toBe(true);
      expect(isValidRequirementComplianceStatus('in_progress')).toBe(false);
    });

    test('isValidControlMappingType validates mapping relationships', () => {
      expect(isValidControlMappingType('equivalent')).toBe(true);
      expect(isValidControlMappingType('subset')).toBe(true);
      expect(isValidControlMappingType('superset')).toBe(true);
      expect(isValidControlMappingType('intersecting')).toBe(true);
      expect(isValidControlMappingType('compensating')).toBe(true);
      expect(isValidControlMappingType('duplicate')).toBe(false);
    });
  });

  // 2. Scope Fact Data Type Validator
  describe('validateScopeFactValue', () => {
    test('validates boolean scope facts correctly', () => {
      const validBooleanFact: Partial<TenantScopeFact> = {
        factKey: 'operates_physical_datacenters',
        dataType: 'boolean',
        valueBoolean: false,
      };
      expect(validateScopeFactValue(validBooleanFact)).toEqual({ valid: true });

      const invalidBooleanFact: Partial<TenantScopeFact> = {
        factKey: 'operates_physical_datacenters',
        dataType: 'boolean',
        valueBoolean: null,
      };
      expect(validateScopeFactValue(invalidBooleanFact).valid).toBe(false);
    });

    test('validates string scope facts correctly', () => {
      const validStringFact: Partial<TenantScopeFact> = {
        factKey: 'primary_cloud_provider',
        dataType: 'string',
        valueString: 'aws_eu_west_1',
      };
      expect(validateScopeFactValue(validStringFact)).toEqual({ valid: true });

      const invalidStringFact: Partial<TenantScopeFact> = {
        factKey: 'primary_cloud_provider',
        dataType: 'string',
        valueString: 123 as any,
      };
      expect(validateScopeFactValue(invalidStringFact).valid).toBe(false);
    });

    test('validates number scope facts correctly', () => {
      const validNumberFact: Partial<TenantScopeFact> = {
        factKey: 'total_eu_headcount',
        dataType: 'number',
        valueNumber: 450,
      };
      expect(validateScopeFactValue(validNumberFact)).toEqual({ valid: true });

      const invalidNumberFact: Partial<TenantScopeFact> = {
        factKey: 'total_eu_headcount',
        dataType: 'number',
        valueNumber: NaN,
      };
      expect(validateScopeFactValue(invalidNumberFact).valid).toBe(false);
    });

    test('validates string_array scope facts correctly', () => {
      const validArrayFact: Partial<TenantScopeFact> = {
        factKey: 'data_hosting_countries',
        dataType: 'string_array',
        valueArray: ['DE', 'FR', 'SE'],
      };
      expect(validateScopeFactValue(validArrayFact)).toEqual({ valid: true });

      const invalidArrayFact: Partial<TenantScopeFact> = {
        factKey: 'data_hosting_countries',
        dataType: 'string_array',
        valueArray: ['DE', 123 as any],
      };
      expect(validateScopeFactValue(invalidArrayFact).valid).toBe(false);
    });

    test('rejects missing or empty factKey', () => {
      expect(validateScopeFactValue({ factKey: '', dataType: 'boolean', valueBoolean: true }).valid).toBe(false);
    });
  });

  // 3. Applicability Decision Validator
  describe('validateApplicabilityDecision', () => {
    test('accepts valid statutory mandatory decision', () => {
      const decision: Partial<TenantApplicabilityDecision> = {
        requirementId: 'gdpr_art_30',
        frameworkId: 'gdpr',
        isApplicable: true,
        applicabilityType: 'statutory_mandatory',
        rationale: 'Mandatory statutory requirement under GDPR Article 30(1)',
      };
      expect(validateApplicabilityDecision(decision)).toEqual({ valid: true });
    });

    test('rejects non-applicable decision without rationale', () => {
      const decision: Partial<TenantApplicabilityDecision> = {
        requirementId: 'iso_annex_a71',
        frameworkId: 'iso_27001',
        isApplicable: false,
        applicabilityType: 'rule_derived',
        rationale: '', // empty rationale
      };
      const res = validateApplicabilityDecision(decision);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('mandatory when marking a requirement non-applicable');
    });

    test('requires overrideReason when manual exclusion overrides a matched rule', () => {
      const decisionWithoutOverrideReason: Partial<TenantApplicabilityDecision> = {
        requirementId: 'iso_annex_a71',
        frameworkId: 'iso_27001',
        isApplicable: false,
        applicabilityType: 'manual_exclusion',
        matchedRuleId: 'rule_iso_physical_security_mandatory',
        rationale: 'Organization opted out',
        overrideReason: '', // missing override reason
      };
      const res = validateApplicabilityDecision(decisionWithoutOverrideReason);
      expect(res.valid).toBe(false);
      expect(res.error).toContain('overrideReason is strictly required');

      const decisionWithOverrideReason: Partial<TenantApplicabilityDecision> = {
        ...decisionWithoutOverrideReason,
        overrideReason: 'Approved by CISO: All physical assets transferred to AWS Managed Facilities SOC 2 Type II',
      };
      expect(validateApplicabilityDecision(decisionWithOverrideReason)).toEqual({ valid: true });
    });
  });

  // 4. Model Shape & Typing Integrity Tests
  describe('Model Shape & Relational Contracts', () => {
    test('TenantFrameworkAdoption instantiates with full audit metadata', () => {
      const adoption: TenantFrameworkAdoption = {
        id: 'iso_27001_2022',
        tenantId,
        ownerId: userId,
        status: 'active',
        frameworkId: 'iso_27001',
        frameworkCode: 'ISO-27001',
        frameworkName: 'ISO/IEC 27001:2022 Information Security',
        frameworkVersion: '2022',
        scopeProfileId: 'scope_prof_eu_ops',
        scopeDescription: 'All Frankfurt and Stockholm production clouds',
        scopingBoundaries: ['Frankfurt AWS', 'Stockholm GCP'],
        targetCertificationDate: '2026-11-30',
        totalMasterControlsCount: 93,
        instantiatedControlsCount: 93,
        applicableControlsCount: 88,
        notApplicableControlsCount: 5,
        adoptedBy: userId,
        adoptedAt: now,
        lastInstantiatedAt: now,
        lastAuditedAt: null,
        auditCycleMonths: 12,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      expect(adoption.frameworkCode).toBe('ISO-27001');
      expect(adoption.status).toBe('active');
      expect(adoption.scopingBoundaries).toContain('Frankfurt AWS');
    });

    test('TenantScopeProfile instantiates with relational entity bindings', () => {
      const scopeProfile: TenantScopeProfile = {
        id: 'scope_prof_eu_ops',
        tenantId,
        ownerId: userId,
        status: 'approved',
        title: 'EuroCorp European Cloud Scope',
        description: 'Comprehensive scope covering all EU customer data and AI models',
        version: '1.2',
        applicableFrameworkIds: ['gdpr', 'iso_27001', 'eu_ai_act'],
        inScopeAssetIds: ['asset_rds_postgres_01', 'asset_k8s_prod_cluster'],
        inScopeVendorIds: ['vendor_aws_emea', 'vendor_openai_ireland'],
        inScopeAISystemIds: ['ai_sys_fraud_detect_01'],
        inScopeRopaIds: ['ropa_customer_analytics'],
        includedLocations: ['Frankfurt am Main', 'Stockholm'],
        includedLegalEntities: ['EuroCorp Technologies SE'],
        excludedOperations: ['Hardware Manufacturing'],
        exclusionsJustification: 'Organization is 100% cloud-native SaaS',
        approvedBy: userId,
        approvedAt: now,
        reviewFrequencyDays: 180,
        nextReviewDate: '2027-02-14',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      expect(scopeProfile.inScopeAssetIds.length).toBe(2);
      expect(scopeProfile.inScopeVendorIds.length).toBe(2);
      expect(scopeProfile.inScopeAISystemIds).toContain('ai_sys_fraud_detect_01');
    });

    test('ScopeQuestionnaire and TenantScopeAnswer capture discovery facts', () => {
      const questionnaire: ScopeQuestionnaire = {
        id: 'qnr_eu_ai_scoping',
        title: 'EU AI Act Statutory Scoping Questionnaire',
        description: 'Determines applicability of high-risk AI obligations',
        category: 'ai_governance',
        version: '1.0',
        frameworkIds: ['eu_ai_act'],
        isPublished: true,
        questionsCount: 5,
        createdAt: now,
        updatedAt: now,
      };

      const answer: TenantScopeAnswer = {
        id: 'ans_q_ai_biometrics',
        tenantId,
        ownerId: userId,
        status: 'completed',
        questionnaireId: questionnaire.id,
        questionId: 'q_ai_biometrics',
        factKey: 'deploys_biometric_categorization',
        responseType: 'boolean',
        answerBoolean: false,
        answerString: null,
        answerNumber: null,
        answerArray: null,
        notes: 'No biometric systems deployed or in development pipeline',
        answeredBy: userId,
        answeredAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      expect(answer.factKey).toBe('deploys_biometric_categorization');
      expect(answer.answerBoolean).toBe(false);
    });

    test('ApplicabilityRule derives requirement applicability from facts', () => {
      const rule: ApplicabilityRule = {
        id: 'rule_ai_act_art14_human_oversight',
        frameworkId: 'eu_ai_act',
        targetRequirementId: 'art_14',
        ruleName: 'Human Oversight for High-Risk AI',
        description: 'Requires human-in-the-loop oversight if high-risk AI is in production',
        condition: {
          factKey: 'deploys_high_risk_ai_system',
          operator: 'equals',
          expectedValue: true,
        },
        resultingStatusIfMatched: 'applicable',
        statutoryRationale: 'Article 14 EU AI Act applies directly to deployers of Annex III systems',
        isMandatoryUnlessExempt: true,
        version: '1.0',
        createdAt: now,
        updatedAt: now,
      };

      expect(rule.condition.factKey).toBe('deploys_high_risk_ai_system');
      expect(rule.resultingStatusIfMatched).toBe('applicable');
    });

    test('TenantRequirementInstance links to applicability and satisfying controls', () => {
      const reqInstance: TenantRequirementInstance = {
        id: 'req_inst_gdpr_art32',
        tenantId,
        ownerId: userId,
        status: 'implemented',
        requirementId: 'art_32',
        frameworkId: 'gdpr',
        sectionCode: 'Art. 32',
        title: 'Security of Processing',
        description: 'Implement technical and organizational measures to ensure security appropriate to risk',
        category: 'security_safeguards',
        isMandatory: true,
        applicabilityDecisionId: 'dec_gdpr_art32',
        complianceStatus: 'compliant',
        satisfyingControlIds: ['ctl_corp_enc_01', 'ctl_corp_mfa_01'],
        primaryAssigneeId: userId,
        department: 'Information Security',
        lastAssessmentDate: now,
        nextAssessmentDate: '2026-11-14',
        assessmentNotes: 'Fully satisfied by AES-256 and SSO MFA enforcement',
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      expect(reqInstance.complianceStatus).toBe('compliant');
      expect(reqInstance.satisfyingControlIds.length).toBe(2);
    });

    test('TenantControlInstance and CanonicalControlMapping support single-control multi-compliance harmonization', () => {
      const canonicalMapping: CanonicalControlMapping = {
        id: 'map_cryptography_gdpr_iso_ai',
        harmonizedDomain: 'cryptography',
        title: 'Cryptographic Protection & Key Management',
        description: 'Enforce strong encryption at rest and in transit across all sensitive data repositories',
        sourceFrameworkId: 'gdpr',
        sourceRequirementId: 'art_32',
        sourceMasterControlId: 'ctl_master_gdpr_art32',
        targetFrameworkId: 'iso_27001',
        targetRequirementId: 'annex_a824',
        targetMasterControlId: 'ctl_master_iso_a824',
        mappingType: 'equivalent',
        confidence: 'high',
        mappingRationale: 'Both requirements mandate AES-256 / TLS 1.3 cryptographic protection',
        createdAt: now,
        updatedAt: now,
      };

      const harmonizedControl: TenantControlInstance = {
        id: 'ctl_corp_enc_01',
        tenantId,
        ownerId: userId,
        status: 'implemented',
        masterControlId: 'ctl_master_iso_a824',
        code: 'CTL-CORP-SEC-01',
        title: 'Production Data Encryption-at-Rest & In-Transit',
        description: 'Enforce AES-256 at rest via AWS KMS and TLS 1.3 in transit across all external endpoints',
        domain: 'cryptography',
        frameworkIds: ['gdpr', 'iso_27001', 'eu_ai_act'],
        requirementIds: ['art_32', 'annex_a824', 'art_15'],
        healthScore: 100,
        enforcementMechanism: 'automated',
        reviewFrequencyDays: 90,
        lastReviewDate: now,
        nextReviewDate: '2026-11-14',
        implementationNotes: 'Enforced automatically via Terraform and AWS KMS key policy inspection',
        isHarmonized: true,
        canonicalMappingIds: [canonicalMapping.id],
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      const tenantMapping: TenantControlMapping = {
        id: 'tmap_enc_gdpr_art32',
        tenantId,
        ownerId: userId,
        status: 'active',
        controlId: harmonizedControl.id,
        frameworkId: 'gdpr',
        requirementId: 'art_32',
        mappingType: 'equivalent',
        coverageRatio: 1.0,
        mappingRationale: 'Direct drop-in encryption control satisfying GDPR Art. 32(1)(a)',
        compensatingControlsJustification: null,
        verifiedBy: userId,
        verifiedAt: now,
        createdAt: now,
        updatedAt: now,
        createdBy: userId,
        updatedBy: userId,
      };

      expect(harmonizedControl.isHarmonized).toBe(true);
      expect(harmonizedControl.frameworkIds).toEqual(['gdpr', 'iso_27001', 'eu_ai_act']);
      expect(tenantMapping.coverageRatio).toBe(1.0);
    });
  });
});

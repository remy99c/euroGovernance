import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  CANONICAL_APPLICABILITY_RULES,
  evaluateFrameworkApplicabilityRules,
  deriveStatutoryObligations,
  instantiateTenantGRC,
  buildControlCoverageSummary,
  TenantScopeFact,
  Requirement,
  MasterControl,
  TenantApplicabilityDecision,
  MasterRequirementControlMapping,
  CanonicalControlMapping,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantId = 'tenant_wizard_corp';
const userAdmin = 'usr_admin_wizard';
const userAuditor = 'usr_auditor_wizard';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-wizard-flow-test',
    firestore: {
      rules,
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  if (testEnv) {
    await testEnv.cleanup();
  }
});

beforeEach(async () => {
  await testEnv.clearFirestore();

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();

    // Tenant Admin Membership
    await db.doc(`tenants/${tenantId}/memberships/${userAdmin}`).set({
      userId: userAdmin,
      tenantId,
      role: 'tenant_admin',
      status: 'active',
    });

    // Tenant Auditor Membership
    await db.doc(`tenants/${tenantId}/memberships/${userAuditor}`).set({
      userId: userAuditor,
      tenantId,
      role: 'auditor',
      status: 'active',
    });
  });
});

describe('Tenant Framework Adoption Wizard End-to-End Flow', () => {
  const now = new Date().toISOString();

  // STEP 1 & 2: Select & Confirm Framework Adoption
  test('Step 1 & 2: Adopts multiple frameworks (GDPR, EU AI Act, ISO 27001) with version pinning and metadata', async () => {
    const adminCtx = testEnv.authenticatedContext(userAdmin);
    const db = adminCtx.firestore();

    const adoptedFwIds = ['gdpr', 'eu_ai_act', 'iso_27001'];

    for (const fwId of adoptedFwIds) {
      const adoptionDoc = {
        id: `adopt_${fwId}`,
        tenantId,
        frameworkId: fwId,
        versionPinned: '2024.1',
        status: 'active',
        scopeDescription: `Production enterprise scope for ${fwId}`,
        adoptedAt: now,
        adoptedBy: userAdmin,
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
        ownerId: userAdmin,
      };

      await assertSucceeds(
        db.doc(`tenants/${tenantId}/adopted_frameworks/adopt_${fwId}`).set(adoptionDoc)
      );
    }
  });

  // STEP 3: Complete Scope Questionnaire & Persist Scope Facts
  test('Step 3: Saves structured scope facts driving deterministic applicability', async () => {
    const adminCtx = testEnv.authenticatedContext(userAdmin);
    const db = adminCtx.firestore();

    const scopeFacts: TenantScopeFact[] = [
      {
        id: 'fact_personal_data',
        tenantId,
        ownerId: userAdmin,
        scopeProfileId: 'profile_1',
        frameworkId: null,
        factKey: 'processesPersonalData',
        category: 'data_processing',
        dataType: 'boolean',
        valueBoolean: true,
        valueString: null,
        valueNumber: null,
        valueArray: null,
        source: 'questionnaire',
        sourceQuestionId: 'q1',
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userAdmin,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
      {
        id: 'fact_special_cat',
        tenantId,
        ownerId: userAdmin,
        scopeProfileId: 'profile_1',
        frameworkId: null,
        factKey: 'processesSpecialCategoryData',
        category: 'data_processing',
        dataType: 'boolean',
        valueBoolean: true,
        valueString: null,
        valueNumber: null,
        valueArray: null,
        source: 'questionnaire',
        sourceQuestionId: 'q2',
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userAdmin,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
      {
        id: 'fact_ai_deploy',
        tenantId,
        ownerId: userAdmin,
        scopeProfileId: 'profile_1',
        frameworkId: null,
        factKey: 'deploysAISystems',
        category: 'ai_systems',
        dataType: 'boolean',
        valueBoolean: true,
        valueString: null,
        valueNumber: null,
        valueArray: null,
        source: 'questionnaire',
        sourceQuestionId: 'q3',
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userAdmin,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
      {
        id: 'fact_ai_high_risk',
        tenantId,
        ownerId: userAdmin,
        scopeProfileId: 'profile_1',
        frameworkId: null,
        factKey: 'highRiskAIUsage',
        category: 'ai_systems',
        dataType: 'boolean',
        valueBoolean: false,
        valueString: null,
        valueNumber: null,
        valueArray: null,
        source: 'questionnaire',
        sourceQuestionId: 'q4',
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userAdmin,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
      {
        id: 'fact_cloud',
        tenantId,
        ownerId: userAdmin,
        scopeProfileId: 'profile_1',
        frameworkId: null,
        factKey: 'usesCloudInfrastructure',
        category: 'infrastructure',
        dataType: 'boolean',
        valueBoolean: true,
        valueString: null,
        valueNumber: null,
        valueArray: null,
        source: 'questionnaire',
        sourceQuestionId: 'q5',
        confidence: 'verified',
        verificationEvidenceId: null,
        assessedBy: userAdmin,
        assessedAt: now,
        status: 'active',
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
    ];

    for (const fact of scopeFacts) {
      await assertSucceeds(db.doc(`tenants/${tenantId}/scope_facts/${fact.id}`).set(fact));
    }
  });

  // STEP 4: Review Applicability Summary & Statutory Obligations
  test('Step 4: Evaluates applicability outcomes and derives statutory registers accurately', () => {
    const scopeFactsDict: Record<string, any> = {
      processes_personal_data: true,
      processesPersonalData: true,
      processes_special_category_data: true,
      processesSpecialCategoryData: true,
      deploys_ai_systems: true,
      deploysAISystems: true,
      deploys_high_risk_ai: false,
      highRiskAIUsage: false,
      uses_cloud_infrastructure: true,
      usesCloudInfrastructure: true,
    };

    // 1. Evaluate Applicability Rules
    const ruleResults = evaluateFrameworkApplicabilityRules(CANONICAL_APPLICABILITY_RULES, scopeFactsDict);
    expect(ruleResults.length).toBeGreaterThan(0);

    const applicableRules = ruleResults.filter((r) => r.matched && r.resultingOutcome === 'applicable');
    expect(applicableRules.length).toBeGreaterThan(0);

    // 2. Format TenantScopeFact Array for statutory obligation derivation
    const scopeFactObjects: TenantScopeFact[] = Object.entries(scopeFactsDict).map(([k, v], idx) => ({
      id: `fact_${idx}`,
      tenantId,
      ownerId: userAdmin,
      scopeProfileId: 'profile_1',
      frameworkId: null,
      factKey: k,
      category: k.includes('AI') ? 'ai_systems' : k.includes('Cloud') ? 'infrastructure' : 'data_processing',
      dataType: 'boolean',
      valueBoolean: v,
      valueString: null,
      valueNumber: null,
      valueArray: null,
      source: 'questionnaire',
      sourceQuestionId: `q_${idx}`,
      confidence: 'verified',
      verificationEvidenceId: null,
      assessedBy: userAdmin,
      assessedAt: now,
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: userAdmin,
      updatedBy: userAdmin,
    }));

    const statutoryResult = deriveStatutoryObligations({
      tenantId,
      defaultOwnerId: userAdmin,
      scopeFacts: scopeFactObjects,
      decisions: [],
      adoptedFrameworks: ['gdpr', 'eu_ai_act', 'eu_data_act'],
    });

    expect(statutoryResult.obligationFlags.length).toBeGreaterThan(0);

    // Must generate GDPR ROPA, DPIA (due to special category = true), and AI Act System Register
    const hasROPA = statutoryResult.obligationFlags.some((o) => o.targetCollection === 'ropa_entries');
    const hasDPIA = statutoryResult.obligationFlags.some((o) => o.targetCollection === 'dpia_assessments');
    const hasAIReg = statutoryResult.obligationFlags.some((o) => o.targetCollection === 'ai_systems');

    expect(hasROPA).toBe(true);
    expect(hasDPIA).toBe(true);
    expect(hasAIReg).toBe(true);

    // Must NOT generate high-risk FRIA because highRiskAIUsage is false
    const hasFRIA = statutoryResult.obligationFlags.some((o) => o.targetCollection === 'fria_assessments');
    expect(hasFRIA).toBe(false);
  });

  // STEP 5 & 6: Instantiate Controls, Harmonize Overlaps, and Surface Coverage Dashboard
  test('Step 5 & 6: Instantiates harmonized controls and generates One Control Many Obligations report', () => {
    const dummyReqs: Requirement[] = [
      {
        id: 'req_gdpr_32',
        frameworkId: 'gdpr',
        sectionCode: 'Article 32',
        title: 'Security of Processing',
        description: 'Implement encryption and confidentiality controls.',
        category: 'Security',
        isMandatory: true,
        guidanceText: 'Ensure end-to-end encryption.',
        parentRequirementId: null,
        sortOrder: 1,
      },
      {
        id: 'req_iso_a824',
        frameworkId: 'iso_27001',
        sectionCode: 'A.8.24',
        title: 'Use of Cryptography',
        description: 'Ensure secure key management and data encryption.',
        category: 'Annex A',
        isMandatory: true,
        guidanceText: 'Key lifecycle policies.',
        parentRequirementId: null,
        sortOrder: 2,
      },
    ];

    const dummyControls: MasterControl[] = [
      {
        id: 'ctl_master_enc',
        frameworkId: 'gdpr',
        code: 'CTL-SEC-ENC-01',
        title: 'Production Data at Rest and Transit Encryption',
        description: 'AES-256 and TLS 1.3 enforced across all workloads.',
        domain: 'Cryptography',
        controlObjective: 'Mitigate data leakage risks.',
        evidenceExpectations: ['KMS audit logs', 'TLS cipher scan'],
        recommendedFrequencyDays: 30,
        applicabilityProfile: {
          mandatoryExclusionsAllowed: false,
          standardInclusionCriteria: 'All tenants processing personal data',
          standardExclusionCriteria: 'None',
          recommendedGuidance: 'Apply encryption keys managed via HSM',
        },
        canonicalControlMappingKey: 'CAN-CTL-DATA-SECURITY',
        requirementIds: ['req_gdpr_32'],
      },
    ];

    const decisions: TenantApplicabilityDecision[] = [
      {
        id: 'dec_gdpr_32',
        tenantId,
        ownerId: userAdmin,
        requirementId: 'req_gdpr_32',
        frameworkId: 'gdpr',
        sectionCode: 'Article 32',
        requirementTitle: 'Security of Processing',
        isApplicable: true,
        status: 'applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: null,
        ruleEvaluationSummary: null,
        rationale: 'Applicable',
        overrideReason: null,
        overrideRationale: null,
        previousStatus: null,
        assessedBy: userAdmin,
        assessedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userAdmin,
        updatedBy: userAdmin,
      },
    ];

    const mappings: MasterRequirementControlMapping[] = [
      {
        id: 'map_1',
        frameworkId: 'gdpr',
        requirementId: 'req_gdpr_32',
        masterControlId: 'ctl_master_enc',
        coverageType: 'full',
        rationale: 'Satisfies encryption requirement',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const canonicalMappings: CanonicalControlMapping[] = [
      {
        id: 'map_enc_gdpr_iso27001_ai_act',
        canonicalGroupKey: 'CAN-CTL-DATA-SECURITY',
        harmonizedDomain: 'cryptography',
        title: 'Data Protection & Cryptography',
        description: 'Enforces data at rest and transit encryption',
        sourceFrameworkId: 'gdpr',
        sourceRequirementId: 'req_gdpr_32',
        sourceMasterControlId: 'ctl_master_enc',
        targetFrameworkId: 'iso_27001',
        targetRequirementId: 'req_iso_a824',
        targetMasterControlId: null,
        mappingType: 'equivalent',
        confidence: 'high',
        allowAutomaticMerge: true,
        coverageRatio: 1.0,
        mappingRationale: 'Both mandate cryptographic protection of sensitive stored and transmitted data.',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const instResult = instantiateTenantGRC({
      tenantId,
      defaultOwnerId: userAdmin,
      decisions,
      requirements: dummyReqs,
      masterControls: dummyControls,
      requirementControlMappings: mappings,
      canonicalControlMappings: canonicalMappings,
    });

    expect(instResult.controlInstances.length).toBeGreaterThan(0);

    const coverageReport = buildControlCoverageSummary(
      instResult.controlInstances[0]!,
      dummyReqs,
      canonicalMappings
    );

    expect(coverageReport.controlCode).toBe('CTL-SEC-ENC-01');
    expect(coverageReport.obligations.length).toBeGreaterThanOrEqual(1);
    expect(coverageReport.coverageSummaryExplanation.length).toBeGreaterThan(10);
  });
});

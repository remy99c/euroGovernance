import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  TenantScopeFact,
  TenantApplicabilityDecision,
  deriveStatutoryObligations,
  StatutoryObligationFlag,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_reg_alpha';
const tenantB = 'tenant_reg_beta';

const userAdminA = 'usr_admin_reg_a';
const userComplianceA = 'usr_comp_reg_a';
const userAuditorA = 'usr_auditor_reg_a';
const userCompB = 'usr_comp_reg_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-reg-obligations-test',
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

    await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
    await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

    // Tenant A Memberships
    await db.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
      userId: userAdminA,
      tenantId: tenantA,
      role: 'tenant_admin',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
      userId: userComplianceA,
      tenantId: tenantA,
      role: 'compliance_manager',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
      userId: userAuditorA,
      tenantId: tenantA,
      role: 'auditor',
      status: 'active',
    });

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${userCompB}`).set({
      userId: userCompB,
      tenantId: tenantB,
      role: 'compliance_manager',
      status: 'active',
    });
  });
});

describe('Regulation-Oriented Applicability & Statutory Obligations Suite', () => {
  const now = new Date().toISOString();

  // 1. Obligation & Artifact Generation (GDPR, AI Act, Data Act)
  describe('Statutory Obligation Generation', () => {
    test('generates GDPR ROPA, Breach, DSR, DPIA, and TIA obligations from scoped facts', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_gdpr_1',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'gdpr',
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
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
        {
          id: 'fact_gdpr_2',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'gdpr',
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
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
        {
          id: 'fact_gdpr_3',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'gdpr',
          factKey: 'internationalDataTransfers',
          category: 'geography',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q3',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions: [],
        adoptedFrameworks: ['gdpr'],
      });

      // Verify Obligation Flags
      const oblTypes = result.obligationFlags.map((o) => o.obligationType);
      expect(oblTypes).toContain('gdpr_ropa_register');
      expect(oblTypes).toContain('gdpr_breach_register');
      expect(oblTypes).toContain('gdpr_dsr_portal');
      expect(oblTypes).toContain('gdpr_dpia_assessment');
      expect(oblTypes).toContain('gdpr_tia_assessment');
      expect(oblTypes).toContain('gdpr_cross_border_safeguards');

      // Verify Required Registers & Assessments
      const regCollections = result.requiredRegisters.map((r) => r.collection);
      expect(regCollections).toContain('ropa_entries');

      const assessCollections = result.requiredAssessments.map((a) => a.collection);
      expect(assessCollections).toContain('dpia_assessments');
      expect(assessCollections).toContain('tia_assessments');

      const opCollections = result.requiredOperationalRecords.map((op) => op.collection);
      expect(opCollections).toContain('breach_logs');
      expect(opCollections).toContain('dsr_requests');
    });

    test('generates EU AI Act AI System Register, FRIA, and Post-Market Monitoring obligations', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_ai_1',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_ai_act',
          factKey: 'deploysAISystems',
          category: 'ai_systems',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_ai_1',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
        {
          id: 'fact_ai_2',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_ai_act',
          factKey: 'highRiskAIUsage',
          category: 'ai_systems',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_ai_2',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions: [],
        adoptedFrameworks: ['eu_ai_act'],
      });

      const oblTypes = result.obligationFlags.map((o) => o.obligationType);
      expect(oblTypes).toContain('ai_act_system_register');
      expect(oblTypes).toContain('ai_act_incident_register');
      expect(oblTypes).toContain('ai_act_transparency_notice');
      expect(oblTypes).toContain('ai_act_risk_classification');
      expect(oblTypes).toContain('ai_act_fria_assessment');
      expect(oblTypes).toContain('ai_act_post_market_monitoring');
      expect(oblTypes).toContain('ai_act_substantial_change_log');

      // Check registers & assessments
      expect(result.requiredRegisters.map((r) => r.collection)).toContain('ai_systems');
      expect(result.requiredAssessments.map((a) => a.collection)).toContain('fria_assessments');
      expect(result.requiredAssessments.map((a) => a.collection)).toContain('ai_assessments');
      expect(result.requiredOperationalRecords.map((o) => o.collection)).toContain('ai_incidents');
      expect(result.requiredOperationalRecords.map((o) => o.collection)).toContain('post_market_logs');
      expect(result.requiredOperationalRecords.map((o) => o.collection)).toContain('substantial_changes');
    });

    test('generates EU Data Act Data Asset & Cloud Switching Registers from connected/cloud scope facts', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_da_1',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_data_act',
          factKey: 'manufacturesConnectedProducts',
          category: 'infrastructure',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_da_1',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
        {
          id: 'fact_da_2',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_data_act',
          factKey: 'usesCloudInfrastructure',
          category: 'infrastructure',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_da_2',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions: [],
        adoptedFrameworks: ['eu_data_act'],
      });

      const oblTypes = result.obligationFlags.map((o) => o.obligationType);
      expect(oblTypes).toContain('data_act_asset_register');
      expect(oblTypes).toContain('data_act_b2b_sharing_register');
      expect(oblTypes).toContain('data_act_cloud_switching_register');

      expect(result.requiredRegisters.map((r) => r.collection)).toContain('data_act_assets');
      expect(result.requiredRegisters.map((r) => r.collection)).toContain('data_sharing_requests');
      expect(result.requiredRegisters.map((r) => r.collection)).toContain('switching_dependencies');
    });
  });

  // 2. Framework-Specific Outputs & Traceability
  describe('Framework-Specific Outputs & Traceability', () => {
    test('preserves explicit traceability from triggering scope fact keys to statutory basis and rationale', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_gdpr_trace',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'gdpr',
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
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const decisions: TenantApplicabilityDecision[] = [
        {
          id: 'dec_gdpr_art_30',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Article 30',
          requirementTitle: 'Records of Processing Activities',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'statutory_mandatory',
          matchedRuleId: null,
          ruleEvaluationSummary: 'Processing personal data',
          rationale: 'Core GDPR obligation',
          overrideReason: null,
          previousStatus: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions,
        adoptedFrameworks: ['gdpr'],
      });

      const ropaFlag = result.obligationFlags.find((o) => o.obligationType === 'gdpr_ropa_register');
      expect(ropaFlag).toBeDefined();
      expect(ropaFlag?.triggeringFactKeys).toContain('processes_personal_data');
      expect(ropaFlag?.statutoryBasis).toContain('GDPR Article 30');
      expect(ropaFlag?.targetCollection).toBe('ropa_entries');
      expect(ropaFlag?.derivedFromDecisionId).toBe('dec_gdpr_art_30');
      expect(ropaFlag?.rationale).toBeDefined();
    });
  });

  // 3. Non-Applicable Regimes Not Generating Noise
  describe('Non-Applicable Regimes Suppress Noise', () => {
    test('does NOT generate any AI Act or Data Act obligations when only GDPR is adopted', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_gdpr_only',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'gdpr',
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
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions: [],
        adoptedFrameworks: ['gdpr'], // Only GDPR adopted
      });

      // No AI Act obligations
      const aiObligations = result.obligationFlags.filter((o) => o.frameworkId === 'eu_ai_act');
      expect(aiObligations.length).toBe(0);

      // No Data Act obligations
      const daObligations = result.obligationFlags.filter((o) => o.frameworkId === 'eu_data_act');
      expect(daObligations.length).toBe(0);

      // No AI or Data Act registers
      expect(result.requiredRegisters.some((r) => r.collection === 'ai_systems')).toBe(false);
      expect(result.requiredRegisters.some((r) => r.collection === 'data_act_assets')).toBe(false);
    });

    test('does NOT generate High-Risk AI obligations when highRiskAIUsage is false', () => {
      const scopeFacts: TenantScopeFact[] = [
        {
          id: 'fact_ai_low',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_ai_act',
          factKey: 'deploysAISystems',
          category: 'ai_systems',
          dataType: 'boolean',
          valueBoolean: true,
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_ai_1',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
        {
          id: 'fact_ai_low_risk',
          tenantId: tenantA,
          ownerId: userComplianceA,
          scopeProfileId: 'profile_1',
          frameworkId: 'eu_ai_act',
          factKey: 'highRiskAIUsage',
          category: 'ai_systems',
          dataType: 'boolean',
          valueBoolean: false, // NOT high risk
          valueString: null,
          valueNumber: null,
          valueArray: null,
          source: 'questionnaire',
          sourceQuestionId: 'q_ai_2',
          confidence: 'verified',
          verificationEvidenceId: null,
          assessedBy: userComplianceA,
          assessedAt: now,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
        },
      ];

      const result = deriveStatutoryObligations({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeFacts,
        decisions: [],
        adoptedFrameworks: ['eu_ai_act'],
      });

      const oblTypes = result.obligationFlags.map((o) => o.obligationType);
      // Base AI obligations are present
      expect(oblTypes).toContain('ai_act_system_register');
      expect(oblTypes).toContain('ai_act_transparency_notice');

      // High-risk specific obligations are strictly NOT generated
      expect(oblTypes).not.toContain('ai_act_fria_assessment');
      expect(oblTypes).not.toContain('ai_act_risk_classification');
      expect(oblTypes).not.toContain('ai_act_post_market_monitoring');
      expect(oblTypes).not.toContain('ai_act_substantial_change_log');
    });
  });

  // 4. Firestore Security Rules Isolation for Statutory Obligations
  describe('Firestore Security Rules Isolation for Statutory Obligations', () => {
    const sampleObligation: StatutoryObligationFlag = {
      id: 'obl_gdpr_ropa_rules_test',
      tenantId: tenantA,
      ownerId: userComplianceA,
      frameworkId: 'gdpr',
      obligationType: 'gdpr_ropa_register',
      title: 'Records of Processing Activities (ROPA)',
      description: 'Article 30 register',
      artifactKind: 'required_register',
      targetCollection: 'ropa_entries',
      isMandatory: true,
      status: 'active',
      triggeringFactKeys: ['processesPersonalData'],
      statutoryBasis: 'GDPR Article 30',
      rationale: 'Processing customer data',
      derivedFromDecisionId: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
    };

    test('compliance manager in Tenant A can create and update statutory obligations', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      const docRef = db.doc(`tenants/${tenantA}/statutory_obligations/${sampleObligation.id}`);

      // Create succeeds
      await assertSucceeds(docRef.set(sampleObligation));

      // Update succeeds
      await assertSucceeds(
        docRef.update({
          status: 'fulfilled',
          updatedAt: new Date().toISOString(),
          updatedBy: userComplianceA,
        })
      );
    });

    test('auditor in Tenant A can read but cannot create or mutate statutory obligations', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      await adminCtx.firestore().doc(`tenants/${tenantA}/statutory_obligations/${sampleObligation.id}`).set({
        ...sampleObligation,
        ownerId: userAdminA,
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();
      const docRef = db.doc(`tenants/${tenantA}/statutory_obligations/${sampleObligation.id}`);

      // Read succeeds
      await assertSucceeds(docRef.get());

      // Mutation fails
      await assertFails(
        docRef.update({
          status: 'waived',
        })
      );
    });

    test('Tenant A user cannot read or mutate statutory obligations in Tenant B partition', async () => {
      const compBCtx = testEnv.authenticatedContext(userCompB);
      await compBCtx.firestore().doc(`tenants/${tenantB}/statutory_obligations/obl_tenant_b_confidential`).set({
        ...sampleObligation,
        id: 'obl_tenant_b_confidential',
        tenantId: tenantB,
        ownerId: userCompB,
        createdBy: userCompB,
        updatedBy: userCompB,
      });

      const compACtx = testEnv.authenticatedContext(userComplianceA);
      const crossTenantRef = compACtx
        .firestore()
        .doc(`tenants/${tenantB}/statutory_obligations/obl_tenant_b_confidential`);

      // Read is blocked
      await assertFails(crossTenantRef.get());

      // Mutation is blocked
      await assertFails(
        crossTenantRef.update({
          status: 'waived',
        })
      );
    });
  });
});

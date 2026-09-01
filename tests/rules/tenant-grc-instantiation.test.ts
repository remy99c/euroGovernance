import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  TenantRequirementInstance,
  TenantControlInstance,
  TenantApplicabilityDecision,
  instantiateTenantGRC,
  CANONICAL_MASTER_DATA,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-grc-instantiation-test';

beforeAll(async () => {
  const rules = getFirestoreRules();
  testEnv = await initializeTestEnvironment({
    projectId,
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
});

describe('Tenant GRC Instantiation & Harmonization Engine Suite', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

      // Seed Tenant A Memberships
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

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
    });
  });

  // 1. Instantiation Behavior Across All Applicability Outcomes
  describe('Applicability Outcomes Instantiation & Traceability', () => {
    test('instantiates requirements and controls with correct statuses and traceability for all 5 outcomes', () => {
      const now = new Date().toISOString();

      // Setup 5 decisions covering each outcome
      const decisions: TenantApplicabilityDecision[] = [
        {
          id: 'gdpr_art_30',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 30',
          requirementTitle: 'Records of Processing Activities',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'rule_derived',
          matchedRuleId: 'rule_gdpr_art30_records',
          ruleEvaluationSummary: 'Rule matched',
          rationale: 'Processes personal data',
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
        {
          id: 'gdpr_art_35',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'gdpr_art_35',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 35',
          requirementTitle: 'Data Protection Impact Assessment (DPIA)',
          isApplicable: false,
          status: 'not_applicable',
          applicabilityType: 'rule_derived',
          matchedRuleId: 'rule_gdpr_dpia',
          ruleEvaluationSummary: 'Rule not matched',
          rationale: 'Below high-risk processing threshold',
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
        {
          id: 'iso_annex_a524',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'iso_annex_a524',
          frameworkId: 'iso_27001',
          sectionCode: 'A.5.24',
          requirementTitle: 'Information Security Incident Management',
          isApplicable: true,
          status: 'review_required',
          applicabilityType: 'rule_derived',
          matchedRuleId: 'rule_iso_review',
          ruleEvaluationSummary: 'Review flagged',
          rationale: 'Requires hybrid assessment review',
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
        {
          id: 'iso_clause_43',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'iso_clause_43',
          frameworkId: 'iso_27001',
          sectionCode: 'Clause 4.3',
          requirementTitle: 'Scope Statement',
          isApplicable: true,
          status: 'inherited',
          applicabilityType: 'rule_derived',
          matchedRuleId: 'rule_iso_parent',
          ruleEvaluationSummary: 'Inherited from corporate headquarters',
          rationale: 'Certified at parent group level',
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
        {
          id: 'da_art_03',
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: 'da_art_03',
          frameworkId: 'eu_data_act',
          sectionCode: 'Art. 3',
          requirementTitle: 'Connected Device Data Sharing',
          isApplicable: false,
          status: 'deferred',
          applicabilityType: 'rule_derived',
          matchedRuleId: null,
          ruleEvaluationSummary: 'Deferred',
          rationale: 'Grace period applies until 2027',
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

      const targetReqs = CANONICAL_MASTER_DATA.requirements.filter((r) =>
        decisions.some((d) => d.requirementId === r.id)
      );

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_MASTER_DATA.canonicalControlMappings,
      });

      expect(result.requirementInstances.length).toBe(targetReqs.length);
      expect(result.controlInstances.length).toBeGreaterThan(0);

      // Verify Applicable Outcome
      const req30 = result.requirementInstances.find((r) => r.requirementId === 'gdpr_art_30')!;
      expect(req30).toBeDefined();
      expect(req30.complianceStatus).toBe('not_evaluated');
      expect(req30.satisfyingControlIds.length).toBeGreaterThan(0);
      expect(req30.applicabilityDecisionId).toBe('gdpr_art_30');
      expect(req30.ownerId).toBe(userComplianceA);

      // Verify Not Applicable Outcome
      const req35 = result.requirementInstances.find((r) => r.requirementId === 'gdpr_art_35')!;
      expect(req35).toBeDefined();
      expect(req35.complianceStatus).toBe('not_applicable');

      // Verify Review Required Outcome
      const reqReview = result.requirementInstances.find((r) => r.requirementId === 'iso_annex_a524')!;
      expect(reqReview).toBeDefined();
      expect(reqReview.complianceStatus).toBe('not_evaluated');
      expect(reqReview.assessmentNotes).toContain('hybrid assessment review');

      // Verify Inherited Outcome
      const reqInherited = result.requirementInstances.find((r) => r.requirementId === 'iso_clause_43')!;
      expect(reqInherited).toBeDefined();
      expect(reqInherited.complianceStatus).toBe('not_evaluated');
      const inheritedControl = result.controlInstances.find((c) => reqInherited.satisfyingControlIds.includes(c.id))!;
      expect(inheritedControl).toBeDefined();
      expect(inheritedControl.status).toBe('not_started');
      expect(inheritedControl.healthScore).toBe(0);
      expect(inheritedControl.implementationNotes).toContain('remains unverified');

      // Verify Deferred Outcome
      const reqDeferred = result.requirementInstances.find((r) => r.requirementId === 'da_art_03')!;
      expect(reqDeferred).toBeDefined();
      expect(reqDeferred.complianceStatus).toBe('not_evaluated');
      expect(reqDeferred.assessmentNotes).toContain('Grace period applies');
    });
  });

  // 2. Non-Duplication and Cross-Framework Control Harmonization
  describe('Non-Duplication & Cross-Framework Harmonization', () => {
    test('harmonizes overlapping controls across multiple adopted frameworks without creating duplicate instances', () => {
      const now = new Date().toISOString();

      // Tenant adopts GDPR, ISO 27001, and EU AI Act
      const reqIds = ['gdpr_art_32', 'iso_annex_a524', 'aia_art_09'];
      const targetReqs = CANONICAL_MASTER_DATA.requirements.filter((r) => reqIds.includes(r.id));

      const decisions: TenantApplicabilityDecision[] = targetReqs.map((r) => ({
        id: r.id,
        tenantId: tenantA,
        ownerId: userComplianceA,
        requirementId: r.id,
        frameworkId: r.frameworkId,
        sectionCode: r.sectionCode,
        requirementTitle: r.title,
        isApplicable: true,
        status: 'applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: null,
        ruleEvaluationSummary: 'Adopted framework mandatory requirement',
        rationale: 'Direct statutory applicability',
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
      }));

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_MASTER_DATA.canonicalControlMappings,
      });

      // Verify all requirement instances were created
      expect(result.requirementInstances.length).toBe(3);

      // Verify unique control codes (no duplicate control instances created)
      const controlCodes = result.controlInstances.map((c) => c.code);
      const uniqueControlCodes = Array.from(new Set(controlCodes));
      expect(controlCodes.length).toBe(uniqueControlCodes.length);

      // Verify traceability back to multiple frameworks
      for (const ctrl of result.controlInstances) {
        expect(ctrl.masterControlId).toBeTruthy();
        expect(ctrl.frameworkIds.length).toBeGreaterThan(0);
        expect(ctrl.requirementIds.length).toBeGreaterThan(0);
      }
    });
  });

  // 3. Lifecycle Safety on Rerun (Scope Changes Regeneration)
  describe('Lifecycle Safety on Rerun', () => {
    test('preserves user custom progress and owner assignments when re-running instantiation after scope changes', () => {
      const now = new Date().toISOString();

      const initialReqs = CANONICAL_MASTER_DATA.requirements.filter((r) =>
        ['gdpr_art_30', 'gdpr_art_32'].includes(r.id)
      );

      const initialDecisions: TenantApplicabilityDecision[] = initialReqs.map((r) => ({
        id: r.id,
        tenantId: tenantA,
        ownerId: userComplianceA,
        requirementId: r.id,
        frameworkId: r.frameworkId,
        sectionCode: r.sectionCode,
        requirementTitle: r.title,
        isApplicable: true,
        status: 'applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: null,
        ruleEvaluationSummary: null,
        rationale: 'Mandatory',
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
      }));

      // Initial Run
      const run1 = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions: initialDecisions,
        requirements: initialReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_MASTER_DATA.canonicalControlMappings,
      });

      expect(run1.createdRequirementsCount).toBe(2);
      expect(run1.createdControlsCount).toBeGreaterThan(0);

      // Simulate user actions: mark control as implemented, custom notes, custom assignee
      const customAssignee = 'usr_custom_engineer';
      const modifiedReq: TenantRequirementInstance = {
        ...run1.requirementInstances[0]!,
        primaryAssigneeId: customAssignee,
        complianceStatus: 'compliant',
      };
      const modifiedCtrl: TenantControlInstance = {
        ...run1.controlInstances[0]!,
        status: 'implemented',
        healthScore: 100,
        implementationNotes: 'Implemented via KMS encryption',
      };

      const existingReqInstances: TenantRequirementInstance[] = [modifiedReq, run1.requirementInstances[1]!];
      const existingCtrlInstances: TenantControlInstance[] = [modifiedCtrl, ...run1.controlInstances.slice(1)];

      // Second Run (Rerun with added ISO 27001 requirement)
      const addedReq = CANONICAL_MASTER_DATA.requirements.find((r) => r.id === 'iso_annex_a524')!;
      const rerunReqs = [...initialReqs, addedReq];
      const rerunDecisions = [
        ...initialDecisions,
        {
          id: addedReq.id,
          tenantId: tenantA,
          ownerId: userComplianceA,
          requirementId: addedReq.id,
          frameworkId: addedReq.frameworkId,
          sectionCode: addedReq.sectionCode,
          requirementTitle: addedReq.title,
          isApplicable: true,
          status: 'applicable' as const,
          applicabilityType: 'statutory_mandatory' as const,
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Mandatory',
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

      const run2 = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions: rerunDecisions,
        requirements: rerunReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_MASTER_DATA.canonicalControlMappings,
        existingRequirementInstances: existingReqInstances,
        existingControlInstances: existingCtrlInstances,
      });

      // 1 new requirement created, 2 existing updated safely
      expect(run2.createdRequirementsCount).toBe(1);
      expect(run2.updatedRequirementsCount).toBe(2);

      // Verify user custom assignee and compliant status were preserved!
      const preservedReq = run2.requirementInstances.find((r) => r.requirementId === modifiedReq.requirementId)!;
      expect(preservedReq.primaryAssigneeId).toBe(customAssignee);
      expect(preservedReq.complianceStatus).toBe('compliant');

      // Verify user custom implementation notes and health score were preserved!
      const preservedCtrl = run2.controlInstances.find((c) => c.id === modifiedCtrl.id)!;
      expect(preservedCtrl.status).toBe('implemented');
      expect(preservedCtrl.healthScore).toBe(100);
      expect(preservedCtrl.implementationNotes).toBe('Implemented via KMS encryption');
    });
  });

  // 4. Firestore Security Rules Isolation for Requirement Instances
  describe('Requirement Instances Security Rules Isolation', () => {
    const now = new Date().toISOString();

    const sampleReqInstance: TenantRequirementInstance = {
      id: 'req_inst_gdpr_art30',
      tenantId: tenantA,
      ownerId: userComplianceA,
      requirementId: 'gdpr_art_30',
      frameworkId: 'gdpr',
      sectionCode: 'Art. 30',
      title: 'Records of Processing Activities',
      description: 'Formal processing activity registers',
      category: 'governance',
      isMandatory: true,
      applicabilityDecisionId: 'gdpr_art_30',
      status: 'not_evaluated',
      complianceStatus: 'not_evaluated',
      satisfyingControlIds: ['ctrl_gdpr_art30'],
      primaryAssigneeId: userComplianceA,
      department: 'Compliance',
      lastAssessmentDate: null,
      nextAssessmentDate: null,
      assessmentNotes: 'Initial scoping instantiation',
      createdAt: now,
      updatedAt: now,
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
    };

    test('compliance manager must instantiate requirements through a server command', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      await assertFails(
        db.doc(`tenants/${tenantA}/requirement_instances/req_inst_gdpr_art30`).set(sampleReqInstance)
      );

      const snap = await db.doc(`tenants/${tenantA}/requirement_instances/req_inst_gdpr_art30`).get();
      expect(snap.exists).toBe(false);
    });

    test('auditor in Tenant A can read but cannot modify requirement instances', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/requirement_instances/req_inst_gdpr_art30`).set({
          ...sampleReqInstance,
          ownerId: userAdminA,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        });
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();

      // Read succeeds
      await assertSucceeds(db.doc(`tenants/${tenantA}/requirement_instances/req_inst_gdpr_art30`).get());

      // Mutation fails
      await assertFails(
        db.doc(`tenants/${tenantA}/requirement_instances/req_inst_gdpr_art30`).update({
          complianceStatus: 'compliant',
        })
      );
    });

    test('Tenant A user cannot read or mutate requirement instances in Tenant B partition', async () => {
      const compCtxA = testEnv.authenticatedContext(userComplianceA);
      const dbA = compCtxA.firestore();

      // Write to Tenant B blocked
      await assertFails(
        dbA.doc(`tenants/${tenantB}/requirement_instances/req_inst_gdpr_art30`).set({
          ...sampleReqInstance,
          tenantId: tenantB,
        })
      );

      // Read from Tenant B blocked
      await assertFails(
        dbA.doc(`tenants/${tenantB}/requirement_instances/req_inst_gdpr_art30`).get()
      );
    });
  });
});

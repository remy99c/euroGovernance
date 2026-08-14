import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  applyApplicabilityOverride,
  revertApplicabilityOverride,
  validateApplicabilityOverride,
  TenantApplicabilityDecision,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_align_alpha';
const tenantB = 'tenant_align_beta';

const userAdminA = 'usr_admin_align_a';
const userComplianceA = 'usr_comp_align_a';
const userAuditorA = 'usr_auditor_align_a';
const userContribA = 'usr_contrib_align_a';
const userViewerA = 'usr_viewer_align_a';
const userAdminB = 'usr_admin_align_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-test',
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

    // 0. Seed Root Tenant Docs
    await db.doc(`tenants/${tenantA}`).set({
      id: tenantA,
      name: 'Alignment Tenant Alpha',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    await db.doc(`tenants/${tenantB}`).set({
      id: tenantB,
      name: 'Alignment Tenant Beta',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

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
    await db.doc(`tenants/${tenantA}/memberships/${userContribA}`).set({
      userId: userContribA,
      tenantId: tenantA,
      role: 'contributor',
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${userViewerA}`).set({
      userId: userViewerA,
      tenantId: tenantA,
      role: 'viewer',
      status: 'active',
    });

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
      userId: userAdminB,
      tenantId: tenantB,
      role: 'tenant_admin',
      status: 'active',
    });

    // Pre-seed Tenant B Adoption & Export
    await db.doc(`tenants/${tenantB}/adopted_frameworks/adopt_iso`).set({
      id: 'adopt_iso',
      tenantId: tenantB,
      frameworkId: 'iso_27001',
      versionPinned: '2022',
      status: 'active',
      ownerId: userAdminB,
      createdBy: userAdminB,
      updatedBy: userAdminB,
    });
    await db.doc(`tenants/${tenantB}/export_jobs/job_b_secret`).set({
      id: 'job_b_secret',
      tenantId: tenantB,
      exportType: 'framework_gap_report',
      status: 'completed',
      requestedBy: userAdminB,
      requestedAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
      fileStoragePath: `tenants/${tenantB}/exports/job_b_secret/report.json`,
      fileDownloadUrl: null,
      fileSizeBytes: 1024,
      errorMessage: null,
      filtersApplied: {},
    });

    // Pre-seed Tenant A Controls and Requirement Instances for update tests
    await db.doc(`tenants/${tenantA}/controls/ctl_crypto`).set({
      id: 'ctl_crypto',
      tenantId: tenantA,
      code: 'CTL-SEC-ENC-01',
      title: 'Encryption',
      domain: 'security',
      status: 'in_progress',
      healthScore: 50,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
      ownerId: userComplianceA,
    });

    await db.doc(`tenants/${tenantA}/requirement_instances/req_inst_1`).set({
      id: 'req_inst_1',
      tenantId: tenantA,
      requirementId: 'gdpr_art_30',
      frameworkId: 'gdpr',
      sectionCode: 'Art. 30',
      title: 'ROPA',
      description: 'Maintain ROPA',
      category: 'accountability',
      status: 'active',
      isMandatory: true,
      applicabilityDecisionId: 'dec_art30',
      complianceStatus: 'in_progress',
      satisfyingControlIds: ['ctl_crypto'],
      primaryAssigneeId: userContribA,
      department: 'Security',
      lastAssessmentDate: null,
      nextAssessmentDate: null,
      assessmentNotes: 'Initial progress update',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
      ownerId: userComplianceA,
    });
  });
});

describe('Comprehensive Security Alignment & Access Patterns Suite', () => {
  const now = new Date().toISOString();

  // 1. Framework Adoption Records
  describe('1. Framework Adoption Records & Global Master Library', () => {
    test('regular authenticated users cannot write to global master /frameworks (platform admin only)', async () => {
      const adminCtx = testEnv.authenticatedContext(userAdminA);
      const fwRef = adminCtx.firestore().doc('frameworks/fake_fw');

      await assertFails(
        fwRef.set({
          id: 'fake_fw',
          name: 'Fake Framework',
        })
      );
    });

    test('compliance manager and tenant admin can adopt frameworks for Tenant A; contributor cannot', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const contribCtx = testEnv.authenticatedContext(userContribA);

      const adoptRefComp = compCtx.firestore().doc(`tenants/${tenantA}/adopted_frameworks/adopt_gdpr`);
      await assertSucceeds(
        adoptRefComp.set({
          id: 'adopt_gdpr',
          tenantId: tenantA,
          frameworkId: 'gdpr',
          versionPinned: '2016/679',
          status: 'active',
          scopeDescription: 'GDPR Production Scope',
          adoptedAt: now,
          adoptedBy: userComplianceA,
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
          ownerId: userComplianceA,
        })
      );

      // Contributor cannot adopt frameworks
      const adoptRefContrib = contribCtx.firestore().doc(`tenants/${tenantA}/adopted_frameworks/adopt_ai_act`);
      await assertFails(
        adoptRefContrib.set({
          id: 'adopt_ai_act',
          tenantId: tenantA,
          frameworkId: 'eu_ai_act',
          versionPinned: '2024/1689',
          status: 'active',
          ownerId: userContribA,
          createdBy: userContribA,
          updatedBy: userContribA,
        })
      );
    });

    test('cross-tenant adoption isolation is strictly enforced', async () => {
      const compACtx = testEnv.authenticatedContext(userComplianceA);
      await assertFails(compACtx.firestore().doc(`tenants/${tenantB}/adopted_frameworks/adopt_iso`).get());
    });
  });

  // 2. Scope Records & Questionnaires
  describe('2. Scope Profiles, Facts, and Questionnaires', () => {
    test('compliance manager can create scope profile in Tenant A', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const profileRef = compCtx.firestore().doc(`tenants/${tenantA}/scope_profiles/prof_1`);

      await assertSucceeds(
        profileRef.set({
          id: 'prof_1',
          tenantId: tenantA,
          title: 'EU Enterprise Scope',
          profileType: 'corporate_wide',
          status: 'active',
          version: '1.0',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
          ownerId: userComplianceA,
        })
      );
    });

    test('contributor can record scope facts & answers in Tenant A', async () => {
      const contribDb = testEnv.authenticatedContext(userContribA).firestore();

      // 1. Contributor records scope fact
      const factRef = contribDb.doc(`tenants/${tenantA}/scope_facts/fact_cloud`);
      await assertSucceeds(
        factRef.set({
          id: 'fact_cloud',
          tenantId: tenantA,
          scopeProfileId: 'prof_1',
          factKey: 'usesCloudInfrastructure',
          category: 'cloud_usage',
          valueBoolean: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userContribA,
          updatedBy: userContribA,
          ownerId: userContribA,
        })
      );

      // 2. Contributor records scope questionnaire answer
      const answerRef = contribDb.doc(`tenants/${tenantA}/scope_answers/ans_1`);
      await assertSucceeds(
        answerRef.set({
          id: 'ans_1',
          tenantId: tenantA,
          questionId: 'q_cloud_01',
          responseType: 'boolean',
          valueBoolean: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: userContribA,
          updatedBy: userContribA,
          ownerId: userContribA,
        })
      );
    });

    test('viewer and auditor cannot create or update scope facts', async () => {
      const viewerDb = testEnv.authenticatedContext(userViewerA).firestore();
      const factRef = viewerDb.doc(`tenants/${tenantA}/scope_facts/fact_viewer_attempt`);

      await assertFails(
        factRef.set({
          id: 'fact_viewer_attempt',
          tenantId: tenantA,
          factKey: 'processesPersonalData',
          valueBoolean: true,
          ownerId: userViewerA,
          createdBy: userViewerA,
          updatedBy: userViewerA,
        })
      );
    });
  });

  // 3. Applicability Decisions
  describe('3. Applicability Decisions Security & Permissions', () => {
    test('compliance manager can write applicability decisions; auditor and contributor cannot', async () => {
      const compDb = testEnv.authenticatedContext(userComplianceA).firestore();
      const auditorDb = testEnv.authenticatedContext(userAuditorA).firestore();
      const contribDb = testEnv.authenticatedContext(userContribA).firestore();

      const decRef = compDb.doc(`tenants/${tenantA}/applicability_decisions/dec_art30`);
      await assertSucceeds(
        decRef.set({
          id: 'dec_art30',
          tenantId: tenantA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Article 30',
          requirementTitle: 'ROPA',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'statutory_mandatory',
          rationale: 'Mandatory statutory record',
          matchedRuleId: 'rule_gdpr_art30_records',
          decisionSource: 'auto',
          isOverridden: false,
          assessedBy: 'system',
          assessedAt: now,
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
          ownerId: userComplianceA,
        })
      );

      // Auditor can read
      await assertSucceeds(auditorDb.doc(`tenants/${tenantA}/applicability_decisions/dec_art30`).get());

      // Contributor cannot update or override
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/applicability_decisions/dec_art30`).update({
          status: 'not_applicable',
        })
      );
    });
  });

  // 4. Tenant Requirement Instances, Controls & Statutory Obligations
  describe('4. Requirement Instances, Controls, and Statutory Obligations', () => {
    test('compliance manager instantiates statutory obligations; unauthorized roles cannot delete', async () => {
      const compDb = testEnv.authenticatedContext(userComplianceA).firestore();
      const contribDb = testEnv.authenticatedContext(userContribA).firestore();

      const oblRef = compDb.doc(`tenants/${tenantA}/statutory_obligations/obl_ropa`);
      await assertSucceeds(
        oblRef.set({
          id: 'obl_ropa',
          tenantId: tenantA,
          frameworkId: 'gdpr',
          obligationType: 'gdpr_ropa_register',
          title: 'ROPA Processing Register',
          description: 'Formal ROPA',
          artifactKind: 'required_register',
          targetCollection: 'ropa_entries',
          isMandatory: true,
          status: 'active',
          statutoryBasis: 'GDPR Article 30',
          rationale: 'Mandatory statutory register',
          createdAt: now,
          updatedAt: now,
          createdBy: userComplianceA,
          updatedBy: userComplianceA,
          ownerId: userComplianceA,
        })
      );

      // Contributor cannot delete statutory obligations
      await assertFails(contribDb.doc(`tenants/${tenantA}/statutory_obligations/obl_ropa`).delete());
    });

    test('contributor can update operational progress on tenant controls and requirement instances', async () => {
      const contribDb = testEnv.authenticatedContext(userContribA).firestore();

      // Contributor updates control status to implemented
      await assertSucceeds(
        contribDb.doc(`tenants/${tenantA}/controls/ctl_crypto`).update({
          status: 'implemented',
          healthScore: 100,
          updatedAt: new Date().toISOString(),
          updatedBy: userContribA,
        })
      );

      // Contributor updates requirement instance notes
      await assertSucceeds(
        contribDb.doc(`tenants/${tenantA}/requirement_instances/req_inst_1`).update({
          complianceStatus: 'compliant',
          assessmentNotes: 'Verified encryption deployment.',
          updatedAt: new Date().toISOString(),
          updatedBy: userContribA,
        })
      );
    });
  });

  // 5. Override Workflows & History Audit Trail
  describe('5. Override Workflows & Audit Log Validation', () => {
    test('enforces rationale length validation and maintains deterministic history rollback', () => {
      const sampleDecision: TenantApplicabilityDecision = {
        id: 'dec_test_ov',
        tenantId: tenantA,
        ownerId: userComplianceA,
        requirementId: 'aia_art_09',
        frameworkId: 'eu_ai_act',
        sectionCode: 'Article 9',
        requirementTitle: 'Risk Management',
        isApplicable: false,
        status: 'not_applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: 'rule_aia_09',
        ruleEvaluationSummary: 'highRiskAIUsage is false',
        rationale: 'Exempt for non-high-risk deployers',
        decisionSource: 'auto',
        isOverridden: false,
        autoResult: {
          isApplicable: false,
          status: 'not_applicable',
          matchedRuleId: 'rule_aia_09',
          ruleEvaluationSummary: 'highRiskAIUsage is false',
          evaluatedAt: now,
        },
        overrideReason: null,
        overrideRationale: null,
        previousStatus: null,
        assessedBy: 'system',
        assessedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      };

      // 1. Short rationale rejected
      const invalidRes = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'short',
        decisionSource: 'user_override',
      });
      expect(invalidRes.valid).toBe(false);

      // 2. Valid rationale accepted
      const validRes = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary risk management framework adoption for ethical AI assurance.',
        decisionSource: 'user_override',
      });
      expect(validRes.valid).toBe(true);

      // 3. Apply override
      const overridden = applyApplicabilityOverride({
        decision: sampleDecision,
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary risk management framework adoption for ethical AI assurance.',
        actorId: userComplianceA,
        actorRole: 'compliance_manager',
        decisionSource: 'user_override',
      });

      expect(overridden.status).toBe('applicable');
      expect(overridden.isOverridden).toBe(true);
      expect(overridden.autoResult?.status).toBe('not_applicable');
      expect(overridden.history?.length).toBe(1);

      // 4. Revert override
      const reverted = revertApplicabilityOverride({
        decision: overridden,
        actorId: userComplianceA,
        actorRole: 'compliance_manager',
        reason: 'Recalibrated after scope clarification.',
      });

      expect(reverted.status).toBe('not_applicable');
      expect(reverted.isOverridden).toBe(false);
      expect(reverted.history?.length).toBe(2);
    });
  });

  // 6. Export Outputs & Storage Isolation
  describe('6. Export Jobs & Multi-Tenant Storage Isolation', () => {
    test('compliance manager can request export jobs; client mutation is forbidden', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const jobRef = compCtx.firestore().doc(`tenants/${tenantA}/export_jobs/job_align_1`);

      await assertSucceeds(
        jobRef.set({
          id: 'job_align_1',
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          status: 'queued',
          requestedBy: userComplianceA,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );

      // Client cannot mutate job document
      await assertFails(
        jobRef.update({
          status: 'completed',
        })
      );
    });

    test('tenant A member cannot access Tenant B export job document', async () => {
      const compACtx = testEnv.authenticatedContext(userComplianceA);
      await assertFails(compACtx.firestore().doc(`tenants/${tenantB}/export_jobs/job_b_secret`).get());
    });
  });
});

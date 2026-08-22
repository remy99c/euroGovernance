import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  computeTenantFrameworkCoverage,
  Framework,
  Requirement,
  TenantApplicabilityDecision,
  TenantRequirementInstance,
  TenantControlInstance,
  StatutoryObligationFlag,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_coverage_alpha';
const tenantB = 'tenant_coverage_beta';
const userAdminA = 'usr_admin_cov_a';
const userAdminB = 'usr_admin_cov_b';
const userAuditorA = 'usr_auditor_cov_a';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-coverage-dashboard-test',
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
    await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
      userId: userAuditorA,
      tenantId: tenantA,
      role: 'auditor',
      status: 'active',
    });

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
      userId: userAdminB,
      tenantId: tenantB,
      role: 'tenant_admin',
      status: 'active',
    });
  });
});

describe('Framework Coverage Dashboard & Aggregation Engine', () => {
  const now = new Date().toISOString();
  const yesterday = new Date(Date.now() - 86400000).toISOString();

  const dummyFrameworks: Framework[] = [
    {
      id: 'gdpr',
      code: 'GDPR',
      name: 'EU General Data Protection Regulation',
      version: '2016/679',
      category: 'privacy',
      jurisdiction: 'European Union',
      type: 'regulation',
      status: 'active',
      description: 'EU Data Protection Framework',
      officialReferenceUrl: 'https://gdpr.eu',
      totalRequirementsCount: 2,
      totalMasterControlsCount: 2,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: 'iso_27001',
      code: 'ISO 27001',
      name: 'ISO/IEC 27001:2022 ISMS',
      version: '2022',
      category: 'security',
      jurisdiction: 'International',
      type: 'international_standard',
      status: 'active',
      description: 'Information Security Management System',
      officialReferenceUrl: 'https://iso.org',
      totalRequirementsCount: 2,
      totalMasterControlsCount: 2,
      isSystem: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  const dummyRequirements: Requirement[] = [
    {
      id: 'gdpr_art_30',
      frameworkId: 'gdpr',
      sectionCode: 'Art. 30',
      title: 'Records of processing activities',
      description: 'Maintain ROPA',
      guidanceText: 'Guidance',
      category: 'accountability',
      isMandatory: true,
      parentRequirementId: null,
      sortOrder: 1,
    },
    {
      id: 'gdpr_art_35',
      frameworkId: 'gdpr',
      sectionCode: 'Art. 35',
      title: 'Data protection impact assessment',
      description: 'Perform DPIA when high risk',
      guidanceText: 'Guidance',
      category: 'risk',
      isMandatory: false,
      parentRequirementId: null,
      sortOrder: 2,
    },
    {
      id: 'iso_a824',
      frameworkId: 'iso_27001',
      sectionCode: 'A.8.24',
      title: 'Use of cryptography',
      description: 'Implement encryption',
      guidanceText: 'Guidance',
      category: 'security',
      isMandatory: true,
      parentRequirementId: null,
      sortOrder: 1,
    },
    {
      id: 'iso_a51',
      frameworkId: 'iso_27001',
      sectionCode: 'A.5.1',
      title: 'Policies for information security',
      description: 'Define and approve policies',
      guidanceText: 'Guidance',
      category: 'governance',
      isMandatory: true,
      parentRequirementId: null,
      sortOrder: 2,
    },
  ];

  describe('1. Coverage Aggregation Correctness', () => {
    test('computes correct requirements breakdown: applicable, non-applicable, and review needed', () => {
      const decisions: TenantApplicabilityDecision[] = [
        {
          id: 'dec_1',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 30',
          requirementTitle: 'Records of processing activities',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'statutory_mandatory',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Mandatory',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'system',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
        {
          id: 'dec_2',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'gdpr_art_35',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 35',
          requirementTitle: 'DPIA',
          isApplicable: false,
          status: 'not_applicable',
          applicabilityType: 'statutory_mandatory',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Exempt',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'system',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
        {
          id: 'dec_3',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'iso_a824',
          frameworkId: 'iso_27001',
          sectionCode: 'A.8.24',
          requirementTitle: 'Cryptography',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'rule_derived',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Mandatory',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'system',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
        {
          id: 'dec_4',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'iso_a51',
          frameworkId: 'iso_27001',
          sectionCode: 'A.5.1',
          requirementTitle: 'Security Policies',
          isApplicable: true,
          status: 'review_required',
          applicabilityType: 'rule_derived',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Review pending',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'system',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
      ];

      const controls: TenantControlInstance[] = [
        {
          id: 'ctl_crypto_1',
          tenantId: tenantA,
          ownerId: userAdminA,
          code: 'CTL-SEC-ENC-01',
          title: 'TLS 1.3 & AES-256 Cloud Encryption',
          description: 'Production encryption',
          domain: 'security',
          frameworkIds: ['gdpr', 'iso_27001'],
          isHarmonized: true,
          status: 'implemented',
          healthScore: 100,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        } as any,
      ];

      const evidence = [
        { id: 'ev_1', tenantId: tenantA, controlId: 'ctl_crypto_1', status: 'valid' },
      ];

      const statutoryObligations: StatutoryObligationFlag[] = [
        {
          id: 'obl_1',
          tenantId: tenantA,
          ownerId: userAdminA,
          frameworkId: 'gdpr',
          obligationType: 'gdpr_ropa_register',
          title: 'ROPA Register',
          description: 'Article 30',
          artifactKind: 'required_register',
          targetCollection: 'ropa_entries',
          isMandatory: true,
          status: 'active',
          triggeringFactKeys: ['processesPersonalData'],
          statutoryBasis: 'GDPR Article 30',
          rationale: 'Mandatory',
          derivedFromDecisionId: 'dec_1',
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
      ];

      const coverage = computeTenantFrameworkCoverage({
        tenantId: tenantA,
        adoptedFrameworkIds: ['gdpr', 'iso_27001'],
        frameworks: dummyFrameworks,
        requirements: dummyRequirements,
        decisions,
        controls,
        evidence,
        statutoryObligations,
      });

      // Assert Global Totals
      expect(coverage.adoptedFrameworksCount).toBe(2);
      expect(coverage.totalRequirementsCount).toBe(4);
      expect(coverage.totalApplicableCount).toBe(2);
      expect(coverage.totalNonApplicableCount).toBe(1);
      expect(coverage.totalReviewNeededCount).toBe(1);
      expect(coverage.totalControlsCount).toBe(1);
      expect(coverage.totalHarmonizedControlsCount).toBe(1);
      expect(coverage.statutoryObligationsSummary.totalActiveObligations).toBe(1);
      expect(coverage.statutoryObligationsSummary.byFramework.gdpr).toBe(1);

      // Assert Framework Breakdown
      const gdprMetrics = coverage.frameworks.find((f) => f.frameworkId === 'gdpr');
      expect(gdprMetrics).toBeDefined();
      expect(gdprMetrics?.applicableRequirementsCount).toBe(1);
      expect(gdprMetrics?.nonApplicableRequirementsCount).toBe(1);
      expect(gdprMetrics?.totalControlsCount).toBe(1);
      expect(gdprMetrics?.harmonizedControlsCount).toBe(1);

      const isoMetrics = coverage.frameworks.find((f) => f.frameworkId === 'iso_27001');
      expect(isoMetrics).toBeDefined();
      expect(isoMetrics?.applicableRequirementsCount).toBe(1);
      expect(isoMetrics?.reviewNeededRequirementsCount).toBe(1);
      expect(isoMetrics?.overdueReviewsCount).toBeGreaterThanOrEqual(1);
    });

    test('accurately calculates open gaps, overdue reviews, and missing evidence indicators', () => {
      const decisions: TenantApplicabilityDecision[] = [
        {
          id: 'dec_gap_1',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 30',
          requirementTitle: 'ROPA',
          isApplicable: true,
          status: 'applicable',
          applicabilityType: 'statutory_mandatory',
          matchedRuleId: null,
          ruleEvaluationSummary: null,
          rationale: 'Mandatory',
          overrideReason: null,
          overrideRationale: null,
          previousStatus: null,
          assessedBy: 'system',
          assessedAt: now,
          reviewedBy: null,
          reviewedAt: null,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
      ];

      const requirementInstances: TenantRequirementInstance[] = [
        {
          id: 'req_inst_1',
          tenantId: tenantA,
          ownerId: userAdminA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 30',
          title: 'ROPA',
          description: 'Maintain ROPA',
          category: 'accountability',
          status: 'active',
          isMandatory: true,
          applicabilityDecisionId: 'dec_gap_1',
          complianceStatus: 'non_compliant',
          satisfyingControlIds: [], // GAP: No satisfying control linked!
          primaryAssigneeId: null,
          department: 'Legal',
          lastAssessmentDate: null,
          nextAssessmentDate: yesterday, // OVERDUE: Assessment date passed!
          assessmentNotes: 'Initial gap analysis',
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        },
      ];

      const controls: TenantControlInstance[] = [
        {
          id: 'ctl_untested',
          tenantId: tenantA,
          ownerId: userAdminA,
          code: 'CTL-SEC-02',
          title: 'Untested Control',
          domain: 'security',
          frameworkIds: ['gdpr'],
          isHarmonized: false,
          status: 'in_progress',
          healthScore: 40,
          createdAt: now,
          updatedAt: now,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        } as any,
      ];

      // Missing evidence: no evidence provided for ctl_untested
      const coverage = computeTenantFrameworkCoverage({
        tenantId: tenantA,
        adoptedFrameworkIds: ['gdpr'],
        frameworks: dummyFrameworks,
        requirements: dummyRequirements,
        decisions,
        requirementInstances,
        controls,
        evidence: [],
      });

      expect(coverage.totalOpenGapsCount).toBeGreaterThanOrEqual(1);
      expect(coverage.totalOverdueReviewsCount).toBeGreaterThanOrEqual(1);
      expect(coverage.totalMissingEvidenceCount).toBe(1);
    });
  });

  describe('2. Multi-Tenant Isolation Protection', () => {
    test('tenant A admin and auditor can read summary metrics for Tenant A in Firestore', async () => {
      // Seed summary metrics via backend bypass
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/summary_metrics/current`).set({
          tenantId: tenantA,
          overallComplianceScore: 85,
          totalControlsCount: 12,
          implementedControlsCount: 10,
          updatedAt: now,
        });
      });

      // Tenant A Admin Read
      const adminACtx = testEnv.authenticatedContext(userAdminA);
      const adminDoc = await assertSucceeds(adminACtx.firestore().doc(`tenants/${tenantA}/summary_metrics/current`).get());
      expect(adminDoc.data()?.totalControlsCount).toBe(12);

      // Tenant A Auditor Read
      const auditorACtx = testEnv.authenticatedContext(userAuditorA);
      const auditorDoc = await assertSucceeds(auditorACtx.firestore().doc(`tenants/${tenantA}/summary_metrics/current`).get());
      expect(auditorDoc.data()?.overallComplianceScore).toBe(85);
    });

    test('direct client write to summary_metrics is strictly blocked', async () => {
      const adminACtx = testEnv.authenticatedContext(userAdminA);
      const docRef = adminACtx.firestore().doc(`tenants/${tenantA}/summary_metrics/current`);

      await assertFails(
        docRef.set({
          tenantId: tenantA,
          overallComplianceScore: 99,
        })
      );
    });

    test('tenant A user cannot access or read Tenant B summary metrics (cross-tenant isolation)', async () => {
      // Seed Tenant B metrics via backend bypass
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantB}/summary_metrics/current`).set({
          tenantId: tenantB,
          overallComplianceScore: 92,
          totalControlsCount: 20,
          implementedControlsCount: 18,
          updatedAt: now,
        });
      });

      // Tenant A Auditor attempts cross-tenant read
      const auditorACtx = testEnv.authenticatedContext(userAuditorA);
      const crossRead = auditorACtx.firestore().doc(`tenants/${tenantB}/summary_metrics/current`);

      await assertFails(crossRead.get());
    });
  });
});

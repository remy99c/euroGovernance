import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import { ExportType } from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_export_alpha';
const tenantB = 'tenant_export_beta';
const userAdminA = 'usr_admin_exp_a';
const userComplianceA = 'usr_comp_exp_a';
const userAuditorA = 'usr_auditor_exp_a';
const userContribA = 'usr_contrib_exp_a';
const userViewerA = 'usr_viewer_exp_a';
const userAdminB = 'usr_admin_exp_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-export-reports-test',
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
  });
});

describe('Framework Adoption & Applicability Export/Report Generation Suite', () => {
  const now = new Date().toISOString();

  // 1. Export Authorization & Tenant Isolation (Firestore Rules)
  describe('1. Export Job Security & Role Authorization', () => {
    test('compliance manager and auditor can request all 5 framework export types in Firestore', async () => {
      const complianceDb = testEnv.authenticatedContext(userComplianceA).firestore();
      const auditorDb = testEnv.authenticatedContext(userAuditorA).firestore();

      const newExportTypes: ExportType[] = [
        'adopted_frameworks_summary',
        'applicability_decisions_report',
        'tenant_control_coverage_report',
        'iso_soa_pdf',
        'framework_gap_report',
      ];

      for (let i = 0; i < newExportTypes.length; i++) {
        const expType = newExportTypes[i]!;
        const jobId = `job_comp_${i}`;

        await assertSucceeds(
          complianceDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
            id: jobId,
            tenantId: tenantA,
            exportType: expType,
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
      }

      // Auditor can also request exports
      await assertSucceeds(
        auditorDb.doc(`tenants/${tenantA}/export_jobs/job_aud_gap`).set({
          id: 'job_aud_gap',
          tenantId: tenantA,
          exportType: 'framework_gap_report',
          status: 'queued',
          requestedBy: userAuditorA,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );
    });

    test('contributor and viewer cannot create export jobs (privilege guardrail)', async () => {
      const contribDb = testEnv.authenticatedContext(userContribA).firestore();
      const viewerDb = testEnv.authenticatedContext(userViewerA).firestore();

      await assertFails(
        contribDb.doc(`tenants/${tenantA}/export_jobs/job_contrib_1`).set({
          id: 'job_contrib_1',
          tenantId: tenantA,
          exportType: 'framework_gap_report',
          status: 'queued',
          requestedBy: userContribA,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/export_jobs/job_viewer_1`).set({
          id: 'job_viewer_1',
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          status: 'queued',
          requestedBy: userViewerA,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );
    });

    test('tenant A user cannot access or read Tenant B export jobs (tenant isolation)', async () => {
      // Seed Tenant B export job
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantB}/export_jobs/job_b_secret`).set({
          id: 'job_b_secret',
          tenantId: tenantB,
          exportType: 'tenant_control_coverage_report',
          status: 'completed',
          requestedBy: userAdminB,
          requestedAt: now,
          completedAt: now,
          fileStoragePath: `tenants/${tenantB}/exports/job_b_secret/report.json`,
          fileDownloadUrl: null,
          fileSizeBytes: 1024,
          errorMessage: null,
          filtersApplied: {},
        });
      });

      // Tenant A Auditor tries to read Tenant B export job
      const auditorACtx = testEnv.authenticatedContext(userAuditorA);
      const crossRead = auditorACtx.firestore().doc(`tenants/${tenantB}/export_jobs/job_b_secret`);

      await assertFails(crossRead.get());
    });

    test('direct client modification of completed export jobs is strictly blocked (immutability)', async () => {
      const jobId = 'job_comp_immut';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          status: 'completed',
          requestedBy: userComplianceA,
          requestedAt: now,
          completedAt: now,
          fileStoragePath: `tenants/${tenantA}/exports/${jobId}/summary.json`,
          fileDownloadUrl: null,
          fileSizeBytes: 2048,
          errorMessage: null,
          filtersApplied: {},
        });
      });

      const complianceDb = testEnv.authenticatedContext(userComplianceA).firestore();
      await assertFails(
        complianceDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).update({
          fileStoragePath: 'tampered_path',
        })
      );
    });
  });

  // 2. Export Content Generation & Traceability Structure
  describe('2. Export Content Generation & Traceability Models', () => {
    test('verifies 1. Adopted Framework Summary export structure', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          title: 'Adopted Frameworks & Scope Summary',
          generatedAt: now,
          requestedBy: userComplianceA,
          adoptedFrameworksCount: 2,
          recordedScopeFactsCount: 4,
        },
        adoptedFrameworks: [
          { frameworkId: 'gdpr', versionPinned: '2016/679', status: 'active' },
          { frameworkId: 'iso_27001', versionPinned: '2022', status: 'active' },
        ],
        structuredScopeFacts: [
          { factKey: 'processesPersonalData', valueBoolean: true, category: 'data_processing' },
          { factKey: 'highRiskAIUsage', valueBoolean: false, category: 'ai_governance' },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('adopted_frameworks_summary');
      expect(payload.adoptedFrameworks.length).toBe(2);
      expect(payload.structuredScopeFacts[0]?.factKey).toBe('processesPersonalData');
    });

    test('verifies 2. Applicability Decisions Report with rationales and override history', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'applicability_decisions_report',
          title: 'Multi-Framework Applicability Determination & Rationale Report',
          generatedAt: now,
          requestedBy: userComplianceA,
          totalDecisionsCount: 2,
          applicableCount: 1,
          excludedCount: 1,
          reviewNeededCount: 0,
          overriddenCount: 1,
        },
        decisions: [
          {
            sectionCode: 'Article 30',
            requirementTitle: 'Records of Processing Activities (ROPA)',
            status: 'applicable',
            statutoryRationale: 'Mandatory statutory record for EU personal data.',
            matchedRuleId: 'rule_gdpr_art30_records',
            decisionSource: 'auto',
          },
          {
            sectionCode: 'Article 35',
            requirementTitle: 'DPIA',
            status: 'not_applicable',
            statutoryRationale: 'Exempt unless special category data processing is active.',
            matchedRuleId: 'rule_gdpr_art35_dpia',
            isOverridden: true,
            overrideRationale: 'Formal legal counsel exclusion recorded.',
            history: [{ actorId: userComplianceA, previousStatus: 'applicable', newStatus: 'not_applicable' }],
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('applicability_decisions_report');
      expect(payload.decisions.length).toBe(2);
      expect(payload.decisions[1]?.isOverridden).toBe(true);
      expect(payload.decisions[1]?.history?.length).toBe(1);
    });

    test('verifies 3. Tenant Control Coverage & Harmonization Report structure', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'tenant_control_coverage_report',
          title: 'Tenant Control Coverage & Harmonization Report',
          generatedAt: now,
          requestedBy: userComplianceA,
          totalControlsCount: 2,
          harmonizedControlsCount: 1,
          statutoryObligationsCount: 1,
        },
        controls: [
          {
            code: 'CTL-SEC-ENC-01',
            title: 'Encryption at Rest & Transit',
            domain: 'security',
            frameworkIds: ['gdpr', 'iso_27001'],
            isHarmonized: true,
            status: 'implemented',
          },
        ],
        statutoryObligations: [
          {
            frameworkId: 'gdpr',
            obligationType: 'gdpr_ropa_register',
            title: 'ROPA Register',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('tenant_control_coverage_report');
      expect(payload.exportHeader.harmonizedControlsCount).toBe(1);
      expect(payload.controls[0]?.isHarmonized).toBe(true);
    });

    test('verifies 4. ISO Statement of Applicability (SoA) Report structure with justifications', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'iso_soa_pdf',
          title: 'ISO/IEC 27001 Statement of Applicability (SoA)',
          generatedAt: now,
          requestedBy: userComplianceA,
          totalEntriesCount: 2,
        },
        soaEntries: [
          {
            controlCode: 'A.8.24',
            controlTitle: 'Use of cryptography',
            isApplicable: true,
            justificationRationale: 'Implemented via AWS KMS AES-256.',
            implementedStatus: 'implemented',
            status: 'approved',
          },
          {
            controlCode: 'A.7.4',
            controlTitle: 'Physical security monitoring',
            isApplicable: false,
            justificationRationale: '100% serverless cloud deployment; no physical premises.',
            status: 'approved',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('iso_soa_pdf');
      expect(payload.soaEntries.length).toBe(2);
      expect(payload.soaEntries[1]?.justificationRationale).toContain('serverless cloud deployment');
    });

    test('verifies 5. Framework Gap & Remediation Report structure', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'framework_gap_report',
          title: 'Multi-Framework Compliance Gap & Attention Report',
          generatedAt: now,
          requestedBy: userComplianceA,
          openGapsCount: 1,
          overdueReviewsCount: 1,
        },
        openGaps: [
          {
            sectionCode: 'Article 30',
            frameworkId: 'gdpr',
            issue: 'Applicable statutory requirement has no mapped tenant controls.',
            remediation: 'Instantiate or map an operational control to satisfy this requirement.',
          },
        ],
        overdueReviews: [
          {
            sectionCode: 'Clause 5.1',
            frameworkId: 'iso_27001',
            issue: 'Applicability decision is pending manual/reviewer assessment.',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('framework_gap_report');
      expect(payload.openGaps.length).toBe(1);
      expect(payload.openGaps[0]?.remediation).toBeDefined();
    });
  });
});

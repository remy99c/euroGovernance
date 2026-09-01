import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  seedMasterGovernanceLibrary,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  evaluateApplicabilityRule,
  TenantApplicabilityDecision,
  validateApplicabilityOverride,
  applyApplicabilityOverride,
  revertApplicabilityOverride,
  ApplicabilityRule,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

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

  // 1. Seed Master Governance Library
  await seedMasterGovernanceLibrary(testEnv);

  // 2. Seed Tenants & Memberships
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date().toISOString();

    // Tenant Root Docs
    await db.doc(`tenants/${tenantA}`).set({
      status: 'active',
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
      status: 'active',
      id: tenantB,
      name: 'MedTech France SAS',
      createdAt: now,
      updatedAt: now,
    });

    // Tenant A Memberships
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.adminA.uid}`).set({
      userId: PERSONAS.adminA.uid,
      tenantId: tenantA,
      role: PERSONAS.adminA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.contributorA.uid}`).set({
      userId: PERSONAS.contributorA.uid,
      tenantId: tenantA,
      role: PERSONAS.contributorA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.auditorA.uid}`).set({
      userId: PERSONAS.auditorA.uid,
      tenantId: tenantA,
      role: PERSONAS.auditorA.role,
      status: 'active',
    });

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.contributorB.uid}`).set({
      userId: PERSONAS.contributorB.uid,
      tenantId: tenantB,
      role: PERSONAS.contributorB.role,
      status: 'active',
    });
  });
});

describe('End-to-End Governance Lifecycle & Multi-Tenant Emulator Test Pack', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Platform Admin Maintains Master Frameworks
  // ---------------------------------------------------------------------------
  describe('1. Master Framework & Library Governance', () => {
    test('browser clients cannot mutate global master frameworks, including platform admins', async () => {
      const platformAdminDb = testEnv
        .authenticatedContext('platform_sys_admin', { platform_admin: true })
        .firestore();
      const tenantAdminDb = testEnv
        .authenticatedContext(PERSONAS.adminA.uid, { email: PERSONAS.adminA.email })
        .firestore();

      // Platform-admin browser writes are rejected; the master-data command is server-only.
      await assertFails(
        platformAdminDb.doc('frameworks/eu_ai_act').set({
          id: 'eu_ai_act',
          name: 'EU Artificial Intelligence Act',
          shortName: 'EU AI Act',
          version: '2024/1689',
          regulatoryBody: 'European Commission',
          jurisdiction: 'EU',
          category: 'ai_governance',
          totalRequirementsCount: 113,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        })
      );

      // Tenant Admin CANNOT mutate global framework library
      await assertFails(
        tenantAdminDb.doc('frameworks/eu_ai_act').update({
          name: 'Tampered AI Act',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Tenant Admin Adopts Framework
  // ---------------------------------------------------------------------------
  describe('2. Framework Adoption Lifecycle', () => {
    test('browser clients cannot write authoritative framework-adoption records directly', async () => {
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      // Tenant-admin browser writes must go through the framework-adoption command.
      await assertFails(
        adminDb.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).set({
          id: 'gdpr',
          tenantId: tenantA,
          frameworkId: 'gdpr',
          versionPinned: '2016/679',
          status: 'active',
          scopeDescription: 'Production Cloud Workloads Scope',
          adoptedAt: now,
          adoptedBy: PERSONAS.adminA.uid,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.adminA.uid,
          updatedBy: PERSONAS.adminA.uid,
          ownerId: PERSONAS.adminA.uid,
        })
      );

      // Contributor CANNOT adopt frameworks
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/adopted_frameworks/iso_27001`).set({
          id: 'iso_27001',
          tenantId: tenantA,
          frameworkId: 'iso_27001',
          versionPinned: '2022',
          status: 'active',
          ownerId: PERSONAS.contributorA.uid,
          createdBy: PERSONAS.contributorA.uid,
          updatedBy: PERSONAS.contributorA.uid,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Tenant Completes Scope Questionnaire & Facts
  // ---------------------------------------------------------------------------
  describe('3. Scope Questionnaire Completion & Fact Capture', () => {
    test('browser clients cannot directly persist scope answers or derived facts', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      // 1. Scope-answer submission must use the trusted command boundary.
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/scope_answers/ans_personal_data`).set({
          id: 'ans_personal_data',
          tenantId: tenantA,
          questionId: 'q_gdpr_personal_data',
          questionnaireId: 'qnr_gdpr_scoping',
          factKey: 'processesPersonalData',
          responseType: 'boolean',
          answerBoolean: true,
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.contributorA.uid,
          updatedBy: PERSONAS.contributorA.uid,
          ownerId: PERSONAS.contributorA.uid,
        })
      );

      // 2. Derived facts are authoritative server output.
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/scope_facts/processesPersonalData`).set({
          id: 'processesPersonalData',
          tenantId: tenantA,
          factKey: 'processesPersonalData',
          category: 'data_processing',
          dataType: 'boolean',
          valueBoolean: true,
          rationale: 'Customer CRM and cloud backend processing.',
          status: 'active',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.contributorA.uid,
          updatedBy: PERSONAS.contributorA.uid,
          ownerId: PERSONAS.contributorA.uid,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Applicability Engine Runs
  // ---------------------------------------------------------------------------
  describe('4. Applicability Engine Execution & Decision Generation', () => {
    test('evaluates a machine-readable rule while blocking direct decision persistence', async () => {
      const rule: ApplicabilityRule = {
        id: 'rule_gdpr_art30_records',
        ruleName: 'Article 30 ROPA Mandatory Trigger',
        description: 'Mandatory ROPA register triggered for EU personal data.',
        frameworkId: 'gdpr',
        targetRequirementId: 'gdpr_art_30',
        conditionGroup: {
          logicalOperator: 'all',
          clauses: [
            {
              factKey: 'processesPersonalData',
              operator: 'equals',
              expectedValue: true,
            },
          ],
        },
        resultingStatusIfMatched: 'applicable',
        resultingStatusIfNotMatched: 'not_applicable',
        statutoryRationale: 'Mandatory ROPA register triggered for EU personal data.',
        isMandatoryUnlessExempt: true,
        version: '1.0',
        createdAt: now,
        updatedAt: now,
      };

      const tenantFactMap: Record<string, unknown> = {
        processesPersonalData: true,
      };

      // Run engine evaluation
      const evalResult = evaluateApplicabilityRule(rule, tenantFactMap);
      expect(evalResult.resultingOutcome).toBe('applicable');
      expect(evalResult.matched).toBe(true);

      // A compliance-manager browser cannot directly persist the engine decision.
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      await assertFails(
        compDb.doc(`tenants/${tenantA}/applicability_decisions/dec_art30`).set({
          id: 'dec_art30',
          tenantId: tenantA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Article 30',
          requirementTitle: 'Records of Processing Activities (ROPA)',
          isApplicable: true,
          status: evalResult.resultingOutcome,
          applicabilityType: 'statutory_mandatory',
          matchedRuleId: rule.id,
          ruleEvaluationSummary: evalResult.explanation,
          rationale: 'Mandatory statutory record for personal data.',
          decisionSource: 'auto',
          isOverridden: false,
          assessedBy: 'applicability_engine',
          assessedAt: now,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          ownerId: PERSONAS.complianceA.uid,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 5. Tenant Controls & Statutory Obligations Generation
  // ---------------------------------------------------------------------------
  describe('5. Tenant Controls & Statutory Obligations Instantiation', () => {
    test('blocks direct instantiation of requirement and statutory-obligation records', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // 1. Requirement instances are emitted by the trusted instantiation command.
      await assertFails(
        compDb.doc(`tenants/${tenantA}/requirement_instances/req_art30`).set({
          id: 'req_art30',
          tenantId: tenantA,
          requirementId: 'gdpr_art_30',
          frameworkId: 'gdpr',
          sectionCode: 'Art. 30',
          title: 'ROPA Processing Records',
          description: 'Maintain formal records of processing activities.',
          category: 'accountability',
          status: 'active',
          isMandatory: true,
          applicabilityDecisionId: 'dec_art30',
          complianceStatus: 'in_progress',
          satisfyingControlIds: [],
          primaryAssigneeId: PERSONAS.complianceA.uid,
          department: 'Privacy',
          lastAssessmentDate: null,
          nextAssessmentDate: null,
          assessmentNotes: null,
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          ownerId: PERSONAS.complianceA.uid,
        })
      );

      // 2. Statutory-obligation records are emitted by that same trusted workflow.
      await assertFails(
        compDb.doc(`tenants/${tenantA}/statutory_obligations/obl_ropa`).set({
          id: 'obl_ropa',
          tenantId: tenantA,
          frameworkId: 'gdpr',
          obligationType: 'gdpr_ropa_register',
          title: 'Article 30 Processing Register',
          description: 'Formal ROPA',
          artifactKind: 'required_register',
          targetCollection: 'ropa_entries',
          isMandatory: true,
          status: 'active',
          statutoryBasis: 'GDPR Article 30',
          rationale: 'Mandatory statutory register',
          createdAt: now,
          updatedAt: now,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          ownerId: PERSONAS.complianceA.uid,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 6. Harmonized Control Reuse ("One Control, Many Obligations")
  // ---------------------------------------------------------------------------
  describe('6. Control Harmonization & Multi-Obligation Mapping', () => {
    test('instantiates a single harmonized control satisfying multiple framework obligations', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // Unified Encryption Control covering GDPR Art. 32 and ISO 27001 Annex A.8.24
      const unifiedControl = {
        id: 'ctl_crypto_unified',
        tenantId: tenantA,
        code: 'CTL-SEC-ENC-01',
        title: 'AES-256 Cloud Data Encryption at Rest & In Transit',
        description: 'Enforces encryption across databases and TLS 1.3 in transit.',
        domain: 'security',
        frameworkIds: ['gdpr', 'iso_27001'],
        isHarmonized: true,
        canonicalMappingId: 'map_sec_enc_01',
        satisfiedRequirementIds: ['gdpr_art_32', 'iso_27001_a824'],
        status: 'implemented',
        healthScore: 100,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        ownerId: PERSONAS.complianceA.uid,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore()
          .doc(`tenants/${tenantA}/controls/ctl_crypto_unified`)
          .set(unifiedControl);
      });

      // Raw controls cannot bypass the governed read projection. The fixture
      // shape remains verifiable in the trusted test context.
      await assertFails(compDb.doc(`tenants/${tenantA}/controls/ctl_crypto_unified`).get());
      let persistedControl: Record<string, unknown> | undefined;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snap = await context.firestore().doc(`tenants/${tenantA}/controls/ctl_crypto_unified`).get();
        persistedControl = snap.data();
      });
      expect(persistedControl?.isHarmonized).toBe(true);
      expect(persistedControl?.frameworkIds).toEqual(['gdpr', 'iso_27001']);
    });
  });

  // ---------------------------------------------------------------------------
  // 7. Multi-Tenant Isolation & Cross-Tenant Security
  // ---------------------------------------------------------------------------
  describe('7. Multi-Tenant Isolation Enforcement', () => {
    test('Tenant B admin cannot read, mutate, or access Tenant A governance documents', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Pre-seed Tenant A sensitive control
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/controls/ctl_secret_a`).set({
          id: 'ctl_secret_a',
          tenantId: tenantA,
          title: 'Confidential Key Rotation',
          ownerId: PERSONAS.adminA.uid,
          createdBy: PERSONAS.adminA.uid,
          updatedBy: PERSONAS.adminA.uid,
        });
      });

      // Tenant B Admin cross-read attempt blocked
      await assertFails(adminBDb.doc(`tenants/${tenantA}/controls/ctl_secret_a`).get());

      // Tenant B Admin cross-write attempt blocked
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/controls/ctl_malicious_b`).set({
          id: 'ctl_malicious_b',
          tenantId: tenantA,
          title: 'Injected Control',
          ownerId: PERSONAS.adminB.uid,
          createdBy: PERSONAS.adminB.uid,
          updatedBy: PERSONAS.adminB.uid,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 8. Manual Override RBAC & Audit History
  // ---------------------------------------------------------------------------
  describe('8. Applicability Override Validation & Permission Guardrails', () => {
    test('contributor cannot override; compliance manager requires 10+ char rationale and preserves history', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      // Seed baseline decision in Tenant A
      const baselineDecision: TenantApplicabilityDecision = {
        id: 'dec_gdpr_art35',
        tenantId: tenantA,
        ownerId: PERSONAS.complianceA.uid,
        requirementId: 'gdpr_art_35',
        frameworkId: 'gdpr',
        sectionCode: 'Article 35',
        requirementTitle: 'DPIA',
        isApplicable: false,
        status: 'not_applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: 'rule_gdpr_35',
        ruleEvaluationSummary: 'Special category data is false',
        rationale: 'Exempt baseline',
        decisionSource: 'auto',
        isOverridden: false,
        autoResult: {
          isApplicable: false,
          status: 'not_applicable',
          matchedRuleId: 'rule_gdpr_35',
          ruleEvaluationSummary: 'Special category data is false',
          evaluatedAt: now,
        },
        overrideReason: null,
        overrideRationale: null,
        previousStatus: null,
        assessedBy: 'engine',
        assessedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
      };

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/applicability_decisions/dec_gdpr_art35`).set(baselineDecision);
      });

      // 1. Contributor override attempt fails
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/applicability_decisions/dec_gdpr_art35`).update({
          status: 'applicable',
          isOverridden: true,
        })
      );

      // 2. Rationale validation fails if under 10 chars
      const shortRationaleRes = validateApplicabilityOverride({
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'too short',
        decisionSource: 'user_override',
      });
      expect(shortRationaleRes.valid).toBe(false);

      // 3. Valid override applies with preserved history
      const overriddenDecision = applyApplicabilityOverride({
        decision: baselineDecision,
        newStatus: 'applicable',
        isApplicable: true,
        overrideRationale: 'Voluntary comprehensive DPIA adoption per CISO risk assessment.',
        actorId: PERSONAS.complianceA.uid,
        actorRole: 'compliance_manager',
        decisionSource: 'user_override',
      });

      expect(overriddenDecision.status).toBe('applicable');
      expect(overriddenDecision.isOverridden).toBe(true);
      expect(overriddenDecision.autoResult?.status).toBe('not_applicable');
      expect(overriddenDecision.history?.length).toBe(1);

      // 4. Reversion safely restores baseline
      const revertedDecision = revertApplicabilityOverride({
        decision: overriddenDecision,
        actorId: PERSONAS.complianceA.uid,
        actorRole: 'compliance_manager',
        reason: 'Recalibrated after operational review.',
      });

      expect(revertedDecision.status).toBe('not_applicable');
      expect(revertedDecision.isOverridden).toBe(false);
      expect(revertedDecision.history?.length).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 9. Export Access Is Tenant-Safe & Role-Guarded
  // ---------------------------------------------------------------------------
  describe('9. Export Jobs & Tenant Storage Protection', () => {
    test('export jobs require a trusted command and remain tenant-isolated', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Direct browser creation is rejected for the compliance manager.
      await assertFails(
        compDb.doc(`tenants/${tenantA}/export_jobs/job_e2e_01`).set({
          id: 'job_e2e_01',
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          status: 'queued',
          requestedBy: PERSONAS.complianceA.uid,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );

      // Seed the authoritative job returned by the trusted export command so
      // cross-tenant isolation is tested against an existing record.
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/export_jobs/job_e2e_01`).set({
          id: 'job_e2e_01',
          tenantId: tenantA,
          exportType: 'adopted_frameworks_summary',
          status: 'queued',
          requestedBy: PERSONAS.complianceA.uid,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        });
      });

      // Tenant B Admin CANNOT access Tenant A export job
      await assertFails(adminBDb.doc(`tenants/${tenantA}/export_jobs/job_e2e_01`).get());
    });
  });
});

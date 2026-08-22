import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  CANONICAL_MASTER_DATA,
  CANONICAL_CROSS_WALK_MAPPINGS,
  type TenantApplicabilityDecision,
  type TenantControlMapping,
  instantiateTenantGRC,
  buildControlCoverageSummary,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_harmonization_alpha';
const tenantB = 'tenant_harmonization_beta';

const userAdminA = 'usr_admin_harm_a';
const userComplianceA = 'usr_comp_harm_a';
const userAuditorA = 'usr_auditor_harm_a';
const userCompB = 'usr_comp_harm_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-control-harmonization-test',
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

    // Tenant A
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

    // Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${userCompB}`).set({
      userId: userCompB,
      tenantId: tenantB,
      role: 'compliance_manager',
      status: 'active',
    });
  });
});

describe('Control Harmonization & Coverage Tracking Engine Suite', () => {
  // 1. Merged Instance Creation
  describe('Merged Instance Creation', () => {
    test('merges equivalent cross-framework controls into a single harmonized tenant control instance', () => {
      const now = new Date().toISOString();

      // Tenant adopts GDPR (Art. 32 Encryption) and ISO 27001 (A.8.24 Key Management)
      const reqIds = ['gdpr_art_32', 'iso_annex_a824'];
      const targetReqs = CANONICAL_MASTER_DATA.requirements.filter((r) => reqIds.includes(r.id));
      expect(targetReqs.length).toBe(2);

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
        ruleEvaluationSummary: 'Adopted framework requirement',
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

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_CROSS_WALK_MAPPINGS,
      });

      // 2 requirement instances created
      expect(result.requirementInstances.length).toBe(2);

      // Exactly 1 harmonized control instance created for both requirements!
      expect(result.controlInstances.length).toBe(1);
      const mergedCtrl = result.controlInstances[0]!;

      expect(mergedCtrl.isHarmonized).toBe(true);
      expect(mergedCtrl.frameworkIds).toContain('gdpr');
      expect(mergedCtrl.frameworkIds).toContain('iso_27001');
      expect(mergedCtrl.requirementIds).toContain('gdpr_art_32');
      expect(mergedCtrl.requirementIds).toContain('iso_annex_a824');

      // Check tenant control mappings
      expect(result.controlMappings.length).toBe(2);
      const gdprMapping = result.controlMappings.find((m) => m.frameworkId === 'gdpr')!;
      const isoMapping = result.controlMappings.find((m) => m.frameworkId === 'iso_27001')!;

      expect(gdprMapping.controlId).toBe(mergedCtrl.id);
      expect(gdprMapping.requirementId).toBe('gdpr_art_32');
      expect(gdprMapping.coverageRatio).toBe(1.0);

      expect(isoMapping.controlId).toBe(mergedCtrl.id);
      expect(isoMapping.requirementId).toBe('iso_annex_a824');
      expect(isoMapping.coverageRatio).toBe(1.0);
    });
  });

  // 2. No Accidental Over-Merging Guardrails
  describe('No Accidental Over-Merging Guardrails', () => {
    test('strictly preserves separate control instances when mapping prohibits automatic merge (allowAutomaticMerge: false)', () => {
      const now = new Date().toISOString();

      // Tenant adopts EU AI Act (Art. 9 Risk Management) and ISO 27001 (Clause 4.3 Scope)
      // Canonical mapping map_cross_risk_management_ai_iso has allowAutomaticMerge: false
      const reqIds = ['aia_art_09', 'iso_clause_43'];
      const targetReqs = CANONICAL_MASTER_DATA.requirements.filter((r) => reqIds.includes(r.id));
      expect(targetReqs.length).toBe(2);

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
        ruleEvaluationSummary: 'Mandatory',
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

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_CROSS_WALK_MAPPINGS,
      });

      expect(result.requirementInstances.length).toBe(2);

      // Must NOT merge: 2 distinct control instances created because automatic merge is disabled for intersecting risk scope
      expect(result.controlInstances.length).toBe(2);
      const ctrlAIA = result.controlInstances.find((c) => c.frameworkIds.includes('eu_ai_act'))!;
      const ctrlISO = result.controlInstances.find((c) => c.frameworkIds.includes('iso_27001'))!;

      expect(ctrlAIA).toBeDefined();
      expect(ctrlISO).toBeDefined();
      expect(ctrlAIA.id).not.toBe(ctrlISO.id);
      expect(ctrlAIA.isHarmonized).toBe(false);
      expect(ctrlISO.isHarmonized).toBe(false);
    });

    test('does not merge unrelated controls across disparate regulatory domains', () => {
      const now = new Date().toISOString();

      // Tenant adopts GDPR (Art. 30 Records of Processing) and EU Data Act (Art. 3 Connected Device Data Sharing)
      const reqIds = ['gdpr_art_30', 'da_art_03'];
      const targetReqs = CANONICAL_MASTER_DATA.requirements.filter((r) => reqIds.includes(r.id));
      expect(targetReqs.length).toBe(2);

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
        ruleEvaluationSummary: 'Mandatory',
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

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_CROSS_WALK_MAPPINGS,
      });

      expect(result.controlInstances.length).toBe(2);
      const ropaCtrl = result.controlInstances.find((c) => c.domain === 'governance')!;
      const dataActCtrl = result.controlInstances.find((c) => c.domain === 'data_access')!;

      expect(ropaCtrl).toBeDefined();
      expect(dataActCtrl).toBeDefined();
      expect(ropaCtrl.id).not.toBe(dataActCtrl.id);
      expect(ropaCtrl.isHarmonized).toBe(false);
      expect(dataActCtrl.isHarmonized).toBe(false);
    });
  });

  // 3. Coverage Tracking & Explainable "One Control, Many Obligations"
  describe('Coverage Tracking & Explainable Representation', () => {
    test('builds explainable multi-framework coverage summary for auditors and compliance managers', () => {
      const now = new Date().toISOString();

      // Tenant adopts GDPR (Art. 33 Breach Notification) and ISO 27001 (A.5.24 Incident Management)
      const reqIds = ['gdpr_art_33', 'iso_annex_a524'];
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
        ruleEvaluationSummary: 'Mandatory',
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

      const result = instantiateTenantGRC({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        decisions,
        requirements: targetReqs,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        requirementControlMappings: CANONICAL_MASTER_DATA.requirementControlMappings,
        canonicalControlMappings: CANONICAL_CROSS_WALK_MAPPINGS,
      });

      expect(result.controlInstances.length).toBe(1);
      const harmonizedIncidentCtrl = result.controlInstances[0]!;

      const coverageReport = buildControlCoverageSummary(
        harmonizedIncidentCtrl,
        CANONICAL_MASTER_DATA.requirements,
        CANONICAL_CROSS_WALK_MAPPINGS,
        CANONICAL_MASTER_DATA.frameworks
      );

      expect(coverageReport.isHarmonized).toBe(true);
      expect(coverageReport.totalObligationsSatisfied).toBe(2);
      expect(coverageReport.frameworksCovered).toEqual(expect.arrayContaining(['gdpr', 'iso_27001']));
      expect(coverageReport.obligations.length).toBe(2);

      // Verify detailed auditor explanations
      const gdprObligation = coverageReport.obligations.find((o) => o.frameworkId === 'gdpr')!;
      expect(gdprObligation.sectionCode).toBe('Art. 33');
      expect(gdprObligation.mappingType).toBe('superset');
      expect(gdprObligation.auditExplanation).toContain('Coverage: 100%');

      const isoObligation = coverageReport.obligations.find((o) => o.frameworkId === 'iso_27001')!;
      expect(isoObligation.sectionCode).toBe('Annex A.5.24');
      expect(isoObligation.auditExplanation).toContain('Coverage: 100%');

      expect(coverageReport.coverageSummaryExplanation).toContain('simultaneously satisfies 2 statutory obligations');
    });
  });

  // 4. Tenant Control Mappings Security Rules Isolation
  describe('Tenant Control Mappings Security Rules Isolation', () => {
    test('compliance manager in Tenant A can create and update tenant control mappings', async () => {
      const compAContext = testEnv.authenticatedContext(userComplianceA, {
        tenantId: tenantA,
        role: 'compliance_manager',
      });

      const mappingRef = compAContext
        .firestore()
        .collection('tenants')
        .doc(tenantA)
        .collection('control_mappings')
        .doc('tcm_test_ctrl_gdpr_art32');

      const now = new Date().toISOString();
      const mappingData: TenantControlMapping = {
        id: 'tcm_test_ctrl_gdpr_art32',
        tenantId: tenantA,
        ownerId: userComplianceA,
        controlId: 'ctrl_sec_enc_01',
        frameworkId: 'gdpr',
        requirementId: 'gdpr_art_32',
        sectionCode: 'Art. 32',
        requirementTitle: 'Security of Processing',
        canonicalMappingId: 'map_cross_encryption_gdpr_iso',
        mappingType: 'equivalent',
        coverageRatio: 1.0,
        isDirectRequirement: true,
        status: 'active',
        mappingRationale: 'AES-256 production database encryption',
        compensatingControlsJustification: null,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      };

      await assertSucceeds(mappingRef.set(mappingData));

      // Update mapping
      await assertSucceeds(
        mappingRef.update({
          verifiedBy: userComplianceA,
          verifiedAt: now,
          updatedAt: now,
        })
      );
    });

    test('auditor in Tenant A can read but cannot create or mutate control mappings', async () => {
      const adminAContext = testEnv.authenticatedContext(userAdminA, {
        tenantId: tenantA,
        role: 'tenant_admin',
      });

      const mappingRefAdmin = adminAContext
        .firestore()
        .collection('tenants')
        .doc(tenantA)
        .collection('control_mappings')
        .doc('tcm_audit_read_test');

      const now = new Date().toISOString();
      await mappingRefAdmin.set({
        id: 'tcm_audit_read_test',
        tenantId: tenantA,
        ownerId: userAdminA,
        controlId: 'ctrl_01',
        frameworkId: 'gdpr',
        requirementId: 'gdpr_art_32',
        mappingType: 'equivalent',
        coverageRatio: 1.0,
        mappingRationale: 'Test',
        compensatingControlsJustification: null,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      const auditorAContext = testEnv.authenticatedContext(userAuditorA, {
        tenantId: tenantA,
        role: 'auditor',
      });

      const mappingRefAuditor = auditorAContext
        .firestore()
        .collection('tenants')
        .doc(tenantA)
        .collection('control_mappings')
        .doc('tcm_audit_read_test');

      // Auditor can read
      await assertSucceeds(mappingRefAuditor.get());

      // Auditor cannot mutate
      await assertFails(
        mappingRefAuditor.update({
          mappingRationale: 'Auditor unauthorized modification attempt',
        })
      );
    });

    test('Tenant A user cannot read or mutate control mappings in Tenant B partition', async () => {
      const compBContext = testEnv.authenticatedContext(userCompB, {
        tenantId: tenantB,
        role: 'compliance_manager',
      });

      const mappingRefB = compBContext
        .firestore()
        .collection('tenants')
        .doc(tenantB)
        .collection('control_mappings')
        .doc('tcm_tenant_b_secret_mapping');

      const now = new Date().toISOString();
      await mappingRefB.set({
        id: 'tcm_tenant_b_secret_mapping',
        tenantId: tenantB,
        ownerId: userCompB,
        controlId: 'ctrl_b_01',
        frameworkId: 'iso_27001',
        requirementId: 'iso_annex_a524',
        mappingType: 'equivalent',
        coverageRatio: 1.0,
        mappingRationale: 'Tenant B secret',
        compensatingControlsJustification: null,
        verifiedBy: null,
        verifiedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userCompB,
        updatedBy: userCompB,
      });

      const compAContext = testEnv.authenticatedContext(userComplianceA, {
        tenantId: tenantA,
        role: 'compliance_manager',
      });

      const maliciousRef = compAContext
        .firestore()
        .collection('tenants')
        .doc(tenantB)
        .collection('control_mappings')
        .doc('tcm_tenant_b_secret_mapping');

      // Cross-tenant read is blocked
      await assertFails(maliciousRef.get());

      // Cross-tenant write is blocked
      await assertFails(
        maliciousRef.update({
          mappingRationale: 'Tenant A unauthorized cross-tenant write',
        })
      );
    });
  });
});

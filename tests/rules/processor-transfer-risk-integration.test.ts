import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  ProcessorProfile,
  TransferArrangement,
  Evidence,
  Risk,
  evaluateProcessorRiskFlags,
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

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

    // 1. Tenants
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

    // 2. Memberships Tenant A
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
      userId: PERSONAS.securityA.uid,
      tenantId: tenantA,
      role: PERSONAS.securityA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Processor Profile Tenant A
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_analytics_corp`).set({
      id: 'prof_analytics_corp',
      tenantId: tenantA,
      vendorId: 'vnd_analytics_us',
      engagementName: 'Global User Behavior Analytics',
      processorRole: 'data_processor',
      serviceDescription: 'SaaS user telemetry and product analytics',
      dataCategories: ['ip_address', 'device_fingerprint', 'behavioral_logs'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['US'],
      linkedSystemAssetIds: ['asset_web_app'],
      criticality: 'high',
      ownerUserId: PERSONAS.complianceA.uid,
      reviewCadence: 'quarterly',
      lastReviewDate: '2025-10-01T00:00:00.000Z',
      nextReviewDate: '2026-01-01T00:00:00.000Z', // Overdue
      status: 'active',
      dpaSigned: true,
      dpaDate: '2025-10-01T00:00:00.000Z',
      linkedRiskIds: ['rsk_third_party_telemetry'],
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      ownerId: PERSONAS.complianceA.uid,
    });

    // 5. Seed Transfer Arrangement Tenant A
    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_analytics_us`).set({
      id: 'trans_analytics_us',
      processorProfileId: 'prof_analytics_corp',
      vendorId: 'vnd_analytics_us',
      tenantId: tenantA,
      name: 'US Telemetry Direct Streaming Transfer',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['analytics'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2025-10-01T00:00:00.000Z',
      reviewDueDate: '2026-04-01T00:00:00.000Z', // Overdue
      supplementaryMeasuresSummary: null,
      subprocessorInvolvement: true,
      subprocessorsInvolved: ['vnd_cdn_inc'],
      linkedTiaId: null, // Missing TIA
      linkedEvidenceIds: [], // Missing Evidence
      linkedRiskIds: ['rsk_third_party_telemetry'],
      rationale: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
    });

    // 6. Seed Risk Register Entry Tenant A
    await db.doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`).set({
      id: 'rsk_third_party_telemetry',
      tenantId: tenantA,
      code: 'RSK-PROC-0012',
      title: 'Telemetry Cross-Border Transfer Compliance Risk',
      description: 'US analytics transfer lacks executed SCC evidence and completed Schrems II TIA assessment.',
      category: 'third_party',
      status: 'identified',
      inherentLikelihood: 4,
      inherentImpact: 4,
      inherentScore: 16,
      residualLikelihood: 3,
      residualImpact: 4,
      residualScore: 12,
      treatmentStrategy: 'mitigate',
      treatmentPlan: 'Obtain countersigned SCC Module 2 and complete TIA assessment with transfer encryption safeguards.',
      mitigatingControlIds: [],
      affectedAssetIds: ['asset_web_app'],
      processorProfileIds: ['prof_analytics_corp'],
      transferArrangementIds: ['trans_analytics_us'],
      vendorIds: ['vnd_analytics_us'],
      derivedRuleCode: 'RESTRICTED_TRANSFER_MISSING_TIA',
      ownerId: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
    });
  });
});

describe('Processor & Transfer Records Risk Integration Suite', () => {
  const referenceDate = new Date('2026-08-15T00:00:00.000Z');

  // ---------------------------------------------------------------------------
  // 1. Risk Rules Evaluation & Triggering
  // ---------------------------------------------------------------------------
  describe('1. Risk Engine Evaluation & Triggering', () => {
    test('triggers flags for high criticality overdue review, missing TIA, missing SCC evidence, and overdue transfer review', () => {
      const profile: ProcessorProfile = {
        id: 'prof_analytics_corp',
        tenantId: tenantA,
        vendorId: 'vnd_analytics_us',
        engagementName: 'Global User Behavior Analytics',
        processorRole: 'data_processor',
        serviceDescription: 'Telemetry',
        dataCategories: ['ip_address'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['US'],
        linkedSystemAssetIds: ['asset_web_app'],
        criticality: 'high',
        ownerUserId: PERSONAS.complianceA.uid,
        reviewCadence: 'quarterly',
        lastReviewDate: '2025-10-01T00:00:00.000Z',
        nextReviewDate: '2026-01-01T00:00:00.000Z', // Overdue relative to referenceDate
        status: 'active',
        dpaSigned: true,
        dpaDate: '2025-10-01',
        linkedRiskIds: [],
        notes: null,
        createdAt: '2025-10-01T00:00:00.000Z',
        updatedAt: '2025-10-01T00:00:00.000Z',
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        ownerId: PERSONAS.complianceA.uid,
      };

      const transfer: TransferArrangement = {
        id: 'trans_analytics_us',
        processorProfileId: 'prof_analytics_corp',
        vendorId: 'vnd_analytics_us',
        tenantId: tenantA,
        name: 'US Telemetry Direct Streaming Transfer',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['analytics'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-10-01T00:00:00.000Z',
        reviewDueDate: '2026-04-01T00:00:00.000Z', // Overdue
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['vnd_cdn_inc'],
        linkedTiaId: null, // Triggers RESTRICTED_TRANSFER_MISSING_TIA
        linkedEvidenceIds: [], // Triggers SCC_NO_EVIDENCE_ATTACHED & SUBPROCESSORS_NO_SUPPORTING_DOCS
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.complianceA.uid,
        createdAt: '2025-10-01T00:00:00.000Z',
        updatedAt: '2025-10-01T00:00:00.000Z',
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
      };

      const evidenceDocs: Evidence[] = [];

      const result = evaluateProcessorRiskFlags(profile, [transfer], evidenceDocs, referenceDate);

      expect(result.overallRiskLevel).toBe('high');
      expect(result.totalDerivedFlagsCount).toBe(5);

      const ruleCodes = result.flags.map((f) => f.ruleCode);
      expect(ruleCodes).toContain('HIGH_CRITICALITY_REVIEW_OVERDUE');
      expect(ruleCodes).toContain('SCC_NO_EVIDENCE_ATTACHED');
      expect(ruleCodes).toContain('TRANSFER_MECHANISM_EXPIRED_OR_REVIEW_OVERDUE');
      expect(ruleCodes).toContain('RESTRICTED_TRANSFER_MISSING_TIA');
      expect(ruleCodes).toContain('SUBPROCESSORS_NO_SUPPORTING_DOCS');
    });

    test('triggers critical flag when restricted transfer has no mechanism selected or special category lacks DPA', () => {
      const specialCatProfile: ProcessorProfile = {
        id: 'prof_health_ai',
        tenantId: tenantA,
        vendorId: 'vnd_health_vendor',
        engagementName: 'Health Diagnostics Inference Engine',
        processorRole: 'data_processor',
        serviceDescription: 'Health AI',
        dataCategories: ['biometric_data', 'clinical_notes'],
        dataSubjects: ['patients'],
        isSpecialCategoryData: true,
        jurisdictions: ['US'],
        linkedSystemAssetIds: [],
        criticality: 'critical',
        ownerUserId: PERSONAS.complianceA.uid,
        reviewCadence: 'quarterly',
        lastReviewDate: null,
        nextReviewDate: null,
        status: 'active',
        dpaSigned: false, // Triggers SPECIAL_CATEGORY_MISSING_DPA
        dpaDate: null,
        linkedRiskIds: [],
        notes: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        ownerId: PERSONAS.complianceA.uid,
      };

      const unmanagedTransfer: TransferArrangement = {
        id: 'trans_unmanaged_us',
        processorProfileId: 'prof_health_ai',
        tenantId: tenantA,
        name: 'Direct Unmanaged Health Data Export',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'no_mechanism_selected', // Triggers RESTRICTED_TRANSFER_NO_MECHANISM
        transferMechanismStatus: 'restricted',
        effectiveDate: '2026-01-01T00:00:00.000Z',
        reviewDueDate: null,
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: false,
        linkedTiaId: null,
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.complianceA.uid,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
      };

      const result = evaluateProcessorRiskFlags(specialCatProfile, [unmanagedTransfer], [], referenceDate);

      expect(result.overallRiskLevel).toBe('critical');
      expect(result.criticalFlagsCount).toBe(2);
      const ruleCodes = result.flags.map((f) => f.ruleCode);
      expect(ruleCodes).toContain('SPECIAL_CATEGORY_MISSING_DPA');
      expect(ruleCodes).toContain('RESTRICTED_TRANSFER_NO_MECHANISM');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Risk Register Security Rules & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('2. Risk Security Rules & Cross-Tenant Isolation', () => {
    test('Compliance Manager must use the governed risk projection and server command', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      await assertFails(
        compDb.doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`).get()
      );

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const snap = await context
          .firestore()
          .doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`)
          .get();
        const data = snap.data() as Risk;
        expect(data.processorProfileIds).toContain('prof_analytics_corp');
        expect(data.transferArrangementIds).toContain('trans_analytics_us');
        expect(data.category).toBe('third_party');
      });

      // Update residual score following mitigation
      await assertFails(
        compDb.doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`).update({
          residualLikelihood: 2,
          residualScore: 8,
          status: 'mitigated',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.complianceA.uid,
        })
      );
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or alter Tenant A risk entries', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Read blocked
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`).get()
      );

      // Write blocked
      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/risks/rsk_third_party_telemetry`).update({
          treatmentStrategy: 'avoid',
        })
      );
    });
  });
});

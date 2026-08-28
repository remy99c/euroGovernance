import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  TransferArrangement,
  Evidence,
  evaluateTransferEvidenceCompleteness,
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
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
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_infra`).set({
      id: 'prof_cloud_infra',
      tenantId: tenantA,
      vendorId: 'vnd_hyperscaler',
      engagementName: 'Global Cloud Infrastructure',
      processorRole: 'data_processor',
      serviceDescription: 'Multi-region compute and object storage',
      dataCategories: ['user_content', 'access_logs'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'DE', 'IE'],
      linkedSystemAssetIds: ['asset_app_cluster'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2025-10-01T00:00:00.000Z',
      nextReviewDate: '2026-10-01T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2025-10-01T00:00:00.000Z',
      linkedRiskIds: [],
      notes: null,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 5. Seed Transfer Arrangement Tenant A
    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).set({
      id: 'trans_cloud_us_replication',
      processorProfileId: 'prof_cloud_infra',
      vendorId: 'vnd_hyperscaler',
      tenantId: tenantA,
      name: 'US Cross-Region Disaster Recovery Sync',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['hosting', 'backup'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2025-10-01T00:00:00.000Z',
      reviewDueDate: '2026-10-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Customer-managed KMS keys with AES-256 encryption at rest and in transit.',
      subprocessorInvolvement: true,
      subprocessorsInvolved: ['vnd_fiber_transit_corp'],
      linkedTiaId: null,
      linkedEvidenceIds: [],
      linkedRiskIds: [],
      rationale: 'Mandatory disaster recovery business continuity.',
      notes: null,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });
  });
});

describe('Processor Transfer Arrangements UI Data Contracts & Governance Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Traceability & Transfer UI Data Flow
  // ---------------------------------------------------------------------------
  describe('1. Transfer Arrangement Read & Update via Security Rules', () => {
    test('Privacy Officer can view transfers but direct updates require a server command', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const docSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).get()
      );
      expect(docSnap.exists).toBe(true);
      const data = docSnap.data() as TransferArrangement;
      expect(data.restrictedTransfer).toBe(true);
      expect(data.destinationCountries).toEqual(['US']);
      expect(data.transferMechanismType).toBe('standard_contractual_clauses');

      // Direct updates cannot bypass server validation and auditing.
      await assertFails(
        privDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).update({
          destinationCountries: ['US', 'GB', 'JP'],
          transferMechanismStatus: 'under_review',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );

      const updatedSnap = await privDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).get();
      const updatedData = updatedSnap.data() as TransferArrangement;
      expect(updatedData.destinationCountries).toEqual(['US']);
      expect(updatedData.transferMechanismStatus).toBe('active_valid');
    });

    test('Cross-tenant isolation: Tenant B Admin cannot view or modify Tenant A transfer arrangements', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_us_replication`).update({
          transferMechanismStatus: 'restricted',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Evidence Completeness & Governance Warnings Derivation for UI
  // ---------------------------------------------------------------------------
  describe('2. UI Evidence Completeness & Governance Warnings Derivation', () => {
    test('accurately surfaces missing evidence warnings for unbacked SCCs and subprocessors', () => {
      const transfer: TransferArrangement = {
        id: 'trans_cloud_us_replication',
        processorProfileId: 'prof_cloud_infra',
        vendorId: 'vnd_hyperscaler',
        tenantId: tenantA,
        name: 'US Cross-Region Disaster Recovery Sync',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting', 'backup'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-10-01T00:00:00.000Z',
        reviewDueDate: '2026-10-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'KMS AES-256',
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['vnd_fiber_transit_corp'],
        linkedTiaId: null,
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-10-01T00:00:00.000Z',
        updatedAt: '2025-10-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const emptyEvidences: Evidence[] = [];
      const completeness = evaluateTransferEvidenceCompleteness(transfer, emptyEvidences);

      expect(completeness.isComplete).toBe(false);
      expect(completeness.missingCount).toBe(2); // SCC contract + Subprocessor list

      const missingLabels = completeness.requirements
        .filter((r) => r.status === 'missing')
        .map((r) => r.label);

      expect(missingLabels).toContain('Executed Standard Contractual Clauses (SCCs)');
      expect(missingLabels).toContain('Approved Subprocessor Roster & Territory Map');
    });

    test('satisfies requirements once executed SCC evidence and subprocessor list are linked', () => {
      const transfer: TransferArrangement = {
        id: 'trans_cloud_us_replication',
        processorProfileId: 'prof_cloud_infra',
        vendorId: 'vnd_hyperscaler',
        tenantId: tenantA,
        name: 'US Cross-Region Disaster Recovery Sync',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-10-01T00:00:00.000Z',
        reviewDueDate: '2026-10-01T00:00:00.000Z',
        supplementaryMeasuresSummary: null,
        subprocessorInvolvement: true,
        subprocessorsInvolved: ['vnd_fiber_transit_corp'],
        linkedTiaId: 'tia_2025_cloud_01',
        linkedEvidenceIds: ['ev_scc_executed', 'ev_subprocessor_roster'],
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-10-01T00:00:00.000Z',
        updatedAt: '2025-10-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const validEvidences: Evidence[] = [
        {
          id: 'ev_scc_executed',
          tenantId: tenantA,
          title: 'EU SCC Module 2 Executed Contract 2025',
          description: 'Signed Standard Contractual Clauses',
          category: 'scc',
          status: 'valid',
          storagePath: 'tenants/tenantA/evidence/ev_scc.pdf',
          fileSizeBytes: 2048,
          mimeType: 'application/pdf',
          fileHashSha256: 'sha256scc',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          transferArrangementIds: ['trans_cloud_us_replication'],
          collectedAt: '2025-10-01T00:00:00.000Z',
          reviewDueDate: '2026-10-01T00:00:00.000Z',
          reviewedBy: PERSONAS.complianceA.uid,
          reviewedAt: '2025-10-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: PERSONAS.complianceA.uid,
          createdAt: '2025-10-01T00:00:00.000Z',
          updatedAt: '2025-10-01T00:00:00.000Z',
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
        },
        {
          id: 'ev_subprocessor_roster',
          tenantId: tenantA,
          title: 'Cloud Subprocessor Territory Schedule Q4 2025',
          description: 'Official subprocessor audit list',
          category: 'subprocessor_list',
          status: 'valid',
          storagePath: 'tenants/tenantA/evidence/ev_sub.pdf',
          fileSizeBytes: 1024,
          mimeType: 'application/pdf',
          fileHashSha256: 'sha256sub',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          transferArrangementIds: ['trans_cloud_us_replication'],
          collectedAt: '2025-10-01T00:00:00.000Z',
          reviewDueDate: '2026-10-01T00:00:00.000Z',
          reviewedBy: PERSONAS.complianceA.uid,
          reviewedAt: '2025-10-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: PERSONAS.complianceA.uid,
          createdAt: '2025-10-01T00:00:00.000Z',
          updatedAt: '2025-10-01T00:00:00.000Z',
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
        },
      ];

      const completeness = evaluateTransferEvidenceCompleteness(transfer, validEvidences);

      expect(completeness.isComplete).toBe(true);
      expect(completeness.missingCount).toBe(0);
      expect(completeness.satisfiedCount).toBe(2);
    });
  });
});

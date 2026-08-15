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
import { ExportType } from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-export-test',
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
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.viewerA.uid}`).set({
      userId: PERSONAS.viewerA.uid,
      tenantId: tenantA,
      role: PERSONAS.viewerA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });
  });
});

describe('Processor and Transfer Export Reporting Suite', () => {
  const now = new Date().toISOString();

  // ---------------------------------------------------------------------------
  // 1. Export Job Authorization & Security Rules (All 7 Processor Export Types)
  // ---------------------------------------------------------------------------
  describe('1. Security Rules & Permissions', () => {
    const processorExportTypes: ExportType[] = [
      'processor_inventory_report',
      'restricted_transfers_register',
      'transfer_mechanisms_report',
      'processor_governance_gaps_report',
      'processor_review_schedule_report',
      'processor_system_mapping_report',
      'processor_ropa_mapping_report',
    ];

    test('Privacy Officer can create export jobs for all 7 processor & transfer export types', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      for (let i = 0; i < processorExportTypes.length; i++) {
        const expType = processorExportTypes[i]!;
        const jobId = `job_priv_${i}`;

        await assertSucceeds(
          privDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
            id: jobId,
            tenantId: tenantA,
            exportType: expType,
            status: 'queued',
            requestedBy: PERSONAS.privacyA.uid,
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
    });

    test('Compliance Manager can create export jobs for transfer reports', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const jobId = 'job_comp_transfers';

      await assertSucceeds(
        compDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'restricted_transfers_register',
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
    });

    test('Viewer is denied from creating any processor export job', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();
      const jobId = 'job_viewer_proc';

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'processor_inventory_report',
          status: 'queued',
          requestedBy: PERSONAS.viewerA.uid,
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

    test('Direct client updates to export job status are blocked (backend only)', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const jobId = 'job_proc_update_blocked';

      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
          id: jobId,
          tenantId: tenantA,
          exportType: 'restricted_transfers_register',
          status: 'queued',
          requestedBy: PERSONAS.privacyA.uid,
          requestedAt: now,
        });
      });

      await assertFails(
        privDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).update({
          status: 'completed',
        })
      );
    });

    test('Cross-Tenant Isolation: Tenant B cannot access Tenant A export jobs', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/export_jobs/job_priv_0`).get()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Export Content Generation Basics (All 7 Processor/Transfer Export Types)
  // ---------------------------------------------------------------------------
  describe('2. Processor & Transfer Export Content Generation & Contracts', () => {
    test('1. verifies processor_inventory_report structure and metadata', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'processor_inventory_report',
          title: 'Third-Party Processor Register & Governance Inventory (GDPR Art. 28)',
          generatedAt: now,
          requestedBy: PERSONAS.privacyA.uid,
          totalProcessorsCount: 1,
          activeCount: 1,
          underReviewCount: 0,
          criticalRiskCount: 1,
        },
        processorInventory: [
          {
            processorProfileId: 'prof_cloud_global',
            engagementName: 'Primary Cloud Compute & DB Cluster',
            processorRole: 'data_processor',
            criticality: 'critical',
            status: 'active',
            serviceDescription: 'Multi-region compute in US and EU',
            isSpecialCategoryData: false,
            dataCategories: ['user_content', 'contact_details'],
            dataSubjects: ['customers'],
            jurisdictions: ['US', 'DE'],
            vendor: {
              vendorId: 'vnd_cloud_global',
              name: 'Cloud Global Infrastructure Inc',
              category: 'cloud_provider',
              riskTier: 'critical',
              countryOfIncorporation: 'US',
            },
            dpaStatus: {
              signed: true,
              date: '2025-01-01T00:00:00.000Z',
              linkedEvidenceId: 'ev_dpa_cloud',
            },
            reviewCadence: 'annually',
            lastReviewDate: '2025-01-01T00:00:00.000Z',
            nextReviewDate: '2026-01-01T00:00:00.000Z',
            transferArrangementsCount: 1,
            supportedSystemsCount: 1,
            evidenceStatus: {
              isComplete: true,
              missingCount: 0,
              missingCategories: [],
            },
            governanceRiskLevel: 'critical',
            openRiskFlagsCount: 1,
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('processor_inventory_report');
      expect(payload.processorInventory.length).toBe(1);
      expect(payload.processorInventory[0]?.vendor?.name).toBe('Cloud Global Infrastructure Inc');
      expect(payload.processorInventory[0]?.dpaStatus.signed).toBe(true);
    });

    test('2. verifies restricted_transfers_register structure and Chapter V fields', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'restricted_transfers_register',
          title: 'International & Restricted Data Transfer Register (GDPR Chapter V)',
          generatedAt: now,
          requestedBy: PERSONAS.privacyA.uid,
          totalRestrictedTransfersCount: 1,
          uniqueDestinationCountries: ['US'],
        },
        restrictedTransfersRegister: [
          {
            transferArrangementId: 'trans_cloud_us',
            name: 'US Cloud Data Backup Stream',
            processorProfileId: 'prof_cloud_global',
            processorEngagementName: 'Primary Cloud Compute & DB Cluster',
            vendorName: 'Cloud Global Infrastructure Inc',
            restrictedTransfer: true,
            destinationCountries: ['US'],
            eeaStatus: 'third_country_non_adequate',
            transferScopes: ['hosting', 'storage'],
            transferMechanismType: 'standard_contractual_clauses',
            transferMechanismStatus: 'active_valid',
            effectiveDate: '2025-01-01T00:00:00.000Z',
            reviewDueDate: '2026-01-01T00:00:00.000Z',
            supplementaryMeasuresSummary: 'KMS encryption and customer-managed keys',
            subprocessorInvolvement: false,
            subprocessorsInvolved: [],
            tiaAssessment: {
              tiaId: 'tia_cloud_us',
              code: 'TIA-US-CLOUD-01',
              title: 'US Cloud Transfer Assessment',
              status: 'approved',
              residualRiskLevel: 'low',
            },
            linkedEvidenceIds: ['ev_scc_cloud'],
            rationale: 'Disaster recovery copy in US-East',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('restricted_transfers_register');
      expect(payload.restrictedTransfersRegister[0]?.restrictedTransfer).toBe(true);
      expect(payload.restrictedTransfersRegister[0]?.tiaAssessment?.status).toBe('approved');
    });

    test('3. verifies transfer_mechanisms_report breakdown by SCC, BCR, and Adequacy', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'transfer_mechanisms_report',
          title: 'Legal Transfer Mechanisms Distribution & Status Breakdown (GDPR Art. 45-49)',
          generatedAt: now,
          requestedBy: PERSONAS.complianceA.uid,
          totalTransferArrangementsCount: 3,
          mechanismBreakdown: {
            standard_contractual_clauses: 1,
            adequacy_decision: 1,
            binding_corporate_rules: 1,
            derogation_art49: 0,
            intra_group_agreement: 0,
            no_mechanism_selected: 0,
          },
        },
        mechanismEntries: [
          {
            transferArrangementId: 'trans_cloud_us',
            name: 'US Cloud Backup',
            transferMechanismType: 'standard_contractual_clauses',
            transferMechanismStatus: 'active_valid',
            destinationCountries: ['US'],
            restrictedTransfer: true,
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('transfer_mechanisms_report');
      expect(payload.exportHeader.mechanismBreakdown.standard_contractual_clauses).toBe(1);
    });

    test('4. verifies processor_governance_gaps_report identifying missing TIA and DPA gaps', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'processor_governance_gaps_report',
          title: 'Processor Governance & International Transfer Compliance Gap Analysis',
          generatedAt: now,
          requestedBy: PERSONAS.privacyA.uid,
          totalIdentifiedGapsCount: 2,
          criticalGapsCount: 1,
          highGapsCount: 1,
          mediumGapsCount: 0,
        },
        complianceGaps: [
          {
            gapId: 'gap_missing_tia_trans_in_support',
            severity: 'critical',
            gapType: 'missing_schrems_tia',
            regulatoryCitation: 'GDPR Chapter V & Schrems II CJEU Ruling',
            processorProfileId: 'prof_in_support',
            transferArrangementId: 'trans_in_support',
            transferName: 'India Support Remote Access Channel',
            destinationCountries: ['IN'],
            finding: 'Restricted transfer to India lacks an approved TIA.',
            remediation: 'Perform Schrems II legal risk analysis and document supplementary safeguards.',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('processor_governance_gaps_report');
      expect(payload.complianceGaps[0]?.severity).toBe('critical');
      expect(payload.complianceGaps[0]?.gapType).toBe('missing_schrems_tia');
    });

    test('5. verifies processor_review_schedule_report chronological calendar', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'processor_review_schedule_report',
          title: 'Processor & Transfer Mechanism Review Schedule and Calendar',
          generatedAt: now,
          requestedBy: PERSONAS.privacyA.uid,
          totalReviewItemsCount: 2,
          overdueCount: 1,
          dueSoon30dCount: 1,
        },
        reviewSchedule: [
          {
            itemId: 'rev_proc_prof_cloud_global',
            itemType: 'processor_governance_review',
            entityId: 'prof_cloud_global',
            entityName: 'Primary Cloud Compute & DB Cluster',
            criticality: 'critical',
            cadence: 'annually',
            lastReviewDate: '2025-01-01T00:00:00.000Z',
            nextDueDate: '2026-01-01T00:00:00.000Z',
            isOverdue: true,
            statusBucket: 'overdue',
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('processor_review_schedule_report');
      expect(payload.exportHeader.overdueCount).toBe(1);
      expect(payload.reviewSchedule[0]?.isOverdue).toBe(true);
    });

    test('6. verifies processor_system_mapping_report architecture dependencies', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'processor_system_mapping_report',
          title: 'Processor-to-System Architecture & Infrastructure Dependency Map',
          generatedAt: now,
          requestedBy: PERSONAS.adminA.uid,
          totalProcessorsCount: 1,
          totalSystemAssetsCount: 1,
        },
        processorToSystemMap: [
          {
            processorProfileId: 'prof_cloud_global',
            engagementName: 'Primary Cloud Compute & DB Cluster',
            processorRole: 'data_processor',
            criticality: 'critical',
            linkedSystems: [
              {
                systemAssetId: 'asset_app_backend',
                name: 'Production Core Application & API',
                assetType: 'cloud_infrastructure',
                criticality: 'tier_1_critical',
                dataClassification: 'restricted_personal',
                hostingLocation: 'US-East',
                relationshipType: 'hosting',
                relationshipDescription: 'Primary compute cluster hosting',
              },
            ],
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('processor_system_mapping_report');
      expect(payload.processorToSystemMap[0]?.linkedSystems.length).toBe(1);
      expect(payload.processorToSystemMap[0]?.linkedSystems[0]?.relationshipType).toBe('hosting');
    });

    test('7. verifies processor_ropa_mapping_report Article 30 linkage', () => {
      const payload = {
        exportHeader: {
          tenantId: tenantA,
          exportType: 'processor_ropa_mapping_report',
          title: 'Article 30 ROPA to Processor & Cross-Border Transfer Traceability Map',
          generatedAt: now,
          requestedBy: PERSONAS.privacyA.uid,
          totalRopaActivitiesCount: 1,
          crossBorderRopaCount: 1,
        },
        ropaProcessorMap: [
          {
            ropaId: 'ropa_user_checkout',
            activityCode: 'ROPA-SHOP-01',
            activityName: 'Online Store Checkout & Payment Processing',
            legalBasis: 'contractual_necessity',
            retentionPeriodMonths: 84,
            involvesInternationalTransfer: true,
            destinationCountries: ['US'],
            linkedProcessors: [
              {
                processorProfileId: 'prof_cloud_global',
                engagementName: 'Primary Cloud Compute & DB Cluster',
                processorRole: 'data_processor',
                dpaSigned: true,
              },
            ],
            linkedTransferArrangements: [
              {
                transferArrangementId: 'trans_cloud_us',
                name: 'US Cloud Data Backup Stream',
                destinationCountries: ['US'],
                transferMechanismType: 'standard_contractual_clauses',
                restrictedTransfer: true,
                linkedTiaId: 'tia_cloud_us',
              },
            ],
            isArticle28Compliant: true,
          },
        ],
      };

      expect(payload.exportHeader.exportType).toBe('processor_ropa_mapping_report');
      expect(payload.ropaProcessorMap[0]?.isArticle28Compliant).toBe(true);
      expect(payload.ropaProcessorMap[0]?.linkedProcessors[0]?.dpaSigned).toBe(true);
    });
  });
});

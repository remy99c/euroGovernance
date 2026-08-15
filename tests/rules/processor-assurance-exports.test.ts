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
  ExportType,
  ProcessorProfile,
  ProcessorCertification,
  Vendor,
  SystemAsset,
  Evidence,
  synthesizeProcessorAssuranceInventory,
  generateProcessorAssuranceRegisterExportPayload,
  generateProcessorExpiringCertificationsExportPayload,
  generateProcessorExpiredInsufficientAssuranceExportPayload,
  generateProcessorByCertificationTypeMatrixExportPayload,
  generateProcessorAssuranceCoverageBySystemsExportPayload,
  generateCriticalProcessorsMissingAssuranceExportPayload,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assurance-exports-test',
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
      name: 'Nordic AI Health AB',
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

describe('Processor Assurance Export Reporting & Tenant Isolation Test Suite', () => {
  const now = new Date().toISOString();

  const assuranceExportTypes: ExportType[] = [
    'processor_assurance_register',
    'processor_expiring_certifications_report',
    'processor_expired_insufficient_assurance_report',
    'processor_by_certification_type_matrix',
    'processor_assurance_coverage_by_systems',
    'critical_processors_missing_assurance',
  ];

  // ---------------------------------------------------------------------------
  // 1. Authorization & Security Rules
  // ---------------------------------------------------------------------------
  describe('1. Export Job Authorization & Security Rules', () => {
    test('Compliance Manager can create jobs for all 6 processor assurance export types', async () => {
      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      for (let i = 0; i < assuranceExportTypes.length; i++) {
        const expType = assuranceExportTypes[i]!;
        const jobId = `job_comp_${i}`;

        await assertSucceeds(
          compDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
            id: jobId,
            tenantId: tenantA,
            exportType: expType,
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
      }
    });

    test('Tenant Admin can create jobs for all 6 processor assurance export types', async () => {
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();

      for (let i = 0; i < assuranceExportTypes.length; i++) {
        const expType = assuranceExportTypes[i]!;
        const jobId = `job_admin_${i}`;

        await assertSucceeds(
          adminDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
            id: jobId,
            tenantId: tenantA,
            exportType: expType,
            status: 'queued',
            requestedBy: PERSONAS.adminA.uid,
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

    test('Privacy Officer can create jobs for all 6 processor assurance export types', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      for (let i = 0; i < assuranceExportTypes.length; i++) {
        const expType = assuranceExportTypes[i]!;
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

    test('Unauthorized viewer cannot create processor assurance export jobs', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/export_jobs/job_viewer_fail`).set({
          id: 'job_viewer_fail',
          tenantId: tenantA,
          exportType: 'processor_assurance_register',
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

    test('Unauthenticated callers are strictly blocked from creating export jobs', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/export_jobs/job_unauth_fail`).set({
          id: 'job_unauth_fail',
          tenantId: tenantA,
          exportType: 'critical_processors_missing_assurance',
          status: 'queued',
          requestedBy: 'anon',
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
  });

  // ---------------------------------------------------------------------------
  // 2. Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('2. Multi-Tenant Isolation', () => {
    test('Tenant A user cannot read Tenant B export jobs', async () => {
      // Seed Tenant B export job
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantB}/export_jobs/job_b_isolated`).set({
          id: 'job_b_isolated',
          tenantId: tenantB,
          exportType: 'processor_assurance_register',
          status: 'completed',
          requestedBy: PERSONAS.adminB.uid,
          requestedAt: now,
        });
      });

      const userADb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      await assertFails(userADb.doc(`tenants/${tenantB}/export_jobs/job_b_isolated`).get());
    });

    test('Tenant A user cannot write to Tenant B export jobs', async () => {
      const userADb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();

      await assertFails(
        userADb.doc(`tenants/${tenantB}/export_jobs/job_cross_tenant`).set({
          id: 'job_cross_tenant',
          tenantId: tenantB,
          exportType: 'critical_processors_missing_assurance',
          status: 'queued',
          requestedBy: PERSONAS.adminA.uid,
          requestedAt: now,
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Export Content Generation Basics
  // ---------------------------------------------------------------------------
  describe('3. Export Content Generation Basics', () => {
    const asOfDate = new Date('2025-01-01T00:00:00.000Z');
    const generatedAt = asOfDate.toISOString();

    const mockProfiles = [
      {
        id: 'prof_aws',
        tenantId: tenantA,
        vendorId: 'vend_aws',
        engagementName: 'AWS Cloud Hosting',
        processorRole: 'data_processor',
        serviceDescription: 'Global Cloud Infrastructure',
        dataCategories: ['user_credentials', 'payment_records'],
        dataSubjects: ['customers'],
        jurisdictions: ['DE', 'IE', 'US'],
        linkedSystemAssetIds: ['asset_core_bank', 'asset_data_lake'],
        criticality: 'critical',
        ownerUserId: 'usr_sec_lead',
        reviewCadence: 'quarterly',
        status: 'active',
      },
      {
        id: 'prof_slack',
        tenantId: tenantA,
        vendorId: 'vend_salesforce',
        engagementName: 'Slack Enterprise Grid',
        processorRole: 'data_processor',
        serviceDescription: 'Team Messaging & Communication',
        dataCategories: ['chat_messages'],
        dataSubjects: ['employees'],
        jurisdictions: ['US', 'DE'],
        linkedSystemAssetIds: ['asset_crm_hub'],
        criticality: 'medium',
        ownerUserId: 'usr_dpo',
        reviewCadence: 'annually',
        status: 'active',
      },
      {
        id: 'prof_stripe',
        tenantId: tenantA,
        vendorId: 'vend_stripe',
        engagementName: 'Stripe Payments Gateway',
        processorRole: 'subprocessor',
        serviceDescription: 'Credit Card & SEPA Billing',
        dataCategories: ['payment_card_data', 'billing_address'],
        dataSubjects: ['customers'],
        jurisdictions: ['US', 'IE'],
        linkedSystemAssetIds: ['asset_core_bank'],
        criticality: 'critical',
        ownerUserId: 'usr_sec_lead',
        reviewCadence: 'semi_annually',
        status: 'active',
      },
      {
        id: 'prof_analytics',
        tenantId: tenantA,
        vendorId: 'vend_mixpanel',
        engagementName: 'Mixpanel Product Analytics',
        processorRole: 'subprocessor',
        serviceDescription: 'User behavioral tracking',
        dataCategories: ['usage_events'],
        dataSubjects: ['customers'],
        jurisdictions: ['US'],
        linkedSystemAssetIds: [],
        criticality: 'critical',
        ownerUserId: 'usr_dpo',
        reviewCadence: 'annually',
        status: 'active',
      },
    ] as unknown as ProcessorProfile[];

    const mockVendors = [
      {
        id: 'vend_aws',
        tenantId: tenantA,
        name: 'Amazon Web Services Inc.',
        category: 'cloud_provider',
        riskTier: 'critical',
      },
      {
        id: 'vend_salesforce',
        tenantId: tenantA,
        name: 'Salesforce EMEA Ltd (Slack)',
        category: 'saas_service',
        riskTier: 'medium',
      },
      {
        id: 'vend_stripe',
        tenantId: tenantA,
        name: 'Stripe Payments Europe Ltd',
        category: 'saas_service',
        riskTier: 'critical',
      },
      {
        id: 'vend_mixpanel',
        tenantId: tenantA,
        name: 'Mixpanel Inc.',
        category: 'saas_service',
        riskTier: 'medium',
      },
    ] as unknown as Vendor[];

    const mockAssets = [
      {
        id: 'asset_core_bank',
        tenantId: tenantA,
        name: 'Core Banking Engine',
        assetType: 'cloud_infrastructure',
        criticality: 'critical',
        dataClassification: 'restricted_personal',
        containsPersonalData: true,
        processorProfileIds: ['prof_aws', 'prof_stripe'],
      },
      {
        id: 'asset_data_lake',
        tenantId: tenantA,
        name: 'Enterprise Data Lake',
        assetType: 'database',
        criticality: 'critical',
        dataClassification: 'restricted_personal',
        containsPersonalData: true,
        processorProfileIds: ['prof_aws'],
      },
      {
        id: 'asset_crm_hub',
        tenantId: tenantA,
        name: 'Employee CRM Hub',
        assetType: 'internal_software',
        criticality: 'medium',
        dataClassification: 'internal',
        containsPersonalData: true,
        processorProfileIds: ['prof_slack'],
      },
      {
        id: 'asset_unmanaged',
        tenantId: tenantA,
        name: 'Internal Wiki',
        assetType: 'internal_software',
        criticality: 'low',
        dataClassification: 'public',
        containsPersonalData: false,
        processorProfileIds: [],
      },
    ] as unknown as SystemAsset[];

    const mockEvidence = [
      {
        id: 'ev_aws_iso_doc',
        tenantId: tenantA,
        title: 'AWS ISO 27001 Certificate 2024-2027.pdf',
        category: 'iso_certificate',
        status: 'valid',
        fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        processorCertificationIds: ['cert_aws_iso'],
      },
      {
        id: 'ev_stripe_pci_doc',
        tenantId: tenantA,
        title: 'Stripe PCI-DSS AoC 2024.pdf',
        category: 'audit_report',
        status: 'valid',
        fileHashSha256: 'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        processorCertificationIds: ['cert_stripe_pci'],
      },
    ] as unknown as Evidence[];

    const mockCerts = [
      // 1. AWS ISO 27001 (Active Valid, 2 years remaining)
      {
        id: 'cert_aws_iso',
        tenantId: tenantA,
        processorProfileId: 'prof_aws',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'EY CertifyPoint',
        leadAuditorName: 'Klaus Schmidt',
        certificateOrReportNumber: 'EY-2024-AWS-ISMS',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Global AWS Infrastructure & Data Center Regions',
        legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
        systemsOrServicesCovered: ['Core Banking Engine', 'Compute', 'Storage'],
        reviewOwnerUserId: 'usr_sec_lead',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-06-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_iso_doc'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        isInsufficient: false,
        ownerId: 'usr_sec_lead',
        createdBy: 'usr_sec_lead',
        updatedBy: 'usr_sec_lead',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      // 2. Stripe PCI-DSS (Expiring Soon: 2025-01-25 is 24 days away)
      {
        id: 'cert_stripe_pci',
        tenantId: tenantA,
        processorProfileId: 'prof_stripe',
        artifactKind: 'industry_label',
        standardFamily: 'pci_dss_aoc',
        issuingBodyOrAuditor: 'Coalfire Systems',
        certificateOrReportNumber: 'COALFIRE-STRIPE-2024',
        validFrom: '2024-01-25T00:00:00.000Z',
        validUntil: '2025-01-25T00:00:00.000Z', // 24 days from 2025-01-01
        status: 'active_valid',
        assuranceScopeSummary: 'Payment Card Processing Services',
        legalEntityOrRegionalScope: 'Stripe Europe',
        systemsOrServicesCovered: ['Core Banking Engine', 'Payment Gateway'],
        reviewOwnerUserId: 'usr_sec_lead',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-01-10T00:00:00.000Z',
        linkedEvidenceIds: ['ev_stripe_pci_doc'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        isInsufficient: false,
        ownerId: 'usr_sec_lead',
        createdBy: 'usr_sec_lead',
        updatedBy: 'usr_sec_lead',
        createdAt: '2024-01-25T00:00:00.000Z',
        updatedAt: '2024-01-25T00:00:00.000Z',
      },
      // 3. Slack ISO 27001 (Expired)
      {
        id: 'cert_slack_expired',
        tenantId: tenantA,
        processorProfileId: 'prof_slack',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'A-LIGN Compliance',
        certificateOrReportNumber: 'ALIGN-SLACK-2023',
        validFrom: '2021-01-01T00:00:00.000Z',
        validUntil: '2024-12-31T00:00:00.000Z', // Expired
        status: 'expired',
        assuranceScopeSummary: 'Slack Grid Services',
        legalEntityOrRegionalScope: 'Salesforce US',
        systemsOrServicesCovered: ['Employee CRM Hub'],
        reviewOwnerUserId: 'usr_dpo',
        reviewStatus: 'pending',
        reviewDueDate: '2024-11-01T00:00:00.000Z',
        linkedEvidenceIds: [],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        isInsufficient: false,
        ownerId: 'usr_dpo',
        createdBy: 'usr_dpo',
        updatedBy: 'usr_dpo',
        createdAt: '2021-01-01T00:00:00.000Z',
        updatedAt: '2024-12-31T00:00:00.000Z',
      },
    ] as unknown as ProcessorCertification[];

    test('1. generates Processor Assurance Register export with enriched details and evidence linkages', () => {
      const inventory = synthesizeProcessorAssuranceInventory(
        mockCerts,
        mockProfiles,
        mockVendors,
        mockAssets,
        mockEvidence,
        asOfDate
      );

      const payload = generateProcessorAssuranceRegisterExportPayload(inventory, {
        tenantId: tenantA,
        requestedBy: PERSONAS.adminA.uid,
        generatedAt,
      });

      expect(payload.exportHeader.exportType).toBe('processor_assurance_register');
      expect(payload.exportHeader.tenantId).toBe(tenantA);
      expect(payload.exportHeader.totalAssuranceRecords).toBe(3);
      expect(payload.exportHeader.activeValidCount).toBe(2);
      expect(payload.exportHeader.expiredCount).toBe(1);

      expect(payload.records).toHaveLength(3);
      const awsRecord = payload.records.find((r) => r.certificationId === 'cert_aws_iso')!;
      expect(awsRecord.processorName).toBe('AWS Cloud Hosting');
      expect(awsRecord.vendorName).toBe('Amazon Web Services Inc.');
      expect(awsRecord.standardDisplayName).toBe('ISO/IEC 27001:2022 (ISMS)');
      expect(awsRecord.hasAttachedEvidence).toBe(true);
      expect(awsRecord.attachedEvidenceCount).toBe(1);
      expect(awsRecord.linkedSystemAssetNames).toContain('Core Banking Engine');
    });

    test('2. generates Expiring Certifications report filtering items <= 60 days', () => {
      const inventory = synthesizeProcessorAssuranceInventory(
        mockCerts,
        mockProfiles,
        mockVendors,
        mockAssets,
        mockEvidence,
        asOfDate
      );

      const payload = generateProcessorExpiringCertificationsExportPayload(inventory, {
        tenantId: tenantA,
        requestedBy: PERSONAS.complianceA.uid,
        generatedAt,
        expiryWindowDays: 60,
      });

      expect(payload.exportHeader.exportType).toBe('processor_expiring_certifications_report');
      expect(payload.exportHeader.expiryWindowDays).toBe(60);
      expect(payload.exportHeader.expiringCertificationsCount).toBe(1);
      expect(payload.expiringCertifications).toHaveLength(1);

      const expItem = payload.expiringCertifications[0]!;
      expect(expItem.certificationId).toBe('cert_stripe_pci');
      expect(expItem.processorName).toBe('Stripe Payments Gateway');
      expect(expItem.daysUntilExpiry).toBe(24);
      expect(expItem.actionRequired).toContain('renewal review');
    });

    test('3. generates Expired / Insufficient Assurance report with failure rationales', () => {
      const inventory = synthesizeProcessorAssuranceInventory(
        mockCerts,
        mockProfiles,
        mockVendors,
        mockAssets,
        mockEvidence,
        asOfDate
      );

      const payload = generateProcessorExpiredInsufficientAssuranceExportPayload(inventory, {
        tenantId: tenantA,
        requestedBy: PERSONAS.adminA.uid,
        generatedAt,
      });

      expect(payload.exportHeader.exportType).toBe('processor_expired_insufficient_assurance_report');
      expect(payload.exportHeader.totalDeficienciesCount).toBe(1);
      expect(payload.exportHeader.expiredCount).toBe(1);

      const defItem = payload.deficiencies[0]!;
      expect(defItem.certificationId).toBe('cert_slack_expired');
      expect(defItem.processorName).toBe('Slack Enterprise Grid');
      expect(defItem.deficiencyType).toBe('expired');
      expect(defItem.reasonOrRationale).toContain('Certification lapsed');
    });

    test('4. generates Processor-by-Certification-Type matrix with standard coverage', () => {
      const payload = generateProcessorByCertificationTypeMatrixExportPayload(
        mockProfiles,
        mockCerts,
        mockVendors,
        {
          tenantId: tenantA,
          requestedBy: PERSONAS.adminA.uid,
          generatedAt,
        }
      );

      expect(payload.exportHeader.exportType).toBe('processor_by_certification_type_matrix');
      expect(payload.exportHeader.totalProcessors).toBe(4);
      expect(payload.matrix).toHaveLength(4);

      const awsRow = payload.matrix.find((m) => m.processorProfileId === 'prof_aws')!;
      expect(awsRow.coverageByStandard['iso_27001']?.covered).toBe(true);
      expect(awsRow.coverageByStandard['iso_27001']?.status).toBe('active_valid');
      expect(awsRow.coverageByStandard['pci_dss_aoc']?.covered).toBe(false);

      const stripeRow = payload.matrix.find((m) => m.processorProfileId === 'prof_stripe')!;
      expect(stripeRow.coverageByStandard['pci_dss_aoc']?.covered).toBe(true);

      const mixpanelRow = payload.matrix.find((m) => m.processorProfileId === 'prof_analytics')!;
      expect(mixpanelRow.totalActiveCertifications).toBe(0);
    });

    test('5. generates Assurance Coverage by Linked Systems/Services report', () => {
      const payload = generateProcessorAssuranceCoverageBySystemsExportPayload(
        mockAssets,
        mockProfiles,
        mockCerts,
        mockVendors,
        {
          tenantId: tenantA,
          requestedBy: PERSONAS.adminA.uid,
          generatedAt,
        }
      );

      expect(payload.exportHeader.exportType).toBe('processor_assurance_coverage_by_systems');
      expect(payload.exportHeader.totalSystemsEvaluated).toBe(4);
      expect(payload.systemCoverage).toHaveLength(4);

      // Core Banking Engine: connected to AWS (valid) and Stripe (expiring soon) -> overall status: warning
      const bankSys = payload.systemCoverage.find((s) => s.systemAssetId === 'asset_core_bank')!;
      expect(bankSys.linkedProcessorsCount).toBe(2);
      expect(bankSys.overallSystemAssuranceStatus).toBe('warning');

      // CRM Hub: connected to Slack (expired) -> critical_gap
      const crmSys = payload.systemCoverage.find((s) => s.systemAssetId === 'asset_crm_hub')!;
      expect(crmSys.overallSystemAssuranceStatus).toBe('critical_gap');

      // Unmanaged: 0 processors -> no_processors
      const wikiSys = payload.systemCoverage.find((s) => s.systemAssetId === 'asset_unmanaged')!;
      expect(wikiSys.overallSystemAssuranceStatus).toBe('no_processors');
    });

    test('6. generates Critical Processors Missing Current Assurance report', () => {
      const payload = generateCriticalProcessorsMissingAssuranceExportPayload(
        mockProfiles,
        mockCerts,
        mockVendors,
        mockEvidence,
        {
          tenantId: tenantA,
          requestedBy: PERSONAS.adminA.uid,
          generatedAt,
        }
      );

      expect(payload.exportHeader.exportType).toBe('critical_processors_missing_assurance');
      expect(payload.exportHeader.totalCriticalProcessorsCount).toBe(3); // AWS, Stripe, Mixpanel

      // Mixpanel has 0 certifications registered -> at risk
      expect(payload.exportHeader.criticalProcessorsAtRiskCount).toBe(1);
      expect(payload.criticalProcessorsAtRisk).toHaveLength(1);

      const atRiskMixpanel = payload.criticalProcessorsAtRisk[0]!;
      expect(atRiskMixpanel.processorProfileId).toBe('prof_analytics');
      expect(atRiskMixpanel.processorName).toBe('Mixpanel Product Analytics');
      expect(atRiskMixpanel.riskCategory).toBe('no_certifications');
      expect(atRiskMixpanel.urgentRemediationAction).toContain('ISO 27001/27701 certificate or SOC 2');
    });
  });
});

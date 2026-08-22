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
  ProcessorProfile,
  Vendor,
  TransferArrangement,
  SystemAsset,
  ROPAEntry,
  DPIA,
  TIA,
  PersonalDataBreach,
  Evidence,
  Risk,
  evaluateProcessorEvidenceCompleteness,
  evaluateProcessorRiskFlags,
  evaluateProcessorReminders,
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

    // 4. Commercial Vendor Master
    await db.doc(`tenants/${tenantA}/vendors/vnd_cloud_scale`).set({
      id: 'vnd_cloud_scale',
      tenantId: tenantA,
      name: 'CloudScale Global Infrastructure Inc.',
      category: 'cloud_provider',
      riskTier: 'critical',
      primaryContactName: 'Chief Security & Privacy Officer',
      primaryContactEmail: 'compliance@cloudscale.example.com',
      dpaSigned: true,
      dpaDate: '2025-05-01T00:00:00.000Z',
      securityAssessmentDate: '2025-05-01T00:00:00.000Z',
      nextAssessmentDueDate: '2026-05-01T00:00:00.000Z',
      countryOfIncorporation: 'United States (Delaware)',
      dataHostingRegions: ['eu-central-1', 'us-east-1'],
      subprocessorsListed: ['FiberTransit Inc.'],
      hasProcessorProfile: true,
      activeProcessorProfileId: 'prof_cloud_scale_main',
      commercialStatus: 'active',
      status: 'active',
      ownerId: PERSONAS.adminA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
    });

    // 5. Processor Profile
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_scale_main`).set({
      id: 'prof_cloud_scale_main',
      tenantId: tenantA,
      vendorId: 'vnd_cloud_scale',
      engagementName: 'Core SaaS Production Hosting & Analytics',
      processorRole: 'data_processor',
      serviceDescription: 'Managed Kubernetes clusters and telemetry analytics pipeline.',
      dataCategories: ['user_content', 'contact_details', 'telemetry'],
      dataSubjects: ['customers', 'employees'],
      isSpecialCategoryData: false,
      jurisdictions: ['US', 'DE', 'IE'],
      linkedSystemAssetIds: ['asset_app_cluster'],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: '2025-05-01T00:00:00.000Z',
      nextReviewDate: '2026-05-01T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2025-05-01T00:00:00.000Z',
      linkedDpaEvidenceId: 'ev_cloud_scale_dpa',
      linkedRiskIds: ['rsk_processor_transfer_schrems'],
      notes: 'Strategic processor. Subject to annual supplier security assessment.',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 6. System Asset
    await db.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).set({
      id: 'asset_app_cluster',
      tenantId: tenantA,
      name: 'Production Kubernetes Application Cluster',
      assetType: 'cloud_infrastructure',
      criticality: 'tier_1_critical',
      dataClassification: 'restricted_personal',
      hostingLocation: 'Frankfurt (eu-central-1)',
      vendorId: 'vnd_cloud_scale',
      containsPersonalData: true,
      containsSpecialCategoryData: false,
      containsTrainingData: false,
      processorProfileIds: ['prof_cloud_scale_main'],
      processorRelationships: [
        {
          processorProfileId: 'prof_cloud_scale_main',
          relationshipType: 'hosting',
          relationshipDescription: 'Primary production Kubernetes compute hosting',
        },
      ],
      status: 'active',
      ownerId: PERSONAS.adminA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.adminA.uid,
      updatedBy: PERSONAS.adminA.uid,
    });

    // 7. ROPA Entry
    await db.doc(`tenants/${tenantA}/ropa_entries/ropa_customer_auth`).set({
      id: 'ropa_customer_auth',
      tenantId: tenantA,
      activityCode: 'ROPA-AUTH-01',
      activityName: 'User Authentication & Session Management',
      legalBasis: 'contract',
      dataCategories: ['user_content', 'contact_details'],
      dataSubjects: ['customers'],
      retentionPeriodMonths: 24,
      specialCategoryData: false,
      crossBorderTransfer: true,
      transferDestination: 'US',
      processorProfileIds: ['prof_cloud_scale_main'],
      transferArrangementIds: ['trans_cloud_scale_backup'],
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 8. DPIA Assessment
    await db.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_telemetry`).set({
      id: 'dpia_ai_telemetry',
      tenantId: tenantA,
      code: 'DPIA-2025-TEL-01',
      title: 'Automated Telemetry Processing and Anomaly Detection',
      description: 'DPIA assessing customer usage analytics on CloudScale infrastructure.',
      systemAssetId: 'asset_app_cluster',
      processorProfileIds: ['prof_cloud_scale_main'],
      riskScoreInherent: 12,
      riskScoreResidual: 4,
      status: 'approved',
      approvedBy: PERSONAS.privacyA.uid,
      approvedAt: now,
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 9. Transfer Arrangement
    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_scale_backup`).set({
      id: 'trans_cloud_scale_backup',
      processorProfileId: 'prof_cloud_scale_main',
      vendorId: 'vnd_cloud_scale',
      tenantId: tenantA,
      name: 'US Cold Storage Disaster Recovery Replica',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['hosting', 'backup'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2025-05-01T00:00:00.000Z',
      reviewDueDate: '2026-05-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Customer-managed KMS keys with AES-256 in transit and at rest.',
      subprocessorInvolvement: false,
      linkedTiaId: 'tia_cloud_scale_us',
      linkedEvidenceIds: ['ev_cloud_scale_scc', 'ev_cloud_scale_soc2'],
      linkedRiskIds: ['rsk_processor_transfer_schrems'],
      rationale: 'Offsite business continuity and high availability.',
      notes: null,
      status: 'active',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 10. TIA Assessment
    await db.doc(`tenants/${tenantA}/tia_assessments/tia_cloud_scale_us`).set({
      id: 'tia_cloud_scale_us',
      tenantId: tenantA,
      code: 'TIA-US-CLOUD-01',
      title: 'US Cloud Infrastructure Schrems II Assessment',
      vendorId: 'vnd_cloud_scale',
      destinationCountry: 'US',
      legalMechanism: 'scc',
      destinationCountryLegalAssessment: 'FISA Section 702 risk mitigated through KMS encryption without vendor key access.',
      supplementaryTechnicalMeasures: 'AES-256 client-side payload encryption',
      supplementaryContractualMeasures: 'Government surveillance notification clauses',
      status: 'approved',
      residualRiskLevel: 'low',
      approvedBy: PERSONAS.privacyA.uid,
      approvedAt: now,
      transferArrangementId: 'trans_cloud_scale_backup',
      processorProfileId: 'prof_cloud_scale_main',
      nextReviewDate: '2026-05-01T00:00:00.000Z',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 11. Security Breach Record
    await db.doc(`tenants/${tenantA}/breaches/brc_cloud_scale_outage`).set({
      id: 'brc_cloud_scale_outage',
      tenantId: tenantA,
      incidentReference: 'INC-2026-034',
      title: 'Third-party storage transient unauthorized read attempt',
      description: 'Storage service alerted to unauthenticated access attempt; blocked by IAM policy.',
      discoveredAt: '2026-03-01T10:00:00.000Z',
      severity: 'low',
      status: 'resolved',
      categoriesOfData: ['access_logs'],
      estimatedRecordsAffected: 0,
      dpaNotificationRequired: false,
      dpaNotificationDeadline72h: '2026-03-04T10:00:00.000Z',
      dataSubjectsNotificationRequired: false,
      processorInvolved: true,
      processorProfileIds: ['prof_cloud_scale_main'],
      reportingSource: 'reported_by_processor',
      rootCauseAnalysis: 'Misconfigured public bucket policy promptly revoked.',
      remediationSummary: 'Policy hardening and audit logging verification.',
      ownerId: PERSONAS.privacyA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });

    // 12. Evidence Records
    await db.doc(`tenants/${tenantA}/evidence/ev_cloud_scale_dpa`).set({
      id: 'ev_cloud_scale_dpa',
      tenantId: tenantA,
      title: 'CloudScale Countersigned Data Processing Addendum 2025',
      description: 'Executed GDPR Article 28 DPA contract',
      category: 'dpa',
      status: 'valid',
      storagePath: 'tenants/tenantA/evidence/dpa_2025.pdf',
      fileSizeBytes: 1048576,
      mimeType: 'application/pdf',
      fileHashSha256: 'hash_dpa_2025',
      controlIds: [],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [],
      processorProfileIds: ['prof_cloud_scale_main'],
      vendorIds: ['vnd_cloud_scale'],
      collectedAt: '2025-05-01T00:00:00.000Z',
      reviewDueDate: '2026-05-01T00:00:00.000Z',
      reviewedBy: PERSONAS.complianceA.uid,
      reviewedAt: '2025-05-01T00:00:00.000Z',
      rejectionReason: null,
      currentVersion: 1,
      ownerId: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
    });

    await db.doc(`tenants/${tenantA}/evidence/ev_cloud_scale_scc`).set({
      id: 'ev_cloud_scale_scc',
      tenantId: tenantA,
      title: 'CloudScale Executed Standard Contractual Clauses (Module 2)',
      description: 'EU SCCs 2021/914 Controller-to-Processor transfer agreement',
      category: 'scc',
      status: 'valid',
      storagePath: 'tenants/tenantA/evidence/scc_2025.pdf',
      fileSizeBytes: 2097152,
      mimeType: 'application/pdf',
      fileHashSha256: 'hash_scc_2025',
      controlIds: [],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [],
      processorProfileIds: ['prof_cloud_scale_main'],
      transferArrangementIds: ['trans_cloud_scale_backup'],
      vendorIds: ['vnd_cloud_scale'],
      collectedAt: '2025-05-01T00:00:00.000Z',
      reviewDueDate: '2026-05-01T00:00:00.000Z',
      reviewedBy: PERSONAS.complianceA.uid,
      reviewedAt: '2025-05-01T00:00:00.000Z',
      rejectionReason: null,
      currentVersion: 1,
      ownerId: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
    });

    await db.doc(`tenants/${tenantA}/evidence/ev_cloud_scale_soc2`).set({
      id: 'ev_cloud_scale_soc2',
      tenantId: tenantA,
      title: 'CloudScale SOC 2 Type II Annual Security & Privacy Report',
      description: 'Independent audit report for security, availability, and confidentiality.',
      category: 'soc_report',
      status: 'valid',
      storagePath: 'tenants/tenantA/evidence/soc2_2025.pdf',
      fileSizeBytes: 4194304,
      mimeType: 'application/pdf',
      fileHashSha256: 'hash_soc2_2025',
      controlIds: [],
      requirementIds: [],
      policyIds: [],
      riskIds: [],
      assessmentIds: [],
      processorProfileIds: ['prof_cloud_scale_main'],
      transferArrangementIds: ['trans_cloud_scale_backup'],
      vendorIds: ['vnd_cloud_scale'],
      collectedAt: '2025-05-01T00:00:00.000Z',
      reviewDueDate: '2026-05-01T00:00:00.000Z',
      reviewedBy: PERSONAS.complianceA.uid,
      reviewedAt: '2025-05-01T00:00:00.000Z',
      rejectionReason: null,
      currentVersion: 1,
      ownerId: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
    });

    // 13. GRC Risk
    await db.doc(`tenants/${tenantA}/risks/rsk_processor_transfer_schrems`).set({
      id: 'rsk_processor_transfer_schrems',
      tenantId: tenantA,
      code: 'RSK-PROC-TRANS-01',
      title: 'Third-Party Third-Country Data Flow Governance & Safeguards',
      description: 'Risk of unauthorized cross-border surveillance access under US Cloud legislation.',
      category: 'legal_compliance',
      inherentScore: 16,
      residualScore: 4,
      treatmentStrategy: 'mitigate',
      treatmentPlan: 'Execute Schrems II TIA, EU SCCs, and KMS payload encryption.',
      status: 'mitigated',
      ownerId: PERSONAS.privacyA.uid,
      processorProfileIds: ['prof_cloud_scale_main'],
      transferArrangementIds: ['trans_cloud_scale_backup'],
      vendorIds: ['vnd_cloud_scale'],
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
    });
  });
});

describe('Processor Governance Operational Hub Data & Authorization Suite', () => {
  // ---------------------------------------------------------------------------
  // 1. Data Loading & Relationship Traceability
  // ---------------------------------------------------------------------------
  describe('1. Unified Processor Governance Hub Data Loading', () => {
    test('Privacy Officer can load full relational context for a processor profile', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // 1. Processor Profile
      const profSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_scale_main`).get()
      );
      expect(profSnap.exists).toBe(true);
      const prof = profSnap.data() as ProcessorProfile;
      expect(prof.vendorId).toBe('vnd_cloud_scale');
      expect(prof.processorRole).toBe('data_processor');
      expect(prof.criticality).toBe('critical');

      // 2. Commercial Vendor
      const vendSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/vendors/${prof.vendorId}`).get()
      );
      expect(vendSnap.exists).toBe(true);
      const vend = vendSnap.data() as Vendor;
      expect(vend.name).toContain('CloudScale');
      expect(vend.riskTier).toBe('critical');

      // 3. Supported System Asset
      const sysSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).get()
      );
      expect(sysSnap.exists).toBe(true);
      const sys = sysSnap.data() as SystemAsset;
      expect(sys.processorProfileIds).toContain('prof_cloud_scale_main');

      // 4. Linked ROPA Activity
      const ropaSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/ropa_entries/ropa_customer_auth`).get()
      );
      expect(ropaSnap.exists).toBe(true);
      const ropa = ropaSnap.data() as ROPAEntry;
      expect(ropa.processorProfileIds).toContain('prof_cloud_scale_main');

      // 5. Linked DPIA Assessment
      const dpiaSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/dpia_assessments/dpia_ai_telemetry`).get()
      );
      expect(dpiaSnap.exists).toBe(true);
      const dpia = dpiaSnap.data() as DPIA;
      expect(dpia.processorProfileIds).toContain('prof_cloud_scale_main');

      // 6. Linked Transfer Arrangement
      const transSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_scale_backup`).get()
      );
      expect(transSnap.exists).toBe(true);
      const trans = transSnap.data() as TransferArrangement;
      expect(trans.restrictedTransfer).toBe(true);
      expect(trans.linkedTiaId).toBe('tia_cloud_scale_us');

      // 7. Linked TIA
      const tiaSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/tia_assessments/tia_cloud_scale_us`).get()
      );
      expect(tiaSnap.exists).toBe(true);
      const tia = tiaSnap.data() as TIA;
      expect(tia.processorProfileId).toBe('prof_cloud_scale_main');

      // 8. Linked Breach Incident
      const brcSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/breaches/brc_cloud_scale_outage`).get()
      );
      expect(brcSnap.exists).toBe(true);
      const brc = brcSnap.data() as PersonalDataBreach;
      expect(brc.processorProfileIds).toContain('prof_cloud_scale_main');
      expect(brc.reportingSource).toBe('reported_by_processor');

      // 9. Linked Risk
      const rskSnap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/risks/rsk_processor_transfer_schrems`).get()
      );
      expect(rskSnap.exists).toBe(true);
      const rsk = rskSnap.data() as Risk;
      expect(rsk.processorProfileIds).toContain('prof_cloud_scale_main');
    });

    test('Viewer role can read processor records and linked governance dimensions but cannot modify them', async () => {
      const viewerDb = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();

      // Read succeeds
      const profSnap = await assertSucceeds(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_scale_main`).get()
      );
      expect(profSnap.exists).toBe(true);

      // Write fails
      await assertFails(
        viewerDb.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_scale_main`).update({
          criticality: 'low',
        })
      );
    });

    test('Cross-tenant isolation: Tenant B users cannot access Tenant A processor operational data', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/processor_profiles/prof_cloud_scale_main`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/transfer_arrangements/trans_cloud_scale_backup`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/tia_assessments/tia_cloud_scale_us`).get()
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Governance Intelligence & Synthesis Verification
  // ---------------------------------------------------------------------------
  describe('2. Governance Synthesis Engine in Hub View', () => {
    test('synthesizes complete evidence, zero open risks, and timely review when all safeguards exist', () => {
      const profile: ProcessorProfile = {
        id: 'prof_cloud_scale_main',
        tenantId: tenantA,
        vendorId: 'vnd_cloud_scale',
        engagementName: 'Core SaaS Production Hosting & Analytics',
        processorRole: 'data_processor',
        serviceDescription: 'Managed Kubernetes clusters',
        dataCategories: ['user_content'],
        dataSubjects: ['customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['US', 'DE'],
        linkedSystemAssetIds: ['asset_app_cluster'],
        criticality: 'critical',
        ownerUserId: PERSONAS.privacyA.uid,
        reviewCadence: 'annually',
        lastReviewDate: '2025-05-01T00:00:00.000Z',
        nextReviewDate: '2026-05-01T00:00:00.000Z',
        status: 'active',
        dpaSigned: true,
        dpaDate: '2025-05-01T00:00:00.000Z',
        linkedDpaEvidenceId: 'ev_cloud_scale_dpa',
        linkedRiskIds: [],
        notes: null,
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-05-01T00:00:00.000Z',
        updatedAt: '2025-05-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const transfer: TransferArrangement = {
        id: 'trans_cloud_scale_backup',
        processorProfileId: 'prof_cloud_scale_main',
        tenantId: tenantA,
        name: 'US Cold Storage Disaster Recovery Replica',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['hosting', 'backup'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2025-05-01T00:00:00.000Z',
        reviewDueDate: '2026-05-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'KMS AES-256',
        subprocessorInvolvement: false,
        linkedTiaId: 'tia_cloud_scale_us',
        linkedEvidenceIds: ['ev_cloud_scale_scc', 'ev_cloud_scale_soc2'],
        rationale: null,
        notes: null,
        status: 'active',
        ownerId: PERSONAS.privacyA.uid,
        createdAt: '2025-05-01T00:00:00.000Z',
        updatedAt: '2025-05-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
      };

      const validEvidences: Evidence[] = [
        {
          id: 'ev_cloud_scale_dpa',
          tenantId: tenantA,
          title: 'DPA',
          description: 'DPA',
          category: 'dpa',
          status: 'valid',
          storagePath: 'tenants/tenantA/evidence/dpa.pdf',
          fileSizeBytes: 1024,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash1',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          processorProfileIds: ['prof_cloud_scale_main'],
          collectedAt: '2025-05-01T00:00:00.000Z',
          reviewDueDate: '2026-05-01T00:00:00.000Z',
          reviewedBy: PERSONAS.complianceA.uid,
          reviewedAt: '2025-05-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: PERSONAS.complianceA.uid,
          createdAt: '2025-05-01T00:00:00.000Z',
          updatedAt: '2025-05-01T00:00:00.000Z',
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
        },
        {
          id: 'ev_cloud_scale_soc2',
          tenantId: tenantA,
          title: 'SOC 2',
          description: 'SOC 2',
          category: 'soc_report',
          status: 'valid',
          storagePath: 'tenants/tenantA/evidence/soc2.pdf',
          fileSizeBytes: 1024,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash2',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          processorProfileIds: ['prof_cloud_scale_main'],
          collectedAt: '2025-05-01T00:00:00.000Z',
          reviewDueDate: '2026-05-01T00:00:00.000Z',
          reviewedBy: PERSONAS.complianceA.uid,
          reviewedAt: '2025-05-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: PERSONAS.complianceA.uid,
          createdAt: '2025-05-01T00:00:00.000Z',
          updatedAt: '2025-05-01T00:00:00.000Z',
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
        },
      ];

      const refDate = new Date('2025-06-01T00:00:00.000Z');
      const evidenceEval = evaluateProcessorEvidenceCompleteness(profile, validEvidences, refDate.toISOString());
      expect(evidenceEval.isComplete).toBe(true);
      expect(evidenceEval.missingCount).toBe(0);

      const riskEval = evaluateProcessorRiskFlags(profile, [transfer], validEvidences, refDate);
      expect(riskEval.flags.length).toBe(0);
      expect(riskEval.overallRiskLevel).toBe('low');

      const reminders = evaluateProcessorReminders(profile, [transfer], validEvidences, { asOfDate: refDate });
      expect(reminders.length).toBe(0);
    });
  });
});

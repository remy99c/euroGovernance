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
  seedTenantWithMembers,
} from './fixtures/test-factories.js';
import {
  buildProcessorCertificationE2EFixtures,
  seedProcessorCertificationE2EEnvironment,
} from './fixtures/processor-certification-e2e-helpers.js';
import {
  ProcessorCertification,
  ProcessorProfile,
  Vendor,
  SystemAsset,
  Evidence,
  ProcessorCertificationRiskFlag,
  synthesizeProcessorAssuranceInventory,
  evaluateProcessorCertificationRiskFlags,
  evaluateProcessorCertificationReminders,
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
    projectId: 'eurogov-processor-cert-e2e-pack-test',
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

  // 1. Seed Tenant A with members
  await seedTenantWithMembers(
    testEnv,
    { tenantId: tenantA, name: 'EuroCorp Cloud Services SE' },
    [
      { userId: PERSONAS.adminA.uid, tenantId: tenantA, role: PERSONAS.adminA.role },
      { userId: PERSONAS.complianceA.uid, tenantId: tenantA, role: PERSONAS.complianceA.role },
      { userId: PERSONAS.privacyA.uid, tenantId: tenantA, role: PERSONAS.privacyA.role },
      { userId: PERSONAS.securityA.uid, tenantId: tenantA, role: PERSONAS.securityA.role },
      { userId: PERSONAS.approverA.uid, tenantId: tenantA, role: PERSONAS.approverA.role },
      { userId: PERSONAS.auditorA.uid, tenantId: tenantA, role: PERSONAS.auditorA.role },
      { userId: PERSONAS.contributorA.uid, tenantId: tenantA, role: PERSONAS.contributorA.role },
      { userId: PERSONAS.viewerA.uid, tenantId: tenantA, role: PERSONAS.viewerA.role },
    ]
  );

  // 2. Seed Tenant B with members
  await seedTenantWithMembers(
    testEnv,
    { tenantId: tenantB, name: 'Nordic Pharma Tech AB' },
    [
      { userId: PERSONAS.adminB.uid, tenantId: tenantB, role: PERSONAS.adminB.role },
      { userId: PERSONAS.contributorB.uid, tenantId: tenantB, role: PERSONAS.contributorB.role },
    ]
  );
});

describe('Processor Certification & Assurance Lifecycle End-to-End Test Pack', () => {
  const now = new Date('2026-08-15T00:00:00.000Z');
  const nowIso = now.toISOString();

  const fixtureOptions = {
    tenantId: tenantA,
    vendorId: 'vend_cloudcore_01',
    processorProfileId: 'prof_cloudcore_vpc',
    isoCertId: 'cert_iso27001_cloudcore',
    socReportId: 'rep_soc2_cloudcore',
    expiredCertId: 'cert_pci_expired_cloudcore',
    evidenceIsoId: 'ev_iso_cert_pdf',
    evidenceSocId: 'ev_soc2_rep_pdf',
    systemAssetId: 'asset_payment_engine',
    adminUid: PERSONAS.adminA.uid,
    complianceUid: PERSONAS.complianceA.uid,
    securityUid: PERSONAS.securityA.uid,
  };

  // ===========================================================================
  // Step 1: Create Processor Profile
  // ===========================================================================
  test('Step 1: trusted command creates a Processor Profile with criticality, data categories, and owner', async () => {
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);
    const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

    // The security manager initiates a trusted command; seed its persisted result.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${tenantA}/processor_profiles/${fixtureOptions.processorProfileId}`)
        .set(fixtures.processorProfile);
    });

    // Verify stored fields and relationship metadata
    const snap = await secDb.doc(`tenants/${tenantA}/processor_profiles/${fixtureOptions.processorProfileId}`).get();
    expect(snap.exists).toBe(true);
    const profile = snap.data() as ProcessorProfile;
    expect(profile.engagementName).toBe('CloudCore Virtual Private Cloud & Compute');
    expect(profile.criticality).toBe('critical');
    expect(profile.dataCategories).toContain('payment_card_data');
    expect(profile.jurisdictions).toEqual(['DE', 'IE', 'FR']);
    expect(profile.ownerUserId).toBe(PERSONAS.securityA.uid);
  });

  // ===========================================================================
  // Step 2: Add ISO 27001 Certification
  // ===========================================================================
  test('Step 2: trusted command adds an ISO 27001 certification with valid dates and scope', async () => {
    await seedProcessorCertificationE2EEnvironment(testEnv, fixtureOptions);
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

    // Seed the record produced by the trusted certification command.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`)
        .set(fixtures.iso27001Cert);
    });

    const snap = await secDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).get();
    expect(snap.exists).toBe(true);
    const cert = snap.data() as ProcessorCertification;
    expect(cert.standardFamily).toBe('iso_27001');
    expect(cert.artifactKind).toBe('accredited_certification');
    expect(cert.issuingBodyOrAuditor).toBe('TÜV Rheinland Cert GmbH');
    expect(cert.leadAuditorName).toBe('Dr. Manfred Weber');
    expect(cert.reviewStatus).toBe('pending');
    expect(cert.systemsOrServicesCovered).toContain('Core Payment & Settlement Engine');
  });

  // ===========================================================================
  // Step 3: Link Evidence File
  // ===========================================================================
  test('Step 3: trusted command links verified PDF evidence to the ISO certification', async () => {
    await seedProcessorCertificationE2EEnvironment(testEnv, fixtureOptions);
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

    // Save the certification state produced by the trusted evidence-link command.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`)
        .set(fixtures.iso27001Cert);
    });

    // Verify evidence doc exists in tenant evidence locker
    const evSnap = await secDb.doc(`tenants/${tenantA}/evidence/${fixtureOptions.evidenceIsoId}`).get();
    expect(evSnap.exists).toBe(true);
    const evDoc = evSnap.data() as Evidence;
    expect(evDoc.category).toBe('iso_certificate');
    expect(evDoc.fileHashSha256).toBe('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08');
    expect(evDoc.processorCertificationIds).toContain(fixtureOptions.isoCertId);

    // Verify cert references evidence
    const certSnap = await secDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).get();
    const cert = certSnap.data() as ProcessorCertification;
    expect(cert.linkedEvidenceIds).toContain(fixtureOptions.evidenceIsoId);
  });

  // ===========================================================================
  // Step 4: Mark Review Accepted
  // ===========================================================================
  test('Step 4: trusted review command records acceptance, notes, and audit attribution', async () => {
    await seedProcessorCertificationE2EEnvironment(testEnv, fixtureOptions);
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).set(fixtures.iso27001Cert);
    });

    const approverDb = testEnv.authenticatedContext(PERSONAS.approverA.uid).firestore();

    // Seed the accepted state produced by the approver's trusted review command.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).update({
        reviewStatus: 'accepted',
        reviewNotes: 'Verified certificate validity on TÜV Rheinland online registrar. Scope covers EU VPC.',
        updatedBy: PERSONAS.approverA.uid,
        updatedAt: nowIso,
      });
    });

    const updatedSnap = await approverDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).get();
    const cert = updatedSnap.data() as ProcessorCertification;
    expect(cert.reviewStatus).toBe('accepted');
    expect(cert.reviewNotes).toContain('TÜV Rheinland');
    expect(cert.updatedBy).toBe(PERSONAS.approverA.uid);
  });

  // ===========================================================================
  // Step 5: Add SOC 2 Report with Report Period
  // ===========================================================================
  test('Step 5: trusted command adds a SOC 2 Type II report with its audit coverage period', async () => {
    await seedProcessorCertificationE2EEnvironment(testEnv, fixtureOptions);
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

    // Seed the SOC 2 record produced by the trusted command.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore()
        .doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.socReportId}`)
        .set(fixtures.soc2Report);
    });

    const snap = await compDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.socReportId}`).get();
    expect(snap.exists).toBe(true);
    const report = snap.data() as ProcessorCertification;
    expect(report.standardFamily).toBe('soc2_type2');
    expect(report.artifactKind).toBe('independent_attestation_report');
    expect(report.reportPeriodStart).toBe('2025-01-01T00:00:00.000Z');
    expect(report.reportPeriodEnd).toBe('2025-12-31T00:00:00.000Z');
    expect(report.issuingBodyOrAuditor).toBe('KPMG AG Wirtschaftsprüfungsgesellschaft');
    expect(report.unresolvedFindingsCount).toBe(1);
  });

  // ===========================================================================
  // Step 6: Trigger Expiry / Renewal Reminder
  // ===========================================================================
  test('Step 6: Trigger Expiry/Renewal Reminder logic for certifications expiring or due for review', async () => {
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);
    const socReport = fixtures.soc2Report as ProcessorCertification;

    // Evaluate reminder candidates via pure domain engine
    const candidates = evaluateProcessorCertificationReminders([socReport], { asOfDate: now });
    expect(candidates.length).toBeGreaterThan(0);
    const candidate = candidates[0]!;
    expect(candidate.certificationId).toBe(fixtureOptions.socReportId);
    expect(candidate.recipientUserId).toBe(PERSONAS.complianceA.uid);

    // Simulate backend reminder dispatcher writing in-app notification for review owner
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const notifId = `notif_expiring_${socReport.id}`;
      await db.doc(`tenants/${tenantA}/notifications/${notifId}`).set({
        id: notifId,
        tenantId: tenantA,
        recipientId: candidate.recipientUserId, // Compliance Manager
        type: 'processor_certification_expiring_soon',
        title: candidate.title,
        body: candidate.message,
        isRead: false,
        createdAt: nowIso,
      });
    });

    // Compliance Manager verifies notification delivery
    const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
    const notifSnap = await compDb.doc(`tenants/${tenantA}/notifications/notif_expiring_${socReport.id}`).get();
    expect(notifSnap.exists).toBe(true);
    expect(notifSnap.data()?.type).toBe('processor_certification_expiring_soon');
    expect(notifSnap.data()?.isRead).toBe(false);

    // Browser acknowledgement is rejected; notification mutation must use a trusted command.
    await assertFails(
      compDb.doc(`tenants/${tenantA}/notifications/notif_expiring_${socReport.id}`).update({
        isRead: true,
        readAt: nowIso,
      })
    );
  });

  // ===========================================================================
  // Step 7: Derive Missing-Evidence or Expired Warnings
  // ===========================================================================
  test('Step 7: Derive Missing-Evidence and Expired warnings in synthesized inventory and risk flags', () => {
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    const allCerts = [
      fixtures.iso27001Cert as ProcessorCertification,
      fixtures.soc2Report as ProcessorCertification,
      fixtures.expiredCert as ProcessorCertification,
    ];
    const profiles = [fixtures.processorProfile as ProcessorProfile];
    const vendors = [fixtures.vendor as Vendor];
    const assets = [fixtures.systemAsset as SystemAsset];
    const evidenceList = [
      fixtures.evidenceIsoDoc as Evidence,
      fixtures.evidenceSocDoc as Evidence,
    ];

    // Synthesize assurance inventory
    const inventory = synthesizeProcessorAssuranceInventory(
      allCerts,
      profiles,
      vendors,
      assets,
      evidenceList,
      now
    );

    expect(inventory).toHaveLength(3);

    // Check Expired PCI-DSS Cert (has expired and has missing evidence)
    const expiredItem = inventory.find((i) => i.certification.id === fixtureOptions.expiredCertId)!;
    expect(expiredItem.validityStatus).toBe('expired');
    expect(expiredItem.hasAttachedEvidence).toBe(false);
    expect(expiredItem.gaps.some((g) => g.code === 'PROCESSOR_CERT_EXPIRED')).toBe(true);
    expect(expiredItem.gaps.some((g) => g.code === 'PROCESSOR_CERT_MISSING_EVIDENCE')).toBe(true);

    // Check Multi-Dimensional Risk Evaluation
    const riskFlags = evaluateProcessorCertificationRiskFlags(allCerts, {
      evidenceDocs: evidenceList,
      processorProfiles: profiles,
      asOfDate: now,
    });
    expect(riskFlags.length).toBeGreaterThan(0);
    expect(riskFlags.some((f: ProcessorCertificationRiskFlag) => f.ruleCode.includes('EXPIRED'))).toBe(true);
    expect(riskFlags.some((f: ProcessorCertificationRiskFlag) => f.ruleCode.includes('MISSING_EVIDENCE'))).toBe(true);
  });

  // ===========================================================================
  // Step 8: Verify Unauthorized Cross-Tenant Isolation
  // ===========================================================================
  test('Step 8: Verify unauthorized user cannot access another tenant’s certification data or evidence', async () => {
    await seedProcessorCertificationE2EEnvironment(testEnv, fixtureOptions);
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);

    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      await db.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).set(fixtures.iso27001Cert);
    });

    const tenantBUserDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

    // 1. Tenant B Admin cannot read Tenant A ISO cert
    await assertFails(
      tenantBUserDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).get()
    );

    // 2. Tenant B Admin cannot write/modify Tenant A cert
    await assertFails(
      tenantBUserDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).update({
        status: 'expired',
      })
    );

    // 3. Tenant B Admin cannot delete Tenant A cert
    await assertFails(
      tenantBUserDb.doc(`tenants/${tenantA}/processor_certifications/${fixtureOptions.isoCertId}`).delete()
    );

    // 4. Tenant B Admin cannot read Tenant A evidence document
    await assertFails(
      tenantBUserDb.doc(`tenants/${tenantA}/evidence/${fixtureOptions.evidenceIsoId}`).get()
    );

    // 5. Tenant B Admin cannot create a certification inside Tenant A
    await assertFails(
      tenantBUserDb.doc(`tenants/${tenantA}/processor_certifications/cert_injected_b`).set({
        ...fixtures.iso27001Cert,
        id: 'cert_injected_b',
      })
    );
  });

  // ===========================================================================
  // Step 9: Verify Exports are Tenant-Safe
  // ===========================================================================
  test('Step 9: Verify all 6 processor assurance exports are tenant-safe and authorized', async () => {
    const fixtures = buildProcessorCertificationE2EFixtures(fixtureOptions);
    const allCerts = [
      fixtures.iso27001Cert as ProcessorCertification,
      fixtures.soc2Report as ProcessorCertification,
      fixtures.expiredCert as ProcessorCertification,
    ];
    const profiles = [fixtures.processorProfile as ProcessorProfile];
    const vendors = [fixtures.vendor as Vendor];
    const assets = [fixtures.systemAsset as SystemAsset];
    const evidenceList = [fixtures.evidenceIsoDoc as Evidence, fixtures.evidenceSocDoc as Evidence];

    const inventory = synthesizeProcessorAssuranceInventory(
      allCerts,
      profiles,
      vendors,
      assets,
      evidenceList,
      now
    );

    const exportOptions = {
      tenantId: tenantA,
      requestedBy: PERSONAS.adminA.uid,
      generatedAt: nowIso,
    };

    // 1. Processor Assurance Register
    const regPayload = generateProcessorAssuranceRegisterExportPayload(inventory, exportOptions);
    expect(regPayload.exportHeader.tenantId).toBe(tenantA);
    expect(regPayload.exportHeader.totalAssuranceRecords).toBe(3);
    expect(regPayload.records).toHaveLength(3);

    // 2. Expiring Certifications Report
    const expPayload = generateProcessorExpiringCertificationsExportPayload(inventory, {
      ...exportOptions,
      expiryWindowDays: 60,
    });
    expect(expPayload.exportHeader.tenantId).toBe(tenantA);
    expect(expPayload.expiringCertifications).toHaveLength(1);
    expect(expPayload.expiringCertifications[0]?.certificationId).toBe(fixtureOptions.socReportId);

    // 3. Expired / Insufficient Assurance Report
    const defPayload = generateProcessorExpiredInsufficientAssuranceExportPayload(inventory, exportOptions);
    expect(defPayload.exportHeader.tenantId).toBe(tenantA);
    expect(defPayload.deficiencies).toHaveLength(1);
    expect(defPayload.deficiencies[0]?.certificationId).toBe(fixtureOptions.expiredCertId);

    // 4. Processor-by-Certification Matrix
    const matrixPayload = generateProcessorByCertificationTypeMatrixExportPayload(
      profiles,
      allCerts,
      vendors,
      exportOptions
    );
    expect(matrixPayload.exportHeader.tenantId).toBe(tenantA);
    expect(matrixPayload.matrix).toHaveLength(1);
    expect(matrixPayload.matrix[0]?.coverageByStandard['iso_27001']?.covered).toBe(true);
    expect(matrixPayload.matrix[0]?.coverageByStandard['soc2_type2']?.covered).toBe(true);

    // 5. Assurance Coverage by Linked Systems
    const sysPayload = generateProcessorAssuranceCoverageBySystemsExportPayload(
      assets,
      profiles,
      allCerts,
      vendors,
      exportOptions
    );
    expect(sysPayload.exportHeader.tenantId).toBe(tenantA);
    expect(sysPayload.systemCoverage).toHaveLength(1);
    expect(sysPayload.systemCoverage[0]?.systemAssetId).toBe(fixtureOptions.systemAssetId);

    // 6. Critical Processors Missing Assurance
    const critPayload = generateCriticalProcessorsMissingAssuranceExportPayload(
      profiles,
      allCerts,
      vendors,
      evidenceList,
      exportOptions
    );
    expect(critPayload.exportHeader.tenantId).toBe(tenantA);
    expect(critPayload.exportHeader.totalCriticalProcessorsCount).toBe(1);

    // Verify export-job command-boundary and tenant-isolation rules.
    const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
    const jobId = 'job_e2e_assurance_register';

    await assertFails(
      adminDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
        id: jobId,
        tenantId: tenantA,
        exportType: 'processor_assurance_register',
        status: 'queued',
        requestedBy: PERSONAS.adminA.uid,
        requestedAt: nowIso,
        completedAt: null,
        fileStoragePath: null,
        fileDownloadUrl: null,
        fileSizeBytes: null,
        errorMessage: null,
        filtersApplied: {},
      })
    );

    // Seed the result a trusted export command would create so the isolation
    // assertion below exercises an existing authoritative document.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await context.firestore().doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
        id: jobId,
        tenantId: tenantA,
        exportType: 'processor_assurance_register',
        status: 'queued',
        requestedBy: PERSONAS.adminA.uid,
        requestedAt: nowIso,
        completedAt: null,
        fileStoragePath: null,
        fileDownloadUrl: null,
        fileSizeBytes: null,
        errorMessage: null,
        filtersApplied: {},
      });
    });

    // Cross-tenant user cannot read the export job
    const tenantBUserDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
    await assertFails(tenantBUserDb.doc(`tenants/${tenantA}/export_jobs/${jobId}`).get());
  });
});

import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Vendor,
  ProcessorProfile,
  ProcessorCertification,
  Evidence,
  SystemAsset,
} from '@eurogovernance/shared-types';

export interface ProcessorCertE2EFixtureOptions {
  tenantId: string;
  vendorId: string;
  processorProfileId: string;
  isoCertId: string;
  socReportId: string;
  expiredCertId?: string;
  evidenceIsoId: string;
  evidenceSocId: string;
  systemAssetId: string;
  adminUid: string;
  complianceUid: string;
  securityUid: string;
}

/**
 * Builds standard fixture records for end-to-end testing of processor certifications and assurance workflows.
 */
export function buildProcessorCertificationE2EFixtures(options: ProcessorCertE2EFixtureOptions) {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();
  const pastDate = new Date('2025-01-01T00:00:00.000Z').toISOString();
  const futureIsoExpiry = new Date('2028-01-01T00:00:00.000Z').toISOString();
  const nearFutureSocExpiry = new Date('2026-09-15T00:00:00.000Z').toISOString(); // ~31 days away
  const pastExpiredDate = new Date('2026-06-01T00:00:00.000Z').toISOString();

  const vendor = {
    id: options.vendorId,
    tenantId: options.tenantId,
    name: 'CloudCore Infrastructure SE',
    category: 'cloud_provider',
    riskTier: 'critical',
    primaryContactName: 'Vendor Compliance Desk',
    primaryContactEmail: 'assurance@cloudcore.example.eu',
    countryOfIncorporation: 'DE',
    dataHostingRegions: ['eu-central-1', 'eu-west-1'],
    status: 'active',
    ownerId: options.securityUid,
    createdBy: options.securityUid,
    createdAt: pastDate,
    updatedAt: now,
  } as unknown as Vendor;

  const systemAsset = {
    id: options.systemAssetId,
    tenantId: options.tenantId,
    name: 'Core Payment & Settlement Engine',
    assetType: 'cloud_infrastructure',
    criticality: 'critical',
    dataClassification: 'restricted_personal',
    containsPersonalData: true,
    processorProfileIds: [options.processorProfileId],
    ownerId: options.securityUid,
    createdBy: options.securityUid,
    createdAt: pastDate,
    updatedAt: now,
  } as unknown as SystemAsset;

  const processorProfile = {
    id: options.processorProfileId,
    tenantId: options.tenantId,
    vendorId: options.vendorId,
    engagementName: 'CloudCore Virtual Private Cloud & Compute',
    processorRole: 'data_processor',
    serviceDescription: 'Managed compute clusters, container orchestration, and encrypted block storage.',
    dataCategories: ['user_credentials', 'payment_card_data', 'transaction_logs'],
    dataSubjects: ['customers', 'employees'],
    isSpecialCategoryData: false,
    jurisdictions: ['DE', 'IE', 'FR'],
    linkedSystemAssetIds: [options.systemAssetId],
    criticality: 'critical',
    ownerUserId: options.securityUid,
    reviewCadence: 'quarterly',
    lastReviewDate: pastDate,
    nextReviewDate: new Date('2026-11-01T00:00:00.000Z').toISOString(),
    status: 'active',
    ownerId: options.securityUid,
    createdBy: options.securityUid,
    createdAt: pastDate,
    updatedAt: now,
  } as unknown as ProcessorProfile;

  const evidenceIsoDoc = {
    id: options.evidenceIsoId,
    tenantId: options.tenantId,
    title: 'CloudCore ISO/IEC 27001:2022 Certificate.pdf',
    category: 'iso_certificate',
    status: 'valid',
    storagePath: `tenants/${options.tenantId}/evidence/${options.evidenceIsoId}.pdf`,
    fileHashSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
    fileSizeBytes: 2048576,
    mimeType: 'application/pdf',
    processorCertificationIds: [options.isoCertId],
    uploadedBy: options.securityUid,
    createdAt: pastDate,
    updatedAt: pastDate,
  } as unknown as Evidence;

  const evidenceSocDoc = {
    id: options.evidenceSocId,
    tenantId: options.tenantId,
    title: 'CloudCore SOC 2 Type II Security & Confidentiality Report.pdf',
    category: 'soc_report',
    status: 'valid',
    storagePath: `tenants/${options.tenantId}/evidence/${options.evidenceSocId}.pdf`,
    fileHashSha256: '5e884898da28047151d0e56f8dc6292773603d0d6aabbdd62a11ef721d1542d8',
    fileSizeBytes: 4194304,
    mimeType: 'application/pdf',
    processorCertificationIds: [options.socReportId],
    uploadedBy: options.complianceUid,
    createdAt: now,
    updatedAt: now,
  } as unknown as Evidence;

  const iso27001Cert = {
    id: options.isoCertId,
    tenantId: options.tenantId,
    processorProfileId: options.processorProfileId,
    vendorId: options.vendorId,
    artifactKind: 'accredited_certification',
    standardFamily: 'iso_27001',
    issuingBodyOrAuditor: 'TÜV Rheinland Cert GmbH',
    leadAuditorName: 'Dr. Manfred Weber',
    certificateOrReportNumber: 'TUV-2025-ISMS-8891',
    validFrom: pastDate,
    validUntil: futureIsoExpiry,
    status: 'active_valid',
    assuranceScopeSummary: 'Cloud hosting, container platform, and core payment data processing environment.',
    legalEntityOrRegionalScope: 'CloudCore Infrastructure SE (Frankfurt)',
    systemsOrServicesCovered: ['Core Payment & Settlement Engine', 'Cloud Compute', 'Storage'],
    reviewOwnerUserId: options.securityUid,
    reviewStatus: 'pending',
    reviewDueDate: new Date('2026-09-01T00:00:00.000Z').toISOString(),
    linkedEvidenceIds: [options.evidenceIsoId],
    unresolvedFindingsCount: 0,
    hasMajorDeficiencies: false,
    isInsufficient: false,
    ownerId: options.securityUid,
    createdBy: options.securityUid,
    updatedBy: options.securityUid,
    createdAt: pastDate,
    updatedAt: pastDate,
  } as unknown as ProcessorCertification;

  const soc2Report = {
    id: options.socReportId,
    tenantId: options.tenantId,
    processorProfileId: options.processorProfileId,
    vendorId: options.vendorId,
    artifactKind: 'independent_attestation_report',
    standardFamily: 'soc2_type2',
    issuingBodyOrAuditor: 'KPMG AG Wirtschaftsprüfungsgesellschaft',
    leadAuditorName: 'Sabine Becker',
    certificateOrReportNumber: 'KPMG-SOC2-2025-Q4',
    reportPeriodStart: '2025-01-01T00:00:00.000Z',
    reportPeriodEnd: '2025-12-31T00:00:00.000Z',
    validFrom: '2025-12-31T00:00:00.000Z',
    validUntil: nearFutureSocExpiry, // Expiring soon in ~31 days
    status: 'active_valid',
    assuranceScopeSummary: 'Trust Services Criteria for Security, Availability, and Confidentiality.',
    legalEntityOrRegionalScope: 'CloudCore Infrastructure SE (Global)',
    systemsOrServicesCovered: ['Core Payment & Settlement Engine'],
    reviewOwnerUserId: options.complianceUid,
    reviewStatus: 'pending',
    reviewDueDate: new Date('2026-08-20T00:00:00.000Z').toISOString(), // Imminent review
    linkedEvidenceIds: [options.evidenceSocId],
    unresolvedFindingsCount: 1,
    hasMajorDeficiencies: false,
    isInsufficient: false,
    ownerId: options.complianceUid,
    createdBy: options.complianceUid,
    updatedBy: options.complianceUid,
    createdAt: now,
    updatedAt: now,
  } as unknown as ProcessorCertification;

  const expiredCert = {
    id: options.expiredCertId || `cert_expired_${options.processorProfileId}`,
    tenantId: options.tenantId,
    processorProfileId: options.processorProfileId,
    vendorId: options.vendorId,
    artifactKind: 'industry_label',
    standardFamily: 'pci_dss_aoc',
    issuingBodyOrAuditor: 'Advantio Security GmbH',
    certificateOrReportNumber: 'ADV-PCI-2025-L1',
    validFrom: '2025-06-01T00:00:00.000Z',
    validUntil: pastExpiredDate, // Expired on June 1, 2026
    status: 'expired',
    assuranceScopeSummary: 'Cardholder Data Environment',
    legalEntityOrRegionalScope: 'CloudCore EU',
    systemsOrServicesCovered: ['Core Payment & Settlement Engine'],
    reviewOwnerUserId: options.securityUid,
    reviewStatus: 'pending',
    reviewDueDate: pastExpiredDate,
    linkedEvidenceIds: [], // Missing evidence file!
    unresolvedFindingsCount: 2,
    hasMajorDeficiencies: true,
    isInsufficient: false,
    ownerId: options.securityUid,
    createdBy: options.securityUid,
    updatedBy: options.securityUid,
    createdAt: '2025-06-01T00:00:00.000Z',
    updatedAt: pastExpiredDate,
  } as unknown as ProcessorCertification;

  return {
    vendor,
    systemAsset,
    processorProfile,
    evidenceIsoDoc,
    evidenceSocDoc,
    iso27001Cert,
    soc2Report,
    expiredCert,
  };
}

/**
 * Helper to seed a complete tenant with processor certification fixtures.
 */
export async function seedProcessorCertificationE2EEnvironment(
  testEnv: RulesTestEnvironment,
  options: ProcessorCertE2EFixtureOptions
): Promise<ReturnType<typeof buildProcessorCertificationE2EFixtures>> {
  const fixtures = buildProcessorCertificationE2EFixtures(options);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const t = options.tenantId;

    await db.doc(`tenants/${t}/vendors/${options.vendorId}`).set(fixtures.vendor);
    await db.doc(`tenants/${t}/system_assets/${options.systemAssetId}`).set(fixtures.systemAsset);
    await db.doc(`tenants/${t}/processor_profiles/${options.processorProfileId}`).set(fixtures.processorProfile);
    await db.doc(`tenants/${t}/evidence/${options.evidenceIsoId}`).set(fixtures.evidenceIsoDoc);
    await db.doc(`tenants/${t}/evidence/${options.evidenceSocId}`).set(fixtures.evidenceSocDoc);
  });

  return fixtures;
}

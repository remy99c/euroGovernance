import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import {
  Vendor,
  ProcessorProfile,
  TransferArrangement,
  Evidence,
  TIA,
  SystemAsset,
  ROPAEntry,
  TransferMechanismType,
} from '@eurogovernance/shared-types';

export interface SeedProcessorE2EOptions {
  tenantId: string;
  vendorId: string;
  profileId: string;
  arrangementId: string;
  evidenceDpaId: string;
  evidenceSccId: string;
  evidenceSecurityId?: string;
  tiaId: string;
  assetId: string;
  ropaId: string;
  ownerUid: string;
}

/**
 * Helper to build standard fixture objects for processor governance end-to-end flows.
 */
export function buildProcessorE2EFixtures(options: SeedProcessorE2EOptions) {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();
  const pastDate = new Date('2025-01-01T00:00:00.000Z').toISOString();
  const futureDate = new Date('2027-01-01T00:00:00.000Z').toISOString();
  const secEvidenceId = options.evidenceSecurityId || `ev_sec_${options.profileId}`;

  const vendor: Partial<Vendor> = {
    id: options.vendorId,
    tenantId: options.tenantId,
    name: 'OmniCloud Services International Corp',
    category: 'cloud_provider',
    riskTier: 'critical',
    primaryContactName: 'Global Vendor Team',
    primaryContactEmail: 'security@omnicloud.example.com',
    countryOfIncorporation: 'US',
    dataHostingRegions: ['us-east-1', 'eu-central-1'],
    status: 'active',
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const processorProfile: Partial<ProcessorProfile> = {
    id: options.profileId,
    tenantId: options.tenantId,
    vendorId: options.vendorId,
    engagementName: 'Enterprise SaaS Data Processing Pipeline',
    processorRole: 'data_processor',
    serviceDescription: 'Multi-tenant real-time stream processing and database storage',
    dataCategories: ['user_credentials', 'contact_details', 'usage_logs'],
    dataSubjects: ['customers', 'employees'],
    isSpecialCategoryData: false,
    jurisdictions: ['US', 'DE'],
    linkedSystemAssetIds: [options.assetId],
    criticality: 'critical',
    ownerUserId: options.ownerUid,
    reviewCadence: 'annually',
    lastReviewDate: pastDate,
    nextReviewDate: futureDate,
    status: 'active',
    dpaSigned: true,
    dpaDate: pastDate,
    linkedDpaEvidenceId: options.evidenceDpaId,
    linkedRiskIds: [],
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const transferArrangement: Partial<TransferArrangement> = {
    id: options.arrangementId,
    tenantId: options.tenantId,
    processorProfileId: options.profileId,
    vendorId: options.vendorId,
    name: 'Transatlantic Analytics & Backup Data Stream',
    restrictedTransfer: true,
    destinationCountries: ['US'],
    eeaStatus: 'third_country_non_adequate',
    transferScopes: ['backup', 'analytics', 'hosting'],
    transferMechanismType: 'standard_contractual_clauses' as TransferMechanismType,
    transferMechanismStatus: 'active_valid',
    effectiveDate: pastDate,
    reviewDueDate: futureDate,
    supplementaryMeasuresSummary: 'Client-held KMS encryption and tokenization before export',
    subprocessorInvolvement: false,
    linkedTiaId: options.tiaId,
    linkedEvidenceIds: [options.evidenceSccId],
    rationale: 'Disaster recovery and high availability compute in US data center',
    status: 'active',
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const dpaEvidence: Partial<Evidence> = {
    id: options.evidenceDpaId,
    tenantId: options.tenantId,
    title: 'OmniCloud Data Processing Addendum (Art 28 GDPR)',
    description: 'Fully executed DPA with technical and organizational security measures',
    category: 'dpa',
    status: 'valid',
    storagePath: `tenants/${options.tenantId}/evidence/dpa_omnicloud.pdf`,
    fileSizeBytes: 1048576,
    mimeType: 'application/pdf',
    fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    processorProfileIds: [options.profileId],
    collectedAt: pastDate,
    currentVersion: 1,
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const sccEvidence: Partial<Evidence> = {
    id: options.evidenceSccId,
    tenantId: options.tenantId,
    title: 'OmniCloud Standard Contractual Clauses (EU Commission 2021/914 Module 2)',
    description: 'Executed Controller-to-Processor SCCs with Annex I & II',
    category: 'scc',
    status: 'valid',
    storagePath: `tenants/${options.tenantId}/evidence/scc_omnicloud.pdf`,
    fileSizeBytes: 2097152,
    mimeType: 'application/pdf',
    fileHashSha256: '5d41402abc4b2a76b9719d911017c5925d41402abc4b2a76b9719d911017c592',
    processorProfileIds: [options.profileId],
    transferArrangementIds: [options.arrangementId],
    collectedAt: pastDate,
    currentVersion: 1,
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const securityEvidence: Partial<Evidence> = {
    id: secEvidenceId,
    tenantId: options.tenantId,
    title: 'OmniCloud ISO 27001 / SOC 2 Type II Security Report',
    description: 'Annual third-party audit of technical and organizational measures',
    category: 'toms',
    status: 'valid',
    storagePath: `tenants/${options.tenantId}/evidence/toms_omnicloud.pdf`,
    fileSizeBytes: 4194304,
    mimeType: 'application/pdf',
    fileHashSha256: 'a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0',
    processorProfileIds: [options.profileId],
    collectedAt: pastDate,
    currentVersion: 1,
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const tiaAssessment: Partial<TIA> = {
    id: options.tiaId,
    tenantId: options.tenantId,
    code: 'TIA-OMNICLOUD-US-01',
    title: 'OmniCloud US Data Transfer Impact Assessment (Schrems II)',
    vendorId: options.vendorId,
    processorProfileId: options.profileId,
    transferArrangementId: options.arrangementId,
    destinationCountry: 'US',
    legalMechanism: 'standard_contractual_clauses',
    destinationCountryLegalAssessment: 'US surveillance law impact (FISA 702 / EO 14086) assessed with adequate DPF safeguards',
    supplementaryTechnicalMeasures: 'End-to-end AES-256 GCM encryption, customer-managed hardware key management',
    supplementaryContractualMeasures: 'Mandatory challenge of unlawful government access requests and subject notification',
    status: 'approved',
    residualRiskLevel: 'low',
    approvedBy: options.ownerUid,
    approvedAt: pastDate,
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const systemAsset: Partial<SystemAsset> = {
    id: options.assetId,
    tenantId: options.tenantId,
    name: 'Customer Web Application & Processing Backend',
    assetType: 'cloud_infrastructure',
    criticality: 'mission_critical',
    dataClassification: 'restricted_personal',
    hostingLocation: 'EU-West / US-East',
    vendorId: options.vendorId,
    containsPersonalData: true,
    containsSpecialCategoryData: false,
    containsTrainingData: false,
    processorProfileIds: [options.profileId],
    processorRelationships: [
      {
        processorProfileId: options.profileId,
        relationshipType: 'hosting',
        relationshipDescription: 'Primary compute workload and data persistence tier',
      },
      {
        processorProfileId: options.profileId,
        relationshipType: 'storage',
        relationshipDescription: 'Encrypted object storage backup repository',
      },
    ],
    status: 'active',
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  const ropaEntry: Partial<ROPAEntry> = {
    id: options.ropaId,
    tenantId: options.tenantId,
    activityCode: 'ROPA-CUST-ONBOARD-01',
    activityName: 'Customer Account Onboarding & Core Service Provision',
    purpose: 'Provision of secure enterprise SaaS services and order fulfillment',
    legalBasis: 'contractual_necessity',
    legalBasisRationale: 'GDPR Article 6(1)(b) performance of a contract',
    isSpecialCategoryData: false,
    specialCategoryBasis: null,
    dataSubjectCategories: ['customers', 'authorized_representatives'],
    personalDataCategories: ['contact_details', 'identification_numbers', 'financial_data'],
    retentionPeriodDescription: 'Active account duration plus statutory 10-year commercial retention',
    retentionPeriodMonths: 120,
    dataSecurityMeasuresSummary: 'Role-based access control, TLS 1.3 in transit, AES-256 at rest',
    jointControllerInfo: null,
    processorIds: [options.vendorId],
    processorProfileIds: [options.profileId],
    transferArrangementIds: [options.arrangementId],
    recipientCategories: ['cloud_infrastructure_providers', 'payment_processors'],
    involvesInternationalTransfer: true,
    destinationCountries: ['US'],
    transferMechanism: 'standard_contractual_clauses',
    dpiaRequired: false,
    linkedDpiaId: null,
    linkedTiaId: options.tiaId,
    linkedSystemAssetIds: [options.assetId],
    status: 'active',
    ownerId: options.ownerUid,
    createdBy: options.ownerUid,
    createdAt: pastDate,
    updatedAt: now,
  };

  return {
    vendor,
    processorProfile,
    transferArrangement,
    dpaEvidence,
    sccEvidence,
    securityEvidence,
    tiaAssessment,
    systemAsset,
    ropaEntry,
  };
}

/**
 * Seeds a full processor governance topology into Firestore using disabled security rules.
 */
export async function seedProcessorTopology(
  testEnv: RulesTestEnvironment,
  options: SeedProcessorE2EOptions
) {
  const fixtures = buildProcessorE2EFixtures(options);

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const t = options.tenantId;

    await db.doc(`tenants/${t}/vendors/${options.vendorId}`).set(fixtures.vendor);
    await db.doc(`tenants/${t}/processor_profiles/${options.profileId}`).set(fixtures.processorProfile);
    await db.doc(`tenants/${t}/transfer_arrangements/${options.arrangementId}`).set(fixtures.transferArrangement);
    await db.doc(`tenants/${t}/evidence/${options.evidenceDpaId}`).set(fixtures.dpaEvidence);
    await db.doc(`tenants/${t}/evidence/${options.evidenceSccId}`).set(fixtures.sccEvidence);
    if (fixtures.securityEvidence?.id) {
      await db.doc(`tenants/${t}/evidence/${fixtures.securityEvidence.id}`).set(fixtures.securityEvidence);
    }
    await db.doc(`tenants/${t}/tia_assessments/${options.tiaId}`).set(fixtures.tiaAssessment);
    await db.doc(`tenants/${t}/system_assets/${options.assetId}`).set(fixtures.systemAsset);
    await db.doc(`tenants/${t}/ropa_entries/${options.ropaId}`).set(fixtures.ropaEntry);
  });

  return fixtures;
}

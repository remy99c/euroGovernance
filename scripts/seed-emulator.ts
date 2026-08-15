import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { CANONICAL_MASTER_DATA } from '@eurogovernance/shared-types';

const projectId = process.env.GCLOUD_PROJECT || 'eurogovernance-dev';
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.FIREBASE_AUTH_EMULATOR_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST || '127.0.0.1:9099';
process.env.GCLOUD_PROJECT = projectId;

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const db = getFirestore();
const auth = getAuth();

export async function seedEmulatorData() {
  console.log('🚀 Seeding euroGovernance Firebase Emulator...');

  const tenantId = 'tenant_eurocorp_de';
  const now = new Date().toISOString();

  // 1. Seed Global Master Frameworks & Controls Catalog
  console.log('📦 Seeding Global Master Frameworks, Requirements, and Controls...');
  for (const fw of CANONICAL_MASTER_DATA.frameworks) {
    await db.doc(`frameworks/${fw.id}`).set(fw);
  }

  for (const r of CANONICAL_MASTER_DATA.requirements) {
    await db.doc(`frameworks/${r.frameworkId}/requirements/${r.id}`).set(r);
  }

  for (const mc of CANONICAL_MASTER_DATA.masterControls) {
    await db.doc(`frameworks/${mc.frameworkId}/master_controls/${mc.id}`).set(mc);
  }

  for (const map of CANONICAL_MASTER_DATA.requirementControlMappings) {
    await db.doc(`frameworks/${map.frameworkId}/mappings/${map.id}`).set(map);
  }

  for (const crossMap of CANONICAL_MASTER_DATA.canonicalControlMappings) {
    await db.doc(`control_mappings/${crossMap.id}`).set(crossMap);
  }

  for (const qnr of CANONICAL_MASTER_DATA.scopeQuestionnaires) {
    await db.doc(`scope_questionnaires/${qnr.id}`).set(qnr);
  }

  for (const q of CANONICAL_MASTER_DATA.scopeQuestions) {
    await db.doc(`scope_questionnaires/${q.questionnaireId}/questions/${q.id}`).set(q);
  }

  for (const rule of CANONICAL_MASTER_DATA.applicabilityRules) {
    await db.doc(`applicability_rules/${rule.id}`).set(rule);
  }

  // 3. Seed Tenant Organization
  console.log('🏢 Seeding Tenant Organization & Memberships...');
  await db.doc(`tenants/${tenantId}`).set({
    id: tenantId,
    name: 'EuroCorp Technologies SE',
    slug: 'eurocorp-de',
    tier: 'enterprise',
    status: 'active',
    country: 'DE',
    primaryContactEmail: 'security@eurocorp.de',
    selectedFrameworkIds: ['gdpr', 'eu_ai_act', 'iso_27001'],
    dataResidencyRegion: 'europe-west3',
    maxUsers: 50,
    activeUserCount: 4,
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_admin_01',
  });

  // 4. Seed Memberships & Auth Users
  const members = [
    { userId: 'usr_admin_01', email: 'admin@eurocorp.de', displayName: 'Marcus Vance (Admin)', role: 'tenant_admin' },
    { userId: 'usr_compliance_01', email: 'compliance@eurocorp.de', displayName: 'Elena Rostova (Compliance)', role: 'compliance_manager' },
    { userId: 'usr_security_01', email: 'ciso@eurocorp.de', displayName: 'Viktor Kroll (Security)', role: 'security_manager' },
    { userId: 'usr_privacy_01', email: 'dpo@eurocorp.de', displayName: 'Dr. Klaus Becker (DPO)', role: 'privacy_manager' },
    { userId: 'usr_ai_01', email: 'ai-lead@eurocorp.de', displayName: 'Dr. Sarah Weber (AI Lead)', role: 'ai_governance_manager' },
    { userId: 'usr_approver_01', email: 'officer@eurocorp.de', displayName: 'Rachel Sterling (Approver)', role: 'approver' },
    { userId: 'usr_auditor_01', email: 'auditor@kpmg.de', displayName: 'Thomas Schmidt (Auditor)', role: 'auditor' },
    { userId: 'usr_contrib_01', email: 'dev-alex@eurocorp.de', displayName: 'Alex Chen (Contributor)', role: 'contributor' },
  ];

  for (const m of members) {
    try {
      await auth.createUser({
        uid: m.userId,
        email: m.email,
        password: 'password123',
        displayName: m.displayName,
      });
    } catch {
      // User might already exist in Auth emulator
    }

    await db.doc(`tenants/${tenantId}/memberships/${m.userId}`).set({
      userId: m.userId,
      tenantId,
      email: m.email,
      displayName: m.displayName,
      role: m.role,
      status: 'active',
      joinedAt: now,
      lastLoginAt: now,
    });
  }

  // 5. Seed Controls
  console.log('🛡️ Seeding Controls...');
  const controls = [
    {
      id: 'ctl_ropa_01',
      tenantId,
      code: 'CTL-PRIV-01',
      title: 'Article 30 Processing Activity Register Maintenance',
      description: 'Annual ROPA inventory review and processor DPA verification schedule.',
      category: 'privacy',
      status: 'implemented',
      healthScore: 100,
      frameworkIds: ['gdpr'],
      requirementIds: ['art_30'],
      ownerId: 'usr_privacy_01',
      createdAt: now,
      updatedAt: now,
      createdBy: 'usr_compliance_01',
      updatedBy: 'usr_compliance_01',
    },
    {
      id: 'ctl_ai_oversight_01',
      tenantId,
      code: 'CTL-AI-OVR-01',
      title: 'AI Human-in-the-Loop Override Interface',
      description: 'Operator dual-key emergency shutdown and recommendation override mechanism.',
      category: 'ai_governance',
      status: 'implemented',
      healthScore: 90,
      frameworkIds: ['eu_ai_act'],
      requirementIds: ['art_14'],
      ownerId: 'usr_ai_01',
      createdAt: now,
      updatedAt: now,
      createdBy: 'usr_ai_01',
      updatedBy: 'usr_ai_01',
    },
  ];

  for (const c of controls) {
    await db.doc(`tenants/${tenantId}/controls/${c.id}`).set(c);
  }

  // 6. Seed Evidence Records with Version History
  console.log('📄 Seeding Evidence & Versions...');
  await db.doc(`tenants/${tenantId}/evidence/ev_ropa_2026`).set({
    id: 'ev_ropa_2026',
    tenantId,
    title: 'Q1 2026 Formal Article 30 ROPA Audit Sign-off',
    description: 'Signed inventory and cross-border transfer assessments for core product suite.',
    status: 'valid',
    category: 'assessment',
    controlIds: ['ctl_ropa_01'],
    requirementIds: ['art_30'],
    currentVersion: 1,
    storagePath: `tenants/${tenantId}/evidence/ev_ropa_2026/ropa_q1_2026.pdf`,
    downloadUrl: 'https://storage.googleapis.com/demo/ropa_q1_2026.pdf',
    fileName: 'ropa_q1_2026.pdf',
    fileSizeBytes: 245760,
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    reviewedBy: 'usr_privacy_01',
    reviewedAt: now,
    reviewDueDate: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString(),
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_compliance_01',
    updatedBy: 'usr_privacy_01',
  });

  await db.doc(`tenants/${tenantId}/evidence/ev_ropa_2026/versions/v1`).set({
    versionNumber: 1,
    storagePath: `tenants/${tenantId}/evidence/ev_ropa_2026/ropa_q1_2026.pdf`,
    fileName: 'ropa_q1_2026.pdf',
    fileSizeBytes: 245760,
    sha256Hash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
    uploadedBy: 'usr_compliance_01',
    uploadedAt: now,
  });

  // 7. Seed Vendors, Processor Profiles, Transfer Arrangements, and TIAs
  console.log('🏢 Seeding Vendors, GDPR Article 28 Processors & Transfer Arrangements...');
  await db.doc(`tenants/${tenantId}/vendors/vnd_aws_emea`).set({
    id: 'vnd_aws_emea',
    tenantId,
    name: 'Amazon Web Services EMEA SARL',
    category: 'cloud_hosting',
    riskTier: 'low',
    status: 'active',
    country: 'LU',
    website: 'https://aws.amazon.com',
    contactEmail: 'dpo@amazon.lu',
    criticality: 'critical',
    ownerId: 'usr_admin_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_admin_01',
    updatedBy: 'usr_admin_01',
  });

  await db.doc(`tenants/${tenantId}/vendors/vnd_datadog_us`).set({
    id: 'vnd_datadog_us',
    tenantId,
    name: 'Datadog Inc.',
    category: 'monitoring_observability',
    riskTier: 'medium',
    status: 'active',
    country: 'US',
    website: 'https://www.datadoghq.com',
    contactEmail: 'privacy@datadoghq.com',
    criticality: 'high',
    ownerId: 'usr_admin_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_admin_01',
    updatedBy: 'usr_admin_01',
  });

  await db.doc(`tenants/${tenantId}/processor_profiles/prof_aws_hosting`).set({
    id: 'prof_aws_hosting',
    tenantId,
    vendorId: 'vnd_aws_emea',
    engagementName: 'Core European Cloud Compute & Managed Database Tier (eu-central-1)',
    processorRole: 'data_processor',
    serviceDescription: 'Primary multi-AZ production workload hosting in Frankfurt region.',
    dataCategories: ['identity_data', 'financial_data', 'operational_telemetry'],
    dataSubjects: ['b2b_customers', 'employees'],
    isSpecialCategoryData: false,
    jurisdictions: ['LU', 'DE'],
    linkedSystemAssetIds: ['asset_saas_platform'],
    criticality: 'critical',
    ownerUserId: 'usr_privacy_01',
    reviewCadence: 'annually',
    lastReviewDate: now,
    nextReviewDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    dpaSigned: true,
    dpaDate: '2025-01-15T00:00:00.000Z',
    linkedDpaEvidenceId: 'ev_aws_dpa',
    linkedRiskIds: [],
    notes: 'Covered under AWS GDPR Data Processing Addendum with EU Model Clauses Annex.',
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  await db.doc(`tenants/${tenantId}/processor_profiles/prof_datadog_monitoring`).set({
    id: 'prof_datadog_monitoring',
    tenantId,
    vendorId: 'vnd_datadog_us',
    engagementName: 'Application Performance Monitoring & Telemetry Pipeline',
    processorRole: 'data_processor',
    serviceDescription: 'Real-time distributed tracing, crash analytics, and infrastructure metric monitoring.',
    dataCategories: ['system_logs', 'ip_addresses', 'user_agent_strings'],
    dataSubjects: ['b2b_customers', 'end_users'],
    isSpecialCategoryData: false,
    jurisdictions: ['US'],
    linkedSystemAssetIds: ['asset_saas_platform'],
    criticality: 'high',
    ownerUserId: 'usr_privacy_01',
    reviewCadence: 'semi_annually',
    lastReviewDate: now,
    nextReviewDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    dpaSigned: true,
    dpaDate: '2025-03-01T00:00:00.000Z',
    linkedDpaEvidenceId: null,
    linkedRiskIds: [],
    notes: 'Schrems II supplementary encryption enabled with client-side tokenization.',
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  await db.doc(`tenants/${tenantId}/transfer_arrangements/trans_datadog_us_stream`).set({
    id: 'trans_datadog_us_stream',
    tenantId,
    processorProfileId: 'prof_datadog_monitoring',
    vendorId: 'vnd_datadog_us',
    name: 'US Telemetry Distributed Log Replication',
    restrictedTransfer: true,
    destinationCountries: ['US'],
    eeaStatus: 'third_country_non_adequate',
    transferScopes: ['monitoring', 'support_access'],
    transferMechanismType: 'standard_contractual_clauses',
    transferMechanismStatus: 'active_valid',
    effectiveDate: '2025-03-01T00:00:00.000Z',
    reviewDueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    supplementaryMeasuresSummary: 'KMS AES-256 encryption in transit and at rest; client-held encryption keys; IP masking.',
    subprocessorInvolvement: false,
    linkedTiaId: 'tia_datadog_us',
    linkedEvidenceIds: ['ev_ropa_2026'],
    rationale: 'High-availability monitoring fallback and distributed anomaly detection.',
    notes: 'Schrems II compliance verified by DPO.',
    status: 'active',
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  await db.doc(`tenants/${tenantId}/tia_assessments/tia_datadog_us`).set({
    id: 'tia_datadog_us',
    tenantId,
    name: 'Schrems II TIA: Datadog US APM Pipeline',
    transferArrangementId: 'trans_datadog_us_stream',
    processorProfileId: 'prof_datadog_monitoring',
    destinationCountry: 'US',
    legalRegimeAssessment: 'FISA Section 702 and EO 14086 reviewed; DPF framework alignment verified.',
    surveillanceRiskLevel: 'medium',
    supplementaryMeasures: 'End-to-end TLS 1.3, client-side IP truncation, localized KMS encryption.',
    residualRiskLevel: 'low',
    approvalStatus: 'approved',
    approvedBy: 'usr_privacy_01',
    approvedAt: now,
    reviewCadenceMonths: 12,
    nextReviewDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    status: 'active',
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  await db.doc(`tenants/${tenantId}/system_assets/asset_saas_platform`).set({
    id: 'asset_saas_platform',
    tenantId,
    name: 'EuroCorp Core Cloud Application Platform',
    assetType: 'cloud_infrastructure',
    criticality: 'mission_critical',
    dataClassification: 'restricted_personal',
    hostingLocation: 'EU-West (Frankfurt)',
    vendorId: 'vnd_aws_emea',
    containsPersonalData: true,
    containsSpecialCategoryData: false,
    containsTrainingData: false,
    processorProfileIds: ['prof_aws_hosting', 'prof_datadog_monitoring'],
    processorRelationships: [
      { processorProfileId: 'prof_aws_hosting', relationshipType: 'hosting', relationshipDescription: 'Primary compute' },
      { processorProfileId: 'prof_datadog_monitoring', relationshipType: 'monitoring', relationshipDescription: 'APM logging' },
    ],
    status: 'active',
    ownerId: 'usr_admin_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_admin_01',
    updatedBy: 'usr_admin_01',
  });

  // 8. Seed GDPR ROPA Entry
  console.log('📋 Seeding GDPR ROPA Register...');
  await db.doc(`tenants/${tenantId}/ropa_entries/ropa_user_crm`).set({
    id: 'ropa_user_crm',
    tenantId,
    activityCode: 'ROPA-ACT-001',
    name: 'Customer Authentication & Identity Management',
    purposeOfProcessing: 'Providing secure multi-tenant B2B access, MFA enforcement, and account lifecycle handling.',
    dataSubjectCategories: ['b2b_customers', 'employees'],
    dataCategories: ['identity_data', 'contact_data', 'security_credentials'],
    specialCategories: [],
    legalBasis: 'contract_performance',
    dataRetentionPeriod: 'Account lifetime + 90 days archival grace period',
    thirdCountryTransfers: true,
    processorProfileIds: ['prof_aws_hosting', 'prof_datadog_monitoring'],
    transferArrangementIds: ['trans_datadog_us_stream'],
    status: 'active',
    lastReviewedAt: now,
    nextReviewDueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  // 9. Seed EU AI Act AI System
  console.log('🤖 Seeding EU AI Act Register...');
  await db.doc(`tenants/${tenantId}/ai_systems/ais_credit_scoring`).set({
    id: 'ais_credit_scoring',
    tenantId,
    systemCode: 'AI-SYS-001',
    name: 'Automated SME Credit Risk Evaluation Model v3',
    description: 'XGBoost gradient-boosted decision model assessing loan default risk for European enterprise applicants.',
    valueChainRole: 'deployer',
    riskTier: 'high_risk',
    status: 'production',
    intendedPurpose: 'Financial creditworthiness scoring of legal entities.',
    annexThreeCategory: 'credit_scoring_essential_services',
    isGeneralPurposeAI: false,
    humanOversightMeasures: 'Dual-officer manual override on scores between 450 and 650.',
    fundamentalRightsImpactAssessed: true,
    lastClassifiedAt: now,
    classifiedBy: 'usr_ai_01',
    ownerId: 'usr_ai_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_ai_01',
    updatedBy: 'usr_ai_01',
  });

  // 9. Seed Materialized Summary Metrics
  console.log('📊 Seeding Materialized Summary Metrics...');
  await db.doc(`tenants/${tenantId}/summary_metrics/latest`).set({
    tenantId,
    overallHealthScore: 88,
    frameworkProgress: [
      { frameworkId: 'gdpr', name: 'GDPR (EU 2016/679)', total: 32, implemented: 30, percentage: 94 },
      { frameworkId: 'eu_ai_act', name: 'EU AI Act (EU 2024/1689)', total: 28, implemented: 22, percentage: 78 },
      { frameworkId: 'iso_27001', name: 'ISO/IEC 27001:2022', total: 93, implemented: 82, percentage: 88 },
    ],
    controlsSummary: { total: 153, implemented: 134, in_progress: 15, not_started: 4 },
    evidenceSummary: { valid: 142, under_review: 6, expired: 5 },
    openRisksCount: 2,
    openBreachesCount: 0,
    openIncidentsCount: 0,
    lastAggregatedAt: now,
  });

  // 10. Seed Append-Only Immutable Audit Log Events
  console.log('🔒 Seeding Immutable Audit Logs...');
  const auditLogs = [
    {
      id: 'aud_seed_01',
      tenantId,
      actorId: 'usr_admin_01',
      actorEmail: 'admin@eurocorp.de',
      actorRole: 'tenant_admin',
      entityType: 'tenant',
      entityId: tenantId,
      action: 'create',
      beforeSummary: null,
      afterSummary: { name: 'EuroCorp Technologies SE', region: 'europe-west3' },
      source: 'cloud_function',
      workflowContext: 'createTenant',
      ipAddress: '127.0.0.1',
      userAgent: 'SeedScript/1.0',
      timestamp: new Date(Date.now() - 3600000).toISOString(),
    },
    {
      id: 'aud_seed_02',
      tenantId,
      actorId: 'usr_ai_01',
      actorEmail: 'ai-lead@eurocorp.de',
      actorRole: 'ai_governance_manager',
      entityType: 'ai_system',
      entityId: 'ais_credit_scoring',
      action: 'status_transition',
      beforeSummary: { status: 'testing', riskTier: 'high_risk' },
      afterSummary: { status: 'production', riskTier: 'high_risk' },
      source: 'cloud_function',
      workflowContext: 'classifyAISystem',
      ipAddress: '127.0.0.1',
      userAgent: 'SeedScript/1.0',
      timestamp: new Date(Date.now() - 1800000).toISOString(),
    },
  ];

  for (const a of auditLogs) {
    await db.doc(`tenants/${tenantId}/audit_logs/${a.id}`).set(a);
  }

  console.log('✅ Seeding complete! All collections populated for local testing.');
}

// Allow direct CLI execution
if (process.argv[1] && process.argv[1].includes('seed-emulator')) {
  seedEmulatorData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('❌ Seeding failed:', err);
      process.exit(1);
    });
}

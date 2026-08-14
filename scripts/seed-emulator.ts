import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Point to Firestore Emulator if FIRESTORE_EMULATOR_HOST is set or default to local
process.env.FIRESTORE_EMULATOR_HOST = process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
process.env.GCLOUD_PROJECT = 'eurogovernance-test';

if (getApps().length === 0) {
  initializeApp({ projectId: 'eurogovernance-test' });
}

const db = getFirestore();

export async function seedEmulatorData() {
  console.log('🚀 Seeding euroGovernance Firebase Emulator...');

  const tenantId = 'tenant_eurocorp_de';
  const now = new Date().toISOString();

  // 1. Seed Global Master Frameworks
  console.log('📦 Seeding Global Master Frameworks...');
  const frameworks = [
    {
      id: 'gdpr',
      code: 'GDPR',
      name: 'General Data Protection Regulation (EU 2016/679)',
      jurisdiction: 'EU',
      category: 'privacy',
      version: '2016/679',
      sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2016/679/oj',
      requirementsCount: 99,
      isActive: true,
    },
    {
      id: 'eu_ai_act',
      code: 'EU-AI-ACT',
      name: 'EU Artificial Intelligence Act (EU 2024/1689)',
      jurisdiction: 'EU',
      category: 'ai_governance',
      version: '2024/1689',
      sourceUrl: 'https://eur-lex.europa.eu/eli/reg/2024/1689/oj',
      requirementsCount: 113,
      isActive: true,
    },
    {
      id: 'iso_27001',
      code: 'ISO-27001',
      name: 'ISO/IEC 27001:2022 Information Security',
      jurisdiction: 'International',
      category: 'security',
      version: '2022',
      sourceUrl: 'https://www.iso.org/standard/27001',
      requirementsCount: 93,
      isActive: true,
    },
  ];

  for (const fw of frameworks) {
    await db.doc(`frameworks/${fw.id}`).set(fw);
  }

  // 2. Seed Master Requirements & Controls
  await db.doc('frameworks/gdpr/requirements/art_30').set({
    id: 'art_30',
    frameworkId: 'gdpr',
    clauseNumber: 'Article 30',
    title: 'Records of Processing Activities (ROPA)',
    description: 'Each controller shall maintain a record of processing activities under its responsibility.',
    category: 'governance',
    mandatory: true,
  });

  await db.doc('frameworks/eu_ai_act/requirements/art_14').set({
    id: 'art_14',
    frameworkId: 'eu_ai_act',
    clauseNumber: 'Article 14',
    title: 'Human Oversight',
    description: 'High-risk AI systems shall be designed and developed in such a way that they can be effectively overseen by natural persons.',
    category: 'technical_safeguards',
    mandatory: true,
  });

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

  // 4. Seed Memberships
  const members = [
    { userId: 'usr_admin_01', email: 'admin@eurocorp.de', displayName: 'Marcus Vance', role: 'tenant_admin' },
    { userId: 'usr_compliance_01', email: 'compliance@eurocorp.de', displayName: 'Elena Rostova', role: 'compliance_manager' },
    { userId: 'usr_privacy_01', email: 'dpo@eurocorp.de', displayName: 'Dr. Klaus Becker', role: 'privacy_manager' },
    { userId: 'usr_ai_01', email: 'ai-lead@eurocorp.de', displayName: 'Dr. Sarah Weber', role: 'ai_governance_manager' },
    { userId: 'usr_auditor_01', email: 'auditor@kpmg.de', displayName: 'Thomas Schmidt', role: 'auditor' },
    { userId: 'usr_contrib_01', email: 'dev-alex@eurocorp.de', displayName: 'Alex Chen', role: 'contributor' },
  ];

  for (const m of members) {
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

  // 7. Seed GDPR ROPA Entry
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
    thirdCountryTransfers: false,
    status: 'active',
    lastReviewedAt: now,
    nextReviewDueDate: new Date(Date.now() + 180 * 24 * 60 * 60 * 1000).toISOString(),
    ownerId: 'usr_privacy_01',
    createdAt: now,
    updatedAt: now,
    createdBy: 'usr_privacy_01',
    updatedBy: 'usr_privacy_01',
  });

  // 8. Seed EU AI Act AI System
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

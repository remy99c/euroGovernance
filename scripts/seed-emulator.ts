import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';

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
  const masterReqs = [
    { fw: 'gdpr', id: 'art_30', sectionCode: 'Art. 30', title: 'Records of Processing Activities (ROPA)', mandatory: true, category: 'governance' },
    { fw: 'gdpr', id: 'art_32', sectionCode: 'Art. 32', title: 'Security of Processing', mandatory: true, category: 'security' },
    { fw: 'gdpr', id: 'art_33', sectionCode: 'Art. 33', title: 'Notification of Personal Data Breach', mandatory: true, category: 'incident' },
    { fw: 'gdpr', id: 'art_35', sectionCode: 'Art. 35', title: 'Data Protection Impact Assessment (DPIA)', mandatory: true, category: 'assessment' },
    { fw: 'eu_ai_act', id: 'art_09', sectionCode: 'Art. 9', title: 'Risk Management System', mandatory: true, category: 'risk' },
    { fw: 'eu_ai_act', id: 'art_10', sectionCode: 'Art. 10', title: 'Data and Data Governance', mandatory: true, category: 'data' },
    { fw: 'eu_ai_act', id: 'art_13', sectionCode: 'Art. 13', title: 'Transparency and Information', mandatory: true, category: 'transparency' },
    { fw: 'eu_ai_act', id: 'art_14', sectionCode: 'Art. 14', title: 'Human Oversight', mandatory: true, category: 'governance' },
    { fw: 'eu_ai_act', id: 'art_72', sectionCode: 'Art. 72', title: 'Post-Market Monitoring', mandatory: true, category: 'monitoring' },
    { fw: 'iso_27001', id: 'annex_a51', sectionCode: 'A.5.1', title: 'Policies for Information Security', mandatory: true, category: 'organizational' },
    { fw: 'iso_27001', id: 'annex_a81', sectionCode: 'A.8.1', title: 'User Endpoint Devices', mandatory: true, category: 'technological' },
    { fw: 'iso_27001', id: 'annex_a82', sectionCode: 'A.8.2', title: 'Privileged Access Rights', mandatory: true, category: 'technological' },
    { fw: 'iso_27001', id: 'annex_a824', sectionCode: 'A.8.24', title: 'Use of Cryptography', mandatory: true, category: 'technological' },
  ];

  for (const r of masterReqs) {
    await db.doc(`frameworks/${r.fw}/requirements/${r.id}`).set({
      id: r.id,
      frameworkId: r.fw,
      sectionCode: r.sectionCode,
      title: r.title,
      description: `Official statutory guidance for ${r.title}.`,
      isMandatory: r.mandatory,
      category: r.category,
      guidanceText: `Implementation guidance for ${r.sectionCode}.`,
      sortOrder: 1,
    });
  }

  const masterControls = [
    { fw: 'gdpr', id: 'ctl_master_gdpr_art30', code: 'CTL-GDPR-30', title: 'ROPA Register Maintenance', domain: 'privacy', desc: 'Maintain and review Article 30 ROPA entries.', reqId: 'art_30' },
    { fw: 'gdpr', id: 'ctl_master_gdpr_art32', code: 'CTL-GDPR-32', title: 'Encryption at Rest and in Transit', domain: 'security', desc: 'Enforce AES-256 and TLS 1.3 across data repositories.', reqId: 'art_32' },
    { fw: 'gdpr', id: 'ctl_master_gdpr_art33', code: 'CTL-GDPR-33', title: '72-Hour Breach Escalation Protocol', domain: 'incident', desc: 'Execute incident response and supervisory notification within 72 hours.', reqId: 'art_33' },
    { fw: 'gdpr', id: 'ctl_master_gdpr_art35', code: 'CTL-GDPR-35', title: 'DPIA Mandatory Screening', domain: 'privacy', desc: 'Screen processing operations for high risk and execute DPIA.', reqId: 'art_35' },
    { fw: 'eu_ai_act', id: 'ctl_master_aia_art09', code: 'CTL-AIA-09', title: 'Continuous AI Risk Management', domain: 'ai_governance', desc: 'Systematic identification and evaluation of AI risks across lifecycle.', reqId: 'art_09' },
    { fw: 'eu_ai_act', id: 'ctl_master_aia_art10', code: 'CTL-AIA-10', title: 'Training Data Governance & Bias Audits', domain: 'ai_governance', desc: 'Audit training, validation, and test datasets for bias and data hygiene.', reqId: 'art_10' },
    { fw: 'eu_ai_act', id: 'ctl_master_aia_art13', code: 'CTL-AIA-13', title: 'AI Transparency & Instructions for Use', domain: 'ai_governance', desc: 'Provide clear documentation and instructions for deployers.', reqId: 'art_13' },
    { fw: 'eu_ai_act', id: 'ctl_master_aia_art14', code: 'CTL-AIA-14', title: 'Dual-Key Human-in-the-Loop Oversight', domain: 'ai_governance', desc: 'Design operational stops and human override mechanisms for high-risk AI.', reqId: 'art_14' },
    { fw: 'eu_ai_act', id: 'ctl_master_aia_art72', code: 'CTL-AIA-72', title: 'Post-Market AI Performance Monitoring', domain: 'monitoring', desc: 'Collect and analyze continuous post-market runtime logs.', reqId: 'art_72' },
    { fw: 'iso_27001', id: 'ctl_master_iso_a51', code: 'A.5.1', title: 'Information Security Policy Suite', domain: 'governance', desc: 'Annual executive review and sign-off of security policies.', reqId: 'annex_a51' },
    { fw: 'iso_27001', id: 'ctl_master_iso_a81', code: 'A.8.1', title: 'Managed Device Endpoint Security', domain: 'endpoint', desc: 'Enforce MDM, disk encryption, and EDR on all devices.', reqId: 'annex_a81' },
    { fw: 'iso_27001', id: 'ctl_master_iso_a82', code: 'A.8.2', title: 'Privileged Access Just-In-Time Elevation', domain: 'identity', desc: 'Restrict administrative access with MFA and audit logging.', reqId: 'annex_a82' },
    { fw: 'iso_27001', id: 'ctl_master_iso_a824', code: 'A.8.24', title: 'Cryptographic Key Management Lifecycle', domain: 'security', desc: 'Manage KMS key rotation, storage, and HSM backing.', reqId: 'annex_a824' },
  ];

  for (const mc of masterControls) {
    await db.doc(`frameworks/${mc.fw}/master_controls/${mc.id}`).set({
      id: mc.id,
      frameworkId: mc.fw,
      code: mc.code,
      title: mc.title,
      description: mc.desc,
      domain: mc.domain,
      recommendedFrequencyDays: 90,
    });
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

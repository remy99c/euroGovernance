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
  SystemAsset,
  ProcessorProfile,
  buildSystemProcessorView,
  buildProcessorSystemView,
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.privacyA.uid}`).set({
      userId: PERSONAS.privacyA.uid,
      tenantId: tenantA,
      role: PERSONAS.privacyA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
      userId: PERSONAS.securityA.uid,
      tenantId: tenantA,
      role: PERSONAS.securityA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Processor Profiles Tenant A
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_aws_frankfurt`).set({
      id: 'prof_aws_frankfurt',
      tenantId: tenantA,
      vendorId: 'vnd_aws_emea',
      engagementName: 'Core Cloud Infrastructure & Object Storage',
      processorRole: 'data_processor',
      serviceDescription: 'EU-central-1 compute and encrypted S3 bucket storage',
      dataCategories: ['user_credentials', 'transaction_records'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE'],
      linkedSystemAssetIds: ['asset_app_cluster'],
      systemAssetRelationships: [
        {
          systemAssetId: 'asset_app_cluster',
          relationshipType: 'hosting',
          relationshipDescription: 'Kubernetes container runtime and persistent volume storage',
        },
      ],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'semi_annually',
      lastReviewDate: null,
      nextReviewDate: '2027-02-15T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-01T00:00:00.000Z',
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    await db.doc(`tenants/${tenantA}/processor_profiles/prof_openai_eu`).set({
      id: 'prof_openai_eu',
      tenantId: tenantA,
      vendorId: 'vnd_openai_ireland',
      engagementName: 'Enterprise LLM API Services',
      processorRole: 'data_processor',
      serviceDescription: 'Zero Data Retention API for document intelligence',
      dataCategories: ['support_transcripts', 'feedback_text'],
      dataSubjects: ['customers', 'employees'],
      isSpecialCategoryData: false,
      jurisdictions: ['IE', 'SE'],
      linkedSystemAssetIds: ['asset_app_cluster'],
      systemAssetRelationships: [
        {
          systemAssetId: 'asset_app_cluster',
          relationshipType: 'ai_provider',
          relationshipDescription: 'Generative summarization backend via secure API endpoint',
        },
      ],
      criticality: 'high',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'quarterly',
      lastReviewDate: null,
      nextReviewDate: '2026-11-15T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-02-10T00:00:00.000Z',
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    });

    // 5. Seed System Asset Tenant A
    await db.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).set({
      id: 'asset_app_cluster',
      tenantId: tenantA,
      name: 'EuroCorp Core Platform Cluster',
      assetType: 'cloud_infrastructure',
      criticality: 'mission_critical',
      dataClassification: 'restricted_personal',
      hostingLocation: 'eu-central-1 Frankfurt',
      vendorId: 'vnd_aws_emea',
      containsPersonalData: true,
      containsSpecialCategoryData: false,
      containsTrainingData: false,
      processorProfileIds: ['prof_aws_frankfurt', 'prof_openai_eu'],
      processorRelationships: [
        {
          processorProfileId: 'prof_aws_frankfurt',
          relationshipType: 'hosting',
          relationshipDescription: 'Kubernetes container runtime and persistent volume storage',
        },
        {
          processorProfileId: 'prof_openai_eu',
          relationshipType: 'ai_provider',
          relationshipDescription: 'Generative summarization backend via secure API endpoint',
        },
      ],
      status: 'active',
      ownerId: PERSONAS.securityA.uid,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
    });
  });
});

describe('Processor Profiles & System Assets Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  const asset1: SystemAsset = {
    id: 'asset_app_cluster',
    tenantId: tenantA,
    name: 'EuroCorp Core Platform Cluster',
    assetType: 'cloud_infrastructure',
    criticality: 'mission_critical',
    dataClassification: 'restricted_personal',
    hostingLocation: 'eu-central-1 Frankfurt',
    vendorId: 'vnd_aws_emea',
    containsPersonalData: true,
    containsSpecialCategoryData: false,
    containsTrainingData: false,
    processorProfileIds: ['prof_aws_frankfurt', 'prof_openai_eu'],
    processorRelationships: [
      {
        processorProfileId: 'prof_aws_frankfurt',
        relationshipType: 'hosting',
        relationshipDescription: 'Primary hosting and compute cluster',
      },
      {
        processorProfileId: 'prof_openai_eu',
        relationshipType: 'ai_provider',
        relationshipDescription: 'Embedded LLM summarization pipeline',
      },
    ],
    status: 'active',
    ownerId: PERSONAS.securityA.uid,
    createdAt: now,
    updatedAt: now,
    createdBy: PERSONAS.securityA.uid,
    updatedBy: PERSONAS.securityA.uid,
  };

  const profAws: ProcessorProfile = {
    id: 'prof_aws_frankfurt',
    tenantId: tenantA,
    vendorId: 'vnd_aws_emea',
    engagementName: 'Core Cloud Infrastructure',
    processorRole: 'data_processor',
    serviceDescription: 'Hosting',
    dataCategories: ['credentials'],
    dataSubjects: ['customers'],
    isSpecialCategoryData: false,
    jurisdictions: ['DE'],
    linkedSystemAssetIds: ['asset_app_cluster'],
    systemAssetRelationships: [
      {
        systemAssetId: 'asset_app_cluster',
        relationshipType: 'hosting',
        relationshipDescription: 'Primary hosting and compute cluster',
      },
    ],
    criticality: 'critical',
    ownerUserId: PERSONAS.privacyA.uid,
    reviewCadence: 'semi_annually',
    lastReviewDate: null,
    nextReviewDate: null,
    status: 'active',
    dpaSigned: true,
    dpaDate: '2026-01-01',
    notes: null,
    createdAt: now,
    updatedAt: now,
    createdBy: PERSONAS.privacyA.uid,
    updatedBy: PERSONAS.privacyA.uid,
    ownerId: PERSONAS.privacyA.uid,
  };

  const profOpenAI: ProcessorProfile = {
    id: 'prof_openai_eu',
    tenantId: tenantA,
    vendorId: 'vnd_openai_ireland',
    engagementName: 'Enterprise LLM API Services',
    processorRole: 'data_processor',
    serviceDescription: 'AI generation',
    dataCategories: ['support_transcripts'],
    dataSubjects: ['customers'],
    isSpecialCategoryData: false,
    jurisdictions: ['IE'],
    linkedSystemAssetIds: ['asset_app_cluster'],
    systemAssetRelationships: [
      {
        systemAssetId: 'asset_app_cluster',
        relationshipType: 'ai_provider',
        relationshipDescription: 'Embedded LLM summarization pipeline',
      },
    ],
    criticality: 'high',
    ownerUserId: PERSONAS.privacyA.uid,
    reviewCadence: 'quarterly',
    lastReviewDate: null,
    nextReviewDate: null,
    status: 'active',
    dpaSigned: true,
    dpaDate: '2026-02-10',
    notes: null,
    createdAt: now,
    updatedAt: now,
    createdBy: PERSONAS.privacyA.uid,
    updatedBy: PERSONAS.privacyA.uid,
    ownerId: PERSONAS.privacyA.uid,
  };

  // ---------------------------------------------------------------------------
  // 1. Reverse Visibility & Relationship Metadata
  // ---------------------------------------------------------------------------
  describe('1. Many-to-Many Linkage & Reverse Visibility', () => {
    test('buildSystemProcessorView aggregates processors supporting a given system with typed relationships', () => {
      const systemView = buildSystemProcessorView(asset1, [profAws, profOpenAI]);

      expect(systemView.systemAssetId).toBe('asset_app_cluster');
      expect(systemView.processorCount).toBe(2);

      const awsItem = systemView.processors.find((p) => p.processorProfileId === 'prof_aws_frankfurt');
      expect(awsItem).toBeDefined();
      expect(awsItem?.relationshipType).toBe('hosting');
      expect(awsItem?.dpaSigned).toBe(true);

      const aiItem = systemView.processors.find((p) => p.processorProfileId === 'prof_openai_eu');
      expect(aiItem).toBeDefined();
      expect(aiItem?.relationshipType).toBe('ai_provider');
    });

    test('buildProcessorSystemView aggregates systems supported by a given processor profile', () => {
      const processorView = buildProcessorSystemView(profAws, [asset1]);

      expect(processorView.processorProfileId).toBe('prof_aws_frankfurt');
      expect(processorView.systemCount).toBe(1);
      expect(processorView.systems[0]?.systemAssetId).toBe('asset_app_cluster');
      expect(processorView.systems[0]?.relationshipType).toBe('hosting');
      expect(processorView.systems[0]?.containsPersonalData).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. System Asset Security Rules & Multi-Tenant Isolation
  // ---------------------------------------------------------------------------
  describe('2. Security Rules & Multi-Tenant Isolation', () => {
    test('Privacy Officer can view system assets and update linked processor relationships in Tenant A', async () => {
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      const snap = await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).get()
      );
      expect(snap.exists).toBe(true);
      const data = snap.data() as SystemAsset;
      expect(data.processorProfileIds).toContain('prof_aws_frankfurt');
      expect(data.processorRelationships?.length).toBe(2);

      // Privacy officer updates hosting location
      await assertSucceeds(
        privDb.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).update({
          hostingLocation: 'eu-central-1 Frankfurt (Multi-AZ)',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.privacyA.uid,
        })
      );
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or modify Tenant A system assets or relationships', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/system_assets/asset_app_cluster`).update({
          name: 'Hacked Asset Name',
        })
      );
    });
  });
});

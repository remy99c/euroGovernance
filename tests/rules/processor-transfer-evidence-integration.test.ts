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
  TransferArrangement,
  Evidence,
  evaluateProcessorEvidenceCompleteness,
  evaluateTransferEvidenceCompleteness,
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
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      userId: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      role: PERSONAS.complianceA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.securityA.uid}`).set({
      userId: PERSONAS.securityA.uid,
      tenantId: tenantA,
      role: PERSONAS.securityA.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.contributorA.uid}`).set({
      userId: PERSONAS.contributorA.uid,
      tenantId: tenantA,
      role: PERSONAS.contributorA.role,
      status: 'active',
    });

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });

    // 4. Seed Processor Profile
    await db.doc(`tenants/${tenantA}/processor_profiles/prof_aws_emea`).set({
      id: 'prof_aws_emea',
      tenantId: tenantA,
      vendorId: 'vnd_aws_inc',
      engagementName: 'AWS EMEA Cloud Infrastructure',
      processorRole: 'data_processor',
      serviceDescription: 'Cloud computing infrastructure',
      dataCategories: ['user_credentials', 'system_telemetry'],
      dataSubjects: ['employees', 'customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE', 'IE', 'US'],
      linkedSystemAssetIds: ['asset_cloud_vpc'],
      criticality: 'critical',
      ownerUserId: PERSONAS.securityA.uid,
      reviewCadence: 'annually',
      status: 'active',
      dpaSigned: true,
      linkedDpaEvidenceId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
      ownerId: PERSONAS.securityA.uid,
    });

    // 5. Seed Transfer Arrangement
    await db.doc(`tenants/${tenantA}/transfer_arrangements/trans_aws_us_support`).set({
      id: 'trans_aws_us_support',
      tenantId: tenantA,
      processorProfileId: 'prof_aws_emea',
      vendorId: 'vnd_aws_inc',
      name: 'AWS Global 24/7 Support Escalation',
      restrictedTransfer: true,
      destinationCountries: ['US'],
      eeaStatus: 'third_country_non_adequate',
      transferScopes: ['support_access', 'maintenance'],
      transferMechanismType: 'standard_contractual_clauses',
      transferMechanismStatus: 'active_valid',
      effectiveDate: '2026-01-01T00:00:00.000Z',
      reviewDueDate: '2027-01-01T00:00:00.000Z',
      supplementaryMeasuresSummary: 'Client-side customer managed KMS keys',
      subprocessorInvolvement: true,
      subprocessorsInvolved: ['AWS Ireland', 'AWS Inc USA'],
      linkedTiaId: 'tia_aws_2026',
      linkedEvidenceIds: [],
      rationale: 'Follow the sun engineering support',
      notes: null,
      status: 'active_valid',
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.securityA.uid,
      updatedBy: PERSONAS.securityA.uid,
      ownerId: PERSONAS.securityA.uid,
    });
  });
});

describe('Processor & Transfer Evidence Repository Integration Suite', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. Missing Evidence Gap Analysis & Indicators
  // ---------------------------------------------------------------------------
  describe('1. Missing Required Evidence Indicators & Gap Analysis', () => {
    const criticalProcessor: ProcessorProfile = {
      id: 'prof_salesforce_eu',
      tenantId: tenantA,
      vendorId: 'vnd_salesforce_inc',
      engagementName: 'Core CRM Engagement',
      processorRole: 'data_processor',
      serviceDescription: 'Sales CRM',
      dataCategories: ['contact_details'],
      dataSubjects: ['customers'],
      isSpecialCategoryData: false,
      jurisdictions: ['DE', 'US'],
      linkedSystemAssetIds: [],
      criticality: 'critical',
      ownerUserId: PERSONAS.privacyA.uid,
      reviewCadence: 'annually',
      lastReviewDate: null,
      nextReviewDate: '2027-08-15T00:00:00.000Z',
      status: 'active',
      dpaSigned: true,
      dpaDate: '2026-01-01T00:00:00.000Z',
      linkedDpaEvidenceId: null,
      notes: null,
      createdAt: now,
      updatedAt: now,
      createdBy: PERSONAS.privacyA.uid,
      updatedBy: PERSONAS.privacyA.uid,
      ownerId: PERSONAS.privacyA.uid,
    };

    test('flags missing DPA and missing security assurance for critical processor when no evidence is linked', () => {
      const completeness = evaluateProcessorEvidenceCompleteness(criticalProcessor, [], now);

      expect(completeness.isComplete).toBe(false);
      expect(completeness.missingCount).toBe(2);
      expect(completeness.satisfiedCount).toBe(0);

      const dpaReq = completeness.requirements.find((r) => r.key === 'dpa');
      expect(dpaReq?.status).toBe('missing');

      const secReq = completeness.requirements.find((r) => r.key === 'security_assurance');
      expect(secReq?.status).toBe('missing');
    });

    test('satisfies requirements when valid DPA and SOC2 evidence artifacts are linked', () => {
      const dpaEvidence: Evidence = {
        id: 'evi_sf_dpa_signed',
        tenantId: tenantA,
        title: 'Salesforce Signed GDPR Article 28 DPA',
        description: 'Countersigned DPA including controller-to-processor commitments',
        category: 'dpa',
        status: 'valid',
        storagePath: `tenants/${tenantA}/evidence/evi_sf_dpa_signed/v1/dpa.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        processorProfileIds: ['prof_salesforce_eu'],
        transferArrangementIds: [],
        vendorIds: ['vnd_salesforce_inc'],
        collectedAt: now,
        reviewDueDate: '2027-08-15T00:00:00.000Z',
        reviewedBy: PERSONAS.complianceA.uid,
        reviewedAt: now,
        rejectionReason: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const soc2Evidence: Evidence = {
        id: 'evi_sf_soc2_type2',
        tenantId: tenantA,
        title: 'Salesforce SOC 2 Type II Security & Availability Report',
        description: 'Independent audit report covering trust services criteria',
        category: 'soc_report',
        status: 'valid',
        storagePath: `tenants/${tenantA}/evidence/evi_sf_soc2_type2/v1/soc2.pdf`,
        fileSizeBytes: 2097152,
        mimeType: 'application/pdf',
        fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        processorProfileIds: ['prof_salesforce_eu'],
        transferArrangementIds: [],
        vendorIds: ['vnd_salesforce_inc'],
        collectedAt: now,
        reviewDueDate: '2027-08-15T00:00:00.000Z',
        reviewedBy: PERSONAS.securityA.uid,
        reviewedAt: now,
        rejectionReason: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.securityA.uid,
        updatedBy: PERSONAS.securityA.uid,
        ownerId: PERSONAS.securityA.uid,
      };

      const completeness = evaluateProcessorEvidenceCompleteness(
        criticalProcessor,
        [dpaEvidence, soc2Evidence],
        now
      );

      expect(completeness.isComplete).toBe(true);
      expect(completeness.missingCount).toBe(0);
      expect(completeness.satisfiedCount).toBe(2);
      expect(completeness.requirements.every((r) => r.status === 'satisfied')).toBe(true);
    });

    test('flags expired evidence when reviewDueDate has passed', () => {
      const expiredDpaEvidence: Evidence = {
        id: 'evi_dpa_old',
        tenantId: tenantA,
        title: 'Old DPA',
        description: 'Expired agreement',
        category: 'dpa',
        status: 'valid',
        storagePath: `tenants/${tenantA}/evidence/evi_dpa_old/v1/dpa.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: '1111111111111111111111111111111111111111111111111111111111111111',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        processorProfileIds: ['prof_salesforce_eu'],
        reviewDueDate: '2025-01-01T00:00:00.000Z', // Past!
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        currentVersion: 1,
        collectedAt: '2024-01-01T00:00:00.000Z',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const completeness = evaluateProcessorEvidenceCompleteness(criticalProcessor, [expiredDpaEvidence], now);
      const dpaReq = completeness.requirements.find((r) => r.key === 'dpa');
      expect(dpaReq?.status).toBe('expired');
      expect(completeness.isComplete).toBe(false);
    });

    test('evaluates transfer arrangement requirements (SCC & Subprocessor list)', () => {
      const sccTransfer: TransferArrangement = {
        id: 'trans_scc_test',
        tenantId: tenantA,
        processorProfileId: 'prof_salesforce_eu',
        vendorId: 'vnd_salesforce_inc',
        name: 'Salesforce US Analytics',
        restrictedTransfer: true,
        destinationCountries: ['US'],
        eeaStatus: 'third_country_non_adequate',
        transferScopes: ['analytics'],
        transferMechanismType: 'standard_contractual_clauses',
        transferMechanismStatus: 'active_valid',
        effectiveDate: '2026-01-01T00:00:00.000Z',
        reviewDueDate: '2027-01-01T00:00:00.000Z',
        supplementaryMeasuresSummary: 'TLS 1.3',
        subprocessorInvolvement: true,
        linkedTiaId: 'tia_1',
        linkedEvidenceIds: [],
        rationale: null,
        notes: null,
        status: 'active_valid',
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // 1. Initially missing both SCC and Subprocessor List
      const completeness1 = evaluateTransferEvidenceCompleteness(sccTransfer, [], now);
      expect(completeness1.isComplete).toBe(false);
      expect(completeness1.missingCount).toBe(2);

      // 2. Add signed SCC evidence
      const sccEvidence: Evidence = {
        id: 'evi_scc_signed',
        tenantId: tenantA,
        title: 'Executed EU SCC 2021/914 Module 2',
        description: 'Signed standard contractual clauses',
        category: 'scc',
        status: 'valid',
        storagePath: `tenants/${tenantA}/evidence/evi_scc_signed/v1/scc.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: '2222222222222222222222222222222222222222222222222222222222222222',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        transferArrangementIds: ['trans_scc_test'],
        collectedAt: now,
        reviewDueDate: '2027-08-15T00:00:00.000Z',
        reviewedBy: PERSONAS.privacyA.uid,
        reviewedAt: now,
        rejectionReason: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      // 3. Add Subprocessor List evidence
      const subListEvidence: Evidence = {
        id: 'evi_subprocessors',
        tenantId: tenantA,
        title: 'Salesforce Authorised Subprocessors List Q3 2026',
        description: 'Published subprocessor audit list',
        category: 'subprocessor_list',
        status: 'valid',
        storagePath: `tenants/${tenantA}/evidence/evi_subprocessors/v1/subs.pdf`,
        fileSizeBytes: 524288,
        mimeType: 'application/pdf',
        fileHashSha256: '3333333333333333333333333333333333333333333333333333333333333333',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        transferArrangementIds: ['trans_scc_test'],
        collectedAt: now,
        reviewDueDate: '2027-08-15T00:00:00.000Z',
        reviewedBy: PERSONAS.privacyA.uid,
        reviewedAt: now,
        rejectionReason: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.privacyA.uid,
        updatedBy: PERSONAS.privacyA.uid,
        ownerId: PERSONAS.privacyA.uid,
      };

      const completeness2 = evaluateTransferEvidenceCompleteness(
        sccTransfer,
        [sccEvidence, subListEvidence],
        now
      );
      expect(completeness2.isComplete).toBe(true);
      expect(completeness2.satisfiedCount).toBe(2);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Evidence Repository & Versioning RBAC
  // ---------------------------------------------------------------------------
  describe('2. Evidence Repository & Versioning Security Rules', () => {
    test('Security Officer evidence metadata mutations require trusted upload commands', async () => {
      const securityDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      const evidenceId = 'evi_iso27001_aws';
      const evidenceDoc: Evidence = {
        id: evidenceId,
        tenantId: tenantA,
        title: 'AWS ISO 27001:2022 Global Certificate',
        description: 'Certified ISMS for European & Global AWS Regions',
        category: 'iso_certificate',
        status: 'under_review',
        storagePath: `tenants/${tenantA}/evidence/${evidenceId}/v1/iso27001.pdf`,
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: 'aabbccddeeff00112233445566778899aabbccddeeff00112233445566778899',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        processorProfileIds: ['prof_aws_emea'],
        transferArrangementIds: ['trans_aws_us_support'],
        vendorIds: ['vnd_aws_inc'],
        collectedAt: now,
        reviewDueDate: '2027-08-15T00:00:00.000Z',
        reviewedBy: null,
        reviewedAt: null,
        rejectionReason: null,
        currentVersion: 1,
        createdAt: now,
        updatedAt: now,
        createdBy: PERSONAS.securityA.uid,
        updatedBy: PERSONAS.securityA.uid,
        ownerId: PERSONAS.securityA.uid,
      };

      await assertFails(
        securityDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).set(evidenceDoc)
      );
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/evidence/${evidenceId}`).set(evidenceDoc);
      });

      // Verify read by Privacy Manager
      const privacyDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();
      const snap = await assertSucceeds(privacyDb.doc(`tenants/${tenantA}/evidence/${evidenceId}`).get());
      expect(snap.data()?.category).toBe('iso_certificate');
      expect(snap.data()?.processorProfileIds).toContain('prof_aws_emea');
      expect(snap.data()?.transferArrangementIds).toContain('trans_aws_us_support');
    });

    test('Cross-tenant isolation: Tenant B admin cannot read or write Tenant A evidence', async () => {
      const adminBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/evidence/evi_iso27001_aws`).get()
      );

      await assertFails(
        adminBDb.doc(`tenants/${tenantA}/evidence/evi_malicious_injected`).set({
          id: 'evi_malicious_injected',
          tenantId: tenantA,
          title: 'Unauthorized inject',
        })
      );
    });
  });
});

import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import {
  ProcessorCertification,
  validateProcessorCertification,
  evaluateProcessorCertificationCompleteness,
  evaluateProcessorCertificationRiskFlags,
  evaluateProcessorCertificationReminders,
  findEvidenceForProcessorCertification,
  findProcessorCertificationsForEvidence,
  getAssuranceTaxonomy,
  getAssuranceDisplayName,
  getAssuranceArtifactKindLabel,
  validateAssuranceMetadataRules,
  validateProcessorCertificationReviewTransition,
  VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES,
  VALID_ASSURANCE_STANDARD_FAMILIES,
  VALID_ASSURANCE_ARTIFACT_KINDS,
  VALID_EVIDENCE_CATEGORIES,
  type Evidence,
  type ProcessorProfile,
  type Control,
  type SystemAsset,
  type Vendor,
  synthesizeProcessorAssuranceInventory,
  filterProcessorAssuranceInventory,
  summarizeProcessorAssuranceInventory,
  findProcessorCertificationsForControl,
  findControlsForProcessorCertification,
  evaluateControlProcessorAssuranceSupport,
  mapProcessorsToControlsAssuranceMatrix,
} from '@eurogovernance/shared-types';
import { getFirestoreRules } from './fixtures/test-factories.js';

const PROJECT_ID = 'eurogov-processor-cert-test';

describe('ProcessorCertifications Schema, Validation, Security Rules & Integrity Tests', () => {
  let testEnv: RulesTestEnvironment;

  beforeAll(async () => {
    const rules = getFirestoreRules();
    testEnv = await initializeTestEnvironment({
      projectId: PROJECT_ID,
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

    // Setup base tenants and memberships
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Tenant A (EuroCorp DE)
      await db.doc('tenants/tenant_eurocorp_de').set({
        id: 'tenant_eurocorp_de',
        name: 'EuroCorp Technologies SE',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_admin_01').set({
        id: 'usr_admin_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_admin_01',
        role: 'tenant_admin',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_privacy_01').set({
        id: 'usr_privacy_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_privacy_01',
        role: 'privacy_manager',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_compliance_01').set({
        id: 'usr_compliance_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_compliance_01',
        role: 'compliance_manager',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_auditor_01').set({
        id: 'usr_auditor_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_auditor_01',
        role: 'auditor',
        status: 'active',
      });

      // Tenant B (Nordic Health SE)
      await db.doc('tenants/tenant_nordic_se').set({
        id: 'tenant_nordic_se',
        name: 'Nordic AI Health AB',
        status: 'active',
      });
      await db.doc('tenants/tenant_nordic_se/memberships/usr_nordic_admin').set({
        id: 'usr_nordic_admin',
        tenantId: 'tenant_nordic_se',
        userId: 'usr_nordic_admin',
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Vendor & Processor Profile in Tenant A
      await db.doc('tenants/tenant_eurocorp_de/vendors/vnd_aws_emea').set({
        id: 'vnd_aws_emea',
        tenantId: 'tenant_eurocorp_de',
        name: 'Amazon Web Services EMEA SARL',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/processor_profiles/prof_aws_hosting').set({
        id: 'prof_aws_hosting',
        tenantId: 'tenant_eurocorp_de',
        vendorId: 'vnd_aws_emea',
        processorRole: 'data_processor',
        serviceDescription: 'Core hosting infrastructure',
        status: 'active',
      });
    });
  });

  describe('1. Schema Validation & Business Rules', () => {
    it('validates a complete ISO 27001 processor certification record', () => {
      const validPayload: Partial<ProcessorCertification> = {
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        vendorId: 'vnd_aws_emea',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'TÜV Rheinland Cert GmbH',
        certificateOrReportNumber: '01 104 219804',
        validFrom: '2025-06-01T00:00:00.000Z',
        validUntil: '2028-05-31T23:59:59.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Operation and maintenance of AWS European Cloud Regions',
        legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL (Frankfurt, Dublin)',
        systemsOrServicesCovered: ['Compute', 'Storage', 'Networking', 'Security'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2026-06-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_iso_cert'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
      };

      const result = validateProcessorCertification(validPayload);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('validates a SOC 2 Type II attestation with report period dates', () => {
      const validSoc2: Partial<ProcessorCertification> = {
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        vendorId: 'vnd_aws_emea',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PricewaterhouseCoopers LLP',
        certificateOrReportNumber: 'PWC-SOC2-2025-AWS',
        reportPeriodStart: '2024-10-01T00:00:00.000Z',
        reportPeriodEnd: '2025-09-30T23:59:59.000Z',
        validFrom: '2025-10-15T00:00:00.000Z',
        validUntil: '2026-10-14T23:59:59.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Trust Services Criteria for Security, Availability, and Confidentiality',
        legalEntityOrRegionalScope: 'Global Cloud Infrastructure',
        systemsOrServicesCovered: ['Core Cloud Compute & Storage Services'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2026-08-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_soc2_report'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
      };

      const result = validateProcessorCertification(validSoc2);
      expect(result.valid).toBe(true);
    });

    it('rejects invalid payload missing mandatory relationship and date fields', () => {
      const invalidPayload = {
        tenantId: '',
        processorProfileId: '',
        artifactKind: 'unknown_kind',
        standardFamily: 'unknown_standard',
        validFrom: '2028-01-01',
        validUntil: '2025-01-01', // validFrom > validUntil
        reportPeriodStart: '2026-01-01',
        reportPeriodEnd: '2025-01-01', // start > end
        unresolvedFindingsCount: -3,
        hasMajorDeficiencies: 'not_a_boolean',
      };

      const result = validateProcessorCertification(invalidPayload);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e: string) => e.includes('processorProfileId'))).toBe(true);
      expect(result.errors.some((e: string) => e.includes('validFrom date cannot be after validUntil'))).toBe(true);
      expect(result.errors.some((e: string) => e.includes('reportPeriodStart cannot be after reportPeriodEnd'))).toBe(true);
      expect(result.errors.some((e: string) => e.includes('unresolvedFindingsCount'))).toBe(true);
    });
  });

  describe('2. Multi-Tenant Security Rules & RBAC', () => {
    it('allows privacy_manager to create processor certification under their tenant', async () => {
      const privacyCtx = testEnv.authenticatedContext('usr_privacy_01');
      const db = privacyCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_iso');

      await assertSucceeds(
        certRef.set({
          id: 'cert_aws_iso',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          vendorId: 'vnd_aws_emea',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'TÜV Rheinland',
          certificateOrReportNumber: '01 104 219804',
          validFrom: '2025-06-01T00:00:00.000Z',
          validUntil: '2028-05-31T23:59:59.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'AWS European Infrastructure',
          legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
          systemsOrServicesCovered: ['Compute', 'Storage'],
          reviewOwnerUserId: 'usr_privacy_01',
          reviewStatus: 'accepted',
          reviewDueDate: '2026-06-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          ownerId: 'usr_privacy_01',
          createdBy: 'usr_privacy_01',
          updatedBy: 'usr_privacy_01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    });

    it('allows compliance_manager to update processor certification review status', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_soc2').set({
          id: 'cert_aws_soc2',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          reviewStatus: 'in_review',
          status: 'active_valid',
        });
      });

      const compCtx = testEnv.authenticatedContext('usr_compliance_01');
      const db = compCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_soc2');

      await assertSucceeds(
        certRef.update({
          reviewStatus: 'accepted',
          notes: 'SOC 2 Type II report reviewed and verified with clean opinion.',
          updatedBy: 'usr_compliance_01',
          updatedAt: new Date().toISOString(),
        })
      );
    });

    it('allows auditor to read processor certifications but strictly denies writes', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_soc2').set({
          id: 'cert_aws_soc2',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          status: 'active_valid',
        });
      });

      const auditorCtx = testEnv.authenticatedContext('usr_auditor_01');
      const db = auditorCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_soc2');

      await assertSucceeds(certRef.get());
      await assertFails(
        certRef.update({
          status: 'expired',
        })
      );
    });

    it('strictly enforces multi-tenant boundary (Tenant B cannot read or write Tenant A processor certifications)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/processor_certifications/cert_secret').set({
          id: 'cert_secret',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          status: 'active_valid',
        });
      });

      const nordicAdminCtx = testEnv.authenticatedContext('usr_nordic_admin');
      const db = nordicAdminCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/processor_certifications/cert_secret');

      await assertFails(certRef.get());
      await assertFails(
        certRef.set({
          id: 'cert_secret',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          status: 'active_valid',
        })
      );
    });
  });

  describe('3. Relationship Integrity, Completeness & Risk Evaluator', () => {
    it('evaluates complete processor certification when valid evidence is attached', () => {
      const cert: ProcessorCertification = {
        id: 'cert_datadog_soc2',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_datadog_monitoring',
        vendorId: 'vnd_datadog_us',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PricewaterhouseCoopers LLP',
        certificateOrReportNumber: 'DD-SOC2-2025',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Datadog Observability and APM platform',
        legalEntityOrRegionalScope: 'Datadog Inc. (US)',
        systemsOrServicesCovered: ['Logging', 'APM'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-11-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_dd_soc2_file'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_privacy_01',
        createdBy: 'usr_privacy_01',
        updatedBy: 'usr_privacy_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const evidenceDocs: Evidence[] = [
        {
          id: 'ev_dd_soc2_file',
          tenantId: 'tenant_eurocorp_de',
          title: 'Datadog 2025 SOC 2 Report',
          description: 'Type II Attestation',
          category: 'soc_report',
          status: 'valid',
          storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_dd_soc2_file/report.pdf',
          fileSizeBytes: 1048576,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash_123',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          collectedAt: '2025-01-01T00:00:00.000Z',
          reviewDueDate: '2026-01-01T00:00:00.000Z',
          reviewedBy: 'usr_privacy_01',
          reviewedAt: '2025-01-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: 'usr_privacy_01',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          createdBy: 'usr_privacy_01',
          updatedBy: 'usr_privacy_01',
        },
      ];

      const completeness = evaluateProcessorCertificationCompleteness(cert, evidenceDocs, new Date('2025-06-01'));
      expect(completeness.isComplete).toBe(true);
      expect(completeness.hasAttachedEvidence).toBe(true);
      expect(completeness.gaps.length).toBe(0);
    });

    it('identifies missing evidence and overdue review gaps', () => {
      const cert: ProcessorCertification = {
        id: 'cert_overdue',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'TÜV',
        certificateOrReportNumber: 'TUV-999',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Hosting',
        legalEntityOrRegionalScope: 'EMEA',
        systemsOrServicesCovered: ['SaaS'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'in_review',
        reviewDueDate: '2025-01-01T00:00:00.000Z', // Overdue relative to 2025-06-01
        linkedEvidenceIds: [], // Missing evidence
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_privacy_01',
        createdBy: 'usr_privacy_01',
        updatedBy: 'usr_privacy_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const completeness = evaluateProcessorCertificationCompleteness(cert, [], new Date('2025-06-01'));
      expect(completeness.isComplete).toBe(false);
      expect(completeness.hasAttachedEvidence).toBe(false);
      expect(completeness.isReviewOverdue).toBe(true);
      expect(completeness.gaps.some((g: any) => g.code === 'PROCESSOR_CERT_MISSING_EVIDENCE')).toBe(true);
      expect(completeness.gaps.some((g: any) => g.code === 'PROCESSOR_CERT_REVIEW_OVERDUE')).toBe(true);
    });

    it('generates risk flags and reminders for expiring and overdue processor certifications', () => {
      const certs: ProcessorCertification[] = [
        {
          id: 'cert_expiring',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_hosting',
          artifactKind: 'independent_attestation_report',
          standardFamily: 'soc2_type2',
          issuingBodyOrAuditor: 'PwC',
          certificateOrReportNumber: 'SOC-EXP-2025',
          validFrom: '2024-11-01T00:00:00.000Z',
          validUntil: '2025-11-25T00:00:00.000Z', // Expiring in 24 days relative to 2025-11-01
          status: 'active_valid',
          assuranceScopeSummary: 'Cloud Services',
          legalEntityOrRegionalScope: 'Global',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_compliance_01',
          reviewStatus: 'in_review',
          reviewDueDate: '2025-10-15T00:00:00.000Z', // Overdue review
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 1,
          hasMajorDeficiencies: false,
          ownerId: 'usr_compliance_01',
          createdBy: 'usr_compliance_01',
          updatedBy: 'usr_compliance_01',
          createdAt: '2024-11-01T00:00:00.000Z',
          updatedAt: '2024-11-01T00:00:00.000Z',
        },
      ];

      const asOf = new Date('2025-11-01T00:00:00.000Z');
      const flags = evaluateProcessorCertificationRiskFlags(certs, [], asOf);
      expect(flags.length).toBeGreaterThanOrEqual(2);
      expect(flags.some((f) => f.ruleCode === 'PROCESSOR_CERT_EXPIRING_SOON')).toBe(true);
      expect(flags.some((f) => f.ruleCode === 'PROCESSOR_CERT_MISSING_EVIDENCE')).toBe(true);

      const reminders = evaluateProcessorCertificationReminders(certs, { asOfDate: asOf, windowDays: 90 });
      expect(reminders.some((r) => r.reminderType === 'processor_cert_expiry_warning_30d')).toBe(true);
      expect(reminders.some((r) => r.reminderType === 'processor_cert_review_overdue')).toBe(true);
    });
  });

  describe('4. Assurance Taxonomy, Display Labels & Metadata Rules Engine', () => {
    it('supports all required minimum standards: ISO 27001, ISO 27701, SOC 2 Type II, SOC 2 Type I, ISO 22301, CSA STAR, Cyber Essentials, and custom/other', () => {
      const requiredStandards = [
        'iso_27001',
        'iso_27701',
        'soc2_type2',
        'soc2_type1',
        'iso_22301',
        'csa_star',
        'cyber_essentials_plus',
        'other',
      ];

      for (const std of requiredStandards) {
        expect(VALID_ASSURANCE_STANDARD_FAMILIES.includes(std as any)).toBe(true);
        const taxonomy = getAssuranceTaxonomy(std as any);
        expect(taxonomy).toBeDefined();
        expect(taxonomy.displayName).toBeTruthy();
        expect(taxonomy.shortLabel).toBeTruthy();
        expect(taxonomy.category).toBeTruthy();
      }
    });

    it('provides user-facing display labels for all artifact kinds', () => {
      const allKinds = VALID_ASSURANCE_ARTIFACT_KINDS;
      for (const kind of allKinds) {
        const label = getAssuranceArtifactKindLabel(kind);
        expect(label).toBeTruthy();
        expect(typeof label).toBe('string');
      }

      expect(getAssuranceArtifactKindLabel('accredited_certification')).toBe('Accredited Certification');
      expect(getAssuranceArtifactKindLabel('independent_attestation_report')).toBe('Independent Attestation Report');
      expect(getAssuranceArtifactKindLabel('regulatory_declaration')).toBe('Regulatory Declaration');
      expect(getAssuranceArtifactKindLabel('code_of_conduct')).toBe('Approved Code of Conduct');
    });

    it('enforces period-of-time report dates for SOC 2 Type II and BSI C5', () => {
      const soc2WithoutPeriod: Partial<ProcessorCertification> = {
        standardFamily: 'soc2_type2',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
      };

      const result = validateAssuranceMetadataRules(soc2WithoutPeriod);
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('reportPeriodStart is required'))).toBe(true);
      expect(result.errors.some((e) => e.includes('reportPeriodEnd is required'))).toBe(true);

      const soc2WithPeriod: Partial<ProcessorCertification> = {
        standardFamily: 'soc2_type2',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-15T00:00:00.000Z',
        validUntil: '2026-01-14T23:59:59.000Z',
      };

      const validResult = validateAssuranceMetadataRules(soc2WithPeriod);
      expect(validResult.valid).toBe(true);
    });

    it('allows point-in-time ISO 27001 certificates without report period', () => {
      const isoCert: Partial<ProcessorCertification> = {
        standardFamily: 'iso_27001',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2028-01-01T00:00:00.000Z',
      };

      const result = validateAssuranceMetadataRules(isoCert);
      expect(result.valid).toBe(true);
      expect(result.errors.length).toBe(0);
    });

    it('handles custom assurance types with required customStandardName', () => {
      // Missing customStandardName
      const customMissing: Partial<ProcessorCertification> = {
        standardFamily: 'other',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
      };
      const resultMissing = validateAssuranceMetadataRules(customMissing);
      expect(resultMissing.valid).toBe(false);
      expect(resultMissing.errors.some((e) => e.includes('customStandardName is required'))).toBe(true);

      // Valid customStandardName
      const customValid: Partial<ProcessorCertification> = {
        standardFamily: 'other',
        customStandardName: 'FinTech Custom Annual Penetration Assessment',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
      };
      const resultValid = validateAssuranceMetadataRules(customValid);
      expect(resultValid.valid).toBe(true);

      // Display name formatting
      expect(getAssuranceDisplayName('other', 'FinTech Custom Annual Penetration Assessment')).toBe(
        'FinTech Custom Annual Penetration Assessment'
      );
      expect(getAssuranceDisplayName('iso_27001')).toBe('ISO/IEC 27001:2022 (ISMS)');
    });

    it('strictly rejects invalid standard family and invalid artifact kind', () => {
      const invalidFamily = {
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        artifactKind: 'accredited_certification',
        standardFamily: 'bogus_unsupported_standard' as any,
        issuingBodyOrAuditor: 'TÜV',
        certificateOrReportNumber: '123',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Scope',
        legalEntityOrRegionalScope: 'EU',
        systemsOrServicesCovered: ['Compute'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'accepted',
        linkedEvidenceIds: [],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
      };

      const resultFamily = validateProcessorCertification(invalidFamily);
      expect(resultFamily.valid).toBe(false);
      expect(resultFamily.errors.some((e) => e.includes('standardFamily must be one of'))).toBe(true);

      const invalidKind = {
        ...invalidFamily,
        standardFamily: 'iso_27001' as const,
        artifactKind: 'bogus_kind' as any,
      };

      const resultKind = validateProcessorCertification(invalidKind);
      expect(resultKind.valid).toBe(false);
      expect(resultKind.errors.some((e) => e.includes('artifactKind must be one of'))).toBe(true);
    });
  });

  describe('5. Evidence Repository Integration, Multi-Evidence Linking & Reverse Lookups', () => {
    it('supports new processor assurance evidence categories in EvidenceCategory enum', () => {
      const assuranceCategories = [
        'iso_certificate',
        'soc_report',
        'security_report',
        'toms',
        'adequacy_support',
        'bridge_letter',
        'management_assertion',
        'penetration_test_report',
        'code_of_conduct_doc',
        'industry_label_evidence',
        'custom_assurance_doc',
      ];

      for (const cat of assuranceCategories) {
        expect(VALID_EVIDENCE_CATEGORIES.includes(cat as any)).toBe(true);
      }
    });

    it('resolves multiple evidence files attached to a single certification (e.g. SOC 2 Report + Bridge Letter + Management Assertion)', () => {
      const cert: ProcessorCertification = {
        id: 'cert_aws_soc2_multi',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        vendorId: 'vnd_aws_emea',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC LLP',
        certificateOrReportNumber: 'PWC-SOC2-2025',
        reportPeriodStart: '2024-10-01T00:00:00.000Z',
        reportPeriodEnd: '2025-09-30T23:59:59.000Z',
        validFrom: '2025-10-15T00:00:00.000Z',
        validUntil: '2026-10-14T23:59:59.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'AWS Trust Services Criteria',
        legalEntityOrRegionalScope: 'AWS Global',
        systemsOrServicesCovered: ['Compute', 'Storage'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2026-08-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_pdf', 'ev_bridge_letter', 'ev_mgmt_assertion'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-10-15T00:00:00.000Z',
        updatedAt: '2025-10-15T00:00:00.000Z',
      };

      const evidenceDocs: Evidence[] = [
        {
          id: 'ev_soc2_pdf',
          tenantId: 'tenant_eurocorp_de',
          title: 'AWS SOC 2 Type II Report 2025',
          description: 'Full audit opinion report',
          category: 'soc_report',
          status: 'valid',
          storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_soc2_pdf/report.pdf',
          fileSizeBytes: 5242880,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash_soc2',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          processorCertificationIds: ['cert_aws_soc2_multi'],
          collectedAt: '2025-10-15T00:00:00.000Z',
          reviewDueDate: '2026-10-14T00:00:00.000Z',
          reviewedBy: 'usr_compliance_01',
          reviewedAt: '2025-10-15T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: 'usr_compliance_01',
          createdAt: '2025-10-15T00:00:00.000Z',
          updatedAt: '2025-10-15T00:00:00.000Z',
          createdBy: 'usr_compliance_01',
          updatedBy: 'usr_compliance_01',
        },
        {
          id: 'ev_bridge_letter',
          tenantId: 'tenant_eurocorp_de',
          title: 'AWS Q4 2025 Bridge Letter',
          description: 'Gap letter covering period to year end',
          category: 'bridge_letter',
          status: 'valid',
          storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_bridge_letter/bridge.pdf',
          fileSizeBytes: 262144,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash_bridge',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          processorCertificationIds: ['cert_aws_soc2_multi'],
          collectedAt: '2025-10-20T00:00:00.000Z',
          reviewDueDate: '2026-10-14T00:00:00.000Z',
          reviewedBy: 'usr_compliance_01',
          reviewedAt: '2025-10-20T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: 'usr_compliance_01',
          createdAt: '2025-10-20T00:00:00.000Z',
          updatedAt: '2025-10-20T00:00:00.000Z',
          createdBy: 'usr_compliance_01',
          updatedBy: 'usr_compliance_01',
        },
        {
          id: 'ev_mgmt_assertion',
          tenantId: 'tenant_eurocorp_de',
          title: 'AWS Management Assertion on Controls',
          description: 'Executive management sign-off',
          category: 'management_assertion',
          status: 'valid',
          storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_mgmt_assertion/assertion.pdf',
          fileSizeBytes: 524288,
          mimeType: 'application/pdf',
          fileHashSha256: 'hash_assertion',
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          processorCertificationIds: ['cert_aws_soc2_multi'],
          collectedAt: '2025-10-15T00:00:00.000Z',
          reviewDueDate: '2026-10-14T00:00:00.000Z',
          reviewedBy: 'usr_compliance_01',
          reviewedAt: '2025-10-15T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: 'usr_compliance_01',
          createdAt: '2025-10-15T00:00:00.000Z',
          updatedAt: '2025-10-15T00:00:00.000Z',
          createdBy: 'usr_compliance_01',
          updatedBy: 'usr_compliance_01',
        },
      ];

      // 1. Multi-Evidence Resolution
      const resolved = findEvidenceForProcessorCertification(cert, evidenceDocs);
      expect(resolved.length).toBe(3);
      expect(resolved.map((e) => e.category)).toEqual(
        expect.arrayContaining(['soc_report', 'bridge_letter', 'management_assertion'])
      );

      // 2. Completeness Evaluator Multi-Evidence Details
      const completeness = evaluateProcessorCertificationCompleteness(cert, evidenceDocs, new Date('2025-11-01'));
      expect(completeness.isComplete).toBe(true);
      expect(completeness.attachedEvidenceCount).toBe(3);
      expect(completeness.attachedEvidences.length).toBe(3);
      expect(completeness.gaps.length).toBe(0);
    });

    it('performs reverse lookup from an Evidence file to all linked Processor Certifications', () => {
      const singleEvidence: Evidence = {
        id: 'ev_shared_iso_cert',
        tenantId: 'tenant_eurocorp_de',
        title: 'TÜV Shared Infrastructure ISO Certificate',
        description: 'Covers Compute and Storage',
        category: 'iso_certificate',
        status: 'valid',
        storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_shared_iso_cert/cert.pdf',
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        fileHashSha256: 'hash_shared',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        processorCertificationIds: ['cert_prof_01', 'cert_prof_02'],
        collectedAt: '2025-01-01T00:00:00.000Z',
        reviewDueDate: '2028-01-01T00:00:00.000Z',
        reviewedBy: 'usr_privacy_01',
        reviewedAt: '2025-01-01T00:00:00.000Z',
        rejectionReason: null,
        currentVersion: 1,
        ownerId: 'usr_privacy_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
        createdBy: 'usr_privacy_01',
        updatedBy: 'usr_privacy_01',
      };

      const certsList: ProcessorCertification[] = [
        {
          id: 'cert_prof_01',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_primary',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'TÜV',
          certificateOrReportNumber: 'TUV-001',
          validFrom: '2025-01-01T00:00:00.000Z',
          validUntil: '2028-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Scope 1',
          legalEntityOrRegionalScope: 'EMEA',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_privacy_01',
          reviewStatus: 'accepted',
          reviewDueDate: '2026-01-01T00:00:00.000Z',
          linkedEvidenceIds: ['ev_shared_iso_cert'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          ownerId: 'usr_privacy_01',
          createdBy: 'usr_privacy_01',
          updatedBy: 'usr_privacy_01',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
        {
          id: 'cert_prof_02',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_secondary',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'TÜV',
          certificateOrReportNumber: 'TUV-002',
          validFrom: '2025-01-01T00:00:00.000Z',
          validUntil: '2028-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Scope 2',
          legalEntityOrRegionalScope: 'EMEA',
          systemsOrServicesCovered: ['Storage'],
          reviewOwnerUserId: 'usr_privacy_01',
          reviewStatus: 'accepted',
          reviewDueDate: '2026-01-01T00:00:00.000Z',
          linkedEvidenceIds: ['ev_shared_iso_cert'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          ownerId: 'usr_privacy_01',
          createdBy: 'usr_privacy_01',
          updatedBy: 'usr_privacy_01',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      const matchedCerts = findProcessorCertificationsForEvidence(singleEvidence, certsList);
      expect(matchedCerts.length).toBe(2);
      expect(matchedCerts.map((c) => c.id)).toEqual(['cert_prof_01', 'cert_prof_02']);
    });

    it('generates missing evidence gap and risk indicator when structural record has no supporting file', () => {
      const structuralCertOnly: ProcessorCertification = {
        id: 'cert_no_file',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_unverified_vendor',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'Unknown Auditor',
        certificateOrReportNumber: 'UNVERIFIED-2025',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Unverified Scope',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['SaaS'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'in_review',
        reviewDueDate: '2025-06-01T00:00:00.000Z',
        linkedEvidenceIds: [], // NO FILE ATTACHED
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_privacy_01',
        createdBy: 'usr_privacy_01',
        updatedBy: 'usr_privacy_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const completeness = evaluateProcessorCertificationCompleteness(structuralCertOnly, [], new Date('2025-03-01'));
      expect(completeness.isComplete).toBe(false);
      expect(completeness.hasAttachedEvidence).toBe(false);
      expect(completeness.attachedEvidenceCount).toBe(0);

      const missingEvidenceGap = completeness.gaps.find((g) => g.code === 'PROCESSOR_CERT_MISSING_EVIDENCE');
      expect(missingEvidenceGap).toBeDefined();
      expect(missingEvidenceGap?.severity).toBe('high');

      const riskFlags = evaluateProcessorCertificationRiskFlags([structuralCertOnly], [], new Date('2025-03-01'));
      expect(riskFlags.some((f) => f.ruleCode === 'PROCESSOR_CERT_MISSING_EVIDENCE')).toBe(true);
    });
  });

  describe('6. Review Workflow, State Transitions, Insufficiency & History Preservation', () => {
    it('validates supported review statuses and strict state transitions', () => {
      const allStatuses = ['pending', 'in_review', 'accepted', 'rejected', 'insufficient', 'expired', 'superseded'];
      for (const st of allStatuses) {
        expect(VALID_PROCESSOR_CERTIFICATION_REVIEW_STATUSES.includes(st as any)).toBe(true);
      }

      // Valid transitions
      expect(validateProcessorCertificationReviewTransition('pending', 'in_review').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('in_review', 'accepted').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('in_review', 'rejected').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('in_review', 'insufficient').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('accepted', 'insufficient').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('insufficient', 'accepted').allowed).toBe(true);
      expect(validateProcessorCertificationReviewTransition('accepted', 'superseded').allowed).toBe(true);

      // Terminal historic state cannot transition back to active
      const supersededTransition = validateProcessorCertificationReviewTransition('superseded', 'in_review');
      expect(supersededTransition.allowed).toBe(false);
      expect(supersededTransition.reason).toContain('A superseded certification is a preserved historic audit record');

      const invalidRejectedTransition = validateProcessorCertificationReviewTransition('rejected', 'accepted');
      expect(invalidRejectedTransition.allowed).toBe(false);
    });

    it('requires rationale when rejecting or marking an assurance record as insufficient', () => {
      const basePayload: ProcessorCertification = {
        id: 'cert_test_review',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC',
        certificateOrReportNumber: 'SOC2-TEST-2025',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Scope test',
        legalEntityOrRegionalScope: 'EU',
        systemsOrServicesCovered: ['Compute'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'rejected',
        rejectionReason: '', // Empty rejection reason should fail validation
        reviewDueDate: '2025-06-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_report'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_privacy_01',
        createdBy: 'usr_privacy_01',
        updatedBy: 'usr_privacy_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const rejectionResult = validateProcessorCertification(basePayload);
      expect(rejectionResult.valid).toBe(false);
      expect(rejectionResult.errors.some((e) => e.includes('rejectionReason is required'))).toBe(true);

      const insufficientPayload: ProcessorCertification = {
        ...basePayload,
        reviewStatus: 'insufficient',
        rejectionReason: null,
        isInsufficient: true,
        insufficientRationale: '', // Empty rationale should fail validation
      };

      const insufficientResult = validateProcessorCertification(insufficientPayload);
      expect(insufficientResult.valid).toBe(false);
      expect(insufficientResult.errors.some((e) => e.includes('insufficientRationale is required'))).toBe(true);
    });

    it('marks formally valid reports as insufficient when qualitative or scope gaps exist and generates risk flag', () => {
      const validDatesButInsufficientCert: ProcessorCertification = {
        id: 'cert_soc2_qualified_opinion',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_fintech_gateway',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'KPMG LLP',
        certificateOrReportNumber: 'KPMG-SOC2-2025-QUALIFIED',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-15T00:00:00.000Z',
        validUntil: '2026-01-14T23:59:59.000Z', // Formally valid for another 10 months
        status: 'active_valid',
        assuranceScopeSummary: 'Payment processing platform and HSM cluster',
        legalEntityOrRegionalScope: 'FinTech Gateway Ltd (UK/EU)',
        systemsOrServicesCovered: ['Transaction Processing', 'Tokenization'],
        reviewOwnerUserId: 'usr_privacy_01',
        reviewStatus: 'insufficient',
        reviewNotes: 'Qualified auditor opinion: CC6.1 Logical access controls had recurring testing exceptions without compensating bridge letter.',
        reviewedBy: 'usr_compliance_01',
        reviewerEmail: 'compliance@eurocorp.de',
        reviewedAt: '2025-02-01T10:00:00.000Z',
        isInsufficient: true,
        insufficientRationale: 'Material exceptions in access revocation and key rotation; vendor has not yet supplied remediated Q1 bridge letter.',
        reviewDueDate: '2025-05-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_report'],
        unresolvedFindingsCount: 3,
        hasMajorDeficiencies: true,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-01-15T00:00:00.000Z',
        updatedAt: '2025-02-01T10:00:00.000Z',
      };

      const completeness = evaluateProcessorCertificationCompleteness(
        validDatesButInsufficientCert,
        [{ id: 'ev_soc2_report', status: 'valid' } as any],
        new Date('2025-02-15')
      );

      expect(completeness.isComplete).toBe(false);
      expect(completeness.isExpired).toBe(false);
      expect(completeness.hasAttachedEvidence).toBe(true);

      const insufficientGap = completeness.gaps.find((g) => g.code === 'PROCESSOR_CERT_INSUFFICIENT');
      expect(insufficientGap).toBeDefined();
      expect(insufficientGap?.severity).toBe('high');
      expect(insufficientGap?.description).toContain('Material exceptions in access revocation');

      const riskFlags = evaluateProcessorCertificationRiskFlags(
        [validDatesButInsufficientCert],
        [{ id: 'ev_soc2_report', status: 'valid' } as any],
        new Date('2025-02-15')
      );
      expect(riskFlags.some((f) => f.ruleCode === 'PROCESSOR_CERT_INSUFFICIENT')).toBe(true);
    });

    it('preserves history when replacing an old certification with a newer one without destructive overwrite', () => {
      // Historical 2024 SOC 2 Type II report
      const historicV1Cert: ProcessorCertification = {
        id: 'cert_aws_soc2_2024',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        vendorId: 'vnd_aws_emea',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC LLP',
        certificateOrReportNumber: 'PWC-SOC2-2024-AWS',
        reportPeriodStart: '2023-10-01T00:00:00.000Z',
        reportPeriodEnd: '2024-09-30T23:59:59.000Z',
        validFrom: '2024-10-15T00:00:00.000Z',
        validUntil: '2025-10-14T23:59:59.000Z',
        status: 'superseded',
        assuranceScopeSummary: 'AWS Global Infrastructure 2024',
        legalEntityOrRegionalScope: 'AWS EMEA SARL',
        systemsOrServicesCovered: ['Compute', 'Storage'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'superseded',
        reviewedBy: 'usr_compliance_01',
        reviewedAt: '2024-10-20T00:00:00.000Z',
        replacedByCertificationId: 'cert_aws_soc2_2025',
        replacesCertificationId: null,
        versionNumber: 1,
        isHistoricVersion: true,
        reviewDueDate: null,
        linkedEvidenceIds: ['ev_soc2_2024_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-10-15T00:00:00.000Z',
        updatedAt: '2025-10-15T00:00:00.000Z',
      };

      // Replacing 2025 SOC 2 Type II report
      const replacingV2Cert: ProcessorCertification = {
        id: 'cert_aws_soc2_2025',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_hosting',
        vendorId: 'vnd_aws_emea',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC LLP',
        certificateOrReportNumber: 'PWC-SOC2-2025-AWS',
        reportPeriodStart: '2024-10-01T00:00:00.000Z',
        reportPeriodEnd: '2025-09-30T23:59:59.000Z',
        validFrom: '2025-10-15T00:00:00.000Z',
        validUntil: '2026-10-14T23:59:59.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'AWS Global Infrastructure 2025 (Expanded AI & Bedrock scope)',
        legalEntityOrRegionalScope: 'AWS EMEA SARL',
        systemsOrServicesCovered: ['Compute', 'Storage', 'Bedrock AI'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewNotes: 'Superseded previous 2024 version with 2025 annual report covering new GenAI services.',
        reviewedBy: 'usr_compliance_01',
        reviewerEmail: 'compliance@eurocorp.de',
        reviewedAt: '2025-10-16T10:00:00.000Z',
        replacedByCertificationId: null,
        replacesCertificationId: 'cert_aws_soc2_2024',
        versionNumber: 2,
        isHistoricVersion: false,
        reviewDueDate: '2026-08-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_2025_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-10-15T00:00:00.000Z',
        updatedAt: '2025-10-16T10:00:00.000Z',
      };

      // 1. Both versions pass validation
      expect(validateProcessorCertification(historicV1Cert).valid).toBe(true);
      expect(validateProcessorCertification(replacingV2Cert).valid).toBe(true);

      // 2. Lineage chain is intact
      expect(historicV1Cert.replacedByCertificationId).toBe(replacingV2Cert.id);
      expect(replacingV2Cert.replacesCertificationId).toBe(historicV1Cert.id);
      expect(historicV1Cert.versionNumber).toBe(1);
      expect(replacingV2Cert.versionNumber).toBe(2);

      // 3. Superseded historic version is exempt from active gaps/reminders
      const historicCompleteness = evaluateProcessorCertificationCompleteness(
        historicV1Cert,
        [],
        new Date('2025-11-01')
      );
      expect(historicCompleteness.isComplete).toBe(true);
      expect(historicCompleteness.gaps.length).toBe(0);

      // 4. Replacing version is active and evaluated
      const activeCompleteness = evaluateProcessorCertificationCompleteness(
        replacingV2Cert,
        [{ id: 'ev_soc2_2025_pdf', status: 'valid' } as any],
        new Date('2025-11-01')
      );
      expect(activeCompleteness.isComplete).toBe(true);
      expect(activeCompleteness.hasAttachedEvidence).toBe(true);
    });
  });

  describe('7. Expiry Reminders, Grace-Period Logic, Stale Reports & Deduplication Suppression', () => {
    const baseTestCert: ProcessorCertification = {
      id: 'cert_reminders_test',
      tenantId: 'tenant_eurocorp_de',
      processorProfileId: 'prof_aws_hosting',
      vendorId: 'vnd_aws_emea',
      artifactKind: 'independent_attestation_report',
      standardFamily: 'soc2_type2',
      issuingBodyOrAuditor: 'PwC LLP',
      certificateOrReportNumber: 'SOC2-REMINDER-01',
      reportPeriodStart: '2024-01-01T00:00:00.000Z',
      reportPeriodEnd: '2024-12-31T23:59:59.000Z',
      validFrom: '2025-01-15T00:00:00.000Z',
      validUntil: '2026-01-14T23:59:59.000Z',
      status: 'active_valid',
      assuranceScopeSummary: 'Cloud hosting infrastructure',
      legalEntityOrRegionalScope: 'AWS EMEA',
      systemsOrServicesCovered: ['Compute', 'Storage'],
      reviewOwnerUserId: 'usr_compliance_lead',
      reviewStatus: 'accepted',
      reviewDueDate: '2025-11-01T00:00:00.000Z',
      linkedEvidenceIds: ['ev_soc2_pdf'],
      unresolvedFindingsCount: 0,
      hasMajorDeficiencies: false,
      ownerId: 'usr_compliance_lead',
      createdBy: 'usr_compliance_lead',
      updatedBy: 'usr_compliance_lead',
      createdAt: '2025-01-15T00:00:00.000Z',
      updatedAt: '2025-01-15T00:00:00.000Z',
    };

    it('triggers upcoming expiry warnings at 60d, 30d, and 14d thresholds', () => {
      // 1. 50 days before expiry (within 60d window)
      const date50dBefore = new Date('2025-11-25T00:00:00.000Z');
      const reminders60d = evaluateProcessorCertificationReminders([baseTestCert], { asOfDate: date50dBefore });
      expect(reminders60d.some((r) => r.reminderType === 'processor_cert_expiry_warning_60d')).toBe(true);

      // 2. 25 days before expiry (within 30d window)
      const date25dBefore = new Date('2025-12-20T00:00:00.000Z');
      const reminders30d = evaluateProcessorCertificationReminders([baseTestCert], { asOfDate: date25dBefore });
      expect(reminders30d.some((r) => r.reminderType === 'processor_cert_expiry_warning_30d')).toBe(true);

      // 3. 10 days before expiry (within 14d critical window)
      const date10dBefore = new Date('2026-01-04T00:00:00.000Z');
      const reminders14d = evaluateProcessorCertificationReminders([baseTestCert], { asOfDate: date10dBefore });
      expect(reminders14d.some((r) => r.reminderType === 'processor_cert_expiry_warning_14d')).toBe(true);
    });

    it('handles configurable grace-period logic (grace period active vs grace period expired)', () => {
      // 1. 10 days PAST validUntil, with 30-day grace period -> grace period warning
      const date10dAfter = new Date('2026-01-24T00:00:00.000Z');
      const graceReminders = evaluateProcessorCertificationReminders([baseTestCert], {
        asOfDate: date10dAfter,
        gracePeriodDays: 30,
      });

      const graceAlert = graceReminders.find((r) => r.reminderType === 'processor_cert_grace_period_expiring');
      expect(graceAlert).toBeDefined();
      expect(graceAlert?.severity).toBe('urgent');
      expect(graceAlert?.gracePeriodDaysRemaining).toBe(20); // 30 - 10 = 20 days remaining

      // 2. 45 days PAST validUntil, with 30-day grace period -> expired
      const date45dAfter = new Date('2026-02-28T00:00:00.000Z');
      const expiredReminders = evaluateProcessorCertificationReminders([baseTestCert], {
        asOfDate: date45dAfter,
        gracePeriodDays: 30,
      });

      const expiredAlert = expiredReminders.find((r) => r.reminderType === 'processor_cert_expired');
      expect(expiredAlert).toBeDefined();
      expect(expiredAlert?.severity).toBe('urgent');
      expect(expiredAlert?.message).toContain('exceeded the 30-day grace period');
    });

    it('triggers overdue review reminders when reviewDueDate has elapsed for pending or in-review certs', () => {
      const certPendingReview: ProcessorCertification = {
        ...baseTestCert,
        reviewStatus: 'in_review',
        reviewDueDate: '2025-06-01T00:00:00.000Z',
      };

      const asOf = new Date('2025-07-01T00:00:00.000Z'); // 1 month after due date
      const reminders = evaluateProcessorCertificationReminders([certPendingReview], { asOfDate: asOf });

      const overdueAlert = reminders.find((r) => r.reminderType === 'processor_cert_review_overdue');
      expect(overdueAlert).toBeDefined();
      expect(overdueAlert?.severity).toBe('high');
      expect(overdueAlert?.dueDate).toBe('2025-06-01T00:00:00.000Z');
    });

    it('triggers stale report reminders when audit testing period is older than 12 months (365 days)', () => {
      const certWithOldPeriod: ProcessorCertification = {
        ...baseTestCert,
        reportPeriodStart: '2023-10-01T00:00:00.000Z',
        reportPeriodEnd: '2024-09-30T23:59:59.000Z',
        validFrom: '2024-11-01T00:00:00.000Z',
        validUntil: '2026-11-01T00:00:00.000Z', // validUntil is far out, but report period is stale (>12m)
      };

      const asOf = new Date('2025-11-15T00:00:00.000Z'); // > 13.5 months after report period end
      const reminders = evaluateProcessorCertificationReminders([certWithOldPeriod], {
        asOfDate: asOf,
        maxReportAgeDays: 365,
      });

      const staleAlert = reminders.find((r) => r.reminderType === 'processor_cert_stale_report');
      expect(staleAlert).toBeDefined();
      expect(staleAlert?.severity).toBe('high');
      expect(staleAlert?.isStaleReport).toBe(true);
      expect(staleAlert?.title).toContain('Stale Audit Attestation Report (>12m)');
    });

    it('triggers missing replacement document reminders when record has no attached evidence file', () => {
      const certMissingDoc: ProcessorCertification = {
        ...baseTestCert,
        linkedEvidenceIds: [], // Empty evidence links
      };

      const reminders = evaluateProcessorCertificationReminders([certMissingDoc], {
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const missingDocAlert = reminders.find((r) => r.reminderType === 'processor_cert_missing_replacement_evidence');
      expect(missingDocAlert).toBeDefined();
      expect(missingDocAlert?.severity).toBe('urgent');
    });

    it('enforces recipient correctness and deduplication key integrity', () => {
      const certWithSpecificReviewer: ProcessorCertification = {
        ...baseTestCert,
        reviewOwnerUserId: 'usr_lead_dpo_berlin',
        ownerId: 'usr_fallback_admin',
      };

      const reminders = evaluateProcessorCertificationReminders([certWithSpecificReviewer], {
        asOfDate: new Date('2025-12-20T00:00:00.000Z'), // 30d window
      });

      expect(reminders.length).toBeGreaterThan(0);
      const reminder = reminders[0]!;

      // 1. Recipient is reviewOwnerUserId
      expect(reminder.recipientUserId).toBe('usr_lead_dpo_berlin');

      // 2. Role-based routing is provided
      expect(reminder.recipientRoles).toEqual(
        expect.arrayContaining(['compliance_manager', 'privacy_manager', 'security_manager'])
      );

      // 3. Deduplication key is deterministic
      expect(reminder.dedupKey).toBeDefined();
      expect(reminder.dedupKey).toContain(certWithSpecificReviewer.tenantId);
      expect(reminder.dedupKey).toContain(certWithSpecificReviewer.id);
    });

    it('exempts superseded historic versions from generating active alarms', () => {
      const supersededCert: ProcessorCertification = {
        ...baseTestCert,
        reviewStatus: 'superseded',
        status: 'superseded',
        isHistoricVersion: true,
        validUntil: '2024-01-01T00:00:00.000Z', // Long expired
        linkedEvidenceIds: [], // No evidence
      };

      const reminders = evaluateProcessorCertificationReminders([supersededCert], {
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      expect(reminders.length).toBe(0); // Zero active alerts generated
    });
  });

  describe('8. Risk Module Integration, Derived Indicators & Deduplication', () => {
    const mockProfiles: ProcessorProfile[] = [
      {
        id: 'prof_critical_payments',
        tenantId: 'tenant_eurocorp_de',
        vendorId: 'vnd_stripe_eu',
        engagementName: 'Stripe Payment Processing',
        processorRole: 'data_processor',
        serviceDescription: 'Primary payment gateway integration for EU customer transactions.',
        dataCategories: ['Payment Data', 'Customer Billing Info'],
        dataSubjects: ['EU Customers'],
        isSpecialCategoryData: true,
        specialCategoryTypes: ['financial_and_billing'],
        jurisdictions: ['DE', 'IE'],
        linkedSystemAssetIds: [],
        criticality: 'critical', // Critical supply chain asset
        ownerUserId: 'usr_compliance_01',
        reviewCadence: 'annually',
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
        status: 'active',
        notes: null,
        dpaSigned: true,
        dpaDate: '2024-01-01T00:00:00.000Z',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'prof_low_blog',
        tenantId: 'tenant_eurocorp_de',
        vendorId: 'vnd_medium_corp',
        engagementName: 'Company Blog Hosting',
        processorRole: 'data_processor',
        serviceDescription: 'Public company engineering blog and marketing news host.',
        dataCategories: ['Public Articles'],
        dataSubjects: ['Visitors'],
        isSpecialCategoryData: false,
        jurisdictions: ['US', 'EU'],
        linkedSystemAssetIds: [],
        criticality: 'low',
        ownerUserId: 'usr_compliance_01',
        reviewCadence: 'annually',
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
        status: 'active',
        notes: null,
        dpaSigned: true,
        dpaDate: '2024-01-01T00:00:00.000Z',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    it('triggers CRITICAL_PROCESSOR_MISSING_ASSURANCE when critical processor has zero valid assurance records', () => {
      // No certs provided for critical payment processor
      const flags = evaluateProcessorCertificationRiskFlags([], {
        processorProfiles: mockProfiles,
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const missingAssuranceFlag = flags.find(
        (f) => f.ruleCode === 'CRITICAL_PROCESSOR_MISSING_ASSURANCE' && f.processorProfileId === 'prof_critical_payments'
      );
      expect(missingAssuranceFlag).toBeDefined();
      expect(missingAssuranceFlag?.severity).toBe('critical');
      expect(missingAssuranceFlag?.inherentScore).toBe(25); // Max inherent score for critical processor
      expect(missingAssuranceFlag?.title).toContain('Stripe Payment Processing');

      // Low criticality processor does NOT trigger CRITICAL_PROCESSOR_MISSING_ASSURANCE
      const lowProcessorFlag = flags.find(
        (f) => f.ruleCode === 'CRITICAL_PROCESSOR_MISSING_ASSURANCE' && f.processorProfileId === 'prof_low_blog'
      );
      expect(lowProcessorFlag).toBeUndefined();
    });

    it('triggers PROCESSOR_CERT_EXPIRED with severity and score elevated for critical processor', () => {
      const expiredCert: ProcessorCertification = {
        id: 'cert_stripe_iso_expired',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'BSI Group',
        certificateOrReportNumber: 'ISO-27001-2024',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2025-01-01T00:00:00.000Z', // Expired
        status: 'expired',
        assuranceScopeSummary: 'Cardholder Data Environment',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['Payment Gateway'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2024-12-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_pci_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([expiredCert], {
        processorProfiles: mockProfiles,
        evidenceDocs: [{ id: 'ev_pci_pdf', status: 'valid' } as any],
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const expiredFlag = flags.find((f) => f.ruleCode === 'PROCESSOR_CERT_EXPIRED');
      expect(expiredFlag).toBeDefined();
      expect(expiredFlag?.severity).toBe('critical'); // Scaled to critical due to critical processor
      expect(expiredFlag?.inherentScore).toBe(25);
    });

    it('triggers PROCESSOR_CERT_EXPIRING_SOON_UNREPLACED when cert is expiring soon and has no active replacement in progress', () => {
      const expiringCert: ProcessorCertification = {
        id: 'cert_stripe_soc2_expiring',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC',
        certificateOrReportNumber: 'SOC2-EXPIRING-2025',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2025-05-20T00:00:00.000Z', // 19 days remaining relative to 2025-05-01 (<= 60d window)
        status: 'active_valid',
        assuranceScopeSummary: 'Payment API',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['Payment Gateway'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-04-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([expiringCert], {
        processorProfiles: mockProfiles,
        evidenceDocs: [{ id: 'ev_soc2_pdf', status: 'valid' } as any],
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const expiringUnreplaced = flags.find((f) => f.ruleCode === 'PROCESSOR_CERT_EXPIRING_SOON_UNREPLACED');
      expect(expiringUnreplaced).toBeDefined();
      expect(expiringUnreplaced?.severity).toBe('high'); // Scaled for critical processor
      expect(expiringUnreplaced?.suggestedTreatment).toContain('Request current audit renewal package');
    });

    it('triggers PROCESSOR_CERT_REJECTED and PROCESSOR_CERT_INSUFFICIENT with clear treatment rationale', () => {
      const rejectedCert: ProcessorCertification = {
        id: 'cert_rejected',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'Unaccredited Audit Org',
        certificateOrReportNumber: 'ISO-REJECTED-01',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'under_review',
        assuranceScopeSummary: 'Unknown scope',
        legalEntityOrRegionalScope: 'Local',
        systemsOrServicesCovered: ['General'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'rejected',
        rejectionReason: 'Issuing body is unaccredited by IAF/DAkkS and scope excludes payment processing databases.',
        reviewedBy: 'usr_lead_dpo',
        reviewedAt: '2025-02-01T00:00:00.000Z',
        reviewDueDate: '2025-01-15T00:00:00.000Z',
        linkedEvidenceIds: ['ev_rej_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: true,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-02-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([rejectedCert], {
        processorProfiles: mockProfiles,
        evidenceDocs: [{ id: 'ev_rej_pdf', status: 'valid' } as any],
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const rejFlag = flags.find((f) => f.ruleCode === 'PROCESSOR_CERT_REJECTED');
      expect(rejFlag).toBeDefined();
      expect(rejFlag?.severity).toBe('critical');
      expect(rejFlag?.description).toContain('Issuing body is unaccredited');
    });

    it('triggers PROCESSOR_CERT_MISSING_EVIDENCE when structural assurance claims exist without attached files', () => {
      const certNoFiles: ProcessorCertification = {
        id: 'cert_no_file',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'BSI Group',
        certificateOrReportNumber: 'ISO-NO-EVIDENCE-01',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Full IT Infrastructure',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['All Commercial Services'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2026-01-01T00:00:00.000Z',
        linkedEvidenceIds: [], // Missing evidence!
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([certNoFiles], {
        processorProfiles: mockProfiles,
        evidenceDocs: [],
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const missingEvFlag = flags.find((f) => f.ruleCode === 'PROCESSOR_CERT_MISSING_EVIDENCE');
      expect(missingEvFlag).toBeDefined();
      expect(missingEvFlag?.severity).toBe('high');
      expect(missingEvFlag?.suggestedTreatment).toContain('Upload formal PDF report or certificate');
    });

    it('triggers PROCESSOR_CERT_SCOPE_MISMATCH when certified scope excludes engaged systems/services', () => {
      const certLimitedScope: ProcessorCertification = {
        id: 'cert_limited_scope',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'EY LLP',
        certificateOrReportNumber: 'SOC2-LIMITED-01',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T23:59:59.000Z',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Corporate Marketing Website Only',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['Marketing Website CMS'], // Excludes Payment Gateway & Cardholder DB!
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-10-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_soc2_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([certLimitedScope], {
        processorProfiles: mockProfiles,
        evidenceDocs: [{ id: 'ev_soc2_pdf', status: 'valid' } as any],
        requiredSystemsMap: {
          prof_critical_payments: ['Payment Gateway Engine', 'Cardholder Vault DB'],
        },
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      const scopeMismatchFlag = flags.find((f) => f.ruleCode === 'PROCESSOR_CERT_SCOPE_MISMATCH');
      expect(scopeMismatchFlag).toBeDefined();
      expect(scopeMismatchFlag?.severity).toBe('high');
      expect(scopeMismatchFlag?.description).toContain('Payment Gateway Engine');
      expect(scopeMismatchFlag?.suggestedTreatment).toContain('Request SOC 2 / ISO scope expansion');
    });

    it('produces deterministic deduplication keys across all risk indicators to prevent risk spam', () => {
      const cert: ProcessorCertification = {
        id: 'cert_dedup_test',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_critical_payments',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'TUV Rheinland',
        certificateOrReportNumber: 'ISO-DEDUP-01',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2024-12-31T23:59:59.000Z', // Expired
        status: 'expired',
        assuranceScopeSummary: 'Full IT',
        legalEntityOrRegionalScope: 'Global',
        systemsOrServicesCovered: ['All'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2024-11-01T00:00:00.000Z',
        linkedEvidenceIds: [],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const flags = evaluateProcessorCertificationRiskFlags([cert], {
        processorProfiles: mockProfiles,
        asOfDate: new Date('2025-05-01T00:00:00.000Z'),
      });

      expect(flags.length).toBeGreaterThanOrEqual(2);
      for (const flag of flags) {
        expect(flag.dedupKey).toBeDefined();
        expect(flag.dedupKey.startsWith('tenant_eurocorp_de_risk_')).toBe(true);
        expect(flag.dedupKey).toContain(cert.processorProfileId);
      }
    });
  });

  describe('9. Control Implementation, Third-Party Assurance & Evidence Traceability', () => {
    const mockControls: Control[] = [
      {
        id: 'ctl_vendor_mgmt_01',
        tenantId: 'tenant_eurocorp_de',
        masterControlId: 'mctl_iso_a15_1',
        code: 'SEC-VEN-01',
        title: 'Third-Party Supplier Security Review & Assurance',
        description: 'Ensure critical cloud processors maintain accredited security certifications.',
        domain: 'Supply Chain Governance',
        frameworkIds: ['iso_27001_2022', 'soc_2'],
        requirementIds: ['req_a15_1_1', 'req_cc9_2'],
        status: 'implemented',
        healthScore: 95,
        enforcementMechanism: 'hybrid',
        reviewFrequencyDays: 365,
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
        implementationNotes: 'Annual ISO 27001 / SOC 2 collection and audit review.',
        processorCertificationIds: ['cert_aws_iso_2025'], // Direct FK from Control
        processorProfileIds: ['prof_aws_infra'],
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'ctl_encryption_transit',
        tenantId: 'tenant_eurocorp_de',
        masterControlId: 'mctl_iso_a10_1',
        code: 'SEC-CRY-02',
        title: 'Data-in-Transit Encryption (TLS 1.3)',
        description: 'Mandate modern encryption protocols across internal and third-party APIs.',
        domain: 'Cryptography',
        frameworkIds: ['iso_27001_2022', 'gdpr_art32'],
        requirementIds: ['req_a10_1_2'],
        status: 'implemented',
        healthScore: 100,
        enforcementMechanism: 'automated',
        reviewFrequencyDays: 180,
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2024-07-01T00:00:00.000Z',
        implementationNotes: 'Enforced via API gateways and verified in third-party SOC 2 Type II reports.',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const mockProfiles: ProcessorProfile[] = [
      {
        id: 'prof_aws_infra',
        tenantId: 'tenant_eurocorp_de',
        vendorId: 'vnd_aws_emea',
        engagementName: 'AWS EMEA Cloud Hosting',
        processorRole: 'data_processor',
        serviceDescription: 'Primary EU production hosting and compute workloads.',
        dataCategories: ['Personal Identifiers', 'System Logs'],
        dataSubjects: ['EU Customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['DE', 'IE'],
        linkedSystemAssetIds: ['sys_prod_k8s'],
        criticality: 'critical',
        ownerUserId: 'usr_compliance_01',
        reviewCadence: 'annually',
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
        status: 'active',
        notes: null,
        dpaSigned: true,
        dpaDate: '2024-01-01T00:00:00.000Z',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'prof_snowflake_dw',
        tenantId: 'tenant_eurocorp_de',
        vendorId: 'vnd_snowflake_eu',
        engagementName: 'Snowflake Analytics Warehouse',
        processorRole: 'data_processor',
        serviceDescription: 'Cloud data warehousing and BI aggregation.',
        dataCategories: ['Analytics Data'],
        dataSubjects: ['Customers'],
        isSpecialCategoryData: false,
        jurisdictions: ['DE'],
        linkedSystemAssetIds: ['sys_dw_cluster'],
        criticality: 'high',
        ownerUserId: 'usr_compliance_01',
        reviewCadence: 'annually',
        lastReviewDate: '2024-01-01T00:00:00.000Z',
        nextReviewDate: '2025-01-01T00:00:00.000Z',
        status: 'active',
        notes: null,
        dpaSigned: true,
        dpaDate: '2024-01-01T00:00:00.000Z',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    const mockEvidence: Evidence[] = [
      {
        id: 'ev_aws_iso_pdf',
        tenantId: 'tenant_eurocorp_de',
        title: 'AWS ISO 27001 Certificate 2025-2027',
        category: 'iso_certificate',
        status: 'valid',
        storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_aws_iso.pdf',
        fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        fileSizeBytes: 1048576,
        mimeType: 'application/pdf',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'ev_snowflake_soc2_pdf',
        tenantId: 'tenant_eurocorp_de',
        title: 'Snowflake SOC 2 Type II Report 2024',
        category: 'soc_report',
        status: 'valid',
        storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_snowflake_soc2.pdf',
        fileHashSha256: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08',
        fileSizeBytes: 4194304,
        mimeType: 'application/pdf',
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ] as unknown as Evidence[];

    const mockCerts: ProcessorCertification[] = [
      {
        id: 'cert_aws_iso_2025',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_infra',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'EY CertifyPoint',
        certificateOrReportNumber: 'EY-AWS-ISO27001-2025',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z', // Active valid
        status: 'active_valid',
        assuranceScopeSummary: 'All AWS Global Infrastructure & European Regions',
        legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
        systemsOrServicesCovered: ['Compute', 'Storage', 'Networking', 'Databases'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-01-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_iso_pdf'],
        linkedControlIds: ['ctl_vendor_mgmt_01', 'ctl_encryption_transit'], // Dual linked
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'cert_snowflake_soc2_2024',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_snowflake_dw',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'Schellman & Company',
        certificateOrReportNumber: 'SCH-SNOWFLAKE-2024',
        reportPeriodStart: '2023-01-01T00:00:00.000Z',
        reportPeriodEnd: '2023-12-31T23:59:59.000Z',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2024-12-31T23:59:59.000Z', // Expired relative to 2025-05-01
        status: 'expired',
        assuranceScopeSummary: 'Snowflake Data Cloud Platform',
        legalEntityOrRegionalScope: 'Snowflake Inc. / EMEA',
        systemsOrServicesCovered: ['Data Warehouse Engine'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2024-11-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_snowflake_soc2_pdf'],
        linkedControlIds: ['ctl_vendor_mgmt_01'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    it('bi-directionally resolves links between ProcessorCertifications and Controls', () => {
      // 1. Find certs for ctl_encryption_transit (linked via cert.linkedControlIds)
      const certsForTransit = findProcessorCertificationsForControl('ctl_encryption_transit', mockCerts);
      expect(certsForTransit.length).toBe(1);
      expect(certsForTransit[0]!.id).toBe('cert_aws_iso_2025');

      // 2. Find certs for ctl_vendor_mgmt_01 (linked via both cert.linkedControlIds and ctl.processorCertificationIds)
      const certsForVendorMgmt = findProcessorCertificationsForControl(mockControls[0]!, mockCerts);
      expect(certsForVendorMgmt.length).toBe(2);
      expect(certsForVendorMgmt.map((c) => c.id)).toContain('cert_aws_iso_2025');
      expect(certsForVendorMgmt.map((c) => c.id)).toContain('cert_snowflake_soc2_2024');

      // 3. Reverse lookup controls for cert_aws_iso_2025
      const controlsForAwsCert = findControlsForProcessorCertification(mockCerts[0]!, mockControls);
      expect(controlsForAwsCert.length).toBe(2);
      expect(controlsForAwsCert.map((c) => c.id)).toContain('ctl_vendor_mgmt_01');
      expect(controlsForAwsCert.map((c) => c.id)).toContain('ctl_encryption_transit');
    });

    it('evaluates control third-party assurance support with attached evidence details and coverage scoring', () => {
      // Test control with single 100% valid supporting certification
      const support = evaluateControlProcessorAssuranceSupport(
        mockControls[1]!, // ctl_encryption_transit
        mockCerts,
        mockEvidence,
        mockProfiles,
        new Date('2025-05-01T00:00:00.000Z')
      );

      expect(support.controlId).toBe('ctl_encryption_transit');
      expect(support.controlCode).toBe('SEC-CRY-02');
      expect(support.totalLinkedCertifications).toBe(1);
      expect(support.validAssuranceCount).toBe(1);
      expect(support.expiredAssuranceCount).toBe(0);
      expect(support.hasSufficientAssurance).toBe(true);
      expect(support.assuranceCoverageScore).toBe(100);

      // Verify item details and attached evidence traceability
      expect(support.items.length).toBe(1);
      const awsItem = support.items[0]!;
      expect(awsItem.processorName).toBe('AWS EMEA Cloud Hosting');
      expect(awsItem.standardDisplayName).toBe('ISO/IEC 27001:2022 (ISMS)');
      expect(awsItem.certificateOrReportNumber).toBe('EY-AWS-ISO27001-2025');
      expect(awsItem.isCurrent).toBe(true);
      expect(awsItem.isSufficient).toBe(true);
      expect(awsItem.hasAttachedEvidence).toBe(true);
      expect(awsItem.evidenceDocuments.length).toBe(1);
      expect(awsItem.evidenceDocuments[0]!.fileHashSha256).toBe(
        'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
      );
    });

    it('evaluates mixed valid and expired processor certifications supporting a vendor management control', () => {
      // Test ctl_vendor_mgmt_01 which has 1 active AWS cert and 1 expired Snowflake cert as of 2025-05-01
      const support = evaluateControlProcessorAssuranceSupport(
        mockControls[0]!,
        mockCerts,
        mockEvidence,
        mockProfiles,
        new Date('2025-05-01T00:00:00.000Z')
      );

      expect(support.totalLinkedCertifications).toBe(2);
      expect(support.validAssuranceCount).toBe(1);
      expect(support.expiredAssuranceCount).toBe(1);
      expect(support.hasSufficientAssurance).toBe(false); // Mixed assurance -> not 100% sufficient
      expect(support.assuranceCoverageScore).toBe(50); // 1 out of 2 valid = 50%
      expect(support.supportingProcessorsCount).toBe(2);

      const awsGroup = support.supportingProcessors.find((p) => p.processorProfileId === 'prof_aws_infra');
      expect(awsGroup?.hasCurrentAssurance).toBe(true);
      expect(awsGroup?.criticality).toBe('critical');

      const snowflakeGroup = support.supportingProcessors.find((p) => p.processorProfileId === 'prof_snowflake_dw');
      expect(snowflakeGroup?.hasCurrentAssurance).toBe(false); // Expired cert
    });

    it('generates the complete processor-to-controls assurance matrix with gap indicators', () => {
      const matrix = mapProcessorsToControlsAssuranceMatrix(
        mockProfiles,
        mockCerts,
        mockControls,
        mockEvidence,
        new Date('2025-05-01T00:00:00.000Z')
      );

      expect(matrix.length).toBe(2);

      // 1. AWS Matrix Entry
      const awsEntry = matrix.find((m) => m.processorProfileId === 'prof_aws_infra');
      expect(awsEntry).toBeDefined();
      expect(awsEntry?.criticality).toBe('critical');
      expect(awsEntry?.supportedControlsCount).toBe(2);
      expect(awsEntry?.validControlsCount).toBe(2);
      expect(awsEntry?.gapsCount).toBe(0);
      expect(awsEntry?.controlSupportMap['ctl_vendor_mgmt_01']?.hasCurrentAssurance).toBe(true);
      expect(awsEntry?.controlSupportMap['ctl_encryption_transit']?.hasCurrentAssurance).toBe(true);

      // 2. Snowflake Matrix Entry
      const snowflakeEntry = matrix.find((m) => m.processorProfileId === 'prof_snowflake_dw');
      expect(snowflakeEntry).toBeDefined();
      expect(snowflakeEntry?.criticality).toBe('high');
      expect(snowflakeEntry?.supportedControlsCount).toBe(1);
      expect(snowflakeEntry?.validControlsCount).toBe(0);
      expect(snowflakeEntry?.gapsCount).toBe(1); // Flagged as assurance gap due to expired SOC 2 report
      expect(snowflakeEntry?.controlSupportMap['ctl_vendor_mgmt_01']?.hasCurrentAssurance).toBe(false);
    });
  });

  describe('10. Processor Detail Assurance Section, KPI Synthesis & Governance Filtering', () => {
    const mockCerts: ProcessorCertification[] = [
      {
        id: 'cert_aws_current_iso',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_infra',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'EY CertifyPoint',
        certificateOrReportNumber: 'EY-AWS-ISO27001-2025',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z', // Current valid
        status: 'active_valid',
        assuranceScopeSummary: 'Global Cloud Infrastructure',
        legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
        systemsOrServicesCovered: ['Compute', 'Storage', 'Databases'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-01-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_iso_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'cert_aws_expiring_soc2',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_infra',
        artifactKind: 'independent_attestation_report',
        standardFamily: 'soc2_type2',
        issuingBodyOrAuditor: 'PwC LLP',
        certificateOrReportNumber: 'PWC-AWS-SOC2-2024',
        reportPeriodStart: '2023-01-01T00:00:00.000Z',
        reportPeriodEnd: '2023-12-31T23:59:59.000Z',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2025-05-20T00:00:00.000Z', // Expiring soon relative to 2025-05-01 (19 days)
        status: 'active_valid',
        assuranceScopeSummary: 'AWS EMEA Security Trust Services',
        legalEntityOrRegionalScope: 'AWS EMEA',
        systemsOrServicesCovered: ['Compute', 'Storage'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'accepted',
        reviewDueDate: '2025-04-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_soc2_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'cert_aws_historic_iso_v1',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_infra',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27001',
        issuingBodyOrAuditor: 'EY CertifyPoint',
        certificateOrReportNumber: 'EY-AWS-ISO27001-2022',
        validFrom: '2021-01-01T00:00:00.000Z',
        validUntil: '2024-01-01T00:00:00.000Z',
        status: 'superseded',
        assuranceScopeSummary: 'Legacy AWS Scope',
        legalEntityOrRegionalScope: 'AWS EMEA',
        systemsOrServicesCovered: ['Compute'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'superseded',
        replacedByCertificationId: 'cert_aws_current_iso',
        isHistoricVersion: true,
        versionNumber: 1,
        reviewDueDate: '2023-12-01T00:00:00.000Z',
        linkedEvidenceIds: ['ev_aws_iso_v1_pdf'],
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2021-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
      {
        id: 'cert_aws_missing_evidence',
        tenantId: 'tenant_eurocorp_de',
        processorProfileId: 'prof_aws_infra',
        artifactKind: 'accredited_certification',
        standardFamily: 'iso_27701',
        issuingBodyOrAuditor: 'BSI Group',
        certificateOrReportNumber: 'BSI-PIMS-2025',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2027-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Privacy Information Management System',
        legalEntityOrRegionalScope: 'AWS EMEA',
        systemsOrServicesCovered: ['Databases'],
        reviewOwnerUserId: 'usr_compliance_01',
        reviewStatus: 'pending',
        reviewDueDate: '2025-06-01T00:00:00.000Z',
        linkedEvidenceIds: [], // Missing evidence!
        unresolvedFindingsCount: 0,
        hasMajorDeficiencies: false,
        ownerId: 'usr_compliance_01',
        createdBy: 'usr_compliance_01',
        updatedBy: 'usr_compliance_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      },
    ];

    it('accurately categorizes current vs superseded vs attention assurance items', () => {
      const nowMillis = new Date('2025-05-01T00:00:00.000Z').getTime();

      const currentCerts = mockCerts.filter((c) => !c.isHistoricVersion && c.reviewStatus !== 'superseded');
      const supersededCerts = mockCerts.filter((c) => c.isHistoricVersion || c.reviewStatus === 'superseded');
      const attentionCerts = currentCerts.filter(
        (c) =>
          c.isInsufficient ||
          c.reviewStatus === 'rejected' ||
          c.reviewStatus === 'insufficient' ||
          c.status === 'expired' ||
          new Date(c.validUntil).getTime() <= nowMillis + 60 * 24 * 60 * 60 * 1000 ||
          !c.linkedEvidenceIds ||
          c.linkedEvidenceIds.length === 0
      );

      expect(currentCerts.length).toBe(3);
      expect(supersededCerts.length).toBe(1);
      expect(supersededCerts[0]!.id).toBe('cert_aws_historic_iso_v1');

      // Attention items include cert_aws_expiring_soc2 (<60d) and cert_aws_missing_evidence (no evidence)
      expect(attentionCerts.length).toBe(2);
      expect(attentionCerts.map((c) => c.id)).toContain('cert_aws_expiring_soc2');
      expect(attentionCerts.map((c) => c.id)).toContain('cert_aws_missing_evidence');
    });

    it('formats display labels, validity countdowns, and standard taxonomies correctly', () => {
      const isoTaxonomy = getAssuranceTaxonomy('iso_27001');
      expect(isoTaxonomy.displayName).toBe('ISO/IEC 27001:2022 (ISMS)');
      expect(isoTaxonomy.requiresReportPeriod).toBe(false);

      const soc2Taxonomy = getAssuranceTaxonomy('soc2_type2');
      expect(soc2Taxonomy.displayName).toBe('SOC 2 Type II (Operating Effectiveness)');
      expect(soc2Taxonomy.requiresReportPeriod).toBe(true);

      const pimsTaxonomy = getAssuranceTaxonomy('iso_27701');
      expect(pimsTaxonomy.displayName).toBe('ISO/IEC 27701:2019 (PIMS)');
    });
  });

  describe('11. Processor Certification UI Form Validation, Field Conditionality & Save/Update Flows', () => {
    describe('Form Validation & Field Conditionality', () => {
      it('validates standard certificate-style assurance record (ISO 27001)', () => {
        const certRecord: ProcessorCertification = {
          id: 'procert_iso_test',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          customStandardName: null,
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'EY-2025-001',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Global cloud infrastructure data centers',
          legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
          systemsOrServicesCovered: ['Compute', 'Storage'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'accepted',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: ['ev_doc_01'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(certRecord);
        expect(result.valid).toBe(true);
        expect(result.errors).toHaveLength(0);
      });

      it('enforces report period dates on period-of-time assurance reports (SOC 2 Type II)', () => {
        const invalidSoc2: ProcessorCertification = {
          id: 'procert_soc2_missing_period',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'independent_attestation_report',
          standardFamily: 'soc2_type2',
          issuingBodyOrAuditor: 'PwC LLP',
          certificateOrReportNumber: 'PWC-SOC2-2024',
          reportPeriodStart: null, // Missing!
          reportPeriodEnd: null,   // Missing!
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2025-05-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Security & Availability Trust Services Criteria',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Databases'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'pending',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(invalidSoc2);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('Period-of-time assurance standard') || e.includes('reportPeriodStart'))).toBe(true);
      });

      it('enforces mandatory customStandardName when standardFamily is "other"', () => {
        const invalidOther: ProcessorCertification = {
          id: 'procert_other_missing_name',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'custom_assurance',
          standardFamily: 'other',
          customStandardName: '', // Missing!
          issuingBodyOrAuditor: 'Internal Security Assurance',
          certificateOrReportNumber: 'CUSTOM-2025',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2025-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Custom enterprise assurance model',
          legalEntityOrRegionalScope: 'EU Headquarters',
          systemsOrServicesCovered: ['Internal Auth'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'pending',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(invalidOther);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('customStandardName is required'))).toBe(true);
      });

      it('enforces rejectionReason when reviewStatus is "rejected"', () => {
        const invalidRejection: ProcessorCertification = {
          id: 'procert_rejected_no_reason',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'Unverified Registrar',
          certificateOrReportNumber: 'FAKE-ISO-99',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Unverified Scope',
          legalEntityOrRegionalScope: 'EU Headquarters',
          systemsOrServicesCovered: [],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'rejected',
          rejectionReason: '', // Missing!
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(invalidRejection);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('rejectionReason is required'))).toBe(true);
      });

      it('enforces insufficientRationale when isInsufficient is true', () => {
        const invalidInsufficient: ProcessorCertification = {
          id: 'procert_insufficient_no_reason',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'TÜV Rheinland',
          certificateOrReportNumber: 'TUV-2025-01',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'EU Cloud Facilities',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'insufficient',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: true,
          insufficientRationale: '', // Missing!
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(invalidInsufficient);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('insufficientRationale is required'))).toBe(true);
      });

      it('enforces date chronology (validUntil >= validFrom and reportPeriodEnd >= reportPeriodStart)', () => {
        const invalidDates: ProcessorCertification = {
          id: 'procert_inverted_dates',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'independent_attestation_report',
          standardFamily: 'soc2_type2',
          issuingBodyOrAuditor: 'PwC LLP',
          certificateOrReportNumber: 'PWC-SOC2-INVERTED',
          reportPeriodStart: '2024-12-31T00:00:00.000Z',
          reportPeriodEnd: '2024-01-01T00:00:00.000Z', // Inverted!
          validFrom: '2025-01-01T00:00:00.000Z',
          validUntil: '2024-01-01T00:00:00.000Z',     // Inverted!
          status: 'active_valid',
          assuranceScopeSummary: 'Inverted Scope',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: [],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'pending',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const result = validateProcessorCertification(invalidDates);
        expect(result.valid).toBe(false);
        expect(result.errors.some((e) => e.includes('validFrom date cannot be after validUntil date'))).toBe(true);
        expect(result.errors.some((e) => e.includes('reportPeriodStart cannot be after reportPeriodEnd'))).toBe(true);
      });
    });

    describe('Save, Update and Replace Lifecycle Flows', () => {
      it('simulates update workflow preserving non-destructive history', () => {
        const originalRecord: ProcessorCertification = {
          id: 'cert_original_v1',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'EY-ORIGINAL-01',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Initial Scope',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'pending',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          isInsufficient: false,
          versionNumber: 1,
          isHistoricVersion: false,
          linkedEvidenceIds: ['ev_doc_01'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        // Update fields
        const updatedRecord: ProcessorCertification = {
          ...originalRecord,
          assuranceScopeSummary: 'Expanded Scope with Databases & Storage',
          systemsOrServicesCovered: ['Compute', 'Storage', 'Databases'],
          linkedEvidenceIds: ['ev_doc_01', 'ev_doc_02'],
          updatedBy: 'usr_lead_dpo',
          updatedAt: '2025-02-01T00:00:00.000Z',
        };

        const val = validateProcessorCertification(updatedRecord);
        expect(val.valid).toBe(true);
        expect(updatedRecord.systemsOrServicesCovered).toHaveLength(3);
        expect(updatedRecord.linkedEvidenceIds).toHaveLength(2);
      });

      it('simulates replace workflow creating new version and linking previous version', () => {
        const v1Cert: ProcessorCertification = {
          id: 'cert_v1',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'EY-2022-01',
          validFrom: '2021-01-01T00:00:00.000Z',
          validUntil: '2024-01-01T00:00:00.000Z',
          status: 'superseded',
          assuranceScopeSummary: 'V1 Scope',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'superseded',
          reviewDueDate: '2023-12-01T00:00:00.000Z',
          replacedByCertificationId: 'cert_v2',
          versionNumber: 1,
          isHistoricVersion: true,
          linkedEvidenceIds: ['ev_doc_01'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2021-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        const v2Cert: ProcessorCertification = {
          id: 'cert_v2',
          tenantId: 'tenant_eurocorp_de',
          processorProfileId: 'prof_aws_infra',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'EY-2025-01',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'V2 Recertified Scope',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Compute', 'Storage', 'Databases'],
          reviewOwnerUserId: 'usr_compliance_lead',
          reviewStatus: 'pending',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          replacesCertificationId: 'cert_v1',
          versionNumber: 2,
          isHistoricVersion: false,
          linkedEvidenceIds: ['ev_doc_02'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_compliance_lead',
          createdBy: 'usr_compliance_lead',
          updatedBy: 'usr_compliance_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        };

        expect(v1Cert.isHistoricVersion).toBe(true);
        expect(v1Cert.replacedByCertificationId).toBe('cert_v2');
        expect(v2Cert.isHistoricVersion).toBe(false);
        expect(v2Cert.replacesCertificationId).toBe('cert_v1');
        expect(v2Cert.versionNumber).toBe(2);

        const v1Validation = validateProcessorCertification(v1Cert);
        const v2Validation = validateProcessorCertification(v2Cert);
        expect(v1Validation.valid).toBe(true);
        expect(v2Validation.valid).toBe(true);
      });
    });
  });

  describe('12. Processor Assurance Inventory Multi-Dimensional Filters & Tenant Isolation', () => {
    const tenantA = 'tenant_inventory_alpha';
    const tenantB = 'tenant_inventory_beta';

    const userAdminA = { uid: 'usr_admin_a', email: 'admin@alpha.de' };
    const userAdminB = { uid: 'usr_admin_b', email: 'admin@beta.fr' };

    beforeEach(async () => {
      await testEnv.clearFirestore();

      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();

        // Setup Tenant Alpha
        await db.collection('tenants').doc(tenantA).set({
          id: tenantA,
          name: 'Alpha Corp',
          status: 'active',
          subscriptionTier: 'enterprise',
          primaryContactEmail: 'admin@alpha.de',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await db.collection('tenants').doc(tenantA).collection('memberships').doc(userAdminA.uid).set({
          id: userAdminA.uid,
          tenantId: tenantA,
          userId: userAdminA.uid,
          email: userAdminA.email,
          role: 'tenant_admin',
          status: 'active',
          joinedAt: new Date().toISOString(),
        });

        // Setup Tenant Beta
        await db.collection('tenants').doc(tenantB).set({
          id: tenantB,
          name: 'Beta Corp',
          status: 'active',
          subscriptionTier: 'enterprise',
          primaryContactEmail: 'admin@beta.fr',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
        await db.collection('tenants').doc(tenantB).collection('memberships').doc(userAdminB.uid).set({
          id: userAdminB.uid,
          tenantId: tenantB,
          userId: userAdminB.uid,
          email: userAdminB.email,
          role: 'tenant_admin',
          status: 'active',
          joinedAt: new Date().toISOString(),
        });

        // Seed Tenant Alpha Processor Certification
        await db.collection('tenants').doc(tenantA).collection('processor_certifications').doc('cert_alpha_iso').set({
          id: 'cert_alpha_iso',
          tenantId: tenantA,
          processorProfileId: 'prof_alpha_aws',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'ALPHA-EY-01',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2027-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Alpha Cloud Services Scope',
          legalEntityOrRegionalScope: 'EU EMEA',
          systemsOrServicesCovered: ['Cloud VPC'],
          reviewOwnerUserId: userAdminA.uid,
          reviewStatus: 'accepted',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: ['ev_alpha_doc1'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: userAdminA.uid,
          createdBy: userAdminA.uid,
          updatedBy: userAdminA.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        // Seed Tenant Beta Processor Certification
        await db.collection('tenants').doc(tenantB).collection('processor_certifications').doc('cert_beta_soc2').set({
          id: 'cert_beta_soc2',
          tenantId: tenantB,
          processorProfileId: 'prof_beta_gcp',
          artifactKind: 'independent_attestation_report',
          standardFamily: 'soc2_type2',
          issuingBodyOrAuditor: 'PwC LLP',
          certificateOrReportNumber: 'BETA-PWC-02',
          reportPeriodStart: '2024-01-01T00:00:00.000Z',
          reportPeriodEnd: '2024-12-31T00:00:00.000Z',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2025-06-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'Beta Cloud Analytics Scope',
          legalEntityOrRegionalScope: 'Global GCP',
          systemsOrServicesCovered: ['BigQuery'],
          reviewOwnerUserId: userAdminB.uid,
          reviewStatus: 'accepted',
          reviewDueDate: '2025-01-01T00:00:00.000Z',
          linkedEvidenceIds: ['ev_beta_doc1'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: userAdminB.uid,
          createdBy: userAdminB.uid,
          updatedBy: userAdminB.uid,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });
    });

    describe('Multi-Tenant Security Rules Isolation', () => {
      it('allows Tenant Alpha admin to read Tenant Alpha processor certifications', async () => {
        const userAContext = testEnv.authenticatedContext(userAdminA.uid, { email: userAdminA.email });
        const docRef = userAContext.firestore().collection('tenants').doc(tenantA).collection('processor_certifications').doc('cert_alpha_iso');
        await assertSucceeds(docRef.get());
      });

      it('strictly forbids Tenant Beta user from reading Tenant Alpha processor certifications', async () => {
        const userBContext = testEnv.authenticatedContext(userAdminB.uid, { email: userAdminB.email });
        const docRef = userBContext.firestore().collection('tenants').doc(tenantA).collection('processor_certifications').doc('cert_alpha_iso');
        await assertFails(docRef.get());
      });

      it('strictly forbids unauthenticated users from reading any processor certifications', async () => {
        const unauthContext = testEnv.unauthenticatedContext();
        const docRef = unauthContext.firestore().collection('tenants').doc(tenantA).collection('processor_certifications').doc('cert_alpha_iso');
        await assertFails(docRef.get());
      });
    });

    describe('Assurance Inventory Multi-Dimensional Filter Engine', () => {
      const asOfDate = new Date('2025-01-01T00:00:00.000Z');

      // Mock Dataset
      const mockProfiles = [
        {
          id: 'prof_aws',
          tenantId: 'tenant_test',
          vendorId: 'vend_aws',
          engagementName: 'AWS Cloud Infrastructure',
          processorRole: 'data_processor',
          serviceDescription: 'Core Cloud Hosting',
          dataCategories: ['user_credentials', 'payment_records'],
          dataSubjects: ['customers'],
          isSpecialCategoryData: false,
          jurisdictions: ['DE', 'IE', 'US'],
          linkedSystemAssetIds: ['asset_core_bank', 'asset_data_lake'],
          criticality: 'critical',
          ownerUserId: 'usr_sec_lead',
          reviewCadence: 'quarterly',
          status: 'active',
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'prof_slack',
          tenantId: 'tenant_test',
          vendorId: 'vend_salesforce',
          engagementName: 'Slack Enterprise Grid',
          processorRole: 'data_processor',
          serviceDescription: 'Internal Team Collaboration',
          dataCategories: ['chat_messages'],
          dataSubjects: ['employees'],
          isSpecialCategoryData: false,
          jurisdictions: ['US', 'DE'],
          linkedSystemAssetIds: ['asset_crm_hub'],
          criticality: 'medium',
          ownerUserId: 'usr_dpo',
          reviewCadence: 'annually',
          status: 'active',
          ownerId: 'usr_dpo',
          createdBy: 'usr_dpo',
          updatedBy: 'usr_dpo',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'prof_mongodb',
          tenantId: 'tenant_test',
          vendorId: 'vend_mongo',
          engagementName: 'MongoDB Atlas Cloud',
          processorRole: 'subprocessor',
          serviceDescription: 'Managed Database Cluster',
          dataCategories: ['analytics'],
          dataSubjects: ['customers'],
          isSpecialCategoryData: false,
          jurisdictions: ['DE'],
          linkedSystemAssetIds: ['asset_data_lake'],
          criticality: 'high',
          ownerUserId: 'usr_sec_lead',
          reviewCadence: 'semi_annually',
          status: 'active',
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ] as unknown as ProcessorProfile[];

      const mockVendors = [
        {
          id: 'vend_aws',
          tenantId: 'tenant_test',
          name: 'Amazon Web Services Inc.',
          category: 'cloud_provider',
          riskTier: 'critical',
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'vend_salesforce',
          tenantId: 'tenant_test',
          name: 'Salesforce EMEA Ltd (Slack)',
          category: 'saas_service',
          riskTier: 'medium',
          ownerId: 'usr_dpo',
          createdBy: 'usr_dpo',
          updatedBy: 'usr_dpo',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'vend_mongo',
          tenantId: 'tenant_test',
          name: 'MongoDB Inc.',
          category: 'subprocessor',
          riskTier: 'critical',
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ] as unknown as Vendor[];

      const mockAssets = [
        {
          id: 'asset_core_bank',
          tenantId: 'tenant_test',
          name: 'Core Banking Engine',
          assetType: 'cloud_infrastructure',
          criticality: 'critical',
          dataClassification: 'restricted_personal',
          hostingLocation: 'DE',
          vendorId: 'vend_aws',
          containsPersonalData: true,
          containsSpecialCategoryData: false,
          containsTrainingData: false,
          processorProfileIds: ['prof_aws'],
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'asset_data_lake',
          tenantId: 'tenant_test',
          name: 'Enterprise Data Lake',
          assetType: 'database',
          criticality: 'critical',
          dataClassification: 'restricted_personal',
          hostingLocation: 'DE',
          vendorId: 'vend_aws',
          containsPersonalData: true,
          containsSpecialCategoryData: true,
          containsTrainingData: false,
          processorProfileIds: ['prof_aws', 'prof_mongodb'],
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'asset_crm_hub',
          tenantId: 'tenant_test',
          name: 'Employee CRM Hub',
          assetType: 'internal_software',
          criticality: 'medium',
          dataClassification: 'internal',
          hostingLocation: 'DE',
          vendorId: 'vend_salesforce',
          containsPersonalData: true,
          containsSpecialCategoryData: false,
          containsTrainingData: false,
          processorProfileIds: ['prof_slack'],
          ownerId: 'usr_dpo',
          createdBy: 'usr_dpo',
          updatedBy: 'usr_dpo',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ] as unknown as SystemAsset[];

      const mockEvidence = [
        {
          id: 'ev_aws_iso_doc',
          tenantId: 'tenant_test',
          title: 'AWS ISO 27001 Certificate 2024-2027.pdf',
          category: 'iso_certificate',
          status: 'valid',
          fileHashSha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          storagePath: 'tenants/tenant_test/evidence/ev_aws_iso.pdf',
          processorCertificationIds: ['cert_aws_iso'],
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        {
          id: 'ev_aws_soc2_doc',
          tenantId: 'tenant_test',
          title: 'AWS SOC 2 Type II Security Report.pdf',
          category: 'soc_report',
          status: 'valid',
          fileHashSha256: 'a3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
          storagePath: 'tenants/tenant_test/evidence/ev_aws_soc2.pdf',
          processorCertificationIds: ['cert_aws_soc2'],
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ] as unknown as Evidence[];

      const mockCerts: ProcessorCertification[] = [
        // 1. AWS ISO 27001 (Active Valid, 2 years remaining, Evidence attached, covers Banking Engine)
        {
          id: 'cert_aws_iso',
          tenantId: 'tenant_test',
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
        // 2. AWS SOC 2 Type II (Expiring Soon: 2025-01-20 is 19 days from 2025-01-01)
        {
          id: 'cert_aws_soc2',
          tenantId: 'tenant_test',
          processorProfileId: 'prof_aws',
          artifactKind: 'independent_attestation_report',
          standardFamily: 'soc2_type2',
          issuingBodyOrAuditor: 'PwC LLP',
          leadAuditorName: 'Sarah Jenkins',
          certificateOrReportNumber: 'PWC-2024-SOC2-AWS',
          reportPeriodStart: '2024-01-01T00:00:00.000Z',
          reportPeriodEnd: '2024-12-31T00:00:00.000Z',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2025-01-20T00:00:00.000Z', // <= 60d
          status: 'active_valid',
          assuranceScopeSummary: 'Security & Availability Trust Services Criteria',
          legalEntityOrRegionalScope: 'AWS Global',
          systemsOrServicesCovered: ['Enterprise Data Lake', 'S3'],
          reviewOwnerUserId: 'usr_sec_lead',
          reviewStatus: 'accepted',
          reviewDueDate: '2025-01-10T00:00:00.000Z',
          linkedEvidenceIds: ['ev_aws_soc2_doc'],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        // 3. Slack ISO 27001 (Expired, Missing Evidence)
        {
          id: 'cert_slack_iso_expired',
          tenantId: 'tenant_test',
          processorProfileId: 'prof_slack',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'A-LIGN Compliance',
          certificateOrReportNumber: 'ALIGN-SLACK-2023',
          validFrom: '2021-01-01T00:00:00.000Z',
          validUntil: '2024-12-31T00:00:00.000Z', // Lapsed as of 2025-01-01
          status: 'expired',
          assuranceScopeSummary: 'Slack Grid Services',
          legalEntityOrRegionalScope: 'Salesforce US',
          systemsOrServicesCovered: ['Employee CRM Hub'],
          reviewOwnerUserId: 'usr_dpo',
          reviewStatus: 'pending',
          reviewDueDate: '2024-11-01T00:00:00.000Z',
          linkedEvidenceIds: [], // Missing evidence!
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_dpo',
          createdBy: 'usr_dpo',
          updatedBy: 'usr_dpo',
          createdAt: '2021-01-01T00:00:00.000Z',
          updatedAt: '2024-12-31T00:00:00.000Z',
        },
        // 4. MongoDB CSA STAR (Rejected Review)
        {
          id: 'cert_mongo_csa_rejected',
          tenantId: 'tenant_test',
          processorProfileId: 'prof_mongodb',
          artifactKind: 'industry_label',
          standardFamily: 'csa_star',
          issuingBodyOrAuditor: 'BSI Group',
          certificateOrReportNumber: 'BSI-STAR-MONGO',
          validFrom: '2024-01-01T00:00:00.000Z',
          validUntil: '2026-01-01T00:00:00.000Z',
          status: 'active_valid',
          assuranceScopeSummary: 'MongoDB Serverless Tier Only',
          legalEntityOrRegionalScope: 'US East',
          systemsOrServicesCovered: ['Atlas Serverless'],
          reviewOwnerUserId: 'usr_sec_lead',
          reviewStatus: 'rejected',
          rejectionReason: 'Scope limited to US East serverless tier; does not cover EU Dedicated Clusters.',
          reviewDueDate: '2024-10-01T00:00:00.000Z',
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 2,
          hasMajorDeficiencies: true,
          isInsufficient: false,
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
        // 5. AWS ISO 27001 v1 (Superseded Historic Version)
        {
          id: 'cert_aws_iso_v1_historic',
          tenantId: 'tenant_test',
          processorProfileId: 'prof_aws',
          artifactKind: 'accredited_certification',
          standardFamily: 'iso_27001',
          issuingBodyOrAuditor: 'EY CertifyPoint',
          certificateOrReportNumber: 'EY-2021-AWS-V1',
          validFrom: '2021-01-01T00:00:00.000Z',
          validUntil: '2024-01-01T00:00:00.000Z',
          status: 'superseded',
          assuranceScopeSummary: 'Historic AWS Scope',
          legalEntityOrRegionalScope: 'AWS EMEA',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_sec_lead',
          reviewStatus: 'superseded',
          reviewDueDate: '2023-12-01T00:00:00.000Z',
          replacedByCertificationId: 'cert_aws_iso',
          versionNumber: 1,
          isHistoricVersion: true,
          linkedEvidenceIds: [],
          unresolvedFindingsCount: 0,
          hasMajorDeficiencies: false,
          isInsufficient: false,
          ownerId: 'usr_sec_lead',
          createdBy: 'usr_sec_lead',
          updatedBy: 'usr_sec_lead',
          createdAt: '2021-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:00:00.000Z',
        },
      ];

      it('synthesizes correlated assurance inventory items with accurate health and linked assets', () => {
        const items = synthesizeProcessorAssuranceInventory(
          mockCerts,
          mockProfiles,
          mockVendors,
          mockAssets,
          mockEvidence,
          asOfDate
        );

        expect(items).toHaveLength(5);

        const awsIso = items.find((i) => i.certification.id === 'cert_aws_iso')!;
        expect(awsIso.processorProfile.name).toBe('AWS Cloud Infrastructure');
        expect(awsIso.vendor?.name).toBe('Amazon Web Services Inc.');
        expect(awsIso.isCriticalProcessor).toBe(true);
        expect(awsIso.validityStatus).toBe('valid_now');
        expect(awsIso.hasAttachedEvidence).toBe(true);
        expect(awsIso.attachedEvidenceCount).toBe(1);
        expect(awsIso.linkedSystemNames).toContain('Core Banking Engine');
        expect(awsIso.linkedSystemNames).toContain('Enterprise Data Lake');

        const awsSoc2 = items.find((i) => i.certification.id === 'cert_aws_soc2')!;
        expect(awsSoc2.validityStatus).toBe('expiring_soon');
        expect(awsSoc2.isExpiringSoon).toBe(true);
        expect(awsSoc2.daysUntilExpiry).toBe(19);

        const slackIso = items.find((i) => i.certification.id === 'cert_slack_iso_expired')!;
        expect(slackIso.validityStatus).toBe('expired');
        expect(slackIso.isExpired).toBe(true);
        expect(slackIso.hasAttachedEvidence).toBe(false);

        const mongoCsa = items.find((i) => i.certification.id === 'cert_mongo_csa_rejected')!;
        expect(mongoCsa.isInsufficientOrRejected).toBe(true);
        expect(mongoCsa.gaps.some((g) => g.code === 'PROCESSOR_CERT_REJECTED')).toBe(true);

        const historic = items.find((i) => i.certification.id === 'cert_aws_iso_v1_historic')!;
        expect(historic.validityStatus).toBe('superseded');
      });

      it('filters inventory by standardFamily and artifactKind', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        // Filter ISO 27001 (excludes historic by default)
        const isoItems = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          standardFamily: 'iso_27001',
        });
        expect(isoItems).toHaveLength(2); // cert_aws_iso & cert_slack_iso_expired
        expect(isoItems.map((i) => i.certification.id)).toContain('cert_aws_iso');
        expect(isoItems.map((i) => i.certification.id)).toContain('cert_slack_iso_expired');

        // Filter SOC 2 Type II
        const soc2Items = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          standardFamily: 'soc2_type2',
        });
        expect(soc2Items).toHaveLength(1);
        expect(soc2Items[0]!.certification.id).toBe('cert_aws_soc2');

        // Filter artifactKind: accredited_certification
        const certKindItems = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          artifactKind: 'accredited_certification',
        });
        expect(certKindItems).toHaveLength(2);
      });

      it('filters inventory by validityStatus (valid_now, expiring_soon, expired)', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        const validNow = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          validityStatus: 'valid_now',
        });
        expect(validNow.map((i) => i.certification.id)).toEqual(['cert_aws_iso', 'cert_mongo_csa_rejected']);

        const expiringSoon = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          validityStatus: 'expiring_soon',
        });
        expect(expiringSoon).toHaveLength(1);
        expect(expiringSoon[0]!.certification.id).toBe('cert_aws_soc2');

        const expired = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          validityStatus: 'expired',
        });
        expect(expired).toHaveLength(1);
        expect(expired[0]!.certification.id).toBe('cert_slack_iso_expired');
      });

      it('filters inventory by criticalProcessorOnly', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        const criticalOnly = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          criticalProcessorOnly: true,
        });

        // AWS is critical; Slack is medium; Mongo is high
        expect(criticalOnly).toHaveLength(2);
        expect(criticalOnly.every((i) => i.processorProfile.id === 'prof_aws')).toBe(true);
      });

      it('filters inventory by issuer and auditor search query', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        const eyItems = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          issuerQuery: 'EY CertifyPoint',
        });
        expect(eyItems).toHaveLength(1);
        expect(eyItems[0]!.certification.id).toBe('cert_aws_iso');

        const pwcAuditor = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          issuerQuery: 'Sarah Jenkins',
        });
        expect(pwcAuditor).toHaveLength(1);
        expect(pwcAuditor[0]!.certification.id).toBe('cert_aws_soc2');
      });

      it('filters inventory by linked system asset and covered services', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        const bankingItems = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          linkedSystemAssetId: 'asset_core_bank',
        });
        expect(bankingItems).toHaveLength(2); // AWS certs

        const crmCovered = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          coveredSystemOrService: 'Employee CRM Hub',
        });
        expect(crmCovered).toHaveLength(1);
        expect(crmCovered[0]!.certification.id).toBe('cert_slack_iso_expired');
      });

      it('filters inventory by missingEvidenceOnly and insufficientOrRejectedOnly', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        const missingEvidence = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          missingEvidenceOnly: true,
        });
        expect(missingEvidence.map((i) => i.certification.id)).toContain('cert_slack_iso_expired');
        expect(missingEvidence.map((i) => i.certification.id)).toContain('cert_mongo_csa_rejected');

        const rejectedOrInsufficient = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          insufficientOrRejectedOnly: true,
        });
        expect(rejectedOrInsufficient).toHaveLength(1);
        expect(rejectedOrInsufficient[0]!.certification.id).toBe('cert_mongo_csa_rejected');
      });

      it('filters inventory using freeform multi-attribute search query', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);

        // Search by Certificate Number
        const searchByNum = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          searchQuery: 'PWC-2024',
        });
        expect(searchByNum).toHaveLength(1);
        expect(searchByNum[0]!.certification.id).toBe('cert_aws_soc2');

        // Search by Vendor Name
        const searchByVendor = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          searchQuery: 'Salesforce',
        });
        expect(searchByVendor).toHaveLength(1);
        expect(searchByVendor[0]!.certification.id).toBe('cert_slack_iso_expired');

        // Search by Scope keyword
        const searchByScope = filterProcessorAssuranceInventory(allItems, {
          tenantId: 'tenant_test',
          searchQuery: 'Serverless',
        });
        expect(searchByScope).toHaveLength(1);
        expect(searchByScope[0]!.certification.id).toBe('cert_mongo_csa_rejected');
      });

      it('calculates inventory KPI summary accurately', () => {
        const allItems = synthesizeProcessorAssuranceInventory(mockCerts, mockProfiles, mockVendors, mockAssets, mockEvidence, asOfDate);
        const summary = summarizeProcessorAssuranceInventory(allItems);

        expect(summary.totalAssuranceRecords).toBe(5);
        expect(summary.activeValidCount).toBe(3); // cert_aws_iso (valid_now), cert_aws_soc2 (expiring_soon), cert_mongo (valid_now)
        expect(summary.expiringSoonCount).toBe(1); // cert_aws_soc2
        expect(summary.expiredCount).toBe(1);      // cert_slack_iso_expired
        expect(summary.supersededCount).toBe(1);   // cert_aws_iso_v1_historic
        expect(summary.criticalProcessorsCount).toBe(1); // prof_aws (distinct profile)
        expect(summary.missingEvidenceCount).toBe(2);    // cert_slack_iso_expired, cert_mongo_csa_rejected
        expect(summary.insufficientOrRejectedCount).toBe(1); // cert_mongo_csa_rejected
        expect(summary.pendingReviewCount).toBe(1); // cert_slack_iso_expired
        expect(summary.standardBreakdown['iso_27001']).toBe(3);
        expect(summary.standardBreakdown['soc2_type2']).toBe(1);
        expect(summary.standardBreakdown['csa_star']).toBe(1);
      });
    });
  });
});

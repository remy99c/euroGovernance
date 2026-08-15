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
  Evidence,
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
          validUntil: '2025-11-15T00:00:00.000Z', // Expiring in 15 days relative to 2025-11-01
          status: 'active_valid',
          assuranceScopeSummary: 'Cloud Services',
          legalEntityOrRegionalScope: 'Global',
          systemsOrServicesCovered: ['Compute'],
          reviewOwnerUserId: 'usr_compliance_01',
          reviewStatus: 'accepted',
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
      expect(reminders.some((r) => r.reminderType === 'certification_expiry_warning_30d')).toBe(true);
      expect(reminders.some((r) => r.reminderType === 'processor_annual_review_due')).toBe(true);
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
});

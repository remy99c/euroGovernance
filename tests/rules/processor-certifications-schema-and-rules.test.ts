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
        reviewStatus: 'compliant_verified',
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
        reviewStatus: 'compliant_verified',
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
          reviewStatus: 'compliant_verified',
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
          reviewStatus: 'under_assessment',
          status: 'active_valid',
        });
      });

      const compCtx = testEnv.authenticatedContext('usr_compliance_01');
      const db = compCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/processor_certifications/cert_aws_soc2');

      await assertSucceeds(
        certRef.update({
          reviewStatus: 'compliant_verified',
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
        reviewStatus: 'compliant_verified',
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
        reviewStatus: 'under_assessment',
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
          reviewStatus: 'compliant_verified',
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
});

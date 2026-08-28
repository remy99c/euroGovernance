import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
} from '@firebase/rules-unit-testing';
import {
  Certification,
  Evidence,
  evaluateCertificationCompleteness,
  evaluateCertificationRiskFlags,
  evaluateCertificationReminders,
} from '@eurogovernance/shared-types';
import { getFirestoreRules } from './fixtures/test-factories.js';

const PROJECT_ID = 'eurogovernance-cert-test';

describe('Certifications & Structured Assurance Schema, Security Rules & Evaluator Tests', () => {
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

    // Setup base tenant and memberships with admin context
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
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_security_01').set({
        id: 'usr_security_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_security_01',
        role: 'security_manager',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_contributor_01').set({
        id: 'usr_contributor_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_contributor_01',
        role: 'contributor',
        status: 'active',
      });
      await db.doc('tenants/tenant_eurocorp_de/memberships/usr_viewer_01').set({
        id: 'usr_viewer_01',
        tenantId: 'tenant_eurocorp_de',
        userId: 'usr_viewer_01',
        role: 'viewer',
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
    });
  });

  describe('1. Multi-Tenant Security Rules Isolation & RBAC', () => {
    it('denies tenant_admin direct creation of structured certification records', async () => {
      const adminCtx = testEnv.authenticatedContext('usr_admin_01');
      const db = adminCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/certifications/cert_iso27001');

      await assertFails(
        certRef.set({
          id: 'cert_iso27001',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'ISO/IEC 27001:2022 ISMS Certificate',
          certificationType: 'iso_27001',
          issuingBody: 'TÜV Rheinland',
          certificateNumber: '01 104 219804',
          scopeDescription: 'Production cloud infrastructure and SaaS platform',
          applicableStandardVersion: 'ISO/IEC 27001:2022',
          issueDate: '2025-06-01T00:00:00.000Z',
          expiryDate: '2028-05-31T23:59:59.000Z',
          status: 'active_valid',
          surveillanceAuditDueDate: '2026-05-15T00:00:00.000Z',
          leadAuditorName: 'Dr. Frank Meier',
          leadAuditorContact: 'f.meier@tuv.de',
          frameworkIds: ['iso_27001'],
          linkedControlIds: ['ctrl_01'],
          linkedEvidenceIds: [],
          continuousComplianceStatus: 'compliant',
          unresolvedFindingsCount: 0,
          notes: null,
          ownerId: 'usr_admin_01',
          createdBy: 'usr_admin_01',
          updatedBy: 'usr_admin_01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        })
      );
    });

    it('requires verified server projections for compliance-manager reads and commands for updates', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/certifications/cert_soc2').set({
          id: 'cert_soc2',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'SOC 2 Type II Report',
          certificationType: 'soc2_type2',
          issuingBody: 'PwC',
          certificateNumber: 'PWC-SOC2-2025',
          scopeDescription: 'Core platform',
          applicableStandardVersion: 'AICPA TSP 100',
          issueDate: '2025-01-01T00:00:00.000Z',
          expiryDate: '2026-01-01T00:00:00.000Z',
          status: 'active_valid',
          surveillanceAuditDueDate: null,
          leadAuditorName: null,
          leadAuditorContact: null,
          frameworkIds: [],
          linkedControlIds: [],
          linkedEvidenceIds: [],
          continuousComplianceStatus: 'compliant',
          unresolvedFindingsCount: 0,
          notes: null,
          ownerId: 'usr_admin_01',
          createdBy: 'usr_admin_01',
          updatedBy: 'usr_admin_01',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });
      });

      const compCtx = testEnv.authenticatedContext('usr_compliance_01');
      const db = compCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/certifications/cert_soc2');

      await assertFails(certRef.get());
      await assertFails(
        certRef.update({
          notes: 'Updated by compliance manager',
          updatedBy: 'usr_compliance_01',
          updatedAt: new Date().toISOString(),
        })
      );
    });

    it('requires verified server projections for auditor reads and blocks writes', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/certifications/cert_soc2').set({
          id: 'cert_soc2',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'SOC 2 Type II Report',
          certificationType: 'soc2_type2',
          status: 'active_valid',
        });
      });

      const auditorCtx = testEnv.authenticatedContext('usr_auditor_01');
      const db = auditorCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/certifications/cert_soc2');

      await assertFails(certRef.get());
      await assertFails(
        certRef.update({
          status: 'expired',
        })
      );
    });

    it('keeps immutable certification history server-only and blocks every browser mutation', async () => {
      const certPath = 'tenants/tenant_eurocorp_de/certifications/cert_versioned';
      const versionPath = `${certPath}/versions/r0000000001`;
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(certPath).set({
          id: 'cert_versioned',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'Versioned external assurance record',
          status: 'active_valid',
          revision: 1,
        });
        await db.doc(versionPath).set({
          id: 'r0000000001',
          tenantId: 'tenant_eurocorp_de',
          certificationId: 'cert_versioned',
          revision: 1,
          stateHash: 'a'.repeat(64),
          state: { notes: 'historic sensitive auditor note' },
        });
      });

      for (const userId of [
        'usr_admin_01',
        'usr_compliance_01',
        'usr_security_01',
        'usr_auditor_01',
      ]) {
        const db = testEnv.authenticatedContext(userId).firestore();
        await assertFails(db.doc(versionPath).get());
      }

      for (const userId of ['usr_contributor_01', 'usr_viewer_01']) {
        const db = testEnv.authenticatedContext(userId).firestore();
        await assertFails(db.doc(versionPath).get());
      }

      const adminDb = testEnv.authenticatedContext('usr_admin_01').firestore();
      await assertFails(adminDb.doc(versionPath).set({ stateHash: 'forged' }));
      await assertFails(adminDb.doc(versionPath).update({ stateHash: 'forged' }));
      await assertFails(adminDb.doc(versionPath).delete());

      const nordicDb = testEnv.authenticatedContext('usr_nordic_admin').firestore();
      await assertFails(nordicDb.doc(versionPath).get());
    });

    it('enforces strict tenant isolation (Tenant B cannot read Tenant A certifications)', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc('tenants/tenant_eurocorp_de/certifications/cert_secret').set({
          id: 'cert_secret',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'Proprietary ISO Certificate',
          status: 'active_valid',
        });
      });

      const nordicCtx = testEnv.authenticatedContext('usr_nordic_admin');
      const db = nordicCtx.firestore();
      const certRef = db.doc('tenants/tenant_eurocorp_de/certifications/cert_secret');

      await assertFails(certRef.get());
    });
  });

  describe('2. Deterministic Completeness & Evidence Evaluator', () => {
    it('marks certification as complete when valid certificate evidence is attached', () => {
      const cert: Certification = {
        id: 'cert_01',
        tenantId: 'tenant_eurocorp_de',
        certificationName: 'ISO 27001 Certificate',
        certificationType: 'iso_27001',
        issuingBody: 'TÜV Rheinland',
        certificateNumber: '01-104',
        scopeDescription: 'SaaS Platform',
        applicableStandardVersion: '2022',
        issueDate: '2025-01-01T00:00:00.000Z',
        expiryDate: '2028-01-01T00:00:00.000Z',
        status: 'active_valid',
        surveillanceAuditDueDate: '2026-12-01T00:00:00.000Z',
        leadAuditorName: null,
        leadAuditorContact: null,
        frameworkIds: ['iso_27001'],
        linkedControlIds: [],
        linkedEvidenceIds: ['ev_cert_doc'],
        continuousComplianceStatus: 'compliant',
        unresolvedFindingsCount: 0,
        notes: null,
        ownerId: 'usr_01',
        createdBy: 'usr_01',
        updatedBy: 'usr_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const evidenceDocs: Evidence[] = [
        {
          id: 'ev_cert_doc',
          tenantId: 'tenant_eurocorp_de',
          title: 'Official ISO 27001 PDF',
          description: 'Accredited certificate',
          category: 'iso_certificate',
          status: 'valid',
          storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_cert_doc.pdf',
          fileSizeBytes: 500000,
          mimeType: 'application/pdf',
          fileHashSha256: 'a'.repeat(64),
          objectVerification: {
            status: 'verified',
            storagePath: 'tenants/tenant_eurocorp_de/evidence/ev_cert_doc.pdf',
            storageGeneration: '1',
            verifiedFileHashSha256: 'a'.repeat(64),
            verifiedFileSizeBytes: 500000,
            verifiedMimeType: 'application/pdf',
            verifiedAt: '2025-01-01T00:00:00.000Z',
            verifier: 'storage_finalize_function',
          },
          controlIds: [],
          requirementIds: [],
          policyIds: [],
          riskIds: [],
          assessmentIds: [],
          collectedAt: '2025-01-01T00:00:00.000Z',
          reviewDueDate: '2026-01-01T00:00:00.000Z',
          reviewedBy: 'usr_01',
          reviewedAt: '2025-01-01T00:00:00.000Z',
          rejectionReason: null,
          currentVersion: 1,
          ownerId: 'usr_01',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
          createdBy: 'usr_01',
          updatedBy: 'usr_01',
        },
      ];

      const result = evaluateCertificationCompleteness(cert, evidenceDocs, new Date('2026-01-01'));
      expect(result.isComplete).toBe(true);
      expect(result.hasValidCertificateDocument).toBe(true);
      expect(result.gaps.length).toBe(0);
    });

    it('does not treat legacy valid metadata as a verified certificate object', () => {
      const cert = {
        id: 'cert_unverified',
        tenantId: 'tenant_eurocorp_de',
        certificationName: 'Unverified certificate record',
        certificationType: 'iso_27001',
        issuingBody: 'Registrar',
        certificateNumber: 'UNVERIFIED-1',
        scopeDescription: '',
        applicableStandardVersion: '2022',
        issueDate: '2025-01-01T00:00:00.000Z',
        expiryDate: '2028-01-01T00:00:00.000Z',
        status: 'active_valid',
        surveillanceAuditDueDate: null,
        leadAuditorName: null,
        leadAuditorContact: null,
        frameworkIds: [],
        linkedControlIds: [],
        linkedEvidenceIds: ['ev_legacy'],
        continuousComplianceStatus: 'not_assessed',
        unresolvedFindingsCount: 0,
        notes: null,
        ownerId: 'usr_01',
        createdBy: 'usr_01',
        updatedBy: 'usr_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      } satisfies Certification;
      const legacyEvidence = {
        id: 'ev_legacy',
        tenantId: 'tenant_eurocorp_de',
        title: 'Caller-declared metadata',
        description: '',
        category: 'iso_certificate',
        status: 'valid',
        storagePath: 'tenants/tenant_eurocorp_de/evidence/missing.pdf',
        fileSizeBytes: 10,
        mimeType: 'application/pdf',
        fileHashSha256: 'caller-declared',
        controlIds: [],
        requirementIds: [],
        policyIds: [],
        riskIds: [],
        assessmentIds: [],
        collectedAt: '2025-01-01T00:00:00.000Z',
        reviewDueDate: null,
        reviewedBy: 'usr_01',
        reviewedAt: '2025-01-01T00:00:00.000Z',
        rejectionReason: null,
        currentVersion: 1,
        ownerId: 'usr_01',
        createdBy: 'usr_01',
        updatedBy: 'usr_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      } satisfies Evidence;

      const result = evaluateCertificationCompleteness(
        cert,
        [legacyEvidence],
        new Date('2026-01-01')
      );
      expect(result.hasValidCertificateDocument).toBe(false);
      expect(result.isComplete).toBe(false);
    });

    it('identifies missing evidence gap when certificate has no attached document', () => {
      const cert: Certification = {
        id: 'cert_02',
        tenantId: 'tenant_eurocorp_de',
        certificationName: 'SOC 2 Type II',
        certificationType: 'soc2_type2',
        issuingBody: 'PwC',
        certificateNumber: 'SOC-99',
        scopeDescription: 'SaaS Platform',
        applicableStandardVersion: '2017',
        issueDate: '2025-01-01T00:00:00.000Z',
        expiryDate: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        surveillanceAuditDueDate: null,
        leadAuditorName: null,
        leadAuditorContact: null,
        frameworkIds: [],
        linkedControlIds: [],
        linkedEvidenceIds: [],
        continuousComplianceStatus: 'compliant',
        unresolvedFindingsCount: 0,
        notes: null,
        ownerId: 'usr_01',
        createdBy: 'usr_01',
        updatedBy: 'usr_01',
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const result = evaluateCertificationCompleteness(cert, [], new Date('2025-06-01'));
      expect(result.isComplete).toBe(false);
      expect(result.hasValidCertificateDocument).toBe(false);
      expect(result.gaps.some((g: any) => g.code === 'CERTIFICATION_MISSING_EVIDENCE')).toBe(true);
    });

    it('flags expired certificate and surveillance audit overdue', () => {
      const cert: Certification = {
        id: 'cert_03',
        tenantId: 'tenant_eurocorp_de',
        certificationName: 'BSI C5 Attestation',
        certificationType: 'bsi_c5',
        issuingBody: 'KPMG',
        certificateNumber: 'C5-123',
        scopeDescription: 'Cloud Infrastructure',
        applicableStandardVersion: '2020',
        issueDate: '2024-01-01T00:00:00.000Z',
        expiryDate: '2025-01-01T00:00:00.000Z',
        status: 'expired',
        surveillanceAuditDueDate: '2024-06-01T00:00:00.000Z',
        leadAuditorName: null,
        leadAuditorContact: null,
        frameworkIds: [],
        linkedControlIds: [],
        linkedEvidenceIds: [],
        continuousComplianceStatus: 'major_non_conformity',
        unresolvedFindingsCount: 2,
        notes: null,
        ownerId: 'usr_01',
        createdBy: 'usr_01',
        updatedBy: 'usr_01',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z',
      };

      const result = evaluateCertificationCompleteness(cert, [], new Date('2025-06-01'));
      expect(result.isExpired).toBe(true);
      expect(result.gaps.some((g: any) => g.code === 'CERTIFICATION_EXPIRED')).toBe(true);
      expect(result.gaps.some((g: any) => g.code === 'MAJOR_NON_CONFORMITY_ACTIVE')).toBe(true);
    });
  });

  describe('3. Deterministic Risk Flags & Reminder Evaluators', () => {
    it('correctly aggregates risk flags and calculates overall assurance risk level', () => {
      const certs: Certification[] = [
        {
          id: 'c1',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'Expired Certificate',
          certificationType: 'iso_27001',
          issuingBody: 'BSI',
          certificateNumber: 'EX-1',
          scopeDescription: '',
          applicableStandardVersion: '2022',
          issueDate: '2022-01-01T00:00:00.000Z',
          expiryDate: '2025-01-01T00:00:00.000Z',
          status: 'expired',
          surveillanceAuditDueDate: null,
          leadAuditorName: null,
          leadAuditorContact: null,
          frameworkIds: [],
          linkedControlIds: [],
          linkedEvidenceIds: [],
          continuousComplianceStatus: 'compliant',
          unresolvedFindingsCount: 0,
          notes: null,
          ownerId: 'usr_01',
          createdBy: 'usr_01',
          updatedBy: 'usr_01',
          createdAt: '2022-01-01T00:00:00.000Z',
          updatedAt: '2022-01-01T00:00:00.000Z',
        },
      ];

      const risk = evaluateCertificationRiskFlags(certs, [], new Date('2025-06-01'));
      expect(risk.totalCertifications).toBe(1);
      expect(risk.expiredCount).toBe(1);
      expect(risk.overallAssuranceRiskLevel).toBe('critical');
      expect(risk.flags.length).toBeGreaterThanOrEqual(1);
    });

    it('generates 30d, 90d, and surveillance audit reminders', () => {
      const certs: Certification[] = [
        {
          id: 'c_rem',
          tenantId: 'tenant_eurocorp_de',
          certificationName: 'Expiring Certificate',
          certificationType: 'soc2_type2',
          issuingBody: 'PwC',
          certificateNumber: 'REM-1',
          scopeDescription: '',
          applicableStandardVersion: '2017',
          issueDate: '2025-01-01T00:00:00.000Z',
          expiryDate: '2026-02-01T00:00:00.000Z',
          status: 'active_valid',
          surveillanceAuditDueDate: '2026-01-20T00:00:00.000Z',
          leadAuditorName: null,
          leadAuditorContact: null,
          frameworkIds: [],
          linkedControlIds: [],
          linkedEvidenceIds: [],
          continuousComplianceStatus: 'compliant',
          unresolvedFindingsCount: 0,
          notes: null,
          ownerId: 'usr_admin_01',
          createdBy: 'usr_admin_01',
          updatedBy: 'usr_admin_01',
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        },
      ];

      const reminders = evaluateCertificationReminders(certs, [], {
        asOfDate: new Date('2026-01-10T00:00:00.000Z'),
        windowDays: 90,
      });

      expect(reminders.some((r: any) => r.reminderType === 'certification_expiry_warning_30d')).toBe(true);
      expect(reminders.some((r: any) => r.reminderType === 'certification_surveillance_audit_due')).toBe(true);
      expect(reminders.some((r: any) => r.reminderType === 'certification_missing_evidence_follow_up')).toBe(true);
    });
  });
});

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
  validateProcessorCertificationReviewTransition,
  validateProcessorCertification,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-processor-cert-auth-rules-test',
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
      name: 'Nordic AI Health AB',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Memberships Tenant A
    const membersA = [
      PERSONAS.adminA,
      PERSONAS.complianceA,
      PERSONAS.privacyA,
      PERSONAS.securityA,
      PERSONAS.aiGovA,
      PERSONAS.approverA,
      PERSONAS.auditorA,
      PERSONAS.contributorA,
      PERSONAS.viewerA,
    ];

    for (const m of membersA) {
      await db.doc(`tenants/${tenantA}/memberships/${m.uid}`).set({
        userId: m.uid,
        tenantId: tenantA,
        role: m.role,
        status: 'active',
      });
    }

    // 3. Memberships Tenant B
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      userId: PERSONAS.adminB.uid,
      tenantId: tenantB,
      role: PERSONAS.adminB.role,
      status: 'active',
    });
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.contributorB.uid}`).set({
      userId: PERSONAS.contributorB.uid,
      tenantId: tenantB,
      role: PERSONAS.contributorB.role,
      status: 'active',
    });
  });
});

describe('Processor Certifications, Reviews, Evidence, Notifications & Export Access Rules', () => {
  const now = new Date('2026-08-15T00:00:00.000Z').toISOString();

  const validCertDoc = {
    id: 'cert_aws_01',
    tenantId: tenantA,
    processorProfileId: 'prof_aws',
    artifactKind: 'accredited_certification',
    standardFamily: 'iso_27001',
    issuingBodyOrAuditor: 'EY CertifyPoint',
    certificateOrReportNumber: 'EY-2026-AWS',
    validFrom: '2025-01-01T00:00:00.000Z',
    validUntil: '2028-01-01T00:00:00.000Z',
    status: 'active_valid',
    assuranceScopeSummary: 'All EU Data Centers',
    legalEntityOrRegionalScope: 'Amazon Web Services EMEA SARL',
    systemsOrServicesCovered: ['Banking Core', 'Storage'],
    reviewOwnerUserId: PERSONAS.securityA.uid,
    reviewStatus: 'accepted',
    reviewDueDate: '2027-01-01T00:00:00.000Z',
    linkedEvidenceIds: ['ev_aws_cert_doc'],
    unresolvedFindingsCount: 0,
    hasMajorDeficiencies: false,
    isInsufficient: false,
    ownerId: PERSONAS.securityA.uid,
    createdBy: PERSONAS.securityA.uid,
    updatedBy: PERSONAS.securityA.uid,
    createdAt: now,
    updatedAt: now,
  };

  // ===========================================================================
  // 1. Processor Certifications Authorization (CRUD & Tenant Isolation)
  // ===========================================================================
  describe('1. Processor Certifications CRUD & Authorization', () => {
    test('Authorized roles (admin, compliance, privacy, security) can create processor certifications', async () => {
      const authPersonas = [
        PERSONAS.adminA,
        PERSONAS.complianceA,
        PERSONAS.privacyA,
        PERSONAS.securityA,
      ];

      for (const p of authPersonas) {
        const db = testEnv.authenticatedContext(p.uid).firestore();
        const certId = `cert_${p.role}_create`;

        await assertSucceeds(
          db.doc(`tenants/${tenantA}/processor_certifications/${certId}`).set({
            ...validCertDoc,
            id: certId,
            createdBy: p.uid,
            updatedBy: p.uid,
          })
        );
      }
    });

    test('Unauthorized roles (contributor, viewer, auditor) cannot create processor certifications', async () => {
      const unauthPersonas = [
        PERSONAS.contributorA,
        PERSONAS.viewerA,
        PERSONAS.auditorA,
      ];

      for (const p of unauthPersonas) {
        const db = testEnv.authenticatedContext(p.uid).firestore();
        const certId = `cert_${p.role}_fail`;

        await assertFails(
          db.doc(`tenants/${tenantA}/processor_certifications/${certId}`).set({
            ...validCertDoc,
            id: certId,
            createdBy: p.uid,
            updatedBy: p.uid,
          })
        );
      }
    });

    test('Approver role can update processor certifications for review outcomes', async () => {
      // Seed existing certification
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/processor_certifications/cert_to_review`).set(validCertDoc);
      });

      const approverDb = testEnv.authenticatedContext(PERSONAS.approverA.uid).firestore();
      await assertSucceeds(
        approverDb.doc(`tenants/${tenantA}/processor_certifications/cert_to_review`).update({
          reviewStatus: 'accepted',
          reviewNotes: 'Verified accreditation with EY CertifyPoint registrar portal.',
          updatedAt: new Date().toISOString(),
        })
      );
    });

    test('Only Tenant Admin and Compliance Manager can delete processor certifications', async () => {
      // Seed cert for delete test
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/processor_certifications/cert_del_compliance`).set(validCertDoc);
        await db.doc(`tenants/${tenantA}/processor_certifications/cert_del_admin`).set(validCertDoc);
        await db.doc(`tenants/${tenantA}/processor_certifications/cert_del_security`).set(validCertDoc);
      });

      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      // Compliance Manager -> Succeeds
      await assertSucceeds(
        compDb.doc(`tenants/${tenantA}/processor_certifications/cert_del_compliance`).delete()
      );

      // Tenant Admin -> Succeeds
      await assertSucceeds(
        adminDb.doc(`tenants/${tenantA}/processor_certifications/cert_del_admin`).delete()
      );

      // Security Manager -> Fails delete
      await assertFails(
        secDb.doc(`tenants/${tenantA}/processor_certifications/cert_del_security`).delete()
      );
    });

    test('Strict Tenant Isolation: Tenant B user cannot read or mutate Tenant A certifications', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/processor_certifications/cert_a_secret`).set(validCertDoc);
      });

      const userBDb = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      // Read -> Fails
      await assertFails(userBDb.doc(`tenants/${tenantA}/processor_certifications/cert_a_secret`).get());

      // Update -> Fails
      await assertFails(
        userBDb.doc(`tenants/${tenantA}/processor_certifications/cert_a_secret`).update({
          status: 'expired',
        })
      );

      // Delete -> Fails
      await assertFails(userBDb.doc(`tenants/${tenantA}/processor_certifications/cert_a_secret`).delete());
    });
  });

  // ===========================================================================
  // 2. Certification Review Actions & Transition Logic
  // ===========================================================================
  describe('2. Certification Review Actions & Transition Rules', () => {
    test('Domain Review Transition validation prevents invalid lifecycle states', () => {
      // Pending -> In Review -> Accepted is valid
      const t1 = validateProcessorCertificationReviewTransition('pending', 'in_review');
      expect(t1.allowed).toBe(true);

      const t2 = validateProcessorCertificationReviewTransition('in_review', 'accepted');
      expect(t2.allowed).toBe(true);

      // Superseded records cannot be re-reviewed
      const t3 = validateProcessorCertificationReviewTransition('superseded', 'accepted');
      expect(t3.allowed).toBe(false);

      // Form validation requires rejection reason on rejection
      const formCheckReject = validateProcessorCertification({
        tenantId: tenantA,
        processorProfileId: 'prof_aws',
        standardFamily: 'iso_27001',
        artifactKind: 'accredited_certification',
        issuingBodyOrAuditor: 'BSI',
        certificateOrReportNumber: 'BSI-1234',
        validFrom: '2025-01-01T00:00:00.000Z',
        validUntil: '2026-01-01T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'Cloud Services',
        legalEntityOrRegionalScope: 'EU Org',
        reviewOwnerUserId: PERSONAS.securityA.uid,
        reviewStatus: 'rejected',
        rejectionReason: '', // missing
      });
      expect(formCheckReject.valid).toBe(false);
      expect(formCheckReject.errors.some((e) => e.includes('rejectionReason'))).toBe(true);

      // Form validation requires insufficient rationale on mark_insufficient
      const formCheckInsuff = validateProcessorCertification({
        tenantId: tenantA,
        processorProfileId: 'prof_aws',
        standardFamily: 'soc2_type2',
        artifactKind: 'soc_report',
        issuingBodyOrAuditor: 'PwC',
        certificateOrReportNumber: 'SOC-9876',
        reportPeriodStart: '2024-01-01T00:00:00.000Z',
        reportPeriodEnd: '2024-12-31T00:00:00.000Z',
        validFrom: '2024-01-01T00:00:00.000Z',
        validUntil: '2025-12-31T00:00:00.000Z',
        status: 'active_valid',
        assuranceScopeSummary: 'SaaS Platform',
        legalEntityOrRegionalScope: 'Global',
        reviewOwnerUserId: PERSONAS.complianceA.uid,
        reviewStatus: 'insufficient',
        insufficientRationale: '', // missing
      });
      expect(formCheckInsuff.valid).toBe(false);
      expect(formCheckInsuff.errors.some((e) => e.includes('insufficientRationale'))).toBe(true);
    });
  });

  // ===========================================================================
  // 3. Linked Evidence References & Evidence Security Rules
  // ===========================================================================
  describe('3. Linked Evidence References & Evidence Security Rules', () => {
    test('Contributors cannot create evidence metadata before a verified server upload completes', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      await assertFails(
        contribDb.doc(`tenants/${tenantA}/evidence/ev_iso_cert_doc`).set({
          id: 'ev_iso_cert_doc',
          tenantId: tenantA,
          title: 'AWS ISO 27001 2026 Certificate.pdf',
          category: 'iso_certificate',
          status: 'under_review',
          storagePath: `tenants/${tenantA}/evidence/ev_iso_cert_doc.pdf`,
          fileHashSha256: 'abc1234567890def',
          fileSizeBytes: 1048576,
          mimeType: 'application/pdf',
          uploadedBy: PERSONAS.contributorA.uid,
          uploadedAt: now,
          updatedAt: now,
        })
      );
    });

    test('Client direct write CANNOT self-approve evidence status', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      // Attempting to set status: 'valid' directly on create -> Fails
      await assertFails(
        contribDb.doc(`tenants/${tenantA}/evidence/ev_self_approved`).set({
          id: 'ev_self_approved',
          tenantId: tenantA,
          title: 'Self-Approved Doc.pdf',
          category: 'iso_certificate',
          status: 'valid', // Violation of initial status requirement
          storagePath: `tenants/${tenantA}/evidence/ev_self_approved.pdf`,
          fileHashSha256: 'abc1234567890def',
          uploadedBy: PERSONAS.contributorA.uid,
          uploadedAt: now,
          updatedAt: now,
        })
      );
    });

    test('Evidence versions are strictly immutable once created', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/evidence/ev_ver_test`).set({
          id: 'ev_ver_test',
          tenantId: tenantA,
          status: 'under_review',
          storagePath: `tenants/${tenantA}/evidence/ev_ver_test.pdf`,
        });
        await db.doc(`tenants/${tenantA}/evidence/ev_ver_test/versions/v1`).set({
          versionId: 'v1',
          storagePath: `tenants/${tenantA}/evidence/ev_ver_test_v1.pdf`,
          fileHashSha256: 'hash_v1',
          createdAt: now,
        });
      });

      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // Update to version doc -> Forbidden (immutable)
      await assertFails(
        compDb.doc(`tenants/${tenantA}/evidence/ev_ver_test/versions/v1`).update({
          fileHashSha256: 'tampered_hash',
        })
      );
    });
  });

  // ===========================================================================
  // 4. Notification Generation & Access Rules
  // ===========================================================================
  describe('4. Notification Generation & Recipient Privacy Rules', () => {
    test('Client direct create of notifications is strictly blocked (must be generated server-side)', async () => {
      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      await assertFails(
        secDb.doc(`tenants/${tenantA}/notifications/notif_spoofed`).set({
          id: 'notif_spoofed',
          tenantId: tenantA,
          recipientId: PERSONAS.securityA.uid,
          type: 'processor_certification_expiring_soon',
          title: 'Expiring Soon Alert',
          isRead: false,
          createdAt: now,
        })
      );
    });

    test('Tenant member can only read notifications addressed to their own user ID', async () => {
      // Seed two notifications with backend privileges
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/notif_for_security`).set({
          id: 'notif_for_security',
          tenantId: tenantA,
          recipientId: PERSONAS.securityA.uid,
          type: 'processor_certification_review_due',
          title: 'Review Due: AWS Certification',
          isRead: false,
          createdAt: now,
        });
        await db.doc(`tenants/${tenantA}/notifications/notif_for_privacy`).set({
          id: 'notif_for_privacy',
          tenantId: tenantA,
          recipientId: PERSONAS.privacyA.uid,
          type: 'processor_certification_expired',
          title: 'Expired Alert: Slack Certification',
          isRead: false,
          createdAt: now,
        });
      });

      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();
      const privDb = testEnv.authenticatedContext(PERSONAS.privacyA.uid).firestore();

      // Security Manager reads own notification -> Succeeds
      await assertSucceeds(secDb.doc(`tenants/${tenantA}/notifications/notif_for_security`).get());

      // Security Manager reads Privacy Manager notification -> Fails
      await assertFails(secDb.doc(`tenants/${tenantA}/notifications/notif_for_privacy`).get());

      // Privacy Manager reads own notification -> Succeeds
      await assertSucceeds(privDb.doc(`tenants/${tenantA}/notifications/notif_for_privacy`).get());
    });

    test('Recipient can update isRead status on their own notification, but cannot tamper with tenantId or recipientId', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/notifications/notif_read_test`).set({
          id: 'notif_read_test',
          tenantId: tenantA,
          recipientId: PERSONAS.securityA.uid,
          type: 'processor_certification_review_due',
          title: 'Review Due',
          isRead: false,
          createdAt: now,
        });
      });

      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      // Marking as read -> Succeeds
      await assertSucceeds(
        secDb.doc(`tenants/${tenantA}/notifications/notif_read_test`).update({
          isRead: true,
          readAt: new Date().toISOString(),
        })
      );

      // Attempting to transfer recipientId to another user -> Fails
      await assertFails(
        secDb.doc(`tenants/${tenantA}/notifications/notif_read_test`).update({
          recipientId: PERSONAS.privacyA.uid,
        })
      );
    });
  });

  // ===========================================================================
  // 5. Export Access & Security Rules
  // ===========================================================================
  describe('5. Export Job Creation & Access Controls', () => {
    test('Compliance and Security Managers can request export jobs; direct Auditor requests are denied', async () => {
      const authRoles = [PERSONAS.complianceA, PERSONAS.securityA];

      for (const p of authRoles) {
        const db = testEnv.authenticatedContext(p.uid).firestore();
        const jobId = `exp_job_${p.role}`;

        await assertSucceeds(
          db.doc(`tenants/${tenantA}/export_jobs/${jobId}`).set({
            id: jobId,
            tenantId: tenantA,
            exportType: 'processor_assurance_register',
            status: 'queued',
            requestedBy: p.uid,
            requestedAt: now,
            completedAt: null,
            fileStoragePath: null,
            fileDownloadUrl: null,
            fileSizeBytes: null,
            errorMessage: null,
            filtersApplied: {},
          })
        );
      }

      const auditorDb = testEnv.authenticatedContext(PERSONAS.auditorA.uid).firestore();
      await assertFails(
        auditorDb.doc(`tenants/${tenantA}/export_jobs/exp_job_auditor`).set({
          id: 'exp_job_auditor',
          tenantId: tenantA,
          exportType: 'processor_assurance_register',
          status: 'queued',
          requestedBy: PERSONAS.auditorA.uid,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );
    });

    test('Non-manager (contributor) cannot request export jobs', async () => {
      const contribDb = testEnv.authenticatedContext(PERSONAS.contributorA.uid).firestore();

      await assertFails(
        contribDb.doc(`tenants/${tenantA}/export_jobs/job_contrib_fail`).set({
          id: 'job_contrib_fail',
          tenantId: tenantA,
          exportType: 'processor_assurance_coverage_by_systems',
          status: 'queued',
          requestedBy: PERSONAS.contributorA.uid,
          requestedAt: now,
          completedAt: null,
          fileStoragePath: null,
          fileDownloadUrl: null,
          fileSizeBytes: null,
          errorMessage: null,
          filtersApplied: {},
        })
      );
    });

    test('User can read their own export jobs, Tenant Admin can read any export job, others cannot read', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/export_jobs/job_comp_owner`).set({
          id: 'job_comp_owner',
          tenantId: tenantA,
          exportType: 'processor_by_certification_type_matrix',
          status: 'completed',
          requestedBy: PERSONAS.complianceA.uid,
          requestedAt: now,
        });
      });

      const compDb = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      const secDb = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();

      // Owner (Compliance Manager) can read -> Succeeds
      await assertSucceeds(compDb.doc(`tenants/${tenantA}/export_jobs/job_comp_owner`).get());

      // Tenant Admin can read -> Succeeds
      await assertSucceeds(adminDb.doc(`tenants/${tenantA}/export_jobs/job_comp_owner`).get());

      // Other member (Security Manager) cannot read Compliance Manager job -> Fails
      await assertFails(secDb.doc(`tenants/${tenantA}/export_jobs/job_comp_owner`).get());
    });

    test('Client direct update or deletion of export jobs is strictly forbidden', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/export_jobs/job_immutable`).set({
          id: 'job_immutable',
          tenantId: tenantA,
          exportType: 'critical_processors_missing_assurance',
          status: 'queued',
          requestedBy: PERSONAS.adminA.uid,
          requestedAt: now,
        });
      });

      const adminDb = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();

      // Direct status mutation from client -> Fails
      await assertFails(
        adminDb.doc(`tenants/${tenantA}/export_jobs/job_immutable`).update({
          status: 'completed',
        })
      );

      // Direct deletion from client -> Fails
      await assertFails(adminDb.doc(`tenants/${tenantA}/export_jobs/job_immutable`).delete());
    });
  });
});

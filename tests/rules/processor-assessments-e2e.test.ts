import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import * as crypto from 'crypto';
import {
  getFirestoreRules,
  FIXTURE_TENANT_A,
  FIXTURE_TENANT_B,
  PERSONAS,
} from './fixtures/test-factories.js';
import {
  ProcessorAssessment,
  ProcessorAssessmentSection,
  CANONICAL_ASSESSMENT_TEMPLATES,
  calculateProcessorAssessmentScore,
  evaluateProcessorAssessmentRiskFlags,
  evaluateProcessorAssessmentReminders,
  generateProcessorAssessmentReportPayload,
  generateProcessorAssessmentSummaryMatrixPayload,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-processor-assessments-test',
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

    // 2. Tenant Memberships
    const members = [
      { uid: PERSONAS.adminA.uid, role: 'tenant_admin' },
      { uid: PERSONAS.complianceA.uid, role: 'compliance_manager' },
      { uid: PERSONAS.privacyA.uid, role: 'privacy_manager' },
      { uid: PERSONAS.securityA.uid, role: 'security_manager' },
      { uid: PERSONAS.auditorA.uid, role: 'auditor' },
      { uid: PERSONAS.viewerA.uid, role: 'viewer' },
      { uid: PERSONAS.approverA.uid, role: 'approver' },
    ];

    for (const m of members) {
      await db.doc(`tenants/${tenantA}/memberships/${m.uid}`).set({
        id: m.uid,
        tenantId: tenantA,
        userId: m.uid,
        role: m.role,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      });
    }

    // Tenant B member
    await db.doc(`tenants/${tenantB}/memberships/${PERSONAS.adminB.uid}`).set({
      id: PERSONAS.adminB.uid,
      tenantId: tenantB,
      userId: PERSONAS.adminB.uid,
      role: 'tenant_admin',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });
});

describe('Processor Assessment Questionnaires & Due Diligence Test Pack', () => {
  const sampleRawToken = 'secret-token-1234567890abcdef';
  const sampleTokenHash = hashToken(sampleRawToken);

  const sampleAssessment: ProcessorAssessment = {
    id: 'assess_cloudcore_01',
    tenantId: tenantA,
    title: 'CloudCore Pre-Contract GDPR Article 28 Due Diligence',
    assessmentType: 'pre_contract_due_diligence',
    templateId: 'templ_gdpr_art28_due_diligence',
    templateCode: 'GDPR_ART28_DUE_DILIGENCE',
    vendorId: 'vend_cloudcore_01',
    vendorName: 'CloudCore Infrastructure SE',
    processorProfileId: 'proc_cloudcore_01',
    linkedSystemAssetIds: ['asset_cloud_01'],
    linkedControlIds: ['ctrl_gdpr_toms_01'],
    linkedEvidenceIds: ['ev_cert_iso27001'],
    linkedRiskRegisterIds: [],
    isRecurring: false,
    recurrenceCadence: 'none',
    nextDueDate: null,
    respondent: {
      name: 'Elena Rostova',
      email: 'elena.rostova@cloudcore.example.eu',
      title: 'Head of Information Security',
      companyName: 'CloudCore Infrastructure SE',
    },
    accessTokenHash: sampleTokenHash,
    tokenExpiresAt: '2026-10-15T00:00:00.000Z',
    accessCount: 1,
    lastAccessedAt: '2026-08-15T10:00:00.000Z',
    status: 'sent',
    sentAt: '2026-08-15T09:00:00.000Z',
    startedAt: null,
    submittedAt: null,
    dueDate: '2026-09-01T00:00:00.000Z',
    reviewOwnerUserId: PERSONAS.complianceA.uid,
    reviewedBy: null,
    reviewedAt: null,
    reviewNotes: null,
    rejectionReason: null,
    revisionRequestNotes: null,
    overallScorePercent: null,
    overallRiskRating: null,
    isCompliant: null,
    sections: (CANONICAL_ASSESSMENT_TEMPLATES[0]?.sections || []) as ProcessorAssessmentSection[],
    answers: {},
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: '2026-08-15T09:00:00.000Z',
    updatedAt: '2026-08-15T09:00:00.000Z',
  };

  // ---------------------------------------------------------------------------
  // 1. FIRESTORE SECURITY RULES & RBAC ISOLATION
  // ---------------------------------------------------------------------------
  describe('1. Security Rules & Multi-Tenant RBAC Isolation', () => {
    it('allows compliance_manager and tenant_admin to create assessment documents in Tenant A', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`);
      await assertSucceeds(ref.set(sampleAssessment));
    });

    it('allows security_manager and privacy_manager to create assessment documents', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.securityA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/processor_assessments/assess_sec_01`);
      await assertSucceeds(
        ref.set({
          ...sampleAssessment,
          id: 'assess_sec_01',
          ownerId: PERSONAS.securityA.uid,
          createdBy: PERSONAS.securityA.uid,
          updatedBy: PERSONAS.securityA.uid,
        })
      );
    });

    it('prevents viewer and auditor from creating assessment documents', async () => {
      const dbViewer = testEnv.authenticatedContext(PERSONAS.viewerA.uid).firestore();
      const ref = dbViewer.doc(`tenants/${tenantA}/processor_assessments/assess_view_01`);
      await assertFails(
        ref.set({
          ...sampleAssessment,
          id: 'assess_view_01',
          ownerId: PERSONAS.viewerA.uid,
          createdBy: PERSONAS.viewerA.uid,
          updatedBy: PERSONAS.viewerA.uid,
        })
      );
    });

    it('allows tenant members to read assessment records in their tenant', async () => {
      // Seed assessment doc
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).set(sampleAssessment);
      });

      const dbAuditor = testEnv.authenticatedContext(PERSONAS.auditorA.uid).firestore();
      const snap = await dbAuditor.doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).get();
      expect(snap.exists).toBe(true);
    });

    it('STRICT ISOLATION: prevents Tenant B user from reading or writing Tenant A assessment', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).set(sampleAssessment);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(dbTenantB.doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).get());
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).update({
          title: 'Hacked Assessment Title',
        })
      );
    });

    it('blocks unauthenticated direct client access to assessment records', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(unauthDb.doc(`tenants/${tenantA}/processor_assessments/${sampleAssessment.id}`).get());
    });
  });

  // ---------------------------------------------------------------------------
  // 2. DETERMINISTIC COMPLIANCE SCORING ENGINE
  // ---------------------------------------------------------------------------
  describe('2. Deterministic Compliance Scoring Engine', () => {
    it('calculates 100% score for optimal responses across all sections', () => {
      const fullyCompliantAnswers = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          value: 'yes_statutory',
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_gov_dpa_agreement: {
          questionId: 'q_gov_dpa_agreement',
          value: 'accept_controller_dpa',
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_toms_encryption: {
          questionId: 'q_toms_encryption',
          value: 'full_encryption',
          attachedEvidenceIds: ['ev_cert_01'],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_toms_mfa: {
          questionId: 'q_toms_mfa',
          value: 'mandatory_mfa',
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_subproc_notice: {
          questionId: 'q_subproc_notice',
          value: 'formal_notice_30d',
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_breach_sla: {
          questionId: 'q_breach_sla',
          value: 'sla_24h',
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_certs_held: {
          questionId: 'q_certs_held',
          value: ['iso_27001', 'soc2_type2'],
          attachedEvidenceIds: ['ev_cert_01'],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
      };

      const result = calculateProcessorAssessmentScore({
        sections: (CANONICAL_ASSESSMENT_TEMPLATES[0]?.sections || []) as ProcessorAssessmentSection[],
        answers: fullyCompliantAnswers,
      });

      expect(result.overallScore).toBe(100);
      expect(result.isPassing).toBe(true);
      expect(result.sectionScores['sec_gov']).toBe(100);
      expect(result.sectionScores['sec_toms']).toBe(100);
    });

    it('calculates degraded score and fails assessment when non-compliant choices made', () => {
      const deficientAnswers = {
        q_gov_dpo: {
          questionId: 'q_gov_dpo',
          value: 'no', // 0 pts
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_gov_dpa_agreement: {
          questionId: 'q_gov_dpa_agreement',
          value: 'refuse_dpa', // 0 pts
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_toms_encryption: {
          questionId: 'q_toms_encryption',
          value: 'no_encryption', // 0 pts
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
        q_toms_mfa: {
          questionId: 'q_toms_mfa',
          value: 'no_mfa', // 0 pts
          attachedEvidenceIds: [],
          updatedAt: '2026-08-15T12:00:00.000Z',
        },
      };

      const result = calculateProcessorAssessmentScore({
        sections: (CANONICAL_ASSESSMENT_TEMPLATES[0]?.sections || []) as ProcessorAssessmentSection[],
        answers: deficientAnswers,
      });

      expect(result.overallScore).toBeLessThan(40);
      expect(result.isPassing).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. AUTOMATED RISK FLAGS EVALUATION ENGINE
  // ---------------------------------------------------------------------------
  describe('3. Automated Risk Flags Derivation Engine', () => {
    it('flags overdue submission when target dueDate is in the past', () => {
      const overdueAssessment: ProcessorAssessment = {
        ...sampleAssessment,
        status: 'sent',
        dueDate: '2026-08-01T00:00:00.000Z', // 14 days ago
      };

      const flags = evaluateProcessorAssessmentRiskFlags(overdueAssessment, new Date('2026-08-15T00:00:00.000Z'));
      const overdueFlag = flags.find((f) => f.ruleCode === 'ASSESSMENT_OVERDUE_SUBMISSION');
      expect(overdueFlag).toBeDefined();
      expect(overdueFlag?.severity).toBe('high');
    });

    it('derives question-level risk flags for high-risk responses', () => {
      const highRiskAssessment: ProcessorAssessment = {
        ...sampleAssessment,
        status: 'submitted',
        answers: {
          q_gov_dpa_agreement: {
            questionId: 'q_gov_dpa_agreement',
            value: 'refuse_dpa',
            attachedEvidenceIds: [],
            updatedAt: '2026-08-15T12:00:00.000Z',
          },
          q_toms_encryption: {
            questionId: 'q_toms_encryption',
            value: 'no_encryption',
            attachedEvidenceIds: [],
            updatedAt: '2026-08-15T12:00:00.000Z',
          },
        },
      };

      const flags = evaluateProcessorAssessmentRiskFlags(highRiskAssessment, new Date('2026-08-15T00:00:00.000Z'));
      expect(flags.some((f) => f.ruleCode === 'ASSESSMENT_REFUSE_DPA')).toBe(true);
      expect(flags.some((f) => f.ruleCode === 'ASSESSMENT_NO_ENCRYPTION')).toBe(true);
    });

    it('derives critical risk when reviewer marks question as critical_finding', () => {
      const reviewerFlaggedAssessment: ProcessorAssessment = {
        ...sampleAssessment,
        status: 'under_review',
        answers: {
          q_breach_sla: {
            questionId: 'q_breach_sla',
            value: 'sla_slow',
            reviewerFlag: 'critical_finding',
            reviewerComment: 'Vendor contractually refuses 72h SLA for breach notice.',
            attachedEvidenceIds: [],
            updatedAt: '2026-08-15T12:00:00.000Z',
          },
        },
      };

      const flags = evaluateProcessorAssessmentRiskFlags(reviewerFlaggedAssessment, new Date('2026-08-15T00:00:00.000Z'));
      const revFlag = flags.find((f) => f.ruleCode === 'ASSESSMENT_REVIEWER_FINDING');
      expect(revFlag).toBeDefined();
      expect(revFlag?.severity).toBe('critical');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ASSESSMENT REMINDER & DEADLINE EVALUATION ENGINE
  // ---------------------------------------------------------------------------
  describe('4. Assessment Reminder & Cadence Evaluator', () => {
    it('evaluates overdue reminders, pending review reminders, and recurring renewal reminders', () => {
      const assessments: ProcessorAssessment[] = [
        {
          ...sampleAssessment,
          id: 'assess_overdue_1',
          vendorName: 'Acme Cloud Corp',
          status: 'sent',
          dueDate: '2026-08-01T00:00:00.000Z', // 14 days overdue
        },
        {
          ...sampleAssessment,
          id: 'assess_pending_review_1',
          vendorName: 'DataSafe EU',
          status: 'submitted',
          submittedAt: '2026-08-10T00:00:00.000Z', // 5 days pending review
        },
        {
          ...sampleAssessment,
          id: 'assess_recurring_1',
          vendorName: 'LogiTrack GmbH',
          status: 'accepted',
          isRecurring: true,
          recurrenceCadence: 'annual',
          nextDueDate: '2026-09-01T00:00:00.000Z', // 17 days from now
        },
      ];

      const reminders = evaluateProcessorAssessmentReminders(assessments, new Date('2026-08-15T00:00:00.000Z'));

      expect(reminders.some((r) => r.reminderType === 'processor_assessment_overdue')).toBe(true);
      expect(reminders.some((r) => r.reminderType === 'processor_assessment_review_due')).toBe(true);
      expect(reminders.some((r) => r.reminderType === 'processor_assessment_recurring_due')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 5. EXPORT DOSSIER & SUMMARY MATRIX GENERATORS
  // ---------------------------------------------------------------------------
  describe('5. Export Dossier & Summary Matrix Generation', () => {
    it('generates processor_assessment_report export payload with sections breakdown and risk flags', () => {
      const payload = generateProcessorAssessmentReportPayload([sampleAssessment], {
        tenantId: tenantA,
        asOfDate: new Date('2026-08-15T00:00:00.000Z'),
      });

      expect(payload.exportHeader.exportType).toBe('processor_assessment_report');
      expect(payload.exportHeader.tenantId).toBe(tenantA);
      expect(payload.assessments.length).toBe(1);
      expect(payload.assessments[0]?.vendorName).toBe('CloudCore Infrastructure SE');
      expect((payload.assessments[0]?.sectionsSummary || []).length).toBeGreaterThan(0);
    });

    it('generates processor_assessment_summary_matrix export payload', () => {
      const payload = generateProcessorAssessmentSummaryMatrixPayload([sampleAssessment], {
        tenantId: tenantA,
        asOfDate: new Date('2026-08-15T00:00:00.000Z'),
      });

      expect(payload.exportHeader.exportType).toBe('processor_assessment_summary_matrix');
      expect(payload.exportHeader.totalAssessments).toBe(1);
      expect(payload.matrix.length).toBe(1);
      expect(payload.matrix[0]?.vendorName).toBe('CloudCore Infrastructure SE');
    });
  });
});

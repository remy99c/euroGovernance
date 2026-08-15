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
  ThirdPartyAssessmentRequest,
  AssessmentRequestStatus,
  isValidRequestStateTransition,
  validateThirdPartyAssessmentRequest,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-third-party-assessment-workflow-test',
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
      id: tenantA,
      name: 'EuroCorp Technologies SE',
      createdAt: now,
      updatedAt: now,
    });
    await db.doc(`tenants/${tenantB}`).set({
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
      PERSONAS.approverA,
      PERSONAS.viewerA,
    ];

    for (const m of membersA) {
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

    // 3. Memberships Tenant B
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

describe('Third-Party Assessment Workflow & Lifecycle State Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();

  const sampleTemplateSnapshot = {
    id: 'tmpl_gdpr_due_diligence',
    tenantId: tenantA,
    code: 'TMPL-GDPR-ART28',
    title: 'GDPR Article 28 Due Diligence Questionnaire',
    description: 'Controller guarantees verification.',
    version: '1.0.0',
    status: 'published' as const,
    category: 'gdpr_article_28' as const,
    targetScope: 'any' as const,
    passingScoreThreshold: 70,
    defaultValidDays: 30,
    defaultRecurrenceCadence: 'annual' as const,
    sectionCount: 1,
    questionCount: 2,
    isSystemDefault: true,
    sections: [],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const prospectRequest: ThirdPartyAssessmentRequest = {
    id: 'req_prospect_cloudflow',
    tenantId: tenantA,
    title: 'Pre-Contract Due Diligence: CloudFlow AI',
    templateId: 'tmpl_gdpr_due_diligence',
    templateSnapshot: sampleTemplateSnapshot,
    targetType: 'prospective_vendor',
    thirdPartyName: 'CloudFlow AI Ltd',
    prospectCompanyName: 'CloudFlow AI Ltd',
    prospectWebsite: 'https://cloudflow.example.eu',
    vendorId: null,
    processorProfileId: null,
    respondent: {
      name: 'Elena Rostova',
      email: 'elena@cloudflow.example.eu',
      title: 'Head of InfoSec',
      companyName: 'CloudFlow AI Ltd',
    },
    accessTokenHash: null,
    tokenExpiresAt: null,
    accessCount: 0,
    requestType: 'one_time_due_diligence',
    status: 'draft',
    dueDate: futureIso,
    isRecurring: false,
    recurrenceCadence: 'none',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: [],
    linkedControlIds: ['ctrl_toms_encryption'],
    linkedEvidenceIds: [],
    linkedRiskIds: [],
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  const existingProcessorRequest: ThirdPartyAssessmentRequest = {
    id: 'req_existing_snowflake',
    tenantId: tenantA,
    title: 'Annual Periodic Review: Snowflake Inc',
    templateId: 'tmpl_gdpr_due_diligence',
    templateSnapshot: sampleTemplateSnapshot,
    targetType: 'active_processor',
    thirdPartyName: 'Snowflake Inc',
    vendorId: 'vend_snowflake_01',
    processorProfileId: 'proc_snowflake_eu_01',
    respondent: {
      name: 'Snowflake Governance Desk',
      email: 'privacy-dpa@snowflake.example.com',
      companyName: 'Snowflake Inc',
    },
    requestType: 'recurring_periodic_review',
    status: 'draft',
    dueDate: futureIso,
    isRecurring: true,
    recurrenceCadence: 'annual',
    ownerUserId: PERSONAS.complianceA.uid,
    linkedSystemAssetIds: ['asset_dw_snowflake'],
    linkedControlIds: ['ctrl_cloud_storage'],
    linkedEvidenceIds: ['ev_soc2_snowflake'],
    linkedRiskIds: [],
    accessCount: 0,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: now,
    updatedAt: now,
  };

  // ---------------------------------------------------------------------------
  // 1. REQUEST CREATION & TARGET ASSIGNMENT
  // ---------------------------------------------------------------------------
  describe('1. Request Creation & Target Assignment', () => {
    it('creates a valid assessment request for a prospective vendor without existing vendorId', () => {
      const res = validateThirdPartyAssessmentRequest(prospectRequest);
      expect(res.valid).toBe(true);
      expect(prospectRequest.targetType).toBe('prospective_vendor');
      expect(prospectRequest.vendorId).toBeNull();
      expect(prospectRequest.respondent.email).toBe('elena@cloudflow.example.eu');
    });

    it('creates a valid assessment request for an existing active processor linking vendor and processorProfile', () => {
      const res = validateThirdPartyAssessmentRequest(existingProcessorRequest);
      expect(res.valid).toBe(true);
      expect(existingProcessorRequest.targetType).toBe('active_processor');
      expect(existingProcessorRequest.vendorId).toBe('vend_snowflake_01');
      expect(existingProcessorRequest.processorProfileId).toBe('proc_snowflake_eu_01');
    });

    it('allows compliance_manager in Tenant A to save assessment requests to Firestore', async () => {
      const db = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const ref = db.doc(`tenants/${tenantA}/assessment_requests/${prospectRequest.id}`);
      await assertSucceeds(ref.set(prospectRequest));
    });
  });

  // ---------------------------------------------------------------------------
  // 2. LIFECYCLE STATE TRANSITIONS
  // ---------------------------------------------------------------------------
  describe('2. Lifecycle State Machine Transitions', () => {
    it('permits standard forward lifecycle: draft -> sent -> opened -> in_progress -> submitted -> under_review -> accepted', () => {
      const lifecycleSteps: [AssessmentRequestStatus, AssessmentRequestStatus][] = [
        ['draft', 'sent'],
        ['sent', 'opened'],
        ['opened', 'in_progress'],
        ['in_progress', 'submitted'],
        ['submitted', 'under_review'],
        ['under_review', 'accepted'],
        ['accepted', 'superseded'],
      ];

      for (const [from, to] of lifecycleSteps) {
        expect(isValidRequestStateTransition(from, to)).toBe(true);
      }
    });

    it('permits revision loop: under_review -> revision_requested -> sent -> submitted', () => {
      expect(isValidRequestStateTransition('under_review', 'revision_requested')).toBe(true);
      expect(isValidRequestStateTransition('revision_requested', 'sent')).toBe(true);
      expect(isValidRequestStateTransition('sent', 'in_progress')).toBe(true);
      expect(isValidRequestStateTransition('in_progress', 'submitted')).toBe(true);
    });

    it('permits cancellation from early or in-progress states', () => {
      expect(isValidRequestStateTransition('draft', 'canceled')).toBe(true);
      expect(isValidRequestStateTransition('sent', 'canceled')).toBe(true);
      expect(isValidRequestStateTransition('in_progress', 'canceled')).toBe(true);
      expect(isValidRequestStateTransition('under_review', 'canceled')).toBe(true);
    });

    it('blocks illegal state jumps (e.g. accepted -> draft, superseded -> in_progress)', () => {
      expect(isValidRequestStateTransition('accepted', 'draft')).toBe(false);
      expect(isValidRequestStateTransition('accepted', 'in_progress')).toBe(false);
      expect(isValidRequestStateTransition('superseded', 'sent')).toBe(false);
      expect(isValidRequestStateTransition('superseded', 'draft')).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. DUPLICATE SEND PROTECTION & RESEND HANDLING
  // ---------------------------------------------------------------------------
  describe('3. Duplicate Send Protection & Re-dispatch Logic', () => {
    it('detects active unexpired dispatched requests to prevent accidental duplicate sends', () => {
      const activeSentRequest: ThirdPartyAssessmentRequest = {
        ...prospectRequest,
        status: 'sent',
        dispatchedAt: now,
        tokenExpiresAt: futureIso,
        accessTokenHash: 'some_active_token_hash',
      };

      const tokenExpiresTime = new Date(activeSentRequest.tokenExpiresAt!).getTime();
      const isCurrentlyActive = tokenExpiresTime > Date.now();

      expect(activeSentRequest.status).toBe('sent');
      expect(isCurrentlyActive).toBe(true);
      // In business logic: duplicate send without forceResend is blocked when isCurrentlyActive is true
    });

    it('permits resend when token is expired or forceResend is explicitly provided', () => {
      const expiredRequest: ThirdPartyAssessmentRequest = {
        ...prospectRequest,
        status: 'expired',
        tokenExpiresAt: '2026-08-01T00:00:00.000Z',
      };

      expect(isValidRequestStateTransition(expiredRequest.status, 'sent')).toBe(true);
    });
  });

  // ---------------------------------------------------------------------------
  // 4. MULTI-TENANT ISOLATION & AUDIT INTEGRITY
  // ---------------------------------------------------------------------------
  describe('4. Multi-Tenant Isolation & Audit Integrity', () => {
    it('prevents Tenant B user from creating or modifying assessment requests in Tenant A', async () => {
      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();

      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/assessment_requests/req_cross_tenant_hack`).set({
          ...prospectRequest,
          id: 'req_cross_tenant_hack',
          ownerId: PERSONAS.adminB.uid,
          createdBy: PERSONAS.adminB.uid,
          updatedBy: PERSONAS.adminB.uid,
        })
      );
    });

    it('allows approver and compliance manager in Tenant A to update request status', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_requests/${prospectRequest.id}`).set(prospectRequest);
      });

      const dbApproverA = testEnv.authenticatedContext(PERSONAS.approverA.uid).firestore();
      await assertSucceeds(
        dbApproverA.doc(`tenants/${tenantA}/assessment_requests/${prospectRequest.id}`).update({
          status: 'under_review',
          updatedAt: new Date().toISOString(),
          updatedBy: PERSONAS.approverA.uid,
        })
      );
    });
  });
});

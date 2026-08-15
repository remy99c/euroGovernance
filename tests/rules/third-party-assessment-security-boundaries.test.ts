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
  AssessmentAccessToken,
  evaluateAccessTokenValidity,
  createSanitizedPublicAssessmentView,
  ThirdPartyAssessmentRequest,
} from '@eurogovernance/shared-types';
import * as crypto from 'crypto';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-security-boundaries-test',
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

    // 2. Memberships
    await db.doc(`tenants/${tenantA}/memberships/${PERSONAS.complianceA.uid}`).set({
      id: PERSONAS.complianceA.uid,
      tenantId: tenantA,
      userId: PERSONAS.complianceA.uid,
      role: 'compliance_manager',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
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

describe('Third-Party Assessment Security Boundaries & Anti-Leakage Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z').toISOString();
  const futureIso = new Date('2026-09-15T00:00:00.000Z').toISOString();
  const pastIso = new Date('2026-08-01T00:00:00.000Z').toISOString();

  // ---------------------------------------------------------------------------
  // 1. DIRECT CLIENT / UNAUTHENTICATED FIRESTORE ACCESS BLOCKADE
  // ---------------------------------------------------------------------------
  describe('1. Direct Unauthenticated & Client Access Blockade', () => {
    it('strictly blocks unauthenticated users from reading or writing assessment requests', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/assessment_requests/req_001`).get()
      );

      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/assessment_requests/req_001`).set({
          title: 'Hacked Request',
        })
      );
    });

    it('strictly blocks unauthenticated users from reading or writing assessment submissions directly', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();

      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/assessment_submissions/sub_001`).get()
      );

      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/assessment_submissions/sub_001`).set({
          computedScorePercent: 100,
        })
      );
    });

    it('strictly blocks direct client writes to assessment_access_tokens even for authenticated users', async () => {
      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      await assertFails(
        dbCompliance.doc(`tenants/${tenantA}/assessment_access_tokens/token_001`).set({
          tokenHash: 'hacked_hash',
          status: 'active',
        })
      );

      await assertFails(
        dbCompliance.doc(`assessment_access_tokens/token_001`).set({
          tokenHash: 'hacked_hash',
        })
      );
    });
  });

  // ---------------------------------------------------------------------------
  // 2. TOKEN VERIFICATION, EXPIRY, AND REVOCATION BOUNDARIES
  // ---------------------------------------------------------------------------
  describe('2. Token Verification & Lifecycle Boundaries', () => {
    const rawSecret = 'b8f2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2';
    const tokenHash = crypto.createHash('sha256').update(rawSecret).digest('hex');

    const validTokenRecord: AssessmentAccessToken = {
      id: 'tok_valid_01',
      tenantId: tenantA,
      requestId: 'req_001',
      templateId: 'tmpl_001',
      tokenHash,
      tokenType: 'multi_use_session',
      recipientEmail: 'vendor@example.com',
      recipientName: 'Vendor Contact',
      thirdPartyName: 'Acme SaaS',
      status: 'active',
      expiresAt: futureIso,
      maxUses: 10,
      useCount: 0,
      lastAccessedAt: null,
      lastAccessedIpMasked: null,
      revokedAt: null,
      revokedBy: null,
      revocationReason: null,
      requireEmailVerificationCode: false,
      issuedByUserId: PERSONAS.complianceA.uid,
      issuedAt: now,
      ownerId: PERSONAS.complianceA.uid,
      createdBy: PERSONAS.complianceA.uid,
      updatedBy: PERSONAS.complianceA.uid,
      createdAt: now,
      updatedAt: now,
    };

    it('validates a valid token and hash successfully', () => {
      const res = evaluateAccessTokenValidity(validTokenRecord, tokenHash, new Date(now));
      expect(res.isValid).toBe(true);
      expect(res.error).toBeUndefined();
    });

    it('rejects an expired token', () => {
      const expiredToken: AssessmentAccessToken = {
        ...validTokenRecord,
        expiresAt: pastIso,
      };
      const res = evaluateAccessTokenValidity(expiredToken, tokenHash, new Date(now));
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('expired');
    });

    it('rejects a revoked token immediately', () => {
      const revokedToken: AssessmentAccessToken = {
        ...validTokenRecord,
        status: 'revoked',
        revokedAt: now,
        revocationReason: 'Security incident at vendor',
      };
      const res = evaluateAccessTokenValidity(revokedToken, tokenHash, new Date(now));
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('revoked');
    });

    it('rejects a token exceeding maximum usage count', () => {
      const maxedToken: AssessmentAccessToken = {
        ...validTokenRecord,
        maxUses: 2,
        useCount: 2,
      };
      const res = evaluateAccessTokenValidity(maxedToken, tokenHash, new Date(now));
      expect(res.isValid).toBe(false);
      expect(res.error).toContain('limit');
    });

    it('rejects a mismatched hash (anti-tamper / invalid secret)', () => {
      const fakeHash = crypto.createHash('sha256').update('wrong_secret').digest('hex');
      const res = evaluateAccessTokenValidity(validTokenRecord, fakeHash, new Date(now));
      expect(res.isValid).toBe(false);
    });
  });

  // ---------------------------------------------------------------------------
  // 3. ANTI-LEAKAGE & LEAST-PRIVILEGE SANITIZED PUBLIC VIEW
  // ---------------------------------------------------------------------------
  describe('3. Anti-Leakage & Least-Privilege Public View', () => {
    it('sanitizes public assessment view and excludes sensitive internal fields', () => {
      const fullInternalRequest: ThirdPartyAssessmentRequest = {
        id: 'req_full_001',
        tenantId: tenantA,
        title: 'Auth0 Security Due Diligence',
        templateId: 'tmpl_001',
        templateSnapshot: {
          id: 'tmpl_001',
          tenantId: tenantA,
          code: 'TMPL-01',
          title: 'GDPR Article 28 Assessment',
          description: 'Questions regarding security TOMs.',
          version: '1.0.0',
          status: 'published',
          category: 'gdpr_article_28',
          targetScope: 'any',
          passingScoreThreshold: 70,
          defaultValidDays: 30,
          defaultRecurrenceCadence: 'annual',
          sectionCount: 1,
          questionCount: 1,
          isSystemDefault: false,
          sections: [
            {
              id: 'sec_01',
              tenantId: tenantA,
              templateId: 'tmpl_001',
              code: 'SEC-01',
              title: 'Security TOMs',
              sortOrder: 1,
              weight: 10,
              questions: [
                {
                  id: 'q_01',
                  tenantId: tenantA,
                  templateId: 'tmpl_001',
                  sectionId: 'sec_01',
                  code: 'Q-01',
                  title: 'Do you encrypt at rest?',
                  questionType: 'yes_no',
                  required: true,
                  sortOrder: 1,
                  weight: 10,
                  createdBy: PERSONAS.complianceA.uid,
                  updatedBy: PERSONAS.complianceA.uid,
                  createdAt: now,
                  updatedAt: now,
                },
              ],
              createdBy: PERSONAS.complianceA.uid,
              updatedBy: PERSONAS.complianceA.uid,
              createdAt: now,
              updatedAt: now,
            },
          ],
          ownerId: PERSONAS.complianceA.uid,
          createdBy: PERSONAS.complianceA.uid,
          updatedBy: PERSONAS.complianceA.uid,
          createdAt: now,
          updatedAt: now,
        },
        targetType: 'existing_vendor',
        thirdPartyName: 'Auth0 Ireland Ltd',
        vendorId: 'vend_auth0_01',
        processorProfileId: 'proc_auth0_01',
        respondent: { name: 'DPO Auth0', email: 'dpo@auth0.example.com', companyName: 'Auth0' },
        requestType: 'recurring_periodic_review',
        status: 'sent',
        dueDate: futureIso,
        accessCount: 1,
        isRecurring: true,
        recurrenceCadence: 'annual',
        ownerUserId: PERSONAS.complianceA.uid,
        linkedSystemAssetIds: ['asset_internal_prod_01'],
        linkedControlIds: ['ctrl_internal_audit_15'],
        linkedEvidenceIds: ['ev_secret_internal_doc'],
        linkedRiskIds: ['risk_high_severity_01'],
        ownerId: PERSONAS.complianceA.uid,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const tokenRecord: AssessmentAccessToken = {
        id: 'tok_01',
        tenantId: tenantA,
        requestId: 'req_full_001',
        templateId: 'tmpl_001',
        tokenHash: 'hash_01',
        tokenType: 'multi_use_session',
        recipientEmail: 'dpo@auth0.example.com',
        recipientName: 'DPO Auth0',
        thirdPartyName: 'Auth0 Ireland Ltd',
        status: 'active',
        expiresAt: futureIso,
        maxUses: 10,
        useCount: 0,
        lastAccessedAt: null,
        lastAccessedIpMasked: null,
        revokedAt: null,
        revokedBy: null,
        revocationReason: null,
        requireEmailVerificationCode: false,
        issuedByUserId: PERSONAS.complianceA.uid,
        issuedAt: now,
        ownerId: PERSONAS.complianceA.uid,
        createdBy: PERSONAS.complianceA.uid,
        updatedBy: PERSONAS.complianceA.uid,
        createdAt: now,
        updatedAt: now,
      };

      const sanitized = createSanitizedPublicAssessmentView(fullInternalRequest, tokenRecord);

      // Verify essential public fields exist
      expect(sanitized.requestId).toBe('req_full_001');
      expect(sanitized.thirdPartyName).toBe('Auth0 Ireland Ltd');
      expect(sanitized.templateTitle).toBe('GDPR Article 28 Assessment');
      expect(sanitized.sections.length).toBe(1);
      expect(sanitized.sections[0]?.questions.length).toBe(1);

      // Verify internal security-sensitive metadata is stripped
      expect((sanitized as any).linkedSystemAssetIds).toBeUndefined();
      expect((sanitized as any).linkedControlIds).toBeUndefined();
      expect((sanitized as any).linkedEvidenceIds).toBeUndefined();
      expect((sanitized as any).linkedRiskIds).toBeUndefined();
      expect((sanitized as any).ownerUserId).toBeUndefined();
      expect((sanitized as any).ownerId).toBeUndefined();
    });
  });

  // ---------------------------------------------------------------------------
  // 4. CROSS-TENANT ISOLATION & AUDIT LOG IMMUTABILITY
  // ---------------------------------------------------------------------------
  describe('4. Cross-Tenant Isolation & Audit Trail Integrity', () => {
    it('prevents Tenant B user from reading Tenant A assessment access tokens or submissions', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_access_tokens/tok_a_001`).set({
          id: 'tok_a_001',
          tenantId: tenantA,
          requestId: 'req_a_001',
          tokenHash: 'hash_a',
          status: 'active',
          createdAt: now,
        });
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/assessment_access_tokens/tok_a_001`).get()
      );
    });

    it('guarantees audit log events for assessment actions cannot be altered or deleted by clients', async () => {
      const logId = 'log_assessment_dispatch_001';
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/audit_logs/${logId}`).set({
          id: logId,
          tenantId: tenantA,
          actorId: PERSONAS.complianceA.uid,
          actorEmail: 'compliance@eurocorp.example.eu',
          actorRole: 'compliance_manager',
          entityType: 'processor_assessment',
          entityId: 'req_001',
          action: 'create',
          timestamp: now,
          source: 'cloud_function',
          workflowContext: 'third_party_assessment_dispatch',
        });
      });

      const dbCompliance = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();

      // Read succeeds for tenant member
      await assertSucceeds(
        dbCompliance.doc(`tenants/${tenantA}/audit_logs/${logId}`).get()
      );

      // Modification or deletion fails
      await assertFails(
        dbCompliance.doc(`tenants/${tenantA}/audit_logs/${logId}`).update({
          action: 'tampered',
        })
      );

      await assertFails(
        dbCompliance.doc(`tenants/${tenantA}/audit_logs/${logId}`).delete()
      );
    });
  });
});

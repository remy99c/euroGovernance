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
  AssessmentAccessToken,
  evaluateAccessTokenValidity,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = FIXTURE_TENANT_A;
const tenantB = FIXTURE_TENANT_B;

function generateTokenPair(): { rawToken: string; tokenHash: string } {
  const rawToken = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');
  return { rawToken, tokenHash };
}

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-assessment-access-tokens-test',
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

describe('Secure External Assessment Access Model Test Pack', () => {
  const now = new Date('2026-08-15T12:00:00.000Z');
  const nowIso = now.toISOString();
  const futureIso = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const pastIso = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString();

  const { tokenHash: validTokenHash } = generateTokenPair();

  const activeToken: AssessmentAccessToken = {
    id: 'tok_valid_001',
    tenantId: tenantA,
    requestId: 'req_001',
    templateId: 'tmpl_gdpr_v1',
    recipientEmail: 'dpo@cloudvendor.eu',
    recipientName: 'Vendor Privacy Officer',
    thirdPartyName: 'CloudVendor SE',
    tokenHash: validTokenHash,
    tokenType: 'multi_use_session',
    status: 'active',
    maxUses: 50,
    useCount: 2,
    expiresAt: futureIso,
    lastAccessedAt: nowIso,
    lastAccessedIpMasked: '192.168.***.***',
    revokedAt: null,
    revokedBy: null,
    revocationReason: null,
    requireEmailVerificationCode: false,
    issuedByUserId: PERSONAS.complianceA.uid,
    issuedAt: nowIso,
    ownerId: PERSONAS.complianceA.uid,
    createdBy: PERSONAS.complianceA.uid,
    updatedBy: PERSONAS.complianceA.uid,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  // ---------------------------------------------------------------------------
  // 1. TOKEN ISSUANCE & VALIDATION
  // ---------------------------------------------------------------------------
  describe('1. Token Issuance & Verification Logic', () => {
    it('validates a valid, non-expired, unrevoked access token', () => {
      const result = evaluateAccessTokenValidity(activeToken, validTokenHash, now);
      expect(result.isValid).toBe(true);
    });

    it('rejects access when token hash does not match computed hash', () => {
      const wrongHash = crypto.createHash('sha256').update('wrong-token').digest('hex');
      const result = evaluateAccessTokenValidity(activeToken, wrongHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_HASH_MISMATCH');
    });
  });

  // ---------------------------------------------------------------------------
  // 2. EXPIRY HANDLING
  // ---------------------------------------------------------------------------
  describe('2. Expiry Handling', () => {
    it('rejects an expired access token when current time exceeds expiresAt', () => {
      const expiredToken: AssessmentAccessToken = {
        ...activeToken,
        id: 'tok_expired_001',
        expiresAt: pastIso,
      };

      const result = evaluateAccessTokenValidity(expiredToken, validTokenHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_EXPIRED');
    });

    it('rejects token explicitly marked with status = expired', () => {
      const expiredStatusToken: AssessmentAccessToken = {
        ...activeToken,
        status: 'expired',
      };

      const result = evaluateAccessTokenValidity(expiredStatusToken, validTokenHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_EXPIRED');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. REVOCATION & SUPERSEDED HANDLING
  // ---------------------------------------------------------------------------
  describe('3. Revocation & Supersession Handling', () => {
    it('rejects a revoked access token and flags TOKEN_REVOKED', () => {
      const revokedToken: AssessmentAccessToken = {
        ...activeToken,
        id: 'tok_revoked_001',
        status: 'revoked',
        revokedAt: nowIso,
        revokedBy: PERSONAS.complianceA.uid,
        revocationReason: 'Vendor engagement terminated prior to review.',
      };

      const result = evaluateAccessTokenValidity(revokedToken, validTokenHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_REVOKED');
      expect(result.error).toContain('revoked');
    });

    it('rejects a superseded token when link was regenerated', () => {
      const supersededToken: AssessmentAccessToken = {
        ...activeToken,
        id: 'tok_superseded_001',
        status: 'superseded',
      };

      const result = evaluateAccessTokenValidity(supersededToken, validTokenHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_REVOKED');
    });

    it('rejects token when usage limit is exhausted (e.g. single-use submission link)', () => {
      const exhaustedToken: AssessmentAccessToken = {
        ...activeToken,
        tokenType: 'single_use',
        maxUses: 1,
        useCount: 1,
        status: 'used',
      };

      const result = evaluateAccessTokenValidity(exhaustedToken, validTokenHash, now);
      expect(result.isValid).toBe(false);
      expect(result.errorCode).toBe('TOKEN_EXHAUSTED');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. ACCESS BOUNDARY ENFORCEMENT & SECURITY RULES
  // ---------------------------------------------------------------------------
  describe('4. Access Boundary Enforcement & Firestore Security Rules', () => {
    it('allows compliance_manager in Tenant A to read token metadata in their tenant', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).set(activeToken);
      });

      const dbComplianceA = testEnv.authenticatedContext(PERSONAS.complianceA.uid).firestore();
      const snap = await assertSucceeds(
        dbComplianceA.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).get()
      );
      expect(snap.exists).toBe(true);
    });

    it('STRICT BLOCK: prevents direct client write/create to assessment_access_tokens (Cloud Functions only)', async () => {
      const dbAdminA = testEnv.authenticatedContext(PERSONAS.adminA.uid).firestore();
      const tokenRef = dbAdminA.doc(`tenants/${tenantA}/assessment_access_tokens/tok_direct_client_hack`);

      await assertFails(tokenRef.set(activeToken));
    });

    it('STRICT ISOLATION: prevents Tenant B user from reading Tenant A token records', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).set(activeToken);
      });

      const dbTenantB = testEnv.authenticatedContext(PERSONAS.adminB.uid).firestore();
      await assertFails(
        dbTenantB.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).get()
      );
    });

    it('blocks unauthenticated direct client access to token records', async () => {
      const unauthDb = testEnv.unauthenticatedContext().firestore();
      await assertFails(
        unauthDb.doc(`tenants/${tenantA}/assessment_access_tokens/${activeToken.id}`).get()
      );
    });
  });
});

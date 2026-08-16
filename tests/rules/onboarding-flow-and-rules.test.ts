/**
 * euroGovernance - Onboarding Security Rules & State Flow Tests
 *
 * Validates:
 * 1. Multi-tenant isolation for /tenants/{tenantId}/onboarding_state/{userId}
 * 2. Self-ownership write rules (user can only mutate their own state)
 * 3. Tenant Admin oversight permissions
 * 4. Unauthenticated denial
 * 5. Persona flow step integrity
 */

import { initializeTestEnvironment, RulesTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import { PERSONA_ONBOARDING_FLOWS } from '../../apps/web/src/app/onboarding/persona-flows.js';

const PROJECT_ID = 'eurogovernance-onboarding-test';

describe('Onboarding State Security Rules & State Invariants', () => {
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

    // Seed active tenant memberships
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Tenant A
      await db.collection('tenants').doc('tenant_alpha').set({
        id: 'tenant_alpha',
        name: 'Alpha Corp',
        status: 'active',
      });
      await db.collection('tenants').doc('tenant_alpha').collection('memberships').doc('usr_alice').set({
        id: 'usr_alice',
        userId: 'usr_alice',
        role: 'compliance_manager',
        status: 'active',
      });
      await db.collection('tenants').doc('tenant_alpha').collection('memberships').doc('usr_admin_alpha').set({
        id: 'usr_admin_alpha',
        userId: 'usr_admin_alpha',
        role: 'tenant_admin',
        status: 'active',
      });

      // Tenant B (Isolated)
      await db.collection('tenants').doc('tenant_beta').set({
        id: 'tenant_beta',
        name: 'Beta Corp',
        status: 'active',
      });
      await db.collection('tenants').doc('tenant_beta').collection('memberships').doc('usr_bob').set({
        id: 'usr_bob',
        userId: 'usr_bob',
        role: 'security_manager',
        status: 'active',
      });
    });
  });

  describe('1. Multi-Tenant Isolation & Ownership Rules', () => {
    it('allows an active tenant member to create and update their own onboarding state', async () => {
      const aliceContext = testEnv.authenticatedContext('usr_alice');
      const aliceDb = aliceContext.firestore();

      const ref = aliceDb.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_alice');

      await assertSucceeds(
        ref.set({
          userId: 'usr_alice',
          tenantId: 'tenant_alpha',
          role: 'compliance_manager',
          status: 'in_progress',
          currentStepIndex: 1,
          completedStepIds: ['comp_scoping'],
          totalSteps: 4,
          startedAt: new Date().toISOString(),
          lastActiveAt: new Date().toISOString(),
        })
      );

      const snap = await assertSucceeds(ref.get());
      expect(snap.exists).toBe(true);
    });

    it('DENIES a user from writing onboarding state for another user in the same tenant', async () => {
      const aliceContext = testEnv.authenticatedContext('usr_alice');
      const aliceDb = aliceContext.firestore();

      // Alice tries writing Bob's or Admin's onboarding doc
      const ref = aliceDb.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_admin_alpha');

      await assertFails(
        ref.set({
          userId: 'usr_admin_alpha',
          tenantId: 'tenant_alpha',
          status: 'completed',
        })
      );
    });

    it('DENIES cross-tenant access to onboarding state', async () => {
      const bobContext = testEnv.authenticatedContext('usr_bob');
      const bobDb = bobContext.firestore();

      // Bob in tenant_beta tries reading Alice's onboarding state in tenant_alpha
      const ref = bobDb.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_alice');

      await assertFails(ref.get());
    });

    it('DENIES unauthenticated users from reading or writing onboarding state', async () => {
      const unauthContext = testEnv.unauthenticatedContext();
      const unauthDb = unauthContext.firestore();

      const ref = unauthDb.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_alice');

      await assertFails(ref.get());
      await assertFails(ref.set({ status: 'completed' }));
    });

    it('allows a tenant_admin to read onboarding state of team members within their tenant', async () => {
      // Alice writes her state
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const db = context.firestore();
        await db.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_alice').set({
          userId: 'usr_alice',
          tenantId: 'tenant_alpha',
          status: 'in_progress',
        });
      });

      const adminContext = testEnv.authenticatedContext('usr_admin_alpha');
      const adminDb = adminContext.firestore();

      const ref = adminDb.collection('tenants').doc('tenant_alpha').collection('onboarding_state').doc('usr_alice');
      const snap = await assertSucceeds(ref.get());
      expect(snap.exists).toBe(true);
    });
  });

  describe('2. Persona Flow Declarative Integrity', () => {
    it('verifies all standard roles have configured onboarding flows', () => {
      const expectedRoles = [
        'tenant_admin',
        'compliance_manager',
        'privacy_manager',
        'ai_governance_manager',
        'security_manager',
        'auditor',
        'contributor',
      ];

      expectedRoles.forEach((role) => {
        const flow = PERSONA_ONBOARDING_FLOWS[role];
        expect(flow).toBeDefined();
        if (flow) {
          expect(flow.role).toBe(role);
          expect(flow.steps.length).toBeGreaterThan(0);
          expect(flow.badge).toBeTruthy();
          expect(flow.defaultTab).toBeTruthy();

          // Check each step has valid structure
          flow.steps.forEach((step, idx) => {
            expect(step.id).toBeTruthy();
            expect(step.title).toBeTruthy();
            expect(step.subtitle).toBeTruthy();
            expect(step.icon).toBeTruthy();
            expect(step.targetTab).toBeTruthy();
            expect(step.complianceImpact).toBeTruthy();
            expect(step.recommendedActionLabel).toBeTruthy();
            expect(step.stepIndex).toBe(idx);
          });
        }
      });
    });
  });
});

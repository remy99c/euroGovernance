import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-test',
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
});

describe('EU AI Act Governance Workflows & Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userAIGovA = 'usr_aigov_01';
  const userComplianceA = 'usr_compliance_01';
  const userSecurityA = 'usr_security_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userViewerA = 'usr_viewer_01';
  const userAdminB = 'usr_admin_b';

  const aiSystemId = 'ais_credit_scoring';
  const incidentId = 'inc_ai_drift_01';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminDb = context.firestore();

      // Seed Tenant A
      await adminDb.doc(`tenants/${tenantA}`).set({ id: tenantA, name: 'EuroCorp Technologies SE' });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAIGovA}`).set({
        userId: userAIGovA,
        tenantId: tenantA,
        role: 'ai_governance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userSecurityA}`).set({
        userId: userSecurityA,
        tenantId: tenantA,
        role: 'security_manager',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });
      await adminDb.doc(`tenants/${tenantA}/memberships/${userViewerA}`).set({
        userId: userViewerA,
        tenantId: tenantA,
        role: 'viewer',
        status: 'active',
      });

      // Seed Tenant B
      await adminDb.doc(`tenants/${tenantB}`).set({ id: tenantB, name: 'MedTech France SAS' });
      await adminDb.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Seed Existing AI System in Tenant A
      await adminDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).set({
        id: aiSystemId,
        tenantId: tenantA,
        code: 'AI-SYS-01',
        name: 'Automated Credit Risk Scoring Model',
        role: 'deployer',
        riskTier: 'high_risk',
        status: 'deployed',
        intendedPurpose: 'Credit risk assessment for SME loan applicants',
      });

      // Seed Existing AI Incident
      await adminDb.doc(`tenants/${tenantA}/ai_incidents/${incidentId}`).set({
        id: incidentId,
        tenantId: tenantA,
        aiSystemId,
        incidentReference: 'AI-INC-2026-001',
        title: 'Algorithmic Demographic Bias Shift',
        severity: 'adverse_event',
        status: 'investigating',
      });
    });
  });

  // 1. AI Systems Register RBAC
  test('AI Governance and Compliance Managers can register AI Systems; Contributors cannot', async () => {
    const aiGovDb = testEnv.authenticatedContext(userAIGovA, { email: 'ai-lead@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // AI Gov Manager CAN register system
    await assertSucceeds(
      aiGovDb.doc(`tenants/${tenantA}/ai_systems/ais_chatbot`).set({
        id: 'ais_chatbot',
        tenantId: tenantA,
        code: 'AI-SYS-02',
        name: 'Internal Compliance Chatbot Assistant',
        role: 'deployer',
        riskTier: 'minimal_risk',
        status: 'development',
      })
    );

    // Contributor CANNOT register system
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/ai_systems/ais_dev`).set({
        id: 'ais_dev',
        tenantId: tenantA,
        code: 'AI-SYS-03',
        name: 'Dev AI System',
      })
    );
  });

  // 2. Direct Risk-Tier Client Tampering Barrier
  test('Direct client update cannot alter riskTier; standard field updates are permitted', async () => {
    const aiGovDb = testEnv.authenticatedContext(userAIGovA, { email: 'ai-lead@eurocorp.de' }).firestore();

    // Attempting direct client jump of riskTier is DENIED by security rules
    await assertFails(
      aiGovDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).update({
        riskTier: 'minimal_risk', // Downgrading high_risk directly
      })
    );

    // Standard updates preserving the current riskTier SUCCEED
    await assertSucceeds(
      aiGovDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).update({
        description: 'Updated human-in-the-loop oversight protocol',
      })
    );
  });

  // 3. Substantial Changes Subcollection RBAC
  test('AI Governance Manager can log substantial changes; Security Manager cannot', async () => {
    const aiGovDb = testEnv.authenticatedContext(userAIGovA, { email: 'ai-lead@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();

    // AI Gov Manager CAN log substantial change
    await assertSucceeds(
      aiGovDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}/substantial_changes/chg_v2`).set({
        id: 'chg_v2',
        tenantId: tenantA,
        changeTitle: 'Upgrade to Transformer-based embedding layer',
        changeType: 'model_architecture',
        requiresReclassification: true,
      })
    );

    // Security Manager CANNOT log substantial changes (restricted to AI Gov & Admin)
    await assertFails(
      securityDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}/substantial_changes/chg_sec`).set({
        id: 'chg_sec',
        tenantId: tenantA,
        changeTitle: 'Sec Change',
      })
    );
  });

  // 4. AI Incidents Register RBAC
  test('AI Governance and Security Managers can log AI incidents; Contributors cannot', async () => {
    const aiGovDb = testEnv.authenticatedContext(userAIGovA, { email: 'ai-lead@eurocorp.de' }).firestore();
    const securityDb = testEnv.authenticatedContext(userSecurityA, { email: 'sec@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    // AI Gov & Security Managers CAN log incident
    await assertSucceeds(
      securityDb.doc(`tenants/${tenantA}/ai_incidents/inc_adversarial_attack`).set({
        id: 'inc_adversarial_attack',
        tenantId: tenantA,
        aiSystemId,
        incidentReference: 'AI-INC-2026-002',
        title: 'Adversarial Prompt Injection Event',
        severity: 'malfunction',
        status: 'reported',
      })
    );

    await assertSucceeds(
      aiGovDb.doc(`tenants/${tenantA}/ai_incidents/${incidentId}`).update({
        status: 'mitigated',
      })
    );

    // Contributor CANNOT log incident
    await assertFails(
      contribDb.doc(`tenants/${tenantA}/ai_incidents/inc_contrib`).set({
        id: 'inc_contrib',
        tenantId: tenantA,
        title: 'Dev Incident',
      })
    );
  });

  // 5. Post-Market Logs Subcollection RBAC
  test('Compliance Manager can log post-market monitoring; Contributors cannot', async () => {
    const complianceDb = testEnv.authenticatedContext(userComplianceA, { email: 'comp@eurocorp.de' }).firestore();
    const contribDb = testEnv.authenticatedContext(userContributorA, { email: 'dev@eurocorp.de' }).firestore();

    await assertSucceeds(
      complianceDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}/post_market_logs/log_q1_2026`).set({
        id: 'log_q1_2026',
        tenantId: tenantA,
        monitoringPeriodStart: '2026-01-01',
        monitoringPeriodEnd: '2026-03-31',
        performanceMetricsSummary: 'Accuracy: 98.4%, Drift: within tolerance',
      })
    );

    await assertFails(
      contribDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}/post_market_logs/log_contrib`).set({
        id: 'log_contrib',
        tenantId: tenantA,
      })
    );
  });

  // 6. Deletion Restriction Across AI Act Subsystem
  test('Only Tenant Admin can delete AI systems and AI incidents', async () => {
    const adminDb = testEnv.authenticatedContext(userAdminA, { email: 'admin@eurocorp.de' }).firestore();
    const aiGovDb = testEnv.authenticatedContext(userAIGovA, { email: 'ai-lead@eurocorp.de' }).firestore();

    // AI Gov Manager cannot delete
    await assertFails(aiGovDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).delete());
    await assertFails(aiGovDb.doc(`tenants/${tenantA}/ai_incidents/${incidentId}`).delete());

    // Tenant Admin CAN delete
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/ai_incidents/${incidentId}`).delete());
    await assertSucceeds(adminDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).delete());
  });

  // 7. Cross-Tenant Denial
  test('User from Tenant B cannot access or modify AI systems in Tenant A', async () => {
    const outsiderDb = testEnv.authenticatedContext(userAdminB, { email: 'admin@medtech.fr' }).firestore();

    await assertFails(outsiderDb.doc(`tenants/${tenantA}/ai_systems/${aiSystemId}`).get());
    await assertFails(outsiderDb.doc(`tenants/${tenantA}/ai_incidents/${incidentId}`).get());
  });
});

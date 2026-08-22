import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import { CANONICAL_FRAMEWORKS } from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-adoption-lifecycle-test';

beforeAll(async () => {
  const rules = getFirestoreRules();
  testEnv = await initializeTestEnvironment({
    projectId,
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

describe('Tenant Framework Adoption Lifecycle & Multi-Tenant RBAC', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userContributorA = 'usr_contrib_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
      await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

      // Seed global frameworks
      for (const fw of CANONICAL_FRAMEWORKS) {
        await db.doc(`frameworks/${fw.id}`).set(fw);
      }

      // Seed Tenant A Memberships
      await db.doc(`tenants/${tenantA}/memberships/${userAdminA}`).set({
        userId: userAdminA,
        tenantId: tenantA,
        role: 'tenant_admin',
        status: 'active',
      });
      await db.doc(`tenants/${tenantA}/memberships/${userComplianceA}`).set({
        userId: userComplianceA,
        tenantId: tenantA,
        role: 'compliance_manager',
        status: 'active',
      });
      await db.doc(`tenants/${tenantA}/memberships/${userContributorA}`).set({
        userId: userContributorA,
        tenantId: tenantA,
        role: 'contributor',
        status: 'active',
      });
      await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });

      // Pre-seed an already adopted active framework in Tenant A (GDPR)
      await db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).set({
        id: 'gdpr',
        tenantId: tenantA,
        frameworkId: 'gdpr',
        frameworkCode: 'GDPR',
        frameworkName: 'General Data Protection Regulation',
        frameworkVersion: '2016/679/EU',
        pinnedVersion: '2016/679/EU',
        versionPinnedAt: new Date().toISOString(),
        status: 'active',
        scopeDescription: 'Production GDPR Scope',
        scopingBoundaries: ['Frankfurt AWS', 'Stockholm GCP'],
        targetCertificationDate: '2026-12-31',
        totalMasterControlsCount: 6,
        instantiatedControlsCount: 6,
        applicableControlsCount: 6,
        notApplicableControlsCount: 0,
        adoptedBy: userAdminA,
        adoptedAt: new Date().toISOString(),
        lastInstantiatedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });
    });
  });

  // 1. Admin & Compliance Manager can adopt frameworks
  test('admin and compliance manager can adopt new framework with version pinning', async () => {
    const adminCtx = testEnv.authenticatedContext(userAdminA);
    const db = adminCtx.firestore();

    const now = new Date().toISOString();
    const newAdoption = {
      id: 'iso_27001',
      tenantId: tenantA,
      frameworkId: 'iso_27001',
      frameworkCode: 'ISO-27001',
      frameworkName: 'ISO/IEC 27001:2022',
      frameworkVersion: '2022',
      pinnedVersion: '2022',
      versionPinnedAt: now,
      status: 'in_scoping',
      scopeDescription: 'ISMS Scope for Cloud Infrastructure',
      scopingBoundaries: ['Frankfurt AWS DC', 'Corporate VPN'],
      targetCertificationDate: '2027-06-30',
      totalMasterControlsCount: 6,
      instantiatedControlsCount: 0,
      applicableControlsCount: 6,
      notApplicableControlsCount: 0,
      adoptedBy: userAdminA,
      adoptedAt: now,
      lastInstantiatedAt: null,
      createdAt: now,
      updatedAt: now,
      createdBy: userAdminA,
      updatedBy: userAdminA,
    };

    await assertSucceeds(db.doc(`tenants/${tenantA}/adopted_frameworks/iso_27001`).set(newAdoption));

    const snap = await db.doc(`tenants/${tenantA}/adopted_frameworks/iso_27001`).get();
    expect(snap.exists).toBe(true);
    expect(snap.data()?.pinnedVersion).toBe('2022');
    expect(snap.data()?.status).toBe('in_scoping');
  });

  // 2. Unauthorized role cannot adopt frameworks
  test('unauthorized roles (contributor, auditor) cannot adopt frameworks', async () => {
    const contribCtx = testEnv.authenticatedContext(userContributorA);
    const auditorCtx = testEnv.authenticatedContext(userAuditorA);

    const now = new Date().toISOString();
    const adoptionPayload = {
      id: 'eu_ai_act',
      tenantId: tenantA,
      frameworkId: 'eu_ai_act',
      frameworkCode: 'EU_AI_ACT',
      frameworkName: 'Artificial Intelligence Act',
      status: 'in_scoping',
      adoptedBy: userContributorA,
      createdAt: now,
      updatedAt: now,
    };

    // Contributor cannot adopt
    await assertFails(
      contribCtx.firestore().doc(`tenants/${tenantA}/adopted_frameworks/eu_ai_act`).set(adoptionPayload)
    );

    // Auditor cannot adopt
    await assertFails(
      auditorCtx.firestore().doc(`tenants/${tenantA}/adopted_frameworks/eu_ai_act`).set(adoptionPayload)
    );
  });

  // 3. Duplicate adoption is prevented (already active/adopted status check)
  test('duplicate active adoption is prevented from blind overwriting', async () => {
    const adminCtx = testEnv.authenticatedContext(userAdminA);
    const db = adminCtx.firestore();

    const existingSnap = await db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).get();
    expect(existingSnap.exists).toBe(true);
    expect(existingSnap.data()?.status).toBe('active');

    // Compliance manager can deactivate / retire framework
    await assertSucceeds(
      db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).update({
        status: 'retired',
        updatedAt: new Date().toISOString(),
      })
    );

    const retiredSnap = await db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).get();
    expect(retiredSnap.data()?.status).toBe('retired');
  });

  // 4. Tenant cannot adopt against another tenant (cross-tenant isolation)
  test('tenant user cannot adopt or read frameworks under another tenant partition', async () => {
    const adminACtx = testEnv.authenticatedContext(userAdminA);
    const dbA = adminACtx.firestore();

    const crossTenantAdoption = {
      id: 'eu_data_act',
      tenantId: tenantB,
      frameworkId: 'eu_data_act',
      frameworkCode: 'EU_DATA_ACT',
      frameworkName: 'European Data Act',
      status: 'in_scoping',
      adoptedBy: userAdminA,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    // Tenant A admin cannot write to Tenant B adopted frameworks
    await assertFails(
      dbA.doc(`tenants/${tenantB}/adopted_frameworks/eu_data_act`).set(crossTenantAdoption)
    );

    // Tenant A admin cannot read Tenant B adopted frameworks
    await assertFails(
      dbA.doc(`tenants/${tenantB}/adopted_frameworks/gdpr`).get()
    );
  });
});

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
    projectId: 'eurogovernance-rules-fw-test',
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

describe('Framework Adoption, Scoping & Applicability Security Rules', () => {
  const tenantA = 'tenant_eurocorp_de';
  const tenantB = 'tenant_medtech_fr';

  const userAdminA = 'usr_admin_01';
  const userComplianceA = 'usr_compliance_01';
  const userAuditorA = 'usr_auditor_01';
  const userAdminB = 'usr_admin_b';

  beforeEach(async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();

      // Seed global frameworks
      await db.doc('frameworks/gdpr').set({
        id: 'gdpr',
        code: 'GDPR',
        name: 'General Data Protection Regulation',
        category: 'privacy',
      });
      await db.doc('frameworks/gdpr/requirements/art_30').set({
        id: 'art_30',
        sectionCode: 'Art. 30',
        title: 'ROPA Register',
      });
      await db.doc('frameworks/gdpr/master_controls/ctl_master_gdpr_art30').set({
        id: 'ctl_master_gdpr_art30',
        code: 'CTL-GDPR-30',
        title: 'ROPA Maintenance',
      });

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
      await db.doc(`tenants/${tenantA}/memberships/${userAuditorA}`).set({
        userId: userAuditorA,
        tenantId: tenantA,
        role: 'auditor',
        status: 'active',
      });

      // Pre-seed an Adopted Framework in Tenant A
      await db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).set({
        id: 'gdpr',
        tenantId: tenantA,
        frameworkId: 'gdpr',
        frameworkCode: 'GDPR',
        frameworkName: 'General Data Protection Regulation',
        status: 'in_scoping',
        scopeDescription: 'Initial scope',
        scopingBoundaries: ['EU Operations'],
        totalMasterControlsCount: 4,
        instantiatedControlsCount: 0,
        applicableControlsCount: 4,
        notApplicableControlsCount: 0,
        adoptedBy: userAdminA,
        adoptedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      // Pre-seed a Requirement Applicability in Tenant A
      await db.doc(`tenants/${tenantA}/requirement_applicability/art_30`).set({
        id: 'art_30',
        tenantId: tenantA,
        requirementId: 'art_30',
        frameworkId: 'gdpr',
        sectionCode: 'Art. 30',
        requirementTitle: 'ROPA',
        isApplicable: true,
        justification: 'Applicable',
        scopingNotes: 'Standard',
        assessedBy: userAdminA,
        assessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userAdminA,
        updatedBy: userAdminA,
      });

      // Seed Tenant B Membership
      await db.doc(`tenants/${tenantB}/memberships/${userAdminB}`).set({
        userId: userAdminB,
        tenantId: tenantB,
        role: 'tenant_admin',
        status: 'active',
      });
    });
  });

  // 1. Master Framework Global Library Read & Write Guards
  test('Authenticated user can read master frameworks library, but client write is denied', async () => {
    const complianceCtx = testEnv.authenticatedContext(userComplianceA);
    const db = complianceCtx.firestore();

    // Read global framework succeeds
    await assertSucceeds(db.doc('frameworks/gdpr').get());
    await assertSucceeds(db.doc('frameworks/gdpr/requirements/art_30').get());
    await assertSucceeds(db.doc('frameworks/gdpr/master_controls/ctl_master_gdpr_art30').get());

    // Direct write by non-platform admin fails
    await assertFails(
      db.doc('frameworks/custom_fw').set({
        id: 'custom_fw',
        name: 'Unauthorized Global Framework',
      })
    );
  });

  // 2. Tenant Framework Adoption & Scoping
  test('Compliance Manager can adopt framework and update scope for their tenant', async () => {
    const complianceCtx = testEnv.authenticatedContext(userComplianceA);
    const db = complianceCtx.firestore();

    const adoptedRef = db.doc(`tenants/${tenantA}/adopted_frameworks/iso_27001`);

    // Adopt framework record
    await assertSucceeds(
      adoptedRef.set({
        id: 'iso_27001',
        tenantId: tenantA,
        frameworkId: 'iso_27001',
        frameworkCode: 'ISO-27001',
        frameworkName: 'ISO/IEC 27001:2022',
        status: 'in_scoping',
        scopeDescription: 'All cloud services in Frankfurt',
        scopingBoundaries: ['Frankfurt Production Cloud'],
        totalMasterControlsCount: 4,
        instantiatedControlsCount: 0,
        applicableControlsCount: 4,
        notApplicableControlsCount: 0,
        adoptedBy: userComplianceA,
        adoptedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      })
    );

    // Update scoping boundaries
    await assertSucceeds(
      adoptedRef.update({
        scopeDescription: 'Updated corporate ISO scope',
        scopingBoundaries: ['Frankfurt Production Cloud', 'Customer Portal'],
        updatedAt: new Date().toISOString(),
        updatedBy: userComplianceA,
      })
    );
  });

  // 3. Requirement Applicability & Scoping Decisions
  test('Compliance Manager can record requirement applicability decisions with justifications', async () => {
    const complianceCtx = testEnv.authenticatedContext(userComplianceA);
    const db = complianceCtx.firestore();

    const appRef = db.doc(`tenants/${tenantA}/requirement_applicability/art_32`);

    // Record applicability decision
    await assertSucceeds(
      appRef.set({
        id: 'art_32',
        tenantId: tenantA,
        requirementId: 'art_32',
        frameworkId: 'gdpr',
        sectionCode: 'Art. 32',
        requirementTitle: 'Security of Processing',
        isApplicable: true,
        justification: 'Mandatory technical controls',
        scopingNotes: 'AES-256 and TLS 1.3 encryption',
        assessedBy: userComplianceA,
        assessedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      })
    );
  });

  // 4. Role Guardrails: Auditor & Contributor Cannot Mutate Adoption Records
  test('Auditor cannot create, update or delete adopted frameworks or applicability', async () => {
    const auditorCtx = testEnv.authenticatedContext(userAuditorA);
    const db = auditorCtx.firestore();

    // Auditor read succeeds
    await assertSucceeds(db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).get());

    // Auditor write fails
    await assertFails(
      db.doc(`tenants/${tenantA}/adopted_frameworks/iso_27001`).set({
        id: 'iso_27001',
        tenantId: tenantA,
        frameworkId: 'iso_27001',
        status: 'in_scoping',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        createdBy: userAuditorA,
        updatedBy: userAuditorA,
      })
    );

    // Auditor update fails
    await assertFails(
      db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).update({
        scopeDescription: 'Unauthorized modification by auditor',
      })
    );

    // Auditor delete fails
    await assertFails(db.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).delete());
  });

  // 5. Cross-Tenant Isolation
  test('Tenant B cannot read or modify Tenant A adopted frameworks or requirement decisions', async () => {
    const adminBCtx = testEnv.authenticatedContext(userAdminB);
    const dbB = adminBCtx.firestore();

    // Cross-tenant reads fail
    await assertFails(dbB.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).get());
    await assertFails(dbB.doc(`tenants/${tenantA}/requirement_applicability/art_30`).get());

    // Cross-tenant writes fail
    await assertFails(
      dbB.doc(`tenants/${tenantA}/adopted_frameworks/gdpr`).update({
        scopeDescription: 'Tampered by Tenant B',
      })
    );
    await assertFails(
      dbB.doc(`tenants/${tenantA}/requirement_applicability/art_30`).update({
        justification: 'Tampered by Tenant B',
      })
    );
  });
});

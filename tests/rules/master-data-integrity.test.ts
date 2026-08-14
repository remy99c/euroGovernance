import {
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  CANONICAL_FRAMEWORKS,
  CANONICAL_REQUIREMENTS,
  CANONICAL_MASTER_CONTROLS,
  CANONICAL_REQUIREMENT_CONTROL_MAPPINGS,
  CANONICAL_CROSS_WALK_MAPPINGS,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const projectId = 'eurogovernance-master-data-test';

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

describe('Master Data Validation & Relationship Integrity', () => {
  // 1. Data Shape & Metadata Validation
  describe('Master Data Content Validation', () => {
    test('all canonical frameworks have complete metadata and valid categories', () => {
      expect(CANONICAL_FRAMEWORKS.length).toBeGreaterThanOrEqual(4);
      for (const fw of CANONICAL_FRAMEWORKS) {
        expect(fw.id).toBeTruthy();
        expect(fw.code).toBeTruthy();
        expect(fw.name).toBeTruthy();
        expect(fw.version).toBeTruthy();
        expect(['privacy', 'ai_governance', 'data_governance', 'security', 'cross_domain']).toContain(fw.category);
        expect(fw.jurisdiction).toBeTruthy();
        expect(['regulation', 'directive', 'international_standard', 'national_standard', 'industry_standard']).toContain(fw.type);
        expect(fw.status).toBe('active');
        expect(fw.officialReferenceUrl).toMatch(/^https?:\/\//);
        expect(fw.totalRequirementsCount).toBeGreaterThan(0);
        expect(fw.totalMasterControlsCount).toBeGreaterThan(0);
        expect(fw.isSystem).toBe(true);
      }
    });

    test('all canonical requirements have complete guidance and statutory fields', () => {
      expect(CANONICAL_REQUIREMENTS.length).toBeGreaterThanOrEqual(24);
      for (const req of CANONICAL_REQUIREMENTS) {
        expect(req.id).toBeTruthy();
        expect(req.frameworkId).toBeTruthy();
        expect(req.sectionCode).toBeTruthy();
        expect(req.title).toBeTruthy();
        expect(req.description.length).toBeGreaterThan(10);
        expect(req.guidanceText.length).toBeGreaterThan(10);
        expect(typeof req.isMandatory).toBe('boolean');
        expect(req.jurisdiction).toBeTruthy();
        expect(req.sortOrder).toBeGreaterThan(0);
      }
    });

    test('all canonical master controls have objectives, evidence expectations, and applicability profiles', () => {
      expect(CANONICAL_MASTER_CONTROLS.length).toBeGreaterThanOrEqual(24);
      for (const mc of CANONICAL_MASTER_CONTROLS) {
        expect(mc.id).toBeTruthy();
        expect(mc.frameworkId).toBeTruthy();
        expect(mc.code).toBeTruthy();
        expect(mc.title).toBeTruthy();
        expect(mc.description.length).toBeGreaterThan(10);
        expect(mc.domain).toBeTruthy();
        expect(mc.controlObjective.length).toBeGreaterThan(10);
        expect(Array.isArray(mc.evidenceExpectations)).toBe(true);
        expect(mc.evidenceExpectations.length).toBeGreaterThan(0);
        expect(mc.recommendedFrequencyDays).toBeGreaterThan(0);
        expect(typeof mc.applicabilityProfile.mandatoryExclusionsAllowed).toBe('boolean');
        expect(mc.applicabilityProfile.standardInclusionCriteria).toBeTruthy();
        expect(mc.applicabilityProfile.standardExclusionCriteria).toBeTruthy();
      }
    });
  });

  // 2. Relational Integrity Tests
  describe('Master Data Relational Integrity', () => {
    const frameworkIds = new Set(CANONICAL_FRAMEWORKS.map((f) => f.id));
    const requirementIds = new Set(CANONICAL_REQUIREMENTS.map((r) => r.id));
    const masterControlIds = new Set(CANONICAL_MASTER_CONTROLS.map((c) => c.id));

    test('every requirement references a valid parent framework', () => {
      for (const req of CANONICAL_REQUIREMENTS) {
        expect(frameworkIds.has(req.frameworkId)).toBe(true);
      }
    });

    test('every master control references a valid parent framework', () => {
      for (const mc of CANONICAL_MASTER_CONTROLS) {
        expect(frameworkIds.has(mc.frameworkId)).toBe(true);
      }
    });

    test('every requirement mappedMasterControlId exists in CANONICAL_MASTER_CONTROLS', () => {
      for (const req of CANONICAL_REQUIREMENTS) {
        if (req.mappedMasterControlIds) {
          for (const mcId of req.mappedMasterControlIds) {
            expect(masterControlIds.has(mcId)).toBe(true);
          }
        }
      }
    });

    test('every master control requirementId exists in CANONICAL_REQUIREMENTS', () => {
      for (const mc of CANONICAL_MASTER_CONTROLS) {
        if (mc.requirementIds) {
          for (const reqId of mc.requirementIds) {
            expect(requirementIds.has(reqId)).toBe(true);
          }
        }
      }
    });

    test('every MasterRequirementControlMapping links valid requirement and control pairs', () => {
      for (const map of CANONICAL_REQUIREMENT_CONTROL_MAPPINGS) {
        expect(frameworkIds.has(map.frameworkId)).toBe(true);
        expect(requirementIds.has(map.requirementId)).toBe(true);
        expect(masterControlIds.has(map.masterControlId)).toBe(true);
        expect(['full', 'partial', 'supporting']).toContain(map.coverageType);
      }
    });

    test('every CanonicalControlMapping links valid cross-framework requirements and controls', () => {
      for (const crossMap of CANONICAL_CROSS_WALK_MAPPINGS) {
        expect(frameworkIds.has(crossMap.sourceFrameworkId)).toBe(true);
        expect(frameworkIds.has(crossMap.targetFrameworkId)).toBe(true);
        expect(requirementIds.has(crossMap.sourceRequirementId)).toBe(true);
        expect(requirementIds.has(crossMap.targetRequirementId)).toBe(true);
        if (crossMap.sourceMasterControlId) {
          expect(masterControlIds.has(crossMap.sourceMasterControlId)).toBe(true);
        }
        if (crossMap.targetMasterControlId) {
          expect(masterControlIds.has(crossMap.targetMasterControlId)).toBe(true);
        }
        expect(['equivalent', 'subset', 'superset', 'intersecting', 'compensating']).toContain(crossMap.mappingType);
        expect(['high', 'medium', 'low']).toContain(crossMap.confidence);
      }
    });
  });

  // 3. Firestore Security Rules Tests (Platform-Admin Only Write)
  describe('Master Library Security Rules Enforcement', () => {
    const tenantUser = { uid: 'usr_tenant_01', email: 'compliance@eurocorp.de' };
    const platformAdmin = { uid: 'usr_platform_admin_01', email: 'admin@eurogovernance.eu', isPlatformAdmin: true };

    beforeEach(async () => {
      // Seed initial master framework document via admin context
      await testEnv.withSecurityRulesDisabled(async (context) => {
        const adminDb = context.firestore();
        await adminDb.doc('frameworks/gdpr').set(CANONICAL_FRAMEWORKS[0]!);
        await adminDb.doc('frameworks/gdpr/requirements/gdpr_art_30').set(CANONICAL_REQUIREMENTS[1]!);
        await adminDb.doc('frameworks/gdpr/master_controls/ctl_master_gdpr_art30').set(CANONICAL_MASTER_CONTROLS[1]!);
        await adminDb.doc('control_mappings/map_cross_encryption_gdpr_iso').set(CANONICAL_CROSS_WALK_MAPPINGS[0]!);
      });
    });

    test('authenticated tenant users can read global frameworks, requirements, controls, and mappings', async () => {
      const userContext = testEnv.authenticatedContext(tenantUser.uid, { email: tenantUser.email });
      const userDb = userContext.firestore();

      const fwSnap = await userDb.doc('frameworks/gdpr').get();
      expect(fwSnap.exists).toBe(true);
      expect(fwSnap.data()?.code).toBe('GDPR');

      const reqSnap = await userDb.doc('frameworks/gdpr/requirements/gdpr_art_30').get();
      expect(reqSnap.exists).toBe(true);
      expect(reqSnap.data()?.sectionCode).toBe('Art. 30');

      const ctlSnap = await userDb.doc('frameworks/gdpr/master_controls/ctl_master_gdpr_art30').get();
      expect(ctlSnap.exists).toBe(true);
      expect(ctlSnap.data()?.code).toBe('CTL-GDPR-30');

      const mapSnap = await userDb.doc('control_mappings/map_cross_encryption_gdpr_iso').get();
      expect(mapSnap.exists).toBe(true);
      expect(mapSnap.data()?.harmonizedDomain).toBe('cryptography');
    });

    test('non-platform-admin tenant users are blocked from writing or altering master frameworks', async () => {
      const userContext = testEnv.authenticatedContext(tenantUser.uid, { email: tenantUser.email });
      const userDb = userContext.firestore();

      // Blocked from creating a new global framework
      await expect(
        userDb.doc('frameworks/custom_hacked_fw').set({
          id: 'custom_hacked_fw',
          name: 'Unauthorized Master Framework',
        })
      ).rejects.toThrow();

      // Blocked from modifying existing master control
      await expect(
        userDb.doc('frameworks/gdpr/master_controls/ctl_master_gdpr_art30').update({
          title: 'Modified Title by Tenant',
        })
      ).rejects.toThrow();

      // Blocked from writing to global control_mappings
      await expect(
        userDb.doc('control_mappings/map_custom_unauthorized').set({
          harmonizedDomain: 'unauthorized',
        })
      ).rejects.toThrow();
    });

    test('platform admin can write and update global frameworks and mappings', async () => {
      const adminContext = testEnv.authenticatedContext(platformAdmin.uid, {
        email: platformAdmin.email,
        platform_admin: true,
      });
      const adminDb = adminContext.firestore();

      await expect(
        adminDb.doc('frameworks/eu_data_act').set(CANONICAL_FRAMEWORKS[3]!)
      ).resolves.not.toThrow();

      const snap = await adminDb.doc('frameworks/eu_data_act').get();
      expect(snap.exists).toBe(true);
      expect(snap.data()?.code).toBe('EU_DATA_ACT');
    });
  });
});

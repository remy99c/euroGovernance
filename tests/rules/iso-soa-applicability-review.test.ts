import {
  initializeTestEnvironment,
  RulesTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { getFirestoreRules } from './fixtures/test-factories.js';
import {
  CANONICAL_MASTER_DATA,
  ISOScopeStatement,
  StatementOfApplicabilityEntry,
  TenantApplicabilityDecision,
  TenantControlInstance,
  validateSoAEntry,
  transitionSoAApproval,
  generateSoAFromScopeAndDecisions,
  buildSoASummaryReport,
} from '@eurogovernance/shared-types';

let testEnv: RulesTestEnvironment;

const tenantA = 'tenant_iso_alpha';
const tenantB = 'tenant_iso_beta';

const userAdminA = 'usr_admin_iso_a';
const userComplianceA = 'usr_comp_iso_a';
const userAuditorA = 'usr_auditor_iso_a';
const userCompB = 'usr_comp_iso_b';

beforeAll(async () => {
  const rules = getFirestoreRules();

  testEnv = await initializeTestEnvironment({
    projectId: 'eurogov-iso-soa-test',
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

    await db.doc(`tenants/${tenantA}`).set({ id: tenantA, status: 'active' });
    await db.doc(`tenants/${tenantB}`).set({ id: tenantB, status: 'active' });

    // Tenant A Memberships
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

    // Tenant B Memberships
    await db.doc(`tenants/${tenantB}/memberships/${userCompB}`).set({
      userId: userCompB,
      tenantId: tenantB,
      role: 'compliance_manager',
      status: 'active',
    });
  });
});

describe('ISO Statement of Applicability (SoA) & Applicability Review Suite', () => {
  // 1. Mandatory Rationale Required on Exclusion
  describe('Mandatory Rationale on Exclusion', () => {
    test('rejects excluded SoA entry when justification rationale is missing or insufficient', () => {
      // Missing justification
      const invalidNoJustification = validateSoAEntry({
        controlCode: 'A.8.24',
        controlTitle: 'Use of Cryptography',
        frameworkType: 'iso_27001',
        isApplicable: false,
        decisionType: 'excluded',
        justification: '',
      });

      expect(invalidNoJustification.valid).toBe(false);
      expect(invalidNoJustification.error).toContain('Mandatory justification rationale');

      // Insufficient justification (< 10 chars)
      const invalidShortJustification = validateSoAEntry({
        controlCode: 'A.8.24',
        controlTitle: 'Use of Cryptography',
        frameworkType: 'iso_27001',
        isApplicable: false,
        decisionType: 'excluded',
        justification: 'N/A',
      });

      expect(invalidShortJustification.valid).toBe(false);
      expect(invalidShortJustification.error).toContain('minimum 10 characters');
    });

    test('accepts excluded SoA entry when valid statutory or technical justification is provided', () => {
      const validExclusion = validateSoAEntry({
        controlCode: 'A.7.1',
        controlTitle: 'Physical Security Perimeters',
        frameworkType: 'iso_27001',
        isApplicable: false,
        decisionType: 'excluded',
        exclusionCategory: 'not_in_scope',
        justification: '100% remote organization with no physical corporate data center premises.',
      });

      expect(validExclusion.valid).toBe(true);
      expect(validExclusion.error).toBeUndefined();
    });

    test('accepts applicable/included SoA entry without mandatory exclusion justification', () => {
      const validInclusion = validateSoAEntry({
        controlCode: 'A.5.24',
        controlTitle: 'Information Security Incident Management',
        frameworkType: 'iso_27001',
        isApplicable: true,
        decisionType: 'included',
      });

      expect(validInclusion.valid).toBe(true);
      expect(validInclusion.error).toBeUndefined();
    });
  });

  // 2. Approved Applicability Flow & Lifecycle Transitions
  describe('Approved Applicability Flow', () => {
    const now = new Date().toISOString();

    const initialDraftEntry: StatementOfApplicabilityEntry = {
      id: 'soa_iso_27001_a_5_24',
      tenantId: tenantA,
      ownerId: userComplianceA,
      frameworkType: 'iso_27001',
      controlCode: 'A.5.24',
      controlTitle: 'Information Security Incident Management',
      isApplicable: true,
      decisionType: 'included',
      sourceType: 'automatic_suggestion',
      approvalStatus: 'draft',
      justification: 'Mandatory Annex A baseline control',
      exclusionCategory: null,
      linkedScopeStatementId: 'scope_iso_27001_2026',
      linkedTenantControlId: 'ctrl_incident_mgmt_01',
      requirementId: 'iso_annex_a524',
      reviewedBy: null,
      reviewedAt: now,
      approvedBy: null,
      approvedAt: null,
      rejectionReason: null,
      version: '1.0',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
    };

    test('transitions draft automatic suggestion to pending_approval and finally approved state', () => {
      // 1. Submit for approval
      const pendingEntry = transitionSoAApproval(initialDraftEntry, 'submit_for_approval', userComplianceA);
      expect(pendingEntry.approvalStatus).toBe('pending_approval');
      expect(pendingEntry.reviewedBy).toBe(userComplianceA);

      // 2. Formally approve with CISO / Lead Auditor sign-off
      const approvedEntry = transitionSoAApproval(pendingEntry, 'approve', userAdminA);
      expect(approvedEntry.approvalStatus).toBe('approved');
      expect(approvedEntry.approvedBy).toBe(userAdminA);
      expect(approvedEntry.approvedAt).toBeDefined();
      expect(approvedEntry.rejectionReason).toBeNull();
    });

    test('supports rejection with mandatory notes and permits resubmission', () => {
      const pendingEntry = transitionSoAApproval(initialDraftEntry, 'submit_for_approval', userComplianceA);

      // Rejection with feedback
      const rejectedEntry = transitionSoAApproval(
        pendingEntry,
        'reject',
        userAdminA,
        'Control scope requires split across cloud infrastructure.'
      );
      expect(rejectedEntry.approvalStatus).toBe('rejected');
      expect(rejectedEntry.rejectionReason).toBe('Control scope requires split across cloud infrastructure.');

      // Resubmission succeeds
      const resubmitted = transitionSoAApproval(rejectedEntry, 'submit_for_approval', userComplianceA);
      expect(resubmitted.approvalStatus).toBe('pending_approval');
    });

    test('prohibits approving or submitting an excluded control without valid justification', () => {
      const invalidExcludedEntry: StatementOfApplicabilityEntry = {
        ...initialDraftEntry,
        isApplicable: false,
        decisionType: 'excluded',
        justification: '', // invalid
      };

      expect(() => {
        transitionSoAApproval(invalidExcludedEntry, 'submit_for_approval', userComplianceA);
      }).toThrow('Mandatory justification rationale');

      expect(() => {
        transitionSoAApproval(invalidExcludedEntry, 'approve', userAdminA);
      }).toThrow('Cannot approve invalid entry');
    });
  });

  // 3. Traceability from Scope Statement to SoA Entries
  describe('Traceability from Scope to SoA Entry', () => {
    const now = new Date().toISOString();

    const scopeStatement: ISOScopeStatement = {
      id: 'scope_iso_27001_global',
      tenantId: tenantA,
      ownerId: userComplianceA,
      frameworkType: 'iso_27001',
      title: 'Global ISMS Scope Statement (Cloud Infrastructure)',
      scopeBoundaries: 'All production VPCs, SaaS services, and employee workstations.',
      includedLocations: ['Frankfurt (eu-central-1)', 'Dublin (eu-west-1)'],
      includedBusinessUnits: ['Engineering', 'Security', 'DevOps'],
      exclusionsJustification: 'No physical data center operations (100% public cloud hosted).',
      approvedBy: userAdminA,
      approvedAt: now,
      version: '2.1',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: userAdminA,
      updatedBy: userAdminA,
    };

    const decisions: TenantApplicabilityDecision[] = [
      {
        id: 'dec_iso_annex_a524',
        tenantId: tenantA,
        ownerId: userComplianceA,
        requirementId: 'iso_annex_a524',
        frameworkId: 'iso_27001',
        sectionCode: 'Annex A.5.24',
        requirementTitle: 'Incident Management',
        isApplicable: true,
        status: 'applicable',
        applicabilityType: 'statutory_mandatory',
        matchedRuleId: null,
        ruleEvaluationSummary: 'Mandatory',
        rationale: 'Core ISMS control',
        overrideReason: null,
        previousStatus: null,
        assessedBy: userComplianceA,
        assessedAt: now,
        reviewedBy: null,
        reviewedAt: null,
        createdAt: now,
        updatedAt: now,
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      },
    ];

    const tenantControls: TenantControlInstance[] = [
      {
        id: 'ctrl_inst_iso_a524',
        tenantId: tenantA,
        ownerId: userComplianceA,
        masterControlId: 'ctl_master_iso_a524',
        code: 'CTL-ISO-A524',
        title: 'Information Security Incident Management',
        description: 'Incident triage and escalation protocol',
        domain: 'incident_management',
        frameworkIds: ['iso_27001'],
        requirementIds: ['iso_annex_a524'],
        status: 'implemented',
        healthScore: 100,
        enforcementMechanism: 'automated',
        reviewFrequencyDays: 90,
        lastReviewDate: null,
        nextReviewDate: null,
        implementationNotes: 'Connected to PagerDuty & Jira Service Desk',
        isHarmonized: false,
        canonicalMappingIds: [],
        createdAt: now,
        updatedAt: now,
        createdBy: userComplianceA,
        updatedBy: userComplianceA,
      },
    ];

    test('generates traceable SoA entries linking scope statement, decisions, and tenant controls', () => {
      const generatedEntries = generateSoAFromScopeAndDecisions({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeStatement,
        decisions,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        tenantControls,
      });

      expect(generatedEntries.length).toBeGreaterThan(0);

      // Verify every generated entry maintains traceability to the source scope statement
      for (const entry of generatedEntries) {
        expect(entry.linkedScopeStatementId).toBe(scopeStatement.id);
        expect(entry.version).toBe(scopeStatement.version);
        expect(entry.approvalStatus).toBe('draft'); // Clear separation: default is unapproved suggestion
        expect(entry.sourceType).toBe('automatic_suggestion');
      }

      // Verify linked operational control
      const incidentEntry = generatedEntries.find((e) => e.controlCode === 'CTL-ISO-A524');
      expect(incidentEntry).toBeDefined();
      expect(incidentEntry?.linkedTenantControlId).toBe('ctrl_inst_iso_a524');
      expect(incidentEntry?.isApplicable).toBe(true);
      expect(incidentEntry?.decisionType).toBe('included');
    });

    test('builds executive SoA Summary Report with correct categorization and metrics', () => {
      const generatedEntries = generateSoAFromScopeAndDecisions({
        tenantId: tenantA,
        defaultOwnerId: userComplianceA,
        scopeStatement,
        decisions,
        masterControls: CANONICAL_MASTER_DATA.masterControls,
        tenantControls,
      });

      // Mark 1 entry as approved
      generatedEntries[0] = transitionSoAApproval(generatedEntries[0]!, 'approve', userAdminA);

      const summary = buildSoASummaryReport('iso_27001', generatedEntries, scopeStatement);

      expect(summary.totalControls).toBe(generatedEntries.length);
      expect(summary.scopeStatementId).toBe(scopeStatement.id);
      expect(summary.scopeTitle).toBe(scopeStatement.title);
      expect(summary.includedCount).toBeGreaterThan(0);
      expect(summary.approvedCount).toBe(1);
      expect(summary.draftCount).toBe(generatedEntries.length - 1);
    });
  });

  // 4. Firestore Security Rules Isolation for ISO SoA
  describe('Firestore Security Rules Isolation for SoA', () => {
    const now = new Date().toISOString();

    const sampleSoAEntry: StatementOfApplicabilityEntry = {
      id: 'soa_rules_test_entry',
      tenantId: tenantA,
      ownerId: userComplianceA,
      frameworkType: 'iso_27001',
      controlCode: 'A.8.24',
      controlTitle: 'Use of Cryptography',
      isApplicable: true,
      decisionType: 'included',
      sourceType: 'manual_override',
      approvalStatus: 'approved',
      justification: 'AES-256 mandatory across databases',
      exclusionCategory: null,
      linkedScopeStatementId: 'scope_27001_a',
      linkedTenantControlId: 'ctrl_01',
      requirementId: 'iso_annex_a824',
      reviewedBy: userComplianceA,
      reviewedAt: now,
      approvedBy: userAdminA,
      approvedAt: now,
      rejectionReason: null,
      version: '1.0',
      status: 'active',
      createdAt: now,
      updatedAt: now,
      createdBy: userComplianceA,
      updatedBy: userComplianceA,
    };

    test('compliance manager must create and update SoA entries through server commands', async () => {
      const compCtx = testEnv.authenticatedContext(userComplianceA);
      const db = compCtx.firestore();

      const docRef = db.doc(`tenants/${tenantA}/iso_soa_entries/${sampleSoAEntry.id}`);

      // Authoritative writes are never accepted from the browser.
      await assertFails(docRef.set(sampleSoAEntry));

      // Updates are also server-only, even for an authorized manager.
      await assertFails(
        docRef.update({
          justification: 'Updated encryption key management procedure',
          updatedAt: new Date().toISOString(),
          updatedBy: userComplianceA,
        })
      );
    });

    test('auditor in Tenant A can read but cannot create or mutate SoA entries', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantA}/iso_soa_entries/${sampleSoAEntry.id}`).set({
          ...sampleSoAEntry,
          ownerId: userAdminA,
          createdBy: userAdminA,
          updatedBy: userAdminA,
        });
      });

      const auditorCtx = testEnv.authenticatedContext(userAuditorA);
      const db = auditorCtx.firestore();
      const docRef = db.doc(`tenants/${tenantA}/iso_soa_entries/${sampleSoAEntry.id}`);

      // Read succeeds
      await assertSucceeds(docRef.get());

      // Mutation fails
      await assertFails(
        docRef.update({
          justification: 'Auditor unauthorized modification',
        })
      );
    });

    test('Tenant A user cannot read or mutate SoA entries in Tenant B partition', async () => {
      await testEnv.withSecurityRulesDisabled(async (context) => {
        await context.firestore().doc(`tenants/${tenantB}/iso_soa_entries/soa_tenant_b_confidential`).set({
          ...sampleSoAEntry,
          id: 'soa_tenant_b_confidential',
          tenantId: tenantB,
          ownerId: userCompB,
          createdBy: userCompB,
          updatedBy: userCompB,
        });
      });

      const compACtx = testEnv.authenticatedContext(userComplianceA);
      const crossTenantRef = compACtx.firestore().doc(`tenants/${tenantB}/iso_soa_entries/soa_tenant_b_confidential`);

      // Read is blocked
      await assertFails(crossTenantRef.get());

      // Mutation is blocked
      await assertFails(
        crossTenantRef.update({
          justification: 'Cross tenant malicious attempt',
        })
      );
    });
  });
});

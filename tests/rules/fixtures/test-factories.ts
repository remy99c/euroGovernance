import { RulesTestEnvironment } from '@firebase/rules-unit-testing';
import { UserRole } from '@eurogovernance/shared-types';

export interface SeedTenantOptions {
  tenantId: string;
  name: string;
}

export interface SeedMembershipOptions {
  tenantId: string;
  userId: string;
  role: UserRole;
  status?: 'active' | 'suspended';
}

/**
 * Test Fixture Factory: Seeds tenant container and memberships using administrative privileges.
 */
export async function seedTenantWithMembers(
  testEnv: RulesTestEnvironment,
  tenant: SeedTenantOptions,
  members: SeedMembershipOptions[]
): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const adminDb = context.firestore();

    // 1. Seed Tenant
    await adminDb.doc(`tenants/${tenant.tenantId}`).set({
      id: tenant.tenantId,
      name: tenant.name,
      status: 'active',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // 2. Seed Memberships
    for (const m of members) {
      await adminDb.doc(`tenants/${tenant.tenantId}/memberships/${m.userId}`).set({
        userId: m.userId,
        tenantId: tenant.tenantId,
        role: m.role,
        status: m.status || 'active',
        joinedAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  });
}

/**
 * Standard Tenant Fixture IDs and Personas for Security Assertions
 */
export const FIXTURE_TENANT_A = 'tenant_eurocorp_de';
export const FIXTURE_TENANT_B = 'tenant_medtech_fr';

export const PERSONAS = {
  adminA: { uid: 'usr_admin_01', role: 'tenant_admin' as UserRole, email: 'admin@eurocorp.de' },
  complianceA: { uid: 'usr_compliance_01', role: 'compliance_manager' as UserRole, email: 'compliance@eurocorp.de' },
  privacyA: { uid: 'usr_privacy_01', role: 'privacy_manager' as UserRole, email: 'dpo@eurocorp.de' },
  securityA: { uid: 'usr_security_01', role: 'security_manager' as UserRole, email: 'ciso@eurocorp.de' },
  aiGovA: { uid: 'usr_aigov_01', role: 'ai_governance_manager' as UserRole, email: 'ai.lead@eurocorp.de' },
  approverA: { uid: 'usr_approver_01', role: 'approver' as UserRole, email: 'officer@eurocorp.de' },
  auditorA: { uid: 'usr_auditor_01', role: 'auditor' as UserRole, email: 'auditor@kpmg.de' },
  contributorA: { uid: 'usr_contrib_01', role: 'contributor' as UserRole, email: 'engineer@eurocorp.de' },
  viewerA: { uid: 'usr_viewer_01', role: 'viewer' as UserRole, email: 'intern@eurocorp.de' },

  adminB: { uid: 'usr_admin_b', role: 'tenant_admin' as UserRole, email: 'admin@medtech.fr' },
  contributorB: { uid: 'usr_contrib_b', role: 'contributor' as UserRole, email: 'dev@medtech.fr' },
};

/**
 * Test Fixture: Seeds Canonical Global Master Data (Frameworks, Controls, Harmonizations, Questionnaires, Rules)
 */
export async function seedMasterGovernanceLibrary(testEnv: RulesTestEnvironment): Promise<void> {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    const now = new Date().toISOString();

    // 1. Master Frameworks
    await db.doc('frameworks/gdpr').set({
      id: 'gdpr',
      name: 'General Data Protection Regulation',
      shortName: 'GDPR',
      version: '2016/679',
      regulatoryBody: 'European Parliament & Council',
      jurisdiction: 'EU',
      category: 'privacy',
      totalRequirementsCount: 99,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    await db.doc('frameworks/iso_27001').set({
      id: 'iso_27001',
      name: 'ISO/IEC 27001 Information Security Management',
      shortName: 'ISO 27001',
      version: '2022',
      regulatoryBody: 'ISO/IEC',
      jurisdiction: 'Global',
      category: 'security',
      totalRequirementsCount: 93,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    // 2. Canonical Harmonized Control Mappings
    await db.doc('control_mappings/map_sec_enc_01').set({
      id: 'map_sec_enc_01',
      canonicalControlGroupId: 'CAN-SEC-ENC',
      canonicalTitle: 'Cryptographic Protection & Encryption',
      canonicalDomain: 'security',
      allowsHarmonization: true,
      mappedObligations: [
        {
          frameworkId: 'gdpr',
          frameworkShortName: 'GDPR',
          requirementId: 'gdpr_art_32',
          sectionCode: 'Article 32',
          requirementTitle: 'Security of Processing',
          relationship: 'exact',
        },
        {
          frameworkId: 'iso_27001',
          frameworkShortName: 'ISO 27001',
          requirementId: 'iso_27001_a824',
          sectionCode: 'A.8.24',
          requirementTitle: 'Use of cryptography',
          relationship: 'exact',
        },
      ],
      createdAt: now,
      updatedAt: now,
    });

    // 3. Applicability Rules
    await db.doc('applicability_rules/rule_gdpr_art30_records').set({
      id: 'rule_gdpr_art30_records',
      frameworkId: 'gdpr',
      targetRequirementId: 'gdpr_art_30',
      name: 'Article 30 ROPA Mandatory Trigger',
      conditionGroups: [
        {
          logicalOperator: 'AND',
          conditions: [
            {
              factKey: 'processesPersonalData',
              operator: 'equals',
              factValue: true,
            },
          ],
        },
      ],
      outcomeIfMatched: 'applicable',
      outcomeIfUnmatched: 'not_applicable',
      explanationTemplate: 'Triggered when organization processes EU personal data.',
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });
  });
}

import * as fs from 'fs';
import * as path from 'path';

export function getFirestoreRules(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'firestore.rules'),
    path.resolve(process.cwd(), '../../firestore.rules'),
    path.resolve(process.cwd(), '../firestore.rules'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error(`firestore.rules not found from cwd ${process.cwd()}`);
}

export function getStorageRules(): string {
  const possiblePaths = [
    path.resolve(process.cwd(), 'storage.rules'),
    path.resolve(process.cwd(), '../../storage.rules'),
    path.resolve(process.cwd(), '../storage.rules'),
  ];
  for (const p of possiblePaths) {
    if (fs.existsSync(p)) {
      return fs.readFileSync(p, 'utf8');
    }
  }
  throw new Error(`storage.rules not found from cwd ${process.cwd()}`);
}

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

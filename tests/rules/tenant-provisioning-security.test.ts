import { readFileSync } from 'node:fs';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  consumeTenantCreationQuota,
  deterministicInvitationId,
  normalizeTenantInvitationInput,
  normalizeTenantProvisioningInput,
  parseTenantCreationQuota,
  resolveTenantProvisioningEntitlement,
  tenantProvisioningFingerprint,
} from '../../functions/src/lib/tenant-provisioning.js';
import { getFirestoreRules } from './fixtures/test-factories.js';

let testEnv: RulesTestEnvironment;

const TENANT_ID = 'tenant_provisioning_security';
const ADMIN_UID = 'tenant_provisioning_admin';

function source(relativePath: string): string {
  return readFileSync(new URL(`../../${relativePath}`, import.meta.url), 'utf8');
}

beforeAll(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'eurogovernance-tenant-provisioning-security',
    firestore: {
      rules: getFirestoreRules(),
      host: '127.0.0.1',
      port: 8080,
    },
  });
});

afterAll(async () => {
  await testEnv.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await db.doc(`tenants/${TENANT_ID}`).set({
      id: TENANT_ID,
      name: 'Provisioning Security Tenant',
      slug: TENANT_ID,
      tier: 'starter',
      status: 'active',
      dataRegion: 'europe-west3',
      enabledFrameworks: [],
    });
    await db.doc(`tenants/${TENANT_ID}/memberships/${ADMIN_UID}`).set({
      id: ADMIN_UID,
      tenantId: TENANT_ID,
      userId: ADMIN_UID,
      role: 'tenant_admin',
      status: 'active',
    });
    await db.doc(`tenant_creation_quotas/${ADMIN_UID}`).set({
      userId: ADMIN_UID,
      createdTenants: 1,
      entitlementLimit: 1,
      createdAt: '2026-08-22T00:00:00.000Z',
      updatedAt: '2026-08-22T00:00:00.000Z',
    });
    await db
      .doc(`tenant_creation_quotas/${ADMIN_UID}/provisioning_receipts/tp_existing`)
      .set({
        schemaVersion: 1,
        actorId: ADMIN_UID,
        tenantId: TENANT_ID,
        status: 'committed',
      });
  });
});

describe('Tenant provisioning validation and quota model', () => {
  test('accepts only canonical customer fields and never accepts caller-owned plan fields', () => {
    expect(
      normalizeTenantProvisioningInput({ name: ' Example BV ', slug: 'example-bv' })
    ).toEqual({ name: 'Example BV', slug: 'example-bv' });

    expect(() =>
      normalizeTenantProvisioningInput({
        name: 'Example BV',
        slug: 'example-bv',
        tier: 'enterprise',
      })
    ).toThrow('server-owned');
    expect(() => normalizeTenantProvisioningInput({ name: 'Example BV' })).toThrow();
    expect(() =>
      normalizeTenantProvisioningInput({ name: 'Unsafe\nTenant', slug: 'unsafe-tenant' })
    ).toThrow('printable');
    expect(() =>
      normalizeTenantProvisioningInput({ name: 'Example BV', slug: '../example' })
    ).toThrow('Tenant slug');
  });

  test('requires a server entitlement and fails closed for malformed limits or quotas', () => {
    expect(
      resolveTenantProvisioningEntitlement({
        isPlatformAdmin: false,
        tenantCreatorClaim: false,
        tenantCreationLimitClaim: undefined,
      })
    ).toMatchObject({ permitted: false, limit: 0, basis: 'none' });
    expect(
      resolveTenantProvisioningEntitlement({
        isPlatformAdmin: false,
        tenantCreatorClaim: true,
        tenantCreationLimitClaim: undefined,
      })
    ).toMatchObject({ permitted: true, limit: 1, basis: 'tenant_creator' });
    expect(
      resolveTenantProvisioningEntitlement({
        isPlatformAdmin: true,
        tenantCreatorClaim: false,
        tenantCreationLimitClaim: undefined,
      })
    ).toMatchObject({ permitted: true, limit: 100, basis: 'platform_admin' });

    for (const invalidLimit of [0, -1, 1_001, '10', 1.5]) {
      expect(
        resolveTenantProvisioningEntitlement({
          isPlatformAdmin: false,
          tenantCreatorClaim: true,
          tenantCreationLimitClaim: invalidLimit,
        })
      ).toMatchObject({ permitted: false, configurationError: expect.any(String) });
    }

    const quota = parseTenantCreationQuota(
      true,
      {
        userId: ADMIN_UID,
        createdTenants: 0,
        entitlementLimit: 1,
        updatedAt: '2026-08-22T00:00:00.000Z',
      },
      ADMIN_UID
    );
    expect(consumeTenantCreationQuota(quota, 1)).toBe(1);
    expect(() => consumeTenantCreationQuota({ ...quota, createdTenants: 1 }, 1)).toThrow(
      'reached its tenant provisioning entitlement'
    );
    expect(() =>
      parseTenantCreationQuota(
        true,
        {
          userId: ADMIN_UID,
          createdTenants: '0',
          entitlementLimit: 1,
          updatedAt: '2026-08-22T00:00:00.000Z',
        },
        ADMIN_UID
      )
    ).toThrow('integrity validation');
  });

  test('derives stable, actor-bound provisioning receipts and invitation keys', () => {
    const input = normalizeTenantProvisioningInput({
      name: 'Example BV',
      slug: 'example-bv',
    });
    const first = tenantProvisioningFingerprint(ADMIN_UID, input);
    const retry = tenantProvisioningFingerprint(ADMIN_UID, { ...input });
    const otherActor = tenantProvisioningFingerprint('different_admin', input);
    expect(retry).toEqual(first);
    expect(first.receiptId).toMatch(/^tp_[0-9a-f]{64}$/u);
    expect(otherActor.receiptId).not.toBe(first.receiptId);

    const invitation = normalizeTenantInvitationInput({
      tenantId: TENANT_ID,
      email: ' Recipient@Example.test ',
      role: 'auditor',
      department: ' Assurance ',
    });
    expect(invitation.email).toBe('recipient@example.test');
    expect(
      deterministicInvitationId(invitation.tenantId, invitation.email)
    ).toBe(deterministicInvitationId(TENANT_ID, 'recipient@example.test'));
  });
});

describe('Tenant and provisioning metadata Rules boundary', () => {
  test('tenant administrators can read but cannot directly create, mutate, or delete tenant roots', async () => {
    const db = testEnv.authenticatedContext(ADMIN_UID).firestore();
    await assertSucceeds(db.doc(`tenants/${TENANT_ID}`).get());
    await assertFails(db.doc(`tenants/${TENANT_ID}`).update({ name: 'Forged rename' }));
    await assertFails(db.doc(`tenants/${TENANT_ID}`).update({ tier: 'enterprise' }));
    await assertFails(db.doc(`tenants/${TENANT_ID}`).update({ status: 'archived' }));
    await assertFails(
      db.doc('tenants/browser-created-tenant').set({
        id: 'browser-created-tenant',
        tier: 'enterprise',
        status: 'active',
      })
    );
    await assertFails(db.doc(`tenants/${TENANT_ID}`).delete());
  });

  test('even platform claims cannot bypass server-only tenant-root writes', async () => {
    const db = testEnv
      .authenticatedContext('platform_provisioner', { platform_admin: true })
      .firestore();
    await assertSucceeds(db.doc(`tenants/${TENANT_ID}`).get());
    await assertFails(db.doc(`tenants/${TENANT_ID}`).update({ tier: 'enterprise' }));
    await assertFails(db.doc('tenants/platform-created-tenant').set({ status: 'active' }));
    await assertFails(db.doc(`tenants/${TENANT_ID}`).delete());
  });

  test('quota and idempotency receipts are never browser-readable or writable', async () => {
    const db = testEnv
      .authenticatedContext(ADMIN_UID, {
        tenant_creator: true,
        tenant_creation_limit: 10,
      })
      .firestore();
    const quota = db.doc(`tenant_creation_quotas/${ADMIN_UID}`);
    const receipt = db.doc(
      `tenant_creation_quotas/${ADMIN_UID}/provisioning_receipts/tp_existing`
    );
    await assertFails(quota.get());
    await assertFails(quota.update({ createdTenants: 0 }));
    await assertFails(receipt.get());
    await assertFails(receipt.set({ status: 'committed' }));
  });

  test('source contract keeps provisioning and adjacent authority changes atomic', () => {
    const tenantHandler = source('functions/src/handlers/tenants.ts');
    const createHandler = tenantHandler.slice(
      tenantHandler.indexOf('export const createTenant'),
      tenantHandler.indexOf('export const inviteUserToTenant')
    );
    expect(createHandler).toContain('consumeAppCheckToken: true');
    expect(createHandler).toContain('request.app?.alreadyConsumed === true');
    expect(createHandler).toContain('if (!request.app)');
    expect(createHandler).toContain('enforceAppCheck: true');
    expect(createHandler).toContain('normalizeTenantProvisioningInput(request.data)');
    expect(createHandler).toContain("collection('provisioning_receipts')");
    expect(createHandler).toContain('transaction.create(receiptRef, receipt)');
    expect(createHandler).toContain('appendAuditLogInTransaction(transaction');
    expect(createHandler).toContain('transaction.create(tenantRef, tenantDoc)');
    expect(createHandler).toContain('transaction.create(membershipRef, membershipDoc)');
    expect(createHandler).not.toContain('recordAuditLog');

    expect(tenantHandler).toContain('requireTransactionalTenantAdmin(transaction, authContext)');
    expect(tenantHandler).not.toContain('await recordAuditLog');
  });
});

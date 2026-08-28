import { UserRole } from './core.js';
export type TenantSubscriptionTier = 'starter' | 'professional' | 'enterprise';
export type TenantStatus = 'active' | 'suspended' | 'archived';
export type MembershipStatus = 'active' | 'inactive' | 'suspended';
export type InvitationStatus = 'pending' | 'accepted' | 'expired' | 'revoked';
/**
 * Tenant Organization Account (/tenants/{tenantId})
 */
export interface Tenant {
    id: string;
    name: string;
    slug: string;
    tier: TenantSubscriptionTier;
    status: TenantStatus;
    primaryContactEmail: string;
    dataRegion: 'europe-west3' | 'europe-west1';
    enabledFrameworks: string[];
    createdAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
}
/**
 * Tenant Membership Mapping (/tenants/{tenantId}/memberships/{userId})
 */
export interface TenantMembership {
    id: string;
    tenantId: string;
    userId: string;
    role: UserRole;
    status: MembershipStatus;
    department: string;
    title: string;
    joinedAt: string;
    updatedAt: string;
    createdBy: string;
    updatedBy: string;
}
/**
 * Global User Profile (/users/{userId})
 */
export interface UserProfile {
    id: string;
    email: string;
    displayName: string;
    avatarUrl: string | null;
    defaultTenantId: string | null;
    isPlatformAdmin: boolean;
    mfaEnabled: boolean;
    createdAt: string;
    updatedAt: string;
}
/**
 * Tenant Invitation Record (/invitations/{invitationId})
 */
export interface TenantInvitation {
    id: string;
    tenantId: string;
    tenantName: string;
    email: string;
    role: UserRole;
    department: string;
    status: InvitationStatus;
    tokenHash: string;
    expiresAt: string;
    createdAt: string;
    createdBy: string;
}
//# sourceMappingURL=tenancy.d.ts.map
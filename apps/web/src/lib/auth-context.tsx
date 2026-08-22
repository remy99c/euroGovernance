'use client';

import type { UserRole } from '@eurogovernance/shared-types';
import { isValidUserRole } from '@eurogovernance/shared-types';
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react';
import {
  type User,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';

const TENANT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/;
const MAX_TENANT_NAME_LENGTH = 256;
const MAX_MEMBERSHIPS = 250;

/**
 * Development personas contain well-known emulator credentials. Requiring all
 * three conditions prevents those credentials and controls from becoming a
 * production authentication path because of one accidentally copied variable.
 */
export const devPersonasEnabled =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === 'true' &&
  process.env.NEXT_PUBLIC_ENABLE_DEV_PERSONAS === 'true';

export interface TenantMembershipSummary {
  id: string;
  name: string;
  slug: string;
  role: Exclude<UserRole, 'platform_admin'>;
  department: string;
  title: string;
  joinedAt: string;
}

interface ListMyTenantMembershipsResult {
  success: true;
  count: number;
  truncated: boolean;
  memberships: Array<{
    tenantId: string;
    tenantName: string;
    tenantSlug: string;
    role: UserRole;
    department: string;
    title: string;
    joinedAt: string;
  }>;
}

export interface AuthContextType {
  user: User | null;
  loading: boolean;
  membershipError: string | null;
  tenantId: string;
  setTenantId: (id: string) => void;
  userRole: Exclude<UserRole, 'platform_admin'> | null;
  availableTenants: TenantMembershipSummary[];
  membershipsTruncated: boolean;
  devPersonasEnabled: boolean;
  loginWithEmail: (email: string, pass: string) => Promise<void>;
  loginDevUser: (role: string) => Promise<void>;
  refreshMemberships: () => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function parseMemberships(value: unknown): {
  memberships: TenantMembershipSummary[];
  truncated: boolean;
} {
  if (!value || typeof value !== 'object') {
    throw new Error('Invalid membership response.');
  }

  const result = value as Partial<ListMyTenantMembershipsResult>;
  if (result.success !== true || !Array.isArray(result.memberships)) {
    throw new Error('Invalid membership response.');
  }

  const memberships: TenantMembershipSummary[] = [];
  const seenTenantIds = new Set<string>();

  for (const item of result.memberships.slice(0, MAX_MEMBERSHIPS)) {
    if (!item || typeof item !== 'object') continue;

    const tenantId = typeof item.tenantId === 'string' ? item.tenantId : '';
    const tenantName = typeof item.tenantName === 'string' ? item.tenantName.trim() : '';
    const tenantSlug = typeof item.tenantSlug === 'string' ? item.tenantSlug.trim() : '';

    if (
      !TENANT_ID_PATTERN.test(tenantId) ||
      !tenantName ||
      tenantName.length > MAX_TENANT_NAME_LENGTH ||
      !isValidUserRole(item.role) ||
      item.role === 'platform_admin' ||
      seenTenantIds.has(tenantId)
    ) {
      continue;
    }

    seenTenantIds.add(tenantId);
    memberships.push({
      id: tenantId,
      name: tenantName,
      slug: tenantSlug.slice(0, 128),
      role: item.role,
      department: typeof item.department === 'string' ? item.department.slice(0, 160) : '',
      title: typeof item.title === 'string' ? item.title.slice(0, 160) : '',
      joinedAt: typeof item.joinedAt === 'string' ? item.joinedAt.slice(0, 64) : '',
    });
  }

  return {
    memberships,
    truncated: result.truncated === true || result.memberships.length > MAX_MEMBERSHIPS,
  };
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [membershipError, setMembershipError] = useState<string | null>(null);
  const [memberships, setMemberships] = useState<TenantMembershipSummary[]>([]);
  const [selectedMembership, setSelectedMembership] = useState<TenantMembershipSummary | null>(null);
  const [membershipsTruncated, setMembershipsTruncated] = useState(false);
  const requestSequence = useRef(0);

  const discoverMemberships = useCallback(async (currentUser: User) => {
    const requestId = ++requestSequence.current;
    setLoading(true);
    setMembershipError(null);
    setMemberships([]);
    setSelectedMembership(null);
    setMembershipsTruncated(false);

    try {
      const listMemberships = httpsCallable<Record<string, never>, ListMyTenantMembershipsResult>(
        functions,
        'listMyTenantMemberships'
      );
      const response = await listMemberships({});

      if (
        requestId !== requestSequence.current ||
        auth.currentUser?.uid !== currentUser.uid
      ) {
        return;
      }

      const parsed = parseMemberships(response.data);
      setMemberships(parsed.memberships);
      setMembershipsTruncated(parsed.truncated);
      setSelectedMembership(parsed.memberships[0] ?? null);
    } catch {
      if (
        requestId !== requestSequence.current ||
        auth.currentUser?.uid !== currentUser.uid
      ) {
        return;
      }

      // Fail closed: a discovery failure must never become a default tenant or
      // default administrator role.
      setMemberships([]);
      setSelectedMembership(null);
      setMembershipsTruncated(false);
      setMembershipError(
        'Unable to verify your active organization memberships. No organization data has been loaded.'
      );
    } finally {
      if (
        requestId === requestSequence.current &&
        auth.currentUser?.uid === currentUser.uid
      ) {
        setLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      const authenticatedUser = currentUser && !currentUser.isAnonymous ? currentUser : null;
      ++requestSequence.current;
      setUser(authenticatedUser);
      setMembershipError(null);
      setMemberships([]);
      setSelectedMembership(null);
      setMembershipsTruncated(false);

      if (!authenticatedUser) {
        setLoading(false);
        return;
      }

      void discoverMemberships(authenticatedUser);
    });

    return unsubscribe;
  }, [discoverMemberships]);

  const setTenantId = useCallback((id: string) => {
    setSelectedMembership((current) => {
      const authorizedMembership = memberships.find((membership) => membership.id === id);
      return authorizedMembership ?? current;
    });
  }, [memberships]);

  const loginWithEmail = async (email: string, pass: string) => {
    setLoading(true);
    setMembershipError(null);
    try {
      await signInWithEmailAndPassword(auth, email.trim(), pass);
    } catch (error) {
      setLoading(false);
      throw error;
    }
  };

  const loginDevUser = async (role: string) => {
    if (!devPersonasEnabled) {
      throw new Error('Development personas are disabled.');
    }

    const configuredPersonaEmails: Readonly<Record<string, string | undefined>> = {
      tenant_admin: process.env.NEXT_PUBLIC_DEV_PERSONA_TENANT_ADMIN_EMAIL,
      compliance_manager: process.env.NEXT_PUBLIC_DEV_PERSONA_COMPLIANCE_MANAGER_EMAIL,
      security_manager: process.env.NEXT_PUBLIC_DEV_PERSONA_SECURITY_MANAGER_EMAIL,
      privacy_manager: process.env.NEXT_PUBLIC_DEV_PERSONA_PRIVACY_MANAGER_EMAIL,
      ai_governance_manager: process.env.NEXT_PUBLIC_DEV_PERSONA_AI_GOVERNANCE_MANAGER_EMAIL,
      approver: process.env.NEXT_PUBLIC_DEV_PERSONA_APPROVER_EMAIL,
      auditor: process.env.NEXT_PUBLIC_DEV_PERSONA_AUDITOR_EMAIL,
      contributor: process.env.NEXT_PUBLIC_DEV_PERSONA_CONTRIBUTOR_EMAIL,
    };
    const email = configuredPersonaEmails[role];
    const password = process.env.NEXT_PUBLIC_DEV_PERSONA_PASSWORD;
    if (!email || !password) {
      throw new Error('Unknown or unconfigured development persona.');
    }

    await loginWithEmail(email, password);
  };

  const refreshMemberships = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser || currentUser.isAnonymous) {
      setMembershipError(null);
      setMemberships([]);
      setSelectedMembership(null);
      return;
    }
    await discoverMemberships(currentUser);
  };

  const logout = async () => {
    ++requestSequence.current;
    setLoading(true);
    setMembershipError(null);
    setMemberships([]);
    setSelectedMembership(null);
    setMembershipsTruncated(false);

    try {
      await signOut(auth);
    } catch (error) {
      const currentUser = auth.currentUser;
      if (currentUser && !currentUser.isAnonymous) {
        setUser(currentUser);
        await discoverMemberships(currentUser);
      } else {
        setLoading(false);
      }
      throw error;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        membershipError,
        tenantId: selectedMembership?.id ?? '',
        setTenantId,
        userRole: selectedMembership?.role ?? null,
        availableTenants: memberships,
        membershipsTruncated,
        devPersonasEnabled,
        loginWithEmail,
        loginDevUser,
        refreshMemberships,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider.');
  }
  return context;
};

/**
 * euroGovernance - Sovereign Onboarding & First-Run State Model
 */

import { UserRole } from './core.js';

export type UserOnboardingStatus = 'not_started' | 'in_progress' | 'completed' | 'dismissed';

export type TenantProvisioningStatus = 'provisioning' | 'setup_pending' | 'active' | 'archived';

export interface OnboardingStepDefinition {
  id: string;
  stepIndex: number;
  title: string;
  subtitle: string;
  icon: string;
  targetTab: string;
  requiredRole?: UserRole[];
  dependsOn?: string[];
  isMutating: boolean;
  complianceImpact: string;
  recommendedActionLabel: string;
}

export interface UserOnboardingProgress {
  userId: string;
  tenantId: string;
  role: UserRole;
  status: UserOnboardingStatus;
  currentStepId: string;
  currentStepIndex: number;
  completedStepIds: string[];
  totalSteps: number;
  stepData?: Record<string, unknown>;
  hasDismissedBanner: boolean;
  startedAt: string;
  completedAt?: string | null;
  lastActiveAt: string;
}

export interface TenantOnboardingBaseline {
  tenantId: string;
  status: TenantProvisioningStatus;
  isFullyProvisioned: boolean;
  legalEntityName: string;
  headquartersCountry: string; // ISO 3166-1 alpha-2
  cloudRegionScope: string;
  adoptedFrameworkIds: string[];
  fourEyesPolicyEnforced: boolean;
  mandatorySetupFlags: {
    orgProfileConfigured: boolean;
    frameworksAdopted: boolean;
    scopingCompleted: boolean;
    controlsInstantiated: boolean;
    leadsInvited: boolean;
    policiesBaselineConfigured: boolean;
  };
  provisionedAt: string;
  provisionedBy: string;
  updatedAt: string;
}

export interface OnboardingAnalyticsEvent {
  eventName:
    | 'onboarding_started'
    | 'onboarding_step_viewed'
    | 'onboarding_step_completed'
    | 'onboarding_dismissed'
    | 'onboarding_resumed'
    | 'onboarding_completed'
    | 'genesis_launch_triggered';
  tenantId: string;
  userId: string;
  role: UserRole;
  stepId?: string;
  stepIndex?: number;
  durationSeconds?: number;
  timestamp: string;
  metadata?: Record<string, unknown>;
}

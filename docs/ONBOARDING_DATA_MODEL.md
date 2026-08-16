---
title: Onboarding Data Model & Persistence Schema
status: implemented
last_verified: 2026-08-16
tags:
  - onboarding
  - data_model
  - firestore
  - schemas
---

# Onboarding Data Model & Persistence Schema

```
/tenants/{tenantId}                                  <-- Root tenant metadata & baseline status
  │
  ├── /onboarding_state/{userId}                     <-- Per-user, per-role onboarding state
  │     ├── userId: string
  │     ├── tenantId: string
  │     ├── role: UserRole
  │     ├── status: UserOnboardingStatus
  │     ├── currentStepId: string
  │     ├── currentStepIndex: number
  │     ├── completedStepIds: string[]
  │     ├── totalSteps: number
  │     ├── stepData: Map<string, any>
  │     ├── hasDismissedBanner: boolean
  │     ├── startedAt: ISO-8601 string
  │     ├── completedAt: ISO-8601 string | null
  │     └── lastActiveAt: ISO-8601 string
  │
  └── /audit_logs/{logId}                            <-- Immutable append-only audit trail
```

---

## 1. TypeScript Interfaces & Enums

```typescript
// packages/shared-types/src/onboarding.ts

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
  headquartersCountry: string; // ISO 3166-1 alpha-2 (e.g. 'DE')
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
```

---

## 2. Field Definitions & Allowed Values

| Field | Type | Allowed Values / Constraints | Purpose |
| :--- | :--- | :--- | :--- |
| `userId` | `string` | Matches Firebase Auth `request.auth.uid` | Document ID & ownership key |
| `tenantId` | `string` | Matches parent `/tenants/{tenantId}` path | Strict multi-tenant scoping |
| `role` | `string` | `'tenant_admin'`, `'compliance_manager'`, `'privacy_manager'`, `'ai_governance_manager'`, `'security_manager'`, `'auditor'`, `'contributor'` | Determines active step sequence |
| `status` | `string` | `'not_started'`, `'in_progress'`, `'completed'`, `'dismissed'` | Lifecycle state |
| `currentStepId`| `string` | Valid step ID from `PERSONA_ONBOARDING_FLOWS` | Active step tracking |
| `currentStepIndex` | `number` | `0 <= index < totalSteps` | Zero-indexed stepper progress |
| `completedStepIds` | `string[]` | Array of completed unique step IDs | Progress calculation |
| `hasDismissedBanner` | `boolean` | `true` \| `false` | Controls banner visibility |
| `startedAt` | `string` | Valid ISO-8601 timestamp | Funnel analytics |
| `completedAt` | `string \| null` | Valid ISO-8601 timestamp or `null` | Completion milestone |

---

## 3. Example Redacted Firestore Document Payloads

### Example 1: Active In-Progress Admin Onboarding
```json
{
  "userId": "usr_admin_01",
  "tenantId": "tenant_eurocorp_de",
  "role": "tenant_admin",
  "status": "in_progress",
  "currentStepId": "admin_scoping_rules",
  "currentStepIndex": 2,
  "completedStepIds": [
    "admin_org_profile",
    "admin_framework_scope"
  ],
  "totalSteps": 5,
  "hasDismissedBanner": false,
  "stepData": {
    "legalName": "EuroCorp Technologies SE",
    "country": "DE",
    "cloudRegion": "europe-west3",
    "selectedFrameworks": ["eu_gdpr", "iso_27001_2022", "eu_ai_act"]
  },
  "startedAt": "2026-08-16T13:40:00.000Z",
  "completedAt": null,
  "lastActiveAt": "2026-08-16T13:42:30.000Z"
}
```

### Example 2: Completed Specialist Onboarding (Privacy Lead)
```json
{
  "userId": "usr_dpo_01",
  "tenantId": "tenant_eurocorp_de",
  "role": "privacy_manager",
  "status": "completed",
  "currentStepId": "dpo_dpa_audit",
  "currentStepIndex": 2,
  "completedStepIds": [
    "dpo_ropa",
    "dpo_transfers",
    "dpo_dpa_audit"
  ],
  "totalSteps": 3,
  "hasDismissedBanner": true,
  "startedAt": "2026-08-16T13:41:00.000Z",
  "completedAt": "2026-08-16T13:43:15.000Z",
  "lastActiveAt": "2026-08-16T13:43:15.000Z"
}
```

---

## 4. Firestore Security Rules

```javascript
// firestore.rules (Lines 181–186)
match /onboarding_state/{onboardingUserId} {
  allow read: if isTenantMember(tenantId) && (request.auth.uid == onboardingUserId || isTenantAdmin(tenantId));
  allow create, update: if isTenantMember(tenantId) && (request.auth.uid == onboardingUserId || isTenantAdmin(tenantId));
  allow delete: if isTenantAdmin(tenantId);
}
```

---

## 5. Related Notes

* [[ONBOARDING_SYSTEM|Sovereign Onboarding System Architecture]]
* [[FIRESTORE_SCHEMA_AND_QUERIES|Firestore Schema & Query Architecture]]
* [[ONBOARDING_SECURITY_AND_AUTHORIZATION|Onboarding Security & Authorization Model]]
* [[AUDIT_LOG_DESIGN|Immutable Audit Log Subsystem]]

---

## 6. Verification Sources

* `packages/shared-types/src/onboarding.ts`
* `apps/web/src/app/onboarding/use-onboarding.ts`
* `firestore.rules` (Lines 181–186)
* `tests/rules/onboarding-flow-and-rules.test.ts`

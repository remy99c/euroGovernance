---
title: Onboarding Security & Authorization Model
status: implemented
last_verified: 2026-08-16
tags:
  - onboarding
  - security
  - authorization
  - firestore_rules
  - threat_model
---

# Onboarding Security & Authorization Model

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                               SOVEREIGN SECURITY BOUNDARIES                            │
├──────────────────────────────────────────────────┬─────────────────────────────────────┤
│ CLIENT PRESENTATION LAYER (Untrusted)            │ CLOUD SECURITY RULES & FUNCTIONS    │
│ • Renders step wizards based on userRole         │ • Enforces membership path check    │
│ • Stores draft state in /onboarding_state/{uid}  │ • Restricts writes to authenticated │
│ • Provides scannable 5-Hub navigation            │ • Validates Four-Eyes segregation   │
│ • Optimistically shows/hides action buttons      │ • Appends immutable audit records   │
└──────────────────────────────────────────────────┴─────────────────────────────────────┘
```

---

## 1. Authentication & Membership Resolution

1. **Authentication Prerequisite**: All requests require a valid, non-expired Firebase Auth ID token (`request.auth.uid != null`).
2. **Tenant Membership Resolution**:
   * Security rules resolve the user's role and status by reading `/databases/(default)/documents/tenants/$(tenantId)/memberships/$(request.auth.uid)`.
   * If the membership document does not exist, or `status != 'active'`, all operations on `/tenants/{tenantId}/...` are rejected with `permission-denied`.

---

## 2. Client-Side UX Gating vs. Server-Side Authorization

> [!CAUTION]
> **Core Architectural Invariant**: Role-aware UI rendering in React is **strictly for user experience and cognitive hygiene**. Hiding a button in the browser client does **not** constitute security. Every write operation is independently verified by Firestore Security Rules or Cloud Function handlers.

### Separation Matrix:

| Domain Action | Client Presentation (UX Only) | Firestore Security Rule / Cloud Function (Enforced) |
| :--- | :--- | :--- |
| **Read Onboarding State** | Reads own `/onboarding_state/{uid}` | `allow read: if isTenantMember(tenantId) && (request.auth.uid == onboardingUserId \|\| isTenantAdmin(tenantId));` |
| **Update Onboarding Step** | Advances local state in `useOnboarding` | `allow write: if isTenantMember(tenantId) && (request.auth.uid == onboardingUserId \|\| isTenantAdmin(tenantId));` |
| **Control Creation** | Shows modal if role is Admin/Manager | `allow create: if hasAnyRole(tenantId, ['tenant_admin', 'compliance_manager', ...]) && validTenantScopedCreate(tenantId);` |
| **Four-Eyes Evidence Approval** | Shows "Approve" button | Cloud Function `approveEvidence` validates author $\ne$ approver and checks role. |
| **Audit Log Creation** | Displays live audit feed | `allow write: if false;` (Admin SDK backend execution only). |

---

## 3. Threat Model & Mitigations

| Threat Vector | Attack Scenario | Defense & System Mitigation |
| :--- | :--- | :--- |
| **Cross-Tenant State Tampering** | User in `tenant_beta` tries writing `/tenants/tenant_alpha/onboarding_state/usr_alice` | **Rejected**. `isTenantMember('tenant_alpha')` returns `false`. Firestore rules deny with PERMISSION_DENIED. |
| **Privilege Escalation via Client Modification** | Contributor modifies local state to claim `role: 'tenant_admin'` | **Rejected**. Cloud Functions verify role from `/memberships/{uid}` on Firestore server, ignoring client tokens. |
| **Self-Attestation Bypass** | Contributor attempts approving their own evidence artifact | **Rejected**. `approveEvidence` Cloud Function asserts `evidence.createdBy != request.auth.uid`. |
| **Audit Trail Deletion** | Malicious admin attempts deleting `/audit_logs` | **Rejected**. Rule `match /audit_logs/{id} { allow write: if false; }` blocks all client mutations. |

---

## 4. Related Notes

* [[ONBOARDING_SYSTEM|Sovereign Onboarding System Architecture]]
* [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules & Privileges Architecture]]
* [[ROLES_AND_PERMISSIONS|Role-Based Access Control (RBAC) Specification]]
* [[AUDIT_LOG_DESIGN|Immutable Audit Logging]]

---

## 5. Verification Sources

* `firestore.rules` (Lines 181–186)
* `functions/src/lib/auth-helpers.ts`
* `tests/rules/onboarding-flow-and-rules.test.ts`

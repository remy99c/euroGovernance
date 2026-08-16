---
title: Onboarding Operations, Troubleshooting & Support Guide
status: implemented
last_verified: 2026-08-16
tags:
  - onboarding
  - runbook
  - operations
  - troubleshooting
  - support
---

# Onboarding Operations, Troubleshooting & Support Guide

This guide provides operational diagnostic procedures, recovery workflows, and manual QA test checklists for the euroGovernance onboarding subsystem.

---

## 1. Common User States & Expected Behavior

| State | User Experience | Firestore Value (`/onboarding_state/{uid}`) | Recovery / Support Action |
| :--- | :--- | :--- | :--- |
| **New User First Login** | Top progress banner appears with Step 1 active | `status: 'not_started'` (or uninitialized) | User clicks *"Resume Setup ➔"* to launch wizard. |
| **Midway Setup Interruption** | Re-opens application on saved step | `status: 'in_progress'`, `currentStepIndex: n` | Automatically restores step index and draft form data. |
| **Dismissed Banner** | Banner unmounted from workspace | `hasDismissedBanner: true`, `status: 'dismissed'` | User can re-open wizard via topbar **"🚀 Onboarding Guide"**. |
| **Completed Onboarding** | Banner hidden; topbar shows "Replay Guide" | `status: 'completed'`, `completedAt: ISO-string` | Normal workspace operations active. |

---

## 2. Incomplete or Stuck Onboarding Recovery

1. **Symptom**: User encounters a permission error or network disconnect during wizard step.
   * **Root Cause**: Transient emulator disconnect or membership record not yet synced.
   * **Resolution**: The `useOnboarding` hook maintains local in-memory fallback state. Refreshing the browser triggers `onSnapshot` re-subscription.
2. **Safe Progress Reset**:
   * If a user or support engineer wishes to completely restart onboarding from Step 1, delete or update the document:
     ```bash
     # Via Firestore Admin SDK
     db.collection('tenants').doc(tenantId).collection('onboarding_state').doc(userId).set({
       status: 'not_started',
       currentStepIndex: 0,
       completedStepIds: [],
       hasDismissedBanner: false,
       startedAt: new Date().toISOString(),
       lastActiveAt: new Date().toISOString()
     }, { merge: true });
     ```

---

## 3. Role-Change & Tenant-Switching Behavior

* **Role Change Mid-Session**:
  * If a Tenant Admin alters a member's role from `compliance_manager` to `viewer`, the real-time auth context updates `userRole`.
  * `useOnboarding` re-computes `flowConfig` immediately, updating the visible checklist steps to match the new role.
* **Tenant Context Switching**:
  * Switching `tenantId` in the topbar dropdown unmounts the previous tenant's `onSnapshot` listener and re-subscribes to `/tenants/{newTenantId}/onboarding_state/{userId}`.

---

## 4. Manual QA Verification Checklists

### 4.1 👑 Tenant Admin Verification
- [ ] Sign in as `admin@eurocorp.de` on `http://localhost:3000`.
- [ ] Verify `OnboardingProgressBanner` appears at the top of the workspace.
- [ ] Click *"Resume Setup ➔"* — verify 5-step stepper loads with Org Baseline pre-populated.
- [ ] Advance through Frameworks, Scoping, Leads, and Policies.
- [ ] Click *"Complete & Launch"* — verify celebration notice and Firestore write to `/onboarding_state/usr_admin_01`.

### 4.2 ⚖️ Privacy Lead (DPO) Verification
- [ ] Switch role to `privacy_manager` via dev role switcher.
- [ ] Verify banner reflects **Statutory Privacy** badge and ROPA setup step.
- [ ] Click *"Set Up Article 30 ROPA"* — verify direct navigation to GDPR subsystem.

### 4.3 🔍 Auditor Verification
- [ ] Switch role to `auditor`.
- [ ] Verify banner reflects **Auditor Workspace** badge.
- [ ] Click *"Inspect Statement of Applicability"* — verify direct navigation to Coverage Dashboard.
- [ ] Verify mutation buttons are hidden in auditor views.

---

## 5. Related Notes

* [[ONBOARDING_SYSTEM|Sovereign Onboarding System Architecture]]
* [[ONBOARDING_SECURITY_AND_AUTHORIZATION|Onboarding Security & Authorization Model]]
* [[runbooks|Operational Runbooks]]

---

## 6. Verification Sources

* `apps/web/src/app/onboarding/use-onboarding.ts`
* `apps/web/src/app/page.tsx`
* `tests/rules/onboarding-flow-and-rules.test.ts`

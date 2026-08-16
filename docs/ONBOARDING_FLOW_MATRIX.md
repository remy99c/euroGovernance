---
title: Onboarding Flow Matrix
status: implemented
last_verified: 2026-08-16
tags:
  - onboarding
  - matrix
  - rbac
  - workflows
---

# Onboarding Flow Matrix

The following matrix is the canonical, implementation-derived mapping between authenticated user roles and their verified onboarding journeys in euroGovernance.

---

## Master Flow Comparison Matrix

| Role | Entry Condition | Default Landing | Onboarding Component | Verified Steps Shown | Completion Condition | Skip / Resume Behavior | Allowed Mutations | Required Backend Calls | Detailed Document |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **`tenant_admin`** | Active tenant membership with role `tenant_admin` | `/overview` | `OnboardingWizardModal` (Genesis Flow) | 1. Org Baseline<br>2. Framework Scope<br>3. Scoping Questions<br>4. Appoint Leads<br>5. Governance Policies | Reaching Step 5 and clicking *"🚀 Complete & Launch"* | Clicking `✕` dismisses banner; topbar *"🚀 Onboarding Guide"* reopens wizard at saved step | Full workspace mutations, control creation, member invites, policy toggles | `updateTenantProfile`, `adoptFramework`, `instantiateTenantFrameworkControls`, `inviteUserToTenant` | [[ONBOARDING_TENANT_ADMIN\|Tenant Admin Guide]] |
| **`compliance_manager`** | Active tenant membership with role `compliance_manager` | `/coverage_dashboard` | `OnboardingWizardModal` (Specialist Flow) | 1. Scoping Questionnaire<br>2. Applicability Decisions<br>3. Controls Review<br>4. SoA Export Dossier | Advancing through all 4 steps or clicking action button | Dismissible via banner `✕`; state auto-saved in `/onboarding_state/{uid}` | Framework adoption, scoping updates, applicability determinations | `adoptFramework`, `saveApplicabilityDecision`, `generateTenantEvidenceExport` | [[ONBOARDING_ROLE_BASED_FLOWS#1-compliance-manager\|Compliance Guide]] |
| **`privacy_manager`** | Active tenant membership with role `privacy_manager` | `/gdpr` | `OnboardingWizardModal` (Specialist Flow) | 1. Article 30 ROPA<br>2. Cross-Border TIAs<br>3. Article 28 DPA Audit | Completing Step 3 action | Dismissible via banner `✕`; resumable from topbar | ROPA creation, transfer assessment updates, breach logging | `createRopaActivity`, `saveTransferAssessment`, `generateTenantEvidenceExport` | [[ONBOARDING_ROLE_BASED_FLOWS#2-privacy-manager--dpo\|Privacy Guide]] |
| **`ai_governance_manager`** | Active tenant membership with role `ai_governance_manager` | `/ai_systems` | `OnboardingWizardModal` (Specialist Flow) | 1. Register AI Models<br>2. Art. 5 Prohibited Screening<br>3. Annex III High-Risk Classification | Completing Step 3 classification | Dismissible via banner `✕`; resumable from topbar | AI system registration, prohibited practices screening, risk tier determination | `classifyTenantAISystem`, `createAISystem`, `generateTenantEvidenceExport` | [[ONBOARDING_ROLE_BASED_FLOWS#3-ai-governance-manager\|AI Guide]] |
| **`security_manager`** | Active tenant membership with role `security_manager` | `/processor_hub` | `OnboardingWizardModal` (Specialist Flow) | 1. Processor Roster Setup<br>2. Dispatch Due Diligence<br>3. Upload Master Certs | Completing Step 3 certificate deposit | Dismissible via banner `✕`; resumable from topbar | Processor management, assessment dispatch, certification vault updates | `createProcessorProfile`, `sendProcessorAssessment`, `createCertification` | [[ONBOARDING_ROLE_BASED_FLOWS#4-security-manager--ciso\|Security Guide]] |
| **`auditor`** | Active tenant membership with role `auditor` | `/overview` | `OnboardingWizardModal` (Specialist Flow) | 1. SoA Scoping Review<br>2. Cryptographic Sampling<br>3. Compile Complete Audit ZIP | Completing Step 3 export compilation | Dismissible via banner `✕`; resumable from topbar | Read-only across registers; one-click export package compilation | `generateTenantEvidenceExport` | [[ONBOARDING_ROLE_BASED_FLOWS#5-independent-auditor\|Auditor Guide]] |
| **`contributor`** | Active tenant membership with role `contributor` | `/evidence` | `OnboardingWizardModal` (Specialist Flow) | 1. Review Assigned Queue<br>2. Upload Evidence with SHA-256 | Completing Step 2 evidence upload | Dismissible via banner `✕`; resumable from topbar | Task status updates, evidence upload with client-side SHA-256 (Cannot self-approve) | `createEvidenceArtifact` (Storage upload) | [[ONBOARDING_ROLE_BASED_FLOWS#6-contributor--control-owner\|Contributor Guide]] |

---

## Related Notes

* [[ONBOARDING_SYSTEM|Sovereign Onboarding System Architecture]]
* [[ONBOARDING_TENANT_ADMIN|Tenant Admin Genesis Setup Documentation]]
* [[ONBOARDING_ROLE_BASED_FLOWS|Specialist Role Onboarding Flows]]
* [[ONBOARDING_DATA_MODEL|Onboarding Data Model & Firestore Schema]]
* [[ROLES_AND_PERMISSIONS|Role-Based Access Control (RBAC) Specification]]

---

## Verification Sources

* `apps/web/src/app/onboarding/persona-flows.ts`
* `apps/web/src/app/onboarding/use-onboarding.ts`
* `apps/web/src/app/page.tsx`
* `tests/rules/onboarding-flow-and-rules.test.ts`

---
title: Specialist Role Onboarding Flows
status: implemented
last_verified: 2026-08-16
tags:
  - onboarding
  - specialist_roles
  - rbac
  - workflows
---

# Specialist Role Onboarding Flows

This document details the implemented first-run onboarding experiences for all specialist personas in euroGovernance.

---

## 1. Compliance Manager (`compliance_manager`)

* **First Useful Action**: Complete the 8-question scoping questionnaire and review applicability determinations for the Statement of Applicability (SoA).
* **Entry Condition**: Active membership with `role: 'compliance_manager'`.
* **Default Landing Route**: 📊 **Executive & Posture $\to$ Framework Coverage** (`/coverage_dashboard`).
* **Components Used**:
  * [`apps/web/src/app/onboarding/onboarding-wizard-modal.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/onboarding/onboarding-wizard-modal.tsx)
  * [`apps/web/src/app/views/controls-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/controls-tab-view.tsx)
  * [`apps/web/src/app/applicability-review.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/applicability-review.tsx)
* **Verified Steps Shown**:
  1. `comp_scoping`: Operational Scoping Questionnaire
  2. `comp_exclusions`: Applicability Determinations & Exclusions
  3. `comp_controls_review`: Unified Controls Inventory Inspection
  4. `comp_export_dossier`: Statement of Applicability Pre-flight Scan
* **Permissions**: Mutation-capable for applicability determinations, framework scoping, and export compilation.
* **Empty State**: Displays *No Scoping Determinations Recorded* with CTA *[ Run Scoping & Applicability Wizard ➔ ]*.

---

## 2. Privacy Manager / DPO (`privacy_manager`)

* **First Useful Action**: Initialize the GDPR Article 30 ROPA inventory and map high-risk cross-border data transfers.
* **Entry Condition**: Active membership with `role: 'privacy_manager'`.
* **Default Landing Route**: ⚖️ **Statutory Registers $\to$ GDPR & Privacy** (`/gdpr`).
* **Components Used**:
  * [`apps/web/src/app/views/gdpr-privacy-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/gdpr-privacy-tab-view.tsx)
  * [`apps/web/src/app/processor-transfers-manager.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/processor-transfers-manager.tsx)
  * [`apps/web/src/app/processor-governance-hub.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/processor-governance-hub.tsx)
* **Verified Steps Shown**:
  1. `dpo_ropa`: Article 30 Processing Activities Setup
  2. `dpo_transfers`: Cross-Border Data Flow Mapping (TIAs)
  3. `dpo_dpa_audit`: Article 28 DPA Verification
* **Permissions**: Mutation-capable for ROPA activities, transfer impact assessments, and breach incident records.
* **Empty State**: Displays *No Article 30 Processing Activities Documented* with CTA *[ Create Processing Activity from Template ➔ ]*.

---

## 3. AI Governance Manager (`ai_governance_manager`)

* **First Useful Action**: Register initial foundation AI models and execute Article 5 prohibited practice screening.
* **Entry Condition**: Active membership with `role: 'ai_governance_manager'`.
* **Default Landing Route**: ⚖️ **Statutory Registers $\to$ EU AI Act Register** (`/ai_systems`).
* **Components Used**:
  * [`apps/web/src/app/views/ai-systems-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/ai-systems-tab-view.tsx)
  * [`apps/web/src/app/modals/classify-ai-modal.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/modals/classify-ai-modal.tsx)
* **Verified Steps Shown**:
  1. `ai_register`: Register Foundation AI Models
  2. `ai_screening`: Article 5 Prohibited Practice Screening
  3. `ai_annex_three`: Annex III High-Risk Classification
* **Backend Callable**: Invokes `classifyTenantAISystem` Cloud Function with screening booleans.
* **Empty State**: Displays *No AI Systems Registered in Catalog* with CTA *[ Register First AI System ➔ ]*.

---

## 4. Security Manager / CISO (`security_manager`)

* **First Useful Action**: Import critical cloud infrastructure suppliers, dispatch due diligence questionnaires, and upload master certs.
* **Entry Condition**: Active membership with `role: 'security_manager'`.
* **Default Landing Route**: 🛡️ **Vendors & Third Parties $\to$ Processor Hub** (`/processor_hub`).
* **Components Used**:
  * [`apps/web/src/app/processor-governance-hub.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/processor-governance-hub.tsx)
  * [`apps/web/src/app/processor-assessment-workspace.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/processor-assessment-workspace.tsx)
  * [`apps/web/src/app/certifications-manager.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/certifications-manager.tsx)
* **Verified Steps Shown**:
  1. `sec_import_processors`: Core Processor Roster Setup
  2. `sec_dispatch_assessment`: Dispatch Due Diligence Assessment
  3. `sec_cert_vault`: Upload Master Certifications
* **Permissions**: Full write authority over processor profiles, assessment dispatches, and certificate deposits.
* **Empty State**: Displays *No Third-Party Processors Registered* with CTA *[ + Register Critical Processor ➔ ]*.

---

## 5. Independent Auditor (`auditor`)

* **First Useful Action**: Sample cryptographic evidence artifacts and export complete audit archives.
* **Entry Condition**: Active membership with `role: 'auditor'`.
* **Default Landing Route**: 📊 **Executive & Posture $\to$ Executive Overview** (`/overview`).
* **Components Used**:
  * [`apps/web/src/app/views/overview-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/overview-tab-view.tsx)
  * [`apps/web/src/app/views/evidence-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/evidence-tab-view.tsx)
  * [`apps/web/src/app/views/exports-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/exports-tab-view.tsx)
* **Verified Steps Shown**:
  1. `audit_soa_inspect`: Statement of Applicability Review
  2. `audit_evidence_sample`: Cryptographic Evidence Sampling (SHA-256)
  3. `audit_export_archive`: Compile Complete Audit ZIP
* **Permissions**: Strict Read-Only across all registers. Allowed mutation is invoking `generateTenantEvidenceExport`.

---

## 6. Contributor / Control Owner (`contributor`)

* **First Useful Action**: Inspect assigned controls queue and upload evidence artifacts with verified SHA-256 checksums.
* **Entry Condition**: Active membership with `role: 'contributor'`.
* **Default Landing Route**: ⚙️ **Operations & Audit $\to$ Evidence Repository** (`/evidence`).
* **Components Used**:
  * [`apps/web/src/app/views/evidence-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/evidence-tab-view.tsx)
  * [`apps/web/src/app/views/risks-tasks-tab-view.tsx`](file:///Users/remon/Documents/euroGovernance/apps/web/src/app/views/risks-tasks-tab-view.tsx)
* **Verified Steps Shown**:
  1. `contrib_queue`: Review Assigned Controls Queue
  2. `contrib_upload`: Upload Evidence with Cryptographic Hash
* **Permissions**: Permitted to create evidence items in `in_review` status; strictly forbidden from self-approving under Four-Eyes rules.

---

## 7. Related Notes

* [[ONBOARDING_SYSTEM|Sovereign Onboarding System Architecture]]
* [[ONBOARDING_FLOW_MATRIX|Onboarding Flow Matrix]]
* [[ROLES_AND_PERMISSIONS|Role-Based Access Control (RBAC) Specification]]
* [[EVIDENCE_MODULE_DESIGN|Evidence Repository & Four-Eyes Verification]]

---

## 8. Verification Sources

* `apps/web/src/app/onboarding/persona-flows.ts`
* `apps/web/src/app/onboarding/onboarding-wizard-modal.tsx`
* `apps/web/src/app/page.tsx`
* `tests/rules/onboarding-flow-and-rules.test.ts`

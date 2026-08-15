# euroGovernance — UI/UX Improvement Plan & Persona Onboarding Architecture
**Date**: 2026-08-15  
**Version**: `0.1.0`  
**Scope**: Frontend Architecture (`apps/web`), Next.js 14 Navigation, Information Architecture (IA), Persona-Based First-Time Onboarding, and Accessible Component System.

---

## 🗺️ Obsidian Knowledge Graph Navigation
- **Upstream Hub**: [[INDEX|Knowledge Hub Index]]
- **Related Governance & Role Specifications**:
  - [[ROLES_AND_PERMISSIONS|Role-Based Access Control (RBAC) Specification]]
  - [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant Model & Identity Provisioning Flows]]
  - [[FRAMEWORK_ADOPTION_SCOPING_AND_HARMONIZATION|Dynamic Scoping & Control Harmonization]]
  - [[THIRD_PARTY_ASSESSMENT_AND_QUESTIONNAIRE_MODULE|Third-Party Questionnaire Assessment Subsystem]]
  - [[ai Guide 2026-08-15|AI Agent Platform & Engineering Guide]]

---

## 🧭 1. Executive Problem Diagnosis: Why the Current UI Feels Overwhelming

While `euroGovernance` possesses an **enterprise-grade, mathematically verified backend** (74 passing test suites, strict multi-tenant isolation, and immutable audit trails), the current frontend user experience suffers from **severe cognitive overload, visual fragmentation, and zero guided onboarding**.

```mermaid
graph TD
    subgraph CurrentFlaws ["Current UI/UX Friction Points"]
        F1["<b>17 Flat Sidebar Tabs</b><br>No domain grouping or visual hierarchy"]
        F2["<b>Cognitive Overload</b><br>All features exposed to all users regardless of role"]
        F3["<b>Native Browser Prompts</b><br>window.prompt() & window.confirm() breaking immersion"]
        F4["<b>Zero Onboarding Guidance</b><br>New users dropped into empty, unguided dashboards"]
    end

    subgraph ProposedSolutions ["Target Modernized Architecture"]
        S1["<b>5 Grouped Navigation Hubs</b><br>Collapsible, intuitive domain structure"]
        S2["<b>Role-Tailored Workspaces</b><br>Adaptive views filtered by RBAC persona"]
        S3["<b>Accessible Modal & Drawer Components</b><br>Polished forms with live validation"]
        S4["<b>First-Time Onboarding Wizard</b><br>Guided setup tailored from Admin to Auditor"]
    end

    CurrentFlaws ==> ProposedSolutions
```

### Key UI/UX Friction Drivers:
1. **Flat, Unstructured Navigation (17 Simultaneous Sidebar Tabs)**:
   - Sidebar displays 17 flat buttons with no grouping.
   - **6 separate tabs** exist for vendor functions alone (`processor_inventory`, `processor_assurance_inventory`, `processor_assessments`, `processor_hub`, `processor_transfers`, `certifications`).
   - **4 separate tabs** exist for frameworks/controls (`frameworks`, `coverage_dashboard`, `applicability_review`, `controls`).
2. **Persona Blindness**:
   - An **Auditor** (who only needs to inspect evidence and read scoped controls) is exposed to the exact same noisy sidebar as a **Tenant Admin**.
   - A **Contributor** (who only needs to upload an assigned policy or cert) is overwhelmed with AI Act risk classification matrices and TIA transfer forms.
3. **Disruptive Browser Native Dialogs**:
   - Core actions (Adopting frameworks, creating controls, inviting colleagues, evidence approval sign-offs, AI classification) trigger ugly browser `window.prompt()` and `window.confirm()` popups instead of modern, accessible modal dialogs or slide-over drawers.
4. **"Empty Canvas" Syndrome (No Onboarding Guidance)**:
   - When a new tenant or user signs in for the first time, they are dropped into an empty overview dashboard with zero guidance on where to start or what to do next.

---

## 🏛️ 2. Proposed Information Architecture: 17 Tabs $\to$ 5 Logical Hubs

We consolidate the 17 flat tabs into **5 logical, collapsible navigation clusters**, with global quick-search and contextual breadcrumbs:

```
┌──────────────────────────────────────────────────────────────────────────────┐
│  euroGovernance  [EuroCorp Technologies SE ▾]  [🔍 Search / Cmd+K] [👤 Role] │
├────────────────────────────┬─────────────────────────────────────────────────┤
│ 📊 EXECUTIVE & POSTURE     │ Breadcrumb: Frameworks & Controls > Controls   │
│   • Executive Overview     ├─────────────────────────────────────────────────┤
│   • Framework Coverage     │                                                 │
│                            │                                                 │
│ 📐 FRAMEWORKS & CONTROLS   │               MAIN WORKSPACE AREA               │
│   • Framework Library      │                                                 │
│   • Scoping & Applicability│                                                 │
│   • Unified Controls Engine│                                                 │
│                            │                                                 │
│ 🛡️ VENDORS & THIRD PARTIES │                                                 │
│   • Processor Hub & Roster │                                                 │
│   • Due Diligence & Portals│                                                 │
│   • Transfer Impact (TIAs) │                                                 │
│   • Assurance & Certs      │                                                 │
│                            │                                                 │
│ ⚖️ STATUTORY REGISTERS     │                                                 │
│   • GDPR & Privacy (ROPA)  │                                                 │
│   • EU AI Act Register     │                                                 │
│   • EU Data Act Sharing    │                                                 │
│                            │                                                 │
│ ⚙️ OPERATIONS & AUDIT      │                                                 │
│   • Evidence Repository    │                                                 │
│   • Risks & Tasks Register │                                                 │
│   • Compliance Exports     │                                                 │
│   • Team & RBAC / Audit    │                                                 │
└────────────────────────────┴─────────────────────────────────────────────────┘
```

### Structural Consolidation Map:

| New Consolidated Hub | Merged Sub-Tabs | Target User Goal |
|---|---|---|
| **📊 Executive & Posture** | `overview`, `coverage_dashboard` | High-level compliance health, framework maturity, gap alerts, and executive reporting. |
| **📐 Frameworks & Controls** | `frameworks` (wizard), `applicability_review`, `controls` | Step-by-step framework adoption, scoping questionnaires, and unified control inventory. |
| **🛡️ Vendors & Third Parties** | `processor_hub`, `processor_inventory`, `processor_assessments`, `processor_transfers`, `processor_assurance_inventory`, `certifications` | End-to-end third-party lifecycle: directory, magic link questionnaires, TIAs, and SOC/ISO certificates. |
| **⚖️ Statutory Registers** | `gdpr` (ROPA, DPIA, Breaches), `ai_systems`, `data_act` | Specialized statutory obligation registers and Article-specific workflows. |
| **⚙️ Operations & Audit** | `evidence`, `risks_tasks`, `exports`, `members`, `audit_logs` | Operational evidence lockers, four-eyes approvals, team permissions, and immutable audit trails. |

---

## 🚀 3. Persona-Based First-Time User Onboarding Flows

To transform the initial user experience from overwhelming to guided, the platform implements a **Role-Specific Onboarding Flow** on first login.

```mermaid
graph TD
    LOGIN["User Logs In for First Time"] --> ROLE_DETECT{"Detect User Role"}

    ROLE_DETECT -->|"tenant_admin"| ONB_ADMIN["1. Admin Setup Wizard<br>(Org profile, Security Baseline, Team Invites)"]
    ROLE_DETECT -->|"compliance_manager"| ONB_COMP["2. Governance Setup Wizard<br>(Framework Adoption, Scoping, Controls)"]
    ROLE_DETECT -->|"security_manager"| ONB_SEC["3. Security & Vendor Wizard<br>(Key Processors, Assessment Templates)"]
    ROLE_DETECT -->|"privacy_manager"| ONB_DPO["4. Privacy & ROPA Wizard<br>(Article 30 Activities, DPA/TIA Baselines)"]
    ROLE_DETECT -->|"ai_governance_manager"| ONB_AI["5. AI Act Conformity Wizard<br>(AI Inventory, Risk Tier Classification)"]
    ROLE_DETECT -->|"auditor"| ONB_AUDIT["6. Auditor Inspection Tour<br>(Scoping rationale, Evidence locker, Exports)"]
    ROLE_DETECT -->|"contributor"| ONB_CONTRIB["7. Task & Evidence Inbox Tour<br>(Assigned tasks, upload guidance)"]
```

---

### 👑 Flow 1: Tenant Admin (`tenant_admin`)
**Primary Goal**: Establish organization baseline, configure security guardrails, and delegate team responsibilities.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🎉 Welcome to euroGovernance, Alex! Let's set up your organization.         │
│  Progress: [████████░░░░░░░░░░░░] Step 2 of 4                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  Step 1: Organization Baseline                                              │
│  ✓ Legal Entity: EuroCorp Technologies SE (Frankfurt Region)                │
│                                                                             │
│  Step 2: Core Regulatory Scope (Select Applicable Frameworks)               │
│  [✓] GDPR (Data Protection)        [✓] EU AI Act (AI Governance)           │
│  [✓] ISO/IEC 27001:2022 (Security) [ ] NIS2 Directive (Critical Supply)    │
│                                                                             │
│  Step 3: Invite Your Compliance & Security Leads                            │
│  ┌──────────────────────────────┬───────────────────────────────┐           │
│  │ Email Address                │ Role                          │           │
│  ├──────────────────────────────┼───────────────────────────────┤           │
│  │ sarah.dpo@eurocorp.de        │ Privacy Manager (DPO)         │           │
│  │ marcus.ciso@eurocorp.de      │ Security Manager              │           │
│  │ elena.ai@eurocorp.de         │ AI Governance Manager         │           │
│  └──────────────────────────────┴───────────────────────────────┘           │
│  [ + Add Another Colleague ]                                                │
│                                                                             │
│  Step 4: Security & Audit Policy                                            │
│  [✓] Enforce Four-Eyes Evidence Approval                                    │
│  [✓] Enforce Automated 30-Day Vendor Re-assessment Reminders                │
│                                                                             │
├─────────────────────────────────────────────────────────────────────────────┤
│  [ Back ]                                            [ Complete Setup ➔ ]   │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🛡️ Flow 2: Compliance & Security Manager (`compliance_manager`, `security_manager`)
**Primary Goal**: Complete dynamic scoping questionnaire, instantiate unified controls, and initiate vendor due diligence.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🚀 Governance Initialization Checklist                                     │
│  3 steps remaining to achieve initial compliance baseline                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  1. 📐 Run Scoping & Harmonization Wizard                                   │
│     Answer 8 operational questions to automatically filter non-applicable   │
│     controls across GDPR, ISO 27001, and NIS2.                              │
│     [ Start Scoping Wizard ➔ ]                                              │
│                                                                             │
│  2. 🏢 Import Critical Processors & Cloud Providers                         │
│     Import active data hosting, analytics, and AI infrastructure providers. │
│     [ Import Processors / CSV ➔ ]                                           │
│                                                                             │
│  3. 📝 Send First Due Diligence Questionnaire                               │
│     Select a pre-built GDPR Art. 28 template and generate a magic link.     │
│     [ Dispatch Assessment ➔ ]                                               │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### 🇪🇺 Flow 3: Privacy Manager / DPO (`privacy_manager`)
**Primary Goal**: Inventory processing activities (ROPA Art. 30), map cross-border transfers (TIAs), and verify DPA execution.

- **Step 1 (ROPA Baseline)**: Interactive wizard to register high-volume processing activities (e.g. Customer CRM, HR Payroll, Marketing Analytics).
- **Step 2 (Cross-Border Transfer Map)**: Visual transfer map highlighting non-EEA data flows (e.g. US cloud hosting) requiring Standard Contractual Clauses (SCCs) and Schrems II TIAs.
- **Step 3 (DPA & Subprocessor Verification)**: Checklist of active processors lacking executed Article 28 DPAs.

---

### 🤖 Flow 4: AI Governance Manager (`ai_governance_manager`)
**Primary Goal**: Inventory organizational AI systems and determine EU AI Act risk tiers.

- **Step 1 (AI System Registration)**: Register internal/vendor AI models (e.g., Customer Support LLM, Biometric ID, Resume Screener).
- **Step 2 (Risk Classification Engine)**: Automated questionnaire evaluating Prohibited Practices (Art. 5), High-Risk Annex III classifications, and Transparency obligations (Art. 50).
- **Step 3 (Annex IV Technical Documentation Tracker)**: Automatically creates compliance task checklist for High-Risk models prior to CE marking.

---

### 🔍 Flow 5: External / Internal Auditor (`auditor`)
**Primary Goal**: Read-only verification of scoped controls, evidence inspection, and audit package exports.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│  🔍 Auditor Review Workspace — Read-Only Assurance Mode                     │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│  • Scoping & Applicability Rationale:                                       │
│    Review deterministic exclusion notes and regulatory citations.           │
│                                                                             │
│  • Four-Eyes Verified Evidence Locker:                                      │
│    Filter evidence by framework control (e.g. ISO 27001 A.12 / GDPR Art 32).│
│                                                                             │
│  • Comprehensive Audit Package Export:                                      │
│    Download pre-compiled ZIP packages containing hashed evidence and logs.  │
│    [ Generate Full Audit Dossier (ZIP) ➔ ]                                  │
│                                                                             │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

### ✍️ Flow 6: Contributor / Task Assignee (`contributor`)
**Primary Goal**: Upload requested evidence, answer assigned control questionnaires, and track review status.

- **Personalized Action Inbox**: Displays only tasks assigned to the user (e.g. "Upload Q3 Disaster Recovery Test Summary for Control CTL-SEC-04").
- **Drag-and-Drop Uploader**: Direct file drop with SHA-256 preview and metadata tags.
- **Review Feedback**: Clear alert banners when an evidence file is approved or returned with revision instructions.

---

## 🎨 4. Modern Component & Interaction Upgrades

```mermaid
graph LR
    subgraph LegacyInteractions ["Legacy Interaction (Current)"]
        P1["window.prompt('Enter Control Code:')"]
        P2["window.confirm('Does this system use biometric AI?')"]
    end

    subgraph ModernComponents ["Modern Component Replacement"]
        C1["<b>Slide-Over Drawer Form</b><br>Rich input fields, validation & presets"]
        C2["<b>Interactive Decision Modal</b><br>Visual cards with regulatory explanations"]
    end

    P1 -.->|"Replace With"| C1
    P2 -.->|"Replace With"| C2
```

### 1. Slide-Over Drawers (Sheet Components)
- Replace `window.prompt()` for creating controls, inviting members, and adding processors.
- Slide-over panel allows viewing background context while filling out forms.

### 2. Command Palette (`Cmd + K` / `Ctrl + K`)
- Instant keyboard navigation across any control, vendor, processor, or evidence artifact.
- Jump directly to actions (e.g. `> Adopt ISO 27001`, `> Send Assessment to CloudAI`, `> Export ROPA`).

### 3. Global Status & Notification Center
- Slide-out notification drawer replacing full-screen alert banners.
- Live badge counters for overdue assessments and pending four-eyes approvals.

---

## 📅 5. UI/UX Modernization Roadmap & Action Plan

| Phase | Milestone | Expected Impact |
|:---:|---|---|
| **Phase 1<br>(Quick Wins)** | • Group 17 tabs into 5 collapsible sidebar sections.<br>• Replace `window.prompt()` / `window.confirm()` with accessible modal dialogs.<br>• Add `Cmd + K` search bar in header. | Eliminates immediate visual clutter; removes disruptive browser popups. |
| **Phase 2<br>(Onboarding)** | • Implement First-Time Login Persona Detection.<br>• Build the 4-step Admin Setup Wizard and 3-step Manager Checklist.<br>• Add empty-state illustrations with direct "Get Started" call-to-actions. | Drastically reduces time-to-value for new enterprise customers. |
| **Phase 3<br>(Polish)** | • Implement SWR/TanStack Query caching for snappy zero-latency page transitions.<br>• Add dark/light mode toggle with refined European sovereign color palette.<br>• Mobile-responsive drawer navigation. | Enterprise-grade aesthetic polish and responsiveness. |

---

## 🔗 Related Knowledge Graph Documents

- [[ROLES_AND_PERMISSIONS|Role-Based Access Control Specification]]
- [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant Model & Identity Provisioning Flows]]
- [[FRAMEWORK_ADOPTION_SCOPING_AND_HARMONIZATION|Dynamic Scoping & Control Harmonization]]
- [[THIRD_PARTY_ASSESSMENT_AND_QUESTIONNAIRE_MODULE|Third-Party Questionnaire Assessment Subsystem]]
- [[INDEX|Knowledge Vault Index]]

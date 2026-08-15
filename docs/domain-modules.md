# euroGovernance — Domain Modules & Regulatory Implementation

This document provides a comprehensive breakdown of all regulatory and management modules implemented within **euroGovernance**.

---

## 1. Module Implementation Summary

| Module Name | Regulatory / Standard Domain | Implementation Status | Primary Backend Handler | Frontend Interface |
|---|---|---|---|---|
| **Identity & Multi-Tenancy** | Core Platform Multi-Tenancy | **Implemented** | `handlers/tenants.ts` | Members & Invites Tab |
| **Audit Log Subsystem** | Platform Compliance & Traceability | **Implemented** | `handlers/audit.ts` + `lib/audit.ts` | Exports & Audit Logs Tab |
| **Controls Management** | Unified GRC Framework Engine | **Implemented** | `handlers/controls.ts` | Controls Tab |
| **Evidence Repository** | Unified GRC Evidence & Four-Eyes | **Implemented** | `handlers/evidence.ts` | Evidence Tab |
| **Policy Management** | Unified GRC Policy Lifecycle | **Implemented** | `handlers/policies.ts` | Controls / Policy Actions |
| **Risk & Remediation** | 5x5 Matrix Risk & Task Engine | **Implemented** | `handlers/risks.ts` | Risks & Tasks Tab |
| **Vendors & Assets** | Vendor Risk & Asset Criticality | **Implemented** | `handlers/vendors-and-assets.ts` | Controls / Vendor Actions |
| **Compliance Workflows** | Multi-step Approval State Machine | **Implemented** | `handlers/workflows.ts` | Workflows Engine |
| **GDPR Privacy Layer** | GDPR (ROPA, DPIA, TIA, Breaches, DSR) | **Implemented** | `handlers/gdpr.ts` | Dashboard & Data Management |
| **EU AI Act Engine** | EU AI Act (Art. 6, 9, 73) | **Implemented** | `handlers/ai-act.ts` | AI Act Governance Tab |
| **ISO Management Layer** | ISO/IEC 27001:2022 & ISO 42001:2023 | **Implemented** | `handlers/iso.ts` | ISO 27001 Management Tab |
| **Framework Adoption & Scoping** | Frameworks, Scoping & Harmonization | **Implemented** | `handlers/frameworks.ts` | Controls Tab / Framework Deck |
| **EU Data Act** | EU Data Act (B2B Data Sharing) | **Partially Implemented** | Direct Firestore CRUD + Schema | Shared Type Schema |

> [!NOTE]
> For the in-depth architectural audit and cross-framework harmonization roadmap, see [Frameworks, Scoping & Harmonization Audit Report (2026-08-14)](file:///Users/remon/Documents/euroGovernance/docs/framework-scoping-harmonization-audit-2026-08-14.md).

---

## 2. Core GRC Subsystem

### 2.1 Controls Management
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/controls/{controlId}`
- **Key Entities**:
  - `id`: Unique control ID (e.g. `ctl_access_mfa`).
  - `code`: Standardized code (e.g. `A.9.4.2`, `GDPR-ART32`).
  - `frameworks`: Array of framework codes mapped to this control (`iso_27001_2022`, `gdpr`, `eu_ai_act`).
  - `status`: Lifecycle status (`draft` → `implemented` → `under_review` → `archived`).
  - `reviewFrequency`: Review cadence (`monthly`, `quarterly`, `semi_annual`, `annual`).
  - `nextReviewDate`: ISO 8601 date string monitored by daily cron.
- **Key Workflows**:
  - `createControl`: Drafts new control with category and framework cross-mappings.
  - `updateControl`: Updates implementation notes, assigned owner, or cadence.
  - `archiveControl`: Soft-deletes / archives outdated controls.

### 2.2 Evidence Repository & Four-Eyes Principle
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/evidence/{evidenceId}`
- **Storage Path**: `/tenants/{tenantId}/evidence/{evidenceId}/{fileName}`
- **Key Entities**:
  - `id`: Evidence document ID.
  - `controlId`: Associated control ID.
  - `status`: Evidence review state (`under_review` → `approved` / `rejected` → `deprecated`).
  - `storagePath`: Cloud Storage reference URL / bucket path.
  - `fileHash`: SHA-256 integrity checksum.
  - `uploadedBy`: UID of the submitting contributor.
  - `approvedBy`: UID of the approving officer (enforced `approvedBy !== uploadedBy`).
  - `validUntil`: Evidence validity expiration date.
- **Key Workflows**:
  - `uploadEvidenceRecord`: Submits new evidence metadata and links uploaded storage artifact.
  - `approveEvidence`: Privileged Four-Eyes approval transitioning status to `approved`.
  - `rejectEvidence`: Rejects evidence with mandatory reason, resetting status to `rejected`.
  - `deprecateEvidence`: Deprecates stale or expired evidence.

### 2.3 Risk Assessment & Remediation Tasks
- **Status**: **Implemented**
- **Collections**: `/tenants/{tenantId}/risks` and `/tenants/{tenantId}/tasks`
- **Key Entities**:
  - `inherentLikelihood` / `inherentImpact`: 1–5 scale.
  - `inherentScore`: Computed severity product (`likelihood * impact`).
  - `residualLikelihood` / `residualImpact` / `residualScore`: Post-mitigation score.
  - `treatment`: Strategy (`mitigate`, `accept`, `transfer`, `avoid`).
  - `acceptedBy` / `acceptedAt`: Formal risk acceptance sign-off.
- **Key Workflows**:
  - `assessRiskScore`: Computes inherent and residual scores using standard 5x5 matrix.
  - `acceptRisk`: Formal risk acceptance with rationale and executive sign-off.
  - `createRemediationTask`: Creates actionable task with deadline and assignee.

---

## 3. GDPR Privacy Subsystem

### 3.1 Records of Processing Activities (ROPA — Article 30)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/ropa_entries/{ropaId}`
- **Key Fields**: `activityCode`, `dataCategory`, `legalBasis` (`consent`, `contract`, `legal_obligation`, `vital_interests`, `public_task`, `legitimate_interests`), `specialCategoryData` (boolean), `retentionPeriod`, `crossBorderTransfer` (boolean), `dpoApproved`.

### 3.2 Privacy Impact Assessments (DPIA — Article 35) & Transfer Impact Assessments (TIA)
- **Status**: **Implemented**
- **Collections**: `/tenants/{tenantId}/dpia_assessments` and `/tenants/{tenantId}/tia_assessments`
- **Key Fields**: `systemName`, `systemicRiskScore`, `mitigatingControls`, `dpoConsulted`, `supervisoryAuthorityNotified`, `status` (`draft` → `in_review` → `approved` → `rejected`).

### 3.3 Personal Data Breach Management (Articles 33 & 34)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/breaches/{breachId}`
- **Key Fields**: `incidentDate`, `discoveredDate`, `affectedRecordsCount`, `severity` (`low`, `medium`, `high`, `critical`), `supervisoryNotificationRequired` (boolean), `dpaNotifiedWithin72Hours` (boolean), `dataSubjectsNotified` (boolean).
- **Backend Alerting**: Dispatches urgent in-app notification to Privacy & Security Managers on breach creation.

### 3.4 Data Subject Rights (DSR — Chapter III)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/dsr_requests/{dsrId}`
- **Key Fields**: `requestType` (`access`, `rectification`, `erasure`, `restriction`, `portability`, `objection`), `requestDate`, `deadlineDate` (computed 30-day statutory window), `verificationStatus`, `status` (`received` → `in_progress` → `completed` → `rejected`).

---

## 4. EU AI Act Subsystem

### 4.1 AI Systems Register (Articles 6, 9 & Annex III)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/ai_systems/{systemId}`
- **Key Fields**:
  - `name`: AI model / system designation.
  - `riskTier`: Deterministically assigned risk classification (`prohibited`, `high_risk`, `limited_risk`, `minimal_risk`, `unclassified`).
  - `intendedPurpose`: Operational description.
  - `deploymentRole`: `provider`, `deployer`, `importer`, `distributor`.
  - `friaRequired`: Fundamental Rights Impact Assessment required flag.
  - `conformityAssessmentStatus`: `not_started`, `internal_control_in_progress`, `notified_body_review`, `certified`.
  - `ceMarkAffixed`: Boolean.

### 4.2 Automated AI Risk Classifier Engine
- **Status**: **Implemented** (`functions/src/handlers/ai-act.ts`)
- **Logic**: Evaluates system properties against statutory rules:
  - **Prohibited Risk (Art. 5)**: Cognitive behavioral manipulation, untargeted facial scraping, social scoring, biometric categorization for sensitive attributes.
  - **High Risk (Art. 6 & Annex III)**: Critical infrastructure, education/vocational admissions, employment/worker evaluation, essential private/public services (credit scoring), law enforcement, migration/border control.
  - **Limited Risk (Art. 50)**: Emotion recognition, generative AI / chatbots, deepfakes.
  - **Minimal Risk**: Standard optimization, spam filters, recommendation engines.

### 4.3 AI Incidents & Serious Malfunctions (Article 73)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/ai_incidents/{incidentId}`
- **Key Fields**: `systemId`, `incidentType` (`death_or_serious_harm`, `critical_infrastructure_disruption`, `fundamental_rights_breach`, `malfunction`), `severity`, `marketSurveillanceNotified` (boolean), `correctiveActionTaken`.
- **Backend Alerting**: Triggers high-priority notifications to AI Governance Leads.

### 4.4 Substantial Changes (Article 43(4)) & Post-Market Monitoring (Article 72)
- **Status**: **Implemented**
- **Collections**: `/tenants/{tenantId}/ai_systems/{id}/substantial_changes` and `/tenants/{tenantId}/ai_systems/{id}/post_market_logs`

---

## 5. ISO Management System Layer (ISO 27001:2022 & ISO 42001:2023)

### 5.1 Scopes & Measurable Objectives
- **Status**: **Implemented**
- **Collections**: `/tenants/{tenantId}/iso_scope_statements` and `/tenants/{tenantId}/iso_objectives`
- **Key Fields**: `standard` (`iso_27001_2022`, `iso_42001_2023`), `boundaries`, `targetDate`, `currentValue`, `targetValue`, `status`.

### 5.2 Statement of Applicability (SoA)
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/iso_soa_entries/{soaId}`
- **Key Fields**: `controlCode` (e.g. `A.5.1`), `applicable` (boolean), `justification`, `implementationStatus` (`implemented`, `in_progress`, `planned`, `not_applicable`), `evidenceReferences`.

### 5.3 Internal Audits & Findings
- **Status**: **Implemented**
- **Collections**: `/tenants/{tenantId}/iso_internal_audits` and subcollection `findings`
- **Key Fields**: `auditPlanCode`, `leadAuditorId`, `auditDates`, `scopeId`, `findings` (`major_nonconformity`, `minor_nonconformity`, `opportunity_for_improvement`), `correctiveActionDeadline`, `closedAt`.

### 5.4 Management Reviews
- **Status**: **Implemented**
- **Collection**: `/tenants/{tenantId}/iso_management_reviews/{reviewId}`
- **Key Fields**: `reviewDate`, `chairpersonId`, `inputsSummary`, `decisionsAndActions`, `signedOffByApprover` (boolean).

---

## 6. Operational Services & Export Engine

### 6.1 Materialized Summary Metrics
- **Status**: **Implemented** (`functions/src/handlers/metrics.ts`)
- **Collection**: `/tenants/{tenantId}/summary_metrics/current`
- **Calculated Metrics**: Total controls count, implemented controls count, compliance percentage, open risks count, high/critical risks count, pending evidence review count, unclassified AI systems count, pending DSR count, open audit findings count.

### 6.2 Compliance Export Jobs
- **Status**: **Implemented** (`functions/src/handlers/exports.ts`)
- **Collection**: `/tenants/{tenantId}/export_jobs/{jobId}`
- **Storage Output**: `/tenants/{tenantId}/exports/{jobId}/evidence_dossier.zip` or `readiness_report.json`
- **Supported Export Types**:
  - `evidence_pack`: Bundles metadata and download manifests for approved evidence.
  - `framework_readiness`: Generates structured compliance scorecards and gap analysis.

---

## 7. EU Data Act Subsystem

- **Status**: **Partially Implemented**
- **Current State**: Schema models defined in `packages/shared-types/src/data-act.ts`. Firestore security rules configured under `/data_act_assets` and `/data_sharing_requests`.
- **Planned / Roadmap**: Automated B2B data access request validation and cloud switching friction tracking.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Domain Modules**: [[GDPR_MODULE_DESIGN|GDPR Subsystem]], [[EU_AI_ACT_MODULE_DESIGN|EU AI Act Subsystem]], [[EU_DATA_ACT_MODULE_DESIGN|EU Data Act Subsystem]], [[ISO_MANAGEMENT_SYSTEM_DESIGN|ISO Management System]]
- **Governance & Controls**: [[FRAMEWORK_AND_CONTROLS_ENGINE|Framework & Controls Engine]], [[FRAMEWORK_ADOPTION_SCOPING_AND_HARMONIZATION|Scoping & Harmonization]]
- **Processors & Evidence**: [[PROCESSOR_AND_TRANSFER_MANAGEMENT|Processor & Transfer Management]], [[PROCESSOR_CERTIFICATIONS_AND_ASSURANCE|Processor Certifications]], [[EVIDENCE_MODULE_DESIGN|Evidence Module]]

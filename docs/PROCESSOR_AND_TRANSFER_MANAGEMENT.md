# Data Processor & International Transfer Governance

**Statutory Frameworks**: 
- **GDPR Article 28**: Processor and Subprocessor Obligations & Binding Data Processing Agreements (DPAs)
- **GDPR Chapter V (Articles 44–49)**: International & Restricted Personal Data Transfers to Third Countries
- **CJEU Schrems II (Case C-311/18) & EDPB Recommendations 01/2020**: Transfer Impact Assessments (TIAs) and Supplementary Measures

---

## 1. Vendor vs. Processor Profile Distinction

`euroGovernance` enforces a strict architectural separation between commercial supplier relationships and statutory data protection compliance obligations:

```
┌─────────────────────────────────────────────────────────────┐
│                      Commercial Master                      │
│        /tenants/{tenantId}/vendors/{vendorId}               │
│  - Legal Company Name, Incorporation Country, Contact Ops   │
│  - Vendor Category, Commercial Risk Tier, Active Status     │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 : N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│                  Privacy & Compliance Overlay               │
│  /tenants/{tenantId}/processor_profiles/{profileId}         │
│  - Article 28 Role (Data Processor vs Subprocessor)         │
│  - Processing Scope, Service Description, Data Categories   │
│  - Data Subjects, Special Category Flag, Jurisdictions      │
│  - DPA Execution Status, DPA Date, Linked DPA Evidence ID   │
│  - Review Cadence, Last/Next Review Dates, Criticality      │
│  - Linked System Asset IDs & Linked Risk Register IDs       │
└──────────────────────────────┬──────────────────────────────┘
                               │ 1 : N
                               ▼
┌─────────────────────────────────────────────────────────────┐
│             Cross-Border Transfer Arrangements              │
│ /tenants/{tenantId}/transfer_arrangements/{arrangementId}   │
│  - Destination Countries, Non-Adequate Third Country Flag   │
│  - Chapter V Transfer Mechanism & Mechanism Status          │
│  - Linked Schrems II TIA Assessment ID                      │
│  - Linked SCC / Transfer Evidence IDs                       │
│  - Supplementary Technical & Contractual TOMs Summary       │
└─────────────────────────────────────────────────────────────┘
```

### Key Differences

| Dimension | Vendor (`vendors`) | Processor Profile (`processor_profiles`) |
|---|---|---|
| **Primary Scope** | Commercial and procurement master entity. | Privacy, data protection, and GDPR Article 28 compliance overlay. |
| **Managed Attributes** | Vendor category, risk tier, incorporation country, billing/ops contacts. | Personal data categories, data subjects, special category data, DPA execution, review cadence. |
| **Multiplicity** | 1 vendor per supplier organization. | Multiple processor profiles can link to a single vendor for distinct service engagements. |
| **Governance Roles** | `tenant_admin`, `compliance_manager`, `security_manager`. | `privacy_manager` (DPO), `compliance_manager`, `tenant_admin`. |

---

## 2. Transfer Arrangement Model

A **Transfer Arrangement** (`/tenants/{tenantId}/transfer_arrangements/{arrangementId}`) captures discrete cross-border personal data flows originating from tenant systems to third countries or international organizations:

### Data Model Schema (`packages/shared-types/src/processors.ts`)

```typescript
export interface TransferArrangement extends BaseEntity {
  processorProfileId: string;       // Parent Processor Profile
  vendorId?: string;                // Parent Vendor
  name: string;                     // Descriptive name (e.g. 'US Backup Stream')
  restrictedTransfer: boolean;      // True if destination is non-EEA / non-adequate
  destinationCountries: string[];   // ISO 3166-1 alpha-2 country codes (e.g. ['US', 'IN'])
  eeaStatus: ThirdCountryEeaStatus; // 'adequate_third_country' | 'third_country_non_adequate' | ...
  transferScopes: TransferScopeType[]; // 'hosting' | 'support_access' | 'backup' | 'analytics' | ...
  transferMechanismType: TransferMechanismType; // 'standard_contractual_clauses' | 'adequacy_decision' | ...
  transferMechanismStatus: TransferMechanismStatus; // 'active_valid' | 'under_review' | 'expired' | ...
  effectiveDate: string;            // ISO timestamp
  reviewDueDate: string | null;     // Scheduled review date
  supplementaryMeasuresSummary: string; // Technical TOMs (KMS encryption, tokenization)
  subprocessorInvolvement: boolean; // Indicates downstream third-country onward transfers
  subprocessorsInvolved?: string[]; // Names of downstream entities
  linkedTiaId: string | null;       // Linked TIA assessment ID
  linkedEvidenceIds: string[];      // Executed SCCs / BCR proof IDs
  rationale: string | null;         // Commercial & technical justification
  notes: string | null;
  status: 'active' | 'under_review' | 'archived';
}
```

---

## 3. Transfer Mechanism Options & Chapter V Safeguards

Transfer arrangements must specify a recognized legal transfer mechanism under GDPR Articles 45–49:

| Mechanism Code | Statutory Basis | Operational Description | Mandatory Artifacts |
|---|---|---|---|
| `adequacy_decision` | GDPR Art. 45 | Official European Commission adequacy finding (e.g. UK, Switzerland, Japan, EU-US DPF). | Adequacy status record, certification verification. |
| `standard_contractual_clauses` | GDPR Art. 46(2)(c) | EU Commission Decision 2021/914 Standard Contractual Clauses (Modules 1–4). | Executed SCCs with Annex I & II + approved TIA. |
| `binding_corporate_rules` | GDPR Art. 47 | Lead DPA-approved intra-group BCRs for controllers or processors. | Approved BCR legal text and supervisory authority approval notice. |
| `derogation_art49` | GDPR Art. 49 | Exceptional derogation (explicit consent, vital interest, legal claims, occasional transfer). | Legal rationale and formal justification log. |
| `intra_group_agreement` | GDPR Art. 46(1) | Binding intra-group data transfer agreement with embedded standard clauses. | Counter-signed Intra-Group Agreement + TOMs Annex. |
| `no_mechanism_selected` | Non-Compliant | Placeholder indicating missing legal safeguard. | *Triggers critical compliance risk flag.* |

### Transfer Mechanism Status Lifecycle
- `draft`: Configuration in progress.
- `active_valid`: Executed, in effect, and verified.
- `under_review`: Undergoing periodic governance assessment.
- `expired`: Passed review or validity date without renewal.
- `superseded`: Replaced by an updated mechanism or contract version.
- `invalid_expired`: Invalidated by regulatory action or judicial decision.

---

## 4. Transfer Impact Assessment (TIA) Linkage & Schrems II Analysis

In compliance with CJEU *Schrems II* jurisprudence, restricted transfers to third countries without an adequacy decision require a completed **Transfer Impact Assessment** (`/tenants/{tenantId}/tia_assessments/{tiaId}`):

1. **Third-Country Legal Assessment**: Evaluates destination country public authority access laws (e.g. US FISA Section 702, EO 14086, Cloud Act) and the availability of effective judicial redress for data subjects.
2. **Supplementary Technical Measures (TOMs)**: Documents safeguards such as end-to-end client-held KMS encryption, pseudonymization prior to transmission, and multi-region key isolation.
3. **Supplementary Contractual Commitments**: Evaluates binding commitments by the importer to challenge unlawful government disclosure orders and notify the exporter.
4. **Traceability**: Bidirectional linking ensures that transfer arrangements (`linkedTiaId`), processor profiles (`processorProfileId`), and TIA records maintain complete mutual visibility.

---

## 5. Evidence Repository Linkage & Completeness Evaluation

Compliance artifacts are preserved in `/tenants/{tenantId}/evidence/{evidenceId}` and linked via typed entity references:

### Supported Evidence Categories
- `dpa`: Counter-signed Data Processing Agreement under Article 28(3).
- `scc`: Executed Standard Contractual Clauses (Module 1, 2, 3, or 4).
- `toms`: Technical and Organizational Security Measures schedule.
- `subprocessor_list`: Approved subprocessor roster and notification documentation.
- `soc_report` / `iso_certificate`: Third-party SOC 2 Type II or ISO/IEC 27001 certificates.
- `audit_report`: Independent supplier data protection audit report.

### Pure Completeness Evaluators
- **`evaluateProcessorEvidenceCompleteness(profile, evidenceList)`**:
  - Evaluates DPA presence if `dpaSigned === true`.
  - Evaluates Technical Security Assurance if criticality is `critical` or `high`.
- **`evaluateTransferEvidenceCompleteness(transfer, evidenceList)`**:
  - Evaluates SCC execution evidence if mechanism is `standard_contractual_clauses`.
  - Verifies artifact expiration against `reviewDueDate`.

---

## 6. Deterministic Risk Evaluation & Lifecycle Review Reminders

### 6.1 Pure Deterministic Risk Engine (`evaluateProcessorRiskFlags`)

The pure risk evaluator inspects processor profiles, transfer arrangements, and attached evidence to derive actionable compliance flags without side effects:

| Rule Code | Severity | Trigger Condition | Suggested Remediation |
|---|---|---|---|
| `RESTRICTED_TRANSFER_NO_MECHANISM` | **Critical** | `restrictedTransfer === true` with `no_mechanism_selected` or missing mechanism. | Execute Standard Contractual Clauses or verify BCRs. |
| `SPECIAL_CATEGORY_MISSING_DPA` | **Critical** | `isSpecialCategoryData === true` with `dpaSigned === false`. | Execute binding Article 28 DPA or halt special category flows. |
| `SCC_NO_EVIDENCE_ATTACHED` | **High** | `standard_contractual_clauses` selected without executed evidence document. | Upload executed SCC contract to Evidence repository. |
| `HIGH_CRITICALITY_REVIEW_OVERDUE` | **High** | Critical or high tier processor past scheduled `nextReviewDate`. | Conduct formal supplier privacy review and update cadence. |
| `RESTRICTED_TRANSFER_MISSING_TIA` | **High** | Restricted transfer without linked approved TIA. | Perform Schrems II risk analysis and document safeguards. |
| `TRANSFER_MECHANISM_EXPIRED` | **High** | Transfer arrangement mechanism status is `expired` or past review date. | Re-execute standard clauses or conduct renewal review. |
| `SUBPROCESSORS_NO_SUPPORTING_DOCS` | **Medium** | Subprocessors involved without attached audit evidence or subprocessor list. | Attach vendor subprocessor authorization or SOC/ISO report. |

### 6.2 Review Reminders & In-App Notifications

- **Evaluator (`evaluateProcessorReminders`)**: Analyzes approaching review dates (window: default 30 days) and overdue milestones across annual reviews, DPA renewals, SCC checks, and TIA assessments.
- **Scheduled Background Job (`dispatchProcessorReviewReminders`)**: Runs daily at 06:00 UTC, identifies overdue/upcoming candidates, deduplicates against active notifications created in the last 7 days, and delivers in-app alerts to assigned owners and Privacy Managers.

---

## 7. Compliance Reporting & Export Subsystem

Seven specialized, tenant-scoped export jobs compile structured audit packages via the Cloud Functions export pipeline (`processExportJob`):

| Export Type | Title & Statutory Purpose | Primary Content |
|---|---|---|
| `processor_inventory_report` | **Article 28 Processor Inventory** | Master register of all processors, criticality tiers, DPA status, supported systems, and governance risk levels. |
| `restricted_transfers_register` | **Chapter V International Transfer Register** | All cross-border transfer streams, destination countries, legal mechanisms, TIA links, and TOMs. |
| `transfer_mechanisms_report` | **Transfer Mechanisms Distribution** | Aggregation of mechanisms (SCCs, Adequacy, BCRs, Derogations) with validity and evidence status. |
| `processor_governance_gaps_report` | **Compliance Gap Analysis** | Exception report isolating critical/high findings (missing TIA, missing DPA, overdue reviews). |
| `processor_review_schedule_report` | **Review Calendar & Schedule** | Chronological schedule grouping reviews by overdue, due in 30 days, due in 90 days, and on-track. |
| `processor_system_mapping_report` | **System Dependency Map** | Infrastructure mapping linking processors to system assets, environments, and relationship types. |
| `processor_ropa_mapping_report` | **Article 30 to Processor Traceability** | Article 30 ROPA activities mapped to linked processors, cross-border transfers, and compliance verification. |
| `processor_assurance_register` | **Processor Assurance Register** | Full registry of processor certifications, SOC reports, validity dates, review attribution, and gaps. |
| `processor_expiring_certifications_report` | **Expiring Certifications Report** | Proactive renewal tracking of assurance records expiring within 60 days. |
| `processor_expired_insufficient_assurance_report` | **Deficient Assurance Report** | Exception report of expired, rejected, and insufficient processor assurance. |
| `processor_by_certification_type_matrix` | **Processor Certification Matrix** | Standard-by-standard cross-tabulation across ISO 27001, SOC 2, CSA STAR, PCI-DSS, etc. |
| `processor_assurance_coverage_by_systems` | **Assurance by Linked Systems** | System asset dependency evaluation with overall assurance health status. |
| `critical_processors_missing_assurance` | **Critical Processors Missing Assurance** | Risk escalation report isolating critical processors with assurance gaps. |

For full technical specifications on processor certification tracking, refer to [`docs/PROCESSOR_CERTIFICATIONS_AND_ASSURANCE.md`](file:///Users/remon/Documents/euroGovernance/docs/PROCESSOR_CERTIFICATIONS_AND_ASSURANCE.md).

All export artifacts are:
1. Generated in tenant-isolated Cloud Storage paths (`tenants/{tenantId}/exports/{jobId}/...`).
2. Logged to the tenant's immutable append-only audit trail (`export_generated`).
3. Delivered with completion in-app notifications (`export_ready`).

---

## 8. Extension Points & Known Implementation Constraints

### 8.1 Extension Points
1. **Custom Relationship Metadata**: Extend `ProcessorSystemRelationshipType` in [`packages/shared-types/src/grc.ts`](file:///Users/remon/Documents/euroGovernance/packages/shared-types/src/grc.ts) for domain-specific integrations (e.g. `ai_training_provider`, `identity_provider`).
2. **Additional Statutory Rules**: Extend `evaluateProcessorRiskFlags` in [`packages/shared-types/src/processors.ts`](file:///Users/remon/Documents/euroGovernance/packages/shared-types/src/processors.ts) to incorporate regional rules (e.g. UK International Data Transfer Addendum, Swiss revised FADP).
3. **Automated Subprocessor Polling**: Connect scheduled Cloud Functions to vendor RSS/webhooks for automated subprocessor change notifications.

### 8.2 Known Implementation Constraints
1. **Client Status Mutation Restrictions**: Direct client writes to `status` fields on export jobs, evidence approvals, and system metrics are prohibited; transitions must occur through backend Cloud Functions.
2. **Storage Isolation**: Export generation and evidence downloads require signed download URLs or Storage Emulator access in development environments.
3. **Tenant Boundary**: TIA and Evidence linkage is strictly tenant-scoped; foreign entity references across tenant boundaries are rejected by Firestore Security Rules.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Processor Assurance & Evidence**: [[PROCESSOR_CERTIFICATIONS_AND_ASSURANCE|Processor Certifications & Third-Party Assurance]], [[EVIDENCE_MODULE_DESIGN|Evidence Module Locker]]
- **Regulatory Requirements**: [[GDPR_MODULE_DESIGN|GDPR Article 28 & Chapter V]], [[EU_DATA_ACT_MODULE_DESIGN|EU Data Act Vendor Switching]]
- **Controls & Governance**: [[FRAMEWORK_AND_CONTROLS_ENGINE|Framework & Controls Engine]], [[domain-modules|Domain Modules]]
- **Backend & Exports**: [[CLOUD_FUNCTIONS_PLAN|Cloud Functions Plan]], [[NOTIFICATIONS_AND_SCHEDULED_JOBS_DESIGN|Notifications & Renewal Sweeps]], [[DASHBOARD_AND_REPORTING_ARCHITECTURE|Reporting Engine]]

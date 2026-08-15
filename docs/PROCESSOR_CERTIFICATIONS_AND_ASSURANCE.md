# Processor Certifications & Third-Party Assurance Governance

**Statutory & Framework Scope**:
- **GDPR Article 28(1) & 28(3)(h)**: Controller obligation to use only processors providing sufficient guarantees and processor submission to audits/inspections.
- **ISO/IEC 27001:2022 (Control 5.19–5.23)**: Supplier relationships, addressing security in supplier agreements, managing ICT supply chain security, and monitoring supplier services.
- **DORA (Regulation EU 2022/2554, Chapter V)**: Management of ICT third-party risk, contractual requirements, and third-party security assurance.
- **EU AI Act (Regulation EU 2024/1689, Article 10 & 25)**: Third-party AI model providers, data governance, and technical documentation requirements.

---

## 1. Overview & Architectural Model

`euroGovernance` maintains a structured, multi-dimensional compliance registry for tracking external data processor and subprocessor assurance artifacts (accredited certifications, SOC reports, attestation reports, and regulatory certifications) at `/tenants/{tenantId}/processor_certifications/{certId}`.

```
┌────────────────────────────────────────────────────────────────────────┐
│                        Vendor Master Organization                      │
│                 /tenants/{tenantId}/vendors/{vendorId}                 │
│         - Supplier Name, Corporate Domicile, Risk Tier, Status         │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1 : N
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                   Data Processor Compliance Profile                    │
│           /tenants/{tenantId}/processor_profiles/{profileId}           │
│    - Article 28 Role, Criticality (Critical, High, Medium, Low)        │
│    - Data Categories, Jurisdictions, Linked System Assets              │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1 : N
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│             Processor Assurance & Certification Records                │
│    /tenants/{tenantId}/processor_certifications/{certId}               │
│    - Standard Family (ISO 27001, SOC 2, CSA STAR, PCI-DSS, etc.)       │
│    - Artifact Kind (Accredited Certification vs Attestation Report)    │
│    - Issuing Body, Lead Auditor, Certificate / Report Reference Number │
│    - Validity Dates (validFrom, validUntil)                            │
│    - Report Period (reportPeriodStart, reportPeriodEnd) [Report-Style] │
│    - Assurance Scope Summary & Systems / Services Covered              │
│    - Review Status (pending, in_review, accepted, rejected, etc.)      │
│    - Review Notes, Rejection Reason, Insufficient Rationale            │
│    - Linked Evidence Repository Document IDs                           │
│    - Linked Internal Control IDs & Linked Transfer Arrangement IDs     │
│    - Version History & Immutability Flags (versionNumber, superseded)  │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │ 1 : N
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                       Tenant Evidence Locker                           │
│                /tenants/{tenantId}/evidence/{evidenceId}               │
│        - SHA-256 Checksum, Cloud Storage Path, File Size, Mime         │
│        - Evidence Category (iso_certificate, soc_report, etc.)         │
│        - Approval Status (under_review, valid, rejected, expired)      │
└────────────────────────────────────────────────────────────────────────┘
```

---

## 2. Certification vs. Report Distinction

The engine enforces a clear distinction between **certificate-style** and **report-style** assurance records:

| Dimension | Certificate-Style Artifacts | Report-Style / Attestation Artifacts |
| :--- | :--- | :--- |
| **Artifact Kinds** | `accredited_certification`, `industry_label`, `regulatory_declaration`, `code_of_conduct` | `independent_attestation_report`, `soc_report`, `self_assessment`, `custom_assurance` |
| **Typical Standards** | ISO/IEC 27001, ISO 27701, ISO 42001, PCI-DSS AoC, Europrivacy, TISAX, DPF | SOC 1 Type II, SOC 2 Type I/II, SOC 3, BSI C5, HIPAA Attestation |
| **Nature of Assessment** | Independent accredited registrar certifies conformity with standard requirements at a given point in time with ongoing surveillance. | Independent CPA/auditor examines and tests design and operating effectiveness of controls over a specific historical window. |
| **Required Time Bounds** | • `validFrom` (Issuance date)<br>• `validUntil` (Expiration date) | • `reportPeriodStart` (Observation start)<br>• `reportPeriodEnd` (Observation end)<br>• `validFrom` (Issuance date)<br>• `validUntil` (Attestation validity horizon) |
| **Auditor Attribution** | `issuingBodyOrAuditor`, `leadAuditorName` (optional). | `issuingBodyOrAuditor` (Audit firm), `leadAuditorName` (Engagement partner). |
| **Deficiency Tracking** | Flagged via `isInsufficient` or review rejection. | Tracks `unresolvedFindingsCount` and `hasMajorDeficiencies` (qualified audit opinions or exceptions). |

---

## 3. Supported Assurance Standards & Artifact Taxonomy

The engine supports 16 standard families cataloged in `packages/shared-types/src/processors.ts`:

| Standard Family Code | Display Name | Artifact Kind | Primary Statutory / Framework Alignment |
| :--- | :--- | :--- | :--- |
| `iso_27001` | ISO/IEC 27001:2022 (ISMS) | `accredited_certification` | ISO 27001, DORA Art. 9, NIS2 Art. 21 |
| `iso_27701` | ISO/IEC 27701:2019 (PIMS) | `accredited_certification` | GDPR Art. 28, ISO 27701 |
| `iso_42001` | ISO/IEC 42001:2023 (AIMS) | `accredited_certification` | EU AI Act Art. 9 & 10 |
| `iso_22301` | ISO 22301:2019 (BCMS) | `accredited_certification` | DORA Art. 11, NIS2 Business Continuity |
| `soc1_type2` | SOC 1 Type II (ICFR) | `independent_attestation_report` | Financial reporting internal controls |
| `soc2_type1` | SOC 2 Type I (Control Design) | `independent_attestation_report` | Trust Services Criteria (Design only) |
| `soc2_type2` | SOC 2 Type II (Operating Effectiveness) | `independent_attestation_report` | Trust Services Criteria (Security, Confidentiality, Availability) |
| `soc3` | SOC 3 (General Use Trust Services) | `independent_attestation_report` | Public Trust Services Criteria summary |
| `csa_star` | CSA STAR Level 1/2 | `industry_label` | Cloud Security Alliance Cloud Controls Matrix |
| `pci_dss_aoc` | PCI-DSS Attestation of Compliance (v4.0) | `industry_label` | Cardholder data security |
| `bsi_c5` | BSI C5 (Cloud Computing Criteria) | `independent_attestation_report` | German BSI Cloud Security standard |
| `tisax` | TISAX (Automotive Security VDA ISA) | `industry_label` | Automotive supply chain security |
| `europrivacy` | Europrivacy (GDPR Art. 42 Certification) | `regulatory_declaration` | GDPR Article 42 statutory certification |
| `hipaa_attestation` | HIPAA / HITECH Security Attestation | `independent_attestation_report` | US Healthcare Security & Privacy Rule |
| `eu_us_dpf` | EU-US Data Privacy Framework Self-Certification | `regulatory_declaration` | GDPR Art. 45 Adequacy safeguard |
| `custom_framework` | Custom / Non-Standard Assurance | `custom_assurance` | Organization-specific audits / bridge letters |

---

## 4. Evidence Linkage Model

Assurance records reference verified documentation stored in `/tenants/{tenantId}/evidence/{evidenceId}`:

1. **Bi-Directional References**:
   - `ProcessorCertification.linkedEvidenceIds`: Array of evidence document IDs linked to this certification.
   - `Evidence.processorCertificationIds`: Array of processor certifications supported by this evidence document.
2. **Cryptographic & Storage Integrity**:
   - Evidence records capture `fileHashSha256` (hex-encoded SHA-256 digest), `storagePath`, `fileSizeBytes`, `mimeType`, and `uploadedBy`.
   - File uploads are quarantined in Cloud Storage under `tenants/${tenantId}/evidence/${evidenceId}.pdf` and evaluated by security managers before approval.
3. **Evidence Completeness Verification (`evaluateProcessorCertificationCompleteness`)**:
   - A processor certification is marked as having attached evidence (`hasAttachedEvidence: true`) **only if at least one linked evidence document has `status === 'valid'`**.
   - If evidence is missing or pending review (`under_review`), the engine raises `PROCESSOR_CERT_MISSING_EVIDENCE`.
4. **Immutability of Evidence Versions**:
   - Evidence document versions stored in `/tenants/{tenantId}/evidence/{evidenceId}/versions/{versionId}` are immutable once submitted (`allow update: if false`).

---

## 5. Review Workflow & Lifecycle State Machine

Processor assurance records transition through formal review states enforced by `validateProcessorCertificationReviewTransition` and backend Cloud Functions:

```
                ┌──────────────────────────────────────────────────────┐
                │                      pending                         │
                └──────────┬────────────────────────────┬──────────────┘
                           │                            │
            ┌──────────────┴──────────────┐             │
            ▼                             ▼             │
┌────────────────────────┐    ┌───────────────────────┐ │
│       in_review        │    │       rejected        │◄┤
└───────────┬────────────┘    └───────────┬───────────┘ │
            │                             │             │
            ├──────────────┬──────────────┤             │
            ▼              ▼              ▼             │
┌────────────────────────┐ ┌──────────────────────────┐ │
│        accepted        │ │       insufficient       │◄┘
└───────────┬────────────┘ └──────────────┬───────────┘
            │                             │
            └──────────────┬──────────────┘
                           ▼
┌──────────────────────────────────────────────────────┐
│                      superseded                      │
│             (Preserved Historic Audit Version)       │
└──────────────────────────────────────────────────────┘
```

### Review Decisions & Attributions
- **`accept`**: Formally marks assurance valid. Sets `reviewStatus: 'accepted'`, records `reviewNotes`, `reviewedBy`, and `reviewedAt`.
- **`reject`**: Fails verification (invalid issuer, out of scope, falsified). Requires `rejectionReason`. Sets `reviewStatus: 'rejected'`.
- **`mark_insufficient`**: Records deficiencies or qualified opinion. Requires `insufficientRationale`. Sets `reviewStatus: 'insufficient'` and `isInsufficient: true`.
- **`replace`**: Archives version $N$ as `superseded` (`isHistoricVersion: true`) and creates active version $N+1$ with updated dates and incremented `versionNumber`.

---

## 6. Expiry Calculation & Proactive Reminder Engine

### 6.1 Validity Horizon Calculation
- **`calculateAssuranceDaysRemaining(validUntil, asOfDate)`**: Computes signed integer days remaining.
- **`evaluateAssuranceValidityStatus(validUntil, asOfDate, thresholdDays = 60)`**:
  - `valid_now`: `daysRemaining > thresholdDays` and `status === 'active_valid'`.
  - `expiring_soon`: `0 <= daysRemaining <= thresholdDays`.
  - `expired`: `daysRemaining < 0` or `status === 'expired'`.
  - `superseded`: Archived historical version.

### 6.2 Reminder Evaluator (`evaluateProcessorCertificationReminders`)
Evaluates operational alarms without side effects:
- **Upcoming Expiry**: 60-day, 30-day, and 14-day renewal alerts (`processor_cert_expiring_soon`).
- **Grace Period**: 30-day post-expiration grace period tracking (`processor_cert_grace_period_expiring`).
- **Lapsed Expiration**: Post-grace period escalation alert (`processor_cert_expired`).
- **Review Due**: Imminent or past-due scheduled compliance review (`processor_cert_review_due`).
- **Stale Report**: Period-of-time audit report exceeding 12 months in age (`processor_cert_stale_report`).

### 6.3 Background Notification Dispatcher (`dispatchProcessorCertificationReminders`)
- Deduplicates reminders against active notifications in `/tenants/{tenantId}/notifications` using composite keys (`${tenantId}_${certId}_${reminderType}_${date}`).
- Delivers notifications to assigned `reviewOwnerUserId`, `compliance_manager`, `privacy_manager`, and `security_manager`.

---

## 7. Risk & Internal Control Integration

### 7.1 Multi-Dimensional Risk Engine (`evaluateProcessorCertificationRiskFlags`)
Evaluates risk flags across certifications, profiles, and evidence:

| Rule Code | Severity | Trigger Condition | Suggested Treatment |
| :--- | :--- | :--- | :--- |
| `PROCESSOR_CERT_EXPIRED` | **Critical** / **High** | Record passed `validUntil` without active renewal. Severity is **Critical** for critical-tier processors. | Request renewed ISO certificate or SOC 2 report immediately. |
| `PROCESSOR_CERT_REJECTED` | **Critical** | Assurance artifact rejected during compliance review. | Investigate rejection rationale; suspend data processing if necessary. |
| `PROCESSOR_CERT_INSUFFICIENT` | **High** | Marked insufficient due to qualified opinion or missing criteria. | Require corrective action plan or bridge letter from supplier. |
| `PROCESSOR_CERT_MISSING_EVIDENCE` | **High** / **Medium** | Certification claims validity but has no approved evidence file attached. | Upload and verify formal PDF certificate in evidence locker. |
| `PROCESSOR_CERT_EXPIRING_SOON` | **High** / **Medium** | Artifact expires within renewal window (&le;60 days). | Initiate supplier renewal review and request updated documentation. |
| `PROCESSOR_CERT_MAJOR_DEFICIENCIES` | **Critical** | Report notes major control exceptions or unresolved audit findings. | Review management responses and track remediation milestones. |

### 7.2 System Asset & Internal Control Linkage
- **System Asset Linkage**: Processor certifications evaluate explicit system coverage against `SystemAsset` records via `systemsOrServicesCovered` and `SystemAsset.processorProfileIds`.
- **Internal Control Support**: Certifications link to adopted internal controls (`linkedControlIds` / `Control.processorCertificationIds`).
- **Helpers**:
  - `getControlProcessorAssuranceSupport(controlId, certs, profiles)`: Computes whether a control is fully, partially, or unsupported by external processor assurance.
  - `getProcessorsToControlsAssuranceMatrix(controls, certs, profiles)`: Generates cross-framework assurance coverage matrix.

---

## 8. Compliance Reporting & Export Subsystem

Six dedicated export jobs are compiled via `processExportJob` into tenant-scoped Cloud Storage buckets:

| Export Type | Title | Core Content |
| :--- | :--- | :--- |
| `processor_assurance_register` | **Processor Assurance Register** | Complete register of processor certifications, taxonomy, validity dates, review attribution, evidence hashes, and identified gaps. |
| `processor_expiring_certifications_report` | **Expiring Certifications Report** | Filters items expiring within window (&le;60d), sorted ascending by remaining days with renewal owner and action items. |
| `processor_expired_insufficient_assurance_report` | **Expired / Insufficient Assurance Report** | Exception report of lapsed, rejected, insufficient, and evidence-lacking records with root-cause failure rationales. |
| `processor_by_certification_type_matrix` | **Processor-by-Certification Matrix** | Cross-tabulation of processors vs standard families (ISO 27001, SOC 2, etc.) with standard adoption percentages. |
| `processor_assurance_coverage_by_systems` | **Assurance Coverage by Linked Systems** | Groups by `SystemAsset`, mapping attached processors and evaluating system health (`compliant`, `warning`, `critical_gap`). |
| `critical_processors_missing_assurance` | **Critical Processors Missing Assurance** | Isolates `critical` tier processors with zero certifications, expired records, or rejected reviews. |

---

## 9. Extension Points & Known Implementation Constraints

### 9.1 Extension Points
1. **Custom Standard Definitions**: Add custom standard frameworks via `standardFamily: 'custom_framework'` and `customStandardName`.
2. **Automated Continuous Assurance Feeds**: Integrate scheduled Cloud Functions with external trust center APIs (e.g. AWS Artifact, Google Cloud Compliance, Microsoft Service Trust Portal) to ingest fresh SOC reports automatically.
3. **Cross-Framework Control Mapping**: Extend `linkProcessorCertificationToControls` to support automated control inheritance for DORA and EU AI Act technical files.

### 9.2 Known Implementation Constraints
1. **Client Status Mutation Restrictions**: Direct client writes to `status`, `reviewStatus`, `isHistoricVersion`, and `export_jobs` are blocked by Firestore security rules. Mutations must be executed via backend Cloud Functions.
2. **Tenant Boundary Enforcement**: Processor profiles, certifications, and evidence files cannot be shared across tenants; cross-tenant references are strictly rejected by security rules.
3. **Evidence Validation Requirement**: A certification is only deemed complete if linked evidence documents carry `status: 'valid'`. Newly uploaded evidence with `status: 'under_review'` does not satisfy assurance completeness until approved.

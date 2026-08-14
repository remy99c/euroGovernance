# euroGovernance — Data Model & Firestore Schema

This document details the database schema, collection hierarchies, document structures, and indexing requirements implemented across **euroGovernance**.

---

## 1. Top-Level Hierarchy & Namespace Scoping

```
/ (Root)
├── frameworks/{frameworkId}                     # Global standard definitions (GDPR, AI Act, ISO)
│   ├── requirements/{reqId}                     # Statutory requirements
│   └── master_controls/{controlId}              # Standard master control templates
├── invitations/{invitationId}                   # Cross-tenant pending invitations
└── tenants/{tenantId}                           # Multi-tenant root container
    ├── memberships/{userId}                     # Active/suspended tenant memberships
    ├── audit_logs/{logId}                       # Immutable append-only audit trail
    ├── controls/{controlId}                     # Tenant-scoped controls
    │   └── reviews/{reviewId}                   # Append-only control reviews
    ├── evidence/{evidenceId}                    # Evidence records & review metadata
    ├── policies/{policyId}                      # Governance policies
    ├── risks/{riskId}                           # Risk assessment entries
    ├── tasks/{taskId}                           # Remediation & compliance tasks
    ├── vendors/{vendorId}                       # Third-party vendors
    ├── assets/{assetId}                         # Information & data assets
    ├── workflows/{workflowId}                   # Multi-step compliance workflows
    ├── ropa_entries/{ropaId}                    # GDPR Article 30 records
    ├── dpia_assessments/{dpiaId}                # GDPR Article 35 assessments
    ├── tia_assessments/{tiaId}                  # GDPR Chapter V transfer assessments
    ├── breaches/{breachId}                      # GDPR Article 33/34 breach records
    ├── dsr_requests/{dsrId}                     # GDPR Chapter III DSR requests
    ├── ai_systems/{systemId}                    # EU AI Act registered systems
    │   ├── substantial_changes/{changeId}       # Art. 43(4) substantial changes
    │   └── post_market_logs/{logId}             # Art. 72 post-market monitoring logs
    ├── ai_assessments/{assessmentId}            # AI Risk & FRIA assessments
    ├── ai_incidents/{incidentId}                # Art. 73 serious incident reports
    ├── iso_scope_statements/{scopeId}           # ISO ISMS/AIMS scope boundaries
    ├── iso_objectives/{objId}                   # ISO measurable objectives
    ├── iso_soa_entries/{soaId}                  # Statement of Applicability records
    ├── iso_internal_audits/{auditId}            # Internal audit plans
    │   └── findings/{findingId}                 # Audit non-conformities & observations
    ├── iso_management_reviews/{reviewId}        # Annual management reviews
    ├── summary_metrics/current                  # Materialized tenant compliance metrics
    ├── notifications/{notificationId}           # Recipient-scoped user alerts
    └── export_jobs/{jobId}                      # Asynchronous export job state
```

---

## 2. Global Root Collections

### 2.1 `/frameworks/{frameworkId}`
- **Description**: Read-only canonical library of regulations and compliance standards.
- **Documents**: `gdpr`, `eu_ai_act`, `iso_27001_2022`, `iso_42001_2023`, `eu_data_act`.
- **Fields**:
  - `id`: `string` — e.g. `'iso_27001_2022'`
  - `name`: `string` — e.g. `'ISO/IEC 27001:2022 Information Security'`
  - `version`: `string` — e.g. `'2022'`
  - `issuer`: `string` — e.g. `'ISO/IEC'`, `'European Union'`
  - `category`: `'privacy' | 'ai_governance' | 'cybersecurity' | 'data_governance'`

### 2.2 `/invitations/{invitationId}`
- **Description**: Secure, token-hashed pending membership invitations.
- **Fields**:
  - `id`: `string` — Unique invitation ID.
  - `tenantId`: `string` — Target tenant identifier.
  - `tenantName`: `string` — Cached tenant display name.
  - `email`: `string` — Recipient email address.
  - `role`: `UserRole` — Assigned role upon acceptance.
  - `department`: `string` — Optional organizational unit.
  - `tokenHash`: `string` — Cryptographic hash of the secret invitation link token.
  - `status`: `'pending' | 'accepted' | 'expired' | 'revoked'`
  - `expiresAt`: `string` (ISO 8601) — Defaults to 7 days from creation.
  - `createdBy`: `string` — UID of tenant administrator.
  - `createdAt`: `string` (ISO 8601)

---

## 3. Tenant Subcollections

### 3.1 `/tenants/{tenantId}/memberships/{userId}`
- **Description**: Mapping of authenticated user IDs to tenant roles.
- **Fields**:
  - `userId`: `string` — Firebase Auth UID.
  - `tenantId`: `string` — Owning tenant ID.
  - `role`: `UserRole` — One of the 9 defined roles.
  - `status`: `'active' | 'suspended'`
  - `joinedAt`: `string` (ISO 8601)
  - `updatedAt`: `string` (ISO 8601)

### 3.2 `/tenants/{tenantId}/audit_logs/{logId}`
- **Description**: Immutable, append-only log of all compliance and administrative events.
- **Immutability**: `allow create, update, delete: if false` in rules.
- **Fields**:
  - `id`: `string` — Auto-generated log ID.
  - `tenantId`: `string`
  - `actorId`: `string` — UID of the initiating user (or `'system'`).
  - `actorEmail`: `string`
  - `action`: `string` — e.g. `'evidence.approve'`, `'ai_system.classify'`, `'tenant.invite'`
  - `resourceType`: `string` — e.g. `'evidence'`, `'ai_system'`, `'control'`
  - `resourceId`: `string`
  - `details`: `Record<string, any>` — Arbitrary context payload.
  - `ipAddress`: `string` — Client IP when available.
  - `userAgent`: `string` — Client browser agent.
  - `timestamp`: `string` (ISO 8601)

### 3.3 `/tenants/{tenantId}/controls/{controlId}`
- **Description**: Core GRC controls.
- **Fields**:
  - `id`: `string`
  - `tenantId`: `string`
  - `code`: `string` — e.g. `'CTL-SEC-01'`, `'A.8.1'`
  - `title`: `string`
  - `description`: `string`
  - `category`: `'technical' | 'organizational' | 'physical' | 'legal'`
  - `frameworks`: `string[]` — e.g. `['iso_27001_2022', 'gdpr']`
  - `status`: `'draft' | 'implemented' | 'under_review' | 'archived'`
  - `ownerId`: `string`
  - `implementationNotes`: `string`
  - `reviewFrequency`: `'monthly' | 'quarterly' | 'semi_annual' | 'annual'`
  - `nextReviewDate`: `string` (ISO 8601)

### 3.4 `/tenants/{tenantId}/evidence/{evidenceId}`
- **Description**: Evidence records referencing uploaded artifacts with Four-Eyes metadata.
- **Fields**:
  - `id`: `string`
  - `tenantId`: `string`
  - `controlId`: `string`
  - `title`: `string`
  - `description`: `string`
  - `storagePath`: `string` — Cloud Storage bucket path.
  - `fileName`: `string`
  - `fileSize`: `number`
  - `mimeType`: `string`
  - `fileHash`: `string` — SHA-256 integrity hash.
  - `status`: `'under_review' | 'approved' | 'rejected' | 'deprecated'`
  - `uploadedBy`: `string` — UID of creator.
  - `uploadedAt`: `string` (ISO 8601)
  - `approvedBy`: `string | null` — UID of approver (must not equal `uploadedBy`).
  - `approvedAt`: `string | null`
  - `rejectionReason`: `string | null`
  - `validUntil`: `string | null`

### 3.5 `/tenants/{tenantId}/ai_systems/{systemId}`
- **Description**: Registered AI systems and classification state.
- **Fields**:
  - `id`: `string`
  - `tenantId`: `string`
  - `name`: `string`
  - `version`: `string`
  - `intendedPurpose`: `string`
  - `deploymentRole`: `'provider' | 'deployer' | 'importer' | 'distributor'`
  - `riskTier`: `'prohibited' | 'high_risk' | 'limited_risk' | 'minimal_risk' | 'unclassified'`
  - `riskRationale`: `string`
  - `friaRequired`: `boolean`
  - `conformityAssessmentStatus`: `'not_started' | 'internal_control_in_progress' | 'notified_body_review' | 'certified'`
  - `ceMarkAffixed`: `boolean`
  - `classifiedAt`: `string | null`

### 3.6 `/tenants/{tenantId}/summary_metrics/current`
- **Description**: Materialized live compliance health metrics.
- **Fields**:
  - `tenantId`: `string`
  - `totalControls`: `number`
  - `implementedControls`: `number`
  - `compliancePercentage`: `number`
  - `openRisks`: `number`
  - `highCriticalRisks`: `number`
  - `pendingEvidenceReviews`: `number`
  - `unclassifiedAiSystems`: `number`
  - `pendingDsrRequests`: `number`
  - `openAuditFindings`: `number`
  - `lastMaterializedAt`: `string` (ISO 8601)

### 3.7 `/tenants/{tenantId}/notifications/{notificationId}`
- **Description**: Recipient-isolated in-app notification records.
- **Fields**:
  - `id`: `string`
  - `tenantId`: `string`
  - `recipientId`: `string` — Firebase Auth UID (access restricted in rules).
  - `title`: `string`
  - `message`: `string`
  - `type`: `'breach_alert' | 'ai_incident' | 'evidence_review' | 'task_assignment' | 'review_expiry' | 'general'`
  - `severity`: `'info' | 'warning' | 'urgent'`
  - `resourceType`: `string | null`
  - `resourceId`: `string | null`
  - `isRead`: `boolean`
  - `createdAt`: `string` (ISO 8601)

### 3.8 `/tenants/{tenantId}/export_jobs/{jobId}`
- **Description**: Asynchronous compliance dossier and framework readiness export requests.
- **Fields**:
  - `id`: `string`
  - `tenantId`: `string`
  - `type`: `'evidence_pack' | 'framework_readiness'`
  - `framework`: `string | null`
  - `requestedBy`: `string`
  - `status`: `'pending' | 'processing' | 'completed' | 'failed'`
  - `progress`: `number` — 0 to 100 percentage.
  - `artifactStoragePath`: `string | null`
  - `downloadUrl`: `string | null`
  - `itemCount`: `number`
  - `errorMessage`: `string | null`
  - `createdAt`: `string` (ISO 8601)
  - `completedAt`: `string | null`

---

## 4. Firestore Composite Indexes

The repository maintains explicit composite indexes in [`firestore.indexes.json`](file:///Users/remon/Documents/euroGovernance/firestore.indexes.json):

1. `notifications`: `recipientId ASC, createdAt DESC`
2. `controls`: `status ASC, reviewFrequency ASC`
3. `evidence`: `controlId ASC, status ASC`
4. `risks`: `treatment ASC, inherentScore DESC`
5. `tasks`: `assignedTo ASC, status ASC, dueDate ASC`
6. `ropa_entries`: `dpoApproved ASC, createdAt DESC`
7. `dpia_assessments`: `status ASC, createdAt DESC`
8. `breaches`: `supervisoryNotificationRequired ASC, createdAt DESC`
9. `dsr_requests`: `status ASC, deadlineDate ASC`
10. `ai_systems`: `riskTier ASC, createdAt DESC`
11. `ai_incidents`: `severity ASC, createdAt DESC`
12. `iso_objectives`: `status ASC, targetDate ASC`
13. `iso_soa_entries`: `applicable ASC, implementationStatus ASC`
14. `iso_internal_audits`: `status ASC, startDate ASC`
15. `export_jobs`: `requestedBy ASC, createdAt DESC`

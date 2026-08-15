# Query-First Firestore Schema Specification: euroGovernance

This document specifies the screen-by-screen query requirements and final schema design for **euroGovernance**.

---

## Part 1: Screen-by-Screen Query Patterns & Document Shapes

### 1. Dashboard (Executive & Framework Readiness Overview)
1. **Main Query Patterns**:
   - Fetch tenant configuration & enabled frameworks.
   - Fetch control health summary metrics & counts by status.
   - Fetch pending approvals count (evidence & assessments).
   - Fetch overdue tasks & urgent 72h breach alerts.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}` (document get)
   - `/tenants/{tenantId}/controls` (aggregation query / status filter)
   - `/tenants/{tenantId}/evidence` (where `status == 'under_review'`)
   - `/tenants/{tenantId}/tasks` (where `assigneeId == uid`, `status != 'completed'`, `dueDate <= now + 7d`)
   - `/tenants/{tenantId}/breaches` (where `status in ['suspected', 'investigating']`)
3. **Filters & Sort Requirements**:
   - `evidence`: `status == 'under_review' | orderBy('createdAt', 'desc') | limit(5)`
   - `tasks`: `assigneeId == uid | status == 'todo' | orderBy('dueDate', 'asc') | limit(5)`
   - `breaches`: `status in ['suspected', 'investigating'] | orderBy('discoveredAt', 'asc')`
4. **Composite Indexes Required**:
   - `evidence`: `status ASC`, `createdAt DESC`
   - `tasks`: `assigneeId ASC`, `status ASC`, `dueDate ASC`
   - `breaches`: `status ASC`, `discoveredAt ASC`
5. **Document Shape Used by Screen**:
   - Summary cards displaying metric counts, readiness percentages per framework (`gdpr`, `eu_ai_act`, `eu_data_act`, `iso_27001`, `iso_42001`), and quick-action queues.
6. **Read/Write Risk Notes**:
   - *Risk*: Client recalculating readiness percentages across 500+ controls on every page load causes excessive document reads.
   - *Optimization*: Materialize pre-calculated summary metrics in `/tenants/{tenantId}/summary_metrics/latest` via Firestore trigger on control/evidence changes, or use `count()` aggregation queries.

---

### 2. Controls List
1. **Main Query Patterns**:
   - Paginated list of controls filtered by framework, domain, status, or search code.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/controls`
3. **Filters & Sort Requirements**:
   - Filter by `frameworkIds` (array-contains `selectedFramework`)
   - Filter by `status == 'implemented' | 'in_progress' | 'not_started'`
   - Sort by `code ASC` or `updatedAt DESC`
   - Pagination with `limit(25)` and `startAfter(lastVisibleDoc)`
4. **Composite Indexes Required**:
   - `controls`: `frameworkIds ARRAY_CONTAINS`, `status ASC`, `code ASC`
   - `controls`: `status ASC`, `updatedAt DESC`
5. **Document Shape Used by Screen**:
   - Control card: `{ id, code, title, domain, status, healthScore, frameworkIds, lastReviewDate, nextReviewDate, ownerId }`
6. **Read/Write Risk Notes**:
   - Fast, paginated reads; minimal document payload without large policy or evidence blobs.

---

### 3. Control Detail
1. **Main Query Patterns**:
   - Fetch single control document by ID.
   - Fetch linked requirements (`/frameworks/{frameworkId}/requirements/{reqId}`).
   - Fetch linked evidence (`/tenants/{tenantId}/evidence` where `controlIds array-contains controlId`).
   - Fetch review history subcollection (`/tenants/{tenantId}/controls/{controlId}/reviews`).
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/controls/{controlId}`
   - `/tenants/{tenantId}/controls/{controlId}/reviews`
   - `/tenants/{tenantId}/evidence`
3. **Filters & Sort Requirements**:
   - `reviews`: `orderBy('reviewedAt', 'desc') | limit(10)`
   - `evidence`: `where('controlIds', 'array-contains', controlId) | orderBy('createdAt', 'desc')`
4. **Composite Indexes Required**:
   - `evidence`: `controlIds ARRAY_CONTAINS`, `createdAt DESC`
   - `reviews`: `reviewedAt DESC`
5. **Document Shape Used by Screen**:
   - Full control specification, implementation notes, review frequency, linked policies, and review history timeline.
6. **Read/Write Risk Notes**:
   - Subcollection `/reviews` prevents control document unbounded size growth over multi-year audit cycles.

---

### 4. Evidence Inbox
1. **Main Query Patterns**:
   - View evidence submitted for review or nearing review expiration.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/evidence`
3. **Filters & Sort Requirements**:
   - Tab 1 (Pending Approvals): `status == 'under_review' | orderBy('createdAt', 'desc')`
   - Tab 2 (Expiring Soon): `status == 'valid' | reviewDueDate <= now + 30d | orderBy('reviewDueDate', 'asc')`
   - Tab 3 (Expired): `status == 'expired' | orderBy('reviewDueDate', 'desc')`
4. **Composite Indexes Required**:
   - `evidence`: `status ASC`, `reviewDueDate ASC`
   - `evidence`: `status ASC`, `createdAt DESC`
5. **Document Shape Used by Screen**:
   - `{ id, title, category, status, fileSizeBytes, mimeType, currentVersion, reviewDueDate, ownerId, controlIds }`
6. **Read/Write Risk Notes**:
   - Excludes binary payloads (files live in Cloud Storage); list query reads only lean metadata records.

---

### 5. Evidence Detail and Approval
1. **Main Query Patterns**:
   - Fetch evidence metadata.
   - Fetch version history subcollection (`/tenants/{tenantId}/evidence/{evidenceId}/versions`).
   - Request temporary download signed URL for storage artifact.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/evidence/{evidenceId}`
   - `/tenants/{tenantId}/evidence/{evidenceId}/versions`
3. **Filters & Sort Requirements**:
   - `versions`: `orderBy('versionNumber', 'desc')`
4. **Composite Indexes Required**:
   - `versions`: `versionNumber DESC`
5. **Document Shape Used by Screen**:
   - Title, description, hash, storage path, linked control codes, reviewer notes, rejection reason, version changelog.
6. **Read/Write Risk Notes**:
   - Approval/Rejection triggers server Cloud Function (`approveEvidence` / `rejectEvidence`), preventing client state falsification.

---

### 6. Policy Library
1. **Main Query Patterns**:
   - List published policies and policies pending annual review.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/policies`
3. **Filters & Sort Requirements**:
   - Filter by `status == 'active' | 'under_review' | 'draft'`
   - Sort by `nextReviewDate ASC` or `code ASC`
4. **Composite Indexes Required**:
   - `policies`: `status ASC`, `nextReviewDate ASC`
5. **Document Shape Used by Screen**:
   - `{ id, code, title, version, summary, status, effectiveDate, nextReviewDate, approverId, linkedControlIds }`
6. **Read/Write Risk Notes**:
   - Policy markdown content stored in document if <50KB; large attachments stored in Cloud Storage.

---

### 7. Risk Register
1. **Main Query Patterns**:
   - Matrix/Table view of enterprise, security, privacy, and AI risks.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/risks`
3. **Filters & Sort Requirements**:
   - Filter by `category == 'privacy' | 'security' | 'ai_bias' | 'legal_compliance'`
   - Filter by `status == 'identified' | 'assessed' | 'mitigating' | 'accepted'`
   - Sort by `residualScore DESC`
4. **Composite Indexes Required**:
   - `risks`: `category ASC`, `residualScore DESC`
   - `risks`: `status ASC`, `residualScore DESC`
5. **Document Shape Used by Screen**:
   - `{ id, code, title, category, status, inherentScore, residualScore, treatmentStrategy, mitigatingControlIds, affectedAssetIds }`
6. **Read/Write Risk Notes**:
   - Fast numeric sorting on `residualScore` (calculated as `likelihood * impact`).

---

### 8. Issue & Remediation Board
1. **Main Query Patterns**:
   - Kanban board / list view of open nonconformities, audit findings, and remediation items.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/issues`
3. **Filters & Sort Requirements**:
   - Filter by `status == 'open' | 'in_progress' | 'under_review' | 'resolved'`
   - Filter by `severity == 'critical' | 'high' | 'medium' | 'low'`
   - Sort by `dueDate ASC`
4. **Composite Indexes Required**:
   - `issues`: `status ASC`, `severity DESC`, `dueDate ASC`
5. **Document Shape Used by Screen**:
   - `{ id, code, title, severity, status, source, dueDate, ownerId, verifiedBy, resolvedAt }`
6. **Read/Write Risk Notes**:
   - Lightweight status updates directly via client SDK for assigned owners.

---

### 9. Vendor Register
1. **Main Query Patterns**:
   - List third-party software, cloud vendors, AI model providers, and subprocessors.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/vendors`
3. **Filters & Sort Requirements**:
   - Filter by `category == 'subprocessor' | 'ai_model_provider' | 'cloud_provider'`
   - Filter by `riskTier == 'critical' | 'high' | 'medium' | 'low'`
   - Sort by `nextAssessmentDueDate ASC`
4. **Composite Indexes Required**:
   - `vendors`: `riskTier ASC`, `nextAssessmentDueDate ASC`
5. **Document Shape Used by Screen**:
   - `{ id, name, category, riskTier, dpaSigned, securityAssessmentDate, nextAssessmentDueDate, dataHostingRegions }`
6. **Read/Write Risk Notes**:
   - Essential for GDPR Article 28 processor compliance and EU AI Act upstream provider tracking.

---

### 10. System & Asset Register
1. **Main Query Patterns**:
   - Inventory of databases, internal software, cloud infrastructure, and AI models.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/system_assets`
3. **Filters & Sort Requirements**:
   - Filter by `criticality == 'mission_critical' | 'high' | 'medium' | 'low'`
   - Filter by `containsPersonalData == true`
   - Sort by `name ASC`
4. **Composite Indexes Required**:
   - `system_assets`: `containsPersonalData ASC`, `criticality ASC`
5. **Document Shape Used by Screen**:
   - `{ id, name, assetType, criticality, dataClassification, hostingLocation, vendorId, containsPersonalData, containsSpecialCategoryData }`
6. **Read/Write Risk Notes**:
   - Linked to ROPA entries and AI system records via standardized ID pointers.

---

### 11. GDPR: ROPA Register
1. **Main Query Patterns**:
   - Comprehensive Record of Processing Activities table under GDPR Article 30.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/ropa_entries`
3. **Filters & Sort Requirements**:
   - Filter by `status == 'active' | 'under_review' | 'draft'`
   - Filter by `legalBasis == 'consent' | 'contractual_necessity' | 'legitimate_interests' | ...`
   - Sort by `activityCode ASC`
4. **Composite Indexes Required**:
   - `ropa_entries`: `status ASC`, `activityCode ASC`
5. **Document Shape Used by Screen**:
   - `{ id, activityCode, activityName, purpose, legalBasis, dataSubjectCategories, personalDataCategories, retentionPeriodDescription, dpiaRequired, status }`
6. **Read/Write Risk Notes**:
   - Flat schema avoids nested sub-arrays; links to processors via `processorIds` list.

---

### 12. GDPR: ROPA Detail
1. **Main Query Patterns**:
   - Detailed view of a processing activity, linked DPIA, linked TIA, and associated system assets.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/ropa_entries/{ropaId}`
3. **Filters & Sort Requirements**:
   - Direct document get by ID.
4. **Document Shape Used by Screen**:
   - Full ROPA entry schema with joint controller details, security measures summary, transfer mechanisms, and review dates.
6. **Read/Write Risk Notes**:
   - Single read per detail view.

---

### 13. GDPR: DPIA List & Workflow
1. **Main Query Patterns**:
   - Track high-risk processing assessments (GDPR Art. 35) through screening, review, DPO consultation, and approval.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/dpia_assessments`
3. **Filters & Sort Requirements**:
   - Filter by `status == 'screening' | 'in_review' | 'dpo_consulted' | 'approved'`
   - Sort by `updatedAt DESC` or `residualRiskLevel DESC`
4. **Composite Indexes Required**:
   - `dpia_assessments`: `status ASC`, `residualRiskLevel ASC`
   - `dpia_assessments`: `status ASC`, `updatedAt DESC`
5. **Document Shape Used by Screen**:
   - `{ id, code, title, ropaEntryId, status, residualRiskLevel, dpoOpinionNotes, dpoApprovalDate, nextReviewDate }`
6. **Read/Write Risk Notes**:
   - Transitions to `approved` require `transitionDPIAStatus` Cloud Function with DPO signature capture.

---

### 14. GDPR: TIA List & Workflow
1. **Main Query Patterns**:
   - International transfer risk evaluations (Chapter V GDPR) for non-EU destinations.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/tia_assessments`
3. **Filters & Sort Requirements**:
   - Filter by `destinationCountry`, `legalMechanism`, `status`
   - Sort by `updatedAt DESC`
4. **Composite Indexes Required**:
   - `tia_assessments`: `status ASC`, `updatedAt DESC`
5. **Document Shape Used by Screen**:
   - `{ id, code, title, vendorId, destinationCountry, legalMechanism, status, residualRiskLevel, approvedBy, approvedAt }`
6. **Read/Write Risk Notes**:
   - Stores legal safeguards, supplementary technical measures (e.g. end-to-end encryption), and contractual clauses.

---

### 15. EU AI Act: AI Systems Register
1. **Main Query Patterns**:
   - Inventory of all internal and vendor-supplied AI systems, models, and foundation model integrations.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/ai_systems`
3. **Filters & Sort Requirements**:
   - Filter by `riskTier == 'prohibited' | 'high_risk' | 'general_purpose_ai' | 'minimal_risk'`
   - Filter by `role == 'provider' | 'deployer' | 'importer' | 'distributor'`
   - Sort by `name ASC`
4. **Composite Indexes Required**:
   - `ai_systems`: `riskTier ASC`, `status ASC`
   - `ai_systems`: `role ASC`, `status ASC`
5. **Document Shape Used by Screen**:
   - `{ id, code, name, version, role, riskTier, status, isGeneralPurposeAI, underlyingFoundationModel, euDatabaseRegistrationNumber }`
6. **Read/Write Risk Notes**:
   - High-risk tier systems trigger mandatory obligation tracking (technical documentation, human oversight, logging).

---

### 16. EU AI Act: AI Classification Workflow
1. **Main Query Patterns**:
   - Multi-step questionnaire evaluating Prohibited Practices (Art. 5) and Annex III High-Risk domains.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/ai_assessments`
3. **Filters & Sort Requirements**:
   - Filter by `aiSystemId == selectedSystemId | orderBy('createdAt', 'desc')`
4. **Composite Indexes Required**:
   - `ai_assessments`: `aiSystemId ASC`, `createdAt DESC`
5. **Document Shape Used by Screen**:
   - `{ id, aiSystemId, assessmentType, prohibitedPracticesCheck, annexThreeCategory, determinedRiskTier, justificationSummary, assessedBy, approvedBy }`
6. **Read/Write Risk Notes**:
   - Executed via `classifyAISystem` Cloud Function to guarantee deterministic, reproducible classifications.

---

### 17. EU AI Act: AI Incident Log
1. **Main Query Patterns**:
   - Serious incidents, malfunctions, and adverse events register (Art. 73 EU AI Act).
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/ai_incidents`
3. **Filters & Sort Requirements**:
   - Filter by `severity == 'serious_incident' | 'malfunction' | 'near_miss'`
   - Filter by `status == 'reported' | 'investigating' | 'authority_notified' | 'closed'`
   - Sort by `discoveredAt DESC`
4. **Composite Indexes Required**:
   - `ai_incidents`: `severity ASC`, `discoveredAt DESC`
   - `ai_incidents`: `status ASC`, `authorityNotificationDeadline ASC`
5. **Document Shape Used by Screen**:
   - `{ id, incidentReference, aiSystemId, title, severity, status, discoveredAt, authorityNotificationDeadline, marketSurveillanceAuthorityNotified }`
6. **Read/Write Risk Notes**:
   - Built-in countdown calculation for the statutory 2-day / 15-day market surveillance notification deadline.

---

### 18. Audit Exports & Reporting
1. **Main Query Patterns**:
   - Compliance package generation status, download history, and framework readiness exports.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}/export_jobs`
3. **Filters & Sort Requirements**:
   - Sort by `requestedAt DESC | limit(20)`
4. **Composite Indexes Required**:
   - `export_jobs`: `requestedBy ASC`, `requestedAt DESC`
5. **Document Shape Used by Screen**:
   - `{ id, exportType, status, requestedBy, requestedAt, completedAt, fileStoragePath, fileDownloadUrl, fileSizeBytes, errorMessage }`
6. **Read/Write Risk Notes**:
   - Export documents are written and updated exclusively by the background export Cloud Function.

---

### 19. Organization Settings
1. **Main Query Patterns**:
   - Fetch tenant organization settings, member list, and active invitations.
2. **Firestore Collection Path(s)**:
   - `/tenants/{tenantId}`
   - `/tenants/{tenantId}/memberships`
   - `/invitations` (where `tenantId == currentTenantId`, `status == 'pending'`)
3. **Filters & Sort Requirements**:
   - `memberships`: `orderBy('role', 'asc')`
   - `invitations`: `where('tenantId', '==', tenantId) | where('status', '==', 'pending')`
4. **Composite Indexes Required**:
   - `invitations`: `tenantId ASC`, `status ASC`
5. **Document Shape Used by Screen**:
   - Organization name, tier, enabled frameworks, member roster, role assignment modals, pending invites table.
6. **Read/Write Risk Notes**:
   - Restricted to `tenant_admin`. Modifications route through server functions.

---

## Part 2: Final Schema Specification

```
/tenants/{tenantId}
├── /memberships/{userId}
├── /controls/{controlId}
│   └── /reviews/{reviewId}
├── /evidence/{evidenceId}
│   └── /versions/{versionId}
├── /policies/{policyId}
├── /risks/{riskId}
├── /issues/{issueId}
├── /tasks/{taskId}
├── /vendors/{vendorId}
├── /system_assets/{assetId}
├── /ropa_entries/{ropaId}
├── /dpia_assessments/{dpiaId}
├── /tia_assessments/{tiaId}
├── /breaches/{breachId}
├── /dsr_requests/{dsrId}
├── /ai_systems/{systemId}
├── /ai_assessments/{assessmentId}
├── /ai_incidents/{incidentId}
├── /data_act_assets/{assetId}
├── /data_sharing_requests/{requestId}
├── /iso_management/{docId}
├── /notifications/{notificationId}
├── /export_jobs/{jobId}
└── /audit_logs/{logId}

/users/{userId}
/frameworks/{frameworkId}
├── /requirements/{requirementId}
└── /master_controls/{controlId}
/invitations/{invitationId}
```

### Detailed Document Definitions

#### 1. Collection Path: `/tenants/{tenantId}`
- **Purpose**: Root organization record and global tenancy configuration.
- **Required Fields**: `id`, `name`, `slug`, `tier`, `status`, `primaryContactEmail`, `dataRegion`, `enabledFrameworks`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: All 18 module subcollections listed above.
- **Duplicated Fields for Optimization**: None (root configuration document).

#### 2. Collection Path: `/tenants/{tenantId}/memberships/{userId}`
- **Purpose**: Authoritative tenant RBAC membership and department assignment.
- **Required Fields**: `id`, `tenantId`, `userId`, `role`, `status`, `department`, `title`, `joinedAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: None.
- **Duplicated Fields for Optimization**: `userId` is duplicated in the document ID for single-operation path resolution in Security Rules (`/memberships/$(request.auth.uid)`).

#### 3. Collection Path: `/tenants/{tenantId}/controls/{controlId}`
- **Purpose**: Tenant adopted compliance controls mapped across regulatory frameworks.
- **Required Fields**: `id`, `tenantId`, `code`, `title`, `description`, `domain`, `frameworkIds`, `requirementIds`, `status`, `healthScore`, `reviewFrequencyDays`, `ownerId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: `/reviews` (historical review log).
- **Duplicated Fields for Optimization**: `frameworkIds` string array enables fast multi-framework filtering without separate join tables.

#### 4. Collection Path: `/tenants/{tenantId}/evidence/{evidenceId}`
- **Purpose**: Evidence artifact metadata, linkage graph, and approval state.
- **Required Fields**: `id`, `tenantId`, `title`, `description`, `category`, `status`, `storagePath`, `fileSizeBytes`, `mimeType`, `fileHashSha256`, `controlIds`, `currentVersion`, `ownerId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: `/versions` (immutable history of uploaded file revisions).
- **Duplicated Fields for Optimization**: `currentVersion` number and `storagePath` pointer in root evidence record prevent reading the `/versions` subcollection for standard list views.

#### 5. Collection Path: `/tenants/{tenantId}/ropa_entries/{ropaId}`
- **Purpose**: GDPR Article 30 Record of Processing Activities entry.
- **Required Fields**: `id`, `tenantId`, `activityCode`, `activityName`, `purpose`, `legalBasis`, `dataSubjectCategories`, `personalDataCategories`, `retentionPeriodDescription`, `retentionPeriodMonths`, `processorIds`, `status`, `ownerId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: None.
- **Duplicated Fields for Optimization**: `processorIds` (array of linked `vendorId` strings) allows immediate lookup of linked third-party subprocessors without secondary query.

#### 6. Collection Path: `/tenants/{tenantId}/ai_systems/{systemId}`
- **Purpose**: EU AI Act AI system register and lifecycle status.
- **Required Fields**: `id`, `tenantId`, `code`, `name`, `version`, `role`, `riskTier`, `intendedPurpose`, `status`, `ownerId`, `createdAt`, `updatedAt`, `createdBy`, `updatedBy`.
- **Recommended Subcollections**: None.
- **Duplicated Fields for Optimization**: `riskTier` is denormalized directly from the approved classification assessment to allow instant high-risk badge rendering on list screens.

#### 7. Collection Path: `/tenants/{tenantId}/audit_logs/{logId}`
- **Purpose**: Immutable, append-only chronological log of all compliance and security actions.
- **Required Fields**: `id`, `tenantId`, `actorId`, `actorEmail`, `actorRole`, `entityType`, `entityId`, `action`, `beforeSummary`, `afterSummary`, `timestamp`, `source`.
- **Recommended Subcollections**: None.
- **Duplicated Fields for Optimization**: `actorEmail` and `actorRole` are snapshotted at write time to ensure audit fidelity even if the user subsequently leaves the organization or changes roles.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Data & Performance**: [[data-model|Data Model]], [[INDEXES_AND_PERFORMANCE_REVIEW|Indexes & Performance Review]], [[MIGRATION_SAFETY_REVIEW|Migration Safety]]
- **Security & Authorization**: [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]], [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant & Identity Flows]], [[AUDIT_LOG_DESIGN|Audit Log Design]]
- **Subsystem Collections**: [[GDPR_MODULE_DESIGN|GDPR Subsystem]], [[EU_AI_ACT_MODULE_DESIGN|AI Act Subsystem]], [[PROCESSOR_AND_TRANSFER_MANAGEMENT|Processor & Transfer Collections]], [[PROCESSOR_CERTIFICATIONS_AND_ASSURANCE|Processor Certifications]], [[EVIDENCE_MODULE_DESIGN|Evidence Locker]]

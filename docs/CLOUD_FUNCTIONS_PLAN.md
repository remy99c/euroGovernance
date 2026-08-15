# Privileged Cloud Functions Specification: euroGovernance

**Runtime**: Node.js 20 on Cloud Functions v2 (Cloud Run backend)  
**Region**: `europe-west3` (Frankfurt)  
**SDK**: Firebase Admin SDK with Least-Privilege IAM  

---

## 1. `createTenant`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Provisions a new tenant organization document, assigns caller as initial `tenant_admin`, updates user active tenants, and emits initialization audit event in an atomic batch.
3. **Auth Requirements**: Authenticated user (`request.auth.uid != null`).
4. **Input Schema**:
   ```typescript
   interface CreateTenantInput {
     name: string;
     slug: string;
     tier?: 'starter' | 'professional' | 'enterprise';
     dataRegion?: 'europe-west3' | 'europe-west1';
     enabledFrameworks?: Array<'gdpr' | 'eu_ai_act' | 'eu_data_act' | 'iso_27001' | 'iso_42001'>;
   }
   ```
5. **Validation Logic**: Validates slug is alphanumeric with hyphens, checks `/tenants/{slug}` uniqueness in Firestore, and validates email format.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{slug})` to verify slug availability.
   - Atomic Batch Write: `set(/tenants/{slug})`, `set(/tenants/{slug}/memberships/{uid})`, `set(/tenants/{slug}/audit_logs/{logId})`, `update(/users/{uid})`.
7. **Idempotency Requirements**: Slug uniqueness check prevents duplicate creation; re-submitting an existing slug throws `already-exists` error.
8. **Audit Log Side Effects**: Emits `{ action: 'create', entityType: 'tenant', entityId: slug }` in tenant audit log.
9. **Failure Modes**: Duplicate slug (`already-exists`), missing parameters (`invalid-argument`), unauthenticated (`unauthenticated`).
10. **Security Notes**: Caller is immediately bound as `tenant_admin` inside the tenant membership document.

---

## 2. `inviteUserToTenant`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Generates an invitation record for a new user with a 7-day cryptographic expiration and sends an email invite.
3. **Auth Requirements**: Caller must have active membership with `role == 'tenant_admin'` in target tenant.
4. **Input Schema**:
   ```typescript
   interface InviteUserInput {
     tenantId: string;
     email: string;
     role: UserRole;
     department: string;
   }
   ```
5. **Validation Logic**: Validates email format, checks tenant existence, verifies caller role, verifies tenant max seat limits from subscription.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId})`, `get(/tenants/{tenantId}/memberships/{callerUid})`.
   - Write: `set(/invitations/{invitationId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Repeated invites to same email overwrite/extend the pending invitation.
8. **Audit Log Side Effects**: Logs `invitation` creation event with invited email, department, and assigned role.
9. **Failure Modes**: Caller not admin (`permission-denied`), seat limit exceeded (`resource-exhausted`), invalid email (`invalid-argument`).
10. **Security Notes**: Token hash stored in `/invitations/{id}` prevents token enumeration attacks.

---

## 3. `acceptTenantInvite`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Validates invitation token, activates tenant membership for caller, and transitions invite status to `accepted`.
3. **Auth Requirements**: Authenticated user (`request.auth.uid != null`).
4. **Input Schema**:
   ```typescript
   interface AcceptInviteInput {
     invitationId: string;
   }
   ```
5. **Validation Logic**: Checks invitation exists, verifies `status == 'pending'`, checks `expiresAt > now()`, verifies caller's email matches invitation email.
6. **Firestore Reads & Writes**:
   - Read: `get(/invitations/{invitationId})`.
   - Atomic Batch Write: `set(/tenants/{tenantId}/memberships/{callerUid})`, `update(/invitations/{invitationId}, { status: 'accepted' })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Calling on already accepted invite throws `failed-precondition`.
8. **Audit Log Side Effects**: Logs `tenant_membership` creation event.
9. **Failure Modes**: Expired token (`deadline-exceeded`), already accepted (`failed-precondition`), non-existent invite (`not-found`).
10. **Security Notes**: Binds membership directly to caller's verified UID.

---

## 4. `assignTenantRole`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Promotes, demotes, or reassigns roles for existing tenant members.
3. **Auth Requirements**: Caller must hold active `tenant_admin` role.
4. **Input Schema**:
   ```typescript
   interface AssignRoleInput {
     tenantId: string;
     targetUserId: string;
     newRole: UserRole;
   }
   ```
5. **Validation Logic**: Validates target membership exists, checks that caller cannot demote themselves if they are the sole `tenant_admin`.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/memberships/{targetUserId})`.
   - Write: `update(/tenants/{tenantId}/memberships/{targetUserId}, { role: newRole })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Setting same role is a safe no-op.
8. **Audit Log Side Effects**: Emits `permission_assigned` event capturing `{ beforeRole, newRole }`.
9. **Failure Modes**: Caller not admin (`permission-denied`), target user not found (`not-found`).
10. **Security Notes**: Client SDK cannot modify `/memberships` directly; all role mutations pass through this audited handler.

---

## 5. `createAuditLogEvent`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Allows privileged workflows or certified external integration tools to append an immutable audit log record.
3. **Auth Requirements**: Active tenant member with manager or approver role (`tenant_admin`, `compliance_manager`, `security_manager`, `privacy_manager`, `ai_governance_manager`, `approver`).
4. **Input Schema**:
   ```typescript
   interface CreateAuditLogEventInput {
     tenantId: string;
     entityType: string;
     entityId: string;
     action: AuditActionType;
     beforeSummary?: Record<string, unknown> | null;
     afterSummary?: Record<string, unknown> | null;
     workflowContext?: string | null;
   }
   ```
5. **Validation Logic**: Validates required entity fields, extracts IP address and User Agent from request headers.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/memberships/{uid})`.
   - Write: `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Generates unique timestamped log document.
8. **Audit Log Side Effects**: Writes append-only audit event directly via Admin SDK.
9. **Failure Modes**: Unauthorized caller (`permission-denied`), missing parameters (`invalid-argument`).
10. **Security Notes**: Server automatically sets `timestamp: ISO UTC`, `actorId`, `actorEmail`, and `ipAddress` to prevent client spoofing.

---

## 6. `approveEvidence`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Formally approves evidence artifact, sets status to `valid`, updates next review deadline, and signs audit record.
3. **Auth Requirements**: Caller must hold `approver`, `compliance_manager`, `security_manager`, or `tenant_admin` role.
4. **Input Schema**:
   ```typescript
   interface ApproveEvidenceInput {
     tenantId: string;
     evidenceId: string;
     nextReviewDate?: string;
   }
   ```
5. **Validation Logic**: Verifies evidence exists, verifies caller is authorized approver, verifies evidence has valid storage path and SHA-256 hash.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/evidence/{evidenceId})`.
   - Write: `update(/tenants/{tenantId}/evidence/{evidenceId}, { status: 'valid', reviewedBy: uid, reviewedAt: now })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Approving already valid evidence updates review timestamp.
8. **Audit Log Side Effects**: Emits `approve` event in `/tenants/{tenantId}/audit_logs`.
9. **Failure Modes**: Evidence not found (`not-found`), unauthorized (`permission-denied`).
10. **Security Notes**: Enforces Four-Eyes Principle; prevents contributor self-approvals.

---

## 7. `rejectEvidence`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Rejects evidence submission, captures mandatory remediation feedback, and alerts contributor.
3. **Auth Requirements**: Caller must hold `approver`, `compliance_manager`, `security_manager`, or `tenant_admin` role.
4. **Input Schema**:
   ```typescript
   interface RejectEvidenceInput {
     tenantId: string;
     evidenceId: string;
     rejectionReason: string;
   }
   ```
5. **Validation Logic**: Validates `rejectionReason` is non-empty string (>10 chars).
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/evidence/{evidenceId})`.
   - Write: `update(/tenants/{tenantId}/evidence/{evidenceId}, { status: 'rejected', rejectionReason })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Updates rejection reason and timestamp.
8. **Audit Log Side Effects**: Logs `reject` action with `rejectionReason`.
9. **Failure Modes**: Missing rejection reason (`invalid-argument`), unauthorized (`permission-denied`).
10. **Security Notes**: Captures reviewer identity in non-repudiable audit log.

---

## 8. `transitionPolicyStatus`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Moves policy through lifecycle (`draft` -> `under_review` -> `approved` -> `active` -> `retired`).
3. **Auth Requirements**: `compliance_manager`, `security_manager`, `privacy_manager`, `approver`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface TransitionPolicyInput {
     tenantId: string;
     policyId: string;
     targetStatus: 'draft' | 'under_review' | 'approved' | 'active' | 'retired';
   }
   ```
5. **Validation Logic**: Validates state transition graph; transitions to `approved` or `active` capture approver ID and timestamp.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/policies/{policyId})`.
   - Write: `update(/tenants/{tenantId}/policies/{policyId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Transitioning to current status is a no-op.
8. **Audit Log Side Effects**: Emits `status_transition` event.
9. **Failure Modes**: Invalid transition (`failed-precondition`), unauthorized (`permission-denied`).
10. **Security Notes**: Locks policy content once status becomes `active`.

---

## 9. `transitionDPIAStatus`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Governs GDPR Article 35 DPIA review, DPO consultation sign-off, and formal approval.
3. **Auth Requirements**: `privacy_manager`, `compliance_manager`, `approver`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface TransitionDPIAInput {
     tenantId: string;
     dpiaId: string;
     targetStatus: DPIAStatus;
     dpoOpinionNotes?: string;
   }
   ```
5. **Validation Logic**: If target status is `dpo_consulted` or `approved`, `dpoOpinionNotes` must be documented.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/dpia_assessments/{dpiaId})`.
   - Write: `update(/tenants/{tenantId}/dpia_assessments/{dpiaId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Updates assessment state and timestamp.
8. **Audit Log Side Effects**: Logs DPIA status change with DPO signature record.
9. **Failure Modes**: Missing DPO notes on approval (`invalid-argument`), unauthorized (`permission-denied`).
10. **Security Notes**: Complies with GDPR Article 35(2) requirement to document DPO advice.

---

## 10. `transitionTIAStatus`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Evaluates international data transfer risk assessments (Chapter V GDPR) and records legal sign-off.
3. **Auth Requirements**: `privacy_manager`, `compliance_manager`, `approver`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface TransitionTIAInput {
     tenantId: string;
     tiaId: string;
     targetStatus: 'draft' | 'in_review' | 'approved' | 'restricted' | 'rejected';
   }
   ```
5. **Validation Logic**: Verifies destination country assessment and transfer mechanism (SCCs/BCRs) are documented before approval.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/tia_assessments/{tiaId})`.
   - Write: `update(/tenants/{tenantId}/tia_assessments/{tiaId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Status updates are idempotent.
8. **Audit Log Side Effects**: Emits `status_transition` audit event.
9. **Failure Modes**: Missing transfer safeguards (`failed-precondition`), unauthorized (`permission-denied`).
10. **Security Notes**: Protects against unlawful international personal data transfers.

---

## 11. `createROPAFromTemplate`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Standardized ROPA activity creation with validation against legal bases and pre-linked subprocessors.
3. **Auth Requirements**: `privacy_manager`, `compliance_manager`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface CreateROPAFromTemplateInput {
     tenantId: string;
     activityCode: string;
     activityName: string;
     purpose: string;
     legalBasis: LegalBasisType;
     legalBasisRationale: string;
     isSpecialCategoryData: boolean;
     dataSubjectCategories: string[];
     personalDataCategories: string[];
     retentionPeriodDescription: string;
     retentionPeriodMonths: number;
     dataSecurityMeasuresSummary: string;
     processorIds?: string[];
     involvesInternationalTransfer?: boolean;
     dpiaRequired?: boolean;
   }
   ```
5. **Validation Logic**: Validates legal basis against GDPR Art. 6 enum; if `isSpecialCategoryData == true`, verifies Art. 9 basis is specified.
6. **Firestore Reads & Writes**:
   - Write: `set(/tenants/{tenantId}/ropa_entries/{ropaId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Unique `activityCode` check per tenant.
8. **Audit Log Side Effects**: Logs `ropa_entry` creation event.
9. **Failure Modes**: Duplicate code (`already-exists`), missing legal basis (`invalid-argument`).
10. **Security Notes**: Enforces structured Art. 30 GDPR documentation standards.

---

## 12. `classifyAISystem`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Evaluates EU AI Act classification rules (Regulation 2024/1689), assigns risk tier (`prohibited`, `high_risk`, `minimal_risk`, `general_purpose_ai`), and locks assessment.
3. **Auth Requirements**: `ai_governance_manager`, `compliance_manager`, `security_manager`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface ClassifyAISystemInput {
     tenantId: string;
     aiSystemId: string;
     prohibitedPracticesCheck: {
       cognitiveBehavioralManipulation: boolean;
       vulnerabilityExploitation: boolean;
       socialScoring: boolean;
       predictivePolicing: boolean;
       untargetedFacialScraping: boolean;
       emotionRecognitionInWorkplaceOrEducation: boolean;
       biometricCategorizationSensitive: boolean;
       realTimeRemoteBiometricIdentification: boolean;
     };
     annexThreeCategory: string;
     isGeneralPurposeAI: boolean;
     justificationSummary: string;
   }
   ```
5. **Validation Logic**: Deterministic logic tree:
   - Any prohibited practice == `true` -> Tier = `prohibited`
   - `annexThreeCategory != 'none'` -> Tier = `high_risk`
   - `isGeneralPurposeAI == true` -> Tier = `general_purpose_ai`
   - Otherwise -> Tier = `minimal_risk`
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/ai_systems/{aiSystemId})`.
   - Atomic Batch Write: `set(/tenants/{tenantId}/ai_assessments/{assessmentId})`, `update(/tenants/{tenantId}/ai_systems/{aiSystemId}, { riskTier })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Deterministic evaluation from input answers.
8. **Audit Log Side Effects**: Emits classification audit event with calculated risk tier.
9. **Failure Modes**: AI system not found (`not-found`), incomplete questionnaire (`invalid-argument`).
10. **Security Notes**: Prevents client-side manipulation of AI risk classification.

---

## 13. `transitionAIAssessmentStatus`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Governs formal sign-offs on Fundamental Rights Impact Assessments (FRIA) and AI risk assessments.
3. **Auth Requirements**: `ai_governance_manager`, `compliance_manager`, `approver`, or `tenant_admin`.
4. **Input Schema**:
   ```typescript
   interface TransitionAIAssessmentInput {
     tenantId: string;
     assessmentId: string;
     targetStatus: 'draft' | 'under_review' | 'approved' | 'rejected';
   }
   ```
5. **Validation Logic**: Validates assessment document exists; transitions to `approved` record approver UID and timestamp.
6. **Firestore Reads & Writes**:
   - Read: `get(/tenants/{tenantId}/ai_assessments/{assessmentId})`.
   - Write: `update(/tenants/{tenantId}/ai_assessments/{assessmentId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Updates assessment status idempotently.
8. **Audit Log Side Effects**: Logs `status_transition` event.
9. **Failure Modes**: Assessment not found (`not-found`), unauthorized (`permission-denied`).
10. **Security Notes**: Required for EU AI Act Article 27 FRIA governance.

---

## 14. `logAIIncident`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Logs serious AI malfunctions; automatically calculates statutory market surveillance reporting deadlines (2 days vs 15 days under Art. 73 EU AI Act).
3. **Auth Requirements**: Any tenant contributor, AI manager, security manager, or tenant admin.
4. **Input Schema**:
   ```typescript
   interface LogAIIncidentInput {
     tenantId: string;
     aiSystemId: string;
     title: string;
     severity: AIIncidentSeverity;
     description: string;
     isFatalOrSevereHealthImpact: boolean;
     isCriticalInfrastructureDisruption: boolean;
     isFundamentalRightsBreach: boolean;
     rootCauseAnalysis: string;
     immediateCorrectiveAction: string;
   }
   ```
5. **Validation Logic**: Calculates deadline: if `isFatalOrSevereHealthImpact || isCriticalInfrastructureDisruption` -> `T + 2 days`, else -> `T + 15 days`.
6. **Firestore Reads & Writes**:
   - Write: `set(/tenants/{tenantId}/ai_incidents/{incidentId})`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Generates unique incident reference ID (`INC-AI-XXXXXX`).
8. **Audit Log Side Effects**: Logs critical incident event.
9. **Failure Modes**: Missing severity or title (`invalid-argument`).
10. **Security Notes**: Automates strict regulatory deadline compliance.

---

## 15. `generateTenantEvidenceExport`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Asynchronously packages tenant evidence, control matrices, and audit records into a timestamped ZIP archive in Cloud Storage.
3. **Auth Requirements**: `tenant_admin`, `compliance_manager`, `security_manager`, `privacy_manager`, `ai_governance_manager`, `auditor`.
4. **Input Schema**:
   ```typescript
   interface GenerateExportInput {
     tenantId: string;
     exportType: 'tenant_evidence_package_zip' | 'gdpr_ropa_xlsx' | 'eu_ai_act_technical_file_pdf';
     filters?: Record<string, unknown>;
   }
   ```
5. **Validation Logic**: Verifies export type is supported, queues job in `/tenants/{tenantId}/export_jobs/{jobId}`.
6. **Firestore Reads & Writes**:
   - Write: `set(/tenants/{tenantId}/export_jobs/{jobId}, { status: 'queued' })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Client tracks job by `jobId`.
8. **Audit Log Side Effects**: Emits `export_generated` audit record.
9. **Failure Modes**: Unauthorized role (`permission-denied`).
10. **Security Notes**: Export archive stored under `/tenants/{tenantId}/exports/` with 24-hour signed download URL expiration.

---

## 16. `generateFrameworkReadinessReport`
1. **Trigger Type**: HTTPS Callable (`onCall`)
2. **Purpose**: Compiles on-demand executive framework readiness report (PDF) summarizing control implementation percentages and gaps.
3. **Auth Requirements**: `tenant_admin`, `compliance_manager`, `security_manager`, `privacy_manager`, `ai_governance_manager`, `auditor`, `approver`.
4. **Input Schema**:
   ```typescript
   interface ReadinessReportInput {
     tenantId: string;
     frameworkId: string; // e.g. 'gdpr', 'eu_ai_act', 'iso_27001'
   }
   ```
5. **Validation Logic**: Validates `frameworkId` is enabled for tenant.
6. **Firestore Reads & Writes**:
   - Write: `set(/tenants/{tenantId}/export_jobs/{jobId}, { status: 'queued', exportType: 'framework_readiness_pdf' })`, `set(/tenants/{tenantId}/audit_logs/{logId})`.
7. **Idempotency Requirements**: Enqueues report compilation.
8. **Audit Log Side Effects**: Logs readiness report generation event.
9. **Failure Modes**: Framework not enabled (`failed-precondition`), unauthorized (`permission-denied`).
10. **Security Notes**: Provides verifiable compliance snapshots for audit defense.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Architecture & Security**: [[ARCHITECTURE|System Architecture]], [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules & Functions]], [[security-model|Security Model]], [[AUDIT_LOG_DESIGN|Audit Log Design]]
- **Workflows & Operations**: [[backend-workflows|Backend Workflows]], [[NOTIFICATIONS_AND_SCHEDULED_JOBS_DESIGN|Notifications & Cron]], [[DASHBOARD_AND_REPORTING_ARCHITECTURE|Dashboard & Reporting]], [[runbooks|Operational Runbooks]]
- **Domain Handlers**: [[GDPR_MODULE_DESIGN|GDPR Engine]], [[EU_AI_ACT_MODULE_DESIGN|AI Act Engine]], [[ISO_MANAGEMENT_SYSTEM_DESIGN|ISO Management Engine]], [[PROCESSOR_AND_TRANSFER_MANAGEMENT|Processor & Transfer Handlers]], [[PROCESSOR_CERTIFICATIONS_AND_ASSURANCE|Processor Assurance Handlers]], [[EVIDENCE_MODULE_DESIGN|Evidence Handlers]]

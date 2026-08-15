# Roles and Permissions Matrix Specification: euroGovernance

## 1. Role Definitions

| Role Identifier | Role Name | Scope & Authority Description |
| :--- | :--- | :--- |
| `platform_admin` | Platform Administrator | Global platform operator. Manages global framework catalog (`/frameworks`), system-wide settings, tenant provisioning, and platform maintenance. |
| `tenant_admin` | Tenant Administrator | Organization administrator. Full governance over tenant settings, billing, user invitations, role assignments, department mappings, and tenant archival. |
| `compliance_manager`| Compliance Manager / CCO | Broad GRC authority. Manages control library, framework applicability, cross-domain risks, policy approvals, and audit export generation. |
| `privacy_manager` | Privacy Manager / DPO | Dedicated data protection authority. Full management over GDPR ROPA, DPIA assessments, TIA reviews, 72h breach tracker, and DSR fulfillment. |
| `ai_governance_manager`| AI Governance Manager | Dedicated AI compliance authority. Manages EU AI Act system register, classification assessments, FRIA assessments, AI incidents, and post-market monitoring. |
| `security_manager` | Security Manager / CISO | Information security authority. Oversees ISO 27001/42001 controls, system asset register, vendor risk tiers, security incidents, and technical safeguards. |
| `auditor` | External / Internal Auditor | Read-only compliance observer. Full read access to evidence, control mappings, policies, risk register, and audit logs. Zero mutation privileges. |
| `contributor` | Compliance Contributor | Operational contributor. Can upload evidence files, submit drafts, create issues, propose risks, and complete assigned compliance tasks. Cannot approve. |
| `viewer` | Read-Only Viewer | Stakeholder observer. Read-only access to active policies, high-level dashboards, and public tenant documentation. No access to sensitive breach logs. |
| `approver` | Business Approver | Sign-off authority. Designated authority to approve/reject evidence, sign off on policies, approve DPIA/TIA assessments, and close ISO nonconformities. |

---

## 2. Permission Matrix by Module

**Legend**:
- **R**: Read / View
- **C**: Create / Draft
- **U**: Update / Edit
- **D**: Delete
- **A**: Approve / Formal Sign-Off
- **X**: Export / Generate Package
- **—**: No Access

| Module | `platform_admin` | `tenant_admin` | `compliance_manager` | `privacy_manager` | `ai_governance_manager` | `security_manager` | `auditor` | `contributor` | `viewer` | `approver` |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| **Tenant Settings** | R, C, U, D | R, U | R | R | R | R | R | — | — | — |
| **User Invites & Roles**| R, C, U, D | R, C, U, D | R | R | R | R | R | — | — | — |
| **Controls Library** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U | R, C, U | R, C, U | R | R | R | R, U, A |
| **Evidence Repository**| R, C, U, D* | R, C, U, D | R, C, U, D, A | R, C, U, A | R, C, U, A | R, C, U, A | R | R, C | R | R, C, U, A |
| **Policies** | R, C, U, D* | R, C, U, D | R, C, U, D, A | R, C, U, A | R, C, U | R, C, U, A | R | R | R | R, U, A |
| **Risk Register** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U | R, C, U | R, C, U, D | R | R, C | R | R, U |
| **Issues & Tasks** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U, D | R, C, U, D | R, C, U, D | R | R, C, U | R | R, C, U |
| **Vendors Register** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U | R, C, U | R, C, U, D | R | R | R | R |
| **System Assets** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U | R, C, U | R, C, U, D | R | R | R | R |
| **GDPR: ROPA** | R, C, U, D* | R, C, U, D | R, C, U | R, C, U, D | R | R | R | R | R | R |
| **GDPR: DPIA & TIA** | R, C, U, D* | R, C, U, D | R, C, U, A | R, C, U, D, A | R | R | R | R, C | R | R, U, A |
| **GDPR: Breaches** | R, C, U, D* | R, C, U, D | R, C, U | R, C, U, D | — | R, C, U | R | — | — | R |
| **GDPR: DSR Tracker** | R, C, U, D* | R, C, U, D | R, C, U | R, C, U, D | — | — | R | R, C | — | R |
| **AI Act: AI Systems** | R, C, U, D* | R, C, U, D | R, C, U | R, C, U | R, C, U, D | R, C, U | R | R, C | R | R |
| **AI Act: Assessments**| R, C, U, D* | R, C, U, D | R, C, U, A | R | R, C, U, D, A | R | R | R, C | R | R, U, A |
| **AI Act: Incidents** | R, C, U, D* | R, C, U, D | R, C, U | — | R, C, U, D | R, C, U | R | R, C | — | R |
| **EU Data Act Assets** | R, C, U, D* | R, C, U, D | R, C, U, D | R, C, U | R | R, C, U | R | R, C | R | R |
| **ISO Management** | R, C, U, D* | R, C, U, D | R, C, U, D, A | R | R, C, U | R, C, U, D, A | R | R, C | R | R, U, A |
| **Audit Exports** | R, X | R, X | R, X | R, X | R, X | R, X | R, X | — | — | R, X |
| **Audit Logs** | R (Global) | R (Tenant) | R (Tenant) | R (Tenant) | R (Tenant) | R (Tenant) | R (Tenant) | — | — | — |

*\*Note: `platform_admin` mutations on GRC catalogs apply to global reference templates under `/frameworks`, not direct alteration of private customer operational tenant data.*

---

## 3. Actions Allowed Directly from Client (Firestore Security Rules)

The following CRUD operations are authorized directly via the Firebase Web Client SDK, strictly enforced by [firestore.rules](file:///Users/remon/Documents/euroGovernance/firestore.rules):

1. **Document Reads / Subscriptions**:
   - Querying tenant controls, evidence metadata, policies, risks, tasks, vendors, assets, ROPA entries, and AI systems (if caller is active tenant member).
   - Real-time listening to user notifications (`/tenants/{tenantId}/notifications`).
2. **Draft & Working Record Creation**:
   - Creating tasks and issues (`contributor` and higher).
   - Submitting new evidence records (`status: 'under_review'`) along with Storage file upload (`contributor` and higher).
   - Creating draft risk entries, vendor assessments, or system asset records (`compliance_manager`, `security_manager`, `privacy_manager`, `ai_governance_manager`).
3. **Operational Field Updates**:
   - Updating task completion status and assigning remediation notes (`assigneeId` or `contributor`).
   - Updating non-sensitive control implementation notes (`compliance_manager`, `security_manager`).
   - Modifying draft ROPA descriptions or vendor contact details prior to formal review.
4. **Direct Deletions**:
   - Deleting non-critical draft records or deprecated items (restricted to `tenant_admin` or relevant module managers).

---

## 4. Actions Restricted to Cloud Functions (Privileged Server API)

The following 12 operations **must never be executed directly from the client**:

1. **`createTenant`**: Initializes tenant document, organization settings, and first `tenant_admin`.
2. **`inviteUserToTenant`**: Generates cryptographic token hash, sets 7-day expiration, and dispatches email invitation.
3. **`acceptTenantInvite`**: Validates invite token, creates `/tenants/{tenantId}/memberships/{userId}`, and updates invite state.
4. **`assignTenantRole`**: Re-assigns member role; prevents self-escalation; emits `permission_assigned` audit log.
5. **`approveEvidence`**: Evaluates approver permissions, transitions status to `valid`, updates next review deadline, and signs audit record.
6. **`rejectEvidence`**: Transitions status to `rejected`, stores rejection feedback, and prompts contributor remediation.
7. **`transitionPolicyStatus`**: Enforces authorized sign-offs before moving policy from `under_review` to `approved` or `active`.
8. **`transitionDPIAStatus`**: Validates DPO opinion notes before formal DPIA approval.
9. **`transitionTIAStatus`**: Validates international transfer legal safeguards before approving TIA.
10. **`classifyAISystem`**: Executes deterministic classification rules under the EU AI Act (Regulation 2024/1689), assigns risk tier (`prohibited`, `high_risk`, `minimal_risk`, `general_purpose_ai`), and locks the assessment.
11. **`logAIIncident`**: Computes statutory 2-day / 15-day reporting deadlines (Art. 73 EU AI Act) and alerts the AI Governance Manager.
12. **`generateTenantEvidenceExport`**: Asynchronously packages files from Cloud Storage, compiles control matrices, and generates signed download links.
13. **`recordAuditLog`**: Writes immutable, non-repudiable audit events directly to `/tenants/{tenantId}/audit_logs`.

---

## 5. Tenant-Scoped vs. Platform-Scoped Permissions

### Platform-Scoped Authority (`platform_admin`)
- Root collections: `/frameworks/{frameworkId}`, `/frameworks/{frameworkId}/requirements`, `/frameworks/{frameworkId}/master_controls`.
- Can provision new tenant organizations, initiate platform-wide maintenance, inspect global billing, and enforce platform security policies.
- **Boundary Restriction**: `platform_admin` cannot view or modify tenant confidential evidence or internal breach records unless explicitly granted an auditor role by the customer.

### Tenant-Scoped Authority (`tenant_admin` through `viewer`)
- Strictly bound to `/tenants/{tenantId}/...`.
- Membership records in `/tenants/{tenantId}/memberships/{userId}` dictate permissions exclusively within that specific organization.
- Multi-tenancy isolation ensures a user with `tenant_admin` in Organization A possesses zero permissions in Organization B unless a distinct active membership document exists in Organization B.

---

## 6. Recommended Role Storage: Hybrid Model

### Storage Strategy
We implement a **Hybrid Identity & RBAC Model**:

1. **Authoritative Source (Membership Document)**:
   - Path: `/tenants/{tenantId}/memberships/{userId}`
   - Fields: `{ role: UserRole, status: 'active' | 'inactive' | 'suspended', department: string }`
   - *Why*: Instant revocation, zero propagation delay, and support for multi-tenant switching without forcing token refresh cycles.
2. **Acceleration Token (Firebase Auth Custom Claims)**:
   - Claims Payload: `{ platform_admin?: boolean, defaultTenantId?: string }`
   - *Why*: Provides immediate client bootstrap context and instant platform superadmin routing without Firestore lookups.

### Evaluation Flow
```
Client Request -> Firebase Auth JWT (Verified)
                      │
                      ▼
Security Rules: get(/tenants/{tenantId}/memberships/{request.auth.uid}).data
                      │
                      ├── If status == 'active' && role in allowedRoles -> ALLOW
                      └── Otherwise -> DENY (403 Forbidden)
```

---

## 7. Security Risks & Tradeoffs

| Risk Area | Severity | Tradeoff Analysis & Architectural Mitigation |
| :--- | :---: | :--- |
| **Token Claim Staleness** | High | Relying purely on custom claims requires users to re-authenticate or force token refresh on role changes. **Mitigation**: Security Rules check the live `/memberships/{userId}` Firestore document, guaranteeing real-time revocation. |
| **Over-Privileged Contributors** | Medium | Contributors must upload files to Cloud Storage. If unconstrained, they could overwrite other documents. **Mitigation**: Storage rules allow writes only under unique paths `/evidence/{evidenceId}/{fileName}` and forbid updates. |
| **Auditor Data Modification** | High | Auditors must inspect internal records without altering audit trails or control states. **Mitigation**: `auditor` role is blocked across all write/update/delete rules in `firestore.rules`. |
| **Rule Lookup Latency** | Low | Reading the membership document inside Firestore Security Rules incurs a lookup. **Mitigation**: Firestore internal rule engine caches document gets within the same atomic evaluation scope, eliminating duplicate billing or latency penalties on batch queries. |

---

## 8. Acceptance Criteria & Test Matrix

### Test Matrix for Role Access

| Scenario | Role Tested | Target Resource | Action | Expected Result |
| :--- | :--- | :--- | :--- | :--- |
| **TC-01** | `auditor` | `/tenants/{tenantA}/controls/ctl_01` | Read | **ALLOW** |
| **TC-02** | `auditor` | `/tenants/{tenantA}/controls/ctl_01` | Update title | **DENY** |
| **TC-03** | `contributor` | `/tenants/{tenantA}/evidence/ev_01` | Create draft evidence | **ALLOW** |
| **TC-04** | `contributor` | `/tenants/{tenantA}/evidence/ev_01` | Direct update status to `valid` | **DENY** |
| **TC-05** | `approver` | `approveEvidence({ tenantId, evidenceId })` | Call Cloud Function | **ALLOW** |
| **TC-06** | `viewer` | `/tenants/{tenantA}/breaches/br_01` | Read breach record | **DENY** |
| **TC-07** | `privacy_manager` | `/tenants/{tenantA}/ropa_entries/ropa_01` | Create/Update ROPA | **ALLOW** |
| **TC-08** | `privacy_manager` | `/tenants/{tenantA}/ai_systems/ai_01` | Classify AI System | **DENY** (Requires `ai_governance_manager`) |
| **TC-09** | `tenant_admin` | `/tenants/{tenantA}/audit_logs/log_01` | Delete audit log | **DENY** (Immutable) |
| **TC-10** | `tenant_admin` (Tenant A) | `/tenants/{tenantB}/controls/ctl_02` | Read or Write | **DENY** (Cross-tenant boundary) |

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Identity & Tenancy**: [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant & Identity Flows]], [[security-model|Security Model]]
- **Security Enforcement**: [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]], [[AUDIT_LOG_DESIGN|Audit Log Design]]
- **Testing & Verification**: [[testing|Testing Strategy]], [[EMULATOR_AND_TEST_PLAN|Emulator & Test Plan]]

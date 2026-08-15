# euroGovernance — Security Model & Authorization Specification

This document details the security architecture, role-based access control (RBAC), multi-tenant isolation, and data protection mechanisms enforced across **euroGovernance**.

---

## 1. Multi-Tenant Isolation Architecture

Tenant boundaries are enforced at the database level using declarative **Firestore Security Rules** and **Cloud Storage Rules**.

### 1.1 Tenant Resolution & Membership Lookup
Every tenant-scoped request is validated against the user's active membership document:
```
/tenants/{tenantId}/memberships/{request.auth.uid}
```

```javascript
function isTenantMember(tenantId) {
  return isAuthenticated() && (
    isPlatformAdmin() ||
    (exists(/databases/(default)/documents/tenants/$(tenantId)/memberships/$(request.auth.uid)) &&
     get(/databases/(default)/documents/tenants/$(tenantId)/memberships/$(request.auth.uid)).data.status == 'active')
  );
}
```

### 1.2 Isolation Invariants
1. **No Shared Collections**: All organizational compliance records (controls, evidence, risks, policies, audits, AI systems, GDPR records) reside strictly under `/tenants/{tenantId}/[subcollection]`.
2. **Deny-by-Default Perimeter**: The root security rule matches `/{document=**}` with `allow read, write: if false`. Access is only granted by explicit path matchers.
3. **Suspended User Lockout**: If a membership record has `status == 'suspended'`, all reads and writes are blocked immediately without requiring token revocation.

---

## 2. Role-Based Access Control (RBAC) Matrix

euroGovernance defines **9 distinct roles** with strict separation of duties:

| Role Identifier | Display Name | Core Purpose | Write Access Scope |
|---|---|---|---|
| `tenant_admin` | Tenant Administrator | Full tenant management, membership administration, role assignment. | All tenant collections; exclusive right to delete root records and manage memberships. |
| `compliance_manager` | Compliance Manager | Lead GRC operator; manages controls, policies, ISO scopes, SoA, audits. | Controls, Policies, ISO Management Layer, GDPR Assessments, Export Requests. |
| `security_manager` | Security Manager (CISO) | Manages technical security controls, security risks, asset criticality, incident response. | Technical Controls, Security Risks, Assets, Vendors, Breaches, AI Incidents. |
| `privacy_manager` | Privacy Manager (DPO) | Manages GDPR compliance, ROPA, DPIAs, TIAs, DSR requests, breach logs. | ROPA Entries, DPIA/TIA Assessments, DSR Requests, Data Breaches. |
| `ai_governance_manager` | AI Governance Lead | Manages AI Systems Register, AI Impact Assessments, FRIA, substantial changes. | AI Systems Register, AI Impact Assessments, Substantial Changes, Post-Market Logs. |
| `approver` | Compliance Approver | Senior officer authorized to execute Four-Eyes approvals. | Approves Evidence, Signs off Management Reviews, Approves DPIA/TIA/AI assessments. |
| `auditor` | Internal / External Auditor | Third-party or internal compliance auditor. | **Read-Only** across all tenant records; can submit append-only audit findings and review logs. |
| `contributor` | Technical Contributor | Engineer / Developer submitting compliance evidence and task updates. | Drafts Evidence records, updates Control implementation notes, updates assigned Remediation Tasks. |
| `viewer` | Read-Only Viewer | Read-only access to governance dashboards. | **Read-Only** across general tenant records; blocked from sensitive breach logs. |

---

## 3. Subcollection Permission Matrix

| Collection Path | Read Access | Create Access | Update Access | Delete Access |
|---|---|---|---|---|
| `/tenants/{tenantId}/memberships` | All Tenant Members | Cloud Function Only | Cloud Function Only | Cloud Function Only |
| `/tenants/{tenantId}/audit_logs` | Admin, Compliance, Security, Auditor | **DENIED** (Server Admin SDK Only) | **DENIED** | **DENIED** |
| `/tenants/{tenantId}/controls` | All Tenant Members | Admin, Compliance, Security, Privacy, AI Gov | Admin, Compliance, Security, Privacy, AI Gov, Contributor | Tenant Admin Only |
| `/tenants/{tenantId}/controls/{id}/reviews` | All Tenant Members | Admin, Compliance, Security, Approver, Auditor | **DENIED** (Append-Only) | **DENIED** |
| `/tenants/{tenantId}/evidence` | All Tenant Members | Admin, Compliance, Security, Privacy, AI Gov, Contributor (`status: under_review`) | Direct client update denied for `status`; metadata editable by Admin/Compliance/Security | Tenant Admin Only |
| `/tenants/{tenantId}/policies` | All Tenant Members | Admin, Compliance, Security, Privacy, AI Gov | Admin, Compliance, Security, Privacy, AI Gov | Tenant Admin Only |
| `/tenants/{tenantId}/risks` | All Tenant Members | Admin, Compliance, Security, Privacy, AI Gov | Admin, Compliance, Security, Privacy, AI Gov | Tenant Admin Only |
| `/tenants/{tenantId}/tasks` | All Tenant Members | Admin, Compliance, Security, Privacy, AI Gov, Contributor | Admin, Compliance, Security, Privacy, AI Gov, Contributor | Tenant Admin Only |
| `/tenants/{tenantId}/vendors` | All Tenant Members | Admin, Compliance, Security, Privacy | Admin, Compliance, Security, Privacy | Tenant Admin Only |
| `/tenants/{tenantId}/assets` | All Tenant Members | Admin, Compliance, Security, Privacy | Admin, Compliance, Security, Privacy | Tenant Admin Only |
| `/tenants/{tenantId}/ropa_entries` | All Tenant Members | Admin, Privacy, Compliance | Admin, Privacy, Compliance | Tenant Admin Only |
| `/tenants/{tenantId}/dpia_assessments` | All Tenant Members | Admin, Privacy, Compliance | Admin, Privacy, Compliance, Approver | Tenant Admin Only |
| `/tenants/{tenantId}/breaches` | Admin, Privacy, Security, Compliance, Auditor | Admin, Privacy, Security, Compliance | Admin, Privacy, Security, Compliance | Tenant Admin Only |
| `/tenants/{tenantId}/dsr_requests` | All Tenant Members | Admin, Privacy, Compliance | Admin, Privacy, Compliance | Tenant Admin Only |
| `/tenants/{tenantId}/ai_systems` | All Tenant Members | Admin, AI Gov, Compliance, Security | Admin, AI Gov, Compliance, Security (Cannot modify `riskTier`) | Tenant Admin Only |
| `/tenants/{tenantId}/ai_assessments` | All Tenant Members | Admin, AI Gov, Compliance | Admin, AI Gov, Compliance, Approver | Tenant Admin Only |
| `/tenants/{tenantId}/ai_incidents` | All Tenant Members | Admin, AI Gov, Compliance, Security | Admin, AI Gov, Compliance, Security | Tenant Admin Only |
| `/tenants/{tenantId}/iso_scope_statements` | All Tenant Members | Admin, Compliance, Security, AI Gov | Admin, Compliance, Security, AI Gov | Tenant Admin Only |
| `/tenants/{tenantId}/iso_objectives` | All Tenant Members | Admin, Compliance, Security, AI Gov | Admin, Compliance, Security, AI Gov | Tenant Admin Only |
| `/tenants/{tenantId}/iso_soa_entries` | All Tenant Members | Admin, Compliance, Security, AI Gov | Admin, Compliance, Security, AI Gov | Tenant Admin Only |
| `/tenants/{tenantId}/iso_internal_audits` | All Tenant Members | Admin, Compliance, Security, AI Gov, Auditor | Admin, Compliance, Security, AI Gov, Auditor | Tenant Admin Only |
| `/tenants/{tenantId}/iso_management_reviews` | All Tenant Members | Admin, Compliance, Security, AI Gov, Approver | Admin, Compliance, Security, AI Gov, Approver | Tenant Admin Only |
| `/tenants/{tenantId}/summary_metrics` | All Tenant Members | **DENIED** (Materialized by Server) | **DENIED** | **DENIED** |
| `/tenants/{tenantId}/notifications` | Recipient Member Only (`recipientId == uid`) | **DENIED** (Server Dispatched) | Recipient Member (`isRead` flag) | **DENIED** |
| `/tenants/{tenantId}/export_jobs` | Requester or Tenant Admin | Admin, Compliance, Security, Privacy, AI Gov, Auditor | **DENIED** (Backend Transitioned) | **DENIED** |

---

## 4. Cloud Storage Security Architecture

Cloud Storage paths are protected by `storage.rules`:

### 4.1 Evidence Uploads
- **Path Pattern**: `/tenants/{tenantId}/evidence/{evidenceId}/{fileName}`
- **Permissions**:
  - Read: Allowed for authenticated members of `{tenantId}`.
  - Create: Allowed for authenticated members of `{tenantId}`. File size must not exceed 25MB (`request.resource.size < 25 * 1024 * 1024`). Allowed content types: `application/pdf`, `image/png`, `image/jpeg`, `text/plain`, `application/json`, `text/csv`.
  - Update/Overwrite: **DENIED**. Existing evidence files cannot be modified in place.
  - Delete: Allowed exclusively for `tenant_admin`.

### 4.2 Compliance Export Packages
- **Path Pattern**: `/tenants/{tenantId}/exports/{jobId}/{fileName}`
- **Permissions**:
  - Read: Allowed for authenticated members of `{tenantId}`.
  - Write: **DENIED** for all client connections. Artifacts are written exclusively by the Cloud Functions Admin SDK.

---

## 5. Privileged Operations & Four-Eyes Principle Enforcement

Certain high-risk compliance actions cannot be performed via direct client database writes and must route through Cloud Functions v2:

### 5.1 Evidence Approval & Rejection (`approveEvidence`, `rejectEvidence`)
- **Enforcement**:
  1. The caller must possess the `approver`, `compliance_manager`, `security_manager`, or `tenant_admin` role.
  2. **Four-Eyes Principle**: `caller.uid !== evidence.uploadedBy`. The uploader cannot approve their own evidence.
  3. Rejection requires a mandatory string comment (`rejectionReason`).
  4. Status update and audit event are written atomically.

### 5.2 EU AI Act Risk Tier Classification (`classifyAiSystemRisk`)
- **Enforcement**:
  1. Direct client updates to the `riskTier` field in Firestore are blocked by security rules (`request.resource.data.riskTier == resource.data.riskTier`).
  2. Classification logic evaluates Article 5 prohibitions and Annex III high-risk criteria deterministically on the server.
  3. Mutates `riskTier`, `riskRationale`, and `classifiedAt` via Admin SDK and logs the audit record.

### 5.3 Tenant Provisioning & Membership Lifecycle (`createTenant`, `inviteTenantMember`, `acceptTenantInvite`, `revokeMembership`)
- **Enforcement**:
  1. Direct client creation of documents in `/invitations` or `/tenants/{id}/memberships` is blocked (`allow write: if false`).
  2. Invitations store a cryptographically secure token hash (`tokenHash`).
  3. When an invitation is accepted, membership creation and invitation status transition execute in a Firestore transaction.

---

## 6. Immutable Audit Logging Guarantee

Audit logging is implemented with strict defense-in-depth:
1. **Database Layer**: `firestore.rules` enforces `allow create, update, delete: if false` on `/tenants/{tenantId}/audit_logs/{logId}`.
2. **Server Helper Layer**: [`functions/src/lib/audit.ts`](file:///Users/remon/Documents/euroGovernance/functions/src/lib/audit.ts) writes audit events directly via Admin SDK.
3. **Actor Immutability**: Every audit event captures `actorId`, `actorEmail`, `action`, `resourceType`, `resourceId`, `details`, `ipAddress`, `userAgent`, and `timestamp`.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Security & Authorization**: [[ROLES_AND_PERMISSIONS|Roles & Permissions]], [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]], [[AUDIT_LOG_DESIGN|Audit Log Design]]
- **Identity & Tenancy**: [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant & Identity Flows]]
- **Backend Infrastructure**: [[CLOUD_FUNCTIONS_PLAN|Cloud Functions Plan]], [[backend-workflows|Backend Workflows]]

# euroGovernance — Architecture Specification

**System**: Multi-Tenant B2B GRC SaaS on Google Cloud / Firebase  
**Target Coverage**: GDPR, EU AI Act, EU Data Act, ISO 27001:2022, ISO 42001:2023  
**Primary Region**: `europe-west3` (Frankfurt, Germany)  
**Primary Client**: Web Application (`apps/web` using Next.js 14 App Router, React, TypeScript)

---

## 1. High-Level System Architecture

euroGovernance is architected as an EU-sovereign compliance operating system. It combines direct client reads guarded by database security rules with an isolated server-side execution environment for privileged state machines, deterministic risk scoring, and immutable audit logs.

```mermaid
flowchart TB
    subgraph ClientLayer [Client Layer - Untrusted Browser Environment]
        WebApp["Next.js Web Client (apps/web)"]
    end

    subgraph EdgeLayer [Edge & Authentication Services]
        Hosting["Firebase Hosting (europe-west3)"]
        AuthService["Firebase Authentication (EU Identity Pool)"]
    end

    subgraph PrivilegedBackend [Privileged Server Boundary (Node 20 / Cloud Functions v2)]
        CF_Tenants["Tenant & Membership Service"]
        CF_GRC["GRC & Workflow Engine"]
        CF_GDPR["GDPR Subsystem Engine"]
        CF_AI["EU AI Act Classification Engine"]
        CF_ISO["ISO Management System"]
        CF_Audit["Immutable Audit Log Dispatcher"]
        CF_Metrics["Metrics Materialization Service"]
        CF_Exports["Compliance Export Processor"]
        CF_Scheduler["Daily Expiry & Cron Service"]
    end

    subgraph StorageLayer [Tenant-Isolated Storage Layer (europe-west3)]
        FirestoreDB[("Cloud Firestore\n/tenants/{tenantId}/...")]
        CloudStorage[("Cloud Storage Buckets\n/tenants/{tenantId}/...")]
    end

    WebApp -->|HTTPS / Assets| Hosting
    WebApp -->|Sign In / MFA / Tokens| AuthService
    WebApp -->|Direct Filtered Reads (Guarded by Rules)| FirestoreDB
    WebApp -->|Upload Evidence Files (Guarded by Rules)| CloudStorage
    WebApp -->|Call Privileged Endpoints| CF_Tenants
    WebApp -->|Call Privileged Endpoints| CF_GRC
    WebApp -->|Call Privileged Endpoints| CF_GDPR
    WebApp -->|Call Privileged Endpoints| CF_AI
    WebApp -->|Call Privileged Endpoints| CF_ISO
    WebApp -->|Trigger Export / Metrics| CF_Exports

    CF_Tenants -->|Admin SDK| FirestoreDB
    CF_GRC -->|Admin SDK| FirestoreDB
    CF_GDPR -->|Admin SDK| FirestoreDB
    CF_AI -->|Admin SDK| FirestoreDB
    CF_ISO -->|Admin SDK| FirestoreDB
    CF_Audit -->|Admin SDK / Append-Only| FirestoreDB
    CF_Metrics -->|Aggregate & Materialize| FirestoreDB
    CF_Exports -->|Assemble & Upload ZIP| CloudStorage
    CF_Exports -->|Update Job Record| FirestoreDB
    CF_Scheduler -->|Check Review Dates & Expiries| FirestoreDB
```

---

## 2. Component Boundaries & Responsibilities

### 2.1 Untrusted Client Layer (`apps/web`)
- **Technology**: Next.js 14.2 App Router, React 18, TypeScript, TailwindCSS/Vanilla CSS.
- **Responsibilities**:
  - Render user interface, forms, dashboards, and live query listeners.
  - Authenticate users via Firebase Authentication and maintain active tenant session context.
  - Submit direct updates for standard fields where permitted by security rules.
  - Dispatch requests to Cloud Functions for privileged state transitions.
- **Trust Assumption**: Untrusted. All inputs, permissions, and parameters must be re-validated on the backend.

### 2.2 Security Rules Perimeter (`firestore.rules` & `storage.rules`)
- **Technology**: Declarative Firebase Security Rules (Version 2).
- **Responsibilities**:
  - Enforce absolute multi-tenant data isolation: a user can only read or write documents within `/tenants/{tenantId}/...` if they have an active membership in `{tenantId}`.
  - Enforce role-based access control (RBAC): restrict view-only roles (`auditor`, `viewer`) from mutating operational records.
  - Block direct client mutations to immutable collections: `/tenants/{tenantId}/audit_logs`, `/tenants/{tenantId}/summary_metrics`, and `/tenants/{tenantId}/exports`.
  - Enforce Storage path isolation and deny direct file overwrites.

### 2.3 Privileged Backend Service (`functions/src`)
- **Technology**: Google Cloud Functions v2 (Node.js 20), Firebase Admin SDK.
- **Responsibilities**:
  - Execute complex state machines (e.g. Evidence Four-Eyes approval, Risk Acceptance, Invitation workflows).
  - Execute deterministic classification logic (e.g. EU AI Act Article 6/9 Risk Tiering).
  - Materialize aggregate tenant compliance metrics (`computeAndStoreTenantMetrics`).
  - Generate compliance evidence dossiers and framework readiness export packages.
  - Guarantee append-only audit trail logging for all administrative and compliance mutations.

### 2.4 Data & Storage Layer
- **Cloud Firestore**: Document-oriented database partitioned by tenant container. Global master definitions (frameworks, control catalogs) reside at root `/frameworks/{frameworkId}` as read-only references for authenticated users.
- **Cloud Storage**: Object storage partitioned by tenant bucket path: `tenants/{tenantId}/evidence/...` and `tenants/{tenantId}/exports/...`.

---

## 3. Trust Boundaries & Interaction Model

```mermaid
flowchart TD
    subgraph ClientZone [Untrusted Zone: Browser Client]
        Client["Next.js Web Client"]
    end

    subgraph PerimeterZone [Security Perimeter: Rules Enforcement]
        FSRules["Firestore Security Rules\n- Tenant Isolation\n- Membership Validation\n- Role-based Field Guardrails"]
        GSRules["Storage Security Rules\n- Tenant Path Scoping\n- File Size & Type Checks\n- Overwrite Denials"]
    end

    subgraph PrivilegedZone [Privileged Zone: Cloud Functions & Admin SDK]
        AuthHelper["auth-helpers.ts\n- verifyTenantMembership()\n- verifyAnyTenantRole()"]
        Handlers["State Machine Handlers\n- Four-Eyes Approvals\n- AI Risk Classifier\n- Export Job Generator"]
        AuditEmitter["lib/audit.ts\n- logAuditEvent() (Append-Only)"]
    end

    subgraph DataZone [Data Layer (europe-west3)]
        Firestore[("Cloud Firestore")]
        Storage[("Cloud Storage")]
    end

    Client -->|1. Direct Query / Draft Mutation| FSRules
    FSRules -->|Permitted?| Firestore
    Client -->|2. Upload Evidence Binary| GSRules
    GSRules -->|Permitted?| Storage
    Client -->|3. Call Function (approveEvidence, classifyAiSystemRisk, etc.)| AuthHelper
    AuthHelper -->|Verified Role & Active Member| Handlers
    Handlers -->|Admin SDK Mutate| Firestore
    Handlers -->|Emit Audit Log| AuditEmitter
    AuditEmitter -->|Direct Admin Write| Firestore
    Handlers -->|Store Export Dossier| Storage
```

---

## 4. Multi-Tenant Data Model

### Tenant Isolation Guarantee
Every tenant is isolated in its own sub-tree under `/tenants/{tenantId}`. Security rules guarantee that:
1. `request.auth.uid` must resolve to an active document in `/tenants/{tenantId}/memberships/{request.auth.uid}`.
2. Cross-tenant queries (e.g. querying Tenant B data using Tenant A credentials) fail unconditionally with `PERMISSION_DENIED`.
3. Collection group queries are prohibited for tenant-scoped collections.

---

## 5. Region Sovereignty & Compliance Guarantees

- **Primary Cloud Region**: `europe-west3` (Frankfurt, Germany, European Union).
- **Data Residency**: All Firestore documents, Cloud Storage objects, and Cloud Function executions reside exclusively in Frankfurt.
- **GDPR Article 28 / Chapter V**: No personal or compliance data leaves the Frankfurt region during standard processing.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Data & Storage**: [[data-model|Data Model]], [[FIRESTORE_SCHEMA_AND_QUERIES|Firestore Schema & Queries]], [[INDEXES_AND_PERFORMANCE_REVIEW|Indexes & Performance]]
- **Security & Tenancy**: [[TENANT_MODEL_AND_IDENTITY_FLOWS|Tenant & Identity Flows]], [[security-model|Security Model]], [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]]
- **Backend & Platform**: [[CLOUD_FUNCTIONS_PLAN|Cloud Functions Plan]], [[backend-workflows|Backend Workflows]], [[DASHBOARD_AND_REPORTING_ARCHITECTURE|Dashboard & Reporting Architecture]]
- **Governance**: [[FRAMEWORK_AND_CONTROLS_ENGINE|Framework & Controls Engine]], [[domain-modules|Domain Modules]]

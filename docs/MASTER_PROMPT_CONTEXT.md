# Master Project Context: euroGovernance Multi-Tenant B2B GRC SaaS

## System Overview
Multi-tenant B2B GRC SaaS on Firebase covering:
- **GDPR** (ROPA, DPIA, TIA, Personal Data Breach 72h, DSR)
- **EU AI Act** (AI System Register, Prohibited Practice screening, High-Risk classification, FRIA, Incident Logs)
- **EU Data Act** (Connected Product/Service Data, Data Sharing & Access, FRAND licensing, Cloud Switching)
- **ISO 27001 & ISO 42001** (ISMS/AIMS Scope, Objectives, Statement of Applicability, Internal Audits, Management Reviews)

## Technology Stack
- **Firebase Auth**: User identity, MFA, tenant claims.
- **Firestore**: Multi-tenant database rooted at `/tenants/{tenantId}/...`.
- **Cloud Functions (v2)**: Privileged workflows (tenant provisioning, role assignment, state machines, audit events).
- **Cloud Storage**: Tenant-isolated evidence & compliance export archives.
- **Firebase Hosting**: Fast SPA / SSR client distribution.
- **TypeScript**: Strict typing across frontend, backend functions, and shared contracts.

## Non-Negotiable Constraints
1. **Tenant Boundary**: All customer data must be tenant-scoped (`/tenants/{tenantId}/...`).
2. **Security Rules**: Primary enforcement layer for tenant isolation.
3. **No Client-Side-Only Authorization**: Cloud Functions must handle privileged operations.
4. **Append-Only Audit Logs**: Immutable records; no client modifications or deletions.
5. **No Deep Nesting or Giant Arrays**: Flat subcollections with normalized IDs for future Postgres migration friendliness.
6. **Mandatory Metadata on Every Entity**:
   - `id: string`
   - `tenantId: string`
   - `status: string`
   - `ownerId: string`
   - `createdAt: string`
   - `updatedAt: string`
   - `createdBy: string`
   - `updatedBy: string`
7. **Explicit Roles (No placeholders)**:
   - `platform_admin`
   - `tenant_admin`
   - `compliance_manager`
   - `privacy_manager`
   - `ai_governance_manager`
   - `security_manager`
   - `auditor`
   - `contributor`
   - `viewer`
   - `approver`

## Master Delivery Roadmap Sequencing
1. Architecture & Baseline Repository Setup
2. Roles, Tenancy Model & Identity Flows
3. Schema & Entity Contracts
4. Firestore Security Rules
5. Cloud Functions Privileged Workflows
6. Evidence & Control Engine
7. GDPR Module
8. EU AI Act Module
9. EU Data Act & ISO 27001/42001 Modules
10. Reporting, Exports & Tests

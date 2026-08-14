# euroGovernance

[![Status](https://img.shields.io/badge/status-Internal%20Alpha%20Ready-success.svg)](#)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](#)
[![Firebase](https://img.shields.io/badge/Firebase-v2%20Functions%20%7C%20Firestore-orange.svg)](#)
[![Next.js](https://img.shields.io/badge/Next.js-14.2%20App%20Router-black.svg)](#)
[![Security Suite](https://img.shields.io/badge/Security%20Tests-95%20Passing-brightgreen.svg)](#)

**euroGovernance** is an EU-sovereign, multi-tenant Governance, Risk, and Compliance (GRC) platform built on Google Cloud / Firebase architecture. It is designed to automate regulatory compliance workflows across the **General Data Protection Regulation (GDPR)**, the **EU Artificial Intelligence Act (AI Act)**, the **EU Data Act**, and international management standards including **ISO/IEC 27001:2022** and **ISO/IEC 42001:2023**.

---

## 1. High-Level Overview

euroGovernance provides regulated European enterprises with an unified governance console and deterministic backend enforcement engine.

### Implemented Subsystems & Modules

| Subsystem | Implemented Capabilities | Implementation Status |
|---|---|---|
| **Multi-Tenancy & Identity** | Tenant provisioning, invite generation, token-hash verification, role assignment, membership lifecycle. | **Implemented** |
| **RBAC & Authorization** | 9-tier role model with strict separation of duty, read-only auditor/viewer views, tenant isolation. | **Implemented** |
| **Audit Log Subsystem** | Append-only server-managed audit logging via Cloud Functions Admin SDK. Client mutations strictly denied. | **Implemented** |
| **Controls & Policies** | Control catalogs, cross-framework mapping, lifecycle status, policy drafting, approval, and versioning. | **Implemented** |
| **Evidence Repository** | Tenant-scoped Cloud Storage uploads, Four-Eyes Principle approval state machine, deprecation workflows. | **Implemented** |
| **Risks & Remediation** | Inherent/residual 5x5 matrix scoring, risk acceptance workflows, remediation tasks with status tracking. | **Implemented** |
| **Vendors & Assets** | Vendor risk classification (critical/high/medium/low), asset criticality, and data residency tracking. | **Implemented** |
| **GDPR Privacy Layer** | Article 30 ROPA records, DPIA/TIA assessments, Article 33/34 breach logging (72h timer), DSR request tracking. | **Implemented** |
| **EU AI Act Engine** | AI Systems Register, Article 6/9 Risk Tier Classifier (prohibited/high/limited/minimal), Article 73 incident alerting, substantial changes, post-market logs. | **Implemented** |
| **ISO Management Layer** | ISO 27001 & ISO 42001 Scopes, Measurable Objectives, Statement of Applicability (SoA), Internal Audits, Findings, Management Reviews. | **Implemented** |
| **Operational Services** | Recipient-isolated in-app notifications, materialized summary metrics, daily expiry/review scheduled cron job. | **Implemented** |
| **Compliance Export Processor** | Asynchronous evidence pack and framework readiness JSON/ZIP export generation with tenant storage isolation. | **Implemented** |
| **Operational Web Frontend** | 8-tab Next.js 14 governance console with live Firestore listeners, real Firebase Auth, and backend function integration. | **Implemented** |
| **EU Data Act** | Data asset schemas and Firestore rules for `/data_act_assets` and `/data_sharing_requests`. | **Partially Implemented** |

---

## 2. Architecture Summary

euroGovernance employs a **defense-in-depth architecture** deployed in `europe-west3` (Frankfurt, Germany):

1. **Untrusted Client Layer**: Next.js 14 App Router (`apps/web`) executing in the user's browser.
2. **Security Rules Perimeter**: Firestore (`firestore.rules`) and Cloud Storage (`storage.rules`) enforce tenant containment, active membership validation, and direct write restrictions.
3. **Privileged Backend Boundary**: Cloud Functions v2 (`functions/src`) running with Firebase Admin SDK execute privileged state machines, deterministic AI risk classification, Four-Eyes approvals, export packaging, and append-only audit logging.
4. **Data Layer**: Cloud Firestore partitioned hierarchically under `/tenants/{tenantId}/...` and Cloud Storage partitioned under `/tenants/{tenantId}/...`.

---

## 3. Repository Structure

```
euroGovernance/
├── apps/
│   └── web/                     # Next.js 14 App Router operational console
├── packages/
│   └── shared-types/            # Canonical TypeScript interfaces & domain models
├── functions/
│   └── src/
│       ├── handlers/            # Cloud Functions v2 callable endpoints & crons
│       ├── lib/                 # Shared server libraries (audit, notifications, auth)
│       └── index.ts             # Central Cloud Function exports
├── tests/
│   └── rules/                   # 18 Jest security test suites (95 tests)
├── docs/                        # Complete technical & architecture documentation
├── scripts/                     # Local emulator bootstrapping & seeding scripts
├── firestore.rules              # Multi-tenant Firestore security rules
├── storage.rules                # Multi-tenant Cloud Storage security rules
├── firestore.indexes.json       # Composite query index definitions
└── firebase.json                # Firebase emulator & deployment configuration
```

---

## 4. Local Development Setup

### Prerequisites
- Node.js >= 20.0.0
- npm >= 10.0.0
- Firebase CLI (`npm install -g firebase-tools`)
- Java JRE >= 11 (required for Firebase Local Emulators)

### Step 1: Install Dependencies
```bash
npm install
```

### Step 2: Configure Environment
Copy the example environment files:
```bash
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local
```

### Step 3: Start Firebase Local Emulators
```bash
npm run emulators:start
```
The Firebase Emulator Suite UI will be accessible at `http://localhost:4000` with:
- Authentication: `localhost:9099`
- Firestore: `localhost:8080`
- Storage: `localhost:9199`
- Functions: `localhost:5001`

### Step 4: Seed Emulator Data (Optional)
In a separate terminal, seed standard test tenants, memberships, controls, and workflows:
```bash
npm run seed:emulator
```

### Step 5: Start the Web Application
```bash
npm run dev
```
Open `http://localhost:3000` to access the operational governance console.

---

## 5. Test Commands

### Run Security Rules Test Suite
Runs all 18 security and RBAC test suites (95 assertions) against the local Firestore/Storage emulator:
```bash
npm run test:rules
```

### Typecheck All Workspaces
```bash
npm run typecheck
```

### Build Production Bundle
```bash
npm run build
```

---

## 6. Documentation Map

| Document | Description | Audience |
|---|---|---|
| [**Architecture**](file:///Users/remon/Documents/euroGovernance/docs/architecture.md) | Component boundaries, data flow, trust boundaries, region sovereignty. | Architects, Senior Engineers, Ops |
| [**Security Model**](file:///Users/remon/Documents/euroGovernance/docs/security-model.md) | Rules architecture, RBAC matrix, tenant isolation, Four-Eyes enforcement. | Security Officers, Lead Devs, Auditors |
| [**Domain Modules**](file:///Users/remon/Documents/euroGovernance/docs/domain-modules.md) | Deep dive into GDPR, AI Act, ISO 27001/42001, GRC Core modules & status. | Product Managers, Compliance Leads |
| [**Data Model**](file:///Users/remon/Documents/euroGovernance/docs/data-model.md) | Firestore collections, subcollections, fields, indexes, and immutability. | Backend & Frontend Engineers |
| [**Backend Workflows**](file:///Users/remon/Documents/euroGovernance/docs/backend-workflows.md) | Callable Functions, state transitions, export processor, scheduled crons. | Backend Engineers, Integration Devs |
| [**Testing Strategy**](file:///Users/remon/Documents/euroGovernance/docs/testing.md) | Emulator harness, security matrix tests, coverage, CI verification. | QA Engineers, Developers |
| [**Runbooks & Operations**](file:///Users/remon/Documents/euroGovernance/docs/runbooks.md) | Local development, bootstrap, seeding, deployment, troubleshooting. | DevOps, SREs, Support Engineers |

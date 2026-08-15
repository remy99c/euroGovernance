# euroGovernance — Runbooks, Operations & Deployment Guide

This document provides operational instructions, deployment workflows, bootstrapping procedures, and troubleshooting guidelines for **euroGovernance**.

---

## 1. Local Development & Bootstrap Runbook

### 1.1 Fresh Environment Setup
```bash
# 1. Clone repository & install dependencies
git clone https://github.com/remy99c/euroGovernance.git
cd euroGovernance
npm install

# 2. Configure environment variables
cp .env.example .env.local
cp apps/web/.env.example apps/web/.env.local

# 3. Start local emulator suite
npm run emulators:start
```

### 1.2 Seed Initial Test Data
In a second terminal, execute the automated seeding script:
```bash
npm run seed:emulator
```
The seeding script (`scripts/seed-emulator.ts`) populates:
- **Tenant A**: `tenant_eurocorp_de` (EuroCorp Technologies SE)
- **Tenant B**: `tenant_medtech_fr` (MedTech Solutions SAS)
- **Standard Personas**:
  - `usr_admin_01` (`tenant_admin` / `admin@eurocorp.de`)
  - `usr_compliance_01` (`compliance_manager` / `compliance@eurocorp.de`)
  - `usr_security_01` (`security_manager` / `ciso@eurocorp.de`)
  - `usr_privacy_01` (`privacy_manager` / `dpo@eurocorp.de`)
  - `usr_aigov_01` (`ai_governance_manager` / `ai.lead@eurocorp.de`)
  - `usr_approver_01` (`approver` / `officer@eurocorp.de`)
  - `usr_auditor_01` (`auditor` / `auditor@kpmg.de`)
  - `usr_contrib_01` (`contributor` / `engineer@eurocorp.de`)
- **Starter Datasets**: Pre-configured GDPR ROPA entries, AI System records, ISO 27001 scopes, Controls, and Evidence records.

---

## 2. Deployment Workflows

Deployments target Google Cloud / Firebase in `europe-west3` (Frankfurt).

### 2.1 Pre-Deployment Verification Checklist
Before deploying to staging or production, run the full verification pipeline:
```bash
# 1. Typecheck all workspaces
npm run typecheck

# 2. Run all 18 security test suites
npm run test:rules

# 3. Build production bundles
npm run build
```

### 2.2 Deploying Security Rules & Indexes
```bash
# Deploy Firestore & Storage rules
npm run deploy:rules

# Deploy Firestore composite indexes
firebase deploy --only firestore:indexes
```

### 2.3 Deploying Cloud Functions v2
```bash
npm run deploy:functions
```

### 2.4 Deploying Web Frontend to Firebase Hosting
```bash
npm run deploy:hosting
```

---

## 3. Required Environment Variables & Secrets

### Root & Cloud Functions (`.env.local` / Secret Manager)
| Variable | Description | Example / Default |
|---|---|---|
| `GCP_PROJECT` | Google Cloud Project ID | `eurogovernance-prod` |
| `GCP_REGION` | Primary sovereign region | `europe-west3` |
| `FIRESTORE_EMULATOR_HOST` | Local development host (dev only) | `127.0.0.1:8080` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Local auth host (dev only) | `127.0.0.1:9099` |
| `FIREBASE_STORAGE_EMULATOR_HOST` | Local storage host (dev only) | `127.0.0.1:9199` |

### Web Application (`apps/web/.env.local`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public Firebase Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage Bucket (`eurogovernance-prod.appspot.com`) |
| `NEXT_PUBLIC_USE_EMULATORS` | `'true'` in local dev; `'false'` in staging/production |

---

## 4. Troubleshooting & Operational FAQs

### 4.1 "connect ECONNREFUSED 127.0.0.1:8080" during tests
- **Root Cause**: The Firebase Firestore emulator is not running.
- **Fix**: Run `firebase emulators:start --only firestore,storage` before running `npm run test:rules`.

### 4.2 "PERMISSION_DENIED on /audit_logs or /summary_metrics"
- **Root Cause**: Attempting to write directly to audit logs or summary metrics using the client SDK.
- **Fix**: These collections are strictly append-only or materialized via Cloud Functions Admin SDK (`functions/src/lib/audit.ts` and `functions/src/handlers/metrics.ts`). Direct client writes are forbidden by design.

### 4.3 "Four-Eyes Principle Violation: Approver cannot be Uploader"
- **Root Cause**: An approver attempted to approve an evidence record that they originally uploaded (`caller.uid === evidence.uploadedBy`).
- **Fix**: Have another member with the `approver`, `compliance_manager`, or `tenant_admin` role review and approve the evidence.

### 4.4 "Direct client modification of riskTier is forbidden"
- **Root Cause**: Updating `riskTier` directly via client Firestore `update()`.
- **Fix**: Invoke the Cloud Function `classifyAiSystemRisk(systemId, criteria)` to classify risk deterministically.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Testing & Verification**: [[testing|Testing Strategy]], [[EMULATOR_AND_TEST_PLAN|Emulator & Test Plan]]
- **Architecture & Security**: [[ARCHITECTURE|System Architecture]], [[security-model|Security Model]], [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]]
- **Operations & Backend**: [[CLOUD_FUNCTIONS_PLAN|Cloud Functions Plan]], [[NOTIFICATIONS_AND_SCHEDULED_JOBS_DESIGN|Notifications & Cron]]

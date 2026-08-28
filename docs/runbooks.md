# euroGovernance — Runbooks, Operations & Deployment Guide

This document provides operational instructions, deployment workflows, bootstrapping procedures, and troubleshooting guidelines for **euroGovernance**. A configured region is a deployment property; tenant metadata does not by itself create a legal or technical “sovereign cloud” boundary.

---

## 1. Local Development & Bootstrap Runbook

### 1.1 Fresh Environment Setup
```bash
# 1. Clone repository & install dependencies
git clone https://github.com/remy99c/euroGovernance.git
cd euroGovernance
npm ci

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

The current Functions source targets `europe-west3` (Frankfurt). Before every release, independently verify the deployed regions of Functions, Firestore, Storage, Auth, and Hosting; changing an application field or a Functions default does not relocate existing resources.

### 2.1 Pre-Deployment Verification Checklist
Before deploying to staging or production, use a clean checkout and run the same gate as CI:
```bash
npm ci
npm --prefix functions ci --workspaces=false
npm ls --all
npm --prefix functions ls --all --workspaces=false
npm run security:lock
npm run security:audit
npm run emulators:exec
git diff --check
```

The Rules suites prove browser authorization and isolation. They are not substitutes for callable integration tests: authoritative state is seeded with the Admin SDK in many Rules fixtures. Every migrated command workflow must also pass its Auth + Functions + Firestore emulator integration scenario.

### 2.2 Deploying Security Rules & Indexes
```bash
# Development project only
npm run deploy:rules

# Deploy Firestore composite indexes
firebase deploy --only firestore:indexes
```

### 2.3 Deploying Cloud Functions v2
```bash
# Development project only
npm run deploy:functions
```

Inventory deployed Functions by name and region before and after deployment. Source configured for `europe-west3` does not overwrite a same-named legacy endpoint in another region. Replace an old-region endpoint with a fail-closed tombstone for one release where necessary, verify rejection in the cloud, and then explicitly delete the obsolete regional deployment.

### 2.4 Deploying Web Frontend to Firebase Hosting
```bash
# Development project only
npm run deploy:hosting
```

Staging deploys are explicit: `npm run deploy:staging`. Production deploys must use `npm run deploy:production`; that command has no bypass and remains blocked until every item in `docs/production-release-readiness.json` is cleared with reviewable evidence. Do not invoke a raw production `firebase deploy` to evade the gate.

Both deployment commands rebuild and exercise the emulator gate before invoking Firebase. The production command also revalidates the mandatory blocker register after the build, dependency audit, generated-asset scan, Rules tests, and callable integration tests complete. A cleared blocker requires a reviewer identity, a real canonical UTC clearance timestamp, and a unique file under `docs/release-evidence/` whose SHA-256 is pinned in the manifest and verified at release time. External URLs, missing files, symlinks outside that evidence directory, and hash mismatches cannot clear a blocker; deleting a mandatory blocker cannot make the gate pass.

The Hosting build is target-bound. For every `NEXT_PUBLIC_FIREBASE_*` value used to build Hosting, supply the matching `EXPECTED_FIREBASE_*` value to the verification process. The scanner compares the generated `/deployment-metadata.json` and every deployed asset against the complete project ID, Web App ID, API key, Auth domain, Storage bucket, sender ID, Functions region, and App Check site key. The staging and production scripts hard-code their expected Firebase project IDs; missing, placeholder, emulator, development, or cross-project values stop deployment.

### 2.5 Firebase App Check rollout for all callable Functions

Every callable Function requires Firebase App Check through the global Functions configuration; authoritative command handlers also enforce it in-handler as defense in depth. Complete this sequence before deploying an enforcing Functions revision:

1. Create a score-based reCAPTCHA Enterprise website key for the exact production and staging hostnames. Do not add `localhost` to its production domain allowlist.
2. Register each Firebase Web App with that key under **Firebase Console → App Check**.
3. Set `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` in the corresponding Hosting build environment and build the web app. The key is public configuration, not a secret.
4. Deploy Hosting first, verify that signed-in browser requests carry valid App Check attestations in Firebase metrics, and only then deploy the Functions revision with `enforceAppCheck: true`.
5. If a particularly sensitive callable consumes limited-use tokens, grant the deployed Functions service account only the documented App Check Token Verifier role and ensure that callable’s client opts into `limitedUseAppCheckTokens`.
6. Exercise one accepted and one deliberately unattested request against staging. The unattested request must be rejected before domain code runs.

For local browser development, use the Firebase Emulator Suite. The development build creates a structurally valid emulator-only attestation; the production build fails if emulator mode is enabled, and CI scans generated Hosting assets for local-only markers. If cloud-backed local testing is explicitly required, use a registered App Check debug token stored outside source control, revoke it after use, and never put it into a production bundle or CI log.

### 2.6 Dependency security overrides

The root manifest pins Firebase CLI transitive overrides for Pub/Sub, `gaxios`, and `re2`. The separate Functions manifest pins the Firebase Admin Storage client and its request libraries. This compensates for upstream advisory windows while keeping deployment dependencies out of the development workspace graph. Do not replace these with a nested UUID override: doing so can make the audit report green while leaving an invalid semver graph.

Cloud Functions also has its own committed lockfile because Firebase uploads only `functions/`. The upload contains a hashed, checked-in `vendor/shared-types` package and excludes all `.env*`, `*.local`, `node_modules`, and Git content. CI installs this nested lock with `--workspaces=false`; the artifact gate then builds the real Firebase ZIP, verifies every vendored byte, extracts it into a temporary directory, performs a clean npm 10 install and audit, and imports the runtime dependencies. A green root workspace install is not evidence that the deployable Functions graph is valid.

Every dependency change must satisfy all of the following from a clean install:

```bash
npm ci
npm --prefix functions ci --workspaces=false
npm ls --all
npm --prefix functions ls --all --workspaces=false
npm run security:lock
npm run security:audit
```

The lock policy rejects the known vulnerable version ranges and verifies the exact compatibility anchors. Remove an override only after the direct upstream consumer declares a patched dependency and the clean install, Functions build, Firebase emulator startup, and callable integration suite all pass without it. Release CI uses Node 22; a different host Node version is diagnostic-only and must not be treated as the release runtime.

---

## 3. Required Environment Variables & Secrets

### Root & Cloud Functions (`.env.local` / Secret Manager)
| Variable | Description | Example / Default |
|---|---|---|
| `GCP_PROJECT` | Google Cloud Project ID | `eurogovernance-prod` |
| `GCP_REGION` | Intended regional deployment target; verify each Firebase/GCP resource independently | `europe-west3` |
| `FIRESTORE_EMULATOR_HOST` | Local development host (dev only) | `127.0.0.1:8080` |
| `FIREBASE_AUTH_EMULATOR_HOST` | Local auth host (dev only) | `127.0.0.1:9099` |
| `FIREBASE_STORAGE_EMULATOR_HOST` | Local storage host (dev only) | `127.0.0.1:9199` |
| `ASSESSMENT_PORTAL_ORIGIN` | Exact HTTPS origin used when issuing external assessment links | `https://governance.example.eu` |

### Web Application (`apps/web/.env.local`)
| Variable | Description |
|---|---|
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase Project ID |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Public Firebase Web API Key |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Auth Domain |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | Cloud Storage Bucket (`eurogovernance-prod.appspot.com`) |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | Firebase Web App sender ID |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Registered Firebase Web App ID |
| `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY` | Registered score-based reCAPTCHA Enterprise site key; required outside emulators |
| `NEXT_PUBLIC_FIREBASE_FUNCTIONS_REGION` | Callable Functions region; currently `europe-west3` |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | `'true'` only for local development; production builds reject it |
| `EXPECTED_FIREBASE_*` | Independent expected copies of API key, project ID, App ID, Auth domain, Storage bucket, sender ID, App Check key, and Functions region; required by the generated-bundle gate |

---

## 4. Troubleshooting & Operational FAQs

### 4.1 "connect ECONNREFUSED 127.0.0.1:8080" during tests
- **Root Cause**: The Firebase Firestore emulator is not running.
- **Fix**: Run `firebase emulators:start --only firestore,storage` before running `npm run test:rules`.

### 4.2 "PERMISSION_DENIED on /audit_logs or /summary_metrics"
- **Root Cause**: Attempting to write directly to audit logs or summary metrics using the client SDK.
- **Fix**: These collections are strictly append-only or materialized via Cloud Functions Admin SDK (`functions/src/lib/audit.ts` and `functions/src/handlers/metrics.ts`). Direct client writes are forbidden by design.

### 4.3 "A valid Firebase App Check attestation is required"
- **Root Cause**: The browser app was not registered for App Check, the production site key is missing/mismatched, the request came from an unregistered client, or enforcement was enabled before the updated Hosting bundle was live.
- **Fix**: Verify the Web App ID, exact reCAPTCHA Enterprise hostname list, `NEXT_PUBLIC_FIREBASE_APP_CHECK_SITE_KEY`, and App Check request metrics. Do not disable enforcement as a routine troubleshooting step and never solve this by adding `localhost` to the production key.

### 4.4 Evidence upload, download, or approval is unavailable
- **Root Cause**: The browser evidence pipeline is intentionally fail-closed until server-authorized upload sessions, Storage-object verification, hashing, malware controls, and secure downloads are implemented.
- **Fix**: Do not create evidence metadata manually or weaken Storage/Firestore Rules. Complete the verified evidence workflow and its integration tests before enabling the feature.

### 4.5 "Direct client modification of riskTier is forbidden"
- **Root Cause**: Updating `riskTier` directly via client Firestore `update()`.
- **Fix**: Invoke the Cloud Function `classifyAiSystemRisk(systemId, criteria)` to classify risk deterministically.

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Testing & Verification**: [[testing|Testing Strategy]], [[EMULATOR_AND_TEST_PLAN|Emulator & Test Plan]]
- **Architecture & Security**: [[ARCHITECTURE|System Architecture]], [[security-model|Security Model]], [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]]
- **Operations & Backend**: [[CLOUD_FUNCTIONS_PLAN|Cloud Functions Plan]], [[NOTIFICATIONS_AND_SCHEDULED_JOBS_DESIGN|Notifications & Cron]]

# euroGovernance — Testing Strategy & Security Test Suite

This document describes the automated testing architecture, test suites, Firebase Emulator integration, and security verification procedures implemented in **euroGovernance**.

---

## 1. Testing Philosophy & Test Surfaces

euroGovernance adheres to a **security-first, emulator-verified** testing strategy:

1. **Security Rules Test Suite (`tests/rules`)**: The primary automated test suite verifies multi-tenant isolation, 9-tier RBAC rules, audit immutability, Four-Eyes enforcement, and storage boundaries against live local Firestore/Storage emulators.
2. **Static Type Checking (`typecheck`)**: Full TypeScript strict verification across all 4 workspaces (`packages/shared-types`, `functions`, `tests/rules`, `apps/web`).
3. **Production Build Validation (`build`)**: Compiles Cloud Functions and produces optimized Next.js 14 production builds.

---

## 2. Test Architecture & Configuration

The test suite resides in the `@eurogovernance/rules-tests` workspace (`tests/rules`) using:
- **Test Runner**: Jest 29 with NodeNext Native ES Modules (`NODE_OPTIONS=--experimental-vm-modules`).
- **Rules Testing Framework**: `@firebase/rules-unit-testing` (v3.0.3).
- **Concurrency**: `maxWorkers: 1` configured in `jest.config.js` to ensure deterministic serial execution against the local emulator.

```
tests/rules/
├── fixtures/
│   └── test-factories.ts                  # Shared tenant/user seed factories & rule loaders
├── ai-act-workflows.test.ts               # EU AI Act rules & risk tier modification guards
├── audit-immutability.test.ts             # Direct client write/modify denial tests
├── comprehensive-security-matrix.test.ts  # End-to-end multi-tenant cross-isolation matrix
├── controls-module.test.ts                # Controls lifecycle & review submission tests
├── evidence-repository.test.ts            # Evidence review & Four-Eyes approval rules
├── export-jobs.test.ts                    # Compliance export request & access rules
├── gdpr-workflows.test.ts                 # ROPA, DPIA, TIA, Breaches, and DSR rules
├── identity-and-tenancy.test.ts           # Tenant root & membership access guards
├── invitations.test.ts                    # Pending invite token & recipient isolation
├── iso-management-layer.test.ts           # Scope, Objectives, SoA, Audits, Findings
├── operational-support.test.ts            # Recipient-scoped notification & metric access
├── policies-module.test.ts                # Policy drafting, publishing, and archival
├── risks-and-remediation.test.ts          # Risk matrix scoring & remediation tasks
├── role-management-and-guardrails.test.ts # Admin-only role modification guards
├── storage-isolation.test.ts              # Cloud Storage tenant path & overwrite denial
├── tenant-isolation.test.ts               # Cross-tenant data leak assertions
├── vendors-and-assets.test.ts             # Third-party vendor & asset criticality guards
└── workflows-and-rbac.test.ts             # Multi-step workflow state transitions
```

---

## 3. Verified Security Invariants

Across the **18 test suites and 95 assertions**, the following core invariants are validated:

| Invariant | Test File | Verified Behavior |
|---|---|---|
| **Universal Cross-Tenant Isolation** | `tenant-isolation.test.ts`, `comprehensive-security-matrix.test.ts` | Member of Tenant A is rejected with `PERMISSION_DENIED` on any read or write to Tenant B collections. |
| **Audit Log Immutability** | `audit-immutability.test.ts`, `comprehensive-security-matrix.test.ts` | All direct client creates, updates, and deletes to `/tenants/{id}/audit_logs` are unconditionally blocked. |
| **Four-Eyes Evidence Approval** | `evidence-repository.test.ts`, `comprehensive-security-matrix.test.ts` | Direct status updates to `/evidence` documents are blocked from client SDK. Approvals require Cloud Function. |
| **Controlled AI Risk Tiering** | `ai-act-workflows.test.ts` | Clients cannot mutate `riskTier` directly; updates to standard fields (e.g. description) are permitted. |
| **Recipient Notification Scoping** | `operational-support.test.ts` | Members can only read and mark `isRead` on notifications where `recipientId == request.auth.uid`. |
| **Export Access & Write Lockdown** | `export-jobs.test.ts`, `storage-isolation.test.ts` | Non-admin members cannot access export jobs requested by others. Client writes to `/exports` storage paths fail. |
| **Read-Only Auditor / Viewer Enforcement** | `workflows-and-rbac.test.ts`, `controls-module.test.ts` | `auditor` and `viewer` roles are blocked from mutating controls, risks, policies, or GDPR records. |
| **Storage Overwrite Denial** | `storage-isolation.test.ts` | Direct overwrite of an existing evidence file in Cloud Storage is forbidden. |

---

## 4. Running the Test Suite Locally

### Step 1: Start Emulators
```bash
firebase emulators:start --only firestore,storage
```

### Step 2: Execute All Security Test Suites
```bash
npm run test:rules
```

### Step 3: Run Targeted Test Suite
```bash
npm run test --workspace=@eurogovernance/rules-tests -- gdpr-workflows.test.ts
```

---

## 5. Continuous Integration (CI) Verification

In headless CI environments, run the complete suite using `emulators:exec`:
```bash
firebase emulators:exec --only firestore,storage "npm run test:rules"
```

---

## 🔗 Related Knowledge Graph Documents

- **Hub**: [[INDEX|Knowledge Vault Index]]
- **Testing & Verification**: [[EMULATOR_AND_TEST_PLAN|Emulator & Test Plan]], [[runbooks|Runbooks & FAQ]]
- **Security & Authorization**: [[SECURITY_RULES_AND_CLOUD_FUNCTIONS_ARCHITECTURE|Security Rules Architecture]], [[security-model|Security Model]], [[ROLES_AND_PERMISSIONS|Roles & Permissions]]
- **Domain Verification**: [[FRAMEWORK_ADOPTION_SCOPING_AND_HARMONIZATION|Scoping Verification]], [[PROCESSOR_CERTIFICATIONS_AND_ASSURANCE|Processor Certification E2E Tests]]

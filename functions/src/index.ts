// Privileged Tenant & Membership Handlers
export {
  syncUserProfile,
  createTenant,
  inviteUserToTenant,
  cancelTenantInvite,
  acceptTenantInvite,
  assignTenantRole,
  suspendTenantMember,
  reactivateTenantMember,
  removeTenantMember,
  listTenantMembers,
  listTenantInvitations,
} from './handlers/tenants.js';

// Controls Module Handlers
export {
  createTenantControl,
  updateTenantControl,
  deleteTenantControl,
  recordControlReview,
  listTenantControls,
} from './handlers/controls.js';

// Policy Module Handlers
export {
  createTenantPolicy,
  updateTenantPolicy,
  transitionPolicyStatus,
  deleteTenantPolicy,
  listTenantPolicies,
} from './handlers/policies.js';

// Risks, Issues & Tasks Handlers
export {
  createTenantRisk,
  updateTenantRisk,
  deleteTenantRisk,
  listTenantRisks,
  createTenantIssue,
  updateTenantIssue,
  deleteTenantIssue,
  listTenantIssues,
  createTenantTask,
  updateTenantTask,
  deleteTenantTask,
  listTenantTasks,
} from './handlers/risks.js';

// Vendor & System Asset Handlers
export {
  createTenantVendor,
  updateTenantVendor,
  deleteTenantVendor,
  listTenantVendors,
  createTenantSystemAsset,
  updateTenantSystemAsset,
  deleteTenantSystemAsset,
  listTenantSystemAssets,
} from './handlers/vendors-and-assets.js';

// GDPR Phase 1 Module Handlers
export {
  createTenantROPA,
  updateTenantROPA,
  deleteTenantROPA,
  listTenantROPA,
  createTenantDPIA,
  transitionTenantDPIAStatus,
  listTenantDPIAs,
  createTenantTIA,
  transitionTenantTIAStatus,
  listTenantTIAs,
  createTenantDSR,
  updateTenantDSR,
  listTenantDSRs,
  logTenantBreach,
  updateTenantBreach,
  listTenantBreaches,
} from './handlers/gdpr.js';

// Evidence Repository Handlers
export {
  createEvidence,
  createEvidenceVersion,
  approveEvidence,
  rejectEvidence,
  listTenantEvidence,
} from './handlers/evidence.js';

// Audit Log Callable Handler
export {
  createAuditLogEvent,
} from './handlers/audit.js';

// Regulatory Workflows & Classification Handlers
export {
  transitionDPIAStatus,
  transitionTIAStatus,
  createROPAFromTemplate,
  classifyAISystem,
  transitionAIAssessmentStatus,
  logAIIncident,
} from './handlers/workflows.js';

// Compliance Export Handlers
export {
  generateTenantEvidenceExport,
  generateFrameworkReadinessReport,
} from './handlers/exports.js';

// Scheduled Maintenance & Expiry Handlers
export {
  checkEvidenceExpiriesAndReminders,
} from './handlers/scheduled.js';

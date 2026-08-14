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

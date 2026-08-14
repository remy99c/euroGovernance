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

// EU AI Act Phase 1 Module Handlers
export {
  createTenantAISystem,
  updateTenantAISystem,
  deleteTenantAISystem,
  listTenantAISystems,
  classifyTenantAISystem,
  listTenantAIAssessments,
  logTenantAIIncident,
  updateTenantAIIncident,
  listTenantAIIncidents,
  logSubstantialChange,
  listSubstantialChanges,
  logPostMarketMonitoring,
  listPostMarketLogs,
} from './handlers/ai-act.js';

// ISO Management Layer Handlers
export {
  createISOScopeStatement,
  updateISOScopeStatement,
  deleteISOScopeStatement,
  listISOScopeStatements,
  createISOObjective,
  updateISOObjective,
  deleteISOObjective,
  listISOObjectives,
  createISOSoAEntry,
  updateISOSoAEntry,
  deleteISOSoAEntry,
  listISOSoAEntries,
  createISOInternalAudit,
  updateISOInternalAudit,
  deleteISOInternalAudit,
  listISOInternalAudits,
  logISOFinding,
  updateISOFinding,
  listISOFindings,
  createISOManagementReview,
  updateISOManagementReview,
  deleteISOManagementReview,
  listISOManagementReviews,
} from './handlers/iso.js';

// Operational Support: Notifications & Summary Metrics
export {
  listRecipientNotifications,
  markNotificationAsRead,
  markAllNotificationsAsRead,
} from './handlers/notifications.js';

export {
  materializeTenantMetrics,
  getTenantSummaryMetrics,
} from './handlers/metrics.js';

// Compliance Export Handlers
export {
  generateTenantEvidenceExport,
  generateFrameworkReadinessReport,
  getExportJob,
  listTenantExportJobs,
} from './handlers/exports.js';

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

// Scheduled Maintenance & Expiry Handlers
export {
  checkEvidenceExpiriesAndReminders,
} from './handlers/scheduled.js';

// Framework Adoption, Scoping & Instantiation Handlers
export {
  listAvailableFrameworks,
  adoptFramework,
  unadoptFramework,
  updateFrameworkScope,
  setRequirementApplicability,
  instantiateFrameworkControls,
  retireAdoptedFramework,
  listTenantAdoptedFrameworks,
  listTenantRequirementApplicability,
} from './handlers/frameworks.js';

// Structured Scope Profiles & Scope Facts Handlers
export {
  createScopeProfile,
  updateScopeProfile,
  approveScopeProfile,
  recordScopeFact,
  batchRecordScopeFacts,
  listTenantScopeProfiles,
  listTenantScopeFacts,
} from './handlers/scoping.js';

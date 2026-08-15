import { setGlobalOptions } from 'firebase-functions/v2';

// Set global region to europe-west3 (Frankfurt) for all Cloud Functions v2
setGlobalOptions({ region: 'europe-west3' });

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
  linkRiskToProcessorOrTransfer,
  getProcessorRiskSummary,
  syncDerivedProcessorRisks,
  createTenantIssue,
  updateTenantIssue,
  deleteTenantIssue,
  listTenantIssues,
  createTenantTask,
  updateTenantTask,
  deleteTenantTask,
  listTenantTasks,
} from './handlers/risks.js';

// Vendor, Processor, Transfer Arrangement & System Asset Handlers
export {
  createTenantVendor,
  updateTenantVendor,
  deleteTenantVendor,
  listTenantVendors,
  createTenantProcessorProfile,
  createProcessorProfileFromVendor,
  updateTenantProcessorProfile,
  deleteTenantProcessorProfile,
  listTenantProcessorProfiles,
  listTenantProcessorInventory,
  createTenantTransferArrangement,
  updateTenantTransferArrangement,
  deleteTenantTransferArrangement,
  listTenantTransferArrangements,
  createTenantSystemAsset,
  updateTenantSystemAsset,
  deleteTenantSystemAsset,
  listTenantSystemAssets,
  linkProcessorToSystemAsset,
  getProcessorsForSystemAsset,
  getSystemsForProcessorProfile,
  getProcessorReviewReminders,
  dispatchProcessorReviewReminders,
} from './handlers/vendors-and-assets.js';

// Processor Assurance & Certification Review Handlers
export {
  createTenantProcessorCertification,
  reviewProcessorCertification,
  replaceProcessorCertification,
  getProcessorCertificationReminders,
  dispatchProcessorCertificationReminders,
  getProcessorCertificationRiskIndicators,
  syncProcessorCertificationDerivedRisks,
  getControlProcessorAssuranceSupport,
  getProcessorsToControlsAssuranceMatrix,
  linkProcessorCertificationToControls,
} from './handlers/processor-certifications.js';

// GDPR Phase 1 Module Handlers
export {
  createTenantROPA,
  updateTenantROPA,
  deleteTenantROPA,
  listTenantROPA,
  linkProcessorProfilesToROPA,
  getROPAForProcessorProfile,
  getROPAPrefillFromProcessors,
  createTenantDPIA,
  transitionTenantDPIAStatus,
  listTenantDPIAs,
  linkProcessorsToDPIA,
  getDPIAProcessorContext,
  createTenantTIA,
  createTIAFromTransferArrangement,
  linkTIAToTransferArrangement,
  transitionTenantTIAStatus,
  listTenantTIAs,
  createTenantDSR,
  updateTenantDSR,
  listTenantDSRs,
  logTenantBreach,
  updateTenantBreach,
  listTenantBreaches,
  linkBreachToProcessors,
  getProcessorBreachHistory,
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
  submitISOSoAForApproval,
  approveISOSoAEntry,
  generateTenantSoAFromScope,
  getTenantSoASummary,
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
  getTenantFrameworkCoverageDashboard,
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
  linkEvidenceToProcessorProfile,
  linkEvidenceToTransferArrangement,
  linkEvidenceToProcessorCertification,
  getProcessorEvidenceSummary,
  getTransferArrangementEvidenceSummary,
  getProcessorCertificationEvidenceSummary,
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
  getComposedScopeQuestionnaire,
  saveScopeAnswers,
  listTenantScopeAnswers,
  getScopeQuestionnaireProgress,
} from './handlers/scoping.js';

// Deterministic Applicability Engine & Instantiation Handlers
export {
  evaluateTenantApplicability,
  testRuleEvaluation,
  listTenantApplicabilityDecisions,
  instantiateTenantFrameworkControls,
  listTenantRequirementInstances,
  listTenantControlInstances,
  getTenantControlCoverageReport,
  listTenantControlMappings,
  evaluateStatutoryObligations,
  listTenantObligationFlags,
  overrideTenantApplicabilityDecision,
  revertTenantApplicabilityDecision,
  getTenantApplicabilityDecisionHistory,
} from './handlers/applicability.js';

// Structured Certifications & External Assurance Handlers
export {
  createTenantCertification,
  updateTenantCertification,
  deleteTenantCertification,
  listTenantCertifications,
  linkEvidenceToCertification,
  getCertificationCompletenessSummary,
  getTenantCertificationRiskDashboard,
} from './handlers/certifications.js';

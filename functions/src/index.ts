// This import must remain first so all re-exported handlers inherit the EU
// deployment region before their onCall/onSchedule definitions are evaluated.
import './bootstrap.js';

// One-release compatibility tombstone: this overwrites the previously deployed
// generic audit endpoint with a fail-closed callable before final deletion.
export { createAuditLogEvent } from './handlers/audit.js';

// Privileged Tenant & Membership Handlers
export {
  syncUserProfile,
  listMyTenantMemberships,
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
  decideControlReview,
  listTenantControls,
  getTenantControlDetail,
  getTenantControlHistory,
  listTenantControlReviewers,
} from './handlers/controls.js';

// Policy Module Handlers
export {
  createTenantPolicy,
  updateTenantPolicy,
  transitionPolicyStatus,
  deleteTenantPolicy,
  listTenantPolicies,
  getTenantPolicyDetail,
  getTenantPolicyHistory,
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
  listTenantOperationalAssignees,
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
  updateTenantProcessorCertification,
  deleteTenantProcessorCertification,
  reviewProcessorCertification,
  replaceProcessorCertification,
  listTenantProcessorCertifications,
  listTenantProcessorAssuranceInventory,
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

// Processor Assessments & Due Diligence Handlers
export {
  createProcessorAssessment,
  sendProcessorAssessment,
  getPublicProcessorAssessment,
  savePublicProcessorAssessmentDraft,
  submitPublicProcessorAssessment,
  reviewProcessorAssessment,
  renewRecurringProcessorAssessment,
} from './handlers/processor-assessments.js';

// Assessment Access Token & Secure External Link Handlers
export {
  issueAssessmentAccessToken,
  validateAssessmentAccessToken,
  revokeAssessmentAccessToken,
  regenerateAssessmentAccessToken,
  savePublicAssessmentDraft,
  submitPublicAssessment,
} from './handlers/assessment-access-tokens.js';

// Third-Party Assessment Request Workflow Handlers
export {
  createThirdPartyAssessmentRequest,
  sendThirdPartyAssessmentRequest,
  cancelThirdPartyAssessmentRequest,
  reviewThirdPartyAssessmentSubmission,
  linkAssessmentToVendorOrProcessor,
  syncAssessmentRisksToRegister,
  linkAssessmentToControls,
  checkThirdPartyAssessmentDeadlines,
  materializeThirdPartyAssessmentSummaryMetrics,
} from './handlers/third-party-assessments.js';

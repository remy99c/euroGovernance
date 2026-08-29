'use client';

/**
 * euroGovernance - EU GRC Operations Platform
 *
 * Core Dashboard Orchestrator
 *
 * Security & Governance Invariants:
 * 1. Multi-Tenant Isolation: All Firestore listeners and callable invocations are strictly
 *    scoped to the authenticated tenant (`/tenants/{tenantId}/...`).
 * 2. Server-Side Review: Evidence and assessment decisions must be submitted
 *    through authorized Cloud Functions rather than direct client writes.
 * 3. Audit Events: Privileged state alterations request server-side audit events
 *    through backend Admin SDK execution.
 */

import React, { useState, useEffect } from 'react';
import { useAuth } from '../lib/auth-context';
import { db, functions } from '../lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  where,
  onSnapshot,
  doc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';

// Subsystem Modules
import FrameworkAdoptionWizard from './framework-adoption-wizard';
import ApplicabilityReviewTab from './applicability-review';
import FrameworkCoverageDashboardTab from './framework-coverage-dashboard';
import ProcessorTransfersManager from './processor-transfers-manager';
import ProcessorGovernanceHub from './processor-governance-hub';
import ProcessorInventory from './processor-inventory';
import ProcessorAssuranceInventory from './processor-assurance-inventory';
import { CertificationsManager } from './certifications-manager';
import { ProcessorAssessmentWorkspace } from './processor-assessment-workspace';

// Modular Views
import { OverviewTabView } from './views/overview-tab-view';
import { ControlsTabView } from './views/controls-tab-view';
import { EvidenceTabView } from './views/evidence-tab-view';
import { RisksTasksTabView } from './views/risks-tasks-tab-view';
import { GDPRPrivacyTabView } from './views/gdpr-privacy-tab-view';
import { AISystemsTabView } from './views/ai-systems-tab-view';
import { MembersTabView } from './views/members-tab-view';
import { ExportsTabView } from './views/exports-tab-view';

// Modular Dialog Modals
import { CreateControlModal } from './modals/create-control-modal';
import { InviteMemberModal } from './modals/invite-member-modal';
import { RejectEvidenceModal } from './modals/reject-evidence-modal';
import { ClassifyAIModal } from './modals/classify-ai-modal';
import { AdoptFrameworkModal } from './modals/adopt-framework-modal';
import { GlobalSearchModal } from './modals/global-search-modal';

// Resumable Onboarding Architecture
import { useOnboarding } from './onboarding/use-onboarding';
import { OnboardingProgressBanner } from './onboarding/onboarding-progress-banner';
import { OnboardingWizardModal } from './onboarding/onboarding-wizard-modal';

export type TabType =
  | 'overview'
  | 'coverage_dashboard'
  | 'frameworks'
  | 'applicability_review'
  | 'controls'
  | 'evidence'
  | 'certifications'
  | 'risks_tasks'
  | 'gdpr'
  | 'processor_inventory'
  | 'processor_assurance_inventory'
  | 'processor_assessments'
  | 'processor_hub'
  | 'processor_transfers'
  | 'ai_systems'
  | 'members'
  | 'exports';

function AccessStatePanel({
  icon,
  title,
  description,
  children,
}: {
  icon: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'grid',
        placeItems: 'center',
        padding: '24px',
        backgroundColor: 'var(--surface-l1-canvas)',
      }}
    >
      <section
        className="card-modern"
        aria-live="polite"
        style={{ width: 'min(440px, 100%)', padding: '32px' }}
      >
        <div aria-hidden="true" style={{ fontSize: '30px', marginBottom: '16px' }}>{icon}</div>
        <h1 style={{ fontSize: '22px', color: 'var(--text-primary)', marginBottom: '8px' }}>{title}</h1>
        <p style={{ color: 'var(--text-secondary)', fontSize: '13px', lineHeight: 1.6, marginBottom: children ? '22px' : 0 }}>
          {description}
        </p>
        {children}
      </section>
    </main>
  );
}

export default function DashboardPage() {
  const {
    user,
    userRole,
    tenantId,
    setTenantId,
    availableTenants,
    membershipsTruncated,
    membershipError,
    loading: authLoading,
    devPersonasEnabled,
    loginWithEmail,
    loginDevUser,
    refreshMemberships,
    logout,
  } = useAuth();
  const canViewMembers =
    userRole === 'tenant_admin' ||
    userRole === 'compliance_manager' ||
    userRole === 'auditor';
  const canInviteMembers = userRole === 'tenant_admin';
  const canRequestExport =
    userRole === 'tenant_admin' ||
    userRole === 'compliance_manager' ||
    userRole === 'security_manager' ||
    userRole === 'privacy_manager' ||
    userRole === 'ai_governance_manager';
  const canReadAuditLogs =
    userRole === 'tenant_admin' ||
    userRole === 'compliance_manager' ||
    userRole === 'security_manager' ||
    userRole === 'auditor';
  const canReadBreaches =
    userRole === 'tenant_admin' ||
    userRole === 'privacy_manager' ||
    userRole === 'security_manager' ||
    userRole === 'compliance_manager' ||
    userRole === 'auditor';
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedHubProcessorProfileId, setSelectedHubProcessorProfileId] = useState<string | undefined>();
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [loginSubmitting, setLoginSubmitting] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Modals visibility state
  const [searchModalOpen, setSearchModalOpen] = useState(false);
  const [onboardingWizardOpen, setOnboardingWizardOpen] = useState(false);
  const [createControlModalOpen, setCreateControlModalOpen] = useState(false);
  const [inviteMemberModalOpen, setInviteMemberModalOpen] = useState(false);
  const [rejectEvidenceModal, setRejectEvidenceModal] = useState<{ open: boolean; evidenceId: string; title: string }>({
    open: false,
    evidenceId: '',
    title: '',
  });
  const [classifyAIModal, setClassifyAIModal] = useState<{ open: boolean; systemId: string; name: string }>({
    open: false,
    systemId: '',
    name: '',
  });
  const [adoptFrameworkModal, setAdoptFrameworkModal] = useState<{
    open: boolean;
    frameworkId: string;
    frameworkName: string;
  }>({
    open: false,
    frameworkId: '',
    frameworkName: '',
  });

  // Data Collections State
  const [metrics, setMetrics] = useState<any>(null);
  const [controlsList, setControlsList] = useState<any[]>([]);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [risksList, setRisksList] = useState<any[]>([]);
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [issuesList, setIssuesList] = useState<any[]>([]);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [ropaList, setRopaList] = useState<any[]>([]);
  const [breachesList, setBreachesList] = useState<any[]>([]);
  const [aiSystemsList, setAiSystemsList] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [exportJobsList, setExportJobsList] = useState<any[]>([]);
  const [adoptedFrameworksList, setAdoptedFrameworksList] = useState<any[]>([]);
  const [certificationsList, setCertificationsList] = useState<any[]>([]);
  const [assessmentsList, setAssessmentsList] = useState<any[]>([]);
  const [tenantDataScopeId, setTenantDataScopeId] = useState('');
  const [tenantDataError, setTenantDataError] = useState<string | null>(null);
  const [tenantDataReloadKey, setTenantDataReloadKey] = useState(0);
  const [membersLoading, setMembersLoading] = useState(false);
  const [membersError, setMembersError] = useState<string | null>(null);
  const [membersRefreshKey, setMembersRefreshKey] = useState(0);

  // Resumable Onboarding State Hook
  const {
    progress: onboardingProgress,
    flowConfig,
    totalSteps: onboardingTotalSteps,
    currentStepIndex: onboardingCurrentStepIndex,
    percentComplete: onboardingPercentComplete,
    isCompleted: onboardingIsCompleted,
    isDismissed: onboardingIsDismissed,
    markStepComplete: onboardingMarkStepComplete,
    dismissBanner: onboardingDismissBanner,
    completeOnboarding: onboardingCompleteOnboarding,
  } = useOnboarding(tenantId, user?.uid ?? '', userRole ?? 'viewer');

  // Action status state
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Global ⌘K keyboard shortcut listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setSearchModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (activeTab === 'members' && !canViewMembers) {
      setActiveTab('overview');
    }
  }, [activeTab, canViewMembers]);

  // A tenant switch is a hard workspace boundary. Record identifiers held by
  // drawers or child workflows must never survive into a different tenant
  // context, even when two tenants happen to use the same document ID.
  useEffect(() => {
    setActiveTab('overview');
    setSelectedHubProcessorProfileId(undefined);
    setSearchModalOpen(false);
    setOnboardingWizardOpen(false);
    setCreateControlModalOpen(false);
    setInviteMemberModalOpen(false);
    setRejectEvidenceModal({ open: false, evidenceId: '', title: '' });
    setClassifyAIModal({ open: false, systemId: '', name: '' });
    setAdoptFrameworkModal({ open: false, frameworkId: '', frameworkName: '' });
    setLoadingAction(null);
    setActionNotice(null);
  }, [tenantId]);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 6000);
  };

  const handleLoginSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      await loginWithEmail(loginEmail, loginPassword);
      setLoginPassword('');
    } catch {
      setLoginError('Sign-in failed. Check your credentials and try again.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  const handleDevPersonaLogin = async (role: string) => {
    setLoginSubmitting(true);
    setLoginError(null);
    try {
      await loginDevUser(role);
      setLoginPassword('');
    } catch {
      setLoginError('The emulator persona could not be authenticated.');
    } finally {
      setLoginSubmitting(false);
    }
  };

  // Subscriptions to Firestore Collections rooted at /tenants/{tenantId}
  useEffect(() => {
    const hasSelectedMembership = availableTenants.some(
      (membership) => membership.id === tenantId && membership.role === userRole
    );

    if (authLoading || !user || !tenantId || !userRole || !hasSelectedMembership) {
      setTenantDataScopeId('');
      setTenantDataError(null);
      setMetrics(null);
      setControlsList([]);
      setEvidenceList([]);
      setRisksList([]);
      setTasksList([]);
      setIssuesList([]);
      setAuditLogs([]);
      setRopaList([]);
      setBreachesList([]);
      setAiSystemsList([]);
      setExportJobsList([]);
      setAdoptedFrameworksList([]);
      setCertificationsList([]);
      setAssessmentsList([]);
      return;
    }

    // 1. Summary Metrics
    // Clear every prior-tenant value before the new subscription can be shown.
    setTenantDataScopeId('');
    setTenantDataError(null);
    setMetrics(null);
    setControlsList([]);
    setEvidenceList([]);
    setRisksList([]);
    setTasksList([]);
    setIssuesList([]);
    setAuditLogs([]);
    setRopaList([]);
    setBreachesList([]);
    setAiSystemsList([]);
    setExportJobsList([]);
    setAdoptedFrameworksList([]);
    setCertificationsList([]);
    setAssessmentsList([]);

    let subscriptionActive = true;
    const initializedSubscriptions = new Set<string>();
    const expectedInitialSubscriptions =
      12 + (canReadAuditLogs ? 1 : 0) + (canReadBreaches ? 1 : 0);
    const markSubscriptionInitialized = (key: string) => {
      if (!subscriptionActive || initializedSubscriptions.has(key)) return;
      initializedSubscriptions.add(key);
      if (initializedSubscriptions.size === expectedInitialSubscriptions) {
        setTenantDataScopeId(tenantId);
      }
    };
    const handleSubscriptionError = (key: string) => {
      if (!subscriptionActive) return;
      setTenantDataScopeId('');
      setTenantDataError('The organization workspace could not be loaded completely. No partial tenant data is being shown.');
      markSubscriptionInitialized(key);
    };

    const metricsRef = doc(db, 'tenants', tenantId, 'summary_metrics', 'current');
    const unsubMetrics = onSnapshot(
      metricsRef,
      (snap) => {
        setMetrics(snap.exists() ? snap.data() : null);
        markSubscriptionInitialized('metrics');
      },
      () => handleSubscriptionError('metrics')
    );

    // 2. Controls
    const controlsRef = collection(db, 'tenants', tenantId, 'controls');
    const unsubControls = onSnapshot(
      controlsRef,
      (snap) => {
        setControlsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('controls');
      },
      () => handleSubscriptionError('controls')
    );

    // 3. Evidence
    const evidenceRef = collection(db, 'tenants', tenantId, 'evidence');
    const unsubEvidence = onSnapshot(
      evidenceRef,
      (snap) => {
        setEvidenceList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('evidence');
      },
      () => handleSubscriptionError('evidence')
    );

    // 4-6. Operational registers. Raw records and immutable history are
    // deliberately not browser-readable; these bounded projections verify the
    // current state/version/receipt/audit anchor before assigning assurance.
    const unsubRisks = () => {};
    const unsubTasks = () => {};
    const unsubIssues = () => {};
    const loadOperationalProjection = async (
      callableName: 'listTenantRisks' | 'listTenantTasks' | 'listTenantIssues',
      field: 'risks' | 'tasks' | 'issues'
    ): Promise<unknown[]> => {
      const listPage = httpsCallable<
        { tenantId: string; pageSize: number; cursor?: string },
        {
          risks?: unknown[];
          tasks?: unknown[];
          issues?: unknown[];
          truncated?: boolean;
          nextCursor?: string | null;
        }
      >(functions, callableName);
      const records: unknown[] = [];
      let cursor: string | undefined;
      // The landing workspace is deliberately complete-or-unavailable. Ten
      // pages avoids silently presenting a partial register while keeping the
      // initial load bounded; dedicated register pagination can scale beyond it.
      for (let page = 0; page < 10; page += 1) {
        const response = await listPage({ tenantId, pageSize: 100, ...(cursor ? { cursor } : {}) });
        const pageRecords = response.data[field];
        if (!Array.isArray(pageRecords)) {
          throw new Error(`${field} projection response is invalid.`);
        }
        records.push(...pageRecords);
        if (!response.data.truncated) return records;
        if (!response.data.nextCursor || response.data.nextCursor === cursor) {
          throw new Error(`${field} projection pagination is invalid.`);
        }
        cursor = response.data.nextCursor;
      }
      throw new Error(`${field} register exceeds the bounded workspace projection.`);
    };
    void loadOperationalProjection('listTenantRisks', 'risks')
      .then((records) => {
        if (!subscriptionActive) return;
        setRisksList(records);
        markSubscriptionInitialized('risks');
      })
      .catch(() => handleSubscriptionError('risks'));
    void loadOperationalProjection('listTenantTasks', 'tasks')
      .then((records) => {
        if (!subscriptionActive) return;
        setTasksList(records);
        markSubscriptionInitialized('tasks');
      })
      .catch(() => handleSubscriptionError('tasks'));
    void loadOperationalProjection('listTenantIssues', 'issues')
      .then((records) => {
        if (!subscriptionActive) return;
        setIssuesList(records);
        markSubscriptionInitialized('issues');
      })
      .catch(() => handleSubscriptionError('issues'));

    // 7. Audit Logs
    let unsubAudit = () => {};
    if (canReadAuditLogs) {
      const auditLogsRef = collection(db, 'tenants', tenantId, 'audit_logs');
      const auditQuery = query(auditLogsRef, orderBy('timestamp', 'desc'), limit(15));
      unsubAudit = onSnapshot(
        auditQuery,
        (snap) => {
          setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          markSubscriptionInitialized('audit');
        },
        () => handleSubscriptionError('audit')
      );
    }

    // 8. ROPA (Article 30 Activities)
    const ropaRef = collection(db, 'tenants', tenantId, 'ropa_entries');
    const unsubRopa = onSnapshot(
      ropaRef,
      (snap) => {
        setRopaList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('ropa');
      },
      () => handleSubscriptionError('ropa')
    );

    // 9. Breaches
    let unsubBreaches = () => {};
    if (canReadBreaches) {
      const breachesRef = collection(db, 'tenants', tenantId, 'breaches');
      unsubBreaches = onSnapshot(
        breachesRef,
        (snap) => {
          setBreachesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
          markSubscriptionInitialized('breaches');
        },
        () => handleSubscriptionError('breaches')
      );
    }

    // 10. AI Systems
    const aiSystemsRef = collection(db, 'tenants', tenantId, 'ai_systems');
    const unsubAI = onSnapshot(
      aiSystemsRef,
      (snap) => {
        setAiSystemsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('ai_systems');
      },
      () => handleSubscriptionError('ai_systems')
    );

    // 11. Export Jobs
    const exportJobsRef = collection(db, 'tenants', tenantId, 'export_jobs');
    const exportJobsQuery = userRole === 'tenant_admin'
      ? exportJobsRef
      : query(exportJobsRef, where('requestedBy', '==', user.uid));
    const unsubExports = onSnapshot(
      exportJobsQuery,
      (snap) => {
        setExportJobsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('exports');
      },
      () => handleSubscriptionError('exports')
    );

    // 12. Adopted Frameworks
    const adoptedFrameworksRef = collection(db, 'tenants', tenantId, 'adopted_frameworks');
    const unsubFrameworks = onSnapshot(
      adoptedFrameworksRef,
      (snap) => {
        setAdoptedFrameworksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('frameworks');
      },
      () => handleSubscriptionError('frameworks')
    );

    // 13. Certifications. Raw records are intentionally not browser-readable;
    // this projection verifies each current version/receipt/audit chain.
    const unsubCerts = () => {};
    const listCertifications = httpsCallable<
      { tenantId: string },
      { certifications?: unknown[]; truncated?: boolean }
    >(functions, 'listTenantCertifications');
    void listCertifications({ tenantId })
      .then((response) => {
        if (!subscriptionActive) return;
        if (!Array.isArray(response.data.certifications)) {
          throw new Error('Certification projection response is invalid.');
        }
        setCertificationsList(response.data.certifications);
        markSubscriptionInitialized('certifications');
      })
      .catch(() => handleSubscriptionError('certifications'));

    // 14. Processor Assessments
    const assessmentsRef = collection(db, 'tenants', tenantId, 'processor_assessments');
    const unsubAssessments = onSnapshot(
      assessmentsRef,
      (snap) => {
        setAssessmentsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
        markSubscriptionInitialized('assessments');
      },
      () => handleSubscriptionError('assessments')
    );

    return () => {
      subscriptionActive = false;
      unsubMetrics();
      unsubControls();
      unsubEvidence();
      unsubRisks();
      unsubTasks();
      unsubIssues();
      unsubAudit();
      unsubRopa();
      unsubBreaches();
      unsubAI();
      unsubExports();
      unsubFrameworks();
      unsubCerts();
      unsubAssessments();
    };
  }, [authLoading, availableTenants, canReadAuditLogs, canReadBreaches, tenantDataReloadKey, tenantId, user, userRole]);

  // Membership administration is a privileged server workflow. Never query a
  // browser-readable `/members` or `/memberships` collection for this screen.
  useEffect(() => {
    setMembersList([]);
    setMembersError(null);

    if (authLoading || !user || !tenantId || !canViewMembers) {
      setMembersLoading(false);
      return;
    }

    let cancelled = false;
    setMembersLoading(true);

    const loadMembers = async () => {
      try {
        const listMembers = httpsCallable<
          { tenantId: string },
          { success: true; count: number; members: any[] }
        >(functions, 'listTenantMembers');
        const response = await listMembers({ tenantId });
        const rawMembers = Array.isArray(response.data?.members) ? response.data.members : [];
        const scopedMembers = rawMembers.filter(
          (member) =>
            member &&
            typeof member === 'object' &&
            member.tenantId === tenantId &&
            typeof member.userId === 'string' &&
            member.userId.length > 0
        );

        if (!cancelled) {
          setMembersList(scopedMembers);
        }
      } catch {
        if (!cancelled) {
          setMembersList([]);
          setMembersError('Organization memberships could not be loaded.');
        }
      } finally {
        if (!cancelled) {
          setMembersLoading(false);
        }
      }
    };

    void loadMembers();
    return () => {
      cancelled = true;
    };
  }, [authLoading, canViewMembers, membersRefreshKey, tenantId, user]);

  // Privileged Backend Actions
  const handleRecalculateMetrics = async () => {
    setLoadingAction('metrics');
    try {
      const fn = httpsCallable(functions, 'materializeTenantMetrics');
      await fn({ tenantId });
      showNotice('✅ Summary compliance metrics successfully re-materialized from live database records.');
    } catch (err: any) {
      showNotice(`❌ Error recalculating metrics: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRejectEvidence = async (evidenceId: string, reason: string) => {
    setLoadingAction(`reject_${evidenceId}`);
    try {
      const fn = httpsCallable(functions, 'rejectEvidence');
      await fn({ tenantId, evidenceId, rejectionReason: reason });
      showNotice('⚠️ Evidence marked as rejected. Contributor notified for revision.');
      setRejectEvidenceModal({ open: false, evidenceId: '', title: '' });
    } catch (err: any) {
      showNotice(`❌ Rejection failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateControl = async (control: { code: string; title: string; description: string; domain: string; frameworkIds: string[] }) => {
    setLoadingAction('create_control');
    try {
      const fn = httpsCallable(functions, 'createTenantControl');
      await fn({
        tenantId,
        code: control.code,
        title: control.title,
        description: control.description,
        domain: control.domain,
        frameworkIds: control.frameworkIds,
      });
      showNotice(`✅ Control ${control.code} created as not started. Implementation and effectiveness require separate review.`);
      setCreateControlModalOpen(false);
    } catch (err: any) {
      showNotice(`❌ Control creation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleInviteMember = async (member: { email: string; role: string; department: string }) => {
    setLoadingAction('invite_member');
    try {
      const fn = httpsCallable(functions, 'inviteUserToTenant');
      await fn({
        tenantId,
        email: member.email,
        role: member.role,
        department: member.department,
      });
      showNotice(`✅ Invitation record created for ${member.email} with role ${member.role}. Email delivery is not configured.`);
      setMembersRefreshKey((current) => current + 1);
      setInviteMemberModalOpen(false);
    } catch (err: any) {
      showNotice(`❌ Invitation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRequestExport = async (exportType: string) => {
    setLoadingAction(`export_${exportType}`);
    try {
      const fn = httpsCallable(functions, 'generateTenantEvidenceExport');
      const res: any = await fn({
        tenantId,
        exportType,
        filters: {},
      });
      showNotice(`📦 Export job completed with recorded path: ${res.data.fileStoragePath || 'No download path returned'}. Verify the artifact before audit use.`);
    } catch (err: any) {
      showNotice(`❌ Export failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleCreateAssessment = async (assessment: any, autoSend: boolean) => {
    setLoadingAction('create_assessment');
    try {
      const fn = httpsCallable(functions, 'createProcessorAssessment');
      const respondent = assessment.respondent || {};
      const res: any = await fn({
        tenantId,
        title: assessment.title,
        assessmentType: assessment.assessmentType,
        templateId: assessment.templateId,
        vendorId: assessment.vendorId,
        vendorName: assessment.vendorName,
        processorProfileId: assessment.processorProfileId,
        processorEngagementName: assessment.processorEngagementName,
        transferArrangementId: assessment.transferArrangementId,
        linkedSystemAssetIds: assessment.linkedSystemAssetIds,
        linkedControlIds: assessment.linkedControlIds,
        linkedEvidenceIds: assessment.linkedEvidenceIds,
        isRecurring: assessment.isRecurring,
        recurrenceCadence: assessment.recurrenceCadence,
        nextDueDate: assessment.nextDueDate,
        respondentName: respondent.name,
        respondentEmail: respondent.email,
        respondentTitle: respondent.title,
        respondentCompanyName: respondent.companyName,
        dueDate: assessment.dueDate,
        reviewOwnerUserId: assessment.reviewOwnerUserId,
        customSections: assessment.sections,
        autoSend,
      });
      showNotice(`✅ Assessment ${res.data.assessmentId} created.`);
      return res.data;
    } catch (err: any) {
      showNotice(`❌ Creation failed: ${err.message}`);
      throw err;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleSendAssessment = async (assessmentId: string) => {
    setLoadingAction(`send_${assessmentId}`);
    try {
      const fn = httpsCallable(functions, 'sendProcessorAssessment');
      const res: any = await fn({ tenantId, assessmentId });
      showNotice(`🚀 Assessment access link generated!`);
      return res.data;
    } catch (err: any) {
      showNotice(`❌ Send failed: ${err.message}`);
      throw err;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleReviewAssessment = async (
    assessmentId: string,
    decision: 'start_review' | 'accept' | 'reject' | 'request_revision',
    reviewNotes?: string,
    rejectionReason?: string,
    revisionRequestNotes?: string,
    questionReviews?: Record<string, { reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding'; reviewerComment?: string }>
  ) => {
    setLoadingAction(`review_${assessmentId}`);
    try {
      const fn = httpsCallable(functions, 'reviewProcessorAssessment');
      await fn({
        tenantId,
        assessmentId,
        decision,
        reviewNotes,
        rejectionReason,
        revisionRequestNotes,
        questionReviews: questionReviews || {},
      });
      showNotice(`✅ Assessment review updated!`);
    } catch (err: any) {
      showNotice(`❌ Review failed: ${err.message}`);
      throw err;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleRenewAssessment = async (previousAssessmentId: string, dueDate: string) => {
    setLoadingAction(`renew_${previousAssessmentId}`);
    try {
      const fn = httpsCallable(functions, 'renewRecurringProcessorAssessment');
      const res: any = await fn({
        tenantId,
        previousAssessmentId,
        dueDate,
      });
      showNotice(`✅ Recurring assessment renewed! Prior version archived as superseded.`);
      return res.data;
    } catch (err: any) {
      showNotice(`❌ Renewal failed: ${err.message}`);
      throw err;
    } finally {
      setLoadingAction(null);
    }
  };

  const handleClassifyAI = async (params: { systemId: string; isProhibited: boolean; annexThreeCategory: string }) => {
    void params;
    showNotice('AI classification is unavailable until the full Article 5 and Annex III assessment is completed. No legal determination was recorded.');
    setClassifyAIModal({ open: false, systemId: '', name: '' });
  };

  const handleAdoptFramework = async (params: { frameworkId: string; frameworkName: string; scope: string }) => {
    setLoadingAction(`adopt_${params.frameworkId}`);
    try {
      const fn = httpsCallable(functions, 'adoptFramework');
      await fn({
        tenantId,
        frameworkId: params.frameworkId,
        scopeDescription: params.scope,
        scopingBoundaries: [],
      });
      showNotice(`✅ ${params.frameworkName} adoption recorded. Complete and approve scoping before relying on applicability results.`);
      setAdoptFrameworkModal({ open: false, frameworkId: '', frameworkName: '' });
    } catch (err: any) {
      showNotice(`❌ Framework adoption failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  const handleInstantiateFramework = async (frameworkId: string, frameworkName: string) => {
    setLoadingAction(`instantiate_${frameworkId}`);
    try {
      const fn = httpsCallable(functions, 'instantiateTenantFrameworkControls');
      const res: any = await fn({ tenantId, frameworkId });
      showNotice(`✅ ${frameworkName} instantiated! Added ${res.data.controlsCreatedCount} controls.`);
    } catch (err: any) {
      showNotice(`❌ Instantiation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Map activeTab to Top-Level Navigation Area
  const getTopLevelArea = (tab: TabType): string => {
    if (tab === 'overview') return 'home';
    if (tab === 'coverage_dashboard') return 'executive';
    if (['frameworks', 'applicability_review', 'controls'].includes(tab)) return 'frameworks';
    if (['processor_hub', 'processor_assessments', 'processor_transfers', 'certifications', 'processor_assurance_inventory', 'processor_inventory'].includes(tab)) return 'third_parties';
    if (tab === 'gdpr') return 'privacy';
    if (tab === 'ai_systems') return 'ai_governance';
    if (['evidence', 'risks_tasks'].includes(tab)) return 'operations';
    if (tab === 'exports') return 'reports';
    if (tab === 'members') return 'settings';
    return 'home';
  };

  const activeTopArea = getTopLevelArea(activeTab);

  const topNavAreas = [
    { id: 'home', label: 'Home', icon: '🏠', defaultTab: 'overview' as TabType },
    { id: 'executive', label: 'Executive', icon: '📊', defaultTab: 'coverage_dashboard' as TabType },
    { id: 'frameworks', label: 'Frameworks', icon: '📐', defaultTab: 'frameworks' as TabType },
    { id: 'third_parties', label: 'Third Parties', icon: '🛡️', defaultTab: 'processor_hub' as TabType },
    { id: 'privacy', label: 'Privacy', icon: '⚖️', defaultTab: 'gdpr' as TabType },
    { id: 'ai_governance', label: 'AI Governance', icon: '🤖', defaultTab: 'ai_systems' as TabType },
    { id: 'operations', label: 'Operations', icon: '⚙️', defaultTab: 'evidence' as TabType },
    { id: 'reports', label: 'Reports', icon: '📦', defaultTab: 'exports' as TabType },
    { id: 'settings', label: 'Settings', icon: '👥', defaultTab: 'members' as TabType },
  ].filter((area) => area.id !== 'settings' || canViewMembers);

  const subNavMap: Record<string, { id: TabType; label: string }[]> = {
    frameworks: [
      { id: 'frameworks', label: 'Framework Wizard' },
      { id: 'applicability_review', label: 'Scoping & Applicability' },
      { id: 'controls', label: 'Unified Controls Catalog' },
    ],
    third_parties: [
      { id: 'processor_hub', label: 'Processor Hub' },
      { id: 'processor_assessments', label: 'Due Diligence Questionnaires' },
      { id: 'processor_transfers', label: 'Transfer Impact (TIAs)' },
      { id: 'certifications', label: 'Certifications & Assurance' },
      { id: 'processor_assurance_inventory', label: 'Assurance Inventory' },
      { id: 'processor_inventory', label: 'Processor Roster' },
    ],
    operations: [
      { id: 'evidence', label: 'Evidence Repository' },
      { id: 'risks_tasks', label: 'Risks & Tasks' },
    ],
  };

  const selectedTenantMembership = availableTenants.find(
    (membership) => membership.id === tenantId && membership.role === userRole
  );

  if (authLoading) {
    return (
      <AccessStatePanel
        icon="⏳"
        title="Verifying access"
        description="Authentication and active organization memberships are being verified. Organization records remain unavailable until this check completes."
      />
    );
  }

  if (!user) {
    return (
      <AccessStatePanel
        icon="🔐"
        title="Sign in to euroGovernance"
        description="Use your organization account. No tenant is selected and no organization data is loaded before authentication succeeds."
      >
        <form onSubmit={handleLoginSubmit} style={{ display: 'grid', gap: '12px' }}>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Email
            <input
              type="email"
              autoComplete="username"
              value={loginEmail}
              onChange={(event) => setLoginEmail(event.target.value)}
              className="input-modern"
              required
              disabled={loginSubmitting}
            />
          </label>
          <label style={{ display: 'grid', gap: '6px', color: 'var(--text-secondary)', fontSize: '12px' }}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={loginPassword}
              onChange={(event) => setLoginPassword(event.target.value)}
              className="input-modern"
              required
              disabled={loginSubmitting}
            />
          </label>
          {loginError && (
            <p role="alert" style={{ color: 'var(--status-critical-fg)', fontSize: '12px' }}>{loginError}</p>
          )}
          <button type="submit" className="btn-primary" disabled={loginSubmitting}>
            {loginSubmitting ? 'Signing in…' : 'Sign in'}
          </button>
        </form>

        {devPersonasEnabled && (
          <div style={{ marginTop: '24px', paddingTop: '20px', borderTop: '1px solid var(--border-subtle)' }}>
            <p style={{ fontSize: '11px', color: 'var(--status-warning-fg)', marginBottom: '10px' }}>
              Local Auth emulator personas
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '6px' }}>
              {[
                { id: 'tenant_admin', label: 'Admin' },
                { id: 'compliance_manager', label: 'Compliance' },
                { id: 'security_manager', label: 'Security' },
                { id: 'privacy_manager', label: 'Privacy' },
                { id: 'ai_governance_manager', label: 'AI Lead' },
                { id: 'approver', label: 'Approver' },
                { id: 'auditor', label: 'Auditor' },
                { id: 'contributor', label: 'Contributor' },
              ].map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  className="btn-secondary"
                  disabled={loginSubmitting}
                  onClick={() => void handleDevPersonaLogin(persona.id)}
                  style={{ fontSize: '11px' }}
                >
                  {persona.label}
                </button>
              ))}
            </div>
          </div>
        )}
      </AccessStatePanel>
    );
  }

  if (membershipError) {
    return (
      <AccessStatePanel icon="⚠️" title="Organization access could not be verified" description={membershipError}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={() => void refreshMemberships()}>Retry verification</button>
          <button className="btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </AccessStatePanel>
    );
  }

  if (availableTenants.length === 0 || !tenantId || !userRole) {
    return (
      <AccessStatePanel
        icon="🚫"
        title="No active organization access"
        description="Your account is authenticated but has no verified active tenant membership. Ask an organization administrator to grant or reactivate access."
      >
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={() => void refreshMemberships()}>Check again</button>
          <button className="btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </AccessStatePanel>
    );
  }

  if (!selectedTenantMembership) {
    return (
      <AccessStatePanel
        icon="🔒"
        title="Tenant selection rejected"
        description="The selected tenant is not present in your verified active memberships. No organization records have been loaded."
      >
        <button className="btn-primary" onClick={() => void refreshMemberships()}>Reload memberships</button>
      </AccessStatePanel>
    );
  }

  if (tenantDataError) {
    return (
      <AccessStatePanel icon="⚠️" title="Workspace unavailable" description={tenantDataError}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={() => setTenantDataReloadKey((current) => current + 1)}>Retry workspace</button>
          <button className="btn-secondary" onClick={() => void logout()}>Sign out</button>
        </div>
      </AccessStatePanel>
    );
  }

  if (tenantDataScopeId !== tenantId) {
    return (
      <AccessStatePanel
        icon="⏳"
        title="Loading organization workspace"
        description="Required tenant records are loading. The dashboard will remain hidden until every required data source responds."
      />
    );
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--surface-l1-canvas)' }}>
      {/* 1. SIDEBAR */}
      <aside
        style={{
          width: '240px',
          backgroundColor: 'var(--surface-l2-card)',
          borderRight: '1px solid var(--border-default)',
          padding: '20px 14px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          {/* Logo & Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '20px', padding: '0 6px' }}>
            <div
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#ffffff',
                fontSize: '13px',
                boxShadow: '0 0 12px var(--accent-primary-glow)',
              }}
            >
              EG
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '14px', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                euroGovernance
              </div>
              <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Governance &amp; Compliance Workspace</div>
            </div>
          </div>

          {/* Tenant Context Selector */}
          <div style={{ marginBottom: '20px', padding: '0 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
              <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Tenant Context
              </span>
              <span style={{ fontSize: '9px', fontWeight: 700, padding: '1px 5px', borderRadius: '4px', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-muted)' }}>
                VERIFIED
              </span>
            </div>
            <select
              aria-label="Active organization"
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              disabled={availableTenants.length < 2 || loadingAction !== null}
              className="input-modern"
              style={{
                width: '100%',
                fontSize: '11.5px',
                fontWeight: 600,
                padding: '6px 8px',
              }}
            >
              {availableTenants.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
            {membershipsTruncated && (
              <p style={{ marginTop: '6px', color: 'var(--status-warning-fg)', fontSize: '10px' }}>
                Membership list limited to the first 250 active organizations.
              </p>
            )}
          </div>

          {/* 9 Scannable Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
            {topNavAreas.map((area) => {
              const isSelected = activeTopArea === area.id;
              return (
                <button
                  key={area.id}
                  onClick={() => setActiveTab(area.defaultTab)}
                  style={{
                    textAlign: 'left',
                    padding: '8px 12px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: isSelected ? 700 : 500,
                    backgroundColor: isSelected ? 'var(--accent-primary-subtle)' : 'transparent',
                    color: isSelected ? 'var(--text-primary)' : 'var(--text-secondary)',
                    border: isSelected ? '1px solid var(--accent-primary)' : '1px solid transparent',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    transition: 'background-color 0.15s ease, color 0.15s ease, border-color 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                  }}
                >
                  <span style={{ fontSize: '15px' }}>{area.icon}</span>
                  <span>{area.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Verified role context; emulator persona controls are explicitly gated. */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '12px', paddingLeft: '2px' }}>
          <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span>Role Context:</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'capitalize', fontSize: '11px' }}>
              {userRole?.replace('_', ' ')}
            </span>
          </div>
          {devPersonasEnabled && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '3px', marginBottom: '8px' }}>
              {[
                { id: 'tenant_admin', label: 'Admin' },
                { id: 'compliance_manager', label: 'Compliance' },
                { id: 'security_manager', label: 'Security' },
                { id: 'privacy_manager', label: 'Privacy' },
                { id: 'ai_governance_manager', label: 'AI Lead' },
                { id: 'approver', label: 'Approver' },
                { id: 'auditor', label: 'Auditor' },
                { id: 'contributor', label: 'Contrib' },
              ].map((persona) => (
                <button
                  key={persona.id}
                  type="button"
                  disabled={loginSubmitting || loadingAction !== null}
                  onClick={() => void handleDevPersonaLogin(persona.id)}
                  style={{
                    fontSize: '9.5px',
                    fontWeight: 500,
                    padding: '4px 2px',
                    textAlign: 'center',
                    borderRadius: '4px',
                    border: '1px solid var(--border-default)',
                    backgroundColor: 'var(--surface-subtle)',
                    color: 'var(--text-secondary)',
                    cursor: 'pointer',
                  }}
                >
                  {persona.label}
                </button>
              ))}
            </div>
          )}
          <button
            type="button"
            className="btn-secondary"
            onClick={() => void logout().catch(() => showNotice('Sign-out failed. Your authenticated session remains active.'))}
            style={{ width: '100%', fontSize: '10.5px', padding: '5px 8px' }}
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* 2. MAIN APPLICATION CONTENT AREA */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflowY: 'auto' }}>
        {/* TOPBAR / LOCAL SUBNAVIGATION HEADER */}
        <div
          style={{
            padding: '16px 36px',
            backgroundColor: 'var(--surface-l2-card)',
            borderBottom: '1px solid var(--border-default)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            position: 'sticky',
            top: 0,
            zIndex: 20,
          }}
        >
          {/* Breadcrumb Path & Subnavigation */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', fontWeight: 600, color: 'var(--text-secondary)' }}>
              <span>{topNavAreas.find((a) => a.id === activeTopArea)?.icon}</span>
              <span style={{ color: 'var(--text-primary)', fontWeight: 700 }}>
                {topNavAreas.find((a) => a.id === activeTopArea)?.label}
              </span>
            </div>

            {/* Local Context Subnavigation Tabs */}
            {subNavMap[activeTopArea] && (
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  backgroundColor: 'var(--surface-subtle)',
                  padding: '3px',
                  borderRadius: '8px',
                  border: '1px solid var(--border-subtle)',
                }}
              >
                {subNavMap[activeTopArea].map((subItem) => {
                  const isSubActive = activeTab === subItem.id;
                  return (
                    <button
                      key={subItem.id}
                      onClick={() => setActiveTab(subItem.id)}
                      style={{
                        padding: '4px 10px',
                        fontSize: '11.5px',
                        fontWeight: isSubActive ? 700 : 500,
                        backgroundColor: isSubActive ? 'var(--surface-l3-elevated)' : 'transparent',
                        color: isSubActive ? 'var(--text-primary)' : 'var(--text-muted)',
                        borderRadius: '5px',
                        border: 'none',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {subItem.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Quick Search and Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div
              onClick={() => setSearchModalOpen(true)}
              style={{
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                padding: '6px 12px',
                backgroundColor: 'var(--surface-subtle)',
                border: '1px solid var(--border-default)',
                borderRadius: '6px',
                fontSize: '12px',
                color: 'var(--text-muted)',
              }}
            >
              <span>🔍 Search</span>
              <kbd style={{ fontSize: '10px', padding: '1px 4px', borderRadius: '3px', backgroundColor: 'var(--surface-l2-card)', border: '1px solid var(--border-subtle)' }}>
                ⌘K
              </kbd>
            </div>

            <button
              onClick={() => handleRequestExport('tenant_evidence_package_zip')}
              className="btn-secondary"
              style={{ fontSize: '12px', padding: '6px 12px' }}
            >
              📦 Request Export Draft
            </button>

            <button
              onClick={() => setOnboardingWizardOpen(true)}
              className="btn-primary"
              style={{ fontSize: '12px', padding: '6px 12px', fontWeight: 700 }}
            >
              🚀 {onboardingIsCompleted ? 'Replay Guide' : 'Onboarding Guide'}
            </button>
          </div>
        </div>

        {/* Viewport Content */}
        <div style={{ padding: '28px 36px', flex: 1 }}>
          {/* Onboarding Progress Banner */}
          {!onboardingIsCompleted && !onboardingIsDismissed && (
            <OnboardingProgressBanner
              flowConfig={flowConfig}
              currentStepIndex={onboardingCurrentStepIndex}
              completedStepsCount={onboardingProgress?.completedStepIds?.length || 0}
              totalSteps={onboardingTotalSteps}
              percentComplete={onboardingPercentComplete}
              onOpenWizard={() => setOnboardingWizardOpen(true)}
              onDismiss={onboardingDismissBanner}
            />
          )}

          {/* Action Notice Banner */}
          {actionNotice && (
            <div
              style={{
                padding: '12px 18px',
                backgroundColor: 'var(--surface-l3-elevated)',
                border: '1px solid var(--border-focus)',
                borderRadius: '8px',
                marginBottom: '24px',
                fontSize: '13px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                boxShadow: 'var(--shadow-md)',
              }}
            >
              <span>{actionNotice}</span>
              <button onClick={() => setActionNotice(null)} style={{ color: 'var(--text-muted)', fontSize: '16px' }}>
                ✕
              </button>
            </div>
          )}

          {/* TAB 1: EXECUTIVE & ROLE-TAILORED OVERVIEW */}
          {activeTab === 'overview' && (
            <OverviewTabView
              userRole={userRole}
              metrics={metrics}
              controlsList={controlsList}
              evidenceList={evidenceList}
              issuesList={issuesList}
              aiSystemsList={aiSystemsList}
              auditLogs={auditLogs}
              onNavigateToTab={(tab) => setActiveTab(tab as TabType)}
              onRecalculateMetrics={handleRecalculateMetrics}
              loadingAction={loadingAction}
            />
          )}

          {/* TAB 2: UNIFIED CONTROLS */}
          {activeTab === 'controls' && (
            <ControlsTabView
              controlsList={controlsList}
              adoptedFrameworksList={adoptedFrameworksList}
              onOpenCreateControlModal={() => setCreateControlModalOpen(true)}
              onOpenAdoptFrameworkModal={(fw) =>
                setAdoptFrameworkModal({
                  open: true,
                  frameworkId: fw.id,
                  frameworkName: fw.name,
                })
              }
              onInstantiateFramework={handleInstantiateFramework}
              loadingAction={loadingAction}
            />
          )}

          {/* TAB 3: EVIDENCE INBOX */}
          {activeTab === 'evidence' && (
            <EvidenceTabView
              evidenceList={evidenceList}
              onOpenApproveModal={() => undefined}
              onOpenRejectModal={(ev) =>
                setRejectEvidenceModal({
                  open: true,
                  evidenceId: ev.id,
                  title: ev.title,
                })
              }
              loadingAction={loadingAction}
            />
          )}

          {/* TAB: CERTIFICATIONS & STRUCTURED ASSURANCE */}
          {activeTab === 'certifications' && (
            <div>
              <header style={{ marginBottom: '24px' }}>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Structured Certifications & External Assurance
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Record certificate scope, dates, status, and surveillance schedules. Evidence linking remains unavailable until object verification is implemented.
                </p>
              </header>
              <CertificationsManager
                tenantId={tenantId}
                userRole={userRole}
                userId={user.uid}
                certifications={certificationsList}
                evidenceList={evidenceList}
                controlsList={controlsList}
                systemsList={aiSystemsList}
                vendorsList={[]}
                onChanged={() => setTenantDataReloadKey((value) => value + 1)}
              />
            </div>
          )}

          {/* TAB 4: RISKS & TASKS */}
          {activeTab === 'risks_tasks' && (
            <RisksTasksTabView
              tenantId={tenantId}
              userId={user.uid}
              userRole={userRole}
              risksList={risksList}
              issuesList={issuesList}
              tasksList={tasksList}
              onChanged={() => setTenantDataReloadKey((value) => value + 1)}
            />
          )}

          {/* TAB 5: GDPR & PRIVACY */}
          {activeTab === 'gdpr' && (
            <GDPRPrivacyTabView
              ropaList={ropaList}
              breachesList={breachesList}
              onNavigateToTab={(tab) => setActiveTab(tab as TabType)}
            />
          )}

          {/* TAB 5B: PROCESSOR INVENTORY */}
          {activeTab === 'processor_inventory' && (
            <ProcessorInventory
              tenantId={tenantId}
              onSelectProcessorForHub={(profId) => {
                setSelectedHubProcessorProfileId(profId);
                setActiveTab('processor_hub');
              }}
              onNavigateToTransfers={() => setActiveTab('processor_transfers')}
              onNotice={showNotice}
            />
          )}

          {/* TAB 5B2: PROCESSOR ASSURANCE & CERTIFICATION INVENTORY */}
          {activeTab === 'processor_assurance_inventory' && (
            <ProcessorAssuranceInventory
              tenantId={tenantId}
              onSelectProcessorForHub={(profId) => {
                setSelectedHubProcessorProfileId(profId);
                setActiveTab('processor_hub');
              }}
              onNotice={showNotice}
            />
          )}

          {/* TAB 5B3: PROCESSOR DUE DILIGENCE & RECURRING ASSESSMENTS */}
          {activeTab === 'processor_assessments' && (
            <ProcessorAssessmentWorkspace
              tenantId={tenantId}
              currentUserId={user?.uid || ''}
              currentUserRole={userRole}
              assessments={assessmentsList}
              onCreateAssessment={handleCreateAssessment}
              onSendAssessment={handleSendAssessment}
              onReviewAssessment={handleReviewAssessment}
              onRenewAssessment={handleRenewAssessment}
              onRequestExport={(exportType) => handleRequestExport(exportType)}
            />
          )}

          {/* TAB 5C: PROCESSOR GOVERNANCE OPERATIONAL HUB */}
          {activeTab === 'processor_hub' && (
            <ProcessorGovernanceHub
              tenantId={tenantId}
              initialProcessorProfileId={selectedHubProcessorProfileId}
              onNavigateToTab={(tabId) => setActiveTab(tabId as TabType)}
              onNotice={showNotice}
            />
          )}

          {/* TAB 5D: PROCESSOR CROSS-BORDER TRANSFERS */}
          {activeTab === 'processor_transfers' && (
            <ProcessorTransfersManager tenantId={tenantId} onNotice={showNotice} />
          )}

          {/* TAB 6: EU AI ACT REGISTER */}
          {activeTab === 'ai_systems' && (
            <AISystemsTabView
              aiSystemsList={aiSystemsList}
              onOpenClassifyModal={(sys) =>
                setClassifyAIModal({
                  open: true,
                  systemId: sys.id,
                  name: sys.name,
                })
              }
              loadingAction={loadingAction}
            />
          )}

          {/* TAB 7: MEMBERS & RBAC */}
          {activeTab === 'members' && (
            <MembersTabView
              membersList={membersList}
              onOpenInviteModal={() => setInviteMemberModalOpen(true)}
              canInvite={canInviteMembers}
              loading={membersLoading}
              error={membersError}
              onRetry={() => setMembersRefreshKey((current) => current + 1)}
            />
          )}

          {/* TAB 8: COMPLIANCE EXPORTS */}
          {activeTab === 'exports' && (
            <ExportsTabView
              exportJobsList={exportJobsList}
              onRequestExport={handleRequestExport}
              canRequestExport={canRequestExport}
              loadingAction={loadingAction}
            />
          )}

          {/* TAB: FRAMEWORK ADOPTION WIZARD */}
          {activeTab === 'frameworks' && (
            <FrameworkAdoptionWizard tenantId={tenantId} onComplete={() => showNotice('✅ Framework adoption & control instantiation complete!')} />
          )}

          {/* TAB: MULTI-FRAMEWORK COVERAGE DASHBOARD */}
          {activeTab === 'coverage_dashboard' && (
            <FrameworkCoverageDashboardTab
              tenantId={tenantId}
              onNavigateToWizard={() => setActiveTab('frameworks')}
              onNavigateToReview={() => setActiveTab('applicability_review')}
            />
          )}

          {/* TAB: APPLICABILITY REVIEW & DECISIONS */}
          {activeTab === 'applicability_review' && (
            <ApplicabilityReviewTab tenantId={tenantId} userRole={userRole} />
          )}
        </div>
      </main>

      {/* =========================================================================
          ACCESSIBLE MODAL DIALOGS
          ========================================================================= */}

      <CreateControlModal
        isOpen={createControlModalOpen}
        onClose={() => setCreateControlModalOpen(false)}
        onSubmit={handleCreateControl}
        loading={loadingAction === 'create_control'}
      />

      <InviteMemberModal
        isOpen={inviteMemberModalOpen}
        onClose={() => setInviteMemberModalOpen(false)}
        onSubmit={handleInviteMember}
        loading={loadingAction === 'invite_member'}
      />

      <RejectEvidenceModal
        isOpen={rejectEvidenceModal.open}
        evidenceId={rejectEvidenceModal.evidenceId}
        title={rejectEvidenceModal.title}
        onClose={() => setRejectEvidenceModal({ open: false, evidenceId: '', title: '' })}
        onReject={handleRejectEvidence}
        loading={loadingAction?.startsWith('reject_')}
      />

      <ClassifyAIModal
        isOpen={classifyAIModal.open}
        systemId={classifyAIModal.systemId}
        systemName={classifyAIModal.name}
        onClose={() => setClassifyAIModal({ open: false, systemId: '', name: '' })}
        onSubmit={handleClassifyAI}
        loading={loadingAction?.startsWith('classify_')}
      />

      <AdoptFrameworkModal
        isOpen={adoptFrameworkModal.open}
        frameworkId={adoptFrameworkModal.frameworkId}
        frameworkName={adoptFrameworkModal.frameworkName}
        onClose={() => setAdoptFrameworkModal({ open: false, frameworkId: '', frameworkName: '' })}
        onSubmit={handleAdoptFramework}
        loading={loadingAction?.startsWith('adopt_')}
      />

      <GlobalSearchModal
        isOpen={searchModalOpen}
        onClose={() => setSearchModalOpen(false)}
        controls={controlsList}
        evidence={evidenceList}
        ropa={ropaList}
        aiSystems={aiSystemsList}
        onSelectResult={(tab) => setActiveTab(tab as TabType)}
      />

      <OnboardingWizardModal
        isOpen={onboardingWizardOpen}
        onClose={() => setOnboardingWizardOpen(false)}
        flowConfig={flowConfig}
        currentStepIndex={onboardingCurrentStepIndex}
        onStepComplete={onboardingMarkStepComplete}
        onFinishOnboarding={onboardingCompleteOnboarding}
        onNavigateToTab={(tab) => setActiveTab(tab as TabType)}
        tenantId={tenantId}
        onNotice={showNotice}
      />
    </div>
  );
}

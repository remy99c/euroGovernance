'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../lib/auth-context';
import { db, functions } from '../lib/firebase';
import {
  collection,
  query,
  orderBy,
  limit,
  onSnapshot,
  doc,
  getDoc,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import FrameworkAdoptionWizard from './framework-adoption-wizard';
import ApplicabilityReviewTab from './applicability-review';
import FrameworkCoverageDashboardTab from './framework-coverage-dashboard';
import ProcessorTransfersManager from './processor-transfers-manager';
import ProcessorGovernanceHub from './processor-governance-hub';
import ProcessorInventory from './processor-inventory';
import ProcessorAssuranceInventory from './processor-assurance-inventory';
import { CertificationsManager } from './certifications-manager';
import { ProcessorAssessmentWorkspace } from './processor-assessment-workspace';
import ComplianceOverviewCards, { FrameworkReadinessItem } from './compliance-overview-cards';
import { UIModal } from './components/ui-modal';
import { UIEmptyState } from './components/ui-empty-state';
import { UIBadge } from './components/ui-badge';
import { UIStatCard } from './components/ui-stat-card';

type TabType =
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

export default function DashboardPage() {
  const { user, userRole, tenantId: currentTenantId, loginDevUser } = useAuth();
  const [tenantId, setTenantId] = useState<string>(currentTenantId || 'tenant_acme_eu');
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedHubProcessorProfileId, setSelectedHubProcessorProfileId] = useState<string | undefined>();
  const [searchQuery, setSearchQuery] = useState('');

  // Modals state
  const [createControlModalOpen, setCreateControlModalOpen] = useState(false);
  const [newControlCode, setNewControlCode] = useState('');
  const [newControlTitle, setNewControlTitle] = useState('');
  const [newControlDomain, setNewControlDomain] = useState('Access Control');
  const [newControlFrameworks, setNewControlFrameworks] = useState('iso_27001, gdpr');

  const [inviteMemberModalOpen, setInviteMemberModalOpen] = useState(false);
  const [newMemberEmail, setNewMemberEmail] = useState('');
  const [newMemberRole, setNewMemberRole] = useState('auditor');
  const [newMemberDept, setNewMemberDept] = useState('Risk & Assurance');

  const [approveEvidenceModal, setApproveEvidenceModal] = useState<{ open: boolean; evidenceId: string; title: string; notes: string }>({
    open: false,
    evidenceId: '',
    title: '',
    notes: 'Verified compliance with European regulatory safeguards.',
  });

  const [rejectEvidenceModal, setRejectEvidenceModal] = useState<{ open: boolean; evidenceId: string; title: string; reason: string }>({
    open: false,
    evidenceId: '',
    title: '',
    reason: 'Requires updated cryptographic signature and ISO control mapping.',
  });

  const [classifyAIModal, setClassifyAIModal] = useState<{
    open: boolean;
    systemId: string;
    name: string;
    isProhibited: boolean;
    annexThreeCategory: string;
  }>({
    open: false,
    systemId: '',
    name: '',
    isProhibited: false,
    annexThreeCategory: 'none',
  });

  const [adoptFrameworkModal, setAdoptFrameworkModal] = useState<{
    open: boolean;
    frameworkId: string;
    frameworkName: string;
    scope: string;
  }>({
    open: false,
    frameworkId: '',
    frameworkName: '',
    scope: 'Primary EU Operations, Cloud Infrastructure & Customer Data Processing',
  });

  // State: Data Collections
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

  // State: UI & Actions
  const [loadingAction, setLoadingAction] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Sync tenant ID with auth context
  useEffect(() => {
    if (currentTenantId && currentTenantId !== tenantId) {
      setTenantId(currentTenantId);
    }
  }, [currentTenantId]);

  // Notice notification helper
  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 6000);
  };

  // Subscriptions to Firestore Collections rooted at /tenants/{tenantId}
  useEffect(() => {
    if (!tenantId) return;

    // 1. Summary Metrics
    const metricsRef = doc(db, 'tenants', tenantId, 'summary_metrics', 'latest');
    const unsubMetrics = onSnapshot(metricsRef, (snap) => {
      if (snap.exists()) setMetrics(snap.data());
    });

    // 2. Controls
    const controlsRef = collection(db, 'tenants', tenantId, 'controls');
    const unsubControls = onSnapshot(controlsRef, (snap) => {
      setControlsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 3. Evidence
    const evidenceRef = collection(db, 'tenants', tenantId, 'evidence');
    const unsubEvidence = onSnapshot(evidenceRef, (snap) => {
      setEvidenceList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 4. Risks
    const risksRef = collection(db, 'tenants', tenantId, 'risks');
    const unsubRisks = onSnapshot(risksRef, (snap) => {
      setRisksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 5. Tasks
    const tasksRef = collection(db, 'tenants', tenantId, 'tasks');
    const unsubTasks = onSnapshot(tasksRef, (snap) => {
      setTasksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 6. Issues
    const issuesRef = collection(db, 'tenants', tenantId, 'issues');
    const unsubIssues = onSnapshot(issuesRef, (snap) => {
      setIssuesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 7. Audit Logs
    const auditLogsRef = collection(db, 'tenants', tenantId, 'audit_logs');
    const auditQuery = query(auditLogsRef, orderBy('timestamp', 'desc'), limit(15));
    const unsubAudit = onSnapshot(auditQuery, (snap) => {
      setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 8. ROPA
    const ropaRef = collection(db, 'tenants', tenantId, 'ropa_activities');
    const unsubRopa = onSnapshot(ropaRef, (snap) => {
      setRopaList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 9. Breaches
    const breachesRef = collection(db, 'tenants', tenantId, 'breaches');
    const unsubBreaches = onSnapshot(breachesRef, (snap) => {
      setBreachesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 10. AI Systems
    const aiSystemsRef = collection(db, 'tenants', tenantId, 'ai_systems');
    const unsubAI = onSnapshot(aiSystemsRef, (snap) => {
      setAiSystemsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 11. Members
    const membersRef = collection(db, 'tenants', tenantId, 'members');
    const unsubMembers = onSnapshot(membersRef, (snap) => {
      setMembersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 12. Export Jobs
    const exportJobsRef = collection(db, 'tenants', tenantId, 'export_jobs');
    const unsubExports = onSnapshot(exportJobsRef, (snap) => {
      setExportJobsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 13. Adopted Frameworks
    const adoptedFrameworksRef = collection(db, 'tenants', tenantId, 'adopted_frameworks');
    const unsubFrameworks = onSnapshot(adoptedFrameworksRef, (snap) => {
      setAdoptedFrameworksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 14. Certifications
    const certsRef = collection(db, 'tenants', tenantId, 'certifications');
    const unsubCerts = onSnapshot(certsRef, (snap) => {
      setCertificationsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    // 15. Processor Assessments
    const assessmentsRef = collection(db, 'tenants', tenantId, 'processor_assessments');
    const unsubAssessments = onSnapshot(assessmentsRef, (snap) => {
      setAssessmentsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
    });

    return () => {
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
      unsubMembers();
      unsubExports();
      unsubFrameworks();
      unsubCerts();
      unsubAssessments();
    };
  }, [tenantId]);

  // Actions: Metrics Recalculation
  const handleRecalculateMetrics = async () => {
    setLoadingAction('metrics');
    try {
      const fn = httpsCallable(functions, 'recalculateTenantMetrics');
      await fn({ tenantId });
      showNotice('✅ Summary compliance metrics successfully re-materialized from live database records.');
    } catch (err: any) {
      showNotice(`❌ Error recalculating metrics: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Four-Eyes Evidence Approval
  const handleApproveEvidence = async () => {
    const { evidenceId, notes } = approveEvidenceModal;
    setLoadingAction(`approve_${evidenceId}`);
    try {
      const fn = httpsCallable(functions, 'approveEvidence');
      await fn({ tenantId, evidenceId, decisionNotes: notes || 'Verified.' });
      showNotice('✅ Evidence signed off via Four-Eyes authorization! Immutable audit log recorded.');
      setApproveEvidenceModal({ open: false, evidenceId: '', title: '', notes: '' });
    } catch (err: any) {
      showNotice(`❌ Approval failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Evidence Rejection
  const handleRejectEvidence = async () => {
    const { evidenceId, reason } = rejectEvidenceModal;
    if (!reason.trim()) {
      showNotice('❌ Mandatory rejection rationale is required.');
      return;
    }

    setLoadingAction(`reject_${evidenceId}`);
    try {
      const fn = httpsCallable(functions, 'rejectEvidence');
      await fn({ tenantId, evidenceId, rejectionReason: reason });
      showNotice('⚠️ Evidence marked as rejected. Contributor notified for revision.');
      setRejectEvidenceModal({ open: false, evidenceId: '', title: '', reason: '' });
    } catch (err: any) {
      showNotice(`❌ Rejection failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Create New Control
  const handleCreateControl = async () => {
    if (!newControlCode || !newControlTitle) {
      showNotice('❌ Control Code and Title are required.');
      return;
    }

    setLoadingAction('create_control');
    try {
      const fn = httpsCallable(functions, 'createTenantControl');
      await fn({
        tenantId,
        code: newControlCode,
        title: newControlTitle,
        description: 'Enforces hardware security key token authentication across all administrative interfaces.',
        domain: newControlDomain,
        frameworkIds: newControlFrameworks.split(',').map((f) => f.trim()),
        requirementIds: ['A.9.1', 'Art. 32'],
        status: 'implemented',
        healthScore: 100,
        enforcementMechanism: 'automated',
      });
      showNotice(`✅ Control ${newControlCode} created successfully!`);
      setCreateControlModalOpen(false);
      setNewControlCode('');
      setNewControlTitle('');
    } catch (err: any) {
      showNotice(`❌ Control creation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Invite New Member
  const handleInviteMember = async () => {
    if (!newMemberEmail || !newMemberRole) {
      showNotice('❌ Email and Role are required.');
      return;
    }

    setLoadingAction('invite_member');
    try {
      const fn = httpsCallable(functions, 'inviteUserToTenant');
      await fn({ tenantId, email: newMemberEmail, role: newMemberRole, department: newMemberDept });
      showNotice(`✅ Invitation dispatched to ${newMemberEmail} with role ${newMemberRole}!`);
      setInviteMemberModalOpen(false);
      setNewMemberEmail('');
    } catch (err: any) {
      showNotice(`❌ Invitation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Trigger Export
  const handleRequestExport = async (exportType: string) => {
    setLoadingAction(`export_${exportType}`);
    try {
      const fn = httpsCallable(functions, 'requestExportPackage');
      const res: any = await fn({
        tenantId,
        exportType,
        format: exportType.endsWith('_pdf') ? 'pdf' : exportType.endsWith('_xlsx') ? 'xlsx' : 'zip',
      });
      showNotice(`📦 Export queued! Storage Path: ${res.data.fileStoragePath}`);
    } catch (err: any) {
      showNotice(`❌ Export failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Assessment Lifecycle Handlers
  const handleCreateAssessment = async (assessment: any, autoSend: boolean) => {
    setLoadingAction('create_assessment');
    try {
      const fn = httpsCallable(functions, 'createProcessorAssessment');
      const res: any = await fn({ tenantId, ...assessment, autoSend });
      showNotice(`✅ Assessment ${res.data.title || res.data.id} created!`);
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
        reviewDecision: decision === 'accept' ? 'approved' : decision === 'reject' ? 'rejected' : decision === 'request_revision' ? 'remediation_required' : 'in_review',
        reviewNotes: reviewNotes || revisionRequestNotes || rejectionReason,
        findings: questionReviews ? Object.entries(questionReviews).map(([qId, val]) => ({ questionId: qId, ...val })) : [],
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
      const fn = httpsCallable(functions, 'renewRecurringAssessment');
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

  const handleClassifyAI = async () => {
    const { systemId, isProhibited, annexThreeCategory } = classifyAIModal;
    setLoadingAction(`classify_${systemId}`);
    try {
      const fn = httpsCallable(functions, 'classifyTenantAISystem');
      const res: any = await fn({
        tenantId,
        aiSystemId: systemId,
        prohibitedPracticesCheck: {
          cognitiveBehavioralManipulation: isProhibited,
          vulnerabilityExploitation: false,
          socialScoring: false,
          predictivePolicing: false,
          untargetedFacialScraping: false,
          emotionRecognitionInWorkplaceOrEducation: false,
          biometricCategorizationSensitive: false,
          realTimeRemoteBiometricIdentification: false,
        },
        annexThreeCategory,
        justificationSummary: 'Classification determination processed via automated governance matrix.',
      });
      showNotice(`✅ AI System reclassified to: ${res.data.determinedRiskTier.toUpperCase()}!`);
      setClassifyAIModal({ open: false, systemId: '', name: '', isProhibited: false, annexThreeCategory: 'none' });
    } catch (err: any) {
      showNotice(`❌ AI classification failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Framework Adoption & Scoping
  const handleAdoptFramework = async () => {
    const { frameworkId, frameworkName, scope } = adoptFrameworkModal;
    setLoadingAction(`adopt_${frameworkId}`);
    try {
      const fn = httpsCallable(functions, 'adoptFramework');
      await fn({
        tenantId,
        frameworkId,
        scopeDescription: scope,
        scopingBoundaries: ['Frankfurt Production Cloud', 'EU Data Centers'],
      });
      showNotice(`✅ Successfully adopted ${frameworkName}! Initialized scoping and applicability matrix.`);
      setAdoptFrameworkModal({ open: false, frameworkId: '', frameworkName: '', scope: '' });
    } catch (err: any) {
      showNotice(`❌ Framework adoption failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Instantiate Framework Controls
  const handleInstantiateFramework = async (frameworkId: string, frameworkName: string) => {
    setLoadingAction(`instantiate_${frameworkId}`);
    try {
      const fn = httpsCallable(functions, 'instantiateFrameworkControls');
      const res: any = await fn({ tenantId, frameworkId });
      showNotice(`✅ ${frameworkName} instantiated! Added ${res.data.controlsCreatedCount} controls.`);
    } catch (err: any) {
      showNotice(`❌ Instantiation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Mock available tenants
  const availableTenants = [
    { id: 'tenant_acme_eu', name: 'Acme Health Europe (Frankfurt)' },
    { id: 'tenant_fintech_berlin', name: 'Berlin FinTech Sovereign AG' },
    { id: 'tenant_cloud_paris', name: 'Paris Cloud Solutions SAS' },
  ];

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-canvas)' }}>
      {/* Sidebar Navigation */}
      <aside
        style={{
          width: '270px',
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-subtle)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          flexShrink: 0,
        }}
      >
        <div>
          {/* Logo & Brand Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', padding: '0 8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-primary)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 800,
                color: '#ffffff',
                fontSize: '15px',
                boxShadow: '0 4px 12px rgba(37, 99, 235, 0.3)',
              }}
            >
              EG
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '15px', letterSpacing: '-0.01em', color: 'var(--text-primary)' }}>
                euroGovernance
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sovereign GRC Operating System</div>
            </div>
          </div>

          {/* Tenant Context Selector */}
          <div style={{ marginBottom: '20px', padding: '0 6px' }}>
            <label style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Active Tenant Context
            </label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              className="input-modern"
              style={{
                width: '100%',
                marginTop: '6px',
                fontSize: '12px',
                fontWeight: 600,
              }}
            >
              {availableTenants.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Grouped 5-Hub Navigation */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {[
              {
                category: '📊 EXECUTIVE & POSTURE',
                items: [
                  { id: 'overview', label: 'Executive Overview' },
                  { id: 'coverage_dashboard', label: 'Framework Coverage' },
                ],
              },
              {
                category: '📐 FRAMEWORKS & CONTROLS',
                items: [
                  { id: 'frameworks', label: 'Framework Wizard' },
                  { id: 'applicability_review', label: 'Scoping & Applicability' },
                  { id: 'controls', label: 'Unified Controls Catalog' },
                ],
              },
              {
                category: '🛡️ VENDORS & THIRD PARTIES',
                items: [
                  { id: 'processor_hub', label: 'Processor Hub' },
                  { id: 'processor_assessments', label: 'Due Diligence Questionnaires' },
                  { id: 'processor_transfers', label: 'Transfer Impact (TIAs)' },
                  { id: 'certifications', label: 'Certifications & Assurance' },
                  { id: 'processor_assurance_inventory', label: 'Assurance Inventory' },
                  { id: 'processor_inventory', label: 'Processor Roster' },
                ],
              },
              {
                category: '⚖️ STATUTORY REGISTERS',
                items: [
                  { id: 'gdpr', label: 'GDPR & Privacy (ROPA)' },
                  { id: 'ai_systems', label: 'EU AI Act Register' },
                ],
              },
              {
                category: '⚙️ OPERATIONS & AUDIT',
                items: [
                  { id: 'evidence', label: 'Evidence Repository' },
                  { id: 'risks_tasks', label: 'Risks & Tasks' },
                  { id: 'exports', label: 'Compliance Exports' },
                  { id: 'members', label: 'Team & RBAC' },
                ],
              },
            ].map((section) => (
              <div key={section.category}>
                <div
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    color: 'var(--text-muted)',
                    textTransform: 'uppercase',
                    letterSpacing: '0.06em',
                    padding: '0 8px 6px 8px',
                  }}
                >
                  {section.category}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                  {section.items.map((tab) => {
                    const isSelected = activeTab === tab.id;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id as TabType)}
                        style={{
                          textAlign: 'left',
                          padding: '7px 12px',
                          borderRadius: '6px',
                          fontSize: '12.5px',
                          fontWeight: isSelected ? 600 : 400,
                          backgroundColor: isSelected ? 'var(--accent-primary)' : 'transparent',
                          color: isSelected ? '#ffffff' : 'var(--text-secondary)',
                          border: 'none',
                          cursor: 'pointer',
                          transition: 'background-color 0.15s ease, color 0.15s ease',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'space-between',
                        }}
                        onMouseEnter={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'var(--bg-surface-hover)';
                        }}
                        onMouseLeave={(e) => {
                          if (!isSelected) e.currentTarget.style.backgroundColor = 'transparent';
                        }}
                      >
                        <span>{tab.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </nav>
        </div>

        {/* RBAC Persona Switcher (Dev Mode) */}
        <div style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px', paddingLeft: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px', display: 'flex', justifyContent: 'space-between' }}>
            <span>Role Context:</span>
            <span style={{ fontWeight: 700, color: 'var(--accent-primary)', textTransform: 'capitalize' }}>
              {userRole?.replace('_', ' ')}
            </span>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '4px' }}>
            {[
              { id: 'tenant_admin', label: 'Admin' },
              { id: 'compliance_manager', label: 'Compliance' },
              { id: 'security_manager', label: 'Security' },
              { id: 'privacy_manager', label: 'Privacy/DPO' },
              { id: 'ai_governance_manager', label: 'AI Lead' },
              { id: 'auditor', label: 'Auditor' },
              { id: 'contributor', label: 'Contributor' },
            ].map((r) => (
              <button
                key={r.id}
                onClick={() => loginDevUser(r.id)}
                style={{
                  fontSize: '9.5px',
                  fontWeight: userRole === r.id ? 700 : 500,
                  padding: '5px 2px',
                  textAlign: 'center',
                  borderRadius: '4px',
                  border: '1px solid var(--border-subtle)',
                  backgroundColor: userRole === r.id ? 'var(--accent-primary)' : 'var(--bg-canvas-subtle)',
                  color: userRole === r.id ? '#ffffff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {r.label}
              </button>
            ))}
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {/* Action Notice Banner */}
        {actionNotice && (
          <div
            style={{
              padding: '12px 18px',
              backgroundColor: 'var(--bg-surface-elevated)',
              border: '1px solid var(--border-focus)',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
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
          <div>
            {/* Dynamic Role Header */}
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                    {userRole === 'auditor' && '🔍 Independent Auditor Assurance & Readiness Workspace'}
                    {userRole === 'tenant_admin' && '👑 Enterprise Administration & Health Posture'}
                    {(userRole === 'compliance_manager' || userRole === 'security_manager') && '🛡️ Continuous Compliance & Governance Operations'}
                    {userRole === 'privacy_manager' && '🇪🇺 Data Protection & Privacy Governance Hub'}
                    {userRole === 'ai_governance_manager' && '🤖 EU AI Act Compliance & Model Governance Hub'}
                    {userRole === 'contributor' && '✍️ My Compliance Action Inbox & Assigned Tasks'}
                    {!['auditor', 'tenant_admin', 'compliance_manager', 'security_manager', 'privacy_manager', 'ai_governance_manager', 'contributor'].includes(userRole) && '📊 Compliance & Governance Overview'}
                  </h1>
                  <UIBadge variant={userRole === 'auditor' ? 'review' : 'compliant'}>
                    {userRole === 'auditor' ? 'Read-Only Assurance Mode' : `${userRole?.replace('_', ' ')} Mode`}
                  </UIBadge>
                </div>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  {userRole === 'auditor' && 'Inspect verified technical controls, four-eyes evidence lockers, deterministic scoping rationales, and generate compliance dossiers.'}
                  {userRole === 'tenant_admin' && 'Manage organization identity, enforce four-eyes approval policies, monitor team memberships, and audit global activity.'}
                  {(userRole === 'compliance_manager' || userRole === 'security_manager') && 'Track framework readiness, process four-eyes evidence reviews, dispatch supplier questionnaires, and synchronize risks.'}
                  {userRole === 'privacy_manager' && 'Maintain GDPR Article 30 ROPA activities, evaluate Schrems II international transfers, and verify Article 28 DPA execution.'}
                  {userRole === 'ai_governance_manager' && 'Classify AI model risk tiers (Annex III), enforce prohibited practice guardrails, and compile Annex IV technical documentation.'}
                  {userRole === 'contributor' && 'Fulfill assigned evidence requests, answer control audit questions, and view feedback notes from compliance reviewers.'}
                  {!['auditor', 'tenant_admin', 'compliance_manager', 'security_manager', 'privacy_manager', 'ai_governance_manager', 'contributor'].includes(userRole) && 'Materialized compliance health metrics verified across live regulatory registers.'}
                </p>
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', gap: '8px' }}>
                {userRole === 'auditor' ? (
                  <>
                    <button
                      onClick={() => handleRequestExport('framework_soc2_dossier')}
                      disabled={loadingAction === 'export_framework_soc2_dossier'}
                      className="btn-success"
                    >
                      📦 1-Click Audit Dossier (ZIP)
                    </button>
                    <button
                      onClick={() => setActiveTab('applicability_review')}
                      className="btn-secondary"
                    >
                      🔍 Inspect Scoping Rationale
                    </button>
                  </>
                ) : (
                  <>
                    <button
                      onClick={() => setActiveTab('frameworks')}
                      className="btn-success"
                    >
                      🚀 Framework Wizard
                    </button>
                    <button
                      onClick={handleRecalculateMetrics}
                      disabled={loadingAction === 'metrics'}
                      className="btn-primary"
                    >
                      {loadingAction === 'metrics' ? 'Calculating...' : '🔄 Re-calculate Live Metrics'}
                    </button>
                  </>
                )}
              </div>
            </header>

            {/* 1. DRATA-STYLE COMPLIANCE OVERVIEW WIDGET */}
            <ComplianceOverviewCards
              title="Compliance Overview"
              onSelectFramework={(fwId) => {
                if (fwId === 'gdpr') setActiveTab('gdpr');
                else if (fwId === 'eu_ai_act') setActiveTab('ai_systems');
                else setActiveTab('controls');
              }}
            />

            {/* 2. ROLE-TAILORED METRIC TILES & WORKSPACES */}
            {userRole === 'auditor' && (
              <div style={{ marginBottom: '24px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '20px' }}>
                  <UIStatCard
                    label="Audit Readiness Score"
                    value={`${metrics?.overallComplianceScore ?? 92}%`}
                    subtext="Ready for Statutory Review"
                    valueColor="var(--status-compliant-fg)"
                    progressPercentage={metrics?.overallComplianceScore ?? 92}
                  />

                  <UIStatCard
                    label="Verified Controls"
                    value={`${controlsList.filter((c) => c.status === 'implemented').length} / ${controlsList.length || 85}`}
                    subtext="100% Deterministic Lineage"
                    progressPercentage={controlsList.length > 0 ? (controlsList.filter((c) => c.status === 'implemented').length / controlsList.length) * 100 : 90}
                  />

                  <UIStatCard
                    label="Four-Eyes Evidence"
                    value={evidenceList.filter((e) => e.status === 'approved' || e.status === 'valid').length}
                    subtext="SHA-256 Hashed Artifacts"
                    valueColor="var(--accent-primary)"
                  />

                  <UIStatCard
                    label="Open Audit Gaps"
                    value={issuesList.filter((i) => i.status === 'open').length}
                    subtext={issuesList.filter((i) => i.status === 'open').length === 0 ? 'Zero Critical Exceptions' : 'Remediations in Progress'}
                    valueColor={issuesList.filter((i) => i.status === 'open').length > 0 ? 'var(--status-warning-fg)' : 'var(--status-compliant-fg)'}
                  />
                </div>

                {/* Auditor Quick Inspection Box */}
                <div className="card-modern" style={{ marginBottom: '20px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                    <div>
                      <h3 style={{ fontSize: '15px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        Four-Eyes Verified Evidence Repository Preview
                      </h3>
                      <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                        Immutable compliance documentation verified with multi-stakeholder sign-offs.
                      </p>
                    </div>
                    <button
                      onClick={() => setActiveTab('evidence')}
                      style={{ fontSize: '12px', color: 'var(--accent-primary)', fontWeight: 600 }}
                    >
                      View All Evidence ➔
                    </button>
                  </div>
                  {evidenceList.length === 0 ? (
                    <UIEmptyState
                      icon="📁"
                      title="No Evidence Uploaded Yet"
                      description="When evidence files are submitted and signed off, they will appear here with cryptographic SHA-256 hashes."
                    />
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      {evidenceList.slice(0, 4).map((ev) => (
                        <div
                          key={ev.id}
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'center',
                            padding: '10px 14px',
                            backgroundColor: 'var(--bg-canvas-subtle)',
                            borderRadius: '8px',
                            border: '1px solid var(--border-subtle)',
                            fontSize: '12px',
                          }}
                        >
                          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                            <span style={{ fontSize: '16px' }}>📄</span>
                            <div>
                              <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title || ev.id}</div>
                              <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                                Category: {ev.category} • SHA-256: {ev.fileHashSha256 ? `${ev.fileHashSha256.slice(0, 16)}...` : 'Verified'}
                              </div>
                            </div>
                          </div>
                          <UIBadge variant={ev.status === 'approved' || ev.status === 'valid' ? 'compliant' : 'warning'}>
                            {(ev.status || 'valid').toUpperCase()}
                          </UIBadge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Standard Metrics & Operational Stream for Other Roles */}
            {userRole !== 'auditor' && (
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
                <UIStatCard
                  label="Overall Readiness Score"
                  value={`${metrics?.overallComplianceScore ?? 88}%`}
                  subtext={`${metrics?.implementedControlsCount ?? controlsList.filter((c) => c.status === 'implemented').length} of ${metrics?.totalControlsCount ?? controlsList.length} Controls Verified`}
                  valueColor="var(--status-compliant-fg)"
                  progressPercentage={metrics?.overallComplianceScore ?? 88}
                />

                <UIStatCard
                  label="Pending Evidence Reviews"
                  value={metrics?.pendingEvidenceReviewsCount ?? evidenceList.filter((e) => e.status === 'under_review').length}
                  subtext="Four-Eyes Queue"
                  valueColor="var(--status-warning-fg)"
                />

                <UIStatCard
                  label="Active AI Systems"
                  value={metrics?.registeredAISystemsCount ?? aiSystemsList.length}
                  subtext={`${aiSystemsList.filter((a) => a.riskTier === 'high_risk').length} High-Risk Models`}
                  valueColor="var(--accent-primary)"
                />

                <UIStatCard
                  label="Open Remediation Tasks"
                  value={tasksList.filter((t) => t.status !== 'completed').length}
                  subtext={`${issuesList.filter((i) => i.status === 'open').length} Unresolved Issues`}
                />
              </div>
            )}

            {/* Live Audit Stream */}
            <div className="card-modern">
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '16px', color: 'var(--text-primary)' }}>
                Immutable Live Audit Trail
              </h2>
              {auditLogs.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No audit events logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '8px 12px',
                        backgroundColor: 'var(--bg-canvas-subtle)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>[{log.action?.toUpperCase()}]</span>{' '}
                        <span style={{ fontWeight: 600 }}>{log.entityType}</span> ({log.entityId}) • {log.actorEmail || log.actorId}
                      </div>
                      <div className="font-tabular" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                        {new Date(log.timestamp).toLocaleTimeString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* TAB 2: UNIFIED CONTROLS */}
        {activeTab === 'controls' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Unified Controls Catalog
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Tenant-adopted technical, organizational, and AI governance controls.
                </p>
              </div>
              <button onClick={() => setCreateControlModalOpen(true)} className="btn-success">
                + Custom Control
              </button>
            </header>

            {/* Framework Adoption & Instantiation Deck */}
            <div className="card-modern" style={{ marginBottom: '24px' }}>
              <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
                Adopt Canonical Frameworks & Instantiate Controls
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
                {[
                  { id: 'gdpr', name: 'GDPR (EU 2016/679)', domain: 'Privacy & Data Protection' },
                  { id: 'eu_ai_act', name: 'EU AI Act (2024/1689)', domain: 'High-Risk AI Governance' },
                  { id: 'iso_27001', name: 'ISO/IEC 27001:2022', domain: 'Information Security' },
                ].map((fw) => {
                  const adopted = adoptedFrameworksList.find((a) => a.frameworkId === fw.id || a.id === fw.id);
                  return (
                    <div
                      key={fw.id}
                      style={{
                        padding: '14px',
                        borderRadius: '8px',
                        border: '1px solid var(--border-subtle)',
                        backgroundColor: 'var(--bg-canvas-subtle)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{fw.name}</span>
                          <UIBadge variant={adopted ? 'compliant' : 'neutral'}>
                            {adopted ? adopted.status?.toUpperCase() : 'NOT ADOPTED'}
                          </UIBadge>
                        </div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                          {fw.domain}
                        </div>
                        {adopted && (
                          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '6px' }}>
                            Scope: {adopted.scopeDescription?.slice(0, 45)}...
                          </div>
                        )}
                      </div>

                      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
                        {!adopted ? (
                          <button
                            onClick={() =>
                              setAdoptFrameworkModal({
                                open: true,
                                frameworkId: fw.id,
                                frameworkName: fw.name,
                                scope: 'Primary EU Operations, Cloud Infrastructure & Customer Data Processing',
                              })
                            }
                            className="btn-primary"
                            style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                          >
                            Adopt & Scope
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInstantiateFramework(fw.id, fw.name)}
                            disabled={loadingAction === `instantiate_${fw.id}`}
                            className="btn-primary"
                            style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                          >
                            {loadingAction === `instantiate_${fw.id}` ? 'Instantiating...' : '⚡ Instantiate Controls'}
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Controls Table */}
            <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
              {controlsList.length === 0 ? (
                <UIEmptyState
                  icon="🛡️"
                  title="No Controls Found"
                  description="Adopt a compliance framework or instantiate custom security controls to begin continuous assurance."
                  actionText="+ Create Custom Control"
                  onAction={() => setCreateControlModalOpen(true)}
                />
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>Code</th>
                      <th>Title</th>
                      <th>Domain</th>
                      <th>Frameworks</th>
                      <th>Status</th>
                      <th>Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {controlsList.map((ctl) => (
                      <tr key={ctl.id}>
                        <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{ctl.code}</td>
                        <td style={{ fontWeight: 600 }}>{ctl.title}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{ctl.domain}</td>
                        <td>
                          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                            {(ctl.frameworkIds || []).map((fw: string) => (
                              <span key={fw} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-canvas-subtle)', fontSize: '10px', fontWeight: 600 }}>
                                {fw}
                              </span>
                            ))}
                          </div>
                        </td>
                        <td>
                          <UIBadge variant={ctl.status === 'implemented' ? 'compliant' : 'warning'}>
                            {ctl.status}
                          </UIBadge>
                        </td>
                        <td className="font-tabular" style={{ fontWeight: 700 }}>{ctl.healthScore}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 3: EVIDENCE INBOX */}
        {activeTab === 'evidence' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Evidence Review & Four-Eyes Queue
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Privileged approval workflows. Direct client status jumps are blocked by security rules.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {evidenceList.length === 0 ? (
                <UIEmptyState
                  icon="📁"
                  title="No Evidence In Queue"
                  description="Evidence artifacts submitted by contributors will appear here for four-eyes validation."
                />
              ) : (
                evidenceList.map((ev) => (
                  <div
                    key={ev.id}
                    className="card-modern"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{ev.title}</span>
                        <UIBadge variant={ev.status === 'valid' || ev.status === 'approved' ? 'compliant' : 'warning'}>
                          {ev.status?.toUpperCase()}
                        </UIBadge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Storage Path: <span style={{ color: 'var(--accent-primary)' }}>{ev.storagePath}</span> • Version: v{ev.currentVersion || 1} • Author: {ev.createdBy}
                      </div>
                      {ev.rejectionReason && (
                        <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'var(--status-critical-bg)', color: 'var(--status-critical-fg)', borderRadius: '6px', fontSize: '11px' }}>
                          <span style={{ fontWeight: 700 }}>Rejection Reason:</span> {ev.rejectionReason}
                        </div>
                      )}
                    </div>

                    <div style={{ display: 'flex', gap: '8px' }}>
                      {ev.status === 'under_review' ? (
                        <>
                          <button
                            onClick={() =>
                              setApproveEvidenceModal({
                                open: true,
                                evidenceId: ev.id,
                                title: ev.title || ev.id,
                                notes: 'Verified compliance with European regulatory safeguards.',
                              })
                            }
                            disabled={loadingAction === `approve_${ev.id}`}
                            className="btn-success"
                            style={{ padding: '6px 14px', fontSize: '12px' }}
                          >
                            Approve (Four-Eyes)
                          </button>
                          <button
                            onClick={() =>
                              setRejectEvidenceModal({
                                open: true,
                                evidenceId: ev.id,
                                title: ev.title || ev.id,
                                reason: 'Requires updated signature and ISO control mapping.',
                              })
                            }
                            disabled={loadingAction === `reject_${ev.id}`}
                            className="btn-danger"
                          >
                            Reject
                          </button>
                        </>
                      ) : (
                        <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                          {ev.status === 'valid' || ev.status === 'approved' ? '✅ Signed off & Active' : '❌ Revision Pending'}
                        </span>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB: CERTIFICATIONS & STRUCTURED ASSURANCE */}
        {activeTab === 'certifications' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Structured Certifications & External Assurance
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Manage accredited standard certificates (ISO 27001, ISO 42001, SOC 2, C5, Europrivacy, TISAX), surveillance audit schedules, and linked evidence artifacts.
              </p>
            </header>
            <CertificationsManager
              tenantId={tenantId}
              userRole={userRole}
              userId={user?.uid || 'usr_admin_01'}
              certifications={certificationsList}
              evidenceList={evidenceList}
              controlsList={controlsList}
              systemsList={aiSystemsList}
              vendorsList={[]}
            />
          </div>
        )}

        {/* TAB 4: RISKS & TASKS */}
        {activeTab === 'risks_tasks' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Risk Register & Remediation Tasks
              </h1>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Risks */}
              <div className="card-modern">
                <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
                  Risks Register ({risksList.length})
                </h2>
                {risksList.length === 0 ? (
                  <UIEmptyState icon="⚠️" title="No Active Risks" description="Identified enterprise risks will appear here." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {risksList.map((r) => (
                      <div key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{r.code}: {r.title}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                          Inherent: {r.inherentScore} • Residual: <span style={{ fontWeight: 700, color: r.residualScore > 10 ? 'var(--status-critical-fg)' : 'var(--status-compliant-fg)' }}>{r.residualScore}</span> • Strategy: {r.treatmentStrategy}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Tasks */}
              <div className="card-modern">
                <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
                  Remediation Tasks ({tasksList.length})
                </h2>
                {tasksList.length === 0 ? (
                  <UIEmptyState icon="📋" title="No Open Tasks" description="All assigned tasks are completed." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {tasksList.map((t) => (
                      <div key={t.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{t.title}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                          Status: <span style={{ fontWeight: 600 }}>{t.status}</span> • Due: {t.dueDate} • Assignee: {t.assigneeId}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: GDPR & PRIVACY */}
        {activeTab === 'gdpr' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  GDPR & Privacy Subsystem
                </h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Art. 30 ROPA, Art. 35 DPIA impact assessments, and Art. 33 72-hour breach tracker.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button onClick={() => setActiveTab('processor_inventory')} className="btn-secondary">
                  <span>📋</span> Processor Inventory
                </button>
                <button onClick={() => setActiveTab('processor_hub')} className="btn-secondary">
                  <span>🏢</span> Processor Hub
                </button>
                <button onClick={() => setActiveTab('processor_transfers')} className="btn-primary">
                  <span>🌍</span> Cross-Border Transfers
                </button>
              </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div className="card-modern">
                <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
                  ROPA Activities ({ropaList.length})
                </h2>
                {ropaList.length === 0 ? (
                  <UIEmptyState icon="🇪🇺" title="No ROPA Activities" description="Register GDPR Article 30 processing activities to populate the register." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {ropaList.map((r) => (
                      <div key={r.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{r.activityCode}: {r.activityName}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                          Legal Basis: {r.legalBasis} • Retention: {r.retentionPeriodMonths} months
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="card-modern">
                <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
                  72h Breach Register ({breachesList.length})
                </h2>
                {breachesList.length === 0 ? (
                  <UIEmptyState icon="🛡️" title="No Breaches Reported" description="Zero security incidents currently reported." />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {breachesList.map((b) => (
                      <div key={b.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '8px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--status-critical-fg)' }}>{b.incidentReference}: {b.title}</div>
                        <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                          Severity: {b.severity} • DPA Deadline: {b.dpaNotificationDeadline72h}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
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
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                EU AI Act Systems Register
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Art. 5 prohibited practice screening and Annex III risk-tier classifications.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {aiSystemsList.length === 0 ? (
                <UIEmptyState
                  icon="🤖"
                  title="No AI Systems Registered"
                  description="Register organizational AI models and foundation systems to determine EU AI Act risk tiers."
                />
              ) : (
                aiSystemsList.map((sys) => (
                  <div
                    key={sys.id}
                    className="card-modern"
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{sys.name}</span>
                        <UIBadge variant={sys.riskTier === 'high_risk' ? 'critical' : 'compliant'}>
                          {sys.riskTier?.toUpperCase()}
                        </UIBadge>
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                        Role: {sys.role} • Purpose: {sys.intendedPurpose} • Foundation Model: {sys.underlyingFoundationModel || 'Proprietary'}
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        setClassifyAIModal({
                          open: true,
                          systemId: sys.id,
                          name: sys.name,
                          isProhibited: false,
                          annexThreeCategory: 'none',
                        })
                      }
                      disabled={loadingAction === `classify_${sys.id}`}
                      className="btn-primary"
                      style={{ padding: '6px 14px', fontSize: '12px' }}
                    >
                      Run Classification
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        )}

        {/* TAB 7: MEMBERS & RBAC */}
        {activeTab === 'members' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                  Organization Members & Access Control
                </h1>
              </div>
              <button onClick={() => setInviteMemberModalOpen(true)} className="btn-success">
                + Invite Colleague
              </button>
            </header>

            <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
              {membersList.length === 0 ? (
                <UIEmptyState
                  icon="👥"
                  title="No Members Found"
                  description="Invite team leads, auditors, and compliance managers to collaborate."
                  actionText="+ Invite Colleague"
                  onAction={() => setInviteMemberModalOpen(true)}
                />
              ) : (
                <table className="table-modern">
                  <thead>
                    <tr>
                      <th>User ID / Email</th>
                      <th>Role</th>
                      <th>Department</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {membersList.map((m) => (
                      <tr key={m.id}>
                        <td style={{ fontWeight: 600 }}>{m.userId || m.id}</td>
                        <td style={{ fontWeight: 700, color: 'var(--accent-primary)' }}>{m.role}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{m.department || 'Governance'}</td>
                        <td>
                          <UIBadge variant="compliant">{m.status}</UIBadge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* TAB 8: COMPLIANCE EXPORTS */}
        {activeTab === 'exports' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
                Compliance & Audit Exports
              </h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Generate official auditor dossiers and framework readiness packages.
              </p>
            </header>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              {[
                { type: 'tenant_evidence_package_zip', label: '📦 Evidence Package' },
                { type: 'adopted_frameworks_summary', label: '📋 Adopted Frameworks Summary' },
                { type: 'applicability_decisions_report', label: '⚖️ Applicability Determinations' },
                { type: 'tenant_control_coverage_report', label: '🛡️ Control Coverage & Harmonization' },
                { type: 'iso_soa_pdf', label: '📄 ISO 27001 Statement of Applicability' },
                { type: 'framework_gap_report', label: '⚠️ Multi-Framework Gap Report' },
                { type: 'processor_inventory_report', label: '🏢 Processor Inventory' },
                { type: 'restricted_transfers_register', label: '🌍 Restricted Transfers Register' },
                { type: 'transfer_mechanisms_report', label: '📜 Transfer Mechanisms (SCCs)' },
                { type: 'certification_register_report', label: '🏆 Master Certifications Register' },
                { type: 'processor_assurance_register', label: '🛡️ Processor Assurance Register' },
                { type: 'gdpr_ropa_xlsx', label: '📊 GDPR ROPA' },
                { type: 'processor_assessment_report', label: '📊 Processor Assessment Report' },
                { type: 'eu_ai_act_technical_file_pdf', label: '🤖 AI Act Technical Dossier' },
              ].map((item) => (
                <button
                  key={item.type}
                  onClick={() => handleRequestExport(item.type)}
                  disabled={loadingAction === `export_${item.type}`}
                  className="btn-secondary"
                  style={{ fontSize: '12px' }}
                >
                  {item.label}
                </button>
              ))}
            </div>

            <div className="card-modern">
              <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
                Export Jobs Archive ({exportJobsList.length})
              </h2>
              {exportJobsList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No exports generated yet.</div>
              ) : (
                exportJobsList.map((job) => (
                  <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', marginBottom: '10px', fontSize: '12px' }}>
                    <div>
                      <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{job.exportType}</span> • Status: <span style={{ color: 'var(--status-compliant-fg)', fontWeight: 600 }}>{job.status}</span>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Storage: {job.fileStoragePath}</div>
                    </div>
                    <div className="font-tabular" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                      {new Date(job.requestedAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
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
      </main>

      {/* =========================================================================
          ACCESSIBLE MODAL DIALOGS (Replacing window.prompt & window.confirm)
          ========================================================================= */}

      {/* 1. Create Control Modal */}
      <UIModal
        isOpen={createControlModalOpen}
        onClose={() => setCreateControlModalOpen(false)}
        title="Create Custom Control"
        subtitle="Define a tenant-specific control and map it to active frameworks."
        footerActions={
          <>
            <button onClick={() => setCreateControlModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleCreateControl} disabled={loadingAction === 'create_control'} className="btn-success">
              {loadingAction === 'create_control' ? 'Creating...' : 'Save Control'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Control Code
            </label>
            <input
              type="text"
              value={newControlCode}
              onChange={(e) => setNewControlCode(e.target.value)}
              placeholder="e.g. CTL-SEC-99"
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Control Title
            </label>
            <input
              type="text"
              value={newControlTitle}
              onChange={(e) => setNewControlTitle(e.target.value)}
              placeholder="e.g. Automated WebAuthn MFA Gateway"
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Domain
            </label>
            <select
              value={newControlDomain}
              onChange={(e) => setNewControlDomain(e.target.value)}
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            >
              <option value="Access Control">Access Control</option>
              <option value="Cryptography & Encryption">Cryptography & Encryption</option>
              <option value="Data Protection & Privacy">Data Protection & Privacy</option>
              <option value="AI Safety & Transparency">AI Safety & Transparency</option>
              <option value="Supplier & Processor Security">Supplier & Processor Security</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Framework Identifiers (Comma-separated)
            </label>
            <input
              type="text"
              value={newControlFrameworks}
              onChange={(e) => setNewControlFrameworks(e.target.value)}
              placeholder="iso_27001, gdpr, eu_ai_act"
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>
        </div>
      </UIModal>

      {/* 2. Invite Member Modal */}
      <UIModal
        isOpen={inviteMemberModalOpen}
        onClose={() => setInviteMemberModalOpen(false)}
        title="Invite Colleague"
        subtitle="Grant role-based access to the organization's compliance workspace."
        footerActions={
          <>
            <button onClick={() => setInviteMemberModalOpen(false)} className="btn-secondary">
              Cancel
            </button>
            <button onClick={handleInviteMember} disabled={loadingAction === 'invite_member'} className="btn-success">
              {loadingAction === 'invite_member' ? 'Sending Invite...' : 'Send Invitation'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Email Address
            </label>
            <input
              type="email"
              value={newMemberEmail}
              onChange={(e) => setNewMemberEmail(e.target.value)}
              placeholder="e.g. auditor@kpmg.de"
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Assigned Role
            </label>
            <select
              value={newMemberRole}
              onChange={(e) => setNewMemberRole(e.target.value)}
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            >
              <option value="auditor">Auditor (Read-only assurance)</option>
              <option value="compliance_manager">Compliance Manager</option>
              <option value="security_manager">Security Manager</option>
              <option value="privacy_manager">Privacy Officer / DPO</option>
              <option value="ai_governance_manager">AI Governance Lead</option>
              <option value="contributor">Contributor (Task & evidence submitter)</option>
              <option value="tenant_admin">Tenant Administrator</option>
            </select>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Department
            </label>
            <input
              type="text"
              value={newMemberDept}
              onChange={(e) => setNewMemberDept(e.target.value)}
              placeholder="e.g. Information Security"
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            />
          </div>
        </div>
      </UIModal>

      {/* 3. Four-Eyes Evidence Approval Modal */}
      <UIModal
        isOpen={approveEvidenceModal.open}
        onClose={() => setApproveEvidenceModal({ ...approveEvidenceModal, open: false })}
        title="Four-Eyes Evidence Approval"
        subtitle={`Signing off evidence: ${approveEvidenceModal.title}`}
        footerActions={
          <>
            <button
              onClick={() => setApproveEvidenceModal({ ...approveEvidenceModal, open: false })}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleApproveEvidence}
              disabled={loadingAction?.startsWith('approve_')}
              className="btn-success"
            >
              {loadingAction?.startsWith('approve_') ? 'Signing off...' : 'Authorize & Sign Off'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Approval Decision Notes
          </label>
          <textarea
            value={approveEvidenceModal.notes}
            onChange={(e) => setApproveEvidenceModal({ ...approveEvidenceModal, notes: e.target.value })}
            rows={4}
            className="input-modern"
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Document verification of cryptographic hashes and control satisfaction..."
          />
        </div>
      </UIModal>

      {/* 4. Evidence Rejection Modal */}
      <UIModal
        isOpen={rejectEvidenceModal.open}
        onClose={() => setRejectEvidenceModal({ ...rejectEvidenceModal, open: false })}
        title="Reject Evidence & Request Revision"
        subtitle={`Returning evidence: ${rejectEvidenceModal.title}`}
        footerActions={
          <>
            <button
              onClick={() => setRejectEvidenceModal({ ...rejectEvidenceModal, open: false })}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleRejectEvidence}
              disabled={loadingAction?.startsWith('reject_')}
              className="btn-danger"
            >
              {loadingAction?.startsWith('reject_') ? 'Rejecting...' : 'Reject & Notify Author'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Mandatory Rejection Rationale
          </label>
          <textarea
            value={rejectEvidenceModal.reason}
            onChange={(e) => setRejectEvidenceModal({ ...rejectEvidenceModal, reason: e.target.value })}
            rows={4}
            className="input-modern"
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Explain why the evidence is insufficient (e.g. missing signature, expired certificate)..."
          />
        </div>
      </UIModal>

      {/* 5. AI Act Classification Modal */}
      <UIModal
        isOpen={classifyAIModal.open}
        onClose={() => setClassifyAIModal({ ...classifyAIModal, open: false })}
        title="EU AI Act Risk Classification"
        subtitle={`Classifying model: ${classifyAIModal.name}`}
        footerActions={
          <>
            <button
              onClick={() => setClassifyAIModal({ ...classifyAIModal, open: false })}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleClassifyAI}
              disabled={loadingAction?.startsWith('classify_')}
              className="btn-primary"
            >
              {loadingAction?.startsWith('classify_') ? 'Evaluating...' : 'Determine Risk Tier'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div style={{ padding: '12px', backgroundColor: 'var(--bg-canvas-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={classifyAIModal.isProhibited}
                onChange={(e) => setClassifyAIModal({ ...classifyAIModal, isProhibited: e.target.checked })}
                style={{ marginTop: '3px' }}
              />
              <div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  Prohibited Practices Check (Article 5)
                </div>
                <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                  Does this AI system perform real-time biometric identification, cognitive behavioral manipulation, social scoring, or biometric categorization?
                </div>
              </div>
            </label>
          </div>

          <div>
            <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Annex III High-Risk Sector Classification
            </label>
            <select
              value={classifyAIModal.annexThreeCategory}
              onChange={(e) => setClassifyAIModal({ ...classifyAIModal, annexThreeCategory: e.target.value })}
              className="input-modern"
              style={{ width: '100%', marginTop: '4px' }}
            >
              <option value="none">None (Standard / Minimal Risk)</option>
              <option value="essential_services_benefits">Essential Services & Benefits (Credit scoring, insurance, benefits)</option>
              <option value="employment_recruitment">Employment & Recruitment (Resume ranking, performance monitoring)</option>
              <option value="critical_infrastructure">Critical Infrastructure (Energy, transport, water supply)</option>
              <option value="law_enforcement">Law Enforcement & Border Control</option>
              <option value="administration_justice">Administration of Justice & Democratic Processes</option>
            </select>
          </div>
        </div>
      </UIModal>

      {/* 6. Adopt Framework Modal */}
      <UIModal
        isOpen={adoptFrameworkModal.open}
        onClose={() => setAdoptFrameworkModal({ ...adoptFrameworkModal, open: false })}
        title={`Adopt ${adoptFrameworkModal.frameworkName}`}
        subtitle="Establish organizational scoping and regulatory applicability."
        footerActions={
          <>
            <button
              onClick={() => setAdoptFrameworkModal({ ...adoptFrameworkModal, open: false })}
              className="btn-secondary"
            >
              Cancel
            </button>
            <button
              onClick={handleAdoptFramework}
              disabled={loadingAction?.startsWith('adopt_')}
              className="btn-success"
            >
              {loadingAction?.startsWith('adopt_') ? 'Adopting...' : 'Confirm Adoption'}
            </button>
          </>
        }
      >
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Compliance Scope Description
          </label>
          <textarea
            value={adoptFrameworkModal.scope}
            onChange={(e) => setAdoptFrameworkModal({ ...adoptFrameworkModal, scope: e.target.value })}
            rows={4}
            className="input-modern"
            style={{ width: '100%', resize: 'vertical' }}
            placeholder="Define boundaries, infrastructure, and organizational entities covered..."
          />
        </div>
      </UIModal>
    </div>
  );
}

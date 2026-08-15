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

type TabType =
  | 'overview'
  | 'coverage_dashboard'
  | 'frameworks'
  | 'applicability_review'
  | 'controls'
  | 'evidence'
  | 'risks_tasks'
  | 'gdpr'
  | 'processor_inventory'
  | 'processor_hub'
  | 'processor_transfers'
  | 'ai_systems'
  | 'members'
  | 'exports';

export default function DashboardPage() {
  const { user, tenantId, setTenantId, userRole, availableTenants, loginDevUser } = useAuth();
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [selectedHubProcessorProfileId, setSelectedHubProcessorProfileId] = useState<string | undefined>(undefined);
  const [actionNotice, setActionNotice] = useState<string | null>(null);
  const [loadingAction, setLoadingAction] = useState<string | null>(null);

  // Live Data States
  const [metrics, setMetrics] = useState<any>(null);
  const [auditLogs, setAuditLogs] = useState<any[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [controlsList, setControlsList] = useState<any[]>([]);
  const [evidenceList, setEvidenceList] = useState<any[]>([]);
  const [risksList, setRisksList] = useState<any[]>([]);
  const [issuesList, setIssuesList] = useState<any[]>([]);
  const [tasksList, setTasksList] = useState<any[]>([]);
  const [ropaList, setRopaList] = useState<any[]>([]);
  const [dpiaList, setDpiaList] = useState<any[]>([]);
  const [breachesList, setBreachesList] = useState<any[]>([]);
  const [aiSystemsList, setAiSystemsList] = useState<any[]>([]);
  const [membersList, setMembersList] = useState<any[]>([]);
  const [exportJobsList, setExportJobsList] = useState<any[]>([]);
  const [adoptedFrameworksList, setAdoptedFrameworksList] = useState<any[]>([]);

  const showNotice = (msg: string) => {
    setActionNotice(msg);
    setTimeout(() => setActionNotice(null), 5000);
  };

  // 1. Subscribe to Tenant Data
  useEffect(() => {
    if (!tenantId || !user) return;

    // Summary Metrics
    const metricsRef = doc(db, 'tenants', tenantId, 'summary_metrics', 'current');
    const unsubMetrics = onSnapshot(
      metricsRef,
      (snap) => {
        if (snap.exists()) {
          setMetrics(snap.data());
        }
      },
      (err) => console.warn('Metrics snapshot notice:', err.message)
    );

    // Audit Logs Stream
    const auditQuery = query(
      collection(db, 'tenants', tenantId, 'audit_logs'),
      orderBy('timestamp', 'desc'),
      limit(10)
    );
    const unsubAudit = onSnapshot(
      auditQuery,
      (snap) => {
        setAuditLogs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Audit logs snapshot notice:', err.message)
    );

    // Controls
    const unsubControls = onSnapshot(
      collection(db, 'tenants', tenantId, 'controls'),
      (snap) => {
        setControlsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Controls snapshot notice:', err.message)
    );

    // Evidence
    const unsubEvidence = onSnapshot(
      collection(db, 'tenants', tenantId, 'evidence'),
      (snap) => {
        setEvidenceList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Evidence snapshot notice:', err.message)
    );

    // Risks
    const unsubRisks = onSnapshot(
      collection(db, 'tenants', tenantId, 'risks'),
      (snap) => {
        setRisksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Risks snapshot notice:', err.message)
    );

    // Issues
    const unsubIssues = onSnapshot(
      collection(db, 'tenants', tenantId, 'issues'),
      (snap) => {
        setIssuesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Issues snapshot notice:', err.message)
    );

    // Tasks
    const unsubTasks = onSnapshot(
      collection(db, 'tenants', tenantId, 'tasks'),
      (snap) => {
        setTasksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Tasks snapshot notice:', err.message)
    );

    // ROPA
    const unsubRopa = onSnapshot(
      collection(db, 'tenants', tenantId, 'ropa_entries'),
      (snap) => {
        setRopaList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('ROPA snapshot notice:', err.message)
    );

    // DPIA
    const unsubDpia = onSnapshot(
      collection(db, 'tenants', tenantId, 'dpia_assessments'),
      (snap) => {
        setDpiaList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('DPIA snapshot notice:', err.message)
    );

    // Breaches
    const unsubBreaches = onSnapshot(
      collection(db, 'tenants', tenantId, 'breaches'),
      (snap) => {
        setBreachesList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Breaches snapshot notice:', err.message)
    );

    // AI Systems
    const unsubAI = onSnapshot(
      collection(db, 'tenants', tenantId, 'ai_systems'),
      (snap) => {
        setAiSystemsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('AI snapshot notice:', err.message)
    );

    // Members
    const unsubMembers = onSnapshot(
      collection(db, 'tenants', tenantId, 'memberships'),
      (snap) => {
        setMembersList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Members snapshot notice:', err.message)
    );

    // Export Jobs
    const unsubExports = onSnapshot(
      collection(db, 'tenants', tenantId, 'export_jobs'),
      (snap) => {
        setExportJobsList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Exports snapshot notice:', err.message)
    );

    // Adopted Frameworks
    const unsubFrameworks = onSnapshot(
      collection(db, 'tenants', tenantId, 'adopted_frameworks'),
      (snap) => {
        setAdoptedFrameworksList(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => console.warn('Frameworks snapshot notice:', err.message)
    );

    return () => {
      unsubMetrics();
      unsubAudit();
      unsubControls();
      unsubEvidence();
      unsubRisks();
      unsubIssues();
      unsubTasks();
      unsubRopa();
      unsubDpia();
      unsubBreaches();
      unsubAI();
      unsubMembers();
      unsubExports();
      unsubFrameworks();
    };
  }, [tenantId, user]);

  // Actions: Recompute Metrics
  const handleRecalculateMetrics = async () => {
    setLoadingAction('metrics');
    try {
      const fn = httpsCallable(functions, 'materializeTenantMetrics');
      const res: any = await fn({ tenantId });
      setMetrics(res.data.metrics);
      showNotice('✅ Summary compliance metrics successfully re-materialized from live database records.');
    } catch (err: any) {
      showNotice(`❌ Error recalculating metrics: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Four-Eyes Evidence Approval
  const handleApproveEvidence = async (evidenceId: string) => {
    const notes = window.prompt('Enter Approval Decision Notes (optional):', 'Verified compliance with European regulatory safeguards.') || 'Verified.';
    setLoadingAction(`approve_${evidenceId}`);
    try {
      const fn = httpsCallable(functions, 'approveEvidence');
      await fn({ tenantId, evidenceId, decisionNotes: notes });
      showNotice('✅ Evidence signed off via Four-Eyes authorization! Immutable audit log recorded.');
    } catch (err: any) {
      showNotice(`❌ Approval failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Evidence Rejection
  const handleRejectEvidence = async (evidenceId: string) => {
    const reason = window.prompt('Enter Mandatory Rejection Rationale:', 'Requires updated signature and ISO control mapping.');
    if (!reason) return;

    setLoadingAction(`reject_${evidenceId}`);
    try {
      const fn = httpsCallable(functions, 'rejectEvidence');
      await fn({ tenantId, evidenceId, rejectionReason: reason });
      showNotice('⚠️ Evidence marked as rejected. Contributor notified for revision.');
    } catch (err: any) {
      showNotice(`❌ Rejection failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Create New Control
  const handleCreateControl = async () => {
    const code = window.prompt('Enter Control Code (e.g. CTL-SEC-99):', `CTL-${Date.now().toString().slice(-4)}`);
    const title = window.prompt('Enter Control Title:', 'Automated WebAuthn MFA Gateway');
    if (!code || !title) return;

    setLoadingAction('create_control');
    try {
      const fn = httpsCallable(functions, 'createTenantControl');
      await fn({
        tenantId,
        code,
        title,
        description: 'Enforces hardware security key token authentication across all administrative interfaces.',
        domain: 'Access Control',
        frameworkIds: ['iso_27001', 'gdpr', 'eu_ai_act'],
        requirementIds: ['A.9.1', 'Art. 32'],
        status: 'implemented',
        healthScore: 100,
        enforcementMechanism: 'automated',
      });
      showNotice(`✅ Control ${code} created successfully!`);
    } catch (err: any) {
      showNotice(`❌ Control creation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Invite New Member
  const handleInviteMember = async () => {
    const email = window.prompt('Enter colleague email address:', 'auditor@kpmg.de');
    const role = window.prompt('Enter role (tenant_admin, compliance_manager, security_manager, privacy_manager, ai_governance_manager, auditor, contributor, viewer):', 'auditor');
    if (!email || !role) return;

    setLoadingAction('invite_member');
    try {
      const fn = httpsCallable(functions, 'inviteUserToTenant');
      await fn({ tenantId, email, role, department: 'Risk & Assurance' });
      showNotice(`✅ Invitation dispatched to ${email} with role ${role}!`);
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
      const fn = httpsCallable(functions, 'generateTenantEvidenceExport');
      const res: any = await fn({ tenantId, exportType });
      showNotice(`✅ Export job ${res.data.jobId} completed! File stored at ${res.data.fileStoragePath}`);
    } catch (err: any) {
      showNotice(`❌ Export request failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Classify AI System
  const handleClassifyAI = async (aiSystemId: string) => {
    const isProhibited = window.confirm('Does this system perform biometric categorization or cognitive manipulation? (OK = Yes, Cancel = No)');
    const isAnnex3 = window.confirm('Is this system used in credit scoring, employment, or critical infrastructure? (OK = Yes, Cancel = No)');

    setLoadingAction(`classify_${aiSystemId}`);
    try {
      const fn = httpsCallable(functions, 'classifyTenantAISystem');
      const res: any = await fn({
        tenantId,
        aiSystemId,
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
        annexThreeCategory: isAnnex3 ? 'essential_services_benefits' : 'none',
        justificationSummary: 'Classification determination processed via automated governance matrix.',
      });
      showNotice(`✅ AI System reclassified to: ${res.data.determinedRiskTier.toUpperCase()}!`);
    } catch (err: any) {
      showNotice(`❌ AI classification failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  // Actions: Framework Adoption & Scoping
  const handleAdoptFramework = async (frameworkId: string, frameworkName: string) => {
    const scope = window.prompt(
      `Enter organizational compliance scope for ${frameworkName}:`,
      'Primary EU Operations, Cloud Infrastructure & Customer Data Processing'
    );
    if (!scope) return;

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
      const res: any = await fn({
        tenantId,
        frameworkId,
      });
      showNotice(
        `✅ Instantiated ${res.data.createdControlsCount} controls from ${frameworkName} into tenant catalog!`
      );
    } catch (err: any) {
      showNotice(`❌ Control instantiation failed: ${err.message}`);
    } finally {
      setLoadingAction(null);
    }
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar */}
      <aside
        style={{
          width: '260px',
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-color)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {/* Logo */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '24px', paddingLeft: '8px' }}>
            <div
              style={{
                width: '36px',
                height: '36px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
                fontSize: '16px',
              }}
            >
              EG
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>euroGovernance</div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Sovereign GRC Operating System</div>
            </div>
          </div>

          {/* Tenant Switcher */}
          <div style={{ marginBottom: '20px', padding: '0 4px' }}>
            <label style={{ fontSize: '10px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Active Tenant Context
            </label>
            <select
              value={tenantId}
              onChange={(e) => setTenantId(e.target.value)}
              style={{
                width: '100%',
                marginTop: '6px',
                padding: '8px',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                backgroundColor: 'var(--bg-primary)',
                color: 'var(--text-primary)',
                fontSize: '12px',
                fontWeight: 500,
              }}
            >
              {availableTenants.map((t: { id: string; name: string }) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Navigation Links */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { id: 'overview', label: '📊 Executive Overview' },
              { id: 'coverage_dashboard', label: '🌐 Framework Coverage' },
              { id: 'frameworks', label: '🚀 Framework Wizard' },
              { id: 'applicability_review', label: '⚖️ Applicability Review' },
              { id: 'controls', label: '🛡️ Unified Controls' },
              { id: 'evidence', label: '📁 Evidence Inbox' },
              { id: 'risks_tasks', label: '⚠️ Risks & Tasks' },
              { id: 'gdpr', label: '🇪🇺 GDPR & Privacy' },
              { id: 'processor_inventory', label: '📋 Processor Inventory' },
              { id: 'processor_hub', label: '🏢 Processor Hub' },
              { id: 'processor_transfers', label: '🌍 Processor Transfers' },
              { id: 'ai_systems', label: '🤖 EU AI Act Register' },
              { id: 'members', label: '👥 Team & RBAC' },
              { id: 'exports', label: '📦 Compliance Exports' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as TabType)}
                style={{
                  textAlign: 'left',
                  padding: '10px 14px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: activeTab === tab.id ? 600 : 400,
                  backgroundColor: activeTab === tab.id ? 'var(--accent-blue-light)' : 'transparent',
                  color: activeTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  border: 'none',
                  cursor: 'pointer',
                  transition: 'background-color 0.15s ease',
                }}
              >
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* RBAC Persona Switcher (Dev Mode) */}
        <div style={{ borderTop: '1px solid var(--border-color)', paddingTop: '16px', paddingLeft: '4px' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginBottom: '8px' }}>
            Current Role: <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>{userRole}</span>
          </div>
          <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
            {['tenant_admin', 'compliance_manager', 'auditor', 'contributor'].map((r) => (
              <button
                key={r}
                onClick={() => loginDevUser(r)}
                style={{
                  fontSize: '10px',
                  padding: '4px 6px',
                  borderRadius: '4px',
                  border: '1px solid var(--border-color)',
                  backgroundColor: userRole === r ? 'var(--accent-blue)' : 'var(--bg-primary)',
                  color: userRole === r ? '#fff' : 'var(--text-secondary)',
                  cursor: 'pointer',
                }}
              >
                {r.split('_')[0]}
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
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--accent-blue)',
              borderRadius: '8px',
              marginBottom: '24px',
              fontSize: '13px',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <span>{actionNotice}</span>
            <button onClick={() => setActionNotice(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}>
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Continuous Compliance & Governance Overview</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Materialized derived compliance metrics verified across live regulatory registers.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('frameworks')}
                  style={{
                    backgroundColor: 'var(--status-success)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  🚀 Framework Wizard
                </button>
                <button
                  onClick={handleRecalculateMetrics}
                  disabled={loadingAction === 'metrics'}
                  style={{
                    backgroundColor: 'var(--accent-blue)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                  }}
                >
                  {loadingAction === 'metrics' ? 'Calculating...' : '🔄 Re-calculate Live Metrics'}
                </button>
              </div>
            </header>

            {/* Metrics KPI Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '24px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Overall Readiness Score</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px' }}>
                  {metrics?.overallComplianceScore ?? 88}%
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {metrics?.implementedControlsCount ?? controlsList.filter((c) => c.status === 'implemented').length} of{' '}
                  {metrics?.totalControlsCount ?? controlsList.length} Controls Verified
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Pending Evidence Reviews</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--status-warning)', marginTop: '4px' }}>
                  {metrics?.pendingEvidenceReviewsCount ?? evidenceList.filter((e) => e.status === 'under_review').length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>Four-Eyes Queue</div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Active AI Systems</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '4px' }}>
                  {metrics?.registeredAISystemsCount ?? aiSystemsList.length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {aiSystemsList.filter((a) => a.riskTier === 'high_risk').length} High-Risk Models
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>Open Remediation Tasks</div>
                <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                  {tasksList.filter((t) => t.status !== 'completed').length}
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                  {issuesList.filter((i) => i.status === 'open').length} Unresolved Issues
                </div>
              </div>
            </div>

            {/* Live Audit Stream */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Immutable Live Audit Trail</h2>
              {auditLogs.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No audit events logged yet.</div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {auditLogs.map((log) => (
                    <div
                      key={log.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        paddingBottom: '10px',
                        borderBottom: '1px solid var(--border-color)',
                        fontSize: '12px',
                      }}
                    >
                      <div>
                        <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>[{log.action?.toUpperCase()}]</span>{' '}
                        <span style={{ fontWeight: 500 }}>{log.entityType}</span> ({log.entityId}) • {log.actorEmail || log.actorId}
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
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
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Unified Controls Catalog</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Tenant-adopted technical, organizational, and AI governance controls.
                </p>
              </div>
              <button
                onClick={handleCreateControl}
                disabled={loadingAction === 'create_control'}
                style={{
                  backgroundColor: 'var(--status-success)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                + Custom Control
              </button>
            </header>

            {/* Framework Adoption & Instantiation Deck */}
            <div style={{ marginBottom: '24px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '16px' }}>
              <div style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>
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
                        border: '1px solid var(--border-color)',
                        backgroundColor: 'var(--bg-surface-hover)',
                        display: 'flex',
                        flexDirection: 'column',
                        justifyContent: 'space-between',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px' }}>{fw.name}</span>
                          <span
                            style={{
                              fontSize: '10px',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              fontWeight: 600,
                              backgroundColor: adopted ? 'rgba(16, 185, 129, 0.15)' : 'rgba(107, 114, 128, 0.15)',
                              color: adopted ? 'var(--status-success)' : 'var(--text-muted)',
                            }}
                          >
                            {adopted ? adopted.status?.toUpperCase() : 'NOT ADOPTED'}
                          </span>
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
                            onClick={() => handleAdoptFramework(fw.id, fw.name)}
                            disabled={loadingAction === `adopt_${fw.id}`}
                            style={{
                              flex: 1,
                              backgroundColor: 'var(--accent-blue)',
                              color: '#fff',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer',
                            }}
                          >
                            {loadingAction === `adopt_${fw.id}` ? 'Adopting...' : 'Adopt & Scope'}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleInstantiateFramework(fw.id, fw.name)}
                            disabled={loadingAction === `instantiate_${fw.id}`}
                            style={{
                              flex: 1,
                              backgroundColor: 'var(--accent-blue)',
                              color: '#fff',
                              padding: '6px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 600,
                              border: 'none',
                              cursor: 'pointer',
                            }}
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

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Code</th>
                    <th style={{ padding: '12px 16px' }}>Title</th>
                    <th style={{ padding: '12px 16px' }}>Domain</th>
                    <th style={{ padding: '12px 16px' }}>Frameworks</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Health</th>
                  </tr>
                </thead>
                <tbody>
                  {controlsList.map((ctl) => (
                    <tr key={ctl.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{ctl.code}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{ctl.title}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ctl.domain}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap' }}>
                          {(ctl.frameworkIds || []).map((fw: string) => (
                            <span key={fw} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', fontSize: '10px' }}>
                              {fw}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: ctl.status === 'implemented' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: ctl.status === 'implemented' ? 'var(--status-success)' : 'var(--status-warning)',
                          }}
                        >
                          {ctl.status}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{ctl.healthScore}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 3: EVIDENCE INBOX */}
        {activeTab === 'evidence' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Evidence Review & Four-Eyes Queue</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Privileged approval workflows. Direct client status jumps are blocked by security rules.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {evidenceList.map((ev) => (
                <div
                  key={ev.id}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{ev.title}</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: ev.status === 'valid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: ev.status === 'valid' ? 'var(--status-success)' : 'var(--status-warning)',
                        }}
                      >
                        {ev.status?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Storage Path: <span style={{ color: 'var(--accent-blue)' }}>{ev.storagePath}</span> • Version: v{ev.currentVersion || 1} • Author: {ev.createdBy}
                    </div>
                    {ev.rejectionReason && (
                      <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)', borderRadius: '6px', fontSize: '11px' }}>
                        <span style={{ fontWeight: 600 }}>Rejection Reason:</span> {ev.rejectionReason}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {ev.status === 'under_review' ? (
                      <>
                        <button
                          onClick={() => handleApproveEvidence(ev.id)}
                          disabled={loadingAction === `approve_${ev.id}`}
                          style={{
                            backgroundColor: 'var(--status-success)',
                            color: '#fff',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: 'none',
                            cursor: 'pointer',
                          }}
                        >
                          Approve (Four-Eyes)
                        </button>
                        <button
                          onClick={() => handleRejectEvidence(ev.id)}
                          disabled={loadingAction === `reject_${ev.id}`}
                          style={{
                            backgroundColor: 'var(--bg-surface-hover)',
                            color: 'var(--status-danger)',
                            padding: '6px 14px',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid var(--border-color)',
                            cursor: 'pointer',
                          }}
                        >
                          Reject
                        </button>
                      </>
                    ) : (
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {ev.status === 'valid' ? '✅ Signed off & Active' : '❌ Revision Pending'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: RISKS & TASKS */}
        {activeTab === 'risks_tasks' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Risk Register & Remediation Tasks</h1>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              {/* Risks */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Risks Register ({risksList.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {risksList.map((r) => (
                    <div key={r.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{r.code}: {r.title}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        Inherent: {r.inherentScore} • Residual: <span style={{ fontWeight: 600, color: r.residualScore > 10 ? 'var(--status-danger)' : 'var(--status-success)' }}>{r.residualScore}</span> • Strategy: {r.treatmentStrategy}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Tasks */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Remediation Tasks ({tasksList.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {tasksList.map((t) => (
                    <div key={t.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{t.title}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        Status: <span style={{ fontWeight: 500 }}>{t.status}</span> • Due: {t.dueDate} • Assignee: {t.assigneeId}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 5: GDPR & PRIVACY */}
        {activeTab === 'gdpr' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>GDPR & Privacy Subsystem</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Art. 30 ROPA, Art. 35 DPIA impact assessments, and Art. 33 72-hour breach tracker.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setActiveTab('processor_inventory')}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>📋</span> Processor Inventory
                </button>

                <button
                  onClick={() => setActiveTab('processor_hub')}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    padding: '8px 14px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🏢</span> Processor Hub
                </button>

                <button
                  onClick={() => setActiveTab('processor_transfers')}
                  style={{
                    backgroundColor: 'var(--accent-blue)',
                    color: '#fff',
                    padding: '8px 16px',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    border: 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                  }}
                >
                  <span>🌍</span> Cross-Border Transfers
                </button>
              </div>
            </header>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>ROPA Activities ({ropaList.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {ropaList.map((r) => (
                    <div key={r.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600 }}>{r.activityCode}: {r.activityName}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        Legal Basis: {r.legalBasis} • Retention: {r.retentionPeriodMonths} months
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>72h Breach Register ({breachesList.length})</h2>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {breachesList.map((b) => (
                    <div key={b.id} style={{ borderBottom: '1px solid var(--border-color)', paddingBottom: '8px', fontSize: '12px' }}>
                      <div style={{ fontWeight: 600, color: 'var(--status-danger)' }}>{b.incidentReference}: {b.title}</div>
                      <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                        Severity: {b.severity} • DPA Deadline: {b.dpaNotificationDeadline72h}
                      </div>
                    </div>
                  ))}
                </div>
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
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>EU AI Act Systems Register</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Art. 5 prohibited practice screening and Annex III risk-tier classifications.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              {aiSystemsList.map((sys) => (
                <div
                  key={sys.id}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '20px',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '14px', fontWeight: 600 }}>{sys.name}</span>
                      <span
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: sys.riskTier === 'high_risk' ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                          color: sys.riskTier === 'high_risk' ? 'var(--status-danger)' : 'var(--status-success)',
                        }}
                      >
                        {sys.riskTier?.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Role: {sys.role} • Purpose: {sys.intendedPurpose} • Foundation Model: {sys.underlyingFoundationModel || 'Proprietary'}
                    </div>
                  </div>

                  <button
                    onClick={() => handleClassifyAI(sys.id)}
                    disabled={loadingAction === `classify_${sys.id}`}
                    style={{
                      backgroundColor: 'var(--accent-blue)',
                      color: '#fff',
                      padding: '6px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      border: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    Run Classification
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 7: MEMBERS & RBAC */}
        {activeTab === 'members' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Organization Members & Access Control</h1>
              </div>
              <button
                onClick={handleInviteMember}
                disabled={loadingAction === 'invite_member'}
                style={{
                  backgroundColor: 'var(--status-success)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                + Invite Colleague
              </button>
            </header>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>User ID / Email</th>
                    <th style={{ padding: '12px 16px' }}>Role</th>
                    <th style={{ padding: '12px 16px' }}>Department</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {membersList.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{m.userId || m.id}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{m.role}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{m.department || 'Governance'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-success)', fontSize: '11px', fontWeight: 600 }}>
                          {m.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 8: COMPLIANCE EXPORTS */}
        {activeTab === 'exports' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Compliance & Audit Exports</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Generate official auditor dossiers and framework readiness packages.
              </p>
            </header>

            <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
              <button
                onClick={() => handleRequestExport('tenant_evidence_package_zip')}
                style={{ backgroundColor: 'var(--accent-blue)', color: '#fff', padding: '8px 14px', borderRadius: '6px', border: 'none', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                📦 Evidence Package
              </button>
              <button
                onClick={() => handleRequestExport('adopted_frameworks_summary')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                📋 Adopted Frameworks Summary
              </button>
              <button
                onClick={() => handleRequestExport('applicability_decisions_report')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                ⚖️ Applicability Determinations
              </button>
              <button
                onClick={() => handleRequestExport('tenant_control_coverage_report')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                🛡️ Control Coverage & Harmonization
              </button>
              <button
                onClick={() => handleRequestExport('iso_soa_pdf')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                📄 ISO 27001 Statement of Applicability
              </button>
              <button
                onClick={() => handleRequestExport('framework_gap_report')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                ⚠️ Multi-Framework Gap Report
              </button>
              <button
                onClick={() => handleRequestExport('gdpr_ropa_xlsx')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                📊 GDPR ROPA
              </button>
              <button
                onClick={() => handleRequestExport('eu_ai_act_technical_file_pdf')}
                style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', color: 'var(--text-primary)', padding: '8px 14px', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                🤖 AI Act Technical Dossier
              </button>
            </div>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>Export Jobs Archive ({exportJobsList.length})</h2>
              {exportJobsList.map((job) => (
                <div key={job.id} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', marginBottom: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ fontWeight: 600 }}>{job.exportType}</span> • Status: <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>{job.status}</span>
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Storage: {job.fileStoragePath}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                    {new Date(job.requestedAt).toLocaleTimeString()}
                  </div>
                </div>
              ))}
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
    </div>
  );
}

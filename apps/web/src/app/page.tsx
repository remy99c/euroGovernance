'use client';

import React, { useState } from 'react';

// Types for interactive state
type TabType = 'overview' | 'controls' | 'evidence' | 'gdpr' | 'ai_systems' | 'audit_logs';

interface FrameworkSummary {
  id: string;
  name: string;
  category: string;
  readinessPercentage: number;
  totalControls: number;
  implementedControls: number;
  status: 'compliant' | 'in_progress' | 'action_required';
}

interface ControlItem {
  id: string;
  code: string;
  title: string;
  category: string;
  framework: string;
  healthScore: number;
  status: 'implemented' | 'in_progress' | 'not_started';
  owner: string;
  lastReviewed: string;
}

interface EvidenceItem {
  id: string;
  title: string;
  category: string;
  framework: string;
  status: 'valid' | 'under_review' | 'expired' | 'rejected';
  submittedBy: string;
  reviewDueDate: string;
  fileName: string;
  reviewedBy?: string;
  reviewedAt?: string;
  decisionNotes?: string;
}

interface ROPAItem {
  id: string;
  code: string;
  name: string;
  purpose: string;
  legalBasis: string;
  retention: string;
  dpaStatus: 'verified' | 'pending';
}

interface AISystemItem {
  id: string;
  code: string;
  name: string;
  role: 'provider' | 'deployer';
  riskTier: 'high_risk' | 'minimal_risk' | 'prohibited' | 'general_purpose_ai';
  status: 'production' | 'testing' | 'pilot';
  friaStatus: 'completed' | 'required' | 'exempt';
}

const initialFrameworks: FrameworkSummary[] = [
  {
    id: 'gdpr',
    name: 'GDPR (EU 2016/679)',
    category: 'Privacy & Data Protection',
    readinessPercentage: 94,
    totalControls: 32,
    implementedControls: 30,
    status: 'compliant',
  },
  {
    id: 'eu_ai_act',
    name: 'EU AI Act (EU 2024/1689)',
    category: 'Artificial Intelligence Governance',
    readinessPercentage: 78,
    totalControls: 28,
    implementedControls: 22,
    status: 'in_progress',
  },
  {
    id: 'eu_data_act',
    name: 'EU Data Act (EU 2023/2854)',
    category: 'Data Governance & Interoperability',
    readinessPercentage: 65,
    totalControls: 14,
    implementedControls: 9,
    status: 'in_progress',
  },
  {
    id: 'iso_27001',
    name: 'ISO/IEC 27001:2022',
    category: 'Information Security Management',
    readinessPercentage: 88,
    totalControls: 93,
    implementedControls: 82,
    status: 'compliant',
  },
  {
    id: 'iso_42001',
    name: 'ISO/IEC 42001:2023',
    category: 'AI Management System',
    readinessPercentage: 58,
    totalControls: 38,
    implementedControls: 22,
    status: 'action_required',
  },
];

const mockControls: ControlItem[] = [
  {
    id: 'ctl_01',
    code: 'CTL-PRIV-01',
    title: 'Article 30 Processing Register (ROPA) Maintenance',
    category: 'Privacy',
    framework: 'GDPR',
    healthScore: 100,
    status: 'implemented',
    owner: 'Dr. Klaus Becker (DPO)',
    lastReviewed: '2026-08-01',
  },
  {
    id: 'ctl_02',
    code: 'CTL-AI-OVR-01',
    title: 'High-Risk AI Human Oversight & Emergency Stop',
    category: 'AI Governance',
    framework: 'EU AI Act',
    healthScore: 90,
    status: 'implemented',
    owner: 'Dr. Sarah Weber (AI Lead)',
    lastReviewed: '2026-08-10',
  },
  {
    id: 'ctl_03',
    code: 'CTL-SEC-ENC-01',
    title: 'EU-Sovereign Encryption at Rest & Key Rotation',
    category: 'Security',
    framework: 'ISO 27001',
    healthScore: 95,
    status: 'implemented',
    owner: 'Alex Chen (SecOps)',
    lastReviewed: '2026-07-28',
  },
  {
    id: 'ctl_04',
    code: 'CTL-DATA-SW-01',
    title: 'Cloud Switching & Data Portability Verification',
    category: 'Data Governance',
    framework: 'EU Data Act',
    healthScore: 60,
    status: 'in_progress',
    owner: 'Elena Rostova (Compliance)',
    lastReviewed: '2026-08-05',
  },
];

const initialEvidence: EvidenceItem[] = [
  {
    id: 'ev_01',
    title: 'EU AI Act Annex IV Technical Documentation - Credit Scoring v3',
    category: 'Technical Safeguards',
    framework: 'EU AI Act',
    status: 'under_review',
    submittedBy: 'Dr. Sarah Weber',
    reviewDueDate: 'In 2 days',
    fileName: 'annex_iv_technical_doc_v3.pdf',
  },
  {
    id: 'ev_02',
    title: 'Q1 2026 Formal Article 30 ROPA Audit Sign-off',
    category: 'Assessment',
    framework: 'GDPR',
    status: 'valid',
    submittedBy: 'Dr. Klaus Becker',
    reviewDueDate: 'In 88 days',
    fileName: 'ropa_audit_signoff_q1.pdf',
  },
  {
    id: 'ev_03',
    title: 'Annual ISO 27001 Third-Party Surveillance Audit Report',
    category: 'Audit Certificate',
    framework: 'ISO 27001',
    status: 'valid',
    submittedBy: 'Thomas Schmidt (KPMG)',
    reviewDueDate: 'In 180 days',
    fileName: 'iso_27001_audit_report_2026.pdf',
  },
];

const mockROPA: ROPAItem[] = [
  {
    id: 'ropa_01',
    code: 'ROPA-ACT-001',
    name: 'Customer Authentication & Identity Management',
    purpose: 'Secure B2B multi-tenant login, MFA verification & session protection',
    legalBasis: 'Art. 6(1)(b) Contract Performance',
    retention: 'Account lifetime + 90 days',
    dpaStatus: 'verified',
  },
  {
    id: 'ropa_02',
    code: 'ROPA-ACT-002',
    name: 'Employee HR & Payroll Administration',
    purpose: 'Compensation processing, statutory tax & social security compliance',
    legalBasis: 'Art. 6(1)(c) Legal Obligation',
    retention: 'Statutory 10 years (HGB / Tax code)',
    dpaStatus: 'verified',
  },
  {
    id: 'ropa_03',
    code: 'ROPA-ACT-003',
    name: 'Product Telemetry & Usage Analytics',
    purpose: 'Continuous performance optimization and anomaly detection',
    legalBasis: 'Art. 6(1)(f) Legitimate Interest',
    retention: '14 months rolling aggregation',
    dpaStatus: 'pending',
  },
];

const mockAISystems: AISystemItem[] = [
  {
    id: 'ais_01',
    code: 'AI-SYS-001',
    name: 'Automated SME Credit Risk Evaluation Model v3',
    role: 'deployer',
    riskTier: 'high_risk',
    status: 'production',
    friaStatus: 'completed',
  },
  {
    id: 'ais_02',
    code: 'AI-SYS-002',
    name: 'Regulatory Clause Compliance Assistance Agent',
    role: 'deployer',
    riskTier: 'minimal_risk',
    status: 'production',
    friaStatus: 'exempt',
  },
  {
    id: 'ais_03',
    code: 'AI-SYS-003',
    name: 'Automated CV Candidate Screening Pilot',
    role: 'deployer',
    riskTier: 'high_risk',
    status: 'testing',
    friaStatus: 'required',
  },
];

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<TabType>('overview');
  const [evidenceList, setEvidenceList] = useState<EvidenceItem[]>(initialEvidence);
  const [selectedTenant, setSelectedTenant] = useState('EuroCorp Technologies SE (Frankfurt)');
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  // Four-Eyes evidence approval flow with decision notes and attribution
  const handleApproveEvidence = (id: string) => {
    const notes = typeof window !== 'undefined'
      ? window.prompt('Enter Approval Decision Notes (optional):', 'Verified compliance with applicable European regulatory clauses and technical safeguards.') || 'Verified compliance.'
      : 'Verified compliance.';

    setEvidenceList((prev) =>
      prev.map((ev) =>
        ev.id === id
          ? {
              ...ev,
              status: 'valid',
              reviewDueDate: 'In 90 days',
              reviewedBy: 'Elena Rostova (Compliance Lead)',
              reviewedAt: new Date().toISOString().split('T')[0],
              decisionNotes: notes,
            }
          : ev
      )
    );
    setActionNotice('✅ Evidence approved via Four-Eyes authorization! Immutable audit log recorded.');
    setTimeout(() => setActionNotice(null), 4000);
  };

  const handleRejectEvidence = (id: string) => {
    const reason = typeof window !== 'undefined'
      ? window.prompt('Enter Mandatory Rejection Rationale:', 'Requires updated signature and ISO control mapping before approval.') || 'Incomplete submission'
      : 'Incomplete submission';

    setEvidenceList((prev) =>
      prev.map((ev) =>
        ev.id === id
          ? {
              ...ev,
              status: 'rejected',
              reviewDueDate: 'Action Required',
              reviewedBy: 'Elena Rostova (Compliance Lead)',
              reviewedAt: new Date().toISOString().split('T')[0],
              decisionNotes: reason,
            }
          : ev
      )
    );
    setActionNotice('⚠️ Evidence marked as rejected. Decision rationale captured in audit trail.');
    setTimeout(() => setActionNotice(null), 4000);
  };

  return (
    <div style={{ display: 'flex', minHeight: '100vh', backgroundColor: 'var(--bg-primary)' }}>
      {/* Sidebar Navigation */}
      <aside
        style={{
          width: '270px',
          backgroundColor: 'var(--bg-surface)',
          borderRight: '1px solid var(--border-color)',
          padding: '24px 16px',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}
      >
        <div>
          {/* Logo & Product Title */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '28px', paddingLeft: '8px' }}>
            <div
              style={{
                width: '38px',
                height: '38px',
                borderRadius: '8px',
                backgroundColor: 'var(--accent-blue)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                color: '#fff',
                fontSize: '18px',
                boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
              }}
            >
              EG
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px', letterSpacing: '-0.2px' }}>euroGovernance</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>EU-Sovereign GRC SaaS</div>
            </div>
          </div>

          {/* Tenant Selector */}
          <div style={{ marginBottom: '20px', padding: '0 4px' }}>
            <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              Active Organization
            </label>
            <div
              style={{
                marginTop: '4px',
                padding: '8px 10px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
                fontSize: '12px',
                fontWeight: 500,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
              }}
            >
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }} />
              {selectedTenant}
            </div>
          </div>

          {/* Navigation Items */}
          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { id: 'overview', label: 'Executive Overview', icon: '📊' },
              { id: 'controls', label: 'Control Library', icon: '🛡️' },
              { id: 'evidence', label: 'Evidence Inbox', icon: '📄' },
              { id: 'gdpr', label: 'GDPR (ROPA & Breaches)', icon: '🔒' },
              { id: 'ai_systems', label: 'EU AI Act Register', icon: '🤖' },
              { id: 'audit_logs', label: 'Immutable Audit Trail', icon: '📜' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as TabType)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: activeTab === item.id ? 600 : 400,
                  backgroundColor: activeTab === item.id ? 'var(--bg-surface-hover)' : 'transparent',
                  color: activeTab === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: activeTab === item.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  transition: 'all 0.15s ease',
                  cursor: 'pointer',
                }}
              >
                <span>{item.icon}</span>
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        {/* EU Sovereignty & Region Badge */}
        <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: 600 }}>
            Data Sovereignty
          </div>
          <div style={{ fontSize: '12px', fontWeight: 500, marginTop: '4px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }} />
            europe-west3 (Frankfurt)
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Zero third-country transfers
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {/* Action / Notification Banner */}
        {actionNotice && (
          <div
            style={{
              padding: '12px 16px',
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
            <button
              onClick={() => setActionNotice(null)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
            >
              ✕
            </button>
          </div>
        )}

        {/* TAB 1: EXECUTIVE OVERVIEW */}
        {activeTab === 'overview' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '28px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Continuous Compliance Overview</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Real-time posture across GDPR, EU AI Act, EU Data Act, and ISO Management Systems.
                </p>
              </div>
              <button
                onClick={() => {
                  setActionNotice('📦 Exporting consolidated compliance package ZIP to Cloud Storage...');
                  setTimeout(() => setActionNotice('✅ Export generated: eurogovernance_audit_pack_2026.zip (Signed URL valid 7d)'), 2000);
                }}
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Export Compliance Package
              </button>
            </header>

            {/* Framework Readiness Cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '32px' }}>
              {initialFrameworks.map((fw) => (
                <div
                  key={fw.id}
                  style={{
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '10px',
                    padding: '18px',
                    display: 'flex',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                  }}
                >
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{fw.category}</div>
                    <div style={{ fontSize: '15px', fontWeight: 600, marginTop: '4px' }}>{fw.name}</div>
                  </div>

                  <div style={{ marginTop: '20px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                      <span style={{ fontSize: '26px', fontWeight: 700, color: fw.readinessPercentage >= 85 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                        {fw.readinessPercentage}%
                      </span>
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                        {fw.implementedControls} / {fw.totalControls} Controls
                      </span>
                    </div>

                    <div style={{ width: '100%', height: '6px', backgroundColor: 'var(--bg-surface-hover)', borderRadius: '3px', overflow: 'hidden' }}>
                      <div
                        style={{
                          width: `${fw.readinessPercentage}%`,
                          height: '100%',
                          backgroundColor: fw.readinessPercentage >= 85 ? 'var(--status-success)' : 'var(--status-warning)',
                          borderRadius: '3px',
                        }}
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Key Quick Views */}
            <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '20px' }}>
              {/* Evidence Review Inbox Preview */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
                  <h3 style={{ fontSize: '14px', fontWeight: 600 }}>Pending Four-Eyes Evidence Reviews</h3>
                  <button onClick={() => setActiveTab('evidence')} style={{ fontSize: '12px', color: 'var(--accent-blue)', background: 'none', border: 'none', cursor: 'pointer' }}>
                    View All →
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  {evidenceList.map((ev) => (
                    <div
                      key={ev.id}
                      style={{
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        padding: '12px',
                        backgroundColor: 'var(--bg-primary)',
                        borderRadius: '8px',
                        border: '1px solid var(--border-color)',
                      }}
                    >
                      <div>
                        <div style={{ fontSize: '13px', fontWeight: 500 }}>{ev.title}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          {ev.submittedBy} • <span style={{ color: 'var(--accent-blue)' }}>{ev.framework}</span>
                        </div>
                      </div>
                      <span
                        style={{
                          padding: '4px 8px',
                          borderRadius: '4px',
                          fontSize: '11px',
                          fontWeight: 600,
                          backgroundColor: ev.status === 'valid' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                          color: ev.status === 'valid' ? 'var(--status-success)' : 'var(--status-warning)',
                        }}
                      >
                        {ev.status.toUpperCase()}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Real-time Audit Timeline */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Live Audit Stream</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', fontSize: '12px' }}>
                  {[
                    { action: 'Evidence Reviewed', entity: 'ev_ropa_2026', actor: 'dpo@eurocorp.de', time: '10m ago' },
                    { action: 'AI Model Reclassified', entity: 'ais_credit_scoring', actor: 'ai-lead@eurocorp.de', time: '1h ago' },
                    { action: 'ROPA Activity Verified', entity: 'ropa_user_crm', actor: 'dpo@eurocorp.de', time: '3h ago' },
                    { action: 'Role Assigned', entity: 'usr_contrib_01', actor: 'admin@eurocorp.de', time: '5h ago' },
                  ].map((log, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                      <div>
                        <div style={{ fontWeight: 500 }}>{log.action}</div>
                        <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{log.entity} • {log.actor}</div>
                      </div>
                      <span style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{log.time}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: CONTROLS REGISTER */}
        {activeTab === 'controls' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Unified Control Library</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Tenant-adopted controls mapped across GDPR, EU AI Act, EU Data Act, and ISO 27001.
              </p>
            </header>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Code</th>
                    <th style={{ padding: '12px 16px' }}>Title</th>
                    <th style={{ padding: '12px 16px' }}>Framework</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>Health Score</th>
                    <th style={{ padding: '12px 16px' }}>Owner</th>
                  </tr>
                </thead>
                <tbody>
                  {mockControls.map((ctl) => (
                    <tr key={ctl.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{ctl.code}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{ctl.title}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', fontSize: '11px' }}>
                          {ctl.framework}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ padding: '3px 8px', borderRadius: '4px', fontSize: '11px', fontWeight: 600, backgroundColor: 'rgba(16, 185, 129, 0.1)', color: 'var(--status-success)' }}>
                          {ctl.status.toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 600 }}>{ctl.healthScore}%</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)' }}>{ctl.owner}</td>
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
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Evidence Review & Approval Inbox</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Four-Eyes principle approval queue. Immutable audit records committed upon transition.
              </p>
            </header>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
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
                        {ev.status.toUpperCase()}
                      </span>
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      File: <span style={{ color: 'var(--accent-blue)' }}>{ev.fileName}</span> • Framework: {ev.framework} • Author: {ev.submittedBy}
                    </div>
                    {ev.decisionNotes && (
                      <div style={{ marginTop: '8px', padding: '6px 10px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '11px', borderLeft: ev.status === 'valid' ? '3px solid var(--status-success)' : '3px solid var(--status-danger)' }}>
                        <span style={{ fontWeight: 600 }}>Decision Rationale:</span> {ev.decisionNotes}
                      </div>
                    )}
                    {ev.reviewedBy && (
                      <div style={{ marginTop: '4px', fontSize: '11px', color: 'var(--text-muted)' }}>
                        Audited by: <span style={{ fontWeight: 500 }}>{ev.reviewedBy}</span> {ev.reviewedAt && `on ${ev.reviewedAt}`}
                      </div>
                    )}
                  </div>

                  <div style={{ display: 'flex', gap: '8px' }}>
                    {ev.status === 'under_review' ? (
                      <>
                        <button
                          onClick={() => handleApproveEvidence(ev.id)}
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
                      <span style={{ fontSize: '12px', color: 'var(--text-muted)', fontWeight: 500 }}>
                        {ev.status === 'valid' ? '✅ Signed off & Active' : '❌ Revision Requested'}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* TAB 4: GDPR (ROPA & BREACHES) */}
        {activeTab === 'gdpr' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>GDPR Article 30 ROPA & Incident Register</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Mandatory records of processing activities, legal bases, retention schedules, and 72h breach response.
              </p>
            </header>

            {/* Breach 72h SLA Widget */}
            <div
              style={{
                padding: '16px 20px',
                backgroundColor: 'rgba(16, 185, 129, 0.05)',
                border: '1px solid rgba(16, 185, 129, 0.3)',
                borderRadius: '8px',
                marginBottom: '24px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--status-success)' }}>
                  Active Breach SLA Status: All Clear (0 Open Breaches)
                </div>
                <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                  Statutory 72-hour notification clock ready for instant triage and DPA dispatch.
                </div>
              </div>
              <button
                onClick={() => {
                  setActionNotice('🚨 Breach triage wizard initiated. Statutory 72-hour countdown active upon T0 timestamp.');
                }}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  padding: '6px 12px',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 500,
                  cursor: 'pointer',
                }}
              >
                Log New Incident
              </button>
            </div>

            {/* ROPA Table */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Activity Code</th>
                    <th style={{ padding: '12px 16px' }}>Processing Activity</th>
                    <th style={{ padding: '12px 16px' }}>Legal Basis</th>
                    <th style={{ padding: '12px 16px' }}>Retention Period</th>
                    <th style={{ padding: '12px 16px' }}>DPA Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockROPA.map((r) => (
                    <tr key={r.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{r.code}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <div style={{ fontWeight: 500 }}>{r.name}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{r.purpose}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px' }}>{r.legalBasis}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text-muted)' }}>{r.retention}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: r.dpaStatus === 'verified' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: r.dpaStatus === 'verified' ? 'var(--status-success)' : 'var(--status-warning)',
                          }}
                        >
                          {r.dpaStatus.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 5: EU AI ACT REGISTER */}
        {activeTab === 'ai_systems' && (
          <div>
            <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
              <div>
                <h1 style={{ fontSize: '22px', fontWeight: 700 }}>EU AI Act System Register & Classification</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Art. 5 Prohibited screening, Annex III High-Risk determinations, and FRIA tracking.
                </p>
              </div>
              <button
                onClick={() => {
                  setActionNotice('🤖 Classification engine evaluated: Zero Art. 5 prohibited practices detected. System placed in Annex III High-Risk category.');
                }}
                style={{
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  padding: '8px 16px',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 500,
                  border: 'none',
                  cursor: 'pointer',
                }}
              >
                Run Art. 5 Screening
              </button>
            </header>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>System Code</th>
                    <th style={{ padding: '12px 16px' }}>AI Model Name</th>
                    <th style={{ padding: '12px 16px' }}>Value Chain Role</th>
                    <th style={{ padding: '12px 16px' }}>Risk Tier</th>
                    <th style={{ padding: '12px 16px' }}>Status</th>
                    <th style={{ padding: '12px 16px' }}>FRIA Status</th>
                  </tr>
                </thead>
                <tbody>
                  {mockAISystems.map((ai) => (
                    <tr key={ai.id} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{ai.code}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{ai.name}</td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{ai.role}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: ai.riskTier === 'high_risk' ? 'rgba(234, 88, 12, 0.1)' : 'rgba(16, 185, 129, 0.1)',
                            color: ai.riskTier === 'high_risk' ? '#ea580c' : 'var(--status-success)',
                          }}
                        >
                          {ai.riskTier.replace('_', ' ').toUpperCase()}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{ai.status}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            backgroundColor: ai.friaStatus === 'completed' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(245, 158, 11, 0.1)',
                            color: ai.friaStatus === 'completed' ? 'var(--status-success)' : 'var(--status-warning)',
                          }}
                        >
                          {ai.friaStatus.toUpperCase()}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 6: IMMUTABLE AUDIT TRAIL */}
        {activeTab === 'audit_logs' && (
          <div>
            <header style={{ marginBottom: '24px' }}>
              <h1 style={{ fontSize: '22px', fontWeight: 700 }}>Immutable Compliance Audit Trail</h1>
              <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Append-only non-repudiation log for ISO 27001 A.12.4 and EU regulatory inspection.
              </p>
            </header>

            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '13px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-surface-hover)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px' }}>Timestamp</th>
                    <th style={{ padding: '12px 16px' }}>Actor</th>
                    <th style={{ padding: '12px 16px' }}>Role</th>
                    <th style={{ padding: '12px 16px' }}>Action</th>
                    <th style={{ padding: '12px 16px' }}>Entity</th>
                    <th style={{ padding: '12px 16px' }}>Workflow</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { ts: '2026-08-14 18:45:00', actor: 'dpo@eurocorp.de', role: 'privacy_manager', action: 'approve', entity: 'ev_ropa_2026', workflow: 'approveEvidence' },
                    { ts: '2026-08-14 17:30:12', actor: 'ai-lead@eurocorp.de', role: 'ai_governance_manager', action: 'status_transition', entity: 'ais_credit_scoring', workflow: 'classifyAISystem' },
                    { ts: '2026-08-14 16:15:40', actor: 'admin@eurocorp.de', role: 'tenant_admin', action: 'create', entity: 'tenant_eurocorp_de', workflow: 'createTenant' },
                  ].map((log, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>{log.ts}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 500 }}>{log.actor}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px' }}>{log.role}</td>
                      <td style={{ padding: '12px 16px', fontWeight: 600, color: 'var(--accent-blue)' }}>{log.action.toUpperCase()}</td>
                      <td style={{ padding: '12px 16px', fontFamily: 'monospace', fontSize: '12px' }}>{log.entity}</td>
                      <td style={{ padding: '12px 16px', color: 'var(--text-muted)', fontSize: '12px' }}>{log.workflow}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

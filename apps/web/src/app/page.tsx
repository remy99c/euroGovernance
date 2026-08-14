'use client';

import React, { useState } from 'react';

interface FrameworkSummary {
  id: string;
  name: string;
  category: string;
  readinessPercentage: number;
  totalControls: number;
  implementedControls: number;
  status: 'compliant' | 'in_progress' | 'action_required';
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

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState<'overview' | 'controls' | 'evidence' | 'ai_systems' | 'gdpr'>('overview');

  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Sidebar Navigation */}
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
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '32px', paddingLeft: '8px' }}>
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
                fontSize: '18px',
              }}
            >
              EG
            </div>
            <div>
              <div style={{ fontWeight: 600, fontSize: '15px' }}>euroGovernance</div>
              <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>EU-Sovereign GRC</div>
            </div>
          </div>

          <nav style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
            {[
              { id: 'overview', label: 'Executive Overview' },
              { id: 'controls', label: 'Control Library' },
              { id: 'evidence', label: 'Evidence Inbox' },
              { id: 'gdpr', label: 'GDPR (ROPA & DPIA)' },
              { id: 'ai_systems', label: 'EU AI Act Register' },
            ].map((item) => (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id as typeof activeTab)}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderRadius: '6px',
                  fontSize: '14px',
                  fontWeight: activeTab === item.id ? 600 : 400,
                  backgroundColor: activeTab === item.id ? 'var(--bg-surface-hover)' : 'transparent',
                  color: activeTab === item.id ? 'var(--text-primary)' : 'var(--text-secondary)',
                  borderLeft: activeTab === item.id ? '3px solid var(--accent-blue)' : '3px solid transparent',
                  transition: 'all 0.15s ease',
                }}
              >
                {item.label}
              </button>
            ))}
          </nav>
        </div>

        <div style={{ padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Residency</div>
          <div style={{ fontSize: '13px', fontWeight: 500, marginTop: '2px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--status-success)' }} />
            europe-west3 (Frankfurt)
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '32px 40px', overflowY: 'auto' }}>
        {/* Header */}
        <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '32px' }}>
          <div>
            <h1 style={{ fontSize: '24px', fontWeight: 700 }}>Continuous Compliance Overview</h1>
            <p style={{ fontSize: '14px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Multi-tenant posture across EU privacy, AI, data regulations, and ISO management systems.
            </p>
          </div>
          <div style={{ display: 'flex', gap: '12px' }}>
            <button
              style={{
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                padding: '8px 16px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 500,
              }}
            >
              Export Compliance Package
            </button>
          </div>
        </header>

        {/* Framework Readiness Grid */}
        <section style={{ marginBottom: '36px' }}>
          <h2 style={{ fontSize: '16px', fontWeight: 600, marginBottom: '16px', color: 'var(--text-secondary)' }}>Framework Readiness</h2>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px' }}>
            {initialFrameworks.map((fw) => (
              <div
                key={fw.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  justifyContent: 'space-between',
                }}
              >
                <div>
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{fw.category}</div>
                  <div style={{ fontSize: '16px', fontWeight: 600, marginTop: '4px' }}>{fw.name}</div>
                </div>

                <div style={{ marginTop: '24px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: '8px' }}>
                    <span style={{ fontSize: '28px', fontWeight: 700, color: fw.readinessPercentage >= 85 ? 'var(--status-success)' : 'var(--status-warning)' }}>
                      {fw.readinessPercentage}%
                    </span>
                    <span style={{ fontSize: '13px', color: 'var(--text-muted)' }}>
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
        </section>

        {/* Quick Activity & Approvals */}
        <section style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
          {/* Pending Evidence Approvals */}
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Pending Evidence Review Queue</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {[
                { title: 'EU AI Act Risk Assessment - Recommender System v2.1', author: 'Dr. Sarah Weber (AI Lead)', framework: 'EU AI Act', due: 'In 2 days' },
                { title: 'Customer Cloud Database DPA & Subprocessor Schedule', author: 'Mark Jansen (Legal)', framework: 'GDPR Art. 28', due: 'In 4 days' },
                { title: 'Quarterly Pentest Remediation Verification Report', author: 'Alex Chen (SecOps)', framework: 'ISO 27001 A.8.8', due: 'In 6 days' },
              ].map((ev, i) => (
                <div
                  key={i}
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
                    <div style={{ fontSize: '14px', fontWeight: 500 }}>{ev.title}</div>
                    <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      {ev.author} • <span style={{ color: 'var(--accent-blue)' }}>{ev.framework}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ fontSize: '12px', color: 'var(--status-warning)', fontWeight: 500 }}>{ev.due}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Real-Time Immutable Audit Log Stream */}
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '20px' }}>
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '16px' }}>Immutable Audit Stream</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              {[
                { action: 'Evidence Approved', entity: 'EV-2026-089', time: '12 min ago' },
                { action: 'AI Incident Logged', entity: 'INC-AI-004', time: '1 hour ago' },
                { action: 'Policy Activated', entity: 'POL-PRIV-01', time: '3 hours ago' },
                { action: 'Role Assigned', entity: 'user_clara -> privacy_mgr', time: '5 hours ago' },
              ].map((log, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid var(--border-color)', paddingBottom: '8px' }}>
                  <div>
                    <div style={{ fontWeight: 500 }}>{log.action}</div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '12px' }}>{log.entity}</div>
                  </div>
                  <div style={{ color: 'var(--text-muted)', fontSize: '11px' }}>{log.time}</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

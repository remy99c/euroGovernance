'use client';

import React from 'react';
import { UIEmptyState } from '../components/ui-empty-state';

export interface RisksTasksTabViewProps {
  risksList: any[];
  tasksList: any[];
}

export function RisksTasksTabView({ risksList, tasksList }: RisksTasksTabViewProps) {
  return (
    <div>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Risk Register & Remediation Tasks
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Track statutory liabilities, inherent and residual risk scores, and assigned remediation actions.
        </p>
      </header>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
        {/* Risks Register */}
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

        {/* Tasks Register */}
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
  );
}

'use client';

import React from 'react';
import { UIEmptyState } from '../components/ui-empty-state';

export interface GDPRPrivacyTabViewProps {
  ropaList: any[];
  breachesList: any[];
  onNavigateToTab: (tab: string) => void;
}

export function GDPRPrivacyTabView({
  ropaList,
  breachesList,
  onNavigateToTab,
}: GDPRPrivacyTabViewProps) {
  return (
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
          <button onClick={() => onNavigateToTab('processor_inventory')} className="btn-secondary">
            <span>📋</span> Processor Inventory
          </button>
          <button onClick={() => onNavigateToTab('processor_hub')} className="btn-secondary">
            <span>🏢</span> Processor Hub
          </button>
          <button onClick={() => onNavigateToTab('processor_transfers')} className="btn-primary">
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
  );
}

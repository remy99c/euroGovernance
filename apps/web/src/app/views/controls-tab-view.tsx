'use client';

import React from 'react';
import { UIPageHeader } from '../components/ui-page-header';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';

export interface ControlsTabViewProps {
  controlsList: any[];
  adoptedFrameworksList: any[];
  onOpenCreateControlModal: () => void;
  onOpenAdoptFrameworkModal: (fw: { id: string; name: string }) => void;
  onInstantiateFramework: (frameworkId: string, frameworkName: string) => Promise<void>;
  loadingAction?: string | null;
}

export function ControlsTabView({
  controlsList,
  adoptedFrameworksList,
  onOpenCreateControlModal,
  onOpenAdoptFrameworkModal,
  onInstantiateFramework,
  loadingAction,
}: ControlsTabViewProps) {
  const canonicalFrameworks = [
    { id: 'gdpr', name: 'GDPR (EU 2016/679)', domain: 'Privacy & Data Protection' },
    { id: 'eu_ai_act', name: 'EU AI Act (2024/1689)', domain: 'High-Risk AI Governance' },
    { id: 'iso_27001', name: 'ISO/IEC 27001:2022', domain: 'Information Security' },
  ];

  return (
    <div>
      <UIPageHeader
        title="Unified Controls Catalog"
        description="Tenant-adopted technical, organizational, and AI governance controls with deterministic framework mappings."
        primaryAction={{
          label: '+ Custom Control',
          icon: '🛡️',
          onClick: onOpenCreateControlModal,
          variant: 'success',
        }}
      />

      {/* Framework Adoption & Instantiation Deck */}
      <div className="card-modern" style={{ marginBottom: '24px' }}>
        <div style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px', color: 'var(--text-primary)' }}>
          Adopt Canonical Frameworks & Instantiate Controls
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '12px' }}>
          {canonicalFrameworks.map((fw) => {
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
                      onClick={() => onOpenAdoptFrameworkModal(fw)}
                      className="btn-primary"
                      style={{ flex: 1, padding: '6px 10px', fontSize: '11px' }}
                    >
                      Adopt & Scope
                    </button>
                  ) : (
                    <button
                      onClick={() => onInstantiateFramework(fw.id, fw.name)}
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
            onAction={onOpenCreateControlModal}
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
  );
}

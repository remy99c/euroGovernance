'use client';

import React from 'react';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';

export interface AISystemsTabViewProps {
  aiSystemsList: any[];
  onOpenClassifyModal: (sys: { id: string; name: string }) => void;
  loadingAction?: string | null;
}

export function AISystemsTabView({
  aiSystemsList,
  onOpenClassifyModal,
  loadingAction,
}: AISystemsTabViewProps) {
  return (
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
                  onOpenClassifyModal({
                    id: sys.id,
                    name: sys.name,
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
  );
}

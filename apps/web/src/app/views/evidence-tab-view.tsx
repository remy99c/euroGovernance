'use client';

import React from 'react';
import { UIPageHeader } from '../components/ui-page-header';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';

export interface EvidenceTabViewProps {
  evidenceList: any[];
  onOpenApproveModal: (ev: { id: string; title: string }) => void;
  onOpenRejectModal: (ev: { id: string; title: string }) => void;
  loadingAction?: string | null;
}

export function EvidenceTabView({
  evidenceList,
}: EvidenceTabViewProps) {
  const pendingCount = evidenceList.filter((e) => e.status === 'in_review' || e.status === 'under_review').length;

  return (
    <div>
      <UIPageHeader
        title="Evidence Review Queue"
        description="Recorded evidence metadata awaiting review. Approval and rejection are disabled until the referenced file version can be securely inspected and server-verified."
        badge={
          <UIBadge variant={pendingCount > 0 ? 'warning' : 'compliant'}>
            {pendingCount} Awaiting Review
          </UIBadge>
        }
      />

      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        {evidenceList.length === 0 ? (
          <UIEmptyState
            icon="📁"
            title="No Evidence In Queue"
            description="No evidence records are currently available for review."
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
                  <span style={{ fontSize: '14px', fontWeight: 700, color: 'var(--text-primary)' }}>{ev.title || ev.id}</span>
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
                {ev.status === 'under_review' || ev.status === 'in_review' ? (
                  <button
                    disabled
                    className="btn-secondary"
                    title="Approval and rejection are unavailable until secure file inspection and server-side integrity verification are implemented."
                    style={{ padding: '6px 14px', fontSize: '12px' }}
                  >
                    Review Decisions Unavailable
                  </button>
                ) : (
                  <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
                    {ev.status === 'valid' || ev.status === 'approved' ? 'Approval status recorded' : 'Revision pending'}
                  </span>
                )}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

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
  onOpenApproveModal,
  onOpenRejectModal,
  loadingAction,
}: EvidenceTabViewProps) {
  const pendingCount = evidenceList.filter((e) => e.status === 'in_review' || e.status === 'under_review').length;

  return (
    <div>
      <UIPageHeader
        title="Evidence Review & Four-Eyes Queue"
        description="Privileged verification workflows with SHA-256 integrity checks. Direct client status jumps are blocked by security rules."
        badge={
          <UIBadge variant={pendingCount > 0 ? 'warning' : 'compliant'}>
            {pendingCount} Awaiting Four-Eyes Review
          </UIBadge>
        }
      />

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
                  <>
                    <button
                      onClick={() =>
                        onOpenApproveModal({
                          id: ev.id,
                          title: ev.title || ev.id,
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
                        onOpenRejectModal({
                          id: ev.id,
                          title: ev.title || ev.id,
                        })
                      }
                      disabled={loadingAction === `reject_${ev.id}`}
                      className="btn-danger"
                      style={{ padding: '6px 14px', fontSize: '12px' }}
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
  );
}

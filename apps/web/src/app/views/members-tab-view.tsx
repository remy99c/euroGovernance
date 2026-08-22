'use client';

import React from 'react';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';

export interface MembersTabViewProps {
  membersList: any[];
  onOpenInviteModal: () => void;
  canInvite: boolean;
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
}

export function MembersTabView({
  membersList,
  onOpenInviteModal,
  canInvite,
  loading = false,
  error,
  onRetry,
}: MembersTabViewProps) {
  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Organization Members & Access Control
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            {canInvite
              ? 'Review memberships and invite authorized colleagues.'
              : 'Review the organization membership directory available to your role.'}
          </p>
        </div>
        {canInvite && (
          <button onClick={onOpenInviteModal} className="btn-success">
            + Invite Colleague
          </button>
        )}
      </header>

      <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <UIEmptyState
            icon="⏳"
            title="Loading Memberships"
            description="The authorized membership directory is being requested from the server."
          />
        ) : error ? (
          <UIEmptyState
            icon="⚠️"
            title="Memberships Unavailable"
            description={error}
            actionText={onRetry ? 'Retry' : undefined}
            onAction={onRetry}
          />
        ) : membersList.length === 0 ? (
          <UIEmptyState
            icon="👥"
            title="No Members Found"
            description={canInvite
              ? 'Invite team leads, auditors, and compliance managers to collaborate.'
              : 'No memberships were returned for this organization.'}
            actionText={canInvite ? '+ Invite Colleague' : undefined}
            onAction={canInvite ? onOpenInviteModal : undefined}
          />
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>User ID</th>
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
                  <td style={{ color: 'var(--text-muted)' }}>{m.department || '—'}</td>
                  <td>
                    <UIBadge variant={m.status === 'active' ? 'compliant' : 'critical'}>{m.status}</UIBadge>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

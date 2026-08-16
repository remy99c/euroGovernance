'use client';

import React from 'react';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';

export interface MembersTabViewProps {
  membersList: any[];
  onOpenInviteModal: () => void;
}

export function MembersTabView({ membersList, onOpenInviteModal }: MembersTabViewProps) {
  return (
    <div>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Organization Members & Access Control
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Manage role-based memberships, administrative rights, and assurance responsibilities.
          </p>
        </div>
        <button onClick={onOpenInviteModal} className="btn-success">
          + Invite Colleague
        </button>
      </header>

      <div className="card-modern" style={{ padding: 0, overflow: 'hidden' }}>
        {membersList.length === 0 ? (
          <UIEmptyState
            icon="👥"
            title="No Members Found"
            description="Invite team leads, auditors, and compliance managers to collaborate."
            actionText="+ Invite Colleague"
            onAction={onOpenInviteModal}
          />
        ) : (
          <table className="table-modern">
            <thead>
              <tr>
                <th>User ID / Email</th>
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
                  <td style={{ color: 'var(--text-muted)' }}>{m.department || 'Governance'}</td>
                  <td>
                    <UIBadge variant="compliant">{m.status}</UIBadge>
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

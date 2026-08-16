'use client';

import React, { useState } from 'react';
import { UIModal } from '../components/ui-modal';

export interface InviteMemberModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (data: { email: string; role: string; department: string }) => Promise<void>;
  loading?: boolean;
}

export function InviteMemberModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}: InviteMemberModalProps) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('auditor');
  const [department, setDepartment] = useState('Risk & Assurance');

  const handleSubmit = async () => {
    if (!email.trim() || !role) return;
    await onSubmit({
      email: email.trim(),
      role,
      department: department.trim(),
    });
    setEmail('');
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Invite Colleague"
      subtitle="Grant role-based access to the organization's compliance workspace."
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !email.trim()}
            className="btn-success"
          >
            {loading ? 'Sending Invite...' : 'Send Invitation'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Email Address
          </label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. auditor@kpmg.de"
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Assigned Role
          </label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          >
            <option value="auditor">Auditor (Read-only assurance)</option>
            <option value="compliance_manager">Compliance Manager</option>
            <option value="security_manager">Security Manager</option>
            <option value="privacy_manager">Privacy Officer / DPO</option>
            <option value="ai_governance_manager">AI Governance Lead</option>
            <option value="contributor">Contributor (Task & evidence submitter)</option>
            <option value="tenant_admin">Tenant Administrator</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Department
          </label>
          <input
            type="text"
            value={department}
            onChange={(e) => setDepartment(e.target.value)}
            placeholder="e.g. Information Security"
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>
      </div>
    </UIModal>
  );
}

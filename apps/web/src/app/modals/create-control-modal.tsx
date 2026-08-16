'use client';

import React, { useState } from 'react';
import { UIModal } from '../components/ui-modal';

export interface CreateControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (control: {
    code: string;
    title: string;
    domain: string;
    frameworkIds: string[];
  }) => Promise<void>;
  loading?: boolean;
}

export function CreateControlModal({
  isOpen,
  onClose,
  onSubmit,
  loading = false,
}: CreateControlModalProps) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [domain, setDomain] = useState('Access Control');
  const [frameworks, setFrameworks] = useState('iso_27001, gdpr');

  const handleSubmit = async () => {
    if (!code.trim() || !title.trim()) return;
    const frameworkIds = frameworks
      .split(',')
      .map((f) => f.trim())
      .filter(Boolean);
    await onSubmit({
      code: code.trim(),
      title: title.trim(),
      domain,
      frameworkIds,
    });
    setCode('');
    setTitle('');
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Custom Control"
      subtitle="Define a tenant-specific control and map it to active frameworks."
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !code.trim() || !title.trim()}
            className="btn-success"
          >
            {loading ? 'Creating...' : 'Save Control'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Control Code
          </label>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="e.g. CTL-SEC-99"
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Control Title
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Automated WebAuthn MFA Gateway"
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Domain
          </label>
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          >
            <option value="Access Control">Access Control</option>
            <option value="Cryptography & Encryption">Cryptography & Encryption</option>
            <option value="Data Protection & Privacy">Data Protection & Privacy</option>
            <option value="AI Safety & Transparency">AI Safety & Transparency</option>
            <option value="Supplier & Processor Security">Supplier & Processor Security</option>
          </select>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Framework Identifiers (Comma-separated)
          </label>
          <input
            type="text"
            value={frameworks}
            onChange={(e) => setFrameworks(e.target.value)}
            placeholder="iso_27001, gdpr, eu_ai_act"
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          />
        </div>
      </div>
    </UIModal>
  );
}

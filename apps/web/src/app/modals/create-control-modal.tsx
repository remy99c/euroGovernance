'use client';

import React, { useState } from 'react';
import { UIModal } from '../components/ui-modal';

export interface CreateControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (control: {
    code: string;
    title: string;
    description: string;
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
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('Access Control');
  const [frameworkIds, setFrameworkIds] = useState<string[]>([]);

  const frameworkOptions = [
    { id: 'gdpr', label: 'EU GDPR' },
    { id: 'eu_ai_act', label: 'EU AI Act' },
    { id: 'eu_data_act', label: 'EU Data Act' },
    { id: 'iso_27001', label: 'ISO/IEC 27001' },
    { id: 'iso_42001', label: 'ISO/IEC 42001' },
  ];

  const handleSubmit = async () => {
    if (!code.trim() || !title.trim() || !description.trim() || frameworkIds.length === 0) return;
    await onSubmit({
      code: code.trim(),
      title: title.trim(),
      description: description.trim(),
      domain,
      frameworkIds,
    });
    setCode('');
    setTitle('');
    setDescription('');
    setFrameworkIds([]);
  };

  const toggleFramework = (frameworkId: string) => {
    setFrameworkIds((current) =>
      current.includes(frameworkId)
        ? current.filter((id) => id !== frameworkId)
        : [...current, frameworkId]
    );
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create Custom Control"
      subtitle="Define a tenant-specific control. New controls start as not started and require separate implementation review."
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !code.trim() || !title.trim() || !description.trim() || frameworkIds.length === 0}
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
            Control Description
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Describe the control objective and expected operation."
            className="input-modern"
            rows={4}
            maxLength={4000}
            style={{ width: '100%', marginTop: '4px', resize: 'vertical' }}
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
            Framework Mappings
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', marginTop: '6px' }}>
            {frameworkOptions.map((framework) => (
              <label
                key={framework.id}
                style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 10px', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}
              >
                <input
                  type="checkbox"
                  checked={frameworkIds.includes(framework.id)}
                  onChange={() => toggleFramework(framework.id)}
                />
                <span style={{ fontSize: '12px' }}>{framework.label}</span>
              </label>
            ))}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
            Select only frameworks this control is intentionally mapped to. Requirement mappings are added separately.
          </div>
        </div>
      </div>
    </UIModal>
  );
}

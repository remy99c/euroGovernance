'use client';

import React, { useState, useEffect } from 'react';
import { UIModal } from '../components/ui-modal';

export interface AdoptFrameworkModalProps {
  isOpen: boolean;
  frameworkId: string;
  frameworkName: string;
  defaultScope?: string;
  onClose: () => void;
  onSubmit: (params: { frameworkId: string; frameworkName: string; scope: string }) => Promise<void>;
  loading?: boolean;
}

export function AdoptFrameworkModal({
  isOpen,
  frameworkId,
  frameworkName,
  defaultScope = 'Primary EU Operations, Cloud Infrastructure & Customer Data Processing',
  onClose,
  onSubmit,
  loading = false,
}: AdoptFrameworkModalProps) {
  const [scope, setScope] = useState(defaultScope);

  useEffect(() => {
    if (isOpen) {
      setScope(defaultScope);
    }
  }, [isOpen, defaultScope]);

  const handleSubmit = async () => {
    if (!scope.trim()) return;
    await onSubmit({
      frameworkId,
      frameworkName,
      scope: scope.trim(),
    });
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title={`Adopt ${frameworkName}`}
      subtitle="Establish organizational scoping and regulatory applicability."
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !scope.trim()}
            className="btn-success"
          >
            {loading ? 'Adopting...' : 'Confirm Adoption'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Compliance Scope Description
        </label>
        <textarea
          value={scope}
          onChange={(e) => setScope(e.target.value)}
          rows={4}
          className="input-modern"
          style={{ width: '100%', resize: 'vertical' }}
          placeholder="Define boundaries, infrastructure, and organizational entities covered..."
        />
      </div>
    </UIModal>
  );
}

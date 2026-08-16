'use client';

import React, { useState, useEffect } from 'react';
import { UIModal } from '../components/ui-modal';

export interface RejectEvidenceModalProps {
  isOpen: boolean;
  evidenceId: string;
  title: string;
  onClose: () => void;
  onReject: (evidenceId: string, reason: string) => Promise<void>;
  loading?: boolean;
}

export function RejectEvidenceModal({
  isOpen,
  evidenceId,
  title,
  onClose,
  onReject,
  loading = false,
}: RejectEvidenceModalProps) {
  const [reason, setReason] = useState('Requires updated cryptographic signature and ISO control mapping.');

  useEffect(() => {
    if (isOpen) {
      setReason('Requires updated cryptographic signature and ISO control mapping.');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    if (!reason.trim()) return;
    await onReject(evidenceId, reason.trim());
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Reject Evidence & Request Revision"
      subtitle={`Returning evidence: ${title || evidenceId}`}
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading || !reason.trim()}
            className="btn-danger"
          >
            {loading ? 'Rejecting...' : 'Reject & Notify Author'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Mandatory Rejection Rationale
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={4}
          className="input-modern"
          style={{ width: '100%', resize: 'vertical' }}
          placeholder="Explain why the evidence is insufficient (e.g. missing signature, expired certificate)..."
        />
      </div>
    </UIModal>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { UIModal } from '../components/ui-modal';

export interface ApproveEvidenceModalProps {
  isOpen: boolean;
  evidenceId: string;
  title: string;
  onClose: () => void;
  onApprove: (evidenceId: string, notes: string) => Promise<void>;
  loading?: boolean;
}

export function ApproveEvidenceModal({
  isOpen,
  evidenceId,
  title,
  onClose,
  onApprove,
  loading = false,
}: ApproveEvidenceModalProps) {
  const [notes, setNotes] = useState('');

  useEffect(() => {
    if (isOpen) {
      setNotes('');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    await onApprove(evidenceId, notes);
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Evidence Approval"
      subtitle={`Record a review decision for: ${title || evidenceId}`}
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="btn-success"
          >
            {loading ? 'Recording...' : 'Record Approval'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
          Approval Decision Notes
        </label>
        <textarea
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={4}
          className="input-modern"
          style={{ width: '100%', resize: 'vertical' }}
          placeholder="Describe the file version inspected, review performed, and conclusion reached."
        />
      </div>
    </UIModal>
  );
}

'use client';

import React, { useState, useEffect } from 'react';
import { UIModal } from '../components/ui-modal';

export interface ClassifyAIModalProps {
  isOpen: boolean;
  systemId: string;
  systemName: string;
  onClose: () => void;
  onSubmit: (params: {
    systemId: string;
    isProhibited: boolean;
    annexThreeCategory: string;
  }) => Promise<void>;
  loading?: boolean;
}

export function ClassifyAIModal({
  isOpen,
  systemId,
  systemName,
  onClose,
  onSubmit,
  loading = false,
}: ClassifyAIModalProps) {
  const [isProhibited, setIsProhibited] = useState(false);
  const [annexThreeCategory, setAnnexThreeCategory] = useState('none');

  useEffect(() => {
    if (isOpen) {
      setIsProhibited(false);
      setAnnexThreeCategory('none');
    }
  }, [isOpen]);

  const handleSubmit = async () => {
    await onSubmit({
      systemId,
      isProhibited,
      annexThreeCategory,
    });
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="EU AI Act Risk Classification"
      subtitle={`Classifying model: ${systemName || systemId}`}
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled
            className="btn-secondary"
            title="The condensed form cannot support a defensible EU AI Act classification."
          >
            Full Assessment Required
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ padding: '12px', backgroundColor: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: '8px', fontSize: '12px', color: 'var(--text-primary)' }}>
          This condensed screen is informational only. Classification is disabled until every Article 5 practice and Annex III category can be assessed and independently reviewed.
        </div>
        <div style={{ padding: '12px', backgroundColor: 'var(--bg-canvas-subtle)', borderRadius: '8px', border: '1px solid var(--border-subtle)' }}>
          <label style={{ display: 'flex', alignItems: 'flex-start', gap: '10px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={isProhibited}
              onChange={(e) => setIsProhibited(e.target.checked)}
              style={{ marginTop: '3px' }}
            />
            <div>
              <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text-primary)' }}>
                Prohibited Practices Check (Article 5)
              </div>
              <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                Does this AI system perform real-time biometric identification, cognitive behavioral manipulation, social scoring, or biometric categorization?
              </div>
            </div>
          </label>
        </div>

        <div>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Annex III High-Risk Sector Classification
          </label>
          <select
            value={annexThreeCategory}
            onChange={(e) => setAnnexThreeCategory(e.target.value)}
            className="input-modern"
            style={{ width: '100%', marginTop: '4px' }}
          >
            <option value="none">None (Standard / Minimal Risk)</option>
            <option value="essential_services_benefits">Essential Services & Benefits (Credit scoring, insurance, benefits)</option>
            <option value="employment_recruitment">Employment & Recruitment (Resume ranking, performance monitoring)</option>
            <option value="critical_infrastructure">Critical Infrastructure (Energy, transport, water supply)</option>
            <option value="law_enforcement">Law Enforcement & Border Control</option>
            <option value="administration_justice">Administration of Justice & Democratic Processes</option>
          </select>
        </div>
      </div>
    </UIModal>
  );
}

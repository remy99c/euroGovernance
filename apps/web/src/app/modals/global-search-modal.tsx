'use client';

import React, { useState, useEffect } from 'react';
import { UIModal } from '../components/ui-modal';

export interface SearchResultItem {
  id: string;
  type: string;
  title: string;
  subtitle: string;
  tab: string;
}

export interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  controls: any[];
  evidence: any[];
  ropa: any[];
  aiSystems: any[];
  onSelectResult: (tab: string) => void;
}

export function GlobalSearchModal({
  isOpen,
  onClose,
  controls,
  evidence,
  ropa,
  aiSystems,
  onSelectResult,
}: GlobalSearchModalProps) {
  const [query, setQuery] = useState('');

  useEffect(() => {
    if (isOpen) {
      setQuery('');
    }
  }, [isOpen]);

  const results: SearchResultItem[] = [];
  const q = query.trim().toLowerCase();

  if (q.length > 0) {
    controls.forEach((c) => {
      if (c.code?.toLowerCase().includes(q) || c.title?.toLowerCase().includes(q) || c.domain?.toLowerCase().includes(q)) {
        results.push({
          id: c.id,
          type: 'Control',
          title: `${c.code}: ${c.title}`,
          subtitle: `Domain: ${c.domain} • Health: ${c.healthScore}%`,
          tab: 'controls',
        });
      }
    });

    evidence.forEach((e) => {
      if (e.title?.toLowerCase().includes(q) || e.category?.toLowerCase().includes(q)) {
        results.push({
          id: e.id,
          type: 'Evidence',
          title: e.title,
          subtitle: `Category: ${e.category} • Status: ${e.status}`,
          tab: 'evidence',
        });
      }
    });

    ropa.forEach((r) => {
      if (r.activityCode?.toLowerCase().includes(q) || r.activityName?.toLowerCase().includes(q)) {
        results.push({
          id: r.id,
          type: 'ROPA',
          title: `${r.activityCode}: ${r.activityName}`,
          subtitle: `Legal Basis: ${r.legalBasis}`,
          tab: 'gdpr',
        });
      }
    });

    aiSystems.forEach((a) => {
      if (a.name?.toLowerCase().includes(q) || a.intendedPurpose?.toLowerCase().includes(q)) {
        results.push({
          id: a.id,
          type: 'AI System',
          title: a.name,
          subtitle: `Risk: ${a.riskTier} • Role: ${a.role}`,
          tab: 'ai_systems',
        });
      }
    });
  }

  const handleSelect = (tab: string) => {
    onSelectResult(tab);
    onClose();
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Search Compliance Assets"
      subtitle="Search the controls, evidence metadata, ROPA activities, and AI systems currently loaded in this workspace."
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
        <input
          type="text"
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Type to search (e.g. MFA, Encryption, Article 30, Claude)..."
          className="input-modern"
          style={{ width: '100%', fontSize: '13px', padding: '10px 14px' }}
        />

        <div style={{ maxHeight: '360px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {q.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
              Enter search keywords to query live registers
            </div>
          ) : results.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '24px', color: 'var(--text-muted)', fontSize: '12px' }}>
              No compliance records matching &ldquo;{query}&rdquo;
            </div>
          ) : (
            results.slice(0, 10).map((res) => (
              <div
                key={`${res.type}_${res.id}`}
                onClick={() => handleSelect(res.tab)}
                style={{
                  padding: '10px 12px',
                  borderRadius: '6px',
                  backgroundColor: 'var(--surface-subtle)',
                  border: '1px solid var(--border-subtle)',
                  cursor: 'pointer',
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  transition: 'background-color 0.15s ease',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-hover)')}
                onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'var(--surface-subtle)')}
              >
                <div>
                  <div style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>{res.title}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>{res.subtitle}</div>
                </div>
                <span
                  style={{
                    fontSize: '10px',
                    fontWeight: 700,
                    padding: '2px 6px',
                    borderRadius: '4px',
                    backgroundColor: 'var(--surface-l2-card)',
                    color: 'var(--accent-primary)',
                  }}
                >
                  {res.type}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </UIModal>
  );
}

'use client';

import React from 'react';
import { formatTime } from '../../lib/formatters';

export interface ExportsTabViewProps {
  exportJobsList: any[];
  onRequestExport: (exportType: string) => Promise<void>;
  canRequestExport: boolean;
  loadingAction?: string | null;
}

export function ExportsTabView({
  exportJobsList,
  onRequestExport,
  canRequestExport,
  loadingAction,
}: ExportsTabViewProps) {
  const exportItems = [
    { type: 'tenant_evidence_package_zip', label: '📦 Evidence Inventory JSON Draft' },
    { type: 'adopted_frameworks_summary', label: '📋 Framework Summary JSON Draft' },
    { type: 'applicability_decisions_report', label: '⚖️ Applicability JSON Draft' },
    { type: 'tenant_control_coverage_report', label: '🛡️ Control Coverage JSON Draft' },
    { type: 'iso_soa_pdf', label: '📄 ISO SoA JSON Draft' },
    { type: 'framework_gap_report', label: '⚠️ Framework Gaps JSON Draft' },
    { type: 'processor_inventory_report', label: '🏢 Processor Inventory JSON Draft' },
    { type: 'restricted_transfers_register', label: '🌍 Transfers Register JSON Draft' },
    { type: 'transfer_mechanisms_report', label: '📜 Transfer Mechanisms JSON Draft' },
    { type: 'certification_register_report', label: '🏆 Certifications JSON Draft' },
    { type: 'processor_assurance_register', label: '🛡️ Processor Assurance JSON Draft' },
    { type: 'gdpr_ropa_xlsx', label: '📊 GDPR ROPA JSON Draft' },
    { type: 'processor_assessment_report', label: '📊 Processor Assessment JSON Draft' },
    { type: 'eu_ai_act_technical_file_pdf', label: '🤖 AI Technical File JSON Draft' },
  ];

  return (
    <div>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Compliance & Audit Exports
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Generate server-side structured JSON drafts from recorded tenant data. These are not rendered auditor dossiers.
        </p>
        <p style={{ fontSize: '12px', color: 'var(--status-warning)', marginTop: '6px' }}>
          Secure browser download and ZIP, PDF, and XLSX rendering are not available yet. Verify source records before relying on any draft.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {exportItems.map((item) => (
          <button
            key={item.type}
            onClick={() => onRequestExport(item.type)}
            disabled={!canRequestExport || loadingAction === `export_${item.type}`}
            title={canRequestExport ? 'Generate a server-side JSON draft' : 'Your role may inspect export jobs but cannot create them'}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            {item.label}
          </button>
        ))}
      </div>

      {!canRequestExport && (
        <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '18px' }}>
          Read-only access: your role may inspect recorded jobs but cannot initiate an export.
        </div>
      )}

      <div className="card-modern">
        <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px', color: 'var(--text-primary)' }}>
          Export Jobs Archive ({exportJobsList.length})
        </h2>
        {exportJobsList.length === 0 ? (
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>No exports generated yet.</div>
        ) : (
          exportJobsList.map((job) => (
            <div
              key={job.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                borderBottom: '1px solid var(--border-subtle)',
                paddingBottom: '10px',
                marginBottom: '10px',
                fontSize: '12px',
              }}
            >
              <div>
                <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{job.exportType}</span> • Status:{' '}
                <span style={{ color: 'var(--status-compliant-fg)', fontWeight: 600 }}>{job.status}</span>
                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>
                  Server artifact: {job.fileStoragePath || 'not created'} (browser download unavailable)
                </div>
              </div>
              <div className="font-tabular" style={{ color: 'var(--text-muted)', fontSize: '11px' }}>
                {formatTime(job.requestedAt)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

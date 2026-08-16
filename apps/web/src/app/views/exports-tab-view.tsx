'use client';

import React from 'react';
import { formatTime } from '../../lib/formatters';

export interface ExportsTabViewProps {
  exportJobsList: any[];
  onRequestExport: (exportType: string) => Promise<void>;
  loadingAction?: string | null;
}

export function ExportsTabView({
  exportJobsList,
  onRequestExport,
  loadingAction,
}: ExportsTabViewProps) {
  const exportItems = [
    { type: 'tenant_evidence_package_zip', label: '📦 Evidence Package' },
    { type: 'adopted_frameworks_summary', label: '📋 Adopted Frameworks Summary' },
    { type: 'applicability_decisions_report', label: '⚖️ Applicability Determinations' },
    { type: 'tenant_control_coverage_report', label: '🛡️ Control Coverage & Harmonization' },
    { type: 'iso_soa_pdf', label: '📄 ISO 27001 Statement of Applicability' },
    { type: 'framework_gap_report', label: '⚠️ Multi-Framework Gap Report' },
    { type: 'processor_inventory_report', label: '🏢 Processor Inventory' },
    { type: 'restricted_transfers_register', label: '🌍 Restricted Transfers Register' },
    { type: 'transfer_mechanisms_report', label: '📜 Transfer Mechanisms (SCCs)' },
    { type: 'certification_register_report', label: '🏆 Master Certifications Register' },
    { type: 'processor_assurance_register', label: '🛡️ Processor Assurance Register' },
    { type: 'gdpr_ropa_xlsx', label: '📊 GDPR ROPA' },
    { type: 'processor_assessment_report', label: '📊 Processor Assessment Report' },
    { type: 'eu_ai_act_technical_file_pdf', label: '🤖 AI Act Technical Dossier' },
  ];

  return (
    <div>
      <header style={{ marginBottom: '24px' }}>
        <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
          Compliance & Audit Exports
        </h1>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
          Generate official auditor dossiers and framework readiness packages.
        </p>
      </header>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '24px', flexWrap: 'wrap' }}>
        {exportItems.map((item) => (
          <button
            key={item.type}
            onClick={() => onRequestExport(item.type)}
            disabled={loadingAction === `export_${item.type}`}
            className="btn-secondary"
            style={{ fontSize: '12px' }}
          >
            {item.label}
          </button>
        ))}
      </div>

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
                <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>Storage: {job.fileStoragePath}</div>
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

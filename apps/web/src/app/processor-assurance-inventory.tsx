'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  ProcessorAssuranceInventoryItem,
  ProcessorAssuranceInventorySummary,
  AssuranceStandardFamily,
  AssuranceArtifactKind,
  ProcessorCertificationStatus,
  ProcessorCertificationReviewStatus,
  ProcessorCertification,
  SystemAsset,
  Evidence,
  getAssuranceTaxonomy,
  getAssuranceArtifactKindLabel,
} from '@eurogovernance/shared-types';
import { ProcessorCertificationFormModal } from './processor-certification-form-modal';

interface ProcessorAssuranceInventoryProps {
  tenantId: string;
  onSelectProcessorForHub?: (processorProfileId: string) => void;
  onNotice?: (msg: string) => void;
}

const STANDARD_FAMILY_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Assurance Standards' },
  { id: 'iso_27001', label: 'ISO/IEC 27001:2022 (ISMS)' },
  { id: 'iso_27701', label: 'ISO/IEC 27701:2019 (PIMS / Privacy)' },
  { id: 'iso_42001', label: 'ISO/IEC 42001:2023 (AI Management System)' },
  { id: 'iso_22301', label: 'ISO 22301:2019 (Business Continuity)' },
  { id: 'soc1_type2', label: 'SOC 1 Type II (ICFR Financial Controls)' },
  { id: 'soc2_type1', label: 'SOC 2 Type I (Design of Controls)' },
  { id: 'soc2_type2', label: 'SOC 2 Type II (Operating Effectiveness)' },
  { id: 'soc3', label: 'SOC 3 (Trust Services Report)' },
  { id: 'csa_star', label: 'CSA STAR Level 2' },
  { id: 'pci_dss_aoc', label: 'PCI-DSS AoC/RoC' },
  { id: 'bsi_c5', label: 'BSI C5:2020 Cloud Criteria' },
  { id: 'tisax', label: 'TISAX (Automotive Security)' },
  { id: 'cyber_essentials_plus', label: 'Cyber Essentials Plus' },
  { id: 'gdpr_art42_europrivacy', label: 'GDPR Art. 42 Europrivacy' },
  { id: 'hipaa_security', label: 'HIPAA Security Attestation' },
  { id: 'dpf_self_certification', label: 'EU-US Data Privacy Framework (DPF)' },
  { id: 'other', label: 'Other / Custom Standard' },
];

const ARTIFACT_KIND_OPTIONS: { id: string; label: string }[] = [
  { id: 'all', label: 'All Artifact Kinds' },
  { id: 'accredited_certification', label: 'Accredited Certification (ISO, BSI)' },
  { id: 'independent_attestation_report', label: 'Independent Attestation (SOC 1/2/3)' },
  { id: 'regulatory_declaration', label: 'Regulatory Declaration / Attestation' },
  { id: 'code_of_conduct', label: 'Code of Conduct (EU Cloud CoC)' },
  { id: 'industry_label', label: 'Industry Label / Trustmark' },
  { id: 'self_assessment', label: 'Self-Assessment' },
  { id: 'custom_assurance', label: 'Custom Assurance' },
];

export default function ProcessorAssuranceInventory({
  tenantId,
  onSelectProcessorForHub,
  onNotice,
}: ProcessorAssuranceInventoryProps) {
  // Inventory state
  const [items, setItems] = useState<ProcessorAssuranceInventoryItem[]>([]);
  const [summary, setSummary] = useState<ProcessorAssuranceInventorySummary | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [systems, setSystems] = useState<SystemAsset[]>([]);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [standardFilter, setStandardFilter] = useState<string>('all');
  const [artifactKindFilter, setArtifactKindFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [validityFilter, setValidityFilter] = useState<string>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');
  const [criticalProcessorOnly, setCriticalProcessorOnly] = useState<boolean>(false);
  const [issuerQuery, setIssuerQuery] = useState<string>('');
  const [systemFilter, setSystemFilter] = useState<string>('all');
  const [missingEvidenceOnly, setMissingEvidenceOnly] = useState<boolean>(false);
  const [insufficientOrRejectedOnly, setInsufficientOrRejectedOnly] = useState<boolean>(false);
  const [includeHistoric, setIncludeHistoric] = useState<boolean>(false);

  // Modal states for Create / Maintain / Replace / Review
  const [showCertFormModal, setShowCertFormModal] = useState<boolean>(false);
  const [certFormMode, setCertFormMode] = useState<'create' | 'edit' | 'replace'>('create');
  const [selectedCertForForm, setSelectedCertForForm] = useState<ProcessorCertification | null>(null);
  const [selectedProfileIdForForm, setSelectedProfileIdForForm] = useState<string>('');

  // Inline Review Modal State
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [selectedCertForReview, setSelectedCertForReview] = useState<ProcessorCertification | null>(null);
  const [reviewDecision, setReviewDecision] = useState<'accept' | 'reject' | 'mark_insufficient' | 'start_review'>('accept');
  const [reviewNotesInput, setReviewNotesInput] = useState<string>('');
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>('');
  const [insufficientRationaleInput, setInsufficientRationaleInput] = useState<string>('');
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);
  const [exportingReport, setExportingReport] = useState<string | null>(null);

  const showMsg = (msg: string) => {
    if (onNotice) onNotice(msg);
  };

  const handleTriggerExport = async (exportType: string) => {
    if (!tenantId) return;
    setExportingReport(exportType);
    try {
      const exportFn = httpsCallable(functions, 'generateTenantEvidenceExport');
      const res: any = await exportFn({
        tenantId,
        exportType,
        filters: {
          standardFilter: standardFilter !== 'all' ? standardFilter : undefined,
          statusFilter: statusFilter !== 'all' ? statusFilter : undefined,
          validityFilter: validityFilter !== 'all' ? validityFilter : undefined,
          criticalProcessorOnly,
        },
      });

      showMsg(`✅ Export job queued & completed: ${res.data?.fileStoragePath || exportType}`);
    } catch (err: any) {
      console.error('Failed to trigger export:', err);
      showMsg(`Error generating export: ${err.message || 'Unknown error'}`);
    } finally {
      setExportingReport(null);
    }
  };

  // Load Inventory Data via Server-Side Correlated Query
  const fetchAssuranceInventory = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const params: any = {
        tenantId,
        includeHistoric,
      };

      if (standardFilter !== 'all') params.standardFamily = standardFilter as AssuranceStandardFamily;
      if (artifactKindFilter !== 'all') params.artifactKind = artifactKindFilter as AssuranceArtifactKind;
      if (statusFilter !== 'all') params.status = statusFilter as ProcessorCertificationStatus;
      if (validityFilter !== 'all') params.validityStatus = validityFilter;
      if (reviewStatusFilter !== 'all') params.reviewStatus = reviewStatusFilter as ProcessorCertificationReviewStatus;
      if (criticalProcessorOnly) params.criticalProcessorOnly = true;
      if (issuerQuery.trim()) params.issuerQuery = issuerQuery.trim();
      if (systemFilter !== 'all') params.linkedSystemAssetId = systemFilter;
      if (missingEvidenceOnly) params.missingEvidenceOnly = true;
      if (insufficientOrRejectedOnly) params.insufficientOrRejectedOnly = true;
      if (searchQuery.trim()) params.searchQuery = searchQuery.trim();

      const listAssuranceInvFn = httpsCallable(functions, 'listTenantProcessorAssuranceInventory');
      const res: any = await listAssuranceInvFn(params);

      setItems(res.data?.items || []);
      setSummary(res.data?.summary || null);

      // Also load supporting systems & evidence if empty
      if (systems.length === 0) {
        try {
          const listSysFn = httpsCallable(functions, 'listTenantSystemAssets');
          const sysRes: any = await listSysFn({ tenantId });
          setSystems(sysRes.data?.assets || []);
        } catch {}
      }
    } catch (err: any) {
      console.error('Failed to load processor assurance inventory:', err);
      setError(err.message || 'Failed to load processor assurance inventory.');
    } finally {
      setLoading(false);
    }
  }, [
    tenantId,
    includeHistoric,
    standardFilter,
    artifactKindFilter,
    statusFilter,
    validityFilter,
    reviewStatusFilter,
    criticalProcessorOnly,
    issuerQuery,
    systemFilter,
    missingEvidenceOnly,
    insufficientOrRejectedOnly,
    searchQuery,
    systems.length,
  ]);

  useEffect(() => {
    fetchAssuranceInventory();
  }, [fetchAssuranceInventory]);

  // Reset all filters
  const handleResetFilters = () => {
    setSearchQuery('');
    setStandardFilter('all');
    setArtifactKindFilter('all');
    setStatusFilter('all');
    setValidityFilter('all');
    setReviewStatusFilter('all');
    setCriticalProcessorOnly(false);
    setIssuerQuery('');
    setSystemFilter('all');
    setMissingEvidenceOnly(false);
    setInsufficientOrRejectedOnly(false);
    setIncludeHistoric(false);
  };

  // Handle Review Submission
  const handleReviewSubmit = async () => {
    if (!selectedCertForReview || !tenantId) return;
    setSubmittingReview(true);

    try {
      const reviewFn = httpsCallable(functions, 'reviewProcessorCertification');
      await reviewFn({
        tenantId,
        certificationId: selectedCertForReview.id,
        decision: reviewDecision,
        reviewNotes: reviewNotesInput.trim() || undefined,
        rejectionReason: reviewDecision === 'reject' ? rejectionReasonInput.trim() : undefined,
        insufficientRationale: reviewDecision === 'mark_insufficient' ? insufficientRationaleInput.trim() : undefined,
      });

      showMsg(`Certification review recorded: ${reviewDecision.toUpperCase()}`);
      setShowReviewModal(false);
      setSelectedCertForReview(null);
      setReviewNotesInput('');
      setRejectionReasonInput('');
      setInsufficientRationaleInput('');
      fetchAssuranceInventory();
    } catch (err: any) {
      console.error('Failed to submit review:', err);
      showMsg(`Error submitting review: ${err.message || 'Unknown error'}`);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Has Active Filters Check
  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    standardFilter !== 'all' ||
    artifactKindFilter !== 'all' ||
    statusFilter !== 'all' ||
    validityFilter !== 'all' ||
    reviewStatusFilter !== 'all' ||
    criticalProcessorOnly ||
    Boolean(issuerQuery.trim()) ||
    systemFilter !== 'all' ||
    missingEvidenceOnly ||
    insufficientOrRejectedOnly ||
    includeHistoric;

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 0' }}>
      {/* Header Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h2 style={{ fontSize: '20px', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🛡️</span> Processor Assurance & Certification Inventory
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Multi-dimensional compliance registry of all external data processor certifications, SOC reports, and independent audits.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          <button
            onClick={() => fetchAssuranceInventory()}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Refresh
          </button>

          {/* Export Report Action Selector */}
          <select
            onChange={(e) => {
              if (e.target.value) {
                handleTriggerExport(e.target.value);
                e.target.value = '';
              }
            }}
            defaultValue=""
            disabled={Boolean(exportingReport)}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              color: 'var(--text-primary)',
              cursor: 'pointer',
            }}
          >
            <option value="" disabled>
              {exportingReport ? `⏳ Generating ${exportingReport}...` : '📦 Export Compliance Report ▾'}
            </option>
            <option value="processor_assurance_register">🛡️ 1. Processor Assurance Register</option>
            <option value="processor_expiring_certifications_report">⏳ 2. Expiring Certifications Report</option>
            <option value="processor_expired_insufficient_assurance_report">⚠️ 3. Expired / Insufficient Assurance</option>
            <option value="processor_by_certification_type_matrix">📊 4. Processor-by-Certification Matrix</option>
            <option value="processor_assurance_coverage_by_systems">💻 5. Assurance Coverage by Systems</option>
            <option value="critical_processors_missing_assurance">🚨 6. Critical Processors Missing Assurance</option>
          </select>

          <button
            onClick={() => {
              setSelectedCertForForm(null);
              setSelectedProfileIdForForm('');
              setCertFormMode('create');
              setShowCertFormModal(true);
            }}
            style={{
              padding: '8px 16px',
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            ➕ Record Assurance Artifact
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      {summary && (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
            gap: '12px',
            marginBottom: '20px',
          }}
        >
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '14px' }}>
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TOTAL ASSURANCE</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '4px' }}>
              {summary.totalAssuranceRecords}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid var(--status-success)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setValidityFilter(validityFilter === 'valid_now' ? 'all' : 'valid_now')}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>VALID NOW</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px' }}>
              {summary.activeValidCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid var(--status-warning)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setValidityFilter(validityFilter === 'expiring_soon' ? 'all' : 'expiring_soon')}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>EXPIRING SOON (&le;60d)</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-warning)', marginTop: '4px' }}>
              {summary.expiringSoonCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid var(--status-danger)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setValidityFilter(validityFilter === 'expired' ? 'all' : 'expired')}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>EXPIRED / LAPSED</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--status-danger)', marginTop: '4px' }}>
              {summary.expiredCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setCriticalProcessorOnly(!criticalProcessorOnly)}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>CRITICAL PROCESSORS</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
              {summary.criticalProcessorsCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid var(--status-danger)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setMissingEvidenceOnly(!missingEvidenceOnly)}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>MISSING EVIDENCE</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: summary.missingEvidenceCount > 0 ? 'var(--status-danger)' : 'var(--text-primary)', marginTop: '4px' }}>
              {summary.missingEvidenceCount}
            </div>
          </div>

          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: '4px solid var(--status-danger)',
              borderRadius: '8px',
              padding: '14px',
              cursor: 'pointer',
            }}
            onClick={() => setInsufficientOrRejectedOnly(!insufficientOrRejectedOnly)}
          >
            <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>INSUFFICIENT / REJECTED</div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: summary.insufficientOrRejectedCount > 0 ? 'var(--status-danger)' : 'var(--text-primary)', marginTop: '4px' }}>
              {summary.insufficientOrRejectedCount}
            </div>
          </div>
        </div>
      )}

      {/* Filter Control Box */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '18px',
          marginBottom: '20px',
        }}
      >
        {/* Search & Top Filters */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              SEARCH INVENTORY
            </label>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Ref #, Issuer, Processor, Vendor..."
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              ASSURANCE STANDARD
            </label>
            <select
              value={standardFilter}
              onChange={(e) => setStandardFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              {STANDARD_FAMILY_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              ARTIFACT KIND
            </label>
            <select
              value={artifactKindFilter}
              onChange={(e) => setArtifactKindFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              {ARTIFACT_KIND_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              VALIDITY WINDOW
            </label>
            <select
              value={validityFilter}
              onChange={(e) => setValidityFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Validity Windows</option>
              <option value="valid_now">Valid Now</option>
              <option value="expiring_soon">Expiring Soon (&le;60d)</option>
              <option value="expired">Expired / Lapsed</option>
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              REVIEW STATUS
            </label>
            <select
              value={reviewStatusFilter}
              onChange={(e) => setReviewStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Review Statuses</option>
              <option value="pending">Pending Review</option>
              <option value="in_review">In Review</option>
              <option value="accepted">Accepted / Approved</option>
              <option value="rejected">Rejected</option>
              <option value="insufficient">Marked Insufficient</option>
              <option value="superseded">Superseded</option>
            </select>
          </div>
        </div>

        {/* Secondary Row: Issuer, Linked Systems, Toggles */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '12px', marginBottom: '12px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              ISSUER / AUDITOR
            </label>
            <input
              type="text"
              value={issuerQuery}
              onChange={(e) => setIssuerQuery(e.target.value)}
              placeholder="e.g. EY, PwC, TÜV, BSI..."
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            />
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              LINKED SYSTEM / ASSET
            </label>
            <select
              value={systemFilter}
              onChange={(e) => setSystemFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Linked Systems & Services</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.assetType})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', marginBottom: '4px' }}>
              STATUS RECORD
            </label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              style={{
                width: '100%',
                padding: '7px 10px',
                fontSize: '12px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
              }}
            >
              <option value="all">All Record Statuses</option>
              <option value="active_valid">Active Valid</option>
              <option value="expiring_soon">Expiring Soon</option>
              <option value="expired">Expired</option>
              <option value="revoked">Revoked</option>
              <option value="suspended">Suspended</option>
              <option value="superseded">Superseded</option>
            </select>
          </div>
        </div>

        {/* Checkbox Toggles & Reset Toolbar */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            paddingTop: '10px',
            borderTop: '1px solid var(--border-color)',
          }}
        >
          <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: criticalProcessorOnly ? 700 : 500 }}>
              <input
                type="checkbox"
                checked={criticalProcessorOnly}
                onChange={(e) => setCriticalProcessorOnly(e.target.checked)}
              />
              <span>⚠️ Critical Processors Only</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: missingEvidenceOnly ? 700 : 500 }}>
              <input
                type="checkbox"
                checked={missingEvidenceOnly}
                onChange={(e) => setMissingEvidenceOnly(e.target.checked)}
              />
              <span>📎 Missing Evidence Only</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: insufficientOrRejectedOnly ? 700 : 500 }}>
              <input
                type="checkbox"
                checked={insufficientOrRejectedOnly}
                onChange={(e) => setInsufficientOrRejectedOnly(e.target.checked)}
              />
              <span>🚫 Insufficient / Rejected Only</span>
            </label>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontWeight: includeHistoric ? 700 : 500 }}>
              <input
                type="checkbox"
                checked={includeHistoric}
                onChange={(e) => setIncludeHistoric(e.target.checked)}
              />
              <span>📜 Include Superseded Historic Records</span>
            </label>
          </div>

          {hasActiveFilters && (
            <button
              onClick={handleResetFilters}
              style={{
                padding: '5px 12px',
                fontSize: '12px',
                backgroundColor: 'transparent',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-secondary)',
                cursor: 'pointer',
              }}
            >
              ✕ Reset All Filters
            </button>
          )}
        </div>
      </div>

      {/* Error state */}
      {error && (
        <div style={{ padding: '14px 18px', backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid var(--status-danger)', borderRadius: '8px', color: 'var(--status-danger)', marginBottom: '16px', fontSize: '13px' }}>
          <strong>Error loading assurance inventory: </strong> {error}
        </div>
      )}

      {/* Results Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <div>
          Showing <strong>{items.length}</strong> matching assurance records
          {hasActiveFilters && ' (filtered)'}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '14px' }}>
          <div style={{ fontSize: '24px', marginBottom: '8px' }}>🔄</div>
          Querying processor assurance records and correlating multi-tenant evidence...
        </div>
      )}

      {/* Empty State */}
      {!loading && items.length === 0 && (
        <div style={{ padding: '48px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '10px' }}>🛡️</div>
          <div style={{ fontSize: '16px', fontWeight: 600 }}>No processor assurance records found.</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '6px', maxWidth: '500px', margin: '6px auto 16px' }}>
            {hasActiveFilters
              ? 'No assurance records match your selected filter criteria. Try clearing some filters to expand your search.'
              : 'Start by recording ISO certifications, SOC 2 reports, or third-party audits for your external data processors.'}
          </div>
          {hasActiveFilters ? (
            <button
              onClick={handleResetFilters}
              style={{
                padding: '8px 16px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Reset Filters
            </button>
          ) : (
            <button
              onClick={() => {
                setSelectedCertForForm(null);
                setCertFormMode('create');
                setShowCertFormModal(true);
              }}
              style={{
                padding: '8px 18px',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              ➕ Record First Assurance Artifact
            </button>
          )}
        </div>
      )}

      {/* Inventory List */}
      {!loading && items.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {items.map((item) => {
            const { certification: cert, processorProfile: profile, vendor } = item;
            const taxonomy = getAssuranceTaxonomy(cert.standardFamily);
            const isSuperseded = item.validityStatus === 'superseded';
            const isExpired = item.isExpired;
            const isExpSoon = item.isExpiringSoon;

            return (
              <div
                key={cert.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: isSuperseded
                    ? '1px solid var(--border-color)'
                    : item.isInsufficientOrRejected || isExpired
                    ? '1px solid rgba(239, 68, 68, 0.4)'
                    : isExpSoon
                    ? '1px solid rgba(245, 158, 11, 0.4)'
                    : '1px solid var(--border-color)',
                  borderLeft: isSuperseded
                    ? '4px solid var(--text-muted)'
                    : item.isInsufficientOrRejected || isExpired
                    ? '4px solid var(--status-danger)'
                    : isExpSoon
                    ? '4px solid var(--status-warning)'
                    : '4px solid var(--status-success)',
                  borderRadius: '8px',
                  padding: '18px',
                  opacity: isSuperseded ? 0.75 : 1,
                }}
              >
                {/* Header Row */}
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'flex-start',
                    flexWrap: 'wrap',
                    gap: '10px',
                    marginBottom: '12px',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700, color: 'var(--text-primary)' }}>
                        {taxonomy.displayName}
                      </span>

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          color: 'var(--accent-blue)',
                        }}
                      >
                        {getAssuranceArtifactKindLabel(cert.artifactKind)}
                      </span>

                      {isSuperseded && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-muted)',
                          }}
                        >
                          SUPERSEDED (v{cert.versionNumber || 1})
                        </span>
                      )}

                      {!isSuperseded && (
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            backgroundColor: isExpired
                              ? 'rgba(239, 68, 68, 0.15)'
                              : isExpSoon
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                            color: isExpired
                              ? 'var(--status-danger)'
                              : isExpSoon
                              ? 'var(--status-warning)'
                              : 'var(--status-success)',
                          }}
                        >
                          {isExpired ? 'EXPIRED' : isExpSoon ? 'EXPIRING SOON' : 'ACTIVE VALID'}
                        </span>
                      )}

                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor:
                            cert.reviewStatus === 'accepted'
                              ? 'rgba(16, 185, 129, 0.15)'
                              : cert.reviewStatus === 'rejected' || cert.isInsufficient
                              ? 'rgba(239, 68, 68, 0.15)'
                              : cert.reviewStatus === 'in_review'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'var(--bg-primary)',
                          color:
                            cert.reviewStatus === 'accepted'
                              ? 'var(--status-success)'
                              : cert.reviewStatus === 'rejected' || cert.isInsufficient
                              ? 'var(--status-danger)'
                              : cert.reviewStatus === 'in_review'
                              ? 'var(--status-warning)'
                              : 'var(--text-secondary)',
                        }}
                      >
                        {cert.isInsufficient ? 'INSUFFICIENT' : cert.reviewStatus.replace(/_/g, ' ').toUpperCase()}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Ref #: <strong>{cert.certificateOrReportNumber}</strong> • Issuer/Auditor:{' '}
                      <strong>{cert.issuingBodyOrAuditor}</strong>
                      {cert.leadAuditorName && ` • Auditor: ${cert.leadAuditorName}`}
                    </div>
                  </div>

                  {/* Actions Toolbar */}
                  <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>
                    {onSelectProcessorForHub && (
                      <button
                        onClick={() => onSelectProcessorForHub(profile.id)}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          border: '1px solid var(--accent-blue)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          fontWeight: 600,
                          color: 'var(--accent-blue)',
                          cursor: 'pointer',
                        }}
                      >
                        🏢 View in Hub
                      </button>
                    )}

                    {!isSuperseded && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedCertForForm(cert);
                            setSelectedProfileIdForForm(profile.id);
                            setCertFormMode('edit');
                            setShowCertFormModal(true);
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--text-primary)',
                            cursor: 'pointer',
                          }}
                        >
                          ✏️ Maintain
                        </button>

                        <button
                          onClick={() => {
                            setSelectedCertForForm(cert);
                            setSelectedProfileIdForForm(profile.id);
                            setCertFormMode('replace');
                            setShowCertFormModal(true);
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--accent-blue)',
                            cursor: 'pointer',
                          }}
                        >
                          🔄 Replace
                        </button>

                        <button
                          onClick={() => {
                            setSelectedCertForReview(cert);
                            setReviewDecision('accept');
                            setReviewNotesInput(cert.reviewNotes || '');
                            setRejectionReasonInput(cert.rejectionReason || '');
                            setInsufficientRationaleInput(cert.insufficientRationale || '');
                            setShowReviewModal(true);
                          }}
                          style={{
                            padding: '6px 10px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            borderRadius: '6px',
                            fontSize: '12px',
                            fontWeight: 600,
                            color: 'var(--status-success)',
                            cursor: 'pointer',
                          }}
                        >
                          ✍️ Review
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Details Grid */}
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                    gap: '12px',
                    backgroundColor: 'var(--bg-primary)',
                    padding: '12px',
                    borderRadius: '6px',
                    fontSize: '12px',
                    marginBottom: '10px',
                  }}
                >
                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Assigned Processor & Vendor:</div>
                    <div style={{ fontWeight: 700, marginTop: '2px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>{profile.name}</span>
                      {item.isCriticalProcessor && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '1px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(239, 68, 68, 0.15)',
                            color: 'var(--status-danger)',
                            fontWeight: 700,
                          }}
                        >
                          CRITICAL
                        </span>
                      )}
                    </div>
                    {vendor && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        Vendor: <strong>{vendor.name}</strong> {vendor.riskTier && `(${vendor.riskTier})`}
                      </div>
                    )}
                  </div>

                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Validity Window:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      {cert.validFrom.slice(0, 10)} to {cert.validUntil.slice(0, 10)}
                    </div>
                    <div
                      style={{
                        fontSize: '11px',
                        color: isExpired
                          ? 'var(--status-danger)'
                          : isExpSoon
                          ? 'var(--status-warning)'
                          : 'var(--text-secondary)',
                      }}
                    >
                      {isExpired ? 'Lapsed / Expired' : `${item.daysUntilExpiry} days remaining`}
                    </div>
                  </div>

                  {cert.reportPeriodStart && (
                    <div>
                      <div style={{ color: 'var(--text-muted)' }}>Audit Test Period:</div>
                      <div style={{ fontWeight: 600, marginTop: '2px' }}>
                        {cert.reportPeriodStart.slice(0, 10)} to{' '}
                        {cert.reportPeriodEnd ? cert.reportPeriodEnd.slice(0, 10) : 'Current'}
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>Period-of-time audit test</div>
                    </div>
                  )}

                  <div>
                    <div style={{ color: 'var(--text-muted)' }}>Linked Evidence Documents:</div>
                    <div style={{ fontWeight: 600, marginTop: '2px' }}>
                      {item.hasAttachedEvidence ? (
                        <span style={{ color: 'var(--status-success)' }}>
                          ✅ {item.attachedEvidenceCount} document(s) linked
                        </span>
                      ) : (
                        <span style={{ color: 'var(--status-danger)' }}>⚠️ 0 Evidence Attached</span>
                      )}
                    </div>
                    {item.attachedEvidenceSummaries.length > 0 && (
                      <div style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                        {item.attachedEvidenceSummaries.map((e) => e.title).join(', ')}
                      </div>
                    )}
                  </div>
                </div>

                {/* Scope & Covered Services */}
                <div style={{ fontSize: '12px', marginBottom: '8px' }}>
                  <span style={{ color: 'var(--text-muted)' }}>Assurance Scope: </span>
                  <strong>{cert.assuranceScopeSummary}</strong>
                  {cert.legalEntityOrRegionalScope && (
                    <span style={{ color: 'var(--text-secondary)' }}> • Regional: {cert.legalEntityOrRegionalScope}</span>
                  )}
                </div>

                {/* Systems Covered */}
                {cert.systemsOrServicesCovered && cert.systemsOrServicesCovered.length > 0 && (
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', alignItems: 'center', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Covered Systems/Services:</span>
                    {cert.systemsOrServicesCovered.map((sys) => (
                      <span
                        key={sys}
                        style={{
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--text-secondary)',
                        }}
                      >
                        {sys}
                      </span>
                    ))}
                  </div>
                )}

                {/* Assurance Gaps / Deficiencies Warnings */}
                {item.gaps.length > 0 && !isSuperseded && (
                  <div
                    style={{
                      marginTop: '10px',
                      padding: '10px',
                      borderRadius: '6px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.3)',
                    }}
                  >
                    <div style={{ fontSize: '11px', fontWeight: 700, color: 'var(--status-danger)', marginBottom: '4px' }}>
                      ⚠️ ASSURANCE FINDINGS / GAPS IDENTIFIED:
                    </div>
                    <ul style={{ margin: 0, paddingLeft: '18px', fontSize: '11px', color: 'var(--text-primary)' }}>
                      {item.gaps.map((g) => (
                        <li key={g.code} style={{ marginBottom: '2px' }}>
                          <strong>[{g.code}]</strong> {g.description} —{' '}
                          <span style={{ color: 'var(--text-secondary)' }}>{g.suggestedAction}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Form Modal for Create / Maintain / Replace */}
      {showCertFormModal && (
        <ProcessorCertificationFormModal
          tenantId={tenantId}
          processorProfileId={selectedProfileIdForForm || items[0]?.processorProfile.id || ''}
          existingCertification={selectedCertForForm}
          mode={certFormMode}
          evidenceList={evidenceList}
          availableSystems={systems.map((s) => ({ asset: s, relationships: [] }))}
          onClose={() => {
            setShowCertFormModal(false);
            setSelectedCertForForm(null);
            setSelectedProfileIdForForm('');
          }}
          onSaved={() => {
            fetchAssuranceInventory();
          }}
          onNotice={showMsg}
        />
      )}

      {/* Review Modal */}
      {showReviewModal && selectedCertForReview && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.65)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderRadius: '10px',
              maxWidth: '560px',
              width: '100%',
              padding: '24px',
              boxShadow: '0 20px 25px -5px rgba(0, 0, 0, 0.3)',
            }}
          >
            <h3 style={{ fontSize: '18px', fontWeight: 700, margin: 0, marginBottom: '6px' }}>
              ✍️ Record Assurance Review
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '0 0 16px 0' }}>
              {getAssuranceTaxonomy(selectedCertForReview.standardFamily).displayName} •{' '}
              {selectedCertForReview.certificateOrReportNumber}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', fontSize: '13px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '6px' }}>
                  Review Decision: *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '8px' }}>
                  {[
                    { id: 'accept', label: '✅ Accept / Compliant', color: 'var(--status-success)' },
                    { id: 'mark_insufficient', label: '⚠️ Mark Insufficient', color: 'var(--status-warning)' },
                    { id: 'reject', label: '❌ Reject Report', color: 'var(--status-danger)' },
                    { id: 'start_review', label: '🔍 Under In-Depth Review', color: 'var(--accent-blue)' },
                  ].map((opt) => (
                    <button
                      key={opt.id}
                      onClick={() => setReviewDecision(opt.id as any)}
                      style={{
                        padding: '10px',
                        borderRadius: '6px',
                        border: reviewDecision === opt.id ? `2px solid ${opt.color}` : '1px solid var(--border-color)',
                        backgroundColor: reviewDecision === opt.id ? 'var(--bg-primary)' : 'transparent',
                        fontWeight: reviewDecision === opt.id ? 700 : 500,
                        fontSize: '12px',
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {reviewDecision === 'reject' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--status-danger)' }}>
                    Mandatory Rejection Reason: *
                  </label>
                  <textarea
                    value={rejectionReasonInput}
                    onChange={(e) => setRejectionReasonInput(e.target.value)}
                    placeholder="State reason for rejecting assurance artifact (e.g., unqualified opinion, out-of-scope services)..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--status-danger)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              {reviewDecision === 'mark_insufficient' && (
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--status-warning)' }}>
                    Mandatory Insufficiency Rationale: *
                  </label>
                  <textarea
                    value={insufficientRationaleInput}
                    onChange={(e) => setInsufficientRationaleInput(e.target.value)}
                    placeholder="Specify why assurance is insufficient (e.g., missing carve-out subservice controls, audit period lapsed)..."
                    rows={3}
                    style={{
                      width: '100%',
                      padding: '8px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--status-warning)',
                      borderRadius: '6px',
                      fontSize: '13px',
                      color: 'var(--text-primary)',
                    }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Review Notes & Observations (Optional):
                </label>
                <textarea
                  value={reviewNotesInput}
                  onChange={(e) => setReviewNotesInput(e.target.value)}
                  placeholder="Record internal evaluation notes, CUECs compliance status, or complementary controls verified..."
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '12px' }}>
                <button
                  onClick={() => setShowReviewModal(false)}
                  style={{
                    padding: '8px 14px',
                    backgroundColor: 'var(--bg-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    color: 'var(--text-primary)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>

                <button
                  onClick={handleReviewSubmit}
                  disabled={
                    submittingReview ||
                    (reviewDecision === 'mark_insufficient' && !insufficientRationaleInput.trim()) ||
                    (reviewDecision === 'reject' && !rejectionReasonInput.trim())
                  }
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'var(--accent-blue)',
                    border: 'none',
                    borderRadius: '6px',
                    color: '#fff',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {submittingReview ? 'Recording...' : 'Submit Review Decision'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

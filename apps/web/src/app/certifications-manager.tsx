'use client';

import React, { useState, useMemo } from 'react';
import {
  Certification,
  CertificationType,
  CertificationStatus,
  ContinuousComplianceStatus,
  CERTIFICATION_TYPE_METADATA,
  evaluateCertificationCompleteness,
  evaluateCertificationRiskFlags,
  Evidence,
  Control,
  SystemAsset,
  Vendor,
} from '@eurogovernance/shared-types';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  clearRetryableTenantCommand,
  retryableTenantCommand,
  RetryableTenantCommandReference,
} from '../lib/commands';
import { UIPageHeader } from './components/ui-page-header';
import { UIStatCard } from './components/ui-stat-card';
import { UIBadge } from './components/ui-badge';

const CERTIFICATION_COMMAND_VERSION = 1;

type CertificationAssuranceStatus =
  | CertificationStatus
  | 'legacy_unverified'
  | 'invalid_recorded_status';

interface CertificationProjection extends Certification {
  recordedStatus?: CertificationStatus | 'invalid_recorded_status';
  assuranceStatus?: CertificationAssuranceStatus;
  currentArtifactVerified?: boolean;
}

interface CertificationsManagerProps {
  tenantId: string;
  userRole: string;
  userId: string;
  certifications: CertificationProjection[];
  evidenceList: Evidence[];
  controlsList: Control[];
  systemsList?: SystemAsset[];
  vendorsList?: Vendor[];
  onChanged: () => void;
}

export function CertificationsManager({
  tenantId,
  userRole,
  certifications,
  evidenceList,
  controlsList,
  systemsList = [],
  vendorsList = [],
  onChanged,
}: CertificationsManagerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('ALL');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('ALL');
  const [selectedCert, setSelectedCert] = useState<CertificationProjection | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [statusRationale, setStatusRationale] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [exportNotice, setExportNotice] = useState<string | null>(null);
  const [pendingEditorCommand, setPendingEditorCommand] =
    useState<RetryableTenantCommandReference | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<Certification>>({
    certificationName: '',
    certificationType: 'iso_27001',
    issuingBody: '',
    certificateNumber: '',
    scopeDescription: '',
    applicableStandardVersion: 'ISO/IEC 27001:2022',
    issueDate: new Date().toISOString().split('T')[0],
    expiryDate: new Date(Date.now() + 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    status: 'active_valid',
    surveillanceAuditDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
    leadAuditorName: '',
    leadAuditorContact: '',
    frameworkIds: [],
    linkedControlIds: [],
    linkedEvidenceIds: [],
    linkedVendorIds: [],
    linkedProcessorProfileIds: [],
    linkedSystemAssetIds: [],
    continuousComplianceStatus: 'not_assessed',
    unresolvedFindingsCount: 0,
    notes: '',
  });

  const canMutate = ['tenant_admin', 'compliance_manager', 'security_manager', 'privacy_manager', 'ai_governance_manager'].includes(userRole);
  const canArchive = ['tenant_admin', 'compliance_manager'].includes(userRole);

  // Evaluate Risk Summary across all certifications
  const riskSummary = useMemo(() => {
    const base = evaluateCertificationRiskFlags(certifications, evidenceList);
    const invalidCurrentArtifactCount = certifications.filter(
      (certification) => certification.currentArtifactVerified !== true
    ).length;
    return {
      ...base,
      invalidCurrentArtifactCount,
      overallAssuranceRiskLevel:
        invalidCurrentArtifactCount > 0 &&
        (base.overallAssuranceRiskLevel === 'low' ||
          base.overallAssuranceRiskLevel === 'medium')
          ? 'high'
          : base.overallAssuranceRiskLevel,
    };
  }, [certifications, evidenceList]);

  // Filtered Certifications
  const filteredCertifications = useMemo(() => {
    return certifications.filter((c) => {
      if (selectedTypeFilter !== 'ALL' && c.certificationType !== selectedTypeFilter) return false;
      if (selectedStatusFilter !== 'ALL' && c.status !== selectedStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = c.certificationName.toLowerCase().includes(q);
        const matchNumber = c.certificateNumber.toLowerCase().includes(q);
        const matchIssuer = c.issuingBody.toLowerCase().includes(q);
        if (!matchName && !matchNumber && !matchIssuer) return false;
      }
      return true;
    });
  }, [certifications, selectedTypeFilter, selectedStatusFilter, searchQuery]);

  const handleOpenCreate = () => {
    setSelectedCert(null);
    setStatusRationale('');
    setFormData({
      certificationName: '',
      certificationType: 'iso_27001',
      issuingBody: '',
      certificateNumber: '',
      scopeDescription: '',
      applicableStandardVersion: 'ISO/IEC 27001:2022',
      issueDate: new Date().toISOString().split('T')[0],
      expiryDate: new Date(Date.now() + 365 * 3 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      status: 'active_valid',
      surveillanceAuditDueDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      leadAuditorName: '',
      leadAuditorContact: '',
      frameworkIds: [],
      linkedControlIds: [],
      linkedEvidenceIds: [],
      linkedVendorIds: [],
      linkedProcessorProfileIds: [],
      linkedSystemAssetIds: [],
      continuousComplianceStatus: 'not_assessed',
      unresolvedFindingsCount: 0,
      notes: '',
    });
    setIsCreating(true);
  };

  const handleOpenEdit = (cert: Certification) => {
    setStatusRationale('');
    setSelectedCert(cert);
    setFormData({
      ...cert,
      continuousComplianceStatus:
        cert.continuousComplianceStatus === 'compliant'
          ? 'not_assessed'
          : cert.continuousComplianceStatus,
      issueDate: cert.issueDate.split('T')[0],
      expiryDate: cert.expiryDate.split('T')[0],
      surveillanceAuditDueDate: cert.surveillanceAuditDueDate ? cert.surveillanceAuditDueDate.split('T')[0] : '',
    });
    setIsEditing(true);
  };

  const handleSaveCertification = async (e: React.FormEvent) => {
    e.preventDefault();
    if (
      !formData.certificationName ||
      !formData.certificateNumber ||
      !formData.issuingBody ||
      !formData.issueDate ||
      !formData.expiryDate ||
      !formData.applicableStandardVersion
    ) {
      alert('Please fill in all mandatory fields.');
      return;
    }
    const statusChanges = Boolean(
      selectedCert && formData.status && selectedCert.status !== formData.status
    );
    if (
      (statusChanges || ['under_audit', 'suspended', 'revoked'].includes(formData.status || '')) &&
      statusRationale.trim().length < 10
    ) {
      alert('Provide a status rationale of at least 10 characters.');
      return;
    }

    setIsSubmitting(true);
    try {
      const certificationPayload = {
        certificationName: formData.certificationName.trim(),
        certificationType: (formData.certificationType as CertificationType) || 'iso_27001',
        issuingBody: formData.issuingBody.trim(),
        certificateNumber: formData.certificateNumber.trim(),
        scopeDescription: formData.scopeDescription?.trim() || '',
        scopeDetails: formData.scopeDetails || {
          sites: [],
          products: [],
          cloudEnvironments: [],
          organizationalUnits: [],
        },
        applicableStandardVersion: formData.applicableStandardVersion?.trim() || '2022',
        issueDate: new Date(formData.issueDate!).toISOString(),
        expiryDate: new Date(formData.expiryDate!).toISOString(),
        status: (formData.status as CertificationStatus) || 'active_valid',
        statusRationale: statusRationale.trim() || null,
        surveillanceAuditDueDate: formData.surveillanceAuditDueDate
          ? new Date(formData.surveillanceAuditDueDate).toISOString()
          : null,
        leadAuditorName: formData.leadAuditorName?.trim() || null,
        leadAuditorContact: formData.leadAuditorContact?.trim() || null,
        frameworkIds: formData.frameworkIds || [],
        linkedControlIds: formData.linkedControlIds || [],
        linkedEvidenceIds: formData.linkedEvidenceIds || [],
        linkedVendorIds: formData.linkedVendorIds || [],
        linkedProcessorProfileIds: formData.linkedProcessorProfileIds || [],
        linkedSystemAssetIds: formData.linkedSystemAssetIds || [],
        continuousComplianceStatus:
          (formData.continuousComplianceStatus as ContinuousComplianceStatus) || 'not_assessed',
        unresolvedFindingsCount: Number(formData.unresolvedFindingsCount || 0),
        notes: formData.notes?.trim() || null,
      };

      if (isCreating) {
        const createCertification = httpsCallable(functions, 'createTenantCertification');
        const action = 'certification.create';
        const command = await retryableTenantCommand({
          commandVersion: CERTIFICATION_COMMAND_VERSION,
          tenantId,
          action,
          payload: certificationPayload,
          expectedRevision: null,
        });
        const commandReference = {
          commandVersion: CERTIFICATION_COMMAND_VERSION,
          tenantId,
          action,
          commandId: command.commandId,
        };
        if (
          pendingEditorCommand &&
          pendingEditorCommand.commandId !== commandReference.commandId
        ) {
          await clearRetryableTenantCommand(pendingEditorCommand);
        }
        setPendingEditorCommand(commandReference);
        await createCertification(command);
        await clearRetryableTenantCommand(commandReference);
        setPendingEditorCommand(null);
        setIsCreating(false);
        onChanged();
      } else if (isEditing && selectedCert) {
        const updateCertification = httpsCallable(functions, 'updateTenantCertification');
        const action = 'certification.update';
        const command = await retryableTenantCommand({
          commandVersion: CERTIFICATION_COMMAND_VERSION,
          tenantId,
          action,
          logicalKey: selectedCert.id,
          payload: { certificationId: selectedCert.id, ...certificationPayload },
          expectedRevision: selectedCert.revision ?? 0,
        });
        const commandReference = {
          commandVersion: CERTIFICATION_COMMAND_VERSION,
          tenantId,
          action,
          commandId: command.commandId,
        };
        if (
          pendingEditorCommand &&
          pendingEditorCommand.commandId !== commandReference.commandId
        ) {
          await clearRetryableTenantCommand(pendingEditorCommand);
        }
        setPendingEditorCommand(commandReference);
        await updateCertification(command);
        await clearRetryableTenantCommand(commandReference);
        setPendingEditorCommand(null);
        setIsEditing(false);
        setSelectedCert(null);
        onChanged();
      }
    } catch (err: any) {
      alert(`Error saving certification: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteCertification = async (certification: Certification) => {
    if (!confirm('Archive this certification record? Its history will remain available for audit.')) return;
    const archiveReason = prompt('Enter the reason for archiving this certification:')?.trim() || '';
    if (archiveReason.length < 10) {
      alert('An archive reason of at least 10 characters is required.');
      return;
    }
    try {
      const archiveCertification = httpsCallable(functions, 'deleteTenantCertification');
      const action = 'certification.archive';
      const command = await retryableTenantCommand({
        commandVersion: CERTIFICATION_COMMAND_VERSION,
        tenantId,
        action,
        logicalKey: certification.id,
        payload: {
          certificationId: certification.id,
          archiveReason,
        },
        expectedRevision: certification.revision ?? 0,
      });
      await archiveCertification(command);
      await clearRetryableTenantCommand({
        commandVersion: CERTIFICATION_COMMAND_VERSION,
        tenantId,
        action,
        commandId: command.commandId,
      });
      onChanged();
      if (selectedCert?.id === certification.id) setSelectedCert(null);
    } catch (err: any) {
      alert(`Error deleting certification: ${err.message}`);
    }
  };

  const handleTriggerExport = async () => {
    setExportNotice('Compiling Master Certification Register export...');
    try {
      const exportFn = httpsCallable(functions, 'generateTenantEvidenceExport');
      const res: any = await exportFn({
        tenantId,
        exportType: 'certification_register_report',
      });
      setExportNotice(
        `JSON draft queued (Job ID: ${res.data?.jobId || 'submitted'}). Browser download remains unavailable until authorized download sessions are implemented.`
      );
      setTimeout(() => setExportNotice(null), 6000);
    } catch (err: any) {
      setExportNotice(`Export failed: ${err.message}`);
      setTimeout(() => setExportNotice(null), 6000);
    }
  };

  const nowMillis = Date.now();
  const dateCurrentCount = certifications.filter((certification) => {
    const issueMillis = Date.parse(certification.issueDate);
    const expiryMillis = Date.parse(certification.expiryDate);
    return (
      Number.isFinite(issueMillis) &&
      Number.isFinite(expiryMillis) &&
      issueMillis <= nowMillis &&
      expiryMillis > nowMillis
    );
  }).length;
  const verifiedAssuranceCount = certifications.filter((certification) => {
    const completeness = evaluateCertificationCompleteness(
      certification,
      evidenceList
    );
    return (
      certification.currentArtifactVerified === true &&
      certification.assuranceStatus !== 'legacy_unverified' &&
      certification.assuranceStatus !== 'invalid_recorded_status' &&
      certification.assuranceStatus !== 'archived' &&
      certification.assuranceStatus !== 'expired' &&
      certification.assuranceStatus !== 'suspended' &&
      certification.assuranceStatus !== 'revoked' &&
      completeness.isComplete &&
      completeness.hasValidCertificateDocument
    );
  }).length;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', color: 'var(--text-primary)' }}>
      {/* 1. Reusable Standardized Page Header */}
      <UIPageHeader
        title="Vendor Certifications & Continuous Assurance"
        description="Track accredited certifications, SOC 2 Type II reports, surveillance audit calendars, and processor compliance standing."
        badge={
          <UIBadge
            variant={
              riskSummary.overallAssuranceRiskLevel === 'critical'
                ? 'critical'
                : riskSummary.overallAssuranceRiskLevel === 'high'
                ? 'warning'
                : 'compliant'
            }
          >
            {riskSummary.overallAssuranceRiskLevel.toUpperCase()} RISK
          </UIBadge>
        }
        primaryAction={
          canMutate
            ? {
                label: '+ Register Certification',
                icon: '📜',
                onClick: handleOpenCreate,
                variant: 'primary',
              }
            : undefined
        }
        secondaryActions={[
          {
            label: 'Export Master Register',
            icon: '📦',
            onClick: handleTriggerExport,
            variant: 'secondary',
          },
        ]}
      />

      {/* 2. Standardized KPI Stat Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '14px',
        }}
      >
        <UIStatCard
          label="Total Certifications"
          value={certifications.length}
          subtext="Recorded certificates and assurance reports"
          valueColor="var(--accent-primary)"
        />

        <UIStatCard
          label="Verified Assurance"
          value={verifiedAssuranceCount}
          subtext={`${dateCurrentCount} date-current record(s); chain and evidence required`}
          valueColor={verifiedAssuranceCount > 0 ? 'var(--status-compliant-fg)' : 'var(--status-warning-fg)'}
          progressPercentage={certifications.length > 0 ? (verifiedAssuranceCount / certifications.length) * 100 : 0}
        />

        <UIStatCard
          label="Expiring / Overdue"
          value={riskSummary.expiredCount + riskSummary.expiringSoonCount}
          subtext={`${riskSummary.expiredCount} expired · ${riskSummary.expiringSoonCount} due <60d`}
          valueColor={riskSummary.expiredCount > 0 ? 'var(--status-critical-fg)' : 'var(--status-warning-fg)'}
        />

        <UIStatCard
          label="Governance Flags"
          value={riskSummary.flags.length + riskSummary.invalidCurrentArtifactCount}
          subtext={`${riskSummary.invalidCurrentArtifactCount} record-chain exception(s)`}
          valueColor={riskSummary.flags.length + riskSummary.invalidCurrentArtifactCount > 0 ? 'var(--status-warning-fg)' : 'var(--text-muted)'}
        />
      </div>

      {/* Action Header & Notice */}
      {exportNotice && (
        <div
          style={{
            background: 'rgba(56, 189, 248, 0.15)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            padding: '0.75rem 1rem',
            borderRadius: '0.375rem',
            fontSize: '0.9rem',
          }}
        >
          {exportNotice}
        </div>
      )}

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
          <input
            type="text"
            placeholder="Search certificates, standards, or issuers..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              color: '#f8fafc',
              fontSize: '0.9rem',
              minWidth: '280px',
            }}
          />

          <select
            value={selectedTypeFilter}
            onChange={(e) => setSelectedTypeFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              color: '#f8fafc',
              fontSize: '0.9rem',
            }}
          >
            <option value="ALL">All Standard Types</option>
            {Object.entries(CERTIFICATION_TYPE_METADATA).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>

          <select
            value={selectedStatusFilter}
            onChange={(e) => setSelectedStatusFilter(e.target.value)}
            style={{
              padding: '0.5rem 0.75rem',
              background: '#0f172a',
              border: '1px solid #334155',
              borderRadius: '0.375rem',
              color: '#f8fafc',
              fontSize: '0.9rem',
            }}
          >
            <option value="ALL">All Lifecycle Statuses</option>
            <option value="active_valid">Date-Current Record</option>
            <option value="expiring_soon">Expiring Soon</option>
            <option value="expired">Expired</option>
            <option value="under_audit">Under Audit</option>
            <option value="suspended">Suspended</option>
            <option value="revoked">Revoked</option>
            <option value="archived">Archived</option>
          </select>
        </div>

        <div style={{ display: 'flex', gap: '0.75rem' }}>
          <button
            onClick={handleTriggerExport}
            style={{
              background: '#334155',
              color: '#f8fafc',
              border: '1px solid #475569',
              padding: '0.5rem 1rem',
              borderRadius: '0.375rem',
              fontSize: '0.9rem',
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            📥 Export Register
          </button>

          {canMutate && (
            <button
              onClick={handleOpenCreate}
              style={{
                background: '#2563eb',
                color: '#ffffff',
                border: 'none',
                padding: '0.5rem 1rem',
                borderRadius: '0.375rem',
                fontSize: '0.9rem',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              ➕ Register Certification
            </button>
          )}
        </div>
      </div>

      {/* Certifications Table */}
      <div style={{ background: '#1e293b', borderRadius: '0.5rem', border: '1px solid #334155', overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
          <thead>
            <tr style={{ background: '#0f172a', borderBottom: '1px solid #334155', color: '#94a3b8' }}>
              <th style={{ padding: '0.85rem 1rem' }}>Certification & Standard</th>
              <th style={{ padding: '0.85rem 1rem' }}>Certificate # / Registrar</th>
              <th style={{ padding: '0.85rem 1rem' }}>Validity & Expiry</th>
              <th style={{ padding: '0.85rem 1rem' }}>Continuous Assurance</th>
              <th style={{ padding: '0.85rem 1rem' }}>Linked Evidence</th>
              <th style={{ padding: '0.85rem 1rem', textAlign: 'right' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredCertifications.length === 0 ? (
              <tr>
                <td colSpan={6} style={{ padding: '2.5rem', textAlign: 'center', color: '#64748b' }}>
                  No structured certifications found matching the current filters.
                </td>
              </tr>
            ) : (
              filteredCertifications.map((cert) => {
                const completeness = evaluateCertificationCompleteness(cert, evidenceList);
                const isExp = completeness.isExpired;
                const isSoon = completeness.isExpiringSoon;
                const assuranceStatus = cert.assuranceStatus ?? 'legacy_unverified';
                const assuranceVerified =
                  cert.currentArtifactVerified === true &&
                  completeness.hasValidCertificateDocument;

                return (
                  <tr
                    key={cert.id}
                    style={{
                      borderBottom: '1px solid #334155',
                      background: selectedCert?.id === cert.id ? 'rgba(56, 189, 248, 0.05)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontWeight: 600, color: '#f8fafc' }}>{cert.certificationName}</div>
                      <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.25rem', alignItems: 'center' }}>
                        <span
                          style={{
                            background: 'rgba(56, 189, 248, 0.15)',
                            color: '#38bdf8',
                            padding: '0.15rem 0.4rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.75rem',
                            fontWeight: 500,
                          }}
                        >
                          {cert.applicableStandardVersion}
                        </span>
                        <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                          {CERTIFICATION_TYPE_METADATA[cert.certificationType]?.label || cert.certificationType}
                        </span>
                      </div>
                    </td>

                    <td style={{ padding: '1rem' }}>
                      <div style={{ fontFamily: 'monospace', color: '#cbd5e1' }}>{cert.certificateNumber}</div>
                      <div style={{ fontSize: '0.8rem', color: '#94a3b8', marginTop: '0.25rem' }}>
                        🏛️ {cert.issuingBody}
                      </div>
                    </td>

                    <td style={{ padding: '1rem' }}>
                      <div style={{ color: assuranceStatus === 'legacy_unverified' || assuranceStatus === 'invalid_recorded_status' ? '#f59e0b' : cert.status === 'archived' || isExp ? '#94a3b8' : isSoon ? '#f59e0b' : '#10b981', fontWeight: 600 }}>
                        {new Date(cert.expiryDate).toLocaleDateString()}
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#64748b', marginTop: '0.25rem' }}>
                        {assuranceStatus === 'legacy_unverified' || assuranceStatus === 'invalid_recorded_status'
                          ? `Recorded ${cert.recordedStatus ?? cert.status}; immutable chain unverified`
                          : cert.status === 'archived'
                          ? 'Archived record'
                          : isExp
                            ? 'Expired'
                            : isSoon
                              ? `${completeness.daysUntilExpiry}d remaining`
                              : cert.status.replace(/_/g, ' ')}
                      </div>
                    </td>

                    <td style={{ padding: '1rem' }}>
                      <span
                        style={{
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                          background:
                            cert.continuousComplianceStatus === 'major_non_conformity'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : 'rgba(245, 158, 11, 0.15)',
                          color:
                            cert.continuousComplianceStatus === 'major_non_conformity'
                              ? '#ef4444'
                              : '#f59e0b',
                        }}
                      >
                        {cert.continuousComplianceStatus === 'compliant'
                          ? 'COMPLIANT (LEGACY / UNVERIFIED)'
                          : cert.continuousComplianceStatus.replace(/_/g, ' ').toUpperCase()}
                      </span>
                      {cert.surveillanceAuditDueDate && (
                        <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '0.35rem' }}>
                          Surveillance: {new Date(cert.surveillanceAuditDueDate).toLocaleDateString()}
                        </div>
                      )}
                    </td>

                    <td style={{ padding: '1rem' }}>
                      {cert.linkedEvidenceIds.length > 0 ? (
                        <span style={{ color: assuranceVerified ? '#10b981' : '#f59e0b', fontSize: '0.85rem' }}>
                          {assuranceVerified
                            ? `${cert.linkedEvidenceIds.length} linked record(s); record chain and evidence verified`
                            : `${cert.linkedEvidenceIds.length} linked record(s); assurance unverified`}
                        </span>
                      ) : (
                        <span style={{ color: '#f87171', fontSize: '0.85rem', fontWeight: 600 }}>
                          No evidence record linked
                        </span>
                      )}
                    </td>

                    <td style={{ padding: '1rem', textAlign: 'right' }}>
                      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'flex-end' }}>
                        <button
                          onClick={() => setSelectedCert(cert)}
                          style={{
                            background: '#334155',
                            color: '#f8fafc',
                            border: 'none',
                            padding: '0.35rem 0.75rem',
                            borderRadius: '0.25rem',
                            fontSize: '0.8rem',
                            cursor: 'pointer',
                          }}
                        >
                          🔍 Inspect
                        </button>
                        {canMutate && cert.status !== 'archived' && (
                          <>
                            <button
                              onClick={() => handleOpenEdit(cert)}
                              style={{
                                background: '#2563eb',
                                color: '#ffffff',
                                border: 'none',
                                padding: '0.35rem 0.75rem',
                                borderRadius: '0.25rem',
                                fontSize: '0.8rem',
                                cursor: 'pointer',
                              }}
                            >
                              Edit
                            </button>
                            {canArchive && (
                              <button
                                onClick={() => handleDeleteCertification(cert)}
                                style={{
                                  background: 'rgba(239, 68, 68, 0.2)',
                                  color: '#ef4444',
                                  border: '1px solid #ef4444',
                                  padding: '0.35rem 0.6rem',
                                  borderRadius: '0.25rem',
                                  fontSize: '0.8rem',
                                  cursor: 'pointer',
                                }}
                              >
                                Archive
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 1: Inspection & Diagnosis Modal */}
      {selectedCert && !isEditing && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 100,
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              width: '100%',
              maxWidth: '850px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              color: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.25rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h2 style={{ fontSize: '1.4rem', fontWeight: 'bold' }}>{selectedCert.certificationName}</h2>
                <div style={{ color: '#38bdf8', fontSize: '0.9rem', marginTop: '0.25rem' }}>
                  {selectedCert.applicableStandardVersion} · Certificate #: {selectedCert.certificateNumber}
                </div>
              </div>
              <button
                onClick={() => setSelectedCert(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', fontSize: '1.5rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {/* Completeness & Gaps Warning */}
            {(() => {
              const diag = evaluateCertificationCompleteness(selectedCert, evidenceList);
              const assuranceComplete =
                diag.isComplete && selectedCert.currentArtifactVerified === true;
              return (
                <div
                  style={{
                    background: assuranceComplete ? 'rgba(34, 197, 94, 0.1)' : 'rgba(239, 68, 68, 0.1)',
                    border: `1px solid ${assuranceComplete ? '#22c55e' : '#ef4444'}`,
                    padding: '1rem',
                    borderRadius: '0.375rem',
                  }}
                >
                  <div style={{ fontWeight: 600, color: assuranceComplete ? '#4ade80' : '#f87171' }}>
                    {assuranceComplete
                      ? 'Current record chain and linked evidence object checks passed; issuer authenticity is not independently validated'
                      : `⚠️ ${diag.gaps.length + (selectedCert.currentArtifactVerified === true ? 0 : 1)} Assurance Gap(s) Identified`}
                  </div>
                  {selectedCert.currentArtifactVerified !== true && (
                    <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      <strong>CERTIFICATION_RECORD_CHAIN_UNVERIFIED</strong>: The mutable record does not match a valid current version, command receipt, and audit anchor.
                    </div>
                  )}
                  {diag.gaps.length > 0 && (
                    <ul style={{ marginTop: '0.5rem', paddingLeft: '1.25rem', fontSize: '0.85rem', color: '#cbd5e1' }}>
                      {diag.gaps.map((g, idx) => (
                        <li key={idx} style={{ marginBottom: '0.25rem' }}>
                          <strong>{g.code}</strong>: {g.description} <em>(Suggested: {g.suggestedAction})</em>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              );
            })()}

            {/* Metadata Grid */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '0.9rem' }}>
              <div>
                <strong style={{ color: '#94a3b8' }}>Issuing Body:</strong>
                <div style={{ marginTop: '0.25rem' }}>{selectedCert.issuingBody}</div>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Lead Auditor:</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  {selectedCert.leadAuditorName || 'N/A'}{' '}
                  {selectedCert.leadAuditorContact && `(${selectedCert.leadAuditorContact})`}
                </div>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Issue Date:</strong>
                <div style={{ marginTop: '0.25rem' }}>{new Date(selectedCert.issueDate).toLocaleDateString()}</div>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Expiry Date:</strong>
                <div style={{ marginTop: '0.25rem' }}>{new Date(selectedCert.expiryDate).toLocaleDateString()}</div>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Surveillance Audit Due:</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  {selectedCert.surveillanceAuditDueDate
                    ? new Date(selectedCert.surveillanceAuditDueDate).toLocaleDateString()
                    : 'None Scheduled'}
                </div>
              </div>
              <div>
                <strong style={{ color: '#94a3b8' }}>Recorded Finding Posture:</strong>
                <div style={{ marginTop: '0.25rem' }}>
                  {selectedCert.continuousComplianceStatus === 'compliant'
                    ? 'COMPLIANT (LEGACY / UNVERIFIED)'
                    : selectedCert.continuousComplianceStatus.replace(/_/g, ' ').toUpperCase()}
                </div>
              </div>
            </div>

            <div>
              <strong style={{ color: '#94a3b8', fontSize: '0.85rem' }}>Scope Description & Boundaries:</strong>
              <div
                style={{
                  background: '#0f172a',
                  padding: '0.75rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.85rem',
                  marginTop: '0.35rem',
                  lineHeight: '1.4',
                }}
              >
                {selectedCert.scopeDescription || 'No detailed scope description recorded.'}
              </div>
            </div>

            {/* Linked Controls */}
            <div>
              <strong style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                Attested Controls ({selectedCert.linkedControlIds?.length || 0}):
              </strong>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.4rem', marginTop: '0.35rem' }}>
                {selectedCert.linkedControlIds && selectedCert.linkedControlIds.length > 0 ? (
                  selectedCert.linkedControlIds.map((cid) => {
                    const c = controlsList.find((ctrl) => ctrl.id === cid);
                    return (
                      <span
                        key={cid}
                        style={{
                          background: '#334155',
                          color: '#e2e8f0',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '0.25rem',
                          fontSize: '0.75rem',
                        }}
                      >
                        {c?.code || cid} {c ? `(${c.title})` : ''}
                      </span>
                    );
                  })
                ) : (
                  <span style={{ fontSize: '0.8rem', color: '#64748b' }}>No controls linked yet.</span>
                )}
              </div>
            </div>

            {/* Linked Evidence Files */}
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                <strong style={{ color: '#94a3b8', fontSize: '0.85rem' }}>
                  Attached Evidence Artifacts ({selectedCert.linkedEvidenceIds?.length || 0}):
                </strong>
                {canMutate && (
                  <button
                    disabled
                    title="Available after server-verified evidence upload and download sessions are enabled."
                    style={{
                      background: '#334155',
                      color: '#94a3b8',
                      border: '1px solid #64748b',
                      padding: '0.2rem 0.5rem',
                      borderRadius: '0.25rem',
                      fontSize: '0.75rem',
                      cursor: 'not-allowed',
                    }}
                  >
                    Evidence linking unavailable
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
                {selectedCert.linkedEvidenceIds && selectedCert.linkedEvidenceIds.length > 0 ? (
                  selectedCert.linkedEvidenceIds.map((eid) => {
                    const ev = evidenceList.find((e) => e.id === eid);
                    return (
                      <div
                        key={eid}
                        style={{
                          background: '#0f172a',
                          padding: '0.5rem 0.75rem',
                          borderRadius: '0.375rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          fontSize: '0.85rem',
                        }}
                      >
                        <div>
                          <strong>{ev?.title || eid}</strong>{' '}
                          <span style={{ color: '#64748b', fontSize: '0.75rem' }}>
                            ({ev?.category || 'file'} · {ev?.status || 'valid'})
                          </span>
                        </div>
                        {ev?.storagePath && (
                          <span style={{ color: '#38bdf8', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {ev.storagePath}
                          </span>
                        )}
                      </div>
                    );
                  })
                ) : (
                  <div style={{ fontSize: '0.8rem', color: '#f87171' }}>
                    ⚠️ No certificate document attached. Upload formal certificate to Evidence repository and link it.
                  </div>
                )}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '0.5rem' }}>
              <button
                onClick={() => setSelectedCert(null)}
                style={{
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 2: Create / Edit Certification Form */}
      {(isCreating || isEditing) && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 110,
            padding: '1rem',
          }}
        >
          <form
            onSubmit={handleSaveCertification}
            style={{
              background: '#1e293b',
              border: '1px solid #334155',
              borderRadius: '0.5rem',
              width: '100%',
              maxWidth: '750px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '1.75rem',
              color: '#f8fafc',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
            }}
          >
            <h2 style={{ fontSize: '1.3rem', fontWeight: 'bold' }}>
              {isCreating ? 'Register New External Certification' : 'Edit Certification Record'}
            </h2>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Certification Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ISO/IEC 27001:2022 ISMS Certificate"
                  value={formData.certificationName || ''}
                  onChange={(e) => setFormData({ ...formData, certificationName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Standard / Category *</label>
                <select
                  value={formData.certificationType || 'iso_27001'}
                  onChange={(e) => {
                    const t = e.target.value as CertificationType;
                    setFormData({
                      ...formData,
                      certificationType: t,
                      applicableStandardVersion: CERTIFICATION_TYPE_METADATA[t]?.standardCode || '2022',
                    });
                  }}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                >
                  {Object.entries(CERTIFICATION_TYPE_METADATA).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Certificate Identifier / Number *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. ISMS-891240-2025"
                  value={formData.certificateNumber || ''}
                  onChange={(e) => setFormData({ ...formData, certificateNumber: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Issuing Body / Registrar *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. TÜV Rheinland, BSI Group, PwC"
                  value={formData.issuingBody || ''}
                  onChange={(e) => setFormData({ ...formData, issuingBody: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Issue Date *</label>
                <input
                  type="date"
                  required
                  value={formData.issueDate || ''}
                  onChange={(e) => setFormData({ ...formData, issueDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Expiry Date *</label>
                <input
                  type="date"
                  required
                  value={formData.expiryDate || ''}
                  onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Surveillance Audit Due</label>
                <input
                  type="date"
                  value={formData.surveillanceAuditDueDate || ''}
                  onChange={(e) => setFormData({ ...formData, surveillanceAuditDueDate: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Scope Description & Operational Boundaries</label>
              <textarea
                rows={3}
                placeholder="Detail the physical premises, SaaS products, AWS cloud accounts, and organizational departments included in the audit scope..."
                value={formData.scopeDescription || ''}
                onChange={(e) => setFormData({ ...formData, scopeDescription: e.target.value })}
                style={{
                  width: '100%',
                  padding: '0.5rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.375rem',
                  color: '#fff',
                  marginTop: '0.2rem',
                }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Lead Auditor Name</label>
                <input
                  type="text"
                  placeholder="e.g. Dr. Frank Meier"
                  value={formData.leadAuditorName || ''}
                  onChange={(e) => setFormData({ ...formData, leadAuditorName: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Lead Auditor Contact</label>
                <input
                  type="email"
                  placeholder="e.g. f.meier@tuv.de"
                  value={formData.leadAuditorContact || ''}
                  onChange={(e) => setFormData({ ...formData, leadAuditorContact: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Requested Lifecycle State
                </label>
                <select
                  value={formData.status || 'active_valid'}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value as CertificationStatus })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                >
                  <option value="active_valid">Date-Current Record</option>
                  <option value="expiring_soon">Expiring Soon</option>
                  <option value="expired">Expired</option>
                  <option value="under_audit">Under Audit</option>
                  <option value="suspended">Suspended</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>

              <div>
                <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Recorded Finding Posture (not assurance)
                </label>
                <select
                  value={formData.continuousComplianceStatus || 'not_assessed'}
                  onChange={(e) =>
                    setFormData({ ...formData, continuousComplianceStatus: e.target.value as ContinuousComplianceStatus })
                  }
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    background: '#0f172a',
                    border: '1px solid #334155',
                    borderRadius: '0.375rem',
                    color: '#fff',
                    marginTop: '0.2rem',
                  }}
                >
                  <option value="not_assessed">Not Assessed</option>
                  <option value="minor_non_conformity">Minor Non-Conformity</option>
                  <option value="major_non_conformity">Major Non-Conformity</option>
                  <option value="opportunity_for_improvement">Opportunity for Improvement</option>
                </select>
              </div>
            </div>

            <div>
              <label style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Status Rationale{' '}
                {(selectedCert && selectedCert.status !== formData.status) ||
                ['under_audit', 'suspended', 'revoked'].includes(formData.status || '')
                  ? '(required)'
                  : '(if changed)'}
              </label>
              <textarea
                value={statusRationale}
                maxLength={2000}
                onChange={(event) => setStatusRationale(event.target.value)}
                placeholder="Explain an under-audit, suspended, revoked, or other status change. Date-based active/expiring/expired states are recalculated by the server."
                style={{
                  width: '100%',
                  minHeight: '4.5rem',
                  padding: '0.5rem',
                  background: '#0f172a',
                  border: '1px solid #334155',
                  borderRadius: '0.375rem',
                  color: '#fff',
                  marginTop: '0.2rem',
                  resize: 'vertical',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1rem' }}>
              <button
                type="button"
                onClick={() => {
                  if (pendingEditorCommand) {
                    void clearRetryableTenantCommand(pendingEditorCommand);
                    setPendingEditorCommand(null);
                  }
                  setIsCreating(false);
                  setIsEditing(false);
                }}
                style={{
                  background: '#334155',
                  color: '#f8fafc',
                  border: 'none',
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={isSubmitting}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '0.375rem',
                  fontSize: '0.9rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {isSubmitting ? 'Saving...' : 'Save Certification'}
              </button>
            </div>
          </form>
        </div>
      )}

    </div>
  );
}

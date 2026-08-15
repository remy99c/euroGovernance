'use client';

import React, { useState, useMemo } from 'react';
import {
  ProcessorCertification,
  AssuranceStandardFamily,
  AssuranceArtifactKind,
  ProcessorCertificationStatus,
  ProcessorCertificationReviewStatus,
  Evidence,
  SystemAsset,
  getAssuranceTaxonomy,
  getAssuranceArtifactKindLabel,
  validateProcessorCertification,
} from '@eurogovernance/shared-types';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface ProcessorCertificationFormModalProps {
  tenantId: string;
  processorProfileId: string;
  vendorId?: string;
  existingCertification?: ProcessorCertification | null;
  mode: 'create' | 'edit' | 'replace';
  evidenceList: Evidence[];
  availableSystems?: { asset: SystemAsset }[];
  onClose: () => void;
  onSaved: (cert: ProcessorCertification) => void;
  onNotice?: (msg: string) => void;
}

const STANDARD_FAMILIES: { id: AssuranceStandardFamily; label: string }[] = [
  { id: 'iso_27001', label: 'ISO/IEC 27001:2022 (ISMS)' },
  { id: 'iso_27701', label: 'ISO/IEC 27701:2019 (PIMS / Privacy)' },
  { id: 'iso_42001', label: 'ISO/IEC 42001:2023 (AI Management System)' },
  { id: 'iso_22301', label: 'ISO 22301:2019 (Business Continuity)' },
  { id: 'soc1_type2', label: 'SOC 1 Type II (ICFR Financial Controls)' },
  { id: 'soc2_type1', label: 'SOC 2 Type I (Design of Controls)' },
  { id: 'soc2_type2', label: 'SOC 2 Type II (Operating Effectiveness)' },
  { id: 'soc3', label: 'SOC 3 (General Public Trust Services Report)' },
  { id: 'csa_star', label: 'CSA STAR Level 2 (Cloud Security Alliance)' },
  { id: 'pci_dss_aoc', label: 'PCI-DSS Attestation of Compliance (AoC/RoC)' },
  { id: 'bsi_c5', label: 'BSI C5:2020 (Cloud Computing Criteria)' },
  { id: 'tisax', label: 'TISAX (Automotive Information Security)' },
  { id: 'cyber_essentials_plus', label: 'Cyber Essentials Plus' },
  { id: 'gdpr_art42_europrivacy', label: 'GDPR Art. 42 Europrivacy Certification' },
  { id: 'hipaa_security', label: 'HIPAA Security & Privacy Attestation' },
  { id: 'dpf_self_certification', label: 'EU-US Data Privacy Framework (DPF) Active Certification' },
  { id: 'other', label: 'Other / Custom Assurance Standard' },
];

const ARTIFACT_KINDS: { id: AssuranceArtifactKind; label: string }[] = [
  { id: 'accredited_certification', label: 'Accredited Certification (ISO, BSI, etc.)' },
  { id: 'independent_attestation_report', label: 'Independent Attestation Report (SOC 1/2/3, ISAE 3402)' },
  { id: 'regulatory_declaration', label: 'Regulatory Declaration / Attestation (HIPAA, DORA)' },
  { id: 'code_of_conduct', label: 'Code of Conduct (EU Cloud CoC Level 2)' },
  { id: 'industry_label', label: 'Industry Label / Trustmark (CSA STAR, Cyber Essentials)' },
  { id: 'self_assessment', label: 'Self-Assessment Declaration' },
  { id: 'custom_assurance', label: 'Custom Assurance Report' },
];

export function ProcessorCertificationFormModal({
  tenantId,
  processorProfileId,
  vendorId,
  existingCertification,
  mode,
  evidenceList,
  availableSystems = [],
  onClose,
  onSaved,
  onNotice,
}: ProcessorCertificationFormModalProps) {
  const isEdit = mode === 'edit';
  const isReplace = mode === 'replace';

  // Form States
  const [standardFamily, setStandardFamily] = useState<AssuranceStandardFamily>(
    existingCertification?.standardFamily || 'iso_27001'
  );
  const [artifactKind, setArtifactKind] = useState<AssuranceArtifactKind>(
    existingCertification?.artifactKind || 'accredited_certification'
  );
  const [customStandardName, setCustomStandardName] = useState<string>(
    existingCertification?.customStandardName || ''
  );
  const [issuingBodyOrAuditor, setIssuingBodyOrAuditor] = useState<string>(
    existingCertification?.issuingBodyOrAuditor || ''
  );
  const [leadAuditorName, setLeadAuditorName] = useState<string>(
    existingCertification?.leadAuditorName || ''
  );
  const [certificateOrReportNumber, setCertificateOrReportNumber] = useState<string>(
    existingCertification?.certificateOrReportNumber || ''
  );

  // Validity Dates
  const [validFrom, setValidFrom] = useState<string>(
    existingCertification?.validFrom ? existingCertification.validFrom.slice(0, 10) : new Date().toISOString().slice(0, 10)
  );
  const [validUntil, setValidUntil] = useState<string>(
    existingCertification?.validUntil
      ? existingCertification.validUntil.slice(0, 10)
      : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );

  // Report Period (Period-of-Time Audits)
  const taxonomy = useMemo(() => getAssuranceTaxonomy(standardFamily), [standardFamily]);
  const [showReportPeriod, setShowReportPeriod] = useState<boolean>(
    Boolean(existingCertification?.reportPeriodStart || taxonomy.requiresReportPeriod)
  );
  const [reportPeriodStart, setReportPeriodStart] = useState<string>(
    existingCertification?.reportPeriodStart ? existingCertification.reportPeriodStart.slice(0, 10) : ''
  );
  const [reportPeriodEnd, setReportPeriodEnd] = useState<string>(
    existingCertification?.reportPeriodEnd ? existingCertification.reportPeriodEnd.slice(0, 10) : ''
  );

  // Status & Scope
  const [status, setStatus] = useState<ProcessorCertificationStatus>(
    existingCertification?.status || 'active_valid'
  );
  const [assuranceScopeSummary, setAssuranceScopeSummary] = useState<string>(
    existingCertification?.assuranceScopeSummary || ''
  );
  const [legalEntityOrRegionalScope, setLegalEntityOrRegionalScope] = useState<string>(
    existingCertification?.legalEntityOrRegionalScope || ''
  );
  const [coveredServices, setCoveredServices] = useState<string[]>(
    existingCertification?.systemsOrServicesCovered || []
  );
  const [newServiceTag, setNewServiceTag] = useState<string>('');

  // Evidence Linkage
  const [linkedEvidenceIds, setLinkedEvidenceIds] = useState<string[]>(
    existingCertification?.linkedEvidenceIds || []
  );

  // Review & Governance
  const [reviewOwnerUserId, setReviewOwnerUserId] = useState<string>(
    existingCertification?.reviewOwnerUserId || 'usr_compliance_lead'
  );
  const [reviewDueDate, setReviewDueDate] = useState<string>(
    existingCertification?.reviewDueDate ? existingCertification.reviewDueDate.slice(0, 10) : ''
  );
  const [reviewStatus, setReviewStatus] = useState<ProcessorCertificationReviewStatus>(
    existingCertification?.reviewStatus || 'pending'
  );
  const [reviewNotes, setReviewNotes] = useState<string>(
    existingCertification?.reviewNotes || ''
  );
  const [rejectionReason, setRejectionReason] = useState<string>(
    existingCertification?.rejectionReason || ''
  );
  const [insufficientRationale, setInsufficientRationale] = useState<string>(
    existingCertification?.insufficientRationale || ''
  );
  const [unresolvedFindingsCount, setUnresolvedFindingsCount] = useState<number>(
    existingCertification?.unresolvedFindingsCount || 0
  );
  const [hasMajorDeficiencies, setHasMajorDeficiencies] = useState<boolean>(
    existingCertification?.hasMajorDeficiencies || false
  );

  // Notes & Replacement rationale
  const [notes, setNotes] = useState<string>(existingCertification?.notes || '');
  const [replacementRationale, setReplacementRationale] = useState<string>('');

  // Submitting & Errors
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [clientErrors, setClientErrors] = useState<string[]>([]);

  // Update default artifact kind / report period when standard family changes
  const handleStandardFamilyChange = (newFam: AssuranceStandardFamily) => {
    setStandardFamily(newFam);
    const tax = getAssuranceTaxonomy(newFam);
    if (tax.requiresReportPeriod) {
      setShowReportPeriod(true);
      if (artifactKind === 'accredited_certification') {
        setArtifactKind('independent_attestation_report');
      }
    }
  };

  // Add Service Tag
  const handleAddServiceTag = () => {
    const trimmed = newServiceTag.trim();
    if (trimmed && !coveredServices.includes(trimmed)) {
      setCoveredServices([...coveredServices, trimmed]);
      setNewServiceTag('');
    }
  };

  // Remove Service Tag
  const handleRemoveServiceTag = (tag: string) => {
    setCoveredServices(coveredServices.filter((s) => s !== tag));
  };

  // Toggle Evidence
  const handleToggleEvidence = (evId: string) => {
    if (linkedEvidenceIds.includes(evId)) {
      setLinkedEvidenceIds(linkedEvidenceIds.filter((id) => id !== evId));
    } else {
      setLinkedEvidenceIds([...linkedEvidenceIds, evId]);
    }
  };

  // Validate on client
  const runValidation = (): { valid: boolean; errors: string[] } => {
    const errors: string[] = [];

    if (!issuingBodyOrAuditor.trim()) {
      errors.push('Issuing body or auditor name is required.');
    }
    if (!certificateOrReportNumber.trim()) {
      errors.push('Certificate or report reference number is required.');
    }
    if (standardFamily === 'other' && !customStandardName.trim()) {
      errors.push('Custom standard name is required when "Other / Custom" is selected.');
    }
    if (!validFrom) {
      errors.push('Valid from date is required.');
    }
    if (!validUntil) {
      errors.push('Valid until date is required.');
    }
    if (validFrom && validUntil && new Date(validUntil).getTime() < new Date(validFrom).getTime()) {
      errors.push('Valid until date must be on or after valid from date.');
    }
    if (showReportPeriod || taxonomy.requiresReportPeriod) {
      if (!reportPeriodStart) {
        errors.push('Report period start date is required for period-of-time assurance reports.');
      }
      if (!reportPeriodEnd) {
        errors.push('Report period end date is required for period-of-time assurance reports.');
      }
      if (
        reportPeriodStart &&
        reportPeriodEnd &&
        new Date(reportPeriodEnd).getTime() < new Date(reportPeriodStart).getTime()
      ) {
        errors.push('Report period end date must be on or after report period start date.');
      }
    }
    if (!assuranceScopeSummary.trim()) {
      errors.push('Assurance scope summary is required.');
    }
    if (!legalEntityOrRegionalScope.trim()) {
      errors.push('Legal entity or regional scope is required.');
    }
    if (!reviewOwnerUserId.trim()) {
      errors.push('Assigned review owner user ID is required.');
    }
    if (reviewStatus === 'rejected' && !rejectionReason.trim()) {
      errors.push('Rejection reason is mandatory when review status is "rejected".');
    }
    if (reviewStatus === 'insufficient' && !insufficientRationale.trim()) {
      errors.push('Insufficiency rationale is mandatory when review status is "insufficient".');
    }
    if (isReplace && !replacementRationale.trim()) {
      errors.push('Replacement rationale is required when superseding a prior certification.');
    }

    return { valid: errors.length === 0, errors };
  };

  // Handle Save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = runValidation();
    if (!val.valid) {
      setClientErrors(val.errors);
      return;
    }
    setClientErrors([]);
    setIsSubmitting(true);

    try {
      if (isReplace && existingCertification) {
        // Call replaceProcessorCertification
        const replaceFn = httpsCallable(functions, 'replaceProcessorCertification');
        const res: any = await replaceFn({
          tenantId,
          previousCertificationId: existingCertification.id,
          replacementRationale: replacementRationale.trim(),
          newCertification: {
            artifactKind,
            standardFamily,
            customStandardName: standardFamily === 'other' ? customStandardName.trim() : null,
            issuingBodyOrAuditor: issuingBodyOrAuditor.trim(),
            leadAuditorName: leadAuditorName.trim() || null,
            certificateOrReportNumber: certificateOrReportNumber.trim(),
            reportPeriodStart: showReportPeriod && reportPeriodStart ? new Date(reportPeriodStart).toISOString() : null,
            reportPeriodEnd: showReportPeriod && reportPeriodEnd ? new Date(reportPeriodEnd).toISOString() : null,
            validFrom: new Date(validFrom).toISOString(),
            validUntil: new Date(validUntil).toISOString(),
            status,
            assuranceScopeSummary: assuranceScopeSummary.trim(),
            legalEntityOrRegionalScope: legalEntityOrRegionalScope.trim(),
            systemsOrServicesCovered: coveredServices,
            notes: notes.trim() || null,
            reviewOwnerUserId: reviewOwnerUserId.trim(),
            reviewDueDate: reviewDueDate ? new Date(reviewDueDate).toISOString() : null,
            linkedEvidenceIds,
            unresolvedFindingsCount: Number(unresolvedFindingsCount) || 0,
            hasMajorDeficiencies,
          },
        });

        if (onNotice) onNotice(`Successfully superseded certification with v${res.data?.newCertification?.versionNumber || 2}`);
        onSaved(res.data?.newCertification);
      } else if (isEdit && existingCertification) {
        // Call updateTenantProcessorCertification
        const updateFn = httpsCallable(functions, 'updateTenantProcessorCertification');
        const res: any = await updateFn({
          tenantId,
          certificationId: existingCertification.id,
          artifactKind,
          standardFamily,
          customStandardName: standardFamily === 'other' ? customStandardName.trim() : null,
          issuingBodyOrAuditor: issuingBodyOrAuditor.trim(),
          leadAuditorName: leadAuditorName.trim() || null,
          certificateOrReportNumber: certificateOrReportNumber.trim(),
          reportPeriodStart: showReportPeriod && reportPeriodStart ? new Date(reportPeriodStart).toISOString() : null,
          reportPeriodEnd: showReportPeriod && reportPeriodEnd ? new Date(reportPeriodEnd).toISOString() : null,
          validFrom: new Date(validFrom).toISOString(),
          validUntil: new Date(validUntil).toISOString(),
          status,
          assuranceScopeSummary: assuranceScopeSummary.trim(),
          legalEntityOrRegionalScope: legalEntityOrRegionalScope.trim(),
          systemsOrServicesCovered: coveredServices,
          notes: notes.trim() || null,
          reviewOwnerUserId: reviewOwnerUserId.trim(),
          reviewDueDate: reviewDueDate ? new Date(reviewDueDate).toISOString() : null,
          linkedEvidenceIds,
          unresolvedFindingsCount: Number(unresolvedFindingsCount) || 0,
          hasMajorDeficiencies,
        });

        if (onNotice) onNotice(`Updated certification ${certificateOrReportNumber}`);
        onSaved(res.data?.certification);
      } else {
        // Call createTenantProcessorCertification
        const createFn = httpsCallable(functions, 'createTenantProcessorCertification');
        const res: any = await createFn({
          tenantId,
          processorProfileId,
          vendorId,
          artifactKind,
          standardFamily,
          customStandardName: standardFamily === 'other' ? customStandardName.trim() : null,
          issuingBodyOrAuditor: issuingBodyOrAuditor.trim(),
          leadAuditorName: leadAuditorName.trim() || null,
          certificateOrReportNumber: certificateOrReportNumber.trim(),
          reportPeriodStart: showReportPeriod && reportPeriodStart ? new Date(reportPeriodStart).toISOString() : null,
          reportPeriodEnd: showReportPeriod && reportPeriodEnd ? new Date(reportPeriodEnd).toISOString() : null,
          validFrom: new Date(validFrom).toISOString(),
          validUntil: new Date(validUntil).toISOString(),
          status,
          assuranceScopeSummary: assuranceScopeSummary.trim(),
          legalEntityOrRegionalScope: legalEntityOrRegionalScope.trim(),
          systemsOrServicesCovered: coveredServices,
          notes: notes.trim() || null,
          reviewOwnerUserId: reviewOwnerUserId.trim(),
          reviewStatus,
          reviewDueDate: reviewDueDate ? new Date(reviewDueDate).toISOString() : null,
          linkedEvidenceIds,
          unresolvedFindingsCount: Number(unresolvedFindingsCount) || 0,
          hasMajorDeficiencies,
        });

        if (onNotice) onNotice(`Created certification ${certificateOrReportNumber}`);
        onSaved(res.data?.certification);
      }

      onClose();
    } catch (err: any) {
      console.error('Failed to save processor certification:', err);
      setClientErrors([err.message || 'Failed to save processor certification.']);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10000,
        padding: '20px',
      }}
    >
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '12px',
          width: '100%',
          maxWidth: '820px',
          maxHeight: '90vh',
          overflowY: 'auto',
          padding: '24px',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.6)',
        }}
      >
        {/* Modal Header */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
          <div>
            <h2 style={{ fontSize: '18px', fontWeight: 700, margin: 0 }}>
              {isReplace
                ? `🔄 Replace Certification: ${existingCertification?.certificateOrReportNumber}`
                : isEdit
                ? `✏️ Edit Certification: ${existingCertification?.certificateOrReportNumber}`
                : '🛡️ Record New Processor Assurance Artifact'}
            </h2>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              {isReplace
                ? 'Archives previous version and registers new recertification cycle with preserved history.'
                : 'Maintain third-party certifications, SOC audit reports, and accredited attestations.'}
            </div>
          </div>

          <button
            onClick={onClose}
            style={{
              backgroundColor: 'transparent',
              border: 'none',
              fontSize: '18px',
              cursor: 'pointer',
              color: 'var(--text-muted)',
            }}
          >
            ✕
          </button>
        </div>

        {/* Client Error Banner */}
        {clientErrors.length > 0 && (
          <div style={{ backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.4)', borderRadius: '8px', padding: '12px', marginBottom: '16px', fontSize: '12px' }}>
            <div style={{ fontWeight: 700, color: 'var(--status-danger)', marginBottom: '4px' }}>Please resolve the following:</div>
            <ul style={{ margin: 0, paddingLeft: '18px', color: 'var(--status-danger)' }}>
              {clientErrors.map((err, i) => (
                <li key={i}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
          {/* Section 1: Standard Family & Artifact Kind */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              1. Assurance Standard & Artifact Classification
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Standard / Framework Family: *
                </label>
                <select
                  value={standardFamily}
                  onChange={(e) => handleStandardFamilyChange(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {STANDARD_FAMILIES.map((fam) => (
                    <option key={fam.id} value={fam.id}>
                      {fam.label}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Artifact Kind: *
                </label>
                <select
                  value={artifactKind}
                  onChange={(e) => setArtifactKind(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  {ARTIFACT_KINDS.map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {standardFamily === 'other' && (
              <div style={{ marginTop: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Custom Standard / Regulation Name: *
                </label>
                <input
                  type="text"
                  value={customStandardName}
                  onChange={(e) => setCustomStandardName(e.target.value)}
                  placeholder="e.g. FINMA Circular 2018/3, APRA CPS 234..."
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}
          </div>

          {/* Section 2: Auditor & Reference Details */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              2. Auditor Attribution & Reference Details
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Issuing Body / Audit Firm: *
                </label>
                <input
                  type="text"
                  value={issuingBodyOrAuditor}
                  onChange={(e) => setIssuingBodyOrAuditor(e.target.value)}
                  placeholder="e.g. EY CertifyPoint, PwC, BSI Group, TÜV Rheinland"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Certificate / Report Ref #: *
                </label>
                <input
                  type="text"
                  value={certificateOrReportNumber}
                  onChange={(e) => setCertificateOrReportNumber(e.target.value)}
                  placeholder="e.g. 01 104 219804, PWC-SOC2-2025"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Lead Auditor Name / Partner:
                </label>
                <input
                  type="text"
                  value={leadAuditorName}
                  onChange={(e) => setLeadAuditorName(e.target.value)}
                  placeholder="e.g. Dr. Hans Gruber, Lead Auditor"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Primary Status: *
                </label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="active_valid">Active & Valid</option>
                  <option value="expiring_soon">Expiring Soon</option>
                  <option value="expired">Expired / Lapsed</option>
                  <option value="suspended">Suspended</option>
                  <option value="revoked">Revoked</option>
                </select>
              </div>
            </div>
          </div>

          {/* Section 3: Validity Window & Period-of-Time Testing Window */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              3. Validity Reliance & Audit Testing Windows
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Valid From (Issue Date): *
                </label>
                <input
                  type="date"
                  value={validFrom}
                  onChange={(e) => setValidFrom(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Valid Until (Expiry Date): *
                </label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={(e) => setValidUntil(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            {/* Checkbox to toggle report period */}
            <div style={{ marginBottom: '10px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={showReportPeriod}
                  onChange={(e) => setShowReportPeriod(e.target.checked)}
                />
                <span>Include Period-of-Time Audit Window (Mandatory for SOC 2 Type II, SOC 1 Type II, PCI RoC)</span>
              </label>
            </div>

            {showReportPeriod && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', backgroundColor: 'var(--bg-surface)', padding: '12px', borderRadius: '6px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Audit Period Start Date: *
                  </label>
                  <input
                    type="date"
                    value={reportPeriodStart}
                    onChange={(e) => setReportPeriodStart(e.target.value)}
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

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                    Audit Period End Date: *
                  </label>
                  <input
                    type="date"
                    value={reportPeriodEnd}
                    onChange={(e) => setReportPeriodEnd(e.target.value)}
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
              </div>
            )}
          </div>

          {/* Section 4: Scope, Covered Systems & Services */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              4. Assurance Scope & Covered Services
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  In-Scope Contracting Legal Entity / Regional Scope: *
                </label>
                <input
                  type="text"
                  value={legalEntityOrRegionalScope}
                  onChange={(e) => setLegalEntityOrRegionalScope(e.target.value)}
                  placeholder="e.g. Amazon Web Services EMEA SARL (Frankfurt, Dublin, Paris)"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Assurance Scope Summary: *
                </label>
                <textarea
                  value={assuranceScopeSummary}
                  onChange={(e) => setAssuranceScopeSummary(e.target.value)}
                  placeholder="Describe certified physical facilities, logical services, data centers, and boundaries..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              {/* Covered Services Tags */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Covered Services / Systems:
                </label>
                <div style={{ display: 'flex', gap: '6px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    value={newServiceTag}
                    onChange={(e) => setNewServiceTag(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddServiceTag();
                      }
                    }}
                    placeholder="Type service (e.g. Compute, Storage, Database) and press Add..."
                    style={{
                      flex: 1,
                      padding: '6px 10px',
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                    }}
                  />
                  <button
                    type="button"
                    onClick={handleAddServiceTag}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--accent-blue)',
                      border: 'none',
                      borderRadius: '6px',
                      color: '#fff',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Add Service
                  </button>
                </div>

                {/* Quick suggestions from available systems */}
                {availableSystems.length > 0 && (
                  <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px', fontSize: '11px' }}>
                    <span style={{ color: 'var(--text-muted)' }}>Quick Add from Linked Assets:</span>
                    {availableSystems.map((s) => (
                      <button
                        key={s.asset.id}
                        type="button"
                        onClick={() => {
                          if (!coveredServices.includes(s.asset.name)) {
                            setCoveredServices([...coveredServices, s.asset.name]);
                          }
                        }}
                        style={{
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor: 'rgba(37, 99, 235, 0.1)',
                          border: '1px solid rgba(37, 99, 235, 0.2)',
                          color: 'var(--accent-blue)',
                          cursor: 'pointer',
                        }}
                      >
                        + {s.asset.name}
                      </button>
                    ))}
                  </div>
                )}

                {/* Active Tags */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {coveredServices.map((tag) => (
                    <span
                      key={tag}
                      style={{
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: '6px',
                        padding: '4px 8px',
                        backgroundColor: 'var(--bg-surface)',
                        border: '1px solid var(--border-color)',
                        borderRadius: '4px',
                        fontSize: '12px',
                      }}
                    >
                      <span>{tag}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveServiceTag(tag)}
                        style={{
                          background: 'none',
                          border: 'none',
                          color: 'var(--status-danger)',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: '12px',
                        }}
                      >
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Section 5: Link Evidence */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', margin: 0 }}>
                5. Link Supporting Evidence Files ({linkedEvidenceIds.length} Linked)
              </h3>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  color: linkedEvidenceIds.length > 0 ? 'var(--status-success)' : 'var(--status-warning)',
                }}
              >
                {linkedEvidenceIds.length > 0 ? '✅ Supporting File Attached' : '⚠️ Missing Supporting Evidence File'}
              </span>
            </div>

            {evidenceList.length === 0 ? (
              <div style={{ fontSize: '12px', color: 'var(--text-muted)', padding: '8px', backgroundColor: 'var(--bg-surface)', borderRadius: '6px' }}>
                No evidence files currently uploaded in repository. Upload evidence in Evidence Manager to attach.
              </div>
            ) : (
              <div style={{ maxHeight: '150px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {evidenceList.map((ev) => (
                  <label
                    key={ev.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '6px 10px',
                      backgroundColor: linkedEvidenceIds.includes(ev.id) ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-surface)',
                      border: linkedEvidenceIds.includes(ev.id) ? '1px solid var(--accent-blue)' : '1px solid var(--border-color)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <input
                        type="checkbox"
                        checked={linkedEvidenceIds.includes(ev.id)}
                        onChange={() => handleToggleEvidence(ev.id)}
                      />
                      <span>
                        <strong>{ev.title}</strong>{' '}
                        <code style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>[{ev.category}]</code>
                      </span>
                    </div>
                    <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      {ev.fileHashSha256 ? `${ev.fileHashSha256.slice(0, 10)}...` : 'Verified'}
                    </span>
                  </label>
                ))}
              </div>
            )}
          </div>

          {/* Section 6: Governance & Review Outcome */}
          <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
            <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: '12px' }}>
              6. Governance Ownership & Compliance Review
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px', marginBottom: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Assigned Review Owner (User ID): *
                </label>
                <input
                  type="text"
                  value={reviewOwnerUserId}
                  onChange={(e) => setReviewOwnerUserId(e.target.value)}
                  placeholder="e.g. usr_lead_dpo, usr_compliance_lead"
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Next Review Due Date:
                </label>
                <input
                  type="date"
                  value={reviewDueDate}
                  onChange={(e) => setReviewDueDate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Review Outcome: *
                </label>
                <select
                  value={reviewStatus}
                  onChange={(e) => setReviewStatus(e.target.value as any)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                >
                  <option value="pending">Pending Initial Review</option>
                  <option value="in_review">Currently Under Review</option>
                  <option value="accepted">✅ Accepted (Sufficient Assurance)</option>
                  <option value="mark_insufficient">⚠️ Insufficient (Scope/Testing Gaps)</option>
                  <option value="rejected">❌ Rejected (Invalid / Untrusted)</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                  Unresolved Audit Findings Count:
                </label>
                <input
                  type="number"
                  min="0"
                  value={unresolvedFindingsCount}
                  onChange={(e) => setUnresolvedFindingsCount(parseInt(e.target.value, 10) || 0)}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            </div>

            <div style={{ marginBottom: '12px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '12px', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={hasMajorDeficiencies}
                  onChange={(e) => setHasMajorDeficiencies(e.target.checked)}
                />
                <span>Audit Contains Qualified Opinion or Major Control Deficiencies</span>
              </label>
            </div>

            {/* Contextual Insufficiency Rationale */}
            {reviewStatus === 'insufficient' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--status-warning)' }}>
                  Insufficiency Rationale (Mandatory): *
                </label>
                <textarea
                  value={insufficientRationale}
                  onChange={(e) => setInsufficientRationale(e.target.value)}
                  placeholder="Explain why the certificate is insufficient despite valid dates (e.g. out-of-scope database hosting, carve-out of key controls)..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--status-warning)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}

            {/* Contextual Rejection Reason */}
            {reviewStatus === 'rejected' && (
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px', color: 'var(--status-danger)' }}>
                  Rejection Reason (Mandatory): *
                </label>
                <textarea
                  value={rejectionReason}
                  onChange={(e) => setRejectionReason(e.target.value)}
                  placeholder="Explain why this assurance artifact was rejected (e.g. invalid signature, non-accredited auditor)..."
                  rows={2}
                  style={{
                    width: '100%',
                    padding: '8px',
                    backgroundColor: 'var(--bg-surface)',
                    border: '1px solid var(--status-danger)',
                    borderRadius: '6px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                />
              </div>
            )}

            <div>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, marginBottom: '4px' }}>
                Review Notes & Governance Observations:
              </label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Internal audit notes, SOC trust criteria observed, or next steps..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          </div>

          {/* Section 7: Replacement Rationale (Only in Replace Mode) */}
          {isReplace && (
            <div style={{ backgroundColor: 'rgba(37, 99, 235, 0.06)', border: '1px solid var(--accent-blue)', padding: '14px', borderRadius: '8px' }}>
              <h3 style={{ fontSize: '13px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--accent-blue)', marginBottom: '8px' }}>
                7. Replacement Rationale (Mandatory for Non-Destructive Supersession)
              </h3>
              <textarea
                value={replacementRationale}
                onChange={(e) => setReplacementRationale(e.target.value)}
                placeholder="Explain why this new record replaces the existing version (e.g. Annual 2025 recertification completed by EY)..."
                rows={2}
                style={{
                  width: '100%',
                  padding: '8px',
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  color: 'var(--text-primary)',
                }}
              />
            </div>
          )}

          {/* Modal Actions */}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              style={{
                padding: '9px 16px',
                backgroundColor: 'var(--bg-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                color: 'var(--text-primary)',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>

            <button
              type="submit"
              disabled={isSubmitting}
              style={{
                padding: '9px 20px',
                backgroundColor: 'var(--accent-blue)',
                border: 'none',
                borderRadius: '6px',
                color: '#fff',
                fontSize: '13px',
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {isSubmitting
                ? 'Saving Record...'
                : isReplace
                ? '🔄 Publish Replacement & Archive Old'
                : isEdit
                ? '💾 Save Changes'
                : '🛡️ Create Assurance Record'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

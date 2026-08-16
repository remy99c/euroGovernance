'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  ProcessorProfile,
  TransferArrangement,
  TransferScopeType,
  TransferMechanismType,
  TransferMechanismStatus,
  EEATransferStatus,
  Evidence,
  TIA,
  evaluateTransferEvidenceCompleteness,
} from '@eurogovernance/shared-types';
import { UIPageHeader } from './components/ui-page-header';
import { UIStatCard, UIStatGrid } from './components/ui-stat-card';
import { UIFilterBar } from './components/ui-filter-bar';
import { UIDataTable } from './components/ui-data-table';
import { UIBadge, UIStatusBadge } from './components/ui-badge';
import { UIEmptyState } from './components/ui-empty-state';

interface ProcessorTransfersManagerProps {
  tenantId: string;
  initialProcessorProfileId?: string;
  onNotice?: (msg: string) => void;
}

const COMMON_COUNTRIES = [
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
  { code: 'CH', name: 'Switzerland' },
  { code: 'IN', name: 'India' },
  { code: 'SG', name: 'Singapore' },
  { code: 'JP', name: 'Japan' },
  { code: 'AU', name: 'Australia' },
  { code: 'CA', name: 'Canada' },
  { code: 'DE', name: 'Germany (EEA)' },
  { code: 'FR', name: 'France (EEA)' },
  { code: 'IE', name: 'Ireland (EEA)' },
];

const SCOPES: { value: TransferScopeType; label: string }[] = [
  { value: 'hosting', label: 'Cloud Hosting & Infrastructure' },
  { value: 'support_access', label: 'Support & Remote Access' },
  { value: 'onward_transfer', label: 'Onward Third-Party Transfer' },
  { value: 'subprocessing', label: 'Subprocessing Execution' },
  { value: 'analytics', label: 'Product & Telemetry Analytics' },
  { value: 'backup', label: 'Backup & Disaster Recovery' },
  { value: 'maintenance', label: 'System Maintenance' },
  { value: 'other', label: 'Other Processing Scope' },
];

const MECHANISMS: { value: TransferMechanismType; label: string; isRestricted: boolean }[] = [
  { value: 'standard_contractual_clauses', label: 'Standard Contractual Clauses (EU SCCs 2021/914)', isRestricted: true },
  { value: 'adequacy_decision', label: 'European Commission Adequacy Decision (Art. 45)', isRestricted: false },
  { value: 'binding_corporate_rules', label: 'Binding Corporate Rules (BCR - Art. 47)', isRestricted: true },
  { value: 'derogation_art49', label: 'Article 49 Specific Derogation (Explicit Consent / Contract)', isRestricted: true },
  { value: 'intra_group_agreement', label: 'Intra-Group Data Transfer Agreement', isRestricted: true },
  { value: 'code_of_conduct_or_certification', label: 'Approved Code of Conduct / Certification (Art. 40/42)', isRestricted: true },
  { value: 'no_mechanism_selected', label: '⚠️ No Legal Mechanism Selected', isRestricted: true },
  { value: 'other', label: 'Other Transfer Safeguard Mechanism', isRestricted: true },
];

const STATUSES: { value: TransferMechanismStatus; label: string; color: string }[] = [
  { value: 'active_valid', label: 'Active & Valid', color: 'var(--status-success)' },
  { value: 'pending_execution', label: 'Pending Execution / Draft', color: 'var(--status-info)' },
  { value: 'under_review', label: 'Under Periodic Review', color: 'var(--status-warning)' },
  { value: 'restricted', label: 'Restricted / Blocked', color: 'var(--status-danger)' },
  { value: 'expired', label: 'Expired / Stale', color: 'var(--status-danger)' },
  { value: 'superseded', label: 'Superseded', color: 'var(--text-muted)' },
  { value: 'revoked', label: 'Revoked', color: 'var(--status-danger)' },
];

export default function ProcessorTransfersManager({
  tenantId,
  initialProcessorProfileId,
  onNotice,
}: ProcessorTransfersManagerProps) {
  // Data States
  const [profiles, setProfiles] = useState<ProcessorProfile[]>([]);
  const [transfers, setTransfers] = useState<TransferArrangement[]>([]);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [tiasList, setTiasList] = useState<TIA[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProcessorProfileId || 'all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [restrictedFilter, setRestrictedFilter] = useState<'all' | 'restricted' | 'eea'>('all');
  const [mechanismFilter, setMechanismFilter] = useState<string>('all');

  // Modal Dialog States
  const [isEditModalOpen, setIsEditModalOpen] = useState<boolean>(false);
  const [editingTransfer, setEditingTransfer] = useState<TransferArrangement | null>(null);
  const [modalLoading, setModalLoading] = useState<boolean>(false);

  const [isLinkTiaModalOpen, setIsLinkTiaModalOpen] = useState<boolean>(false);
  const [targetTransferForTia, setTargetTransferForTia] = useState<TransferArrangement | null>(null);
  const [selectedTiaIdToLink, setSelectedTiaIdToLink] = useState<string>('');

  const [isLinkEvidenceModalOpen, setIsLinkEvidenceModalOpen] = useState<boolean>(false);
  const [targetTransferForEvidence, setTargetTransferForEvidence] = useState<TransferArrangement | null>(null);
  const [selectedEvidenceIdToLink, setSelectedEvidenceIdToLink] = useState<string>('');

  // Form State for Create / Edit
  const [formName, setFormName] = useState<string>('');
  const [formProfileId, setFormProfileId] = useState<string>('');
  const [formRestrictedTransfer, setFormRestrictedTransfer] = useState<boolean>(true);
  const [formEeaStatus, setFormEeaStatus] = useState<EEATransferStatus>('third_country_non_adequate');
  const [formCountries, setFormCountries] = useState<string[]>(['US']);
  const [formCountryInput, setFormCountryInput] = useState<string>('');
  const [formScopes, setFormScopes] = useState<TransferScopeType[]>(['hosting']);
  const [formMechanismType, setFormMechanismType] = useState<TransferMechanismType>('standard_contractual_clauses');
  const [formMechanismStatus, setFormMechanismStatus] = useState<TransferMechanismStatus>('active_valid');
  const [formEffectiveDate, setFormEffectiveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [formReviewDueDate, setFormReviewDueDate] = useState<string>('');
  const [formSupplementaryMeasures, setFormSupplementaryMeasures] = useState<string>('');
  const [formSubprocessorInvolvement, setFormSubprocessorInvolvement] = useState<boolean>(false);
  const [formSubprocessorsText, setFormSubprocessorsText] = useState<string>('');
  const [formRationale, setFormRationale] = useState<string>('');
  const [formNotes, setFormNotes] = useState<string>('');

  const showMsg = (msg: string) => {
    if (onNotice) onNotice(msg);
  };

  // Load All Relevant Data
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      // 1. Fetch Processor Profiles
      const listProfilesFn = httpsCallable(functions, 'listTenantProcessorProfiles');
      const pRes: any = await listProfilesFn({ tenantId });
      const profs: ProcessorProfile[] = pRes.data?.profiles || [];
      setProfiles(profs);

      // 2. Fetch Transfer Arrangements
      const listTransfersFn = httpsCallable(functions, 'listTenantTransferArrangements');
      const tRes: any = await listTransfersFn({ tenantId });
      const trans: TransferArrangement[] = tRes.data?.arrangements || [];
      setTransfers(trans);

      // 3. Fetch TIAs
      try {
        const listTiasFn = httpsCallable(functions, 'listTenantTIAs');
        const tiaRes: any = await listTiasFn({ tenantId });
        setTiasList(tiaRes.data?.tias || []);
      } catch {
        // Fallback gracefully if TIAs list is empty or unpopulated
        setTiasList([]);
      }

      // 4. Fetch Evidence
      try {
        const listEvFn = httpsCallable(functions, 'listTenantEvidence');
        const evRes: any = await listEvFn({ tenantId });
        setEvidenceList(evRes.data?.evidence || []);
      } catch {
        setEvidenceList([]);
      }
    } catch (err: any) {
      console.error('Failed to load processor transfer arrangements:', err);
      setError(err.message || 'Failed to load transfer arrangements.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handle active processor profile context
  const activeProfile = useMemo(() => {
    if (selectedProfileId === 'all') return null;
    return profiles.find((p) => p.id === selectedProfileId) || null;
  }, [profiles, selectedProfileId]);

  // Filtered list of transfer arrangements
  const filteredTransfers = useMemo(() => {
    return transfers.filter((t) => {
      if (selectedProfileId !== 'all' && t.processorProfileId !== selectedProfileId) {
        return false;
      }
      if (restrictedFilter === 'restricted' && !t.restrictedTransfer) return false;
      if (restrictedFilter === 'eea' && t.restrictedTransfer) return false;
      if (mechanismFilter !== 'all' && t.transferMechanismType !== mechanismFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = t.name.toLowerCase().includes(q);
        const matchesCountry = t.destinationCountries.some((c) => c.toLowerCase().includes(q));
        const matchesMechanism = t.transferMechanismType.toLowerCase().includes(q);
        if (!matchesName && !matchesCountry && !matchesMechanism) return false;
      }
      return true;
    });
  }, [transfers, selectedProfileId, restrictedFilter, mechanismFilter, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const relevant = selectedProfileId === 'all' ? transfers : transfers.filter((t) => t.processorProfileId === selectedProfileId);
    const total = relevant.length;
    const restricted = relevant.filter((t) => t.restrictedTransfer).length;
    const valid = relevant.filter((t) => t.transferMechanismStatus === 'active_valid').length;
    const missingTia = relevant.filter((t) => t.restrictedTransfer && !t.linkedTiaId).length;
    const missingEvidence = relevant.filter(
      (t) =>
        (t.transferMechanismType === 'standard_contractual_clauses' || t.subprocessorInvolvement) &&
        (!t.linkedEvidenceIds || t.linkedEvidenceIds.length === 0)
    ).length;

    return { total, restricted, valid, missingTia, missingEvidence };
  }, [transfers, selectedProfileId]);

  // Open Create Modal
  const handleOpenCreate = () => {
    setEditingTransfer(null);
    setFormName('');
    setFormProfileId(selectedProfileId !== 'all' ? selectedProfileId : profiles[0]?.id || '');
    setFormRestrictedTransfer(true);
    setFormEeaStatus('third_country_non_adequate');
    setFormCountries(['US']);
    setFormCountryInput('');
    setFormScopes(['hosting']);
    setFormMechanismType('standard_contractual_clauses');
    setFormMechanismStatus('active_valid');
    setFormEffectiveDate(new Date().toISOString().slice(0, 10));
    setFormReviewDueDate('');
    setFormSupplementaryMeasures('');
    setFormSubprocessorInvolvement(false);
    setFormSubprocessorsText('');
    setFormRationale('');
    setFormNotes('');
    setIsEditModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEdit = (t: TransferArrangement) => {
    setEditingTransfer(t);
    setFormName(t.name);
    setFormProfileId(t.processorProfileId);
    setFormRestrictedTransfer(t.restrictedTransfer);
    setFormEeaStatus(t.eeaStatus);
    setFormCountries(t.destinationCountries || []);
    setFormCountryInput('');
    setFormScopes(t.transferScopes || []);
    setFormMechanismType(t.transferMechanismType);
    setFormMechanismStatus(t.transferMechanismStatus);
    setFormEffectiveDate(t.effectiveDate ? t.effectiveDate.slice(0, 10) : '');
    setFormReviewDueDate(t.reviewDueDate ? t.reviewDueDate.slice(0, 10) : '');
    setFormSupplementaryMeasures(t.supplementaryMeasuresSummary || '');
    setFormSubprocessorInvolvement(t.subprocessorInvolvement);
    setFormSubprocessorsText(t.subprocessorsInvolved?.join(', ') || '');
    setFormRationale(t.rationale || '');
    setFormNotes(t.notes || '');
    setIsEditModalOpen(true);
  };

  // Save Transfer Handler
  const handleSaveTransfer = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formProfileId) {
      alert('Transfer arrangement name and processor profile are required.');
      return;
    }
    if (formCountries.length === 0) {
      alert('At least one destination country must be specified.');
      return;
    }
    if (formScopes.length === 0) {
      alert('At least one transfer scope must be selected.');
      return;
    }

    setModalLoading(true);
    try {
      const subprocessorsList = formSubprocessorInvolvement
        ? formSubprocessorsText
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean)
        : [];

      if (editingTransfer) {
        // Update Existing
        const updateFn = httpsCallable(functions, 'updateTenantTransferArrangement');
        await updateFn({
          tenantId,
          arrangementId: editingTransfer.id,
          name: formName.trim(),
          restrictedTransfer: formRestrictedTransfer,
          destinationCountries: formCountries,
          eeaStatus: formEeaStatus,
          transferScopes: formScopes,
          transferMechanismType: formMechanismType,
          transferMechanismStatus: formMechanismStatus,
          effectiveDate: formEffectiveDate ? new Date(formEffectiveDate).toISOString() : editingTransfer.effectiveDate,
          reviewDueDate: formReviewDueDate ? new Date(formReviewDueDate).toISOString() : null,
          supplementaryMeasuresSummary: formSupplementaryMeasures.trim() || null,
          subprocessorInvolvement: formSubprocessorInvolvement,
          subprocessorsInvolved: subprocessorsList,
          rationale: formRationale.trim() || null,
          notes: formNotes.trim() || null,
        });
        showMsg(`Transfer arrangement "${formName}" updated successfully.`);
      } else {
        // Create New
        const createFn = httpsCallable(functions, 'createTenantTransferArrangement');
        await createFn({
          tenantId,
          processorProfileId: formProfileId,
          name: formName.trim(),
          restrictedTransfer: formRestrictedTransfer,
          destinationCountries: formCountries,
          eeaStatus: formEeaStatus,
          transferScopes: formScopes,
          transferMechanismType: formMechanismType,
          transferMechanismStatus: formMechanismStatus,
          effectiveDate: formEffectiveDate ? new Date(formEffectiveDate).toISOString() : new Date().toISOString(),
          reviewDueDate: formReviewDueDate ? new Date(formReviewDueDate).toISOString() : null,
          supplementaryMeasuresSummary: formSupplementaryMeasures.trim() || null,
          subprocessorInvolvement: formSubprocessorInvolvement,
          subprocessorsInvolved: subprocessorsList,
          rationale: formRationale.trim() || null,
          notes: formNotes.trim() || null,
        });
        showMsg(`Transfer arrangement "${formName}" created successfully.`);
      }

      setIsEditModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to save transfer arrangement:', err);
      alert(err.message || 'Failed to save transfer arrangement.');
    } finally {
      setModalLoading(false);
    }
  };

  // Delete Handler
  const handleDeleteTransfer = async (t: TransferArrangement) => {
    if (!confirm(`Are you sure you want to delete transfer arrangement "${t.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const deleteFn = httpsCallable(functions, 'deleteTenantTransferArrangement');
      await deleteFn({ tenantId, arrangementId: t.id });
      showMsg(`Transfer arrangement "${t.name}" deleted.`);
      await loadData();
    } catch (err: any) {
      console.error('Failed to delete transfer arrangement:', err);
      alert(err.message || 'Failed to delete transfer arrangement.');
    }
  };

  // Open Link TIA Dialog
  const handleOpenLinkTia = (t: TransferArrangement) => {
    setTargetTransferForTia(t);
    setSelectedTiaIdToLink(t.linkedTiaId || '');
    setIsLinkTiaModalOpen(true);
  };

  // Execute Link TIA
  const handleExecuteLinkTia = async () => {
    if (!targetTransferForTia || !selectedTiaIdToLink) return;
    setModalLoading(true);
    try {
      const linkTiaFn = httpsCallable(functions, 'linkTIAToTransferArrangement');
      await linkTiaFn({
        tenantId,
        transferArrangementId: targetTransferForTia.id,
        tiaId: selectedTiaIdToLink,
      });
      showMsg(`TIA linked to transfer "${targetTransferForTia.name}".`);
      setIsLinkTiaModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to link TIA:', err);
      alert(err.message || 'Failed to link TIA.');
    } finally {
      setModalLoading(false);
    }
  };

  // Open Link Evidence Dialog
  const handleOpenLinkEvidence = (t: TransferArrangement) => {
    setTargetTransferForEvidence(t);
    setSelectedEvidenceIdToLink('');
    setIsLinkEvidenceModalOpen(true);
  };

  // Execute Link Evidence
  const handleExecuteLinkEvidence = async () => {
    if (!targetTransferForEvidence || !selectedEvidenceIdToLink) return;
    setModalLoading(true);
    try {
      const linkEvFn = httpsCallable(functions, 'linkEvidenceToTransferArrangement');
      await linkEvFn({
        tenantId,
        transferArrangementId: targetTransferForEvidence.id,
        evidenceId: selectedEvidenceIdToLink,
      });
      showMsg(`Evidence linked to transfer "${targetTransferForEvidence.name}".`);
      setIsLinkEvidenceModalOpen(false);
      await loadData();
    } catch (err: any) {
      console.error('Failed to link evidence:', err);
      alert(err.message || 'Failed to link evidence.');
    } finally {
      setModalLoading(false);
    }
  };

  // Country tag helpers
  const handleAddCountry = (code: string) => {
    const cleaned = code.trim().toUpperCase();
    if (cleaned && !formCountries.includes(cleaned)) {
      setFormCountries([...formCountries, cleaned]);
    }
    setFormCountryInput('');
  };

  const handleRemoveCountry = (code: string) => {
    setFormCountries(formCountries.filter((c) => c !== code));
  };

  const handleToggleScope = (scope: TransferScopeType) => {
    if (formScopes.includes(scope)) {
      setFormScopes(formScopes.filter((s) => s !== scope));
    } else {
      setFormScopes([...formScopes, scope]);
    }
  };

  return (
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 0' }}>
      {/* 1. Standard Page Header */}
      <UIPageHeader
        title="Processor Cross-Border Transfer Governance"
        description="Manage GDPR Chapter V restricted transfer arrangements, Standard Contractual Clauses (SCC), adequacy decisions, TIAs, and safeguard evidence."
        primaryAction={{
          label: 'New Transfer Arrangement',
          icon: '➕',
          onClick: handleOpenCreate,
        }}
      />

      {/* 2. Standardized KPI Metrics Grid */}
      <UIStatGrid columns={5}>
        <UIStatCard
          label="Total Arrangements"
          value={metrics.total}
          subtext="Configured data pipelines"
          valueColor="var(--accent-primary)"
        />
        <UIStatCard
          label="Restricted Transfers"
          value={metrics.restricted}
          subtext="Third-country destinations"
          valueColor={metrics.restricted > 0 ? 'var(--status-warning-fg)' : 'var(--status-compliant-fg)'}
          onClick={() => setRestrictedFilter(restrictedFilter === 'restricted' ? 'all' : 'restricted')}
        />
        <UIStatCard
          label="Active & Valid"
          value={metrics.valid}
          subtext="Legally executed safeguards"
          valueColor="var(--status-compliant-fg)"
        />
        <UIStatCard
          label="Missing TIAs"
          value={metrics.missingTia}
          subtext="Schrems II assessment needed"
          valueColor={metrics.missingTia > 0 ? 'var(--status-critical-fg)' : 'var(--text-muted)'}
          zeroStateText="Zero missing TIAs"
        />
        <UIStatCard
          label="Evidence Follow-up"
          value={metrics.missingEvidence}
          subtext="Unlinked safeguard files"
          valueColor={metrics.missingEvidence > 0 ? 'var(--status-critical-fg)' : 'var(--text-muted)'}
          zeroStateText="All evidence linked"
        />
      </UIStatGrid>

      {/* 3. Standardized Filter Toolbar */}
      <UIFilterBar
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search arrangements by name, country, or mechanism..."
        filters={[
          {
            id: 'filter_processor',
            label: 'Processor',
            value: selectedProfileId,
            options: [
              { label: `All Processors (${profiles.length})`, value: 'all' },
              ...profiles.map((p) => ({
                label: `${p.engagementName || p.id} (${p.processorRole})`,
                value: p.id,
              })),
            ],
            onChange: setSelectedProfileId,
          },
          {
            id: 'filter_restricted',
            label: 'Transfer Type',
            value: restrictedFilter,
            options: [
              { label: 'All Transfer Types', value: 'all' },
              { label: 'Restricted (Third Country)', value: 'restricted' },
              { label: 'EEA / Adequate Only', value: 'eea' },
            ],
            onChange: (v) => setRestrictedFilter(v as any),
          },
          {
            id: 'filter_mechanism',
            label: 'Mechanism',
            value: mechanismFilter,
            options: [
              { label: 'All Legal Mechanisms', value: 'all' },
              ...MECHANISMS.map((m) => ({ label: m.label, value: m.value })),
            ],
            onChange: setMechanismFilter,
          },
        ]}
        hasActiveFilters={selectedProfileId !== 'all' || restrictedFilter !== 'all' || mechanismFilter !== 'all' || searchQuery.trim() !== ''}
        onResetFilters={() => {
          setSelectedProfileId('all');
          setRestrictedFilter('all');
          setMechanismFilter('all');
          setSearchQuery('');
        }}
      />

      {/* Active Processor Context Banner */}
      {activeProfile && (
        <div
          style={{
            padding: '14px 18px',
            backgroundColor: 'var(--bg-surface)',
            border: '1px solid var(--border-color)',
            borderLeft: activeProfile.isSpecialCategoryData ? '4px solid var(--status-danger)' : '4px solid var(--accent-blue)',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '10px',
          }}
        >
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{ fontSize: '14px', fontWeight: 700 }}>{activeProfile.engagementName || activeProfile.id}</span>
              <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(37, 99, 235, 0.15)', color: 'var(--accent-blue)' }}>
                {activeProfile.processorRole.replace('_', ' ').toUpperCase()}
              </span>
              {activeProfile.isSpecialCategoryData && (
                <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-danger)' }}>
                  ⚠️ Special Category Data (Art. 9)
                </span>
              )}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
              Vendor ID: {activeProfile.vendorId} • Criticality: <strong>{activeProfile.criticality}</strong> • DPA Status: {activeProfile.dpaSigned ? '✅ Signed' : '⚠️ Missing'} • Next Review:{' '}
              {activeProfile.nextReviewDate ? activeProfile.nextReviewDate.slice(0, 10) : 'Not scheduled'}
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <span
              style={{
                fontSize: '12px',
                fontWeight: 600,
                padding: '4px 10px',
                borderRadius: '6px',
                backgroundColor: transfers.some((t) => t.processorProfileId === activeProfile.id && t.restrictedTransfer)
                  ? 'rgba(245, 158, 11, 0.15)'
                  : 'rgba(16, 185, 129, 0.15)',
                color: transfers.some((t) => t.processorProfileId === activeProfile.id && t.restrictedTransfer)
                  ? 'var(--status-warning)'
                  : 'var(--status-success)',
              }}
            >
              {transfers.some((t) => t.processorProfileId === activeProfile.id && t.restrictedTransfer)
                ? '⚠️ Involves Restricted Third-Country Transfers'
                : '🛡️ Local / Non-Restricted Transfers Only'}
            </span>
          </div>
        </div>
      )}

      {/* 4. Transfer Arrangements List */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading transfer arrangements...</div>
      ) : error ? (
        <div style={{ padding: '24px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)', borderRadius: '8px' }}>{error}</div>
      ) : filteredTransfers.length === 0 ? (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🌐</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>No transfer arrangements found</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            {selectedProfileId !== 'all' ? 'This processor currently has no transfer arrangements configured.' : 'No transfer records match your filter criteria.'}
          </div>
          <button
            onClick={handleOpenCreate}
            style={{
              marginTop: '16px',
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              padding: '8px 16px',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Create First Arrangement
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {filteredTransfers.map((t) => {
            const prof = profiles.find((p) => p.id === t.processorProfileId);
            const statusConfig = STATUSES.find((s) => s.value === t.transferMechanismStatus) || STATUSES[0];
            const mechanismConfig = MECHANISMS.find((m) => m.value === t.transferMechanismType);
            const completeness = evaluateTransferEvidenceCompleteness(t, evidenceList);

            return (
              <div
                key={t.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  border: '1px solid var(--border-color)',
                  borderRadius: '10px',
                  padding: '20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '14px',
                }}
              >
                {/* Arrangement Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '16px', fontWeight: 700 }}>{t.name}</span>

                      {/* Restricted Badge */}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: t.restrictedTransfer ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                          color: t.restrictedTransfer ? 'var(--status-danger)' : 'var(--status-success)',
                        }}
                      >
                        {t.restrictedTransfer ? '⚠️ RESTRICTED TRANSFER' : '🛡️ EEA / ADEQUATE'}
                      </span>

                      {/* Mechanism Status */}
                      <span
                        style={{
                          fontSize: '11px',
                          fontWeight: 600,
                          padding: '2px 8px',
                          borderRadius: '4px',
                          backgroundColor: `${statusConfig.color}20`,
                          color: statusConfig.color,
                        }}
                      >
                        {statusConfig.label}
                      </span>
                    </div>

                    <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                      Processor: <strong>{prof?.engagementName || t.processorProfileId}</strong> • EEA Status: <strong>{t.eeaStatus}</strong> • Effective:{' '}
                      {t.effectiveDate ? t.effectiveDate.slice(0, 10) : 'N/A'} • Review Due: {t.reviewDueDate ? t.reviewDueDate.slice(0, 10) : 'Not set'}
                    </div>
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <button
                      onClick={() => handleOpenLinkTia(t)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: t.linkedTiaId ? 'var(--bg-primary)' : 'rgba(245, 158, 11, 0.1)',
                        border: '1px solid var(--border-color)',
                        color: t.linkedTiaId ? 'var(--text-primary)' : 'var(--status-warning)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      {t.linkedTiaId ? '🔗 Linked TIA' : '➕ Link TIA'}
                    </button>

                    <button
                      onClick={() => handleOpenLinkEvidence(t)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--text-primary)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      📁 Link Evidence ({t.linkedEvidenceIds?.length || 0})
                    </button>

                    <button
                      onClick={() => handleOpenEdit(t)}
                      style={{
                        padding: '6px 12px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--accent-blue)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        fontWeight: 600,
                        cursor: 'pointer',
                      }}
                    >
                      ✏️ Edit
                    </button>

                    <button
                      onClick={() => handleDeleteTransfer(t)}
                      style={{
                        padding: '6px 10px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        color: 'var(--status-danger)',
                        borderRadius: '6px',
                        fontSize: '12px',
                        cursor: 'pointer',
                      }}
                    >
                      🗑️
                    </button>
                  </div>
                </div>

                {/* Details Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '14px', backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '8px' }}>
                  {/* Legal Mechanism */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>TRANSFER MECHANISM</div>
                    <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)', marginTop: '2px' }}>
                      {mechanismConfig?.label || t.transferMechanismType}
                    </div>
                  </div>

                  {/* Destination Countries */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>DESTINATION COUNTRIES</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {t.destinationCountries.map((c) => (
                        <span
                          key={c}
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'var(--bg-surface)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {c}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Transfer Scopes */}
                  <div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', fontWeight: 600 }}>PROCESSING SCOPES</div>
                    <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginTop: '4px' }}>
                      {t.transferScopes.map((s) => (
                        <span
                          key={s}
                          style={{
                            fontSize: '11px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(37, 99, 235, 0.1)',
                            color: 'var(--accent-blue)',
                          }}
                        >
                          {s}
                        </span>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Subprocessors & Supplementary Measures */}
                {(t.subprocessorInvolvement || t.supplementaryMeasuresSummary) && (
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    {t.subprocessorInvolvement && (
                      <div>
                        <strong>Subprocessors Involved:</strong>{' '}
                        {t.subprocessorsInvolved && t.subprocessorsInvolved.length > 0 ? t.subprocessorsInvolved.join(', ') : 'Yes (Specific subprocessor schedule pending)'}
                      </div>
                    )}
                    {t.supplementaryMeasuresSummary && (
                      <div>
                        <strong>Supplementary Technical & Organizational Measures:</strong> {t.supplementaryMeasuresSummary}
                      </div>
                    )}
                  </div>
                )}

                {/* Traceability & Governance Indicators */}
                <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', borderTop: '1px solid var(--border-color)', paddingTop: '10px', fontSize: '12px' }}>
                  {/* TIA Status */}
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>TIA Status: </span>
                    {t.linkedTiaId ? (
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>✅ Linked ({t.linkedTiaId})</span>
                    ) : t.restrictedTransfer ? (
                      <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>⚠️ Missing TIA Assessment</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not required (EEA/Adequate)</span>
                    )}
                  </div>

                  {/* Evidence Completeness */}
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Evidence Status: </span>
                    {completeness.isComplete ? (
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>✅ Complete ({t.linkedEvidenceIds?.length || 0} docs)</span>
                    ) : (
                      <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>
                        ⚠️ Incomplete ({completeness.missingCount} item{completeness.missingCount > 1 ? 's' : ''} required)
                      </span>
                    )}
                  </div>
                </div>

                {/* Governance Warnings Banner */}
                {(!completeness.isComplete || (t.restrictedTransfer && !t.linkedTiaId) || t.transferMechanismType === 'no_mechanism_selected') && (
                  <div
                    style={{
                      padding: '10px 14px',
                      backgroundColor: 'rgba(239, 68, 68, 0.08)',
                      border: '1px solid rgba(239, 68, 68, 0.2)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '4px',
                    }}
                  >
                    <div style={{ fontWeight: 600, color: 'var(--status-danger)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                      <span>⚠️</span> Governance Action Required:
                    </div>
                    {t.transferMechanismType === 'no_mechanism_selected' && (
                      <div style={{ color: 'var(--text-secondary)' }}>• No Chapter V transfer mechanism has been selected for this restricted transfer.</div>
                    )}
                    {t.restrictedTransfer && !t.linkedTiaId && (
                      <div style={{ color: 'var(--text-secondary)' }}>• Schrems II Transfer Impact Assessment (TIA) is missing for non-adequate third-country transfer.</div>
                    )}
                    {completeness.requirements
                      .filter((r) => r.status === 'missing' || r.status === 'expired')
                      .map((req) => (
                        <div key={req.key} style={{ color: 'var(--text-secondary)' }}>
                          • Missing / Expired Evidence: <strong>{req.label}</strong> ({req.category.toUpperCase()}) — {req.reason}
                        </div>
                      ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* 5. Create / Edit Transfer Modal */}
      {isEditModalOpen && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
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
              borderRadius: '12px',
              width: '100%',
              maxWidth: '680px',
              maxHeight: '90vh',
              overflowY: 'auto',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 700 }}>
                {editingTransfer ? '✏️ Edit Transfer Arrangement' : '➕ New Transfer Arrangement'}
              </h2>
              <button onClick={() => setIsEditModalOpen(false)} style={{ fontSize: '18px', color: 'var(--text-muted)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveTransfer} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* Name */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Arrangement Name *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g., US Telemetry & Cloud Storage Stream"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                  }}
                />
              </div>

              {/* Processor Selection */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Processor Profile *
                </label>
                <select
                  value={formProfileId}
                  onChange={(e) => setFormProfileId(e.target.value)}
                  required
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                  }}
                >
                  {profiles.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.engagementName || p.id} ({p.processorRole})
                    </option>
                  ))}
                </select>
              </div>

              {/* Restricted Transfer Toggle & EEA Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginTop: '12px' }}>
                    <input
                      type="checkbox"
                      checked={formRestrictedTransfer}
                      onChange={(e) => setFormRestrictedTransfer(e.target.checked)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />
                    <span style={{ fontSize: '13px', fontWeight: 600 }}>Restricted Transfer (Art. 44)</span>
                  </label>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Destination EEA Status
                  </label>
                  <select
                    value={formEeaStatus}
                    onChange={(e) => setFormEeaStatus(e.target.value as EEATransferStatus)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                    }}
                  >
                    <option value="third_country_non_adequate">Third Country (Non-Adequate)</option>
                    <option value="third_country_adequate">Third Country (Adequate EC Decision)</option>
                    <option value="eea_internal">EEA / EU Internal Transfer</option>
                  </select>
                </div>
              </div>

              {/* Destination Countries Multi-Builder */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Destination Countries (ISO Codes) *
                </label>
                <div style={{ display: 'flex', gap: '8px', marginBottom: '8px' }}>
                  <input
                    type="text"
                    placeholder="Enter 2-letter code (e.g. US)"
                    value={formCountryInput}
                    onChange={(e) => setFormCountryInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        handleAddCountry(formCountryInput);
                      }
                    }}
                    style={{
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '6px 12px',
                      fontSize: '13px',
                      width: '180px',
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => handleAddCountry(formCountryInput)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      cursor: 'pointer',
                    }}
                  >
                    Add Code
                  </button>
                </div>

                {/* Quick Add Buttons */}
                <div style={{ display: 'flex', gap: '4px', flexWrap: 'wrap', marginBottom: '8px' }}>
                  <span style={{ fontSize: '11px', color: 'var(--text-muted)', marginRight: '4px' }}>Quick Add:</span>
                  {COMMON_COUNTRIES.map((cc) => (
                    <button
                      key={cc.code}
                      type="button"
                      onClick={() => handleAddCountry(cc.code)}
                      style={{
                        fontSize: '10px',
                        padding: '2px 6px',
                        borderRadius: '4px',
                        border: '1px solid var(--border-color)',
                        backgroundColor: formCountries.includes(cc.code) ? 'rgba(37, 99, 235, 0.2)' : 'var(--bg-primary)',
                        color: formCountries.includes(cc.code) ? 'var(--accent-blue)' : 'var(--text-secondary)',
                        cursor: 'pointer',
                      }}
                    >
                      +{cc.code} ({cc.name.split(' ')[0]})
                    </button>
                  ))}
                </div>

                {/* Active Country Tags */}
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {formCountries.map((code) => (
                    <span
                      key={code}
                      style={{
                        fontSize: '12px',
                        fontWeight: 600,
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        padding: '4px 8px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                      }}
                    >
                      {code}
                      <button type="button" onClick={() => handleRemoveCountry(code)} style={{ color: 'var(--status-danger)', cursor: 'pointer' }}>
                        ✕
                      </button>
                    </span>
                  ))}
                </div>
              </div>

              {/* Transfer Scopes Multi-Select */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                  Transfer Processing Scopes *
                </label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
                  {SCOPES.map((sc) => (
                    <label key={sc.value} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '12px', cursor: 'pointer' }}>
                      <input
                        type="checkbox"
                        checked={formScopes.includes(sc.value)}
                        onChange={() => handleToggleScope(sc.value)}
                        style={{ cursor: 'pointer' }}
                      />
                      <span>{sc.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              {/* Transfer Mechanism & Mechanism Status */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Transfer Safeguard Mechanism *
                  </label>
                  <select
                    value={formMechanismType}
                    onChange={(e) => setFormMechanismType(e.target.value as TransferMechanismType)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                    }}
                  >
                    {MECHANISMS.map((m) => (
                      <option key={m.value} value={m.value}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Mechanism Status *
                  </label>
                  <select
                    value={formMechanismStatus}
                    onChange={(e) => setFormMechanismStatus(e.target.value as TransferMechanismStatus)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                    }}
                  >
                    {STATUSES.map((s) => (
                      <option key={s.value} value={s.value}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Effective Date
                  </label>
                  <input
                    type="date"
                    value={formEffectiveDate}
                    onChange={(e) => setFormEffectiveDate(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                    }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                    Scheduled Review Due Date
                  </label>
                  <input
                    type="date"
                    value={formReviewDueDate}
                    onChange={(e) => setFormReviewDueDate(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                    }}
                  />
                </div>
              </div>

              {/* Subprocessor Involvement */}
              <div>
                <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', marginBottom: '6px' }}>
                  <input
                    type="checkbox"
                    checked={formSubprocessorInvolvement}
                    onChange={(e) => setFormSubprocessorInvolvement(e.target.checked)}
                    style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                  />
                  <span style={{ fontSize: '13px', fontWeight: 600 }}>Subprocessors Involved in Onward Transfer</span>
                </label>
                {formSubprocessorInvolvement && (
                  <input
                    type="text"
                    placeholder="Comma-separated subprocessor vendor IDs / names (e.g. AWS US-East, Twilio Inc.)"
                    value={formSubprocessorsText}
                    onChange={(e) => setFormSubprocessorsText(e.target.value)}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--bg-primary)',
                      color: 'var(--text-primary)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '6px',
                      padding: '8px 12px',
                      fontSize: '13px',
                      marginTop: '4px',
                    }}
                  />
                )}
              </div>

              {/* Supplementary Measures */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Supplementary Technical & Organizational Measures (Schrems II)
                </label>
                <textarea
                  rows={2}
                  placeholder="e.g., End-to-end payload encryption with HSM-managed keys in EU, pseudonymization, no government surveillance access clauses."
                  value={formSupplementaryMeasures}
                  onChange={(e) => setFormSupplementaryMeasures(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Rationale & Notes */}
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '4px' }}>
                  Legal Transfer Rationale & Operational Notes
                </label>
                <textarea
                  rows={2}
                  placeholder="Additional context or internal compliance rationale..."
                  value={formRationale}
                  onChange={(e) => setFormRationale(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                    resize: 'vertical',
                  }}
                />
              </div>

              {/* Action Buttons */}
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  disabled={modalLoading}
                  style={{
                    padding: '8px 16px',
                    backgroundColor: 'transparent',
                    border: '1px solid var(--border-color)',
                    color: 'var(--text-secondary)',
                    borderRadius: '6px',
                    fontSize: '13px',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={modalLoading}
                  style={{
                    padding: '8px 20px',
                    backgroundColor: 'var(--accent-blue)',
                    color: '#fff',
                    borderRadius: '6px',
                    fontSize: '13px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {modalLoading ? 'Saving...' : editingTransfer ? 'Update Arrangement' : 'Create Arrangement'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Link TIA Modal */}
      {isLinkTiaModalOpen && targetTransferForTia && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
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
              borderRadius: '12px',
              width: '100%',
              maxWidth: '520px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>🔗 Link Transfer Impact Assessment (TIA)</h2>
              <button onClick={() => setIsLinkTiaModalOpen(false)} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Link an executed Schrems II Transfer Impact Assessment to transfer arrangement <strong>"{targetTransferForTia.name}"</strong>.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Select Assessment Record:
              </label>
              {tiasList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px' }}>
                  No existing TIAs found in tenant. You can link a TIA once created in the Privacy module.
                </div>
              ) : (
                <select
                  value={selectedTiaIdToLink}
                  onChange={(e) => setSelectedTiaIdToLink(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                  }}
                >
                  <option value="">-- Choose TIA Assessment --</option>
                  {tiasList.map((tia) => (
                    <option key={tia.id} value={tia.id}>
                      {tia.code}: {tia.title || tia.destinationCountry} ({tia.status})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsLinkTiaModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteLinkTia}
                disabled={modalLoading || !selectedTiaIdToLink}
                style={{
                  padding: '8px 18px',
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {modalLoading ? 'Linking...' : 'Link Assessment'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Link Evidence Modal */}
      {isLinkEvidenceModalOpen && targetTransferForEvidence && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            backgroundColor: 'rgba(0,0,0,0.7)',
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
              borderRadius: '12px',
              width: '100%',
              maxWidth: '540px',
              padding: '24px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700 }}>📁 Link Safeguard Evidence Document</h2>
              <button onClick={() => setIsLinkEvidenceModalOpen(false)} style={{ color: 'var(--text-muted)', cursor: 'pointer' }}>
                ✕
              </button>
            </div>

            <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              Attach a verified DPA, signed Standard Contractual Clauses (SCC), TOMs audit, or ISO/SOC report to transfer{' '}
              <strong>"{targetTransferForEvidence.name}"</strong>.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: '6px' }}>
                Select Evidence Document:
              </label>
              {evidenceList.length === 0 ? (
                <div style={{ fontSize: '13px', color: 'var(--text-muted)', padding: '12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px' }}>
                  No evidence documents found in tenant repository.
                </div>
              ) : (
                <select
                  value={selectedEvidenceIdToLink}
                  onChange={(e) => setSelectedEvidenceIdToLink(e.target.value)}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--bg-primary)',
                    color: 'var(--text-primary)',
                    border: '1px solid var(--border-color)',
                    borderRadius: '6px',
                    padding: '8px 12px',
                    fontSize: '13px',
                  }}
                >
                  <option value="">-- Choose Evidence Document --</option>
                  {evidenceList.map((ev) => (
                    <option key={ev.id} value={ev.id}>
                      [{ev.category?.toUpperCase()}] {ev.title} (v{ev.currentVersion || 1})
                    </option>
                  ))}
                </select>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsLinkEvidenceModalOpen(false)}
                style={{
                  padding: '8px 16px',
                  backgroundColor: 'transparent',
                  border: '1px solid var(--border-color)',
                  color: 'var(--text-secondary)',
                  borderRadius: '6px',
                  fontSize: '13px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteLinkEvidence}
                disabled={modalLoading || !selectedEvidenceIdToLink}
                style={{
                  padding: '8px 18px',
                  backgroundColor: 'var(--accent-blue)',
                  color: '#fff',
                  borderRadius: '6px',
                  fontSize: '13px',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {modalLoading ? 'Attaching...' : 'Attach Evidence'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

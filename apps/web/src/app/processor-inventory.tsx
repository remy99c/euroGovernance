'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  ProcessorInventoryItem,
  ProcessorStatus,
  ProcessorCriticality,
  TransferMechanismType,
  SystemAsset,
} from '@eurogovernance/shared-types';
import { UIPageHeader } from './components/ui-page-header';
import { UIStatCard, UIStatGrid } from './components/ui-stat-card';
import { UIFilterBar } from './components/ui-filter-bar';
import { UIBadge, UIStatusBadge, UIRiskBadge } from './components/ui-badge';

interface ProcessorInventoryProps {
  tenantId: string;
  onSelectProcessorForHub?: (processorProfileId: string) => void;
  onNavigateToTransfers?: (processorProfileId?: string) => void;
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

export default function ProcessorInventory({
  tenantId,
  onSelectProcessorForHub,
  onNavigateToTransfers,
  onNotice,
}: ProcessorInventoryProps) {
  // State
  const [items, setItems] = useState<ProcessorInventoryItem[]>([]);
  const [systems, setSystems] = useState<SystemAsset[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Filter States
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [criticalityFilter, setCriticalityFilter] = useState<string>('all');
  const [restrictedFilter, setRestrictedFilter] = useState<string>('all');
  const [mechanismFilter, setMechanismFilter] = useState<string>('all');
  const [tiaStatusFilter, setTiaStatusFilter] = useState<string>('all');
  const [reviewStatusFilter, setReviewStatusFilter] = useState<string>('all');
  const [missingEvidenceFilter, setMissingEvidenceFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [systemFilter, setSystemFilter] = useState<string>('all');

  // Load Inventory Data via Server-Side Correlated Query
  const fetchInventory = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      // Build parameters for server-side query
      const params: any = { tenantId };
      if (statusFilter !== 'all') params.status = statusFilter as ProcessorStatus;
      if (criticalityFilter !== 'all') params.criticality = criticalityFilter as ProcessorCriticality;
      if (restrictedFilter === 'restricted') params.restrictedTransfer = true;
      if (restrictedFilter === 'eea') params.restrictedTransfer = false;
      if (mechanismFilter !== 'all') params.transferMechanismType = mechanismFilter as TransferMechanismType;
      if (tiaStatusFilter !== 'all') params.tiaStatus = tiaStatusFilter;
      if (reviewStatusFilter !== 'all') params.reviewStatus = reviewStatusFilter;
      if (missingEvidenceFilter === 'missing') params.missingEvidence = true;
      if (missingEvidenceFilter === 'complete') params.missingEvidence = false;
      if (countryFilter !== 'all') params.destinationCountry = countryFilter;
      if (systemFilter !== 'all') params.linkedSystemAssetId = systemFilter;
      if (searchQuery.trim()) params.searchQuery = searchQuery.trim();

      const listInvFn = httpsCallable(functions, 'listTenantProcessorInventory');
      const res: any = await listInvFn(params);
      setItems(res.data?.items || []);

      // Also load systems once for dropdown filter
      if (systems.length === 0) {
        try {
          const listSysFn = httpsCallable(functions, 'listTenantSystemAssets');
          const sysRes: any = await listSysFn({ tenantId });
          setSystems(sysRes.data?.assets || []);
        } catch {
          // ignore
        }
      }
    } catch (err: any) {
      console.error('Failed to load processor inventory:', err);
      setError(err.message || 'Failed to load processor inventory.');
    } finally {
      setLoading(false);
    }
  }, [
    tenantId,
    statusFilter,
    criticalityFilter,
    restrictedFilter,
    mechanismFilter,
    tiaStatusFilter,
    reviewStatusFilter,
    missingEvidenceFilter,
    countryFilter,
    systemFilter,
    searchQuery,
    systems.length,
  ]);

  useEffect(() => {
    fetchInventory();
  }, [fetchInventory]);

  // Overall Aggregate Metrics
  const metrics = useMemo(() => {
    const total = items.length;
    const restricted = items.filter((i) => i.hasRestrictedTransfer).length;
    const missingEvidence = items.filter((i) => !i.evidenceCompleteness.isComplete).length;
    const overdue = items.filter((i) => i.isReviewOverdue).length;
    const criticalRisk = items.filter(
      (i) => i.governanceRiskLevel === 'critical' || i.profile.criticality === 'critical'
    ).length;

    return { total, restricted, missingEvidence, overdue, criticalRisk };
  }, [items]);

  const handleResetFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setCriticalityFilter('all');
    setRestrictedFilter('all');
    setMechanismFilter('all');
    setTiaStatusFilter('all');
    setReviewStatusFilter('all');
    setMissingEvidenceFilter('all');
    setCountryFilter('all');
    setSystemFilter('all');
  };

  return (
    <div style={{ maxWidth: '1360px', margin: '0 auto', padding: '16px 0' }}>
      {/* 1. Standard Page Header */}
      <UIPageHeader
        title="GDPR Article 28 Processor Inventory"
        description="Comprehensive audit registry of all external data processors, sub-processors, transfer safeguards, and evidence coverage."
        primaryAction={
          onNavigateToTransfers
            ? {
                label: 'Transfer Arrangements',
                icon: '🌍',
                onClick: () => onNavigateToTransfers(),
              }
            : undefined
        }
        secondaryActions={[
          {
            label: loading ? 'Refreshing...' : 'Refresh',
            icon: '🔄',
            onClick: fetchInventory,
            variant: 'secondary',
            disabled: loading,
          },
        ]}
      />

      {/* 2. Standardized KPI Metrics Grid */}
      <UIStatGrid columns={5}>
        <UIStatCard
          label="Total Processors"
          value={metrics.total}
          subtext="Article 28 registry"
          valueColor="var(--accent-primary)"
        />
        <UIStatCard
          label="Restricted Transfers"
          value={metrics.restricted}
          subtext="Third-country recipients"
          valueColor={metrics.restricted > 0 ? 'var(--status-warning-fg)' : 'var(--status-compliant-fg)'}
          onClick={() => setRestrictedFilter(restrictedFilter === 'restricted' ? 'all' : 'restricted')}
        />
        <UIStatCard
          label="Missing Evidence"
          value={metrics.missingEvidence}
          subtext="Unverified DPA/TOMs"
          valueColor={metrics.missingEvidence > 0 ? 'var(--status-critical-fg)' : 'var(--status-compliant-fg)'}
          zeroStateText="Zero missing evidence"
          onClick={() => setMissingEvidenceFilter(missingEvidenceFilter === 'missing' ? 'all' : 'missing')}
        />
        <UIStatCard
          label="Overdue Reviews"
          value={metrics.overdue}
          subtext="Past periodic review date"
          valueColor={metrics.overdue > 0 ? 'var(--status-critical-fg)' : 'var(--text-muted)'}
          zeroStateText="Zero overdue reviews"
          onClick={() => setReviewStatusFilter(reviewStatusFilter === 'overdue' ? 'all' : 'overdue')}
        />
        <UIStatCard
          label="Critical Risk Tier"
          value={metrics.criticalRisk}
          subtext="High statutory impact"
          valueColor={metrics.criticalRisk > 0 ? 'var(--status-critical-fg)' : 'var(--text-muted)'}
          onClick={() => setCriticalityFilter(criticalityFilter === 'critical' ? 'all' : 'critical')}
        />
      </UIStatGrid>

      {/* 3. Comprehensive Filter Toolbar */}
      <div
        style={{
          backgroundColor: 'var(--bg-surface)',
          border: '1px solid var(--border-color)',
          borderRadius: '8px',
          padding: '16px',
          marginBottom: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
        }}
      >
        {/* Row 1: Search & Primary Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* Search */}
          <input
            type="text"
            placeholder="🔍 Search processor name, vendor, country, system..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 12px',
              fontSize: '13px',
              minWidth: '280px',
              flex: '1',
            }}
          />

          {/* Status */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Status: All</option>
            <option value="active">Active</option>
            <option value="under_review">Under Review</option>
            <option value="restricted">Restricted</option>
            <option value="suspended">Suspended</option>
            <option value="offboarded">Offboarded</option>
          </select>

          {/* Criticality */}
          <select
            value={criticalityFilter}
            onChange={(e) => setCriticalityFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Criticality: All</option>
            <option value="critical">Critical</option>
            <option value="high">High</option>
            <option value="medium">Medium</option>
            <option value="low">Low</option>
          </select>

          {/* Restricted Transfer */}
          <select
            value={restrictedFilter}
            onChange={(e) => setRestrictedFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Transfer Type: All</option>
            <option value="restricted">⚠️ Restricted Transfers Only</option>
            <option value="eea">🛡️ EEA / Local Only</option>
          </select>

          {/* Transfer Mechanism */}
          <select
            value={mechanismFilter}
            onChange={(e) => setMechanismFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Mechanism: All</option>
            <option value="standard_contractual_clauses">Standard Contractual Clauses</option>
            <option value="adequacy_decision">Adequacy Decision</option>
            <option value="binding_corporate_rules">Binding Corporate Rules</option>
            <option value="derogation_art49">Derogation (Art. 49)</option>
            <option value="intra_group_agreement">Intra-Group Agreement</option>
            <option value="no_mechanism_selected">No Mechanism Selected</option>
          </select>
        </div>

        {/* Row 2: Secondary & Relational Filters */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', alignItems: 'center' }}>
          {/* TIA Status */}
          <select
            value={tiaStatusFilter}
            onChange={(e) => setTiaStatusFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">TIA Status: All</option>
            <option value="has_approved_tia">✅ Approved TIA</option>
            <option value="has_in_review_tia">🔄 In Review TIA</option>
            <option value="missing_tia">⚠️ Missing TIA</option>
            <option value="not_required">Not Required</option>
          </select>

          {/* Review Due / Overdue */}
          <select
            value={reviewStatusFilter}
            onChange={(e) => setReviewStatusFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Review Due: All</option>
            <option value="overdue">⚠️ Overdue for Review</option>
            <option value="due_soon_30d">⏳ Due in 30 Days</option>
            <option value="due_soon_90d">📅 Due in 90 Days</option>
            <option value="on_track">✅ On Track</option>
            <option value="no_review_scheduled">No Review Scheduled</option>
          </select>

          {/* Missing Evidence */}
          <select
            value={missingEvidenceFilter}
            onChange={(e) => setMissingEvidenceFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Evidence: All</option>
            <option value="missing">⚠️ Missing Evidence</option>
            <option value="complete">✅ Evidence Complete</option>
          </select>

          {/* Destination Country */}
          <select
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Destination: All Countries</option>
            {COMMON_COUNTRIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} - {c.name}
              </option>
            ))}
          </select>

          {/* Linked System Asset */}
          <select
            value={systemFilter}
            onChange={(e) => setSystemFilter(e.target.value)}
            style={{
              backgroundColor: 'var(--bg-primary)',
              color: 'var(--text-primary)',
              border: '1px solid var(--border-color)',
              borderRadius: '6px',
              padding: '6px 10px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            <option value="all">Linked System: All</option>
            {systems.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} ({s.criticality})
              </option>
            ))}
          </select>

          {/* Reset Filters */}
          <button
            onClick={handleResetFilters}
            style={{
              padding: '6px 10px',
              backgroundColor: 'transparent',
              border: '1px solid var(--border-color)',
              color: 'var(--text-muted)',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Clear Filters
          </button>
        </div>
      </div>

      {/* 4. Processor Inventory Table */}
      {loading ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading processor inventory...</div>
      ) : error ? (
        <div style={{ padding: '24px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)', borderRadius: '8px' }}>{error}</div>
      ) : items.length === 0 ? (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏢</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>No processors found matching filters</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Try adjusting your search query or relaxing your filter parameters.
          </div>
          <button
            onClick={handleResetFilters}
            style={{
              marginTop: '14px',
              padding: '6px 14px',
              backgroundColor: 'var(--accent-blue)',
              color: '#fff',
              borderRadius: '6px',
              fontSize: '12px',
              cursor: 'pointer',
            }}
          >
            Reset All Filters
          </button>
        </div>
      ) : (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border-color)', backgroundColor: 'var(--bg-primary)', color: 'var(--text-muted)' }}>
                <th style={{ padding: '12px 16px', fontWeight: 600 }}>PROCESSOR & VENDOR</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>ROLE & CRITICALITY</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>TRANSFERS & MECHANISMS</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>TIA STATUS</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>EVIDENCE HEALTH</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>REVIEW DUE</th>
                <th style={{ padding: '12px 14px', fontWeight: 600 }}>SUPPORTED SYSTEMS</th>
                <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: 600 }}>ACTIONS</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <tr
                  key={item.profile.id}
                  style={{
                    borderBottom: '1px solid var(--border-color)',
                    transition: 'background-color 0.15s ease',
                  }}
                >
                  {/* Processor & Vendor */}
                  <td style={{ padding: '14px 16px' }}>
                    <div style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{item.profile.engagementName || item.profile.id}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '11px', marginTop: '2px' }}>
                      Vendor: <strong>{item.vendorName || item.profile.vendorId}</strong>
                      {item.vendorRiskTier && (
                        <span style={{ marginLeft: '4px', color: 'var(--text-muted)' }}>({item.vendorRiskTier})</span>
                      )}
                    </div>
                  </td>

                  {/* Role & Criticality */}
                  <td style={{ padding: '14px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <span style={{ fontSize: '11px', color: 'var(--text-primary)' }}>{item.profile.processorRole.replace(/_/g, ' ')}</span>
                      <span
                        style={{
                          fontSize: '10px',
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: '4px',
                          alignSelf: 'flex-start',
                          backgroundColor:
                            item.profile.criticality === 'critical'
                              ? 'rgba(239, 68, 68, 0.15)'
                              : item.profile.criticality === 'high'
                              ? 'rgba(245, 158, 11, 0.15)'
                              : 'rgba(16, 185, 129, 0.15)',
                          color:
                            item.profile.criticality === 'critical'
                              ? 'var(--status-danger)'
                              : item.profile.criticality === 'high'
                              ? 'var(--status-warning)'
                              : 'var(--status-success)',
                        }}
                      >
                        {item.profile.criticality.toUpperCase()}
                      </span>
                    </div>
                  </td>

                  {/* Transfers & Mechanisms */}
                  <td style={{ padding: '14px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span
                          style={{
                            fontSize: '10px',
                            fontWeight: 600,
                            padding: '1px 5px',
                            borderRadius: '4px',
                            backgroundColor: item.hasRestrictedTransfer ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: item.hasRestrictedTransfer ? 'var(--status-danger)' : 'var(--status-success)',
                          }}
                        >
                          {item.hasRestrictedTransfer ? '⚠️ RESTRICTED' : '🛡️ EEA'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>({item.transferArrangementsCount} streams)</span>
                      </div>

                      {item.destinationCountries.length > 0 && (
                        <div style={{ display: 'flex', gap: '2px', flexWrap: 'wrap' }}>
                          {item.destinationCountries.map((c: string) => (
                            <span key={c} style={{ fontSize: '10px', padding: '1px 4px', backgroundColor: 'var(--bg-primary)', borderRadius: '3px' }}>
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </td>

                  {/* TIA Status */}
                  <td style={{ padding: '14px 14px' }}>
                    {item.tiaStatus === 'approved' ? (
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>✅ Approved</span>
                    ) : item.tiaStatus === 'in_review' ? (
                      <span style={{ color: 'var(--status-warning)', fontWeight: 600 }}>🔄 In Review</span>
                    ) : item.tiaStatus === 'missing' ? (
                      <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>⚠️ Missing TIA</span>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>Not required</span>
                    )}
                  </td>

                  {/* Evidence Health */}
                  <td style={{ padding: '14px 14px' }}>
                    {item.evidenceCompleteness.isComplete ? (
                      <span style={{ color: 'var(--status-success)', fontWeight: 600 }}>✅ Complete</span>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>
                          ⚠️ {item.evidenceCompleteness.missingCount} Missing
                        </span>
                        <span style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                          {item.evidenceCompleteness.missingCategories.join(', ')}
                        </span>
                      </div>
                    )}
                  </td>

                  {/* Review Due */}
                  <td style={{ padding: '14px 14px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span style={{ fontWeight: 600, color: item.isReviewOverdue ? 'var(--status-danger)' : 'var(--text-primary)' }}>
                        {item.profile.nextReviewDate ? item.profile.nextReviewDate.slice(0, 10) : 'Not scheduled'}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          color:
                            item.reviewStatus === 'overdue'
                              ? 'var(--status-danger)'
                              : item.reviewStatus === 'due_soon_30d'
                              ? 'var(--status-warning)'
                              : 'var(--text-muted)',
                        }}
                      >
                        {item.reviewStatus === 'overdue'
                          ? '⚠️ OVERDUE'
                          : item.reviewStatus === 'due_soon_30d'
                          ? '⏳ Due in 30d'
                          : item.reviewStatus === 'due_soon_90d'
                          ? '📅 Due in 90d'
                          : item.reviewStatus === 'on_track'
                          ? 'On Track'
                          : 'No Date'}
                      </span>
                    </div>
                  </td>

                  {/* Supported Systems */}
                  <td style={{ padding: '14px 14px' }}>
                    {item.linkedSystemNames.length > 0 ? (
                      <div style={{ display: 'flex', gap: '3px', flexWrap: 'wrap' }}>
                        {item.linkedSystemNames.map((name: string, i: number) => (
                          <span key={i} style={{ fontSize: '11px', color: 'var(--text-secondary)' }}>
                            • {name}
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span style={{ color: 'var(--text-muted)' }}>None linked</span>
                    )}
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                    <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                      {onSelectProcessorForHub && (
                        <button
                          onClick={() => onSelectProcessorForHub(item.profile.id)}
                          style={{
                            padding: '4px 10px',
                            backgroundColor: 'var(--bg-primary)',
                            border: '1px solid var(--border-color)',
                            color: 'var(--accent-blue)',
                            borderRadius: '4px',
                            fontSize: '11px',
                            fontWeight: 600,
                            cursor: 'pointer',
                          }}
                        >
                          Open Hub →
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

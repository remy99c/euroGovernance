'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import {
  ProcessorProfile,
  Vendor,
  TransferArrangement,
  SystemAsset,
  ROPAEntry,
  DPIA,
  TIA,
  PersonalDataBreach,
  Evidence,
  Risk,
  evaluateProcessorEvidenceCompleteness,
  evaluateProcessorRiskFlags,
  evaluateProcessorReminders,
  ProcessorSystemRelationship,
  ProcessorEvidenceCompleteness,
  ProcessorEvidenceRequirement,
} from '@eurogovernance/shared-types';

interface ProcessorGovernanceHubProps {
  tenantId: string;
  initialProcessorProfileId?: string;
  onNavigateToTab?: (tabId: string) => void;
  onNotice?: (msg: string) => void;
}

export default function ProcessorGovernanceHub({
  tenantId,
  initialProcessorProfileId,
  onNavigateToTab,
  onNotice,
}: ProcessorGovernanceHubProps) {
  // Master selection
  const [selectedProfileId, setSelectedProfileId] = useState<string>(initialProcessorProfileId || '');
  const [profiles, setProfiles] = useState<ProcessorProfile[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);

  // Detailed Relationship Data for Active Processor
  const [activeProfile, setActiveProfile] = useState<ProcessorProfile | null>(null);
  const [activeVendor, setActiveVendor] = useState<Vendor | null>(null);
  const [systems, setSystems] = useState<{ asset: SystemAsset; relationships: ProcessorSystemRelationship[] }[]>([]);
  const [ropaList, setRopaList] = useState<ROPAEntry[]>([]);
  const [dpiaList, setDpiaList] = useState<DPIA[]>([]);
  const [tiasList, setTiasList] = useState<TIA[]>([]);
  const [breaches, setBreaches] = useState<PersonalDataBreach[]>([]);
  const [transfers, setTransfers] = useState<TransferArrangement[]>([]);
  const [evidenceList, setEvidenceList] = useState<Evidence[]>([]);
  const [risksList, setRisksList] = useState<Risk[]>([]);
  const [evidenceSummary, setEvidenceSummary] = useState<ProcessorEvidenceCompleteness | null>(null);

  // Loading & Error States
  const [loadingList, setLoadingList] = useState<boolean>(true);
  const [loadingDetails, setLoadingDetails] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Active View Tab inside Hub
  const [hubTab, setHubTab] = useState<
    'overview' | 'transfers' | 'systems' | 'ropa_dpia' | 'evidence' | 'risks_incidents'
  >('overview');

  const showMsg = (msg: string) => {
    if (onNotice) onNotice(msg);
  };

  // 1. Initial Load of Processor Profiles & Vendors
  const loadInitialLists = useCallback(async () => {
    if (!tenantId) return;
    setLoadingList(true);
    setError(null);

    try {
      const listProfsFn = httpsCallable(functions, 'listTenantProcessorProfiles');
      const pRes: any = await listProfsFn({ tenantId });
      const profs: ProcessorProfile[] = pRes.data?.profiles || [];
      setProfiles(profs);

      const listVendorsFn = httpsCallable(functions, 'listTenantVendors');
      const vRes: any = await listVendorsFn({ tenantId });
      const vends: Vendor[] = vRes.data?.vendors || [];
      setVendors(vends);

      if (profs.length > 0 && !selectedProfileId) {
        setSelectedProfileId(profs[0].id);
      }
    } catch (err: any) {
      console.error('Failed to load processor profiles list:', err);
      setError(err.message || 'Failed to load processor profiles.');
    } finally {
      setLoadingList(false);
    }
  }, [tenantId, selectedProfileId]);

  useEffect(() => {
    loadInitialLists();
  }, [loadInitialLists]);

  // 2. Deep Load Details for Selected Processor Profile
  const loadProcessorDetails = useCallback(async (profId: string) => {
    if (!tenantId || !profId) return;
    setLoadingDetails(true);

    try {
      // Find base profile
      const prof = profiles.find((p) => p.id === profId) || null;
      setActiveProfile(prof);

      // Find matching vendor
      if (prof?.vendorId) {
        const vend = vendors.find((v) => v.id === prof.vendorId) || null;
        setActiveVendor(vend);
      } else {
        setActiveVendor(null);
      }

      // Parallel Data Fetching for All Operational Dimensions
      const [
        systemsRes,
        ropaRes,
        transfersRes,
        breachesRes,
        evSummaryRes,
        evListRes,
        risksRes,
        tiasRes,
        dpiasRes,
      ] = await Promise.allSettled([
        httpsCallable(functions, 'getSystemsForProcessorProfile')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'getROPAForProcessorProfile')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'listTenantTransferArrangements')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'getProcessorBreachHistory')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'getProcessorEvidenceSummary')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'listTenantEvidence')({ tenantId }),
        httpsCallable(functions, 'listTenantRisks')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'listTenantTIAs')({ tenantId, processorProfileId: profId }),
        httpsCallable(functions, 'listTenantDPIAs')({ tenantId }),
      ]);

      // Systems
      if (systemsRes.status === 'fulfilled') {
        const d: any = systemsRes.value.data;
        setSystems(d.systems || []);
      } else {
        setSystems([]);
      }

      // ROPA
      if (ropaRes.status === 'fulfilled') {
        const d: any = ropaRes.value.data;
        setRopaList(d.ropaEntries || []);
      } else {
        setRopaList([]);
      }

      // Transfers
      let curTransfers: TransferArrangement[] = [];
      if (transfersRes.status === 'fulfilled') {
        const d: any = transfersRes.value.data;
        curTransfers = d.arrangements || [];
        setTransfers(curTransfers);
      } else {
        setTransfers([]);
      }

      // Breaches
      if (breachesRes.status === 'fulfilled') {
        const d: any = breachesRes.value.data;
        setBreaches(d.breaches || []);
      } else {
        setBreaches([]);
      }

      // Evidence Summary
      if (evSummaryRes.status === 'fulfilled') {
        const d: any = evSummaryRes.value.data;
        setEvidenceSummary(d.summary || null);
      } else {
        setEvidenceSummary(null);
      }

      // All Evidence
      let curEvidence: Evidence[] = [];
      if (evListRes.status === 'fulfilled') {
        const d: any = evListRes.value.data;
        curEvidence = d.evidence || [];
        setEvidenceList(curEvidence);
      } else {
        setEvidenceList([]);
      }

      // Risks
      if (risksRes.status === 'fulfilled') {
        const d: any = risksRes.value.data;
        setRisksList(d.risks || []);
      } else {
        setRisksList([]);
      }

      // TIAs
      if (tiasRes.status === 'fulfilled') {
        const d: any = tiasRes.value.data;
        setTiasList(d.tias || []);
      } else {
        setTiasList([]);
      }

      // DPIAs
      if (dpiasRes.status === 'fulfilled') {
        const d: any = dpiasRes.value.data;
        const allDpias: DPIA[] = d.dpias || [];
        const relevantDpias = allDpias.filter((dpia) => dpia.processorProfileIds?.includes(profId));
        setDpiaList(relevantDpias);
      } else {
        setDpiaList([]);
      }
    } catch (err: any) {
      console.error('Failed to load processor full governance context:', err);
    } finally {
      setLoadingDetails(false);
    }
  }, [tenantId, profiles, vendors]);

  useEffect(() => {
    if (selectedProfileId) {
      loadProcessorDetails(selectedProfileId);
    }
  }, [selectedProfileId, loadProcessorDetails]);

  // Derived Governance Intelligence
  const governanceSynthesis = useMemo(() => {
    if (!activeProfile) return null;

    const evidenceEval = evaluateProcessorEvidenceCompleteness(activeProfile, evidenceList);
    const riskEval = evaluateProcessorRiskFlags(activeProfile, transfers, evidenceList);
    const reminderEval = evaluateProcessorReminders(activeProfile, transfers, evidenceList, { windowDays: 30 });

    const hasRestrictedTransfers = transfers.some((t) => t.restrictedTransfer);
    const missingTiaCount = transfers.filter((t) => t.restrictedTransfer && !t.linkedTiaId).length;
    const isDpaMissing = !activeProfile.dpaSigned;

    return {
      evidenceEval,
      riskEval,
      reminderEval,
      hasRestrictedTransfers,
      missingTiaCount,
      isDpaMissing,
    };
  }, [activeProfile, transfers, evidenceList]);

  // Refresh handler
  const handleRefresh = () => {
    if (selectedProfileId) {
      loadProcessorDetails(selectedProfileId);
      showMsg('Governance data refreshed.');
    }
  };

  return (
    <div style={{ maxWidth: '1280px', margin: '0 auto', padding: '16px 0' }}>
      {/* 1. Header & Selector Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span>🏢</span> Processor Governance & Operational Hub
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Centralized multi-dimensional privacy, commercial vendor, systems, ROPA, DPIA, TIA, breach, evidence, and third-party risk tracking.
          </p>
        </div>

        {/* Processor Selector Dropdown */}
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-secondary)' }}>Select Processor:</span>
            <select
              value={selectedProfileId}
              onChange={(e) => setSelectedProfileId(e.target.value)}
              disabled={loadingList || profiles.length === 0}
              style={{
                backgroundColor: 'var(--bg-surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border-color)',
                borderRadius: '6px',
                padding: '8px 12px',
                fontSize: '13px',
                fontWeight: 600,
                minWidth: '260px',
                cursor: 'pointer',
              }}
            >
              {profiles.length === 0 && <option value="">No processors registered</option>}
              {profiles.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.engagementName || p.id} ({p.processorRole})
                </option>
              ))}
            </select>
          </div>

          <button
            onClick={handleRefresh}
            disabled={loadingDetails}
            style={{
              padding: '8px 12px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              fontSize: '13px',
              cursor: 'pointer',
            }}
          >
            {loadingDetails ? '🔄 Loading...' : '🔄 Refresh'}
          </button>

          {onNavigateToTab && (
            <button
              onClick={() => onNavigateToTab('processor_transfers')}
              style={{
                padding: '8px 14px',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '13px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🌍 Manage Transfers
            </button>
          )}
        </div>
      </div>

      {loadingList ? (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text-secondary)' }}>Loading processor hub...</div>
      ) : error ? (
        <div style={{ padding: '24px', backgroundColor: 'rgba(239, 68, 68, 0.1)', color: 'var(--status-danger)', borderRadius: '8px' }}>{error}</div>
      ) : !activeProfile ? (
        <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '40px', textAlign: 'center' }}>
          <div style={{ fontSize: '32px', marginBottom: '8px' }}>🏢</div>
          <div style={{ fontSize: '15px', fontWeight: 600 }}>No Processor Profile Selected</div>
          <div style={{ fontSize: '13px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Please select a processor profile from the dropdown above or create one from the Vendor management view.
          </div>
        </div>
      ) : (
        <div>
          {/* 2. Top Banner: Vendor Basics & Processor Metadata Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', marginBottom: '20px' }}>
            {/* Card 1: Commercial Vendor Master */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Commercial Vendor Master
                </span>
                {activeVendor?.riskTier && (
                  <span
                    style={{
                      fontSize: '11px',
                      fontWeight: 600,
                      padding: '2px 8px',
                      borderRadius: '4px',
                      backgroundColor:
                        activeVendor.riskTier === 'critical'
                          ? 'rgba(239, 68, 68, 0.15)'
                          : activeVendor.riskTier === 'high'
                          ? 'rgba(245, 158, 11, 0.15)'
                          : 'rgba(16, 185, 129, 0.15)',
                      color:
                        activeVendor.riskTier === 'critical'
                          ? 'var(--status-danger)'
                          : activeVendor.riskTier === 'high'
                          ? 'var(--status-warning)'
                          : 'var(--status-success)',
                    }}
                  >
                    {activeVendor.riskTier.replace(/_/g, ' ').toUpperCase()} RISK
                  </span>
                )}
              </div>

              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>{activeVendor?.name || activeProfile.vendorId}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Category: <strong>{activeVendor?.category || 'Commercial Third-Party'}</strong> • Vendor ID: <code>{activeProfile.vendorId}</code>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Primary Contact:</div>
                  <div style={{ fontWeight: 600 }}>{activeVendor?.primaryContactName || 'Privacy & Compliance Officer'}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>{activeVendor?.primaryContactEmail || 'N/A'}</div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Headquarters / Hosting:</div>
                  <div style={{ fontWeight: 600 }}>{activeVendor?.countryOfIncorporation || 'Multi-jurisdiction'}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {activeVendor?.dataHostingRegions?.join(', ') || 'Global'}
                  </div>
                </div>
              </div>
            </div>

            {/* Card 2: Privacy Processor Overlay Profile */}
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  Privacy & Data Processing Overlay
                </span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor: 'rgba(37, 99, 235, 0.15)',
                    color: 'var(--accent-blue)',
                  }}
                >
                  {activeProfile.processorRole.replace(/_/g, ' ').toUpperCase()}
                </span>
              </div>

              <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text-primary)' }}>{activeProfile.engagementName || activeProfile.id}</div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                {activeProfile.serviceDescription || 'No detailed service description recorded.'}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginTop: '14px', paddingTop: '12px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                <div>
                  <div style={{ color: 'var(--text-muted)' }}>DPA Art. 28 Status:</div>
                  <div style={{ fontWeight: 600, color: activeProfile.dpaSigned ? 'var(--status-success)' : 'var(--status-danger)' }}>
                    {activeProfile.dpaSigned ? '✅ Executed DPA on File' : '⚠️ Missing Executed DPA'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>
                    {activeProfile.dpaDate ? `Signed: ${activeProfile.dpaDate.slice(0, 10)}` : 'Countersignature pending'}
                  </div>
                </div>

                <div>
                  <div style={{ color: 'var(--text-muted)' }}>Review Cadence:</div>
                  <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>
                    {activeProfile.reviewCadence.toUpperCase()} • Next: {activeProfile.nextReviewDate ? activeProfile.nextReviewDate.slice(0, 10) : 'Not scheduled'}
                  </div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '11px' }}>Criticality: {activeProfile.criticality.toUpperCase()}</div>
                </div>
              </div>
            </div>
          </div>

          {/* 3. Governance Health & Next Actions Center */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              borderLeft: governanceSynthesis?.riskEval.overallRiskLevel === 'critical' || governanceSynthesis?.riskEval.overallRiskLevel === 'high'
                ? '4px solid var(--status-danger)'
                : '4px solid var(--status-success)',
              borderRadius: '10px',
              padding: '18px 22px',
              marginBottom: '22px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px', marginBottom: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <span style={{ fontSize: '15px', fontWeight: 700 }}>🛡️ Governance & Compliance Radar</span>
                <span
                  style={{
                    fontSize: '11px',
                    fontWeight: 600,
                    padding: '2px 8px',
                    borderRadius: '4px',
                    backgroundColor:
                      governanceSynthesis?.riskEval.overallRiskLevel === 'critical'
                        ? 'rgba(239, 68, 68, 0.2)'
                        : governanceSynthesis?.riskEval.overallRiskLevel === 'high'
                        ? 'rgba(245, 158, 11, 0.2)'
                        : 'rgba(16, 185, 129, 0.2)',
                    color:
                      governanceSynthesis?.riskEval.overallRiskLevel === 'critical'
                        ? 'var(--status-danger)'
                        : governanceSynthesis?.riskEval.overallRiskLevel === 'high'
                        ? 'var(--status-warning)'
                        : 'var(--status-success)',
                  }}
                >
                  {governanceSynthesis?.riskEval.overallRiskLevel.toUpperCase()} RESIDUAL RISK
                </span>

                {activeProfile.isSpecialCategoryData && (
                  <span style={{ fontSize: '11px', fontWeight: 600, padding: '2px 8px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.15)', color: 'var(--status-danger)' }}>
                    Art. 9 Special Category Data
                  </span>
                )}
              </div>

              <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                {governanceSynthesis?.reminderEval.length || 0} Open Action Items • {transfers.length} Active Transfer Streams
              </div>
            </div>

            {/* Action Items List */}
            {governanceSynthesis?.reminderEval.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--status-success)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span>✅</span> All Article 28 DPA, Chapter V transfer safeguard mechanisms, and periodic review requirements are satisfied.
              </div>
            )}

            {governanceSynthesis && governanceSynthesis.reminderEval.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '10px' }}>
                {governanceSynthesis.reminderEval.map((rem) => (
                  <div
                    key={rem.id}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      backgroundColor: 'var(--bg-primary)',
                      padding: '8px 14px',
                      borderRadius: '6px',
                      fontSize: '12px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ color: rem.priority === 'urgent' || rem.priority === 'high' ? 'var(--status-danger)' : 'var(--status-warning)' }}>
                        ⚠️
                      </span>
                      <span style={{ fontWeight: 600 }}>{rem.title}:</span>
                      <span style={{ color: 'var(--text-secondary)' }}>{rem.message}</span>
                    </div>

                    <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>{rem.priority}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 4. Operational Hub Navigation Tabs */}
          <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid var(--border-color)', marginBottom: '20px', flexWrap: 'wrap' }}>
            {[
              { id: 'overview', label: '📊 Key Data Categories & Scope' },
              { id: 'transfers', label: `🌍 Transfer Arrangements (${transfers.length})` },
              { id: 'systems', label: `🖥️ Supported Systems (${systems.length})` },
              { id: 'ropa_dpia', label: `🇪🇺 ROPA (${ropaList.length}) & DPIA (${dpiaList.length})` },
              { id: 'evidence', label: `📁 Evidence & Audit Proof (${evidenceList.length})` },
              { id: 'risks_incidents', label: `⚠️ Risks (${risksList.length}) & Breaches (${breaches.length})` },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setHubTab(tab.id as any)}
                style={{
                  padding: '10px 16px',
                  fontSize: '13px',
                  fontWeight: hubTab === tab.id ? 700 : 500,
                  color: hubTab === tab.id ? 'var(--accent-blue)' : 'var(--text-secondary)',
                  borderBottom: hubTab === tab.id ? '2px solid var(--accent-blue)' : '2px solid transparent',
                  cursor: 'pointer',
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* 5. TAB CONTENTS */}

          {/* TAB 1: OVERVIEW / METADATA & DATA CATEGORIES */}
          {hubTab === 'overview' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '18px' }}>
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Processed Personal Data Categories</h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '16px' }}>
                  {activeProfile.dataCategories.map((c) => (
                    <span
                      key={c}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'var(--bg-primary)',
                        border: '1px solid var(--border-color)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {c.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>

                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Target Data Subjects</h3>
                <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                  {activeProfile.dataSubjects.map((s) => (
                    <span
                      key={s}
                      style={{
                        padding: '4px 10px',
                        borderRadius: '6px',
                        backgroundColor: 'rgba(37, 99, 235, 0.1)',
                        color: 'var(--accent-blue)',
                        fontSize: '12px',
                        fontWeight: 600,
                      }}
                    >
                      {s.replace(/_/g, ' ')}
                    </span>
                  ))}
                </div>
              </div>

              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '18px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Jurisdictions & Governance Assignment</h3>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '12px' }}>
                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Authorized Processing Jurisdictions: </span>
                    <strong>{activeProfile.jurisdictions.join(', ') || 'EEA'}</strong>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Assigned Engagement Owner (User ID): </span>
                    <code>{activeProfile.ownerUserId || activeProfile.ownerId || 'Unassigned'}</code>
                  </div>

                  <div>
                    <span style={{ color: 'var(--text-muted)' }}>Last Comprehensive Audit: </span>
                    <strong>{activeProfile.lastReviewDate ? activeProfile.lastReviewDate.slice(0, 10) : 'Never recorded'}</strong>
                  </div>

                  {activeProfile.notes && (
                    <div>
                      <span style={{ color: 'var(--text-muted)' }}>Internal Governance Notes: </span>
                      <div style={{ marginTop: '4px', color: 'var(--text-secondary)', padding: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px' }}>
                        {activeProfile.notes}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: TRANSFER ARRANGEMENTS (Chapter V) */}
          {hubTab === 'transfers' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {transfers.length === 0 ? (
                <div style={{ padding: '30px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center' }}>
                  No cross-border transfer arrangements configured for this processor.
                </div>
              ) : (
                transfers.map((t) => (
                  <div
                    key={t.id}
                    style={{
                      backgroundColor: 'var(--bg-surface)',
                      border: '1px solid var(--border-color)',
                      borderRadius: '8px',
                      padding: '16px',
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      flexWrap: 'wrap',
                      gap: '10px',
                    }}
                  >
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontWeight: 700, fontSize: '14px' }}>{t.name}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: t.restrictedTransfer ? 'rgba(239, 68, 68, 0.15)' : 'rgba(16, 185, 129, 0.15)',
                            color: t.restrictedTransfer ? 'var(--status-danger)' : 'var(--status-success)',
                          }}
                        >
                          {t.restrictedTransfer ? 'RESTRICTED' : 'EEA / ADEQUATE'}
                        </span>
                        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>[{t.transferMechanismType}]</span>
                      </div>

                      <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                        Destinations: <strong>{t.destinationCountries.join(', ')}</strong> • Scopes: {t.transferScopes.join(', ')} • TIA: {t.linkedTiaId ? '✅ Linked' : '⚠️ Missing'} • Evidence: {t.linkedEvidenceIds?.length || 0} files
                      </div>
                    </div>

                    {onNavigateToTab && (
                      <button
                        onClick={() => onNavigateToTab('processor_transfers')}
                        style={{
                          padding: '6px 12px',
                          backgroundColor: 'var(--bg-primary)',
                          border: '1px solid var(--border-color)',
                          color: 'var(--accent-blue)',
                          borderRadius: '6px',
                          fontSize: '12px',
                          cursor: 'pointer',
                        }}
                      >
                        Open in Transfers Manager →
                      </button>
                    )}
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 3: LINKED SYSTEMS */}
          {hubTab === 'systems' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '14px' }}>
              {systems.length === 0 ? (
                <div style={{ padding: '30px', backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', textAlign: 'center', gridColumn: '1/-1' }}>
                  No system assets currently linked to this processor.
                </div>
              ) : (
                systems.map((s) => (
                  <div key={s.asset.id} style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                    <div style={{ fontWeight: 700, fontSize: '14px' }}>{s.asset.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      Type: {s.asset.assetType} • Criticality: {s.asset.criticality} • Classification: {s.asset.dataClassification} • Hosting: {s.asset.hostingLocation}
                    </div>

                    <div style={{ marginTop: '10px', paddingTop: '8px', borderTop: '1px solid var(--border-color)', fontSize: '12px' }}>
                      <span style={{ color: 'var(--text-muted)' }}>Relationship Roles: </span>
                      {s.relationships.map((r, i) => (
                        <span key={i} style={{ padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(37, 99, 235, 0.1)', color: 'var(--accent-blue)', marginLeft: '4px', fontSize: '11px' }}>
                          {r.relationshipType}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: ROPA & DPIAs */}
          {hubTab === 'ropa_dpia' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* ROPA */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Linked ROPA Activities (Art. 30)</h3>
                {ropaList.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No ROPA entries linked to this processor.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {ropaList.map((r) => (
                      <div key={r.id} style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{r.activityCode}: {r.activityName}</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Legal Basis: {r.legalBasis} • Retention: {r.retentionPeriodMonths}m
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* DPIA */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Linked DPIA Assessments (Art. 35)</h3>
                {dpiaList.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No DPIA assessments currently involve this processor.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {dpiaList.map((d) => (
                      <div key={d.id} style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{d.code}: {d.title}</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Status: <strong>{d.status}</strong> • Residual Risk: <strong>{d.residualRiskLevel}</strong>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB 5: EVIDENCE & AUDIT PROOF */}
          {hubTab === 'evidence' && (
            <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '18px' }}>
              <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '14px' }}>Linked Evidence Repository Documents</h3>
              {evidenceSummary?.requirements && evidenceSummary.requirements.length > 0 && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '12px' }}>
                  {evidenceSummary.requirements.map((req: ProcessorEvidenceRequirement) => (
                    <div
                      key={req.key}
                      style={{
                        padding: '12px',
                        backgroundColor: 'var(--bg-primary)',
                        border: req.status === 'satisfied' ? '1px solid var(--border-color)' : '1px solid rgba(239, 68, 68, 0.3)',
                        borderRadius: '6px',
                        fontSize: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontWeight: 600 }}>{req.label}</span>
                        <span
                          style={{
                            fontSize: '11px',
                            fontWeight: 600,
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: req.status === 'satisfied' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                            color: req.status === 'satisfied' ? 'var(--status-success)' : 'var(--status-danger)',
                          }}
                        >
                          {req.status.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-secondary)', marginTop: '6px' }}>{req.reason}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB 6: RISKS & INCIDENTS */}
          {hubTab === 'risks_incidents' && (
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
              {/* Risks */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Linked GRC Risks ({risksList.length})</h3>
                {risksList.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No open risks linked to this processor profile.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {risksList.map((r) => (
                      <div key={r.id} style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600 }}>{r.code}: {r.title}</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Score: {r.residualScore} • Strategy: {r.treatmentStrategy} • Rule: {r.derivedRuleCode || 'Manual'}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Breaches */}
              <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '8px', padding: '16px' }}>
                <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '12px' }}>Security Incidents & Breaches ({breaches.length})</h3>
                {breaches.length === 0 ? (
                  <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>No security breaches or incidents involving this processor.</div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    {breaches.map((b) => (
                      <div key={b.id} style={{ padding: '8px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', fontSize: '12px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--status-danger)' }}>{b.incidentReference}: {b.title}</div>
                        <div style={{ color: 'var(--text-secondary)', marginTop: '2px' }}>
                          Severity: {b.severity} • Source: {b.reportingSource || 'Unknown'} • 72h Deadline: {b.dpaNotificationDeadline72h}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

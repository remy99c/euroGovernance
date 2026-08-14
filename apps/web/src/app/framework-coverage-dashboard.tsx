'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { TenantFrameworkCoverageDashboardData } from '@eurogovernance/shared-types';

interface FrameworkCoverageDashboardProps {
  tenantId: string;
  onNavigateToWizard?: () => void;
  onNavigateToReview?: () => void;
}

export default function FrameworkCoverageDashboardTab({
  tenantId,
  onNavigateToWizard,
  onNavigateToReview,
}: FrameworkCoverageDashboardProps) {
  const [data, setData] = useState<TenantFrameworkCoverageDashboardData | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [filterMode, setFilterMode] = useState<'all' | 'adopted_only'>('all');

  const loadCoverage = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      const fn = httpsCallable(functions, 'getTenantFrameworkCoverageDashboard');
      const res: any = await fn({ tenantId });
      if (res.data?.coverage) {
        setData(res.data.coverage);
      }
    } catch (err: any) {
      console.error('Failed to load framework coverage metrics:', err);
      setError(err.message || 'Failed to load framework coverage metrics.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadCoverage();
  }, [loadCoverage]);

  const displayedFrameworks = (data?.frameworks || []).filter((fw) => {
    if (filterMode === 'adopted_only') {
      return fw.isAdopted;
    }
    return true;
  });

  return (
    <div style={{ maxWidth: '1240px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 700 }}>🌐 Multi-Framework Coverage & Gap Dashboard</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Real-time derivation of statutory applicability, instantiated controls, harmonized reuse, and open governance gaps.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '10px' }}>
          {onNavigateToWizard && (
            <button
              onClick={onNavigateToWizard}
              style={{
                padding: '8px 14px',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                border: 'none',
                borderRadius: '6px',
                fontSize: '12px',
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              🚀 Launch Adoption Wizard
            </button>
          )}
          <button
            onClick={loadCoverage}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Recalculate Coverage
          </button>
        </div>
      </div>

      {/* Error Alert */}
      {error && (
        <div style={{ padding: '14px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--status-danger)', color: 'var(--status-danger)', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ color: 'var(--status-danger)', fontWeight: 600, fontSize: '12px' }}>
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '14px' }} />
          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Deriving framework coverage, harmonized controls, and gap metrics...</div>
        </div>
      ) : !data ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
          No coverage data available for this tenant.
        </div>
      ) : (
        <>
          {/* TOP KPI CARDS MATRIX */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>
            {/* Card 1: Adopted Frameworks */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '18px 20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                1. Adopted Frameworks
              </div>
              <div style={{ fontSize: '28px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '6px' }}>
                {data.adoptedFrameworksCount}
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                Active statutory & standard regimes
              </div>
            </div>

            {/* Card 2: Requirements Scope Breakdown */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '18px 20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                2-5. Requirements Status
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {data.totalRequirementsCount}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>total</span>
              </div>
              <div style={{ display: 'flex', gap: '6px', marginTop: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--status-success)', fontWeight: 600 }}>
                  {data.totalApplicableCount} Applicable
                </span>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(107, 114, 128, 0.2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                  {data.totalNonApplicableCount} Excluded
                </span>
                <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: 'var(--status-warning)', fontWeight: 600 }}>
                  {data.totalReviewNeededCount} Review Needed
                </span>
              </div>
            </div>

            {/* Card 3: Instantiated & Harmonized Controls */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '18px 20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                6-7. Controls & Harmonization
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', marginTop: '6px' }}>
                <span style={{ fontSize: '28px', fontWeight: 700, color: 'var(--status-success)' }}>
                  {data.totalControlsCount}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>controls</span>
              </div>
              <div style={{ fontSize: '12px', color: '#60a5fa', fontWeight: 600, marginTop: '4px' }}>
                ✨ {data.totalHarmonizedControlsCount} Harmonized Across Regimes
              </div>
            </div>

            {/* Card 4: Gaps & Missing Evidence */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '18px 20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase', fontWeight: 600 }}>
                8. Governance Attention Indicators
              </div>
              <div style={{ display: 'flex', gap: '8px', marginTop: '8px', flexWrap: 'wrap' }}>
                <div style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: data.totalOpenGapsCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: data.totalOpenGapsCount > 0 ? 'var(--status-danger)' : 'var(--status-success)', fontWeight: 600 }}>
                  ⚠️ {data.totalOpenGapsCount} Open Gaps
                </div>
                <div style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: data.totalOverdueReviewsCount > 0 ? 'rgba(245, 158, 11, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: data.totalOverdueReviewsCount > 0 ? 'var(--status-warning)' : 'var(--status-success)', fontWeight: 600 }}>
                  ⏳ {data.totalOverdueReviewsCount} Overdue Reviews
                </div>
                <div style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: data.totalMissingEvidenceCount > 0 ? 'rgba(239, 68, 68, 0.2)' : 'rgba(16, 185, 129, 0.15)', color: data.totalMissingEvidenceCount > 0 ? 'var(--status-danger)' : 'var(--status-success)', fontWeight: 600 }}>
                  📁 {data.totalMissingEvidenceCount} Missing Evidence
                </div>
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                Overall Readiness: <strong>{data.overallReadinessScore}%</strong>
              </div>
            </div>
          </div>

          {/* FRAMEWORK BREAKDOWN TABLE */}
          <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', overflow: 'hidden', marginBottom: '24px' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '15px', fontWeight: 700 }}>
                Regime Breakdown & Coverage Matrix ({displayedFrameworks.length})
              </h3>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => setFilterMode('all')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: filterMode === 'all' ? 'var(--accent-blue)' : 'var(--bg-primary)',
                    color: filterMode === 'all' ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  All Regimes
                </button>
                <button
                  onClick={() => setFilterMode('adopted_only')}
                  style={{
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    backgroundColor: filterMode === 'adopted_only' ? 'var(--accent-blue)' : 'var(--bg-primary)',
                    color: filterMode === 'adopted_only' ? '#fff' : 'var(--text-secondary)',
                    border: '1px solid var(--border-color)',
                    cursor: 'pointer',
                  }}
                >
                  Adopted Only
                </button>
              </div>
            </div>

            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '12px' }}>
                <thead>
                  <tr style={{ backgroundColor: 'var(--bg-primary)', borderBottom: '1px solid var(--border-color)', color: 'var(--text-muted)' }}>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Framework Regime</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Adoption Status</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Total Reqs</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Applicable</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Excluded</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Review Needed</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Instantiated Controls</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Harmonized Reuse</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Gaps & Evidence</th>
                    <th style={{ padding: '12px 16px', fontWeight: 600 }}>Readiness</th>
                  </tr>
                </thead>
                <tbody>
                  {displayedFrameworks.map((fw) => (
                    <tr key={fw.frameworkId} style={{ borderBottom: '1px solid var(--border-color)' }}>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{fw.frameworkTitle}</div>
                        <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '2px' }}>
                          <code>{fw.frameworkCode}</code> • v{fw.version} • {fw.jurisdiction}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        {fw.isAdopted ? (
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--status-success)', fontWeight: 600 }}>
                            Active Adopted
                          </span>
                        ) : (
                          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(107, 114, 128, 0.2)', color: 'var(--text-muted)', fontWeight: 600 }}>
                            Not Adopted
                          </span>
                        )}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>{fw.totalRequirementsCount}</td>
                      <td style={{ padding: '14px 16px', color: 'var(--status-success)', fontWeight: 600 }}>
                        {fw.applicableRequirementsCount}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--text-muted)' }}>
                        {fw.nonApplicableRequirementsCount}
                      </td>
                      <td style={{ padding: '14px 16px', color: fw.reviewNeededRequirementsCount > 0 ? 'var(--status-warning)' : 'var(--text-muted)', fontWeight: 600 }}>
                        {fw.reviewNeededRequirementsCount}
                      </td>
                      <td style={{ padding: '14px 16px', fontWeight: 600 }}>
                        {fw.totalControlsCount}
                      </td>
                      <td style={{ padding: '14px 16px', color: 'var(--accent-blue)', fontWeight: 600 }}>
                        {fw.harmonizedControlsCount > 0 ? `✨ ${fw.harmonizedControlsCount}` : '—'}
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', fontSize: '11px' }}>
                          {fw.openGapsCount > 0 && (
                            <span style={{ color: 'var(--status-danger)', fontWeight: 600 }}>
                              • {fw.openGapsCount} open gap(s)
                            </span>
                          )}
                          {fw.missingEvidenceCount > 0 && (
                            <span style={{ color: 'var(--status-danger)' }}>
                              • {fw.missingEvidenceCount} lacking evidence
                            </span>
                          )}
                          {fw.openGapsCount === 0 && fw.missingEvidenceCount === 0 && (
                            <span style={{ color: 'var(--status-success)' }}>✓ Healthy</span>
                          )}
                        </div>
                      </td>
                      <td style={{ padding: '14px 16px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <div style={{ flex: 1, minWidth: '60px', height: '6px', backgroundColor: 'var(--bg-primary)', borderRadius: '3px', overflow: 'hidden' }}>
                            <div style={{ width: `${fw.readinessPercentage}%`, height: '100%', backgroundColor: fw.readinessPercentage > 70 ? 'var(--status-success)' : 'var(--accent-blue)' }} />
                          </div>
                          <span style={{ fontWeight: 700, fontSize: '11px' }}>{fw.readinessPercentage}%</span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* STATUTORY REGISTERS & ACTION BANNER */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: '16px' }}>
            {/* Statutory Registers Summary */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '12px' }}>
                📋 Statutory Operational Registers & Mandates
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', fontSize: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid var(--border-color)' }}>
                  <span>Total Active Statutory Flags</span>
                  <span style={{ fontWeight: 700, color: 'var(--status-success)' }}>
                    {data.statutoryObligationsSummary.totalActiveObligations}
                  </span>
                </div>
                {Object.entries(data.statutoryObligationsSummary.byFramework).map(([fwKey, count]) => (
                  <div key={fwKey} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', color: 'var(--text-secondary)' }}>
                    <span style={{ textTransform: 'uppercase' }}>{fwKey} Registers</span>
                    <span style={{ fontWeight: 600 }}>{count}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Quick Governance Links */}
            <div style={{ backgroundColor: 'var(--bg-surface)', padding: '20px', borderRadius: '8px', border: '1px solid var(--border-color)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
              <div>
                <h4 style={{ fontSize: '14px', fontWeight: 700, marginBottom: '8px' }}>
                  ⚡ Governance Workflow Actions
                </h4>
                <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  Review applicability determinations, record statutory exclusions, or adopt new regulatory frameworks as your operational footprint grows.
                </p>
              </div>
              <div style={{ display: 'flex', gap: '10px', marginTop: '16px', flexWrap: 'wrap' }}>
                {onNavigateToReview && (
                  <button
                    onClick={onNavigateToReview}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--bg-primary)',
                      border: '1px solid var(--border-color)',
                      color: 'var(--text-primary)',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    ⚖️ Review Decisions & Overrides
                  </button>
                )}
                {onNavigateToWizard && (
                  <button
                    onClick={onNavigateToWizard}
                    style={{
                      padding: '8px 14px',
                      backgroundColor: 'var(--accent-blue)',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '6px',
                      fontSize: '12px',
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    🚀 Recalibrate Scoping Facts
                  </button>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

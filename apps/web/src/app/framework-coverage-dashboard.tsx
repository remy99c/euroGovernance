'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';
import { TenantFrameworkCoverageDashboardData } from '@eurogovernance/shared-types';
import { UIPageHeader } from './components/ui-page-header';
import { UIStatCard, UIStatGrid } from './components/ui-stat-card';
import { UIBadge } from './components/ui-badge';

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
    <div style={{ maxWidth: '1440px', margin: '0 auto', padding: '16px 0' }}>
      {/* 1. Standard Page Header */}
      <UIPageHeader
        title="Multi-Framework Coverage & Gap Dashboard"
        description="Real-time derivation of statutory applicability, instantiated controls, harmonized reuse, and open governance gaps."
        primaryAction={
          onNavigateToWizard
            ? {
                label: 'Launch Adoption Wizard',
                icon: '🚀',
                onClick: onNavigateToWizard,
              }
            : undefined
        }
        secondaryActions={[
          {
            label: 'Recalculate Coverage',
            icon: '🔄',
            onClick: loadCoverage,
            variant: 'secondary',
          },
        ]}
      />

      {/* Error Alert */}
      {error && (
        <div style={{ padding: '14px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--status-critical-border)', color: 'var(--status-critical-fg)', borderRadius: '6px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ color: 'var(--status-critical-fg)', fontWeight: 600, fontSize: '12px' }}>
            Dismiss
          </button>
        </div>
      )}

      {loading ? (
        <div style={{ padding: '64px', textAlign: 'center', backgroundColor: 'var(--surface-l2-card)', borderRadius: '8px', border: '1px solid var(--border-default)' }}>
          <div style={{ display: 'inline-block', width: '32px', height: '32px', border: '3px solid var(--border-default)', borderTopColor: 'var(--accent-primary)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '14px' }} />
          <div style={{ fontSize: '14px', color: 'var(--text-muted)' }}>Deriving framework coverage, harmonized controls, and gap metrics...</div>
        </div>
      ) : !data ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--surface-l2-card)', borderRadius: '8px', border: '1px solid var(--border-default)', color: 'var(--text-muted)', fontSize: '13px' }}>
          No coverage data available for this tenant.
        </div>
      ) : (
        <>
          {/* TOP KPI CARDS MATRIX */}
          <UIStatGrid columns={4}>
            <UIStatCard
              label="Adopted Frameworks"
              value={data.adoptedFrameworksCount}
              subtext="Active statutory regimes"
              valueColor="var(--accent-primary)"
            />

            <UIStatCard
              label="Applicable Requirements"
              value={`${data.totalApplicableCount} / ${data.totalRequirementsCount}`}
              subtext={`${data.totalNonApplicableCount} Excluded • ${data.totalReviewNeededCount} Review Needed`}
              valueColor="var(--status-compliant-fg)"
            />

            <UIStatCard
              label="Instantiated Controls"
              value={data.totalControlsCount}
              subtext={`✨ ${data.totalHarmonizedControlsCount} Harmonized Across Regimes`}
              valueColor="var(--text-primary)"
            />

            <UIStatCard
              label="Readiness Index"
              value={`${data.overallReadinessScore}%`}
              subtext={`${data.totalOpenGapsCount} Open Gaps • ${data.totalMissingEvidenceCount} Missing Evidence`}
              valueColor={data.overallReadinessScore >= 80 ? 'var(--status-compliant-fg)' : 'var(--status-warning-fg)'}
              progressPercentage={data.overallReadinessScore}
            />
          </UIStatGrid>

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

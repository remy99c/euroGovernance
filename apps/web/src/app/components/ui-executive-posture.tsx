'use client';

import React from 'react';
import { UIBadge } from './ui-badge';

// ==========================================
// 1. DECISIVE EXECUTIVE POSTURE HERO
// ==========================================
export interface UIExecutivePostureHeroProps {
  score: number | null; // 0 to 100 when a persisted calculation exists
  statusText?: string;
  implementedControlsCount: number;
  totalControlsCount: number;
  approvedEvidenceCount: number;
  openGapsCount: number;
}

export function UIExecutivePostureHero({
  score,
  statusText,
  implementedControlsCount,
  totalControlsCount,
  approvedEvidenceCount,
  openGapsCount,
}: UIExecutivePostureHeroProps) {
  const hasScore = score !== null;
  const isHealthy = hasScore && score >= 85 && openGapsCount === 0;
  const isWarning = hasScore && !isHealthy && score >= 70 && openGapsCount <= 3;

  const defaultStatus = !hasScore
    ? 'NOT ASSESSED'
    : isHealthy
    ? 'CALCULATED POSTURE AVAILABLE'
    : isWarning
    ? 'REMEDIATIONS IN PROGRESS'
    : 'CRITICAL LIABILITIES DETECTED';

  const badgeVariant = !hasScore ? 'neutral' : isHealthy ? 'compliant' : isWarning ? 'warning' : 'critical';
  const accentColor = !hasScore
    ? 'var(--status-neutral-dot)'
    : isHealthy
    ? 'var(--status-compliant-fg)'
    : isWarning
    ? 'var(--status-warning-fg)'
    : 'var(--status-critical-fg)';

  return (
    <div
      className="card-modern"
      style={{
        padding: '24px 28px',
        marginBottom: '24px',
        backgroundColor: 'var(--surface-l2-card)',
        border: '1px solid var(--border-default)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '24px',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Subtle Background Accent Gradient */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          right: 0,
          width: '320px',
          height: '100%',
          background: !hasScore
            ? 'radial-gradient(circle at top right, rgba(100, 116, 139, 0.08), transparent 70%)'
            : isHealthy
            ? 'radial-gradient(circle at top right, rgba(34, 197, 94, 0.08), transparent 70%)'
            : isWarning
            ? 'radial-gradient(circle at top right, rgba(234, 179, 8, 0.08), transparent 70%)'
            : 'radial-gradient(circle at top right, rgba(239, 68, 68, 0.08), transparent 70%)',
          pointerEvents: 'none',
        }}
      />

      {/* Left: Overall Health Score Gauge & Posture */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '22px' }}>
        {/* Score Ring / Number */}
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            width: '92px',
            height: '92px',
            borderRadius: '50%',
            backgroundColor: 'var(--surface-subtle)',
            border: `2px solid ${accentColor}`,
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
          }}
        >
          <span
            className="font-tabular"
            style={{
              fontSize: '32px',
              fontWeight: 900,
              color: accentColor,
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {score === null ? '—' : `${score}%`}
          </span>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
            POSTURE
          </span>
        </div>

        {/* Title & Posture Verdict */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span className="text-overline" style={{ color: 'var(--text-muted)' }}>
              RECORDED COMPLIANCE INDEX
            </span>
            <UIBadge variant={badgeVariant} size="sm">
              {statusText || defaultStatus}
            </UIBadge>
          </div>
          <h1
            style={{
              fontSize: '22px',
              fontWeight: 800,
              color: 'var(--text-primary)',
              margin: 0,
              letterSpacing: '-0.02em',
            }}
          >
            Compliance Posture
          </h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Calculated from current tenant records. This indicator is not an audit opinion.
          </p>
        </div>
      </div>

      {/* Right: 3 Decisive High-Level Metrics */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '24px',
          borderLeft: '1px solid var(--border-subtle)',
          paddingLeft: '24px',
        }}
      >
        <div>
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>IMPLEMENTED CONTROLS</div>
          <div className="font-tabular" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
            {implementedControlsCount} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/ {totalControlsCount}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '1px' }}>
            {totalControlsCount > 0
              ? `${Math.round((implementedControlsCount / totalControlsCount) * 100)}% recorded implemented`
              : 'No controls recorded'}
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-subtle)' }} />

        <div>
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>APPROVED EVIDENCE</div>
          <div className="font-tabular" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '2px' }}>
            {approvedEvidenceCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
            Approval status recorded
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-subtle)' }} />

        <div>
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>OPEN FINDINGS</div>
          <div className="font-tabular" style={{ fontSize: '18px', fontWeight: 800, color: openGapsCount > 0 ? 'var(--status-critical-fg)' : 'var(--text-primary)', marginTop: '2px' }}>
            {openGapsCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', fontWeight: 600, marginTop: '1px' }}>
            Recorded open status
          </div>
        </div>
      </div>
    </div>
  );
}

// ==========================================
// 2. EVIDENCE EXPIRY FORECAST WIDGET
// ==========================================
export interface ExpiryForecastBucket {
  label: string;
  count: number;
  variant: 'critical' | 'warning' | 'compliant';
  subtext: string;
}

export interface UIEvidenceExpiryForecastProps {
  overdueCount: number;
  dueIn30DaysCount: number;
  dueIn90DaysCount: number;
  scheduledAfter90DaysCount: number;
  noReviewDateCount: number;
  onViewExpiring?: () => void;
}

export function UIEvidenceExpiryForecast({
  overdueCount,
  dueIn30DaysCount,
  dueIn90DaysCount,
  scheduledAfter90DaysCount,
  noReviewDateCount,
  onViewExpiring,
}: UIEvidenceExpiryForecastProps) {
  const buckets: ExpiryForecastBucket[] = [
    {
      label: 'Review Overdue',
      count: overdueCount,
      variant: 'critical',
      subtext: 'Review date has passed',
    },
    {
      label: 'Review Due ≤ 30 Days',
      count: dueIn30DaysCount,
      variant: 'warning',
      subtext: 'Upcoming scheduled reviews',
    },
    {
      label: 'Review Due 31-90 Days',
      count: dueIn90DaysCount,
      variant: 'compliant',
      subtext: 'Scheduled review window',
    },
    {
      label: 'Scheduled After 90 Days',
      count: scheduledAfter90DaysCount,
      variant: 'compliant',
      subtext: 'Review date recorded',
    },
    {
      label: 'No Review Date',
      count: noReviewDateCount,
      variant: 'warning',
      subtext: 'Schedule is incomplete',
    },
  ];

  return (
    <div
      className="card-modern"
      style={{
        padding: '18px 20px',
        backgroundColor: 'var(--surface-l2-card)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
        <div>
          <h3 className="text-card-title" style={{ margin: 0, color: 'var(--text-primary)' }}>
            Evidence Review Schedule
          </h3>
          <p className="text-caption" style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
            Counts derived from recorded evidence review dates; rejected and archived records are excluded.
          </p>
        </div>
        {onViewExpiring && (
          <button
            onClick={onViewExpiring}
            className="btn-secondary"
            style={{ fontSize: '11.5px', padding: '4px 10px' }}
          >
            Inspect Forecast ➔
          </button>
        )}
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          gap: '12px',
        }}
      >
        {buckets.map((b, idx) => (
          <div
            key={idx}
            style={{
              padding: '12px 14px',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
                <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
                  {b.label}
                </span>
                <span
                  style={{
                    width: '6px',
                    height: '6px',
                    borderRadius: '50%',
                    backgroundColor:
                      b.variant === 'critical'
                        ? 'var(--status-critical-dot)'
                        : b.variant === 'warning'
                        ? 'var(--status-warning-dot)'
                        : 'var(--status-compliant-dot)',
                  }}
                />
              </div>
              <div
                className="font-tabular"
                style={{
                  fontSize: '22px',
                  fontWeight: 800,
                  color:
                    b.count > 0 && b.variant === 'critical'
                      ? 'var(--status-critical-fg)'
                      : b.count > 0 && b.variant === 'warning'
                      ? 'var(--status-warning-fg)'
                      : 'var(--text-primary)',
                }}
              >
                {b.count}
              </div>
            </div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '6px' }}>
              {b.subtext}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ==========================================
// 3. REGULATORY LIABILITIES & BLOCKERS MATRIX
// ==========================================
export interface RegulatoryLiabilityItem {
  id: string;
  framework: string;
  title: string;
  severity: 'critical' | 'high' | 'medium';
  actionLabel: string;
  onAction: () => void;
}

export interface UIRegulatoryLiabilitiesProps {
  liabilities: RegulatoryLiabilityItem[];
}

export function UIRegulatoryLiabilities({ liabilities }: UIRegulatoryLiabilitiesProps) {
  if (liabilities.length === 0) {
    return (
      <div
        className="card-modern"
        style={{
          padding: '16px 20px',
          backgroundColor: 'var(--surface-l2-card)',
          border: '1px solid var(--border-default)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: '24px' }}>ℹ️</span>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
            No Priority Items Identified by This Dashboard View
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            This is not a compliance conclusion. Confirm scope completeness, overdue reviews, and framework-specific registers before relying on posture reporting.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className="card-modern"
      style={{
        padding: '16px 20px',
        backgroundColor: 'var(--surface-l2-card)',
        border: '1px solid var(--status-warning-border)',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '18px' }}>⚠️</span>
          <h3 className="text-card-title" style={{ margin: 0, color: 'var(--text-primary)' }}>
            Statutory Liabilities Requiring Intervention ({liabilities.length})
          </h3>
        </div>
        <span className="text-caption" style={{ color: 'var(--text-muted)' }}>
          Prioritized by enforcement risk
        </span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {liabilities.map((item) => (
          <div
            key={item.id}
            style={{
              padding: '10px 14px',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: 'var(--radius-sm)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <UIBadge variant={item.severity === 'critical' ? 'critical' : 'warning'} size="sm">
                {item.framework}
              </UIBadge>
              <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
                {item.title}
              </span>
            </div>

            <button
              onClick={item.onAction}
              className={item.severity === 'critical' ? 'btn-danger' : 'btn-secondary'}
              style={{ fontSize: '11px', padding: '4px 10px', whiteSpace: 'nowrap' }}
            >
              {item.actionLabel} ➔
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

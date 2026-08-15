'use client';

import React from 'react';
import { UIBadge } from './ui-badge';

// ==========================================
// 1. DECISIVE EXECUTIVE POSTURE HERO
// ==========================================
export interface UIExecutivePostureHeroProps {
  score: number; // 0 to 100
  statusText?: string;
  verifiedControlsCount: number;
  totalControlsCount: number;
  fourEyesEvidenceCount: number;
  openGapsCount: number;
  sovereignRegion?: string;
  lastAuditedTimestamp?: string;
}

export function UIExecutivePostureHero({
  score,
  statusText,
  verifiedControlsCount,
  totalControlsCount,
  fourEyesEvidenceCount,
  openGapsCount,
  sovereignRegion = 'FRA-WEST3 (Frankfurt)',
  lastAuditedTimestamp,
}: UIExecutivePostureHeroProps) {
  const isHealthy = score >= 85 && openGapsCount === 0;
  const isWarning = score < 85 && score >= 70;
  const isCritical = score < 70 || openGapsCount > 3;

  const defaultStatus = isHealthy
    ? 'STATUTORY AUDIT READY'
    : isWarning
    ? 'REMEDIATIONS IN PROGRESS'
    : 'CRITICAL LIABILITIES DETECTED';

  const badgeVariant = isHealthy ? 'compliant' : isWarning ? 'warning' : 'critical';

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
          background: isHealthy
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
            border: `2px solid ${
              isHealthy
                ? 'var(--status-compliant-fg)'
                : isWarning
                ? 'var(--status-warning-fg)'
                : 'var(--status-critical-fg)'
            }`,
            boxShadow: 'var(--shadow-sm)',
            flexShrink: 0,
          }}
        >
          <span
            className="font-tabular"
            style={{
              fontSize: '32px',
              fontWeight: 900,
              color: isHealthy
                ? 'var(--status-compliant-fg)'
                : isWarning
                ? 'var(--status-warning-fg)'
                : 'var(--status-critical-fg)',
              lineHeight: 1,
              letterSpacing: '-0.03em',
            }}
          >
            {score}%
          </span>
          <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '2px' }}>
            POSTURE
          </span>
        </div>

        {/* Title & Posture Verdict */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
            <span className="text-overline" style={{ color: 'var(--text-muted)' }}>
              CONTINUOUS COMPLIANCE INDEX
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
            EU Statutory Governance Posture
          </h1>
          <p style={{ fontSize: '12.5px', color: 'var(--text-secondary)', margin: '4px 0 0 0' }}>
            Materialized across GDPR, EU AI Act, EU Data Act, and ISO 27001 controls.
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
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>VERIFIED CONTROLS</div>
          <div className="font-tabular" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--text-primary)', marginTop: '2px' }}>
            {verifiedControlsCount} <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>/ {totalControlsCount}</span>
          </div>
          <div style={{ fontSize: '11px', color: 'var(--status-compliant-fg)', fontWeight: 600, marginTop: '1px' }}>
            {Math.round((verifiedControlsCount / (totalControlsCount || 1)) * 100)}% Verified
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-subtle)' }} />

        <div>
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>FOUR-EYES LOCKERS</div>
          <div className="font-tabular" style={{ fontSize: '18px', fontWeight: 800, color: 'var(--accent-primary)', marginTop: '2px' }}>
            {fourEyesEvidenceCount}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text-secondary)', marginTop: '1px' }}>
            SHA-256 Sealed
          </div>
        </div>

        <div style={{ width: '1px', height: '36px', backgroundColor: 'var(--border-subtle)' }} />

        <div>
          <div className="text-overline" style={{ color: 'var(--text-muted)' }}>SOVEREIGN RESIDENCY</div>
          <div style={{ fontSize: '12.5px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '2px', display: 'flex', alignItems: 'center', gap: '4px' }}>
            <span>🇪🇺</span> {sovereignRegion}
          </div>
          <div style={{ fontSize: '11px', color: 'var(--status-compliant-fg)', fontWeight: 600, marginTop: '1px' }}>
            Zero US Extraterritoriality
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
  expiredCount: number;
  expiringIn30DaysCount: number;
  expiringIn90DaysCount: number;
  validCount: number;
  onViewExpiring?: () => void;
}

export function UIEvidenceExpiryForecast({
  expiredCount,
  expiringIn30DaysCount,
  expiringIn90DaysCount,
  validCount,
  onViewExpiring,
}: UIEvidenceExpiryForecastProps) {
  const buckets: ExpiryForecastBucket[] = [
    {
      label: 'Expired / Lapsed',
      count: expiredCount,
      variant: 'critical',
      subtext: 'Requires immediate re-upload',
    },
    {
      label: 'Expiring ≤ 30 Days',
      count: expiringIn30DaysCount,
      variant: 'warning',
      subtext: 'Upcoming attestation renewals',
    },
    {
      label: 'Expiring 31-90 Days',
      count: expiringIn90DaysCount,
      variant: 'compliant',
      subtext: 'In renewal window',
    },
    {
      label: 'Active & Valid (>90d)',
      count: validCount,
      variant: 'compliant',
      subtext: 'Current audit readiness',
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
            Evidence & Assurance Expiry Forecast
          </h3>
          <p className="text-caption" style={{ margin: '2px 0 0 0', color: 'var(--text-secondary)' }}>
            Forward-looking timeline of SOC reports, ISO certs, and supplier DPAs requiring renewal.
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
          gridTemplateColumns: 'repeat(4, 1fr)',
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
          border: '1px solid var(--status-compliant-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '14px',
          marginBottom: '20px',
        }}
      >
        <span style={{ fontSize: '24px' }}>🛡️</span>
        <div>
          <div style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--status-compliant-fg)' }}>
            All Clear: Zero High-Severity Statutory Liabilities Detected
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
            All EU AI Act risk tiers, GDPR Article 30 records, and cross-border transfer agreements are currently conforming.
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

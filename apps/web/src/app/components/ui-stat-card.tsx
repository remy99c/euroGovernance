'use client';

import React from 'react';

export interface UIStatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  trend?: string;
  trendType?: 'positive' | 'warning' | 'negative' | 'neutral';
  progressPercentage?: number;
  progressBarColor?: string;
  valueColor?: string;
  icon?: string;
}

export function UIStatCard({
  label,
  value,
  subtext,
  trend,
  trendType = 'neutral',
  progressPercentage,
  progressBarColor = 'var(--status-success)',
  valueColor,
  icon,
}: UIStatCardProps) {
  const trendColorMap: Record<string, { bg: string; fg: string }> = {
    positive: { bg: 'var(--status-compliant-bg)', fg: 'var(--status-compliant-fg)' },
    warning: { bg: 'var(--status-warning-bg)', fg: 'var(--status-warning-fg)' },
    negative: { bg: 'var(--status-critical-bg)', fg: 'var(--status-critical-fg)' },
    neutral: { bg: 'var(--bg-canvas-subtle)', fg: 'var(--text-muted)' },
  };

  return (
    <div className="card-modern" style={{ display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
      <div>
        {/* Header / Overline */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {label}
          </span>
          {icon && <span style={{ fontSize: '14px' }}>{icon}</span>}
        </div>

        {/* Primary Value & Trend */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
          <span
            className="font-tabular"
            style={{
              fontSize: '28px',
              fontWeight: 800,
              color: valueColor || 'var(--text-primary)',
              letterSpacing: '-0.02em',
              lineHeight: 1.1,
            }}
          >
            {value}
          </span>
          {trend && (
            <span
              style={{
                fontSize: '11px',
                fontWeight: 700,
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: trendColorMap[trendType]?.bg || 'var(--bg-canvas-subtle)',
                color: trendColorMap[trendType]?.fg || 'var(--text-muted)',
              }}
            >
              {trend}
            </span>
          )}
        </div>
      </div>

      {/* Optional Progress Bar & Subtext */}
      <div style={{ marginTop: '12px' }}>
        {typeof progressPercentage === 'number' && (
          <div
            style={{
              width: '100%',
              height: '6px',
              backgroundColor: 'var(--bg-surface-elevated)',
              borderRadius: '9999px',
              overflow: 'hidden',
              marginBottom: '6px',
            }}
          >
            <div
              style={{
                width: `${Math.min(Math.max(progressPercentage, 0), 100)}%`,
                height: '100%',
                backgroundColor: progressBarColor,
                borderRadius: '9999px',
                transition: 'width 0.4s ease',
              }}
            />
          </div>
        )}

        {subtext && (
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>
            {subtext}
          </div>
        )}
      </div>
    </div>
  );
}

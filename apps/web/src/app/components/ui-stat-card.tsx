'use client';

import React from 'react';

export type StatTrendType = 'positive' | 'warning' | 'negative' | 'neutral';

export interface UIStatCardProps {
  label: string;
  value: string | number;
  unit?: string;
  subtext?: string;
  trend?: string;
  trendType?: StatTrendType;
  progressPercentage?: number;
  progressBarColor?: string;
  valueColor?: string;
  icon?: string;
  onClick?: () => void;
  zeroStateText?: string;
}

export function UIStatCard({
  label,
  value,
  unit,
  subtext,
  trend,
  trendType = 'neutral',
  progressPercentage,
  progressBarColor,
  valueColor,
  icon,
  onClick,
  zeroStateText,
}: UIStatCardProps) {
  const isZero = value === 0 || value === '0' || value === '0%';
  const displaySubtext = isZero && zeroStateText ? zeroStateText : subtext;

  const trendClassMap: Record<StatTrendType, { bg: string; fg: string; border: string }> = {
    positive: {
      bg: 'var(--status-compliant-bg)',
      fg: 'var(--status-compliant-fg)',
      border: 'var(--status-compliant-border)',
    },
    warning: {
      bg: 'var(--status-warning-bg)',
      fg: 'var(--status-warning-fg)',
      border: 'var(--status-warning-border)',
    },
    negative: {
      bg: 'var(--status-critical-bg)',
      fg: 'var(--status-critical-fg)',
      border: 'var(--status-critical-border)',
    },
    neutral: {
      bg: 'var(--surface-subtle)',
      fg: 'var(--text-muted)',
      border: 'var(--border-subtle)',
    },
  };

  const defaultProgressColor =
    typeof progressPercentage === 'number'
      ? progressPercentage >= 80
        ? 'var(--status-compliant-fg)'
        : progressPercentage >= 50
        ? 'var(--status-warning-fg)'
        : 'var(--status-critical-fg)'
      : 'var(--accent-primary)';

  return (
    <div
      className={`card-modern ${onClick ? 'card-interactive' : ''}`}
      onClick={onClick}
      style={{
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'space-between',
        cursor: onClick ? 'pointer' : 'default',
        padding: '16px 18px',
        minHeight: '110px',
      }}
    >
      {/* Top Row: Category Overline & Optional Icon */}
      <div>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span className="text-overline" style={{ color: 'var(--text-muted)' }}>
            {label}
          </span>
          {icon && <span style={{ fontSize: '14px', opacity: 0.85 }}>{icon}</span>}
        </div>

        {/* Primary Emphasized Numeric Metric & Trend Pill */}
        <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px', flexWrap: 'wrap' }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: '2px' }}>
            <span
              className="font-tabular"
              style={{
                fontSize: '28px',
                fontWeight: 800,
                color: valueColor || 'var(--text-primary)',
                letterSpacing: '-0.025em',
                lineHeight: 1,
              }}
            >
              {value}
            </span>
            {unit && (
              <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-muted)', marginLeft: '2px' }}>
                {unit}
              </span>
            )}
          </div>

          {trend && (
            <span
              style={{
                fontSize: '10.5px',
                fontWeight: 700,
                padding: '2px 7px',
                borderRadius: '4px',
                backgroundColor: trendClassMap[trendType].bg,
                color: trendClassMap[trendType].fg,
                border: `1px solid ${trendClassMap[trendType].border}`,
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
              }}
            >
              {trend}
            </span>
          )}
        </div>
      </div>

      {/* Bottom Row: Optional Progress Bar & Subtitle/Footnote */}
      <div style={{ marginTop: '10px' }}>
        {typeof progressPercentage === 'number' && (
          <div
            style={{
              width: '100%',
              height: '4px',
              backgroundColor: 'var(--surface-subtle)',
              borderRadius: 'var(--radius-full)',
              overflow: 'hidden',
              marginBottom: '6px',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                width: `${Math.min(Math.max(progressPercentage, 0), 100)}%`,
                height: '100%',
                backgroundColor: progressBarColor || defaultProgressColor,
                borderRadius: 'var(--radius-full)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        )}

        {displaySubtext && (
          <div
            className="text-caption"
            style={{
              color: isZero ? 'var(--text-muted)' : 'var(--text-secondary)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {displaySubtext}
          </div>
        )}
      </div>
    </div>
  );
}

export interface UIStatGridProps {
  children: React.ReactNode;
  columns?: number;
  gap?: string;
}

export function UIStatGrid({ children, columns, gap = '14px' }: UIStatGridProps) {
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: columns ? `repeat(${columns}, 1fr)` : 'repeat(auto-fit, minmax(210px, 1fr))',
        gap,
        marginBottom: '20px',
      }}
    >
      {children}
    </div>
  );
}

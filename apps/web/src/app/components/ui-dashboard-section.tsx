'use client';

import React from 'react';

export interface UIDashboardSectionProps {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
  badge?: React.ReactNode;
  level?: 1 | 2;
}

export function UIDashboardSection({
  title,
  subtitle,
  action,
  children,
  badge,
  level = 1,
}: UIDashboardSectionProps) {
  return (
    <section style={{ marginBottom: level === 1 ? '28px' : '20px' }}>
      {/* Section Header */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '14px',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <h2
              className={level === 1 ? 'text-section-title' : 'text-card-title'}
              style={{ margin: 0, color: 'var(--text-primary)' }}
            >
              {title}
            </h2>
            {badge && <div>{badge}</div>}
          </div>
          {subtitle && (
            <p
              className="text-caption"
              style={{
                color: 'var(--text-secondary)',
                marginTop: '3px',
                marginBottom: 0,
              }}
            >
              {subtitle}
            </p>
          )}
        </div>

        {action && <div style={{ flexShrink: 0 }}>{action}</div>}
      </div>

      {/* Section Body */}
      <div>{children}</div>
    </section>
  );
}

export interface UIDashboardActionBannerProps {
  icon?: string;
  title: string;
  description: string;
  actionText: string;
  onAction: () => void;
  variant?: 'warning' | 'critical' | 'review' | 'compliant';
  count?: number;
}

export function UIDashboardActionBanner({
  icon = '⚠️',
  title,
  description,
  actionText,
  onAction,
  variant = 'warning',
  count,
}: UIDashboardActionBannerProps) {
  const variantStyles = {
    warning: {
      bg: 'var(--status-warning-bg)',
      border: 'var(--status-warning-border)',
      fg: 'var(--status-warning-fg)',
      btn: 'btn-secondary',
    },
    critical: {
      bg: 'var(--status-critical-bg)',
      border: 'var(--status-critical-border)',
      fg: 'var(--status-critical-fg)',
      btn: 'btn-danger',
    },
    review: {
      bg: 'var(--status-review-bg)',
      border: 'var(--status-review-border)',
      fg: 'var(--status-review-fg)',
      btn: 'btn-primary',
    },
    compliant: {
      bg: 'var(--status-compliant-bg)',
      border: 'var(--status-compliant-border)',
      fg: 'var(--status-compliant-fg)',
      btn: 'btn-secondary',
    },
  };

  const style = variantStyles[variant];

  return (
    <div
      style={{
        padding: '14px 18px',
        backgroundColor: style.bg,
        border: `1px solid ${style.border}`,
        borderRadius: 'var(--radius-lg)',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '16px',
        marginBottom: '20px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '20px' }}>{icon}</span>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '13.5px', fontWeight: 700, color: 'var(--text-primary)' }}>
              {title}
            </span>
            {typeof count === 'number' && (
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 800,
                  padding: '1px 6px',
                  borderRadius: '4px',
                  backgroundColor: 'var(--surface-l2-card)',
                  color: style.fg,
                  border: `1px solid ${style.border}`,
                }}
              >
                {count} Pending
              </span>
            )}
          </div>
          <p
            style={{
              fontSize: '12px',
              color: 'var(--text-secondary)',
              marginTop: '2px',
              marginBottom: 0,
            }}
          >
            {description}
          </p>
        </div>
      </div>

      <button
        onClick={onAction}
        className={style.btn}
        style={{ fontSize: '12px', padding: '6px 14px', whiteSpace: 'nowrap' }}
      >
        {actionText}
      </button>
    </div>
  );
}

export interface UIDashboardSplitProps {
  primary: React.ReactNode;
  secondary: React.ReactNode;
  ratio?: '2:1' | '3:2' | '1:1';
}

export function UIDashboardSplit({ primary, secondary, ratio = '2:1' }: UIDashboardSplitProps) {
  const gridTemplate =
    ratio === '2:1' ? '2fr 1fr' : ratio === '3:2' ? '3fr 2fr' : '1fr 1fr';

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: gridTemplate,
        gap: '20px',
        alignItems: 'start',
      }}
    >
      <div>{primary}</div>
      <div>{secondary}</div>
    </div>
  );
}

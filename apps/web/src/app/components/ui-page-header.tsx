'use client';

import React from 'react';

export interface PageHeaderAction {
  label: string;
  onClick: () => void;
  icon?: string;
  disabled?: boolean;
  loading?: boolean;
  variant?: 'primary' | 'secondary' | 'success' | 'danger';
}

export interface BreadcrumbItem {
  label: string;
  onClick?: () => void;
}

export interface UIPageHeaderProps {
  title: string;
  description?: string;
  badge?: React.ReactNode;
  breadcrumbs?: BreadcrumbItem[];
  primaryAction?: PageHeaderAction;
  secondaryActions?: PageHeaderAction[];
  children?: React.ReactNode;
}

export function UIPageHeader({
  title,
  description,
  badge,
  breadcrumbs,
  primaryAction,
  secondaryActions = [],
  children,
}: UIPageHeaderProps) {
  const getActionBtnClass = (variant?: string) => {
    switch (variant) {
      case 'success':
        return 'btn-success';
      case 'danger':
        return 'btn-danger';
      case 'secondary':
        return 'btn-secondary';
      case 'primary':
      default:
        return 'btn-primary';
    }
  };

  return (
    <header style={{ marginBottom: '24px' }}>
      {/* Optional Breadcrumb Navigation Trail */}
      {breadcrumbs && breadcrumbs.length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            fontSize: '12px',
            color: 'var(--text-muted)',
            marginBottom: '8px',
          }}
        >
          {breadcrumbs.map((crumb, idx) => {
            const isLast = idx === breadcrumbs.length - 1;
            return (
              <React.Fragment key={crumb.label}>
                {crumb.onClick && !isLast ? (
                  <button
                    onClick={crumb.onClick}
                    style={{
                      color: 'var(--text-secondary)',
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'color 0.15s ease',
                    }}
                    onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--text-primary)')}
                    onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    {crumb.label}
                  </button>
                ) : (
                  <span style={{ color: isLast ? 'var(--text-primary)' : 'var(--text-secondary)', fontWeight: isLast ? 600 : 400 }}>
                    {crumb.label}
                  </span>
                )}
                {!isLast && <span style={{ color: 'var(--border-default)', fontSize: '10px' }}>/</span>}
              </React.Fragment>
            );
          })}
        </div>
      )}

      {/* Main Header Row: Title & Action Toolbar */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          gap: '20px',
        }}
      >
        {/* Left Side: Title, Badge & Subtitle */}
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
            <h1 className="text-page-title" style={{ margin: 0 }}>
              {title}
            </h1>
            {badge && <div>{badge}</div>}
          </div>

          {description && (
            <p
              className="text-body-muted"
              style={{
                marginTop: '6px',
                marginBottom: 0,
                maxWidth: '720px',
                lineHeight: 1.5,
              }}
            >
              {description}
            </p>
          )}
        </div>

        {/* Right Side: Action Buttons (Only ONE Primary CTA) */}
        {(primaryAction || secondaryActions.length > 0) && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
            {secondaryActions.map((action, idx) => (
              <button
                key={idx}
                onClick={action.onClick}
                disabled={action.disabled || action.loading}
                className={getActionBtnClass(action.variant || 'secondary')}
                style={{ fontSize: '12.5px', padding: '7px 14px' }}
              >
                {action.icon && <span>{action.icon}</span>}
                <span>{action.loading ? 'Processing...' : action.label}</span>
              </button>
            ))}

            {primaryAction && (
              <button
                onClick={primaryAction.onClick}
                disabled={primaryAction.disabled || primaryAction.loading}
                className={getActionBtnClass(primaryAction.variant || 'primary')}
                style={{ fontSize: '12.5px', padding: '7px 16px' }}
              >
                {primaryAction.icon && <span>{primaryAction.icon}</span>}
                <span>{primaryAction.loading ? 'Processing...' : primaryAction.label}</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Optional Contextual Filters or Metric Strips */}
      {children && <div style={{ marginTop: '16px' }}>{children}</div>}
    </header>
  );
}

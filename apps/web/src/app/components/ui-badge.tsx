'use client';

import React from 'react';

export type BadgeVariant = 'compliant' | 'warning' | 'critical' | 'review' | 'neutral';

export interface UIBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  showDot?: boolean;
}

export function UIBadge({ variant = 'neutral', children, showDot = true }: UIBadgeProps) {
  const dotColorMap: Record<BadgeVariant, string> = {
    compliant: 'var(--status-compliant-dot)',
    warning: 'var(--status-warning-dot)',
    critical: 'var(--status-critical-dot)',
    review: 'var(--status-review-dot)',
    neutral: 'var(--status-neutral-dot)',
  };

  return (
    <span className={`badge-status badge-${variant}`}>
      {showDot && (
        <span
          style={{
            width: '6px',
            height: '6px',
            borderRadius: '50%',
            backgroundColor: dotColorMap[variant] || 'currentColor',
          }}
        />
      )}
      {children}
    </span>
  );
}

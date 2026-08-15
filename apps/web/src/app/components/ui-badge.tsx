'use client';

import React from 'react';

export type BadgeVariant = 'compliant' | 'warning' | 'critical' | 'review' | 'neutral';

export type StatusDomain =
  | 'generic'
  | 'review'
  | 'evidence'
  | 'risk'
  | 'control'
  | 'transfer'
  | 'processor';

export interface UIBadgeProps {
  variant?: BadgeVariant;
  children: React.ReactNode;
  showDot?: boolean;
  size?: 'sm' | 'md';
}

export function UIBadge({
  variant = 'neutral',
  children,
  showDot = true,
  size = 'md',
}: UIBadgeProps) {
  const dotColorMap: Record<BadgeVariant, string> = {
    compliant: 'var(--status-compliant-dot)',
    warning: 'var(--status-warning-dot)',
    critical: 'var(--status-critical-dot)',
    review: 'var(--status-review-dot)',
    neutral: 'var(--status-neutral-dot)',
  };

  return (
    <span
      className={`badge-status badge-${variant}`}
      style={{
        padding: size === 'sm' ? '1px 6px' : '2px 8px',
        fontSize: size === 'sm' ? '10px' : '11px',
      }}
    >
      {showDot && (
        <span
          style={{
            width: size === 'sm' ? '5px' : '6px',
            height: size === 'sm' ? '5px' : '6px',
            borderRadius: '50%',
            backgroundColor: dotColorMap[variant] || 'currentColor',
            flexShrink: 0,
          }}
        />
      )}
      <span>{children}</span>
    </span>
  );
}

// ==========================================
// STATUS MAPPING MODEL
// ==========================================
export function getStatusVariant(
  rawStatus: string,
  domain: StatusDomain = 'generic'
): { variant: BadgeVariant; label: string } {
  const status = (rawStatus || '').toLowerCase().trim();

  // 1. Evidence Domain
  if (domain === 'evidence') {
    if (['valid', 'approved', 'verified'].includes(status)) {
      return { variant: 'compliant', label: 'Approved' };
    }
    if (['in_review', 'under_review', 'submitted'].includes(status)) {
      return { variant: 'review', label: 'Under Review' };
    }
    if (['expiring_soon', 'needs_refresh'].includes(status)) {
      return { variant: 'warning', label: 'Expiring Soon' };
    }
    if (['expired', 'rejected', 'missing', 'revoked'].includes(status)) {
      return { variant: 'critical', label: status === 'expired' ? 'Expired' : 'Rejected' };
    }
    return { variant: 'neutral', label: formatStatusLabel(status) };
  }

  // 2. Risk Severity Domain
  if (domain === 'risk') {
    if (['low', 'negligible', 'very_low'].includes(status)) {
      return { variant: 'compliant', label: 'Low Risk' };
    }
    if (['medium', 'moderate'].includes(status)) {
      return { variant: 'warning', label: 'Medium Risk' };
    }
    if (['high', 'critical', 'severe', 'unmitigated'].includes(status)) {
      return { variant: 'critical', label: status === 'critical' ? 'Critical Risk' : 'High Risk' };
    }
    return { variant: 'neutral', label: formatStatusLabel(status) };
  }

  // 3. Control Implementation Domain
  if (domain === 'control') {
    if (['implemented', 'compliant', 'satisfied', 'automated'].includes(status)) {
      return { variant: 'compliant', label: 'Implemented' };
    }
    if (['in_progress', 'partially_implemented', 'testing'].includes(status)) {
      return { variant: 'review', label: 'In Progress' };
    }
    if (['not_implemented', 'gap', 'non_compliant', 'failed'].includes(status)) {
      return { variant: 'critical', label: 'Not Implemented' };
    }
    if (['not_applicable', 'scoped_out', 'exempt'].includes(status)) {
      return { variant: 'neutral', label: 'Not Applicable' };
    }
    return { variant: 'neutral', label: formatStatusLabel(status) };
  }

  // 4. Transfer / TIA Domain
  if (domain === 'transfer') {
    if (['adequate', 'scc_executed', 'bcr_approved', 'approved'].includes(status)) {
      return { variant: 'compliant', label: 'Adequate / Approved' };
    }
    if (['in_progress', 'evaluating', 'tia_draft'].includes(status)) {
      return { variant: 'review', label: 'Assessment In Progress' };
    }
    if (['remediation_required', 'review_overdue'].includes(status)) {
      return { variant: 'warning', label: 'Remediation Required' };
    }
    if (['high_risk', 'non_compliant', 'suspended', 'no_safeguards'].includes(status)) {
      return { variant: 'critical', label: 'High Transfer Risk' };
    }
  }

  // 5. Review & Approval States
  if (['accepted', 'approved', 'compliant', 'active', 'valid', 'passed'].includes(status)) {
    return { variant: 'compliant', label: formatStatusLabel(status) };
  }
  if (['under_review', 'in_review', 'submitted', 'in_progress', 'pending_approval'].includes(status)) {
    return { variant: 'review', label: formatStatusLabel(status) };
  }
  if (['revision_requested', 'warning', 'attention_required', 'needs_review'].includes(status)) {
    return { variant: 'warning', label: formatStatusLabel(status) };
  }
  if (['rejected', 'critical', 'failed', 'high_risk', 'non_compliant', 'expired'].includes(status)) {
    return { variant: 'critical', label: formatStatusLabel(status) };
  }

  return { variant: 'neutral', label: formatStatusLabel(status) };
}

function formatStatusLabel(str: string): string {
  if (!str) return 'Unknown';
  return str
    .replace(/[_-]/g, ' ')
    .split(' ')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

// ==========================================
// CONVENIENCE STATUS COMPONENTS
// ==========================================
export interface UIStatusBadgeProps {
  status: string;
  domain?: StatusDomain;
  customLabel?: string;
  size?: 'sm' | 'md';
}

export function UIStatusBadge({
  status,
  domain = 'generic',
  customLabel,
  size = 'md',
}: UIStatusBadgeProps) {
  const { variant, label } = getStatusVariant(status, domain);
  return (
    <UIBadge variant={variant} size={size}>
      {customLabel || label}
    </UIBadge>
  );
}

export interface UIRiskBadgeProps {
  level: string;
  size?: 'sm' | 'md';
}

export function UIRiskBadge({ level, size = 'md' }: UIRiskBadgeProps) {
  const { variant, label } = getStatusVariant(level, 'risk');
  return (
    <UIBadge variant={variant} size={size}>
      {label}
    </UIBadge>
  );
}

export interface UIExpiryBadgeProps {
  expiryDateIso: string;
  size?: 'sm' | 'md';
}

export function UIExpiryBadge({ expiryDateIso, size = 'md' }: UIExpiryBadgeProps) {
  if (!expiryDateIso) {
    return <UIBadge variant="neutral" size={size}>No Expiry</UIBadge>;
  }

  const expiryTime = new Date(expiryDateIso).getTime();
  const diffDays = Math.ceil((expiryTime - Date.now()) / (1000 * 60 * 60 * 24));

  if (diffDays < 0) {
    return <UIBadge variant="critical" size={size}>Expired ({Math.abs(diffDays)}d ago)</UIBadge>;
  }
  if (diffDays <= 30) {
    return <UIBadge variant="warning" size={size}>Expiring in {diffDays}d</UIBadge>;
  }
  return <UIBadge variant="compliant" size={size}>Valid ({diffDays}d remaining)</UIBadge>;
}

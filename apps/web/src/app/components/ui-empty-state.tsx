'use client';

import React from 'react';

export type EmptyStateType = 'setup' | 'filter' | 'audit' | 'generic';

export interface EmptyStateHint {
  label: string;
  sublabel?: string;
}

export interface UIEmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  type?: EmptyStateType;
  actionText?: string;
  onAction?: () => void;
  actionIcon?: string;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
  hints?: EmptyStateHint[];
  compact?: boolean;
}

export function UIEmptyState({
  icon = '📋',
  title,
  description,
  type = 'generic',
  actionText,
  onAction,
  actionIcon,
  secondaryActionText,
  onSecondaryAction,
  hints = [],
  compact = false,
}: UIEmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: compact ? '28px 16px' : '44px 24px',
        backgroundColor: 'var(--surface-l2-card)',
        borderRadius: 'var(--radius-lg)',
        border: '1px dashed var(--border-default)',
        maxWidth: '100%',
        margin: '0 auto',
      }}
    >
      {/* Icon Circle */}
      <div
        style={{
          fontSize: compact ? '22px' : '28px',
          width: compact ? '44px' : '54px',
          height: compact ? '44px' : '54px',
          borderRadius: '50%',
          backgroundColor: 'var(--surface-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: compact ? '12px' : '16px',
          border: '1px solid var(--border-default)',
          boxShadow: 'var(--shadow-sm)',
        }}
      >
        {icon}
      </div>

      {/* Title & Description */}
      <h3
        className="text-card-title"
        style={{
          color: 'var(--text-primary)',
          marginBottom: '6px',
          fontWeight: 700,
        }}
      >
        {title}
      </h3>
      <p
        className="text-body-muted"
        style={{
          maxWidth: '460px',
          lineHeight: 1.5,
          marginBottom: (actionText || secondaryActionText || hints.length > 0) ? '18px' : '0',
        }}
      >
        {description}
      </p>

      {/* Optional "What Happens Next" Steps or Checklist */}
      {hints.length > 0 && (
        <div
          style={{
            textAlign: 'left',
            backgroundColor: 'var(--surface-subtle)',
            border: '1px solid var(--border-subtle)',
            borderRadius: 'var(--radius-md)',
            padding: '12px 16px',
            marginBottom: (actionText || secondaryActionText) ? '18px' : '0',
            width: '100%',
            maxWidth: '440px',
          }}
        >
          <div
            className="text-overline"
            style={{ color: 'var(--text-muted)', marginBottom: '8px' }}
          >
            How this process works:
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
            {hints.map((hint, idx) => (
              <div key={idx} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', fontSize: '12px' }}>
                <span style={{ color: 'var(--accent-primary)', fontWeight: 700, minWidth: '14px' }}>
                  {idx + 1}.
                </span>
                <div>
                  <span style={{ color: 'var(--text-primary)', fontWeight: 600 }}>{hint.label}</span>
                  {hint.sublabel && (
                    <span style={{ color: 'var(--text-secondary)', marginLeft: '4px' }}>
                      — {hint.sublabel}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Action Buttons */}
      {(actionText || secondaryActionText) && (
        <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
          {secondaryActionText && (
            <button
              onClick={onSecondaryAction}
              className="btn-secondary"
              style={{ fontSize: '12.5px', padding: '6px 14px' }}
            >
              {secondaryActionText}
            </button>
          )}
          {actionText && (
            <button
              onClick={onAction}
              className={type === 'filter' ? 'btn-secondary' : 'btn-primary'}
              style={{ fontSize: '12.5px', padding: '6px 16px' }}
            >
              {actionIcon && <span style={{ marginRight: '4px' }}>{actionIcon}</span>}
              {actionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

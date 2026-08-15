'use client';

import React from 'react';

export interface UIEmptyStateProps {
  icon?: string;
  title: string;
  description: string;
  actionText?: string;
  onAction?: () => void;
  secondaryActionText?: string;
  onSecondaryAction?: () => void;
}

export function UIEmptyState({
  icon = '📋',
  title,
  description,
  actionText,
  onAction,
  secondaryActionText,
  onSecondaryAction,
}: UIEmptyStateProps) {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        padding: '48px 24px',
        backgroundColor: 'var(--bg-surface)',
        border: '1px dashed var(--border-default)',
        borderRadius: '12px',
      }}
    >
      <div
        style={{
          fontSize: '32px',
          width: '56px',
          height: '56px',
          borderRadius: '50%',
          backgroundColor: 'var(--bg-canvas-subtle)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          marginBottom: '16px',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {icon}
      </div>
      <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)', marginBottom: '6px' }}>
        {title}
      </h3>
      <p style={{ fontSize: '13px', color: 'var(--text-secondary)', maxWidth: '420px', lineHeight: 1.5, marginBottom: actionText ? '20px' : '0' }}>
        {description}
      </p>

      {(actionText || secondaryActionText) && (
        <div style={{ display: 'flex', gap: '10px' }}>
          {secondaryActionText && (
            <button onClick={onSecondaryAction} className="btn-secondary">
              {secondaryActionText}
            </button>
          )}
          {actionText && (
            <button onClick={onAction} className="btn-primary">
              {actionText}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

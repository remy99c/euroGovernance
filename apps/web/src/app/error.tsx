'use client';

import React, { useEffect } from 'react';

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Unhandled App Router Error:', error);
  }, [error]);

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: 'var(--surface-l1-canvas, #080c14)',
        color: 'var(--text-primary, #f1f5f9)',
        padding: '24px',
        fontFamily: 'Inter, system-ui, sans-serif',
      }}
    >
      <div
        style={{
          maxWidth: '480px',
          width: '100%',
          backgroundColor: 'var(--surface-l2-card, #0f172a)',
          border: '1px solid var(--border-default, #1e293b)',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🛡️</div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px 0', letterSpacing: '-0.02em' }}>
          Application Encountered an Issue
        </h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', margin: '0 0 20px 0', lineHeight: 1.5 }}>
          {error.message || 'An unexpected error occurred during rendering.'}
        </p>

        <div style={{ display: 'flex', gap: '10px', justifyContent: 'center' }}>
          <button
            onClick={() => reset()}
            style={{
              padding: '8px 18px',
              backgroundColor: 'var(--accent-primary, #2563eb)',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🔄 Try Again
          </button>
          <button
            onClick={() => window.location.reload()}
            style={{
              padding: '8px 18px',
              backgroundColor: 'var(--surface-subtle, #1e293b)',
              color: 'var(--text-primary, #f1f5f9)',
              border: '1px solid var(--border-default, #334155)',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Full Reload
          </button>
        </div>

        {error.digest && (
          <div style={{ marginTop: '20px', fontSize: '11px', color: 'var(--text-muted, #64748b)' }}>
            Error Digest: <code>{error.digest}</code>
          </div>
        )}
      </div>
    </div>
  );
}

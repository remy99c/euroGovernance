import React from 'react';
import Link from 'next/link';

export default function NotFound() {
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
          maxWidth: '440px',
          width: '100%',
          backgroundColor: 'var(--surface-l2-card, #0f172a)',
          border: '1px solid var(--border-default, #1e293b)',
          borderRadius: '12px',
          padding: '32px',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: '40px', marginBottom: '16px' }}>🔍</div>
        <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px 0' }}>404 - Page Not Found</h2>
        <p style={{ fontSize: '13px', color: 'var(--text-secondary, #94a3b8)', margin: '0 0 20px 0' }}>
          The requested compliance route or assessment resource does not exist.
        </p>
        <Link
          href="/"
          style={{
            display: 'inline-block',
            padding: '8px 18px',
            backgroundColor: 'var(--accent-primary, #2563eb)',
            color: '#ffffff',
            borderRadius: '6px',
            fontSize: '13px',
            fontWeight: 700,
            textDecoration: 'none',
          }}
        >
          Return to Dashboard
        </Link>
      </div>
    </div>
  );
}

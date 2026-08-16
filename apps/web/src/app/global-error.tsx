'use client';

import React from 'react';

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#080c14',
          color: '#f1f5f9',
          fontFamily: 'Inter, system-ui, sans-serif',
        }}
      >
        <div
          style={{
            maxWidth: '480px',
            width: '100%',
            backgroundColor: '#0f172a',
            border: '1px solid #1e293b',
            borderRadius: '12px',
            padding: '32px',
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: '40px', marginBottom: '16px' }}>🇪🇺</div>
          <h2 style={{ fontSize: '20px', fontWeight: 800, margin: '0 0 8px 0' }}>
            System Error
          </h2>
          <p style={{ fontSize: '13px', color: '#94a3b8', margin: '0 0 20px 0' }}>
            {error.message || 'A global root error occurred.'}
          </p>
          <button
            onClick={() => reset()}
            style={{
              padding: '8px 18px',
              backgroundColor: '#2563eb',
              color: '#ffffff',
              border: 'none',
              borderRadius: '6px',
              fontSize: '13px',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            🔄 Reload euroGovernance
          </button>
        </div>
      </body>
    </html>
  );
}

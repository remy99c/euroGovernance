import React, { Suspense } from 'react';
import type { Metadata } from 'next';
import { ExternalAssessmentPortalClient } from './[id]/portal-client';

export const metadata: Metadata = {
  referrer: 'no-referrer',
  robots: {
    index: false,
    follow: false,
    noarchive: true,
  },
};

/**
 * Stable static-export entry point. Assessment identity is supplied through
 * non-secret query parameters and the bearer token through the URL fragment.
 */
export default function ExternalAssessmentPortalPage() {
  return (
    <Suspense
      fallback={
        <div
          style={{
            minHeight: '100vh',
            background: '#0a0d14',
            color: '#e2e8f0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
            <div style={{ fontSize: '15px', color: '#94a3b8' }}>
              Initializing secure assessment portal...
            </div>
          </div>
        </div>
      }
    >
      <ExternalAssessmentPortalClient />
    </Suspense>
  );
}

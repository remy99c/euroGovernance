'use client';

import React from 'react';
import { PersonaFlowConfig } from './persona-flows';

export interface OnboardingProgressBannerProps {
  flowConfig: PersonaFlowConfig;
  currentStepIndex: number;
  completedStepsCount: number;
  totalSteps: number;
  percentComplete: number;
  onOpenWizard: () => void;
  onDismiss: () => void;
}

export function OnboardingProgressBanner({
  flowConfig,
  currentStepIndex,
  completedStepsCount,
  totalSteps,
  percentComplete,
  onOpenWizard,
  onDismiss,
}: OnboardingProgressBannerProps) {
  const currentStep = flowConfig.steps[currentStepIndex] || flowConfig.steps[0];

  return (
    <div
      style={{
        backgroundColor: 'var(--surface-l2-card)',
        border: '1px solid var(--accent-primary)',
        borderRadius: '10px',
        padding: '14px 20px',
        marginBottom: '24px',
        boxShadow: '0 2px 12px var(--accent-primary-glow)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '20px',
        flexWrap: 'wrap',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: 1, minWidth: '280px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '8px',
            backgroundColor: 'var(--accent-primary-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '20px',
            flexShrink: 0,
          }}
        >
          {currentStep?.icon || '🚀'}
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '3px' }}>
            <span
              style={{
                fontSize: '10px',
                fontWeight: 800,
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                padding: '2px 6px',
                borderRadius: '4px',
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
              }}
            >
              {flowConfig.badge}
            </span>
            <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-primary)' }}>
              Step {currentStepIndex + 1} of {totalSteps}: {currentStep?.title}
            </span>
          </div>
          <div style={{ fontSize: '11.5px', color: 'var(--text-secondary)' }}>{currentStep?.subtitle}</div>

          {/* Progress track */}
          <div
            style={{
              width: '100%',
              maxWidth: '320px',
              height: '5px',
              borderRadius: '3px',
              backgroundColor: 'var(--surface-subtle)',
              marginTop: '8px',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${percentComplete}%`,
                height: '100%',
                backgroundColor: 'var(--accent-primary)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)' }}>
          {completedStepsCount} of {totalSteps} complete ({percentComplete}%)
        </span>

        <button
          onClick={onOpenWizard}
          className="btn-primary"
          style={{ padding: '8px 16px', fontSize: '12px', fontWeight: 700 }}
        >
          Resume Setup ➔
        </button>

        <button
          onClick={onDismiss}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '14px',
            padding: '4px',
          }}
          title="Dismiss banner"
        >
          ✕
        </button>
      </div>
    </div>
  );
}

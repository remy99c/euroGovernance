'use client';

import React from 'react';

// ==========================================
// 1. STANDARDIZED FORM FIELD
// ==========================================
export interface UIFormFieldProps {
  label: string;
  required?: boolean;
  hint?: string;
  error?: string;
  children: React.ReactNode;
  id?: string;
}

export function UIFormField({
  label,
  required = false,
  hint,
  error,
  children,
  id,
}: UIFormFieldProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '5px', marginBottom: '14px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <label
          htmlFor={id}
          style={{
            fontSize: '12.5px',
            fontWeight: 600,
            color: error ? 'var(--status-critical-fg)' : 'var(--text-primary)',
          }}
        >
          {label} {required && <span style={{ color: 'var(--status-critical-fg)' }}>*</span>}
        </label>
        {hint && (
          <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
            {hint}
          </span>
        )}
      </div>

      <div>{children}</div>

      {error && (
        <div style={{ fontSize: '11px', color: 'var(--status-critical-fg)', fontWeight: 600 }}>
          ⚠️ {error}
        </div>
      )}
    </div>
  );
}

// ==========================================
// 2. STANDARDIZED FORM SECTION
// ==========================================
export interface UIFormSectionProps {
  stepNumber?: number;
  title: string;
  description?: string;
  children: React.ReactNode;
  badge?: React.ReactNode;
}

export function UIFormSection({
  stepNumber,
  title,
  description,
  children,
  badge,
}: UIFormSectionProps) {
  return (
    <div
      className="card-modern"
      style={{
        padding: '18px 20px',
        marginBottom: '16px',
        backgroundColor: 'var(--surface-l2-card)',
        border: '1px solid var(--border-default)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'flex-start',
          marginBottom: '14px',
          borderBottom: '1px solid var(--border-subtle)',
          paddingBottom: '10px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          {typeof stepNumber === 'number' && (
            <span
              style={{
                width: '24px',
                height: '24px',
                borderRadius: '50%',
                backgroundColor: 'var(--accent-primary)',
                color: '#ffffff',
                fontSize: '12px',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              {stepNumber}
            </span>
          )}
          <div>
            <h3 style={{ fontSize: '14px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
              {title}
            </h3>
            {description && (
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
                {description}
              </p>
            )}
          </div>
        </div>

        {badge && <div>{badge}</div>}
      </div>

      <div>{children}</div>
    </div>
  );
}

// ==========================================
// 3. STEPPER PROGRESS BAR
// ==========================================
export interface WizardStep {
  id: string;
  title: string;
  subtitle?: string;
}

export interface UIFormStepperProps {
  steps: WizardStep[];
  currentStepIndex: number;
  onStepClick?: (index: number) => void;
}

export function UIFormStepper({ steps, currentStepIndex, onStepClick }: UIFormStepperProps) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '14px 20px',
        backgroundColor: 'var(--surface-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        marginBottom: '20px',
      }}
    >
      {steps.map((step, idx) => {
        const isComplete = idx < currentStepIndex;
        const isActive = idx === currentStepIndex;
        const isPending = idx > currentStepIndex;

        return (
          <React.Fragment key={step.id}>
            <div
              onClick={() => isComplete && onStepClick && onStepClick(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                cursor: isComplete ? 'pointer' : 'default',
                opacity: isPending ? 0.6 : 1,
              }}
            >
              <div
                style={{
                  width: '24px',
                  height: '24px',
                  borderRadius: '50%',
                  backgroundColor: isComplete
                    ? 'var(--status-compliant-fg)'
                    : isActive
                    ? 'var(--accent-primary)'
                    : 'var(--surface-l2-card)',
                  color: isPending ? 'var(--text-muted)' : '#ffffff',
                  border: isPending ? '1px solid var(--border-default)' : 'none',
                  fontSize: '11px',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {isComplete ? '✓' : idx + 1}
              </div>
              <div>
                <div
                  style={{
                    fontSize: '12.5px',
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                  }}
                >
                  {step.title}
                </div>
                {step.subtitle && (
                  <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>
                    {step.subtitle}
                  </div>
                )}
              </div>
            </div>

            {idx < steps.length - 1 && (
              <div
                style={{
                  flex: 1,
                  height: '1px',
                  backgroundColor: idx < currentStepIndex ? 'var(--accent-primary)' : 'var(--border-subtle)',
                  margin: '0 12px',
                }}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ==========================================
// 4. PRE-SUBMISSION REVIEW SUMMARY
// ==========================================
export interface ReviewField {
  label: string;
  value: React.ReactNode;
  category?: string;
}

export interface UIFormReviewSummaryProps {
  fields: ReviewField[];
  title?: string;
  description?: string;
}

export function UIFormReviewSummary({
  fields,
  title = 'Pre-Submission Verification',
  description = 'Please verify all statutory parameters and recipient details before dispatching the assessment token.',
}: UIFormReviewSummaryProps) {
  return (
    <div
      style={{
        padding: '16px 20px',
        backgroundColor: 'var(--surface-subtle)',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-md)',
        marginBottom: '18px',
      }}
    >
      <div style={{ marginBottom: '12px' }}>
        <h4 style={{ fontSize: '13.5px', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
          {title}
        </h4>
        <p style={{ fontSize: '11.5px', color: 'var(--text-secondary)', margin: '2px 0 0 0' }}>
          {description}
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
          gap: '12px',
          padding: '12px',
          backgroundColor: 'var(--surface-l2-card)',
          borderRadius: 'var(--radius-sm)',
          border: '1px solid var(--border-subtle)',
        }}
      >
        {fields.map((f, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
            <span className="text-overline" style={{ color: 'var(--text-muted)' }}>{f.label}</span>
            <span style={{ fontSize: '12.5px', fontWeight: 600, color: 'var(--text-primary)' }}>
              {f.value || <span style={{ color: 'var(--text-muted)' }}>Not specified</span>}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

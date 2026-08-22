'use client';

import React, { useState } from 'react';
import { UIModal } from '../components/ui-modal';
import { PersonaFlowConfig } from './persona-flows';

export interface OnboardingWizardModalProps {
  isOpen: boolean;
  onClose: () => void;
  flowConfig: PersonaFlowConfig;
  currentStepIndex: number;
  onStepComplete: (stepId: string, nextIndex?: number) => void;
  onFinishOnboarding: () => void;
  onNavigateToTab: (tab: string) => void;
  tenantId: string;
  onNotice?: (msg: string) => void;
}

export function OnboardingWizardModal({
  isOpen,
  onClose,
  flowConfig,
  currentStepIndex: initialStepIndex,
  onStepComplete,
  onFinishOnboarding,
  onNavigateToTab,
  tenantId,
  onNotice,
}: OnboardingWizardModalProps) {
  const [activeStepIndex, setActiveStepIndex] = useState(initialStepIndex || 0);

  // Admin Genesis State
  const [legalName, setLegalName] = useState('');
  const [country, setCountry] = useState('');
  const [cloudRegion, setCloudRegion] = useState('');
  const [selectedFrameworks, setSelectedFrameworks] = useState<string[]>([]);
  const [scopingAnswers, setScopingAnswers] = useState<Record<string, boolean>>({});
  const [leadInvites, setLeadInvites] = useState<{ email: string; role: string; dept: string }[]>([]);

  // Specialist Flow State
  const [newInviteEmail, setNewInviteEmail] = useState('');
  const [newInviteRole, setNewInviteRole] = useState('compliance_manager');
  const [newInviteDept, setNewInviteDept] = useState('Governance');

  const steps = flowConfig.steps;
  const currentStep = steps[activeStepIndex] || steps[0];
  const totalSteps = steps.length;

  const handleNext = () => {
    onStepComplete(currentStep.id, activeStepIndex + 1);
    if (activeStepIndex < totalSteps - 1) {
      setActiveStepIndex(activeStepIndex + 1);
    } else {
      onFinishOnboarding();
      onClose();
      onNotice?.('🎉 Onboarding walkthrough marked complete. Verify each resulting record before relying on it.');
    }
  };

  const handleBack = () => {
    if (activeStepIndex > 0) {
      setActiveStepIndex(activeStepIndex - 1);
    }
  };

  const toggleFramework = (fwId: string) => {
    setSelectedFrameworks((prev) =>
      prev.includes(fwId) ? prev.filter((f) => f !== fwId) : [...prev, fwId]
    );
  };

  const addInvite = () => {
    if (!newInviteEmail.trim()) return;
    setLeadInvites((prev) => [...prev, { email: newInviteEmail, role: newInviteRole, dept: newInviteDept }]);
    setNewInviteEmail('');
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title={`${flowConfig.title}`}
      subtitle={`Step ${activeStepIndex + 1} of ${totalSteps} • ${currentStep?.title}`}
      maxWidth="780px"
    >
      <div style={{ padding: '10px 12px', marginBottom: '16px', borderRadius: '8px', backgroundColor: 'var(--status-warning-bg)', color: 'var(--text-primary)', fontSize: '12px' }}>
        This is a non-mutating orientation worksheet. Entries below are not saved, invitations are not sent, and no framework, scope fact, control, or policy is created. Use the linked operational modules to create reviewed records.
      </div>

      {/* 1. STEPPER INDICATOR */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          marginBottom: '24px',
          backgroundColor: 'var(--surface-subtle)',
          padding: '8px 12px',
          borderRadius: '8px',
          border: '1px solid var(--border-subtle)',
          overflowX: 'auto',
        }}
      >
        {steps.map((step, idx) => {
          const isDone = idx < activeStepIndex;
          const isActive = idx === activeStepIndex;

          return (
            <div
              key={step.id}
              onClick={() => setActiveStepIndex(idx)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 8px',
                borderRadius: '6px',
                fontSize: '11.5px',
                fontWeight: isActive ? 700 : 500,
                backgroundColor: isActive
                  ? 'var(--surface-l2-card)'
                  : isDone
                  ? 'var(--status-compliant-bg)'
                  : 'transparent',
                color: isActive
                  ? 'var(--accent-primary)'
                  : isDone
                  ? 'var(--status-compliant-fg)'
                  : 'var(--text-muted)',
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              <span>{isDone ? '✓' : step.icon}</span>
              <span>{step.title}</span>
            </div>
          );
        })}
      </div>

      {/* 2. DYNAMIC STEP BODY CONTENT */}
      <div style={{ minHeight: '280px', marginBottom: '24px' }}>
        {/* =========================================================================
            ADMIN GENESIS STEPS
            ========================================================================= */}
        {flowConfig.role === 'tenant_admin' && (
          <>
            {/* Step 1: Org Baseline */}
            {activeStepIndex === 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label className="label-modern">Draft Legal Entity Name</label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    className="input-modern"
                    style={{ width: '100%' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                  <div>
                    <label className="label-modern">Draft EU Member State Scoping Input</label>
                    <select
                      value={country}
                      onChange={(e) => setCountry(e.target.value)}
                      className="input-modern"
                      style={{ width: '100%' }}
                    >
                      <option value="">Select a scoping jurisdiction</option>
                      <option value="DE">Germany (DE)</option>
                      <option value="FR">France (FR)</option>
                      <option value="NL">Netherlands (NL)</option>
                      <option value="SE">Sweden (SE)</option>
                      <option value="IE">Ireland (IE)</option>
                    </select>
                  </div>

                  <div>
                    <label className="label-modern">Draft Requested Hosting Region (Metadata Only)</label>
                    <select
                      value={cloudRegion}
                      onChange={(e) => setCloudRegion(e.target.value)}
                      className="input-modern"
                      style={{ width: '100%' }}
                    >
                      <option value="">Select requested region metadata</option>
                      <option value="europe-west3">Frankfurt (europe-west3) - Germany</option>
                      <option value="europe-west9">Paris (europe-west9) - France</option>
                      <option value="europe-west1">Belgium (europe-west1) - EEA</option>
                    </select>
                  </div>
                </div>

                <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                  This selection records a requested region; it does not relocate or enforce the deployed Firebase resources.
                </div>

                <div
                  style={{
                    backgroundColor: 'var(--accent-primary-subtle)',
                    border: '1px solid var(--accent-primary)',
                    borderRadius: '8px',
                    padding: '12px 14px',
                    fontSize: '12px',
                    color: 'var(--text-primary)',
                  }}
                >
                  💡 <strong>Jurisdiction scoping note:</strong> This Member State is recorded as a scoping input only. Lead supervisory authority depends on a legal assessment of main establishment and cross-border processing under GDPR Article 56. Breach-notification deadlines must be assessed separately.
                </div>
              </div>
            )}

            {/* Step 2: Regulatory Scope */}
            {activeStepIndex === 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                {[
                  { id: 'eu_gdpr', name: 'EU GDPR (General Data Protection Regulation)', tag: 'Mandatory (EEA Data)', desc: 'Article 30 ROPA, DPIAs, Chapter V Transfers, and 72h Breaches.' },
                  { id: 'iso_27001_2022', name: 'ISO/IEC 27001:2022 (ISMS Baseline)', tag: 'Recommended Security', desc: '93 information security controls mapped across 4 organizational themes.' },
                  { id: 'eu_ai_act', name: 'EU Artificial Intelligence Act (2024/1689)', tag: 'Active Deployments', desc: 'Screening for Prohibited Practices (Art. 5) & High-Risk Annex III Obligations.' },
                  { id: 'iso_42001_2023', name: 'ISO/IEC 42001:2023 (AIMS)', tag: 'Optional Add-on', desc: 'Artificial Intelligence Management System certifiable standard.' },
                  { id: 'eu_nis2', name: 'NIS2 Directive (EU 2022/2555)', tag: 'Critical Supply Chain', desc: 'Cybersecurity risk management and incident reporting for essential entities.' },
                ].map((fw) => {
                  const isChecked = selectedFrameworks.includes(fw.id);
                  return (
                    <div
                      key={fw.id}
                      onClick={() => toggleFramework(fw.id)}
                      style={{
                        padding: '12px 16px',
                        borderRadius: '8px',
                        border: isChecked ? '1.5px solid var(--accent-primary)' : '1px solid var(--border-subtle)',
                        backgroundColor: isChecked ? 'var(--accent-primary-subtle)' : 'var(--surface-subtle)',
                        cursor: 'pointer',
                        display: 'flex',
                        justifyContent: 'space-between',
                        alignItems: 'center',
                        transition: 'all 0.15s ease',
                      }}
                    >
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ fontWeight: 700, fontSize: '13px', color: 'var(--text-primary)' }}>{fw.name}</span>
                          <span style={{ fontSize: '10px', fontWeight: 700, padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--surface-l2-card)', color: 'var(--accent-primary)' }}>
                            {fw.tag}
                          </span>
                        </div>
                        <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '4px' }}>{fw.desc}</div>
                      </div>
                      <input type="checkbox" checked={isChecked} onChange={() => {}} style={{ width: '16px', height: '16px' }} />
                    </div>
                  );
                })}
              </div>
            )}

            {/* Step 3: Fast-Track Scoping */}
            {activeStepIndex === 2 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Preview four inputs that may be relevant to formal scoping. These answers stay in this browser view and do not run the applicability engine.
                </div>

                {[
                  { id: 'dev', q: '1. Does your organization build or deploy internal software in-house?', impact: 'Scopes ISO A.8.25 - A.8.34 (Secure Development Lifecycle)' },
                  { id: 'ai_bio', q: '2. Do you process biometric data or build foundation AI/ML models?', impact: 'Scopes AI Act Annex III & GDPR Art. 9 Sensitive Categories' },
                  { id: 'transfers', q: '3. Do you transfer personal data to processors outside the EEA?', impact: 'Scopes GDPR Chapter V Standard Contractual Clauses (SCCs) & TIAs' },
                  { id: 'nis2_infra', q: '4. Do you operate critical national infrastructure or essential supply chains?', impact: 'May require a separate NIS2 scope assessment; this answer does not determine applicability.' },
                ].map((item) => (
                  <div key={item.id} style={{ padding: '10px 14px', borderRadius: '8px', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
                    <div style={{ fontWeight: 600, fontSize: '12.5px', color: 'var(--text-primary)' }}>{item.q}</div>
                    <div style={{ display: 'flex', gap: '20px', marginTop: '6px' }}>
                      <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`scope_${item.id}`}
                          checked={scopingAnswers[item.id] === true}
                          onChange={() => setScopingAnswers({ ...scopingAnswers, [item.id]: true })}
                        />
                        Yes
                      </label>
                      <label style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                        <input
                          type="radio"
                          name={`scope_${item.id}`}
                          checked={scopingAnswers[item.id] === false}
                          onChange={() => setScopingAnswers({ ...scopingAnswers, [item.id]: false })}
                        />
                        No
                      </label>
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>↳ {item.impact}</div>
                  </div>
                ))}

                <div style={{ padding: '10px', borderRadius: '6px', backgroundColor: 'var(--surface-subtle)', color: 'var(--text-muted)', fontSize: '12px', fontWeight: 600, textAlign: 'center' }}>
                  No applicability decision or harmonization result is generated by this walkthrough.
                </div>
              </div>
            )}

            {/* Step 4: Appoint Leads */}
            {activeStepIndex === 3 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Draft a possible lead roster for discussion. Entries are not saved and no invitation or email is created here.
                </div>

                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  {leadInvites.map((lead, i) => (
                    <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 12px', borderRadius: '6px', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', fontSize: '12px' }}>
                      <div>
                        <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{lead.email}</span>
                        <span style={{ color: 'var(--text-muted)', marginLeft: '10px' }}>• {lead.role} ({lead.dept})</span>
                      </div>
                      <button
                        onClick={() => setLeadInvites(leadInvites.filter((_, idx) => idx !== i))}
                        style={{ background: 'none', border: 'none', color: 'var(--status-critical-fg)', cursor: 'pointer' }}
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>

                {/* Add invite row */}
                <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                  <input
                    type="email"
                    placeholder="Colleague Email Address"
                    value={newInviteEmail}
                    onChange={(e) => setNewInviteEmail(e.target.value)}
                    className="input-modern"
                    style={{ flex: 1, fontSize: '12px' }}
                  />
                  <select
                    value={newInviteRole}
                    onChange={(e) => setNewInviteRole(e.target.value)}
                    className="input-modern"
                    style={{ fontSize: '12px' }}
                  >
                    <option value="privacy_manager">Privacy Manager (DPO)</option>
                    <option value="security_manager">Security Manager (CISO)</option>
                    <option value="ai_governance_manager">AI Governance Lead</option>
                    <option value="compliance_manager">Compliance Manager</option>
                    <option value="auditor">Auditor</option>
                  </select>
                  <button onClick={addInvite} className="btn-secondary" style={{ fontSize: '12px' }}>
                    + Add to Unsaved Draft
                  </button>
                </div>
              </div>
            )}

            {/* Step 5: Evidence Governance & Policies */}
            {activeStepIndex === 4 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ fontSize: '12.5px', color: 'var(--text-secondary)' }}>
                  Review planned governance controls. Onboarding does not configure or enforce these controls yet.
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--surface-subtle)',
                    cursor: 'default',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      Evidence Four-Eyes Review — Pipeline Unavailable
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      The verified evidence upload and approval pipeline is disabled. No review-separation setting is changed here.
                    </div>
                  </div>
                  <input type="checkbox" checked={false} disabled readOnly aria-label="Evidence four-eyes review unavailable" style={{ width: '16px', height: '16px' }} />
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--surface-subtle)',
                    cursor: 'default',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      Server-Verified SHA-256 Evidence Integrity — Pipeline Unavailable
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      No file is uploaded and no checksum is verified by this onboarding screen.
                    </div>
                  </div>
                  <input type="checkbox" checked={false} disabled readOnly aria-label="Evidence checksum verification unavailable" style={{ width: '16px', height: '16px' }} />
                </div>

                <div
                  style={{
                    padding: '12px 14px',
                    borderRadius: '8px',
                    border: '1px solid var(--border-subtle)',
                    backgroundColor: 'var(--surface-subtle)',
                    cursor: 'default',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '12.5px', color: 'var(--text-primary)' }}>
                      Recurring Vendor Assessment Automation — Not Configured
                    </div>
                    <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>
                      No recurring schedule is created by onboarding. Configure an operational schedule in the assessment workflow when available.
                    </div>
                  </div>
                  <input type="checkbox" checked={false} disabled readOnly aria-label="Recurring vendor assessment automation not configured" style={{ width: '16px', height: '16px' }} />
                </div>
              </div>
            )}
          </>
        )}

        {/* =========================================================================
            SPECIALIST PERSONA STEPS
            ========================================================================= */}
        {flowConfig.role !== 'tenant_admin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            <div style={{ padding: '16px', borderRadius: '8px', backgroundColor: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
                <span style={{ fontSize: '24px' }}>{currentStep.icon}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>{currentStep.title}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>{currentStep.subtitle}</div>
                </div>
              </div>

              <div style={{ marginTop: '12px', padding: '10px 12px', borderRadius: '6px', backgroundColor: 'var(--accent-primary-subtle)', color: 'var(--accent-primary)', fontSize: '11.5px', fontWeight: 600 }}>
                💡 <strong>Compliance Impact:</strong> {currentStep.complianceImpact}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'center', padding: '20px' }}>
              <button
                onClick={() => {
                  onNavigateToTab(currentStep.targetTab);
                  handleNext();
                }}
                className="btn-primary"
                style={{ padding: '10px 24px', fontSize: '13px', fontWeight: 700 }}
              >
                {currentStep.recommendedActionLabel} ➔
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. FOOTER ACTIONS */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderTop: '1px solid var(--border-subtle)',
          paddingTop: '16px',
        }}
      >
        <button
          onClick={handleBack}
          disabled={activeStepIndex === 0}
          className="btn-secondary"
          style={{ visibility: activeStepIndex === 0 ? 'hidden' : 'visible' }}
        >
          ‹ Back
        </button>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={onClose} className="btn-secondary">
            Close Walkthrough
          </button>

          <button onClick={handleNext} className="btn-primary" style={{ fontWeight: 700 }}>
            {activeStepIndex === totalSteps - 1 ? 'Mark Walkthrough Viewed' : 'Next Step ›'}
          </button>
        </div>
      </div>
    </UIModal>
  );
}

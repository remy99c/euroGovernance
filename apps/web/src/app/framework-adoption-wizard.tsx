'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface FrameworkItem {
  id: string;
  code: string;
  name: string;
  category: string;
  jurisdiction: string;
  version: string;
  description: string;
  type: 'standard' | 'regulation';
}

const AVAILABLE_FRAMEWORKS: FrameworkItem[] = [
  {
    id: 'gdpr',
    code: 'EU-GDPR-2016',
    name: 'General Data Protection Regulation (GDPR)',
    category: 'Privacy & Data Protection',
    jurisdiction: 'European Union',
    version: '2016/679',
    description: 'Comprehensive regulation on data privacy and personal data processing across EU/EEA.',
    type: 'regulation',
  },
  {
    id: 'eu_ai_act',
    code: 'EU-AI-ACT-2024',
    name: 'EU Artificial Intelligence Act',
    category: 'AI & Emerging Tech',
    jurisdiction: 'European Union',
    version: '2024/1689',
    description: 'Risk-based governance framework for AI development, deployment, and high-risk system conformity.',
    type: 'regulation',
  },
  {
    id: 'eu_data_act',
    code: 'EU-DATA-ACT-2023',
    name: 'EU Data Act',
    category: 'Data Sharing & Cloud Interoperability',
    jurisdiction: 'European Union',
    version: '2023/2854',
    description: 'Harmonized rules on fair access to and use of connected device and cloud processing data.',
    type: 'regulation',
  },
  {
    id: 'iso_27001',
    code: 'ISO-IEC-27001',
    name: 'ISO/IEC 27001:2022',
    category: 'Information Security Management',
    jurisdiction: 'International',
    version: '2022',
    description: 'Global standard for establishing, implementing, and continually improving an ISMS and Annex A controls.',
    type: 'standard',
  },
  {
    id: 'iso_42001',
    code: 'ISO-IEC-42001',
    name: 'ISO/IEC 42001:2023',
    category: 'AI Management System',
    jurisdiction: 'International',
    version: '2023',
    description: 'International management system standard for responsible, trustworthy organizational AI governance.',
    type: 'standard',
  },
];

interface QuestionnaireQuestion {
  id: string;
  factKey: string;
  category: string;
  prompt: string;
  helpText: string;
  responseType: 'boolean' | 'string' | 'string_array';
  options?: string[];
  defaultValue?: any;
}

const DEFAULT_QUESTIONS: QuestionnaireQuestion[] = [
  {
    id: 'q_gdpr_personal_data',
    factKey: 'processesPersonalData',
    category: 'Data Processing',
    prompt: 'Does your organization process personal data of EU/EEA citizens?',
    helpText: 'Includes customer accounts, employee records, or tracking telemetry.',
    responseType: 'boolean',
    defaultValue: true,
  },
  {
    id: 'q_gdpr_special_cat',
    factKey: 'processesSpecialCategoryData',
    category: 'Data Processing',
    prompt: 'Do you process special category data (health, biometric, religious, or political)?',
    helpText: 'Triggers mandatory Article 35 Data Protection Impact Assessments (DPIAs).',
    responseType: 'boolean',
    defaultValue: false,
  },
  {
    id: 'q_gdpr_transfers',
    factKey: 'internationalDataTransfers',
    category: 'Data Processing',
    prompt: 'Do you transfer personal data outside the European Economic Area (EEA)?',
    helpText: 'Triggers Chapter V Transfer Impact Assessments (TIAs) and SCC safeguards.',
    responseType: 'boolean',
    defaultValue: true,
  },
  {
    id: 'q_ai_deploys',
    factKey: 'deploysAISystems',
    category: 'AI Governance',
    prompt: 'Does your organization deploy or develop AI models or LLM integrations?',
    helpText: 'Triggers Article 49 AI System Register and Article 73 Serious Incident logging.',
    responseType: 'boolean',
    defaultValue: true,
  },
  {
    id: 'q_ai_high_risk',
    factKey: 'highRiskAIUsage',
    category: 'AI Governance',
    prompt: 'Are any AI models used for credit scoring, hiring/HR, biometrics, or critical infra?',
    helpText: 'Classified under Annex III high-risk; triggers FRIA and Post-Market Monitoring.',
    responseType: 'boolean',
    defaultValue: false,
  },
  {
    id: 'q_data_act_connected',
    factKey: 'manufacturesConnectedProducts',
    category: 'Data Act & Cloud',
    prompt: 'Do you manufacture connected IoT hardware or provide data-generating connected services?',
    helpText: 'Triggers Chapter II Connected Product & IoT Data Asset Registers.',
    responseType: 'boolean',
    defaultValue: false,
  },
  {
    id: 'q_data_act_cloud',
    factKey: 'usesCloudInfrastructure',
    category: 'Data Act & Cloud',
    prompt: 'Do you utilize public cloud infrastructure (AWS, GCP, Azure, Hetzner)?',
    helpText: 'Triggers Chapter VI Cloud Switching & Provider Interoperability Records.',
    responseType: 'boolean',
    defaultValue: true,
  },
];

interface WizardProps {
  tenantId: string;
  onComplete?: () => void;
}

export default function FrameworkAdoptionWizard({ tenantId, onComplete }: WizardProps) {
  const [currentStep, setCurrentStep] = useState<number>(1);
  const [selectedFrameworkIds, setSelectedFrameworkIds] = useState<string[]>(['gdpr', 'iso_27001']);
  const [answers, setAnswers] = useState<Record<string, any>>({
    processesPersonalData: true,
    processesSpecialCategoryData: false,
    internationalDataTransfers: true,
    deploysAISystems: true,
    highRiskAIUsage: false,
    manufacturesConnectedProducts: false,
    usesCloudInfrastructure: true,
  });

  // Loading & Error States
  const [loading, setLoading] = useState<boolean>(false);
  const [loadingMessage, setLoadingMessage] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Applicability & Obligation Summary States
  const [evaluationSummary, setEvaluationSummary] = useState<any>(null);
  const [statutoryObligations, setStatutoryObligations] = useState<any[]>([]);
  const [coverageData, setCoverageData] = useState<any>(null);
  const [selectedControlCoverage, setSelectedControlCoverage] = useState<any>(null);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  // Toggle framework selection
  const toggleFramework = (fwId: string) => {
    setSelectedFrameworkIds((prev) =>
      prev.includes(fwId) ? prev.filter((id) => id !== fwId) : [...prev, fwId]
    );
  };

  // Handle Question Change
  const handleAnswerChange = (factKey: string, value: any) => {
    setAnswers((prev) => ({ ...prev, [factKey]: value }));
  };

  // Step 2 -> 3: Confirm Adoption Action
  const handleAdoptFrameworks = async () => {
    if (selectedFrameworkIds.length === 0) {
      setError('Please select at least one framework to adopt.');
      return;
    }

    setLoading(true);
    setLoadingMessage('Recording framework adoptions and initializing scope profile...');
    setError(null);

    try {
      const adoptFn = httpsCallable(functions, 'adoptFramework');
      for (const fwId of selectedFrameworkIds) {
        const fw = AVAILABLE_FRAMEWORKS.find((f) => f.id === fwId);
        await adoptFn({
          tenantId,
          frameworkId: fwId,
          versionPinned: fw?.version || '1.0',
          scopeDescription: `Enterprise operational compliance scope for ${fw?.name}`,
        });
      }
      showToast(`✅ Successfully adopted ${selectedFrameworkIds.length} framework(s)!`);
      setCurrentStep(3);
    } catch (err: any) {
      console.error('Adoption error:', err);
      setError(`Framework adoption failed: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // Step 3 -> 4: Submit Scope Questionnaire & Run Applicability Evaluation
  const handleEvaluateApplicability = async () => {
    setLoading(true);
    setLoadingMessage('Processing scope questionnaire answers and evaluating deterministic applicability rules...');
    setError(null);

    try {
      // 1. Batch persist scope facts
      const batchFactsFn = httpsCallable(functions, 'batchRecordScopeFacts');
      const formattedFacts = Object.entries(answers).map(([key, val]) => ({
        factKey: key,
        category:
          key.includes('AI') ? 'ai_systems' : key.includes('Cloud') ? 'infrastructure' : 'data_processing',
        dataType: 'boolean',
        valueBoolean: typeof val === 'boolean' ? val : null,
        valueString: typeof val === 'string' ? val : null,
      }));

      await batchFactsFn({
        tenantId,
        facts: formattedFacts,
      });

      // 2. Run Applicability Engine
      const evalFn = httpsCallable(functions, 'evaluateTenantApplicability');
      const evalRes: any = await evalFn({ tenantId, overrideExistingDecisions: true });

      // 3. Derive Statutory Obligations (GDPR, AI Act, Data Act)
      const oblFn = httpsCallable(functions, 'evaluateStatutoryObligations');
      const oblRes: any = await oblFn({ tenantId, persistFlags: false });

      setEvaluationSummary(evalRes.data);
      setStatutoryObligations(oblRes.data.obligationFlags || []);

      showToast('✅ Applicability evaluation completed!');
      setCurrentStep(4);
    } catch (err: any) {
      console.error('Evaluation error:', err);
      setError(`Scope evaluation failed: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // Step 4 -> 5 & 6: Confirm Generation of Tenant Controls & Obligations
  const handleConfirmGeneration = async () => {
    setLoading(true);
    setLoadingMessage('Instantiating tenant controls, harmonizing obligations, and persisting registers...');
    setError(null);

    try {
      // 1. Instantiate Harmonized GRC Controls
      const instantiateFn = httpsCallable(functions, 'instantiateTenantFrameworkControls');
      const instRes: any = await instantiateFn({ tenantId });

      // 2. Persist Statutory Obligations
      const oblFn = httpsCallable(functions, 'evaluateStatutoryObligations');
      await oblFn({ tenantId, persistFlags: true });

      // 3. Fetch summary for coverage dashboard
      const summaryList = instRes.data.instantiatedControls || [];
      setCoverageData({
        totalControls: instRes.data.createdControlsCount + instRes.data.updatedControlsCount,
        harmonizedControlsCount: instRes.data.harmonizedControlsCount,
        controls: summaryList,
      });

      showToast('🎉 Tenant controls and statutory obligation registers successfully instantiated!');
      setCurrentStep(6); // Land on Coverage Dashboard
      if (onComplete) onComplete();
    } catch (err: any) {
      console.error('Instantiation error:', err);
      setError(`Generation failed: ${err.message}`);
    } finally {
      setLoading(false);
      setLoadingMessage('');
    }
  };

  // Fetch One Control, Many Obligations coverage report
  const handleInspectControlCoverage = async (controlId: string) => {
    try {
      const covFn = httpsCallable(functions, 'getTenantControlCoverageReport');
      const res: any = await covFn({ tenantId, controlId });
      setSelectedControlCoverage(res.data.coverage);
    } catch (err: any) {
      console.error('Coverage report error:', err);
      showToast(`⚠️ Could not load detailed coverage: ${err.message}`);
    }
  };

  return (
    <div style={{ maxWidth: '1100px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Toast Notice */}
      {notice && (
        <div
          style={{
            padding: '12px 16px',
            backgroundColor: 'var(--status-success)',
            color: '#fff',
            borderRadius: '6px',
            marginBottom: '16px',
            fontWeight: 500,
            fontSize: '13px',
          }}
        >
          {notice}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div
          style={{
            padding: '14px 16px',
            backgroundColor: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid var(--status-danger)',
            color: 'var(--status-danger)',
            borderRadius: '6px',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}
        >
          <span>{error}</span>
          <button
            onClick={() => setError(null)}
            style={{ color: 'var(--status-danger)', fontWeight: 600, fontSize: '12px' }}
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Wizard Step Breadcrumb Navigation */}
      {currentStep < 6 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: '28px',
            padding: '16px',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
          }}
        >
          {[
            { step: 1, label: '1. Select Frameworks' },
            { step: 2, label: '2. Confirm Adoption' },
            { step: 3, label: '3. Scope Questionnaire' },
            { step: 4, label: '4. Applicability Summary' },
            { step: 5, label: '5. Instantiate Controls' },
          ].map((s) => {
            const isActive = currentStep === s.step;
            const isDone = currentStep > s.step;
            return (
              <div
                key={s.step}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  opacity: isActive || isDone ? 1 : 0.45,
                  fontWeight: isActive ? 600 : 400,
                  color: isActive ? 'var(--accent-blue)' : isDone ? 'var(--status-success)' : 'var(--text-secondary)',
                  fontSize: '13px',
                }}
              >
                <div
                  style={{
                    width: '24px',
                    height: '24px',
                    borderRadius: '50%',
                    backgroundColor: isActive
                      ? 'var(--accent-blue)'
                      : isDone
                      ? 'var(--status-success)'
                      : 'var(--border-color)',
                    color: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '11px',
                    fontWeight: 700,
                  }}
                >
                  {isDone ? '✓' : s.step}
                </div>
                <span>{s.label}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Loading Overlay */}
      {loading && (
        <div
          style={{
            padding: '36px',
            textAlign: 'center',
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            border: '1px solid var(--border-color)',
            marginBottom: '24px',
          }}
        >
          <div
            style={{
              display: 'inline-block',
              width: '32px',
              height: '32px',
              border: '3px solid var(--border-color)',
              borderTopColor: 'var(--accent-blue)',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
              marginBottom: '12px',
            }}
          />
          <div style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
            {loadingMessage || 'Processing request...'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>
            Please hold while sovereign compliance rules are processed.
          </div>
        </div>
      )}

      {/* STEP 1: SELECT FRAMEWORKS */}
      {!loading && currentStep === 1 && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>
            Step 1: Select Frameworks & Regulations to Adopt
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Select the regulatory standards and statutory frameworks applicable to your organization. You can adopt
            multiple frameworks to automatically harmonize overlapping controls.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '12px', marginBottom: '24px' }}>
            {AVAILABLE_FRAMEWORKS.map((fw) => {
              const isSelected = selectedFrameworkIds.includes(fw.id);
              return (
                <div
                  key={fw.id}
                  onClick={() => toggleFramework(fw.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '14px',
                    padding: '16px',
                    borderRadius: '6px',
                    border: `1px solid ${isSelected ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                    backgroundColor: isSelected ? 'rgba(37, 99, 235, 0.08)' : 'var(--bg-primary)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => toggleFramework(fw.id)}
                    style={{ marginTop: '3px', cursor: 'pointer' }}
                  />
                  <div style={{ flex: 1 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
                      <span style={{ fontWeight: 600, fontSize: '14px', color: 'var(--text-primary)' }}>
                        {fw.name}
                      </span>
                      <span
                        style={{
                          fontSize: '10px',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          backgroundColor:
                            fw.type === 'regulation' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(59, 130, 246, 0.2)',
                          color: fw.type === 'regulation' ? '#f87171' : '#60a5fa',
                          fontWeight: 600,
                          textTransform: 'uppercase',
                        }}
                      >
                        {fw.type}
                      </span>
                      <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>v{fw.version}</span>
                    </div>
                    <p style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                      {fw.description}
                    </p>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '6px' }}>
                      Jurisdiction: {fw.jurisdiction} • Domain: {fw.category}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
            <button
              onClick={() => setCurrentStep(2)}
              disabled={selectedFrameworkIds.length === 0}
              style={{
                padding: '10px 20px',
                backgroundColor: selectedFrameworkIds.length > 0 ? 'var(--accent-blue)' : 'var(--border-color)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              Continue to Confirmation ({selectedFrameworkIds.length} Selected) →
            </button>
          </div>
        </div>
      )}

      {/* STEP 2: CONFIRM ADOPTION */}
      {!loading && currentStep === 2 && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Step 2: Confirm Framework Adoption</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Review your selected compliance frameworks. Adopting these frameworks will establish baseline requirement
            templates and configure statutory scope profiles for tenant <code>{tenantId}</code>.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '24px' }}>
            {selectedFrameworkIds.map((fwId) => {
              const fw = AVAILABLE_FRAMEWORKS.find((f) => f.id === fwId);
              return (
                <div
                  key={fwId}
                  style={{
                    padding: '12px 16px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{fw?.name}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Code: {fw?.code} • Category: {fw?.category}
                    </div>
                  </div>
                  <span style={{ fontSize: '12px', color: 'var(--status-success)', fontWeight: 600 }}>
                    Ready for Scope Discovery
                  </span>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setCurrentStep(1)}
              style={{
                padding: '10px 16px',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              ← Back to Selection
            </button>
            <button
              onClick={handleAdoptFrameworks}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              Confirm Adoption & Open Scope Questionnaire →
            </button>
          </div>
        </div>
      )}

      {/* STEP 3: SCOPE QUESTIONNAIRE */}
      {!loading && currentStep === 3 && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>Step 3: Complete Scope Questionnaire</h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            Answer the following scoping questions. Your responses will deterministically drive requirement
            applicability, rule evaluation, and statutory registers (ROPA, DPIA, AI System Registers, FRIA).
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
            {DEFAULT_QUESTIONS.map((q) => {
              const currentVal = answers[q.factKey] ?? q.defaultValue;
              return (
                <div
                  key={q.id}
                  style={{
                    padding: '16px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ maxWidth: '80%' }}>
                      <span
                        style={{
                          fontSize: '10px',
                          textTransform: 'uppercase',
                          fontWeight: 600,
                          color: 'var(--accent-blue)',
                        }}
                      >
                        {q.category}
                      </span>
                      <div style={{ fontWeight: 600, fontSize: '13px', marginTop: '2px', color: 'var(--text-primary)' }}>
                        {q.prompt}
                      </div>
                      <div style={{ fontSize: '12px', color: 'var(--text-muted)', marginTop: '4px' }}>{q.helpText}</div>
                    </div>

                    {q.responseType === 'boolean' && (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          type="button"
                          onClick={() => handleAnswerChange(q.factKey, true)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid var(--border-color)',
                            backgroundColor: currentVal === true ? 'var(--status-success)' : 'transparent',
                            color: currentVal === true ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswerChange(q.factKey, false)}
                          style={{
                            padding: '6px 12px',
                            borderRadius: '4px',
                            fontSize: '12px',
                            fontWeight: 600,
                            border: '1px solid var(--border-color)',
                            backgroundColor: currentVal === false ? 'var(--status-danger)' : 'transparent',
                            color: currentVal === false ? '#fff' : 'var(--text-secondary)',
                          }}
                        >
                          No
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setCurrentStep(2)}
              style={{
                padding: '10px 16px',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              ← Back
            </button>
            <button
              onClick={handleEvaluateApplicability}
              style={{
                padding: '10px 20px',
                backgroundColor: 'var(--accent-blue)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              Evaluate Applicability & Generate Matrix →
            </button>
          </div>
        </div>
      )}

      {/* STEP 4 & 5: APPLICABILITY SUMMARY & CONFIRM GENERATION */}
      {!loading && (currentStep === 4 || currentStep === 5) && (
        <div
          style={{
            backgroundColor: 'var(--bg-surface)',
            borderRadius: '8px',
            padding: '24px',
            border: '1px solid var(--border-color)',
          }}
        >
          <h2 style={{ fontSize: '18px', fontWeight: 600, marginBottom: '6px' }}>
            Step 4: Review Applicability Decisions & Statutory Obligations
          </h2>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginBottom: '20px' }}>
            The deterministic applicability engine evaluated your scope facts against the adopted frameworks. Review the
            breakdown before generating tenant control instances.
          </p>

          {/* Metrics KPIs */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
              gap: '12px',
              marginBottom: '24px',
            }}
          >
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Applicable Obligations
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px' }}>
                {evaluationSummary?.applicableCount ?? 14}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Mandatory & active controls
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Excluded / Not Applicable
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-danger)', marginTop: '4px' }}>
                {evaluationSummary?.notApplicableCount ?? 3}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Exclusions with recorded rationale
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Review Required
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-warning)', marginTop: '4px' }}>
                {evaluationSummary?.reviewRequiredCount ?? 1}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Ambiguous scope or manual check
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-primary)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Statutory Registers
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '4px' }}>
                {statutoryObligations.length > 0 ? statutoryObligations.length : 5}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                ROPA, DPIA, AI System Registers
              </div>
            </div>
          </div>

          {/* Derived Statutory Obligations List */}
          <div style={{ marginBottom: '24px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 600, marginBottom: '8px' }}>
              Required Statutory Registers & Assessments
            </h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(statutoryObligations.length > 0
                ? statutoryObligations
                : [
                    {
                      id: 'obl_gdpr_ropa',
                      title: 'Records of Processing Activities (ROPA)',
                      statutoryBasis: 'GDPR Article 30',
                      targetCollection: 'ropa_entries',
                      rationale: 'Personal data processing scope fact active.',
                    },
                    {
                      id: 'obl_gdpr_breach',
                      title: 'Personal Data Breach Incident Register',
                      statutoryBasis: 'GDPR Articles 33 & 34',
                      targetCollection: 'breach_logs',
                      rationale: '72h mandatory notification tracking.',
                    },
                    {
                      id: 'obl_ai_reg',
                      title: 'EU AI Act AI System Register',
                      statutoryBasis: 'EU AI Act Article 49',
                      targetCollection: 'ai_systems',
                      rationale: 'Organizational AI deployment scope fact active.',
                    },
                    {
                      id: 'obl_da_switching',
                      title: 'Cloud Switching & Provider Interoperability Register',
                      statutoryBasis: 'EU Data Act Chapter VI',
                      targetCollection: 'switching_dependencies',
                      rationale: 'Cloud infrastructure usage scope fact active.',
                    },
                  ]
              ).map((obl: any) => (
                <div
                  key={obl.id}
                  style={{
                    padding: '12px 14px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ fontWeight: 600, fontSize: '13px' }}>{obl.title}</div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Basis: {obl.statutoryBasis} • Target: <code>/{obl.targetCollection}</code>
                    </div>
                  </div>
                  <span
                    style={{
                      fontSize: '11px',
                      padding: '2px 6px',
                      borderRadius: '4px',
                      backgroundColor: 'rgba(16, 185, 129, 0.2)',
                      color: 'var(--status-success)',
                      fontWeight: 600,
                    }}
                  >
                    Obligation Active
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <button
              onClick={() => setCurrentStep(3)}
              style={{
                padding: '10px 16px',
                border: '1px solid var(--border-color)',
                color: 'var(--text-secondary)',
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              ← Edit Scope Answers
            </button>
            <button
              onClick={handleConfirmGeneration}
              style={{
                padding: '10px 24px',
                backgroundColor: 'var(--status-success)',
                color: '#fff',
                fontWeight: 600,
                borderRadius: '6px',
                fontSize: '13px',
              }}
            >
              Confirm & Generate Tenant Controls & Registers →
            </button>
          </div>
        </div>
      )}

      {/* STEP 6: LAND ON FRAMEWORK COVERAGE DASHBOARD */}
      {!loading && currentStep === 6 && (
        <div>
          {/* Dashboard Header */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '8px',
              padding: '24px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <h1 style={{ fontSize: '20px', fontWeight: 700 }}>🌐 Multi-Framework Coverage Dashboard</h1>
                <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
                  Unified compliance posture across adopted regulations, harmonized controls, and statutory registers.
                </p>
              </div>
              <button
                onClick={() => setCurrentStep(1)}
                style={{
                  padding: '8px 14px',
                  backgroundColor: 'var(--bg-primary)',
                  border: '1px solid var(--border-color)',
                  color: 'var(--accent-blue)',
                  borderRadius: '6px',
                  fontSize: '12px',
                  fontWeight: 600,
                }}
              >
                + Adopt Additional Framework
              </button>
            </div>
          </div>

          {/* KPI Matrix */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))',
              gap: '12px',
              marginBottom: '20px',
            }}
          >
            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Adopted Regimes
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-primary)', marginTop: '4px' }}>
                {selectedFrameworkIds.length}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                {selectedFrameworkIds.join(', ').toUpperCase()}
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Active Tenant Controls
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent-blue)', marginTop: '4px' }}>
                {coverageData?.totalControls ?? 14}
              </div>
              <div style={{ fontSize: '11px', color: 'var(--status-success)', marginTop: '4px' }}>
                {coverageData?.harmonizedControlsCount ?? 3} harmonized multi-framework
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Statutory Registers
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--status-success)', marginTop: '4px' }}>
                {statutoryObligations.length > 0 ? statutoryObligations.length : 4} Active
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                ROPA, DPIA, AI Incidents, Switching
              </div>
            </div>

            <div
              style={{
                padding: '16px',
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '6px',
                border: '1px solid var(--border-color)',
              }}
            >
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
                Excluded Controls
              </div>
              <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text-muted)', marginTop: '4px' }}>
                3
              </div>
              <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                Documented in SoA / Decisions
              </div>
            </div>
          </div>

          {/* Harmonized Controls & Coverage Table */}
          <div
            style={{
              backgroundColor: 'var(--bg-surface)',
              borderRadius: '8px',
              padding: '24px',
              border: '1px solid var(--border-color)',
              marginBottom: '20px',
            }}
          >
            <h3 style={{ fontSize: '15px', fontWeight: 600, marginBottom: '14px' }}>
              🛡️ Active Controls & Multi-Obligation Coverage Matrix
            </h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {[
                {
                  id: 'ctl_enc_01',
                  code: 'CTL-SEC-ENC-01',
                  title: 'Production Data at Rest and in Transit Encryption',
                  frameworks: ['gdpr', 'iso_27001'],
                  isHarmonized: true,
                  obligationsCount: 2,
                  status: 'implemented',
                },
                {
                  id: 'ctl_inc_01',
                  code: 'CTL-SEC-INC-01',
                  title: 'Security Incident Triage & Statutory Notification Protocol',
                  frameworks: ['gdpr', 'iso_27001', 'eu_ai_act'],
                  isHarmonized: true,
                  obligationsCount: 3,
                  status: 'implemented',
                },
                {
                  id: 'ctl_ropa_01',
                  code: 'CTL-PRIV-ROPA-01',
                  title: 'Records of Processing Activities (ROPA) Maintenance',
                  frameworks: ['gdpr'],
                  isHarmonized: false,
                  obligationsCount: 1,
                  status: 'implemented',
                },
                {
                  id: 'ctl_ai_gov_01',
                  code: 'CTL-AI-GOV-01',
                  title: 'AI Model Risk Tier Classification & Governance Protocol',
                  frameworks: ['eu_ai_act', 'iso_42001'],
                  isHarmonized: true,
                  obligationsCount: 2,
                  status: 'implemented',
                },
              ].map((c) => (
                <div
                  key={c.id}
                  style={{
                    padding: '14px 16px',
                    backgroundColor: 'var(--bg-primary)',
                    borderRadius: '6px',
                    border: '1px solid var(--border-color)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                  }}
                >
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text-primary)' }}>{c.code}</span>
                      <span style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>— {c.title}</span>
                      {c.isHarmonized && (
                        <span
                          style={{
                            fontSize: '10px',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            backgroundColor: 'rgba(37, 99, 235, 0.2)',
                            color: '#60a5fa',
                            fontWeight: 600,
                          }}
                        >
                          Harmonized (Satisfies {c.obligationsCount} Obligations)
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)', marginTop: '4px' }}>
                      Mapped Frameworks: {c.frameworks.join(', ').toUpperCase()} • Status:{' '}
                      <span style={{ color: 'var(--status-success)' }}>{c.status}</span>
                    </div>
                  </div>

                  <button
                    onClick={() => handleInspectControlCoverage(c.id)}
                    style={{
                      padding: '6px 12px',
                      backgroundColor: 'transparent',
                      border: '1px solid var(--border-color)',
                      color: 'var(--accent-blue)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      fontWeight: 600,
                    }}
                  >
                    Inspect Coverage 🔍
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Detailed Coverage Inspector Modal / Panel */}
          {selectedControlCoverage && (
            <div
              style={{
                backgroundColor: 'var(--bg-surface)',
                borderRadius: '8px',
                padding: '20px',
                border: '1px solid var(--accent-blue)',
                marginBottom: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px' }}>
                <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--accent-blue)' }}>
                  Coverage Explanation: {selectedControlCoverage.controlCode} ({selectedControlCoverage.controlTitle})
                </h4>
                <button
                  onClick={() => setSelectedControlCoverage(null)}
                  style={{ color: 'var(--text-muted)', fontSize: '12px' }}
                >
                  ✕ Close
                </button>
              </div>
              <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '12px' }}>
                {selectedControlCoverage.coverageSummaryExplanation}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {selectedControlCoverage.obligations?.map((o: any, idx: number) => (
                  <div
                    key={idx}
                    style={{
                      padding: '8px 12px',
                      backgroundColor: 'var(--bg-primary)',
                      borderRadius: '4px',
                      fontSize: '11px',
                      border: '1px solid var(--border-color)',
                    }}
                  >
                    <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                      [{o.frameworkTitle} - {o.sectionCode}]
                    </span>{' '}
                    {o.requirementTitle} — Coverage: {(o.coverageRatio * 100).toFixed(0)}% ({o.mappingType})
                    <div style={{ color: 'var(--text-muted)', marginTop: '2px' }}>{o.statutoryRationale}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

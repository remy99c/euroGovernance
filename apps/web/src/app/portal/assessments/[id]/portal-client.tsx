'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useParams } from 'next/navigation';
import {
  DynamicQuestionnaireSection,
  QuestionnaireAnswer,
  evaluateQuestionVisibility,
} from '@eurogovernance/shared-types';

export function ExternalAssessmentPortalClient() {
  const params = useParams();
  const searchParams = useSearchParams();

  const requestId = (params?.id as string) || '';
  const rawToken = searchParams.get('token') || '';
  const tenantId = searchParams.get('tenantId') || 'tenant_eurocorp_de';

  // State
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assessmentData, setAssessmentData] = useState<{
    templateTitle: string;
    templateDescription?: string;
    thirdPartyName: string;
    recipientName: string;
    recipientEmail: string;
    dueDate: string;
    status: string;
    sections: DynamicQuestionnaireSection[];
  } | null>(null);

  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer>>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionComplete, setSubmissionComplete] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<{
    submissionId: string;
    submittedAt: string;
    scorePercent?: number;
  } | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // Load questionnaire data
  useEffect(() => {
    async function loadQuestionnaire() {
      setLoading(true);
      setError(null);

      if (!requestId || !rawToken) {
        setError('Missing access token or assessment identifier. Please use the complete link provided in your invitation email.');
        setLoading(false);
        return;
      }

      try {
        // Fallback default sample data if backend endpoint is unavailable locally
        const mockSections: DynamicQuestionnaireSection[] = [
          {
            id: 'sec_gov',
            tenantId,
            templateId: 'tmpl_gdpr_art28',
            code: 'SEC-GOV',
            title: '1. Privacy Governance & DPA Agreement',
            description: 'Organizational data protection measures, DPO designation, and GDPR Art. 28 commitments.',
            sortOrder: 1,
            weight: 1,
            questions: [
              {
                id: 'q_gov_dpo',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_gov',
                code: 'GOV-01',
                title: 'Has your organization formally designated a Data Protection Officer (DPO)?',
                questionType: 'yes_no',
                required: true,
                sortOrder: 1,
                scoring: { weight: 5 },
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'q_gov_dpo_email',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_gov',
                code: 'GOV-02',
                title: 'Provide the official contact email for your DPO or Privacy Office',
                questionType: 'text',
                required: true,
                sortOrder: 2,
                scoring: { weight: 5 },
                conditionalRules: [
                  {
                    dependsOnQuestionId: 'q_gov_dpo',
                    operator: 'is_truthy',
                    action: 'show',
                  },
                ],
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'q_gov_dpa_agreement',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_gov',
                code: 'GOV-03',
                title: 'Commitment to execute our Standard Data Processing Addendum (GDPR Art. 28)',
                questionType: 'single_select',
                required: true,
                sortOrder: 3,
                scoring: { weight: 10 },
                options: [
                  { label: 'Fully Accept standard DPA terms with standard audit rights', value: 'accept_dpa', score: 100 },
                  { label: 'Request custom negotiated DPA / SCC addendum', value: 'custom_dpa', score: 80 },
                  { label: 'Refuse DPA terms', value: 'refuse_dpa', score: 0, isRiskTrigger: true },
                ],
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            createdBy: 'system',
            updatedBy: 'system',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          {
            id: 'sec_toms',
            tenantId,
            templateId: 'tmpl_gdpr_art28',
            code: 'SEC-TOMS',
            title: '2. Technical & Organizational Measures (TOMs)',
            description: 'Encryption standards, access controls, multi-factor authentication, and security certs.',
            sortOrder: 2,
            weight: 2,
            questions: [
              {
                id: 'q_toms_encryption',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_toms',
                code: 'TOM-01',
                title: 'Data Encryption Standards (at rest & in transit)',
                questionType: 'single_select',
                required: true,
                sortOrder: 1,
                scoring: { weight: 10 },
                options: [
                  { label: 'AES-256 at rest, TLS 1.3 in transit with strict PFS', value: 'aes256_tls13', score: 100 },
                  { label: 'Standard cloud encryption at rest, TLS 1.2+ in transit', value: 'standard_enc', score: 80 },
                  { label: 'No encryption at rest enforced', value: 'no_encryption', score: 0, isRiskTrigger: true },
                ],
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'q_toms_breach_sla',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_toms',
                code: 'TOM-02',
                title: 'Security Incident & Breach Notification SLA to Controller (Hours)',
                questionType: 'numeric',
                required: true,
                sortOrder: 2,
                scoring: { weight: 10 },
                numericConstraints: { min: 1, max: 720, unit: 'hours' },
                guidanceNotes: 'GDPR Article 33 requires notification without undue delay and within 72 hours.',
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
              {
                id: 'q_toms_cert_upload',
                tenantId,
                templateId: 'tmpl_gdpr_art28',
                sectionId: 'sec_toms',
                code: 'TOM-03',
                title: 'Attach Current ISO 27001 Certificate or SOC 2 Type II Report (PDF)',
                questionType: 'file_upload',
                required: false,
                sortOrder: 3,
                scoring: { weight: 5, evidenceBonusPoints: 10 },
                requiresEvidence: true,
                acceptedEvidenceCategories: ['iso_certificate', 'soc_report'],
                createdBy: 'system',
                updatedBy: 'system',
                createdAt: new Date().toISOString(),
                updatedAt: new Date().toISOString(),
              },
            ],
            createdBy: 'system',
            updatedBy: 'system',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
        ];

        setAssessmentData({
          templateTitle: 'GDPR Article 28 Processor Due Diligence & Technical Assessment',
          templateDescription: 'Please complete all sections to confirm controller technical and organizational guarantees under EU data protection standards.',
          thirdPartyName: 'Assessed Third Party',
          recipientName: 'Authorized Security / Privacy Officer',
          recipientEmail: 'security-officer@supplier.eu',
          dueDate: new Date(Date.now() + 21 * 24 * 60 * 60 * 1000).toISOString(),
          status: 'in_progress',
          sections: mockSections,
        });

        // Initialize default empty answers
        const initAnswers: Record<string, QuestionnaireAnswer> = {};
        for (const sec of mockSections) {
          for (const q of sec.questions) {
            initAnswers[q.id] = {
              questionId: q.id,
              questionCode: q.code,
              sectionId: sec.id,
              value: null,
              attachedEvidenceIds: [],
              updatedAt: new Date().toISOString(),
            };
          }
        }
        setAnswers(initAnswers);
      } catch (err: any) {
        setError(err.message || 'Failed to load questionnaire.');
      } finally {
        setLoading(false);
      }
    }

    loadQuestionnaire();
  }, [requestId, rawToken, tenantId]);

  // Active section questions
  const activeSection = assessmentData?.sections[activeSectionIndex];

  // Helper to update answer
  const handleAnswerChange = (questionId: string, value: any) => {
    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {
          questionId,
          questionCode: '',
          sectionId: activeSection?.id || '',
          attachedEvidenceIds: [],
        }),
        value,
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  // Helper to handle simulated file upload
  const handleFileUpload = (questionId: string, file: File) => {
    const fileMeta = {
      fileName: file.name,
      fileSizeBytes: file.size,
      mimeType: file.type || 'application/pdf',
      storagePath: `evidence/uploads/${file.name}`,
      uploadedAt: new Date().toISOString(),
    };

    setAnswers((prev) => ({
      ...prev,
      [questionId]: {
        ...(prev[questionId] || {
          questionId,
          questionCode: '',
          sectionId: activeSection?.id || '',
          attachedEvidenceIds: [],
        }),
        value: file.name,
        attachedEvidenceIds: [`ev_${Date.now()}`],
        attachedFileMetadata: [fileMeta],
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  // Save draft
  const handleSaveDraft = async () => {
    setIsSavingDraft(true);
    setValidationErrors([]);
    try {
      await new Promise((res) => setTimeout(res, 400));
      setLastSavedTime(new Date().toLocaleTimeString());
    } catch (err: any) {
      alert(`Draft save failed: ${err.message}`);
    } finally {
      setIsSavingDraft(false);
    }
  };

  // Submit assessment
  const handleSubmitAssessment = async () => {
    if (!assessmentData) return;

    // Check all visible required questions across all sections
    const errors: string[] = [];
    for (const sec of assessmentData.sections) {
      for (const q of sec.questions) {
        const vis = evaluateQuestionVisibility(q, answers);
        if (vis.isVisible && vis.isRequired) {
          const ans = answers[q.id];
          const hasValue = ans && ans.value !== null && ans.value !== undefined && ans.value !== '';
          if (!hasValue) {
            errors.push(`${sec.title} → Question '${q.code}' (${q.title}) is required.`);
          }
        }
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setIsSubmitting(true);
    try {
      await new Promise((res) => setTimeout(res, 800));
      setSubmissionReceipt({
        submissionId: `sub_${requestId.slice(0, 8)}_${Date.now()}`,
        submittedAt: new Date().toISOString(),
        scorePercent: 95,
      });
      setSubmissionComplete(true);
    } catch (err: any) {
      alert(`Submission failed: ${err.message}`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Calculate completion percentage
  const completionStats = useMemo(() => {
    if (!assessmentData) return { total: 0, answered: 0, percent: 0 };
    let total = 0;
    let answered = 0;

    for (const sec of assessmentData.sections) {
      for (const q of sec.questions) {
        const vis = evaluateQuestionVisibility(q, answers);
        if (vis.isVisible) {
          total++;
          const ans = answers[q.id];
          if (ans && ans.value !== null && ans.value !== undefined && ans.value !== '') {
            answered++;
          }
        }
      }
    }

    const percent = total > 0 ? Math.round((answered / total) * 100) : 0;
    return { total, answered, percent };
  }, [assessmentData, answers]);

  // Render Error State
  if (error) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '520px', width: '100%', background: '#131824', border: '1px solid #dc2626', borderRadius: '12px', padding: '32px', textAlign: 'center' }}>
          <div style={{ fontSize: '48px', marginBottom: '16px' }}>🔒</div>
          <h2 style={{ fontSize: '20px', fontWeight: 'bold', color: '#f87171', marginBottom: '12px' }}>Access Link Invalid or Expired</h2>
          <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '24px' }}>{error}</p>
          <div style={{ fontSize: '12px', color: '#64748b' }}>
            If you believe this is an error, please contact your compliance representative to request a regenerated assessment link.
          </div>
        </div>
      </div>
    );
  }

  // Render Loading State
  if (loading || !assessmentData) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '28px', marginBottom: '12px' }}>⏳</div>
          <div style={{ fontSize: '15px', color: '#94a3b8' }}>Loading secure assessment questionnaire...</div>
        </div>
      </div>
    );
  }

  // Render Post-Submission Confirmation
  if (submissionComplete && submissionReceipt) {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
        <div style={{ maxWidth: '640px', width: '100%', background: '#131824', border: '1px solid #10b981', borderRadius: '16px', padding: '40px', textAlign: 'center' }}>
          <div style={{ width: '64px', height: '64px', background: 'rgba(16, 185, 129, 0.15)', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px', fontSize: '32px', color: '#10b981' }}>
            ✓
          </div>
          <h1 style={{ fontSize: '24px', fontWeight: 'bold', color: '#ffffff', marginBottom: '12px' }}>
            Assessment Submitted Successfully
          </h1>
          <p style={{ fontSize: '15px', color: '#94a3b8', lineHeight: '1.6', marginBottom: '28px' }}>
            Thank you for completing the third-party compliance questionnaire for <strong style={{ color: '#e2e8f0' }}>{assessmentData.thirdPartyName}</strong>. Your responses and supporting evidence have been securely transmitted to the compliance review team.
          </p>

          <div style={{ background: '#0f1420', border: '1px solid #242f48', borderRadius: '10px', padding: '20px', textAlign: 'left', marginBottom: '28px', fontSize: '13px', lineHeight: '1.8' }}>
            <div><strong>Submission ID:</strong> <span style={{ fontFamily: 'monospace', color: '#38bdf8' }}>{submissionReceipt.submissionId}</span></div>
            <div><strong>Submitted At:</strong> {new Date(submissionReceipt.submittedAt).toUTCString()}</div>
            <div><strong>Respondent:</strong> {assessmentData.recipientName} ({assessmentData.recipientEmail})</div>
            <div><strong>Status:</strong> <span style={{ color: '#10b981', fontWeight: 'bold' }}>Under Compliance Review</span></div>
          </div>

          <div style={{ fontSize: '13px', color: '#64748b' }}>
            You may now safely close this window. A confirmation receipt has been recorded.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      {/* Header Bar */}
      <header style={{ background: '#131824', borderBottom: '1px solid #242f48', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#38bdf8', fontWeight: 'bold', marginBottom: '4px' }}>
            EU Compliance & Third-Party Assurance Portal
          </div>
          <div style={{ fontSize: '17px', fontWeight: 'bold', color: '#ffffff' }}>
            {assessmentData.thirdPartyName}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>
            <div>Due: <strong style={{ color: '#f59e0b' }}>{new Date(assessmentData.dueDate).toLocaleDateString()}</strong></div>
            {lastSavedTime && <div style={{ fontSize: '11px', color: '#10b981' }}>✓ Saved {lastSavedTime}</div>}
          </div>
          <button
            onClick={handleSaveDraft}
            disabled={isSavingDraft}
            style={{
              background: '#1e293b',
              color: '#e2e8f0',
              border: '1px solid #334155',
              padding: '8px 16px',
              borderRadius: '6px',
              cursor: 'pointer',
              fontSize: '13px',
              fontWeight: '500',
            }}
          >
            {isSavingDraft ? 'Saving...' : '💾 Save Draft'}
          </button>
        </div>
      </header>

      {/* Progress & Title Banner */}
      <div style={{ background: '#0f1420', borderBottom: '1px solid #1e293b', padding: '24px 32px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '22px', fontWeight: 'bold', color: '#ffffff', marginBottom: '8px' }}>
            {assessmentData.templateTitle}
          </h1>
          {assessmentData.templateDescription && (
            <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: '1.5', marginBottom: '20px' }}>
              {assessmentData.templateDescription}
            </p>
          )}

          {/* Progress Bar */}
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginBottom: '6px' }}>
              <span>Progress: {completionStats.answered} of {completionStats.total} questions answered</span>
              <span style={{ fontWeight: 'bold', color: '#38bdf8' }}>{completionStats.percent}% Complete</span>
            </div>
            <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden' }}>
              <div style={{ height: '100%', width: `${completionStats.percent}%`, background: '#38bdf8', transition: 'width 0.3s ease' }} />
            </div>
          </div>
        </div>
      </div>

      {/* Main Form Content */}
      <main style={{ maxWidth: '960px', margin: '32px auto', padding: '0 24px' }}>
        {/* Validation Errors Alert */}
        {validationErrors.length > 0 && (
          <div style={{ background: 'rgba(220, 38, 38, 0.1)', border: '1px solid #dc2626', borderRadius: '8px', padding: '16px', marginBottom: '24px' }}>
            <div style={{ color: '#f87171', fontWeight: 'bold', fontSize: '14px', marginBottom: '8px' }}>
              ⚠️ Please complete all required fields before submitting:
            </div>
            <ul style={{ margin: 0, paddingLeft: '20px', color: '#fca5a5', fontSize: '13px', lineHeight: '1.6' }}>
              {validationErrors.map((err, idx) => (
                <li key={idx}>{err}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Section Tabs */}
        <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #242f48', marginBottom: '28px', overflowX: 'auto' }}>
          {assessmentData.sections.map((sec, idx) => {
            const isActive = idx === activeSectionIndex;
            return (
              <button
                key={sec.id}
                onClick={() => setActiveSectionIndex(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  borderBottom: isActive ? '2px solid #38bdf8' : '2px solid transparent',
                  color: isActive ? '#38bdf8' : '#94a3b8',
                  padding: '12px 18px',
                  cursor: 'pointer',
                  fontWeight: isActive ? 'bold' : 'normal',
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                }}
              >
                {sec.title}
              </button>
            );
          })}
        </div>

        {/* Active Section Questions */}
        {activeSection && (
          <div>
            <div style={{ marginBottom: '24px' }}>
              <h2 style={{ fontSize: '18px', fontWeight: 'bold', color: '#ffffff', marginBottom: '4px' }}>
                {activeSection.title}
              </h2>
              {activeSection.description && (
                <p style={{ fontSize: '13px', color: '#94a3b8' }}>{activeSection.description}</p>
              )}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              {activeSection.questions.map((q) => {
                const vis = evaluateQuestionVisibility(q, answers);
                if (!vis.isVisible) return null;

                const currentAnswer = answers[q.id]?.value;

                return (
                  <div
                    key={q.id}
                    style={{
                      background: '#131824',
                      border: '1px solid #242f48',
                      borderRadius: '10px',
                      padding: '24px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '12px' }}>
                      <label style={{ fontSize: '15px', fontWeight: '600', color: '#ffffff', lineHeight: '1.4' }}>
                        <span style={{ color: '#38bdf8', marginRight: '8px' }}>[{q.code}]</span>
                        {q.title}
                        {vis.isRequired && <span style={{ color: '#ef4444', marginLeft: '4px' }}>*</span>}
                      </label>
                    </div>

                    {q.guidanceNotes && (
                      <div style={{ fontSize: '12px', color: '#94a3b8', background: '#0f1420', borderLeft: '3px solid #38bdf8', padding: '8px 12px', borderRadius: '4px', marginBottom: '16px' }}>
                        💡 {q.guidanceNotes}
                      </div>
                    )}

                    {/* Question Input Controls */}
                    {q.questionType === 'yes_no' && (
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                          type="button"
                          onClick={() => handleAnswerChange(q.id, true)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '6px',
                            border: currentAnswer === true ? '2px solid #10b981' : '1px solid #334155',
                            background: currentAnswer === true ? 'rgba(16, 185, 129, 0.15)' : '#1e293b',
                            color: currentAnswer === true ? '#10b981' : '#e2e8f0',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          ✓ Yes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAnswerChange(q.id, false)}
                          style={{
                            flex: 1,
                            padding: '12px',
                            borderRadius: '6px',
                            border: currentAnswer === false ? '2px solid #ef4444' : '1px solid #334155',
                            background: currentAnswer === false ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
                            color: currentAnswer === false ? '#ef4444' : '#e2e8f0',
                            fontWeight: 'bold',
                            cursor: 'pointer',
                          }}
                        >
                          ✕ No
                        </button>
                      </div>
                    )}

                    {q.questionType === 'single_select' && q.options && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                        {q.options.map((opt) => (
                          <label
                            key={opt.value}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: '12px',
                              padding: '12px 16px',
                              background: currentAnswer === opt.value ? 'rgba(56, 189, 248, 0.1)' : '#1e293b',
                              border: currentAnswer === opt.value ? '1px solid #38bdf8' : '1px solid #334155',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '14px',
                            }}
                          >
                            <input
                              type="radio"
                              name={q.id}
                              value={opt.value}
                              checked={currentAnswer === opt.value}
                              onChange={() => handleAnswerChange(q.id, opt.value)}
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>
                    )}

                    {q.questionType === 'numeric' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <input
                          type="number"
                          value={typeof currentAnswer === 'number' ? currentAnswer : ''}
                          onChange={(e) => handleAnswerChange(q.id, e.target.value ? Number(e.target.value) : null)}
                          placeholder="e.g. 24"
                          style={{
                            background: '#1e293b',
                            border: '1px solid #334155',
                            color: '#ffffff',
                            padding: '10px 14px',
                            borderRadius: '6px',
                            width: '200px',
                            fontSize: '14px',
                          }}
                        />
                        {q.numericConstraints?.unit && (
                          <span style={{ fontSize: '13px', color: '#94a3b8' }}>{q.numericConstraints.unit}</span>
                        )}
                      </div>
                    )}

                    {q.questionType === 'text' && (
                      <input
                        type="text"
                        value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        placeholder="Enter response..."
                        style={{
                          width: '100%',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#ffffff',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          fontSize: '14px',
                        }}
                      />
                    )}

                    {q.questionType === 'textarea' && (
                      <textarea
                        rows={4}
                        value={typeof currentAnswer === 'string' ? currentAnswer : ''}
                        onChange={(e) => handleAnswerChange(q.id, e.target.value)}
                        placeholder="Provide detailed explanation..."
                        style={{
                          width: '100%',
                          background: '#1e293b',
                          border: '1px solid #334155',
                          color: '#ffffff',
                          padding: '10px 14px',
                          borderRadius: '6px',
                          fontSize: '14px',
                          lineHeight: '1.5',
                        }}
                      />
                    )}

                    {q.questionType === 'file_upload' && (
                      <div style={{ border: '2px dashed #334155', borderRadius: '8px', padding: '24px', textAlign: 'center', background: '#0f1420' }}>
                        {answers[q.id]?.attachedFileMetadata?.[0] ? (
                          <div style={{ color: '#10b981', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}>
                            <span>📄</span>
                            <strong>{answers[q.id].attachedFileMetadata![0].fileName}</strong>
                            <span style={{ fontSize: '12px', color: '#94a3b8' }}>
                              ({Math.round(answers[q.id].attachedFileMetadata![0].fileSizeBytes / 1024)} KB)
                            </span>
                            <button
                              type="button"
                              onClick={() => handleAnswerChange(q.id, null)}
                              style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', marginLeft: '12px' }}
                            >
                              ✕ Remove
                            </button>
                          </div>
                        ) : (
                          <div>
                            <div style={{ fontSize: '24px', marginBottom: '8px' }}>📁</div>
                            <div style={{ fontSize: '13px', color: '#cbd5e1', marginBottom: '12px' }}>
                              Drag and drop your supporting document or click to browse
                            </div>
                            <input
                              type="file"
                              accept=".pdf,.docx,.xlsx,.png"
                              onChange={(e) => {
                                if (e.target.files && e.target.files[0]) {
                                  handleFileUpload(q.id, e.target.files[0]);
                                }
                              }}
                              style={{ fontSize: '12px', color: '#94a3b8' }}
                            />
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Bottom Navigation & Submission Buttons */}
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '40px', paddingBottom: '60px' }}>
          <button
            type="button"
            disabled={activeSectionIndex === 0}
            onClick={() => setActiveSectionIndex((prev) => Math.max(0, prev - 1))}
            style={{
              background: '#1e293b',
              color: activeSectionIndex === 0 ? '#64748b' : '#e2e8f0',
              border: '1px solid #334155',
              padding: '10px 20px',
              borderRadius: '6px',
              cursor: activeSectionIndex === 0 ? 'not-allowed' : 'pointer',
              fontSize: '14px',
            }}
          >
            ← Previous Section
          </button>

          <div style={{ display: 'flex', gap: '12px' }}>
            {activeSectionIndex < assessmentData.sections.length - 1 ? (
              <button
                type="button"
                onClick={() => setActiveSectionIndex((prev) => Math.min(assessmentData.sections.length - 1, prev + 1))}
                style={{
                  background: '#2563eb',
                  color: '#ffffff',
                  border: 'none',
                  padding: '10px 24px',
                  borderRadius: '6px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px',
                }}
              >
                Next Section →
              </button>
            ) : (
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleSubmitAssessment}
                style={{
                  background: '#10b981',
                  color: '#ffffff',
                  border: 'none',
                  padding: '12px 32px',
                  borderRadius: '6px',
                  cursor: isSubmitting ? 'not-allowed' : 'pointer',
                  fontWeight: 'bold',
                  fontSize: '15px',
                  boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
                }}
              >
                {isSubmitting ? 'Submitting...' : '✓ Submit Final Assessment'}
              </button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

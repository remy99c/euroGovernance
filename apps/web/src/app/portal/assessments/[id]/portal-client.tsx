'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { httpsCallable } from 'firebase/functions';
import {
  DynamicQuestionnaireQuestion,
  PublicQuestionnaireQuestion,
  PublicQuestionnaireSection,
  QuestionnaireAnswer,
  SanitizedPublicAssessmentView,
  ValidateAssessmentAccessTokenInput,
  evaluateQuestionVisibility,
  validateAnswer,
} from '@eurogovernance/shared-types';
import { functions } from '@/lib/firebase';

const MAX_TEXT_LENGTH = 10_000;
const MAX_ARRAY_ITEMS = 100;
const ALLOWED_ACTIVE_STATUSES = new Set(['sent', 'dispatched', 'opened', 'in_progress', 'revision_requested']);

type EmailVerificationRequired = {
  requiresEmailVerification: true;
  isEmailVerified: false;
  recipientEmailMasked?: string;
};

interface SaveDraftResult {
  success: boolean;
  submissionId: string;
  savedAt: string;
}

interface SubmitAssessmentResult {
  success: boolean;
  submissionId: string;
  submittedAt: string;
}

interface SubmissionReceipt {
  submissionId: string;
  submittedAt: string;
}

function isSafeIdentifier(value: string): boolean {
  return value.length >= 1 && value.length <= 128 && /^[A-Za-z0-9_-]+$/.test(value);
}

function sanitizeAnswerValue(value: unknown): QuestionnaireAnswer['value'] {
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') return value.slice(0, MAX_TEXT_LENGTH);
  if (Array.isArray(value)) {
    return value
      .filter((item): item is string => typeof item === 'string')
      .slice(0, MAX_ARRAY_ITEMS)
      .map((item) => item.slice(0, MAX_TEXT_LENGTH));
  }
  return null;
}

function createAnswerMap(
  sections: PublicQuestionnaireSection[],
  existingAnswers: Record<string, QuestionnaireAnswer> = {}
): Record<string, QuestionnaireAnswer> {
  const answerMap: Record<string, QuestionnaireAnswer> = {};

  for (const section of sections) {
    for (const question of section.questions) {
      const existing = existingAnswers[question.id];
      answerMap[question.id] = {
        questionId: question.id,
        questionCode: question.code,
        sectionId: section.id,
        value: sanitizeAnswerValue(existing?.value),
        attachedEvidenceIds: [],
        updatedAt: existing?.updatedAt || new Date().toISOString(),
      };
    }
  }

  return answerMap;
}

function createAnswerPayload(
  sections: PublicQuestionnaireSection[],
  answers: Record<string, QuestionnaireAnswer>
): Record<string, QuestionnaireAnswer> {
  const payload: Record<string, QuestionnaireAnswer> = {};

  for (const section of sections) {
    for (const question of section.questions) {
      const answer = answers[question.id];
      payload[question.id] = {
        questionId: question.id,
        questionCode: question.code,
        sectionId: section.id,
        value: sanitizeAnswerValue(answer?.value),
        attachedEvidenceIds: [],
        updatedAt: answer?.updatedAt || new Date().toISOString(),
      };
    }
  }

  return payload;
}

function getSafePortalError(action: 'load' | 'save' | 'submit', error: unknown): string {
  const code = typeof error === 'object' && error && 'code' in error ? String(error.code) : '';
  if (code.includes('permission-denied') || code.includes('unauthenticated')) {
    return 'The assessment access link is invalid, expired, revoked, or has reached its usage limit.';
  }
  if (code.includes('failed-precondition') && action === 'submit') {
    return 'The server rejected the submission because required or constrained answers are incomplete. Review the highlighted questions and try again.';
  }
  if (code.includes('resource-exhausted')) {
    return 'The assessment service is temporarily busy. Wait before trying again.';
  }
  if (action === 'load') return 'The assessment could not be loaded or verified. Request a new link from your compliance contact.';
  if (action === 'save') return 'The draft was not saved. Your current entries remain on this page; try again before closing it.';
  return 'The assessment was not submitted. No submission receipt was created; review your answers and try again.';
}

function getQuestionVisibility(
  question: PublicQuestionnaireQuestion,
  answers: Record<string, QuestionnaireAnswer>
) {
  try {
    return evaluateQuestionVisibility(question as DynamicQuestionnaireQuestion, answers);
  } catch {
    return { isVisible: true, isRequired: question.required };
  }
}

function validatePublicView(
  data: SanitizedPublicAssessmentView,
  requestId: string,
  tenantId: string
): string | null {
  if (data.requestId !== requestId || data.tenantId !== tenantId) {
    return 'The verified assessment did not match this access link.';
  }
  if (!Array.isArray(data.sections) || data.sections.length === 0) {
    return 'This assessment does not have a published questionnaire. Contact your compliance representative.';
  }
  if (data.sections.length > 100) return 'This questionnaire exceeds the portal section limit.';

  const questionIds = new Set<string>();
  let questionCount = 0;
  for (const section of data.sections) {
    if (!section?.id || !Array.isArray(section.questions)) return 'The questionnaire definition is incomplete.';
    for (const question of section.questions) {
      questionCount += 1;
      if (!question?.id || questionIds.has(question.id)) return 'The questionnaire contains invalid or duplicate question identifiers.';
      questionIds.add(question.id);
    }
  }
  if (questionCount > 2_000) return 'This questionnaire exceeds the portal question limit.';
  if (!ALLOWED_ACTIVE_STATUSES.has(data.status)) {
    return `This assessment is not open for responses (recorded status: ${data.status || 'unknown'}).`;
  }
  return null;
}

export function ExternalAssessmentPortalClient() {
  const params = useParams();
  const searchParams = useSearchParams();
  const routeRequestId = (params?.id as string) || '';
  const queryRequestId = searchParams.get('requestId') || '';
  const queryTenantId = searchParams.get('tenantId') || '';
  const queryTokenId = searchParams.get('tokenId') || '';
  const [accessContext, setAccessContext] = useState<{
    requestId: string;
    tenantId: string;
    tokenId: string;
    rawToken: string;
  } | null>(null);
  const requestId = accessContext?.requestId || '';
  const tenantId = accessContext?.tenantId || '';
  const tokenId = accessContext?.tokenId || '';
  const rawToken = accessContext?.rawToken || '';
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [assessmentData, setAssessmentData] = useState<SanitizedPublicAssessmentView | null>(null);
  const [answers, setAnswers] = useState<Record<string, QuestionnaireAnswer>>({});
  const [activeSectionIndex, setActiveSectionIndex] = useState(0);
  const [isSavingDraft, setIsSavingDraft] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submissionReceipt, setSubmissionReceipt] = useState<SubmissionReceipt | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  // URL fragments are not sent to Hosting/CDN logs or referrers. Read the
  // bearer secret once, remove it from browser history, and retain it only in
  // this component's in-memory state.
  useEffect(() => {
    const fragment = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const fragmentToken = fragment.get('token') || '';
    window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`);
    setAccessContext({
      requestId: queryRequestId || routeRequestId,
      tenantId: queryTenantId,
      tokenId: queryTokenId,
      rawToken: fragmentToken,
    });
  }, [queryRequestId, queryTenantId, queryTokenId, routeRequestId]);

  useEffect(() => {
    let cancelled = false;

    async function loadQuestionnaire() {
      if (!accessContext) return;
      setLoading(true);
      setError(null);

      if (
        !isSafeIdentifier(requestId) ||
        !isSafeIdentifier(tenantId) ||
        !isSafeIdentifier(tokenId) ||
        !/^[a-f0-9]{64}$/.test(rawToken)
      ) {
        setError('The access link is incomplete or malformed. Use the complete link from your invitation email.');
        setLoading(false);
        return;
      }

      try {
        const validateToken = httpsCallable<
          ValidateAssessmentAccessTokenInput,
          SanitizedPublicAssessmentView | EmailVerificationRequired
        >(functions, 'validateAssessmentAccessToken');
        const response = await validateToken({ tenantId, requestId, tokenId, rawToken });
        if (cancelled) return;

        const data = response.data;
        if ('requiresEmailVerification' in data && data.requiresEmailVerification && !data.isEmailVerified) {
          setError('This invitation requires email verification, but verification is not available in the current portal. Request an alternative link from your compliance contact.');
          return;
        }

        const publicView = data as SanitizedPublicAssessmentView;
        const viewError = validatePublicView(publicView, requestId, tenantId);
        if (viewError) {
          setError(viewError);
          return;
        }

        setAssessmentData(publicView);
        setAnswers(createAnswerMap(publicView.sections, publicView.existingAnswers));
      } catch (loadError) {
        if (!cancelled) setError(getSafePortalError('load', loadError));
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadQuestionnaire();
    return () => {
      cancelled = true;
    };
  }, [accessContext, requestId, tenantId, tokenId, rawToken]);

  const activeSection = assessmentData?.sections[activeSectionIndex];

  const completionStats = useMemo(() => {
    if (!assessmentData) return { total: 0, answered: 0, percent: 0 };
    let total = 0;
    let answered = 0;

    for (const section of assessmentData.sections) {
      for (const question of section.questions) {
        const visibility = getQuestionVisibility(question, answers);
        if (!visibility.isVisible) continue;
        total += 1;
        const value = answers[question.id]?.value;
        if (value !== null && value !== undefined && value !== '' && (!Array.isArray(value) || value.length > 0)) answered += 1;
      }
    }

    return { total, answered, percent: total > 0 ? Math.round((answered / total) * 100) : 0 };
  }, [assessmentData, answers]);

  const handleAnswerChange = (question: PublicQuestionnaireQuestion, value: unknown) => {
    setOperationError(null);
    setAnswers((current) => ({
      ...current,
      [question.id]: {
        ...(current[question.id] || {
          questionId: question.id,
          questionCode: question.code,
          sectionId: question.sectionId,
          attachedEvidenceIds: [],
        }),
        value: sanitizeAnswerValue(value),
        attachedEvidenceIds: [],
        updatedAt: new Date().toISOString(),
      },
    }));
  };

  const handleSaveDraft = async () => {
    if (!assessmentData) return;
    setIsSavingDraft(true);
    setOperationError(null);
    try {
      const saveDraft = httpsCallable<
        { tenantId: string; requestId: string; tokenId: string; rawToken: string; answers: Record<string, QuestionnaireAnswer> },
        SaveDraftResult
      >(functions, 'savePublicAssessmentDraft');
      const response = await saveDraft({
        tenantId,
        requestId,
        tokenId,
        rawToken,
        answers: createAnswerPayload(assessmentData.sections, answers),
      });
      if (!response.data.success || !response.data.savedAt) throw new Error('Draft save was not confirmed.');
      setLastSavedAt(response.data.savedAt);
    } catch (saveError) {
      setOperationError(getSafePortalError('save', saveError));
    } finally {
      setIsSavingDraft(false);
    }
  };

  const handleSubmitAssessment = async () => {
    if (!assessmentData) return;
    const errors: string[] = [];
    const answerPayload = createAnswerPayload(assessmentData.sections, answers);

    for (const section of assessmentData.sections) {
      for (const question of section.questions) {
        const visibility = getQuestionVisibility(question, answerPayload);
        if (!visibility.isVisible) continue;
        if (question.questionType === 'file_upload' && (visibility.isRequired || question.requiresEvidence)) {
          errors.push(`${section.title} → ${question.code}: secure document upload is required but is not available in this portal.`);
          continue;
        }
        const validation = validateAnswer(question as DynamicQuestionnaireQuestion, answerPayload[question.id], {
          checkRequired: visibility.isRequired,
          checkEvidence: Boolean(question.requiresEvidence),
        });
        if (!validation.valid) {
          errors.push(...validation.errors.map((message) => `${section.title} → ${question.code}: ${message}`));
        }
      }
    }

    if (errors.length > 0) {
      setValidationErrors(errors);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }

    setValidationErrors([]);
    setOperationError(null);
    setIsSubmitting(true);
    try {
      const submitAssessment = httpsCallable<
        {
          tenantId: string;
          requestId: string;
          tokenId: string;
          rawToken: string;
          answers: Record<string, QuestionnaireAnswer>;
          respondentInfo: { name: string; email: string; companyName: string };
        },
        SubmitAssessmentResult
      >(functions, 'submitPublicAssessment');
      const response = await submitAssessment({
        tenantId,
        requestId,
        tokenId,
        rawToken,
        answers: answerPayload,
        respondentInfo: {
          name: assessmentData.recipientName,
          email: assessmentData.recipientEmail,
          companyName: assessmentData.thirdPartyName,
        },
      });
      if (!response.data.success || !response.data.submissionId || !response.data.submittedAt) {
        throw new Error('Submission was not confirmed.');
      }
      setSubmissionReceipt({
        submissionId: response.data.submissionId,
        submittedAt: response.data.submittedAt,
      });
    } catch (submitError) {
      setOperationError(getSafePortalError('submit', submitError));
    } finally {
      setIsSubmitting(false);
    }
  };

  if (error) return <PortalState title="Access Link Unavailable" message={error} icon="🔒" tone="error" />;
  if (loading || !assessmentData) return <PortalState title="Verifying assessment link" message="The questionnaire will appear only after the invitation token is validated." icon="⏳" />;

  if (submissionReceipt) {
    return (
      <PortalState
        title="Assessment submitted"
        message={`The server recorded submission ${submissionReceipt.submissionId} at ${new Date(submissionReceipt.submittedAt).toUTCString()}. It is awaiting compliance review.`}
        icon="✓"
        tone="success"
      />
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', fontFamily: 'system-ui, -apple-system, sans-serif' }}>
      <header style={{ background: '#131824', borderBottom: '1px solid #242f48', padding: '16px 32px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '20px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontSize: '11px', textTransform: 'uppercase', letterSpacing: '1px', color: '#38bdf8', fontWeight: 700 }}>Third-Party Assessment Portal</div>
          <div style={{ fontSize: '17px', fontWeight: 700, color: '#fff', marginTop: '4px' }}>{assessmentData.thirdPartyName}</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ fontSize: '12px', color: '#94a3b8', textAlign: 'right' }}>
            <div>Due: <strong>{formatPortalDate(assessmentData.dueDate)}</strong></div>
            {lastSavedAt && <div style={{ color: '#10b981' }}>Server saved: {formatPortalDateTime(lastSavedAt)}</div>}
          </div>
          <button type="button" onClick={handleSaveDraft} disabled={isSavingDraft || isSubmitting} style={buttonStyle('#1e293b')}>
            {isSavingDraft ? 'Saving…' : 'Save draft'}
          </button>
        </div>
      </header>

      <div style={{ background: '#0f1420', borderBottom: '1px solid #1e293b', padding: '24px 32px' }}>
        <div style={{ maxWidth: '960px', margin: '0 auto' }}>
          <h1 style={{ fontSize: '22px', color: '#fff', margin: '0 0 8px' }}>{assessmentData.templateTitle}</h1>
          {assessmentData.templateDescription && <p style={{ fontSize: '14px', color: '#94a3b8', lineHeight: 1.5 }}>{assessmentData.templateDescription}</p>}
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#94a3b8', marginTop: '18px' }}>
            <span>{completionStats.answered} of {completionStats.total} visible questions answered</span>
            <span>{completionStats.percent}% complete</span>
          </div>
          <div style={{ height: '6px', background: '#1e293b', borderRadius: '3px', overflow: 'hidden', marginTop: '6px' }}>
            <div style={{ height: '100%', width: `${completionStats.percent}%`, background: '#38bdf8' }} />
          </div>
        </div>
      </div>

      <main style={{ maxWidth: '960px', margin: '32px auto', padding: '0 24px 60px' }}>
        {operationError && <Alert tone="error" title="Operation not completed" messages={[operationError]} />}
        {validationErrors.length > 0 && <Alert tone="error" title="Resolve these items before submission" messages={validationErrors} />}
        <Alert
          tone="warning"
          title="Document upload status"
          messages={['Secure external file upload is not yet available. No selected file will be represented as uploaded evidence. Contact your compliance representative when a required document blocks submission.']}
        />

        <nav aria-label="Questionnaire sections" style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #242f48', marginBottom: '28px', overflowX: 'auto' }}>
          {assessmentData.sections.map((section, index) => (
            <button
              type="button"
              key={section.id}
              onClick={() => setActiveSectionIndex(index)}
              style={{ background: 'none', border: 'none', borderBottom: index === activeSectionIndex ? '2px solid #38bdf8' : '2px solid transparent', color: index === activeSectionIndex ? '#38bdf8' : '#94a3b8', padding: '12px 18px', cursor: 'pointer', whiteSpace: 'nowrap' }}
            >
              {section.title}
            </button>
          ))}
        </nav>

        {activeSection && (
          <section>
            <h2 style={{ fontSize: '18px', color: '#fff', marginBottom: '6px' }}>{activeSection.title}</h2>
            {activeSection.description && <p style={{ color: '#94a3b8', fontSize: '13px', marginBottom: '24px' }}>{activeSection.description}</p>}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              {activeSection.questions.map((question) => {
                const visibility = getQuestionVisibility(question, answers);
                if (!visibility.isVisible) return null;
                return (
                  <QuestionField
                    key={question.id}
                    question={question}
                    required={visibility.isRequired}
                    value={answers[question.id]?.value ?? null}
                    onChange={(value) => handleAnswerChange(question, value)}
                  />
                );
              })}
            </div>
          </section>
        )}

        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginTop: '36px' }}>
          <button type="button" disabled={activeSectionIndex === 0} onClick={() => setActiveSectionIndex((index) => Math.max(0, index - 1))} style={buttonStyle('#1e293b')}>
            Previous section
          </button>
          {activeSectionIndex < assessmentData.sections.length - 1 ? (
            <button type="button" onClick={() => setActiveSectionIndex((index) => Math.min(assessmentData.sections.length - 1, index + 1))} style={buttonStyle('#2563eb')}>
              Next section
            </button>
          ) : (
            <button type="button" disabled={isSubmitting || isSavingDraft} onClick={handleSubmitAssessment} style={buttonStyle('#10b981')}>
              {isSubmitting ? 'Submitting…' : 'Submit final assessment'}
            </button>
          )}
        </div>
      </main>
    </div>
  );
}

function QuestionField({
  question,
  required,
  value,
  onChange,
}: {
  question: PublicQuestionnaireQuestion;
  required: boolean;
  value: QuestionnaireAnswer['value'];
  onChange: (value: unknown) => void;
}) {
  const cardStyle: React.CSSProperties = { background: '#131824', border: '1px solid #242f48', borderRadius: '10px', padding: '22px' };
  const inputStyle: React.CSSProperties = { width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#fff', padding: '10px 12px', borderRadius: '6px', fontSize: '14px' };

  return (
    <div style={cardStyle}>
      <label style={{ display: 'block', fontSize: '15px', fontWeight: 600, color: '#fff', lineHeight: 1.4, marginBottom: '12px' }}>
        <span style={{ color: '#38bdf8', marginRight: '8px' }}>[{question.code}]</span>
        {question.title}{required && <span style={{ color: '#ef4444' }}> *</span>}
      </label>
      {question.guidanceNotes && <div style={{ color: '#94a3b8', fontSize: '12px', borderLeft: '3px solid #38bdf8', padding: '8px 12px', marginBottom: '14px' }}>{question.guidanceNotes}</div>}

      {(question.questionType === 'yes_no' || question.questionType === 'boolean') && (
        <div style={{ display: 'flex', gap: '10px' }}>
          <button type="button" onClick={() => onChange(true)} style={buttonStyle(value === true ? '#047857' : '#1e293b')}>Yes</button>
          <button type="button" onClick={() => onChange(false)} style={buttonStyle(value === false ? '#b91c1c' : '#1e293b')}>No</button>
        </div>
      )}

      {question.questionType === 'single_select' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(question.options || []).map((option) => (
            <label key={option.value} style={{ padding: '10px 12px', background: value === option.value ? 'rgba(56,189,248,.12)' : '#1e293b', border: `1px solid ${value === option.value ? '#38bdf8' : '#334155'}`, borderRadius: '6px' }}>
              <input type="radio" name={question.id} checked={value === option.value} onChange={() => onChange(option.value)} /> <span style={{ marginLeft: '8px' }}>{option.label}</span>
            </label>
          ))}
        </div>
      )}

      {question.questionType === 'multi_select' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {(question.options || []).map((option) => {
            const selected = Array.isArray(value) && value.includes(option.value);
            return (
              <label key={option.value} style={{ padding: '10px 12px', background: selected ? 'rgba(56,189,248,.12)' : '#1e293b', border: '1px solid #334155', borderRadius: '6px' }}>
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onChange(selected ? (value as string[]).filter((item) => item !== option.value) : [...(Array.isArray(value) ? value : []), option.value])}
                />{' '}
                <span style={{ marginLeft: '8px' }}>{option.label}</span>
              </label>
            );
          })}
        </div>
      )}

      {question.questionType === 'numeric' && (
        <input type="number" value={typeof value === 'number' ? value : ''} min={question.numericConstraints?.min} max={question.numericConstraints?.max} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} style={inputStyle} />
      )}
      {question.questionType === 'text' && (
        <input type="text" value={typeof value === 'string' ? value : ''} maxLength={MAX_TEXT_LENGTH} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
      )}
      {question.questionType === 'textarea' && (
        <textarea rows={5} value={typeof value === 'string' ? value : ''} maxLength={MAX_TEXT_LENGTH} onChange={(event) => onChange(event.target.value)} style={{ ...inputStyle, resize: 'vertical' }} />
      )}
      {question.questionType === 'date' && (
        <input type="date" value={typeof value === 'string' ? value : ''} min={question.dateConstraints?.minDate} max={question.dateConstraints?.maxDate} onChange={(event) => onChange(event.target.value)} style={inputStyle} />
      )}
      {question.questionType === 'rating_scale' && (
        <input type="number" value={typeof value === 'number' ? value : ''} min={question.ratingConstraints?.minRating} max={question.ratingConstraints?.maxRating} onChange={(event) => onChange(event.target.value === '' ? null : Number(event.target.value))} style={inputStyle} />
      )}
      {question.questionType === 'file_upload' && (
        <div style={{ border: '2px dashed #475569', borderRadius: '8px', padding: '18px', color: '#fbbf24', background: '#0f1420' }}>
          Secure file upload is unavailable. No file has been uploaded or attached to this answer.
        </div>
      )}
    </div>
  );
}

function Alert({ tone, title, messages }: { tone: 'error' | 'warning'; title: string; messages: string[] }) {
  const color = tone === 'error' ? '#f87171' : '#fbbf24';
  return (
    <div role="alert" style={{ border: `1px solid ${color}`, background: tone === 'error' ? 'rgba(220,38,38,.1)' : 'rgba(245,158,11,.1)', borderRadius: '8px', padding: '14px 16px', marginBottom: '20px', color }}>
      <div style={{ fontWeight: 700, marginBottom: '6px' }}>{title}</div>
      <ul style={{ margin: 0, paddingLeft: '20px', fontSize: '13px', lineHeight: 1.6 }}>
        {messages.map((message, index) => <li key={`${index}-${message}`}>{message}</li>)}
      </ul>
    </div>
  );
}

function PortalState({ title, message, icon, tone = 'neutral' }: { title: string; message: string; icon: string; tone?: 'neutral' | 'error' | 'success' }) {
  const color = tone === 'error' ? '#f87171' : tone === 'success' ? '#10b981' : '#38bdf8';
  return (
    <div style={{ minHeight: '100vh', background: '#0a0d14', color: '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px' }}>
      <div style={{ maxWidth: '620px', width: '100%', background: '#131824', border: `1px solid ${color}`, borderRadius: '12px', padding: '36px', textAlign: 'center' }}>
        <div style={{ fontSize: '44px', color, marginBottom: '14px' }}>{icon}</div>
        <h1 style={{ fontSize: '22px', color: '#fff' }}>{title}</h1>
        <p style={{ color: '#94a3b8', lineHeight: 1.65 }}>{message}</p>
      </div>
    </div>
  );
}

function buttonStyle(background: string): React.CSSProperties {
  return { background, color: '#fff', border: '1px solid #334155', padding: '10px 18px', borderRadius: '6px', cursor: 'pointer', fontWeight: 600 };
}

function formatPortalDate(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString() : 'Not recorded';
}

function formatPortalDateTime(value: string): string {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : 'Unknown';
}

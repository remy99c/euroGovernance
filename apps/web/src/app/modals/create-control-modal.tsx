'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { UIModal } from '../components/ui-modal';

export type ControlEnforcementMechanism = 'automated' | 'manual' | 'policy' | 'hybrid';

export interface CreateControlSubmission {
  code: string;
  title: string;
  description: string;
  domain: string;
  frameworkIds: string[];
  requirementIds: string[];
  enforcementMechanism: ControlEnforcementMechanism;
  reviewFrequencyDays: number;
  ownerId: string;
  implementationNotes: string;
}

interface AdoptedFrameworkOption {
  id?: string;
  frameworkId?: string;
  frameworkCode?: string;
  frameworkName?: string;
  name?: string;
  status?: string;
}

export interface CreateControlModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (control: CreateControlSubmission) => Promise<void>;
  adoptedFrameworksList: AdoptedFrameworkOption[];
  currentUserId: string;
  loading?: boolean;
}

const CONTROL_CODE_PATTERN = /^[A-Z0-9][A-Z0-9._-]{1,39}$/u;
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$/u;

function splitIds(rawValue: string): string[] {
  return [...new Set(rawValue.split(/[\s,]+/u).map((value) => value.trim()).filter(Boolean))];
}

export function CreateControlModal({
  isOpen,
  onClose,
  onSubmit,
  adoptedFrameworksList,
  currentUserId,
  loading = false,
}: CreateControlModalProps) {
  const [code, setCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [domain, setDomain] = useState('Access Control');
  const [frameworkIds, setFrameworkIds] = useState<string[]>([]);
  const [requirementIdsText, setRequirementIdsText] = useState('');
  const [enforcementMechanism, setEnforcementMechanism] =
    useState<ControlEnforcementMechanism>('manual');
  const [reviewFrequencyDays, setReviewFrequencyDays] = useState(90);
  const [implementationNotes, setImplementationNotes] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const frameworkOptions = useMemo(() => {
    const seen = new Set<string>();
    return adoptedFrameworksList
      .filter((framework) => framework.status !== 'retired')
      .map((framework) => {
        const id = framework.frameworkId ?? framework.id ?? '';
        const label =
          framework.frameworkName ?? framework.name ?? framework.frameworkCode ?? id;
        return { id, label, status: framework.status ?? 'adopted' };
      })
      .filter((framework) => {
        if (!framework.id || seen.has(framework.id)) return false;
        seen.add(framework.id);
        return true;
      });
  }, [adoptedFrameworksList]);

  useEffect(() => {
    if (!isOpen) setFormError(null);
  }, [isOpen]);

  useEffect(() => {
    setFrameworkIds((current) =>
      current.filter((id) => frameworkOptions.some((framework) => framework.id === id))
    );
  }, [frameworkOptions]);

  const requirementIds = splitIds(requirementIdsText);
  const normalizedCode = code.trim().toUpperCase();
  const isValid =
    CONTROL_CODE_PATTERN.test(normalizedCode) &&
    title.trim().length >= 3 &&
    description.trim().length >= 20 &&
    domain.trim().length >= 2 &&
    frameworkIds.length > 0 &&
    frameworkIds.length <= 10 &&
    requirementIds.length <= 20 &&
    requirementIds.every((id) => DOCUMENT_ID_PATTERN.test(id)) &&
    Number.isSafeInteger(reviewFrequencyDays) &&
    reviewFrequencyDays >= 1 &&
    reviewFrequencyDays <= 1095 &&
    Boolean(currentUserId);

  const resetForm = () => {
    setCode('');
    setTitle('');
    setDescription('');
    setDomain('Access Control');
    setFrameworkIds([]);
    setRequirementIdsText('');
    setEnforcementMechanism('manual');
    setReviewFrequencyDays(90);
    setImplementationNotes('');
    setFormError(null);
  };

  const handleSubmit = async () => {
    if (!isValid || loading) return;
    setFormError(null);
    try {
      await onSubmit({
        code: normalizedCode,
        title: title.trim(),
        description: description.trim(),
        domain: domain.trim(),
        frameworkIds,
        requirementIds,
        enforcementMechanism,
        reviewFrequencyDays,
        ownerId: currentUserId,
        implementationNotes: implementationNotes.trim(),
      });
      resetForm();
    } catch (error) {
      const message =
        error && typeof error === 'object' && typeof (error as { message?: unknown }).message === 'string'
          ? (error as { message: string }).message.replace(/^Firebase:\s*/u, '')
          : 'The governed create command did not complete.';
      setFormError(message);
    }
  };

  const toggleFramework = (frameworkId: string) => {
    setFrameworkIds((current) =>
      current.includes(frameworkId)
        ? current.filter((id) => id !== frameworkId)
        : current.length < 10
          ? [...current, frameworkId]
          : current
    );
  };

  return (
    <UIModal
      isOpen={isOpen}
      onClose={onClose}
      title="Create governed control"
      subtitle="The control starts without implementation assurance. Effectiveness is granted only after evidence-backed independent review."
      maxWidth="720px"
      footerActions={
        <>
          <button onClick={onClose} className="btn-secondary" disabled={loading}>
            Cancel
          </button>
          <button onClick={() => void handleSubmit()} disabled={loading || !isValid} className="btn-success">
            {loading ? 'Committing governed record…' : 'Create without assurance'}
          </button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {formError && (
          <div role="alert" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--status-danger-fg)', color: 'var(--status-danger-fg)', fontSize: '12px' }}>
            {formError} The same command can be retried safely.
          </div>
        )}

        {frameworkOptions.length === 0 && (
          <div role="status" style={{ padding: '10px 12px', borderRadius: '6px', border: '1px solid var(--status-warning-fg)', color: 'var(--status-warning-fg)', fontSize: '12px' }}>
            Adopt and scope at least one framework before creating a mapped control.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(180px, 0.7fr) minmax(260px, 1.3fr)', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Control code
            <input type="text" value={code} onChange={(event) => setCode(event.target.value.toUpperCase())} placeholder="CTL-SEC-99" maxLength={40} className="input-modern" style={{ width: '100%', marginTop: '5px' }} aria-describedby="control-code-help" />
            <span id="control-code-help" style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)', fontSize: '10.5px', fontWeight: 400 }}>
              2–40 letters, numbers, periods, underscores, or hyphens.
            </span>
          </label>

          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Control title
            <input type="text" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="Privileged access reviews" maxLength={200} className="input-modern" style={{ width: '100%', marginTop: '5px' }} />
          </label>
        </div>

        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Control objective and operation
          <textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Describe the objective, responsible process, expected operation, and intended outcome (at least 20 characters)." className="input-modern" rows={4} maxLength={10_000} style={{ width: '100%', marginTop: '5px', resize: 'vertical' }} />
          <span style={{ display: 'block', marginTop: '4px', color: description.trim().length > 0 && description.trim().length < 20 ? 'var(--status-warning-fg)' : 'var(--text-muted)', fontSize: '10.5px', fontWeight: 400 }}>
            {description.trim().length}/10,000 characters; minimum 20.
          </span>
        </label>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(150px, 1fr))', gap: '12px' }}>
          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Domain
            <select value={domain} onChange={(event) => setDomain(event.target.value)} className="input-modern" style={{ width: '100%', marginTop: '5px' }}>
              <option value="Access Control">Access Control</option>
              <option value="Cryptography & Encryption">Cryptography & Encryption</option>
              <option value="Data Protection & Privacy">Data Protection & Privacy</option>
              <option value="AI Safety & Transparency">AI Safety & Transparency</option>
              <option value="Supplier & Processor Security">Supplier & Processor Security</option>
              <option value="Governance & Assurance">Governance & Assurance</option>
              <option value="Incident & Resilience">Incident & Resilience</option>
            </select>
          </label>

          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Enforcement
            <select value={enforcementMechanism} onChange={(event) => setEnforcementMechanism(event.target.value as ControlEnforcementMechanism)} className="input-modern" style={{ width: '100%', marginTop: '5px' }}>
              <option value="manual">Manual</option>
              <option value="automated">Automated</option>
              <option value="policy">Policy</option>
              <option value="hybrid">Hybrid</option>
            </select>
          </label>

          <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
            Review cadence (days)
            <input type="number" min={1} max={1095} step={1} value={reviewFrequencyDays} onChange={(event) => setReviewFrequencyDays(Number(event.target.value))} className="input-modern" style={{ width: '100%', marginTop: '5px' }} />
          </label>
        </div>

        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: '6px' }}>
            Adopted framework mappings
          </legend>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '8px' }}>
            {frameworkOptions.map((framework) => (
              <label key={framework.id} style={{ display: 'flex', alignItems: 'flex-start', gap: '8px', padding: '9px 10px', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}>
                <input type="checkbox" checked={frameworkIds.includes(framework.id)} onChange={() => toggleFramework(framework.id)} />
                <span style={{ fontSize: '12px' }}>
                  <span style={{ display: 'block', fontWeight: 600 }}>{framework.label}</span>
                  <span style={{ color: 'var(--text-muted)', fontSize: '10px' }}>{framework.status.replaceAll('_', ' ')}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Requirement IDs (optional)
          <input type="text" value={requirementIdsText} onChange={(event) => setRequirementIdsText(event.target.value)} placeholder="art-32, annex-a-5.15" className="input-modern" style={{ width: '100%', marginTop: '5px' }} />
          <span style={{ display: 'block', marginTop: '4px', color: requirementIds.length > 20 || requirementIds.some((id) => !DOCUMENT_ID_PATTERN.test(id)) ? 'var(--status-warning-fg)' : 'var(--text-muted)', fontSize: '10.5px', fontWeight: 400 }}>
            Up to 20 existing requirement IDs from one of the selected frameworks, separated by commas or spaces.
          </span>
        </label>

        <label style={{ fontSize: '12px', fontWeight: 700, color: 'var(--text-secondary)' }}>
          Initial implementation notes (optional)
          <textarea value={implementationNotes} onChange={(event) => setImplementationNotes(event.target.value)} placeholder="Record the current operating context or the first implementation step. This is not evidence of effectiveness." className="input-modern" rows={3} maxLength={10_000} style={{ width: '100%', marginTop: '5px', resize: 'vertical' }} />
        </label>

        <div style={{ padding: '10px 12px', borderRadius: '6px', background: 'var(--surface-subtle)', color: 'var(--text-secondary)', fontSize: '11.5px', lineHeight: 1.5 }}>
          Owner: <strong>{currentUserId}</strong>. Server validation confirms the owner is an active eligible member and that every framework and requirement mapping exists in this tenant’s adopted scope.
        </div>
      </div>
    </UIModal>
  );
}

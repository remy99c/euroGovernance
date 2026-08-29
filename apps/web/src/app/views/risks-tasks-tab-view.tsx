'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { UserRole } from '@eurogovernance/shared-types';
import { functions } from '../../lib/firebase';
import {
  clearRetryableTenantCommand,
  retryableTenantCommand,
} from '../../lib/commands';
import { UIEmptyState } from '../components/ui-empty-state';

interface OperationalRecord {
  id: string;
  title: string;
  status: string;
  revision?: number;
  ownerId?: string;
  createdBy?: string;
  retiredAt?: string | null;
  workflowTrust?: 'governed' | 'legacy_unverified';
}

interface RiskRecord extends OperationalRecord {
  code?: string;
  category?: string;
  inherentScore?: number;
  residualScore?: number;
  treatmentStrategy?: string;
  sourceEntityType?: string | null;
  acceptedBy?: string | null;
  acceptedAt?: string | null;
  closedBy?: string | null;
  closedAt?: string | null;
}

interface IssueRecord extends OperationalRecord {
  code?: string;
  severity?: string;
  dueDate?: string;
  verifiedAt?: string | null;
}

interface TaskRecord extends OperationalRecord {
  assigneeId?: string;
  dueDate?: string;
  parentEntityType?: string;
  parentEntityId?: string;
  completedAt?: string | null;
}

export interface RisksTasksTabViewProps {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  risksList: RiskRecord[];
  issuesList: IssueRecord[];
  tasksList: TaskRecord[];
  onChanged: () => void;
}

type CreateMode = 'risk' | 'issue' | 'task' | null;

interface OperationalAssignee {
  userId: string;
  displayName: string | null;
  role: string;
  department: string;
  title: string;
}

const RISK_EDITOR_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
]);
const WORK_EDITOR_ROLES = new Set<UserRole>([
  ...RISK_EDITOR_ROLES,
  'contributor',
]);
const INDEPENDENT_REVIEW_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
]);

function dateInput(daysFromToday: number): string {
  const date = new Date(Date.now() + daysFromToday * 24 * 60 * 60 * 1_000);
  return date.toISOString().slice(0, 10);
}

function trustLabel(record: OperationalRecord): React.ReactNode {
  return record.workflowTrust === 'governed' ? (
    <span style={{ color: 'var(--status-compliant-fg)', fontWeight: 700 }}>
      governed record
    </span>
  ) : (
    <span style={{ color: 'var(--status-warning-fg)', fontWeight: 700 }}>
      legacy provenance unverified
    </span>
  );
}

function readableError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'The command failed.';
  const candidate = error as { message?: unknown; code?: unknown };
  const message = typeof candidate.message === 'string' ? candidate.message : '';
  if (message) return message.replace(/^Firebase:\s*/u, '');
  return typeof candidate.code === 'string' ? candidate.code : 'The command failed.';
}

export function RisksTasksTabView({
  tenantId,
  userId,
  userRole,
  risksList,
  issuesList,
  tasksList,
  onChanged,
}: RisksTasksTabViewProps) {
  const [createMode, setCreateMode] = useState<CreateMode>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [assignees, setAssignees] = useState<OperationalAssignee[]>([]);

  const activeRisks = useMemo(
    () => risksList.filter((record) => !record.retiredAt),
    [risksList]
  );
  const activeIssues = useMemo(
    () => issuesList.filter((record) => !record.retiredAt),
    [issuesList]
  );
  const activeTasks = useMemo(
    () => tasksList.filter((record) => !record.retiredAt),
    [tasksList]
  );
  const taskParents = useMemo(
    () => [
      ...activeIssues.map((issue) => ({
        value: `issue:${issue.id}`,
        label: `Issue ${issue.code ?? issue.id}: ${issue.title}`,
      })),
      ...activeRisks.filter((risk) => risk.status !== 'closed').map((risk) => ({
        value: `risk:${risk.id}`,
        label: `Risk ${risk.code ?? risk.id}: ${risk.title}`,
      })),
    ],
    [activeIssues, activeRisks]
  );

  const canEditRisks = RISK_EDITOR_ROLES.has(userRole);
  const canEditWork = WORK_EDITOR_ROLES.has(userRole);

  useEffect(() => {
    if (!canEditWork) {
      setAssignees([]);
      return;
    }
    let active = true;
    const listAssignees = httpsCallable<
      { tenantId: string },
      { assignees?: OperationalAssignee[] }
    >(functions, 'listTenantOperationalAssignees');
    void listAssignees({ tenantId })
      .then((response) => {
        if (!active) return;
        if (!Array.isArray(response.data.assignees)) {
          throw new Error('Assignee directory response is invalid.');
        }
        setAssignees(response.data.assignees);
      })
      .catch(() => {
        if (active) setAssignees([]);
      });
    return () => {
      active = false;
    };
  }, [canEditWork, tenantId]);

  async function executeCommand(
    callableName: string,
    action: string,
    payload: Record<string, unknown>,
    expectedRevision?: number | null,
    logicalKey?: string
  ): Promise<void> {
    setError(null);
    setNotice(null);
    setPendingAction(`${action}:${logicalKey ?? 'create'}`);
    let commandId: string | null = null;
    try {
      const envelope = await retryableTenantCommand({
        tenantId,
        action,
        commandVersion: 1,
        ...(logicalKey ? { logicalKey } : {}),
        ...(expectedRevision !== undefined ? { expectedRevision } : {}),
        payload,
      });
      commandId = envelope.commandId;
      await httpsCallable(functions, callableName)(envelope);
      await clearRetryableTenantCommand({
        tenantId,
        action,
        commandVersion: 1,
        commandId,
      });
      setNotice('The governed command committed with its audit event and immutable version.');
      setCreateMode(null);
      onChanged();
    } catch (commandError) {
      setError(readableError(commandError));
    } finally {
      setPendingAction(null);
    }
  }

  async function createRisk(form: HTMLFormElement): Promise<void> {
    const values = new FormData(form);
    await executeCommand('createTenantRisk', 'risk.create', {
      code: String(values.get('code') ?? ''),
      title: String(values.get('title') ?? ''),
      description: String(values.get('description') ?? ''),
      category: String(values.get('category') ?? ''),
      inherentLikelihood: Number(values.get('inherentLikelihood')),
      inherentImpact: Number(values.get('inherentImpact')),
      residualLikelihood: Number(values.get('residualLikelihood')),
      residualImpact: Number(values.get('residualImpact')),
      treatmentStrategy: String(values.get('treatmentStrategy') ?? ''),
      treatmentPlan: String(values.get('treatmentPlan') ?? ''),
      mitigatingControlIds: [],
      affectedAssetIds: [],
      processorProfileIds: [],
      transferArrangementIds: [],
      vendorIds: [],
    });
  }

  async function createIssue(form: HTMLFormElement): Promise<void> {
    const values = new FormData(form);
    await executeCommand('createTenantIssue', 'issue.create', {
      code: String(values.get('code') ?? ''),
      title: String(values.get('title') ?? ''),
      description: String(values.get('description') ?? ''),
      severity: String(values.get('severity') ?? ''),
      source: 'manual_flag',
      sourceEntityId: null,
      sourceEntityType: null,
      dueDate: String(values.get('dueDate') ?? ''),
      resolutionPlan: String(values.get('resolutionPlan') ?? ''),
    });
  }

  async function createTask(form: HTMLFormElement): Promise<void> {
    const values = new FormData(form);
    const parent = String(values.get('parent') ?? '');
    const separator = parent.indexOf(':');
    if (separator < 1) {
      setError('Select an active risk or issue for this remediation task.');
      return;
    }
    await executeCommand('createTenantTask', 'task.create', {
      title: String(values.get('title') ?? ''),
      description: String(values.get('description') ?? ''),
      parentEntityType: parent.slice(0, separator),
      parentEntityId: parent.slice(separator + 1),
      assigneeId: String(values.get('assigneeId') ?? userId),
      dueDate: String(values.get('dueDate') ?? ''),
    });
  }

  async function transitionRisk(risk: RiskRecord, status: string): Promise<void> {
    await executeCommand(
      'updateTenantRisk',
      'risk.update',
      { riskId: risk.id, status },
      risk.revision ?? 0,
      `${risk.id}:${status}`
    );
  }

  async function transitionIssue(issue: IssueRecord, status: string): Promise<void> {
    const payload: Record<string, unknown> = { issueId: issue.id, status };
    if (status === 'under_review') {
      const resolutionPlan = globalThis.prompt(
        'Describe the completed corrective action for independent review (at least 20 characters).'
      );
      if (resolutionPlan === null) return;
      if (resolutionPlan.trim().length < 20) {
        setError('The corrective-action summary must contain at least 20 characters.');
        return;
      }
      payload.resolutionPlan = resolutionPlan;
    }
    await executeCommand(
      'updateTenantIssue',
      'issue.update',
      payload,
      issue.revision ?? 0,
      `${issue.id}:${status}`
    );
  }

  async function transitionTask(task: TaskRecord, status: string): Promise<void> {
    await executeCommand(
      'updateTenantTask',
      'task.update',
      { taskId: task.id, status },
      task.revision ?? 0,
      `${task.id}:${status}`
    );
  }

  return (
    <div>
      <header style={{ marginBottom: '24px', display: 'flex', justifyContent: 'space-between', gap: '20px', alignItems: 'flex-start' }}>
        <div>
          <h1 style={{ fontSize: '22px', fontWeight: 800, color: 'var(--text-primary)', letterSpacing: '-0.02em' }}>
            Risk, Issues & Remediation Workspace
          </h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px', maxWidth: '760px' }}>
            Operate the linked risk-to-finding-to-task lifecycle. Every change uses optimistic concurrency, an immutable record version, and an atomic audit event.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
          <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={onChanged}>Refresh</button>
          {canEditRisks && <button className="btn-secondary" onClick={() => setCreateMode('risk')}>New risk</button>}
          {canEditWork && <button className="btn-secondary" onClick={() => setCreateMode('issue')}>New issue</button>}
          {canEditWork && <button className="btn-primary" disabled={taskParents.length === 0} onClick={() => setCreateMode('task')}>New task</button>}
        </div>
      </header>

      {notice && <div role="status" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface-success-subtle)', color: 'var(--status-compliant-fg)', fontSize: '12px' }}>{notice}</div>}
      {error && <div role="alert" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'var(--surface-danger-subtle)', color: 'var(--status-critical-fg)', fontSize: '12px' }}>{error}</div>}

      {createMode && (
        <section className="card-modern" style={{ marginBottom: '20px', borderColor: 'var(--border-focus)' }}>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (pendingAction) return;
              if (createMode === 'risk') void createRisk(event.currentTarget);
              if (createMode === 'issue') void createIssue(event.currentTarget);
              if (createMode === 'task') void createTask(event.currentTarget);
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
              <h2 style={{ fontSize: '15px', fontWeight: 750 }}>Create governed {createMode}</h2>
              <button type="button" className="btn-ghost" onClick={() => setCreateMode(null)}>Cancel</button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '12px' }}>
              {createMode !== 'task' && <label className="field-label">Code<input name="code" required minLength={2} maxLength={40} placeholder={createMode === 'risk' ? 'RSK-SEC-01' : 'ISS-01'} /></label>}
              <label className="field-label">Title<input name="title" required minLength={3} maxLength={200} /></label>
              <label className="field-label" style={{ gridColumn: '1 / -1' }}>Description<textarea name="description" required minLength={1} maxLength={10000} rows={3} /></label>
              {createMode === 'risk' && (
                <>
                  <label className="field-label">Category<select name="category" defaultValue="security"><option value="security">Security</option><option value="privacy">Privacy</option><option value="legal_compliance">Legal compliance</option><option value="ai_bias">AI bias</option><option value="operational">Operational</option><option value="third_party">Third party</option></select></label>
                  <label className="field-label">Treatment strategy<select name="treatmentStrategy" defaultValue="mitigate"><option value="mitigate">Mitigate</option><option value="accept">Accept</option><option value="transfer">Transfer</option><option value="avoid">Avoid</option></select></label>
                  {(['inherentLikelihood', 'inherentImpact', 'residualLikelihood', 'residualImpact'] as const).map((field) => <label key={field} className="field-label">{field.replace(/([A-Z])/gu, ' $1')}<input name={field} type="number" min={1} max={5} step={1} defaultValue={field.startsWith('residual') ? 3 : 4} required /></label>)}
                  <label className="field-label" style={{ gridColumn: '1 / -1' }}>Treatment plan<textarea name="treatmentPlan" required minLength={20} maxLength={10000} rows={3} /></label>
                </>
              )}
              {createMode === 'issue' && (
                <>
                  <label className="field-label">Severity<select name="severity" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option><option value="critical">Critical</option></select></label>
                  <label className="field-label">Due date<input name="dueDate" type="date" min={dateInput(0)} max={dateInput(3650)} defaultValue={dateInput(30)} required /></label>
                  <label className="field-label" style={{ gridColumn: '1 / -1' }}>Resolution plan<textarea name="resolutionPlan" required minLength={20} maxLength={10000} rows={3} /></label>
                </>
              )}
              {createMode === 'task' && (
                <>
                  <label className="field-label">Parent record<select name="parent" required defaultValue=""><option value="" disabled>Select an active risk or issue</option>{taskParents.map((parent) => <option key={parent.value} value={parent.value}>{parent.label}</option>)}</select></label>
                  <label className="field-label">Assignee<select name="assigneeId" required defaultValue={userId}>{assignees.length === 0 && <option value={userId}>You</option>}{assignees.map((assignee) => <option key={assignee.userId} value={assignee.userId}>{assignee.userId === userId ? 'You' : assignee.displayName || assignee.title || assignee.userId} · {assignee.role}</option>)}</select></label>
                  <label className="field-label">Due date<input name="dueDate" type="date" min={dateInput(0)} max={dateInput(3650)} defaultValue={dateInput(14)} required /></label>
                </>
              )}
            </div>
            <button type="submit" className="btn-primary" disabled={Boolean(pendingAction)} style={{ marginTop: '14px' }}>
              {pendingAction ? 'Committing…' : `Create ${createMode}`}
            </button>
          </form>
        </section>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '18px' }}>
        <section className="card-modern">
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Risks ({activeRisks.length})</h2>
          {activeRisks.length === 0 ? <UIEmptyState icon="⚠️" title="No recorded risks" description="Create or derive a risk to begin treatment tracking." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeRisks.map((risk) => (
                <article key={risk.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', fontSize: '12px' }}>
                  <div style={{ fontWeight: 700 }}>{risk.code}: {risk.title}</div>
                  <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>Inherent {risk.inherentScore ?? '—'} · Residual {risk.residualScore ?? '—'} · {risk.status}</div>
                  <div style={{ marginTop: '3px' }}>{trustLabel(risk)}</div>
                  {risk.sourceEntityType === 'processor_risk_engine' && (
                    <div style={{ marginTop: '3px', color: 'var(--text-muted)' }}>engine-managed · reconciled from verified processor context</div>
                  )}
                  {canEditRisks && risk.workflowTrust === 'governed' && risk.sourceEntityType !== 'processor_risk_engine' && (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
                      {risk.status === 'identified' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionRisk(risk, 'assessed')}>Mark assessed</button>}
                      {risk.status === 'assessed' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionRisk(risk, 'mitigating')}>Begin mitigation</button>}
                      {risk.status === 'assessed' && risk.treatmentStrategy === 'accept' && risk.ownerId !== userId && risk.createdBy !== userId && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionRisk(risk, 'accepted')}>Accept residual risk</button>}
                      {risk.status === 'mitigating' && risk.ownerId !== userId && risk.createdBy !== userId && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionRisk(risk, 'closed')}>Independently close</button>}
                      {risk.status === 'accepted' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionRisk(risk, 'mitigating')}>Reopen treatment</button>}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="card-modern">
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Issues ({activeIssues.length})</h2>
          {activeIssues.length === 0 ? <UIEmptyState icon="🔎" title="No recorded issues" description="Findings and corrective actions will appear here." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeIssues.map((issue) => {
                const independentReviewer =
                  INDEPENDENT_REVIEW_ROLES.has(userRole) &&
                  issue.ownerId !== userId &&
                  issue.createdBy !== userId;
                return (
                  <article key={issue.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700 }}>{issue.code}: {issue.title}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>{issue.severity} · {issue.status} · due {issue.dueDate?.slice(0, 10) ?? '—'}</div>
                    <div style={{ marginTop: '3px' }}>{trustLabel(issue)}</div>
                    {canEditWork && issue.workflowTrust === 'governed' && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
                        {issue.status === 'open' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionIssue(issue, 'in_progress')}>Start work</button>}
                        {issue.status === 'in_progress' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionIssue(issue, 'under_review')}>Submit review</button>}
                        {issue.status === 'under_review' && independentReviewer && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionIssue(issue, 'resolved')}>Verify resolved</button>}
                        {issue.status === 'resolved' && independentReviewer && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionIssue(issue, 'closed')}>Close issue</button>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="card-modern">
          <h2 style={{ fontSize: '15px', fontWeight: 700, marginBottom: '14px' }}>Tasks ({activeTasks.length})</h2>
          {activeTasks.length === 0 ? <UIEmptyState icon="📋" title="No remediation tasks" description="Create a task linked to a risk or issue." /> : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {activeTasks.map((task) => {
                const canAct = canEditWork && (userRole !== 'contributor' || task.assigneeId === userId || task.ownerId === userId);
                return (
                  <article key={task.id} style={{ borderBottom: '1px solid var(--border-subtle)', paddingBottom: '10px', fontSize: '12px' }}>
                    <div style={{ fontWeight: 700 }}>{task.title}</div>
                    <div style={{ color: 'var(--text-muted)', marginTop: '3px' }}>{task.status} · due {task.dueDate?.slice(0, 10) ?? '—'} · assigned {task.assigneeId === userId ? 'to you' : task.assigneeId ?? '—'}</div>
                    <div style={{ marginTop: '3px' }}>{trustLabel(task)}</div>
                    {canAct && task.workflowTrust === 'governed' && (
                      <div style={{ display: 'flex', gap: '6px', marginTop: '7px', flexWrap: 'wrap' }}>
                        {task.status === 'todo' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionTask(task, 'in_progress')}>Start task</button>}
                        {task.status === 'in_progress' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionTask(task, 'completed')}>Complete</button>}
                        {task.status === 'in_progress' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionTask(task, 'blocked')}>Mark blocked</button>}
                        {task.status === 'blocked' && <button className="btn-ghost" disabled={Boolean(pendingAction)} onClick={() => void transitionTask(task, 'in_progress')}>Resume</button>}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

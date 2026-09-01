'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { httpsCallable } from 'firebase/functions';
import type { UserRole } from '@eurogovernance/shared-types';
import { functions } from '../../lib/firebase';
import {
  clearRetryableTenantCommand,
  retryableTenantCommand,
} from '../../lib/commands';
import { UIBadge, getStatusVariant } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';
import { UIModal } from '../components/ui-modal';
import { UIPageHeader } from '../components/ui-page-header';

type ControlEditableStatus = 'not_started' | 'in_progress' | 'not_applicable';
type ControlEffectiveness = 'effective' | 'needs_improvement' | 'ineffective';
type DetailMode = 'details' | 'edit' | 'submit_review' | 'decide_review' | 'retire';

export interface ControlProjection {
  id: string;
  tenantId?: string;
  code?: string;
  title?: string;
  description?: string;
  domain?: string;
  frameworkIds?: string[];
  requirementIds?: string[];
  status?: string;
  recordedStatus?: string;
  healthScore?: number;
  enforcementMechanism?: 'automated' | 'manual' | 'policy' | 'hybrid';
  reviewFrequencyDays?: number;
  implementationNotes?: string;
  implementationContributorIds?: string[];
  ownerId?: string | null;
  createdBy?: string;
  createdAt?: string;
  updatedAt?: string;
  revision?: number;
  workflowTrust?:
    | 'legacy_unverified'
    | 'governed_unassured'
    | 'review_pending'
    | 'authoritative'
    | 'retired';
  assuranceStatus?:
    | 'untested'
    | 'pending_review'
    | 'effective'
    | 'needs_improvement'
    | 'ineffective'
    | 'expired'
    | 'not_applicable';
  lastReviewDate?: string | null;
  nextReviewDate?: string | null;
  lastReviewId?: string | null;
  lastReviewEffectiveness?: ControlEffectiveness | null;
  lastReviewEvidenceIds?: string[];
  pendingReviewId?: string | null;
  pendingReviewAssigneeId?: string | null;
  pendingReviewSubmittedAt?: string | null;
  pendingReviewSubmittedBy?: string | null;
  statusRationale?: string | null;
  statusDecidedBy?: string | null;
  statusDecidedAt?: string | null;
  assuranceInvalidatedAt?: string | null;
  assuranceInvalidatedBy?: string | null;
  retiredAt?: string | null;
  retiredBy?: string | null;
  retirementReason?: string | null;
  currentArtifactVerified?: boolean;
}

interface ControlReviewProjection {
  id: string;
  controlId?: string;
  status?: string;
  assignedReviewerId?: string;
  submittedBy?: string;
  submittedAt?: string;
  reviewerId?: string | null;
  reviewerRole?: string | null;
  effectiveness?: ControlEffectiveness;
  notes?: string;
  testMethod?: string;
  testPeriodStart?: string | null;
  testPeriodEnd?: string | null;
  sampleSize?: number | null;
  exceptions?: string;
  evidenceIds?: string[];
  decision?: 'approved' | 'rejected' | null;
  decisionNotes?: string | null;
  reviewedAt?: string | null;
  reviewedControlRevision?: number;
  resultingControlRevision?: number;
}

interface ControlReviewer {
  userId: string;
  displayName?: string | null;
  role: string;
  department?: string;
  title?: string;
}

interface EvidenceProjection {
  id: string;
  title?: string;
  category?: string;
  status?: string;
  storagePath?: string;
  fileSizeBytes?: number;
  mimeType?: string;
  fileHashSha256?: string;
  reviewDueDate?: string | null;
  createdBy?: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  currentVersion?: number;
  controlIds?: string[];
  objectVerification?: {
    status?: string;
    storagePath?: string;
    storageGeneration?: string;
    verifiedFileHashSha256?: string;
    verifiedFileSizeBytes?: number;
    verifiedMimeType?: string;
    verifiedAt?: string;
    verifier?: string;
  } | null;
}

interface AdoptedFrameworkProjection {
  id?: string;
  frameworkId?: string;
  frameworkName?: string;
  frameworkCode?: string;
  status?: string;
  scopeDescription?: string;
}

interface ControlHistoryItem {
  versionId?: string;
  revision?: number;
  state?: Record<string, unknown>;
  changedFields?: string[];
  recordedBy?: string | null;
  recordedAt?: string;
  provenance?: string;
  integrityStatus?: string;
  stateHash?: string;
  previousStateHash?: string | null;
  command?: { commandId?: string; commandName?: string; committedAt?: string } | null;
  audit?: { action?: string; actorId?: string; actorRole?: string; timestamp?: string; workflowContext?: string } | null;
  kind?: string;
  id?: string;
  status?: string;
  effectiveness?: string;
  submittedAt?: string;
  reviewedAt?: string | null;
  review?: {
    id?: string;
    integrityStatus?: string;
    status?: string;
    effectiveness?: string;
    submittedBy?: string;
    submittedAt?: string;
    reviewerId?: string | null;
    reviewedAt?: string | null;
    decision?: string | null;
  } | null;
}

export interface ControlsTabViewProps {
  tenantId: string;
  userId: string;
  userRole: UserRole;
  controlsList: ControlProjection[];
  evidenceList: EvidenceProjection[];
  adoptedFrameworksList: AdoptedFrameworkProjection[];
  onOpenCreateControlModal: () => void;
  onOpenAdoptFrameworkModal: (framework: { id: string; name: string }) => void;
  onInstantiateFramework: (frameworkId: string, frameworkName: string) => Promise<void>;
  onChanged: () => void;
  loadingAction?: string | null;
}

const PAGE_SIZE = 20;
const CONTROL_MANAGER_ROLES = new Set<UserRole>([
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
]);
const CONTROL_EDITOR_ROLES = new Set<UserRole>([...CONTROL_MANAGER_ROLES, 'contributor']);
const CONTROL_REVIEW_DECISION_ROLES = new Set<UserRole>([...CONTROL_MANAGER_ROLES, 'approver']);
const CONTROL_HISTORY_ROLES = new Set<UserRole>([
  ...CONTROL_MANAGER_ROLES,
  'auditor',
  'approver',
]);
const CONTROL_RETIRE_ROLES = new Set<UserRole>(['tenant_admin', 'compliance_manager']);

const CANONICAL_FRAMEWORKS = [
  { id: 'gdpr', name: 'GDPR (EU 2016/679)', domain: 'Privacy & Data Protection' },
  { id: 'eu_ai_act', name: 'EU AI Act (EU 2024/1689)', domain: 'AI Governance' },
  { id: 'eu_data_act', name: 'EU Data Act (EU 2023/2854)', domain: 'Data Access & Portability' },
  { id: 'iso_27001', name: 'ISO/IEC 27001:2022', domain: 'Information Security' },
  { id: 'iso_42001', name: 'ISO/IEC 42001:2023', domain: 'AI Management Systems' },
] as const;

function readableError(error: unknown): string {
  if (!error || typeof error !== 'object') return 'The request did not complete.';
  const candidate = error as { message?: unknown; code?: unknown };
  if (typeof candidate.message === 'string' && candidate.message) {
    return candidate.message.replace(/^Firebase:\s*/u, '');
  }
  return typeof candidate.code === 'string' ? candidate.code : 'The request did not complete.';
}

function formatDate(value: unknown): string {
  if (typeof value !== 'string' || !value) return 'Not recorded';
  const parsed = Date.parse(value);
  if (!Number.isFinite(parsed)) return 'Invalid recorded date';
  return new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(parsed);
}

function formatLabel(value: string | undefined | null): string {
  if (!value) return 'Not recorded';
  return value.replaceAll('_', ' ').replace(/\b\w/gu, (character) => character.toUpperCase());
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : [];
}

function splitIds(rawValue: FormDataEntryValue | null): string[] {
  return [...new Set(String(rawValue ?? '').split(/[\s,]+/u).map((value) => value.trim()).filter(Boolean))];
}

function trustPresentation(control: ControlProjection): { label: string; variant: 'compliant' | 'warning' | 'critical' | 'review' | 'neutral'; explanation: string } {
  switch (control.workflowTrust) {
    case 'authoritative':
      return { label: 'Verified command chain', variant: 'compliant', explanation: 'Current state, immutable version, command receipt, and audit anchor verified.' };
    case 'review_pending':
      return { label: 'Independent review pending', variant: 'review', explanation: 'A submitted test is awaiting its assigned independent reviewer.' };
    case 'governed_unassured':
      return { label: 'Governed, not assured', variant: 'warning', explanation: 'Changes use the governed command boundary, but no current approved effectiveness test exists.' };
    case 'retired':
      return { label: 'Governed retired record', variant: 'neutral', explanation: 'The record is retained for audit history and cannot be changed.' };
    case 'legacy_unverified':
    default:
      return { label: 'Legacy provenance unverified', variant: 'critical', explanation: 'The platform could not verify the current record against immutable command and audit artifacts.' };
  }
}

function assurancePresentation(control: ControlProjection): { label: string; variant: 'compliant' | 'warning' | 'critical' | 'review' | 'neutral' } {
  if (control.workflowTrust === 'legacy_unverified') {
    return { label: 'No reliable assurance', variant: 'critical' };
  }
  switch (control.assuranceStatus) {
    case 'effective':
      return { label: 'Effective', variant: 'compliant' };
    case 'needs_improvement':
      return { label: 'Needs improvement', variant: 'warning' };
    case 'ineffective':
      return { label: 'Ineffective', variant: 'critical' };
    case 'expired':
      return { label: 'Review expired', variant: 'critical' };
    case 'pending_review':
      return { label: 'Pending independent review', variant: 'review' };
    case 'not_applicable':
      return { label: 'Approved not applicable', variant: 'neutral' };
    case 'untested':
    default:
      return { label: 'Untested', variant: 'neutral' };
  }
}

function eligibleEvidence(evidence: EvidenceProjection, controlId: string): boolean {
  const verification = evidence.objectVerification;
  const reviewDue = evidence.reviewDueDate ? Date.parse(evidence.reviewDueDate) : Number.NaN;
  return (
    evidence.status === 'valid' &&
    stringArray(evidence.controlIds).includes(controlId) &&
    verification?.status === 'verified' &&
    verification.verifier === 'storage_finalize_function' &&
    typeof verification.storageGeneration === 'string' &&
    verification.storageGeneration.length > 0 &&
    verification.storagePath === evidence.storagePath &&
    verification.verifiedFileHashSha256 === evidence.fileHashSha256 &&
    verification.verifiedFileSizeBytes === evidence.fileSizeBytes &&
    verification.verifiedMimeType === evidence.mimeType &&
    typeof verification.verifiedAt === 'string' &&
    Number.isFinite(Date.parse(verification.verifiedAt)) &&
    typeof evidence.createdBy === 'string' &&
    typeof evidence.reviewedBy === 'string' &&
    evidence.reviewedBy.length > 0 &&
    evidence.reviewedBy !== evidence.createdBy &&
    typeof evidence.reviewedAt === 'string' &&
    Number.isFinite(Date.parse(evidence.reviewedAt)) &&
    Date.parse(verification.verifiedAt) <= Date.parse(evidence.reviewedAt) &&
    Number.isFinite(reviewDue) &&
    reviewDue > Date.now()
  );
}

function safeControlRevision(control: ControlProjection): number {
  return Number.isSafeInteger(control.revision) && (control.revision ?? -1) >= 0
    ? control.revision!
    : 0;
}

function historyFromResponse(data: Record<string, unknown>): ControlHistoryItem[] {
  const history = Array.isArray(data.history) ? data.history : [];
  return history
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object' && !Array.isArray(item))
    .map((item) => item as ControlHistoryItem);
}

export function ControlsTabView({
  tenantId,
  userId,
  userRole,
  controlsList,
  evidenceList,
  adoptedFrameworksList,
  onOpenCreateControlModal,
  onOpenAdoptFrameworkModal,
  onInstantiateFramework,
  onChanged,
  loadingAction,
}: ControlsTabViewProps) {
  const [queryText, setQueryText] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [trustFilter, setTrustFilter] = useState('all');
  const [frameworkFilter, setFrameworkFilter] = useState('all');
  const [domainFilter, setDomainFilter] = useState('all');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [selectedSummary, setSelectedSummary] = useState<ControlProjection | null>(null);
  const [selectedControl, setSelectedControl] = useState<ControlProjection | null>(null);
  const [pendingReview, setPendingReview] = useState<ControlReviewProjection | null>(null);
  const [history, setHistory] = useState<ControlHistoryItem[]>([]);
  const [historyTruncated, setHistoryTruncated] = useState(false);
  const [historyCursorRevision, setHistoryCursorRevision] = useState<number | null>(null);
  const [reviewers, setReviewers] = useState<ControlReviewer[]>([]);
  const [detailMode, setDetailMode] = useState<DetailMode>('details');
  const [detailLoading, setDetailLoading] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [pendingAction, setPendingAction] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvidenceIds, setSelectedEvidenceIds] = useState<string[]>([]);

  const canCreate = CONTROL_MANAGER_ROLES.has(userRole);
  const canEditAny = CONTROL_MANAGER_ROLES.has(userRole);
  const canSubmitReview = CONTROL_EDITOR_ROLES.has(userRole);
  const canDecideReview = CONTROL_REVIEW_DECISION_ROLES.has(userRole);
  const canViewHistory = CONTROL_HISTORY_ROLES.has(userRole);
  const canRetire = CONTROL_RETIRE_ROLES.has(userRole);

  const frameworkOptions = useMemo(
    () => [...new Set(controlsList.flatMap((control) => stringArray(control.frameworkIds)))].sort(),
    [controlsList]
  );
  const domainOptions = useMemo(
    () => [...new Set(controlsList.map((control) => control.domain).filter((domain): domain is string => Boolean(domain)))].sort(),
    [controlsList]
  );
  const filteredControls = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return controlsList.filter((control) => {
      const searchText = [control.code, control.title, control.description, control.domain, control.ownerId, ...stringArray(control.frameworkIds), ...stringArray(control.requirementIds)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return (
        (!query || searchText.includes(query)) &&
        (statusFilter === 'all' || control.status === statusFilter || control.assuranceStatus === statusFilter) &&
        (trustFilter === 'all' || control.workflowTrust === trustFilter) &&
        (frameworkFilter === 'all' || stringArray(control.frameworkIds).includes(frameworkFilter)) &&
        (domainFilter === 'all' || control.domain === domainFilter) &&
        (ownerFilter === 'all' || (ownerFilter === 'mine' && control.ownerId === userId))
      );
    });
  }, [controlsList, domainFilter, frameworkFilter, ownerFilter, queryText, statusFilter, trustFilter, userId]);
  const pageCount = Math.max(1, Math.ceil(filteredControls.length / PAGE_SIZE));
  const visibleControls = filteredControls.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const activeControl = selectedControl ?? selectedSummary;
  const linkedEligibleEvidence = useMemo(
    () => activeControl ? evidenceList.filter((evidence) => eligibleEvidence(evidence, activeControl.id)) : [],
    [activeControl, evidenceList]
  );
  const independentReviewers = useMemo(() => {
    if (!activeControl) return [];
    const prohibited = new Set([
      userId,
      activeControl.ownerId ?? '',
      activeControl.createdBy ?? '',
      ...stringArray(activeControl.implementationContributorIds),
    ]);
    return reviewers.filter((reviewer) => !prohibited.has(reviewer.userId));
  }, [activeControl, reviewers, userId]);

  useEffect(() => setPage(1), [domainFilter, frameworkFilter, ownerFilter, queryText, statusFilter, trustFilter]);
  useEffect(() => {
    if (page > pageCount) setPage(pageCount);
  }, [page, pageCount]);
  useEffect(() => {
    setSelectedSummary(null);
    setSelectedControl(null);
    setPendingReview(null);
    setHistory([]);
    setReviewers([]);
    setDetailMode('details');
    setSelectedEvidenceIds([]);
    setError(null);
    setNotice(null);
  }, [tenantId]);

  async function loadHistory(controlId: string, cursorRevision?: number): Promise<void> {
    if (!canViewHistory) return;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const response = await httpsCallable<
        { tenantId: string; controlId: string; pageSize: number; cursorRevision?: number },
        Record<string, unknown>
      >(functions, 'getTenantControlHistory')({ tenantId, controlId, pageSize: 20, ...(cursorRevision !== undefined ? { cursorRevision } : {}) });
      const next = historyFromResponse(response.data);
      setHistory((current) => cursorRevision === undefined ? next : [...current, ...next]);
      setHistoryTruncated(response.data.truncated === true);
      setHistoryCursorRevision(
        typeof response.data.nextCursorRevision === 'number'
          ? response.data.nextCursorRevision
          : null
      );
    } catch (historyRequestError) {
      setHistoryError(`Audit history unavailable: ${readableError(historyRequestError)}`);
      if (cursorRevision === undefined) setHistory([]);
    } finally {
      setHistoryLoading(false);
    }
  }

  async function openControl(control: ControlProjection): Promise<void> {
    setSelectedSummary(control);
    setSelectedControl(control);
    setPendingReview(null);
    setDetailMode('details');
    setSelectedEvidenceIds([]);
    setDetailLoading(true);
    setError(null);
    setNotice(null);
    setHistory([]);
    setHistoryError(null);
    setReviewers([]);

    const detailRequest = httpsCallable<
      { tenantId: string; controlId: string },
      { control?: ControlProjection; pendingReview?: ControlReviewProjection | null; review?: ControlReviewProjection | null }
    >(functions, 'getTenantControlDetail')({ tenantId, controlId: control.id });
    const reviewerRequest = canSubmitReview || canDecideReview
      ? httpsCallable<{ tenantId: string }, { reviewers?: ControlReviewer[] }>(functions, 'listTenantControlReviewers')({ tenantId })
      : Promise.resolve(null);
    const [detailResult, reviewerResult] = await Promise.allSettled([detailRequest, reviewerRequest]);

    if (detailResult.status === 'fulfilled' && detailResult.value.data.control?.id === control.id) {
      const detail = detailResult.value.data.control;
      if (detail.tenantId !== undefined && detail.tenantId !== tenantId) {
        setError('The control detail response did not match the active organization.');
      } else {
        setSelectedControl(detail);
        setPendingReview(detailResult.value.data.pendingReview ?? detailResult.value.data.review ?? null);
      }
    } else {
      setError(detailResult.status === 'rejected' ? `Control detail unavailable: ${readableError(detailResult.reason)}` : 'Control detail response was invalid.');
    }

    if (reviewerResult.status === 'fulfilled' && reviewerResult.value !== null) {
      const returnedReviewers = reviewerResult.value.data.reviewers;
      if (Array.isArray(returnedReviewers)) setReviewers(returnedReviewers);
    }
    setDetailLoading(false);
    void loadHistory(control.id);
  }

  async function executeCommand(
    callableName: string,
    action: string,
    payload: Record<string, unknown>,
    expectedRevision: number | null,
    logicalKey: string
  ): Promise<void> {
    setPendingAction(action);
    setError(null);
    setNotice(null);
    let commandId: string | null = null;
    try {
      const envelope = await retryableTenantCommand({
        tenantId,
        action,
        commandVersion: 1,
        logicalKey,
        expectedRevision,
        payload,
      });
      commandId = envelope.commandId;
      await httpsCallable(functions, callableName)(envelope);
      await clearRetryableTenantCommand({ tenantId, action, commandVersion: 1, commandId });
      setNotice('The command committed atomically with its immutable version and audit anchor.');
      setDetailMode('details');
      setSelectedSummary(null);
      setSelectedControl(null);
      setPendingReview(null);
      setHistory([]);
      onChanged();
    } catch (commandError) {
      setError(`${readableError(commandError)} The exact command can be retried safely.`);
    } finally {
      setPendingAction(null);
    }
  }

  async function updateControl(form: HTMLFormElement): Promise<void> {
    if (!activeControl) return;
    const values = new FormData(form);
    const selectedStatus = String(values.get('status') ?? 'in_progress') as ControlEditableStatus;
    if (selectedStatus === 'not_applicable') {
      await executeCommand(
        'updateTenantControl',
        'control.update',
        {
          controlId: activeControl.id,
          status: 'not_applicable',
          statusRationale: String(values.get('statusRationale') ?? ''),
        },
        safeControlRevision(activeControl),
        activeControl.id
      );
      return;
    }
    const payload: Record<string, unknown> = {
      controlId: activeControl.id,
      status: selectedStatus,
      implementationNotes: String(values.get('implementationNotes') ?? ''),
    };
    if (canEditAny) {
      Object.assign(payload, {
        code: String(values.get('code') ?? ''),
        title: String(values.get('title') ?? ''),
        description: String(values.get('description') ?? ''),
        domain: String(values.get('domain') ?? ''),
        frameworkIds: splitIds(values.get('frameworkIds')),
        requirementIds: splitIds(values.get('requirementIds')),
        enforcementMechanism: String(values.get('enforcementMechanism') ?? 'manual'),
        reviewFrequencyDays: Number(values.get('reviewFrequencyDays')),
        ownerId: activeControl.ownerId ?? userId,
      });
    }
    await executeCommand('updateTenantControl', 'control.update', payload, safeControlRevision(activeControl), activeControl.id);
  }

  async function submitReview(form: HTMLFormElement): Promise<void> {
    if (!activeControl) return;
    const values = new FormData(form);
    const startDate = String(values.get('testPeriodStart') ?? '');
    const endDate = String(values.get('testPeriodEnd') ?? '');
    if ((startDate && !endDate) || (!startDate && endDate)) {
      setError('Test period start and end must either both be supplied or both be omitted.');
      return;
    }
    if (startDate && endDate && startDate > endDate) {
      setError('Test period start cannot be later than test period end.');
      return;
    }
    if (selectedEvidenceIds.length === 0) {
      setError('Attach at least one currently valid, object-verified evidence item linked to this control.');
      return;
    }
    const sampleSizeRaw = String(values.get('sampleSize') ?? '').trim();
    const payload = {
      controlId: activeControl.id,
      effectiveness: String(values.get('effectiveness') ?? 'effective'),
      notes: String(values.get('notes') ?? ''),
      evidenceIds: selectedEvidenceIds,
      reviewAssigneeId: String(values.get('reviewAssigneeId') ?? ''),
      testMethod: String(values.get('testMethod') ?? ''),
      testPeriodStart: startDate ? `${startDate}T00:00:00.000Z` : null,
      testPeriodEnd: endDate ? `${endDate}T23:59:59.999Z` : null,
      sampleSize: sampleSizeRaw ? Number(sampleSizeRaw) : null,
      exceptions: String(values.get('exceptions') ?? ''),
    };
    await executeCommand('recordControlReview', 'control.review_submit', payload, safeControlRevision(activeControl), activeControl.id);
  }

  async function decideReview(form: HTMLFormElement): Promise<void> {
    if (!activeControl || !pendingReview) return;
    const values = new FormData(form);
    await executeCommand(
      'decideControlReview',
      'control.review_decide',
      {
        controlId: activeControl.id,
        reviewId: pendingReview.id,
        decision: String(values.get('decision') ?? 'approved'),
        decisionNotes: String(values.get('decisionNotes') ?? ''),
      },
      safeControlRevision(activeControl),
      `${activeControl.id}:${pendingReview.id}`
    );
  }

  async function retireControl(form: HTMLFormElement): Promise<void> {
    if (!activeControl) return;
    const values = new FormData(form);
    await executeCommand(
      'deleteTenantControl',
      'control.retire',
      { controlId: activeControl.id, retirementReason: String(values.get('retirementReason') ?? '') },
      safeControlRevision(activeControl),
      activeControl.id
    );
  }

  const isContributorOwner = userRole === 'contributor' && activeControl?.ownerId === userId;
  const activeIsRetired = Boolean(activeControl?.retiredAt) || activeControl?.workflowTrust === 'retired';
  const activeHasPendingReview = Boolean(activeControl?.pendingReviewId || pendingReview);
  const mayEditActive = Boolean(activeControl) && !activeIsRetired && !activeHasPendingReview && (canEditAny || isContributorOwner);
  const maySubmitActive = Boolean(activeControl) && !activeIsRetired && !activeHasPendingReview && canSubmitReview && (userRole !== 'contributor' || isContributorOwner);
  const assignedReviewerId = pendingReview?.assignedReviewerId ?? activeControl?.pendingReviewAssigneeId ?? null;
  const mayDecideActive = Boolean(activeControl && pendingReview) && canDecideReview && assignedReviewerId === userId;
  const mayRetireActive = Boolean(activeControl) && canRetire && !activeIsRetired && !activeHasPendingReview;

  return (
    <div>
      <UIPageHeader
        title="Unified Controls Workspace"
        description="Map obligations to accountable controls, maintain implementation state, and preserve governed assurance history. Effectiveness review remains unavailable until the verified evidence pipeline is enabled."
        primaryAction={canCreate ? { label: 'Create governed control', icon: '＋', onClick: onOpenCreateControlModal, variant: 'success' } : undefined}
      />

      {notice && <div role="status" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'var(--status-compliant-bg)', border: '1px solid var(--status-compliant-border)', color: 'var(--status-compliant-fg)', fontSize: '12px' }}>{notice}</div>}
      {error && <div role="alert" style={{ marginBottom: '16px', padding: '10px 14px', borderRadius: '8px', background: 'var(--status-critical-bg)', border: '1px solid var(--status-critical-border)', color: 'var(--status-critical-fg)', fontSize: '12px' }}>{error}</div>}

      <section className="card-modern" style={{ marginBottom: '20px' }} aria-labelledby="control-operating-model-heading">
        <div id="control-operating-model-heading" style={{ fontSize: '13px', fontWeight: 700, marginBottom: '10px' }}>Control assurance operating model</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(150px, 1fr))', gap: '10px' }}>
          {[
            ['1. Implement', 'Owner records the operating design and work performed.'],
            ['2. Attach evidence', 'Unavailable until the server-verified upload, object hashing, and independent evidence-review pipeline is enabled.'],
            ['3. Independent review', 'A separately assigned reviewer approves or rejects the exact submitted revision.'],
            ['4. Recur', 'The server derives the next due date; material changes invalidate prior assurance.'],
          ].map(([title, description]) => (
            <div key={title} style={{ padding: '10px', border: '1px solid var(--border-subtle)', borderRadius: '6px', background: 'var(--surface-subtle)' }}>
              <div style={{ fontSize: '11.5px', fontWeight: 700, color: 'var(--text-primary)' }}>{title}</div>
              <div style={{ fontSize: '10.5px', lineHeight: 1.45, color: 'var(--text-secondary)', marginTop: '3px' }}>{description}</div>
            </div>
          ))}
        </div>
      </section>

      <section className="card-modern" style={{ marginBottom: '20px' }} aria-labelledby="framework-control-templates-heading">
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', marginBottom: '10px' }}>
          <div>
            <div id="framework-control-templates-heading" style={{ fontSize: '13px', fontWeight: 700 }}>Framework scope and control templates</div>
            <div style={{ fontSize: '10.5px', color: 'var(--text-muted)', marginTop: '3px' }}>Generated templates remain unassured until their governed implementation and evidence review complete.</div>
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(230px, 1fr))', gap: '9px' }}>
          {CANONICAL_FRAMEWORKS.map((framework) => {
            const adopted = adoptedFrameworksList.find((item) => item.frameworkId === framework.id || item.id === framework.id);
            return (
              <div key={framework.id} style={{ padding: '11px', border: '1px solid var(--border-subtle)', borderRadius: '7px', background: 'var(--surface-subtle)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: '8px' }}>
                  <div style={{ fontSize: '11.5px', fontWeight: 700 }}>{framework.name}</div>
                  <UIBadge size="sm" variant={adopted ? 'compliant' : 'neutral'}>{adopted ? formatLabel(adopted.status ?? 'adopted') : 'Not adopted'}</UIBadge>
                </div>
                <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>{framework.domain}</div>
                {adopted?.scopeDescription && <div style={{ marginTop: '5px', fontSize: '10px', color: 'var(--text-secondary)' }}>{adopted.scopeDescription.slice(0, 120)}</div>}
                {canCreate && (
                  <div style={{ marginTop: '9px' }}>
                    {!adopted ? (
                      <button type="button" className="btn-secondary" style={{ width: '100%', fontSize: '10.5px', padding: '5px 8px' }} onClick={() => onOpenAdoptFrameworkModal(framework)}>
                        Adopt and scope
                      </button>
                    ) : (
                      <button type="button" className="btn-secondary" style={{ width: '100%', fontSize: '10.5px', padding: '5px 8px' }} disabled={loadingAction === `instantiate_${framework.id}`} onClick={() => void onInstantiateFramework(framework.id, framework.name)}>
                        {loadingAction === `instantiate_${framework.id}` ? 'Generating templates…' : 'Generate control templates'}
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <section className="card-modern" style={{ padding: 0, overflow: 'hidden' }} aria-labelledby="control-register-heading">
        <div style={{ padding: '15px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px', alignItems: 'center', marginBottom: '10px' }}>
            <div>
              <div id="control-register-heading" style={{ fontWeight: 700, fontSize: '13px' }}>Control register</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '10.5px', marginTop: '2px' }}>{filteredControls.length} of {controlsList.length} verified projections shown</div>
            </div>
            <button type="button" className="btn-secondary" style={{ fontSize: '11px', padding: '5px 10px' }} onClick={onChanged}>Refresh verified projections</button>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'minmax(210px, 2fr) repeat(5, minmax(125px, 1fr))', gap: '7px' }}>
            <input aria-label="Search controls" className="input-modern" placeholder="Search code, title, owner, mapping…" value={queryText} onChange={(event) => setQueryText(event.target.value)} />
            <select aria-label="Filter by implementation or assurance state" className="input-modern" value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="all">All states</option>
              <option value="not_started">Not started</option>
              <option value="in_progress">In progress</option>
              <option value="implemented">Implemented</option>
              <option value="partially_implemented">Partially implemented</option>
              <option value="not_applicable">Not applicable</option>
              <option value="pending_review">Pending review</option>
              <option value="expired">Expired assurance</option>
            </select>
            <select aria-label="Filter by workflow trust" className="input-modern" value={trustFilter} onChange={(event) => setTrustFilter(event.target.value)}>
              <option value="all">All trust states</option>
              <option value="authoritative">Verified chain</option>
              <option value="review_pending">Review pending</option>
              <option value="governed_unassured">Governed unassured</option>
              <option value="legacy_unverified">Legacy unverified</option>
              <option value="retired">Retired</option>
            </select>
            <select aria-label="Filter by framework" className="input-modern" value={frameworkFilter} onChange={(event) => setFrameworkFilter(event.target.value)}>
              <option value="all">All frameworks</option>
              {frameworkOptions.map((frameworkId) => <option key={frameworkId} value={frameworkId}>{frameworkId}</option>)}
            </select>
            <select aria-label="Filter by domain" className="input-modern" value={domainFilter} onChange={(event) => setDomainFilter(event.target.value)}>
              <option value="all">All domains</option>
              {domainOptions.map((domain) => <option key={domain} value={domain}>{domain}</option>)}
            </select>
            <select aria-label="Filter by owner" className="input-modern" value={ownerFilter} onChange={(event) => setOwnerFilter(event.target.value)}>
              <option value="all">All owners</option>
              <option value="mine">Owned by me</option>
            </select>
          </div>
        </div>

        {visibleControls.length === 0 ? (
          <div style={{ padding: '18px' }}>
            <UIEmptyState
              icon="🛡️"
              title={controlsList.length === 0 ? 'No controls in the verified projection' : 'No controls match these filters'}
              description={controlsList.length === 0 ? 'Adopt a framework or create a governed control to establish accountable recurring compliance work.' : 'Clear one or more filters to return to the full register.'}
              type={controlsList.length === 0 ? 'setup' : 'filter'}
              actionText={controlsList.length === 0 && canCreate ? 'Create governed control' : undefined}
              onAction={controlsList.length === 0 && canCreate ? onOpenCreateControlModal : undefined}
            />
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="table-modern">
              <thead><tr><th>Control</th><th>Accountability</th><th>Implementation</th><th>Assurance</th><th>Trust</th><th>Next review</th><th aria-label="Actions" /></tr></thead>
              <tbody>
                {visibleControls.map((control) => {
                  const implementation = getStatusVariant(control.status ?? 'unknown', 'control');
                  const assurance = assurancePresentation(control);
                  const trust = trustPresentation(control);
                  return (
                    <tr key={control.id}>
                      <td style={{ minWidth: '230px' }}><div style={{ fontSize: '11px', fontWeight: 800, color: 'var(--accent-primary)' }}>{control.code ?? control.id}</div><div style={{ fontSize: '12px', fontWeight: 650, marginTop: '2px' }}>{control.title ?? 'Untitled control'}</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{control.domain ?? 'Domain not recorded'} · revision {safeControlRevision(control)}</div></td>
                      <td style={{ minWidth: '145px' }}><div style={{ fontSize: '10.5px', fontWeight: 600 }}>{control.ownerId ?? 'No valid owner'}</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>{stringArray(control.frameworkIds).length} framework · {stringArray(control.requirementIds).length} requirement mappings</div></td>
                      <td><UIBadge variant={implementation.variant} size="sm">{implementation.label}</UIBadge></td>
                      <td><UIBadge variant={assurance.variant} size="sm">{assurance.label}</UIBadge>{control.workflowTrust === 'authoritative' && typeof control.healthScore === 'number' && <div style={{ marginTop: '3px', fontSize: '10px', color: 'var(--text-muted)' }}>Server-derived {control.healthScore}%</div>}</td>
                      <td><UIBadge variant={trust.variant} size="sm">{trust.label}</UIBadge></td>
                      <td style={{ fontSize: '10.5px', color: control.assuranceStatus === 'expired' ? 'var(--status-critical-fg)' : 'var(--text-secondary)' }}>{formatDate(control.nextReviewDate)}</td>
                      <td><button type="button" className="btn-secondary" style={{ fontSize: '10.5px', padding: '5px 9px' }} onClick={() => void openControl(control)}>Open</button></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {filteredControls.length > PAGE_SIZE && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '11px 16px', borderTop: '1px solid var(--border-subtle)', fontSize: '11px', color: 'var(--text-secondary)' }}>
            <span>Page {page} of {pageCount} · records {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, filteredControls.length)}</span>
            <div style={{ display: 'flex', gap: '6px' }}><button type="button" className="btn-secondary" disabled={page === 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button><button type="button" className="btn-secondary" disabled={page === pageCount} onClick={() => setPage((current) => Math.min(pageCount, current + 1))}>Next</button></div>
          </div>
        )}
      </section>

      <UIModal
        isOpen={Boolean(selectedSummary)}
        onClose={() => { if (!pendingAction) { setSelectedSummary(null); setSelectedControl(null); setPendingReview(null); } }}
        title={activeControl ? `${activeControl.code ?? activeControl.id} — ${activeControl.title ?? 'Control'}` : 'Control'}
        subtitle={activeControl ? `${activeControl.domain ?? 'Unclassified'} · revision ${safeControlRevision(activeControl)}` : undefined}
        maxWidth="980px"
        footerActions={<><button type="button" className="btn-secondary" disabled={Boolean(pendingAction)} onClick={() => { setSelectedSummary(null); setSelectedControl(null); setPendingReview(null); }}>Close</button>{detailMode !== 'details' && <button type="button" className="btn-secondary" disabled={Boolean(pendingAction)} onClick={() => { setDetailMode('details'); setError(null); }}>Back to detail</button>}</>}
      >
        {detailLoading || !activeControl ? (
          <div role="status" style={{ padding: '36px', textAlign: 'center', color: 'var(--text-secondary)' }}>Verifying the current control and its workflow artifacts…</div>
        ) : (
          <div>
            {error && <div role="alert" style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '7px', background: 'var(--status-critical-bg)', border: '1px solid var(--status-critical-border)', color: 'var(--status-critical-fg)', fontSize: '12px' }}>{error}</div>}
            {notice && <div role="status" style={{ marginBottom: '14px', padding: '10px 12px', borderRadius: '7px', background: 'var(--status-compliant-bg)', border: '1px solid var(--status-compliant-border)', color: 'var(--status-compliant-fg)', fontSize: '12px' }}>{notice}</div>}

            {detailMode === 'details' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1.15fr 0.85fr', gap: '14px' }}>
                  <section style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '7px' }}>Objective and current operation</div>
                    <p style={{ fontSize: '11.5px', lineHeight: 1.55, color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}>{activeControl.description || 'No control description was recorded.'}</p>
                    <div style={{ marginTop: '10px', fontSize: '11px', color: 'var(--text-secondary)', whiteSpace: 'pre-wrap' }}><strong style={{ color: 'var(--text-primary)' }}>Implementation notes:</strong><br />{activeControl.implementationNotes || 'No implementation notes recorded.'}</div>
                  </section>
                  <section style={{ padding: '14px', border: '1px solid var(--border-subtle)', borderRadius: '8px' }}>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                      <div><div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Workflow trust</div><div style={{ marginTop: '3px' }}><UIBadge variant={trustPresentation(activeControl).variant}>{trustPresentation(activeControl).label}</UIBadge></div><div style={{ marginTop: '4px', fontSize: '10px', color: 'var(--text-muted)', lineHeight: 1.4 }}>{trustPresentation(activeControl).explanation}</div></div>
                      <div><div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>Effectiveness assurance</div><div style={{ marginTop: '3px' }}><UIBadge variant={assurancePresentation(activeControl).variant}>{assurancePresentation(activeControl).label}</UIBadge></div></div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Owner <strong>{activeControl.ownerId ?? 'missing'}</strong> · {formatLabel(activeControl.enforcementMechanism)} · every {activeControl.reviewFrequencyDays ?? 90} days</div>
                      <div style={{ fontSize: '10.5px', color: 'var(--text-secondary)' }}>Last review {formatDate(activeControl.lastReviewDate)}<br />Next review {formatDate(activeControl.nextReviewDate)}</div>
                    </div>
                  </section>
                </div>

                {activeHasPendingReview && (
                  <section style={{ padding: '12px 14px', border: '1px solid var(--status-review-border)', borderRadius: '8px', background: 'var(--status-review-bg)' }}>
                    <div style={{ fontSize: '12px', fontWeight: 700 }}>Independent decision pending</div>
                    <div style={{ marginTop: '4px', fontSize: '10.5px', color: 'var(--text-secondary)' }}>Review {pendingReview?.id ?? activeControl.pendingReviewId} was submitted by {pendingReview?.submittedBy ?? activeControl.pendingReviewSubmittedBy ?? 'unknown'} on {formatDate(pendingReview?.submittedAt ?? activeControl.pendingReviewSubmittedAt)} and is assigned to {assignedReviewerId ?? 'an unresolved reviewer'}.</div>
                    {pendingReview && <div style={{ marginTop: '8px', fontSize: '10.5px', color: 'var(--text-secondary)' }}><strong>Claim:</strong> {formatLabel(pendingReview.effectiveness)} · <strong>Method:</strong> {pendingReview.testMethod || 'not projected'} · <strong>Evidence:</strong> {stringArray(pendingReview.evidenceIds).length}</div>}
                  </section>
                )}

                {activeControl.assuranceInvalidatedAt && (
                  <div style={{ padding: '10px 12px', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: '7px', color: 'var(--status-warning-fg)', fontSize: '11px' }}>Prior assurance was invalidated by a material change from {activeControl.assuranceInvalidatedBy ?? 'an authorized actor'} on {formatDate(activeControl.assuranceInvalidatedAt)}.</div>
                )}

                <section>
                  <div style={{ fontSize: '12px', fontWeight: 700, marginBottom: '7px' }}>Mappings and accountability</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '10px', fontSize: '10.5px' }}>
                    <div style={{ padding: '10px', border: '1px solid var(--border-subtle)', borderRadius: '7px' }}><strong>Frameworks</strong><div style={{ marginTop: '5px', color: 'var(--text-secondary)' }}>{stringArray(activeControl.frameworkIds).join(', ') || 'No mappings'}</div></div>
                    <div style={{ padding: '10px', border: '1px solid var(--border-subtle)', borderRadius: '7px' }}><strong>Requirements</strong><div style={{ marginTop: '5px', color: 'var(--text-secondary)' }}>{stringArray(activeControl.requirementIds).join(', ') || 'No specific requirements'}</div></div>
                  </div>
                </section>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
                  {mayEditActive && <button type="button" className="btn-primary" onClick={() => { setDetailMode('edit'); setError(null); }}>Update implementation</button>}
                  {maySubmitActive && <button type="button" className="btn-success" disabled={linkedEligibleEvidence.length === 0} title={linkedEligibleEvidence.length === 0 ? 'Requires the verified evidence pipeline.' : undefined} onClick={() => { setDetailMode('submit_review'); setError(null); setSelectedEvidenceIds([]); }}>Submit effectiveness test</button>}
                  {mayDecideActive && <button type="button" className="btn-success" onClick={() => { setDetailMode('decide_review'); setError(null); }}>Decide assigned review</button>}
                  {mayRetireActive && <button type="button" className="btn-danger" onClick={() => { setDetailMode('retire'); setError(null); }}>Retire control</button>}
                  {activeHasPendingReview && !mayDecideActive && <span style={{ alignSelf: 'center', fontSize: '10.5px', color: 'var(--text-muted)' }}>Only the assigned independent reviewer may decide this submission.</span>}
                </div>

                <section style={{ borderTop: '1px solid var(--border-subtle)', paddingTop: '14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', alignItems: 'center', marginBottom: '8px' }}><div><div style={{ fontSize: '12px', fontWeight: 700 }}>Verified control history</div><div style={{ fontSize: '10px', color: 'var(--text-muted)', marginTop: '2px' }}>Each verified revision joins its state hash, command receipt, audit event, and any independently anchored review snapshot.</div></div></div>
                  {!canViewHistory ? (
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Detailed audit history is restricted to assurance, approval, and audit roles.</div>
                  ) : historyLoading && history.length === 0 ? (
                    <div role="status" style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>Loading verified history…</div>
                  ) : historyError && history.length === 0 ? (
                    <div role="alert" style={{ fontSize: '10.5px', color: 'var(--status-critical-fg)' }}>{historyError}</div>
                  ) : history.length === 0 ? (
                    <div style={{ fontSize: '10.5px', color: 'var(--text-muted)' }}>No independently verifiable history entries were returned.</div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '7px' }}>
                      {history.map((item, index) => (
                        <div key={`${item.versionId ?? item.id ?? 'history'}:${item.revision ?? index}`} style={{ padding: '9px 10px', border: '1px solid var(--border-subtle)', borderRadius: '6px', display: 'grid', gridTemplateColumns: '90px 1fr auto', gap: '10px', alignItems: 'start' }}>
                          <div><div style={{ fontSize: '10.5px', fontWeight: 700 }}>Revision {item.revision ?? 'event'}</div><div style={{ fontSize: '9.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{item.integrityStatus ?? item.kind ?? item.status ?? 'projected'}</div></div>
                          <div style={{ fontSize: '10px', color: 'var(--text-secondary)' }}><strong>{item.command?.commandName ?? item.audit?.action ?? item.kind ?? 'recorded event'}</strong><br />{stringArray(item.changedFields).join(', ') || item.audit?.workflowContext || formatLabel(item.review?.effectiveness ?? item.effectiveness)}{item.review && <><br />Review: {formatLabel(item.review.status)} · {item.review.integrityStatus === 'verified' ? 'artifact verified' : 'artifact invalid'}</>}</div>
                          <div style={{ textAlign: 'right', fontSize: '9.5px', color: 'var(--text-muted)' }}>{formatDate(item.recordedAt ?? item.review?.reviewedAt ?? item.review?.submittedAt ?? item.reviewedAt ?? item.submittedAt ?? item.audit?.timestamp)}<br />{item.recordedBy ?? item.review?.reviewerId ?? item.review?.submittedBy ?? item.audit?.actorId ?? ''}</div>
                        </div>
                      ))}
                      {historyError && <div role="alert" style={{ fontSize: '10px', color: 'var(--status-critical-fg)' }}>{historyError}</div>}
                      {historyTruncated && historyCursorRevision !== null && <button type="button" className="btn-secondary" disabled={historyLoading} onClick={() => void loadHistory(activeControl.id, historyCursorRevision)}>{historyLoading ? 'Verifying more history…' : 'Load older history'}</button>}
                    </div>
                  )}
                </section>
              </div>
            )}

            {detailMode === 'edit' && (
              <form onSubmit={(event) => { event.preventDefault(); void updateControl(event.currentTarget); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '9px 11px', background: 'var(--status-warning-bg)', border: '1px solid var(--status-warning-border)', borderRadius: '7px', color: 'var(--status-warning-fg)', fontSize: '10.5px' }}>A material update invalidates current effectiveness assurance and requires a new independent review. Browser callers cannot set implemented state or a health score.</div>
                {canEditAny && <><div style={{ display: 'grid', gridTemplateColumns: '0.5fr 1.5fr', gap: '10px' }}><label style={{ fontSize: '11px', fontWeight: 700 }}>Code<input name="code" defaultValue={activeControl.code} required maxLength={40} className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Title<input name="title" defaultValue={activeControl.title} required minLength={3} maxLength={200} className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label></div><label style={{ fontSize: '11px', fontWeight: 700 }}>Description<textarea name="description" defaultValue={activeControl.description} required minLength={20} maxLength={10_000} rows={4} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} /></label><div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px' }}><label style={{ fontSize: '11px', fontWeight: 700 }}>Domain<input name="domain" defaultValue={activeControl.domain} required className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Enforcement<select name="enforcementMechanism" defaultValue={activeControl.enforcementMechanism ?? 'manual'} className="input-modern" style={{ width: '100%', marginTop: '4px' }}><option value="manual">Manual</option><option value="automated">Automated</option><option value="policy">Policy</option><option value="hybrid">Hybrid</option></select></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Review cadence<input name="reviewFrequencyDays" type="number" min={1} max={1095} defaultValue={activeControl.reviewFrequencyDays ?? 90} required className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label></div><label style={{ fontSize: '11px', fontWeight: 700 }}>Framework IDs<input name="frameworkIds" defaultValue={stringArray(activeControl.frameworkIds).join(', ')} required className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Requirement IDs<input name="requirementIds" defaultValue={stringArray(activeControl.requirementIds).join(', ')} className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label></>}
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Implementation state<select name="status" defaultValue={activeControl.status === 'not_started' || activeControl.status === 'not_applicable' ? activeControl.status : 'in_progress'} className="input-modern" style={{ width: '100%', marginTop: '4px' }}><option value="not_started">Not started</option><option value="in_progress">In progress</option>{canEditAny && <option value="not_applicable">Not applicable (requires rationale)</option>}</select></label>
                {canEditAny && <label style={{ fontSize: '11px', fontWeight: 700 }}>Not-applicable rationale (required only when selected)<textarea name="statusRationale" maxLength={2_000} rows={2} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Explain the approved scoping basis in at least 10 characters." /><span style={{ display: 'block', marginTop: '4px', color: 'var(--text-muted)', fontSize: '10px', fontWeight: 400 }}>A not-applicable selection commits only the scoped decision and rationale. Make mapping or implementation edits in a separate governed command.</span></label>}
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Implementation notes<textarea name="implementationNotes" defaultValue={activeControl.implementationNotes} maxLength={10_000} rows={4} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} /></label>
                <button type="submit" className="btn-primary" disabled={Boolean(pendingAction)}>{pendingAction === 'control.update' ? 'Committing update…' : 'Commit governed update'}</button>
              </form>
            )}

            {detailMode === 'submit_review' && (
              <form onSubmit={(event) => { event.preventDefault(); void submitReview(event.currentTarget); }} style={{ display: 'flex', flexDirection: 'column', gap: '13px' }}>
                <div style={{ padding: '9px 11px', background: 'var(--surface-subtle)', border: '1px solid var(--border-subtle)', borderRadius: '7px', fontSize: '10.5px', color: 'var(--text-secondary)' }}>You are submitting a claimed conclusion and the exact control revision for independent review. Approval is not automatic; the assigned reviewer cannot be the owner, creator, submitter, or an implementation contributor.</div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}><label style={{ fontSize: '11px', fontWeight: 700 }}>Claimed effectiveness<select name="effectiveness" defaultValue="effective" className="input-modern" style={{ width: '100%', marginTop: '4px' }}><option value="effective">Effective</option><option value="needs_improvement">Needs improvement</option><option value="ineffective">Ineffective</option></select></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Independent reviewer<select name="reviewAssigneeId" required defaultValue="" className="input-modern" style={{ width: '100%', marginTop: '4px' }}><option value="" disabled>Select eligible reviewer</option>{independentReviewers.map((reviewer) => <option key={reviewer.userId} value={reviewer.userId}>{reviewer.displayName || reviewer.userId} · {formatLabel(reviewer.role)}</option>)}</select></label></div>
                {independentReviewers.length === 0 && <div role="alert" style={{ fontSize: '10.5px', color: 'var(--status-warning-fg)' }}>No independently eligible reviewer was returned. Add or assign an eligible manager/approver who did not implement this control.</div>}
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Test method<textarea name="testMethod" required minLength={10} maxLength={2_000} rows={3} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Explain the procedure, population, criteria, and how exceptions were identified." /></label>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 0.7fr', gap: '10px' }}><label style={{ fontSize: '11px', fontWeight: 700 }}>Test period start<input name="testPeriodStart" type="date" className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Test period end<input name="testPeriodEnd" type="date" className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label><label style={{ fontSize: '11px', fontWeight: 700 }}>Sample size<input name="sampleSize" type="number" min={1} max={100_000} step={1} className="input-modern" style={{ width: '100%', marginTop: '4px' }} /></label></div>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Exceptions (optional)<textarea name="exceptions" maxLength={5_000} rows={2} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Record exceptions and their impact; do not hide unfavorable results." /></label>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Conclusion notes<textarea name="notes" required minLength={20} maxLength={5_000} rows={3} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Summarize the factual basis for the claimed conclusion in at least 20 characters." /></label>
                <fieldset style={{ border: '1px solid var(--border-subtle)', borderRadius: '7px', padding: '11px' }}><legend style={{ fontSize: '11px', fontWeight: 700, padding: '0 5px' }}>Eligible evidence ({linkedEligibleEvidence.length})</legend>{linkedEligibleEvidence.length === 0 ? <div style={{ fontSize: '10.5px', color: 'var(--status-warning-fg)' }}>Effectiveness submission is unavailable because the platform cannot yet create a Storage-verified, independently reviewed evidence object. This workflow will enable automatically when the verified evidence pipeline is delivered.</div> : <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '7px' }}>{linkedEligibleEvidence.map((evidence) => <label key={evidence.id} style={{ display: 'flex', gap: '8px', padding: '8px', border: '1px solid var(--border-subtle)', borderRadius: '6px', cursor: 'pointer' }}><input type="checkbox" checked={selectedEvidenceIds.includes(evidence.id)} onChange={() => setSelectedEvidenceIds((current) => current.includes(evidence.id) ? current.filter((id) => id !== evidence.id) : current.length < 10 ? [...current, evidence.id] : current)} /><span style={{ fontSize: '10.5px' }}><strong>{evidence.title ?? evidence.id}</strong><br /><span style={{ color: 'var(--text-muted)' }}>{formatLabel(evidence.category)} · version {evidence.currentVersion ?? 'unknown'} · due {formatDate(evidence.reviewDueDate)}</span></span></label>)}</div>}</fieldset>
                <button type="submit" className="btn-success" disabled={Boolean(pendingAction) || independentReviewers.length === 0 || selectedEvidenceIds.length === 0}>{pendingAction === 'control.review_submit' ? 'Submitting exact revision…' : 'Submit for independent review'}</button>
              </form>
            )}

            {detailMode === 'decide_review' && pendingReview && (
              <form onSubmit={(event) => { event.preventDefault(); void decideReview(event.currentTarget); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '11px', border: '1px solid var(--border-subtle)', borderRadius: '7px', background: 'var(--surface-subtle)', fontSize: '10.5px', color: 'var(--text-secondary)', lineHeight: 1.5 }}><strong style={{ color: 'var(--text-primary)' }}>Submitted claim:</strong> {formatLabel(pendingReview.effectiveness)}<br /><strong style={{ color: 'var(--text-primary)' }}>Test method:</strong> {pendingReview.testMethod ?? 'Not projected'}<br /><strong style={{ color: 'var(--text-primary)' }}>Conclusion:</strong> {pendingReview.notes ?? 'Not projected'}<br /><strong style={{ color: 'var(--text-primary)' }}>Evidence anchors:</strong> {stringArray(pendingReview.evidenceIds).join(', ') || 'Not projected'}</div>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Decision<select name="decision" defaultValue="approved" className="input-modern" style={{ width: '100%', marginTop: '4px' }}><option value="approved">Approve the submitted conclusion</option><option value="rejected">Reject and return to implementation</option></select></label>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Decision rationale<textarea name="decisionNotes" required minLength={20} maxLength={5_000} rows={4} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Document the evidence and testing basis for this independent decision (at least 20 characters)." /></label>
                <button type="submit" className="btn-success" disabled={Boolean(pendingAction)}>{pendingAction === 'control.review_decide' ? 'Committing independent decision…' : 'Commit independent decision'}</button>
              </form>
            )}

            {detailMode === 'retire' && (
              <form onSubmit={(event) => { event.preventDefault(); void retireControl(event.currentTarget); }} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                <div style={{ padding: '10px 12px', background: 'var(--status-critical-bg)', border: '1px solid var(--status-critical-border)', borderRadius: '7px', color: 'var(--status-critical-fg)', fontSize: '11px' }}>Retirement is a terminal governed state. The record, versions, reviews, and audit trail remain retained; the control cannot be edited or reused as current assurance.</div>
                <label style={{ fontSize: '11px', fontWeight: 700 }}>Retirement rationale<textarea name="retirementReason" required minLength={10} maxLength={2_000} rows={4} className="input-modern" style={{ width: '100%', marginTop: '4px', resize: 'vertical' }} placeholder="Explain why this control is no longer operated and identify any replacement or scope change." /></label>
                <button type="submit" className="btn-danger" disabled={Boolean(pendingAction)}>{pendingAction === 'control.retire' ? 'Retaining history and retiring…' : 'Retire control permanently'}</button>
              </form>
            )}
          </div>
        )}
      </UIModal>
    </div>
  );
}

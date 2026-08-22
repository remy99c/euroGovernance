'use client';

import React, { useState, useMemo } from 'react';
import {
  ProcessorAssessment,
  ProcessorAssessmentStatus,
  ProcessorAssessmentType,
  AssessmentRecurrenceCadence,
  AssessmentRiskTier,
  CANONICAL_ASSESSMENT_TEMPLATES,
  calculateProcessorAssessmentScore,
  evaluateProcessorAssessmentRiskFlags,
  ExportType,
} from '@eurogovernance/shared-types';
import { UIPageHeader } from './components/ui-page-header';
import { UIStatCard, UIStatGrid } from './components/ui-stat-card';
import { UIBadge, UIStatusBadge, UIRiskBadge } from './components/ui-badge';
import { UIFilterBar } from './components/ui-filter-bar';
import { UIDataTable, ColumnDefinition } from './components/ui-data-table';
import { UIEmptyState } from './components/ui-empty-state';
import {
  UIFormField,
  UIFormSection,
  UIFormStepper,
  UIFormReviewSummary,
} from './components/ui-form-wizard';

export interface ProcessorAssessmentWorkspaceProps {
  tenantId: string;
  currentUserId: string;
  currentUserRole: string;
  assessments: ProcessorAssessment[];
  onCreateAssessment?: (assessment: Partial<ProcessorAssessment>, autoSend: boolean) => Promise<{ assessmentId: string; accessToken?: string }>;
  onSendAssessment?: (assessmentId: string) => Promise<{ accessToken?: string }>;
  onReviewAssessment?: (
    assessmentId: string,
    decision: 'start_review' | 'accept' | 'reject' | 'request_revision',
    reviewNotes?: string,
    rejectionReason?: string,
    revisionRequestNotes?: string,
    questionReviews?: Record<string, { reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding'; reviewerComment?: string }>
  ) => Promise<void>;
  onRenewAssessment?: (previousAssessmentId: string, dueDate: string) => Promise<{ newAssessmentId: string; accessToken?: string }>;
  onRequestExport?: (exportType: ExportType) => Promise<void>;
  externalDispatchEnabled?: boolean;
}

export function ProcessorAssessmentWorkspace({
  tenantId,
  currentUserId,
  currentUserRole,
  assessments = [],
  onCreateAssessment,
  onSendAssessment,
  onReviewAssessment,
  onRenewAssessment,
  onRequestExport,
  externalDispatchEnabled = false,
}: ProcessorAssessmentWorkspaceProps) {
  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [wizardStep, setWizardStep] = useState<number>(0);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [reviewingAssessment, setReviewingAssessment] = useState<ProcessorAssessment | null>(null);
  const [activeTab, setActiveTab] = useState<'assessments' | 'templates'>('assessments');
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('templ_gdpr_art28_due_diligence');

  // Create Form State
  const [newTitle, setNewTitle] = useState<string>('');
  const [newAssessmentType, setNewAssessmentType] = useState<ProcessorAssessmentType>('pre_contract_due_diligence');
  const [newVendorName, setNewVendorName] = useState<string>('');
  const [newRespondentName, setNewRespondentName] = useState<string>('');
  const [newRespondentEmail, setNewRespondentEmail] = useState<string>('');
  const [newRespondentTitle, setNewRespondentTitle] = useState<string>('');
  const [newDueDate, setNewDueDate] = useState<string>(
    new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [newIsRecurring, setNewIsRecurring] = useState<boolean>(false);
  const [newCadence, setNewCadence] = useState<AssessmentRecurrenceCadence>('annual');
  const [isSubmittingCreate, setIsSubmittingCreate] = useState<boolean>(false);

  // Review Drawer State
  const [reviewDecision, setReviewDecision] = useState<'accept' | 'reject' | 'request_revision'>('accept');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [revisionNotes, setRevisionNotes] = useState<string>('');
  const [questionReviews, setQuestionReviews] = useState<
    Record<string, { reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding'; reviewerComment?: string }>
  >({});
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // Renew Modal State
  const [renewingAssessment, setRenewingAssessment] = useState<ProcessorAssessment | null>(null);
  const [renewDueDate, setRenewDueDate] = useState<string>(
    new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
  );
  const [isSubmittingRenew, setIsSubmittingRenew] = useState<boolean>(false);

  // Filtered List
  const filteredAssessments = useMemo(() => {
    return assessments.filter((a) => {
      if (filterType !== 'all' && a.assessmentType !== filterType) return false;
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      if (filterRisk !== 'all' && a.overallRiskRating !== filterRisk) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = a.title.toLowerCase().includes(q);
        const matchesVendor = a.vendorName.toLowerCase().includes(q);
        const matchesEmail = a.respondent?.email.toLowerCase().includes(q);
        if (!matchesTitle && !matchesVendor && !matchesEmail) return false;
      }
      return true;
    });
  }, [assessments, filterType, filterStatus, filterRisk, searchQuery]);

  // Summary Metrics
  const metrics = useMemo(() => {
    const total = assessments.length;
    const completed = assessments.filter((a) => a.status === 'accepted').length;
    const underReview = assessments.filter((a) => ['submitted', 'under_review'].includes(a.status)).length;
    const overdueOrHighRisk = assessments.filter((a) => {
      const flags = evaluateProcessorAssessmentRiskFlags(a);
      return flags.some((f) => f.severity === 'critical' || f.severity === 'high');
    }).length;

    const scores = assessments
      .map((a) => a.overallScorePercent)
      .filter((s): s is number => typeof s === 'number');
    const avgScore = scores.length > 0 ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0;

    return { total, completed, underReview, overdueOrHighRisk, avgScore };
  }, [assessments]);

  // Handle Create Submit
  const handleCreateSubmit = async (autoSend: boolean) => {
    if (!newTitle.trim() || !newVendorName.trim() || !newRespondentEmail.trim() || !newDueDate) {
      alert('Please fill out all required fields.');
      return;
    }

    if (!onCreateAssessment) return;
    setIsSubmittingCreate(true);

    try {
      const template = CANONICAL_ASSESSMENT_TEMPLATES.find((t) => t.id === selectedTemplateId) || CANONICAL_ASSESSMENT_TEMPLATES[0];
      const result = await onCreateAssessment(
        {
          title: newTitle.trim(),
          assessmentType: newAssessmentType,
          templateId: template.id,
          templateCode: template.code,
          vendorName: newVendorName.trim(),
          isRecurring: newIsRecurring,
          recurrenceCadence: newIsRecurring ? newCadence : 'none',
          dueDate: new Date(newDueDate).toISOString(),
          reviewOwnerUserId: currentUserId,
          respondent: {
            name: newRespondentName.trim() || 'Vendor Contact',
            email: newRespondentEmail.trim(),
            title: newRespondentTitle.trim(),
            companyName: newVendorName.trim(),
          },
          sections: template.sections,
        },
        autoSend
      );

      setIsCreateModalOpen(false);
      resetCreateForm();
      if (result.accessToken) {
        alert(`Assessment created and link ready! Access token: ${result.accessToken}`);
      }
    } catch (err: any) {
      alert(`Error creating assessment: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingCreate(false);
    }
  };

  const resetCreateForm = () => {
    setNewTitle('');
    setNewVendorName('');
    setNewRespondentName('');
    setNewRespondentEmail('');
    setNewRespondentTitle('');
    setNewDueDate(new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
    setNewIsRecurring(false);
    setNewCadence('annual');
  };

  // Handle Review Start
  const handleOpenReview = (assessment: ProcessorAssessment) => {
    setReviewingAssessment(assessment);
    setReviewDecision(assessment.status === 'rejected' ? 'reject' : 'accept');
    setReviewNotes(assessment.reviewNotes || '');
    setRejectionReason(assessment.rejectionReason || '');
    setRevisionNotes(assessment.revisionRequestNotes || '');

    const initialQReviews: Record<string, { reviewerFlag?: 'ok' | 'concern' | 'gap' | 'critical_finding'; reviewerComment?: string }> = {};
    for (const s of assessment.sections || []) {
      for (const q of s.questions || []) {
        const ans = assessment.answers?.[q.id];
        if (ans) {
          initialQReviews[q.id] = {
            reviewerFlag: ans.reviewerFlag || 'ok',
            reviewerComment: ans.reviewerComment || '',
          };
        }
      }
    }
    setQuestionReviews(initialQReviews);
  };

  // Submit Review Decision
  const handleSubmitReviewDecision = async () => {
    if (!reviewingAssessment || !onReviewAssessment) return;
    setIsSubmittingReview(true);

    try {
      await onReviewAssessment(
        reviewingAssessment.id,
        reviewDecision,
        reviewNotes,
        rejectionReason,
        revisionNotes,
        questionReviews
      );
      setReviewingAssessment(null);
    } catch (err: any) {
      alert(`Error submitting review: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // Handle Renewal
  const handleRenewSubmit = async () => {
    if (!renewingAssessment || !onRenewAssessment) return;
    setIsSubmittingRenew(true);

    try {
      const result = await onRenewAssessment(renewingAssessment.id, new Date(renewDueDate).toISOString());
      setRenewingAssessment(null);
      if (result.accessToken) {
        alert(`Assessment renewed! New assessment ID: ${result.newAssessmentId}. Access token: ${result.accessToken}`);
      }
    } catch (err: any) {
      alert(`Error renewing assessment: ${err?.message || 'Unknown error'}`);
    } finally {
      setIsSubmittingRenew(false);
    }
  };

  return (
    <div style={{ color: 'var(--text-primary)' }}>
      {/* 1. Standardized Page Header */}
      <UIPageHeader
        title="Processor Assessment Questionnaires"
        description="Statutory Article 28 pre-contractual due diligence, periodic recurring assurance reviews, and external vendor risk evaluations."
        primaryAction={{
          label: '+ New Assessment',
          icon: '📋',
          onClick: () => setIsCreateModalOpen(true),
          variant: 'primary',
        }}
        secondaryActions={[
          {
            label: 'Export Assessment Report',
            icon: '📊',
            onClick: () => onRequestExport && onRequestExport('processor_assessment_report'),
            variant: 'secondary',
          },
          {
            label: 'Due Diligence Matrix',
            icon: '📑',
            onClick: () => onRequestExport && onRequestExport('processor_assessment_summary_matrix'),
            variant: 'secondary',
          },
        ]}
      />

      {/* 2. Standardized KPI Metric Grid */}
      <UIStatGrid columns={5}>
        <UIStatCard
          label="Total Assessments"
          value={metrics.total}
          subtext="Draft and historical assessment records"
          valueColor="var(--accent-primary)"
        />
        <UIStatCard
          label="Completed & Accepted"
          value={metrics.completed}
          subtext="Reviewer acceptance recorded"
          valueColor="var(--status-compliant-fg)"
          progressPercentage={metrics.total > 0 ? (metrics.completed / metrics.total) * 100 : 0}
        />
        <UIStatCard
          label="Under Review"
          value={metrics.underReview}
          subtext="Awaiting reviewer determination"
          valueColor="var(--status-warning-fg)"
        />
        <UIStatCard
          label="High Risk / Overdue"
          value={metrics.overdueOrHighRisk}
          subtext="Expiring or critical findings"
          valueColor={metrics.overdueOrHighRisk > 0 ? 'var(--status-critical-fg)' : 'var(--text-muted)'}
          zeroStateText="Zero overdue assessments"
        />
        <UIStatCard
          label="Avg Compliance Score"
          value={`${metrics.avgScore}%`}
          subtext="Weighted vendor adherence"
          valueColor="var(--text-primary)"
          progressPercentage={metrics.avgScore}
        />
      </UIStatGrid>

      {/* 3. Standardized Filter Toolbar with Tabs */}
      <UIFilterBar
        tabs={[
          { id: 'assessments', label: 'Active Questionnaires', count: assessments.length },
          { id: 'templates', label: 'Master Questionnaire Templates', count: CANONICAL_ASSESSMENT_TEMPLATES.length },
        ]}
        activeTab={activeTab}
        onTabChange={(tabId) => setActiveTab(tabId as 'assessments' | 'templates')}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        searchPlaceholder="Search by vendor, title, or respondent email..."
        filters={[
          {
            id: 'filter_type',
            label: 'Type',
            value: filterType,
            options: [
              { label: 'All Types', value: 'all' },
              { label: 'Pre-Contract Due Diligence', value: 'pre_contract_due_diligence' },
              { label: 'Periodic Assurance Review', value: 'periodic_assurance_review' },
              { label: 'Security & TOMs Deep Dive', value: 'security_posture_deep_dive' },
              { label: 'AI Supplier Governance', value: 'ai_supplier_governance' },
              { label: 'Schrems II Transfer Diligence', value: 'cross_border_transfer_diligence' },
            ],
            onChange: setFilterType,
          },
          {
            id: 'filter_status',
            label: 'Status',
            value: filterStatus,
            options: [
              { label: 'All Statuses', value: 'all' },
              { label: 'Draft', value: 'draft' },
              { label: 'Sent', value: 'sent' },
              { label: 'In Progress', value: 'in_progress' },
              { label: 'Submitted', value: 'submitted' },
              { label: 'Under Review', value: 'under_review' },
              { label: 'Revision Requested', value: 'revision_requested' },
              { label: 'Accepted', value: 'accepted' },
              { label: 'Rejected', value: 'rejected' },
              { label: 'Superseded', value: 'superseded' },
            ],
            onChange: setFilterStatus,
          },
          {
            id: 'filter_risk',
            label: 'Risk Tier',
            value: filterRisk,
            options: [
              { label: 'All Risk Tiers', value: 'all' },
              { label: 'Low Risk', value: 'low' },
              { label: 'Medium Risk', value: 'medium' },
              { label: 'High Risk', value: 'high' },
              { label: 'Critical Risk', value: 'critical' },
            ],
            onChange: setFilterRisk,
          },
        ]}
        hasActiveFilters={filterType !== 'all' || filterStatus !== 'all' || filterRisk !== 'all' || searchQuery.trim() !== ''}
        onResetFilters={() => {
          setFilterType('all');
          setFilterStatus('all');
          setFilterRisk('all');
          setSearchQuery('');
        }}
      />

      {activeTab === 'assessments' && (
        <UIDataTable
          columns={[
            { key: 'title', header: 'Vendor & Assessment Title', width: '26%' },
            { key: 'type', header: 'Type & Cadence', width: '18%' },
            { key: 'respondent', header: 'Respondent Contact', width: '16%' },
            { key: 'status', header: 'Status', width: '12%' },
            { key: 'score', header: 'Score & Risk', width: '12%' },
            { key: 'dueDate', header: 'Due Date', width: '16%' },
          ]}
          isEmpty={filteredAssessments.length === 0}
          emptyState={
            assessments.length === 0 ? (
              <UIEmptyState
                icon="📋"
                title="No Processor Assessments Logged"
                description="Article 28 due diligence questionnaires allow you to evaluate third-party security posture, Schrems II transfer mechanisms, and sub-processor TOMs."
                type="setup"
                actionText="+ Create First Assessment"
                onAction={() => setIsCreateModalOpen(true)}
                hints={[
                  { label: 'Select a canonical template', sublabel: 'GDPR Art. 28, ISO 27001 Annex A, or Schrems II TIA' },
                  { label: 'Prepare the questionnaire', sublabel: 'External dispatch remains unavailable until the hardened portal migration is complete' },
                  { label: 'Review answers and findings', sublabel: 'Record an attributed reviewer decision' },
                ]}
              />
            ) : (
              <UIEmptyState
                icon="🔍"
                title="No Matching Questionnaires"
                description="No assessments match the active filters or search criteria."
                type="filter"
                actionText="Reset All Filters"
                onAction={() => {
                  setFilterType('all');
                  setFilterStatus('all');
                  setFilterRisk('all');
                  setSearchQuery('');
                }}
              />
            )
          }
        >
          {filteredAssessments.map((a) => {
            const score = calculateProcessorAssessmentScore(a);
            const riskFlags = evaluateProcessorAssessmentRiskFlags(a);
            const isOverdue = new Date(a.dueDate).getTime() < Date.now() && ['sent', 'in_progress'].includes(a.status);

            const getStatusVariant = (st: string) => {
              if (st === 'accepted') return 'compliant';
              if (st === 'rejected') return 'critical';
              if (st === 'submitted' || st === 'under_review') return 'review';
              if (st === 'revision_requested') return 'warning';
              return 'neutral';
            };

            return (
              <tr key={a.id}>
                <td>
                  <div style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{a.title}</div>
                  <div style={{ fontSize: '11.5px', color: 'var(--text-muted)', marginTop: '2px' }}>{a.vendorName}</div>
                </td>
                <td>
                  <div style={{ fontSize: '12px', color: 'var(--text-primary)' }}>
                    {a.assessmentType.replace(/_/g, ' ')}
                  </div>
                  {a.isRecurring && (
                    <span
                      style={{
                        fontSize: '10.5px',
                        backgroundColor: 'var(--accent-primary-subtle)',
                        color: 'var(--accent-primary)',
                        padding: '1px 6px',
                        borderRadius: '4px',
                        display: 'inline-block',
                        marginTop: '3px',
                        fontWeight: 600,
                      }}
                    >
                      🔄 {a.recurrenceCadence}
                    </span>
                  )}
                </td>
                <td>
                  <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>{a.respondent?.name || 'Unassigned'}</div>
                  <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{a.respondent?.email || 'N/A'}</div>
                </td>
                <td>
                  <UIStatusBadge status={a.status} domain="review" />
                </td>
                <td>
                  <div className="font-tabular" style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '3px' }}>
                    {a.overallScorePercent !== null && a.overallScorePercent !== undefined
                      ? `${a.overallScorePercent}%`
                      : `${score.overallScore}%`}
                  </div>
                  {a.overallRiskRating && (
                    <UIRiskBadge level={a.overallRiskRating} size="sm" />
                  )}
                  {riskFlags.length > 0 && (
                    <div style={{ fontSize: '10px', color: 'var(--status-critical-fg)', marginTop: '2px' }}>
                      ⚠️ {riskFlags.length} open gap(s)
                    </div>
                  )}
                </td>
                <td>
                  <div className="font-tabular" style={{ color: isOverdue ? 'var(--status-critical-fg)' : 'var(--text-secondary)', fontWeight: isOverdue ? 700 : 400 }}>
                    {a.dueDate ? a.dueDate.slice(0, 10) : 'N/A'}
                  </div>
                  {isOverdue && (
                    <span style={{ fontSize: '10px', fontWeight: 700, color: 'var(--status-critical-fg)' }}>
                      Overdue
                    </span>
                  )}
                  <div style={{ display: 'flex', gap: '4px', marginTop: '6px', flexWrap: 'wrap' }}>
                    {a.status === 'draft' && onSendAssessment && (
                      <button
                        onClick={() => externalDispatchEnabled && onSendAssessment(a.id)}
                        className="btn-secondary"
                        disabled={!externalDispatchEnabled}
                        title={externalDispatchEnabled ? 'Issue an external access link' : 'External dispatch is unavailable during the secure portal migration'}
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        Dispatch unavailable
                      </button>
                    )}
                    <button
                      disabled
                      title="No external access link has been issued for this legacy assessment record"
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      No link issued
                    </button>
                    <button
                      onClick={() => handleOpenReview(a)}
                      className="btn-secondary"
                      style={{ padding: '3px 8px', fontSize: '11px' }}
                    >
                      🔍 Review
                    </button>
                    {externalDispatchEnabled && a.isRecurring && a.status === 'accepted' && (
                      <button
                        onClick={() => {
                          setRenewingAssessment(a);
                          setRenewDueDate(
                            a.nextDueDate ? a.nextDueDate.slice(0, 10) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                          );
                        }}
                        className="btn-success"
                        style={{ padding: '3px 8px', fontSize: '11px' }}
                      >
                        🔄 Renew
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </UIDataTable>
      )}

      {activeTab === 'templates' && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '20px' }}>
          {CANONICAL_ASSESSMENT_TEMPLATES.map((tmpl) => (
            <div
              key={tmpl.id}
              style={{
                backgroundColor: '#ffffff',
                border: '1px solid #e2e8f0',
                borderRadius: '8px',
                padding: '20px',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                <h3 style={{ fontSize: '16px', fontWeight: 600, margin: 0, color: '#0f172a' }}>{tmpl.name}</h3>
                <span style={{ fontSize: '11px', backgroundColor: '#e2e8f0', color: '#334155', padding: '2px 6px', borderRadius: '4px' }}>
                  v{tmpl.version}
                </span>
              </div>
              <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>{tmpl.description}</p>
              <div style={{ fontSize: '12px', color: '#475569', marginBottom: '12px' }}>
                <strong>Sections:</strong> {tmpl.sections.length} | <strong>Total Questions:</strong>{' '}
                {tmpl.sections.reduce((acc, s) => acc + s.questions.length, 0)} | <strong>Threshold:</strong>{' '}
                {tmpl.passingScoreThreshold}%
              </div>
              <button
                onClick={() => {
                  setSelectedTemplateId(tmpl.id);
                  setNewAssessmentType(tmpl.assessmentType);
                  setNewTitle(tmpl.name);
                  setIsCreateModalOpen(true);
                }}
                style={{
                  padding: '6px 12px',
                  fontSize: '12px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                Use This Template →
              </button>
            </div>
          ))}
        </div>
      )}

      {/* CREATE ASSESSMENT GUIDED WIZARD MODAL */}
      {isCreateModalOpen && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.75)',
            backdropFilter: 'blur(4px)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: '20px',
          }}
        >
          <div
            className="card-modern"
            style={{
              width: '680px',
              maxWidth: '100%',
              backgroundColor: 'var(--surface-l2-card)',
              border: '1px solid var(--border-default)',
              boxShadow: 'var(--shadow-lg)',
              borderRadius: 'var(--radius-xl)',
              overflow: 'hidden',
              display: 'flex',
              flexDirection: 'column',
              maxHeight: '90vh',
            }}
          >
            {/* Wizard Header */}
            <div
              style={{
                padding: '16px 20px',
                borderBottom: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                <h2 className="text-section-title" style={{ margin: 0, color: 'var(--text-primary)' }}>
                  Create Due Diligence Assessment
                </h2>
                <p className="text-caption" style={{ margin: '2px 0 0 0', color: 'var(--text-muted)' }}>
                  GDPR Article 28 & Third-Party Technical & Organizational Measures (TOMs)
                </p>
              </div>
              <button
                onClick={() => {
                  setIsCreateModalOpen(false);
                  setWizardStep(0);
                  setFormErrors({});
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  fontSize: '18px',
                  color: 'var(--text-muted)',
                  cursor: 'pointer',
                }}
              >
                ✕
              </button>
            </div>

            {/* Stepper Bar */}
            <UIFormStepper
              steps={[
                { id: 'step_scope', title: 'Scope & Template', subtitle: 'Framework mapping' },
                { id: 'step_recipient', title: 'Recipient & Cadence', subtitle: 'Access parameters' },
                { id: 'step_review', title: 'Review & Dispatch', subtitle: 'Verify parameters' },
              ]}
              currentStepIndex={wizardStep}
              onStepClick={(idx) => setWizardStep(idx)}
            />

            {/* Step Body (Scrollable) */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '0 20px 16px 20px' }}>
              {/* STEP 0: SCOPE & TEMPLATE */}
              {wizardStep === 0 && (
                <div>
                  <UIFormField
                    label="Assessment Title"
                    required
                    hint="Include vendor name and purpose"
                    error={formErrors.title}
                  >
                    <input
                      type="text"
                      value={newTitle}
                      onChange={(e) => {
                        setNewTitle(e.target.value);
                        if (formErrors.title) setFormErrors({ ...formErrors, title: '' });
                      }}
                      placeholder="e.g. CloudCore Infrastructure Pre-Contract Due Diligence"
                      className="input-modern"
                      style={{ width: '100%' }}
                    />
                  </UIFormField>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <UIFormField label="Vendor / Processor Legal Name" required error={formErrors.vendorName}>
                      <input
                        type="text"
                        value={newVendorName}
                        onChange={(e) => {
                          setNewVendorName(e.target.value);
                          if (formErrors.vendorName) setFormErrors({ ...formErrors, vendorName: '' });
                        }}
                        placeholder="e.g. CloudCore Infrastructure SE"
                        className="input-modern"
                        style={{ width: '100%' }}
                      />
                    </UIFormField>

                    <UIFormField label="Assessment Type" required>
                      <select
                        value={newAssessmentType}
                        onChange={(e) => setNewAssessmentType(e.target.value as ProcessorAssessmentType)}
                        className="input-modern"
                        style={{ width: '100%' }}
                      >
                        <option value="pre_contract_due_diligence">One-Time Pre-Contract Due Diligence</option>
                        <option value="periodic_assurance_review">Recurring Periodic Review</option>
                        <option value="security_posture_deep_dive">Security & TOMs Deep Dive</option>
                        <option value="ai_supplier_governance">AI Supplier Governance</option>
                        <option value="cross_border_transfer_diligence">Schrems II Transfer Diligence</option>
                      </select>
                    </UIFormField>
                  </div>

                  <UIFormField
                    label="Canonical Questionnaire Template"
                    hint="Questions will be cloned and version-locked upon creation"
                  >
                    <select
                      value={selectedTemplateId}
                      onChange={(e) => setSelectedTemplateId(e.target.value)}
                      className="input-modern"
                      style={{ width: '100%' }}
                    >
                      {CANONICAL_ASSESSMENT_TEMPLATES.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name} ({t.sections.reduce((acc, s) => acc + s.questions.length, 0)} questions)
                        </option>
                      ))}
                    </select>
                  </UIFormField>
                </div>
              )}

              {/* STEP 1: RECIPIENT & CADENCE */}
              {wizardStep === 1 && (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <UIFormField label="Respondent Contact Name" hint="Primary POC">
                      <input
                        type="text"
                        value={newRespondentName}
                        onChange={(e) => setNewRespondentName(e.target.value)}
                        placeholder="e.g. Marie Curie"
                        className="input-modern"
                        style={{ width: '100%' }}
                      />
                    </UIFormField>

                    <UIFormField label="Respondent Business Email" required error={formErrors.email}>
                      <input
                        type="email"
                        value={newRespondentEmail}
                        onChange={(e) => {
                          setNewRespondentEmail(e.target.value);
                          if (formErrors.email) setFormErrors({ ...formErrors, email: '' });
                        }}
                        placeholder="e.g. privacy@vendor.eu"
                        className="input-modern"
                        style={{ width: '100%' }}
                      />
                    </UIFormField>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
                    <UIFormField label="Respondent Title / Department">
                      <input
                        type="text"
                        value={newRespondentTitle}
                        onChange={(e) => setNewRespondentTitle(e.target.value)}
                        placeholder="e.g. Data Protection Officer (DPO)"
                        className="input-modern"
                        style={{ width: '100%' }}
                      />
                    </UIFormField>

                    <UIFormField label="Submission Due Date" required error={formErrors.dueDate}>
                      <input
                        type="date"
                        value={newDueDate}
                        onChange={(e) => {
                          setNewDueDate(e.target.value);
                          if (formErrors.dueDate) setFormErrors({ ...formErrors, dueDate: '' });
                        }}
                        className="input-modern"
                        style={{ width: '100%' }}
                      />
                    </UIFormField>
                  </div>

                  {/* Progressive Disclosure: Recurring Cadence */}
                  <UIFormSection
                    title="Recurring Assurance Cycle"
                    description="Record the intended reassessment cadence. Automated dispatch is not enabled yet."
                  >
                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', cursor: 'pointer', color: 'var(--text-primary)' }}>
                      <input
                        type="checkbox"
                        checked={newIsRecurring}
                        onChange={(e) => setNewIsRecurring(e.target.checked)}
                      />
                      <span>Enable Scheduled Periodic Recurrence</span>
                    </label>

                    {newIsRecurring && (
                      <div style={{ marginTop: '12px', paddingLeft: '22px' }}>
                        <label style={{ display: 'block', fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '4px' }}>
                          Recurrence Interval
                        </label>
                        <select
                          value={newCadence}
                          onChange={(e) => setNewCadence(e.target.value as AssessmentRecurrenceCadence)}
                          className="input-modern"
                          style={{ width: '220px' }}
                        >
                          <option value="quarterly">Quarterly (Every 90 Days)</option>
                          <option value="semi_annual">Semi-Annual (Every 180 Days)</option>
                          <option value="annual">Annual (Every 365 Days)</option>
                          <option value="biennial">Biennial (Every 2 Years)</option>
                        </select>
                      </div>
                    )}
                  </UIFormSection>
                </div>
              )}

              {/* STEP 2: REVIEW & DISPATCH */}
              {wizardStep === 2 && (
                <div>
                  <UIFormReviewSummary
                    title="Statutory Assessment Parameters"
                    description="Verify supplier details and governance scope before creating the tokenized questionnaire link."
                    fields={[
                      { label: 'Vendor Name', value: newVendorName },
                      { label: 'Assessment Title', value: newTitle },
                      { label: 'Assessment Type', value: newAssessmentType.replace(/_/g, ' ') },
                      {
                        label: 'Cloned Template',
                        value: CANONICAL_ASSESSMENT_TEMPLATES.find((t) => t.id === selectedTemplateId)?.name || 'Custom',
                      },
                      { label: 'Recipient Email', value: newRespondentEmail },
                      { label: 'Submission Due Date', value: newDueDate },
                      {
                        label: 'Assurance Cadence',
                        value: newIsRecurring ? `Recurring (${newCadence})` : 'One-Time Submission',
                      },
                      { label: 'Reviewer Authority', value: currentUserRole.toUpperCase() },
                    ]}
                  />

                  <div
                    style={{
                      padding: '12px 14px',
                      backgroundColor: 'var(--status-compliant-bg)',
                      border: '1px solid var(--status-compliant-border)',
                      borderRadius: 'var(--radius-md)',
                      fontSize: '12px',
                      color: 'var(--text-primary)',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '10px',
                    }}
                  >
                    <span>🛡️</span>
                    <div>
                      This creates an internal draft only. External dispatch is unavailable until this workflow is migrated to the hardened supplier portal.
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Sticky Wizard Footer */}
            <div
              style={{
                padding: '14px 20px',
                backgroundColor: 'var(--surface-subtle)',
                borderTop: '1px solid var(--border-subtle)',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              <div>
                {wizardStep > 0 ? (
                  <button
                    type="button"
                    onClick={() => setWizardStep((s) => s - 1)}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    ← Back
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setIsCreateModalOpen(false);
                      setWizardStep(0);
                    }}
                    className="btn-secondary"
                    style={{ fontSize: '12px', padding: '6px 14px' }}
                  >
                    Cancel
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', gap: '8px' }}>
                {wizardStep < 2 ? (
                  <button
                    type="button"
                    onClick={() => {
                      const errors: Record<string, string> = {};
                      if (wizardStep === 0) {
                        if (!newTitle.trim()) errors.title = 'Title is required.';
                        if (!newVendorName.trim()) errors.vendorName = 'Vendor name is required.';
                      } else if (wizardStep === 1) {
                        if (!newRespondentEmail.trim()) errors.email = 'Email is required.';
                        if (!newDueDate) errors.dueDate = 'Due date is required.';
                      }

                      if (Object.keys(errors).length > 0) {
                        setFormErrors(errors);
                        return;
                      }

                      setFormErrors({});
                      setWizardStep((s) => s + 1);
                    }}
                    className="btn-primary"
                    style={{ fontSize: '12px', padding: '6px 16px' }}
                  >
                    Next: {wizardStep === 0 ? 'Recipient & Schedule →' : 'Review & Confirm →'}
                  </button>
                ) : (
                  <>
                    <button
                      type="button"
                      disabled={isSubmittingCreate}
                      onClick={() => handleCreateSubmit(false)}
                      className="btn-secondary"
                      style={{ fontSize: '12px', padding: '6px 14px' }}
                    >
                      Save as Draft
                    </button>
                    <button
                      type="button"
                      disabled
                      className="btn-secondary"
                      title="External dispatch is unavailable during the secure portal migration"
                      style={{ fontSize: '12px', padding: '6px 16px', fontWeight: 700 }}
                    >
                      Dispatch unavailable
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* REVIEW DRAWER */}
      {reviewingAssessment && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            right: 0,
            bottom: 0,
            width: '750px',
            backgroundColor: '#ffffff',
            boxShadow: '-4px 0 20px rgba(0,0,0,0.15)',
            zIndex: 1001,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Header */}
          <div style={{ padding: '20px', borderBottom: '1px solid #e2e8f0', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ fontSize: '18px', fontWeight: 600, margin: 0, color: '#0f172a' }}>Review Assessment</h2>
              <p style={{ margin: '2px 0 0 0', fontSize: '13px', color: '#64748b' }}>
                {reviewingAssessment.title} ({reviewingAssessment.vendorName})
              </p>
            </div>
            <button
              onClick={() => setReviewingAssessment(null)}
              style={{ background: 'none', border: 'none', fontSize: '18px', cursor: 'pointer', color: '#64748b' }}
            >
              ✕
            </button>
          </div>

          {/* Content */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
            {reviewingAssessment.sections?.map((section) => (
              <div key={section.id} style={{ marginBottom: '24px' }}>
                <h3 style={{ fontSize: '15px', fontWeight: 600, margin: '0 0 8px 0', color: '#1e293b', borderBottom: '1px solid #f1f5f9', paddingBottom: '4px' }}>
                  {section.title}
                </h3>
                <p style={{ fontSize: '12px', color: '#64748b', margin: '0 0 12px 0' }}>{section.description}</p>

                {section.questions.map((q) => {
                  const ans = reviewingAssessment.answers?.[q.id];
                  const qRev = questionReviews[q.id] || {};

                  return (
                    <div
                      key={q.id}
                      style={{
                        padding: '12px',
                        backgroundColor: '#f8fafc',
                        border: '1px solid #e2e8f0',
                        borderRadius: '6px',
                        marginBottom: '12px',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '6px' }}>
                        <div style={{ fontWeight: 600, fontSize: '13px', color: '#0f172a' }}>
                          <span style={{ color: '#0284c7' }}>[{q.code}]</span> {q.title}
                        </div>
                        {q.required && <span style={{ fontSize: '11px', color: '#dc2626' }}>Required</span>}
                      </div>

                      <div style={{ fontSize: '13px', color: '#334155', marginBottom: '8px', padding: '6px 10px', backgroundColor: '#ffffff', border: '1px solid #cbd5e1', borderRadius: '4px' }}>
                        <strong>Response:</strong>{' '}
                        {ans ? (
                          typeof ans.value === 'boolean'
                            ? ans.value ? 'Yes' : 'No'
                            : Array.isArray(ans.value)
                            ? ans.value.join(', ')
                            : String(ans.value || 'No response provided')
                        ) : (
                          <span style={{ color: '#94a3b8' }}>Unanswered</span>
                        )}
                      </div>

                      {/* Reviewer Tag & Flagging */}
                      <div style={{ display: 'flex', gap: '10px', alignItems: 'center', marginTop: '6px' }}>
                        <label style={{ fontSize: '12px', fontWeight: 500, color: '#475569' }}>Finding Flag:</label>
                        <select
                          value={qRev.reviewerFlag || 'ok'}
                          onChange={(e) => {
                            setQuestionReviews({
                              ...questionReviews,
                              [q.id]: {
                                ...qRev,
                                reviewerFlag: e.target.value as any,
                              },
                            });
                          }}
                          style={{ fontSize: '12px', padding: '3px 6px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                        >
                          <option value="ok">✅ OK / Compliant</option>
                          <option value="concern">⚠️ Concern</option>
                          <option value="gap">❌ Non-Compliant Gap</option>
                          <option value="critical_finding">🚨 Critical Finding</option>
                        </select>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))}

            {/* Overall Decision Section */}
            <div style={{ padding: '16px', backgroundColor: '#f1f5f9', borderRadius: '8px', marginTop: '20px' }}>
              <h4 style={{ fontSize: '14px', fontWeight: 600, margin: '0 0 10px 0', color: '#0f172a' }}>Review Decision</h4>
              <div style={{ display: 'flex', gap: '16px', marginBottom: '12px' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="accept"
                    checked={reviewDecision === 'accept'}
                    onChange={() => setReviewDecision('accept')}
                  />
                  ✅ Accept & Approve
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="request_revision"
                    checked={reviewDecision === 'request_revision'}
                    onChange={() => setReviewDecision('request_revision')}
                  />
                  🔄 Request Vendor Revisions
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '13px', cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="decision"
                    value="reject"
                    checked={reviewDecision === 'reject'}
                    onChange={() => setReviewDecision('reject')}
                  />
                  ❌ Reject Assessment
                </label>
              </div>

              {reviewDecision === 'reject' && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#dc2626', marginBottom: '4px' }}>
                    Rejection Rationale *
                  </label>
                  <textarea
                    value={rejectionReason}
                    onChange={(e) => setRejectionReason(e.target.value)}
                    placeholder="Specify critical deficiencies leading to rejection..."
                    rows={3}
                    style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #f87171', borderRadius: '4px' }}
                  />
                </div>
              )}

              {reviewDecision === 'request_revision' && (
                <div style={{ marginBottom: '10px' }}>
                  <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#c2410c', marginBottom: '4px' }}>
                    Revision Instructions for Vendor *
                  </label>
                  <textarea
                    value={revisionNotes}
                    onChange={(e) => setRevisionNotes(e.target.value)}
                    placeholder="Provide detailed instructions on what needs clarification..."
                    rows={3}
                    style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #fdba74', borderRadius: '4px' }}
                  />
                </div>
              )}

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 500, color: '#475569', marginBottom: '4px' }}>
                  Internal Review Notes
                </label>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional internal verification notes..."
                  rows={2}
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
            </div>
          </div>

          {/* Footer */}
          <div style={{ padding: '16px 20px', borderTop: '1px solid #e2e8f0', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            <button
              onClick={() => setReviewingAssessment(null)}
              style={{
                padding: '8px 14px',
                fontSize: '13px',
                backgroundColor: '#ffffff',
                border: '1px solid #cbd5e1',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
            <button
              disabled={isSubmittingReview}
              onClick={handleSubmitReviewDecision}
              style={{
                padding: '8px 18px',
                fontSize: '13px',
                fontWeight: 600,
                backgroundColor: reviewDecision === 'reject' ? '#dc2626' : reviewDecision === 'request_revision' ? '#ea580c' : '#16a34a',
                color: '#ffffff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
              }}
            >
              {isSubmittingReview ? 'Submitting...' : 'Confirm Decision'}
            </button>
          </div>
        </div>
      )}

      {/* RENEW MODAL */}
      {renewingAssessment && (
        <div
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
          }}
        >
          <div style={{ backgroundColor: '#ffffff', borderRadius: '8px', padding: '24px', width: '480px' }}>
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 12px 0', color: '#0f172a' }}>
              Renew Periodic Assessment Cycle
            </h2>
            <p style={{ fontSize: '13px', color: '#64748b', marginBottom: '16px' }}>
              Renew recurring assessment for <strong>{renewingAssessment.vendorName}</strong>. A fresh questionnaire will be issued while preserving the completed audit version as superseded.
            </p>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                New Renewal Due Date *
              </label>
              <input
                type="date"
                value={renewDueDate}
                onChange={(e) => setRenewDueDate(e.target.value)}
                style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setRenewingAssessment(null)}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  backgroundColor: '#ffffff',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isSubmittingRenew}
                onClick={handleRenewSubmit}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#16a34a',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {isSubmittingRenew ? 'Renewing...' : 'Dispatch Renewal Cycle'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

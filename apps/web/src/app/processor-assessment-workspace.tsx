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
import { UIBadge } from './components/ui-badge';

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
}: ProcessorAssessmentWorkspaceProps) {
  // Filters
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [filterRisk, setFilterRisk] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [isCreateModalOpen, setIsCreateModalOpen] = useState<boolean>(false);
  const [reviewingAssessment, setReviewingAssessment] = useState<ProcessorAssessment | null>(null);
  const [copiedTokenAssessmentId, setCopiedTokenAssessmentId] = useState<string | null>(null);
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

  // Copy Magic Link Helper
  const handleCopyLink = (assessmentId: string) => {
    const link = `${window.location.origin}/portal/assessments/${assessmentId}?tenantId=${tenantId}`;
    navigator.clipboard.writeText(link);
    setCopiedTokenAssessmentId(assessmentId);
    setTimeout(() => setCopiedTokenAssessmentId(null), 3000);
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
          subtext="Questionnaires dispatched & logged"
          valueColor="var(--accent-primary)"
        />
        <UIStatCard
          label="Completed & Accepted"
          value={metrics.completed}
          subtext="Art. 28 assurance verified"
          valueColor="var(--status-compliant-fg)"
          progressPercentage={metrics.total > 0 ? (metrics.completed / metrics.total) * 100 : 100}
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

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', borderBottom: '1px solid #e2e8f0', marginBottom: '20px' }}>
        <button
          onClick={() => setActiveTab('assessments')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: activeTab === 'assessments' ? 600 : 500,
            color: activeTab === 'assessments' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'assessments' ? '2px solid #0284c7' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Active Questionnaires ({assessments.length})
        </button>
        <button
          onClick={() => setActiveTab('templates')}
          style={{
            padding: '10px 16px',
            fontSize: '14px',
            fontWeight: activeTab === 'templates' ? 600 : 500,
            color: activeTab === 'templates' ? '#0284c7' : '#64748b',
            borderBottom: activeTab === 'templates' ? '2px solid #0284c7' : 'none',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
          }}
        >
          Master Questionnaire Templates ({CANONICAL_ASSESSMENT_TEMPLATES.length})
        </button>
      </div>

      {activeTab === 'assessments' && (
        <>
          {/* Filter Bar */}
          <div style={{ display: 'flex', gap: '12px', marginBottom: '20px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              type="text"
              placeholder="Search vendor, title, or email..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              style={{
                padding: '8px 12px',
                fontSize: '13px',
                border: '1px solid #cbd5e1',
                borderRadius: '6px',
                minWidth: '260px',
              }}
            />

            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            >
              <option value="all">All Assessment Types</option>
              <option value="pre_contract_due_diligence">One-Time Pre-Contract Due Diligence</option>
              <option value="periodic_assurance_review">Recurring Periodic Assurance Review</option>
              <option value="security_posture_deep_dive">Security & TOMs Deep Dive</option>
              <option value="ai_supplier_governance">AI Supplier Governance</option>
              <option value="cross_border_transfer_diligence">Schrems II Transfer Diligence</option>
            </select>

            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            >
              <option value="all">All Statuses</option>
              <option value="draft">Draft</option>
              <option value="sent">Sent (Awaiting Response)</option>
              <option value="in_progress">In Progress</option>
              <option value="submitted">Submitted (Ready for Review)</option>
              <option value="under_review">Under Review</option>
              <option value="revision_requested">Revision Requested</option>
              <option value="accepted">Accepted / Approved</option>
              <option value="rejected">Rejected</option>
              <option value="superseded">Superseded</option>
            </select>

            <select
              value={filterRisk}
              onChange={(e) => setFilterRisk(e.target.value)}
              style={{ padding: '8px 12px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '6px' }}
            >
              <option value="all">All Risk Tiers</option>
              <option value="low">Low Risk</option>
              <option value="medium">Medium Risk</option>
              <option value="high">High Risk</option>
              <option value="critical">Critical Risk</option>
            </select>
          </div>

          {/* Assessment Table */}
          <div style={{ backgroundColor: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '8px', overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '13px', textAlign: 'left' }}>
              <thead>
                <tr style={{ backgroundColor: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#475569' }}>
                  <th style={{ padding: '12px 16px' }}>Vendor & Assessment Title</th>
                  <th style={{ padding: '12px 16px' }}>Type & Cadence</th>
                  <th style={{ padding: '12px 16px' }}>Respondent Contact</th>
                  <th style={{ padding: '12px 16px' }}>Status</th>
                  <th style={{ padding: '12px 16px' }}>Score & Risk</th>
                  <th style={{ padding: '12px 16px' }}>Due Date</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredAssessments.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '32px', textAlign: 'center', color: '#94a3b8' }}>
                      No assessments found matching the selected criteria.
                    </td>
                  </tr>
                ) : (
                  filteredAssessments.map((a) => {
                    const score = calculateProcessorAssessmentScore(a);
                    const riskFlags = evaluateProcessorAssessmentRiskFlags(a);
                    const isOverdue = new Date(a.dueDate).getTime() < Date.now() && ['sent', 'in_progress'].includes(a.status);

                    return (
                      <tr key={a.id} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600, color: '#1e293b' }}>{a.title}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{a.vendorName}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontSize: '12px', color: '#334155' }}>
                            {a.assessmentType.replace(/_/g, ' ')}
                          </div>
                          {a.isRecurring && (
                            <span style={{ fontSize: '11px', backgroundColor: '#e0f2fe', color: '#0369a1', padding: '2px 6px', borderRadius: '4px', display: 'inline-block', marginTop: '2px' }}>
                              🔄 {a.recurrenceCadence}
                            </span>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ color: '#1e293b' }}>{a.respondent?.name}</div>
                          <div style={{ fontSize: '12px', color: '#64748b' }}>{a.respondent?.email}</div>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <span
                            style={{
                              display: 'inline-block',
                              padding: '3px 8px',
                              borderRadius: '12px',
                              fontSize: '11px',
                              fontWeight: 600,
                              textTransform: 'capitalize',
                              backgroundColor:
                                a.status === 'accepted' ? '#dcfce7' :
                                a.status === 'rejected' ? '#fee2e2' :
                                a.status === 'submitted' ? '#fef3c7' :
                                a.status === 'revision_requested' ? '#ffedd5' : '#f1f5f9',
                              color:
                                a.status === 'accepted' ? '#15803d' :
                                a.status === 'rejected' ? '#b91c1c' :
                                a.status === 'submitted' ? '#b45309' :
                                a.status === 'revision_requested' ? '#c2410c' : '#475569',
                            }}
                          >
                            {a.status.replace(/_/g, ' ')}
                          </span>
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ fontWeight: 600 }}>
                            {a.overallScorePercent !== null && a.overallScorePercent !== undefined
                              ? `${a.overallScorePercent}%`
                              : `${score.overallScore}%`}
                          </div>
                          {a.overallRiskRating && (
                            <span
                              style={{
                                fontSize: '11px',
                                fontWeight: 600,
                                textTransform: 'uppercase',
                                color:
                                  a.overallRiskRating === 'critical' ? '#b91c1c' :
                                  a.overallRiskRating === 'high' ? '#c2410c' :
                                  a.overallRiskRating === 'medium' ? '#b45309' : '#15803d',
                              }}
                            >
                              {a.overallRiskRating} Risk
                            </span>
                          )}
                          {riskFlags.length > 0 && (
                            <div style={{ fontSize: '11px', color: '#ef4444' }}>
                              ⚠️ {riskFlags.length} open gap(s)
                            </div>
                          )}
                        </td>
                        <td style={{ padding: '12px 16px' }}>
                          <div style={{ color: isOverdue ? '#dc2626' : '#334155', fontWeight: isOverdue ? 600 : 400 }}>
                            {a.dueDate ? a.dueDate.slice(0, 10) : 'N/A'}
                          </div>
                          {isOverdue && <span style={{ fontSize: '11px', color: '#dc2626' }}>Overdue</span>}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <div style={{ display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                            {a.status === 'draft' && onSendAssessment && (
                              <button
                                onClick={() => onSendAssessment(a.id)}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  backgroundColor: '#0284c7',
                                  color: '#ffffff',
                                  border: 'none',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                Send Link
                              </button>
                            )}
                            <button
                              onClick={() => handleCopyLink(a.id)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#f1f5f9',
                                color: '#334155',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                cursor: 'pointer',
                              }}
                            >
                              {copiedTokenAssessmentId === a.id ? 'Copied!' : '🔗 Copy Link'}
                            </button>
                            <button
                              onClick={() => handleOpenReview(a)}
                              style={{
                                padding: '4px 8px',
                                fontSize: '12px',
                                backgroundColor: '#f8fafc',
                                color: '#0f172a',
                                border: '1px solid #cbd5e1',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontWeight: 500,
                              }}
                            >
                              🔍 Review
                            </button>
                            {a.isRecurring && a.status === 'accepted' && (
                              <button
                                onClick={() => {
                                  setRenewingAssessment(a);
                                  setRenewDueDate(
                                    a.nextDueDate ? a.nextDueDate.slice(0, 10) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                                  );
                                }}
                                style={{
                                  padding: '4px 8px',
                                  fontSize: '12px',
                                  backgroundColor: '#f0fdf4',
                                  color: '#16a34a',
                                  border: '1px solid #bbf7d0',
                                  borderRadius: '4px',
                                  cursor: 'pointer',
                                }}
                              >
                                🔄 Renew
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </>
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

      {/* CREATE MODAL */}
      {isCreateModalOpen && (
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
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '8px',
              padding: '24px',
              width: '600px',
              maxHeight: '90vh',
              overflowY: 'auto',
            }}
          >
            <h2 style={{ fontSize: '18px', fontWeight: 600, margin: '0 0 16px 0', color: '#0f172a' }}>
              Create Processor Assessment
            </h2>

            <div style={{ marginBottom: '14px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                Assessment Title *
              </label>
              <input
                type="text"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                placeholder="e.g. CloudCore Infrastructure Pre-Contract Due Diligence"
                style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
              />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Assessment Type *
                </label>
                <select
                  value={newAssessmentType}
                  onChange={(e) => setNewAssessmentType(e.target.value as ProcessorAssessmentType)}
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  <option value="pre_contract_due_diligence">One-Time Pre-Contract Due Diligence</option>
                  <option value="periodic_assurance_review">Recurring Periodic Review</option>
                  <option value="security_posture_deep_dive">Security & TOMs Deep Dive</option>
                  <option value="ai_supplier_governance">AI Supplier Governance</option>
                  <option value="cross_border_transfer_diligence">Schrems II Transfer Diligence</option>
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Vendor / Supplier Name *
                </label>
                <input
                  type="text"
                  value={newVendorName}
                  onChange={(e) => setNewVendorName(e.target.value)}
                  placeholder="e.g. CloudCore Infrastructure SE"
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Respondent Contact Name *
                </label>
                <input
                  type="text"
                  value={newRespondentName}
                  onChange={(e) => setNewRespondentName(e.target.value)}
                  placeholder="e.g. John Doe"
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Respondent Email *
                </label>
                <input
                  type="email"
                  value={newRespondentEmail}
                  onChange={(e) => setNewRespondentEmail(e.target.value)}
                  placeholder="e.g. privacy@cloudcore.example.eu"
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Submission Due Date *
                </label>
                <input
                  type="date"
                  value={newDueDate}
                  onChange={(e) => setNewDueDate(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 500, marginBottom: '4px', color: '#334155' }}>
                  Template Library
                </label>
                <select
                  value={selectedTemplateId}
                  onChange={(e) => setSelectedTemplateId(e.target.value)}
                  style={{ width: '100%', padding: '8px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                >
                  {CANONICAL_ASSESSMENT_TEMPLATES.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div style={{ marginBottom: '20px', padding: '12px', backgroundColor: '#f8fafc', borderRadius: '6px', border: '1px solid #e2e8f0' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', fontWeight: 500, cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={newIsRecurring}
                  onChange={(e) => setNewIsRecurring(e.target.checked)}
                />
                Enable Recurring Assurance Cycle (Periodic Assessment)
              </label>
              {newIsRecurring && (
                <div style={{ marginTop: '8px' }}>
                  <label style={{ display: 'block', fontSize: '12px', color: '#64748b', marginBottom: '4px' }}>Recurrence Cadence</label>
                  <select
                    value={newCadence}
                    onChange={(e) => setNewCadence(e.target.value as AssessmentRecurrenceCadence)}
                    style={{ padding: '6px 10px', fontSize: '13px', border: '1px solid #cbd5e1', borderRadius: '4px' }}
                  >
                    <option value="quarterly">Quarterly (90 Days)</option>
                    <option value="semi_annual">Semi-Annual (180 Days)</option>
                    <option value="annual">Annual (365 Days)</option>
                    <option value="biennial">Biennial (2 Years)</option>
                  </select>
                </div>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
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
                disabled={isSubmittingCreate}
                onClick={() => handleCreateSubmit(false)}
                style={{
                  padding: '8px 14px',
                  fontSize: '13px',
                  backgroundColor: '#f1f5f9',
                  color: '#334155',
                  border: '1px solid #cbd5e1',
                  borderRadius: '4px',
                  cursor: 'pointer',
                }}
              >
                Save as Draft
              </button>
              <button
                type="button"
                disabled={isSubmittingCreate}
                onClick={() => handleCreateSubmit(true)}
                style={{
                  padding: '8px 16px',
                  fontSize: '13px',
                  backgroundColor: '#0284c7',
                  color: '#ffffff',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {isSubmittingCreate ? 'Creating...' : 'Create & Send Link'}
              </button>
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

'use client';

import React from 'react';
import { UIPageHeader } from '../components/ui-page-header';
import { UIBadge } from '../components/ui-badge';
import { UIEmptyState } from '../components/ui-empty-state';
import { UIDashboardSection, UIDashboardSplit } from '../components/ui-dashboard-section';
import {
  UIExecutivePostureHero,
  UIEvidenceExpiryForecast,
  UIRegulatoryLiabilities,
  RegulatoryLiabilityItem,
} from '../components/ui-executive-posture';
import { formatTime } from '../../lib/formatters';
import {
  calculateEvidenceReviewSchedule,
  getRecordedComplianceScore,
} from '../../lib/product-truth';

export interface OverviewTabViewProps {
  userRole: string;
  metrics: any;
  controlsList: any[];
  evidenceList: any[];
  issuesList: any[];
  aiSystemsList: any[];
  auditLogs: any[];
  onNavigateToTab: (tab: string) => void;
  onRecalculateMetrics: () => Promise<void>;
  loadingAction?: string | null;
}

export function OverviewTabView({
  userRole,
  metrics,
  controlsList,
  evidenceList,
  issuesList,
  aiSystemsList,
  auditLogs,
  onNavigateToTab,
  onRecalculateMetrics,
  loadingAction,
}: OverviewTabViewProps) {
  const isAuditor = userRole === 'auditor';
  const canMaterializeMetrics = [
    'tenant_admin',
    'compliance_manager',
    'security_manager',
    'privacy_manager',
    'ai_governance_manager',
  ].includes(userRole);
  const recordedScore = getRecordedComplianceScore(metrics);
  const evidenceReviewSchedule = calculateEvidenceReviewSchedule(evidenceList);

  // Compute regulatory liabilities
  const liabilities: RegulatoryLiabilityItem[] = [];
  const pendingEvidence = evidenceList.filter((e) => e.status === 'in_review' || e.status === 'under_review');
  if (pendingEvidence.length > 0) {
    liabilities.push({
      id: 'liability_evidence',
      framework: 'ISO 27001 / SOC 2',
      title: `${pendingEvidence.length} Evidence Artifact(s) Pending Review`,
      severity: 'high',
      actionLabel: 'Review Evidence',
      onAction: () => onNavigateToTab('evidence'),
    });
  }

  const openIssues = issuesList.filter((i) => i.status === 'open');
  if (openIssues.length > 0) {
    liabilities.push({
      id: 'liability_gaps',
      framework: 'Statutory Gaps',
      title: `${openIssues.length} Unresolved Compliance Finding(s) Requiring Corrective Action`,
      severity: 'critical',
      actionLabel: 'Remediate Gaps',
      onAction: () => onNavigateToTab('risks_tasks'),
    });
  }

  const highRiskAI = aiSystemsList.filter((a) => a.riskTier === 'high_risk');
  if (highRiskAI.length > 0) {
    liabilities.push({
      id: 'liability_ai',
      framework: 'EU AI Act (Annex III)',
      title: `${highRiskAI.length} High-Risk AI System(s) Subject to Fundamental Rights Impact Assessment`,
      severity: 'high',
      actionLabel: 'Audit AI Systems',
      onAction: () => onNavigateToTab('ai_systems'),
    });
  }

  return (
    <div>
      {/* Dynamic Role Header */}
      <UIPageHeader
        title={
          isAuditor
            ? 'Auditor Assurance & Readiness Workspace'
            : userRole === 'tenant_admin'
            ? 'Enterprise Administration & Health Posture'
            : userRole === 'compliance_manager' || userRole === 'security_manager'
            ? 'Continuous Compliance & Governance Operations'
            : userRole === 'privacy_manager'
            ? 'Data Protection & Privacy Governance Hub'
            : userRole === 'ai_governance_manager'
            ? 'EU AI Act Compliance & Model Governance Hub'
            : userRole === 'contributor'
            ? 'Compliance Action Inbox & Assigned Tasks'
            : 'Compliance & Governance Overview'
        }
        description={
          isAuditor
            ? 'Inspect recorded controls, evidence review states, scoping decisions, and available export jobs.'
            : userRole === 'tenant_admin'
            ? 'Manage organization identity, review approval workflows, monitor memberships, and inspect recorded activity.'
            : userRole === 'compliance_manager' || userRole === 'security_manager'
            ? 'Track recorded framework status, review evidence, dispatch supplier questionnaires, and inspect risks.'
            : userRole === 'privacy_manager'
            ? 'Maintain GDPR Article 30 ROPA activities, evaluate Schrems II international transfers, and verify Article 28 DPA execution.'
            : userRole === 'ai_governance_manager'
            ? 'Classify AI model risk tiers (Annex III), enforce prohibited practice guardrails, and compile Annex IV technical documentation.'
            : userRole === 'contributor'
            ? 'Review the compliance records and work currently available to your account.'
            : 'Review recorded compliance metrics and their underlying registers.'
        }
        badge={
          <UIBadge variant={isAuditor ? 'review' : 'compliant'}>
            {isAuditor ? 'Read-Only Assurance Mode' : `${userRole?.replace('_', ' ')} Mode`}
          </UIBadge>
        }
        primaryAction={
          !canMaterializeMetrics
            ? undefined
            : {
                label: 'Recalculate Posture Score',
                icon: '🔄',
                onClick: onRecalculateMetrics,
                loading: loadingAction === 'metrics',
                variant: 'primary',
              }
        }
        secondaryActions={
          isAuditor
            ? [
                {
                  label: 'Inspect Scoping Rationale',
                  icon: '🔍',
                  onClick: () => onNavigateToTab('applicability_review'),
                  variant: 'secondary',
                },
              ]
            : [
                {
                  label: 'Framework Wizard',
                  icon: '🚀',
                  onClick: () => onNavigateToTab('frameworks'),
                  variant: 'secondary',
                },
              ]
        }
      />

      {/* 1. Decisive Executive Compliance Posture Hero */}
      <UIExecutivePostureHero
        score={recordedScore}
        implementedControlsCount={controlsList.filter((c) => c.status === 'implemented').length}
        totalControlsCount={controlsList.length}
        approvedEvidenceCount={evidenceList.filter((e) => e.status === 'approved' || e.status === 'valid').length}
        openGapsCount={issuesList.filter((i) => i.status === 'open').length}
      />

      {/* 2. Regulatory Liabilities & Enforcement Risks Matrix */}
      <UIRegulatoryLiabilities liabilities={liabilities} />

      {/* 3. Evidence & Assurance Expiry Forecast */}
      <div style={{ marginBottom: '24px' }}>
        <UIEvidenceExpiryForecast
          overdueCount={evidenceReviewSchedule.overdueCount}
          dueIn30DaysCount={evidenceReviewSchedule.dueIn30DaysCount}
          dueIn90DaysCount={evidenceReviewSchedule.dueIn90DaysCount}
          scheduledAfter90DaysCount={evidenceReviewSchedule.scheduledAfter90DaysCount}
          noReviewDateCount={evidenceReviewSchedule.noReviewDateCount}
          onViewExpiring={() => onNavigateToTab('evidence')}
        />
      </div>

      {/* 4. Split Analysis: Critical Workflows & Live Audit Trail */}
      <UIDashboardSplit
        ratio="2:1"
        primary={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <UIDashboardSection
              title="Recent Evidence Records"
              subtitle="Repository records and their recorded review status."
            >
              <div className="card-modern" style={{ padding: '14px' }}>
                {evidenceList.length === 0 ? (
                  <UIEmptyState
                    icon="📁"
                    title="No Evidence Recorded"
                    description="No evidence records exist for this tenant yet."
                    compact
                  />
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                    {evidenceList.slice(0, 5).map((ev) => (
                      <div
                        key={ev.id}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '10px 12px',
                          borderRadius: '8px',
                          backgroundColor: 'var(--surface-subtle)',
                          border: '1px solid var(--border-subtle)',
                          fontSize: '12.5px',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                          <span style={{ fontSize: '16px' }}>📄</span>
                          <div>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{ev.title || ev.id}</div>
                            <div style={{ fontSize: '10px', color: 'var(--text-muted)' }}>
                              {ev.category || 'Uncategorized'} • Declared hash (not server-verified): {ev.fileHashSha256 ? `${ev.fileHashSha256.slice(0, 14)}...` : 'Not recorded'}
                            </div>
                          </div>
                        </div>
                        <UIBadge variant={ev.status === 'approved' || ev.status === 'valid' ? 'compliant' : ev.status ? 'warning' : 'neutral'}>
                          {(ev.status || 'unknown').toUpperCase()}
                        </UIBadge>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </UIDashboardSection>
          </div>
        }
        secondary={
          <UIDashboardSection
            title="Live Audit Trail"
            subtitle="Append-only compliance ledger."
          >
            <div className="card-modern" style={{ padding: '14px' }}>
              {auditLogs.length === 0 ? (
                <UIEmptyState
                  icon="📜"
                  title="Audit Ledger Awaiting Events"
                  description="Audit events emitted by supported server workflows will appear here."
                  type="audit"
                  compact
                />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '420px', overflowY: 'auto' }}>
                  {auditLogs.slice(0, 8).map((log) => (
                    <div
                      key={log.id}
                      style={{
                        padding: '8px 10px',
                        backgroundColor: 'var(--surface-subtle)',
                        borderRadius: '6px',
                        fontSize: '11.5px',
                        border: '1px solid var(--border-subtle)',
                      }}
                    >
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2px' }}>
                        <span style={{ fontWeight: 700, color: 'var(--accent-primary)', fontSize: '10.5px' }}>
                          [{log.action?.toUpperCase()}]
                        </span>
                        <span className="font-tabular" style={{ color: 'var(--text-muted)', fontSize: '10px' }}>
                          {formatTime(log.timestamp)}
                        </span>
                      </div>
                      <div style={{ color: 'var(--text-primary)', fontWeight: 500 }}>
                        {log.entityType} ({log.entityId?.slice(0, 14)}...)
                      </div>
                      <div style={{ color: 'var(--text-muted)', fontSize: '10.5px' }}>
                        Actor: {log.actorEmail || log.actorId}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </UIDashboardSection>
        }
      />
    </div>
  );
}

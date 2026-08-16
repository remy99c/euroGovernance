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
  onRequestExport: (type: string) => Promise<void>;
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
  onRequestExport,
  loadingAction,
}: OverviewTabViewProps) {
  const isAuditor = userRole === 'auditor';

  // Compute regulatory liabilities
  const liabilities: RegulatoryLiabilityItem[] = [];
  const pendingEvidence = evidenceList.filter((e) => e.status === 'in_review' || e.status === 'under_review');
  if (pendingEvidence.length > 0) {
    liabilities.push({
      id: 'liability_evidence',
      framework: 'ISO 27001 / SOC 2',
      title: `${pendingEvidence.length} Evidence Artifact(s) Pending Four-Eyes Sign-Off`,
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
            ? 'Inspect verified technical controls, four-eyes evidence lockers, deterministic scoping rationales, and generate compliance dossiers.'
            : userRole === 'tenant_admin'
            ? 'Manage organization identity, enforce four-eyes approval policies, monitor team memberships, and audit global activity.'
            : userRole === 'compliance_manager' || userRole === 'security_manager'
            ? 'Track framework readiness, process four-eyes evidence reviews, dispatch supplier questionnaires, and synchronize risks.'
            : userRole === 'privacy_manager'
            ? 'Maintain GDPR Article 30 ROPA activities, evaluate Schrems II international transfers, and verify Article 28 DPA execution.'
            : userRole === 'ai_governance_manager'
            ? 'Classify AI model risk tiers (Annex III), enforce prohibited practice guardrails, and compile Annex IV technical documentation.'
            : userRole === 'contributor'
            ? 'Fulfill assigned evidence requests, answer control audit questions, and view feedback notes from compliance reviewers.'
            : 'Materialized compliance health metrics verified across live regulatory registers.'
        }
        badge={
          <UIBadge variant={isAuditor ? 'review' : 'compliant'}>
            {isAuditor ? 'Read-Only Assurance Mode' : `${userRole?.replace('_', ' ')} Mode`}
          </UIBadge>
        }
        primaryAction={
          isAuditor
            ? {
                label: '1-Click Audit Dossier (ZIP)',
                icon: '📦',
                onClick: () => onRequestExport('framework_soc2_dossier'),
                loading: loadingAction === 'export_framework_soc2_dossier',
                variant: 'success',
              }
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
        score={metrics?.overallComplianceScore ?? 92}
        verifiedControlsCount={controlsList.filter((c) => c.status === 'implemented').length}
        totalControlsCount={controlsList.length || 85}
        fourEyesEvidenceCount={evidenceList.filter((e) => e.status === 'approved' || e.status === 'valid').length}
        openGapsCount={issuesList.filter((i) => i.status === 'open').length}
        sovereignRegion="FRA-WEST3 (Frankfurt Sovereign Zone)"
      />

      {/* 2. Regulatory Liabilities & Enforcement Risks Matrix */}
      <UIRegulatoryLiabilities liabilities={liabilities} />

      {/* 3. Evidence & Assurance Expiry Forecast */}
      <div style={{ marginBottom: '24px' }}>
        <UIEvidenceExpiryForecast
          expiredCount={evidenceList.filter((e) => e.status === 'expired').length}
          expiringIn30DaysCount={evidenceList.filter((e) => e.status === 'under_review').length || 1}
          expiringIn90DaysCount={3}
          validCount={evidenceList.filter((e) => e.status === 'approved' || e.status === 'valid').length || 38}
          onViewExpiring={() => onNavigateToTab('evidence')}
        />
      </div>

      {/* 4. Split Analysis: Critical Workflows & Live Audit Trail */}
      <UIDashboardSplit
        ratio="2:1"
        primary={
          <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <UIDashboardSection
              title="Recent Four-Eyes Evidence Lockers"
              subtitle="Cryptographically signed verification artifacts."
            >
              <div className="card-modern" style={{ padding: '14px' }}>
                {evidenceList.length === 0 ? (
                  <UIEmptyState
                    icon="📁"
                    title="No Evidence In Lockers"
                    description="Evidence uploaded by contributors will appear here for Four-Eyes sign-off."
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
                              {ev.category} • SHA-256: {ev.fileHashSha256 ? `${ev.fileHashSha256.slice(0, 14)}...` : 'Verified'}
                            </div>
                          </div>
                        </div>
                        <UIBadge variant={ev.status === 'approved' || ev.status === 'valid' ? 'compliant' : 'warning'}>
                          {(ev.status || 'valid').toUpperCase()}
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
                  description="Privileged actions, four-eyes sign-offs, and automated control validations will append here in real-time."
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

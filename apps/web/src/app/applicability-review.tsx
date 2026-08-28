'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { functions } from '../lib/firebase';
import { httpsCallable } from 'firebase/functions';

export interface DecisionItem {
  id: string;
  requirementId: string;
  frameworkId: string;
  sectionCode: string;
  requirementTitle: string;
  isApplicable: boolean;
  status: 'applicable' | 'not_applicable' | 'review_required' | 'inherited' | 'deferred';
  applicabilityType: string;
  decisionSource?: 'auto' | 'user_override' | 'reviewer_override';
  isOverridden?: boolean;
  autoResult?: {
    isApplicable: boolean;
    status: string;
    matchedRuleId: string | null;
    ruleEvaluationSummary: string | null;
    evaluatedAt: string;
  } | null;
  matchedRuleId: string | null;
  ruleEvaluationSummary: string | null;
  rationale: string;
  overrideReason?: string | null;
  overrideRationale?: string | null;
  assessedBy: string;
  assessedAt: string;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  reviewerRole?: string | null;
  history?: Array<{
    timestamp: string;
    actorId: string;
    actorRole: string;
    decisionSource: string;
    previousStatus: string;
    newStatus: string;
    previousIsApplicable: boolean;
    newIsApplicable: boolean;
    overrideRationale: string;
    reviewerId?: string | null;
    notes?: string | null;
  }>;
}

interface ScopeFactItem {
  id: string;
  factKey: string;
  category: string;
  valueBoolean?: boolean | null;
  valueString?: string | null;
  rationale?: string;
}

interface ApplicabilityReviewProps {
  tenantId: string;
  userRole?: string;
}

const COMPLIANCE_WRITE_ROLES = [
  'tenant_admin',
  'compliance_manager',
  'security_manager',
  'privacy_manager',
  'ai_governance_manager',
];

export default function ApplicabilityReviewTab({ tenantId, userRole = 'compliance_manager' }: ApplicabilityReviewProps) {
  const [decisions, setDecisions] = useState<DecisionItem[]>([]);
  const [scopeFacts, setScopeFacts] = useState<ScopeFactItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Filters
  const [selectedFramework, setSelectedFramework] = useState<string>('all');
  const [selectedOutcome, setSelectedOutcome] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals & Drawers
  const [expandedFactsDecisionId, setExpandedFactsDecisionId] = useState<string | null>(null);
  const [historyModalDecision, setHistoryModalDecision] = useState<DecisionItem | null>(null);
  const [overrideModalDecision, setOverrideModalDecision] = useState<DecisionItem | null>(null);

  // Override Form State
  const [overrideStatus, setOverrideStatus] = useState<'applicable' | 'not_applicable' | 'review_required' | 'inherited' | 'deferred'>('applicable');
  const [overrideRationale, setOverrideRationale] = useState<string>('');
  const [submittingOverride, setSubmittingOverride] = useState<boolean>(false);

  const canOverride = COMPLIANCE_WRITE_ROLES.includes(userRole);

  const showToast = (msg: string) => {
    setNotice(msg);
    setTimeout(() => setNotice(null), 5000);
  };

  // 1. Fetch Decisions & Scope Facts
  const loadData = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    setError(null);

    try {
      // Fetch Applicability Decisions
      const decFn = httpsCallable(functions, 'listTenantApplicabilityDecisions');
      const decRes: any = await decFn({ tenantId });
      const rawDecisions: DecisionItem[] = decRes.data?.decisions || [];
      setDecisions(rawDecisions);

      // Fetch Scope Facts
      const factsFn = httpsCallable(functions, 'listTenantScopeFacts');
      const factsRes: any = await factsFn({ tenantId });
      setScopeFacts(factsRes.data?.facts || []);
    } catch (err: any) {
      console.error('Failed to load applicability review data:', err);
      setError(err.message || 'Failed to load applicability decisions.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 2. Filtered & Searched Decisions
  const filteredDecisions = useMemo(() => {
    return decisions.filter((d) => {
      // Framework Filter
      if (selectedFramework !== 'all' && d.frameworkId !== selectedFramework) {
        return false;
      }
      // Outcome Filter
      if (selectedOutcome !== 'all' && d.status !== selectedOutcome) {
        return false;
      }
      // Search Query
      if (searchQuery.trim().length > 0) {
        const query = searchQuery.toLowerCase();
        const matchesCode = d.sectionCode.toLowerCase().includes(query);
        const matchesTitle = d.requirementTitle.toLowerCase().includes(query);
        const matchesRationale = (d.rationale || '').toLowerCase().includes(query);
        const matchesRule = (d.ruleEvaluationSummary || '').toLowerCase().includes(query);
        if (!matchesCode && !matchesTitle && !matchesRationale && !matchesRule) {
          return false;
        }
      }
      return true;
    });
  }, [decisions, selectedFramework, selectedOutcome, searchQuery]);

  // 3. Open Override Dialog
  const handleOpenOverride = (d: DecisionItem) => {
    if (!canOverride) {
      showToast('⚠️ Unauthorized: Only Compliance Managers and Admins can override applicability.');
      return;
    }
    setOverrideModalDecision(d);
    setOverrideStatus(d.status);
    setOverrideRationale(d.overrideRationale || '');
  };

  // 4. Submit Manual Override
  const handleSubmitOverride = async () => {
    if (!overrideModalDecision) return;
    if (!overrideRationale || overrideRationale.trim().length < 10) {
      setError('Override rationale is mandatory and must be at least 10 characters long.');
      return;
    }

    setSubmittingOverride(true);
    setError(null);

    try {
      const fn = httpsCallable(functions, 'overrideTenantApplicabilityDecision');
      const res: any = await fn({
        tenantId,
        decisionId: overrideModalDecision.id,
        newStatus: overrideStatus,
        isApplicable: overrideStatus === 'applicable' || overrideStatus === 'inherited',
        overrideRationale: overrideRationale.trim(),
        decisionSource: 'user_override',
      });

      showToast(`✅ Decision ${overrideModalDecision.sectionCode} successfully overridden to '${overrideStatus}'!`);
      setOverrideModalDecision(null);
      await loadData();
    } catch (err: any) {
      console.error('Override submission failed:', err);
      setError(`Override failed: ${err.message}`);
    } finally {
      setSubmittingOverride(false);
    }
  };

  // 5. Revert Override to Auto Baseline
  const handleRevertDecision = async (d: DecisionItem) => {
    if (!canOverride) {
      showToast('⚠️ Unauthorized: Only Compliance Managers can revert decisions.');
      return;
    }

    const reason = window.prompt(
      `Enter reason for reverting ${d.sectionCode} back to automated baseline:`,
      'Reverting manual override after scope recalibration.'
    );
    if (!reason || reason.trim().length < 5) return;

    setLoading(true);
    try {
      const fn = httpsCallable(functions, 'revertTenantApplicabilityDecision');
      await fn({
        tenantId,
        decisionId: d.id,
        reason: reason.trim(),
      });
      showToast(`✅ ${d.sectionCode} reverted back to automated rule baseline!`);
      await loadData();
    } catch (err: any) {
      console.error('Reversion failed:', err);
      setError(`Reversion failed: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  // Helper: Status Badge Styling
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case 'applicable':
        return (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(16, 185, 129, 0.2)', color: 'var(--status-success)', fontWeight: 600 }}>
            Applicable
          </span>
        );
      case 'not_applicable':
        return (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(239, 68, 68, 0.2)', color: 'var(--status-danger)', fontWeight: 600 }}>
            Not Applicable
          </span>
        );
      case 'review_required':
        return (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(245, 158, 11, 0.2)', color: 'var(--status-warning)', fontWeight: 600 }}>
            Review Required
          </span>
        );
      case 'inherited':
        return (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(59, 130, 246, 0.2)', color: 'var(--accent-blue)', fontWeight: 600 }}>
            Inherited
          </span>
        );
      case 'deferred':
        return (
          <span style={{ fontSize: '11px', padding: '3px 8px', borderRadius: '4px', backgroundColor: 'rgba(107, 114, 128, 0.2)', color: 'var(--text-muted)', fontWeight: 600 }}>
            Deferred
          </span>
        );
      default:
        return <span>{status}</span>;
    }
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '24px 16px' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <div>
          <h1 style={{ fontSize: '20px', fontWeight: 700 }}>⚖️ Applicability Decisions & Statutory Review</h1>
          <p style={{ fontSize: '13px', color: 'var(--text-secondary)', marginTop: '4px' }}>
            Review current scope records, rule summaries, and manual overrides. Results are not yet pinned to immutable rule and fact versions.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button
            onClick={loadData}
            style={{
              padding: '8px 14px',
              backgroundColor: 'var(--bg-surface)',
              border: '1px solid var(--border-color)',
              color: 'var(--text-primary)',
              borderRadius: '6px',
              fontSize: '12px',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            🔄 Refresh Decisions
          </button>
        </div>
      </div>

      {/* Toast Notice */}
      {notice && (
        <div style={{ padding: '12px 16px', backgroundColor: 'var(--status-success)', color: '#fff', borderRadius: '6px', marginBottom: '16px', fontWeight: 500, fontSize: '13px' }}>
          {notice}
        </div>
      )}

      {/* Error Alert */}
      {error && (
        <div style={{ padding: '14px 16px', backgroundColor: 'rgba(239, 68, 68, 0.15)', border: '1px solid var(--status-danger)', color: 'var(--status-danger)', borderRadius: '6px', marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{error}</span>
          <button onClick={() => setError(null)} style={{ color: 'var(--status-danger)', fontWeight: 600, fontSize: '12px' }}>
            Dismiss
          </button>
        </div>
      )}

      {/* Role Access Indicator Banner */}
      {!canOverride && (
        <div style={{ padding: '10px 14px', backgroundColor: 'rgba(245, 158, 11, 0.12)', border: '1px solid var(--status-warning)', borderRadius: '6px', marginBottom: '16px', fontSize: '12px', color: 'var(--status-warning)', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span>ℹ️ Read-Only Mode: Your active role (<code>{userRole}</code>) allows inspecting applicability rationales and scope facts, but manual overrides require Compliance Manager permissions.</span>
        </div>
      )}

      {/* Filters & Search Control Bar */}
      <div style={{ backgroundColor: 'var(--bg-surface)', borderRadius: '8px', padding: '16px', border: '1px solid var(--border-color)', marginBottom: '20px', display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', alignItems: 'center' }}>
          {/* Framework Filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
              Framework Regime
            </label>
            <select
              value={selectedFramework}
              onChange={(e) => setSelectedFramework(e.target.value)}
              style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}
            >
              <option value="all">All Frameworks</option>
              <option value="gdpr">EU GDPR (2016/679)</option>
              <option value="eu_ai_act">EU AI Act (2024/1689)</option>
              <option value="eu_data_act">EU Data Act (2023/2854)</option>
              <option value="iso_27001">ISO/IEC 27001:2022</option>
              <option value="iso_42001">ISO/IEC 42001:2023</option>
            </select>
          </div>

          {/* Outcome Filter */}
          <div>
            <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
              Applicability Outcome
            </label>
            <select
              value={selectedOutcome}
              onChange={(e) => setSelectedOutcome(e.target.value)}
              style={{ padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}
            >
              <option value="all">All Outcomes</option>
              <option value="applicable">Applicable (Mandatory)</option>
              <option value="not_applicable">Not Applicable (Excluded)</option>
              <option value="review_required">Review Required</option>
              <option value="inherited">Inherited</option>
              <option value="deferred">Deferred</option>
            </select>
          </div>
        </div>

        {/* Search Box */}
        <div style={{ flex: 1, minWidth: '240px', maxWidth: '360px' }}>
          <label style={{ fontSize: '11px', color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase', fontWeight: 600 }}>
            Search Requirements
          </label>
          <input
            type="text"
            placeholder="Search by article, code, or keyword..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px' }}
          />
        </div>
      </div>

      {/* Decision Cards List */}
      {loading ? (
        <div style={{ padding: '48px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
          <div style={{ display: 'inline-block', width: '28px', height: '28px', border: '3px solid var(--border-color)', borderTopColor: 'var(--accent-blue)', borderRadius: '50%', animation: 'spin 1s linear infinite', marginBottom: '12px' }} />
          <div style={{ fontSize: '13px', color: 'var(--text-muted)' }}>Loading applicability decisions...</div>
        </div>
      ) : decisions.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
          <div style={{ fontWeight: 700, color: 'var(--text-primary)', marginBottom: '6px' }}>No applicability decisions recorded</div>
          <div>Complete the tenant scope questionnaire and run an applicability evaluation before relying on this register.</div>
        </div>
      ) : filteredDecisions.length === 0 ? (
        <div style={{ padding: '36px', textAlign: 'center', backgroundColor: 'var(--bg-surface)', borderRadius: '8px', border: '1px solid var(--border-color)', color: 'var(--text-muted)', fontSize: '13px' }}>
          No applicability decisions match your filter criteria.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredDecisions.map((d) => {
            const isFactsExpanded = expandedFactsDecisionId === d.id;
            return (
              <div
                key={d.id}
                style={{
                  backgroundColor: 'var(--bg-surface)',
                  borderRadius: '8px',
                  border: `1px solid ${d.isOverridden ? 'var(--accent-blue)' : 'var(--border-color)'}`,
                  padding: '18px 20px',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '12px',
                }}
              >
                {/* Decision Header */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '10px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
                    <span style={{ fontSize: '11px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', fontWeight: 700, color: 'var(--accent-blue)', textTransform: 'uppercase' }}>
                      {d.frameworkId}
                    </span>
                    <span style={{ fontWeight: 700, fontSize: '14px', color: 'var(--text-primary)' }}>
                      {d.sectionCode} — {d.requirementTitle}
                    </span>
                    {renderStatusBadge(d.status)}
                    {d.isOverridden && (
                      <span style={{ fontSize: '10px', padding: '2px 6px', borderRadius: '4px', backgroundColor: 'rgba(37, 99, 235, 0.2)', color: '#60a5fa', fontWeight: 600 }}>
                        Overridden ({d.decisionSource})
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', gap: '6px' }}>
                    <button
                      onClick={() => setExpandedFactsDecisionId(isFactsExpanded ? null : d.id)}
                      style={{ padding: '5px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                    >
                      {isFactsExpanded ? 'Hide Scope Facts ▴' : 'Inspect Scope Facts ▾'}
                    </button>

                    {d.history && d.history.length > 0 && (
                      <button
                        onClick={() => setHistoryModalDecision(d)}
                        style={{ padding: '5px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '4px', fontSize: '11px', cursor: 'pointer' }}
                      >
                        History ({d.history.length}) 📜
                      </button>
                    )}

                    {d.isOverridden && canOverride && (
                      <button
                        onClick={() => handleRevertDecision(d)}
                        style={{ padding: '5px 10px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--status-warning)', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Revert to Auto ↺
                      </button>
                    )}

                    {canOverride && (
                      <button
                        onClick={() => handleOpenOverride(d)}
                        style={{ padding: '5px 10px', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '4px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}
                      >
                        Override ✎
                      </button>
                    )}
                  </div>
                </div>

                {/* Statutory Rationale & Traceability */}
                <div style={{ fontSize: '12px', color: 'var(--text-secondary)', lineHeight: 1.5, backgroundColor: 'var(--bg-primary)', padding: '12px 14px', borderRadius: '6px', border: '1px solid var(--border-color)' }}>
                  <div style={{ marginBottom: '4px' }}>
                    <strong style={{ color: 'var(--text-primary)' }}>Rule Evaluation:</strong>{' '}
                    {d.ruleEvaluationSummary || d.rationale || 'Derived via baseline scoping rules.'}
                  </div>
                  {d.matchedRuleId && (
                    <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                      Rule Key: <code>{d.matchedRuleId}</code> • Assessed By: {d.assessedBy} ({new Date(d.assessedAt).toLocaleDateString()})
                    </div>
                  )}
                  {d.isOverridden && d.autoResult && (
                    <div style={{ marginTop: '6px', paddingTop: '6px', borderTop: '1px solid var(--border-color)', color: '#60a5fa', fontSize: '11px' }}>
                      <strong>Automated Baseline Result:</strong> Status was originally <code>{d.autoResult.status}</code> (isApplicable: {String(d.autoResult.isApplicable)}).
                      {d.overrideRationale && (
                        <div style={{ marginTop: '2px', color: 'var(--text-primary)' }}>
                          <strong>Recorded Override Rationale:</strong> {d.overrideRationale}
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Inspect Related Scope Facts Drawer */}
                {isFactsExpanded && (
                  <div style={{ backgroundColor: 'var(--bg-primary)', padding: '14px', borderRadius: '6px', border: '1px dashed var(--accent-blue)', marginTop: '4px' }}>
                    <h4 style={{ fontSize: '12px', fontWeight: 600, color: 'var(--accent-blue)', marginBottom: '8px' }}>
                      🔍 All Recorded Scope Facts (not a causal trace) for {d.sectionCode}
                    </h4>
                    {scopeFacts.length === 0 ? (
                      <div style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
                        No specific tenant scope facts recorded. Default framework baseline applies.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '8px' }}>
                        {scopeFacts.map((f) => (
                          <div key={f.id} style={{ padding: '8px 10px', backgroundColor: 'var(--bg-surface)', borderRadius: '4px', fontSize: '11px', border: '1px solid var(--border-color)' }}>
                            <div style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{f.factKey}</div>
                            <div style={{ color: 'var(--status-success)', marginTop: '2px' }}>
                              Value: {f.valueBoolean !== undefined && f.valueBoolean !== null ? (f.valueBoolean ? 'TRUE (Active)' : 'FALSE (Inactive)') : f.valueString || 'N/A'}
                            </div>
                            <div style={{ color: 'var(--text-muted)', fontSize: '10px' }}>Category: {f.category}</div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* OVERRIDE MODAL DIALOG */}
      {overrideModalDecision && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '540px' }}>
            <h3 style={{ fontSize: '16px', fontWeight: 700, marginBottom: '6px' }}>
              Override Applicability Decision: {overrideModalDecision.sectionCode}
            </h3>
            <p style={{ fontSize: '12px', color: 'var(--text-secondary)', marginBottom: '16px' }}>
              {overrideModalDecision.requirementTitle}
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Target Applicability Outcome
                </label>
                <select
                  value={overrideStatus}
                  onChange={(e: any) => setOverrideStatus(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '13px' }}
                >
                  <option value="applicable">Applicable</option>
                  <option value="not_applicable">Not Applicable</option>
                  <option value="review_required">Review Required (Pending Clarification)</option>
                  <option value="inherited">Inherited (Covered by Parent / Platform)</option>
                  <option value="deferred">Deferred (Postponed Implementation)</option>
                </select>
              </div>

              <p style={{ margin: 0, fontSize: '11px', color: 'var(--text-muted)', lineHeight: 1.5 }}>
                This records a manual override by the signed-in actor. It is not an independent legal approval or reviewer sign-off.
              </p>

              <div>
                <label style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', display: 'block', marginBottom: '4px', textTransform: 'uppercase' }}>
                  Mandatory Override Rationale (Minimum 10 chars) *
                </label>
                <textarea
                  rows={3}
                  placeholder="Provide legal, technical, or compensatory control justification for this override..."
                  value={overrideRationale}
                  onChange={(e) => setOverrideRationale(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', backgroundColor: 'var(--bg-primary)', color: 'var(--text-primary)', border: '1px solid var(--border-color)', borderRadius: '6px', fontSize: '12px', resize: 'vertical' }}
                />
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button
                onClick={() => setOverrideModalDecision(null)}
                disabled={submittingOverride}
                style={{ padding: '8px 16px', backgroundColor: 'var(--bg-primary)', border: '1px solid var(--border-color)', color: 'var(--text-secondary)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button
                onClick={handleSubmitOverride}
                disabled={submittingOverride || overrideRationale.trim().length < 10}
                style={{ padding: '8px 18px', backgroundColor: 'var(--accent-blue)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}
              >
                {submittingOverride ? 'Saving...' : 'Commit Override & Audit Log'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* HISTORY MODAL DIALOG */}
      {historyModalDecision && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(0,0,0,0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: '20px' }}>
          <div style={{ backgroundColor: 'var(--bg-surface)', border: '1px solid var(--border-color)', borderRadius: '10px', padding: '24px', width: '100%', maxWidth: '600px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ fontSize: '16px', fontWeight: 700 }}>
                Audit History: {historyModalDecision.sectionCode}
              </h3>
              <button onClick={() => setHistoryModalDecision(null)} style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                ✕ Close
              </button>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', maxHeight: '380px', overflowY: 'auto' }}>
              {historyModalDecision.history?.map((h, idx) => (
                <div key={idx} style={{ padding: '10px 12px', backgroundColor: 'var(--bg-primary)', borderRadius: '6px', border: '1px solid var(--border-color)', fontSize: '11px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                    <span style={{ fontWeight: 600, color: 'var(--accent-blue)' }}>
                      Transition: {h.previousStatus} → {h.newStatus}
                    </span>
                    <span style={{ color: 'var(--text-muted)' }}>{new Date(h.timestamp).toLocaleString()}</span>
                  </div>
                  <div>
                    Actor: <code>{h.actorId}</code> ({h.actorRole}) • Source: <code>{h.decisionSource}</code>
                  </div>
                  <div style={{ color: 'var(--text-secondary)', marginTop: '4px', fontStyle: 'italic' }}>
                    Rationale: &ldquo;{h.overrideRationale}&rdquo;
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

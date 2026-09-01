import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  calculateEvidenceReviewSchedule,
  getRecordedComplianceScore,
} from '../../apps/web/src/lib/product-truth.js';

function workspaceFile(path: string): string {
  return readFileSync(resolve(process.cwd(), '../../', path), 'utf8');
}

describe('Production product-truth safeguards', () => {
  test('never converts absent or malformed posture metrics into a positive score', () => {
    const now = new Date('2026-08-31T12:00:00.000Z');
    const current = {
      tenantId: 'tenant_truth',
      lastMaterializedAt: now.toISOString(),
      validUntil: '2026-08-31T12:05:00.000Z',
      sourceFingerprint: 'a'.repeat(64),
    };
    expect(getRecordedComplianceScore(null)).toBeNull();
    expect(getRecordedComplianceScore({})).toBeNull();
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: '92' }, now)).toBeNull();
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: Number.NaN }, now)).toBeNull();
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: -1 }, now)).toBeNull();
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: 101 }, now)).toBeNull();
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: 0 }, now, 'tenant_truth')).toBe(0);
    expect(getRecordedComplianceScore({ ...current, overallComplianceScore: 92 }, now, 'tenant_truth')).toBe(92);
    expect(
      getRecordedComplianceScore(
        { ...current, overallComplianceScore: 92, validUntil: now.toISOString() },
        now
      )
    ).toBeNull();
    expect(
      getRecordedComplianceScore(
        { ...current, overallComplianceScore: 92, sourceFingerprint: 'not-a-hash' },
        now
      )
    ).toBeNull();
    expect(
      getRecordedComplianceScore(
        { ...current, overallComplianceScore: 92 },
        now,
        'tenant_other'
      )
    ).toBeNull();
    expect(
      getRecordedComplianceScore(
        {
          ...current,
          overallComplianceScore: 92,
          lastMaterializedAt: '2026-08-31T12:01:00.000Z',
          validUntil: '2026-08-31T12:06:00.000Z',
        },
        now,
        'tenant_truth'
      )
    ).toBe(92);
  });

  test('derives the evidence schedule only from recorded dates and explicit status', () => {
    const schedule = calculateEvidenceReviewSchedule(
      [
        { status: 'expired', reviewDueDate: null },
        { status: 'approved', reviewDueDate: '2026-08-21T00:00:00.000Z' },
        { status: 'valid', reviewDueDate: '2026-09-10T00:00:00.000Z' },
        { status: 'under_review', reviewDueDate: '2026-10-20T00:00:00.000Z' },
        { status: 'approved', reviewDueDate: '2026-12-01T00:00:00.000Z' },
        { status: 'valid', reviewDueDate: null },
        { status: 'valid', reviewDueDate: 'not-a-date' },
        { status: 'rejected', reviewDueDate: '2026-08-01T00:00:00.000Z' },
        { status: 'archived', reviewDueDate: null },
      ],
      new Date('2026-08-21T00:00:00.000Z')
    );

    expect(schedule).toEqual({
      overdueCount: 1,
      dueIn30DaysCount: 2,
      dueIn90DaysCount: 1,
      scheduledAfter90DaysCount: 1,
      noReviewDateCount: 2,
    });
  });

  test('dashboard and applicability views contain no production sample fallbacks', () => {
    const overview = workspaceFile('apps/web/src/app/views/overview-tab-view.tsx');
    const applicability = workspaceFile('apps/web/src/app/applicability-review.tsx');

    expect(overview).not.toContain('overallComplianceScore ?? 92');
    expect(overview).not.toContain('controlsList.length || 85');
    expect(overview).not.toContain('expiringIn90DaysCount={3}');
    expect(overview).not.toContain(" : 'Verified'");
    expect(overview).toContain('getRecordedComplianceScore(metrics, metricsClock, tenantId)');
    expect(overview).toContain('window.setTimeout');
    expect(overview).toContain('validUntil - current.getTime() + 50');
    expect(overview).not.toContain('Math.min(validUntil - current.getTime()');
    expect(applicability).not.toContain('sampleDecisions');
    expect(applicability).not.toContain('dec_gdpr_art30');
    expect(applicability).toContain('No applicability decisions recorded');
  });

  test('public portal uses confirmed server operations and cannot invent uploads or receipts', () => {
    const portal = workspaceFile('apps/web/src/app/portal/assessments/[id]/portal-client.tsx');
    const fixedPortalPage = workspaceFile('apps/web/src/app/portal/assessments/page.tsx');
    const legacyDynamicPage = resolve(
      process.cwd(),
      '../../apps/web/src/app/portal/assessments/[id]/page.tsx'
    );

    expect(portal).toContain("'validateAssessmentAccessToken'");
    expect(portal).toContain("'savePublicAssessmentDraft'");
    expect(portal).toContain("'submitPublicAssessment'");
    expect(portal).toContain('window.location.hash');
    expect(portal).toContain("window.history.replaceState(null, '', `${window.location.pathname}${window.location.search}`)");
    expect(portal).not.toContain("searchParams.get('token')");
    expect(portal).toContain('Secure file upload is unavailable');
    expect(portal).not.toContain('mockSections');
    expect(portal).not.toContain('setTimeout');
    expect(portal).not.toContain('type="file"');
    expect(portal).not.toContain('attachedFileMetadata');
    expect(portal).not.toContain('scorePercent: 95');
    expect(fixedPortalPage).toContain("referrer: 'no-referrer'");
    expect(existsSync(legacyDynamicPage)).toBe(false);
  });

  test('legacy processor assessment UI cannot dispatch, copy, or auto-renew bearer links', () => {
    const workspace = workspaceFile('apps/web/src/app/processor-assessment-workspace.tsx');
    const page = workspaceFile('apps/web/src/app/page.tsx');

    expect(workspace).toContain('externalDispatchEnabled = false');
    expect(workspace).toContain('disabled={!externalDispatchEnabled}');
    expect(workspace).toContain('Dispatch unavailable');
    expect(workspace).toContain('No link issued');
    expect(workspace).toContain('This creates an internal draft only');
    expect(workspace).toContain('Automated dispatch is not enabled yet');
    expect(workspace).not.toContain('navigator.clipboard.writeText');
    expect(workspace).not.toContain('handleCopyLink');
    expect(page).not.toContain('externalDispatchEnabled={true}');
  });

  test('custom controls use user-entered facts and do not claim implementation on creation', () => {
    const page = workspaceFile('apps/web/src/app/page.tsx');
    const modal = workspaceFile('apps/web/src/app/modals/create-control-modal.tsx');

    expect(page).toContain("action: 'control.create'");
    expect(page).toContain('payload: control');
    expect(page).toContain('expectedRevision: null');
    expect(page).not.toContain("status: 'implemented'");
    expect(page).not.toContain('healthScore: 100');
    expect(page).not.toContain("requirementIds: ['A.9.1', 'Art. 32']");
    expect(modal).toContain("const [frameworkIds, setFrameworkIds] = useState<string[]>([])");
    expect(modal).toContain('Control objective and operation');
  });
});

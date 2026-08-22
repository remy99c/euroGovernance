export interface EvidenceScheduleRecord {
  status?: string | null;
  reviewDueDate?: string | null;
}

export interface EvidenceReviewSchedule {
  overdueCount: number;
  dueIn30DaysCount: number;
  dueIn90DaysCount: number;
  scheduledAfter90DaysCount: number;
  noReviewDateCount: number;
}

/**
 * Returns a posture score only when a materialized metric contains a finite
 * percentage in the documented 0-100 range. Missing or malformed metrics are
 * deliberately represented as null rather than converted into assurance.
 */
export function getRecordedComplianceScore(metrics: unknown): number | null {
  if (!metrics || typeof metrics !== 'object') return null;

  const score = (metrics as { overallComplianceScore?: unknown }).overallComplianceScore;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    return null;
  }

  return score;
}

/**
 * Builds a review schedule solely from persisted evidence dates and statuses.
 * Records without a valid review date remain visible in an explicit bucket;
 * they are never treated as current or compliant by inference.
 */
export function calculateEvidenceReviewSchedule(
  evidenceRecords: EvidenceScheduleRecord[],
  now: Date = new Date()
): EvidenceReviewSchedule {
  const schedule: EvidenceReviewSchedule = {
    overdueCount: 0,
    dueIn30DaysCount: 0,
    dueIn90DaysCount: 0,
    scheduledAfter90DaysCount: 0,
    noReviewDateCount: 0,
  };

  const nowMillis = now.getTime();
  const dayMillis = 24 * 60 * 60 * 1000;

  for (const evidence of evidenceRecords) {
    const status = (evidence.status || '').toLowerCase();
    if (status === 'archived' || status === 'rejected') continue;

    if (status === 'expired') {
      schedule.overdueCount += 1;
      continue;
    }

    const dueMillis = evidence.reviewDueDate ? new Date(evidence.reviewDueDate).getTime() : Number.NaN;
    if (!Number.isFinite(dueMillis)) {
      schedule.noReviewDateCount += 1;
      continue;
    }

    const daysUntilDue = Math.ceil((dueMillis - nowMillis) / dayMillis);
    if (daysUntilDue < 0) schedule.overdueCount += 1;
    else if (daysUntilDue <= 30) schedule.dueIn30DaysCount += 1;
    else if (daysUntilDue <= 90) schedule.dueIn90DaysCount += 1;
    else schedule.scheduledAfter90DaysCount += 1;
  }

  return schedule;
}

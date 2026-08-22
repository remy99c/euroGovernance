/**
 * Formatter Utilities for euroGovernance Web Application
 *
 * Provides pure, deterministic formatting functions for timestamps,
 * SHA-256 cryptographic hashes, percentage metrics, and currency/counts.
 */

/**
 * Formats an ISO 8601 timestamp into a localized short date string (e.g., "16 Aug 2026").
 */
export function formatDate(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO 8601 timestamp into a localized time string (e.g., "13:45:02").
 */
export function formatTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
  } catch {
    return '—';
  }
}

/**
 * Formats an ISO 8601 timestamp into a relative human-readable string (e.g., "2 hours ago", "in 3 days").
 */
export function formatRelativeTime(isoString?: string | null): string {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    if (isNaN(d.getTime())) return '—';
    const now = Date.now();
    const diffMs = d.getTime() - now;
    const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) return 'Today';
    if (diffDays === 1) return 'Tomorrow';
    if (diffDays === -1) return 'Yesterday';
    if (diffDays > 1 && diffDays <= 30) return `in ${diffDays} days`;
    if (diffDays < -1 && diffDays >= -30) return `${Math.abs(diffDays)} days ago`;

    return formatDate(isoString);
  } catch {
    return '—';
  }
}

/**
 * Truncates a 64-character SHA-256 hex string with ellipsis for scannable UI presentation.
 * Example: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855" -> "e3b0c44298fc...b855"
 */
export function formatSha256(hash?: string | null, prefixLen = 12, suffixLen = 4): string {
  if (!hash) return 'Not calculated';
  if (hash.length <= prefixLen + suffixLen) return hash;
  return `${hash.slice(0, prefixLen)}...${hash.slice(-suffixLen)}`;
}

/**
 * Formats a ratio or decimal into a formatted percentage string.
 */
export function formatPercent(value?: number | null, decimals = 0): string {
  if (value === undefined || value === null || isNaN(value)) return '0%';
  return `${value.toFixed(decimals)}%`;
}

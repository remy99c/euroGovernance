/**
 * Unit Tests for UI Formatters & Helper Invariants
 */

import {
  formatDate,
  formatTime,
  formatRelativeTime,
  formatSha256,
  formatPercent,
} from '../../apps/web/src/lib/formatters';

describe('UI Formatters Suite', () => {
  describe('formatDate', () => {
    it('formats ISO 8601 strings into human-readable date format', () => {
      const formatted = formatDate('2026-08-16T12:00:00.000Z');
      expect(formatted).toContain('2026');
      expect(formatted).toContain('Aug');
    });

    it('returns placeholder for null or undefined values', () => {
      expect(formatDate(null)).toBe('—');
      expect(formatDate(undefined)).toBe('—');
      expect(formatDate('')).toBe('—');
      expect(formatDate('invalid-date')).toBe('—');
    });
  });

  describe('formatTime', () => {
    it('formats ISO timestamp into HH:MM:SS format', () => {
      const formatted = formatTime('2026-08-16T12:30:45.000Z');
      expect(formatted).toMatch(/\d{2}:\d{2}:\d{2}/);
    });

    it('returns placeholder for missing values', () => {
      expect(formatTime(null)).toBe('—');
      expect(formatTime(undefined)).toBe('—');
    });
  });

  describe('formatRelativeTime', () => {
    it('returns Today for current timestamps', () => {
      const nowIso = new Date().toISOString();
      expect(formatRelativeTime(nowIso)).toBe('Today');
    });

    it('returns formatted string for invalid inputs', () => {
      expect(formatRelativeTime(null)).toBe('—');
    });
  });

  describe('formatSha256', () => {
    it('truncates 64-char SHA-256 strings with ellipsis', () => {
      const fullHash = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';
      const truncated = formatSha256(fullHash, 12, 4);
      expect(truncated).toBe('e3b0c44298fc...b855');
    });

    it('handles short or missing hashes gracefully', () => {
      expect(formatSha256(null)).toBe('Not calculated');
      expect(formatSha256('short')).toBe('short');
    });
  });

  describe('formatPercent', () => {
    it('formats decimals and numbers to percentage string', () => {
      expect(formatPercent(92)).toBe('92%');
      expect(formatPercent(92.456, 1)).toBe('92.5%');
      expect(formatPercent(null)).toBe('0%');
      expect(formatPercent(NaN)).toBe('0%');
    });
  });
});

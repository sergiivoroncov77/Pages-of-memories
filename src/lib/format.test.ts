import { describe, expect, it } from 'vitest';
import { formatDate, formatDuration, formatShortDate, pluralize } from './format';

describe('human-readable dates and counts', () => {
  it('keeps a calendar date on its original day', () => {
    expect(formatDate('1950-07-15')).toBe('15 июля 1950 г.');
    expect(formatDate('2000-02-29')).toBe('29 февраля 2000 г.');
  });

  it('does not crash or silently roll impossible dates forward', () => {
    for (const value of ['', 'invalid', '2026-02-30', '2025-02-29', '2026-13-01']) {
      expect(formatDate(value)).toBe('Дата не указана');
      expect(formatShortDate(value)).toBe('Без даты');
    }
  });

  it('formats safe playback durations and Russian plural forms', () => {
    expect(formatDuration(-1)).toBe('0:00');
    expect(formatDuration(Number.NaN)).toBe('0:00');
    expect(formatDuration(125)).toBe('2:05');
    expect([1, 2, 5, 11, 21, 22].map((n) => pluralize(n, 'момент', 'момента', 'моментов')))
      .toEqual(['момент', 'момента', 'моментов', 'моментов', 'момент', 'момента']);
  });
});

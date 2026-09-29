import { describe, expect, it } from 'vitest';

import { formatDate } from './residentApi';

describe('formatDate', () => {
  const now = new Date(2026, 8, 29, 18, 0);

  it('uses relative labels for today and yesterday', () => {
    expect(formatDate(new Date(2026, 8, 29, 16, 43), now)).toBe('сегодня в 16:43');
    expect(formatDate(new Date(2026, 8, 28, 16, 43), now)).toBe('вчера в 16:43');
  });

  it('shows the month name for earlier dates this year and the numeric date for other years', () => {
    expect(formatDate(new Date(2026, 8, 27, 16, 43), now)).toBe('27 сентября в 16:43');
    expect(formatDate(new Date(2025, 8, 29, 16, 43), now)).toBe('29.09.2025 г. в 16:43');
  });

  it('handles yesterday across a year boundary', () => {
    expect(formatDate(new Date(2025, 11, 31, 23, 50), new Date(2026, 0, 1, 8))).toBe('вчера в 23:50');
  });

  it('keeps empty or invalid values empty', () => {
    expect(formatDate(null, now)).toBe('');
    expect(formatDate('invalid', now)).toBe('');
  });
});

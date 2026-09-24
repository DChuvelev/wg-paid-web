import { describe, expect, test } from 'vitest';
import { formatLinkDuration, linkDurationFromTimestamps } from './linkDuration';

describe('magic-link duration copy', () => {
  test('formats server TTL in both supported locales', () => {
    expect(formatLinkDuration(900, 'en')).toBe('15 minutes');
    expect(formatLinkDuration(900, 'ru')).toBe('15 минут');
  });

  test('derives invite duration from sent and expiry timestamps', () => {
    expect(linkDurationFromTimestamps('2026-01-01T00:00:00Z', '2026-01-01T00:15:00Z', 'en'))
      .toBe('15 minutes');
    expect(linkDurationFromTimestamps(null, '2026-01-01T00:15:00Z', 'en')).toBeNull();
  });
});

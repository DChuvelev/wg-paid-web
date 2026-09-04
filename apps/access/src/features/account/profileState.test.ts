import { expect, test } from 'vitest';
import type { ProfileSummary } from '@wg-paid/api';
import { hasTransitionalProfile, profilePollingInterval } from './profileState';

function profile(status: string): ProfileSummary {
  return {
    access_grant_id: 'grant-1',
    created_at: '2026-01-01T00:00:00Z',
    id: `profile-${status}`,
    label: null,
    protocol: 'wireguard',
    status,
    tunnel_ip: null,
    updated_at: '2026-01-01T00:00:00Z'
  };
}

test('keeps polling bounded to transitional profile states', () => {
  expect(hasTransitionalProfile([profile('requested')])).toBe(true);
  expect(profilePollingInterval([profile('provisioning')])).toBe(3000);
  expect(profilePollingInterval([profile('disabling')])).toBe(3000);
  expect(profilePollingInterval([profile('active')])).toBe(false);
  expect(profilePollingInterval([profile('disabled')])).toBe(false);
});

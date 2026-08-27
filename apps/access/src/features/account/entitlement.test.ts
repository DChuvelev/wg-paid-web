import { expect, test } from 'vitest';
import type { GrantSummary, ProfileSummary } from '@wg-paid/api';
import { selectWireGuardEntitlement } from './entitlement';
import { profilePollingInterval } from './profileState';

function grant(overrides: Partial<GrantSummary>): GrantSummary {
  return {
    id: 'grant-default',
    plan_id: null,
    protocol_limits: [],
    status: 'active',
    valid_until: null,
    ...overrides
  };
}

test('selects the first non-expired active WireGuard entitlement newest-first', () => {
  const result = selectWireGuardEntitlement([
    grant({ id: 'older', protocol_limits: [{ can_create: true, profile_count: 4, profile_limit: 5, protocol: 'wireguard' }] }),
    grant({ id: 'selected', valid_until: '2027-01-01T00:00:00Z', protocol_limits: [{ can_create: true, profile_count: 1, profile_limit: 2, protocol: 'wireguard' }] }),
    grant({ id: 'expired', valid_until: '2025-01-01T00:00:00Z', protocol_limits: [{ can_create: true, profile_count: 0, profile_limit: 9, protocol: 'wireguard' }] }),
  ], new Date('2026-01-01T00:00:00Z'));

  expect(result).toEqual({ canCreate: true, grantId: 'selected', profileCount: 1, profileLimit: 2 });
});

test('selects the newest eligible WireGuard grant from oldest-first VM121 input', () => {
  const grants = [
    grant({ id: 'oldest-eligible', protocol_limits: [{ can_create: false, profile_count: 1, profile_limit: 2, protocol: 'wireguard' }] }),
    grant({ id: 'middle-without-wireguard', protocol_limits: [{ can_create: true, profile_count: 0, profile_limit: 4, protocol: 'amneziawg' }] }),
    grant({ id: 'newest-eligible', protocol_limits: [{ can_create: true, profile_count: 2, profile_limit: 5, protocol: 'wireguard' }] })
  ];

  expect(selectWireGuardEntitlement(grants)).toEqual({
    canCreate: true,
    grantId: 'newest-eligible',
    profileCount: 2,
    profileLimit: 5
  });
  expect(grants.map(({ id }) => id)).toEqual([
    'oldest-eligible',
    'middle-without-wireguard',
    'newest-eligible'
  ]);
});

test('profile polling stops as soon as transitional state becomes stable', () => {
  const profile = (status: string): ProfileSummary => ({
    created_at: '2026-01-01T00:00:00Z',
    id: 'profile-1',
    label: null,
    protocol: 'wireguard',
    status,
    tunnel_ip: null,
    updated_at: '2026-01-01T00:00:00Z'
  });

  expect(profilePollingInterval([profile('provisioning')])).toBe(3000);
  expect(profilePollingInterval([profile('active')])).toBe(false);
});

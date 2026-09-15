import { expect, test } from 'vitest';
import type { GrantSummary } from '@wg-paid/api';
import { selectConfigurationEntitlement } from './entitlement';

function grant(overrides: Partial<GrantSummary>): GrantSummary {
  return {
    can_create_configuration: true,
    configuration_count: 1,
    configuration_limit: 2,
    id: 'grant-default',
    plan_id: null,
    protocol_limits: [],
    status: 'active',
    valid_until: null,
    ...overrides
  };
}

test('selects the newest active unexpired grant and its common configuration quota', () => {
  const result = selectConfigurationEntitlement([
    grant({ id: 'older', configuration_count: 4, configuration_limit: 5 }),
    grant({ id: 'selected', configuration_count: 1, configuration_limit: 2 }),
    grant({ id: 'expired', valid_until: '2025-01-01T00:00:00Z' })
  ], new Date('2026-01-01T00:00:00Z'));

  expect(result).toEqual({
    canCreate: true,
    configurationCount: 1,
    configurationLimit: 2,
    grantId: 'selected'
  });
});

test('does not derive creation from separate protocol rows', () => {
  const result = selectConfigurationEntitlement([
    grant({
      can_create_configuration: false,
      configuration_count: 2,
      configuration_limit: 2,
      protocol_limits: [{ can_create: true, profile_count: 1, profile_limit: 2, protocol: 'wireguard' }]
    })
  ]);
  expect(result?.canCreate).toBe(false);
});

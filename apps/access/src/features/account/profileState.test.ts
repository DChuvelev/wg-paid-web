import { expect, test } from 'vitest';
import type { ConfigurationSummary } from '@wg-paid/api';
import { configurationPollTimeoutMs, configurationPollingInterval, hasTransitionalConfiguration } from './profileState';

function configuration(wgStatus: string, awgStatus = 'active'): ConfigurationSummary {
  return {
    access_grant_id: 'grant-1', configuration_id: 'configuration-1', ordinal: 1,
    label: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-1', status: wgStatus, ready: wgStatus === 'active', tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-1', status: awgStatus, ready: awgStatus === 'active', tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  };
}

test('polls either transitional variant, then stops on terminal state or timeout', () => {
  expect(hasTransitionalConfiguration([configuration('active', 'provisioning')])).toBe(true);
  expect(configurationPollingInterval([configuration('requested')], 1000, 1000)).toBe(3000);
  expect(configurationPollingInterval([configuration('active', 'disabling')], 1000, 2000)).toBe(3000);
  expect(configurationPollingInterval([configuration('active')], 1000, 2000)).toBe(false);
  expect(configurationPollingInterval([configuration('provisioning')], 1000, 1000 + configurationPollTimeoutMs)).toBe(false);
});

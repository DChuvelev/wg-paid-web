import { expect, test } from 'vitest';
import type { AccountMeResponse, ConfigurationSummary } from '@wg-paid/api';
import { reviewProjection } from './reviewProjection';

const billing = (overrides: Partial<NonNullable<AccountMeResponse['billing']>> = {}): NonNullable<AccountMeResponse['billing']> => ({
  access_grant_id: 'review-grant',
  status: 'expired',
  current_period_start: '2026-09-30T00:00:00Z',
  current_period_end: '2026-09-30T00:00:00Z',
  quantity_period_start: '2026-09-30T00:00:00Z',
  quantity_period_end: '2026-09-30T00:00:00Z',
  slot_quantity: 1,
  monthly_amount_kopeks: 29900,
  min_slot_quantity: 1,
  max_slot_quantity: 1,
  extra_slot_monthly_kopeks: 0,
  pending_slot_quantity: null,
  pending_period_start: null,
  pending_period_end: null,
  pending_monthly_amount_kopeks: null,
  retirement_configuration_ids: [],
  can_renew: true,
  can_add_devices_now: false,
  currency: 'RUB',
  ...overrides
});

const account = (overrides: Partial<NonNullable<AccountMeResponse['billing']>> = {}): AccountMeResponse => ({
  account_surface: 'review', billing: billing(overrides), display_name: null, email: 'reviewer@example.test',
  grants: [], referrals: { active_count: 0, can_create: false, enabled: false, limit: 0, remaining_count: 0 }, user_id: 'review-user'
});

const configuration = (status = 'active', ready = true, overrides: Partial<ConfigurationSummary> = {}): ConfigurationSummary => ({
  access_grant_id: 'review-grant', configuration_id: 'review-configuration', ordinal: 1, label: null,
  created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z', routing_mode: 'automatic',
  forced_selector: null, forced_until: null,
  variants: [{ protocol: 'wireguard', profile_id: 'review-wg', status, ready, tunnel_ip: null, created_at: '2026-09-30T00:00:00Z', updated_at: '2026-09-30T00:00:00Z' }],
  ...overrides
});

test('accepts only the exact unpaid review projection', () => {
  expect(reviewProjection(account(), [])).toEqual({ state: 'payment_required' });
  for (const invalid of [
    account({ monthly_amount_kopeks: 29899 }), account({ currency: 'USD' }), account({ min_slot_quantity: 2 }),
    account({ max_slot_quantity: 2 }), account({ slot_quantity: 2 }), account({ can_renew: false }),
    account({ pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z', pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900 }),
    account({ retirement_configuration_ids: ['review-configuration'] }), account({ status: 'trial' }), account({ status: 'past_due' })
  ]) expect(reviewProjection(invalid, [])).toEqual({ state: 'unavailable' });
  expect(reviewProjection({ ...account(), billing: null }, [])).toEqual({ state: 'unavailable' });
  expect(reviewProjection(account(), [configuration()])).toEqual({ state: 'unavailable' });
});

test('classifies only coherent paid provisioning and ready states', () => {
  const paid = account({ status: 'active_paid' });
  expect(reviewProjection(paid, [])).toEqual({ state: 'provisioning' });
  expect(reviewProjection(paid, [configuration('requested', false)])).toEqual({ state: 'provisioning' });
  expect(reviewProjection(paid, [configuration('provisioning', false)])).toEqual({ state: 'provisioning' });
  expect(reviewProjection(paid, [configuration()]).state).toBe('ready');

  const second = configuration('active', true, { configuration_id: 'second' });
  const multipleVariants = configuration();
  multipleVariants.variants.push({ ...multipleVariants.variants[0]!, profile_id: 'second-wg' });
  const awg = configuration();
  awg.variants = [{ ...awg.variants[0]!, protocol: 'amneziawg' }];
  for (const rows of [
    [configuration('active', false)], [configuration('provisioning_failed', false)],
    [configuration('active', true, { access_grant_id: 'other-grant' })], [configuration(), second],
    [multipleVariants], [awg], [configuration('requested', true)]
  ]) expect(reviewProjection(paid, rows)).toEqual({ state: 'unavailable' });
});

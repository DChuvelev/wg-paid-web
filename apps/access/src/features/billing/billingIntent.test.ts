import { describe, expect, test } from 'vitest';
import type { BillingAccountSummary, ConfigurationSummary } from '@wg-paid/api';
import { buildBillingPaymentRequest, selectBillingConfigurations } from './billingIntent';

const billing = (overrides: Partial<BillingAccountSummary> = {}): BillingAccountSummary => ({
  access_grant_id: 'grant-billing', status: 'active_paid',
  current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-10-01T00:00:00Z',
  quantity_period_start: '2026-09-01T00:00:00Z', quantity_period_end: '2026-10-01T00:00:00Z',
  slot_quantity: 2, monthly_amount_kopeks: 39900, min_slot_quantity: 1, max_slot_quantity: 3,
  extra_slot_monthly_kopeks: 10000, pending_slot_quantity: null, pending_period_start: null,
  pending_period_end: null, pending_monthly_amount_kopeks: null, retirement_configuration_ids: [],
  can_renew: true, can_add_devices_now: true, currency: 'RUB', ...overrides
});

const configuration = (id: string, grant = 'grant-billing', ordinal = Number(id.at(-1))): ConfigurationSummary => ({
  access_grant_id: grant, configuration_id: id, ordinal, label: null,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', variants: []
});
const configurations = [configuration('configuration-1'), configuration('configuration-2')];

function request(overrides: Partial<Parameters<typeof buildBillingPaymentRequest>[0]> = {}) {
  return buildBillingPaymentRequest({
    action: 'renew', applyNow: false, billing: billing(), billingConfigurations: configurations,
    futureChoice: null, retireConfigurationIds: [], retireNewConfigurationOrdinals: [], targetQuantity: 2,
    ...overrides
  });
}

describe('billing intent', () => {
  test('builds same, higher-later, and higher-now renewals', () => {
    expect(request()).toMatchObject({ ok: true, body: { action: 'renew', target_quantity: 2, apply_now: false } });
    expect(request({ targetQuantity: 3 })).toMatchObject({ ok: true, body: { target_quantity: 3, apply_now: false } });
    expect(request({ targetQuantity: 3, applyNow: true })).toMatchObject({ ok: true, body: { target_quantity: 3, apply_now: true } });
  });

  test('requires the exact billing-owned existing selection for a lower renewal', () => {
    expect(request({ targetQuantity: 1 })).toEqual({ ok: false, reason: 'invalid_retirement_selection' });
    expect(request({ targetQuantity: 1, retireConfigurationIds: ['configuration-2'] }))
      .toMatchObject({ ok: true, body: { retire_configuration_ids: ['configuration-2'] } });
    expect(request({ targetQuantity: 1, retireConfigurationIds: ['other-grant'] }))
      .toEqual({ ok: false, reason: 'invalid_retirement_selection' });
  });

  test('builds add-now without a future choice when no pending period or pending is high enough', () => {
    expect(request({ action: 'add_now', targetQuantity: 3 })).toMatchObject({ ok: true, body: { action: 'add_now', future_choice: null } });
    expect(request({ action: 'add_now', billing: billing({ pending_slot_quantity: 3, pending_period_start: '2026-10-01T00:00:00Z', pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 49900, can_renew: false }), targetQuantity: 3 }))
      .toMatchObject({ ok: true, body: { future_choice: null } });
  });

  test('supports preserve and exact mixed keep-paid retirement selection', () => {
    const pending = billing({ pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z', pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900, retirement_configuration_ids: ['configuration-1'], can_renew: false });
    expect(request({ action: 'add_now', billing: pending, targetQuantity: 3, futureChoice: 'preserve' }))
      .toMatchObject({ ok: true, body: { future_choice: 'preserve' } });
    expect(request({ action: 'add_now', billing: pending, targetQuantity: 3, futureChoice: 'keep_paid', retireConfigurationIds: ['configuration-2'], retireNewConfigurationOrdinals: [1] }))
      .toMatchObject({ ok: true, body: { future_choice: 'keep_paid', retire_new_configuration_ordinals: [1] } });
    expect(request({ action: 'add_now', billing: pending, targetQuantity: 3, futureChoice: 'keep_paid', retireNewConfigurationOrdinals: [2] }))
      .toEqual({ ok: false, reason: 'invalid_retirement_selection' });
  });

  test('builds the bounded top-up-next preservation case', () => {
    const pending = billing({ pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z', pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900, retirement_configuration_ids: ['configuration-1'], can_renew: false });
    expect(request({ action: 'top_up_next', billing: pending })).toMatchObject({ ok: true, body: { action: 'top_up_next', target_quantity: 2 } });
  });

  test('enforces bounds, coherent pending data, and authoritative billing ownership', () => {
    expect(request({ targetQuantity: 4 })).toEqual({ ok: false, reason: 'invalid_quantity' });
    expect(request({ billing: billing({ pending_slot_quantity: 2 }) })).toEqual({ ok: false, reason: 'incoherent_projection' });
    expect(selectBillingConfigurations(billing(), [...configurations, configuration('configuration-9', 'other')])).toEqual(configurations);
    expect(request({ billingConfigurations: [configuration('configuration-1'), configuration('configuration-2', 'other')] }))
      .toEqual({ ok: false, reason: 'incoherent_projection' });
    expect(request({ billing: billing({
      pending_slot_quantity: 1,
      pending_period_start: '2026-10-01T00:00:00Z',
      pending_period_end: '2026-11-01T00:00:00Z',
      pending_monthly_amount_kopeks: 29900,
      retirement_configuration_ids: ['configuration-from-other-grant']
    }) })).toEqual({ ok: false, reason: 'incoherent_projection' });
  });
});

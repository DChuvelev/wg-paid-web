import { describe, expect, test } from 'vitest';
import type { BillingAccountSummary, BillingPaymentSummary, ConfigurationSummary } from '@wg-paid/api';
import { billingProjectionIsCoherent, buildBillingPaymentRequest, classifyCurrentQuantityPeriod, selectBillingConfigurations } from './billingIntent';

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
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
  routing_mode: 'automatic', forced_selector: null, forced_until: null, variants: []
});
const configurations = [configuration('configuration-1'), configuration('configuration-2')];

const payment = (overrides: Partial<BillingPaymentSummary> = {}): BillingPaymentSummary => ({
  payment_id: 'payment-1', status: 'succeeded', provider_status: 'succeeded', kind: 'initial',
  amount_kopeks: 49900, currency: 'RUB', quantity_before: 3, quantity_after: 3,
  target_period_start: '2026-09-01T00:00:00Z', target_period_end: '2026-10-01T00:00:00Z',
  calculation: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z',
  succeeded_at: '2026-09-01T00:00:00Z', ...overrides
});

function request(overrides: Partial<Parameters<typeof buildBillingPaymentRequest>[0]> = {}) {
  return buildBillingPaymentRequest({
    action: 'renew', applyNow: false, billing: billing(), billingConfigurations: configurations,
    futureChoice: null, retireConfigurationIds: [], retireNewConfigurationOrdinals: [], targetQuantity: 2,
    ...overrides
  });
}

describe('billing intent', () => {
  test('classifies a genuinely paid max-q3 current period from succeeded payment coverage', () => {
    const current = billing({
      status: 'active_paid', slot_quantity: 3, monthly_amount_kopeks: 49900,
      can_add_devices_now: false
    });
    expect(classifyCurrentQuantityPeriod(current, [payment()], Date.parse('2026-09-15T00:00:00Z'))).toBe('paid');
  });

  test('classifies an active-paid preserved trial tail when succeeded coverage begins in the future', () => {
    const current = billing({
      status: 'active_paid', slot_quantity: 3, monthly_amount_kopeks: 49900,
      can_add_devices_now: false,
      pending_slot_quantity: 1, pending_period_start: '2026-10-01T03:00:00+03:00',
      pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
      retirement_configuration_ids: ['configuration-2', 'configuration-3'], can_renew: false
    });
    const future = payment({ target_period_start: '2026-10-01T00:00:00Z', target_period_end: '2026-11-01T00:00:00Z' });
    expect(classifyCurrentQuantityPeriod(current, [future], Date.parse('2026-09-15T00:00:00Z'))).toBe('trial');
  });

  test('classifies plain trial without history and leaves unavailable or malformed active-paid evidence unknown', () => {
    expect(classifyCurrentQuantityPeriod(billing({ status: 'trial' }), undefined)).toBe('trial');
    expect(classifyCurrentQuantityPeriod(billing(), undefined, Date.parse('2026-09-15T00:00:00Z'))).toBe('unknown');
    expect(classifyCurrentQuantityPeriod(billing(), [payment({ target_period_start: 'invalid' })], Date.parse('2026-09-15T00:00:00Z'))).toBe('unknown');
    expect(classifyCurrentQuantityPeriod(billing({ quantity_period_end: 'invalid' }), [], Date.parse('2026-09-15T00:00:00Z'))).toBe('unknown');
  });

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

  test.each([1, 2])('preserves exact boundary retirement selection for trial q3 first payment to q%i', (targetQuantity) => {
    const trialConfigurations = [...configurations, configuration('configuration-3')];
    const trial = billing({
      status: 'trial', slot_quantity: 3, monthly_amount_kopeks: 49900,
      can_add_devices_now: false
    });
    const selected = trialConfigurations.slice(targetQuantity).map((item) => item.configuration_id);
    expect(request({ billing: trial, billingConfigurations: trialConfigurations, targetQuantity }))
      .toEqual({ ok: false, reason: 'invalid_retirement_selection' });
    expect(request({ billing: trial, billingConfigurations: trialConfigurations, targetQuantity, retireConfigurationIds: selected }))
      .toMatchObject({ ok: true, body: { apply_now: false, retire_configuration_ids: selected } });
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

  test.each([2, 3])('allows q1 pending quantity to be topped up to q%i', (targetQuantity) => {
    const oneConfiguration = [configuration('configuration-1')];
    const pending = billing({
      slot_quantity: 1, monthly_amount_kopeks: 29900,
      pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
      pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
      can_renew: false
    });
    expect(request({ action: 'top_up_next', billing: pending, billingConfigurations: oneConfiguration, targetQuantity }))
      .toEqual({ ok: true, body: {
        action: 'top_up_next', target_quantity: targetQuantity, apply_now: false, future_choice: null,
        retire_configuration_ids: [], retire_new_configuration_ordinals: []
      } });
  });

  test('requires exact existing boundary retirements when top-up target remains below current quantity', () => {
    const threeConfigurations = [...configurations, configuration('configuration-3')];
    const pending = billing({
      slot_quantity: 3, monthly_amount_kopeks: 49900,
      pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
      pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
      retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false
    });
    expect(request({ action: 'top_up_next', billing: pending, billingConfigurations: threeConfigurations, targetQuantity: 2 }))
      .toEqual({ ok: false, reason: 'invalid_retirement_selection' });
    expect(request({ action: 'top_up_next', billing: pending, billingConfigurations: threeConfigurations, targetQuantity: 2, retireConfigurationIds: ['configuration-2'] }))
      .toMatchObject({ ok: true, body: { target_quantity: 2, retire_configuration_ids: ['configuration-2'] } });
    expect(request({ action: 'top_up_next', billing: pending, billingConfigurations: threeConfigurations, targetQuantity: 3 }))
      .toMatchObject({ ok: true, body: { target_quantity: 3, retire_configuration_ids: [] } });
  });

  test('does not allow top-up-next when pending quantity is already max quantity', () => {
    const pending = billing({
      pending_slot_quantity: 3, pending_period_start: '2026-10-01T00:00:00Z',
      pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 49900,
      can_renew: false
    });
    expect(request({ action: 'top_up_next', billing: pending, targetQuantity: 3 }))
      .toEqual({ ok: false, reason: 'action_unavailable' });
  });

  test('allows preserved-trial-tail top-up-next to preserve all current configurations', () => {
    const trialTailConfigurations = [...configurations, configuration('configuration-3')];
    const pending = billing({
      status: 'active_paid', slot_quantity: 3, monthly_amount_kopeks: 49900,
      pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
      pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
      retirement_configuration_ids: ['configuration-1', 'configuration-2'],
      can_renew: false, can_add_devices_now: false
    });
    expect(request({ action: 'top_up_next', billing: pending, billingConfigurations: trialTailConfigurations, targetQuantity: 3 }))
      .toEqual({ ok: true, body: {
        action: 'top_up_next', target_quantity: 3, apply_now: false, future_choice: null,
        retire_configuration_ids: [], retire_new_configuration_ordinals: []
      } });
  });

  test.each([1, 3])('reactivates expired historical quantity at target %i without retirements', (targetQuantity) => {
    const expired = billing({ status: 'expired', slot_quantity: 3, monthly_amount_kopeks: 49900, can_add_devices_now: false });
    expect(billingProjectionIsCoherent(expired, [])).toBe(true);
    expect(request({ billing: expired, billingConfigurations: [], targetQuantity }))
      .toEqual({ ok: true, body: {
        action: 'renew', target_quantity: targetQuantity, apply_now: false, future_choice: null,
        retire_configuration_ids: [], retire_new_configuration_ordinals: []
      } });
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

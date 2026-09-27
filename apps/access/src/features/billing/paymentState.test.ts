import { expect, test } from 'vitest';
import type { BillingAccountSummary, BillingPaymentSummary } from '@wg-paid/api';
import { pendingPaymentAllowsRetirementReselection, topUpNextPaymentTarget } from './paymentState';

const billing = (): BillingAccountSummary => ({
  access_grant_id: 'grant-1', status: 'active_paid',
  current_period_start: '2026-09-01T00:00:00Z', current_period_end: '2026-11-01T00:00:00Z',
  quantity_period_start: '2026-09-01T00:00:00Z', quantity_period_end: '2026-10-01T00:00:00Z',
  slot_quantity: 3, monthly_amount_kopeks: 49900, min_slot_quantity: 1, max_slot_quantity: 3,
  extra_slot_monthly_kopeks: 10000, pending_slot_quantity: 1,
  pending_period_start: '2026-10-01T00:00:00Z', pending_period_end: '2026-11-01T00:00:00Z',
  pending_monthly_amount_kopeks: 29900, retirement_configuration_ids: ['configuration-2', 'configuration-3'],
  can_renew: false, can_add_devices_now: false, currency: 'RUB'
});

const payment = (calculation: unknown, status: BillingPaymentSummary['status'] = 'pending'): BillingPaymentSummary => ({
  payment_id: 'payment-1', status, provider_status: null, kind: 'upgrade', amount_kopeks: 20000,
  currency: 'RUB', quantity_before: 1, quantity_after: 3,
  target_period_start: '2026-10-01T00:00:00Z', target_period_end: '2026-11-01T00:00:00Z',
  calculation: calculation as BillingPaymentSummary['calculation'],
  created_at: '2026-09-15T00:00:00Z', updated_at: '2026-09-15T00:00:00Z', succeeded_at: null
});

test('allows retirement reselection only for the exact safe pending top-up-next class', () => {
  expect(pendingPaymentAllowsRetirementReselection(payment({ version: 1, action: 'top_up_next', target_quantity: 3 }), billing())).toBe(true);
  expect(pendingPaymentAllowsRetirementReselection(payment({ version: 1, action: 'top_up_next', target_quantity: 2 }), billing())).toBe(false);
  expect(pendingPaymentAllowsRetirementReselection(payment({ version: 1, action: 'top_up_next', target_quantity: 3 }, 'created'), billing())).toBe(true);
  expect(pendingPaymentAllowsRetirementReselection(payment({ version: 1, action: 'top_up_next', target_quantity: 3 }, 'succeeded'), billing())).toBe(false);
});

test.each([
  null,
  [],
  { version: '1', action: 'top_up_next', target_quantity: 3 },
  { version: 1, action: 'renew', target_quantity: 3 },
  { version: 1, action: 'top_up_next', target_quantity: '3' },
  { version: 1, action: 'top_up_next', target_quantity: 3.5 }
])('fails closed for malformed frozen calculation %#', (calculation) => {
  expect(topUpNextPaymentTarget(payment(calculation))).toBeNull();
  expect(pendingPaymentAllowsRetirementReselection(payment(calculation), billing())).toBe(false);
});

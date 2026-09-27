import type { BillingAccountSummary, BillingPaymentSummary } from '@wg-paid/api';

export const paymentPollIntervalMs = 3000;
export const paymentPollWindowMs = 120000;

export function isPendingPayment(payment: BillingPaymentSummary) {
  return payment.status === 'created' || payment.status === 'pending';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

export function topUpNextPaymentTarget(payment: BillingPaymentSummary) {
  const calculation = payment.calculation;
  if (!isRecord(calculation)
    || calculation.version !== 1
    || calculation.action !== 'top_up_next'
    || !Number.isInteger(calculation.target_quantity)) return null;
  return calculation.target_quantity as number;
}

export function pendingPaymentAllowsRetirementReselection(
  payment: BillingPaymentSummary,
  billing: BillingAccountSummary
) {
  if (!isPendingPayment(payment) || billing.pending_slot_quantity === null) return false;
  const targetQuantity = topUpNextPaymentTarget(payment);
  return targetQuantity !== null
    && targetQuantity > billing.pending_slot_quantity
    && targetQuantity >= billing.slot_quantity;
}

export type PendingPaymentResolution =
  | { kind: 'none' }
  | { kind: 'one'; payment: BillingPaymentSummary }
  | { kind: 'ambiguous'; payments: Array<BillingPaymentSummary> };

export function resolvePendingPayments(payments: Array<BillingPaymentSummary>): PendingPaymentResolution {
  const pending = payments.filter(isPendingPayment);
  if (pending.length === 0) return { kind: 'none' };
  if (pending.length === 1) return { kind: 'one', payment: pending[0]! };
  return { kind: 'ambiguous', payments: pending };
}

export function paymentPollingInterval(payment: BillingPaymentSummary | undefined, startedAt: number) {
  if (!payment || !isPendingPayment(payment)) return false;
  return Date.now() - startedAt < paymentPollWindowMs ? paymentPollIntervalMs : false;
}

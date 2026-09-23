import type { BillingPaymentSummary } from '@wg-paid/api';

export const paymentPollIntervalMs = 3000;
export const paymentPollWindowMs = 120000;

export function isPendingPayment(payment: BillingPaymentSummary) {
  return payment.status === 'created' || payment.status === 'pending';
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

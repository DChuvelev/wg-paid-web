import type { BillingPaymentSummary } from '@wg-paid/api';

export const paymentPollIntervalMs = 3000;
export const paymentPollWindowMs = 120000;

export function isPendingPayment(payment: BillingPaymentSummary) {
  return payment.status === 'created' || payment.status === 'pending';
}

export function paymentPollingInterval(payment: BillingPaymentSummary | undefined, startedAt: number) {
  if (!payment || !isPendingPayment(payment)) return false;
  return Date.now() - startedAt < paymentPollWindowMs ? paymentPollIntervalMs : false;
}

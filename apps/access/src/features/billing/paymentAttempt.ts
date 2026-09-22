export const paymentAttemptStorageKey = 'wg-paid-payment-attempt-v2';
const legacyPaymentAttemptStorageKey = 'wg-paid-payment-attempt-v1';

export interface PaymentAttempt {
  version: 2;
  state: 'active' | 'definite_failure';
  user_id: string;
  idempotency_key: string;
  started_at: number;
  payment_id?: string;
}

function isAttempt(value: unknown): value is PaymentAttempt {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PaymentAttempt>;
  return item.version === 2
    && (item.state === 'active' || item.state === 'definite_failure')
    && typeof item.user_id === 'string'
    && typeof item.idempotency_key === 'string'
    && typeof item.started_at === 'number'
    && (item.payment_id === undefined || typeof item.payment_id === 'string');
}

export function readPaymentAttempt(): PaymentAttempt | null {
  sessionStorage.removeItem(legacyPaymentAttemptStorageKey);
  try {
    const raw = sessionStorage.getItem(paymentAttemptStorageKey);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (isAttempt(parsed)) return parsed;
  } catch {
    // Invalid browser state is discarded below.
  }
  sessionStorage.removeItem(paymentAttemptStorageKey);
  return null;
}

export function readPaymentAttemptForUser(userId: string): PaymentAttempt | null {
  const attempt = readPaymentAttempt();
  if (!attempt) return null;
  if (attempt.user_id === userId) return attempt;
  sessionStorage.removeItem(paymentAttemptStorageKey);
  return null;
}

export function writePaymentAttempt(attempt: PaymentAttempt) {
  sessionStorage.setItem(paymentAttemptStorageKey, JSON.stringify(attempt));
}

export function clearPaymentAttemptForUser(userId: string) {
  const attempt = readPaymentAttempt();
  if (attempt?.user_id === userId) sessionStorage.removeItem(paymentAttemptStorageKey);
}

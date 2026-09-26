import type { BillingPaymentCreateRequest } from '@wg-paid/api';
import { isBillingPaymentCreateRequest } from './billingIntent';

export const paymentAttemptStorageKey = 'wg-paid-payment-attempt-v3';
const previousPaymentAttemptStorageKey = 'wg-paid-payment-attempt-v2';
const legacyPaymentAttemptStorageKey = 'wg-paid-payment-attempt-v1';

export interface PaymentAttempt {
  version: 3;
  state: 'active' | 'definite_failure';
  user_id: string;
  idempotency_key: string;
  started_at: number;
  payment_id?: string;
  request?: BillingPaymentCreateRequest;
}

function isCommonAttempt(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<PaymentAttempt>;
  return (item.state === 'active' || item.state === 'definite_failure')
    && typeof item.user_id === 'string'
    && typeof item.idempotency_key === 'string'
    && typeof item.started_at === 'number'
    && (item.payment_id === undefined || typeof item.payment_id === 'string');
}

function isAttempt(value: unknown): value is PaymentAttempt {
  if (!isCommonAttempt(value)) return false;
  const item = value as Partial<PaymentAttempt>;
  const allowedKeys = ['version', 'state', 'user_id', 'idempotency_key', 'started_at', 'payment_id', 'request'];
  return Object.keys(item).every((key) => allowedKeys.includes(key))
    && item.version === 3
    && (item.request === undefined || isBillingPaymentCreateRequest(item.request));
}

function readStored(key: string) {
  try {
    const raw = sessionStorage.getItem(key);
    return raw ? JSON.parse(raw) as unknown : null;
  } catch {
    return null;
  }
}

export function readPaymentAttempt(): PaymentAttempt | null {
  sessionStorage.removeItem(legacyPaymentAttemptStorageKey);
  const current = readStored(paymentAttemptStorageKey);
  if (isAttempt(current)) return current;
  sessionStorage.removeItem(paymentAttemptStorageKey);

  const previous = readStored(previousPaymentAttemptStorageKey);
  sessionStorage.removeItem(previousPaymentAttemptStorageKey);
  if (isCommonAttempt(previous) && (previous as { version?: unknown }).version === 2) {
    const legacy = previous as Omit<PaymentAttempt, 'version' | 'request'>;
    const migrated: PaymentAttempt = {
      version: 3,
      state: legacy.state,
      user_id: legacy.user_id,
      idempotency_key: legacy.idempotency_key,
      started_at: legacy.started_at,
      ...(legacy.payment_id ? { payment_id: legacy.payment_id } : {})
    };
    writePaymentAttempt(migrated);
    return migrated;
  }
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

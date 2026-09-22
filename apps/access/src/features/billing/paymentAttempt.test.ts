import { beforeEach, expect, test } from 'vitest';
import { clearPaymentAttemptForUser, paymentAttemptStorageKey, readPaymentAttemptForUser, writePaymentAttempt } from './paymentAttempt';
import { paymentPollingInterval, paymentPollIntervalMs, paymentPollWindowMs } from './paymentState';

beforeEach(() => sessionStorage.clear());

test('persists only the logical payment attempt fields and adds payment id when known', () => {
  const attempt = { version: 2 as const, state: 'active' as const, user_id: 'user-1', idempotency_key: 'same-key', started_at: 1000 };
  writePaymentAttempt(attempt);
  expect(readPaymentAttemptForUser('user-1')).toEqual(attempt);
  writePaymentAttempt({ ...attempt, payment_id: 'payment-1' });
  expect(JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!)).toEqual({ ...attempt, payment_id: 'payment-1' });
  expect(sessionStorage.getItem(paymentAttemptStorageKey)).not.toContain('confirmation');
});

test('clears stale storage for another account and never clears another account during scoped cleanup', () => {
  writePaymentAttempt({ version: 2, state: 'active', user_id: 'user-2', idempotency_key: 'key-2', started_at: 1000 });
  clearPaymentAttemptForUser('user-1');
  expect(sessionStorage.getItem(paymentAttemptStorageKey)).not.toBeNull();
  expect(readPaymentAttemptForUser('user-1')).toBeNull();
  expect(sessionStorage.getItem(paymentAttemptStorageKey)).toBeNull();
});

test('persists definite failure and rejects incomplete or legacy records fail-closed', () => {
  const failed = { version: 2 as const, state: 'definite_failure' as const, user_id: 'user-1', idempotency_key: 'failed-key', started_at: 1000 };
  writePaymentAttempt(failed);
  expect(readPaymentAttemptForUser('user-1')).toEqual(failed);
  sessionStorage.setItem(paymentAttemptStorageKey, JSON.stringify({ ...failed, state: 'unexpected' }));
  expect(readPaymentAttemptForUser('user-1')).toBeNull();
  sessionStorage.setItem(paymentAttemptStorageKey, JSON.stringify({ ...failed, version: 1 }));
  expect(readPaymentAttemptForUser('user-1')).toBeNull();
});

test('polls only nonterminal payments inside the original bounded window', () => {
  const pending = { status: 'pending' as const } as Parameters<typeof paymentPollingInterval>[0];
  expect(paymentPollingInterval(pending, Date.now())).toBe(paymentPollIntervalMs);
  expect(paymentPollingInterval(pending, Date.now() - paymentPollWindowMs - 1)).toBe(false);
  expect(paymentPollingInterval({ ...pending, status: 'succeeded' } as Parameters<typeof paymentPollingInterval>[0], Date.now())).toBe(false);
});

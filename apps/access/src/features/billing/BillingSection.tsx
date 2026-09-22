import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountMeResponse, BillingPaymentSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createBillingPayment, loadBillingPayment, loadBillingPayments } from '../../lib/accessApi';
import { accountKey, billingPaymentKey, billingPaymentsKey, configurationsKey } from '../account/queryKeys';
import { clearPaymentAttemptForUser, readPaymentAttemptForUser, type PaymentAttempt, writePaymentAttempt } from './paymentAttempt';
import { isPendingPayment, paymentPollingInterval, paymentPollWindowMs } from './paymentState';
import styles from './Billing.module.css';

interface Props { account: AccountMeResponse; onUnauthorized: (error: unknown) => void; }

function paymentStartedAt(payment: BillingPaymentSummary) {
  const parsed = Date.parse(payment.created_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

export function BillingSection({ account, onUnauthorized }: Props) {
  const { t } = useLocale();
  const queryClient = useQueryClient();
  const singleFlight = useRef(false);
  const recovered = useRef(false);
  const initialAttempt = useMemo(() => readPaymentAttemptForUser(account.user_id), [account.user_id]);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(initialAttempt);
  const [paymentId, setPaymentId] = useState<string | null>(initialAttempt?.payment_id ?? null);
  const [startedAt, setStartedAt] = useState(initialAttempt?.started_at ?? Date.now());
  const [message, setMessage] = useState('');
  const history = useQuery({ queryKey: billingPaymentsKey, queryFn: loadBillingPayments, enabled: Boolean(account.billing), retry: false, refetchOnWindowFocus: true });

  const finish = async (payment: BillingPaymentSummary) => {
    if (isPendingPayment(payment)) return;
    clearPaymentAttemptForUser(account.user_id);
    setAttempt(null);
    setMessage(payment.status === 'succeeded' ? t('paymentSucceeded') : t('paymentCanceled'));
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: configurationsKey }),
      queryClient.invalidateQueries({ queryKey: billingPaymentsKey })
    ]);
  };

  const payment = useQuery({
    queryKey: paymentId ? billingPaymentKey(paymentId) : [...billingPaymentsKey, 'none'],
    queryFn: () => loadBillingPayment(paymentId!),
    enabled: Boolean(paymentId),
    retry: false,
    refetchInterval: ({ state }) => paymentPollingInterval(state.data, startedAt)
  });

  useEffect(() => {
    if (!payment.data) return;
    if (isPendingPayment(payment.data) && Date.now() - startedAt >= paymentPollWindowMs) setMessage(t('paymentTimeout'));
    else void finish(payment.data);
  // finish intentionally uses current account/query client values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.data, startedAt]);

  useEffect(() => {
    if (!payment.data || !isPendingPayment(payment.data)) return;
    const remaining = paymentPollWindowMs - (Date.now() - startedAt);
    if (remaining <= 0) { setMessage(t('paymentTimeout')); return; }
    const timer = window.setTimeout(() => setMessage(t('paymentTimeout')), remaining);
    return () => window.clearTimeout(timer);
  }, [payment.data, startedAt, t]);

  useEffect(() => {
    const error = payment.error ?? history.error;
    if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error);
  }, [history.error, onUnauthorized, payment.error]);

  const create = useMutation({
    mutationFn: createBillingPayment,
    onError: (error) => {
      singleFlight.current = false;
      if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error);
      setMessage(t('paymentRetrySameAttempt'));
    },
    onSuccess: (created) => {
      singleFlight.current = false;
      const current = readPaymentAttemptForUser(account.user_id) ?? attempt;
      if (current) {
        const updated = { ...current, payment_id: created.payment_id };
        writePaymentAttempt(updated);
        setAttempt(updated);
        setStartedAt(updated.started_at);
      }
      setPaymentId(created.payment_id);
      if (created.confirmation_url) window.location.assign(created.confirmation_url);
      else if (isPendingPayment(created)) setMessage(t('paymentProcessing'));
      else void finish(created);
    }
  });

  const submit = (existing?: PaymentAttempt) => {
    if (singleFlight.current || create.isPending) return;
    if (history.data?.some(isPendingPayment) && !existing) { setMessage(t('paymentAlreadyPending')); return; }
    const current = existing ?? { version: 1 as const, user_id: account.user_id, idempotency_key: crypto.randomUUID(), started_at: Date.now() };
    writePaymentAttempt(current);
    setAttempt(current);
    setStartedAt(current.started_at);
    setMessage(t('paymentCreating'));
    singleFlight.current = true;
    create.mutate(current.idempotency_key);
  };

  useEffect(() => {
    if (recovered.current || history.isPending) return;
    recovered.current = true;
    if (initialAttempt?.payment_id) return;
    if (initialAttempt) { submit(initialAttempt); return; }
    const candidates = history.data?.filter(isPendingPayment) ?? [];
    if (candidates.length === 1) {
      const candidate = candidates[0]!;
      setPaymentId(candidate.payment_id);
      setStartedAt(paymentStartedAt(candidate));
      setMessage(t('paymentChecking'));
    } else if (candidates.length > 1) setMessage(t('paymentRecoveryAmbiguous'));
  // Recovery must execute once for the initial browser state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.isPending]);

  useEffect(() => () => { singleFlight.current = false; }, []);

  if (!account.billing) return <section className={styles.section}><h2>{t('billing')}</h2><p>{t('billingUnavailable')}</p></section>;
  const billing = account.billing;
  const canPay = billing.status !== 'past_due';
  const statusKey = `billingStatus_${billing.status}` as const;
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: billing.currency }).format(billing.monthly_amount_kopeks / 100);
  return (
    <section className={styles.section} aria-labelledby="billing-title">
      <h2 id="billing-title">{t('billing')}</h2>
      <div className={styles.card}><strong>{t(statusKey)}</strong><p>{t('billingPeriodEnd', { date: new Date(billing.current_period_end).toLocaleDateString() })}</p><p>{t('billingTerms', { amount: money, quantity: billing.slot_quantity })}</p>
        {billing.status === 'past_due' ? <p className={styles.warning}>{t('pastDueUnavailable')}</p> : <button type="button" disabled={!canPay || create.isPending || singleFlight.current} onClick={() => submit(attempt ?? undefined)}>{billing.status === 'active_paid' ? t('renewPayment') : t('payForMonth')}</button>}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {payment.isError || history.isError ? <p className={styles.error} role="alert">{t('billingLoadFailed')}</p> : null}
      <details><summary>{t('paymentHistory')}</summary><ul>{history.data?.map((item) => <li key={item.payment_id}>{new Date(item.created_at).toLocaleDateString()} · {item.status} · {new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(item.amount_kopeks / 100)}</li>)}</ul></details>
      <button className={styles.refresh} type="button" onClick={() => { void history.refetch(); if (paymentId) void payment.refetch(); }}>{t('refresh')}</button>
    </section>
  );
}

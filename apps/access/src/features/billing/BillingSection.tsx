import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountMeResponse, BillingPaymentSummary } from '@wg-paid/api';
import { deviceQuantity } from '../../i18n/deviceQuantity';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createBillingPayment, loadBillingPayment, loadBillingPayments } from '../../lib/accessApi';
import { accountKey, billingPaymentKey, billingPaymentsKey, configurationsKey } from '../account/queryKeys';
import { clearPaymentAttemptForUser, readPaymentAttemptForUser, type PaymentAttempt, writePaymentAttempt } from './paymentAttempt';
import { isPendingPayment, paymentPollingInterval, paymentPollWindowMs, resolvePendingPayments } from './paymentState';
import styles from './Billing.module.css';

interface Props { account: AccountMeResponse; onUnauthorized: (error: unknown) => void; }
type RefreshState = 'idle' | 'checking' | 'unchanged' | 'changed' | 'error';

function paymentStartedAt(payment: BillingPaymentSummary) {
  const parsed = Date.parse(payment.created_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function paymentSnapshot(payments: Array<BillingPaymentSummary> | undefined, item: BillingPaymentSummary | undefined) {
  const list = (payments ?? []).map((payment) => `${payment.payment_id}:${payment.status}:${payment.updated_at}`).sort().join('|');
  return `${list}#${item ? `${item.payment_id}:${item.status}:${item.updated_at}` : ''}`;
}

export function BillingSection({ account, onUnauthorized }: Props) {
  const { locale, t } = useLocale();
  const queryClient = useQueryClient();
  const singleFlight = useRef(false);
  const recovered = useRef(false);
  const initialAttempt = useMemo(() => readPaymentAttemptForUser(account.user_id), [account.user_id]);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(initialAttempt);
  const [paymentId, setPaymentId] = useState<string | null>(initialAttempt?.payment_id ?? null);
  const [startedAt, setStartedAt] = useState(initialAttempt?.started_at ?? Date.now());
  const [message, setMessage] = useState(() => initialAttempt?.state === 'definite_failure' ? t('paymentCreateDefiniteFailure') : '');
  const [definiteCreateFailure, setDefiniteCreateFailure] = useState(initialAttempt?.state === 'definite_failure');
  const [refreshState, setRefreshState] = useState<RefreshState>('idle');
  const history = useQuery({ queryKey: billingPaymentsKey, queryFn: loadBillingPayments, enabled: Boolean(account.billing), retry: false, refetchOnWindowFocus: true });
  const pendingResolution = resolvePendingPayments(history.data ?? []);

  const finish = async (payment: BillingPaymentSummary) => {
    if (isPendingPayment(payment)) return;
    clearPaymentAttemptForUser(account.user_id);
    setAttempt(null);
    setPaymentId(null);
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
    if (isPendingPayment(payment.data)) {
      if (Date.now() - startedAt >= paymentPollWindowMs) setMessage(t('paymentTimeout'));
      else setMessage(payment.data.confirmation_url ? '' : t('paymentResumeProcessing'));
      return;
    }
    void finish(payment.data);
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
      if (error instanceof AccessApiError && error.status === 401) { onUnauthorized(error); return; }
      if (error instanceof AccessApiError && (error.status === 409 || error.status === 502)) {
        const current = readPaymentAttemptForUser(account.user_id) ?? attempt;
        if (current) {
          const failed = { ...current, state: 'definite_failure' as const };
          writePaymentAttempt(failed);
          setAttempt(failed);
        }
        setDefiniteCreateFailure(true);
        setMessage(t('paymentCreateDefiniteFailure'));
        return;
      }
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
    if (singleFlight.current || create.isPending || definiteCreateFailure) return;
    const sameUncertainAttempt = Boolean(existing && !existing.payment_id && existing.state === 'active');
    if (pendingResolution.kind !== 'none' || paymentId) { setMessage(t('paymentAlreadyPending')); return; }
    if (!sameUncertainAttempt && !history.isSuccess) return;
    const current = existing ?? { version: 2 as const, state: 'active' as const, user_id: account.user_id, idempotency_key: crypto.randomUUID(), started_at: Date.now() };
    writePaymentAttempt(current);
    setAttempt(current);
    setStartedAt(current.started_at);
    setMessage(t('paymentCreating'));
    singleFlight.current = true;
    create.mutate(current.idempotency_key);
  };

  const abandonFailedAttempt = async () => {
    clearPaymentAttemptForUser(account.user_id);
    setAttempt(null);
    setPaymentId(null);
    setDefiniteCreateFailure(false);
    setMessage(t('paymentAttemptAbandoned'));
    create.reset();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: billingPaymentsKey })
    ]);
  };

  useEffect(() => {
    if (recovered.current || history.isPending) return;
    recovered.current = true;
    if (initialAttempt?.payment_id || initialAttempt?.state === 'definite_failure') return;
    if (history.isSuccess && pendingResolution.kind === 'one') {
      setPaymentId(pendingResolution.payment.payment_id);
      setStartedAt(paymentStartedAt(pendingResolution.payment));
      setMessage(t('paymentChecking'));
      return;
    }
    if (history.isSuccess && pendingResolution.kind === 'ambiguous') {
      return;
    }
    if (initialAttempt) submit(initialAttempt);
  // Recovery must execute once for the initial browser state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [history.isPending]);

  useEffect(() => () => { singleFlight.current = false; }, []);

  const refresh = async () => {
    if (refreshState === 'checking') return;
    const before = paymentSnapshot(history.data, payment.data);
    setRefreshState('checking');
    const [historyResult, paymentResult] = await Promise.all([
      history.refetch(),
      paymentId ? payment.refetch() : Promise.resolve(null)
    ]);
    if (historyResult.isError || paymentResult?.isError) { setRefreshState('error'); return; }
    const after = paymentSnapshot(historyResult.data, paymentResult?.data ?? payment.data);
    setRefreshState(before === after ? 'unchanged' : 'changed');
  };

  if (!account.billing) return <section className={styles.section}><h2>{t('billing')}</h2><p>{t('billingUnavailable')}</p></section>;
  const billing = account.billing;
  const canPay = billing.status !== 'past_due';
  const statusKey = `billingStatus_${billing.status}` as const;
  const money = new Intl.NumberFormat(undefined, { style: 'currency', currency: billing.currency }).format(billing.monthly_amount_kopeks / 100);
  const retryUncertain = Boolean(attempt?.state === 'active' && !attempt.payment_id && pendingResolution.kind === 'none' && !paymentId);
  const canOfferPayment = canPay && pendingResolution.kind === 'none' && !paymentId && (history.isSuccess || retryUncertain);
  const refreshMessage = refreshState === 'checking' ? t('refreshChecking')
    : refreshState === 'unchanged' ? t('refreshChecked')
      : refreshState === 'changed' ? t('refreshChanged')
        : refreshState === 'error' ? t('refreshFailed') : '';
  const paymentStatus = (status: BillingPaymentSummary['status']) => {
    if (status === 'created') return t('paymentStatus_created');
    if (status === 'pending') return t('paymentStatus_pending');
    if (status === 'succeeded') return t('paymentStatus_succeeded');
    return t('paymentStatus_canceled');
  };

  return (
    <section className={styles.section} aria-labelledby="billing-title">
      <h2 id="billing-title">{t('billing')}</h2>
      <div className={styles.card}><strong>{t(statusKey)}</strong><p>{t('billingPeriodEnd', { date: new Date(billing.current_period_end).toLocaleDateString() })}</p><p>{t('billingTerms', { amount: money, devices: deviceQuantity(billing.slot_quantity, locale) })}</p>
        {billing.status === 'past_due' ? <p className={styles.warning}>{t('pastDueUnavailable')}</p> : null}
        {canOfferPayment ? <button type="button" disabled={create.isPending || singleFlight.current || definiteCreateFailure} onClick={() => submit(attempt ?? undefined)}>{billing.status === 'active_paid' ? t('renewPayment') : t('payForMonth')}</button> : null}
        {history.isPending && !retryUncertain ? <p>{t('paymentHistoryLoading')}</p> : null}
        {history.isError && !retryUncertain ? <p className={styles.warning}>{t('paymentHistoryUnavailable')}</p> : null}
        {pendingResolution.kind === 'ambiguous' ? <p className={styles.warning}>{t('paymentRecoveryAmbiguous')}</p> : null}
        {paymentId && payment.isPending ? <p>{t('paymentChecking')}</p> : null}
        {payment.data && isPendingPayment(payment.data) && payment.data.confirmation_url ? <a className={styles.continueLink} href={payment.data.confirmation_url}>{t('continuePayment')}</a> : null}
      </div>
      {message ? <p role="status">{message}</p> : null}
      {definiteCreateFailure ? <button className={styles.refresh} type="button" onClick={() => void abandonFailedAttempt()}>{t('abandonPaymentAttempt')}</button> : null}
      {payment.isError || history.isError ? <p className={styles.error} role="alert">{t('billingLoadFailed')}</p> : null}
      <details><summary>{t('paymentHistory')}</summary><ul>{history.data?.map((item) => <li key={item.payment_id}>{new Date(item.created_at).toLocaleDateString()} · {paymentStatus(item.status)} · {new Intl.NumberFormat(undefined, { style: 'currency', currency: item.currency }).format(item.amount_kopeks / 100)}</li>)}</ul></details>
      <button className={styles.refresh} disabled={refreshState === 'checking'} type="button" onClick={() => void refresh()}>{t('refresh')}</button>
      {refreshMessage ? <p className={refreshState === 'error' ? styles.error : undefined} role="status">{refreshMessage}</p> : null}
    </section>
  );
}

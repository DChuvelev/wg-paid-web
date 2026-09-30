import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountMeResponse, BillingPaymentCreateRequest, BillingPaymentSummary, ConfigurationSummary } from '@wg-paid/api';
import { AccessApiError, createBillingPayment, loadBillingPayment, loadBillingPayments } from '../../lib/accessApi';
import { buildBillingPaymentRequest } from '../billing/billingIntent';
import { clearPaymentAttemptForUser, readPaymentAttemptForUser, type PaymentAttempt, writePaymentAttempt } from '../billing/paymentAttempt';
import { isPendingPayment, paymentPollingInterval, paymentPollWindowMs, resolvePendingPayments } from '../billing/paymentState';
import { accountKey, billingPaymentKey, billingPaymentsKey, configurationsKey } from './queryKeys';

export type ReviewPaymentMessage =
  | 'creating'
  | 'checking'
  | 'timeout'
  | 'uncertain'
  | 'definite_failure'
  | 'succeeded'
  | 'canceled'
  | null;

interface Options {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  enabled: boolean;
  onUnauthorized: (error: unknown) => void;
}

function paymentStartedAt(payment: BillingPaymentSummary) {
  const parsed = Date.parse(payment.created_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function reviewPaymentRequest(account: AccountMeResponse, configurations: Array<ConfigurationSummary>) {
  if (!account.billing) return null;
  const result = buildBillingPaymentRequest({
    action: 'renew',
    applyNow: false,
    billing: account.billing,
    billingConfigurations: configurations,
    futureChoice: null,
    retireConfigurationIds: [],
    retireNewConfigurationOrdinals: [],
    targetQuantity: 1
  });
  return result.ok ? result.body : null;
}

export function useReviewPaymentFlow({ account, configurations, enabled, onUnauthorized }: Options) {
  const queryClient = useQueryClient();
  const singleFlight = useRef(false);
  const recovered = useRef(false);
  const initialAttempt = useMemo(() => readPaymentAttemptForUser(account.user_id), [account.user_id]);
  const [attempt, setAttempt] = useState<PaymentAttempt | null>(initialAttempt);
  const [paymentId, setPaymentId] = useState<string | null>(initialAttempt?.payment_id ?? null);
  const [startedAt, setStartedAt] = useState(initialAttempt?.started_at ?? Date.now());
  const [message, setMessage] = useState<ReviewPaymentMessage>(initialAttempt?.state === 'definite_failure' ? 'definite_failure' : null);
  const [refreshing, setRefreshing] = useState(false);
  const request = useMemo(() => reviewPaymentRequest(account, configurations), [account, configurations]);

  const history = useQuery({
    queryKey: billingPaymentsKey,
    queryFn: loadBillingPayments,
    enabled,
    retry: false,
    refetchOnWindowFocus: true
  });
  const pendingResolution = resolvePendingPayments(history.data ?? []);

  const finish = async (payment: BillingPaymentSummary) => {
    if (isPendingPayment(payment)) return;
    clearPaymentAttemptForUser(account.user_id);
    setAttempt(null);
    setPaymentId(null);
    setMessage(payment.status === 'succeeded' ? 'succeeded' : 'canceled');
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: configurationsKey }),
      queryClient.invalidateQueries({ queryKey: billingPaymentsKey })
    ]);
  };

  const payment = useQuery({
    queryKey: paymentId ? billingPaymentKey(paymentId) : [...billingPaymentsKey, 'review-none'],
    queryFn: () => loadBillingPayment(paymentId!),
    enabled: enabled && Boolean(paymentId),
    retry: false,
    refetchInterval: ({ state }) => paymentPollingInterval(state.data, startedAt)
  });

  useEffect(() => {
    if (!payment.data) return;
    if (isPendingPayment(payment.data)) {
      setMessage(Date.now() - startedAt >= paymentPollWindowMs ? 'timeout' : 'checking');
      return;
    }
    void finish(payment.data);
  // finish deliberately uses current account and query client values.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [payment.data, startedAt]);

  useEffect(() => {
    if (!payment.data || !isPendingPayment(payment.data)) return;
    const remaining = paymentPollWindowMs - (Date.now() - startedAt);
    if (remaining <= 0) { setMessage('timeout'); return; }
    const timer = window.setTimeout(() => setMessage('timeout'), remaining);
    return () => window.clearTimeout(timer);
  }, [payment.data, startedAt]);

  useEffect(() => {
    const error = payment.error ?? history.error;
    if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error);
  }, [history.error, onUnauthorized, payment.error]);

  const create = useMutation({
    mutationFn: ({ idempotencyKey, body }: { idempotencyKey: string; body: BillingPaymentCreateRequest }) => createBillingPayment(idempotencyKey, body),
    onError: (error) => {
      singleFlight.current = false;
      if (error instanceof AccessApiError && error.status === 401) { onUnauthorized(error); return; }
      if (error instanceof AccessApiError && (error.status === 409 || error.status === 422 || error.status === 502)) {
        const current = readPaymentAttemptForUser(account.user_id) ?? attempt;
        if (current) {
          const failed = { ...current, state: 'definite_failure' as const };
          writePaymentAttempt(failed);
          setAttempt(failed);
        }
        setMessage('definite_failure');
        return;
      }
      setMessage('uncertain');
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
      else if (isPendingPayment(created)) setMessage('checking');
      else void finish(created);
    }
  });

  const submit = (existing?: PaymentAttempt) => {
    if (!enabled || !request || singleFlight.current || create.isPending || attempt?.state === 'definite_failure') return;
    const sameUncertainAttempt = Boolean(existing && !existing.payment_id && existing.state === 'active');
    if (pendingResolution.kind !== 'none' || paymentId) return;
    if (!sameUncertainAttempt && !history.isSuccess) return;
    const current = existing ?? {
      version: 3 as const,
      state: 'active' as const,
      user_id: account.user_id,
      idempotency_key: crypto.randomUUID(),
      started_at: Date.now(),
      request
    };
    if (!current.request) return;
    writePaymentAttempt(current);
    setAttempt(current);
    setStartedAt(current.started_at);
    setMessage('creating');
    singleFlight.current = true;
    create.mutate({ idempotencyKey: current.idempotency_key, body: current.request });
  };

  useEffect(() => {
    if (!enabled || recovered.current || history.isPending) return;
    recovered.current = true;
    if (initialAttempt?.payment_id || initialAttempt?.state === 'definite_failure') return;
    if (history.isSuccess && pendingResolution.kind === 'one') {
      setPaymentId(pendingResolution.payment.payment_id);
      setStartedAt(paymentStartedAt(pendingResolution.payment));
      setMessage('checking');
      return;
    }
    if (history.isSuccess && pendingResolution.kind === 'none' && initialAttempt) submit(initialAttempt);
  // Recovery runs once for the initial browser state.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, history.isPending]);

  useEffect(() => () => { singleFlight.current = false; }, []);

  const checkStatus = async () => {
    if (refreshing) return;
    setRefreshing(true);
    const [historyResult, paymentResult] = await Promise.all([
      history.refetch(),
      paymentId ? payment.refetch() : Promise.resolve(null)
    ]);
    const error = historyResult.error ?? paymentResult?.error;
    if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error);
    setRefreshing(false);
  };

  const abandonDefiniteFailure = async () => {
    clearPaymentAttemptForUser(account.user_id);
    setAttempt(null);
    setPaymentId(null);
    setMessage(null);
    create.reset();
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: billingPaymentsKey })
    ]);
  };

  const exactPending = payment.data && isPendingPayment(payment.data) ? payment.data : undefined;
  const historyPending = pendingResolution.kind === 'one' ? pendingResolution.payment : undefined;
  const retryUncertain = Boolean(attempt?.state === 'active' && !attempt.payment_id && pendingResolution.kind === 'none' && !paymentId);
  const canCreate = Boolean(enabled && request && history.isSuccess && !history.isFetching
    && pendingResolution.kind === 'none' && !paymentId && !attempt && message !== 'succeeded');

  return {
    ambiguous: pendingResolution.kind === 'ambiguous',
    canCreate,
    checkStatus,
    checking: refreshing || payment.isFetching,
    confirmationUrl: exactPending?.confirmation_url ?? null,
    createPayment: () => submit(),
    definiteFailure: attempt?.state === 'definite_failure',
    historyError: history.isError,
    historyPending: history.isPending,
    message,
    payment: exactPending ?? historyPending,
    retrySameAttempt: () => { if (attempt) submit(attempt); },
    retryUncertain,
    abandonDefiniteFailure
  };
}

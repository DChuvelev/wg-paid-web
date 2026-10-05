import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AccountMeResponse, BillingPaymentCreateRequest, BillingPaymentSummary, ConfigurationSummary } from '@wg-paid/api';
import { configurationQuantity, deviceQuantityForAccess } from '../../i18n/deviceQuantity';
import { useLocale } from '../../i18n/localeContext';
import {
  AccessApiError,
  createBillingPayment,
  loadBillingPayment,
  loadBillingPayments,
  updateBillingPendingRetirements
} from '../../lib/accessApi';
import { accountKey, billingPaymentKey, billingPaymentsKey, configurationsKey } from '../account/queryKeys';
import { BillingControls } from './BillingControls';
import { availableBillingActions, billingProjectionIsCoherent, classifyCurrentQuantityPeriod, selectBillingConfigurations } from './billingIntent';
import { PendingPaymentCard } from './PendingPaymentCard';
import { clearPaymentAttemptForUser, readPaymentAttemptForUser, type PaymentAttempt, writePaymentAttempt } from './paymentAttempt';
import { isPendingPayment, paymentPollingInterval, paymentPollWindowMs, pendingPaymentAllowsRetirementReselection, resolvePendingPayments } from './paymentState';
import { RetirementPicker } from './RetirementPicker';
import styles from './Billing.module.css';
import { useCommercialHelp, useHelpAnchor, useHelpBlocker } from '../help/helpContext';
import type { TranslationKey } from '../../i18n/resources';

interface Props {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  onUnauthorized: (error: unknown) => void;
}
type RefreshState = 'idle' | 'checking' | 'unchanged' | 'changed' | 'error';

function paymentStartedAt(payment: BillingPaymentSummary) {
  const parsed = Date.parse(payment.created_at);
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function paymentSnapshot(payments: Array<BillingPaymentSummary> | undefined, item: BillingPaymentSummary | undefined) {
  const list = (payments ?? []).map((payment) => `${payment.payment_id}:${payment.status}:${payment.updated_at}`).sort().join('|');
  return `${list}#${item ? `${item.payment_id}:${item.status}:${item.updated_at}` : ''}`;
}

export function BillingSection({ account, configurations, onUnauthorized }: Props) {
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
  const [editingRetirements, setEditingRetirements] = useState(false);
  const [retirementIds, setRetirementIds] = useState<Array<string>>([]);
  const [retirementMessage, setRetirementMessage] = useState('');
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
      else setMessage('');
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
    mutationFn: ({ idempotencyKey, request }: { idempotencyKey: string; request?: BillingPaymentCreateRequest }) => createBillingPayment(idempotencyKey, request),
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
      else if (isPendingPayment(created)) setMessage('');
      else void finish(created);
    }
  });

  const submit = (request?: BillingPaymentCreateRequest, existing?: PaymentAttempt) => {
    if (singleFlight.current || create.isPending || definiteCreateFailure) return;
    const sameUncertainAttempt = Boolean(existing && !existing.payment_id && existing.state === 'active');
    if (pendingResolution.kind !== 'none' || paymentId) { setMessage(t('paymentAlreadyPending')); return; }
    if (!sameUncertainAttempt && !history.isSuccess) return;
    const current = existing ?? {
      version: 3 as const,
      state: 'active' as const,
      user_id: account.user_id,
      idempotency_key: crypto.randomUUID(),
      started_at: Date.now(),
      request
    };
    writePaymentAttempt(current);
    setAttempt(current);
    setStartedAt(current.started_at);
    setMessage(t('paymentCreating'));
    singleFlight.current = true;
    create.mutate({ idempotencyKey: current.idempotency_key, request: current.request });
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
    if (history.isSuccess && pendingResolution.kind === 'ambiguous') return;
    if (initialAttempt) submit(undefined, initialAttempt);
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

  const retirementMutation = useMutation({
    mutationFn: updateBillingPendingRetirements,
    onError: (error) => {
      if (error instanceof AccessApiError && error.status === 401) onUnauthorized(error);
      setRetirementMessage(t('billingRetirementsFailed'));
    },
    onSuccess: async (result) => {
      setEditingRetirements(false);
      setRetirementMessage(t('billingRetirementsSaved', { date: formatDateTime(result.effective_at) }));
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: accountKey }),
        queryClient.invalidateQueries({ queryKey: configurationsKey })
      ]);
    }
  });

  const formatDate = (value: string) => new Date(value).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US');
  const formatDateTime = (value: string) => new Date(value).toLocaleString(locale === 'ru' ? 'ru-RU' : 'en-US');
  const money = (kopeks: number, currency: string) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', { style: 'currency', currency }).format(kopeks / 100);

  const billing = account.billing;
  const billingConfigurations = billing ? selectBillingConfigurations(billing, configurations) : [];
  const coherent = Boolean(billing && billingProjectionIsCoherent(billing, billingConfigurations));
  const currentPeriodPresentation = billing ? classifyCurrentQuantityPeriod(billing, history.isSuccess ? history.data : undefined) : 'unknown';
  const helpResolved = coherent && history.isSuccess && !payment.isFetching && !payment.isError;
  const helpBusy = create.isPending || retirementMutation.isPending || refreshState === 'checking' || editingRetirements
    || Boolean(attempt?.state === 'active' && !paymentId) || pendingResolution.kind === 'ambiguous' || Boolean(paymentId && payment.isPending);
  const now = Date.now();
  const quantityStart = Date.parse(billing?.quantity_period_start ?? '');
  const quantityEnd = Date.parse(billing?.quantity_period_end ?? '');
  const genuineTrial = helpResolved && currentPeriodPresentation === 'trial' && Number.isFinite(quantityStart) && Number.isFinite(quantityEnd) && quantityStart <= now && now < quantityEnd;
  const paidEnd = Date.parse(billing?.current_period_end ?? '');
  const genuinePaid = helpResolved && currentPeriodPresentation === 'paid' && Number.isFinite(paidEnd) && paidEnd > now;
  const helpNextPaid = helpResolved && billing?.pending_slot_quantity !== null && billing?.pending_period_start !== null
    && billing?.pending_period_end !== null && billing?.pending_monthly_amount_kopeks !== null;
  const helpBodies: TranslationKey[] = [genuineTrial ? 'helpTrialState' : genuinePaid ? 'helpPaidState' : 'helpUnknownState'];
  if (helpNextPaid) helpBodies.push('helpNextPaidState');
  if (helpResolved && billing && pendingResolution.kind === 'none' && !paymentId && availableBillingActions(billing).length > 0
    && billing.max_slot_quantity > (billing.pending_slot_quantity ?? billing.slot_quantity)) helpBodies.push('helpMoreDevices');
  const currentHelpAnchor = useHelpAnchor('billing', { bodyKeys: helpBodies, values: {
    endDate: genuineTrial ? formatDate(billing!.quantity_period_end) : genuinePaid ? formatDate(billing!.current_period_end) : '',
    quantity: genuineTrial ? deviceQuantityForAccess(billing?.slot_quantity ?? 0, locale) : configurationQuantity(billing?.slot_quantity ?? 0, locale), nextQuantity: configurationQuantity(billing?.pending_slot_quantity ?? 0, locale)
  } });
  const nextHelpAnchor = useHelpAnchor('billingNextPeriod');
  const retirementHelpAnchor = useHelpAnchor('billingRetirement');
  useCommercialHelp({ resolved: helpResolved, scope: billing?.access_grant_id ?? '', count: billingConfigurations.length, paid: genuinePaid,
    succeededPayments: history.data?.filter((item) => item.status === 'succeeded' && item.succeeded_at !== null).length ?? 0 });
  useHelpBlocker(helpBusy || history.isPending);
  if (!billing) return <section {...currentHelpAnchor} className={styles.section}><h2>{t('billing')}</h2><p>{t('billingUnavailable')}</p></section>;
  const statusKey = `billingStatus_${billing.status}` as const;
  const retryUncertain = Boolean(attempt?.state === 'active' && !attempt.payment_id && pendingResolution.kind === 'none' && !paymentId);
  const controlsAvailable = history.isSuccess && pendingResolution.kind === 'none' && !paymentId;
  const refreshMessage = refreshState === 'checking' ? t('refreshChecking')
    : refreshState === 'unchanged' ? t('refreshChecked')
      : refreshState === 'changed' ? t('refreshChanged')
        : refreshState === 'error' ? t('refreshFailed') : '';
  const paymentStatus = (status: BillingPaymentSummary['status']) => status === 'created' ? t('paymentStatus_created')
    : status === 'pending' ? t('paymentStatus_pending')
      : status === 'succeeded' ? t('paymentStatus_succeeded') : t('paymentStatus_canceled');
  const pendingExists = billing.pending_slot_quantity !== null
    && billing.pending_period_start !== null
    && billing.pending_period_end !== null
    && billing.pending_monthly_amount_kopeks !== null;
  const retirementRequired = pendingExists ? Math.max(0, billing.slot_quantity - billing.pending_slot_quantity!) : 0;
  const retirementConfigurations = billing.retirement_configuration_ids.map((id) => billingConfigurations.find((item) => item.configuration_id === id)).filter((item): item is ConfigurationSummary => Boolean(item));
  const retirementPolicy = !history.isSuccess ? 'unknown'
    : pendingResolution.kind === 'none' ? 'allowed'
      : pendingResolution.kind === 'one' && pendingPaymentAllowsRetirementReselection(pendingResolution.payment, billing) ? 'safe'
        : 'blocked';
  const retirementEditingAllowed = retirementPolicy === 'allowed' || retirementPolicy === 'safe';
  const itemPendingPayment = payment.data && isPendingPayment(payment.data) ? payment.data : undefined;
  const historyPendingPayment = pendingResolution.kind === 'one' ? pendingResolution.payment : undefined;
  const pendingDisplayPayment = itemPendingPayment ?? historyPendingPayment;
  const showPendingPayment = pendingResolution.kind === 'ambiguous' || Boolean(pendingDisplayPayment) || Boolean(paymentId && payment.isPending);
  const authoritativeConfirmationUrl = itemPendingPayment?.confirmation_url ?? null;

  return (
    <section className={styles.section} aria-labelledby="billing-title">
      <h2 id="billing-title">{t('billing')}</h2>
      <div {...currentHelpAnchor}>
      <div className={styles.projectionGrid}>
        <article className={styles.card}>
          {currentPeriodPresentation === 'trial' ? (
            <>
              <h3>{t('billingCurrentTrialTitle')}</h3>
              <strong>{configurationQuantity(billing.slot_quantity, locale)}</strong>
              <p>{t('billingTrialEnds', { date: formatDate(billing.quantity_period_end) })}</p>
            </>
          ) : billing.status === 'active_paid' && currentPeriodPresentation === 'unknown' ? (
            <>
              <h3>{t('billingCurrentTitle')}</h3>
              <strong>{configurationQuantity(billing.slot_quantity, locale)}</strong>
              <p>{t('billingCurrentQuantityUntil', { date: formatDate(billing.quantity_period_end) })}</p>
            </>
          ) : (
            <>
              <h3>{t('billingCurrentTitle')}</h3>
              <strong>{t(statusKey)}</strong>
              <p>{t('billingTerms', { amount: money(billing.monthly_amount_kopeks, billing.currency), configurations: configurationQuantity(billing.slot_quantity, locale) })}</p>
              <p>{t('billingCurrentQuantityPeriod', { start: formatDate(billing.quantity_period_start), end: formatDate(billing.quantity_period_end) })}</p>
              <p>{t('billingPaidThrough', { date: formatDateTime(billing.current_period_end) })}</p>
              {billing.status === 'past_due' ? <p className={styles.warning}>{t('pastDueUnavailable')}</p> : null}
            </>
          )}
        </article>
        {pendingExists ? (
          <article {...nextHelpAnchor} className={styles.card}>
            <h3>{t('billingNextTitle')}</h3>
            <strong>{t('billingNextSummary', {
              amount: money(billing.pending_monthly_amount_kopeks!, billing.currency),
              configurations: configurationQuantity(billing.pending_slot_quantity!, locale)
            })}</strong>
            <p>{t('billingPeriodRange', { start: formatDate(billing.pending_period_start!), end: formatDate(billing.pending_period_end!) })}</p>
            {coherent && retirementConfigurations.length ? (
              <div {...retirementHelpAnchor} className={styles.scheduledRetirements}>
                <strong>{t('billingScheduledRetirements', { date: formatDateTime(billing.pending_period_start!) })}</strong>
                <ul>{retirementConfigurations.map((configuration) => <li key={configuration.configuration_id}>{configuration.label?.trim() || t('billingConfiguration', { number: configuration.ordinal })}{configuration.label?.trim() ? ` · ${t('billingConfiguration', { number: configuration.ordinal })}` : ''}</li>)}</ul>
                {retirementPolicy === 'safe' ? <p className={styles.notice}>{t('paymentRetirementSafe')}</p> : null}
                {retirementPolicy === 'blocked' ? <p className={styles.warning}>{t('paymentRetirementBlocked')}</p> : null}
                {retirementPolicy === 'unknown' ? <p className={styles.warning}>{t('paymentRetirementUnknown')}</p> : null}
                <button className={styles.refresh} type="button" disabled={!retirementEditingAllowed} onClick={() => { if (!retirementEditingAllowed) return; setRetirementIds(billing.retirement_configuration_ids); setEditingRetirements(true); setRetirementMessage(''); }}>{t('billingEditRetirements')}</button>
              </div>
            ) : null}
          </article>
        ) : null}
      </div>

      {!coherent ? <p className={styles.error} role="alert">{t('billingProjectionInvalid')}</p> : null}
      {coherent && controlsAvailable ? (
        <BillingControls
          billing={billing}
          configurations={billingConfigurations}
          disabled={create.isPending || singleFlight.current || Boolean(attempt)}
          onSubmit={(body) => submit(body)}
        />
      ) : null}
      {retryUncertain ? <button className={styles.primaryAction} type="button" disabled={create.isPending || singleFlight.current} onClick={() => submit(undefined, attempt!)}>{t('paymentRetryButton')}</button> : null}
      {history.isPending && !retryUncertain ? <p>{t('paymentHistoryLoading')}</p> : null}
      {history.isError && !retryUncertain ? <p className={styles.warning}>{t('paymentHistoryUnavailable')}</p> : null}
      {showPendingPayment ? (
        <PendingPaymentCard
          ambiguous={pendingResolution.kind === 'ambiguous'}
          checking={refreshState === 'checking' || payment.isFetching}
          confirmationUrl={authoritativeConfirmationUrl}
          payment={pendingDisplayPayment}
          onCheck={() => void refresh()}
        />
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {definiteCreateFailure ? <button className={styles.refresh} type="button" onClick={() => void abandonFailedAttempt()}>{t('abandonPaymentAttempt')}</button> : null}
      {payment.isError || history.isError ? <p className={styles.error} role="alert">{t('billingLoadFailed')}</p> : null}

      {editingRetirements ? (
        <div className={styles.retirementEditor}>
          <RetirementPicker
            configurations={billingConfigurations}
            keep
            disabled={retirementMutation.isPending || !retirementEditingAllowed}
            required={retirementRequired}
            selectedConfigurationIds={retirementIds}
            selectedNewOrdinals={[]}
            onChange={(ids) => { setRetirementIds(ids); setRetirementMessage(''); }}
          />
          <div className={styles.editorActions}>
            <button type="button" disabled={retirementMutation.isPending || !retirementEditingAllowed || retirementIds.length !== retirementRequired} onClick={() => { if (retirementEditingAllowed) retirementMutation.mutate(retirementIds); }}>{t('billingSaveRetirements')}</button>
            <button className={styles.refresh} type="button" disabled={retirementMutation.isPending} onClick={() => setEditingRetirements(false)}>{t('cancel')}</button>
          </div>
        </div>
      ) : null}
      {retirementMessage ? <p className={retirementMutation.isError ? styles.error : styles.selectionValid} role={retirementMutation.isError ? 'alert' : 'status'}>{retirementMessage}</p> : null}

      </div>
      <details><summary>{t('paymentHistory')}</summary><ul>{history.data?.map((item) => <li key={item.payment_id}>{formatDate(item.created_at)} · {paymentStatus(item.status)} · {money(item.amount_kopeks, item.currency)} · {t('billingPaymentQuantity', { before: configurationQuantity(item.quantity_before, locale), after: configurationQuantity(item.quantity_after, locale) })}</li>)}</ul></details>
      {!showPendingPayment ? <button className={styles.refresh} disabled={refreshState === 'checking'} type="button" onClick={() => void refresh()}>{t('refresh')}</button> : null}
      {refreshMessage ? <p className={refreshState === 'error' ? styles.error : undefined} role="status">{refreshMessage}</p> : null}
    </section>
  );
}

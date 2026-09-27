import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { BillingAccountSummary, BillingPaymentCreateRequest, ConfigurationSummary } from '@wg-paid/api';
import { configurationQuantity } from '../../i18n/deviceQuantity';
import { useLocale } from '../../i18n/localeContext';
import { availableBillingActions, buildBillingPaymentRequest, type BillingAction, type FutureChoice } from './billingIntent';
import { RetirementPicker } from './RetirementPicker';
import styles from './Billing.module.css';

interface Props {
  billing: BillingAccountSummary;
  configurations: Array<ConfigurationSummary>;
  disabled: boolean;
  onSubmit: (body: BillingPaymentCreateRequest) => void;
}

function initialTarget(action: BillingAction, billing: BillingAccountSummary) {
  if (action === 'add_now') return Math.min(billing.max_slot_quantity, billing.slot_quantity + 1);
  if (action === 'top_up_next') return Number.NaN;
  return billing.slot_quantity;
}

export function BillingControls({ billing, configurations, disabled, onSubmit }: Props) {
  const { locale, t } = useLocale();
  const actions = useMemo(() => availableBillingActions(billing), [billing]);
  const firstAction = actions[0] ?? 'renew';
  const [action, setAction] = useState<BillingAction>(firstAction);
  const [targetQuantity, setTargetQuantity] = useState(initialTarget(firstAction, billing));
  const [applyNow, setApplyNow] = useState(false);
  const [futureChoice, setFutureChoice] = useState<FutureChoice>(null);
  const [retireConfigurationIds, setRetireConfigurationIds] = useState<Array<string>>([]);
  const [retireNewConfigurationOrdinals, setRetireNewConfigurationOrdinals] = useState<Array<number>>([]);
  const [error, setError] = useState('');

  const reset = (nextAction: BillingAction) => {
    setAction(nextAction);
    setTargetQuantity(initialTarget(nextAction, billing));
    setApplyNow(false);
    setFutureChoice(null);
    setRetireConfigurationIds([]);
    setRetireNewConfigurationOrdinals([]);
    setError('');
  };

  useEffect(() => {
    const next = availableBillingActions(billing)[0] ?? 'renew';
    reset(next);
  // Reset drafts only when the authoritative billing projection changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.access_grant_id, billing.slot_quantity, billing.pending_slot_quantity, billing.min_slot_quantity, billing.max_slot_quantity, billing.can_renew, billing.can_add_devices_now, billing.status]);

  const min = action === 'add_now' ? billing.slot_quantity + 1
    : action === 'top_up_next' && billing.pending_slot_quantity !== null ? billing.pending_slot_quantity + 1
      : billing.min_slot_quantity;
  const pendingNeedsChoice = action === 'add_now'
    && billing.pending_slot_quantity !== null
    && billing.pending_slot_quantity < targetQuantity;
  const existingRetirementCount = action === 'renew' && billing.status !== 'expired'
    ? Math.max(0, billing.slot_quantity - targetQuantity)
    : action === 'top_up_next' ? Math.max(0, billing.slot_quantity - targetQuantity)
      : 0;
  const mixedRetirementCount = action === 'add_now' && pendingNeedsChoice && futureChoice === 'keep_paid'
    ? targetQuantity - billing.pending_slot_quantity!
    : 0;
  const requiredRetirements = Math.max(existingRetirementCount, mixedRetirementCount);
  const showPicker = requiredRetirements > 0;
  const newConfigurationCount = action === 'add_now' ? targetQuantity - billing.slot_quantity : 0;
  const topUpTargets = action === 'top_up_next' && billing.pending_slot_quantity !== null
    ? Array.from(
      { length: Math.max(0, billing.max_slot_quantity - billing.pending_slot_quantity) },
      (_, index) => billing.pending_slot_quantity! + index + 1
    )
    : [];
  const topUpDelta = action === 'top_up_next'
    && billing.pending_slot_quantity !== null
    && Number.isInteger(targetQuantity)
    ? (targetQuantity - billing.pending_slot_quantity) * billing.extra_slot_monthly_kopeks
    : null;
  const money = (kopeks: number) => new Intl.NumberFormat(locale === 'ru' ? 'ru-RU' : 'en-US', {
    style: 'currency', currency: billing.currency, maximumFractionDigits: 0
  }).format(kopeks / 100);
  const boundary = billing.pending_period_start
    ? new Date(billing.pending_period_start).toLocaleDateString(locale === 'ru' ? 'ru-RU' : 'en-US')
    : '';
  const intent = useMemo(() => buildBillingPaymentRequest({
    action,
    applyNow,
    billing,
    billingConfigurations: configurations,
    futureChoice,
    retireConfigurationIds,
    retireNewConfigurationOrdinals,
    targetQuantity
  }), [action, applyNow, billing, configurations, futureChoice, retireConfigurationIds, retireNewConfigurationOrdinals, targetQuantity]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!intent.ok) {
      if (intent.reason === 'incoherent_projection' || intent.reason === 'action_unavailable') {
        setError(t(intent.reason === 'incoherent_projection' ? 'billingProjectionInvalid' : 'billingActionUnavailable'));
      }
      return;
    }
    setError('');
    onSubmit(intent.body);
  };

  if (actions.length === 0) return null;

  return (
    <form className={styles.controls} onSubmit={submit}>
      {actions.length >= 2 ? (
        <fieldset disabled={disabled}>
          <legend>{t('billingQuantityManaged')}</legend>
          <div className={styles.actionChoices}>
            {actions.map((item) => (
              <label key={item}>
                <input checked={action === item} name="billing-action" type="radio" value={item} onChange={() => reset(item)} />
                <span>{t(item === 'renew' ? 'billingActionRenew' : item === 'add_now' ? 'billingActionAddNow' : 'billingActionTopUpNext')}</span>
              </label>
            ))}
          </div>
        </fieldset>
      ) : null}

      {action === 'top_up_next' ? (
        <fieldset className={styles.topUpFieldset} disabled={disabled}>
          <legend>{t('billingTopUpPrompt', { date: boundary })}</legend>
          <div className={styles.topUpOptions}>
            {topUpTargets.map((target) => {
              const delta = (target - billing.pending_slot_quantity!) * billing.extra_slot_monthly_kopeks;
              const labelKey = target === billing.slot_quantity ? 'billingTopUpKeepAll' : 'billingTopUpKeep';
              return (
                <button
                  aria-pressed={targetQuantity === target}
                  className={targetQuantity === target ? styles.topUpOptionSelected : styles.topUpOption}
                  key={target}
                  type="button"
                  onClick={() => {
                    setTargetQuantity(target);
                    setApplyNow(false);
                    setFutureChoice(null);
                    setRetireConfigurationIds([]);
                    setRetireNewConfigurationOrdinals([]);
                    setError('');
                  }}
                >
                  {t(labelKey, { amount: money(delta), configurations: configurationQuantity(target, locale) })}
                </button>
              );
            })}
          </div>
        </fieldset>
      ) : (
        <label className={styles.quantityField}>
          <span>{t('billingTargetQuantity')}</span>
          <input
            disabled={disabled}
            inputMode="numeric"
            max={billing.max_slot_quantity}
            min={min}
            step="1"
            type="number"
            value={Number.isNaN(targetQuantity) ? '' : targetQuantity}
            onChange={(event) => {
              setTargetQuantity(event.target.valueAsNumber);
              setApplyNow(false);
              setFutureChoice(null);
              setRetireConfigurationIds([]);
              setRetireNewConfigurationOrdinals([]);
              setError('');
            }}
          />
          <small>{min}–{billing.max_slot_quantity}</small>
        </label>
      )}

      {action === 'renew' && billing.status === 'trial' && targetQuantity > billing.slot_quantity ? (
        <p className={styles.notice}>{t('billingTrialRenewImmediate')}</p>
      ) : null}

      {action === 'top_up_next' && !billing.can_add_devices_now && targetQuantity > billing.slot_quantity ? (
        <p className={styles.notice}>{t('billingTrialTopUpImmediate')}</p>
      ) : null}

      {action === 'renew' && targetQuantity > billing.slot_quantity && billing.status === 'active_paid' && billing.can_add_devices_now ? (
        <label className={styles.checkChoice}>
          <input checked={applyNow} disabled={disabled} type="checkbox" onChange={(event) => setApplyNow(event.target.checked)} />
          <span>{t('billingApplyNow')}</span>
        </label>
      ) : null}

      {pendingNeedsChoice ? (
        <fieldset disabled={disabled}>
          <legend>{t('billingFutureChoice')}</legend>
          <div className={styles.actionChoices}>
            <label><input checked={futureChoice === 'preserve'} name="future-choice" type="radio" onChange={() => { setFutureChoice('preserve'); setRetireConfigurationIds([]); setRetireNewConfigurationOrdinals([]); }} /><span>{t('billingFuturePreserve')}</span></label>
            <label><input checked={futureChoice === 'keep_paid'} name="future-choice" type="radio" onChange={() => { setFutureChoice('keep_paid'); setRetireConfigurationIds([]); setRetireNewConfigurationOrdinals([]); }} /><span>{t('billingFutureKeepPaid')}</span></label>
          </div>
        </fieldset>
      ) : null}

      {showPicker ? (
        <RetirementPicker
          configurations={configurations}
          disabled={disabled}
          newConfigurationCount={mixedRetirementCount ? newConfigurationCount : 0}
          required={requiredRetirements}
          selectedConfigurationIds={retireConfigurationIds}
          selectedNewOrdinals={retireNewConfigurationOrdinals}
          onChange={(ids, ordinals) => { setRetireConfigurationIds(ids); setRetireNewConfigurationOrdinals(ordinals); setError(''); }}
        />
      ) : null}

      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <button type="submit" disabled={disabled || !intent.ok}>
        {action === 'top_up_next' && topUpDelta !== null
          ? t('billingTopUpSubmit', { amount: money(topUpDelta) })
          : t('billingSubmitPayment')}
      </button>
    </form>
  );
}

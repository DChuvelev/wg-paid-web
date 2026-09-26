import { type FormEvent, useEffect, useMemo, useState } from 'react';
import type { BillingAccountSummary, BillingPaymentCreateRequest, ConfigurationSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { buildBillingPaymentRequest, type BillingAction, type FutureChoice } from './billingIntent';
import { RetirementPicker } from './RetirementPicker';
import styles from './Billing.module.css';

interface Props {
  billing: BillingAccountSummary;
  configurations: Array<ConfigurationSummary>;
  disabled: boolean;
  onSubmit: (body: BillingPaymentCreateRequest) => void;
}

function initialAction(billing: BillingAccountSummary): BillingAction {
  if (billing.can_renew && billing.pending_slot_quantity === null) return 'renew';
  if (billing.status === 'active_paid' && billing.can_add_devices_now && billing.slot_quantity < billing.max_slot_quantity) return 'add_now';
  return 'top_up_next';
}

function initialTarget(action: BillingAction, billing: BillingAccountSummary) {
  return action === 'add_now' ? Math.min(billing.max_slot_quantity, billing.slot_quantity + 1) : billing.slot_quantity;
}

export function BillingControls({ billing, configurations, disabled, onSubmit }: Props) {
  const { t } = useLocale();
  const firstAction = initialAction(billing);
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
    const next = initialAction(billing);
    reset(next);
  // Reset drafts only when the authoritative billing projection changes.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [billing.access_grant_id, billing.slot_quantity, billing.pending_slot_quantity, billing.min_slot_quantity, billing.max_slot_quantity, billing.can_renew, billing.can_add_devices_now, billing.status]);

  const actions = useMemo(() => {
    const available: Array<BillingAction> = [];
    if (billing.can_renew && billing.pending_slot_quantity === null) available.push('renew');
    if (billing.status === 'active_paid' && billing.can_add_devices_now && billing.slot_quantity < billing.max_slot_quantity) available.push('add_now');
    if (billing.pending_slot_quantity !== null && billing.pending_slot_quantity < billing.slot_quantity) available.push('top_up_next');
    return available;
  }, [billing]);

  if (actions.length === 0) return null;

  const min = action === 'add_now' ? billing.slot_quantity + 1 : billing.min_slot_quantity;
  const pendingNeedsChoice = action === 'add_now'
    && billing.pending_slot_quantity !== null
    && billing.pending_slot_quantity < targetQuantity;
  const existingRetirementCount = action === 'renew' && billing.status !== 'expired'
    ? Math.max(0, billing.slot_quantity - targetQuantity)
    : 0;
  const mixedRetirementCount = action === 'add_now' && pendingNeedsChoice && futureChoice === 'keep_paid'
    ? targetQuantity - billing.pending_slot_quantity!
    : 0;
  const requiredRetirements = Math.max(existingRetirementCount, mixedRetirementCount);
  const showPicker = requiredRetirements > 0;
  const newConfigurationCount = action === 'add_now' ? targetQuantity - billing.slot_quantity : 0;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const result = buildBillingPaymentRequest({
      action,
      applyNow,
      billing,
      billingConfigurations: configurations,
      futureChoice,
      retireConfigurationIds,
      retireNewConfigurationOrdinals,
      targetQuantity
    });
    if (!result.ok) {
      setError(t(result.reason === 'incoherent_projection' ? 'billingProjectionInvalid'
        : result.reason === 'invalid_quantity' ? 'billingInvalidQuantity'
          : result.reason === 'invalid_retirement_selection' ? 'billingInvalidRetirements'
            : 'billingActionUnavailable'));
      return;
    }
    setError('');
    onSubmit(result.body);
  };

  return (
    <form className={styles.controls} onSubmit={submit}>
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

      {action !== 'top_up_next' ? (
        <label className={styles.quantityField}>
          <span>{t('billingTargetQuantity')}</span>
          <input
            disabled={disabled}
            inputMode="numeric"
            max={billing.max_slot_quantity}
            min={min}
            step="1"
            type="number"
            value={targetQuantity}
            onChange={(event) => {
              setTargetQuantity(event.target.valueAsNumber);
              setApplyNow(false);
              setFutureChoice(null);
              setRetireConfigurationIds([]);
              setRetireNewConfigurationOrdinals([]);
              setError('');
            }}
          />
          <small>{billing.min_slot_quantity}–{billing.max_slot_quantity}</small>
        </label>
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
      <button type="submit" disabled={disabled}>{t('billingSubmitPayment')}</button>
    </form>
  );
}

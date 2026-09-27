import type { BillingAccountSummary, BillingPaymentCreateRequest, ConfigurationSummary } from '@wg-paid/api';

export type BillingAction = 'renew' | 'add_now' | 'top_up_next';
export type FutureChoice = 'preserve' | 'keep_paid' | null;

export interface BillingIntentInput {
  action: BillingAction;
  applyNow: boolean;
  billing: BillingAccountSummary;
  billingConfigurations: Array<ConfigurationSummary>;
  futureChoice: FutureChoice;
  retireConfigurationIds: Array<string>;
  retireNewConfigurationOrdinals: Array<number>;
  targetQuantity: number;
}

export type BillingIntentResult =
  | { ok: true; body: BillingPaymentCreateRequest }
  | { ok: false; reason: 'action_unavailable' | 'incoherent_projection' | 'invalid_quantity' | 'invalid_retirement_selection' };

function unique<T>(values: Array<T>) {
  return new Set(values).size === values.length;
}

export function pendingProjectionIsCoherent(billing: BillingAccountSummary) {
  const values = [billing.pending_slot_quantity, billing.pending_period_start, billing.pending_period_end, billing.pending_monthly_amount_kopeks];
  return values.every((value) => value === null) || values.every((value) => value !== null);
}

export function selectBillingConfigurations(
  billing: BillingAccountSummary,
  configurations: Array<ConfigurationSummary>
) {
  return configurations.filter((configuration) => configuration.access_grant_id === billing.access_grant_id);
}

export function billingProjectionIsCoherent(
  billing: BillingAccountSummary,
  configurations: Array<ConfigurationSummary>
) {
  const configurationIds = configurations.map((configuration) => configuration.configuration_id);
  const allowedIds = new Set(configurationIds);
  const pendingQuantity = billing.pending_slot_quantity;
  const expired = billing.status === 'expired';
  const expectedRetirements = expired || pendingQuantity === null ? 0 : Math.max(0, billing.slot_quantity - pendingQuantity);
  return Boolean(billing.access_grant_id)
    && Number.isInteger(billing.min_slot_quantity)
    && Number.isInteger(billing.max_slot_quantity)
    && Number.isInteger(billing.slot_quantity)
    && billing.min_slot_quantity >= 1
    && billing.max_slot_quantity >= billing.min_slot_quantity
    && billing.slot_quantity >= billing.min_slot_quantity
    && billing.slot_quantity <= billing.max_slot_quantity
    && pendingProjectionIsCoherent(billing)
    && (pendingQuantity === null || (Number.isInteger(pendingQuantity)
      && pendingQuantity >= billing.min_slot_quantity
      && pendingQuantity <= billing.max_slot_quantity))
    && configurations.length === (expired ? 0 : billing.slot_quantity)
    && unique(configurationIds)
    && configurations.every((configuration) => configuration.access_grant_id === billing.access_grant_id)
    && unique(billing.retirement_configuration_ids)
    && billing.retirement_configuration_ids.length === expectedRetirements
    && billing.retirement_configuration_ids.every((id) => allowedIds.has(id));
}

function validExistingSelection(input: BillingIntentInput, required: number) {
  const allowed = new Set(input.billingConfigurations.map((configuration) => configuration.configuration_id));
  return input.retireNewConfigurationOrdinals.length === 0
    && input.retireConfigurationIds.length === required
    && unique(input.retireConfigurationIds)
    && input.retireConfigurationIds.every((id) => allowed.has(id));
}

function validMixedSelection(input: BillingIntentInput, required: number) {
  const allowed = new Set(input.billingConfigurations.map((configuration) => configuration.configuration_id));
  const newCount = input.targetQuantity - input.billing.slot_quantity;
  return input.retireConfigurationIds.length + input.retireNewConfigurationOrdinals.length === required
    && unique(input.retireConfigurationIds)
    && unique(input.retireNewConfigurationOrdinals)
    && input.retireConfigurationIds.every((id) => allowed.has(id))
    && input.retireNewConfigurationOrdinals.every((ordinal) => Number.isInteger(ordinal) && ordinal >= 1 && ordinal <= newCount);
}

function normalizedBody(input: BillingIntentInput): BillingPaymentCreateRequest {
  return {
    action: input.action,
    target_quantity: input.targetQuantity,
    apply_now: input.applyNow,
    future_choice: input.futureChoice,
    retire_configuration_ids: [...input.retireConfigurationIds],
    retire_new_configuration_ordinals: [...input.retireNewConfigurationOrdinals]
  };
}

export function buildBillingPaymentRequest(input: BillingIntentInput): BillingIntentResult {
  const { billing, targetQuantity } = input;
  if (!billingProjectionIsCoherent(billing, input.billingConfigurations)) {
    return { ok: false, reason: 'incoherent_projection' };
  }
  if (!Number.isInteger(targetQuantity)
    || targetQuantity < billing.min_slot_quantity
    || targetQuantity > billing.max_slot_quantity) {
    return { ok: false, reason: 'invalid_quantity' };
  }

  if (input.action === 'renew') {
    if (!billing.can_renew || billing.pending_slot_quantity !== null) return { ok: false, reason: 'action_unavailable' };
    if (billing.status === 'expired') {
      if (input.applyNow || input.retireConfigurationIds.length || input.retireNewConfigurationOrdinals.length) {
        return { ok: false, reason: 'invalid_retirement_selection' };
      }
      return { ok: true, body: normalizedBody({ ...input, applyNow: false, futureChoice: null }) };
    }
    if (input.applyNow && (targetQuantity <= billing.slot_quantity || !billing.can_add_devices_now || billing.status !== 'active_paid')) {
      return { ok: false, reason: 'action_unavailable' };
    }
    const required = Math.max(0, billing.slot_quantity - targetQuantity);
    if (!validExistingSelection(input, required)) return { ok: false, reason: 'invalid_retirement_selection' };
    return { ok: true, body: normalizedBody({ ...input, futureChoice: null }) };
  }

  if (input.action === 'add_now') {
    if (billing.status !== 'active_paid' || !billing.can_add_devices_now || targetQuantity <= billing.slot_quantity) {
      return { ok: false, reason: 'action_unavailable' };
    }
    const pending = billing.pending_slot_quantity;
    if (pending === null || pending >= targetQuantity) {
      if (input.retireConfigurationIds.length || input.retireNewConfigurationOrdinals.length) {
        return { ok: false, reason: 'invalid_retirement_selection' };
      }
      return { ok: true, body: normalizedBody({ ...input, applyNow: false, futureChoice: null }) };
    }
    if (input.futureChoice === 'preserve') {
      if (input.retireConfigurationIds.length || input.retireNewConfigurationOrdinals.length) {
        return { ok: false, reason: 'invalid_retirement_selection' };
      }
      return { ok: true, body: normalizedBody({ ...input, applyNow: false }) };
    }
    if (input.futureChoice !== 'keep_paid' || !validMixedSelection(input, targetQuantity - pending)) {
      return { ok: false, reason: 'invalid_retirement_selection' };
    }
    return { ok: true, body: normalizedBody({ ...input, applyNow: false }) };
  }

  if (billing.pending_slot_quantity === null
    || billing.pending_slot_quantity >= billing.max_slot_quantity
    || targetQuantity <= billing.pending_slot_quantity
    || input.applyNow
    || input.futureChoice !== null
    || input.retireNewConfigurationOrdinals.length) {
    return { ok: false, reason: 'action_unavailable' };
  }
  const required = Math.max(0, billing.slot_quantity - targetQuantity);
  if (!validExistingSelection(input, required)) return { ok: false, reason: 'invalid_retirement_selection' };
  return { ok: true, body: normalizedBody({ ...input, applyNow: false, futureChoice: null }) };
}

export function isBillingPaymentCreateRequest(value: unknown): value is BillingPaymentCreateRequest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as BillingPaymentCreateRequest;
  const expectedKeys = [
    'action', 'target_quantity', 'apply_now', 'future_choice',
    'retire_configuration_ids', 'retire_new_configuration_ordinals'
  ];
  return Object.keys(item).every((key) => expectedKeys.includes(key))
    && Object.keys(item).length === expectedKeys.length
    && (item.action === 'renew' || item.action === 'add_now' || item.action === 'top_up_next')
    && Number.isInteger(item.target_quantity)
    && typeof item.apply_now === 'boolean'
    && (item.future_choice === null || item.future_choice === 'preserve' || item.future_choice === 'keep_paid')
    && Array.isArray(item.retire_configuration_ids)
    && item.retire_configuration_ids.every((id) => typeof id === 'string')
    && Array.isArray(item.retire_new_configuration_ordinals)
    && item.retire_new_configuration_ordinals.every(Number.isInteger);
}

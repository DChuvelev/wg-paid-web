import type { AccountMeResponse, ConfigurationSummary, ConfigurationVariantSummary } from '@wg-paid/api';
import { billingProjectionIsCoherent } from '../billing/billingIntent';

export type ReviewProjection =
  | { state: 'payment_required' }
  | { state: 'provisioning' }
  | { state: 'ready'; variant: ConfigurationVariantSummary }
  | { state: 'unavailable' };

function hasReviewTerms(billing: NonNullable<AccountMeResponse['billing']>) {
  return billing.monthly_amount_kopeks === 29900
    && billing.currency === 'RUB'
    && billing.min_slot_quantity === 1
    && billing.max_slot_quantity === 1
    && billing.slot_quantity === 1
    && billing.pending_slot_quantity === null
    && billing.pending_period_start === null
    && billing.pending_period_end === null
    && billing.pending_monthly_amount_kopeks === null
    && billing.retirement_configuration_ids.length === 0;
}

function exactReviewVariant(configuration: ConfigurationSummary, accessGrantId: string) {
  if (configuration.access_grant_id !== accessGrantId || configuration.variants.length !== 1) return null;
  const variant = configuration.variants[0]!;
  return variant.protocol === 'wireguard' ? variant : null;
}

export function reviewProjection(
  account: AccountMeResponse,
  configurations: Array<ConfigurationSummary>
): ReviewProjection {
  if (account.account_surface !== 'review' || !account.billing || !hasReviewTerms(account.billing)) {
    return { state: 'unavailable' };
  }

  const billing = account.billing;
  if (billing.status === 'expired') {
    return billing.can_renew && billingProjectionIsCoherent(billing, configurations)
      ? { state: 'payment_required' }
      : { state: 'unavailable' };
  }

  if (billing.status !== 'active_paid') return { state: 'unavailable' };
  if (configurations.length === 0) return { state: 'provisioning' };
  if (configurations.length !== 1) return { state: 'unavailable' };

  const variant = exactReviewVariant(configurations[0]!, billing.access_grant_id);
  if (!variant) return { state: 'unavailable' };
  if ((variant.status === 'requested' || variant.status === 'provisioning') && !variant.ready) {
    return { state: 'provisioning' };
  }
  if (variant.status === 'active' && variant.ready) return { state: 'ready', variant };
  return { state: 'unavailable' };
}

import type { ConfigurationSummary } from '@wg-paid/api';

const transitionalStatuses = new Set(['requested', 'provisioning', 'disabling']);
export const configurationPollTimeoutMs = 60000;

export function hasTransitionalConfiguration(configurations: Array<ConfigurationSummary> | undefined) {
  return configurations?.some(({ variants }) => variants.some(({ status }) => transitionalStatuses.has(status))) ?? false;
}

export function hasReviewPreparationConfiguration(configurations: Array<ConfigurationSummary> | undefined) {
  if (!configurations || configurations.length === 0) return configurations?.length === 0;
  if (configurations.length !== 1 || configurations[0]!.variants.length !== 1) return false;
  const variant = configurations[0]!.variants[0]!;
  return variant.protocol === 'wireguard' && (variant.status === 'requested' || variant.status === 'provisioning');
}

export function configurationPollingInterval(
  configurations: Array<ConfigurationSummary> | undefined,
  startedAt: number | null,
  now = Date.now(),
  mode: 'ordinary' | 'review' = 'ordinary'
): 3000 | false {
  const shouldPoll = mode === 'review'
    ? hasReviewPreparationConfiguration(configurations)
    : hasTransitionalConfiguration(configurations);
  return shouldPoll
    && startedAt !== null
    && now - startedAt < configurationPollTimeoutMs ? 3000 : false;
}

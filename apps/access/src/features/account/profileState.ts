import type { ConfigurationSummary } from '@wg-paid/api';

const transitionalStatuses = new Set(['requested', 'provisioning', 'disabling']);
export const configurationPollTimeoutMs = 60000;

export function hasTransitionalConfiguration(configurations: Array<ConfigurationSummary> | undefined) {
  return configurations?.some(({ variants }) => variants.some(({ status }) => transitionalStatuses.has(status))) ?? false;
}

export function configurationPollingInterval(
  configurations: Array<ConfigurationSummary> | undefined,
  startedAt: number | null,
  now = Date.now()
): 3000 | false {
  return hasTransitionalConfiguration(configurations)
    && startedAt !== null
    && now - startedAt < configurationPollTimeoutMs ? 3000 : false;
}

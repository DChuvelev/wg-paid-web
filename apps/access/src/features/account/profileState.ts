import type { ProfileSummary } from '@wg-paid/api';

const transitionalStatuses = new Set(['requested', 'provisioning', 'disabling']);

export function hasTransitionalProfile(profiles: Array<ProfileSummary> | undefined) {
  return profiles?.some(({ status }) => transitionalStatuses.has(status)) ?? false;
}

export function profilePollingInterval(profiles: Array<ProfileSummary> | undefined): 3000 | false {
  return hasTransitionalProfile(profiles) ? 3000 : false;
}

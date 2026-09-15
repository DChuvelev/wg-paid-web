import type { AdminUserSummary, ConfigurationSummary, GrantProtocolLimitSummary, GrantSummary, ProfileSummary } from '@wg-paid/api';

export const quotaProfileStatuses = new Set([
  'requested',
  'provisioning',
  'active',
  'disabling',
  'provisioning_failed'
]);

export function consumesQuota(profile: ProfileSummary) {
  return quotaProfileStatuses.has(profile.status);
}

export function wireGuardLimit(grant: GrantSummary): GrantProtocolLimitSummary | undefined {
  return grant.protocol_limits.find((limit) => limit.protocol === 'wireguard');
}

export function configurationsForGrant(user: AdminUserSummary, grantId: string) {
  return user.configurations.filter((configuration) => configuration.access_grant_id === grantId);
}

export function representativeProfileId(configuration: ConfigurationSummary): string | null {
  return configuration.variants.find((variant) => variant.protocol === 'wireguard')?.profile_id
    ?? configuration.variants.find((variant) => variant.protocol === 'amneziawg')?.profile_id
    ?? null;
}

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

import type { AdminUserSummary, GrantProtocolLimitSummary, GrantSummary, ProfileSummary } from '@wg-paid/api';

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

export function wireGuardProfiles(user: AdminUserSummary, grantId: string) {
  return user.profiles.filter((profile) => profile.protocol === 'wireguard' && profile.access_grant_id === grantId);
}

export function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString() : '—';
}

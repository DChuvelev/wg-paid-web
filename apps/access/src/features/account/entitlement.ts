import type { GrantSummary } from '@wg-paid/api';

export interface WireGuardEntitlement {
  canCreate: boolean;
  grantId: string;
  profileCount: number;
  profileLimit: number;
}

export function selectWireGuardEntitlement(
  grants: Array<GrantSummary>,
  now = new Date()
): WireGuardEntitlement | null {
  for (const grant of grants) {
    if (grant.status !== 'active') continue;
    if (grant.valid_until) {
      const expiresAt = Date.parse(grant.valid_until);
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) continue;
    }

    const limit = grant.protocol_limits.find(({ protocol }) => protocol === 'wireguard');
    if (limit) {
      return {
        canCreate: limit.can_create,
        grantId: grant.id,
        profileCount: limit.profile_count,
        profileLimit: limit.profile_limit
      };
    }
  }

  return null;
}

import type { GrantSummary } from '@wg-paid/api';

export interface ConfigurationEntitlement {
  canCreate: boolean;
  grantId: string;
  configurationCount: number;
  configurationLimit: number;
}

export function selectConfigurationEntitlement(
  grants: Array<GrantSummary>,
  now = new Date()
): ConfigurationEntitlement | null {
  for (const grant of [...grants].reverse()) {
    if (grant.status !== 'active') continue;
    if (grant.valid_until) {
      const expiresAt = Date.parse(grant.valid_until);
      if (!Number.isFinite(expiresAt) || expiresAt <= now.getTime()) continue;
    }

    return {
      canCreate: grant.can_create_configuration,
      grantId: grant.id,
      configurationCount: grant.configuration_count,
      configurationLimit: grant.configuration_limit
    };
  }

  return null;
}

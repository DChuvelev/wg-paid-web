import { useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import type { AccountMeResponse, ConfigurationSummary, RoutingExitCatalogResponse, RoutingExitSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createConfiguration, loadRoutingExits } from '../../lib/accessApi';
import { ConfigurationList } from './ConfigurationList';
import { selectConfigurationEntitlement } from './entitlement';
import { routingExitsKey } from './queryKeys';
import styles from './Account.module.css';

interface ConfigurationsSectionProps {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  onChanged: () => Promise<unknown>;
  onError: (error: unknown) => void;
}

function validatedRoutingExits(data: RoutingExitCatalogResponse | undefined): Array<RoutingExitSummary> | null {
  if (!data || !Array.isArray(data.exits) || data.exits.length !== 5) return null;
  const exits = data.exits
    .filter((exit) => Number.isInteger(exit.selector)
      && exit.selector >= 1
      && exit.selector <= 5
      && typeof exit.display_name === 'string'
      && exit.display_name.trim().length > 0);
  if (exits.length !== 5 || new Set(exits.map((exit) => exit.selector)).size !== 5) return null;
  return [...exits].sort((first, second) => first.selector - second.selector);
}

export function ConfigurationsSection({ account, configurations, onChanged, onError }: ConfigurationsSectionProps) {
  const { t } = useLocale();
  const entitlement = selectConfigurationEntitlement(account.grants);
  const routingExitsQuery = useQuery({
    queryKey: routingExitsKey,
    queryFn: ({ signal }) => loadRoutingExits(signal),
    refetchOnWindowFocus: true,
    retry: false
  });
  const routingExits = validatedRoutingExits(routingExitsQuery.data);
  const mutation = useMutation({
    mutationFn: createConfiguration,
    onError,
    onSuccess: onChanged
  });
  const error = mutation.error instanceof AccessApiError && mutation.error.status === 403
    ? t('sessionValidationFailed')
    : mutation.isError ? t('createConfigurationFailed') : null;

  useEffect(() => {
    if (routingExitsQuery.error) onError(routingExitsQuery.error);
  }, [onError, routingExitsQuery.error]);

  return (
    <section>
      <p className={styles.summary}>
        {entitlement
          ? t('configurationCount', { count: entitlement.configurationCount, limit: entitlement.configurationLimit })
          : t('configurationsUnavailable')}
      </p>
      <div className={styles.sectionHeader}>
        <h2>{t('configurations')}</h2>
        {entitlement?.canCreate ? (
          <button className={`${styles.button} ${styles.primary}`} type="button" disabled={mutation.isPending} onClick={() => mutation.mutate(entitlement.grantId)}>
            {t('addConfiguration')}
          </button>
        ) : null}
      </div>
      {error ? <p className={styles.error} role="alert">{error}</p> : null}
      <ConfigurationList configurations={configurations} routingExits={routingExits} onUnauthorized={onError} />
    </section>
  );
}

import { useMutation } from '@tanstack/react-query';
import type { AccountMeResponse, ConfigurationSummary } from '@wg-paid/api';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, createConfiguration } from '../../lib/accessApi';
import { ConfigurationList } from './ConfigurationList';
import { selectConfigurationEntitlement } from './entitlement';
import styles from './Account.module.css';

interface ConfigurationsSectionProps {
  account: AccountMeResponse;
  configurations: Array<ConfigurationSummary>;
  onChanged: () => Promise<unknown>;
  onError: (error: unknown) => void;
}

export function ConfigurationsSection({ account, configurations, onChanged, onError }: ConfigurationsSectionProps) {
  const { t } = useLocale();
  const entitlement = selectConfigurationEntitlement(account.grants);
  const mutation = useMutation({
    mutationFn: createConfiguration,
    onError,
    onSuccess: onChanged
  });
  const error = mutation.error instanceof AccessApiError && mutation.error.status === 403
    ? t('sessionValidationFailed')
    : mutation.isError ? t('createConfigurationFailed') : null;

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
      <ConfigurationList configurations={configurations} onUnauthorized={onError} />
    </section>
  );
}

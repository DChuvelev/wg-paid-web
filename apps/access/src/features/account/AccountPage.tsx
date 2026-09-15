import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import {
  AccessApiError,
  createConfiguration,
  loadAccount,
  loadConfigurations,
  logout
} from '../../lib/accessApi';
import { selectConfigurationEntitlement } from './entitlement';
import { configurationPollingInterval, hasTransitionalConfiguration } from './profileState';
import { ConfigurationList } from './ConfigurationList';
import { DisplayNameForm } from './DisplayNameForm';
import { accountKey, configurationsKey } from './queryKeys';
import styles from './Account.module.css';

function isUnauthorized(error: unknown) {
  return error instanceof AccessApiError && error.status === 401;
}

export function AccountPage() {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);
  const pollInterval = (data: Parameters<typeof configurationPollingInterval>[0]) => {
    if (!hasTransitionalConfiguration(data)) {
      pollStartedAt.current = null;
      return false;
    }
    pollStartedAt.current ??= Date.now();
    return configurationPollingInterval(data, pollStartedAt.current);
  };
  const configurationsQuery = useQuery({
    queryKey: configurationsKey,
    queryFn: loadConfigurations,
    refetchInterval: ({ state }) => pollInterval(state.data),
    refetchOnWindowFocus: true,
    retry: false
  });
  const accountQuery = useQuery({
    queryKey: accountKey,
    queryFn: loadAccount,
    refetchInterval: () => pollInterval(configurationsQuery.data),
    refetchOnWindowFocus: true,
    retry: false
  });

  useEffect(() => {
    if (isUnauthorized(accountQuery.error) || isUnauthorized(configurationsQuery.error)) {
      navigate('/', { replace: true });
    }
  }, [accountQuery.error, configurationsQuery.error, navigate]);

  const invalidateAccount = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: configurationsKey })
    ]);
  };

  const clearAccountState = () => {
    queryClient.removeQueries({ queryKey: accountKey });
    queryClient.removeQueries({ queryKey: configurationsKey });
  };

  const handleMutationError = (error: unknown) => {
    if (isUnauthorized(error)) {
      clearAccountState();
      navigate('/', { replace: true });
    }
  };

  const createMutation = useMutation({
    mutationFn: createConfiguration,
    onError: handleMutationError,
    onSuccess: () => {
      pollStartedAt.current = null;
      return invalidateAccount();
    }
  });
  const logoutMutation = useMutation({
    mutationFn: logout,
    onSuccess: async () => {
      clearAccountState();
      navigate('/', { replace: true });
    },
    onError: (error) => {
      if (isUnauthorized(error)) {
        clearAccountState();
        navigate('/', { replace: true });
      }
    }
  });

  if (accountQuery.isPending || configurationsQuery.isPending) {
    return <AppShell title={t('account')}><p>{t('loadingAccount')}</p></AppShell>;
  }

  if (!accountQuery.data || !configurationsQuery.data) {
    return <AppShell title={t('account')}><p className={styles.error}>{t('accountLoadFailed')}</p></AppShell>;
  }

  const entitlement = selectConfigurationEntitlement(accountQuery.data.grants);
  const noticeKey = (location.state as { noticeKey?: 'signedIn' } | null)?.noticeKey;
  const hasSessionValidationFailure = createMutation.error instanceof AccessApiError
    && createMutation.error.status === 403;
  const mutationErrorMessage = hasSessionValidationFailure
    ? t('sessionValidationFailed')
    : createMutation.isError
      ? t('createConfigurationFailed')
      : null;

  return (
    <AppShell title={t('account')}>
      {noticeKey ? <p className={styles.notice} role="status">{t(noticeKey)}</p> : null}
      <div className={styles.header}>
        <p className={styles.email}>{accountQuery.data.email}</p>
        <button
          className={styles.button}
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          {t('logout')}
        </button>
      </div>

      {logoutMutation.isError && !isUnauthorized(logoutMutation.error) ? (
        <p className={styles.error} role="alert">{t('logoutFailed')}</p>
      ) : null}

      <DisplayNameForm account={accountQuery.data} onError={handleMutationError} />

      <p className={styles.summary}>
        {entitlement
          ? t('configurationCount', { count: entitlement.configurationCount, limit: entitlement.configurationLimit })
          : t('configurationsUnavailable')}
      </p>

      <div className={styles.sectionHeader}>
        <h2>{t('configurations')}</h2>
        {entitlement?.canCreate ? (
          <button
            className={`${styles.button} ${styles.primary}`}
            type="button"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate(entitlement.grantId)}
          >
            {t('addConfiguration')}
          </button>
        ) : null}
      </div>

      {mutationErrorMessage ? <p className={styles.error} role="alert">{mutationErrorMessage}</p> : null}
      <ConfigurationList configurations={configurationsQuery.data} onUnauthorized={handleMutationError} />
    </AppShell>
  );
}

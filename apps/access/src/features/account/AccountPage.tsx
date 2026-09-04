import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import {
  AccessApiError,
  createProfile,
  loadAccount,
  loadProfiles,
  logout
} from '../../lib/accessApi';
import { selectWireGuardEntitlement } from './entitlement';
import { hasTransitionalProfile, profilePollingInterval } from './profileState';
import { ProfileList } from './ProfileList';
import { DisplayNameForm } from './DisplayNameForm';
import { accountKey, profilesKey } from './queryKeys';
import styles from './Account.module.css';

function isUnauthorized(error: unknown) {
  return error instanceof AccessApiError && error.status === 401;
}

export function AccountPage() {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: profilesKey,
    queryFn: loadProfiles,
    refetchInterval: ({ state }) => profilePollingInterval(state.data),
    refetchOnWindowFocus: true,
    retry: false
  });
  const transitional = hasTransitionalProfile(profilesQuery.data);
  const accountQuery = useQuery({
    queryKey: accountKey,
    queryFn: loadAccount,
    refetchInterval: transitional ? 3000 : false,
    refetchOnWindowFocus: true,
    retry: false
  });

  useEffect(() => {
    if (isUnauthorized(accountQuery.error) || isUnauthorized(profilesQuery.error)) {
      navigate('/', { replace: true });
    }
  }, [accountQuery.error, navigate, profilesQuery.error]);

  const invalidateAccount = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: accountKey }),
      queryClient.invalidateQueries({ queryKey: profilesKey })
    ]);
  };

  const clearAccountState = () => {
    queryClient.removeQueries({ queryKey: accountKey });
    queryClient.removeQueries({ queryKey: profilesKey });
  };

  const handleMutationError = (error: unknown) => {
    if (isUnauthorized(error)) {
      clearAccountState();
      navigate('/', { replace: true });
    }
  };

  const createMutation = useMutation({
    mutationFn: createProfile,
    onError: handleMutationError,
    onSuccess: invalidateAccount
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

  if (accountQuery.isPending || profilesQuery.isPending) {
    return <AppShell title={t('account')}><p>{t('loadingAccount')}</p></AppShell>;
  }

  if (!accountQuery.data || !profilesQuery.data) {
    return <AppShell title={t('account')}><p className={styles.error}>{t('accountLoadFailed')}</p></AppShell>;
  }

  const entitlement = selectWireGuardEntitlement(accountQuery.data.grants);
  const noticeKey = (location.state as { noticeKey?: 'signedIn' } | null)?.noticeKey;
  const hasSessionValidationFailure = createMutation.error instanceof AccessApiError
    && createMutation.error.status === 403;
  const mutationErrorMessage = hasSessionValidationFailure
    ? t('sessionValidationFailed')
    : createMutation.isError
      ? t('createConnectionFailed')
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
          ? t('wireGuardConnections', { count: entitlement.profileCount, limit: entitlement.profileLimit })
          : t('wireGuardUnavailable')}
      </p>

      <div className={styles.sectionHeader}>
        <h2>{t('connections')}</h2>
        {entitlement?.canCreate ? (
          <button
            className={`${styles.button} ${styles.primary}`}
            type="button"
            disabled={createMutation.isPending}
            onClick={() => createMutation.mutate(entitlement.grantId)}
          >
            {t('addConnection')}
          </button>
        ) : null}
      </div>

      {mutationErrorMessage ? <p className={styles.error} role="alert">{mutationErrorMessage}</p> : null}
      <ProfileList profiles={profilesQuery.data} onUnauthorized={handleMutationError} />
    </AppShell>
  );
}

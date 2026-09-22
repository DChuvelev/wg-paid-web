import { useEffect, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import { useLocale } from '../../i18n/localeContext';
import { AccessApiError, loadAccount, loadConfigurations, logout } from '../../lib/accessApi';
import { clearPaymentAttemptForUser } from '../billing/paymentAttempt';
import { CommercialAccountPage } from './CommercialAccountPage';
import { configurationPollingInterval, hasTransitionalConfiguration } from './profileState';
import { PilotAccountPage } from './PilotAccountPage';
import { accessRootKey, accountKey, configurationsKey } from './queryKeys';
import styles from './Account.module.css';

function isUnauthorized(error: unknown) { return error instanceof AccessApiError && error.status === 401; }

export function AccountPage() {
  const { t } = useLocale();
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pollStartedAt = useRef<number | null>(null);
  const pollInterval = (data: Parameters<typeof configurationPollingInterval>[0]) => {
    if (!hasTransitionalConfiguration(data)) { pollStartedAt.current = null; return false; }
    pollStartedAt.current ??= Date.now();
    return configurationPollingInterval(data, pollStartedAt.current);
  };
  const configurationsQuery = useQuery({ queryKey: configurationsKey, queryFn: loadConfigurations, refetchInterval: ({ state }) => pollInterval(state.data), refetchOnWindowFocus: true, retry: false });
  const accountQuery = useQuery({ queryKey: accountKey, queryFn: loadAccount, refetchInterval: () => pollInterval(configurationsQuery.data), refetchOnWindowFocus: true, retry: false });

  const clearSession = async () => {
    const userId = accountQuery.data?.user_id;
    await queryClient.cancelQueries({ queryKey: accessRootKey });
    queryClient.removeQueries({ queryKey: accessRootKey });
    if (userId) clearPaymentAttemptForUser(userId);
    navigate('/', { replace: true });
  };
  useEffect(() => { if (isUnauthorized(accountQuery.error) || isUnauthorized(configurationsQuery.error)) void clearSession();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountQuery.error, configurationsQuery.error]);
  const onError = (error: unknown) => { if (isUnauthorized(error)) void clearSession(); };
  const onChanged = async () => { pollStartedAt.current = null; await Promise.all([queryClient.invalidateQueries({ queryKey: accountKey }), queryClient.invalidateQueries({ queryKey: configurationsKey })]); };
  const logoutMutation = useMutation({ mutationFn: logout, onSuccess: clearSession, onError: (error) => { if (isUnauthorized(error)) void clearSession(); } });

  if (accountQuery.isPending || configurationsQuery.isPending) return <AppShell title={t('account')}><p>{t('loadingAccount')}</p></AppShell>;
  if (!accountQuery.data || !configurationsQuery.data) return <AppShell title={t('account')}><p className={styles.error}>{t('accountLoadFailed')}</p></AppShell>;
  const common = {
    account: accountQuery.data,
    configurations: configurationsQuery.data,
    notice: (location.state as { noticeKey?: string } | null)?.noticeKey === 'signedIn',
    logoutPending: logoutMutation.isPending,
    logoutError: logoutMutation.isError && !isUnauthorized(logoutMutation.error),
    onChanged,
    onError,
    onLogout: () => logoutMutation.mutate()
  };
  if (accountQuery.data.account_surface === 'pilot') return <PilotAccountPage {...common} />;
  if (accountQuery.data.account_surface === 'commercial') return <CommercialAccountPage {...common} />;
  return <AppShell title={t('account')}><p className={styles.error} role="alert">{t('accountSurfaceUnsupported')}</p></AppShell>;
}

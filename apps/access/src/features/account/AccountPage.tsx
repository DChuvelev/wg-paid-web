import { useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation, useNavigate } from 'react-router';
import { AppShell } from '../../app/AppShell';
import {
  AccessApiError,
  createProfile,
  loadAccount,
  loadProfiles,
  logout,
  reissueProfile,
  revokeProfile
} from '../../lib/accessApi';
import { selectWireGuardEntitlement } from './entitlement';
import { hasTransitionalProfile, profilePollingInterval } from './profileState';
import { ProfileList } from './ProfileList';
import styles from './Account.module.css';

const accountKey = ['access', 'account'] as const;
const profilesKey = ['access', 'profiles'] as const;

function isUnauthorized(error: unknown) {
  return error instanceof AccessApiError && error.status === 401;
}

export function AccountPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const profilesQuery = useQuery({
    queryKey: profilesKey,
    queryFn: loadProfiles,
    refetchInterval: ({ state }) => profilePollingInterval(state.data),
    retry: false
  });
  const transitional = hasTransitionalProfile(profilesQuery.data);
  const accountQuery = useQuery({
    queryKey: accountKey,
    queryFn: loadAccount,
    refetchInterval: transitional ? 3000 : false,
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
  const revokeMutation = useMutation({
    mutationFn: revokeProfile,
    onError: handleMutationError,
    onSuccess: invalidateAccount
  });
  const reissueMutation = useMutation({
    mutationFn: reissueProfile,
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
    return <AppShell title="Account"><p>Loading account…</p></AppShell>;
  }

  if (!accountQuery.data || !profilesQuery.data) {
    return <AppShell title="Account"><p className={styles.error}>Unable to load the account.</p></AppShell>;
  }

  const entitlement = selectWireGuardEntitlement(accountQuery.data.grants);
  const busy = createMutation.isPending || revokeMutation.isPending || reissueMutation.isPending;
  const notice = (location.state as { notice?: string } | null)?.notice;
  const mutationErrors = [createMutation.error, revokeMutation.error, reissueMutation.error];
  const hasSessionValidationFailure = mutationErrors.some(
    (error) => error instanceof AccessApiError && error.status === 403
  );
  const mutationErrorMessage = hasSessionValidationFailure
    ? 'Session validation failed. Sign in again.'
    : createMutation.isError
      ? 'Unable to create another connection.'
      : revokeMutation.isError || reissueMutation.isError
        ? 'Unable to update this connection.'
        : null;

  return (
    <AppShell title="Account">
      {notice ? <p className={styles.notice} role="status">{notice}</p> : null}
      <div className={styles.header}>
        <p className={styles.email}>{accountQuery.data.email}</p>
        <button
          className={styles.button}
          type="button"
          disabled={logoutMutation.isPending}
          onClick={() => logoutMutation.mutate()}
        >
          Logout
        </button>
      </div>

      {logoutMutation.isError && !isUnauthorized(logoutMutation.error) ? (
        <p className={styles.error} role="alert">Unable to sign out.</p>
      ) : null}

      <p className={styles.summary}>
        {entitlement
          ? `WireGuard connections: ${entitlement.profileCount} / ${entitlement.profileLimit}`
          : 'WireGuard is not enabled for this account.'}
      </p>

      <div className={styles.sectionHeader}>
        <h2>Connections</h2>
        {entitlement?.canCreate ? (
          <button
            className={`${styles.button} ${styles.primary}`}
            type="button"
            disabled={busy}
            onClick={() => createMutation.mutate(entitlement.grantId)}
          >
            Add connection
          </button>
        ) : null}
      </div>

      {mutationErrorMessage ? <p className={styles.error} role="alert">{mutationErrorMessage}</p> : null}
      <ProfileList
        busy={busy}
        profiles={profilesQuery.data}
        onReissue={(profileId) => reissueMutation.mutate(profileId)}
        onRevoke={(profileId) => revokeMutation.mutate(profileId)}
      />
    </AppShell>
  );
}

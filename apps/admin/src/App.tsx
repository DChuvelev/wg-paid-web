import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminDashboard } from './app/AdminDashboard';
import { LoginPage } from './features/auth/LoginPage';
import { checkAdminSession } from './lib/adminApi';
import styles from './app/Admin.module.css';

const adminSessionKey = ['admin', 'session'] as const;

export function App() {
  const queryClient = useQueryClient();
  const sessionQuery = useQuery({
    queryKey: adminSessionKey,
    queryFn: checkAdminSession,
    retry: false,
    staleTime: Infinity
  });

  const endSession = useCallback((message: string) => {
    void queryClient.cancelQueries({ queryKey: ['admin'] });
    queryClient.removeQueries({
      queryKey: ['admin'],
      predicate: (query) => query.queryKey[1] !== 'session'
    });
    queryClient.setQueryData(adminSessionKey, false);
    queryClient.setQueryData(['admin', 'session-message'], message);
  }, [queryClient]);

  if (sessionQuery.isPending) {
    return (
      <main className={styles.centeredPage}>
        <div className={styles.loginCard} role="status">Checking admin session…</div>
      </main>
    );
  }

  if (!sessionQuery.data) {
    const storedMessage = queryClient.getQueryData<string>(['admin', 'session-message']);
    return (
      <LoginPage
        initialMessage={sessionQuery.isError ? 'Unable to reach admin service.' : storedMessage}
        onAuthenticated={() => {
          queryClient.removeQueries({ queryKey: ['admin', 'session-message'] });
          queryClient.setQueryData(adminSessionKey, true);
        }}
      />
    );
  }

  return (
    <AdminDashboard
      onSessionExpired={() => endSession('Admin session expired.')}
      onSignedOut={() => endSession('Signed out.')}
    />
  );
}

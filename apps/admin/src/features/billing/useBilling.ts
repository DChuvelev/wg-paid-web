import { useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AdminApiError, type BillingAccountsQuery, type BillingPaymentsQuery, loadBillingOverview, loadBillingAccounts, loadBillingPayments, loadBillingAccount, isUnauthorized } from '../../lib/adminApi';
const options = { retry: false, staleTime: 30_000, refetchOnWindowFocus: false, refetchOnReconnect: false } as const;
export function useBilling(accountsFilter: BillingAccountsQuery, paymentsFilter: BillingPaymentsQuery, accountId: string | null, detailLimit: number, onSessionExpired: () => void) {
  const client = useQueryClient();
  const overview = useQuery({ ...options, queryKey: ['admin', 'billing', 'overview', { scope: paymentsFilter.scope, days: paymentsFilter.days }], queryFn: ({ signal }) => loadBillingOverview(paymentsFilter.days ?? 30, paymentsFilter.scope, signal) });
  const accounts = useQuery({ ...options, queryKey: ['admin', 'billing', 'accounts', accountsFilter], queryFn: ({ signal }) => loadBillingAccounts(accountsFilter, signal) });
  const payments = useQuery({ ...options, queryKey: ['admin', 'billing', 'payments', paymentsFilter], queryFn: ({ signal }) => loadBillingPayments(paymentsFilter, signal) });
  const detail = useQuery({ ...options, queryKey: ['admin', 'billing', 'account', accountId, detailLimit], enabled: accountId !== null, queryFn: ({ signal }) => loadBillingAccount(accountId!, detailLimit, signal) });
  const unauthorized = [overview.error, accounts.error, payments.error, detail.error].some(isUnauthorized);
  useEffect(() => { if (unauthorized) onSessionExpired(); }, [unauthorized, onSessionExpired]);
  // Purge forbidden responses, retaining the error state until an explicit retry.
  useEffect(() => {
    for (const query of client.getQueryCache().findAll({ queryKey: ['admin', 'billing'] })) {
      if (query.state.error instanceof AdminApiError && query.state.error.status === 403 && query.state.data !== undefined) query.setState({ data: undefined });
    }
  }, [client, overview.error, accounts.error, payments.error, detail.error]);
  return { overview, accounts, payments, detail, unauthorized };
}

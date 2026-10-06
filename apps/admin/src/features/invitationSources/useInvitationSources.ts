import { useEffect, useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadInvitationSources } from '../../lib/adminApi';
import type { SourceOrigin } from './invitationSourceDomain';

export function useInvitationSources(origin: SourceOrigin, draft: string, open: boolean) {
  const lookupId = useId();
  const [queryText, setQueryText] = useState('');
  const queryClient = useQueryClient();
  const trimmed = draft.trim();
  useEffect(() => {
    const timer = window.setTimeout(() => setQueryText(trimmed), 250);
    return () => window.clearTimeout(timer);
  }, [trimmed]);
  const ready = trimmed === queryText;
  const query = useQuery({
    queryKey: ['admin', 'invitation-sources', origin, queryText, 20, lookupId],
    queryFn: ({ signal }) => loadInvitationSources({ origin, query: queryText, limit: 20 }, signal),
    enabled: open && ready,
    staleTime: 30000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false
  });
  useEffect(() => {
    if (!open || !ready) {
      // Each mounted selector owns cancellation; closing one must not cancel another's lookup.
      void queryClient.cancelQueries({ queryKey: ['admin', 'invitation-sources', origin, queryText, 20, lookupId], exact: true });
    }
  }, [lookupId, open, origin, queryClient, queryText, ready]);
  return { query, options: open && ready && !query.isError ? query.data ?? [] : [], waiting: !ready || query.isPending };
}

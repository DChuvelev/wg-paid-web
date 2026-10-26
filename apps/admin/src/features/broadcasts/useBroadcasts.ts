import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { BroadcastCompose, BroadcastPreview, BroadcastSummary } from '@wg-paid/api';
import { createBroadcast, isUnauthorized, loadBroadcast, loadBroadcasts, pauseBroadcast, previewBroadcast, resumeBroadcast, sendBroadcast, testBroadcast } from '../../lib/adminApi';
import { broadcastError, broadcastKey, canSendDraft, detailKey, historyKey, isFreshDraft, isRunning, pollingInterval, pollingWindow } from './broadcastDomain';

export const broadcastQueryOptions = {
  retry: false, staleTime: Infinity, gcTime: 0,
  refetchOnWindowFocus: false, refetchOnReconnect: false, refetchOnMount: 'always'
} as const;

type Operation = 'preview' | 'create' | 'test' | 'send' | 'pause' | 'resume';
type Command = { operation: 'preview' | 'create'; body: BroadcastCompose } | { operation: 'test' | 'send' | 'pause' | 'resume'; draft: BroadcastSummary };

export function useBroadcasts(onSessionExpired: () => void) {
  const client = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [preview, setPreview] = useState<BroadcastPreview | null>(null);
  const [error, setError] = useState('');
  const [feedback, setFeedback] = useState('');
  const [pollingStartedAt, setPollingStartedAt] = useState(Date.now);
  const lock = useRef(false);
  const alive = useRef(false);
  const blocked = useRef(new Set<string>());
  const [pending, setPending] = useState<Operation | null>(null);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  const history = useQuery({ ...broadcastQueryOptions, queryKey: historyKey,
    queryFn: ({ signal }) => loadBroadcasts(signal),
    refetchInterval: (query) => !query.state.error && Date.now() - pollingStartedAt < pollingWindow &&
      query.state.data?.some((row) => isRunning(row.state)) ? pollingInterval : false
  });
  const detail = useQuery({ ...broadcastQueryOptions, queryKey: detailKey(selectedId ?? ''), enabled: selectedId !== null,
    queryFn: ({ signal }) => loadBroadcast(selectedId!, signal),
    refetchInterval: (query) => !query.state.error && Date.now() - pollingStartedAt < pollingWindow &&
      query.state.data && isRunning(query.state.data.state) ? pollingInterval : false
  });
  const unauthorized = isUnauthorized(history.error) || isUnauthorized(detail.error);
  useEffect(() => { if (unauthorized) onSessionExpired(); }, [unauthorized, onSessionExpired]);

  const attemptKey = (operation: 'send' | 'test', id: string) => [...broadcastKey, 'attempt', operation, id];
  const attempted = (operation: 'send' | 'test', id: string) =>
    blocked.current.has(`${operation}:${id}`) || client.getQueryData(attemptKey(operation, id)) === true;

  const mutation = useMutation({ retry: false, mutationFn: async (command: Command) => {
    if (command.operation === 'preview') return previewBroadcast(command.body);
    if (command.operation === 'create') return createBroadcast(command.body);
    if (command.operation === 'test') return testBroadcast(command.draft.id);
    if (command.operation === 'send') return sendBroadcast(command.draft.id, command.draft.recipient_count);
    if (command.operation === 'pause') return pauseBroadcast(command.draft.id);
    if (command.operation === 'resume') return resumeBroadcast(command.draft.id);
  } });

  const run = async (command: Command) => {
    if (lock.current || !alive.current || unauthorized) return;
    const { operation } = command;
    if ('draft' in command) {
      if (operation === 'send' && (!canSendDraft(command.draft) || attempted('send', command.draft.id))) return;
      if (operation === 'test' && (!isFreshDraft(command.draft) || attempted('test', command.draft.id))) return;
      if (operation === 'test' && command.draft.test_attempted_at !== null) return;
      if (operation === 'pause' && !isRunning(command.draft.state)) return;
      if (operation === 'resume' && command.draft.state !== 'paused') return;
      if (operation === 'send' || operation === 'test') {
        // Remember attempts for this session even across tab remounts and transport errors.
        blocked.current.add(`${operation}:${command.draft.id}`);
        client.setQueryDefaults(attemptKey(operation, command.draft.id), { gcTime: Infinity });
        client.setQueryData(attemptKey(operation, command.draft.id), true);
      }
    }
    lock.current = true;
    setPending(operation); setError(''); setFeedback('');
    if (operation === 'create') setPreview(null);
    try {
      await client.cancelQueries({ queryKey: broadcastKey });
      if (!alive.current) return;
      const result = await mutation.mutateAsync(command);
      if (!alive.current) return;
      if (operation === 'preview') setPreview(result as BroadcastPreview);
      else {
        setPollingStartedAt(Date.now());
        if (operation === 'test') {
          setFeedback('Тест принят почтовым сервером. Доставка не подтверждена. Повтор теста для этого черновика недоступен.');
          await client.invalidateQueries({ queryKey: detailKey((command as { draft: BroadcastSummary }).draft.id) });
        } else {
          const draft = result as BroadcastSummary;
          client.setQueryData(detailKey(draft.id), draft);
          setSelectedId(draft.id);
          setFeedback(operation === 'create' ? 'Неизменяемый черновик создан. Проверьте его перед отправкой.' : 'Состояние рассылки обновлено.');
        }
        await client.invalidateQueries({ queryKey: historyKey });
      }
    } catch (caught) {
      if (!alive.current) return;
      if (isUnauthorized(caught)) { onSessionExpired(); return; }
      setError(broadcastError(caught));
      if (operation === 'test') setFeedback('Попытка теста зафиксирована локально. При ошибке или неизвестном результате создайте новый черновик; повтор теста недоступен.');
      if (operation === 'send') setFeedback('Повтор команды отправки для этого черновика заблокирован. Проверьте его состояние через «Обновить рассылки».');
      if ('draft' in command) {
        await client.invalidateQueries({ queryKey: detailKey(command.draft.id) });
        await client.invalidateQueries({ queryKey: historyKey });
      }
    } finally {
      lock.current = false;
      if (alive.current) setPending(null);
    }
  };

  const refresh = () => {
    if (lock.current) return;
    setPollingStartedAt(Date.now());
    void history.refetch();
    if (selectedId) void detail.refetch();
  };
  return { history, detail, selectedId, select: setSelectedId, preview, clearPreview: () => setPreview(null),
    error, feedback, pending, unauthorized, attempted, run, refresh };
}

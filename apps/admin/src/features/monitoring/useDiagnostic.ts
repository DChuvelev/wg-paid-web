import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AdminApiError, createDiagnostic, downloadDiagnostic, isDiagnosticId, isUnauthorized,
  loadDiagnostic, type DiagnosticJob
} from '../../lib/adminApi';

const storageKey = 'wg-admin-diagnostic-request';
const pollInterval = 4_000;
const maxActiveTime = 15 * 60_000;
const requestTimeout = 20_000;
const jobKey = (id: string | null) => ['admin', 'diagnostic', id] as const;

function saveId(id: string | null) {
  try {
    if (id) sessionStorage.setItem(storageKey, id);
    else sessionStorage.removeItem(storageKey);
  } catch { /* Storage may be unavailable. */ }
}

export function clearDiagnosticId() {
  saveId(null);
}

function restoreId() {
  try {
    const value = sessionStorage.getItem(storageKey);
    return isDiagnosticId(value) ? value : null;
  } catch {
    return null;
  }
}

function isActive(job?: DiagnosticJob) {
  return job?.state === 'queued' || job?.state === 'running';
}

function activeDeadline(job: DiagnosticJob, pollUntil: number) {
  return Math.min(job.createdAt + maxActiveTime, job.expiresAt, pollUntil) + pollInterval;
}

function statusOf(error: unknown) {
  return error instanceof AdminApiError ? error.status : undefined;
}

function saveZip(blob: Blob, filename: string) {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  try {
    link.href = url;
    link.download = filename;
    document.body.append(link);
    link.click();
  } finally {
    link.remove();
    // Give the browser time to start reading the object URL.
    window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
  }
}

export function useDiagnostic(onSessionExpired: () => void) {
  const client = useQueryClient();
  const [id, setId] = useState(restoreId);
  const [pending, setPending] = useState<'create' | 'download' | null>(null);
  const [actionError, setActionError] = useState<{ action: 'create' | 'download'; error: unknown } | null>(null);
  const [clock, setClock] = useState(Date.now);
  const [pollUntil, setPollUntil] = useState(() => Date.now() + maxActiveTime);
  const action = useRef<AbortController | null>(null);

  const query = useQuery({
    queryKey: jobKey(id),
    enabled: id !== null,
    queryFn: ({ signal }) => loadDiagnostic(id!, AbortSignal.any([signal, AbortSignal.timeout(requestTimeout)])),
    retry: false,
    networkMode: 'always',
    staleTime: Infinity,
    refetchOnMount: 'always',
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
    refetchInterval: ({ state: { data, status } }) =>
      status === 'success' && data && isActive(data) && Date.now() < activeDeadline(data, pollUntil)
        ? pollInterval : false
  });

  const unauthorized = isUnauthorized(query.error) || isUnauthorized(actionError?.error);
  useEffect(() => {
    if (unauthorized) onSessionExpired();
  }, [unauthorized, onSessionExpired]);
  useEffect(() => () => action.current?.abort(), []);

  const job = query.data;
  const downloadStatus = actionError?.action === 'download' ? statusOf(actionError.error) : undefined;
  const missing = statusOf(query.error) === 404 || downloadStatus === 404;
  const downloadableState = job?.state === 'ready' || job?.state === 'partial';
  const deadline = job && (downloadableState ? job.expiresAt : isActive(job) ? activeDeadline(job, pollUntil) : null);
  useEffect(() => {
    if (deadline == null || deadline <= clock) return;
    const timer = window.setTimeout(() => setClock(Date.now()), Math.max(0, deadline - Date.now()));
    return () => window.clearTimeout(timer);
  }, [clock, deadline]);

  const now = Math.max(clock, Date.now());
  const expired = downloadStatus === 410 || job?.state === 'expired' || Boolean(downloadableState && job.expiresAt <= now);
  const timedOut = Boolean(job && isActive(job) && now >= activeDeadline(job, pollUntil));
  const state = missing ? null : expired ? 'expired' : job?.state;
  const canCreate = !unauthorized && !pending && !query.isFetching &&
    (missing || timedOut || !isActive(job));
  const canDownload = !unauthorized && !pending && !query.isFetching && !query.isError && !missing &&
    !expired && downloadableState && downloadStatus !== 409 && downloadStatus !== 503;

  async function run(kind: 'create' | 'download') {
    if (action.current || !(kind === 'create' ? canCreate : canDownload)) return;
    const controller = new AbortController();
    action.current = controller;
    const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(requestTimeout)]);
    setPending(kind);
    setActionError(null);
    try {
      if (kind === 'create') {
        const next = await createDiagnostic(signal);
        if (controller.signal.aborted) return;
        saveId(next.id);
        setPollUntil(Date.now() + maxActiveTime);
        client.setQueryData(jobKey(next.id), next);
        setId(next.id);
      } else if (job && job.expiresAt > Date.now()) {
        const { blob, filename } = await downloadDiagnostic(job.id, signal);
        if (!controller.signal.aborted) saveZip(blob, filename);
      }
    } catch (error) {
      if (!controller.signal.aborted) setActionError({ action: kind, error });
    } finally {
      action.current = null;
      if (!controller.signal.aborted) setPending(null);
    }
  }

  function refresh() {
    if (!id || pending || action.current || query.isFetching || missing || unauthorized) return;
    setActionError(null);
    void query.refetch({ cancelRefetch: false });
  }

  return {
    state, errorCode: job?.errorCode, pending, checking: id !== null && query.isPending && query.isFetching,
    timedOut, missing, unauthorized, canCreate, canDownload, run, refresh,
    canRefresh: Boolean(id && !missing && !expired && (query.isError || timedOut || downloadStatus === 409 || downloadStatus === 503)),
    refreshDisabled: query.isFetching || pending !== null,
    queryError: query.isError ? statusOf(query.error) ?? 'network' : null,
    actionError: actionError && { action: actionError.action, status: statusOf(actionError.error) }
  };
}

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AdminApiError, isUnauthorized, loadMonitoringCapacity, loadMonitoringEvents, loadMonitoringSummary } from '../../lib/adminApi';
import { CapacityView } from './CapacityView';
import { SummaryView } from './SummaryView';
import { diagnosticSummary, eventsPageSize, maxEventsOffset, nextEventsOffset, provenanceText, resultText, utcText, type MonitoringWindow } from './monitoringDomain';
import styles from './Monitoring.module.css';
import adminStyles from '../../app/Admin.module.css';

function endpointError(error: unknown) {
  return error instanceof AdminApiError && error.status === 403 ? 'Доступ запрещён (403).' : 'Не удалось загрузить данные.';
}

// Mounted only in the active Administration area. No background polling or privileged mutations.
export function MonitoringPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [windowHours, setWindowHours] = useState<MonitoringWindow>(24);
  const [offset, setOffset] = useState(0);
  const [copyFeedback, setCopyFeedback] = useState('');
  const queryOptions = { retry: false, refetchOnWindowFocus: false, refetchOnReconnect: false, staleTime: Infinity } as const;
  const summary = useQuery({ ...queryOptions, queryKey: ['admin', 'monitoring', 'summary', windowHours], queryFn: ({ signal }) => loadMonitoringSummary(windowHours, signal) });
  const events = useQuery({ ...queryOptions, queryKey: ['admin', 'monitoring', 'events', windowHours, offset], queryFn: ({ signal }) => loadMonitoringEvents(windowHours, offset, signal) });
  const capacity = useQuery({ ...queryOptions, queryKey: ['admin', 'monitoring', 'capacity'], queryFn: ({ signal }) => loadMonitoringCapacity(signal) });
  const unauthorized = [summary.error, events.error, capacity.error].some(isUnauthorized);
  useEffect(() => { if (unauthorized) onSessionExpired(); }, [unauthorized, onSessionExpired]);
  const next = nextEventsOffset(events.data);
  const fetching = summary.isFetching || events.isFetching || capacity.isFetching;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(diagnosticSummary({ window: windowHours,
        summary: summary.isError ? undefined : summary.data, events: events.isError ? undefined : events.data, capacity: capacity.isError ? undefined : capacity.data }));
      setCopyFeedback('Диагностическая сводка скопирована.');
    } catch { setCopyFeedback('Не удалось скопировать сводку.'); }
  };

  if (unauthorized) return null;
  return <section className={styles.panel} aria-labelledby="monitoring-title">
    <h3 id="monitoring-title">Операторский мониторинг</h3>
    <p className={styles.note}>Наблюдения за выбранный период — текущее состояние туннеля не подтверждено</p>
    <div className={styles.toolbar}>
      <label>Период наблюдений<select value={windowHours} onChange={(event) => { setWindowHours(Number(event.target.value) as MonitoringWindow); setOffset(0); setCopyFeedback(''); }}>
        <option value={24}>24 часа</option><option value={168}>7 дней</option>
      </select></label>
      <button type="button" className={adminStyles.secondaryButton} disabled={fetching} onClick={() => { setCopyFeedback(''); void summary.refetch(); void events.refetch(); void capacity.refetch(); }}>Обновить мониторинг</button>
      <button type="button" className={adminStyles.secondaryButton} disabled={fetching} onClick={() => { void copy(); }}>Скопировать диагностическую сводку</button>
    </div>
    {copyFeedback ? <p role="status">{copyFeedback}</p> : null}
    {fetching ? <p role="status">Загрузка наблюдений…</p> : null}
    {summary.isError ? <p role="alert">Сводка: {endpointError(summary.error)}</p> : null}
    {(summary.isError && summary.data) || (events.isError && events.data) || (capacity.isError && capacity.data) ? <p className={styles.note}>Обновление не удалось: ниже сохранены данные предыдущего успешного запроса. Даты и возраст относятся к тому ответу.</p> : null}
    {summary.data ? <SummaryView data={summary.data} events={events.isError ? undefined : events.data} /> : null}
    <h4>Последние события</h4>
    <p>Новые события первыми; до {eventsPageSize} записей на странице. Сохранённая история не является live alert; длительность недоступности из этих данных не выводится.</p>
    {events.isError ? <p role="alert">События: {endpointError(events.error)}</p> : null}
    {events.data ? <>
      <p>Сформировано: {utcText(events.data.generated_at_utc)} · Период: {utcText(events.data.window_start_utc)} — {utcText(events.data.window_end_utc)}</p>
      {!events.data.rows.length ? <p>На этой странице нет событий.</p> : <ol className={styles.events}>{events.data.rows.slice(0, eventsPageSize).map((e, index) => <li key={index}>
        <time>{utcText(e.event_at_utc)}</time> · {e.egress_slot !== null && e.egress_slot >= 1 && e.egress_slot <= 5 ? `egress${e.egress_slot}` : 'не указан'} · {e.source_stream} · {e.event_type.slice(0, 160)} · {resultText(e.result)}
        <small>{provenanceText(e.provenance)} · Наблюдалось: {utcText(e.observed_at_utc)}</small>
      </li>)}</ol>}
    </> : null}
    <div className={styles.toolbar}>
      <button type="button" className={adminStyles.secondaryButton} disabled={offset === 0 || events.isFetching} onClick={() => { setOffset(Math.max(0, offset - eventsPageSize)); setCopyFeedback(''); }}>Предыдущие</button>
      <span>Страница {offset / eventsPageSize + 1}</span>
      <button type="button" className={adminStyles.secondaryButton} disabled={next === null || events.isFetching || events.isError} onClick={() => { if (next !== null) { setOffset(next); setCopyFeedback(''); } }}>Следующие</button>
    </div>
    {events.data?.has_more && offset === maxEventsOffset ? <p>Достигнут предел просмотра событий.</p> : null}
    {capacity.isError ? <p role="alert">Ресурсы: {endpointError(capacity.error)}</p> : null}
    {capacity.data ? <CapacityView data={capacity.data} /> : null}
  </section>;
}

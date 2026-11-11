import type { AdminMonitoringStreamSummary, AdminMonitoringSummaryResponse } from '@wg-paid/api';
import { eventCountsForSlot, eventStreams, numberText, slots, statusText, utcText } from './monitoringDomain';
import styles from './Monitoring.module.css';

const noData = 'Нет данных';
const observedNumber = (value: number | null | undefined, unit = '') => value == null ? noData : numberText(value, unit);
const observedTime = (value: string | null | undefined) => value == null ? noData : utcText(value);

function freshness(stale: boolean, time: string | null, age: number | null) {
  if (utcText(time) === '—' || age == null) return 'Свежесть неизвестна';
  return stale ? 'Устарело (stale)' : 'В пределах порога';
}

function hasStreamContact(stream: AdminMonitoringStreamSummary) {
  return stream.last_attempt_at_utc != null || stream.last_success_at_utc != null;
}

type EventCounts = ReturnType<typeof eventCountsForSlot>;
const total = (counts: EventCounts['health']) => counts.forward_live + counts.historical_retained_only;

function EventProvenance({ counts }: { counts: EventCounts }) {
  return <details className={styles.details}>
    <summary>Происхождение событий</summary>
    <dl className={styles.metrics}>{eventStreams.map((source) => <div key={source}>
      <dt>{source}</dt>
      <dd>Прямые наблюдения (forward_live): {counts[source].forward_live}</dd>
      <dd>Сохранённая история (historical_retained_only): {counts[source].historical_retained_only}</dd>
    </div>)}</dl>
  </details>;
}

function SelectorTable({ data }: { data?: AdminMonitoringSummaryResponse }) {
  const activity = data?.activity;
  const system = data && eventCountsForSlot(data.event_observations, null);
  const missingPeaks = activity && (activity.last_active_configurations_observed ?? 0) > 0 &&
    slots.every((slot) => activity.last_selector_peaks_observed?.[`egress${slot}`] == null);

  return <div className={styles.compact}>
    <h4 id="selectors-title">Пять логических селекторов</h4>
    <p>Health и recovery — наблюдения событий за выбранный период. Полнота счётчиков зависит от покрытия потоков.</p>
    <div className={styles.scroll} tabIndex={0} role="region" aria-labelledby="selectors-title">
      <table className={`${styles.table} ${styles.selectorTable}`} aria-labelledby="selectors-title">
        <thead><tr>{['Селектор', 'Пик конфигураций за последнюю наблюдавшуюся минуту', 'События health за период',
          'События recovery за период', 'Примечание'].map((label) => <th key={label} scope="col">{label}</th>)}</tr></thead>
        <tbody>{slots.map((slot) => {
          const selector = `egress${slot}`;
          const peak = activity?.last_selector_peaks_observed?.[selector];
          const counts = data && eventCountsForSlot(data.event_observations, slot);
          const hasEvents = counts && (total(counts.health) > 0 || total(counts.recovery) > 0);
          return <tr key={slot}>
            <th scope="row">{selector}</th>
            <td>{observedNumber(peak)}</td>
            <td>{counts ? total(counts.health) : noData}</td>
            <td>{counts ? total(counts.recovery) : noData}</td>
            <td>
              {data && peak == null && <p>Нет оценки последней минуты</p>}
              {counts && (hasEvents ? <EventProvenance counts={counts} /> : <p>Нет событий за период</p>)}
              {!data && noData}
            </td>
          </tr>;
        })}</tbody>
      </table>
    </div>
    {missingPeaks && <p className={styles.note}>Общее число конфигураций за последнюю минуту положительное, а оценки по всем пяти селекторам отсутствуют. Требуется сверка агрегации.</p>}
    {system && <div className={styles.compact}>
      <p><strong>Системные события без привязки к egress</strong> · health: {total(system.health)} · recovery: {total(system.recovery)}</p>
      {(total(system.health) > 0 || total(system.recovery) > 0) && <EventProvenance counts={system} />}
    </div>}
  </div>;
}

function Overview({ data }: { data: AdminMonitoringSummaryResponse }) {
  const activity = data.activity;
  const coverage = activity.coverage_ratio_over_window;
  return <section className={styles.compact} aria-labelledby="monitoring-overview-title">
    <h4 id="monitoring-overview-title">Свежесть и покрытие</h4>
    <p>Сформировано сервером: {observedTime(data.generated_at_utc)} · Период: {observedTime(data.window_start_utc)} — {observedTime(data.window_end_utc)}</p>
    <p>Последняя наблюдавшаяся закрытая минута: {observedTime(activity.last_observed_minute_utc)}</p>
    <dl className={styles.metrics}>
      <div><dt>Покрытие окна</dt><dd>{observedNumber(activity.observed_minutes)} / {observedNumber(activity.expected_minutes)} мин · {observedNumber(coverage == null ? null : coverage * 100, ' %')}</dd></div>
      <div><dt>Активность · последняя наблюдавшаяся минута</dt>
        <dd>Конфигурации: {observedNumber(activity.last_active_configurations_observed)} · Пользователи: {observedNumber(activity.last_active_users_observed)}</dd>
      </div>
      {eventStreams.map((source) => {
        const stream = data.stream_coverage.find((item) => item.source_stream === source);
        return <div key={source}><dt>Поток {source}</dt>
          {stream && hasStreamContact(stream) ? <>
            <dd>{freshness(stream.stale, stream.last_success_at_utc, stream.success_age_seconds)} · {statusText(stream.continuity)}</dd>
            <dd>Последний успех: {observedTime(stream.last_success_at_utc)} · Возраст: {observedNumber(stream.success_age_seconds, ' с')}</dd>
            <dd>Пропуски: {observedNumber(stream.gap_count)} · Неизвестные строки: {observedNumber(stream.unknown_lines_total)}</dd>
          </> : <dd>Нет данных о потоке</dd>}
        </div>;
      })}
    </dl>
    <p>Приём активности: {observedTime(activity.last_received_at_utc)} · Возраст: {observedNumber(activity.last_received_age_seconds, ' с')} · {freshness(activity.stale, activity.last_received_at_utc, activity.last_received_age_seconds)} · Порог: {observedNumber(data.freshness_threshold_seconds, ' с')}</p>
    <p className={styles.note}>Это история наблюдений, а не проверка доступности VPN в реальном времени.</p>
    <details className={styles.details}>
      <summary>За выбранный период</summary>
      <dl className={styles.metrics}>{([
        ['Полных минут', activity.complete_minutes], ['Частичных минут', activity.partial_minutes],
        ['Неизвестных минут', activity.unknown_minutes], ['Пропущенных минут', activity.missing_minutes],
        ['Несопоставленные строки', activity.unmatched_rows_total], ['Конфликтующие слоты', activity.conflicted_slots_total],
        ['Пик конфигураций', activity.peak_active_configurations_observed], ['Пик пользователей', activity.peak_active_users_observed]
      ] as const).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{observedNumber(value)}</dd></div>)}</dl>
      {data.stream_coverage.filter(hasStreamContact).map((stream) => <p key={stream.source_stream}>
        {stream.source_stream} · Последняя попытка: {observedTime(stream.last_attempt_at_utc)} · Последний пропуск: {observedTime(stream.last_gap_first_at_utc)} — {observedTime(stream.last_gap_last_at_utc)} · Heartbeat: {observedNumber(stream.heartbeat_total)} · Полученные события: {observedNumber(stream.ingested_events_total)}
      </p>)}
    </details>
  </section>;
}

export function SummaryView({ data }: { data?: AdminMonitoringSummaryResponse }) {
  return <>
    {data && <Overview data={data} />}
    <SelectorTable data={data} />
  </>;
}

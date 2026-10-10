import type { AdminMonitoringEventsResponse, AdminMonitoringSummaryResponse } from '@wg-paid/api';
import { numberText, provenanceText, slots, statusText, utcText } from './monitoringDomain';
import styles from './Monitoring.module.css';

export function SummaryView({ data, events }: { data: AdminMonitoringSummaryResponse; events?: AdminMonitoringEventsResponse }) {
  const a = data.activity;
  return <>
    <h4>Свежесть и покрытие</h4>
    <p>Сформировано: {utcText(data.generated_at_utc)} · Период: {utcText(data.window_start_utc)} — {utcText(data.window_end_utc)}</p>
    <dl className={styles.metrics}>
      {[
        ['Последнее получение', utcText(a.last_received_at_utc)],
        ['Возраст полученных данных', numberText(a.last_received_age_seconds, ' с')],
        ['Свежесть', utcText(a.last_received_at_utc) === '—' || a.last_received_age_seconds == null ? 'Неизвестно' : a.stale ? 'Устарело (stale)' : 'В пределах порога'],
        ['Порог свежести', numberText(data.freshness_threshold_seconds, ' с')],
        ['Последняя наблюдаемая минута', utcText(a.last_observed_minute_utc)],
        ['Покрытие окна', numberText(a.coverage_ratio_over_window == null ? null : a.coverage_ratio_over_window * 100, ' %')],
        ['Ожидалось минут', numberText(a.expected_minutes)], ['Наблюдалось минут', numberText(a.observed_minutes)],
        ['Полных минут', numberText(a.complete_minutes)], ['Частичных минут', numberText(a.partial_minutes)],
        ['Неизвестных минут', numberText(a.unknown_minutes)], ['Пропущенных минут', numberText(a.missing_minutes)]
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <div className={styles.grid}>{(['health', 'recovery'] as const).map((source) => {
      const stream = data.stream_coverage.find((s) => s.source_stream === source);
      return <div className={styles.card} key={source}><h4>Поток {source}</h4>
        {!stream ? <p>Неизвестно — нет данных потока.</p> : <>
          <p>{statusText(stream.continuity)} · {stream.stale ? 'Устарело (stale)' : utcText(stream.last_success_at_utc) === '—' || stream.success_age_seconds == null ? 'Свежесть неизвестна' : 'В пределах порога'}</p>
          <p>Последняя попытка: {utcText(stream.last_attempt_at_utc)}</p>
          <p>Последний успех: {utcText(stream.last_success_at_utc)} · {numberText(stream.success_age_seconds, ' с')}</p>
          <p>Пропуски: {numberText(stream.gap_count)} · Неизвестные строки: {numberText(stream.unknown_lines_total)}</p>
          <p>Границы последнего пропуска: {utcText(stream.last_gap_first_at_utc)} — {utcText(stream.last_gap_last_at_utc)}</p>
          <p>Heartbeat: {numberText(stream.heartbeat_total)} · Полученные события: {numberText(stream.ingested_events_total)}</p>
        </>}
      </div>;
    })}</div>
    <h4>Наблюдаемая активность</h4>
    <p className={styles.note}>Последние и пиковые значения логических конфигураций и пользователей зависят от покрытия. Это не точное число пользователей сейчас и не число вариантов WG/AWG.</p>
    <dl className={styles.metrics}>
      {[
        ['Конфигурации: последнее / пик', `${numberText(a.last_active_configurations_observed)} / ${numberText(a.peak_active_configurations_observed)}`],
        ['Пользователи: последнее / пик', `${numberText(a.last_active_users_observed)} / ${numberText(a.peak_active_users_observed)}`],
        ['Несопоставленные строки', numberText(a.unmatched_rows_total)], ['Конфликтующие слоты', numberText(a.conflicted_slots_total)]
      ].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}
    </dl>
    <h4>Пять логических селекторов</h4>
    <p>Счётчики ниже — наблюдения событий за период, а не число независимых инцидентов. Последнее событие берётся только из открытой страницы событий.</p>
    <div className={styles.grid}>{slots.map((slot) => {
      const counts = data.event_observations.filter((e) => e.egress_slot === slot);
      const recent = events?.rows.find((e) => e.egress_slot === slot);
      return <div className={styles.card} key={slot}><h4>egress{slot}</h4>
        <p>Пик конфигураций в последнем наблюдении: {numberText(a.last_selector_peaks_observed[`egress${slot}`])}</p>
        {!counts.length ? <p>Наблюдения событий отсутствуют.</p> : counts.map((e, index) => <p key={index}>{e.source_stream} · {e.event_type.slice(0, 160)} · {numberText(e.count)} · {provenanceText(e.provenance)}</p>)}
        <p>Последнее на странице: {recent ? `${utcText(recent.event_at_utc)} · ${recent.event_type.slice(0, 160)} · ${provenanceText(recent.provenance)}` : '—'}</p>
      </div>;
    })}</div>
  </>;
}

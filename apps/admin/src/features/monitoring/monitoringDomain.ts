import type { AdminCapacityResponse, AdminMonitoringEventsResponse, AdminMonitoringSummaryResponse } from '@wg-paid/api';

export const eventsPageSize = 50;
export const maxEventsOffset = 5000;
export type MonitoringWindow = 24 | 168;
export const vmKeys = ['vm100', 'vm101', 'vm103', 'vm130'] as const;
export const guestKeys = ['vm103', 'vm121', 'vm130'] as const;
export const slots = [1, 2, 3, 4, 5] as const;

export function numberText(value: number | null | undefined, unit = '') {
  return typeof value === 'number' && Number.isFinite(value) ? `${Number(value.toFixed(2))}${unit}` : '—';
}

export function rateText(value: number | null | undefined) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return value >= 1_000_000 ? numberText(value / 1_000_000, ' MB/s') : numberText(value / 1000, ' kB/s');
}

// Strict timestamps and finite numbers are also the diagnostic export's only free-form values.
export function utcText(value: string | null | undefined) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,6})?(?:Z|\+00:00)$/.test(value)
    && Number.isFinite(Date.parse(value)) ? value : '—';
}

export function statusText(value: string | null | undefined) {
  switch (value) {
    case 'available': return 'Доступно (available)';
    case 'partial': return 'Частичные данные (partial)';
    case 'stale': return 'Устарело (stale)';
    case 'unavailable': return 'Недоступно (unavailable)';
    case 'continuous': return 'Без обнаруженных пропусков';
    case 'gap_detected': return 'Обнаружены пропуски';
    case 'error': return 'Ошибка источника';
    default: return 'Неизвестно';
  }
}

export function provenanceText(value: string) {
  return value === 'forward_live' ? 'Прямые наблюдения (forward_live)' : 'Сохранённая история — не live alert (historical_retained_only)';
}

export function resultText(value: string) {
  switch (value) {
    case 'pass': return 'Проверка пройдена';
    case 'failed': return 'Проверка не пройдена';
    case 'other': return 'Другой результат';
    default: return 'Не применимо';
  }
}

export function nextEventsOffset(data: AdminMonitoringEventsResponse | undefined) {
  if (!data?.has_more || data.limit !== eventsPageSize || !Number.isInteger(data.offset) || data.offset < 0 || data.offset % eventsPageSize !== 0) return null;
  const next = data.offset + eventsPageSize;
  return next <= maxEventsOffset ? next : null;
}

interface DiagnosticInput {
  window: MonitoringWindow;
  summary?: AdminMonitoringSummaryResponse;
  events?: AdminMonitoringEventsResponse;
  capacity?: AdminCapacityResponse;
}

// Never serialize responses: opaque event types, extra properties and API error details may contain PII.
// Project only fixed enums, validated UTC timestamps, booleans and finite numeric aggregates.
export function diagnosticSummary({ window, summary, events, capacity }: DiagnosticInput) {
  const lines = ['WG admin monitoring B4/v1', `window_hours=${window}`, 'current_tunnel_health_verified=false'];
  if (summary) {
    const a = summary.activity;
    lines.push(`summary_generated_at=${utcText(summary.generated_at_utc)}`,
      `window_start=${utcText(summary.window_start_utc)} window_end=${utcText(summary.window_end_utc)}`,
      `received_at=${utcText(a.last_received_at_utc)} age_seconds=${numberText(a.last_received_age_seconds)} stale=${a.stale === true} threshold_seconds=${numberText(summary.freshness_threshold_seconds)}`);
    for (const key of ['expected_minutes', 'observed_minutes', 'complete_minutes', 'partial_minutes', 'unknown_minutes', 'missing_minutes', 'coverage_ratio_over_window', 'last_active_configurations_observed', 'peak_active_configurations_observed', 'last_active_users_observed', 'peak_active_users_observed', 'unmatched_rows_total', 'conflicted_slots_total'] as const) {
      lines.push(`${key}=${numberText(a[key])}`);
    }
    for (const slot of slots) lines.push(`egress${slot}_last_observed_peak=${numberText(a.last_selector_peaks_observed[`egress${slot}`])}`);
    for (const source of ['health', 'recovery'] as const) {
      const stream = summary.stream_coverage.find((s) => s.source_stream === source);
      lines.push(stream ? `${source}: ${statusText(stream.continuity)} stale=${stream.stale === true} gaps=${numberText(stream.gap_count)} unknown_lines=${numberText(stream.unknown_lines_total)} received_events=${numberText(stream.ingested_events_total)} heartbeat=${numberText(stream.heartbeat_total)} last_success=${utcText(stream.last_success_at_utc)}` : `${source}: unavailable`);
      for (const provenance of ['forward_live', 'historical_retained_only'] as const) {
        const counts = summary.event_observations.filter((e) => e.source_stream === source && e.provenance === provenance);
        const total = counts.reduce((sum, e) => sum + (typeof e.count === 'number' && Number.isFinite(e.count) ? e.count : 0), 0);
        lines.push(`${source}/${provenance}: observations=${numberText(total)}`);
      }
    }
  } else lines.push('summary: unavailable');
  lines.push(events ? `events_generated_at=${utcText(events.generated_at_utc)} offset=${numberText(events.offset)} fetched_rows=${Math.min(events.rows.length, eventsPageSize)} has_more=${events.has_more === true}` : 'events: unavailable');
  if (capacity) {
    lines.push(`capacity_generated_at=${utcText(capacity.generated_at_utc)} status=${statusText(capacity.status)} snapshot_at=${utcText(capacity.snapshot_at_utc)} age_seconds=${numberText(capacity.age_seconds)} threshold_seconds=${numberText(capacity.freshness_threshold_seconds)}`);
    if (capacity.snapshot) {
      lines.push(`source=vm130_resource_monitor source_status=${statusText(capacity.snapshot.source_status)}`);
      for (const key of vmKeys) {
        const vm = capacity.snapshot.vms[key];
        lines.push(`${key}: status=${statusText(vm?.status)} vcpus=${numberText(vm?.vcpus)} day_cpu_avg_pct=${numberText(vm?.day.cpu_avg_pct)} week_cpu_avg_pct=${numberText(vm?.week.cpu_avg_pct)}`);
      }
      for (const key of guestKeys) {
        const guest = capacity.snapshot.guests[key];
        lines.push(`${key}_guest: status=${statusText(guest?.status)} ram_available_mib=${numberText(guest?.mem_available_mib)} psi_cpu_avg300=${numberText(guest?.psi_cpu_avg300)} psi_memory_avg300=${numberText(guest?.psi_memory_avg300)} psi_io_avg300=${numberText(guest?.psi_io_avg300)}`);
      }
      lines.push(`node: status=${statusText(capacity.snapshot.node.status)} cpu_count=${numberText(capacity.snapshot.node.cpu_count)} mem_used_pct=${numberText(capacity.snapshot.node.mem_used_pct)}`,
        `nic: status=${statusText(capacity.snapshot.nic.status)} link_up=${capacity.snapshot.nic.link_up === true ? 'true' : capacity.snapshot.nic.link_up === false ? 'false' : 'unknown'} link_mbps=${numberText(capacity.snapshot.nic.link_mbps)}`);
    } else lines.push('capacity_snapshot: unavailable');
  } else lines.push('capacity: unavailable');
  return lines.join('\n').slice(0, 8000);
}

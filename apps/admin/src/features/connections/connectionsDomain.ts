import type { AdminRuntimeConnectionRow } from '@wg-paid/api';

export const selectors = ['cs1', 'cs2', 'cs3', 'cs4', 'cs5'] as const;
export const runtimeConnectionsKey = ['admin', 'runtime', 'connections'] as const;

export type RuntimeStatus = 'now' | 'active' | 'idle' | 'never_seen';

export function runtimeStatus(row: AdminRuntimeConnectionRow): RuntimeStatus {
  if (row.active_now) return 'now';
  if (row.active_state) return 'active';
  if (row.last_handshake_at !== null) return 'idle';
  return 'never_seen';
}

const byteUnits = ['B', 'KiB', 'MiB', 'GiB', 'TiB'] as const;
const byteNumber = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });

export function formatBytes(value: number) {
  if (!Number.isFinite(value)) return '—';
  const normalized = Math.max(0, value);
  const unitIndex = Math.min(
    normalized > 0 ? Math.floor(Math.log(normalized) / Math.log(1024)) : 0,
    byteUnits.length - 1
  );
  return `${byteNumber.format(normalized / (1024 ** unitIndex))} ${byteUnits[unitIndex]}`;
}

export function formatByteRate(value: number) {
  const formatted = formatBytes(value);
  return formatted === '—' ? formatted : `${formatted}/s`;
}

export function formatTimestamp(value: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString();
}

export function profileIdentity(row: AdminRuntimeConnectionRow) {
  return row.profile_label?.trim() || row.tunnel_ip;
}

export function activeRowsForSelector(rows: Array<AdminRuntimeConnectionRow>, selector: string) {
  return rows.filter((row) => row.selector === selector && row.active_state);
}

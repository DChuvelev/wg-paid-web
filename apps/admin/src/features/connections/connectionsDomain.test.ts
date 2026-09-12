import type { AdminRuntimeConnectionRow } from '@wg-paid/api';
import { describe, expect, test } from 'vitest';
import { activeRowsForSelector, formatByteRate, formatBytes, formatTimestamp, profileIdentity, runtimeStatus } from './connectionsDomain';

function row(overrides: Partial<AdminRuntimeConnectionRow> = {}): AdminRuntimeConnectionRow {
  return {
    active_now: false,
    active_state: false,
    display_name: null,
    email: 'user@example.test',
    last_active_at: null,
    last_handshake_at: null,
    last_reassign_at: null,
    profile_id: 'profile-1',
    profile_label: null,
    rx_bytes: 0,
    rx_bytes_per_second: 0,
    selector: 'cs1',
    tunnel_ip: '10.253.1.10',
    tx_bytes: 0,
    tx_bytes_per_second: 0,
    user_id: 'user-1',
    ...overrides
  };
}

describe('runtime connection presentation', () => {
  test('derives statuses in the required precedence', () => {
    expect(runtimeStatus(row({ active_now: true, active_state: false }))).toBe('now');
    expect(runtimeStatus(row({ active_state: true }))).toBe('active');
    expect(runtimeStatus(row({ last_handshake_at: '2026-09-12T10:00:00Z' }))).toBe('idle');
    expect(runtimeStatus(row())).toBe('never_seen');
  });

  test('uses a non-empty label and otherwise the stable tunnel IP', () => {
    expect(profileIdentity(row({ profile_label: ' Studio computer ' }))).toBe('Studio computer');
    expect(profileIdentity(row({ profile_label: '   ' }))).toBe('10.253.1.10');
    expect(profileIdentity(row())).toBe('10.253.1.10');
  });

  test('formats totals, rates, and timestamps readably', () => {
    expect(formatBytes(1536)).toMatch(/^1[.,]5 KiB$/);
    expect(formatByteRate(2048)).toBe('2 KiB/s');
    expect(formatTimestamp(null)).toBe('—');
    expect(formatTimestamp('2026-09-12T10:00:00Z')).toBe(new Date('2026-09-12T10:00:00Z').toLocaleString());
  });

  test('includes only active-state rows in selector load', () => {
    const now = row({ active_now: true, active_state: true, profile_id: 'now' });
    const active = row({ active_state: true, profile_id: 'active' });
    const idle = row({ last_handshake_at: '2026-09-12T10:00:00Z', profile_id: 'idle' });
    const other = row({ active_state: true, profile_id: 'other', selector: 'cs2' });
    expect(activeRowsForSelector([now, active, idle, other], 'cs1').map((item) => item.profile_id)).toEqual(['now', 'active']);
  });
});

import type { AdminRuntimeConnectionRow } from '@wg-paid/api';
import { describe, expect, test } from 'vitest';
import {
  activeRowsForSelector,
  configurationName,
  formatByteRate,
  formatBytes,
  formatTimestamp,
  groupRuntimeConnections,
  profileIdentity,
  protocolBadge,
  runtimeStatus
} from './connectionsDomain';

const emptyFilters = () => ({
  protocols: new Set<'wireguard' | 'amneziawg'>(),
  search: '',
  selectors: new Set<string>(),
  statuses: new Set<'now' | 'active' | 'idle' | 'never_seen'>()
});

function row(overrides: Partial<AdminRuntimeConnectionRow> = {}): AdminRuntimeConnectionRow {
  return {
    active_now: false,
    active_state: false,
    configuration_id: 'configuration-1',
    configuration_label: null,
    configuration_ordinal: 1,
    display_name: null,
    email: 'user@example.test',
    last_active_at: null,
    last_handshake_at: null,
    last_reassign_at: null,
    profile_id: 'profile-1',
    profile_label: null,
    protocol: 'wireguard',
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

  test('uses backend configuration identity and fixed WG-before-AWG leaf order', () => {
    const groups = groupRuntimeConnections([
      row({ configuration_label: 'Laptop', profile_id: 'awg', protocol: 'amneziawg' }),
      row({ configuration_label: 'Laptop', profile_id: 'wg', protocol: 'wireguard' })
    ], emptyFilters(), { direction: 'asc', key: 'user' });
    expect(groups).toHaveLength(1);
    expect(groups[0]?.configurations[0]).toMatchObject({ configurationId: 'configuration-1', label: 'Laptop', ordinal: 1, totalRows: 2 });
    expect(groups[0]?.configurations[0]?.rows.map((item) => item.profile_id)).toEqual(['wg', 'awg']);
    expect(configurationName({ label: null, ordinal: 7 })).toBe('Configuration #7');
    expect(protocolBadge('wireguard')).toBe('WG');
    expect(protocolBadge('amneziawg')).toBe('AWG');
  });

  test('searches user/configuration identity and combines multi-select dimensions as AND', () => {
    const rows = [
      row({ configuration_id: 'configuration-phone', configuration_label: 'Phone', profile_id: 'phone-wg', protocol: 'wireguard' }),
      row({ configuration_id: 'configuration-phone', configuration_label: 'Phone', profile_id: 'phone-awg', protocol: 'amneziawg', selector: 'cs2' }),
      row({ configuration_id: 'configuration-laptop', configuration_label: 'Laptop', configuration_ordinal: 2, profile_id: 'laptop-wg', active_state: true })
    ];
    const searchGroups = groupRuntimeConnections(rows, { ...emptyFilters(), search: '  LAPTOP ' }, { direction: 'asc', key: 'user' });
    expect(searchGroups[0]?.configurations.map((group) => group.configurationId)).toEqual(['configuration-laptop']);

    const filtered = groupRuntimeConnections(rows, {
      ...emptyFilters(),
      protocols: new Set(['amneziawg']),
      selectors: new Set(['cs2']),
      statuses: new Set(['never_seen'])
    }, { direction: 'asc', key: 'user' });
    expect(filtered[0]?.configurations[0]?.rows.map((item) => item.profile_id)).toEqual(['phone-awg']);
    expect(filtered[0]?.configurations[0]?.totalRows).toBe(2);
  });

  test('sorts aggregate groups without tearing siblings apart and keeps null timestamps last both ways', () => {
    const rows = [
      row({ user_id: 'user-b', email: 'b@example.test', configuration_id: 'b-2', configuration_ordinal: 2, profile_id: 'b-awg', protocol: 'amneziawg', last_active_at: null }),
      row({ user_id: 'user-a', email: 'a@example.test', configuration_id: 'a-1', configuration_ordinal: 1, profile_id: 'a-wg', last_active_at: '2026-09-12T10:00:00Z' }),
      row({ user_id: 'user-b', email: 'b@example.test', configuration_id: 'b-2', configuration_ordinal: 2, profile_id: 'b-wg', last_active_at: null }),
      row({ user_id: 'user-a', email: 'a@example.test', configuration_id: 'a-2', configuration_ordinal: 2, profile_id: 'a-new', last_active_at: '2026-09-12T11:00:00Z' })
    ];
    for (const direction of ['asc', 'desc'] as const) {
      const groups = groupRuntimeConnections(rows, emptyFilters(), { direction, key: 'last_activity' });
      expect(groups.map((group) => group.userId)).toEqual(['user-a', 'user-b']);
      expect(groups[0]?.configurations.map((group) => group.configurationId)).toEqual(
        direction === 'asc' ? ['a-1', 'a-2'] : ['a-2', 'a-1']
      );
      expect(groups[1]?.configurations[0]?.rows.map((item) => item.profile_id)).toEqual(['b-wg', 'b-awg']);
    }
  });

  test('computes aggregate sort keys only from visible descendants', () => {
    const rows = [
      row({ user_id: 'user-a', email: 'a@example.test', profile_id: 'a-wg', protocol: 'wireguard', last_handshake_at: '2026-09-12T09:00:00Z' }),
      row({ user_id: 'user-a', email: 'a@example.test', profile_id: 'a-awg', protocol: 'amneziawg', last_handshake_at: '2026-09-12T12:00:00Z' }),
      row({ user_id: 'user-b', email: 'b@example.test', configuration_id: 'configuration-b', profile_id: 'b-wg', last_handshake_at: '2026-09-12T10:00:00Z' })
    ];
    const groups = groupRuntimeConnections(rows, { ...emptyFilters(), protocols: new Set(['wireguard']) }, { direction: 'desc', key: 'last_handshake' });
    expect(groups.map((group) => group.userId)).toEqual(['user-b', 'user-a']);
  });

  test('sorts status and selector aggregates with deterministic user ties', () => {
    const rows = [
      row({ user_id: 'user-idle', email: 'idle@example.test', profile_id: 'idle', selector: 'cs2', last_handshake_at: '2026-09-12T09:00:00Z' }),
      row({ user_id: 'user-active', email: 'active@example.test', profile_id: 'active', selector: 'cs1', active_state: true })
    ];
    expect(groupRuntimeConnections(rows, emptyFilters(), { direction: 'asc', key: 'status' }).map((group) => group.userId))
      .toEqual(['user-active', 'user-idle']);
    expect(groupRuntimeConnections(rows, emptyFilters(), { direction: 'desc', key: 'status' }).map((group) => group.userId))
      .toEqual(['user-idle', 'user-active']);
    expect(groupRuntimeConnections(rows, emptyFilters(), { direction: 'asc', key: 'selector' }).map((group) => group.userId))
      .toEqual(['user-active', 'user-idle']);
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, within } from '@testing-library/react';
import type { AdminRuntimeConnectionRow, AdminRuntimeConnectionsResponse } from '@wg-paid/api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminApiError, loadRuntimeConnections } from '../../lib/adminApi';
import { ConnectionsPanel } from './ConnectionsPanel';
import { runtimeConnectionsKey } from './connectionsDomain';

vi.mock('../../lib/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/adminApi')>(),
  loadRuntimeConnections: vi.fn()
}));

function row(overrides: Partial<AdminRuntimeConnectionRow> = {}): AdminRuntimeConnectionRow {
  return {
    active_now: true, active_state: true, configuration_id: 'configuration-1', configuration_label: null,
    configuration_ordinal: 1, display_name: 'Mitya', email: 'mitya@example.test',
    last_active_at: '2026-09-12T10:02:00Z', last_handshake_at: '2026-09-12T10:01:00Z',
    last_reassign_at: null, profile_id: 'profile-1', profile_label: 'Studio computer', protocol: 'wireguard',
    rx_bytes: 1536, rx_bytes_per_second: 2048, selector: 'cs1', tunnel_ip: '10.253.1.10',
    tx_bytes: 1048576, tx_bytes_per_second: 512, user_id: 'user-1', ...overrides
  };
}

function snapshot(overrides: Partial<AdminRuntimeConnectionsResponse> = {}): AdminRuntimeConnectionsResponse {
  return {
    generated_at: '2026-09-12T10:03:00Z', received_at: '2026-09-12T10:03:01Z', rows: [row()],
    sample_interval_seconds: 5, snapshot_age_seconds: 2, stale: false,
    unmatched_runtime_rows_count: 0, ...overrides
  };
}

function renderPanel(onSessionExpired = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false, throwOnError: false } } });
  return { onSessionExpired, ...render(
    <QueryClientProvider client={client}><ConnectionsPanel active onSessionExpired={onSessionExpired} /></QueryClientProvider>
  ) };
}

async function renderPanelWithCachedError(error: AdminApiError, onSessionExpired = vi.fn()) {
  const client = new QueryClient({ defaultOptions: { queries: { gcTime: Infinity, retry: false, throwOnError: false } } });
  await client.fetchQuery({ queryKey: runtimeConnectionsKey, queryFn: () => Promise.reject(error) }).catch(() => undefined);
  return { onSessionExpired, ...render(
    <QueryClientProvider client={client}><ConnectionsPanel active={false} onSessionExpired={onSessionExpired} /></QueryClientProvider>
  ) };
}

beforeEach(() => vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot()));
afterEach(() => vi.clearAllMocks());

describe('ConnectionsPanel', () => {
  test('renders the exact grouped columns, configuration identity, protocol, counters, rates, and timestamps', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [row({ configuration_label: 'Workstation', protocol: 'amneziawg' })] }));
    renderPanel();
    expect(await screen.findByText('Mitya')).not.toBeNull();
    expect(screen.getByText('mitya@example.test')).not.toBeNull();
    expect(screen.getByText('Workstation')).not.toBeNull();
    expect(screen.getByText('#1')).not.toBeNull();
    const table = screen.getByRole('table');
    expect(within(table).getByText('AWG')).not.toBeNull();
    expect(screen.queryByText('Studio computer')).toBeNull();
    expect(screen.queryByText('10.253.1.10')).toBeNull();
    expect(within(table).getAllByRole('columnheader').map((header) => header.textContent?.replace(/[↑↓]/g, '').trim())).toEqual([
      'User', 'Configuration', 'Protocol', 'Status', 'Selector', 'RX rate', 'TX rate', 'RX total', 'TX total', 'Last handshake', 'Last activity'
    ]);
    expect(screen.getByText(/^1[.,]5 KiB$/)).not.toBeNull();
    expect(screen.getByText('2 KiB/s')).not.toBeNull();
    expect(screen.getByText('1 MiB')).not.toBeNull();
    expect(screen.getByText(new Date('2026-09-12T10:01:00Z').toLocaleString())).not.toBeNull();
    expect(screen.getByText(/not monthly traffic, billing usage, or quota/i)).not.toBeNull();
  });

  test('renders all runtime statuses, email-only users, backend ordinals, and null timestamps', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [
      row({ profile_id: 'now' }),
      row({ active_now: false, profile_id: 'active' }),
      row({ active_now: false, active_state: false, configuration_id: 'configuration-idle', display_name: null, email: 'idle@example.test', profile_id: 'idle', profile_label: null, user_id: 'user-idle' }),
      row({ active_now: false, active_state: false, configuration_id: 'configuration-never', display_name: null, email: 'never@example.test', last_active_at: null, last_handshake_at: null, profile_id: 'never', profile_label: null, user_id: 'user-never' })
    ] }));
    renderPanel();
    await screen.findByText('Mitya');
    expect(screen.getByText('now')).not.toBeNull();
    expect(screen.getByText('active')).not.toBeNull();
    expect(screen.getByText('idle')).not.toBeNull();
    expect(screen.getByText('never seen')).not.toBeNull();
    expect(screen.getAllByText('Configuration #1')).toHaveLength(3);
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
  });

  test('distinguishes first-snapshot waiting from a successful empty snapshot', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ generated_at: null, received_at: null, rows: [] }));
    const first = renderPanel();
    expect(await screen.findByText('Waiting for the first telemetry snapshot.')).not.toBeNull();
    first.unmount();
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [] }));
    renderPanel();
    expect(await screen.findByText('Snapshot received; it contains no runtime connection rows.')).not.toBeNull();
  });

  test('shows stale, API error, and unmatched diagnostics independently', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ stale: true, unmatched_runtime_rows_count: 3 }));
    const first = renderPanel();
    expect(await screen.findByText(/Telemetry is stale/)).not.toBeNull();
    expect(screen.getByText('Unmatched runtime rows: 3')).not.toBeNull();
    first.unmount();
    await renderPanelWithCachedError(new AdminApiError(503));
    expect((await screen.findByRole('alert')).textContent).toContain('Unable to load runtime telemetry.');
  });

  test('returns a 401 through the existing session-expired callback', async () => {
    const onSessionExpired = vi.fn();
    await renderPanelWithCachedError(new AdminApiError(401), onSessionExpired);
    await screen.findByRole('heading', { name: 'Connections' });
    await vi.waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  test('always renders five selectors and counts only active-state rows', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [
      row({ profile_id: 'now', selector: 'cs1' }),
      row({ active_now: false, profile_id: 'active', selector: 'cs1' }),
      row({ active_now: false, active_state: false, email: 'idle@example.test', profile_id: 'idle', selector: 'cs1' }),
      row({ active_now: false, profile_id: 'cs2-active', selector: 'cs2' })
    ] }));
    renderPanel();
    await screen.findByText('Mitya');
    fireEvent.click(screen.getByRole('button', { name: 'Selectors' }));
    const board = screen.getByLabelText('Active configuration load by selector');
    for (const selector of ['cs1', 'cs2', 'cs3', 'cs4', 'cs5']) {
      expect(within(board).getByRole('heading', { name: selector })).not.toBeNull();
    }
    expect(within(board).getByText('2 active')).not.toBeNull();
    expect(within(board).getByText('1 active')).not.toBeNull();
    expect(within(board).getAllByText('No active configurations')).toHaveLength(3);
    expect(within(board).queryByText('idle@example.test')).toBeNull();
    expect(within(board).getAllByText('WG')).toHaveLength(3);
    expect(within(board).getAllByText('Configuration #1')).toHaveLength(3);
  });

  test('filters protocol leaves without losing group context and discloses partial groups', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [
      row({ configuration_label: 'Laptop', profile_id: 'wg', protocol: 'wireguard' }),
      row({ configuration_label: 'Laptop', profile_id: 'awg', protocol: 'amneziawg' })
    ] }));
    renderPanel();
    await screen.findByText('Laptop');
    fireEvent.click(screen.getByLabelText('AWG'));
    expect(screen.getByText('Mitya')).not.toBeNull();
    expect(screen.getByText('Laptop')).not.toBeNull();
    expect(screen.getByText('#1')).not.toBeNull();
    expect(screen.getByText('1 of 2 protocol rows shown')).not.toBeNull();
    const table = screen.getByRole('table');
    expect(within(table).queryByText('WG')).toBeNull();
    expect(within(table).getByText('AWG')).not.toBeNull();
  });

  test('text and status filters prune empty groups while selector-board data remains unfiltered', async () => {
    vi.mocked(loadRuntimeConnections).mockResolvedValue(snapshot({ rows: [
      row({ configuration_id: 'phone', configuration_label: 'Phone', profile_id: 'phone', selector: 'cs1' }),
      row({ active_now: false, configuration_id: 'laptop', configuration_label: 'Laptop', configuration_ordinal: 2, profile_id: 'laptop', selector: 'cs2' })
    ] }));
    renderPanel();
    await screen.findByText('Phone');
    fireEvent.change(screen.getByLabelText('Search user or configuration'), { target: { value: 'laptop' } });
    fireEvent.click(screen.getByLabelText('Active'));
    expect(screen.queryByText('Phone')).toBeNull();
    expect(screen.getByText('Laptop')).not.toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Selectors' }));
    const board = screen.getByLabelText('Active configuration load by selector');
    expect(within(board).getByText('Phone')).not.toBeNull();
    expect(within(board).getByText('Laptop')).not.toBeNull();
  });

  test('uses the required default sort directions in the table controls', async () => {
    renderPanel();
    await screen.findByText('Mitya');
    expect(screen.getByRole('columnheader', { name: /User/ }).getAttribute('aria-sort')).toBe('ascending');
    fireEvent.click(screen.getByRole('button', { name: /Last activity/ }));
    expect(screen.getByRole('columnheader', { name: /Last activity/ }).getAttribute('aria-sort')).toBe('descending');
    fireEvent.click(screen.getByRole('button', { name: /Last activity/ }));
    expect(screen.getByRole('columnheader', { name: /Last activity/ }).getAttribute('aria-sort')).toBe('ascending');
  });
});

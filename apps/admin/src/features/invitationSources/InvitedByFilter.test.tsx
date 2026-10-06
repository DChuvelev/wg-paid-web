import '@testing-library/jest-dom/vitest';
import { useState } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminInvitationSourceOption } from '@wg-paid/api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { AdminApiError, loadInvitationSources } from '../../lib/adminApi';
import { InvitedByFilter } from './InvitedByFilter';
import type { InvitationSourceFilter } from './invitationSourceDomain';

vi.mock('../../lib/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/adminApi')>(), loadInvitationSources: vi.fn()
}));

const first: AdminInvitationSourceOption = {
  origin: 'user', source_id: '00000000-0000-4000-8000-000000000001', label: 'Петр Ковалев',
  secondary_label: 'first@example.test', created_at: '2026-01-01T00:00:00Z'
};
const second = { ...first, source_id: '00000000-0000-4000-8000-000000000002', secondary_label: 'second@example.test' };

function Harness({ initial = { origin: 'all' }, onChange = vi.fn(), onSessionExpired = vi.fn() }: {
  initial?: InvitationSourceFilter;
  onChange?: (filter: InvitationSourceFilter) => void;
  onSessionExpired?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return <InvitedByFilter value={value} onSessionExpired={onSessionExpired} onChange={(next) => { setValue(next); onChange(next); }} />;
}

function renderFilter(props: Parameters<typeof Harness>[0] = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  return render(<QueryClientProvider client={client}><Harness {...props} /></QueryClientProvider>);
}

async function debounce() { await act(async () => { await vi.advanceTimersByTimeAsync(250); }); }

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(loadInvitationSources).mockResolvedValue([first, second]);
});
afterEach(() => { vi.useRealTimers(); vi.resetAllMocks(); });

describe('InvitedByFilter', () => {
  test('All and Admin never lookup; User/Campaign start origin-only and changing origin resets selection', async () => {
    const onChange = vi.fn();
    renderFilter({ onChange });
    const origin = screen.getByLabelText('Invited by');
    expect(within(origin).getAllByRole('option').map((option) => option.textContent)).toEqual(['All', 'Admin', 'User', 'Campaign']);
    fireEvent.change(origin, { target: { value: 'admin' } });
    expect(onChange).toHaveBeenLastCalledWith({ origin: 'admin' });
    await debounce();
    expect(loadInvitationSources).not.toHaveBeenCalled();
    fireEvent.change(origin, { target: { value: 'user' } });
    expect(onChange).toHaveBeenLastCalledWith({ origin: 'user', selection: null });
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search inviter' }));
    fireEvent.click(await screen.findByRole('option', { name: /second@example.test/ }));
    expect(onChange.mock.lastCall?.[0].selection.source_id).toBe(second.source_id);
    fireEvent.change(origin, { target: { value: 'campaign' } });
    expect(onChange).toHaveBeenLastCalledWith({ origin: 'campaign', selection: null });
    expect(screen.getByRole('combobox', { name: 'Search campaign' })).toHaveValue('');
    expect(screen.queryByText(/Selected:/)).toBeNull();
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search campaign' }));
    await waitFor(() => expect(loadInvitationSources).toHaveBeenLastCalledWith({ origin: 'campaign', query: '', limit: 20 }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'Clear attribution filter' }));
    expect(onChange).toHaveBeenLastCalledWith({ origin: 'all' });
    expect(screen.queryByRole('listbox')).toBeNull();
  });

  test('debounces remote token narrowing and keeps committed UUID separate from draft', async () => {
    const onChange = vi.fn();
    renderFilter({ initial: { origin: 'user', selection: first }, onChange });
    const input = screen.getByRole('combobox', { name: 'Search inviter' });
    fireEvent.focus(input);
    await screen.findByRole('option', { name: /first@example.test/ });
    fireEvent.change(input, { target: { value: '  Петр  ' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(loadInvitationSources).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await waitFor(() => expect(loadInvitationSources).toHaveBeenLastCalledWith({ origin: 'user', query: 'Петр', limit: 20 }, expect.any(AbortSignal)));
    fireEvent.change(input, { target: { value: 'Петр Ков' } });
    await debounce();
    await waitFor(() => expect(loadInvitationSources).toHaveBeenLastCalledWith({ origin: 'user', query: 'Петр Ков', limit: 20 }, expect.any(AbortSignal)));
    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Selected:/)).toHaveTextContent(first.label);
    fireEvent.click(await screen.findByRole('option', { name: /second@example.test/ }));
    expect(onChange.mock.lastCall?.[0].selection.source_id).toBe(second.source_id);
    expect(input).toHaveValue('');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(screen.getByRole('button', { name: 'Clear selected source' }));
    expect(onChange).toHaveBeenLastCalledWith({ origin: 'user', selection: null });
    expect(loadInvitationSources).toHaveBeenCalledTimes(3);
    for (const [options] of vi.mocked(loadInvitationSources).mock.calls) expect(options.limit).toBe(20);
  });

  test('aborts obsolete lookup and ignores its late result', async () => {
    let resolveOld!: (options: Array<AdminInvitationSourceOption>) => void;
    vi.mocked(loadInvitationSources).mockImplementation(async (options) => options.query === 'old'
      ? new Promise((resolve) => { resolveOld = resolve; }) : [first]);
    renderFilter({ initial: { origin: 'user', selection: null } });
    const input = screen.getByRole('combobox', { name: 'Search inviter' });
    fireEvent.change(input, { target: { value: 'old' } });
    await debounce();
    await waitFor(() => expect(loadInvitationSources).toHaveBeenCalled());
    const oldSignal = vi.mocked(loadInvitationSources).mock.lastCall?.[1];
    expect(screen.getByRole('status')).toHaveTextContent('Loading');
    fireEvent.change(input, { target: { value: 'new' } });
    expect(oldSignal?.aborted).toBe(true);
    await debounce();
    await screen.findByRole('option', { name: /first@example.test/ });
    await act(async () => resolveOld([{ ...second, label: 'Obsolete option' }]));
    expect(screen.queryByRole('option', { name: /Obsolete/ })).toBeNull();
  });

  test('shows empty/error/retry locally and retains committed selection', async () => {
    vi.mocked(loadInvitationSources).mockRejectedValueOnce(new AdminApiError(503)).mockResolvedValueOnce([]);
    renderFilter({ initial: { origin: 'user', selection: first } });
    fireEvent.focus(screen.getByRole('combobox', { name: 'Search inviter' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Unable to load');
    expect(screen.getByText(/Selected:/)).toHaveTextContent(first.label);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(await screen.findByText('No invitation sources found.')).toBeInTheDocument();
  });

  test('reports a limited result set without implying total count and handles 401', async () => {
    vi.mocked(loadInvitationSources).mockResolvedValueOnce(Array.from({ length: 20 }, (_, index) => ({ ...first, source_id: `id-${index}` })));
    const onSessionExpired = vi.fn();
    renderFilter({ initial: { origin: 'user', selection: null }, onSessionExpired });
    const input = screen.getByRole('combobox', { name: 'Search inviter' });
    fireEvent.focus(input);
    expect(await screen.findByText('Showing up to 20 sources. Refine your search.')).toBeInTheDocument();
    vi.mocked(loadInvitationSources).mockRejectedValueOnce(new AdminApiError(401));
    fireEvent.change(input, { target: { value: 'expired' } });
    await debounce();
    await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  });

  test('supports keyboard navigation, ARIA, Escape and ordinary Tab without choosing draft', async () => {
    const onChange = vi.fn();
    renderFilter({ initial: { origin: 'user', selection: null }, onChange });
    const input = screen.getByRole('combobox', { name: 'Search inviter' });
    fireEvent.focus(input);
    const option = await screen.findByRole('option', { name: /second@example.test/ });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input.getAttribute('aria-controls')).toBe(screen.getByRole('listbox').id);
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    expect(input.getAttribute('aria-activedescendant')).toBe(option.id);
    fireEvent.keyDown(input, { key: 'ArrowUp' });
    fireEvent.keyDown(input, { key: 'ArrowDown' });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onChange.mock.lastCall?.[0].selection.source_id).toBe(second.source_id);
    fireEvent.focus(input);
    expect(await screen.findByRole('option', { name: /second@example.test/ })).toHaveAttribute('aria-selected', 'true');
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(input).toHaveAttribute('aria-expanded', 'false');
    expect(input).not.toHaveAttribute('aria-activedescendant');
    fireEvent.change(input, { target: { value: 'unselected draft' } });
    fireEvent.keyDown(input, { key: 'Tab' });
    expect(onChange).toHaveBeenCalledOnce();
    expect(input).toHaveAttribute('aria-expanded', 'false');
  });

  test('two mounted filters have unique IDs and independent cancellation', async () => {
    const signals: Array<AbortSignal | undefined> = [];
    vi.mocked(loadInvitationSources).mockImplementation((_options, signal) => {
      signals.push(signal);
      return new Promise(() => undefined);
    });
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const view = render(<QueryClientProvider client={client}>
      <Harness initial={{ origin: 'user', selection: null }} /><Harness initial={{ origin: 'user', selection: null }} />
    </QueryClientProvider>);
    const inputs = screen.getAllByRole('combobox', { name: 'Search inviter' });
    fireEvent.focus(inputs[0]!); fireEvent.focus(inputs[1]!);
    await waitFor(() => expect(signals).toHaveLength(2));
    const ids = Array.from(view.container.querySelectorAll('[id]'), (node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    fireEvent.keyDown(inputs[0]!, { key: 'Escape' });
    expect(signals[0]?.aborted).toBe(true);
    expect(signals[1]?.aborted).toBe(false);
    view.unmount();
    expect(signals[1]?.aborted).toBe(true);
  });
});

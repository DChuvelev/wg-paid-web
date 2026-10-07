import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminReviewAccessResponse, AdminReviewResetResponse } from '@wg-paid/api';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AdminApiError, createReviewAccess, resetReviewAccess } from '../../lib/adminApi';
import { ReviewAccessControl } from './ReviewAccessControl';

vi.mock('../../lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminApi')>();
  return { ...actual, createReviewAccess: vi.fn(), resetReviewAccess: vi.fn() };
});

const exactUrl = 'https://access.secret-studio.ru/auth/magic#review=exact-backend-secret';
const response: AdminReviewAccessResponse = {
  review_url: exactUrl,
  expires_at: '2026-09-30T10:00:00Z',
  user_id: '00000000-0000-0000-0000-000000000001',
  grant_id: '00000000-0000-0000-0000-000000000002',
  configuration_id: '00000000-0000-0000-0000-000000000003',
  wireguard_profile_id: '00000000-0000-0000-0000-000000000004',
  wireguard_status: 'active',
  wireguard_tunnel_ip: '10.253.0.2',
  amneziawg_profile_id: '00000000-0000-0000-0000-000000000005',
  amneziawg_status: 'active',
  amneziawg_tunnel_ip: '10.254.0.2'
};
const clipboardWrite = vi.fn<(value: string) => Promise<void>>();
const resetting: AdminReviewResetResponse = {
  state: 'resetting', user_id: response.user_id, grant_id: response.grant_id,
  billing_account_id: '00000000-0000-0000-0000-000000000006', configuration_id: response.configuration_id,
  wireguard_status: 'retiring', amneziawg_status: 'retiring', retained_succeeded_payments: 1
};
const completed: AdminReviewResetResponse = { ...resetting, state: 'payment_required', configuration_id: null, wireguard_status: 'payment_required', amneziawg_status: 'payment_required' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  vi.mocked(resetReviewAccess).mockResolvedValue(resetting);
  clipboardWrite.mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } });
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(createReviewAccess).mockResolvedValue(response);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('displays and copies the exact backend URL without exposing AWG or internal identifiers', async () => {
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));

  expect((await screen.findByLabelText('YooKassa review URL')).textContent).toBe(exactUrl);
  expect(createReviewAccess).toHaveBeenCalledOnce();
  expect(resetReviewAccess).not.toHaveBeenCalled();
  expect(screen.getByText('Expires').parentElement?.textContent).toMatch(/2026/);
  expect(screen.getByText('WireGuard status').parentElement?.textContent).toContain('Active');
  expect(screen.getByText(/replaces the shared review URL and invalidates the previous URL/i)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Amnezia|AWG|00000000|10\.25[34]\.0\.2/i);

  fireEvent.click(screen.getByRole('button', { name: 'Copy review link' }));
  await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(exactUrl));
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test.each([
  ['payment_required', 'Payment required'],
  ['payment_pending', 'Payment pending'],
  ['requested', 'Requested'],
  ['provisioning', 'Provisioning'],
  ['active', 'Active'],
  ['backend_internal_value', 'Unavailable']
])('renders %s as a safe status label with nullable internal ids', async (wireguardStatus, label) => {
  vi.mocked(createReviewAccess).mockResolvedValue({
    ...response,
    configuration_id: null,
    wireguard_profile_id: null,
    amneziawg_profile_id: null,
    wireguard_status: wireguardStatus,
    wireguard_tunnel_ip: null,
    amneziawg_status: 'payment_required',
    amneziawg_tunnel_ip: null
  });
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));

  expect((await screen.findByText('WireGuard status')).parentElement?.textContent).toContain(label);
  expect(document.body.textContent).not.toContain('backend_internal_value');
  expect(document.body.textContent).not.toMatch(/Amnezia|AWG|00000000|10\.25[34]\.0\.2/i);
});

test('starting a reissue clears the old URL before the replacement request settles', async () => {
  let resolveReplacement!: (value: AdminReviewAccessResponse) => void;
  const replacement = new Promise<AdminReviewAccessResponse>((resolve) => { resolveReplacement = resolve; });
  vi.mocked(createReviewAccess).mockResolvedValueOnce(response).mockReturnValueOnce(replacement);
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  await screen.findByText(exactUrl);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  expect(screen.queryByText(exactUrl)).toBeNull();

  resolveReplacement({ ...response, review_url: `${exactUrl}-replacement` });
  expect(await screen.findByText(`${exactUrl}-replacement`)).toBeTruthy();
});

test('becoming inactive clears the secret and ignores a late response', async () => {
  let resolveRequest!: (value: AdminReviewAccessResponse) => void;
  vi.mocked(createReviewAccess).mockReturnValue(new Promise((resolve) => { resolveRequest = resolve; }));
  const view = render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);

  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  view.rerender(<ReviewAccessControl active={false} onSessionExpired={vi.fn()} />);
  resolveRequest(response);

  await waitFor(() => expect(screen.queryByText(exactUrl)).toBeNull());
  expect(document.body.textContent).not.toContain('exact-backend-secret');
});

test('unmount removes the displayed review URL', async () => {
  const view = render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  await screen.findByText(exactUrl);

  view.unmount();
  expect(document.body.textContent).not.toContain('exact-backend-secret');
});

test('401 follows the existing session-expired callback', async () => {
  const onSessionExpired = vi.fn();
  vi.mocked(createReviewAccess).mockRejectedValue(new AdminApiError(401));
  render(<ReviewAccessControl active onSessionExpired={onSessionExpired} />);

  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  expect(screen.queryByLabelText('YooKassa review URL')).toBeNull();
});

test('reset requires confirmation and cancellation does not mutate anything', () => {
  vi.mocked(window.confirm).mockReturnValue(false);
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('The current reviewer access will be ended.'));
  expect(resetReviewAccess).not.toHaveBeenCalled();
  expect(createReviewAccess).not.toHaveBeenCalled();
});

test('polls only the reset endpoint until authoritative completion without issuing a shared link', async () => {
  vi.useFakeTimers();
  vi.mocked(resetReviewAccess).mockResolvedValueOnce(resetting).mockResolvedValueOnce(completed);
  const view = render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  expect(resetReviewAccess).toHaveBeenCalledOnce();
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.getByText('Resetting review access…')).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Start new review cycle' }).hasAttribute('disabled')).toBe(true);
  expect(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }).hasAttribute('disabled')).toBe(true);
  view.rerender(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(1499); });
  expect(resetReviewAccess).toHaveBeenCalledOnce();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(resetReviewAccess).toHaveBeenCalledTimes(2);
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('YooKassa review URL')).toBeNull();
  expect(screen.getByText('New review cycle ready. Use the previously issued shared review link. Previous succeeded payments retained: 1.')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(130000); });
  expect(resetReviewAccess).toHaveBeenCalledTimes(2);
});

test('completed initial reset succeeds without creating or recovering a secret URL', async () => {
  vi.mocked(resetReviewAccess).mockResolvedValue(completed);
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  expect(await screen.findByText('New review cycle ready. Use the previously issued shared review link. Previous succeeded payments retained: 1.')).toBeTruthy();
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.queryByLabelText('YooKassa review URL')).toBeNull();
});

test('does not overlap reset requests or allow duplicate clicks while a request is unsettled', async () => {
  vi.useFakeTimers();
  let resolve!: (value: AdminReviewResetResponse) => void;
  vi.mocked(resetReviewAccess).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(resetReviewAccess).toHaveBeenCalledOnce();
  expect(window.confirm).toHaveBeenCalledOnce();
  await act(async () => { resolve(resetting); });
  expect(createReviewAccess).not.toHaveBeenCalled();
});

test.each(['inactive', 'unmount'])('%s stops reset polling and ignores a late completion', async (stop) => {
  vi.useFakeTimers();
  let resolve!: (value: AdminReviewResetResponse) => void;
  vi.mocked(resetReviewAccess).mockResolvedValueOnce(resetting).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
  const view = render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  const signal = vi.mocked(resetReviewAccess).mock.calls[1]![0]!;
  if (stop === 'unmount') view.unmount();
  else view.rerender(<ReviewAccessControl active={false} onSessionExpired={vi.fn()} />);
  expect(signal.aborted).toBe(true);
  await act(async () => { resolve(completed); await vi.advanceTimersByTimeAsync(130000); });
  expect(resetReviewAccess).toHaveBeenCalledTimes(2);
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.queryByText(/New review cycle ready/)).toBeNull();
});

test('inactive stops an already scheduled poll', async () => {
  vi.useFakeTimers();
  const view = render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  view.rerender(<ReviewAccessControl active={false} onSessionExpired={vi.fn()} />);
  await act(async () => { await vi.advanceTimersByTimeAsync(130000); });
  expect(resetReviewAccess).toHaveBeenCalledOnce();
  expect(createReviewAccess).not.toHaveBeenCalled();
});

test('timeout stops polling without claiming success and a new press resumes the authoritative reset', async () => {
  vi.useFakeTimers();
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  const count = vi.mocked(resetReviewAccess).mock.calls.length;
  expect(screen.getByRole('alert').textContent).toContain('Review reset is still incomplete');
  expect(screen.queryByText(/New review cycle ready/)).toBeNull();
  expect(createReviewAccess).not.toHaveBeenCalled();
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(resetReviewAccess).toHaveBeenCalledTimes(count);
  expect(screen.getByRole('button', { name: 'Start new review cycle' }).hasAttribute('disabled')).toBe(false);
  vi.mocked(resetReviewAccess).mockResolvedValue(completed);
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  expect(resetReviewAccess).toHaveBeenCalledTimes(count + 1);
  expect(screen.getByText(/New review cycle ready.*Use the previously issued shared review link/)).toBeTruthy();
  expect(createReviewAccess).not.toHaveBeenCalled();
});

test('409 displays backend detail and does not issue a link or retry silently', async () => {
  vi.mocked(resetReviewAccess).mockRejectedValue(new AdminApiError(409, 'review payment is still pending'));
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  expect((await screen.findByRole('alert')).textContent).toBe('review payment is still pending');
  expect(resetReviewAccess).toHaveBeenCalledOnce();
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.queryByText(/New review cycle ready/)).toBeNull();
});

test('reset 401 uses the session-expired callback', async () => {
  const onSessionExpired = vi.fn();
  vi.mocked(resetReviewAccess).mockRejectedValue(new AdminApiError(401));
  render(<ReviewAccessControl active onSessionExpired={onSessionExpired} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
  expect(createReviewAccess).not.toHaveBeenCalled();
});

test('a stalled reset request is aborted at the deadline and late success cannot issue a link', async () => {
  vi.useFakeTimers();
  let resolve!: (value: AdminReviewResetResponse) => void;
  vi.mocked(resetReviewAccess).mockReturnValue(new Promise((done) => { resolve = done; }));
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' }));
  const signal = vi.mocked(resetReviewAccess).mock.calls[0]![0]!;
  await act(async () => { await vi.advanceTimersByTimeAsync(120000); });
  expect(signal.aborted).toBe(true);
  expect(screen.getByRole('alert').textContent).toContain('still incomplete');
  await act(async () => { resolve(completed); });
  expect(createReviewAccess).not.toHaveBeenCalled();
  expect(screen.queryByText(/New review cycle ready/)).toBeNull();
});

test('reset preserves the displayed shared URL throughout polling and completion, clears copy feedback, and never rotates it', async () => {
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));
  await screen.findByText(exactUrl);
  fireEvent.click(screen.getByRole('button', { name: 'Copy review link' }));
  await screen.findByRole('button', { name: 'Copied' });
  vi.useFakeTimers();
  vi.mocked(resetReviewAccess).mockResolvedValueOnce(resetting).mockResolvedValueOnce(completed);
  vi.mocked(createReviewAccess).mockRejectedValue(new AdminApiError(500, 'link could not be issued'));
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Start new review cycle' })); });
  expect(screen.getByLabelText('YooKassa review URL').textContent).toBe(exactUrl);
  expect(screen.getByRole('button', { name: 'Copy review link' })).toBeTruthy();
  expect(screen.getByText('Resetting review access…')).toBeTruthy();
  expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining('The shared review link will remain unchanged.'));
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(screen.getByLabelText('YooKassa review URL').textContent).toBe(exactUrl);
  expect(screen.getByText('New review cycle ready. Shared review link unchanged. Previous succeeded payments retained: 1.')).toBeTruthy();
  expect(screen.getByText('WireGuard status').parentElement?.textContent).toContain('Payment required');
  expect(createReviewAccess).toHaveBeenCalledOnce(); // Only the explicit initial create.
  expect(screen.queryByRole('alert')).toBeNull();
});

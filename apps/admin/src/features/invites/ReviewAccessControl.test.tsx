import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { AdminReviewAccessResponse } from '@wg-paid/api';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AdminApiError, createReviewAccess } from '../../lib/adminApi';
import { ReviewAccessControl } from './ReviewAccessControl';

vi.mock('../../lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/adminApi')>();
  return { ...actual, createReviewAccess: vi.fn() };
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

beforeEach(() => {
  vi.clearAllMocks();
  clipboardWrite.mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: clipboardWrite } });
  localStorage.clear();
  sessionStorage.clear();
  vi.mocked(createReviewAccess).mockResolvedValue(response);
});

afterEach(() => {
  vi.useRealTimers();
});

test('displays and copies the exact backend URL without exposing AWG or internal identifiers', async () => {
  render(<ReviewAccessControl active onSessionExpired={vi.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Create / reissue YooKassa review link' }));

  expect((await screen.findByLabelText('YooKassa review URL')).textContent).toBe(exactUrl);
  expect(screen.getByText('Expires').parentElement?.textContent).toMatch(/2026/);
  expect(screen.getByText('WireGuard status').parentElement?.textContent).toContain('active');
  expect(screen.getByText(/invalidates the prior review link and its active session/i)).toBeTruthy();
  expect(document.body.textContent).not.toMatch(/Amnezia|AWG|00000000|10\.25[34]\.0\.2/i);

  fireEvent.click(screen.getByRole('button', { name: 'Copy review link' }));
  await waitFor(() => expect(clipboardWrite).toHaveBeenCalledWith(exactUrl));
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
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

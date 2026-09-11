import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { AccountMeResponse, ProfileSummary } from '@wg-paid/api';
import {
  AccessApiError,
  createProfile,
  loadAccount,
  loadProfiles,
  logout,
  updateDisplayName,
  updateProfileLabel
} from '../../lib/accessApi';
import { renderApp } from '../../test/renderApp';

vi.mock('../../lib/accessApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/accessApi')>();
  return {
    ...actual,
    consumeMagicLink: vi.fn(),
    createProfile: vi.fn(),
    loadAccount: vi.fn(),
    loadProfiles: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn(),
    updateDisplayName: vi.fn(),
    updateProfileLabel: vi.fn()
  };
});

const account: AccountMeResponse = {
  display_name: 'Mitya',
  email: 'person@example.test',
  grants: [{
    id: 'grant-1',
    plan_id: null,
    protocol_limits: [{ can_create: true, profile_count: 2, profile_limit: 3, protocol: 'wireguard' }],
    status: 'active',
    valid_until: null
  }],
  user_id: 'user-1'
};

const profiles: Array<ProfileSummary> = [
  { access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id: 'active-1', label: null, protocol: 'wireguard', status: 'active', tunnel_ip: '10.0.0.2', updated_at: '2026-01-01T00:00:00Z' },
  { access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id: 'disabled-1', label: 'Laptop', protocol: 'wireguard', status: 'disabled', tunnel_ip: null, updated_at: '2026-01-01T00:00:00Z' },
  { access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id: 'other-1', label: 'Other', protocol: 'future', status: 'active', tunnel_ip: null, updated_at: '2026-01-01T00:00:00Z' }
];

const qrSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>';
const fetchMock = vi.fn<typeof fetch>();
const createObjectUrlMock = vi.fn<(blob: Blob) => string>();
const revokeObjectUrlMock = vi.fn<(url: string) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => qrSvg
  } as Response);
  createObjectUrlMock.mockReturnValue('blob:profile-qr');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrlMock });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrlMock });
  vi.mocked(loadAccount).mockResolvedValue(account);
  vi.mocked(loadProfiles).mockResolvedValue(profiles);
  vi.mocked(createProfile).mockResolvedValue();
  vi.mocked(updateDisplayName).mockImplementation(async (displayName) => ({ ...account, display_name: displayName }));
  vi.mocked(updateProfileLabel).mockImplementation(async (profileId, label) => ({
    ...profiles.find((profile) => profile.id === profileId)!,
    label,
    updated_at: '2026-01-02T00:00:00Z'
  }));
});

test('401 from account data replace-navigates to login', async () => {
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadProfiles).mockRejectedValue(new AccessApiError(401));
  renderApp('/account');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
});

test('renders quota, stable profile details, config/QR, and no user retirement actions', async () => {
  renderApp('/account');

  await screen.findByText('WireGuard connections: 2 / 3');
  expect(screen.getByText('Secret Studio')).toBeTruthy();
  expect(screen.getByText('WireGuard connection 1')).toBeTruthy();
  expect(screen.getByText('Laptop')).toBeTruthy();
  expect(screen.queryByText('Other')).toBeNull();
  expect(screen.getByRole('button', { name: 'Download config' })).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Download config' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Show QR' })).toBeNull();
  expect(screen.queryByRole('button', { name: /disable|revoke/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /reissue/i })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
  await waitFor(() => expect(vi.mocked(createProfile)).toHaveBeenCalledWith('grant-1'));
});

test('downloads config bytes with same-origin credentials and the response filename', async () => {
  const configBytes = new Uint8Array([91, 73, 110, 116, 101, 114, 102, 97, 99, 101, 93]);
  fetchMock.mockResolvedValueOnce(new Response(configBytes, {
    headers: { 'Content-Disposition': 'attachment; filename="SecretStudio-01.conf"' },
    status: 200
  }));
  let downloadedFilename: string | null = null;
  const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedFilename = this.download;
  });
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download config' }));

  expect((screen.getByRole('button', { name: 'Downloading…' }) as HTMLButtonElement).disabled).toBe(true);
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/active-1/config',
    { credentials: 'same-origin' }
  ));
  await waitFor(() => expect(createObjectUrlMock).toHaveBeenCalledTimes(1));
  const downloadedBytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.readAsArrayBuffer(createObjectUrlMock.mock.calls[0]![0]);
  });
  expect(new Uint8Array(downloadedBytes)).toEqual(configBytes);
  expect(downloadedFilename).toBe('SecretStudio-01.conf');
  await waitFor(() => expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:profile-qr'));
  clickMock.mockRestore();
});

test('uses the ordinal config filename when the response has no safe filename', async () => {
  fetchMock.mockResolvedValueOnce(new Response('[Interface]', { status: 200 }));
  let downloadedFilename: string | null = null;
  const clickMock = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    downloadedFilename = this.download;
  });
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download config' }));

  await waitFor(() => expect(downloadedFilename).toBe('SecretStudio-01.conf'));
  clickMock.mockRestore();
});

test('does not offer a non-200 response as a config download', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"detail":"unavailable"}', {
    headers: { 'Content-Type': 'application/json' },
    status: 503
  }));
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download config' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to download the configuration.');
  expect(createObjectUrlMock).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('config download 401 follows the existing session-expired path', async () => {
  fetchMock.mockResolvedValueOnce(new Response('{"detail":"unauthorized"}', { status: 401 }));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  fireEvent.click(await screen.findByRole('button', { name: 'Download config' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(createObjectUrlMock).not.toHaveBeenCalled();
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'profiles'] });
});

test('opens the profile QR in a page dialog and closes it without navigation', async () => {
  renderApp('/account');
  const showQr = await screen.findByRole('button', { name: 'Show QR' });

  fireEvent.click(showQr);
  const dialog = screen.getByRole('dialog', { name: 'QR code for WireGuard connection 1' });
  expect(screen.getByText('Loading QR code…')).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/active-1/qr.svg',
    expect.objectContaining({ credentials: 'same-origin' })
  ));
  const image = await screen.findByRole('img', { name: 'QR code for WireGuard connection 1' });
  expect(image.getAttribute('src')).toBe('blob:profile-qr');
  expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
  expect(createObjectUrlMock.mock.calls[0]![0].type).toBe('image/svg+xml');
  expect(screen.getByTestId('location').textContent).toBe('/account');
  fireEvent.click(dialog);
  expect(screen.getByRole('dialog')).toBeTruthy();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);
  expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:profile-qr');

  fireEvent.click(showQr);
  await screen.findByRole('img', { name: 'QR code for WireGuard connection 1' });
  fireEvent.click(screen.getByRole('button', { name: 'Close QR code' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);

  fireEvent.click(showQr);
  await screen.findByRole('img', { name: 'QR code for WireGuard connection 1' });
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);
});

test('shows a localized QR error without rendering a broken image', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' } as Response);
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Show QR' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load the QR code.');
  expect(screen.queryByRole('img', { name: 'QR code for WireGuard connection 1' })).toBeNull();
  expect(createObjectUrlMock).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('hides add connection when backend can_create is false', async () => {
  vi.mocked(loadAccount).mockResolvedValue({
    ...account,
    grants: [{
      ...account.grants[0]!,
      protocol_limits: [{ can_create: false, profile_count: 3, profile_limit: 3, protocol: 'wireguard' }]
    }]
  });
  renderApp('/account');

  await screen.findByText('WireGuard connections: 3 / 3');
  expect(screen.queryByRole('button', { name: 'Add connection' })).toBeNull();
});

test('profile mutation 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(createProfile).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('WireGuard connections: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'profiles'] });
});

test('profile mutation 403 shows the session-validation message', async () => {
  vi.mocked(createProfile).mockRejectedValue(new AccessApiError(403));
  renderApp('/account');

  await screen.findByText('WireGuard connections: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Session validation failed. Sign in again.');
});

test('logout 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('WireGuard connections: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'profiles'] });
});

test('non-401 logout failure keeps the account page and shows its error', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(500));
  renderApp('/account');

  await screen.findByText('WireGuard connections: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to sign out.');
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('loads, saves, changes, and clears the optional display name, including an empty value', async () => {
  renderApp('/account');
  const input = await screen.findByLabelText('Name');
  expect((input as HTMLInputElement).value).toBe('Mitya');

  fireEvent.change(input, { target: { value: '  Studio user  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('Studio user'));
  expect((input as HTMLInputElement).value).toBe('Studio user');

  fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[0]!);
  await waitFor(() => expect(updateDisplayName).toHaveBeenLastCalledWith(null));
  expect((input as HTMLInputElement).value).toBe('');

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateDisplayName).toHaveBeenLastCalledWith(null));
});

test('adds, edits, and clears only the selected profile label', async () => {
  renderApp('/account');
  await screen.findByText('WireGuard connection 1');
  fireEvent.click(screen.getByRole('button', { name: 'Add name' }));
  const input = screen.getByLabelText('Connection name: active-1');
  fireEvent.change(input, { target: { value: 'My phone' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
  await waitFor(() => expect(updateProfileLabel).toHaveBeenCalledWith('active-1', 'My phone'));
  expect(screen.getByText('My phone')).not.toBeNull();
  expect(screen.getByText('Laptop')).not.toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit name' })[0]!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[1]!);
  await waitFor(() => expect(updateProfileLabel).toHaveBeenLastCalledWith('active-1', null));
  expect(screen.getByText('WireGuard connection 1')).not.toBeNull();
  expect(screen.getByText('Laptop')).not.toBeNull();
});

test('refetches account and profiles through TanStack Query when focus returns', async () => {
  renderApp('/account');
  await screen.findByText('WireGuard connections: 2 / 3');
  expect(loadAccount).toHaveBeenCalledTimes(1);
  expect(loadProfiles).toHaveBeenCalledTimes(1);

  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await waitFor(() => expect(loadAccount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(loadProfiles).toHaveBeenCalledTimes(2));
  focusManager.setFocused(undefined);
});

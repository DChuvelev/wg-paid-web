import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { AccountMeResponse, ConfigurationSummary } from '@wg-paid/api';
import {
  AccessApiError,
  createConfiguration,
  createProfileConfigDownload,
  loadAccount,
  loadConfigurations,
  logout,
  updateDisplayName,
  updateConfigurationLabel
} from '../../lib/accessApi';
import { renderApp } from '../../test/renderApp';

vi.mock('../../lib/accessApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/accessApi')>();
  return {
    ...actual,
    consumeMagicLink: vi.fn(),
    createConfiguration: vi.fn(),
    createProfileConfigDownload: vi.fn(),
    loadAccount: vi.fn(),
    loadConfigurations: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn(),
    updateDisplayName: vi.fn(),
    updateConfigurationLabel: vi.fn()
  };
});

const account: AccountMeResponse = {
  display_name: 'Mitya',
  email: 'person@example.test',
  grants: [{
    id: 'grant-1',
    plan_id: null,
    can_create_configuration: true,
    configuration_count: 2,
    configuration_limit: 3,
    protocol_limits: [{ can_create: true, profile_count: 2, profile_limit: 3, protocol: 'wireguard' }],
    status: 'active',
    valid_until: null
  }],
  user_id: 'user-1'
};

const configurations: Array<ConfigurationSummary> = [
  {
    access_grant_id: 'grant-1', configuration_id: 'configuration-1', ordinal: 7, label: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.2', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.3', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  },
  {
    access_grant_id: 'grant-1', configuration_id: 'configuration-2', ordinal: 9, label: 'Laptop',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-2', status: 'provisioning_failed', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-2', status: 'active', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  }
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
  vi.mocked(loadConfigurations).mockResolvedValue(configurations);
  vi.mocked(createConfiguration).mockResolvedValue();
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#config-download');
  vi.mocked(updateDisplayName).mockImplementation(async (displayName) => ({ ...account, display_name: displayName }));
  vi.mocked(updateConfigurationLabel).mockImplementation(async (configurationId, label) => ({
    ...configurations.find((configuration) => configuration.configuration_id === configurationId)!,
    label,
    updated_at: '2026-01-02T00:00:00Z'
  }));
  window.history.replaceState(null, '', '/');
});

test('401 from account data replace-navigates to login', async () => {
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadConfigurations).mockRejectedValue(new AccessApiError(401));
  renderApp('/account');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
});

test('renders each logical configuration once with both variants, backend ordinal, and one common quota', async () => {
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
  expect(screen.getByText('Secret Studio')).toBeTruthy();
  expect(screen.getByText('Configuration #7')).toBeTruthy();
  expect(screen.getByText('Configuration #9 · Laptop')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Download WireGuard config' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download AmneziaWG config' })).toBeTruthy();
  expect(screen.getAllByText('Configurations: 2 / 3')).toHaveLength(1);
  expect(screen.queryByRole('link', { name: /Download .* config/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /disable|revoke/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /reissue/i })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));
  await waitFor(() => expect(vi.mocked(createConfiguration)).toHaveBeenCalledWith('grant-1'));
});

test('requests a temporary config download URL and navigates to it', async () => {
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#config-download');
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  await waitFor(() => expect(createProfileConfigDownload).toHaveBeenCalledWith('wg-1'));
  await waitFor(() => expect(window.location.hash).toBe('#config-download'));
});

test('AmneziaWG uses the same temporary URL and browser navigation flow', async () => {
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#awg-config-download');
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Download AmneziaWG config' }));
  await waitFor(() => expect(createProfileConfigDownload).toHaveBeenCalledWith('awg-1'));
  await waitFor(() => expect(window.location.hash).toBe('#awg-config-download'));
});

test('suppresses download and QR actions for both unavailable or not-ready variants', async () => {
  renderApp('/account');
  await screen.findByText('Configuration #9 · Laptop');
  for (const protocol of ['WireGuard', 'AmneziaWG']) {
    const variant = screen.getByRole('region', { name: `${protocol} · Configuration #9` });
    expect(within(variant).queryByRole('button', { name: /Download .* config/ })).toBeNull();
    expect(within(variant).queryByRole('button', { name: /Show .* QR/ })).toBeNull();
  }
});

test('shows an error when the temporary config download cannot be created', async () => {
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to download the configuration.');
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('config download 401 follows the existing session-expired path', async () => {
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'configurations'] });
});

test('opens the WireGuard QR in the page dialog and closes it without navigation', async () => {
  renderApp('/account');
  const showQr = await screen.findByRole('button', { name: 'Show WireGuard QR' });

  fireEvent.click(showQr);
  const dialog = screen.getByRole('dialog', { name: 'QR code for WireGuard · Configuration #7' });
  expect(screen.getByText('Loading QR code…')).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/wg-1/qr.svg',
    expect.objectContaining({ credentials: 'same-origin' })
  ));
  const image = await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
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
  await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
  fireEvent.click(screen.getByRole('button', { name: 'Close QR code' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);

  fireEvent.click(showQr);
  await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);
});

test('AmneziaWG QR uses its own profile ID and identifies its protocol', async () => {
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Show AmneziaWG QR' }));
  expect(await screen.findByRole('dialog', { name: 'QR code for AmneziaWG · Configuration #7' })).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/awg-1/qr.svg',
    expect.objectContaining({ credentials: 'same-origin' })
  ));
});

test('shows a localized QR error without rendering a broken image', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' } as Response);
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Show WireGuard QR' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load the QR code.');
  expect(screen.queryByRole('img', { name: 'QR code for WireGuard · Configuration #7' })).toBeNull();
  expect(createObjectUrlMock).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('hides Add configuration when the common quota denies creation', async () => {
  vi.mocked(loadAccount).mockResolvedValue({
    ...account,
    grants: [{
      ...account.grants[0]!,
      can_create_configuration: false,
      configuration_count: 3,
      configuration_limit: 3,
      protocol_limits: [{ can_create: false, profile_count: 3, profile_limit: 3, protocol: 'wireguard' }]
    }]
  });
  renderApp('/account');

  await screen.findByText('Configurations: 3 / 3');
  expect(screen.queryByRole('button', { name: 'Add configuration' })).toBeNull();
});

test('configuration creation 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(createConfiguration).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'configurations'] });
});

test('configuration creation 403 shows the session-validation message', async () => {
  vi.mocked(createConfiguration).mockRejectedValue(new AccessApiError(403));
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Session validation failed. Sign in again.');
});

test('logout 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'account'] });
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access', 'configurations'] });
});

test('non-401 logout failure keeps the account page and shows its error', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(500));
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
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

test('adds, edits, and clears only the selected configuration label by slot ID', async () => {
  renderApp('/account');
  await screen.findByText('Configuration #7');
  fireEvent.click(screen.getByRole('button', { name: 'Add name' }));
  const input = screen.getByLabelText('Configuration name: configuration-1');
  fireEvent.change(input, { target: { value: 'My phone' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
  await waitFor(() => expect(updateConfigurationLabel).toHaveBeenCalledWith('configuration-1', 'My phone'));
  expect(screen.getByText('Configuration #7 · My phone')).not.toBeNull();
  expect(screen.getByText('Configuration #9 · Laptop')).not.toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit name' })[0]!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[1]!);
  await waitFor(() => expect(updateConfigurationLabel).toHaveBeenLastCalledWith('configuration-1', null));
  expect(screen.getByText('Configuration #7')).not.toBeNull();
  expect(screen.getByText('Configuration #9 · Laptop')).not.toBeNull();
});

test('refetches account and configurations through TanStack Query when focus returns', async () => {
  renderApp('/account');
  await screen.findByText('Configurations: 2 / 3');
  expect(loadAccount).toHaveBeenCalledTimes(1);
  expect(loadConfigurations).toHaveBeenCalledTimes(1);

  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await waitFor(() => expect(loadAccount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(loadConfigurations).toHaveBeenCalledTimes(2));
  focusManager.setFocused(undefined);
});

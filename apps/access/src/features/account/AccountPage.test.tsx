import { beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import type { AccountMeResponse, ProfileSummary } from '@wg-paid/api';
import {
  AccessApiError,
  createProfile,
  loadAccount,
  loadProfiles
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
    reissueProfile: vi.fn(),
    requestLogin: vi.fn(),
    revokeProfile: vi.fn()
  };
});

const account: AccountMeResponse = {
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
  { created_at: '2026-01-01T00:00:00Z', id: 'active-1', label: null, protocol: 'wireguard', status: 'active', tunnel_ip: '10.0.0.2', updated_at: '2026-01-01T00:00:00Z' },
  { created_at: '2026-01-01T00:00:00Z', id: 'disabled-1', label: 'Laptop', protocol: 'wireguard', status: 'disabled', tunnel_ip: null, updated_at: '2026-01-01T00:00:00Z' },
  { created_at: '2026-01-01T00:00:00Z', id: 'other-1', label: 'Other', protocol: 'future', status: 'active', tunnel_ip: null, updated_at: '2026-01-01T00:00:00Z' }
];

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadAccount).mockResolvedValue(account);
  vi.mocked(loadProfiles).mockResolvedValue(profiles);
  vi.mocked(createProfile).mockResolvedValue();
});

test('401 from account data replace-navigates to login', async () => {
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadProfiles).mockRejectedValue(new AccessApiError(401));
  renderApp('/account');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
});

test('renders quota, active/disabled actions, and add visibility from can_create', async () => {
  renderApp('/account');

  await screen.findByText('WireGuard connections: 2 / 3');
  expect(screen.getByText('WireGuard connection 1')).toBeTruthy();
  expect(screen.getByText('Laptop')).toBeTruthy();
  expect(screen.queryByText('Other')).toBeNull();
  expect(screen.getByRole('link', { name: 'Download config' }).getAttribute('href')).toBe('/v2/account/profiles/active-1/config');
  expect(screen.getByRole('link', { name: 'Show QR' }).getAttribute('href')).toBe('/v2/account/profiles/active-1/qr.svg');
  expect(screen.getByRole('button', { name: 'Disable' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Reissue' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Add connection' }));
  await waitFor(() => expect(vi.mocked(createProfile)).toHaveBeenCalledWith('grant-1'));
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

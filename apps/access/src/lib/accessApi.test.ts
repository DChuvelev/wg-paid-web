import { afterEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  accountMe: vi.fn(),
  accountMeUpdate: vi.fn(),
  consumeMagic: vi.fn(),
  createProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  profiles: vi.fn(),
  profileUpdate: vi.fn(),
  redeemInvite: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  accountMeV2AccountMeGet: sdk.accountMe,
  accountMeUpdateV2AccountMePatch: sdk.accountMeUpdate,
  accountProfileCreateV2AccountProfilesPost: sdk.createProfile,
  accountProfilesV2AccountProfilesGet: sdk.profiles,
  accountProfileUpdateLabelV2AccountProfilesProfileIdPatch: sdk.profileUpdate,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost: sdk.consumeMagic,
  loginRequestV2AuthLoginRequestPost: sdk.login,
  logoutV2AuthLogoutPost: sdk.logout,
  redeemInviteRouteV2AuthInvitesRedeemPost: sdk.redeemInvite
}));

import { createProfile, updateDisplayName, updateProfileLabel } from './accessApi';

afterEach(() => {
  document.cookie = 'wg_access_csrf=; Max-Age=0; Path=/';
  vi.clearAllMocks();
});

test('adds the CSRF header to a profile mutation when the cookie exists', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  sdk.createProfile.mockResolvedValue({ response: new Response(null, { status: 202 }) });

  await createProfile('grant-1');

  expect(sdk.createProfile).toHaveBeenCalledWith(expect.objectContaining({
    body: { grant_id: 'grant-1', protocol: 'wireguard' },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf value' }
  }));
});

test('sends nullable account and profile metadata through their generated PATCH operations', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  const account = { display_name: null, email: 'person@example.test', grants: [], user_id: 'user-1' };
  const profile = {
    access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id: 'profile-1', label: null,
    protocol: 'wireguard', status: 'active', tunnel_ip: '10.0.0.2', updated_at: '2026-01-01T00:00:00Z'
  };
  sdk.accountMeUpdate.mockResolvedValue({ data: account, response: new Response(null, { status: 200 }) });
  sdk.profileUpdate.mockResolvedValue({ data: profile, response: new Response(null, { status: 200 }) });

  await expect(updateDisplayName(null)).resolves.toEqual(account);
  await expect(updateProfileLabel('profile-1', null)).resolves.toEqual(profile);

  expect(sdk.accountMeUpdate).toHaveBeenCalledWith(expect.objectContaining({
    body: { display_name: null },
    headers: { 'x-csrf-token': 'csrf value' }
  }));
  expect(sdk.profileUpdate).toHaveBeenCalledWith(expect.objectContaining({
    body: { label: null },
    headers: { 'x-csrf-token': 'csrf value' },
    path: { profile_id: 'profile-1' }
  }));
});

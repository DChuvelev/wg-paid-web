import { afterEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  accountMe: vi.fn(),
  consumeMagic: vi.fn(),
  createProfile: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  profiles: vi.fn(),
  redeemInvite: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  accountMeV2AccountMeGet: sdk.accountMe,
  accountProfileCreateV2AccountProfilesPost: sdk.createProfile,
  accountProfilesV2AccountProfilesGet: sdk.profiles,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost: sdk.consumeMagic,
  loginRequestV2AuthLoginRequestPost: sdk.login,
  logoutV2AuthLogoutPost: sdk.logout,
  redeemInviteRouteV2AuthInvitesRedeemPost: sdk.redeemInvite
}));

import { createProfile } from './accessApi';

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

import { afterEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  accountMe: vi.fn(),
  accountMeUpdate: vi.fn(),
  changeInviteEmail: vi.fn(),
  consumeMagic: vi.fn(),
  createConfiguration: vi.fn(),
  inspectInvite: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  configurations: vi.fn(),
  configurationUpdate: vi.fn(),
  redeemInvite: vi.fn(),
  resendInvite: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  accountMeV2AccountMeGet: sdk.accountMe,
  accountMeUpdateV2AccountMePatch: sdk.accountMeUpdate,
  accountConfigurationCreateV2AccountProfilesConfigurationsPost: sdk.createConfiguration,
  accountConfigurationsV2AccountProfilesConfigurationsGet: sdk.configurations,
  accountConfigurationUpdateLabelV2AccountProfilesConfigurationsConfigurationIdPatch: sdk.configurationUpdate,
  changeInviteEmailRouteV2AuthInvitesChangeEmailPost: sdk.changeInviteEmail,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost: sdk.consumeMagic,
  inspectInviteRouteV2AuthInvitesInspectPost: sdk.inspectInvite,
  loginRequestV2AuthLoginRequestPost: sdk.login,
  logoutV2AuthLogoutPost: sdk.logout,
  redeemInviteRouteV2AuthInvitesRedeemPost: sdk.redeemInvite,
  resendInviteRouteV2AuthInvitesResendPost: sdk.resendInvite
}));

import {
  AccessApiError,
  changeInviteEmail,
  createConfiguration,
  createProfileConfigDownload,
  inspectInvite,
  loadConfigurations,
  resendInvite,
  updateDisplayName,
  updateConfigurationLabel
} from './accessApi';

afterEach(() => {
  document.cookie = 'wg_access_csrf=; Max-Age=0; Path=/';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('creates a logical configuration without protocol selection and with CSRF', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  sdk.createConfiguration.mockResolvedValue({ response: new Response(null, { status: 202 }) });

  await createConfiguration('grant-1');

  expect(sdk.createConfiguration).toHaveBeenCalledWith(expect.objectContaining({
    body: { grant_id: 'grant-1' },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf value' }
  }));
});

test('creates a temporary profile config download with same-origin credentials and CSRF', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';

  const downloadUrl = '/v2/account/profiles/profile-1/config-download/download-token';

  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    JSON.stringify({ download_url: downloadUrl }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    }
  ));

  vi.stubGlobal('fetch', fetchMock);

  await expect(createProfileConfigDownload('profile-1')).resolves.toBe(downloadUrl);

  expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/profile-1/config-download',
    {
      credentials: 'same-origin',
      headers: { 'x-csrf-token': 'csrf value' },
      method: 'POST'
    }
  );
});

test('rejects a config download URL for a different profile', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    JSON.stringify({
      download_url: '/v2/account/profiles/profile-2/config-download/download-token'
    }),
    {
      headers: { 'Content-Type': 'application/json' },
      status: 200
    }
  ));

  vi.stubGlobal('fetch', fetchMock);

  await expect(createProfileConfigDownload('profile-1'))
    .rejects.toBeInstanceOf(AccessApiError);
});

test('preserves the HTTP status when config download creation fails', async () => {
  const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(
    '{"detail":"unauthorized"}',
    {
      headers: { 'Content-Type': 'application/json' },
      status: 401
    }
  ));

  vi.stubGlobal('fetch', fetchMock);

  await expect(createProfileConfigDownload('profile-1')).rejects.toEqual(
    expect.objectContaining<Partial<AccessApiError>>({
      status: 401
    })
  );
});

test('sends nullable account and configuration metadata through generated PATCH operations', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';

  const account = {
    display_name: null,
    email: 'person@example.test',
    grants: [],
    user_id: 'user-1'
  };

  const configuration = {
    access_grant_id: 'grant-1',
    configuration_id: 'configuration-1',
    created_at: '2026-01-01T00:00:00Z',
    label: null,
    ordinal: 1,
    updated_at: '2026-01-01T00:00:00Z',
    variants: []
  };

  sdk.accountMeUpdate.mockResolvedValue({
    data: account,
    response: new Response(null, { status: 200 })
  });

  sdk.configurationUpdate.mockResolvedValue({
    data: configuration,
    response: new Response(null, { status: 200 })
  });

  await expect(updateDisplayName(null)).resolves.toEqual(account);
  await expect(updateConfigurationLabel('configuration-1', null)).resolves.toEqual(configuration);

  expect(sdk.accountMeUpdate).toHaveBeenCalledWith(expect.objectContaining({
    body: { display_name: null },
    headers: { 'x-csrf-token': 'csrf value' }
  }));

  expect(sdk.configurationUpdate).toHaveBeenCalledWith(expect.objectContaining({
    body: { label: null },
    headers: { 'x-csrf-token': 'csrf value' },
    path: { configuration_id: 'configuration-1' }
  }));
});

test('uses generated invite lifecycle operations with same-origin credentials and CSRF on mutations', async () => {
  document.cookie = 'wg_access_csrf=csrf-value; Path=/';

  const inspected = {
    can_change_email: true,
    can_resend: false,
    email_bound: false,
    magic_link_expires_at: null,
    magic_link_sent_at: null,
    pending_email_masked: 'p***@example.test',
    resend_available_at: null,
    state: 'awaiting_confirmation'
  };

  sdk.inspectInvite.mockResolvedValue({
    data: inspected,
    response: new Response(null, { status: 200 })
  });

  sdk.resendInvite.mockResolvedValue({
    response: new Response(null, { status: 202 })
  });

  sdk.changeInviteEmail.mockResolvedValue({
    response: new Response(null, { status: 202 })
  });

  await expect(inspectInvite('invite-token')).resolves.toEqual(inspected);
  await expect(resendInvite('invite-token')).resolves.toBeUndefined();
  await expect(changeInviteEmail('invite-token', 'person@example.test')).resolves.toBeUndefined();

  expect(sdk.inspectInvite).toHaveBeenCalledWith({
    body: { invite_token: 'invite-token' },
    credentials: 'same-origin'
  });

  expect(sdk.resendInvite).toHaveBeenCalledWith(expect.objectContaining({
    body: { invite_token: 'invite-token' },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf-value' }
  }));

  expect(sdk.changeInviteEmail).toHaveBeenCalledWith(expect.objectContaining({
    body: {
      email: 'person@example.test',
      invite_token: 'invite-token'
    },
    headers: { 'x-csrf-token': 'csrf-value' }
  }));
});

test('preserves Retry-After from an invite resend cooldown response', async () => {
  sdk.resendInvite.mockResolvedValue({
    response: new Response(null, {
      headers: { 'Retry-After': '37' },
      status: 429
    })
  });

  await expect(resendInvite('invite-token')).rejects.toEqual(
    expect.objectContaining<Partial<AccessApiError>>({
      retryAfterSeconds: 37,
      status: 429
    })
  );
});

test('loads typed logical configurations through the generated GET operation', async () => {
  sdk.configurations.mockResolvedValue({ data: [], response: new Response('[]', { status: 200 }) });
  await expect(loadConfigurations()).resolves.toEqual([]);
  expect(sdk.configurations).toHaveBeenCalledWith({ credentials: 'same-origin' });
});

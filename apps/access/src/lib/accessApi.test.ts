import { afterEach, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  accountMe: vi.fn(),
  accountMeUpdate: vi.fn(),
  billingCreate: vi.fn(),
  billingRetirements: vi.fn(),
  billingItem: vi.fn(),
  billingList: vi.fn(),
  changeInviteEmail: vi.fn(),
  consumeMagic: vi.fn(),
  createConfiguration: vi.fn(),
  inspectInvite: vi.fn(),
  inspectBulkInvite: vi.fn(),
  inspectMagicRecovery: vi.fn(),
  login: vi.fn(),
  logout: vi.fn(),
  configurations: vi.fn(),
  configurationUpdate: vi.fn(),
  configurationRoutingUpdate: vi.fn(),
  routingExits: vi.fn(),
  redeemInvite: vi.fn(),
  redeemBulkInvite: vi.fn(),
  resendInvite: vi.fn()
  , resendMagicRecovery: vi.fn()
  , referralCreate: vi.fn(), referralList: vi.fn(), referralReissue: vi.fn(), referralRevoke: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  accountMeV2AccountMeGet: sdk.accountMe,
  accountMeUpdateV2AccountMePatch: sdk.accountMeUpdate,
  accountBillingPaymentCreateV2AccountBillingPaymentsPost: sdk.billingCreate,
  accountBillingPendingRetirementsUpdateV2AccountBillingPendingRetirementsPut: sdk.billingRetirements,
  accountBillingPaymentV2AccountBillingPaymentsPaymentIdGet: sdk.billingItem,
  accountBillingPaymentsV2AccountBillingPaymentsGet: sdk.billingList,
  accountConfigurationCreateV2AccountProfilesConfigurationsPost: sdk.createConfiguration,
  accountConfigurationsV2AccountProfilesConfigurationsGet: sdk.configurations,
  accountConfigurationUpdateLabelV2AccountProfilesConfigurationsConfigurationIdPatch: sdk.configurationUpdate,
  accountConfigurationUpdateRoutingV2AccountProfilesConfigurationsConfigurationIdRoutingPut: sdk.configurationRoutingUpdate,
  accountRoutingExitsV2AccountProfilesRoutingExitsGet: sdk.routingExits,
  changeInviteEmailRouteV2AuthInvitesChangeEmailPost: sdk.changeInviteEmail,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost: sdk.consumeMagic,
  inspectInviteRouteV2AuthInvitesInspectPost: sdk.inspectInvite,
  inspectBulkInviteRouteV2AuthBulkInvitesInspectPost: sdk.inspectBulkInvite,
  inspectMagicLinkRecoveryRouteV2AuthMagicLinkRecoveryPost: sdk.inspectMagicRecovery,
  loginRequestV2AuthLoginRequestPost: sdk.login,
  logoutV2AuthLogoutPost: sdk.logout,
  redeemInviteRouteV2AuthInvitesRedeemPost: sdk.redeemInvite,
  redeemBulkInviteRouteV2AuthBulkInvitesRedeemPost: sdk.redeemBulkInvite,
  resendInviteRouteV2AuthInvitesResendPost: sdk.resendInvite
  , resendExpiredMagicLinkRouteV2AuthMagicLinkResendPost: sdk.resendMagicRecovery
  , accountReferralCreateV2AccountReferralsPost: sdk.referralCreate,
  accountReferralsV2AccountReferralsGet: sdk.referralList,
  accountReferralReissueV2AccountReferralsInviteIdShareTokenReissuePost: sdk.referralReissue,
  accountReferralRevokeV2AccountReferralsInviteIdRevokePost: sdk.referralRevoke
}));

import {
  AccessApiError,
  sendSupportMessage,
  changeInviteEmail,
  createBillingPayment,
  createConfiguration,
  createProfileConfigDownload,
  inspectBulkInvite,
  inspectInvite,
  inspectMagicLinkRecovery,
  loadConfigurations,
  loadRoutingExits,
  loadReferrals,
  redeemBulkInvite,
  resendInvite,
  resendExpiredMagicLink,
  updateDisplayName,
  updateBillingPendingRetirements,
  updateConfigurationLabel,
  updateConfigurationRouting
} from './accessApi';

afterEach(() => {
  document.cookie = 'wg_access_csrf=; Max-Age=0; Path=/';
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

test('support uses the authenticated mutation CSRF mechanism and sends only trimmed plain text', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  const request = vi.fn().mockResolvedValue(new Response('{"status":"sent"}', { status: 200 }));
  vi.stubGlobal('fetch', request);
  await expect(sendSupportMessage('  synthetic suggestion \n')).resolves.toBeUndefined();
  expect(request).toHaveBeenCalledExactlyOnceWith('/v2/account/support-message', {
    credentials: 'same-origin', method: 'POST',
    headers: { 'x-csrf-token': 'csrf value', 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: 'synthetic suggestion' })
  });
});

test.each([429, 503, 500])('support preserves HTTP %i for bounded frontend feedback', async (status) => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('synthetic internal detail', { status })));
  await expect(sendSupportMessage('synthetic message')).rejects.toMatchObject({ status });
});

test('loads referrals with same-origin credentials and propagates AbortSignal', async () => {
  const controller = new AbortController();
  sdk.referralList.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
  await expect(loadReferrals(controller.signal)).resolves.toEqual([]);
  expect(sdk.referralList).toHaveBeenCalledWith({ credentials: 'same-origin', signal: controller.signal });
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
    routing_mode: 'automatic',
    forced_selector: null,
    forced_until: null,
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

test('uses generated bulk invite inspect and redeem without moving the credential into a URL', async () => {
  document.cookie = 'wg_access_csrf=csrf-value; Path=/';
  sdk.inspectBulkInvite.mockResolvedValue({ data: { state: 'active' }, response: new Response(null, { status: 200 }) });
  sdk.redeemBulkInvite.mockResolvedValue({ response: new Response(null, { status: 202 }) });

  await expect(inspectBulkInvite('campaign-token')).resolves.toEqual({ state: 'active' });
  await expect(redeemBulkInvite('campaign-token', 'person@example.test')).resolves.toBeUndefined();

  expect(sdk.inspectBulkInvite).toHaveBeenCalledWith({
    body: { campaign_token: 'campaign-token' }, credentials: 'same-origin'
  });
  expect(sdk.redeemBulkInvite).toHaveBeenCalledWith({
    body: { campaign_token: 'campaign-token', email: 'person@example.test' },
    credentials: 'same-origin', headers: { 'x-csrf-token': 'csrf-value' }
  });
  expect(JSON.stringify(sdk.inspectBulkInvite.mock.calls)).not.toContain('?campaign=');
  expect(JSON.stringify(sdk.redeemBulkInvite.mock.calls)).not.toContain('?campaign=');
});

test('uses generated expired-registration recovery operations without persisting the token', async () => {
  document.cookie = 'wg_access_csrf=csrf-value; Path=/';
  const recovery = {
    can_resend: true,
    magic_link_ttl_seconds: 900,
    pending_email_masked: 'p***@example.test',
    resend_available_at: null,
    state: 'expired_registration' as const
  };
  sdk.inspectMagicRecovery.mockResolvedValue({ data: recovery, response: new Response(null, { status: 200 }) });
  sdk.resendMagicRecovery.mockResolvedValue({ response: new Response(null, { status: 202 }) });

  await expect(inspectMagicLinkRecovery('old-magic-token')).resolves.toEqual(recovery);
  await expect(resendExpiredMagicLink('old-magic-token')).resolves.toBeUndefined();

  expect(sdk.inspectMagicRecovery).toHaveBeenCalledWith({
    body: { token: 'old-magic-token' },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf-value' }
  });
  expect(sdk.resendMagicRecovery).toHaveBeenCalledWith({
    body: { token: 'old-magic-token' },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf-value' }
  });
  expect(localStorage.length).toBe(0);
  expect(sessionStorage.length).toBe(0);
});

test('preserves Retry-After from expired-registration resend', async () => {
  sdk.resendMagicRecovery.mockResolvedValue({
    response: new Response(null, { headers: { 'Retry-After': '37' }, status: 429 })
  });
  await expect(resendExpiredMagicLink('old-magic-token')).rejects.toEqual(
    expect.objectContaining<Partial<AccessApiError>>({ retryAfterSeconds: 37, status: 429 })
  );
});

test('creates a payment with CSRF and the caller-owned idempotency key only in headers', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  sdk.billingCreate.mockResolvedValue({ data: { payment_id: 'payment-1' }, response: new Response(null, { status: 201 }) });
  const body = { action: 'renew' as const, target_quantity: 2, apply_now: false, future_choice: null, retire_configuration_ids: [], retire_new_configuration_ordinals: [] };
  await createBillingPayment('logical-key', body);
  expect(sdk.billingCreate).toHaveBeenCalledWith({ body, credentials: 'same-origin', headers: { 'Idempotency-Key': 'logical-key', 'x-csrf-token': 'csrf value' } });
  expect(JSON.stringify(sdk.billingCreate.mock.calls[0]?.[0])).not.toContain('confirmation_url');
});

test('preserves an omitted body for legacy payment-attempt recovery', async () => {
  sdk.billingCreate.mockResolvedValue({ data: { payment_id: 'payment-legacy' }, response: new Response(null, { status: 201 }) });
  await createBillingPayment('legacy-key');
  expect(sdk.billingCreate).toHaveBeenCalledWith({ credentials: 'same-origin', headers: { 'Idempotency-Key': 'legacy-key' } });
});

test('propagates payment request validation errors without changing the caller body', async () => {
  const body = { action: 'add_now' as const, target_quantity: 3, apply_now: false, future_choice: 'preserve' as const, retire_configuration_ids: [], retire_new_configuration_ordinals: [] };
  sdk.billingCreate.mockResolvedValue({ response: new Response(null, { status: 422 }) });
  await expect(createBillingPayment('validation-key', body)).rejects.toEqual(expect.objectContaining({ status: 422 }));
  expect(sdk.billingCreate).toHaveBeenCalledWith(expect.objectContaining({ body }));
});

test('updates pending retirement selection with CSRF and propagates errors', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  const response = { configuration_ids: ['configuration-2'], effective_at: '2026-10-01T00:00:00Z' };
  sdk.billingRetirements.mockResolvedValueOnce({ data: response, response: new Response(null, { status: 200 }) });
  await expect(updateBillingPendingRetirements(['configuration-2'])).resolves.toEqual(response);
  expect(sdk.billingRetirements).toHaveBeenCalledWith({
    body: { configuration_ids: ['configuration-2'] }, credentials: 'same-origin', headers: { 'x-csrf-token': 'csrf value' }
  });
  sdk.billingRetirements.mockResolvedValueOnce({ response: new Response(null, { status: 422 }) });
  await expect(updateBillingPendingRetirements([])).rejects.toEqual(expect.objectContaining({ status: 422 }));
});

test('loads typed logical configurations through the generated GET operation', async () => {
  sdk.configurations.mockResolvedValue({ data: [], response: new Response('[]', { status: 200 }) });
  await expect(loadConfigurations()).resolves.toEqual([]);
  expect(sdk.configurations).toHaveBeenCalledWith({ credentials: 'same-origin' });
});

test('loads the authenticated routing-exit catalog with same-origin credentials and AbortSignal', async () => {
  const controller = new AbortController();
  const catalog = {
    generated_at: '2026-09-29T10:00:00Z',
    observed_at: '2026-09-29T10:00:00Z',
    exits: [
      { selector: 1, display_name: 'Location Alpha' },
      { selector: 2, display_name: 'Location Beta' },
      { selector: 3, display_name: 'Location Gamma' },
      { selector: 4, display_name: 'Location Delta' },
      { selector: 5, display_name: 'Location Epsilon' }
    ]
  };
  sdk.routingExits.mockResolvedValue({ data: catalog, response: new Response(null, { status: 200 }) });

  await expect(loadRoutingExits(controller.signal)).resolves.toEqual(catalog);
  expect(sdk.routingExits).toHaveBeenCalledWith({ credentials: 'same-origin', signal: controller.signal });
});

test('updates Configuration routing through the generated operation with CSRF', async () => {
  document.cookie = 'wg_access_csrf=csrf%20value; Path=/';
  const updated = {
    access_grant_id: 'grant-1',
    configuration_id: 'configuration-1',
    created_at: '2026-01-01T00:00:00Z',
    forced_selector: 3,
    forced_until: '2026-09-29T10:30:00Z',
    label: null,
    ordinal: 1,
    routing_mode: 'forced',
    updated_at: '2026-09-29T10:00:00Z',
    variants: []
  };
  sdk.configurationRoutingUpdate.mockResolvedValue({ data: updated, response: new Response(null, { status: 200 }) });

  await expect(updateConfigurationRouting('configuration-1', { mode: 'forced', selector: 3 })).resolves.toEqual(updated);
  expect(sdk.configurationRoutingUpdate).toHaveBeenCalledWith({
    body: { mode: 'forced', selector: 3 },
    credentials: 'same-origin',
    headers: { 'x-csrf-token': 'csrf value' },
    path: { configuration_id: 'configuration-1' }
  });

  sdk.configurationRoutingUpdate.mockResolvedValue({
    data: { ...updated, forced_selector: null, forced_until: null, routing_mode: 'automatic' },
    response: new Response(null, { status: 200 })
  });
  await updateConfigurationRouting('configuration-1', { mode: 'automatic' });
  expect(sdk.configurationRoutingUpdate).toHaveBeenLastCalledWith(expect.objectContaining({
    body: { mode: 'automatic' }
  }));
  expect(sdk.configurationRoutingUpdate.mock.calls.at(-1)?.[0].body).not.toHaveProperty('selector');
});

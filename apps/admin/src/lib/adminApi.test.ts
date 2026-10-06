import { afterEach, describe, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  invitationSources: vi.fn(), createBulkInvite: vi.fn(), createInvite: vi.fn(), deleteUser: vi.fn(), listBulkInvites: vi.fn(), listInvites: vi.fn(), listPlans: vi.fn(), listUsers: vi.fn(),
  login: vi.fn(), logout: vi.fn(), reissueInvite: vi.fn(), resendInvite: vi.fn(), revokeInvite: vi.fn(), session: vi.fn(), setLimit: vi.fn(),
  reviewAccess: vi.fn(), resetReview: vi.fn(), revokeBulkInvite: vi.fn(), runtimeConnections: vi.fn(), updateInviteLimit: vi.fn(), updateInviteRecipient: vi.fn(), updateUser: vi.fn(), updateReferralPolicy: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  adminInvitationSourcesV2AdminInvitationSourcesGet: sdk.invitationSources,
  adminCreateBulkInviteV2AdminBulkInvitesPost: sdk.createBulkInvite,
  adminCreateInviteV2AdminInvitesPost: sdk.createInvite,
  adminDeleteUserV2AdminUsersUserIdDelete: sdk.deleteUser,
  adminListBulkInvitesV2AdminBulkInvitesGet: sdk.listBulkInvites,
  adminListInvitesV2AdminInvitesGet: sdk.listInvites,
  adminListPlansV2AdminPlansGet: sdk.listPlans,
  adminListUsersV2AdminUsersGet: sdk.listUsers,
  adminRuntimeConnectionsV2AdminRuntimeConnectionsGet: sdk.runtimeConnections,
  adminReissueInviteShareTokenV2AdminInvitesInviteIdShareTokenReissuePost: sdk.reissueInvite,
  adminReviewAccessV2AdminReviewAccessPost: sdk.reviewAccess,
  adminReviewAccessResetV2AdminReviewAccessResetPost: sdk.resetReview,
  adminResendInviteV2AdminInvitesInviteIdResendPost: sdk.resendInvite,
  adminRevokeBulkInviteV2AdminBulkInvitesCampaignIdRevokePost: sdk.revokeBulkInvite,
  adminRevokeInviteV2AdminInvitesInviteIdRevokePost: sdk.revokeInvite,
  adminSessionLoginV2AdminSessionLoginPost: sdk.login,
  adminSessionLogoutV2AdminSessionLogoutPost: sdk.logout,
  adminSessionStatusV2AdminSessionGet: sdk.session,
  adminSetProtocolLimitV2AdminGrantsGrantIdProtocolLimitsProtocolPut: sdk.setLimit,
  adminUpdateInviteRecipientV2AdminInvitesInviteIdRecipientPatch: sdk.updateInviteRecipient,
  adminUpdateInviteWireguardLimitV2AdminInvitesInviteIdWireguardLimitPatch: sdk.updateInviteLimit,
  adminUpdateUserMetadataV2AdminUsersUserIdPatch: sdk.updateUser
  , adminUpdateUserReferralPolicyV2AdminUsersUserIdReferralPolicyPatch: sdk.updateReferralPolicy
}));

import {
  adminProfileConfigUrl,
  AdminApiError,
  createBulkInviteCampaign,
  createReviewAccess,
  resetReviewAccess,
  getAdminCsrfHeaders,
  loadBulkInviteCampaigns,
  loadRuntimeConnections,
  loadInvites,
  loadUsers,
  loadInvitationSources,
  reissueInviteShareLink,
  resendAdminInvite,
  revokeBulkInviteCampaign,
  updateAdminNote,
  updateReferralPolicy,
  updateInviteRecipient,
  updateInviteWireGuardLimit
} from './adminApi';

afterEach(() => {
  document.cookie = 'wg_admin_csrf=; Max-Age=0; Path=/';
  vi.clearAllMocks();
});

test('resets review access via the generated POST with admin CSRF and preserves the abort signal', async () => {
  document.cookie = 'wg_admin_csrf=reset%20csrf; Path=/';
  const response = { state: 'resetting', retained_succeeded_payments: 1 };
  const controller = new AbortController();
  sdk.resetReview.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });
  await expect(resetReviewAccess(controller.signal)).resolves.toEqual(response);
  expect(sdk.resetReview).toHaveBeenCalledWith({ credentials: 'same-origin', headers: { 'x-admin-csrf-token': 'reset csrf' }, signal: controller.signal });
  expect(sdk.reviewAccess).not.toHaveBeenCalled();
});

test('preserves the backend reset conflict detail and status', async () => {
  sdk.resetReview.mockResolvedValue({ error: { detail: 'review payment is still pending' }, response: new Response(null, { status: 409 }) });
  await expect(resetReviewAccess()).rejects.toMatchObject({ status: 409, message: 'review payment is still pending' });
});

test('updates referral enabled and limit atomically with admin CSRF', async () => {
  document.cookie = 'wg_admin_csrf=admin%20csrf; Path=/';
  sdk.updateReferralPolicy.mockResolvedValue({ data: { user_id: 'user-1', enabled: false, limit: 3 }, response: new Response(null, { status: 200 }) });
  await updateReferralPolicy('user-1', false, 3);
  expect(sdk.updateReferralPolicy).toHaveBeenCalledWith(expect.objectContaining({ body: { enabled: false, limit: 3 }, headers: { 'x-admin-csrf-token': 'admin csrf' }, path: { user_id: 'user-1' } }));
});

describe('admin CSRF cookie handling', () => {
  test('maps the encoded CSRF cookie to the required header', () => {
    expect(getAdminCsrfHeaders('unrelated=x; wg_admin_csrf=token%2Fvalue%3D; another=y')).toEqual({
      'x-admin-csrf-token': 'token/value='
    });
  });

  test('does not invent a CSRF header when the cookie is absent', () => {
    expect(getAdminCsrfHeaders('unrelated=x')).toBeUndefined();
  });

  test('maps search, offset, authoritative sorting, and AbortSignal to the generated users query', async () => {
    sdk.listUsers.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
    const controller = new AbortController();
    await loadUsers({ query: 'Person Name', limit: 100, offset: 200, sortBy: 'invited_by_label', sortDir: 'asc' }, controller.signal);
    expect(sdk.listUsers).toHaveBeenCalledWith({
      credentials: 'same-origin',
      signal: controller.signal,
      query: {
        query: 'Person Name', limit: 100, offset: 200, sort_by: 'invited_by_label', sort_dir: 'asc'
      }
    });
  });

  test('sends nullable private notes through the generated admin PATCH with CSRF', async () => {
    document.cookie = 'wg_admin_csrf=csrf%20value; Path=/';
    const response = { admin_note: null, display_name: 'Mitya', user_id: 'user-1' };
    sdk.updateUser.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });
    await expect(updateAdminNote('user-1', null)).resolves.toEqual(response);
    expect(sdk.updateUser).toHaveBeenCalledWith(expect.objectContaining({
      body: { admin_note: null },
      headers: { 'x-admin-csrf-token': 'csrf value' },
      path: { user_id: 'user-1' }
    }));
  });

  test('maps invite lifecycle mutations to generated operations with CSRF', async () => {
    document.cookie = 'wg_admin_csrf=csrf-value; Path=/';
    const response = { invite_id: 'invite-1' };
    sdk.resendInvite.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });
    sdk.reissueInvite.mockResolvedValue({ data: { ...response, invite_token: 'one-time-token' }, response: new Response(null, { status: 200 }) });
    sdk.updateInviteRecipient.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });
    sdk.updateInviteLimit.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });

    await resendAdminInvite('invite-1');
    await reissueInviteShareLink('invite-1');
    await updateInviteRecipient('invite-1', null);
    await updateInviteWireGuardLimit('invite-1', 0);

    const shared = { credentials: 'same-origin', headers: { 'x-admin-csrf-token': 'csrf-value' }, path: { invite_id: 'invite-1' } };
    expect(sdk.resendInvite).toHaveBeenCalledWith(shared);
    expect(sdk.reissueInvite).toHaveBeenCalledWith(shared);
    expect(sdk.updateInviteRecipient).toHaveBeenCalledWith({ ...shared, body: { email: null } });
    expect(sdk.updateInviteLimit).toHaveBeenCalledWith({ ...shared, body: { profile_limit: 0 } });
  });

  test('creates review access through the generated endpoint with same-origin credentials and admin CSRF', async () => {
    document.cookie = 'wg_admin_csrf=review%20csrf; Path=/';
    const response = {
      review_url: 'https://access.secret-studio.ru/auth/magic#review=exact-secret',
      expires_at: '2026-09-30T10:00:00Z',
      user_id: '00000000-0000-0000-0000-000000000001',
      grant_id: '00000000-0000-0000-0000-000000000002',
      configuration_id: null,
      wireguard_profile_id: null,
      wireguard_status: 'payment_required',
      wireguard_tunnel_ip: null,
      amneziawg_profile_id: null,
      amneziawg_status: 'payment_required',
      amneziawg_tunnel_ip: null
    };
    sdk.reviewAccess.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });

    await expect(createReviewAccess()).resolves.toEqual(response);
    expect(sdk.reviewAccess).toHaveBeenCalledWith({
      credentials: 'same-origin',
      headers: { 'x-admin-csrf-token': 'review csrf' }
    });
  });

  test('loads runtime connections through the generated same-origin GET and preserves AbortSignal', async () => {
    const response = { generated_at: null, received_at: null, snapshot_age_seconds: null, stale: false, sample_interval_seconds: null, unmatched_runtime_rows_count: 0, rows: [] };
    const controller = new AbortController();
    sdk.runtimeConnections.mockResolvedValue({ data: response, response: new Response(null, { status: 200 }) });
    await expect(loadRuntimeConnections(controller.signal)).resolves.toEqual(response);
    expect(sdk.runtimeConnections).toHaveBeenCalledWith({ credentials: 'same-origin', signal: controller.signal });
  });

  test('loads invites through the generated same-origin GET and preserves AbortSignal', async () => {
    const controller = new AbortController();
    sdk.listInvites.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
    await expect(loadInvites(['user', 'admin'], controller.signal)).resolves.toEqual([]);
    expect(sdk.listInvites).toHaveBeenCalledWith({
      credentials: 'same-origin', query: { origin: ['user', 'admin'] }, signal: controller.signal
    });
  });

  test('maps bulk campaign list, exact create payload, and revoke through generated operations', async () => {
    document.cookie = 'wg_admin_csrf=csrf-value; Path=/';
    const campaign = { campaign_id: 'campaign-1', label: 'Conference', state: 'active' };
    const body = {
      expires_at: '2026-10-01T09:00:00.000Z', label: 'Conference', max_registrations: 350,
      plan_id: 'commercial-plan-id', recipient_referral_limit: 8,
      recipient_referrals_enabled: false, trial_days: 3
    };
    sdk.listBulkInvites.mockResolvedValue({ data: [campaign], response: new Response(null, { status: 200 }) });
    sdk.createBulkInvite.mockResolvedValue({ data: { campaign, campaign_token: 'one-time' }, response: new Response(null, { status: 200 }) });
    sdk.revokeBulkInvite.mockResolvedValue({ data: { ...campaign, state: 'revoked' }, response: new Response(null, { status: 200 }) });

    await loadBulkInviteCampaigns();
    await createBulkInviteCampaign(body);
    await revokeBulkInviteCampaign('campaign-1');

    expect(sdk.listBulkInvites).toHaveBeenCalledWith({ credentials: 'same-origin' });
    expect(sdk.createBulkInvite).toHaveBeenCalledWith({ credentials: 'same-origin', headers: { 'x-admin-csrf-token': 'csrf-value' }, body });
    expect(sdk.revokeBulkInvite).toHaveBeenCalledWith({
      credentials: 'same-origin', headers: { 'x-admin-csrf-token': 'csrf-value' }, path: { campaign_id: 'campaign-1' }
    });
  });

  test('converts runtime failures and builds encoded config navigation without fetching it', async () => {
    sdk.runtimeConnections.mockResolvedValue({ error: { detail: 'Runtime unavailable.' }, response: new Response(null, { status: 503 }) });
    await expect(loadRuntimeConnections()).rejects.toEqual(expect.objectContaining<Partial<AdminApiError>>({
      message: 'Runtime unavailable.', status: 503
    }));
    expect(adminProfileConfigUrl('profile/with space')).toBe('/v2/admin/profiles/profile%2Fwith%20space/config');
  });
});


describe('P34 attribution API adapters', () => {
  test.each([
    {},
    { invited_by_origin: 'admin' as const },
    { invited_by_origin: 'user' as const },
    { invited_by_origin: 'campaign' as const },
    { invited_by_origin: 'user' as const, invited_by_user_id: '00000000-0000-4000-8000-000000000001' },
    { invited_by_origin: 'campaign' as const, invited_by_campaign_id: '00000000-0000-4000-8000-000000000002' }
  ])('preserves exact attribution parameters together with search/sort/pagination: %j', async (attribution) => {
    sdk.listUsers.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
    await loadUsers({ ...attribution, query: 'Person', limit: 100, offset: 100, sortBy: 'invited_by_label', sortDir: 'desc' });
    expect(sdk.listUsers).toHaveBeenLastCalledWith({ credentials: 'same-origin', query: {
      ...attribution, query: 'Person', limit: 100, offset: 100, sort_by: 'invited_by_label', sort_dir: 'desc'
    } });
  });

  test.each(['user', 'campaign'] as const)('uses generated lookup for %s with bounded query and AbortSignal', async (origin) => {
    sdk.invitationSources.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
    const controller = new AbortController();
    await expect(loadInvitationSources({ origin, query: 'Петр Ков', limit: 20 }, controller.signal)).resolves.toEqual([]);
    expect(sdk.invitationSources).toHaveBeenLastCalledWith({ credentials: 'same-origin', signal: controller.signal,
      query: { origin, query: 'Петр Ков', limit: 20 } });
  });

  test('preserves lookup error status for the existing session-expired flow', async () => {
    sdk.invitationSources.mockResolvedValue({ error: { detail: 'Session expired' }, response: new Response(null, { status: 401 }) });
    await expect(loadInvitationSources({ origin: 'user', limit: 20 })).rejects.toMatchObject({ status: 401, message: 'Session expired' });
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminBulkInviteSummary, AdminInviteSummary, AdminProtocolLimitUpdateResponse, AdminRuntimeConnectionsResponse, AdminUserDeleteResponse, AdminUserSummary, ConfigurationSummary, ProfileSummary } from '@wg-paid/api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import {
  AdminApiError, checkAdminSession, createBulkInviteCampaign, createInvite, deleteUser, loadBulkInviteCampaigns, loadInvites, loadPlans, loadRuntimeConnections, loadUsers,
  loginAdmin, logoutAdmin, reissueInviteShareLink, resendAdminInvite, revokeInvite, setWireGuardLimit, updateAdminNote,
  revokeBulkInviteCampaign, updateInviteRecipient, updateInviteWireGuardLimit, updateReferralPolicy
} from './lib/adminApi';

vi.mock('./lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/adminApi')>();
  return {
    ...actual,
    checkAdminSession: vi.fn(), createBulkInviteCampaign: vi.fn(), createInvite: vi.fn(), deleteUser: vi.fn(), loadBulkInviteCampaigns: vi.fn(), loadInvites: vi.fn(),
    loadPlans: vi.fn(), loadRuntimeConnections: vi.fn(), loadUsers: vi.fn(), loginAdmin: vi.fn(), logoutAdmin: vi.fn(), revokeBulkInviteCampaign: vi.fn(),
    reissueInviteShareLink: vi.fn(), resendAdminInvite: vi.fn(), revokeInvite: vi.fn(), setWireGuardLimit: vi.fn(), updateAdminNote: vi.fn(),
    updateInviteRecipient: vi.fn(), updateInviteWireGuardLimit: vi.fn(), updateReferralPolicy: vi.fn()
  };
});

const plan = {
  active: true, code: 'standard', default_amneziawg_limit: 0, default_wireguard_limit: 2,
  display_name: 'Standard', id: 'plan-1'
};
const commercialPlan = {
  ...plan, code: 'commercial-rub-v1', display_name: 'Commercial', id: 'commercial-plan-id'
};
const invite: AdminInviteSummary = {
  can_change_email: true, can_reissue_share_link: false, can_resend: true, can_revoke: true,
  bulk_campaign_id: null, bulk_campaign_label: null, origin: 'admin',
  created_by_kind: 'admin_secret', created_by_label: 'Admin', created_by_user_id: null,
  created_at: '2026-01-01T00:00:00Z', expires_at: '2026-02-01T00:00:00Z',
  intended_email: 'invitee@example.test', invite_id: 'invite-1', max_uses: 1, plan_id: 'plan-1',
  magic_link_expires_at: null, magic_link_sent_at: null, pending_email: null,
  recipient_referral_limit: 3, recipient_referrals_enabled: true,
  resend_available_at: null, revoked_at: null, state: 'active', used_count: 0, wireguard_profile_limit: 2
};
const runtimeSnapshot: AdminRuntimeConnectionsResponse = {
  generated_at: '2026-09-12T10:00:00Z', received_at: '2026-09-12T10:00:01Z',
  rows: [], sample_interval_seconds: 5, snapshot_age_seconds: 1, stale: false,
  unmatched_runtime_rows_count: 0
};
const campaign: AdminBulkInviteSummary = {
  campaign_id: 'campaign-1', created_at: '2026-09-01T00:00:00Z', expires_at: '2026-10-01T00:00:00Z',
  label: 'Conference 2026', max_registrations: 350, plan_id: commercialPlan.id,
  recipient_referral_limit: 3, recipient_referrals_enabled: true, revoked_at: null,
  state: 'active', trial_days: 3, used_count: 127
};

function makeInvite(inviteId: string, state: AdminInviteSummary['state'], intendedEmail: string): AdminInviteSummary {
  return {
    ...invite,
    can_change_email: state === 'active' || state === 'awaiting_confirmation',
    can_resend: state === 'awaiting_confirmation',
    can_revoke: state === 'active' || state === 'awaiting_confirmation',
    intended_email: intendedEmail,
    invite_id: inviteId,
    pending_email: state === 'awaiting_confirmation' ? intendedEmail : null,
    revoked_at: state === 'revoked' ? '2026-01-02T00:00:00Z' : null,
    state,
    used_count: state === 'used' ? 1 : 0
  };
}

function profile(id: string, status: string, tunnelIp: string): ProfileSummary {
  return {
    access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id, label: null,
    protocol: 'wireguard', status, tunnel_ip: tunnelIp, updated_at: '2026-01-01T00:00:00Z'
  };
}

function configuration(profileRow: ProfileSummary, ordinal: number): ConfigurationSummary {
  return {
    access_grant_id: profileRow.access_grant_id,
    configuration_id: `configuration-${profileRow.id}`,
    ordinal,
    label: profileRow.label,
    created_at: profileRow.created_at,
    updated_at: profileRow.updated_at,
    variants: [
      { protocol: 'wireguard', profile_id: profileRow.id, status: profileRow.status,
        tunnel_ip: profileRow.tunnel_ip, ready: profileRow.status === 'active' && Boolean(profileRow.tunnel_ip),
        created_at: profileRow.created_at, updated_at: profileRow.updated_at },
      { protocol: 'amneziawg', profile_id: `${profileRow.id}-awg`, status: profileRow.status,
        tunnel_ip: profileRow.tunnel_ip, ready: profileRow.status === 'active' && Boolean(profileRow.tunnel_ip),
        created_at: profileRow.created_at, updated_at: profileRow.updated_at }
    ]
  };
}

function makeUser(
  profileLimit = 1,
  profileCount = 1,
  profiles: Array<ProfileSummary> = [profile('profile-1', 'active', '10.253.1.10')],
  deletionRequestedAt: string | null = null
): AdminUserSummary {
  return {
    admin_note: 'Customer prefers weekend support.', created_at: '2026-01-01T00:00:00Z', deletion_requested_at: deletionRequestedAt,
    display_name: 'Mitya',
    email: 'operator-target@example.test', email_verified_at: '2026-01-01T01:00:00Z',
    grants: [{
      id: 'grant-1', plan_id: 'plan-1',
      can_create_configuration: profileCount < profileLimit,
      configuration_count: profileCount,
      configuration_limit: profileLimit,
      protocol_limits: [{ can_create: profileCount < profileLimit, profile_count: profileCount, profile_limit: profileLimit, protocol: 'wireguard' }],
      status: 'active', valid_until: null
    }],
    invite_issued_at: '2025-12-30T00:00:00Z', invite_redeemed_at: '2026-01-01T01:00:00Z',
    invited_by_campaign_id: null, invited_by_kind: 'admin_secret', invited_by_label: 'Admin',
    invited_by_origin: 'admin', invited_by_user_id: null,
    configurations: profiles.filter((item) => item.protocol === 'wireguard' && item.status !== 'disabled')
      .map((item, index) => configuration(item, index + 1)),
    profiles, registration_invite_id: 'invite-1',
    referral_limit: 3, referrals_enabled: false,
    user_id: 'user-1'
  };
}

const limitResponse = (overrides: Partial<AdminProtocolLimitUpdateResponse> = {}): AdminProtocolLimitUpdateResponse => ({
  access_grant_id: 'grant-1', can_create: false, disable_jobs_created: 0, profile_count: 1,
  profile_limit: 1, protocol: 'wireguard', retire_profile_ids: [], retirement_in_progress: false,
  ...overrides
});

const deleteResponse = (status: AdminUserDeleteResponse['status'], legacyCount = 0): AdminUserDeleteResponse => ({
  disable_jobs_created: 0, email: 'operator-target@example.test', legacy_dependency_count: legacyCount,
  remaining_profiles: status === 'deleted' ? 0 : 1, status, user_id: 'user-1'
});

function renderAdmin() {
  const queryClient = new QueryClient({
    defaultOptions: { mutations: { retry: false }, queries: { gcTime: Infinity, retry: false } }
  });
  return { queryClient, ...render(<QueryClientProvider client={queryClient}><HashRouter><App /></HashRouter></QueryClientProvider>) };
}

async function renderDashboard(user: AdminUserSummary | null = makeUser()) {
  vi.mocked(loadUsers).mockResolvedValue(user ? [user] : []);
  renderAdmin();
  await screen.findByRole('heading', { name: 'Operations admin' });
  if (user) await screen.findByText(user.email);
}

async function renderInvitesDashboard() {
  await renderDashboard();
  fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
  await screen.findByRole('region', { name: 'Invites' });
  await waitFor(() => expect(screen.queryByText('Loading invites…')).toBeNull());
}

function expandUser(email = 'operator-target@example.test') {
  fireEvent.click(screen.getByText(email));
}

async function openRetirement(user: AdminUserSummary, newLimit = 1) {
  await renderDashboard(user);
  expandUser(user.email);
  fireEvent.change(screen.getByLabelText('New configuration limit for grant grant-1'), { target: { value: String(newLimit) } });
  fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
  return screen.findByRole('dialog', { name: 'Select connections to retire' });
}

async function openDeleteDialog() {
  if (!screen.queryByRole('button', { name: 'Delete user' })) expandUser();
  fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
  return screen.findByRole('dialog', { name: /Delete operator-target@example\.test/ });
}

beforeEach(() => {
  window.history.replaceState(null, '', '/#/users');
  vi.mocked(checkAdminSession).mockResolvedValue(true);
  vi.mocked(loginAdmin).mockResolvedValue();
  vi.mocked(logoutAdmin).mockResolvedValue();
  vi.mocked(loadPlans).mockResolvedValue([plan, commercialPlan]);
  vi.mocked(loadBulkInviteCampaigns).mockResolvedValue([]);
  vi.mocked(loadInvites).mockResolvedValue([invite]);
  vi.mocked(loadRuntimeConnections).mockResolvedValue(runtimeSnapshot);
  vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
  vi.mocked(createInvite).mockResolvedValue({
    email_sent: false, expires_at: null, intended_email: null, invite_id: 'invite-new',
    invite_token: 'secret-invite-token', recipient_referral_limit: 3,
    recipient_referrals_enabled: true, wireguard_profile_limit: 2
  });
  vi.mocked(createBulkInviteCampaign).mockResolvedValue({ campaign, campaign_token: 'campaign-secret' });
  vi.mocked(revokeBulkInviteCampaign).mockResolvedValue({ ...campaign, revoked_at: '2026-09-02T00:00:00Z', state: 'revoked' });
  vi.mocked(resendAdminInvite).mockResolvedValue({ ...invite, state: 'awaiting_confirmation' });
  vi.mocked(reissueInviteShareLink).mockResolvedValue({ invite_id: '12345678-1234-1234-1234-123456789abc', invite_token: 'replacement-token' });
  vi.mocked(revokeInvite).mockResolvedValue({ ...invite, can_change_email: false, can_resend: false, can_revoke: false, state: 'revoked', revoked_at: '2026-01-02T00:00:00Z' });
  vi.mocked(updateInviteRecipient).mockImplementation(async (_inviteId, recipient) => ({ ...invite, intended_email: recipient, pending_email: recipient, state: recipient ? 'awaiting_confirmation' : 'active' }));
  vi.mocked(updateInviteWireGuardLimit).mockImplementation(async (_inviteId, profileLimit) => ({ ...invite, wireguard_profile_limit: profileLimit }));
  vi.mocked(setWireGuardLimit).mockResolvedValue(limitResponse());
  vi.mocked(deleteUser).mockResolvedValue(deleteResponse('deleted'));
  vi.mocked(updateAdminNote).mockImplementation(async (userId, adminNote) => ({
    admin_note: adminNote,
    display_name: 'Mitya',
    user_id: userId
  }));
  vi.mocked(updateReferralPolicy).mockImplementation(async (userId, enabled, limit) => ({ user_id: userId, enabled, limit }));
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('admin session and invites', () => {
  test('checks session, logs in without retaining the secret, and logs out', async () => {
    vi.mocked(checkAdminSession).mockResolvedValue(false);
    renderAdmin();
    const secretInput = await screen.findByLabelText('Admin secret');
    const secret = 'a'.repeat(32);
    fireEvent.change(secretInput, { target: { value: secret } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('heading', { name: 'Operations admin' });
    expect(loginAdmin).toHaveBeenCalledWith(secret);
    expect(document.body.textContent).not.toContain(secret);
    fireEvent.click(screen.getByRole('button', { name: 'Sign out' }));
    await screen.findByText('Signed out.');
    expect(logoutAdmin).toHaveBeenCalledOnce();
  });

  test('shows invalid-login feedback', async () => {
    vi.mocked(checkAdminSession).mockResolvedValue(false);
    vi.mocked(loginAdmin).mockRejectedValue(new AdminApiError(401, 'Invalid admin secret.'));
    renderAdmin();
    fireEvent.change(await screen.findByLabelText('Admin secret'), { target: { value: 'x'.repeat(32) } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByText('Invalid admin secret.');
  });

  test('creates a transferable invite and exposes its one-time URL only in the canonical active row', async () => {
    const transferable = {
      ...makeInvite('12345678-1234-1234-1234-123456789abc', 'active', ''),
      can_change_email: true, can_reissue_share_link: true, can_resend: false, intended_email: null
    };
    vi.mocked(loadInvites).mockResolvedValue([transferable]);
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: null, invite_id: transferable.invite_id,
      invite_token: 'secret token/+', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    const createButton = screen.getByRole('button', { name: 'Create invite' });
    await waitFor(() => expect((createButton as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText('Number of configurations') as HTMLInputElement).value).toBe('2');
    expect((screen.getByRole('checkbox', { name: 'Allow invitations' }) as HTMLInputElement).checked).toBe(true);
    expect((screen.getByLabelText('Active invitation limit') as HTMLInputElement).value).toBe('3');
    expect(screen.getByPlaceholderText('Leave blank to create a transferable URL for manual sharing')).not.toBeNull();
    fireEvent.click(createButton);
    await screen.findByText('Transferable invite created. Copy its registration URL from Active Invites.');
    expect(createInvite).toHaveBeenCalledWith({
      intended_email: null, plan_id: 'plan-1', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    const active = screen.getByRole('region', { name: 'Active Invites' });
    expect(within(active).getByText('Invite 12345678')).not.toBeNull();
    expect(within(active).getByText('https://access.secret-studio.ru/invite#token=secret%20token%2F%2B&invite=12345678-1234-1234-1234-123456789abc')).not.toBeNull();
    expect(screen.queryByText(/Recently created/i)).toBeNull();
  });

  test.each([
    { enabled: true, limit: '7' },
    { enabled: false, limit: '5' },
    { enabled: true, limit: '0' }
  ])('submits ordinary invite recipient policy enabled=$enabled limit=$limit exactly', async ({ enabled, limit }) => {
    await renderInvitesDashboard();
    const allow = screen.getByRole('checkbox', { name: 'Allow invitations' }) as HTMLInputElement;
    if (allow.checked !== enabled) fireEvent.click(allow);
    fireEvent.change(screen.getByLabelText('Active invitation limit'), { target: { value: limit } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith({
      intended_email: null,
      plan_id: plan.id,
      recipient_referral_limit: Number(limit),
      recipient_referrals_enabled: enabled,
      wireguard_profile_limit: plan.default_wireguard_limit
    }));
  });

  test('keeps the recipient limit editable while disabled and blocks negative or non-integer values', async () => {
    await renderInvitesDashboard();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow invitations' }));
    const limit = screen.getByLabelText('Active invitation limit') as HTMLInputElement;
    expect(limit.disabled).toBe(false);
    fireEvent.change(limit, { target: { value: '-1' } });
    expect((screen.getByRole('button', { name: 'Create invite' }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(limit, { target: { value: '2.5' } });
    expect((screen.getByRole('button', { name: 'Create invite' }) as HTMLButtonElement).disabled).toBe(true);
    expect(createInvite).not.toHaveBeenCalled();
  });

  test('transferable invite copy button shows success, failure, and resets its timer', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    const inviteId = '12345678-1234-1234-1234-123456789abc';
    const transferable = {
      ...makeInvite(inviteId, 'active', ''),
      can_change_email: true, can_reissue_share_link: true, can_resend: false, intended_email: null
    };
    vi.mocked(loadInvites).mockResolvedValue([transferable]);
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: null, invite_id: inviteId,
      invite_token: 'copy-token', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    const copy = await screen.findByRole('button', { name: 'Copy invite 12345678' });

    fireEvent.click(copy);
    await waitFor(() => expect(copy.textContent).toBe('Copied'));
    fireEvent.click(copy);
    await waitFor(() => expect(copy.textContent).toBe('Copy failed'));
    expect(writeText).toHaveBeenCalledTimes(2);
    await act(async () => { await vi.advanceTimersByTimeAsync(1200); });
    expect(copy.textContent).toBe('Copy failed');
    await act(async () => { await vi.advanceTimersByTimeAsync(600); });
    expect(copy.textContent).toBe('Copy');
  });

  test('reissue atomically replaces the ephemeral share URL and remounting forgets it', async () => {
    const inviteId = '12345678-1234-1234-1234-123456789abc';
    const transferable = {
      ...makeInvite(inviteId, 'active', ''),
      can_change_email: true, can_reissue_share_link: true, can_resend: false, intended_email: null
    };
    vi.mocked(loadInvites).mockResolvedValue([transferable]);
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: null, invite_id: inviteId,
      invite_token: 'first-token', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    vi.mocked(reissueInviteShareLink).mockResolvedValue({ invite_id: inviteId, invite_token: 'replacement-token' });
    window.history.replaceState(null, '', '/#/invites');
    const first = renderAdmin();
    await screen.findByRole('region', { name: 'Invites' });
    await waitFor(() => expect((screen.getByRole('button', { name: 'Create invite' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await screen.findByText(/token=first-token/);

    fireEvent.click(screen.getByRole('button', { name: 'Reissue share link' }));
    await screen.findByText('Share link reissued. Copy the new URL; the previous share link no longer works.');
    expect(screen.queryByText(/token=first-token/)).toBeNull();
    expect(screen.getByText(new RegExp(`token=replacement-token&invite=${inviteId}`))).not.toBeNull();
    expect(reissueInviteShareLink).toHaveBeenCalledWith(inviteId);

    first.unmount();
    renderAdmin();
    await screen.findByRole('region', { name: 'Invites' });
    expect(screen.queryByText(/token=replacement-token/)).toBeNull();
  });

  test('polling lifecycle changes clear an ephemeral admin share URL', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const inviteId = '12345678-1234-1234-1234-123456789abc';
    const transferable = {
      ...makeInvite(inviteId, 'active', ''),
      can_change_email: true, can_reissue_share_link: true, can_resend: false, intended_email: null
    };
    vi.mocked(loadInvites).mockResolvedValue([transferable]);
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: null, invite_id: inviteId,
      invite_token: 'ephemeral-admin-token', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    window.history.replaceState(null, '', '/#/invites');
    renderAdmin();
    await waitFor(() => expect((screen.getByRole('button', { name: 'Create invite' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await screen.findByText(/token=ephemeral-admin-token/);

    vi.mocked(loadInvites).mockResolvedValue([{ ...transferable, state: 'awaiting_confirmation' }]);
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    await waitFor(() => expect(screen.queryByText(/token=ephemeral-admin-token/)).toBeNull());
  });

  test('sorts Active Invites newest first with invite ID as the deterministic tie-break', async () => {
    vi.mocked(loadInvites).mockResolvedValue([
      { ...makeInvite('bbbbbbbb-0000-0000-0000-000000000000', 'active', ''), created_at: '2026-01-02T00:00:00Z', intended_email: null },
      { ...makeInvite('cccccccc-0000-0000-0000-000000000000', 'active', ''), created_at: '2026-01-03T00:00:00Z', intended_email: null },
      { ...makeInvite('aaaaaaaa-0000-0000-0000-000000000000', 'active', ''), created_at: '2026-01-03T00:00:00Z', intended_email: null }
    ]);
    await renderInvitesDashboard();
    const labels = within(screen.getByRole('region', { name: 'Active Invites' })).getAllByText(/^Invite [A-F0-9]{8}$/).map((node) => node.textContent);
    expect(labels).toEqual(['Invite AAAAAAAA', 'Invite CCCCCCCC', 'Invite BBBBBBBB']);
  });

  test('shows operational creator provenance without exposing creator identifiers or tokens', async () => {
    vi.mocked(loadInvites).mockResolvedValue([
      invite,
      {
        ...invite,
        created_by_kind: 'user_referral',
        created_by_label: 'referrer@example.test',
        created_by_user_id: 'creator-uuid-must-stay-hidden',
        intended_email: 'referred@example.test',
        invite_id: 'referral-invite'
      }
    ]);
    await renderInvitesDashboard();
    await screen.findByText('referrer@example.test');
    const activeInvites = screen.getByRole('region', { name: 'Active Invites' });
    expect(within(activeInvites).getAllByText('Created by')).toHaveLength(2);
    expect(within(activeInvites).getByText('Admin')).not.toBeNull();
    expect(within(activeInvites).getByText('referrer@example.test')).not.toBeNull();
    expect(document.body.textContent).not.toContain('creator-uuid-must-stay-hidden');
    expect(document.body.textContent).not.toContain('secret-invite-token');
  });

  test('resets the pending configuration snapshot to a newly selected plan default', async () => {
    vi.mocked(loadPlans).mockResolvedValue([plan, { ...plan, code: 'zero', default_wireguard_limit: 0, display_name: 'Zero', id: 'plan-2' }]);
    await renderInvitesDashboard();
    fireEvent.change(screen.getByLabelText('Number of configurations'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan-2' } });
    expect((screen.getByLabelText('Number of configurations') as HTMLInputElement).value).toBe('0');
  });

  test('offers both backend-returned account plans and submits the selected plan id and default limit', async () => {
    const commercial = { ...plan, code: 'commercial', default_wireguard_limit: 4, display_name: 'Commercial', id: 'commercial-plan-id' };
    vi.mocked(loadPlans).mockResolvedValue([plan, commercial]);
    await renderInvitesDashboard();
    const selector = screen.getByLabelText('Plan');
    expect(within(selector).getByRole('option', { name: 'Standard (standard)' })).toBeTruthy();
    expect(within(selector).getByRole('option', { name: 'Commercial (commercial)' })).toBeTruthy();
    fireEvent.change(selector, { target: { value: commercial.id } });
    expect((screen.getByLabelText('Number of configurations') as HTMLInputElement).value).toBe('4');
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));
    await waitFor(() => expect(createInvite).toHaveBeenCalledWith({
      intended_email: null, plan_id: commercial.id, recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 4
    }));
  });

  test('email mode reports confirmed delivery and never exposes its raw invite URL', async () => {
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: true, expires_at: null, intended_email: 'direct@example.test', invite_id: 'invite-direct',
      invite_token: 'must-not-be-visible', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    fireEvent.change(within(screen.getByRole('region', { name: 'Invites' })).getByLabelText(/Email/), { target: { value: 'direct@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    expect((await screen.findAllByText('Invite created; registration email sent to direct@example.test.')).length).toBeGreaterThan(0);
    expect(createInvite).toHaveBeenCalledWith({
      intended_email: 'direct@example.test', plan_id: 'plan-1', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    expect(document.body.textContent).not.toContain('must-not-be-visible');
    expect(screen.queryByRole('button', { name: 'Copy invite invite-direct' })).toBeNull();
  });

  test('email mode keeps an undelivered invite visible and actionable without claiming success', async () => {
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: 'retry@example.test', invite_id: 'invite-retry',
      invite_token: 'must-not-be-visible', recipient_referral_limit: 3,
      recipient_referrals_enabled: true, wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    fireEvent.change(within(screen.getByRole('region', { name: 'Invites' })).getByLabelText(/Email/), { target: { value: 'retry@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    await screen.findByText('Invite created for retry@example.test, but mail delivery was not confirmed.');
    expect(screen.queryByText(/email sent to retry@example.test/i)).toBeNull();
    expect(document.body.textContent).not.toContain('must-not-be-visible');
  });

  test('awaiting confirmation stays operational while only terminal states enter Archive', async () => {
    const awaiting = {
      ...makeInvite('invite-awaiting', 'awaiting_confirmation', 'pending@example.test'),
      magic_link_expires_at: '2026-01-01T00:15:00Z', magic_link_sent_at: '2026-01-01T00:00:00Z',
      resend_available_at: '2026-01-01T00:01:00Z', wireguard_profile_limit: 4
    };
    vi.mocked(loadInvites).mockResolvedValue([
      invite,
      awaiting,
      makeInvite('invite-expired', 'expired', 'expired@example.test'),
      makeInvite('invite-revoked', 'revoked', 'revoked@example.test'),
      makeInvite('invite-used', 'used', 'used@example.test')
    ]);
    await renderInvitesDashboard();

    const operational = screen.getByRole('region', { name: 'Active Invites' });
    expect(within(operational).getByText('pending@example.test')).not.toBeNull();
    expect(within(operational).getByText('4')).not.toBeNull();
    expect(within(operational).getByText('Registration email issued')).not.toBeNull();
    expect(within(operational).getByText('Current link expires')).not.toBeNull();
    expect(within(operational).queryByText('expired@example.test')).toBeNull();
    const archive = screen.getByText('Archive (3)');
    expect((archive.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(archive);
    expect(screen.getByText('expired@example.test')).not.toBeNull();
    expect(screen.getByText('revoked@example.test')).not.toBeNull();
    expect(screen.getByText('used@example.test')).not.toBeNull();
  });

  test('uses generated lifecycle actions and refreshes invites after each success', async () => {
    await renderInvitesDashboard();
    const initialLoads = vi.mocked(loadInvites).mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    await waitFor(() => expect(resendAdminInvite).toHaveBeenCalledWith('invite-1'));

    fireEvent.click(screen.getByRole('button', { name: 'Change recipient' }));
    const recipientDialog = await screen.findByRole('dialog', { name: 'Change invite recipient' });
    fireEvent.change(within(recipientDialog).getByLabelText('Email'), { target: { value: 'changed@example.test' } });
    fireEvent.click(within(recipientDialog).getByRole('button', { name: 'Save recipient' }));
    await waitFor(() => expect(updateInviteRecipient).toHaveBeenCalledWith('invite-1', 'changed@example.test'));

    fireEvent.click(screen.getByRole('button', { name: 'Change recipient' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Change invite recipient' })).getByRole('button', { name: 'Clear recipient' }));
    await waitFor(() => expect(updateInviteRecipient).toHaveBeenCalledWith('invite-1', null));

    fireEvent.click(screen.getByRole('button', { name: 'Change configuration limit' }));
    const limitDialog = await screen.findByRole('dialog', { name: 'Change configuration limit' });
    fireEvent.change(within(limitDialog).getByLabelText('Number of configurations'), { target: { value: '0' } });
    fireEvent.click(within(limitDialog).getByRole('button', { name: 'Save limit' }));
    await waitFor(() => expect(updateInviteWireGuardLimit).toHaveBeenCalledWith('invite-1', 0));

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite INVITE1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke invite?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke invite' }));
    await screen.findByText('Invite revoked.');
    expect(revokeInvite).toHaveBeenCalledWith('invite-1');
    await waitFor(() => expect(vi.mocked(loadInvites).mock.calls.length).toBeGreaterThan(initialLoads));
  });

  test('capability booleans control resend, recipient, and revoke actions', async () => {
    vi.mocked(loadInvites).mockResolvedValue([{ ...invite, can_change_email: false, can_reissue_share_link: true, can_resend: false, can_revoke: false }]);
    await renderInvitesDashboard();
    expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change recipient' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revoke invite/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change configuration limit' })).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Reissue share link' })).toBeNull();
  });

  test('429 and 409 refresh state without presenting stale success', async () => {
    vi.mocked(resendAdminInvite).mockRejectedValue(new AdminApiError(429));
    vi.mocked(updateInviteRecipient).mockRejectedValue(new AdminApiError(409));
    await renderInvitesDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Resend email' }));
    await screen.findByText('Resend is still in cooldown. Current invite state was refreshed.');
    expect(screen.queryByText(/resend requested/i)).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Change recipient' }));
    fireEvent.click(within(await screen.findByRole('dialog', { name: 'Change invite recipient' })).getByRole('button', { name: 'Clear recipient' }));
    await screen.findByText('The invite is no longer mutable. Current invite state was refreshed.');
    expect(screen.queryByText('Recipient cleared. The invite is now transferable for manual sharing.')).toBeNull();
  });

  test('filters invite origins with repeated typed combinations and makes all-unchecked network-safe', async () => {
    await renderInvitesDashboard();
    await waitFor(() => expect(loadInvites).toHaveBeenLastCalledWith(['user', 'admin'], expect.any(AbortSignal)));

    fireEvent.click(screen.getByRole('checkbox', { name: 'Campaign invites' }));
    await waitFor(() => expect(loadInvites).toHaveBeenLastCalledWith(['user', 'admin', 'campaign'], expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('checkbox', { name: 'User invites' }));
    await waitFor(() => expect(loadInvites).toHaveBeenLastCalledWith(['admin', 'campaign'], expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('checkbox', { name: 'Admin invites' }));
    await waitFor(() => expect(loadInvites).toHaveBeenLastCalledWith(['campaign'], expect.any(AbortSignal)));

    const callsBeforeEmpty = vi.mocked(loadInvites).mock.calls.length;
    fireEvent.click(screen.getByRole('checkbox', { name: 'Campaign invites' }));
    await screen.findByText('No invite origins selected.');
    expect(loadInvites).toHaveBeenCalledTimes(callsBeforeEmpty);
  });

  test('renders campaign child provenance and suppresses every ordinary invite mutation action', async () => {
    const child: AdminInviteSummary = {
      ...invite,
      bulk_campaign_id: 'campaign-parent', bulk_campaign_label: 'Conference Parent',
      can_change_email: false, can_reissue_share_link: false, can_resend: false, can_revoke: false,
      intended_email: 'participant@example.test', invite_id: 'campaign-child', origin: 'campaign'
    };
    vi.mocked(loadInvites).mockImplementation(async (origins) => origins.includes('campaign') ? [child] : []);
    await renderInvitesDashboard();
    fireEvent.click(screen.getByRole('checkbox', { name: 'Campaign invites' }));
    const email = await screen.findByText('participant@example.test');
    const row = email.closest('article')!;
    expect(within(row).getAllByText('Campaign').length).toBeGreaterThanOrEqual(2);
    expect(within(row).getByText('Origin')).not.toBeNull();
    expect(within(row).getAllByText('Conference Parent')).toHaveLength(1);
    expect(within(row).queryByText('Created by')).toBeNull();
    expect(within(row).queryByText('Parent campaign')).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Resend email' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Change recipient' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Change configuration limit' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Reissue share link' })).toBeNull();
    expect(within(row).queryByRole('button', { name: /Revoke invite/ })).toBeNull();
  });

  test('creates one-time campaign material locally, copies and downloads it, then forgets it on remount', async () => {
    const trustedPilot = { ...plan, code: 'trusted-pilot', display_name: 'Trusted Pilot', id: 'trusted-plan-id' };
    vi.mocked(loadPlans).mockResolvedValue([trustedPilot, commercialPlan]);
    const writeText = vi.fn().mockResolvedValue(undefined);
    const fetchSpy = vi.fn();
    const createObjectURL = vi.fn(() => 'blob:campaign-qr');
    const revokeObjectURL = vi.fn();
    const anchorClick = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
    vi.stubGlobal('fetch', fetchSpy);
    Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    window.history.replaceState(null, '', '/#/invites');
    const first = renderAdmin();
    const campaigns = await screen.findByRole('region', { name: 'Bulk Invite Campaigns' });
    expect(within(campaigns).queryByRole('combobox', { name: 'Campaign plan' })).toBeNull();
    expect(await within(campaigns).findByText('Commercial')).not.toBeNull();
    await waitFor(() => expect((within(campaigns).getByRole('button', { name: 'Create campaign' }) as HTMLButtonElement).disabled).toBe(true));
    fireEvent.change(within(campaigns).getByLabelText('Label'), { target: { value: 'Conference 2026' } });
    fireEvent.change(within(campaigns).getByLabelText('Maximum registrations'), { target: { value: '350' } });
    fireEvent.change(within(campaigns).getByLabelText('Trial days'), { target: { value: '3' } });
    fireEvent.change(within(campaigns).getByLabelText('Expires at'), { target: { value: '2026-10-01T12:00' } });
    await waitFor(() => expect((within(campaigns).getByRole('button', { name: 'Create campaign' }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(within(campaigns).getByRole('button', { name: 'Create campaign' }));

    const expectedUrl = 'https://access.secret-studio.ru/invite#campaign=campaign-secret';
    await screen.findByText(expectedUrl);
    expect(createBulkInviteCampaign).toHaveBeenCalledWith({
      expires_at: new Date('2026-10-01T12:00').toISOString(), label: 'Conference 2026',
      max_registrations: 350, plan_id: commercialPlan.id, recipient_referral_limit: 3,
      recipient_referrals_enabled: true, trial_days: 3
    });
    expect(createBulkInviteCampaign).not.toHaveBeenCalledWith(expect.objectContaining({ plan_id: trustedPilot.id }));
    expect(screen.getByRole('alert').textContent).toContain('IMPORTANT: Save this link or QR now.');
    expect(screen.getByRole('alert').textContent).toContain('cannot be shown again');
    const qr = document.querySelector(`[data-qr-value="${expectedUrl}"]`);
    expect(qr?.querySelector('svg')).not.toBeNull();
    expect(fetchSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
    await screen.findByRole('button', { name: 'Copied' });
    expect(writeText).toHaveBeenCalledWith(expectedUrl);
    fireEvent.click(screen.getByRole('button', { name: 'Download QR' }));
    expect(createObjectURL).toHaveBeenCalledWith(expect.objectContaining({ type: 'image/svg+xml;charset=utf-8' }));
    expect(anchorClick).toHaveBeenCalledOnce();
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:campaign-qr');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);

    first.unmount();
    vi.mocked(loadBulkInviteCampaigns).mockResolvedValue([campaign]);
    renderAdmin();
    await screen.findByText('127 / 350 registrations');
    expect(screen.getByText('Allowed · limit 3')).not.toBeNull();
    expect(screen.queryByText(expectedUrl)).toBeNull();
    expect(screen.queryByText('IMPORTANT: Save this link or QR now.')).toBeNull();
  });

  test('submits a custom attendee referral policy with the exact Commercial UUID', async () => {
    await renderInvitesDashboard();
    const campaigns = screen.getByRole('region', { name: 'Bulk Invite Campaigns' });
    fireEvent.change(within(campaigns).getByLabelText('Label'), { target: { value: 'Custom policy' } });
    fireEvent.change(within(campaigns).getByLabelText('Maximum registrations'), { target: { value: '20' } });
    fireEvent.change(within(campaigns).getByLabelText('Trial days'), { target: { value: '4' } });
    fireEvent.change(within(campaigns).getByLabelText('Expires at'), { target: { value: '2026-11-01T12:00' } });
    fireEvent.click(within(campaigns).getByRole('checkbox', { name: 'Allow invitations for attendees' }));
    const limit = within(campaigns).getByLabelText('Active invitation limit per attendee') as HTMLInputElement;
    expect(limit.disabled).toBe(false);
    fireEvent.change(limit, { target: { value: '8' } });
    fireEvent.click(within(campaigns).getByRole('button', { name: 'Create campaign' }));
    await waitFor(() => expect(createBulkInviteCampaign).toHaveBeenCalledWith({
      expires_at: new Date('2026-11-01T12:00').toISOString(),
      label: 'Custom policy',
      max_registrations: 20,
      plan_id: commercialPlan.id,
      recipient_referral_limit: 8,
      recipient_referrals_enabled: false,
      trial_days: 4
    }));
  });

  test.each([
    ['missing', [plan]],
    ['inactive', [plan, { ...commercialPlan, active: false }]]
  ])('disables campaign creation when the Commercial plan is %s', async (_case, availablePlans) => {
    vi.mocked(loadPlans).mockResolvedValue(availablePlans);
    await renderInvitesDashboard();
    const campaigns = screen.getByRole('region', { name: 'Bulk Invite Campaigns' });
    expect((within(campaigns).getByRole('button', { name: 'Create campaign' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(campaigns).getByRole('alert').textContent).toContain('No eligible plan is available');
    expect(within(campaigns).queryByRole('combobox', { name: 'Campaign plan' })).toBeNull();
    expect(createBulkInviteCampaign).not.toHaveBeenCalled();
  });

  test('renders returned attendee referral policy truthfully', async () => {
    vi.mocked(loadBulkInviteCampaigns).mockResolvedValue([
      campaign,
      { ...campaign, campaign_id: 'campaign-disabled', label: 'No referrals', recipient_referrals_enabled: false }
    ]);
    await renderInvitesDashboard();
    expect(screen.getByText('Allowed · limit 3')).not.toBeNull();
    const disabled = screen.getByText('No referrals').closest('article')!;
    expect(within(disabled).getByText('Disabled')).not.toBeNull();
  });

  test('revokes only active campaigns after confirmation and offers no delete or terminal revoke actions', async () => {
    vi.mocked(loadBulkInviteCampaigns).mockResolvedValue([
      campaign,
      { ...campaign, campaign_id: 'campaign-full', label: 'Full campaign', state: 'full' },
      { ...campaign, campaign_id: 'campaign-expired', label: 'Expired campaign', state: 'expired' },
      { ...campaign, campaign_id: 'campaign-revoked', label: 'Revoked campaign', state: 'revoked' }
    ]);
    await renderInvitesDashboard();
    expect(await screen.findAllByRole('button', { name: 'Revoke' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: /Delete campaign/i })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke Conference 2026?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke campaign' }));
    await waitFor(() => expect(revokeBulkInviteCampaign).toHaveBeenCalledWith('campaign-1'));
  });
});

describe('admin area navigation', () => {
  test('root and unsupported hash routes replace-navigate to Users', async () => {
    window.history.replaceState(null, '', '/#/unsupported');
    renderAdmin();
    await waitFor(() => expect(window.location.hash).toBe('#/users'));
    expect((await screen.findByRole('link', { name: 'Users' })).getAttribute('aria-current')).toBe('page');
  });

  test('direct supported hashes and reload-equivalent renders retain the requested area', async () => {
    window.history.replaceState(null, '', '/#/invites');
    const first = renderAdmin();
    await screen.findByRole('region', { name: 'Invites' });
    expect(screen.getByRole('link', { name: 'Invites' }).getAttribute('aria-current')).toBe('page');
    first.unmount();
    const second = renderAdmin();
    await screen.findByRole('region', { name: 'Invites' });
    second.unmount();
    window.history.replaceState(null, '', '/#/connections');
    renderAdmin();
    await screen.findByRole('region', { name: 'Connections' });
  });

  test('unauthenticated direct hash survives session validation and successful login', async () => {
    window.history.replaceState(null, '', '/#/connections');
    vi.mocked(checkAdminSession).mockResolvedValue(false);
    renderAdmin();
    await screen.findByRole('heading', { name: 'Admin portal' });
    fireEvent.change(screen.getByLabelText('Admin secret'), { target: { value: 'a'.repeat(32) } });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));
    await screen.findByRole('region', { name: 'Connections' });
    expect(window.location.hash).toBe('#/connections');
  });

  test('area links push history entries and Back/Forward restores Admin areas', async () => {
    await renderDashboard();
    const initialLength = window.history.length;
    fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
    await waitFor(() => expect(window.location.hash).toBe('#/invites'));
    fireEvent.click(screen.getByRole('link', { name: 'Connections' }));
    await waitFor(() => expect(window.location.hash).toBe('#/connections'));
    expect(window.history.length).toBe(initialLength + 2);
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Invites' }).getAttribute('aria-current')).toBe('page'));
    act(() => window.history.back());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page'));
    act(() => window.history.forward());
    await waitFor(() => expect(screen.getByRole('link', { name: 'Invites' }).getAttribute('aria-current')).toBe('page'));
  });

  test('switches areas while preserving Invite-local form state', async () => {
    await renderDashboard();
    expect(screen.getByRole('region', { name: 'Users' })).not.toBeNull();
    expect(screen.queryByRole('region', { name: 'Invites' })).toBeNull();

    fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
    const email = within(screen.getByRole('region', { name: 'Invites' })).getByLabelText(/Email/);
    fireEvent.change(email, { target: { value: 'draft@example.test' } });
    fireEvent.click(screen.getByRole('link', { name: 'Connections' }));
    expect(await screen.findByRole('region', { name: 'Connections' })).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    expect(screen.getByRole('region', { name: 'Users' })).not.toBeNull();
    fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
    expect((email as HTMLInputElement).value).toBe('draft@example.test');
  });

  test('polls runtime data only while Connections is active', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderDashboard();
    expect(loadRuntimeConnections).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Connections' }));
    await waitFor(() => expect(loadRuntimeConnections).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadRuntimeConnections).toHaveBeenCalledTimes(2);

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadRuntimeConnections).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    await act(async () => { await vi.advanceTimersByTimeAsync(15000); });
    expect(loadRuntimeConnections).toHaveBeenCalledTimes(3);

    fireEvent.click(screen.getByRole('link', { name: 'Connections' }));
    await waitFor(() => expect(loadRuntimeConnections).toHaveBeenCalledTimes(4));

    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadRuntimeConnections).toHaveBeenCalledTimes(5);
  });

  test('polls invites only while Invites is active, cancels on leave, and resumes on return', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    let secondSignal: AbortSignal | undefined;
    vi.mocked(loadInvites).mockImplementation(async (_origins, signal) => {
      if (vi.mocked(loadInvites).mock.calls.length === 2) {
        secondSignal = signal;
        return new Promise(() => undefined);
      }
      return [invite];
    });
    await renderDashboard();
    expect(loadInvites).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
    await waitFor(() => expect(loadInvites).toHaveBeenCalledTimes(1));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadInvites).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('link', { name: 'Users' }));
    await waitFor(() => expect(secondSignal?.aborted).toBe(true));
    await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
    expect(loadInvites).toHaveBeenCalledTimes(2);

    fireEvent.click(screen.getByRole('link', { name: 'Invites' }));
    await waitFor(() => expect(loadInvites).toHaveBeenCalledTimes(3));
    await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
    expect(loadInvites).toHaveBeenCalledTimes(4);
  });
});

describe('users, limits, and retirement', () => {
  test('displays backend false/3 referral policy and submits toggle and limit atomically', async () => {
    const user = makeUser();
    await renderDashboard(user);
    expandUser(user.email);
    expect((screen.getByRole('checkbox', { name: 'Allow invitations' }) as HTMLInputElement).checked).toBe(false);
    expect((screen.getByLabelText(`Active invitation limit for ${user.email}`) as HTMLInputElement).value).toBe('3');
    fireEvent.click(screen.getByRole('checkbox', { name: 'Allow invitations' }));
    fireEvent.change(screen.getByLabelText(`Active invitation limit for ${user.email}`), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save referral policy' }));
    await waitFor(() => expect(updateReferralPolicy).toHaveBeenCalledWith(user.user_id, true, 0));
    expect(await screen.findByText('Referral policy saved.')).toBeTruthy();
  });
  test('disables referral-policy controls and cannot PATCH while user deletion is active', async () => {
    const user = makeUser(1, 1, undefined, '2026-09-22T10:00:00Z');
    await renderDashboard(user);
    expandUser(user.email);
    const toggle = screen.getByRole('checkbox', { name: 'Allow invitations' }) as HTMLInputElement;
    const limit = screen.getByLabelText(`Active invitation limit for ${user.email}`) as HTMLInputElement;
    const save = screen.getByRole('button', { name: 'Save referral policy' }) as HTMLButtonElement;
    expect(toggle.disabled).toBe(true);
    expect(limit.disabled).toBe(true);
    expect(save.disabled).toBe(true);
    fireEvent.click(toggle);
    fireEvent.change(limit, { target: { value: '0' } });
    fireEvent.click(save);
    expect(updateReferralPolicy).not.toHaveBeenCalled();
  });

  test('uses referral-specific fallback wording when policy update fails', async () => {
    vi.mocked(updateReferralPolicy).mockRejectedValue(new Error('network'));
    const user = makeUser();
    await renderDashboard(user);
    expandUser(user.email);
    fireEvent.click(screen.getByRole('button', { name: 'Save referral policy' }));
    expect((await screen.findAllByText('Unable to update the referral policy.')).length).toBeGreaterThan(0);
    expect(document.body.textContent).not.toContain('Unable to update the admin note.');
  });
  test('uses a bounded internal scroll area with a sticky column header', async () => {
    await renderDashboard();
    const list = screen.getByLabelText('Users list');
    const header = screen.getAllByRole('row')[0]!;
    expect(list.className).toContain('userListViewport');
    expect(header.className).toContain('userTableHeader');
    expect(screen.queryByRole('button', { name: /Page / })).toBeNull();
  });

  test('loads offset batches continuously and removes duplicate rows at a batch boundary', async () => {
    const firstBatch = Array.from({ length: 100 }, (_, index) => ({
      ...makeUser(), email: `user-${index}@example.test`, user_id: `user-${index}`
    }));
    const nextUser = { ...makeUser(), email: 'user-100@example.test', user_id: 'user-100' };
    vi.mocked(loadUsers).mockImplementation(async (options) => (
      !options.query ? [] : options.offset === 0 ? firstBatch : [firstBatch[99]!, nextUser]
    ));
    renderAdmin();
    await screen.findByRole('heading', { name: 'Operations admin' });
    expect(loadUsers).toHaveBeenNthCalledWith(1, {
      query: '', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal));
    fireEvent.change(screen.getByLabelText('Email or display name contains'), { target: { value: 'Studio team' } });
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Studio team', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    await screen.findByText('user-0@example.test');

    const list = screen.getByLabelText('Users list');
    await waitFor(() => expect(list.getAttribute('aria-busy')).toBe('false'));
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 2000 },
      scrollTop: { configurable: true, value: 1550 }
    });
    fireEvent.scroll(list);

    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Studio team', limit: 100, offset: 100, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    await screen.findByText('user-100@example.test');
    expect(screen.getAllByText('user-99@example.test')).toHaveLength(1);
    expect(screen.getByText('Loaded 101')).not.toBeNull();
  }, 20000);

  test('resets batching when server-side sort changes and sends exact sort parameters', async () => {
    vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('Email or display name contains'), { target: { value: 'Mitya' } });
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Mitya', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Email' }));
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Mitya', limit: 100, offset: 0, sortBy: 'email', sortDir: 'asc'
    }, expect.any(AbortSignal)));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Email' }));
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Mitya', limit: 100, offset: 0, sortBy: 'email', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    expect(screen.getByRole('button', { name: 'Sort by Email' }).closest('[role="columnheader"]')?.getAttribute('aria-sort')).toBe('descending');
  });

  test('maps every sortable desktop header to its exact backend field', async () => {
    vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
    await renderDashboard();
    const mappings = [
      ['Name', 'display_name', 'asc'],
      ['User since', 'created_at', 'desc'],
      ['Invite issued', 'invite_issued_at', 'asc'],
      ['Joined', 'invite_redeemed_at', 'asc'],
      ['Invited by', 'invited_by_label', 'asc']
    ] as const;
    for (const [label, field, direction] of mappings) {
      fireEvent.click(screen.getByRole('button', { name: `Sort by ${label}` }));
      await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
        query: '', limit: 100, offset: 0, sortBy: field, sortDir: direction
      }, expect.any(AbortSignal)));
    }
  });

  test('maps name, dates, and invite provenance from exact backend fields and keeps nulls neutral', async () => {
    const complete = makeUser();
    const empty: AdminUserSummary = {
      ...makeUser(),
      display_name: null,
      email: 'no-provenance@example.test',
      invite_issued_at: null,
      invite_redeemed_at: null,
      invited_by_campaign_id: null,
      invited_by_kind: null,
      invited_by_label: null,
      invited_by_origin: null,
      invited_by_user_id: null,
      registration_invite_id: null,
      user_id: 'user-no-provenance'
    };
    vi.mocked(loadUsers).mockResolvedValue([complete, empty]);
    renderAdmin();
    const firstEmail = await screen.findByText(complete.email);
    const firstSummary = firstEmail.closest('summary')!;
    expect(within(firstSummary).getByText('Mitya')).not.toBeNull();
    expect(within(firstSummary).getByText('Admin')).not.toBeNull();
    expect(within(firstSummary).getByText(new Date(complete.created_at).toLocaleString())).not.toBeNull();
    expect(within(firstSummary).getByText(new Date(complete.invite_issued_at!).toLocaleString())).not.toBeNull();
    expect(within(firstSummary).getByText(new Date(complete.invite_redeemed_at!).toLocaleString())).not.toBeNull();

    const emptySummary = (await screen.findByText(empty.email)).closest('summary')!;
    expect(within(emptySummary).getAllByText('—')).toHaveLength(4);
  });

  test('renders admin, user, and campaign provenance distinctly from invited_by_origin in rows and details', async () => {
    const adminOrigin = makeUser();
    const userOrigin: AdminUserSummary = {
      ...makeUser(), email: 'user-origin@example.test', invited_by_kind: 'user_referral',
      invited_by_label: 'Alice', invited_by_origin: 'user', invited_by_user_id: 'referrer-user', user_id: 'user-origin'
    };
    const campaignOrigin: AdminUserSummary = {
      ...makeUser(), email: 'campaign-origin@example.test', invited_by_campaign_id: 'campaign-uuid',
      invited_by_kind: 'system', invited_by_label: 'Test 1', invited_by_origin: 'campaign',
      invited_by_user_id: null, user_id: 'campaign-origin'
    };
    vi.mocked(loadUsers).mockResolvedValue([adminOrigin, userOrigin, campaignOrigin]);
    renderAdmin();

    const adminSummary = (await screen.findByText(adminOrigin.email)).closest('summary')!;
    const userSummary = (await screen.findByText(userOrigin.email)).closest('summary')!;
    const campaignSummary = (await screen.findByText(campaignOrigin.email)).closest('summary')!;
    expect(within(adminSummary).getByText('Admin')).not.toBeNull();
    expect(within(userSummary).getByText('User · Alice')).not.toBeNull();
    expect(within(campaignSummary).getByText('Campaign · Test 1')).not.toBeNull();
    expect(within(campaignSummary).queryByText('Test 1')).toBeNull();

    fireEvent.click(within(campaignSummary).getByText(campaignOrigin.email));
    const campaignCard = campaignSummary.closest('article')!;
    expect(within(campaignCard).getAllByText('Campaign · Test 1').length).toBeGreaterThanOrEqual(2);
    expect(within(campaignCard).queryByText('User · Test 1')).toBeNull();
  });

  test('loads, edits, saves, and clears a private admin note only in expanded details', async () => {
    await renderDashboard();
    const summary = screen.getByText('operator-target@example.test').closest('summary')!;
    expect(within(summary).queryByText('Customer prefers weekend support.')).toBeNull();
    expandUser();
    const note = screen.getByLabelText('Private admin note for operator-target@example.test');
    expect((note as HTMLTextAreaElement).value).toBe('Customer prefers weekend support.');
    fireEvent.change(note, { target: { value: 'Call before changing quota.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save note' }));
    await waitFor(() => expect(updateAdminNote).toHaveBeenCalledWith('user-1', 'Call before changing quota.'));
    await screen.findByText('Admin note saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Clear' }));
    await waitFor(() => expect(updateAdminNote).toHaveBeenLastCalledWith('user-1', null));
    expect((note as HTMLTextAreaElement).value).toBe('');
    await screen.findByText('Admin note cleared.');
  });

  test('renders one compact collapsed row per user and keeps disabled history closed', async () => {
    const first = makeUser(3, 1, [
      profile('profile-active', 'active', '10.253.1.10'),
      profile('profile-old', 'disabled', '10.253.1.99')
    ]);
    const secondProfile = { ...profile('profile-2', 'active', '10.253.1.20'), access_grant_id: 'grant-2' };
    const secondBase = makeUser(2, 1, [secondProfile]);
    const second: AdminUserSummary = {
      ...secondBase,
      email: 'second-user@example.test',
      grants: [{ ...secondBase.grants[0]!, id: 'grant-2' }],
      profiles: [secondProfile],
      user_id: 'user-2'
    };
    vi.mocked(loadUsers).mockResolvedValue([first, second]);
    renderAdmin();
    await screen.findByText(first.email);
    await screen.findByText(second.email);

    expect(screen.getByText('Configurations 1 / 3')).not.toBeNull();
    expect(screen.getByText('Configurations 1 / 2')).not.toBeNull();
    const firstDetails = screen.getByText(first.email).closest('details') as HTMLDetailsElement;
    expect(firstDetails.open).toBe(false);
    expect(screen.getAllByRole('button', { name: 'Set limit' })).toHaveLength(2);

    expandUser(first.email);
    expect(firstDetails.open).toBe(true);
    expect(screen.getAllByText('10.253.1.10').length).toBeGreaterThan(0);
    const history = screen.getByText('Disabled / retired protocol variants (1)');
    const historyDetails = history.closest('details') as HTMLDetailsElement;
    expect(historyDetails.open).toBe(false);
    fireEvent.click(history);
    expect(historyDetails.open).toBe(true);
    expect(screen.getByText('10.253.1.99')).not.toBeNull();
  });

  test('shows user-owned configuration labels in expanded admin details without edit controls', async () => {
    const labeled = { ...profile('profile-labeled', 'active', '10.253.1.42'), label: 'Studio computer' };
    await renderDashboard(makeUser(1, 1, [labeled]));
    expandUser();
    expect(screen.getByText('Configuration #1 · Studio computer')).not.toBeNull();
    expect(screen.queryByLabelText(/Connection name/)).toBeNull();
  });

  test('offers existing config links for active ready WG and AWG variants, without Admin QR', async () => {
    const active = profile('profile/active 1', 'active', '10.253.1.10');
    const provisioning = profile('profile-provisioning', 'provisioning', '10.253.1.11');
    const failed = profile('profile-failed', 'provisioning_failed', '10.253.1.14');
    const disabling = profile('profile-disabling', 'disabling', '10.253.1.15');
    const disabled = profile('profile-disabled', 'disabled', '10.253.1.12');
    const retired = profile('profile-retired', 'retired', '10.253.1.16');
    const nonWireGuard = { ...profile('profile-other', 'active', '10.253.1.13'), protocol: 'amneziawg' };
    await renderDashboard(makeUser(3, 2, [active, provisioning, failed, disabling, disabled, retired, nonWireGuard]));
    expandUser();
    const wg = screen.getByRole('link', { name: 'Download WireGuard config for profile profile/active 1' });
    const awg = screen.getByRole('link', { name: 'Download AmneziaWG config for profile profile/active 1-awg' });
    expect(wg.getAttribute('href')).toBe('/v2/admin/profiles/profile%2Factive%201/config');
    expect(awg.getAttribute('href')).toBe('/v2/admin/profiles/profile%2Factive%201-awg/config');
    expect((wg as HTMLAnchorElement).onclick).toBeNull();
    expect(screen.queryByRole('button', { name: /QR/i })).toBeNull();
  });

  test('debounces trimmed text search and removes the manual search controls', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    await renderDashboard();
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    const initialCalls = vi.mocked(loadUsers).mock.calls.length;
    const input = screen.getByLabelText('Email or display name contains');

    fireEvent.change(input, { target: { value: '  Mitya Studio  ' } });
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    expect(loadUsers).toHaveBeenCalledTimes(initialCalls);
    await act(async () => { await vi.advanceTimersByTimeAsync(50); });
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'Mitya Studio', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    await act(async () => { await vi.advanceTimersByTimeAsync(500); });
    expect(loadUsers).toHaveBeenCalledTimes(initialCalls + 1);
    expect(screen.queryByRole('button', { name: 'Search' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'List users' })).toBeNull();
  });

  test('aborts an older search and ignores its late result', async () => {
    let resolveOld!: (users: Array<AdminUserSummary>) => void;
    await renderDashboard();
    vi.mocked(loadUsers).mockImplementation(async (options, _signal) => {
      void _signal?.aborted;
      if (options.query === 'older') {
        return new Promise((resolve) => { resolveOld = resolve; });
      }
      if (options.query === 'newer') return [{ ...makeUser(), display_name: 'New Result', email: 'new@example.test', user_id: 'new-user' }];
      return [makeUser()];
    });
    const input = screen.getByLabelText('Email or display name contains');
    fireEvent.change(input, { target: { value: 'older' } });
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'older', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    const oldSignal = vi.mocked(loadUsers).mock.calls.at(-1)?.[1];
    fireEvent.change(input, { target: { value: 'newer' } });
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      query: 'newer', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    await screen.findByText('new@example.test');
    expect(oldSignal?.aborted).toBe(true);
    await act(async () => resolveOld([{ ...makeUser(), email: 'stale@example.test', user_id: 'stale-user' }]));
    expect(screen.queryByText('stale@example.test')).toBeNull();
    expect(screen.getByText('new@example.test')).not.toBeNull();
  });

  test('renders compact user rows and reveals technical identifiers only after expansion', async () => {
    await renderDashboard();
    expect(screen.getByText('Configurations 1 / 1')).not.toBeNull();
    expect((screen.getByText('operator-target@example.test').closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.change(screen.getByLabelText('Email or display name contains'), { target: { value: 'target@example.test' } });
    await waitFor(() => expect(loadUsers).toHaveBeenCalledWith({
      query: 'target@example.test', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }, expect.any(AbortSignal)));
    await screen.findByText('operator-target@example.test');
    expandUser();
    expect(screen.getAllByText('10.253.1.10').length).toBeGreaterThan(0);
    fireEvent.click(await screen.findByText('User details'));
    expect(screen.getByText('user-1')).not.toBeNull();
  });

  test('increases 1 to 2 with an explicit empty retirement list', async () => {
    await renderDashboard();
    expandUser();
    fireEvent.change(screen.getByLabelText('New configuration limit for grant grant-1'), { target: { value: '2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
    await waitFor(() => expect(setWireGuardLimit).toHaveBeenCalledWith('grant-1', 2, []));
  });

  test('requires exactly two eligible selections before lowering 3 to 1', async () => {
    const profiles = [
      profile('profile-1', 'active', '10.253.1.10'), profile('profile-2', 'provisioning', '10.253.1.11'),
      profile('profile-3', 'provisioning_failed', '10.253.1.12'), profile('profile-old', 'disabled', '10.253.1.99')
    ];
    const dialog = await openRetirement(makeUser(3, 3, profiles));
    expect(setWireGuardLimit).not.toHaveBeenCalled();
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(dialog).queryByText('10.253.1.99')).toBeNull();
    const confirm = within(dialog).getByRole('button', { name: 'Confirm retirement + set limit' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.10/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.11/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(setWireGuardLimit).toHaveBeenCalledWith('grant-1', 1, ['profile-1', 'profile-2']));
  });

  test('uses the AmneziaWG representative when a configuration has no WireGuard variant', async () => {
    const base = makeUser(1, 1);
    const awgOnly: AdminUserSummary = {
      ...base,
      configurations: [{
        ...base.configurations[0]!,
        variants: [base.configurations[0]!.variants[1]!]
      }]
    };
    const dialog = await openRetirement(awgOnly, 0);
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(1);
    fireEvent.click(within(dialog).getByRole('checkbox'));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm retirement + set limit' }));
    await waitFor(() => expect(setWireGuardLimit).toHaveBeenCalledWith('grant-1', 0, ['profile-1-awg']));
  });

  test('cancels retirement selection without submitting', async () => {
    const profiles = [profile('profile-1', 'active', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')];
    const dialog = await openRetirement(makeUser(2, 2, profiles));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await screen.findByText('Retirement selection cancelled.');
    expect(setWireGuardLimit).not.toHaveBeenCalled();
  });

  test('polls until common count, configuration disappearance, and representative disabled state agree', async () => {
    const initialProfiles = [profile('profile-1', 'active', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')];
    const initial = makeUser(2, 2, initialProfiles);
    const progressingBase = makeUser(1, 1, [profile('profile-1', 'disabling', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')]);
    const progressing = {
      ...progressingBase,
      configurations: progressingBase.configurations.filter((item) => item.configuration_id !== 'configuration-profile-1')
    };
    const terminal = makeUser(1, 1, [profile('profile-1', 'disabled', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')]);
    vi.mocked(loadUsers).mockResolvedValueOnce([initial]).mockResolvedValueOnce([progressing]).mockResolvedValueOnce([terminal]);
    vi.mocked(setWireGuardLimit).mockResolvedValue(limitResponse({
      profile_count: 2, profile_limit: 1, retire_profile_ids: ['profile-1'], retirement_in_progress: true
    }));
    const dialog = await openRetirement(initial);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.10/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm retirement + set limit' }));
    await screen.findByText(/Configuration retirement in progress for/);
    expect((screen.getByRole('button', { name: 'Set limit' }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText(/Configuration retirement completed for/, {}, { timeout: 5000 });
    expect(screen.queryByText('retirement in progress')).toBeNull();
    expect(screen.getByText('1 / 1')).not.toBeNull();
    const history = screen.getByText('Disabled / retired protocol variants (1)');
    expect((history.closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.click(history);
    expect(screen.getByText('disabled')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Set limit' }) as HTMLButtonElement).disabled).toBe(false);
    expect(loadUsers).toHaveBeenCalledTimes(3);
  }, 7000);
});

describe('user deletion lifecycle', () => {
  test('handles immediate deletion', async () => {
    await renderDashboard();
    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    await screen.findByText('User operator-target@example.test deleted.');
    expect(deleteUser).toHaveBeenCalledWith('user-1');
  });

  test('polls a deleting user until the account disappears', async () => {
    vi.mocked(deleteUser).mockResolvedValue(deleteResponse('deleting'));
    vi.mocked(loadUsers)
      .mockResolvedValueOnce([makeUser()])
      .mockResolvedValueOnce([makeUser(1, 1, undefined, '2026-01-02T00:00:00Z')])
      .mockResolvedValueOnce([]);
    await renderDashboard();
    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    await screen.findByText(/Deletion in progress for/);
    await screen.findByText('User operator-target@example.test deleted.', {}, { timeout: 5000 });
    expect(loadUsers).toHaveBeenCalledTimes(3);
  }, 7000);

  test('reports blocked legacy dependencies', async () => {
    vi.mocked(deleteUser).mockResolvedValue(deleteResponse('blocked_legacy_dependencies', 4));
    await renderDashboard();
    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    await screen.findByText('Deletion blocked by 4 legacy dependency row(s).');
  });

  test('prevents duplicate destructive deletion submissions', async () => {
    let resolveDelete!: (value: AdminUserDeleteResponse) => void;
    vi.mocked(deleteUser).mockReturnValue(new Promise((resolve) => { resolveDelete = resolve; }));
    await renderDashboard();
    const dialog = await openDeleteDialog();
    const confirm = within(dialog).getByRole('button', { name: 'Delete user' });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    expect(deleteUser).toHaveBeenCalledTimes(1);
    await act(async () => resolveDelete(deleteResponse('blocked_legacy_dependencies', 1)));
  });

  test('returns to login when a deletion refresh receives 401', async () => {
    vi.mocked(deleteUser).mockResolvedValue(deleteResponse('deleting'));
    vi.mocked(loadUsers).mockResolvedValueOnce([makeUser()]).mockRejectedValueOnce(new AdminApiError(401, 'Admin session expired.'));
    await renderDashboard();
    const dialog = await openDeleteDialog();
    fireEvent.click(within(dialog).getByRole('button', { name: 'Delete user' }));
    await screen.findByRole('heading', { name: 'Admin portal' });
    expect(screen.getByText('Admin session expired.')).not.toBeNull();
  });

  test('uses card controls at a narrow viewport without desktop tables', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 360 });
    window.dispatchEvent(new Event('resize'));
    await renderDashboard();
    expect(screen.queryByRole('table')).toBeNull();
    expandUser();
    expect(screen.getByRole('button', { name: 'Set limit' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Delete user' })).not.toBeNull();
  });
});

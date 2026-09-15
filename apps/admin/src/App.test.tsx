import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { HashRouter } from 'react-router';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminInviteSummary, AdminProtocolLimitUpdateResponse, AdminRuntimeConnectionsResponse, AdminUserDeleteResponse, AdminUserSummary, ConfigurationSummary, ProfileSummary } from '@wg-paid/api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import {
  AdminApiError, checkAdminSession, createInvite, deleteUser, loadInvites, loadPlans, loadRuntimeConnections, loadUsers,
  loginAdmin, logoutAdmin, resendAdminInvite, revokeInvite, setWireGuardLimit, updateAdminNote,
  updateInviteRecipient, updateInviteWireGuardLimit
} from './lib/adminApi';

vi.mock('./lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/adminApi')>();
  return {
    ...actual,
    checkAdminSession: vi.fn(), createInvite: vi.fn(), deleteUser: vi.fn(), loadInvites: vi.fn(),
    loadPlans: vi.fn(), loadRuntimeConnections: vi.fn(), loadUsers: vi.fn(), loginAdmin: vi.fn(), logoutAdmin: vi.fn(),
    resendAdminInvite: vi.fn(), revokeInvite: vi.fn(), setWireGuardLimit: vi.fn(), updateAdminNote: vi.fn(),
    updateInviteRecipient: vi.fn(), updateInviteWireGuardLimit: vi.fn()
  };
});

const plan = {
  active: true, code: 'standard', default_amneziawg_limit: 0, default_wireguard_limit: 2,
  display_name: 'Standard', id: 'plan-1'
};
const invite: AdminInviteSummary = {
  can_change_email: true, can_resend: true, can_revoke: true,
  created_by_kind: 'admin_secret', created_by_label: 'Admin', created_by_user_id: null,
  created_at: '2026-01-01T00:00:00Z', expires_at: '2026-02-01T00:00:00Z',
  intended_email: 'invitee@example.test', invite_id: 'invite-1', max_uses: 1, plan_id: 'plan-1',
  magic_link_expires_at: null, magic_link_sent_at: null, pending_email: null,
  resend_available_at: null, revoked_at: null, state: 'active', used_count: 0, wireguard_profile_limit: 2
};
const runtimeSnapshot: AdminRuntimeConnectionsResponse = {
  generated_at: '2026-09-12T10:00:00Z', received_at: '2026-09-12T10:00:01Z',
  rows: [], sample_interval_seconds: 5, snapshot_age_seconds: 1, stale: false,
  unmatched_runtime_rows_count: 0
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
    invited_by_kind: 'admin_secret', invited_by_label: 'Admin', invited_by_user_id: null,
    configurations: profiles.filter((item) => item.protocol === 'wireguard' && item.status !== 'disabled')
      .map((item, index) => configuration(item, index + 1)),
    profiles, registration_invite_id: 'invite-1',
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
  vi.mocked(loadPlans).mockResolvedValue([plan]);
  vi.mocked(loadInvites).mockResolvedValue([invite]);
  vi.mocked(loadRuntimeConnections).mockResolvedValue(runtimeSnapshot);
  vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
  vi.mocked(createInvite).mockResolvedValue({
    email_sent: false, expires_at: null, intended_email: null, invite_id: 'invite-new',
    invite_token: 'secret-invite-token', wireguard_profile_limit: 2
  });
  vi.mocked(resendAdminInvite).mockResolvedValue({ ...invite, state: 'awaiting_confirmation' });
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
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
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

  test('initializes the WireGuard snapshot from the selected plan and sends it explicitly', async () => {
    await renderInvitesDashboard();
    const createButton = screen.getByRole('button', { name: 'Create invite' });
    await waitFor(() => expect((createButton as HTMLButtonElement).disabled).toBe(false));
    expect((screen.getByLabelText('Number of WireGuard connections') as HTMLInputElement).value).toBe('2');
    fireEvent.click(createButton);
    await screen.findByText('Transferable invite created. Copy its registration URL for manual delivery.');
    expect(createInvite).toHaveBeenCalledWith({ intended_email: null, plan_id: 'plan-1', wireguard_profile_limit: 2 });
    expect(screen.getByText('https://access.secret-studio.ru/invite#token=secret-invite-token')).not.toBeNull();
  });

  test('resets the pending WireGuard snapshot to a newly selected plan default', async () => {
    vi.mocked(loadPlans).mockResolvedValue([plan, { ...plan, code: 'zero', default_wireguard_limit: 0, display_name: 'Zero', id: 'plan-2' }]);
    await renderInvitesDashboard();
    fireEvent.change(screen.getByLabelText('Number of WireGuard connections'), { target: { value: '7' } });
    fireEvent.change(screen.getByLabelText('Plan'), { target: { value: 'plan-2' } });
    expect((screen.getByLabelText('Number of WireGuard connections') as HTMLInputElement).value).toBe('0');
  });

  test('email mode reports confirmed delivery and never exposes its raw invite URL', async () => {
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: true, expires_at: null, intended_email: 'direct@example.test', invite_id: 'invite-direct',
      invite_token: 'must-not-be-visible', wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    fireEvent.change(within(screen.getByRole('region', { name: 'Invites' })).getByLabelText(/Email/), { target: { value: 'direct@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    expect((await screen.findAllByText('Invite created; registration email sent to direct@example.test.')).length).toBeGreaterThan(0);
    expect(createInvite).toHaveBeenCalledWith({ intended_email: 'direct@example.test', plan_id: 'plan-1', wireguard_profile_limit: 2 });
    expect(document.body.textContent).not.toContain('must-not-be-visible');
    expect(screen.queryByRole('button', { name: 'Copy invite invite-direct' })).toBeNull();
  });

  test('email mode keeps an undelivered invite visible and actionable without claiming success', async () => {
    vi.mocked(createInvite).mockResolvedValue({
      email_sent: false, expires_at: null, intended_email: 'retry@example.test', invite_id: 'invite-retry',
      invite_token: 'must-not-be-visible', wireguard_profile_limit: 2
    });
    await renderInvitesDashboard();
    fireEvent.change(within(screen.getByRole('region', { name: 'Invites' })).getByLabelText(/Email/), { target: { value: 'retry@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create invite' }));

    await screen.findByText('Invite exists, but delivery to retry@example.test was not confirmed. Use the operational invite actions below.');
    expect(screen.queryByText(/email sent to retry@example.test/i)).toBeNull();
    expect(screen.getByText('invite-retry')).not.toBeNull();
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

    const operational = screen.getByLabelText('Operational invites');
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

    fireEvent.click(screen.getByRole('button', { name: 'Change WireGuard limit' }));
    const limitDialog = await screen.findByRole('dialog', { name: 'Change pending WireGuard limit' });
    fireEvent.change(within(limitDialog).getByLabelText('Number of WireGuard connections'), { target: { value: '0' } });
    fireEvent.click(within(limitDialog).getByRole('button', { name: 'Save limit' }));
    await waitFor(() => expect(updateInviteWireGuardLimit).toHaveBeenCalledWith('invite-1', 0));

    fireEvent.click(screen.getByRole('button', { name: 'Revoke invite for invitee@example.test' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke invite?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke invite' }));
    await screen.findByText('Invite revoked.');
    expect(revokeInvite).toHaveBeenCalledWith('invite-1');
    await waitFor(() => expect(vi.mocked(loadInvites).mock.calls.length).toBeGreaterThan(initialLoads));
  });

  test('capability booleans control resend, recipient, and revoke actions', async () => {
    vi.mocked(loadInvites).mockResolvedValue([{ ...invite, can_change_email: false, can_resend: false, can_revoke: false }]);
    await renderInvitesDashboard();
    expect(screen.queryByRole('button', { name: 'Resend email' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Change recipient' })).toBeNull();
    expect(screen.queryByRole('button', { name: /Revoke invite/ })).toBeNull();
    expect(screen.getByRole('button', { name: 'Change WireGuard limit' })).not.toBeNull();
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
});

describe('admin area navigation', () => {
  test('root and unsupported hash routes replace-navigate to Users', async () => {
    window.history.replaceState(null, '', '/#/unsupported');
    renderAdmin();
    await waitFor(() => expect(window.location.hash).toBe('#/users'));
    expect(screen.getByRole('link', { name: 'Users' }).getAttribute('aria-current')).toBe('page');
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
});

describe('users, limits, and retirement', () => {
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
    vi.mocked(loadUsers)
      .mockResolvedValueOnce(firstBatch)
      .mockResolvedValueOnce([firstBatch[99]!, nextUser]);
    renderAdmin();
    await screen.findByText('user-0@example.test');
    expect(loadUsers).toHaveBeenNthCalledWith(1, {
      email: '', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    });

    const list = screen.getByLabelText('Users list');
    Object.defineProperties(list, {
      clientHeight: { configurable: true, value: 500 },
      scrollHeight: { configurable: true, value: 2000 },
      scrollTop: { configurable: true, value: 1550 }
    });
    fireEvent.scroll(list);

    await waitFor(() => expect(loadUsers).toHaveBeenNthCalledWith(2, {
      email: '', limit: 100, offset: 100, sortBy: 'created_at', sortDir: 'desc'
    }));
    await screen.findByText('user-100@example.test');
    expect(screen.getAllByText('user-99@example.test')).toHaveLength(1);
    expect(screen.getByText('Loaded 101')).not.toBeNull();
  }, 20000);

  test('resets batching when server-side sort changes and sends exact sort parameters', async () => {
    vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
    await renderDashboard();
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Email' }));
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      email: '', limit: 100, offset: 0, sortBy: 'email', sortDir: 'asc'
    }));
    fireEvent.click(screen.getByRole('button', { name: 'Sort by Email' }));
    await waitFor(() => expect(loadUsers).toHaveBeenLastCalledWith({
      email: '', limit: 100, offset: 0, sortBy: 'email', sortDir: 'desc'
    }));
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
        email: '', limit: 100, offset: 0, sortBy: field, sortDir: direction
      }));
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
      invited_by_kind: null,
      invited_by_label: null,
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

  test('clears transient loading status after Search and List users complete', async () => {
    let resolveSearch!: (users: Array<AdminUserSummary>) => void;
    let resolveList!: (users: Array<AdminUserSummary>) => void;
    vi.mocked(loadUsers)
      .mockResolvedValueOnce([makeUser()])
      .mockReturnValueOnce(new Promise((resolve) => { resolveSearch = resolve; }))
      .mockReturnValueOnce(new Promise((resolve) => { resolveList = resolve; }));
    await renderDashboard();

    fireEvent.change(screen.getByLabelText('Email contains or exact'), { target: { value: 'target@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    expect(await screen.findByText('Loading users…')).not.toBeNull();
    await act(async () => resolveSearch([makeUser()]));
    await screen.findByText('Loaded 1 user(s).');
    expect(screen.queryByText('Loading users…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'List users' }));
    expect(await screen.findByText('Loading users…')).not.toBeNull();
    await act(async () => resolveList([]));
    await screen.findByText('No users found.');
    expect(screen.queryByText('Loading users…')).toBeNull();
  });

  test('renders compact user rows and reveals technical identifiers only after expansion', async () => {
    await renderDashboard();
    expect(screen.getByText('Configurations 1 / 1')).not.toBeNull();
    expect((screen.getByText('operator-target@example.test').closest('details') as HTMLDetailsElement).open).toBe(false);
    fireEvent.change(screen.getByLabelText('Email contains or exact'), { target: { value: 'target@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(loadUsers).toHaveBeenCalledWith({
      email: 'target@example.test', limit: 100, offset: 0, sortBy: 'created_at', sortDir: 'desc'
    }));
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

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { AdminProtocolLimitUpdateResponse, AdminUserDeleteResponse, AdminUserSummary, ProfileSummary } from '@wg-paid/api';
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { App } from './App';
import {
  AdminApiError, checkAdminSession, createInvite, deleteUser, loadInvites, loadPlans, loadUsers,
  loginAdmin, logoutAdmin, revokeInvite, setWireGuardLimit
} from './lib/adminApi';

vi.mock('./lib/adminApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./lib/adminApi')>();
  return {
    ...actual,
    checkAdminSession: vi.fn(), createInvite: vi.fn(), deleteUser: vi.fn(), loadInvites: vi.fn(),
    loadPlans: vi.fn(), loadUsers: vi.fn(), loginAdmin: vi.fn(), logoutAdmin: vi.fn(),
    revokeInvite: vi.fn(), setWireGuardLimit: vi.fn()
  };
});

const plan = {
  active: true, code: 'standard', default_amneziawg_limit: 0, default_wireguard_limit: 2,
  display_name: 'Standard', id: 'plan-1'
};
const invite = {
  created_at: '2026-01-01T00:00:00Z', expires_at: '2026-02-01T00:00:00Z',
  intended_email: 'invitee@example.test', invite_id: 'invite-1', max_uses: 1, plan_id: 'plan-1',
  revoked_at: null, state: 'active', used_count: 0
};

function profile(id: string, status: string, tunnelIp: string): ProfileSummary {
  return {
    access_grant_id: 'grant-1', created_at: '2026-01-01T00:00:00Z', id, label: null,
    protocol: 'wireguard', status, tunnel_ip: tunnelIp, updated_at: '2026-01-01T00:00:00Z'
  };
}

function makeUser(
  profileLimit = 1,
  profileCount = 1,
  profiles: Array<ProfileSummary> = [profile('profile-1', 'active', '10.253.1.10')],
  deletionRequestedAt: string | null = null
): AdminUserSummary {
  return {
    created_at: '2026-01-01T00:00:00Z', deletion_requested_at: deletionRequestedAt,
    email: 'operator-target@example.test', email_verified_at: '2026-01-01T01:00:00Z',
    grants: [{
      id: 'grant-1', plan_id: 'plan-1',
      protocol_limits: [{ can_create: profileCount < profileLimit, profile_count: profileCount, profile_limit: profileLimit, protocol: 'wireguard' }],
      status: 'active', valid_until: null
    }],
    profiles,
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
  return { queryClient, ...render(<QueryClientProvider client={queryClient}><App /></QueryClientProvider>) };
}

async function renderDashboard(user: AdminUserSummary | null = makeUser()) {
  vi.mocked(loadUsers).mockResolvedValue(user ? [user] : []);
  renderAdmin();
  await screen.findByRole('heading', { name: 'Operations admin' });
  if (user) await screen.findByText(user.email);
}

async function openRetirement(user: AdminUserSummary, newLimit = 1) {
  await renderDashboard(user);
  fireEvent.change(screen.getByLabelText('New WireGuard limit for grant grant-1'), { target: { value: String(newLimit) } });
  fireEvent.click(screen.getByRole('button', { name: 'Set limit' }));
  return screen.findByRole('dialog', { name: 'Select connections to retire' });
}

async function openDeleteDialog() {
  fireEvent.click(screen.getByRole('button', { name: 'Delete user' }));
  return screen.findByRole('dialog', { name: /Delete operator-target@example\.test/ });
}

beforeEach(() => {
  vi.mocked(checkAdminSession).mockResolvedValue(true);
  vi.mocked(loginAdmin).mockResolvedValue();
  vi.mocked(logoutAdmin).mockResolvedValue();
  vi.mocked(loadPlans).mockResolvedValue([plan]);
  vi.mocked(loadInvites).mockResolvedValue([invite]);
  vi.mocked(loadUsers).mockResolvedValue([makeUser()]);
  vi.mocked(createInvite).mockResolvedValue({ expires_at: null, invite_id: 'invite-new', invite_token: 'secret-invite-token' });
  vi.mocked(revokeInvite).mockResolvedValue({ ...invite, state: 'revoked', revoked_at: '2026-01-02T00:00:00Z' });
  vi.mocked(setWireGuardLimit).mockResolvedValue(limitResponse());
  vi.mocked(deleteUser).mockResolvedValue(deleteResponse('deleted'));
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

  test('creates an invite URL and revokes an active invite through confirmation', async () => {
    await renderDashboard();
    const createButton = screen.getByRole('button', { name: 'Create invite' });
    await waitFor(() => expect((createButton as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(createButton);
    await screen.findByText('Invite created.');
    expect(createInvite).toHaveBeenCalledWith({ intended_email: null, plan_id: 'plan-1' });
    expect(screen.getByText('https://access.secret-studio.ru/invite#token=secret-invite-token')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
    const dialog = await screen.findByRole('dialog', { name: 'Revoke invite?' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Revoke invite' }));
    await screen.findByText('Invite revoked.');
    expect(revokeInvite).toHaveBeenCalledWith('invite-1');
  });
});

describe('users, limits, and retirement', () => {
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
    await screen.findByText('1 user(s).');
    expect(screen.queryByText('Loading users…')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'List users' }));
    expect(await screen.findByText('Loading users…')).not.toBeNull();
    await act(async () => resolveList([]));
    await screen.findByText('No users found.');
    expect(screen.queryByText('Loading users…')).toBeNull();
  });

  test('renders searchable users with secondary technical identifiers', async () => {
    await renderDashboard();
    expect(screen.getByText('10.253.1.10')).not.toBeNull();
    fireEvent.change(screen.getByLabelText('Email contains or exact'), { target: { value: 'target@example.test' } });
    fireEvent.click(screen.getByRole('button', { name: 'Search' }));
    await waitFor(() => expect(loadUsers).toHaveBeenCalledWith('target@example.test'));
    fireEvent.click(await screen.findByText('User details'));
    expect(screen.getByText('user-1')).not.toBeNull();
  });

  test('increases 1 to 2 with an explicit empty retirement list', async () => {
    await renderDashboard();
    fireEvent.change(screen.getByLabelText('New WireGuard limit for grant grant-1'), { target: { value: '2' } });
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
    expect(within(dialog).getAllByRole('checkbox')).toHaveLength(4);
    expect((within(dialog).getByRole('checkbox', { name: /10\.253\.1\.99/ }) as HTMLInputElement).disabled).toBe(true);
    const confirm = within(dialog).getByRole('button', { name: 'Confirm retirement + set limit' });
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.10/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.11/ }));
    expect((confirm as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(confirm);
    await waitFor(() => expect(setWireGuardLimit).toHaveBeenCalledWith('grant-1', 1, ['profile-1', 'profile-2']));
  });

  test('cancels retirement selection without submitting', async () => {
    const profiles = [profile('profile-1', 'active', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')];
    const dialog = await openRetirement(makeUser(2, 2, profiles));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await screen.findByText('Retirement selection cancelled.');
    expect(setWireGuardLimit).not.toHaveBeenCalled();
  });

  test('polls while profiles consume quota, then renders terminal state and unlocks controls', async () => {
    const initialProfiles = [profile('profile-1', 'active', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')];
    const initial = makeUser(2, 2, initialProfiles);
    const progressing = makeUser(1, 2, [profile('profile-1', 'disabling', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')]);
    const terminal = makeUser(1, 1, [profile('profile-1', 'disabled', '10.253.1.10'), profile('profile-2', 'active', '10.253.1.11')]);
    vi.mocked(loadUsers).mockResolvedValueOnce([initial]).mockResolvedValueOnce([progressing]).mockResolvedValueOnce([terminal]);
    vi.mocked(setWireGuardLimit).mockResolvedValue(limitResponse({
      profile_count: 2, profile_limit: 1, retire_profile_ids: ['profile-1'], retirement_in_progress: true
    }));
    const dialog = await openRetirement(initial);
    fireEvent.click(within(dialog).getByRole('checkbox', { name: /10\.253\.1\.10/ }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm retirement + set limit' }));
    await screen.findByText(/Profile retirement in progress for/);
    expect((screen.getByRole('button', { name: 'Set limit' }) as HTMLButtonElement).disabled).toBe(true);
    await screen.findByText(/Profile retirement completed for/, {}, { timeout: 5000 });
    expect(screen.queryByText('retirement in progress')).toBeNull();
    expect(screen.getByText('1 / 1')).not.toBeNull();
    expect(screen.getByText('disabled')).not.toBeNull();
    expect((screen.getByRole('button', { name: 'Set limit' }) as HTMLButtonElement).disabled).toBe(false);
    expect(loadUsers).toHaveBeenCalledTimes(3);
  }, 7000);
});

describe('user deletion lifecycle', () => {
  test('handles immediate deletion', async () => {
    vi.mocked(loadUsers).mockResolvedValueOnce([makeUser()]).mockResolvedValueOnce([]);
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
    expect(screen.getByRole('button', { name: 'Set limit' })).not.toBeNull();
    expect(screen.getByRole('button', { name: 'Delete user' })).not.toBeNull();
  });
});

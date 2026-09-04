import { afterEach, describe, expect, test, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  createInvite: vi.fn(), deleteUser: vi.fn(), listInvites: vi.fn(), listPlans: vi.fn(), listUsers: vi.fn(),
  login: vi.fn(), logout: vi.fn(), revokeInvite: vi.fn(), session: vi.fn(), setLimit: vi.fn(), updateUser: vi.fn()
}));

vi.mock('@wg-paid/api', () => ({
  adminCreateInviteV2AdminInvitesPost: sdk.createInvite,
  adminDeleteUserV2AdminUsersUserIdDelete: sdk.deleteUser,
  adminListInvitesV2AdminInvitesGet: sdk.listInvites,
  adminListPlansV2AdminPlansGet: sdk.listPlans,
  adminListUsersV2AdminUsersGet: sdk.listUsers,
  adminRevokeInviteV2AdminInvitesInviteIdRevokePost: sdk.revokeInvite,
  adminSessionLoginV2AdminSessionLoginPost: sdk.login,
  adminSessionLogoutV2AdminSessionLogoutPost: sdk.logout,
  adminSessionStatusV2AdminSessionGet: sdk.session,
  adminSetProtocolLimitV2AdminGrantsGrantIdProtocolLimitsProtocolPut: sdk.setLimit,
  adminUpdateUserMetadataV2AdminUsersUserIdPatch: sdk.updateUser
}));

import { getAdminCsrfHeaders, loadUsers, updateAdminNote } from './adminApi';

afterEach(() => {
  document.cookie = 'wg_admin_csrf=; Max-Age=0; Path=/';
  vi.clearAllMocks();
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

  test('maps offset and authoritative sorting to the generated users query', async () => {
    sdk.listUsers.mockResolvedValue({ data: [], response: new Response(null, { status: 200 }) });
    await loadUsers({ email: 'person@example.test', limit: 100, offset: 200, sortBy: 'invited_by_label', sortDir: 'asc' });
    expect(sdk.listUsers).toHaveBeenCalledWith({
      credentials: 'same-origin',
      query: {
        email: 'person@example.test', limit: 100, offset: 200, sort_by: 'invited_by_label', sort_dir: 'asc'
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
});

import {
  adminCreateInviteV2AdminInvitesPost,
  adminDeleteUserV2AdminUsersUserIdDelete,
  adminListInvitesV2AdminInvitesGet,
  adminListPlansV2AdminPlansGet,
  adminListUsersV2AdminUsersGet,
  adminRuntimeConnectionsV2AdminRuntimeConnectionsGet,
  adminResendInviteV2AdminInvitesInviteIdResendPost,
  adminRevokeInviteV2AdminInvitesInviteIdRevokePost,
  adminSessionLoginV2AdminSessionLoginPost,
  adminSessionLogoutV2AdminSessionLogoutPost,
  adminSessionStatusV2AdminSessionGet,
  adminSetProtocolLimitV2AdminGrantsGrantIdProtocolLimitsProtocolPut,
  adminUpdateInviteRecipientV2AdminInvitesInviteIdRecipientPatch,
  adminUpdateInviteWireguardLimitV2AdminInvitesInviteIdWireguardLimitPatch,
  adminUpdateUserMetadataV2AdminUsersUserIdPatch,
  type AdminInviteRequest,
  type AdminInviteResponse,
  type AdminInviteSummary,
  type AdminPlanSummary,
  type AdminProtocolLimitUpdateResponse,
  type AdminRuntimeConnectionsResponse,
  type AdminListUsersV2AdminUsersGetData,
  type AdminUserDeleteResponse,
  type AdminUserMetadataUpdateResponse,
  type AdminUserSummary
} from '@wg-paid/api';

const csrfCookieName = 'wg_admin_csrf';

export class AdminApiError extends Error {
  status: number | undefined;

  constructor(status?: number, message?: string) {
    super(message ?? (status ? `Admin API request failed with status ${status}` : 'Admin API request failed'));
    this.name = 'AdminApiError';
    this.status = status;
  }
}

export function isUnauthorized(error: unknown): error is AdminApiError {
  return error instanceof AdminApiError && error.status === 401;
}

export function getAdminCsrfHeaders(cookie = document.cookie): Record<string, string> | undefined {
  const prefix = `${csrfCookieName}=`;
  const encodedToken = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);
  if (!encodedToken) return undefined;
  try {
    return { 'x-admin-csrf-token': decodeURIComponent(encodedToken) };
  } catch {
    return { 'x-admin-csrf-token': encodedToken };
  }
}

const requestOptions = (signal?: AbortSignal) => ({
  credentials: 'same-origin' as const,
  ...(signal ? { signal } : {})
});
const mutationOptions = () => ({ ...requestOptions(), headers: getAdminCsrfHeaders() });

interface ApiResult<T> {
  data?: T;
  error?: unknown;
  response?: Response;
}

function errorDetail(error: unknown, fallback?: string) {
  if (error && typeof error === 'object' && 'detail' in error) {
    const detail = (error as { detail?: unknown }).detail;
    if (typeof detail === 'string' && detail.length <= 500) return detail;
  }
  return fallback;
}

function requireData<T>(result: ApiResult<T>, fallback?: string): T {
  if (result.response?.ok && result.data !== undefined) return result.data;
  throw new AdminApiError(result.response?.status, errorDetail(result.error, fallback));
}

function requireSuccess(result: ApiResult<unknown>, fallback?: string) {
  if (result.response?.ok) return;
  throw new AdminApiError(result.response?.status, errorDetail(result.error, fallback));
}

export async function checkAdminSession() {
  const result = await adminSessionStatusV2AdminSessionGet(requestOptions());
  if (result.response?.status === 401) return false;
  requireSuccess(result, 'Unable to check the admin session.');
  return true;
}

export async function loginAdmin(token: string) {
  const result = await adminSessionLoginV2AdminSessionLoginPost({ ...requestOptions(), body: { token } });
  requireSuccess(result, result.response?.status === 401 ? 'Invalid admin secret.' : 'Unable to sign in.');
}

export async function logoutAdmin() {
  requireSuccess(await adminSessionLogoutV2AdminSessionLogoutPost(mutationOptions()), 'Unable to sign out.');
}

export async function loadPlans(): Promise<Array<AdminPlanSummary>> {
  return requireData(await adminListPlansV2AdminPlansGet(requestOptions()), 'Unable to load plans.');
}

export async function loadInvites(): Promise<Array<AdminInviteSummary>> {
  return requireData(await adminListInvitesV2AdminInvitesGet(requestOptions()), 'Unable to load invites.');
}

export async function loadRuntimeConnections(signal?: AbortSignal): Promise<AdminRuntimeConnectionsResponse> {
  return requireData(
    await adminRuntimeConnectionsV2AdminRuntimeConnectionsGet(requestOptions(signal)),
    'Unable to load runtime connections.'
  );
}

export function adminProfileConfigUrl(profileId: string) {
  return `/v2/admin/profiles/${encodeURIComponent(profileId)}/config`;
}

export async function createInvite(body: AdminInviteRequest): Promise<AdminInviteResponse> {
  return requireData(await adminCreateInviteV2AdminInvitesPost({ ...mutationOptions(), body }), 'Unable to create invite.');
}

export async function revokeInvite(inviteId: string): Promise<AdminInviteSummary> {
  return requireData(await adminRevokeInviteV2AdminInvitesInviteIdRevokePost({
    ...mutationOptions(),
    path: { invite_id: inviteId }
  }), 'Unable to revoke invite.');
}

export async function resendAdminInvite(inviteId: string): Promise<AdminInviteSummary> {
  return requireData(await adminResendInviteV2AdminInvitesInviteIdResendPost({
    ...mutationOptions(),
    path: { invite_id: inviteId }
  }), 'Unable to resend the registration email.');
}

export async function updateInviteRecipient(inviteId: string, email: string | null): Promise<AdminInviteSummary> {
  return requireData(await adminUpdateInviteRecipientV2AdminInvitesInviteIdRecipientPatch({
    ...mutationOptions(),
    body: { email },
    path: { invite_id: inviteId }
  }), 'Unable to change the invite recipient.');
}

export async function updateInviteWireGuardLimit(inviteId: string, profileLimit: number): Promise<AdminInviteSummary> {
  return requireData(await adminUpdateInviteWireguardLimitV2AdminInvitesInviteIdWireguardLimitPatch({
    ...mutationOptions(),
    body: { profile_limit: profileLimit },
    path: { invite_id: inviteId }
  }), 'Unable to change the invite WireGuard limit.');
}

type AdminUserListQuery = NonNullable<AdminListUsersV2AdminUsersGetData['query']>;
export type AdminUserSortBy = NonNullable<AdminUserListQuery['sort_by']>;
export type AdminUserSortDir = NonNullable<AdminUserListQuery['sort_dir']>;

export interface LoadUsersOptions {
  email?: string;
  limit: number;
  offset: number;
  sortBy: AdminUserSortBy;
  sortDir: AdminUserSortDir;
}

export async function loadUsers({ email = '', limit, offset, sortBy, sortDir }: LoadUsersOptions): Promise<Array<AdminUserSummary>> {
  return requireData(await adminListUsersV2AdminUsersGet({
    ...requestOptions(),
    query: {
      ...(email ? { email } : {}),
      limit,
      offset,
      sort_by: sortBy,
      sort_dir: sortDir
    }
  }), 'Unable to load users.');
}

export async function updateAdminNote(userId: string, adminNote: string | null): Promise<AdminUserMetadataUpdateResponse> {
  return requireData(await adminUpdateUserMetadataV2AdminUsersUserIdPatch({
    ...mutationOptions(),
    body: { admin_note: adminNote },
    path: { user_id: userId }
  }), 'Unable to update the admin note.');
}

export async function setWireGuardLimit(
  grantId: string,
  profileLimit: number,
  retireProfileIds: Array<string>
): Promise<AdminProtocolLimitUpdateResponse> {
  return requireData(await adminSetProtocolLimitV2AdminGrantsGrantIdProtocolLimitsProtocolPut({
    ...mutationOptions(),
    body: { profile_limit: profileLimit, retire_profile_ids: retireProfileIds },
    path: { grant_id: grantId, protocol: 'wireguard' }
  }), 'Unable to update profile limit.');
}

export async function deleteUser(userId: string): Promise<AdminUserDeleteResponse> {
  return requireData(await adminDeleteUserV2AdminUsersUserIdDelete({
    ...mutationOptions(),
    path: { user_id: userId }
  }), 'Unable to delete user.');
}

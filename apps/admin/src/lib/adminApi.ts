import {
  historyV2AdminBroadcastsGet,
  draftV2AdminBroadcastsPost,
  previewV2AdminBroadcastsPreviewPost,
  detailV2AdminBroadcastsCampaignIdGet,
  pauseV2AdminBroadcastsCampaignIdPausePost,
  resumeV2AdminBroadcastsCampaignIdResumePost,
  sendV2AdminBroadcastsCampaignIdSendPost,
  testSendV2AdminBroadcastsCampaignIdTestPost
} from '@wg-paid/api/broadcasts';
import { client } from '@wg-paid/api/client';
import {
  type BroadcastCompose,
  adminMonitoringSummaryV2AdminMonitoringSummaryGet,
  adminMonitoringEventsV2AdminMonitoringEventsGet,
  adminMonitoringCapacityV2AdminMonitoringCapacityGet,
  adminCreateBulkInviteV2AdminBulkInvitesPost,
  adminCreateInviteV2AdminInvitesPost,
  adminDeleteUserV2AdminUsersUserIdDelete,
  adminListBulkInvitesV2AdminBulkInvitesGet,
  adminListInvitesV2AdminInvitesGet,
  adminListPlansV2AdminPlansGet,
  adminListUsersV2AdminUsersGet,
  adminInvitationSourcesV2AdminInvitationSourcesGet,
  adminReissueInviteShareTokenV2AdminInvitesInviteIdShareTokenReissuePost,
  adminReviewAccessV2AdminReviewAccessPost,
  adminReviewAccessResetV2AdminReviewAccessResetPost,
  adminRuntimeConnectionsV2AdminRuntimeConnectionsGet,
  adminResendInviteV2AdminInvitesInviteIdResendPost,
  adminRevokeBulkInviteV2AdminBulkInvitesCampaignIdRevokePost,
  adminRevokeInviteV2AdminInvitesInviteIdRevokePost,
  adminSessionLoginV2AdminSessionLoginPost,
  adminSessionLogoutV2AdminSessionLogoutPost,
  adminSessionStatusV2AdminSessionGet,
  adminSetProtocolLimitV2AdminGrantsGrantIdProtocolLimitsProtocolPut,
  adminUpdateInviteRecipientV2AdminInvitesInviteIdRecipientPatch,
  adminUpdateInviteWireguardLimitV2AdminInvitesInviteIdWireguardLimitPatch,
  adminUpdateUserMetadataV2AdminUsersUserIdPatch,
  adminUpdateUserReferralPolicyV2AdminUsersUserIdReferralPolicyPatch,
  type AdminBulkInviteCreateRequest,
  type AdminBulkInviteCreateResponse,
  type AdminBulkInviteSummary,
  type AdminInviteRequest,
  type AdminInviteResponse,
  type AdminInviteShareTokenResponse,
  type AdminInviteSummary,
  type AdminListInvitesV2AdminInvitesGetData,
  type AdminPlanSummary,
  type AdminProtocolLimitUpdateResponse,
  type AdminRuntimeConnectionsResponse,
  type AdminReviewAccessResponse,
  type AdminReviewResetResponse,
  type AdminListUsersV2AdminUsersGetData,
  type AdminUserDeleteResponse,
  type AdminUserMetadataUpdateResponse,
  type AdminUserReferralPolicyResponse,
  type AdminInvitationSourceOption,
  type AdminInvitationSourcesV2AdminInvitationSourcesGetData,
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
const mutationOptions = (signal?: AbortSignal) => ({ ...requestOptions(signal), headers: getAdminCsrfHeaders() });

export async function loadBroadcasts(signal?: AbortSignal) {
  return requireData(await historyV2AdminBroadcastsGet({ ...requestOptions(signal), query: { limit: 100 } }));
}

export async function loadBroadcast(campaignId: string, signal?: AbortSignal) {
  return requireData(await detailV2AdminBroadcastsCampaignIdGet({ ...requestOptions(signal), path: { campaign_id: campaignId } }));
}

export async function previewBroadcast(body: BroadcastCompose) {
  return requireData(await previewV2AdminBroadcastsPreviewPost({ ...mutationOptions(), body }));
}

export async function createBroadcast(body: BroadcastCompose) {
  return requireData(await draftV2AdminBroadcastsPost({ ...mutationOptions(), body }));
}

export async function testBroadcast(campaignId: string) {
  // The contract deliberately leaves the response untyped. Only HTTP success is consumed.
  requireSuccess(await testSendV2AdminBroadcastsCampaignIdTestPost({ ...mutationOptions(), path: { campaign_id: campaignId } }));
}

export async function sendBroadcast(campaignId: string, recipientCount: number) {
  return requireData(await sendV2AdminBroadcastsCampaignIdSendPost({
    ...mutationOptions(), path: { campaign_id: campaignId }, body: { confirmed_recipient_count: recipientCount }
  }));
}

export async function pauseBroadcast(campaignId: string) {
  return requireData(await pauseV2AdminBroadcastsCampaignIdPausePost({ ...mutationOptions(), path: { campaign_id: campaignId } }));
}

export async function resumeBroadcast(campaignId: string) {
  return requireData(await resumeV2AdminBroadcastsCampaignIdResumePost({ ...mutationOptions(), path: { campaign_id: campaignId } }));
}

export async function loadMonitoringSummary(windowHours: 24 | 168, signal?: AbortSignal) {
  return requireData(await adminMonitoringSummaryV2AdminMonitoringSummaryGet({
    ...requestOptions(signal), query: { window_hours: windowHours }
  }));
}

export async function loadMonitoringEvents(windowHours: 24 | 168, offset: number, signal?: AbortSignal) {
  if (!Number.isInteger(offset) || offset < 0 || offset > 5000 || offset % 50 !== 0) throw new RangeError('Invalid events offset');
  return requireData(await adminMonitoringEventsV2AdminMonitoringEventsGet({
    ...requestOptions(signal), query: { window_hours: windowHours, limit: 50, offset }
  }));
}

export async function loadMonitoringCapacity(signal?: AbortSignal) {
  return requireData(await adminMonitoringCapacityV2AdminMonitoringCapacityGet(requestOptions(signal)));
}

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

const diagnosticsUrl = '/v2/admin/diagnostics';
const diagnosticStates = ['queued', 'running', 'ready', 'partial', 'failed', 'expired'] as const;
type DiagnosticState = typeof diagnosticStates[number];

export function isDiagnosticId(value: unknown): value is string {
  return typeof value === 'string' && /^[\da-f]{8}(?:-[\da-f]{4}){3}-[\da-f]{12}$/i.test(value);
}

function isDiagnosticState(value: unknown): value is DiagnosticState {
  return diagnosticStates.some((state) => state === value);
}

// Project the fields used by the UI from the frozen B4D R07 contract.
// The pinned generated SDK has no Diagnostics operations yet.
function diagnosticJob(data: unknown, expectedId?: string) {
  if (!data || typeof data !== 'object' ||
      !('request_id' in data) || !isDiagnosticId(data.request_id) ||
      (expectedId && data.request_id !== expectedId) ||
      !('state' in data) || !isDiagnosticState(data.state) ||
      !('created_at' in data) || typeof data.created_at !== 'string' ||
      !('expires_at' in data) || typeof data.expires_at !== 'string') {
    throw new AdminApiError();
  }
  const createdAt = Date.parse(data.created_at);
  const expiresAt = Date.parse(data.expires_at);
  if (!Number.isFinite(createdAt) || !Number.isFinite(expiresAt)) throw new AdminApiError();
  return {
    id: data.request_id,
    state: data.state,
    createdAt,
    expiresAt,
    errorCode: 'error_code' in data && typeof data.error_code === 'string' ? data.error_code : null
  };
}

export type DiagnosticJob = ReturnType<typeof diagnosticJob>;

export async function createDiagnostic(signal: AbortSignal) {
  const result = await client.post({
    ...mutationOptions(signal), url: diagnosticsUrl, cache: 'no-store', redirect: 'error', parseAs: 'json'
  });
  const data = requireData(result);
  if (result.response?.status !== 200 && result.response?.status !== 202) throw new AdminApiError();
  return diagnosticJob(data);
}

export async function loadDiagnostic(id: string, signal: AbortSignal) {
  const result = await client.get({
    ...requestOptions(signal), url: `${diagnosticsUrl}/{id}`, path: { id },
    cache: 'no-store', redirect: 'error', parseAs: 'json'
  });
  return diagnosticJob(requireData(result), id);
}

export async function downloadDiagnostic(id: string, signal: AbortSignal) {
  const result = await client.get({
    ...requestOptions(signal), url: `${diagnosticsUrl}/{id}/download`, path: { id },
    cache: 'no-store', redirect: 'error', parseAs: 'blob'
  });
  const blob = requireData(result);
  if (!(blob instanceof Blob) || blob.type !== 'application/zip' || blob.size === 0) throw new AdminApiError();
  const disposition = result.response?.headers.get('Content-Disposition') ?? '';
  const filename = /(?:^|;)\s*filename="([a-z\d_-]+\.zip)"/i.exec(disposition)?.[1] ?? 'WG_PAID_MGTS_DIAGNOSTICS.zip';
  return { blob, filename };
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

type AdminInviteListQuery = NonNullable<AdminListInvitesV2AdminInvitesGetData['query']>;
export type InviteOrigin = NonNullable<AdminInviteListQuery['origin']>[number];

export async function loadInvites(origins: Array<InviteOrigin>, signal?: AbortSignal): Promise<Array<AdminInviteSummary>> {
  return requireData(await adminListInvitesV2AdminInvitesGet({
    ...requestOptions(signal),
    query: { origin: origins }
  }), 'Unable to load invites.');
}

export async function loadBulkInviteCampaigns(signal?: AbortSignal): Promise<Array<AdminBulkInviteSummary>> {
  return requireData(
    await adminListBulkInvitesV2AdminBulkInvitesGet(requestOptions(signal)),
    'Unable to load bulk invite campaigns.'
  );
}

export async function createBulkInviteCampaign(body: AdminBulkInviteCreateRequest): Promise<AdminBulkInviteCreateResponse> {
  return requireData(
    await adminCreateBulkInviteV2AdminBulkInvitesPost({ ...mutationOptions(), body }),
    'Unable to create bulk invite campaign.'
  );
}

export async function revokeBulkInviteCampaign(campaignId: string): Promise<AdminBulkInviteSummary> {
  return requireData(await adminRevokeBulkInviteV2AdminBulkInvitesCampaignIdRevokePost({
    ...mutationOptions(),
    path: { campaign_id: campaignId }
  }), 'Unable to revoke bulk invite campaign.');
}

export async function loadRuntimeConnections(signal?: AbortSignal): Promise<AdminRuntimeConnectionsResponse> {
  return requireData(
    await adminRuntimeConnectionsV2AdminRuntimeConnectionsGet(requestOptions(signal)),
    'Unable to load runtime connections.'
  );
}

export async function loadInvitationSources(
  query: AdminInvitationSourcesV2AdminInvitationSourcesGetData['query'],
  signal?: AbortSignal
): Promise<Array<AdminInvitationSourceOption>> {
  return requireData(await adminInvitationSourcesV2AdminInvitationSourcesGet({
    ...requestOptions(signal), query
  }), 'Unable to load invitation sources.');
}

export function adminProfileConfigUrl(profileId: string) {
  return `/v2/admin/profiles/${encodeURIComponent(profileId)}/config`;
}

export async function createInvite(body: AdminInviteRequest): Promise<AdminInviteResponse> {
  return requireData(await adminCreateInviteV2AdminInvitesPost({ ...mutationOptions(), body }), 'Unable to create invite.');
}

export async function createReviewAccess(): Promise<AdminReviewAccessResponse> {
  return requireData(
    await adminReviewAccessV2AdminReviewAccessPost(mutationOptions()),
    'Unable to create or reissue the review link.'
  );
}

export async function resetReviewAccess(signal?: AbortSignal): Promise<AdminReviewResetResponse> {
  return requireData(
    await adminReviewAccessResetV2AdminReviewAccessResetPost({ ...mutationOptions(), ...(signal ? { signal } : {}) }),
    'Unable to reset review access.'
  );
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

export async function reissueInviteShareLink(inviteId: string): Promise<AdminInviteShareTokenResponse> {
  return requireData(await adminReissueInviteShareTokenV2AdminInvitesInviteIdShareTokenReissuePost({
    ...mutationOptions(),
    path: { invite_id: inviteId }
  }), 'Unable to reissue the share link.');
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

export interface LoadUsersOptions extends Pick<AdminUserListQuery,
  'invited_by_origin' | 'invited_by_user_id' | 'invited_by_campaign_id'> {
  query?: string;
  limit: number;
  offset: number;
  sortBy: AdminUserSortBy;
  sortDir: AdminUserSortDir;
}

export async function loadUsers(
  { query = '', limit, offset, sortBy, sortDir, ...attribution }: LoadUsersOptions,
  signal?: AbortSignal
): Promise<Array<AdminUserSummary>> {
  return requireData(await adminListUsersV2AdminUsersGet({
    ...requestOptions(signal),
    query: {
      ...(query ? { query } : {}),
      ...attribution,
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

export async function updateReferralPolicy(userId: string, enabled: boolean, limit: number): Promise<AdminUserReferralPolicyResponse> {
  return requireData(await adminUpdateUserReferralPolicyV2AdminUsersUserIdReferralPolicyPatch({
    ...mutationOptions(),
    body: { enabled, limit },
    path: { user_id: userId }
  }), 'Unable to update the referral policy.');
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

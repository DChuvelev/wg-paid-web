import {
  accountMeV2AccountMeGet,
  accountProfileCreateV2AccountProfilesPost,
  accountProfileReissueV2AccountProfilesProfileIdReissuePost,
  accountProfileRevokeV2AccountProfilesProfileIdRevokePost,
  accountProfilesV2AccountProfilesGet,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost,
  loginRequestV2AuthLoginRequestPost,
  logoutV2AuthLogoutPost,
  redeemInviteRouteV2AuthInvitesRedeemPost,
  type AccountMeResponse,
  type ProfileSummary
} from '@wg-paid/api';

const csrfCookieName = 'wg_access_csrf';

export class AccessApiError extends Error {
  status: number | undefined;

  constructor(status?: number) {
    super(status ? `Access API request failed with status ${status}` : 'Access API request failed');
    this.name = 'AccessApiError';
    this.status = status;
  }
}

export function getCsrfHeaders(cookie = document.cookie): Record<string, string> | undefined {
  const prefix = `${csrfCookieName}=`;
  const encodedToken = cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(prefix))
    ?.slice(prefix.length);

  if (!encodedToken) {
    return undefined;
  }

  try {
    return { 'x-csrf-token': decodeURIComponent(encodedToken) };
  } catch {
    return { 'x-csrf-token': encodedToken };
  }
}

function requestOptions() {
  return { credentials: 'same-origin' as const };
}

function mutationOptions() {
  return { ...requestOptions(), headers: getCsrfHeaders() };
}

export async function requestLogin(email: string): Promise<number | undefined> {
  const result = await loginRequestV2AuthLoginRequestPost({
    ...mutationOptions(),
    body: { email }
  });
  return result.response?.status;
}

export async function redeemInvite(inviteToken: string, email: string): Promise<number | undefined> {
  const result = await redeemInviteRouteV2AuthInvitesRedeemPost({
    ...mutationOptions(),
    body: { email, invite_token: inviteToken }
  });
  return result.response?.status;
}

export async function consumeMagicLink(token: string): Promise<number | undefined> {
  const result = await consumeMagicLinkRouteV2AuthMagicLinkConsumePost({
    ...mutationOptions(),
    body: { token }
  });
  return result.response?.status;
}

export async function loadAccount(): Promise<AccountMeResponse> {
  const result = await accountMeV2AccountMeGet(requestOptions());
  if (result.data) {
    return result.data;
  }
  throw new AccessApiError(result.response?.status);
}

export async function loadProfiles(): Promise<Array<ProfileSummary>> {
  const result = await accountProfilesV2AccountProfilesGet(requestOptions());
  if (result.data) {
    return result.data;
  }
  throw new AccessApiError(result.response?.status);
}

async function requireSuccessfulMutation(result: { response?: Response }) {
  if (!result.response?.ok) {
    throw new AccessApiError(result.response?.status);
  }
}

export async function createProfile(grantId: string) {
  await requireSuccessfulMutation(await accountProfileCreateV2AccountProfilesPost({
    ...mutationOptions(),
    body: { grant_id: grantId, protocol: 'wireguard' }
  }));
}

export async function revokeProfile(profileId: string) {
  await requireSuccessfulMutation(await accountProfileRevokeV2AccountProfilesProfileIdRevokePost({
    ...mutationOptions(),
    path: { profile_id: profileId }
  }));
}

export async function reissueProfile(profileId: string) {
  await requireSuccessfulMutation(await accountProfileReissueV2AccountProfilesProfileIdReissuePost({
    ...mutationOptions(),
    path: { profile_id: profileId }
  }));
}

export async function logout() {
  await requireSuccessfulMutation(await logoutV2AuthLogoutPost(mutationOptions()));
}

import {
  accountMeUpdateV2AccountMePatch,
  accountMeV2AccountMeGet,
  accountConfigurationCreateV2AccountProfilesConfigurationsPost,
  accountConfigurationsV2AccountProfilesConfigurationsGet,
  accountConfigurationUpdateLabelV2AccountProfilesConfigurationsConfigurationIdPatch,
  changeInviteEmailRouteV2AuthInvitesChangeEmailPost,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost,
  inspectInviteRouteV2AuthInvitesInspectPost,
  loginRequestV2AuthLoginRequestPost,
  logoutV2AuthLogoutPost,
  redeemInviteRouteV2AuthInvitesRedeemPost,
  resendInviteRouteV2AuthInvitesResendPost,
  type AccountMeResponse,
  type ConfigurationSummary,
  type InviteInspectResponse,
  type ProfileConfigDownloadResponse
} from '@wg-paid/api';

const csrfCookieName = 'wg_access_csrf';

export class AccessApiError extends Error {
  status: number | undefined;
  retryAfterSeconds: number | undefined;

  constructor(status?: number, retryAfterSeconds?: number) {
    super(status ? `Access API request failed with status ${status}` : 'Access API request failed');
    this.name = 'AccessApiError';
    this.status = status;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

function accessApiError(response?: Response) {
  const header = response?.headers.get('Retry-After');
  const retryAfterSeconds = header && /^\d+$/.test(header) ? Number(header) : undefined;
  return new AccessApiError(response?.status, retryAfterSeconds);
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

export async function inspectInvite(inviteToken: string): Promise<InviteInspectResponse> {
  const result = await inspectInviteRouteV2AuthInvitesInspectPost({
    ...requestOptions(),
    body: { invite_token: inviteToken }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function resendInvite(inviteToken: string): Promise<void> {
  const result = await resendInviteRouteV2AuthInvitesResendPost({
    ...mutationOptions(),
    body: { invite_token: inviteToken }
  });
  if (result.response?.status === 202) return;
  throw accessApiError(result.response);
}

export async function changeInviteEmail(inviteToken: string, email: string): Promise<void> {
  const result = await changeInviteEmailRouteV2AuthInvitesChangeEmailPost({
    ...mutationOptions(),
    body: { email, invite_token: inviteToken }
  });
  if (result.response?.status === 202) return;
  throw accessApiError(result.response);
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
  throw accessApiError(result.response);
}

export async function loadConfigurations(): Promise<Array<ConfigurationSummary>> {
  const result = await accountConfigurationsV2AccountProfilesConfigurationsGet(requestOptions());
  if (result.data) {
    return result.data;
  }
  throw accessApiError(result.response);
}

export async function createProfileConfigDownload(profileId: string): Promise<string> {
  const response = await fetch(
    `/v2/account/profiles/${encodeURIComponent(profileId)}/config-download`,
    {
      ...mutationOptions(),
      method: 'POST'
    }
  );

  if (!response.ok) throw accessApiError(response);

  const payload = await response.json() as ProfileConfigDownloadResponse;

  const expectedPrefix =
    `/v2/account/profiles/${encodeURIComponent(profileId)}/config-download/`;

  if (
    typeof payload.download_url !== 'string'
    || !payload.download_url.startsWith(expectedPrefix)
  ) {
    throw new AccessApiError();
  }

  return payload.download_url;
}

export async function updateDisplayName(displayName: string | null): Promise<AccountMeResponse> {
  const result = await accountMeUpdateV2AccountMePatch({
    ...mutationOptions(),
    body: { display_name: displayName }
  });
  if (result.data) return result.data;
  throw new AccessApiError(result.response?.status);
}

export async function updateConfigurationLabel(configurationId: string, label: string | null): Promise<ConfigurationSummary> {
  const result = await accountConfigurationUpdateLabelV2AccountProfilesConfigurationsConfigurationIdPatch({
    ...mutationOptions(),
    body: { label },
    path: { configuration_id: configurationId }
  });
  if (result.data) return result.data;
  throw new AccessApiError(result.response?.status);
}

async function requireSuccessfulMutation(result: { response?: Response }) {
  if (!result.response?.ok) {
    throw new AccessApiError(result.response?.status);
  }
}

export async function createConfiguration(grantId: string) {
  await requireSuccessfulMutation(await accountConfigurationCreateV2AccountProfilesConfigurationsPost({
    ...mutationOptions(),
    body: { grant_id: grantId }
  }));
}

export async function logout() {
  await requireSuccessfulMutation(await logoutV2AuthLogoutPost(mutationOptions()));
}

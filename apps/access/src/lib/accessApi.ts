import {
  accountBillingPaymentCreateV2AccountBillingPaymentsPost,
  accountBillingPaymentsV2AccountBillingPaymentsGet,
  accountBillingPaymentV2AccountBillingPaymentsPaymentIdGet,
  accountMeUpdateV2AccountMePatch,
  accountMeV2AccountMeGet,
  accountReferralCreateV2AccountReferralsPost,
  accountReferralReissueV2AccountReferralsInviteIdShareTokenReissuePost,
  accountReferralRevokeV2AccountReferralsInviteIdRevokePost,
  accountReferralsV2AccountReferralsGet,
  accountConfigurationCreateV2AccountProfilesConfigurationsPost,
  accountConfigurationsV2AccountProfilesConfigurationsGet,
  accountConfigurationUpdateLabelV2AccountProfilesConfigurationsConfigurationIdPatch,
  changeInviteEmailRouteV2AuthInvitesChangeEmailPost,
  consumeMagicLinkRouteV2AuthMagicLinkConsumePost,
  inspectInviteRouteV2AuthInvitesInspectPost,
  inspectBulkInviteRouteV2AuthBulkInvitesInspectPost,
  inspectMagicLinkRecoveryRouteV2AuthMagicLinkRecoveryPost,
  loginRequestV2AuthLoginRequestPost,
  logoutV2AuthLogoutPost,
  redeemInviteRouteV2AuthInvitesRedeemPost,
  redeemBulkInviteRouteV2AuthBulkInvitesRedeemPost,
  resendInviteRouteV2AuthInvitesResendPost,
  resendExpiredMagicLinkRouteV2AuthMagicLinkResendPost,
  type AccountMeResponse,
  type BillingPaymentSummary,
  type ConfigurationSummary,
  type InviteInspectResponse,
  type BulkInviteInspectResponse,
  type MagicLinkRecoveryResponse,
  type ProfileConfigDownloadResponse,
  type ReferralInviteCreateResponse,
  type ReferralInviteSummary
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
  let retryAfterSeconds: number | undefined;
  if (header && /^\d+$/.test(header)) {
    retryAfterSeconds = Number(header);
  } else if (header) {
    const retryAt = Date.parse(header);
    if (Number.isFinite(retryAt)) retryAfterSeconds = Math.max(0, Math.ceil((retryAt - Date.now()) / 1000));
  }
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

function requestOptions(signal?: AbortSignal) {
  return { credentials: 'same-origin' as const, ...(signal ? { signal } : {}) };
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

export async function inspectBulkInvite(campaignToken: string): Promise<BulkInviteInspectResponse> {
  const result = await inspectBulkInviteRouteV2AuthBulkInvitesInspectPost({
    ...requestOptions(),
    body: { campaign_token: campaignToken }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function redeemBulkInvite(campaignToken: string, email: string): Promise<void> {
  const result = await redeemBulkInviteRouteV2AuthBulkInvitesRedeemPost({
    ...mutationOptions(),
    body: { campaign_token: campaignToken, email }
  });
  if (result.response?.status === 202) return;
  throw accessApiError(result.response);
}

export async function inspectMagicLinkRecovery(token: string): Promise<MagicLinkRecoveryResponse> {
  const result = await inspectMagicLinkRecoveryRouteV2AuthMagicLinkRecoveryPost({
    ...mutationOptions(),
    body: { token }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function resendExpiredMagicLink(token: string): Promise<void> {
  const result = await resendExpiredMagicLinkRouteV2AuthMagicLinkResendPost({
    ...mutationOptions(),
    body: { token }
  });
  if (result.response?.status === 202) return;
  throw accessApiError(result.response);
}

export async function loadBillingPayments(): Promise<Array<BillingPaymentSummary>> {
  const result = await accountBillingPaymentsV2AccountBillingPaymentsGet(requestOptions());
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function loadBillingPayment(paymentId: string): Promise<BillingPaymentSummary> {
  const result = await accountBillingPaymentV2AccountBillingPaymentsPaymentIdGet({
    ...requestOptions(),
    path: { payment_id: paymentId }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function createBillingPayment(idempotencyKey: string): Promise<BillingPaymentSummary> {
  const result = await accountBillingPaymentCreateV2AccountBillingPaymentsPost({
    ...requestOptions(),
    headers: { ...getCsrfHeaders(), 'Idempotency-Key': idempotencyKey }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function loadReferrals(signal?: AbortSignal): Promise<Array<ReferralInviteSummary>> {
  const result = await accountReferralsV2AccountReferralsGet(requestOptions(signal));
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function createReferral(): Promise<ReferralInviteCreateResponse> {
  const result = await accountReferralCreateV2AccountReferralsPost(mutationOptions());
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function reissueReferral(inviteId: string): Promise<ReferralInviteCreateResponse> {
  const result = await accountReferralReissueV2AccountReferralsInviteIdShareTokenReissuePost({
    ...mutationOptions(), path: { invite_id: inviteId }
  });
  if (result.data) return result.data;
  throw accessApiError(result.response);
}

export async function revokeReferral(inviteId: string): Promise<ReferralInviteSummary> {
  const result = await accountReferralRevokeV2AccountReferralsInviteIdRevokePost({
    ...mutationOptions(), path: { invite_id: inviteId }
  });
  if (result.data) return result.data;
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

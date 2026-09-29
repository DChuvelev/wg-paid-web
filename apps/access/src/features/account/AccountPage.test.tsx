import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { AccountMeResponse, BillingPaymentSummary, ConfigurationSummary, ReferralInviteSummary } from '@wg-paid/api';
import {
  AccessApiError,
  createBillingPayment,
  createConfiguration,
  createReferral,
  createProfileConfigDownload,
  loadAccount,
  loadBillingPayment,
  loadBillingPayments,
  loadConfigurations,
  loadRoutingExits,
  loadReferrals,
  logout,
  reissueReferral,
  revokeReferral,
  updateBillingPendingRetirements,
  updateDisplayName,
  updateConfigurationLabel,
  updateConfigurationRouting
} from '../../lib/accessApi';
import { renderApp } from '../../test/renderApp';
import { paymentAttemptStorageKey } from '../billing/paymentAttempt';

vi.mock('../../lib/accessApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/accessApi')>();
  return {
    ...actual,
    consumeMagicLink: vi.fn(),
    createBillingPayment: vi.fn(),
    createConfiguration: vi.fn(),
    createProfileConfigDownload: vi.fn(),
    loadAccount: vi.fn(),
    loadBillingPayment: vi.fn(),
    loadBillingPayments: vi.fn(),
    loadConfigurations: vi.fn(),
    loadRoutingExits: vi.fn(),
    loadReferrals: vi.fn(),
    createReferral: vi.fn(),
    reissueReferral: vi.fn(),
    revokeReferral: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn(),
    updateDisplayName: vi.fn(),
    updateBillingPendingRetirements: vi.fn(),
    updateConfigurationLabel: vi.fn(),
    updateConfigurationRouting: vi.fn()
  };
});

const account: AccountMeResponse = {
  account_surface: 'pilot',
  billing: null,
  display_name: 'Mitya',
  email: 'person@example.test',
  grants: [{
    id: 'grant-1',
    plan_id: null,
    configuration_limit_management: 'admin',
    can_create_configuration: true,
    configuration_count: 2,
    configuration_limit: 3,
    protocol_limits: [{ can_create: true, profile_count: 2, profile_limit: 3, protocol: 'wireguard' }],
    status: 'active',
    valid_until: null
  }],
  referrals: { active_count: 0, can_create: false, enabled: false, limit: 3, remaining_count: 3 },
  user_id: 'user-1'
};

const configurations: Array<ConfigurationSummary> = [
  {
    access_grant_id: 'grant-1', configuration_id: 'configuration-1', ordinal: 7, label: null,
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    routing_mode: 'automatic', forced_selector: null, forced_until: null,
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.2', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.3', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  },
  {
    access_grant_id: 'grant-1', configuration_id: 'configuration-2', ordinal: 9, label: 'Laptop',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    routing_mode: 'automatic', forced_selector: null, forced_until: null,
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-2', status: 'provisioning_failed', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-2', status: 'active', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  }
];
const configurationThree: ConfigurationSummary = {
  ...configurations[0]!,
  configuration_id: 'configuration-3',
  ordinal: 11,
  variants: []
};

const reviewAccount: AccountMeResponse = {
  ...account,
  account_surface: 'review'
};

function reviewConfiguration(
  status = 'active',
  ready = true,
  protocol: ConfigurationSummary['variants'][number]['protocol'] = 'wireguard',
  configurationId = 'review-configuration'
): ConfigurationSummary {
  return {
    access_grant_id: 'review-grant',
    configuration_id: configurationId,
    ordinal: 1,
    label: null,
    created_at: '2026-09-29T10:00:00Z',
    updated_at: '2026-09-29T10:00:00Z',
    routing_mode: 'automatic',
    forced_selector: null,
    forced_until: null,
    variants: [{
      protocol,
      profile_id: 'review-wg-profile',
      status,
      ready,
      tunnel_ip: '10.253.0.2',
      created_at: '2026-09-29T10:00:00Z',
      updated_at: '2026-09-29T10:00:00Z'
    }]
  };
}

const qrSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>';
const fetchMock = vi.fn<typeof fetch>();
const createObjectUrlMock = vi.fn<(blob: Blob) => string>();
const revokeObjectUrlMock = vi.fn<(url: string) => void>();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createBillingPayment).mockReset();
  vi.mocked(updateBillingPendingRetirements).mockReset();
  vi.stubGlobal('fetch', fetchMock);
  fetchMock.mockResolvedValue({
    ok: true,
    status: 200,
    text: async () => qrSvg
  } as Response);
  createObjectUrlMock.mockReturnValue('blob:profile-qr');
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: createObjectUrlMock });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: revokeObjectUrlMock });
  vi.mocked(loadAccount).mockResolvedValue(account);
  vi.mocked(loadConfigurations).mockResolvedValue(configurations);
  vi.mocked(loadRoutingExits).mockResolvedValue({
    generated_at: '2026-09-29T10:00:00Z',
    observed_at: '2026-09-29T10:00:00Z',
    exits: [
      { selector: 1, display_name: 'Location Alpha' },
      { selector: 2, display_name: 'Location Beta' },
      { selector: 3, display_name: 'Location Gamma' },
      { selector: 4, display_name: 'Location Delta' },
      { selector: 5, display_name: 'Location Epsilon' }
    ]
  });
  vi.mocked(loadBillingPayments).mockResolvedValue([]);
  vi.mocked(loadBillingPayment).mockImplementation(async (paymentId) => billingPayment(paymentId, 'pending', { created_at: new Date().toISOString(), updated_at: new Date().toISOString() }));
  vi.mocked(loadReferrals).mockResolvedValue([]);
  vi.mocked(createConfiguration).mockResolvedValue();
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#config-download');
  vi.mocked(updateBillingPendingRetirements).mockResolvedValue({ configuration_ids: ['configuration-2'], effective_at: '2026-02-01T00:00:00Z' });
  vi.mocked(updateDisplayName).mockImplementation(async (displayName) => ({ ...account, display_name: displayName }));
  vi.mocked(updateConfigurationLabel).mockImplementation(async (configurationId, label) => ({
    ...configurations.find((configuration) => configuration.configuration_id === configurationId)!,
    label,
    updated_at: '2026-01-02T00:00:00Z'
  }));
  vi.mocked(updateConfigurationRouting).mockImplementation(async (configurationId, body) => ({
    ...configurations.find((configuration) => configuration.configuration_id === configurationId)!,
    routing_mode: body.mode,
    forced_selector: body.mode === 'forced' ? body.selector ?? null : null,
    forced_until: body.mode === 'forced' ? new Date(Date.now() + 30 * 60 * 1000).toISOString() : null,
    updated_at: '2026-01-02T00:00:00Z'
  }));
  window.history.replaceState(null, '', '/');
  sessionStorage.clear();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

const referral = (inviteId: string, state: ReferralInviteSummary['state'] = 'active'): ReferralInviteSummary => ({
  invite_id: inviteId,
  state,
  created_at: '2026-01-01T00:00:00Z',
  expires_at: '2026-02-01T00:00:00Z',
  used_count: state === 'used' ? 1 : 0,
  max_uses: 1,
  can_reissue_share_link: state === 'active'
});

const commercialAccount = (
  status: NonNullable<AccountMeResponse['billing']>['status'] = 'trial',
  overrides: Partial<NonNullable<AccountMeResponse['billing']>> = {}
): AccountMeResponse => ({
  ...account,
  account_surface: 'commercial',
  grants: account.grants.map((grant) => ({ ...grant, configuration_limit_management: 'billing' })),
  billing: {
    access_grant_id: 'grant-1',
    status,
    current_period_start: new Date(Date.now() - 86400000).toISOString(),
    current_period_end: new Date(Date.now() + 86400000).toISOString(),
    quantity_period_start: new Date(Date.now() - 86400000).toISOString(),
    quantity_period_end: new Date(Date.now() + 86400000).toISOString(),
    slot_quantity: 2,
    monthly_amount_kopeks: 39900,
    min_slot_quantity: 1,
    max_slot_quantity: 3,
    extra_slot_monthly_kopeks: 10000,
    pending_slot_quantity: null,
    pending_period_start: null,
    pending_period_end: null,
    pending_monthly_amount_kopeks: null,
    retirement_configuration_ids: [],
    can_renew: status !== 'past_due',
    can_add_devices_now: status === 'active_paid',
    currency: 'RUB',
    ...overrides
  }
});

const billingPayment = (paymentId: string, status: BillingPaymentSummary['status'], overrides: Partial<BillingPaymentSummary> = {}): BillingPaymentSummary => ({
  payment_id: paymentId,
  status,
  provider_status: null,
  kind: 'initial',
  amount_kopeks: 99000,
  currency: 'RUB',
  quantity_before: 2,
  quantity_after: 2,
  calculation: null,
  target_period_start: null,
  target_period_end: null,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
  succeeded_at: status === 'succeeded' ? '2026-01-01T00:00:00Z' : null,
  ...overrides
});

const currentPaidPayment = () => billingPayment('current-paid', 'succeeded', {
  amount_kopeks: 49900,
  quantity_before: 3,
  quantity_after: 3,
  target_period_start: new Date(Date.now() - 86400000).toISOString(),
  target_period_end: new Date(Date.now() + 86400000).toISOString()
});

test('pilot keeps the legacy cabinet and does not mount billing or referrals when disabled', async () => {
  renderApp('/account');
  await screen.findByText('Configurations: 2 / 3');
  expect(screen.queryByText('Access and billing')).toBeNull();
  expect(screen.queryByText('Referrals')).toBeNull();
  expect(loadBillingPayments).not.toHaveBeenCalled();
  expect(loadReferrals).not.toHaveBeenCalled();
});

test('pilot gains only the referral section when backend enables it', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 0, can_create: true, enabled: true, limit: 0, remaining_count: null } });
  renderApp('/account');
  expect(await screen.findByText('Referrals')).toBeTruthy();
  expect(screen.getByText(/unlimited/)).toBeTruthy();
  expect(loadReferrals).toHaveBeenCalledTimes(1);
  expect(screen.queryByText('Access and billing')).toBeNull();
});

test('renders only actionable referral cards and keeps distinct URLs tied to invite ids', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 2, can_create: true, enabled: true, limit: 3, remaining_count: 1 } });
  const initialReferrals = [
    referral('first'), referral('awaiting', 'awaiting_confirmation'), referral('used', 'used'),
    referral('revoked', 'revoked'), referral('expired', 'expired')
  ];
  vi.mocked(loadReferrals).mockResolvedValueOnce(initialReferrals).mockResolvedValue([
    referral('created'), ...initialReferrals
  ]);
  vi.mocked(createReferral).mockResolvedValue({ invite: referral('created'), invite_token: 'created token/+' });
  vi.mocked(reissueReferral).mockResolvedValue({ invite: referral('first'), invite_token: 'first-token' });
  renderApp('/account');
  await screen.findByText(/Remaining: 1/);
  await screen.findByText('Active');
  expect(screen.getByText('Awaiting confirmation')).toBeTruthy();
  for (const label of ['Used', 'Revoked', 'Expired']) expect(screen.queryByText(label)).toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: /previous link stops working/ })[0]!);
  const firstShare = await screen.findByLabelText('One-time invitation URL first');
  expect((firstShare as HTMLInputElement).value).toContain('token=first-token');
  fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
  const createdShare = await screen.findByLabelText('One-time invitation URL created');
  expect((createdShare as HTMLInputElement).value).toBe(`${window.location.origin}/invite#token=created%20token%2F%2B`);
  expect((firstShare as HTMLInputElement).value).toContain('token=first-token');
  expect(sessionStorage.length).toBe(0);
  expect(localStorage.getItem('first-token')).toBeNull();
});

test('referral polling clears a terminal URL, synchronizes account, then stops', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const active = referral('changing');
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 1, can_create: false, enabled: true, limit: 1, remaining_count: 0 } });
  vi.mocked(loadReferrals)
    .mockResolvedValueOnce([active])
    .mockResolvedValueOnce([active])
    .mockResolvedValueOnce([{ ...active, state: 'awaiting_confirmation', can_reissue_share_link: false }])
    .mockResolvedValueOnce([{ ...active, state: 'used', used_count: 1, can_reissue_share_link: false }]);
  vi.mocked(reissueReferral).mockResolvedValue({ invite: active, invite_token: 'temporary-token' });
  renderApp('/account');
  await screen.findByText('Active');
  fireEvent.click(screen.getByRole('button', { name: /previous link stops working/ }));
  await screen.findByLabelText('One-time invitation URL changing');
  const accountLoadsBeforePoll = vi.mocked(loadAccount).mock.calls.length;

  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await screen.findByText('Awaiting confirmation');
  expect(screen.queryByLabelText('One-time invitation URL changing')).toBeNull();
  await waitFor(() => expect(vi.mocked(loadAccount).mock.calls.length).toBeGreaterThan(accountLoadsBeforePoll));
  expect(loadReferrals).toHaveBeenCalledTimes(3);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  await waitFor(() => expect(screen.queryByText('Awaiting confirmation')).toBeNull());
  expect(loadReferrals).toHaveBeenCalledTimes(4);
  await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(loadReferrals).toHaveBeenCalledTimes(4);
});

test('revoke clears its URL immediately and a late reissue cannot restore it', async () => {
  let resolveReissue!: (value: { invite: ReferralInviteSummary; invite_token: string }) => void;
  const active = referral('race');
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 1, can_create: true, enabled: true, limit: 2, remaining_count: 1 } });
  vi.mocked(loadReferrals).mockResolvedValue([active]);
  vi.mocked(createReferral).mockResolvedValue({ invite: active, invite_token: 'current-token' });
  vi.mocked(reissueReferral).mockImplementation(() => new Promise((resolve) => { resolveReissue = resolve; }));
  vi.mocked(revokeReferral).mockResolvedValue({ ...active, state: 'revoked', can_reissue_share_link: false });
  renderApp('/account');
  await screen.findByText('Active');
  fireEvent.click(screen.getByRole('button', { name: 'Create invitation' }));
  await screen.findByLabelText('One-time invitation URL race');
  fireEvent.click(screen.getByRole('button', { name: /previous link stops working/ }));
  await waitFor(() => expect(reissueReferral).toHaveBeenCalledWith('race'));
  fireEvent.click(screen.getByRole('button', { name: 'Revoke' }));
  expect(screen.queryByLabelText('One-time invitation URL race')).toBeNull();
  await waitFor(() => expect(revokeReferral).toHaveBeenCalledWith('race'));
  await act(async () => resolveReissue({ invite: active, invite_token: 'stale-token' }));
  expect(screen.queryByLabelText('One-time invitation URL race')).toBeNull();
});

test('copy feedback is per invite and reports success and clipboard failure', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('denied'));
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 1, can_create: true, enabled: true, limit: 2, remaining_count: 1 } });
  vi.mocked(loadReferrals).mockResolvedValue([referral('copy-one')]);
  vi.mocked(reissueReferral).mockResolvedValue({ invite: referral('copy-one'), invite_token: 'copy-token' });
  renderApp('/account');
  await screen.findByText('Active');
  fireEvent.click(screen.getByRole('button', { name: /previous link stops working/ }));
  await screen.findByLabelText('One-time invitation URL copy-one');
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByRole('button', { name: 'Copied' })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  fireEvent.click(screen.getByRole('button', { name: 'Copied' }));
  expect(await screen.findByRole('button', { name: 'Copy failed' })).toBeTruthy();
  expect(await screen.findByText('Copy failed. Select and copy the URL manually.')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(screen.getByRole('button', { name: 'Copy failed' })).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(800); });
  expect(screen.getByRole('button', { name: 'Copy' })).toBeTruthy();
});

test('remounting an active referral cannot recover its ephemeral URL', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, referrals: { active_count: 1, can_create: false, enabled: true, limit: 1, remaining_count: 0 } });
  vi.mocked(loadReferrals).mockResolvedValue([referral('memory-only')]);
  vi.mocked(reissueReferral).mockResolvedValue({ invite: referral('memory-only'), invite_token: 'memory-token' });
  const first = renderApp('/account');
  await screen.findByText('Active');
  fireEvent.click(screen.getByRole('button', { name: /previous link stops working/ }));
  await screen.findByLabelText('One-time invitation URL memory-only');
  first.unmount();

  renderApp('/account');
  await screen.findByText('Active');
  expect(screen.queryByLabelText('One-time invitation URL memory-only')).toBeNull();
  expect(sessionStorage.length).toBe(0);
});

test('dispatches strictly by commercial surface and handles null billing safely', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: null });
  renderApp('/account');
  expect(await screen.findByText('Access and billing')).toBeTruthy();
  expect(screen.getByText('Billing information is temporarily unavailable.')).toBeTruthy();
  expect(await screen.findAllByRole('combobox', { name: 'Forced location' })).toHaveLength(2);
  expect(loadBillingPayments).not.toHaveBeenCalled();
});

test('fails safely for an unknown runtime surface instead of inferring from billing', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'unexpected' } as unknown as AccountMeResponse);
  renderApp('/account');
  expect((await screen.findByRole('alert')).textContent).toBe('This account type is not supported.');
  expect(screen.queryByText('Access and billing')).toBeNull();
});

test('review surface renders only the ready WireGuard download, library, and logout flow', async () => {
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue([reviewConfiguration()]);
  renderApp('/account');

  expect(await screen.findByRole('heading', { name: 'Access to Secret Studio resources' })).toBeTruthy();
  expect(screen.getByText(/including the library of samples and sound effects/)).toBeTruthy();
  expect(screen.getByText(/import it into WireGuard/)).toBeTruthy();
  expect(screen.getByText('Your WireGuard configuration is ready.')).toBeTruthy();
  const library = screen.getByRole('link', { name: 'Open the sample library' });
  expect(library.getAttribute('href')).toBe('/library/');
  expect(library.getAttribute('target')).toBe('_blank');
  expect(library.getAttribute('rel')).toBe('noopener noreferrer');
  expect(screen.getByRole('button', { name: 'Logout' })).toBeTruthy();

  fireEvent.click(screen.getByRole('button', { name: 'Download WireGuard configuration' }));
  await waitFor(() => expect(createProfileConfigDownload).toHaveBeenCalledWith('review-wg-profile'));

  expect(loadRoutingExits).not.toHaveBeenCalled();
  expect(loadBillingPayments).not.toHaveBeenCalled();
  expect(loadReferrals).not.toHaveBeenCalled();
  expect(screen.queryByText(/Amnezia|AWG|QR code|Routing|Forced location|Access and billing|Referrals|Configurations:/i)).toBeNull();
  expect(screen.queryByRole('button', { name: /Add configuration|Show .* QR|Add name|Edit name/i })).toBeNull();
  expect(document.body.textContent).not.toMatch(/review-configuration|review-wg-profile|10\.253\.0\.2|review-grant/);
});

test.each(['requested', 'provisioning'])('review WG %s state stays preparing without delivery actions', async (status) => {
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue([reviewConfiguration(status, false)]);
  renderApp('/account');

  expect(await screen.findByText('Your WireGuard configuration is being prepared. This page will update automatically.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Download WireGuard configuration' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Open the sample library' })).toBeNull();
});

test('empty review configurations use bounded preparation polling', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue([]);
  renderApp('/account');

  await screen.findByText('Your WireGuard configuration is being prepared. This page will update automatically.');
  expect(loadConfigurations).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(3000); });
  expect(loadConfigurations).toHaveBeenCalledTimes(2);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  const callsAtTimeout = vi.mocked(loadConfigurations).mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); });
  expect(loadConfigurations).toHaveBeenCalledTimes(callsAtTimeout);
});

test('empty Pilot configurations do not enable review preparation polling', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.mocked(loadConfigurations).mockResolvedValue([]);
  renderApp('/account');

  await screen.findByText('No configurations yet.');
  expect(loadConfigurations).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(9000); });
  expect(loadConfigurations).toHaveBeenCalledTimes(1);
});

test.each([
  ['multiple configurations', [reviewConfiguration(), reviewConfiguration('active', true, 'wireguard', 'review-configuration-2')]],
  ['multiple variants', [{ ...reviewConfiguration(), variants: [...reviewConfiguration().variants, { ...reviewConfiguration().variants[0]!, profile_id: 'second-wg-profile' }] }]],
  ['non-WG protocol', [reviewConfiguration('active', true, 'amneziawg')]],
  ['terminal status', [reviewConfiguration('provisioning_failed', false)]],
  ['active but not ready', [reviewConfiguration('active', false)]]
] satisfies Array<[string, Array<ConfigurationSummary>]>)('review projection fails closed for %s', async (_label, rows) => {
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue(rows);
  renderApp('/account');

  expect(await screen.findByText('The WireGuard configuration is currently unavailable.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Download WireGuard configuration' })).toBeNull();
  expect(screen.queryByRole('link', { name: 'Open the sample library' })).toBeNull();
  expect(document.body.textContent).not.toMatch(/amnezia|profile|10\.253\.0\.2|review-grant/i);
});

test('review download 401 follows the existing session-expired path', async () => {
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue([reviewConfiguration()]);
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard configuration' }));
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access'] });
});

test('ordinary review download failure stays local', async () => {
  vi.mocked(loadAccount).mockResolvedValue(reviewAccount);
  vi.mocked(loadConfigurations).mockResolvedValue([reviewConfiguration()]);
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard configuration' }));
  expect((await screen.findByRole('alert')).textContent).toBe('Unable to download the configuration.');
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('plain q3 trial presents only current trial semantics and no one-option action radio', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial', { slot_quantity: 3, monthly_amount_kopeks: 49900 }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  renderApp('/account');

  const billing = (await screen.findByRole('heading', { name: 'Access and billing' })).closest('section')!;
  expect(within(billing).getByRole('heading', { name: 'Current trial period' })).toBeTruthy();
  expect(within(billing).getByText('3 configurations')).toBeTruthy();
  expect(within(billing).getByText(/Trial ends/)).toBeTruthy();
  expect(within(billing).queryByText(/Access is paid through/)).toBeNull();
  expect(within(billing).queryByText(/499/)).toBeNull();
  expect(within(billing).queryByRole('radio', { name: /Renew next month/ })).toBeNull();
});

test('new billing presentation copy switches completely between English and Russian', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial', { slot_quantity: 3, monthly_amount_kopeks: 49900 }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  renderApp('/account');
  await screen.findByRole('heading', { name: 'Current trial period' });

  fireEvent.click(screen.getByRole('button', { name: 'RU' }));
  const billing = (await screen.findByRole('heading', { name: 'Доступ и оплата' })).closest('section')!;
  expect(within(billing).getByRole('heading', { name: 'Текущий пробный период' })).toBeTruthy();
  expect(within(billing).getByText('3 конфигурации')).toBeTruthy();
  expect(within(billing).getByText(/Пробный период закончится/)).toBeTruthy();
  expect(within(billing).queryByText('Current trial period')).toBeNull();
  expect(within(billing).queryByRole('button', { name: 'Continue to payment' })).toBeNull();
});

test('trial q3 to paid q1 validity-gates the CTA until exactly two retirements are selected', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial', { slot_quantity: 3, monthly_amount_kopeks: 49900 }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(createBillingPayment).mockResolvedValue(billingPayment('trial-q1', 'pending'));
  renderApp('/account');

  const quantity = await screen.findByRole('spinbutton', { name: /Number of configurations/ });
  fireEvent.change(quantity, { target: { value: '1' } });
  const submit = screen.getByRole('button', { name: 'Continue to payment' }) as HTMLButtonElement;
  expect(screen.getByText('Select exactly 2. Selected: 0.')).toBeTruthy();
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: 'Configuration #7' }));
  expect(screen.getByText('Select exactly 2. Selected: 1.')).toBeTruthy();
  expect(submit.disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Laptop/ }));
  expect(screen.getByText('Select exactly 2. Selected: 2.')).toBeTruthy();
  expect(submit.disabled).toBe(false);
  fireEvent.click(submit);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    action: 'renew', target_quantity: 1,
    retire_configuration_ids: ['configuration-1', 'configuration-2']
  })));
});

test('active-paid q3 remains a trial tail when succeeded coverage starts only in the future', async () => {
  const boundary = new Date(Date.now() + 86400000).toISOString();
  const nextEnd = new Date(Date.now() + 32 * 86400000).toISOString();
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900, can_add_devices_now: false, can_renew: false,
    pending_slot_quantity: 1, pending_period_start: boundary, pending_period_end: nextEnd,
    pending_monthly_amount_kopeks: 29900, retirement_configuration_ids: ['configuration-2', 'configuration-3']
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValue([billingPayment('future-q1', 'succeeded', {
    amount_kopeks: 29900, quantity_before: 3, quantity_after: 1,
    target_period_start: boundary, target_period_end: nextEnd
  })]);
  renderApp('/account');

  const billing = (await screen.findByRole('heading', { name: 'Access and billing' })).closest('section')!;
  expect(await within(billing).findByRole('heading', { name: 'Current trial period' })).toBeTruthy();
  expect(within(billing).queryByText(/Access is paid through/)).toBeNull();
  expect(within(billing).getByText(/1 configuration.*299/)).toBeTruthy();
  expect(within(billing).getByText('Laptop · Configuration #9')).toBeTruthy();
  expect(within(billing).getByText('Configuration #11')).toBeTruthy();
});

test('genuinely paid current q3 at max remains paid when add-now capability is false', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValue([currentPaidPayment()]);
  renderApp('/account');

  const billing = (await screen.findByRole('heading', { name: 'Access and billing' })).closest('section')!;
  expect(await within(billing).findByText('Access paid')).toBeTruthy();
  expect(within(billing).getByText(/3 configurations.*499/)).toBeTruthy();
  expect(within(billing).getByText(/Access is paid through/)).toBeTruthy();
  expect(within(billing).queryByRole('heading', { name: 'Current trial period' })).toBeNull();
});

test('active-paid current presentation stays neutral while payment history is unavailable', async () => {
  let rejectHistory!: (error: unknown) => void;
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockImplementation(() => new Promise((_, reject) => { rejectHistory = reject; }));
  renderApp('/account');

  const billing = (await screen.findByRole('heading', { name: 'Access and billing' })).closest('section')!;
  expect(within(billing).getByRole('heading', { name: 'Current access' })).toBeTruthy();
  expect(within(billing).getByText('3 configurations')).toBeTruthy();
  expect(within(billing).queryByText('Access paid')).toBeNull();
  expect(within(billing).queryByRole('heading', { name: 'Current trial period' })).toBeNull();
  await act(async () => rejectHistory(new AccessApiError(503)));
  expect(await within(billing).findByText(/Payment history is unavailable/)).toBeTruthy();
  expect(within(billing).queryByText('Access paid')).toBeNull();
});

test.each([
  ['active_paid', 'Access paid'],
  ['expired', 'Access expired']
] as const)('renders backend commercial %s terms and permitted action', async (status, label) => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount(status));
  if (status === 'active_paid') vi.mocked(loadBillingPayments).mockResolvedValue([currentPaidPayment()]);
  if (status === 'expired') vi.mocked(loadConfigurations).mockResolvedValue([]);
  renderApp('/account');
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.getByText(/2 configurations/)).toBeTruthy();
  expect(screen.getByText(/399/)).toBeTruthy();
  expect(await screen.findByRole('button', { name: 'Continue to payment' })).toBeTruthy();
});

test('renders the paid next-period projection and updates exact billing-owned retirements', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    pending_slot_quantity: 1,
    pending_period_start: '2026-02-01T00:00:00Z',
    pending_period_end: '2026-03-01T00:00:00Z',
    pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-2'],
    can_renew: false
  }));
  vi.mocked(updateBillingPendingRetirements).mockResolvedValue({
    configuration_ids: ['configuration-1'], effective_at: '2026-02-01T00:00:00Z'
  });
  renderApp('/account');
  const billing = (await screen.findByRole('heading', { name: 'Access and billing' })).closest('section')!;
  expect(within(billing).getByText('Next paid period')).toBeTruthy();
  expect(within(billing).queryByText(/next month is already paid/i)).toBeNull();
  expect(within(billing).getByText('Laptop · Configuration #9')).toBeTruthy();
  expect(within(billing).getByText(/these configurations will be disabled/i).textContent).toContain('2/1/2026');

  const changeSelection = within(billing).getByRole('button', { name: 'Change selection' }) as HTMLButtonElement;
  await waitFor(() => expect(changeSelection.disabled).toBe(false));
  fireEvent.click(changeSelection);
  fireEvent.click(within(billing).getByRole('checkbox', { name: /Laptop/ }));
  fireEvent.click(within(billing).getByRole('checkbox', { name: 'Configuration #7' }));
  fireEvent.click(within(billing).getByRole('button', { name: 'Save scheduled configurations' }));
  await waitFor(() => expect(updateBillingPendingRetirements).toHaveBeenCalledWith(['configuration-1']));
  await waitFor(() => expect(loadAccount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(loadConfigurations).toHaveBeenCalledTimes(2));
});

test('builds a keep-paid add-now request with separate existing and prospective retirement identities', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    pending_slot_quantity: 1,
    pending_period_start: '2026-02-01T00:00:00Z',
    pending_period_end: '2026-03-01T00:00:00Z',
    pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1'],
    can_renew: false
  }));
  vi.mocked(createBillingPayment).mockResolvedValue(billingPayment('add-now-payment', 'pending', { confirmation_url: null }));
  renderApp('/account');
  expect(await screen.findByRole('radio', { name: 'Add devices now' })).toBeTruthy();
  expect(screen.getByRole('radio', { name: /Increase next month/ })).toBeTruthy();
  fireEvent.click(await screen.findByRole('radio', { name: /Keep the already-paid lower quantity/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Laptop/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Future new configuration 1/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledWith(expect.any(String), {
    action: 'add_now',
    target_quantity: 3,
    apply_now: false,
    future_choice: 'keep_paid',
    retire_configuration_ids: ['configuration-2'],
    retire_new_configuration_ordinals: [1]
  }));
});

test('fails closed when billing ownership cannot be mapped to current configurations', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', { access_grant_id: 'different-grant' }));
  renderApp('/account');
  expect(await screen.findByText(/Billing quantity and configuration data do not agree/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
});

test('past-due commercial account has no payment action and cannot POST', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('past_due'));
  renderApp('/account');
  expect(await screen.findByText('Payment overdue')).toBeTruthy();
  expect(screen.getByText(/new payment is unavailable/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Pay for|Renew/ })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('trial first-payment increase explains immediate availability and submits no retirements', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial', {
    slot_quantity: 1,
    monthly_amount_kopeks: 29900
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([configurations[0]!]);
  vi.mocked(createBillingPayment).mockResolvedValue(billingPayment('trial-increase', 'pending', { confirmation_url: null }));
  renderApp('/account');

  const quantity = await screen.findByRole('spinbutton', { name: /Number of configurations/ });
  fireEvent.change(quantity, { target: { value: '3' } });
  expect(screen.getByText(/Extra configurations become available immediately after successful payment/)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledWith(expect.any(String), {
    action: 'renew',
    target_quantity: 3,
    apply_now: false,
    future_choice: null,
    retire_configuration_ids: [],
    retire_new_configuration_ordinals: []
  }));
});

test('paid preserved-trial-tail top-up explains immediate availability when add-now is unavailable', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 1,
    monthly_amount_kopeks: 29900,
    pending_slot_quantity: 1,
    pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z',
    pending_monthly_amount_kopeks: 29900,
    can_renew: false,
    can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([configurations[0]!]);
  vi.mocked(loadBillingPayments).mockResolvedValue([billingPayment('future-paid', 'succeeded', {
    amount_kopeks: 29900, quantity_before: 1, quantity_after: 1,
    target_period_start: '2026-10-01T00:00:00Z', target_period_end: '2026-11-01T00:00:00Z'
  })]);
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: /Keep 3 configurations.*200/ }));
  expect(screen.getByText(/remaining trial time is free/i)).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: /Pay additional.*200/ }));
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({
    action: 'top_up_next', target_quantity: 3
  })));
});

test('top-up-next uses the shared picker only for exact existing boundary retirements', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3,
    monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1,
    pending_period_start: '2026-02-01T00:00:00Z',
    pending_period_end: '2026-03-01T00:00:00Z',
    pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'],
    can_renew: false,
    can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(createBillingPayment).mockResolvedValue(billingPayment('top-up-q3', 'pending'));
  renderApp('/account');

  expect(await screen.findByRole('button', { name: /Keep 2 configurations.*100/ })).toBeTruthy();
  expect(screen.getByRole('button', { name: /Keep all 3 configurations.*200/ })).toBeTruthy();
  expect(createBillingPayment).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /Keep 2 configurations.*100/ }));
  expect(screen.queryByText(/remaining trial time is free/i)).toBeNull();
  expect(screen.getByText('Select exactly 1. Selected: 0.')).toBeTruthy();
  expect((screen.getByRole('button', { name: /Pay additional.*100/ }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole('checkbox', { name: /Laptop/ }));
  expect((screen.getByRole('button', { name: /Pay additional.*100/ }) as HTMLButtonElement).disabled).toBe(false);
  fireEvent.click(screen.getByRole('button', { name: /Keep all 3 configurations.*200/ }));
  expect(screen.queryByText(/Select exactly/)).toBeNull();
  const submitQ3 = screen.getByRole('button', { name: /Pay additional.*200/ }) as HTMLButtonElement;
  expect(submitQ3.disabled).toBe(false);
  fireEvent.click(submitQ3);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledWith(expect.any(String), {
    action: 'top_up_next', target_quantity: 3, apply_now: false, future_choice: null,
    retire_configuration_ids: [], retire_new_configuration_ordinals: []
  }));
});

test('pending max quantity offers no top-up-next action', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    pending_slot_quantity: 3,
    pending_period_start: '2026-02-01T00:00:00Z',
    pending_period_end: '2026-03-01T00:00:00Z',
    pending_monthly_amount_kopeks: 49900,
    can_renew: false,
    can_add_devices_now: false
  }));
  renderApp('/account');
  await screen.findByText('Next paid period');
  expect(screen.queryByRole('radio', { name: /Increase next month/ })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
});

test('reload retries the exact top-up-next target and retirement selection with the same key', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3,
    monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1,
    pending_period_start: '2026-02-01T00:00:00Z',
    pending_period_end: '2026-03-01T00:00:00Z',
    pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'],
    can_renew: false,
    can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(createBillingPayment)
    .mockRejectedValueOnce(new AccessApiError(503))
    .mockResolvedValueOnce(billingPayment('top-up-resumed', 'pending', { confirmation_url: null }));
  const firstRender = renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: /Keep 2 configurations.*100/ }));
  fireEvent.click(screen.getByRole('checkbox', { name: /Laptop/ }));
  fireEvent.click(screen.getByRole('button', { name: /Pay additional.*100/ }));
  await screen.findByRole('button', { name: 'Retry same payment' });
  const stored = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(stored.request).toEqual({
    action: 'top_up_next',
    target_quantity: 2,
    apply_now: false,
    future_choice: null,
    retire_configuration_ids: ['configuration-2'],
    retire_new_configuration_ordinals: []
  });
  firstRender.unmount();

  renderApp('/account');
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createBillingPayment).mock.calls[1]).toEqual([stored.idempotency_key, stored.request]);
});

test('stores the idempotency attempt before POST and retries an uncertain create with the same key', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(503)).mockResolvedValueOnce(billingPayment('payment-1', 'pending', { confirmation_url: null }));
  renderApp('/account');
  const button = await screen.findByRole('button', { name: 'Continue to payment' });
  fireEvent.click(button);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(1));
  const first = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(first.user_id).toBe(account.user_id);
  expect(first.payment_id).toBeUndefined();
  expect(window.location.href).not.toContain(first.idempotency_key);
  expect(first.request).toEqual({
    action: 'renew',
    target_quantity: 2,
    apply_now: false,
    future_choice: null,
    retire_configuration_ids: [],
    retire_new_configuration_ordinals: []
  });
  const retry = await screen.findByRole('button', { name: 'Retry same payment' });
  const lockedQuantity = retry.closest('section')!.querySelector<HTMLInputElement>('input[type="number"]')!;
  expect(lockedQuantity.disabled).toBe(true);
  fireEvent.click(retry);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createBillingPayment).mock.calls[0]?.[0]).toBe(vi.mocked(createBillingPayment).mock.calls[1]?.[0]);
  expect(vi.mocked(createBillingPayment).mock.calls[0]?.[1]).toEqual(first.request);
  expect(vi.mocked(createBillingPayment).mock.calls[1]?.[1]).toEqual(first.request);
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!).payment_id).toBe('payment-1'));
  expect(screen.getByRole('heading', { name: 'Unfinished payment' })).toBeTruthy();
  expect(screen.queryByText('Payment confirmed.')).toBeNull();
});

test.each([502, 409, 422])('HTTP %s create failure requires explicit abandonment before a new logical key', async (status) => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(status)).mockResolvedValueOnce(billingPayment('payment-new', 'pending', { confirmation_url: null }));
  const firstRender = renderApp('/account');
  const paymentButton = await screen.findByRole('button', { name: 'Continue to payment' });
  fireEvent.click(paymentButton);
  await screen.findByText(/request failed and was not accepted/i);
  expect(screen.queryByText(/result is uncertain/i)).toBeNull();
  const failedAttempt = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(failedAttempt.state).toBe('definite_failure');
  expect((paymentButton as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(paymentButton);
  expect(createBillingPayment).toHaveBeenCalledTimes(1);
  expect(JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!)).toEqual(failedAttempt);

  firstRender.unmount();
  renderApp('/account');
  await screen.findByText(/request failed and was not accepted/i);
  expect(createBillingPayment).toHaveBeenCalledTimes(1);
  expect(JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!)).toEqual(failedAttempt);

  fireEvent.click(screen.getByRole('button', { name: 'Abandon failed attempt' }));
  await screen.findByText(/failed attempt was reset/i);
  expect(sessionStorage.getItem(paymentAttemptStorageKey)).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Continue to payment' }));
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  const newKey = vi.mocked(createBillingPayment).mock.calls[1]?.[0];
  expect(newKey).not.toBe(failedAttempt.idempotency_key);
});

test('reload resumes a stored uncertain attempt with the exact same key', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(503)).mockResolvedValueOnce(billingPayment('resumed-payment', 'pending', { confirmation_url: null }));
  const firstRender = renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Continue to payment' }));
  await screen.findByRole('button', { name: 'Retry same payment' });
  const stored = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(stored.state).toBe('active');
  expect(stored.request).toEqual(vi.mocked(createBillingPayment).mock.calls[0]?.[1]);
  firstRender.unmount();

  renderApp('/account');
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createBillingPayment).mock.calls[0]?.[0]).toBe(stored.idempotency_key);
  expect(vi.mocked(createBillingPayment).mock.calls[1]?.[0]).toBe(stored.idempotency_key);
  expect(vi.mocked(createBillingPayment).mock.calls[1]?.[1]).toEqual(stored.request);
});

test('recovers one pending history item through authoritative item GET and never assumes return success', async () => {
  const pending = billingPayment('recover-1', 'pending', { created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue(pending);
  renderApp('/account');
  await waitFor(() => expect(loadBillingPayment).toHaveBeenCalledWith('recover-1'));
  expect(screen.queryByText('Payment confirmed.')).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('history loading and failure both prevent a new payment POST', async () => {
  let resolveHistory!: (payments: Array<BillingPaymentSummary>) => void;
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount());
  vi.mocked(loadBillingPayments).mockImplementation(() => new Promise((resolve) => { resolveHistory = resolve; }));
  const first = renderApp('/account');
  expect(await screen.findByText('Checking for unfinished payments…')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
  await act(async () => resolveHistory([]));
  expect(await screen.findByRole('button', { name: 'Continue to payment' })).toBeTruthy();
  first.unmount();

  vi.mocked(loadBillingPayments).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');
  expect(await screen.findByText('Payment history is unavailable. A new payment cannot be created until it is checked.')).toBeTruthy();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('one pending payment resumes only from its authoritative item URL', async () => {
  const pending = billingPayment('resume-existing', 'pending', {
    amount_kopeks: 20000,
    calculation: { version: 1, action: 'top_up_next', target_quantity: 3 },
    confirmation_url: 'https://list.example/must-not-be-used'
  });
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount());
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue({ ...pending, confirmation_url: 'https://checkout.example/resume-existing' });
  renderApp('/account');
  await waitFor(() => expect(loadBillingPayment).toHaveBeenCalledWith('resume-existing'));
  expect(await screen.findByRole('heading', { name: 'Unfinished payment' })).toBeTruthy();
  expect(screen.getByText(/200.*keep 3 configurations next period/i)).toBeTruthy();
  const resume = await screen.findByRole('link', { name: 'Continue payment' });
  expect((resume as HTMLAnchorElement).href).toBe('https://checkout.example/resume-existing');
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
  expect(sessionStorage.getItem(paymentAttemptStorageKey) ?? '').not.toContain('checkout.example');
  const historyCalls = vi.mocked(loadBillingPayments).mock.calls.length;
  const itemCalls = vi.mocked(loadBillingPayment).mock.calls.length;
  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
  await waitFor(() => expect(loadBillingPayments).toHaveBeenCalledTimes(historyCalls + 1));
  await waitFor(() => expect(loadBillingPayment).toHaveBeenCalledTimes(itemCalls + 1));
});

test('pending without a checkout URL stays in processing and never creates a replacement', async () => {
  const now = new Date().toISOString();
  const pending = billingPayment('processing-existing', 'created', { created_at: now, updated_at: now });
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount());
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue(pending);
  renderApp('/account');
  expect(await screen.findByRole('heading', { name: 'Unfinished payment' })).toBeTruthy();
  expect(screen.getByText('The payment has not been completed yet.')).toBeTruthy();
  expect(screen.getByText(/provider will eventually close or cancel it/i)).toBeTruthy();
  expect(screen.queryByRole('link', { name: 'Continue payment' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('multiple pending payments block both resume and new payment creation', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValue([billingPayment('one', 'created'), billingPayment('two', 'pending')]);
  renderApp('/account');
  expect(await screen.findByRole('heading', { name: 'Unfinished payment' })).toBeTruthy();
  expect(screen.getByText('More than one unfinished payment exists. Refresh or check payment history; no success is assumed.')).toBeTruthy();
  expect(loadBillingPayment).not.toHaveBeenCalled();
  expect(createBillingPayment).not.toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Continue to payment' })).toBeNull();
  expect((screen.getByRole('button', { name: 'Change selection' }) as HTMLButtonElement).disabled).toBe(true);
});

test('safe unfinished q3 top-up keeps retirement reselection available', async () => {
  const pending = billingPayment('safe-q3', 'pending', {
    amount_kopeks: 20000, quantity_before: 1, quantity_after: 3,
    calculation: { version: 1, action: 'top_up_next', target_quantity: 3 },
    confirmation_url: 'https://list.example/not-authoritative'
  });
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue({ ...pending, confirmation_url: 'https://checkout.example/safe-q3' });
  renderApp('/account');

  const resume = await screen.findByRole('link', { name: 'Continue payment' });
  expect((resume as HTMLAnchorElement).href).toBe('https://checkout.example/safe-q3');
  expect(screen.getByText(/200.*keep 3 configurations next period/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Pay additional|Continue to payment/ })).toBeNull();
  expect(screen.getByText(/You can still change which configurations/)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Change selection' }) as HTMLButtonElement).disabled).toBe(false);
});

test('conflicting unfinished q2 top-up disables retirement reselection', async () => {
  const pending = billingPayment('unsafe-q2', 'pending', {
    amount_kopeks: 10000, quantity_before: 1, quantity_after: 2,
    calculation: { version: 1, action: 'top_up_next', target_quantity: 2 }
  });
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue(pending);
  renderApp('/account');

  expect(await screen.findByRole('heading', { name: 'Unfinished payment' })).toBeTruthy();
  expect(screen.getByText(/selection cannot be changed while this payment is unfinished/i)).toBeTruthy();
  expect((screen.getByRole('button', { name: 'Change selection' }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.queryByRole('button', { name: /Pay additional|Continue to payment/ })).toBeNull();
});

test('an open retirement editor becomes non-submittable when the pending payment becomes conflicting', async () => {
  const safe = billingPayment('changing-authority', 'pending', {
    amount_kopeks: 20000, quantity_before: 1, quantity_after: 3,
    calculation: { version: 1, action: 'top_up_next', target_quantity: 3 }
  });
  const conflicting = {
    ...safe,
    amount_kopeks: 10000,
    quantity_after: 2,
    calculation: { version: 1, action: 'top_up_next', target_quantity: 2 }
  };
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValueOnce([safe]).mockResolvedValue([conflicting]);
  vi.mocked(loadBillingPayment).mockResolvedValueOnce(safe).mockResolvedValue(conflicting);
  renderApp('/account');

  const changeSelection = await screen.findByRole('button', { name: 'Change selection' }) as HTMLButtonElement;
  await waitFor(() => expect(loadBillingPayment).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(changeSelection.disabled).toBe(false));
  fireEvent.click(changeSelection);
  const save = screen.getByRole('button', { name: 'Save scheduled configurations' }) as HTMLButtonElement;
  expect(save.disabled).toBe(false);

  fireEvent.click(screen.getByRole('button', { name: 'Check status' }));
  await waitFor(() => expect(save.disabled).toBe(true));
  fireEvent.click(save);
  expect(updateBillingPendingRetirements).not.toHaveBeenCalled();
  expect(screen.getByText(/selection cannot be changed while this payment is unfinished/i)).toBeTruthy();
});

test('terminal canceled refresh removes unfinished state and restores ordinary actions', async () => {
  const pending = billingPayment('later-canceled', 'pending', {
    amount_kopeks: 20000, calculation: { version: 1, action: 'top_up_next', target_quantity: 3 }
  });
  const canceled = { ...pending, status: 'canceled' as const, updated_at: '2026-09-20T00:00:00Z' };
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('active_paid', {
    slot_quantity: 3, monthly_amount_kopeks: 49900,
    pending_slot_quantity: 1, pending_period_start: '2026-10-01T00:00:00Z',
    pending_period_end: '2026-11-01T00:00:00Z', pending_monthly_amount_kopeks: 29900,
    retirement_configuration_ids: ['configuration-1', 'configuration-2'], can_renew: false, can_add_devices_now: false
  }));
  vi.mocked(loadConfigurations).mockResolvedValue([...configurations, configurationThree]);
  vi.mocked(loadBillingPayments).mockResolvedValueOnce([pending]).mockResolvedValue([canceled]);
  vi.mocked(loadBillingPayment).mockResolvedValueOnce(pending).mockResolvedValue(canceled);
  renderApp('/account');

  await screen.findByRole('heading', { name: 'Unfinished payment' });
  const checkStatus = screen.getByRole('button', { name: 'Check status' }) as HTMLButtonElement;
  await waitFor(() => expect(checkStatus.disabled).toBe(false));
  fireEvent.click(checkStatus);
  await waitFor(() => expect(screen.queryByRole('heading', { name: 'Unfinished payment' })).toBeNull());
  expect(await screen.findByRole('button', { name: /Keep 2 configurations.*100/ })).toBeTruthy();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('Refresh reports checking, unchanged, changed, and error states', async () => {
  const original = billingPayment('history-one', 'canceled');
  let resolveRefresh!: (payments: Array<BillingPaymentSummary>) => void;
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount());
  vi.mocked(loadBillingPayments).mockResolvedValueOnce([original]).mockImplementationOnce(() => new Promise((resolve) => { resolveRefresh = resolve; }));
  renderApp('/account');
  await screen.findByRole('button', { name: 'Continue to payment' });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Checking…')).toBeTruthy();
  await act(async () => resolveRefresh([original]));
  expect(await screen.findByText('Checked just now.')).toBeTruthy();

  vi.mocked(loadBillingPayments).mockResolvedValueOnce([{ ...original, status: 'succeeded', updated_at: '2026-01-01T00:00:01Z' }]);
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Payment status changed.')).toBeTruthy();

  vi.mocked(loadBillingPayments).mockRejectedValueOnce(new AccessApiError(503));
  fireEvent.click(screen.getByRole('button', { name: 'Refresh' }));
  expect(await screen.findByText('Unable to check payment status. Try again.')).toBeTruthy();
});

test('payment history localizes every supported status instead of rendering raw API values', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount());
  vi.mocked(loadBillingPayments).mockResolvedValue([
    billingPayment('created', 'created'), billingPayment('pending', 'pending'),
    billingPayment('succeeded', 'succeeded'), billingPayment('canceled', 'canceled')
  ]);
  renderApp('/account');
  await waitFor(() => expect(screen.getByText('Payment history').closest('details')?.textContent).toContain('Processing'));
  const history = screen.getByText('Payment history').closest('details')!;
  const text = history.textContent ?? '';
  for (const label of ['Created', 'Processing', 'Paid', 'Canceled']) expect(text).toContain(label);
  for (const raw of [' · created · ', ' · pending · ', ' · succeeded · ', ' · canceled · ']) expect(text).not.toContain(raw);
});

test('reconciles a stored payment id and clears the current-user attempt only after terminal backend truth', async () => {
  sessionStorage.setItem(paymentAttemptStorageKey, JSON.stringify({ version: 3, state: 'active', user_id: account.user_id, idempotency_key: 'stored-key', started_at: Date.now(), payment_id: 'stored-payment' }));
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  vi.mocked(loadBillingPayment).mockResolvedValue(billingPayment('stored-payment', 'succeeded', { provider_status: 'succeeded', updated_at: '2026-01-01T00:00:01Z', succeeded_at: '2026-01-01T00:00:01Z' }));
  renderApp('/account');
  expect(await screen.findByText('Payment confirmed.')).toBeTruthy();
  expect(sessionStorage.getItem(paymentAttemptStorageKey)).toBeNull();
});

test('401 from account data replace-navigates to login', async () => {
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadConfigurations).mockRejectedValue(new AccessApiError(401));
  renderApp('/account');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
});

test('routing catalog loading does not block Configuration cards and exposes no fabricated locations', async () => {
  vi.mocked(loadRoutingExits).mockImplementation(() => new Promise(() => {}));
  renderApp('/account');

  expect(await screen.findByText('Configuration #7')).toBeTruthy();
  expect(screen.getAllByText('Locations are temporarily unavailable.')).toHaveLength(2);
  expect(screen.queryByRole('combobox', { name: 'Forced location' })).toBeNull();
  expect(document.body.textContent).not.toMatch(/Exit 1|selector 1|cs1|egress1|vpn1/i);
});

test('routing catalog failure keeps cards visible and exposes no fabricated locations', async () => {
  vi.mocked(loadRoutingExits).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');

  expect(await screen.findByText('Configuration #7')).toBeTruthy();
  expect(await screen.findAllByText('Locations are temporarily unavailable.')).toHaveLength(2);
  expect(screen.queryByRole('combobox', { name: 'Forced location' })).toBeNull();
  expect(document.body.textContent).not.toMatch(/Exit 1|selector 1|cs1|egress1|vpn1/i);
});

test('malformed routing catalog exposes no fabricated locations', async () => {
  vi.mocked(loadRoutingExits).mockResolvedValue({
    generated_at: '2026-09-29T10:00:00Z',
    observed_at: '2026-09-29T10:00:00Z',
    exits: [
      { selector: 1, display_name: 'Location Alpha' },
      { selector: 1, display_name: 'Duplicated selector' },
      { selector: 3, display_name: 'Location Gamma' },
      { selector: 4, display_name: 'Location Delta' },
      { selector: 5, display_name: 'Location Epsilon' }
    ]
  });
  renderApp('/account');

  expect(await screen.findByText('Configuration #7')).toBeTruthy();
  expect(screen.getAllByText('Locations are temporarily unavailable.')).toHaveLength(2);
  expect(screen.queryByRole('combobox', { name: 'Forced location' })).toBeNull();
  expect(document.body.textContent).not.toMatch(/Exit 1|selector 1|cs1|egress1|vpn1/i);
});

test('valid catalog renders only backend location names and applies the selected selector', async () => {
  renderApp('/account');
  const routing = (await screen.findAllByRole('region', { name: 'Routing' }))[0]!;
  const select = await within(routing).findByRole('combobox', { name: 'Forced location' });
  expect(within(select).getByRole('option', { name: 'Location Alpha' })).toBeTruthy();
  expect(within(select).getByRole('option', { name: 'Location Epsilon' })).toBeTruthy();

  fireEvent.change(select, { target: { value: '3' } });
  fireEvent.click(within(routing).getByRole('button', { name: 'Apply' }));

  await waitFor(() => expect(updateConfigurationRouting).toHaveBeenCalledWith(
    'configuration-1',
    { mode: 'forced', selector: 3 }
  ));
});

test('an active forced Configuration can directly request a different catalog location', async () => {
  vi.mocked(loadConfigurations).mockResolvedValue([{
    ...configurations[0]!,
    forced_selector: 2,
    forced_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    routing_mode: 'forced'
  }]);
  renderApp('/account');
  const routing = await screen.findByRole('region', { name: 'Routing' });
  expect(await within(routing).findByText(/Location Beta · .* min remaining/)).toBeTruthy();
  const select = within(routing).getByRole('combobox', { name: 'Forced location' });
  fireEvent.change(select, { target: { value: '5' } });
  fireEvent.click(within(routing).getByRole('button', { name: 'Apply' }));

  await waitFor(() => expect(updateConfigurationRouting).toHaveBeenCalledWith(
    'configuration-1',
    { mode: 'forced', selector: 5 }
  ));
});

test('unresolved forced selector against a valid catalog has no numeric or technical fallback', async () => {
  vi.mocked(loadConfigurations).mockResolvedValue([{
    ...configurations[0]!,
    forced_selector: 17,
    forced_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    routing_mode: 'forced'
  }]);
  renderApp('/account');

  const routing = await screen.findByRole('region', { name: 'Routing' });
  expect(within(routing).getByText('Selected location unavailable.')).toBeTruthy();
  expect(routing.textContent).not.toContain('17');
  expect(await within(routing).findByRole('combobox', { name: 'Forced location' })).toBeTruthy();
  expect(routing.textContent).not.toMatch(/selector|cs17|egress17|vpn17/i);
});

test('Return to Automatic remains available while the routing catalog is unavailable', async () => {
  vi.mocked(loadConfigurations).mockResolvedValue([{
    ...configurations[0]!,
    forced_selector: 2,
    forced_until: new Date(Date.now() + 20 * 60 * 1000).toISOString(),
    routing_mode: 'forced'
  }]);
  vi.mocked(loadRoutingExits).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');

  const routing = await screen.findByRole('region', { name: 'Routing' });
  expect(within(routing).getByText('Selected location unavailable.')).toBeTruthy();
  expect(within(routing).queryByRole('combobox')).toBeNull();

  fireEvent.click(within(routing).getByRole('button', { name: 'Return to Automatic' }));
  await waitFor(() => expect(updateConfigurationRouting).toHaveBeenCalledWith(
    'configuration-1',
    { mode: 'automatic' }
  ));
});

test('a pending routing mutation is single-flight and preserves the last known state', async () => {
  let resolveMutation!: (value: ConfigurationSummary) => void;
  vi.mocked(updateConfigurationRouting).mockImplementation(() => new Promise((resolve) => { resolveMutation = resolve; }));
  renderApp('/account');
  const routing = (await screen.findAllByRole('region', { name: 'Routing' }))[0]!;
  const select = await within(routing).findByRole('combobox', { name: 'Forced location' });
  fireEvent.change(select, { target: { value: '4' } });
  const apply = within(routing).getByRole('button', { name: 'Apply' });
  await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(apply);
  await waitFor(() => expect(updateConfigurationRouting).toHaveBeenCalledTimes(1));
  await waitFor(() => expect((apply as HTMLButtonElement).disabled).toBe(true));
  fireEvent.click(apply);

  expect(updateConfigurationRouting).toHaveBeenCalledTimes(1);
  expect(within(routing).getByText('Automatic routing is active.')).toBeTruthy();

  resolveMutation({
    ...configurations[0]!,
    routing_mode: 'forced',
    forced_selector: 4,
    forced_until: new Date(Date.now() + 30 * 60 * 1000).toISOString()
  });
  await waitFor(() => expect(updateConfigurationRouting).toHaveBeenCalledTimes(1));
});

test('routing mutation failure stays local and preserves both Configuration states', async () => {
  vi.mocked(updateConfigurationRouting).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');
  const routingCards = await screen.findAllByRole('region', { name: 'Routing' });
  const first = routingCards[0]!;
  const second = routingCards[1]!;
  fireEvent.change(await within(first).findByRole('combobox'), { target: { value: '2' } });
  fireEvent.click(within(first).getByRole('button', { name: 'Apply' }));

  expect((await within(first).findByRole('alert')).textContent).toBe('Unable to update routing.');
  expect(within(first).getByText('Automatic routing is active.')).toBeTruthy();
  expect(within(second).getByText('Automatic routing is active.')).toBeTruthy();
  expect(within(second).queryByRole('alert')).toBeNull();
});

test('forced countdown uses forced_until, updates by minute boundary, and refetches once at expiry', async () => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  const start = new Date('2026-09-29T10:00:00Z');
  vi.setSystemTime(start);
  const forced = {
    ...configurations[0]!,
    routing_mode: 'forced' as const,
    forced_selector: 2,
    forced_until: new Date(start.getTime() + 61000).toISOString()
  };
  vi.mocked(loadConfigurations).mockResolvedValue([forced]);
  renderApp('/account');
  const routing = await screen.findByRole('region', { name: 'Routing' });
  expect(await within(routing).findByText('Location Beta · 2 min remaining')).toBeTruthy();

  await act(async () => { await vi.advanceTimersByTimeAsync(1000); });
  expect(within(routing).getByText('Location Beta · 1 min remaining')).toBeTruthy();
  const callsBeforeExpiry = vi.mocked(loadConfigurations).mock.calls.length;

  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(within(routing).getByText('Automatic routing is active.')).toBeTruthy();
  await waitFor(() => expect(loadConfigurations).toHaveBeenCalledTimes(callsBeforeExpiry + 1));
});

test('routing catalog 401 follows the existing session-expired path', async () => {
  vi.mocked(loadRoutingExits).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access'] });
});

test('renders each logical configuration once with both variants, backend ordinal, and one common quota', async () => {
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
  expect(screen.getByText('Secret Studio')).toBeTruthy();
  expect(screen.getByText('Configuration #7')).toBeTruthy();
  expect(screen.getByText('Configuration #9 · Laptop')).toBeTruthy();
  expect(screen.getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getByRole('button', { name: 'Download WireGuard config' })).toBeTruthy();
  expect(screen.getByRole('button', { name: 'Download AmneziaWG config' })).toBeTruthy();
  expect(screen.getAllByText('Configurations: 2 / 3')).toHaveLength(1);
  expect(screen.queryByRole('link', { name: /Download .* config/ })).toBeNull();
  expect(screen.queryByRole('button', { name: /disable|revoke/i })).toBeNull();
  expect(screen.queryByRole('button', { name: /reissue/i })).toBeNull();

  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));
  await waitFor(() => expect(vi.mocked(createConfiguration)).toHaveBeenCalledWith('grant-1'));
});

test('billing-managed commercial grant never exposes generic Add configuration', async () => {
  vi.mocked(loadAccount).mockResolvedValue(commercialAccount('trial'));
  renderApp('/account');
  await screen.findByRole('heading', { name: 'Current trial period' });
  expect(screen.queryByRole('button', { name: 'Add configuration' })).toBeNull();
});

test('admin-managed pilot grant still exposes generic Add configuration when authorized', async () => {
  renderApp('/account');
  expect(await screen.findByRole('button', { name: 'Add configuration' })).toBeTruthy();
});

test('requests a temporary config download URL and navigates to it', async () => {
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#config-download');
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  await waitFor(() => expect(createProfileConfigDownload).toHaveBeenCalledWith('wg-1'));
  await waitFor(() => expect(window.location.hash).toBe('#config-download'));
});

test('AmneziaWG uses the same temporary URL and browser navigation flow', async () => {
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#awg-config-download');
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Download AmneziaWG config' }));
  await waitFor(() => expect(createProfileConfigDownload).toHaveBeenCalledWith('awg-1'));
  await waitFor(() => expect(window.location.hash).toBe('#awg-config-download'));
});

test('suppresses download and QR actions for both unavailable or not-ready variants', async () => {
  renderApp('/account');
  await screen.findByText('Configuration #9 · Laptop');
  for (const protocol of ['WireGuard', 'AmneziaWG']) {
    const variant = screen.getByRole('region', { name: `${protocol} · Configuration #9` });
    expect(within(variant).queryByRole('button', { name: /Download .* config/ })).toBeNull();
    expect(within(variant).queryByRole('button', { name: /Show .* QR/ })).toBeNull();
  }
});

test('shows an error when the temporary config download cannot be created', async () => {
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(503));
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to download the configuration.');
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('config download 401 follows the existing session-expired path', async () => {
  vi.mocked(createProfileConfigDownload).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  fireEvent.click(await screen.findByRole('button', { name: 'Download WireGuard config' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access'] });
});

test('opens the WireGuard QR in the page dialog and closes it without navigation', async () => {
  renderApp('/account');
  const showQr = await screen.findByRole('button', { name: 'Show WireGuard QR' });

  fireEvent.click(showQr);
  const dialog = screen.getByRole('dialog', { name: 'QR code for WireGuard · Configuration #7' });
  expect(screen.getByText('Loading QR code…')).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/wg-1/qr.svg',
    expect.objectContaining({ credentials: 'same-origin' })
  ));
  const image = await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
  expect(image.getAttribute('src')).toBe('blob:profile-qr');
  expect(createObjectUrlMock).toHaveBeenCalledTimes(1);
  expect(createObjectUrlMock.mock.calls[0]![0].type).toBe('image/svg+xml');
  expect(screen.getByTestId('location').textContent).toBe('/account');
  fireEvent.click(dialog);
  expect(screen.getByRole('dialog')).toBeTruthy();

  fireEvent.keyDown(document, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);
  expect(revokeObjectUrlMock).toHaveBeenCalledWith('blob:profile-qr');

  fireEvent.click(showQr);
  await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
  fireEvent.click(screen.getByRole('button', { name: 'Close QR code' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);

  fireEvent.click(showQr);
  await screen.findByRole('img', { name: 'QR code for WireGuard · Configuration #7' });
  fireEvent.click(screen.getByRole('dialog').parentElement!);
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(document.activeElement).toBe(showQr);
});

test('AmneziaWG QR uses its own profile ID and identifies its protocol', async () => {
  renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Show AmneziaWG QR' }));
  expect(await screen.findByRole('dialog', { name: 'QR code for AmneziaWG · Configuration #7' })).toBeTruthy();
  await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
    '/v2/account/profiles/awg-1/qr.svg',
    expect.objectContaining({ credentials: 'same-origin' })
  ));
});

test('shows a localized QR error without rendering a broken image', async () => {
  fetchMock.mockResolvedValueOnce({ ok: false, status: 503, text: async () => '' } as Response);
  renderApp('/account');

  fireEvent.click(await screen.findByRole('button', { name: 'Show WireGuard QR' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to load the QR code.');
  expect(screen.queryByRole('img', { name: 'QR code for WireGuard · Configuration #7' })).toBeNull();
  expect(createObjectUrlMock).not.toHaveBeenCalled();
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('hides Add configuration when the common quota denies creation', async () => {
  vi.mocked(loadAccount).mockResolvedValue({
    ...account,
    grants: [{
      ...account.grants[0]!,
      can_create_configuration: false,
      configuration_count: 3,
      configuration_limit: 3,
      protocol_limits: [{ can_create: false, profile_count: 3, profile_limit: 3, protocol: 'wireguard' }]
    }]
  });
  renderApp('/account');

  await screen.findByText('Configurations: 3 / 3');
  expect(screen.queryByRole('button', { name: 'Add configuration' })).toBeNull();
});

test('configuration creation 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(createConfiguration).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access'] });
});

test('configuration creation 403 shows the session-validation message', async () => {
  vi.mocked(createConfiguration).mockRejectedValue(new AccessApiError(403));
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Add configuration' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Session validation failed. Sign in again.');
});

test('logout 401 clears account state and replace-navigates to login', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(401));
  const { queryClient } = renderApp('/account');
  const removeQueries = vi.spyOn(queryClient, 'removeQueries');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/'));
  expect(removeQueries).toHaveBeenCalledWith({ queryKey: ['access'] });
});

test('non-401 logout failure keeps the account page and shows its error', async () => {
  vi.mocked(logout).mockRejectedValue(new AccessApiError(500));
  renderApp('/account');

  await screen.findByText('Configurations: 2 / 3');
  fireEvent.click(screen.getByRole('button', { name: 'Logout' }));

  expect((await screen.findByRole('alert')).textContent).toBe('Unable to sign out.');
  expect(screen.getByTestId('location').textContent).toBe('/account');
});

test('loads, saves, changes, and clears the optional display name, including an empty value', async () => {
  renderApp('/account');
  const input = await screen.findByLabelText('Name');
  expect((input as HTMLInputElement).value).toBe('Mitya');

  fireEvent.change(input, { target: { value: '  Studio user  ' } });
  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateDisplayName).toHaveBeenCalledWith('Studio user'));
  expect((input as HTMLInputElement).value).toBe('Studio user');

  fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[0]!);
  await waitFor(() => expect(updateDisplayName).toHaveBeenLastCalledWith(null));
  expect((input as HTMLInputElement).value).toBe('');

  fireEvent.click(screen.getByRole('button', { name: 'Save' }));
  await waitFor(() => expect(updateDisplayName).toHaveBeenLastCalledWith(null));
});

test('adds, edits, and clears only the selected configuration label by slot ID', async () => {
  renderApp('/account');
  await screen.findByText('Configuration #7');
  fireEvent.click(screen.getByRole('button', { name: 'Add name' }));
  const input = screen.getByLabelText('Configuration name: configuration-1');
  fireEvent.change(input, { target: { value: 'My phone' } });
  fireEvent.click(screen.getAllByRole('button', { name: 'Save' })[1]!);
  await waitFor(() => expect(updateConfigurationLabel).toHaveBeenCalledWith('configuration-1', 'My phone'));
  expect(screen.getByText('Configuration #7 · My phone')).not.toBeNull();
  expect(screen.getByText('Configuration #9 · Laptop')).not.toBeNull();

  fireEvent.click(screen.getAllByRole('button', { name: 'Edit name' })[0]!);
  fireEvent.click(screen.getAllByRole('button', { name: 'Clear' })[1]!);
  await waitFor(() => expect(updateConfigurationLabel).toHaveBeenLastCalledWith('configuration-1', null));
  expect(screen.getByText('Configuration #7')).not.toBeNull();
  expect(screen.getByText('Configuration #9 · Laptop')).not.toBeNull();
});

test('refetches account and configurations through TanStack Query when focus returns', async () => {
  renderApp('/account');
  await screen.findByText('Configurations: 2 / 3');
  expect(loadAccount).toHaveBeenCalledTimes(1);
  expect(loadConfigurations).toHaveBeenCalledTimes(1);

  focusManager.setFocused(false);
  focusManager.setFocused(true);
  await waitFor(() => expect(loadAccount).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(loadConfigurations).toHaveBeenCalledTimes(2));
  focusManager.setFocused(undefined);
});

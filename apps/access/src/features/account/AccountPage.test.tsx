import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { focusManager } from '@tanstack/react-query';
import type { AccountMeResponse, ConfigurationSummary, ReferralInviteSummary } from '@wg-paid/api';
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
  loadReferrals,
  logout,
  reissueReferral,
  revokeReferral,
  updateDisplayName,
  updateConfigurationLabel
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
    loadReferrals: vi.fn(),
    createReferral: vi.fn(),
    reissueReferral: vi.fn(),
    revokeReferral: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn(),
    updateDisplayName: vi.fn(),
    updateConfigurationLabel: vi.fn()
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
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.2', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-1', status: 'active', ready: true, tunnel_ip: '10.0.0.3', created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  },
  {
    access_grant_id: 'grant-1', configuration_id: 'configuration-2', ordinal: 9, label: 'Laptop',
    created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
    variants: [
      { protocol: 'wireguard', profile_id: 'wg-2', status: 'provisioning_failed', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' },
      { protocol: 'amneziawg', profile_id: 'awg-2', status: 'active', ready: false, tunnel_ip: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z' }
    ]
  }
];

const qrSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0 0h100v100H0z"/></svg>';
const fetchMock = vi.fn<typeof fetch>();
const createObjectUrlMock = vi.fn<(blob: Blob) => string>();
const revokeObjectUrlMock = vi.fn<(url: string) => void>();

beforeEach(() => {
  vi.clearAllMocks();
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
  vi.mocked(loadBillingPayments).mockResolvedValue([]);
  vi.mocked(loadBillingPayment).mockImplementation(async (paymentId) => ({ payment_id: paymentId, status: 'pending', provider_status: null, kind: 'initial', amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), succeeded_at: null }));
  vi.mocked(loadReferrals).mockResolvedValue([]);
  vi.mocked(createConfiguration).mockResolvedValue();
  vi.mocked(createProfileConfigDownload).mockResolvedValue('#config-download');
  vi.mocked(updateDisplayName).mockImplementation(async (displayName) => ({ ...account, display_name: displayName }));
  vi.mocked(updateConfigurationLabel).mockImplementation(async (configurationId, label) => ({
    ...configurations.find((configuration) => configuration.configuration_id === configurationId)!,
    label,
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
  expect(await screen.findByText('Copied')).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(1500); });
  expect(screen.queryByText('Copied')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Copy' }));
  expect(await screen.findByText('Copy failed. Select and copy the URL manually.')).toBeTruthy();
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
  expect(loadBillingPayments).not.toHaveBeenCalled();
});

test('fails safely for an unknown runtime surface instead of inferring from billing', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'unexpected' } as unknown as AccountMeResponse);
  renderApp('/account');
  expect((await screen.findByRole('alert')).textContent).toBe('This account type is not supported.');
  expect(screen.queryByText('Access and billing')).toBeNull();
});

test.each([
  ['active_paid', 'Access paid', 'Renew for one month'],
  ['expired', 'Access expired', 'Pay for one month']
] as const)('renders backend commercial %s terms and permitted action', async (status, label, action) => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status, current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 4, monthly_amount_kopeks: 123400, currency: 'RUB' } });
  renderApp('/account');
  expect(await screen.findByText(label)).toBeTruthy();
  expect(screen.getByText(/4 device slot/)).toBeTruthy();
  expect(screen.getByText(/1[,. ]?234/)).toBeTruthy();
  expect(screen.getByRole('button', { name: action })).toBeTruthy();
});

test('past-due commercial account has no payment action and cannot POST', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'past_due', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  renderApp('/account');
  expect(await screen.findByText('Payment overdue')).toBeTruthy();
  expect(screen.getByText(/new payment is unavailable/i)).toBeTruthy();
  expect(screen.queryByRole('button', { name: /Pay for|Renew/ })).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('stores the idempotency attempt before POST and retries an uncertain create with the same key', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'trial', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(503)).mockResolvedValueOnce({ payment_id: 'payment-1', status: 'pending', provider_status: null, kind: 'initial', amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', succeeded_at: null, confirmation_url: null });
  renderApp('/account');
  const button = await screen.findByRole('button', { name: 'Pay for one month' });
  fireEvent.click(button);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(1));
  const first = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(first.user_id).toBe(account.user_id);
  expect(first.payment_id).toBeUndefined();
  expect(window.location.href).not.toContain(first.idempotency_key);
  await screen.findByText(/result is uncertain/i);
  fireEvent.click(button);
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createBillingPayment).mock.calls[0]?.[0]).toBe(vi.mocked(createBillingPayment).mock.calls[1]?.[0]);
  await waitFor(() => expect(JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!).payment_id).toBe('payment-1'));
  expect(screen.getByText(/processing/i)).toBeTruthy();
  expect(screen.queryByText('Payment confirmed.')).toBeNull();
});

test.each([502, 409])('HTTP %s create failure requires explicit abandonment before a new logical key', async (status) => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'trial', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(status)).mockResolvedValueOnce({ payment_id: 'payment-new', status: 'pending', provider_status: null, kind: 'initial', amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', succeeded_at: null, confirmation_url: null });
  const firstRender = renderApp('/account');
  const paymentButton = await screen.findByRole('button', { name: 'Pay for one month' });
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
  fireEvent.click(screen.getByRole('button', { name: 'Pay for one month' }));
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  const newKey = vi.mocked(createBillingPayment).mock.calls[1]?.[0];
  expect(newKey).not.toBe(failedAttempt.idempotency_key);
});

test('reload resumes a stored uncertain attempt with the exact same key', async () => {
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'trial', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  vi.mocked(createBillingPayment).mockRejectedValueOnce(new AccessApiError(503)).mockResolvedValueOnce({ payment_id: 'resumed-payment', status: 'pending', provider_status: null, kind: 'initial', amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z', succeeded_at: null, confirmation_url: null });
  const firstRender = renderApp('/account');
  fireEvent.click(await screen.findByRole('button', { name: 'Pay for one month' }));
  await screen.findByText(/result is uncertain/i);
  const stored = JSON.parse(sessionStorage.getItem(paymentAttemptStorageKey)!);
  expect(stored.state).toBe('active');
  firstRender.unmount();

  renderApp('/account');
  await waitFor(() => expect(createBillingPayment).toHaveBeenCalledTimes(2));
  expect(vi.mocked(createBillingPayment).mock.calls[0]?.[0]).toBe(stored.idempotency_key);
  expect(vi.mocked(createBillingPayment).mock.calls[1]?.[0]).toBe(stored.idempotency_key);
});

test('recovers one pending history item through authoritative item GET and never assumes return success', async () => {
  const pending = { payment_id: 'recover-1', status: 'pending' as const, provider_status: null, kind: 'initial' as const, amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), succeeded_at: null };
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'trial', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  vi.mocked(loadBillingPayments).mockResolvedValue([pending]);
  vi.mocked(loadBillingPayment).mockResolvedValue(pending);
  renderApp('/account');
  await waitFor(() => expect(loadBillingPayment).toHaveBeenCalledWith('recover-1'));
  expect(screen.queryByText('Payment confirmed.')).toBeNull();
  expect(createBillingPayment).not.toHaveBeenCalled();
});

test('reconciles a stored payment id and clears the current-user attempt only after terminal backend truth', async () => {
  sessionStorage.setItem(paymentAttemptStorageKey, JSON.stringify({ version: 2, state: 'active', user_id: account.user_id, idempotency_key: 'stored-key', started_at: Date.now(), payment_id: 'stored-payment' }));
  vi.mocked(loadAccount).mockResolvedValue({ ...account, account_surface: 'commercial', billing: { status: 'trial', current_period_start: '2026-01-01T00:00:00Z', current_period_end: '2026-02-01T00:00:00Z', slot_quantity: 2, monthly_amount_kopeks: 99000, currency: 'RUB' } });
  vi.mocked(loadBillingPayment).mockResolvedValue({ payment_id: 'stored-payment', status: 'succeeded', provider_status: 'succeeded', kind: 'initial', amount_kopeks: 99000, currency: 'RUB', target_period_start: null, target_period_end: null, created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:01Z', succeeded_at: '2026-01-01T00:00:01Z' });
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

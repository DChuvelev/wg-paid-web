import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import type { InviteInspectResponse } from '@wg-paid/api';
import {
  AccessApiError,
  changeInviteEmail,
  consumeMagicLink,
  inspectInvite,
  loadAccount,
  loadConfigurations,
  redeemInvite,
  requestLogin,
  resendInvite,
  updateDisplayName,
  updateConfigurationLabel
} from '../../lib/accessApi';
import { renderApp } from '../../test/renderApp';

vi.mock('../../lib/accessApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/accessApi')>();
  return {
    ...actual,
    changeInviteEmail: vi.fn(),
    consumeMagicLink: vi.fn(),
    createConfiguration: vi.fn(),
    inspectInvite: vi.fn(),
    loadAccount: vi.fn(),
    loadConfigurations: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn(),
    resendInvite: vi.fn(),
    updateDisplayName: vi.fn(),
    updateConfigurationLabel: vi.fn()
  };
});

const account = {
  account_surface: 'pilot' as const,
  billing: null,
  display_name: null,
  email: 'person@example.test',
  grants: [],
  referrals: { active_count: 0, can_create: false, enabled: false, limit: 3, remaining_count: 3 },
  user_id: 'user-1'
};
const activeInvite: InviteInspectResponse = {
  can_change_email: false,
  can_resend: false,
  email_bound: false,
  magic_link_expires_at: null,
  magic_link_sent_at: null,
  pending_email_masked: null,
  resend_available_at: null,
  state: 'active'
};
const pendingInvite: InviteInspectResponse = {
  can_change_email: true,
  can_resend: false,
  email_bound: false,
  magic_link_expires_at: '2099-01-01T00:15:00Z',
  magic_link_sent_at: '2099-01-01T00:00:00Z',
  pending_email_masked: 'n***@example.test',
  resend_available_at: '2099-01-01T00:01:00Z',
  state: 'awaiting_confirmation'
};

function openInvite() {
  window.history.replaceState({}, '', '/invite#token=invite-test-token');
  return renderApp('/invite');
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadConfigurations).mockResolvedValue([]);
  vi.mocked(requestLogin).mockResolvedValue(202);
  vi.mocked(inspectInvite).mockResolvedValue(activeInvite);
  vi.mocked(redeemInvite).mockResolvedValue(202);
  vi.mocked(resendInvite).mockResolvedValue();
  vi.mocked(changeInviteEmail).mockResolvedValue();
  vi.mocked(consumeMagicLink).mockResolvedValue(200);
  vi.mocked(updateDisplayName).mockResolvedValue(account);
  vi.mocked(updateConfigurationLabel).mockRejectedValue(new Error('not used'));
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.clearAllMocks();
  vi.useRealTimers();
  window.history.replaceState({}, '', '/');
});

test('login 202 transitions to a clear anti-enumerating mail-requested state', async () => {
  renderApp('/');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

  await screen.findByRole('heading', { name: 'Email requested ✓' });
  expect(screen.getByText('A sign-in link was requested for unknown@example.test.')).not.toBeNull();
  expect(screen.getByText('Check your inbox and Spam folder.')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Send sign-in link' })).toBeNull();
  expect(vi.mocked(requestLogin)).toHaveBeenCalledOnce();
});

test('login does not expose navigation to the bare invite route in either locale', async () => {
  renderApp('/');

  await screen.findByRole('heading', { name: 'Sign in' });
  expect(screen.queryByRole('link', { name: 'Register with an invitation' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'RU' }));
  expect(screen.queryByRole('link', { name: 'Зарегистрироваться по приглашению' })).toBeNull();
  expect(screen.getByTestId('location').textContent).toBe('/');
});

test('invite without a fragment token is invalid and has no registration form', async () => {
  renderApp('/invite');

  await screen.findByText('This invitation link is invalid.');
  expect(screen.queryByRole('button', { name: 'Continue registration' })).toBeNull();
  expect(vi.mocked(inspectInvite)).not.toHaveBeenCalled();
  expect(vi.mocked(redeemInvite)).not.toHaveBeenCalled();
});

test('inspect active shows email entry and the fragment token stays memory-only', async () => {
  openInvite();

  await screen.findByRole('button', { name: 'Continue registration' });
  expect(screen.getByText('Enter your email address to register.')).not.toBeNull();
  await waitFor(() => expect(window.location.hash).toBe(''));
  expect(inspectInvite).toHaveBeenCalledWith('invite-test-token');
  expect(document.body.textContent).not.toContain('invite-test-token');
});

test('active invite email entry uses concise Russian registration copy', async () => {
  openInvite();

  await screen.findByRole('button', { name: 'Continue registration' });
  fireEvent.click(screen.getByRole('button', { name: 'RU' }));
  expect(screen.getByText('Введите адрес электронной почты для регистрации.')).not.toBeNull();
});

test('first redeem requires confirmation and change/cancel does not call the API', async () => {
  openInvite();
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue registration' }));

  const dialog = await screen.findByRole('dialog', { name: 'Check the email address' });
  expect(within(dialog).getByText('new@example.test')).not.toBeNull();
  expect(redeemInvite).not.toHaveBeenCalled();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Change' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(redeemInvite).not.toHaveBeenCalled();
});

test('confirmed first send calls redeem once, re-inspects, and replaces the ordinary submit UI', async () => {
  vi.mocked(inspectInvite).mockResolvedValueOnce(activeInvite).mockResolvedValueOnce(pendingInvite);
  openInvite();
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue registration' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send email' }));

  await screen.findByRole('heading', { name: 'Email sent ✓' });
  expect(screen.getByText('The registration link was sent to n***@example.test.')).not.toBeNull();
  expect(screen.queryByRole('button', { name: 'Continue registration' })).toBeNull();
  expect(redeemInvite).toHaveBeenCalledTimes(1);
  expect(redeemInvite).toHaveBeenCalledWith('invite-test-token', 'new@example.test');
  expect(inspectInvite).toHaveBeenCalledTimes(2);
});

test('awaiting confirmation reconstructs the pending screen on reload', async () => {
  vi.mocked(inspectInvite).mockResolvedValue(pendingInvite);
  openInvite();

  await screen.findByRole('heading', { name: 'Email sent ✓' });
  expect(screen.queryByLabelText('Email')).toBeNull();
  expect(redeemInvite).not.toHaveBeenCalled();
});

test('awaiting confirmation without a live link does not falsely claim mail is currently usable', async () => {
  vi.mocked(inspectInvite).mockResolvedValue({
    ...pendingInvite,
    can_resend: true,
    magic_link_expires_at: null,
    resend_available_at: '2020-01-01T00:00:00Z'
  });
  openInvite();

  await screen.findByRole('heading', { name: 'A new email is needed' });
  expect(screen.queryByRole('heading', { name: 'Email sent ✓' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Send the email again' })).not.toBeNull();
});

test('resend stays disabled before server availability', async () => {
  vi.mocked(inspectInvite).mockResolvedValue(pendingInvite);
  openInvite();

  const resend = await screen.findByRole('button', { name: /Send again in/ });
  expect((resend as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(resend);
  expect(resendInvite).not.toHaveBeenCalled();
});

test('explicit resend calls only the resend endpoint when allowed and then re-inspects', async () => {
  const resendable = { ...pendingInvite, can_resend: true, resend_available_at: '2020-01-01T00:00:00Z' };
  vi.mocked(inspectInvite).mockResolvedValueOnce(resendable).mockResolvedValueOnce(pendingInvite);
  openInvite();

  fireEvent.click(await screen.findByRole('button', { name: 'Send the email again' }));
  await screen.findByText('A new registration email was requested.');
  expect(resendInvite).toHaveBeenCalledWith('invite-test-token');
  expect(redeemInvite).not.toHaveBeenCalled();
  expect(inspectInvite).toHaveBeenCalledTimes(2);
});

test('resend 429 honors cooldown feedback and refreshes authoritative state without claiming success', async () => {
  const resendable = { ...pendingInvite, can_resend: true, resend_available_at: '2020-01-01T00:00:00Z' };
  vi.mocked(inspectInvite).mockResolvedValueOnce(resendable).mockResolvedValue(pendingInvite);
  vi.mocked(resendInvite).mockRejectedValue(new AccessApiError(429, 30));
  openInvite();

  fireEvent.click(await screen.findByRole('button', { name: 'Send the email again' }));
  await screen.findByText('Please try again later.');
  expect(screen.queryByText('A new registration email was requested.')).toBeNull();
  expect(resendInvite).toHaveBeenCalledOnce();
  await waitFor(() => expect(inspectInvite).toHaveBeenCalledTimes(2));
});

test('change email is offered only when authoritative capability allows it and requires confirmation', async () => {
  vi.mocked(inspectInvite).mockResolvedValueOnce(pendingInvite).mockResolvedValueOnce({ ...pendingInvite, pending_email_masked: 'r***@example.test' });
  openInvite();
  fireEvent.click(await screen.findByRole('button', { name: 'Wrong address?' }));
  fireEvent.change(screen.getByLabelText('New email address'), { target: { value: 'replacement@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue registration' }));
  expect(changeInviteEmail).not.toHaveBeenCalled();
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send email' }));
  await screen.findByText('The registration link was sent to r***@example.test.');
  expect(changeInviteEmail).toHaveBeenCalledWith('invite-test-token', 'replacement@example.test');
});

test('a public email-bound invite cannot change recipient', async () => {
  vi.mocked(inspectInvite).mockResolvedValue({ ...pendingInvite, can_change_email: false, email_bound: true });
  openInvite();

  await screen.findByRole('heading', { name: 'Email sent ✓' });
  expect(screen.queryByRole('button', { name: 'Wrong address?' })).toBeNull();
});

describe.each(['used', 'revoked', 'expired'] as const)('terminal invite state %s', (state) => {
  test('never renders the registration email form', async () => {
    vi.mocked(inspectInvite).mockResolvedValue({ ...activeInvite, state });
    openInvite();

    await screen.findByText({ used: 'This invitation has already been used.', revoked: 'This invitation has been revoked.', expired: 'This invitation has expired.' }[state]);
    expect(screen.queryByLabelText('Email')).toBeNull();
    expect(redeemInvite).not.toHaveBeenCalled();
  });
});

test('API failure preserves retry ability and never claims the email was sent', async () => {
  vi.mocked(redeemInvite).mockRejectedValue(new AccessApiError(503));
  openInvite();
  fireEvent.change(await screen.findByLabelText('Email'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue registration' }));
  fireEvent.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Send email' }));

  await screen.findByText('Unable to continue registration.');
  expect(screen.queryByRole('heading', { name: 'Email sent ✓' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Continue registration' })).not.toBeNull();
});

test('magic fragment is cleared and consumed at most once under StrictMode', async () => {
  window.history.replaceState({}, '', '/auth/magic#token=magic-test-token');
  vi.mocked(loadAccount).mockResolvedValue(account);
  vi.mocked(consumeMagicLink).mockImplementation(async () => {
    expect(window.location.hash).toBe('');
    return 200;
  });
  renderApp('/auth/magic', { strict: true });

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/account'));
  expect(vi.mocked(consumeMagicLink)).toHaveBeenCalledTimes(1);
  expect(vi.mocked(consumeMagicLink)).toHaveBeenCalledWith('magic-test-token');
  expect(document.body.textContent).not.toContain('magic-test-token');
});

test('an old or expired magic link advises opening the latest email', async () => {
  window.history.replaceState({}, '', '/auth/magic#token=old-token');
  vi.mocked(consumeMagicLink).mockResolvedValue(400);
  renderApp('/auth/magic');

  expect(await screen.findByText(/open the latest email from Secret Studio/i)).not.toBeNull();
});

test('authenticated root replace-navigates to account', async () => {
  vi.mocked(loadAccount).mockResolvedValue(account);
  renderApp('/');
  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/account'));
});

test('the explicit switch localizes login and persists the choice', async () => {
  renderApp('/');
  await screen.findByRole('heading', { name: 'Sign in' });
  fireEvent.click(screen.getByRole('button', { name: 'RU' }));
  expect(screen.getByRole('heading', { name: 'Войти' })).not.toBeNull();
  expect(window.localStorage.getItem('wg-paid-access-locale')).toBe('ru');
});

import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import {
  AccessApiError,
  consumeMagicLink,
  loadAccount,
  loadProfiles,
  redeemInvite,
  requestLogin
} from '../../lib/accessApi';
import { renderApp } from '../../test/renderApp';

vi.mock('../../lib/accessApi', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../lib/accessApi')>();
  return {
    ...actual,
    consumeMagicLink: vi.fn(),
    createProfile: vi.fn(),
    loadAccount: vi.fn(),
    loadProfiles: vi.fn(),
    logout: vi.fn(),
    redeemInvite: vi.fn(),
    requestLogin: vi.fn()
  };
});

const account = { email: 'person@example.test', grants: [], user_id: 'user-1' };

beforeEach(() => {
  vi.mocked(loadAccount).mockRejectedValue(new AccessApiError(401));
  vi.mocked(loadProfiles).mockResolvedValue([]);
  vi.mocked(requestLogin).mockResolvedValue(202);
  vi.mocked(redeemInvite).mockResolvedValue(202);
  vi.mocked(consumeMagicLink).mockResolvedValue(200);
  window.history.replaceState({}, '', '/');
});

afterEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/');
});

test('normal login keeps the 202 response anti-enumerating', async () => {
  renderApp('/');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'unknown@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Send sign-in link' }));

  await screen.findByText('If this address is registered, a sign-in link will be sent.');
  expect(vi.mocked(requestLogin)).toHaveBeenCalledWith('unknown@example.test');
});

test('invite without a fragment token is invalid and disabled', async () => {
  renderApp('/invite');

  await screen.findByText('This invitation link is invalid.');
  expect((screen.getByRole('button', { name: 'Continue registration' }) as HTMLButtonElement).disabled).toBe(true);
  expect(vi.mocked(redeemInvite)).not.toHaveBeenCalled();
});

test('invite clears the fragment and submits its token only from memory', async () => {
  window.history.replaceState({}, '', '/invite#token=invite-test-token');
  renderApp('/invite');

  await waitFor(() => expect(window.location.hash).toBe(''));
  expect(document.body.textContent).not.toContain('invite-test-token');
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'new@example.test' } });
  fireEvent.click(screen.getByRole('button', { name: 'Continue registration' }));

  await waitFor(() => expect(vi.mocked(redeemInvite)).toHaveBeenCalledWith('invite-test-token', 'new@example.test'));
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

test('authenticated root replace-navigates to account', async () => {
  vi.mocked(loadAccount).mockResolvedValue(account);
  renderApp('/');

  await waitFor(() => expect(screen.getByTestId('location').textContent).toBe('/account'));
});

import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, test, vi } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { localeStorageKey } from '../../i18n/localeContext';
import { resources, type Locale } from '../../i18n/resources';
import { AccessApiError, sendSupportMessage } from '../../lib/accessApi';
import { SupportSection } from './SupportSection';

vi.mock('../../lib/accessApi', async (original) => ({
  ...await original<typeof import('../../lib/accessApi')>(), sendSupportMessage: vi.fn()
}));
afterEach(() => { vi.useRealTimers(); vi.clearAllMocks(); });
function setup(locale: Locale = 'en') {
  localStorage.setItem(localeStorageKey, locale);
  const onError = vi.fn();
  render(<QueryClientProvider client={new QueryClient()}><LocaleProvider><SupportSection onError={onError} /></LocaleProvider></QueryClientProvider>);
  return { onError, input: screen.getByRole('textbox') as HTMLTextAreaElement, send: screen.getByRole('button', { name: resources[locale].supportSend }) };
}

test.each(['en', 'ru'] as const)('%s limits input, counts remaining characters and blocks whitespace submission', (locale) => {
  const { input, send } = setup(locale);
  expect(screen.getByRole('heading', { name: resources[locale].supportTitle })).toBeTruthy();
  const remaining = (count: number) => resources[locale].supportRemaining.replace('{{count}}', String(count));
  expect(screen.getByText(remaining(500))).toBeTruthy(); expect(send.hasAttribute('disabled')).toBe(true);
  fireEvent.change(input, { target: { value: ' \n ' } });
  fireEvent.submit(input.closest('form')!);
  expect(send.hasAttribute('disabled')).toBe(true); expect(sendSupportMessage).not.toHaveBeenCalled();
  fireEvent.change(input, { target: { value: 'a' } }); expect(screen.getByText(remaining(499))).toBeTruthy();
  fireEvent.change(input, { target: { value: 'a'.repeat(499) } }); expect(screen.getByText(remaining(1))).toBeTruthy();
  fireEvent.change(input, { target: { value: 'a'.repeat(501) } });
  expect(input.maxLength).toBe(500); expect(input.value).toHaveLength(500); expect(screen.getByText(remaining(0))).toBeTruthy();
});

test.each(['en', 'ru'] as const)('%s sends trimmed text once, clears on success and expires confirmation', async (locale) => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  let complete!: () => void;
  vi.mocked(sendSupportMessage).mockReturnValueOnce(new Promise<void>((resolve) => { complete = resolve; }));
  const { input, send } = setup(locale);
  fireEvent.change(input, { target: { value: '  A synthetic suggestion. \n' } }); fireEvent.click(send);
  await waitFor(() => expect(send.hasAttribute('disabled')).toBe(true)); expect(input.disabled).toBe(true);
  fireEvent.submit(input.closest('form')!);
  expect(sendSupportMessage).toHaveBeenCalledExactlyOnceWith('A synthetic suggestion.');
  await act(async () => { complete(); });
  expect((await screen.findByRole('status')).textContent).toBe(resources[locale].supportSent);
  expect(input.value).toBe(''); expect(screen.getByText(resources[locale].supportRemaining.replace('{{count}}', '500'))).toBeTruthy();
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); expect(screen.queryByRole('status')).toBeNull();
});

test.each(['en', 'ru'] as const)('%s preserves text and bounds rate-limit, server and network errors', async (locale) => {
  const { input, send, onError } = setup(locale);
  for (const error of [new AccessApiError(429), new AccessApiError(503), new AccessApiError(500), new Error('synthetic internal failure')]) {
    vi.mocked(sendSupportMessage).mockRejectedValueOnce(error);
    fireEvent.change(input, { target: { value: 'Keep this synthetic draft.' } }); fireEvent.click(send);
    expect((await screen.findByRole('alert')).textContent).toBe(error instanceof AccessApiError && error.status === 429 ? resources[locale].supportRateLimited : resources[locale].supportFailed);
    expect(input.value).toBe('Keep this synthetic draft.'); expect(send.hasAttribute('disabled')).toBe(false); expect(onError).toHaveBeenLastCalledWith(error);
  }
});

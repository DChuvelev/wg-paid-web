import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, test } from 'vitest';
import { LocaleProvider } from './LocaleProvider';
import { localeStorageKey, useLocale } from './localeContext';

const originalLanguages = Object.getOwnPropertyDescriptor(navigator, 'languages');

function setLanguages(languages: Array<string>) {
  Object.defineProperty(navigator, 'languages', { configurable: true, value: languages });
}

function Probe() {
  const { locale, setLocale, t } = useLocale();
  return (
    <div>
      <output>{locale}</output>
      <span>{t('signIn')}</span>
      <button type="button" onClick={() => setLocale('ru')}>RU</button>
      <button type="button" onClick={() => setLocale('en')}>EN</button>
    </div>
  );
}

afterEach(() => {
  if (originalLanguages) Object.defineProperty(navigator, 'languages', originalLanguages);
});

test('uses Russian for a fresh visit regardless of browser language', () => {
  setLanguages(['en-US', 'de-DE']);
  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('ru')).not.toBeNull();
  expect(screen.getByText('Войти')).not.toBeNull();
});

test('honors a saved English preference', () => {
  window.localStorage.setItem(localeStorageKey, 'en');
  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('en')).not.toBeNull();
  expect(screen.getByText('Sign in')).not.toBeNull();
});

test('honors a saved Russian preference', () => {
  window.localStorage.setItem(localeStorageKey, 'ru');
  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('ru')).not.toBeNull();
  expect(screen.getByText('Войти')).not.toBeNull();
});

test('explicit language selection persists', () => {
  const first = render(<LocaleProvider><Probe /></LocaleProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'EN' }));
  expect(window.localStorage.getItem(localeStorageKey)).toBe('en');
  first.unmount();

  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('en')).not.toBeNull();
  expect(screen.getByText('Sign in')).not.toBeNull();
});

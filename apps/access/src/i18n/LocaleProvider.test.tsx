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

test('uses Russian for a first Russian browser visit', () => {
  setLanguages(['ru-RU', 'en-US']);
  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('ru')).not.toBeNull();
  expect(screen.getByText('Войти')).not.toBeNull();
});

test('uses English for a first non-Russian browser visit', () => {
  setLanguages(['de-DE']);
  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('en')).not.toBeNull();
  expect(screen.getByText('Sign in')).not.toBeNull();
});

test('explicit language selection overrides detection and persists', () => {
  setLanguages(['ru-RU']);
  const first = render(<LocaleProvider><Probe /></LocaleProvider>);
  fireEvent.click(screen.getByRole('button', { name: 'EN' }));
  expect(window.localStorage.getItem(localeStorageKey)).toBe('en');
  first.unmount();

  render(<LocaleProvider><Probe /></LocaleProvider>);
  expect(screen.getByText('en')).not.toBeNull();
  expect(screen.getByText('Sign in')).not.toBeNull();
});

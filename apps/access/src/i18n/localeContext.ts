import { createContext, useContext } from 'react';
import type { Locale, TranslationKey } from './resources';

export const localeStorageKey = 'wg-paid-access-locale';

export interface LocaleContextValue {
  locale: Locale;
  setLocale: (locale: Locale) => void;
  t: (key: TranslationKey, values?: Record<string, string | number>) => string;
}

export const LocaleContext = createContext<LocaleContextValue | null>(null);

export function detectInitialLocale(): Locale {
  try {
    const stored = window.localStorage.getItem(localeStorageKey);
    if (stored === 'ru' || stored === 'en') return stored;
  } catch {
    // Storage may be unavailable in a restricted browser context.
  }
  const preferred = navigator.languages?.[0] ?? navigator.language;
  return preferred?.toLowerCase().startsWith('ru') ? 'ru' : 'en';
}

export function useLocale() {
  const context = useContext(LocaleContext);
  if (!context) throw new Error('useLocale must be used inside LocaleProvider');
  return context;
}

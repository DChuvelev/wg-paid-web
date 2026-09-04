import { type ReactNode, useEffect, useMemo, useState } from 'react';
import { resources, type Locale } from './resources';
import { detectInitialLocale, LocaleContext, type LocaleContextValue, localeStorageKey } from './localeContext';

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(detectInitialLocale);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const value = useMemo<LocaleContextValue>(() => ({
    locale,
    setLocale: (nextLocale) => {
      setLocaleState(nextLocale);
      try {
        window.localStorage.setItem(localeStorageKey, nextLocale);
      } catch {
        // The explicit choice still applies for this page lifetime.
      }
    },
    t: (key, values) => {
      const template = resources[locale][key];
      return Object.entries(values ?? {}).reduce(
        (text, [name, replacement]) => text.replaceAll(`{{${name}}}`, String(replacement)),
        template
      );
    }
  }), [locale]);

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

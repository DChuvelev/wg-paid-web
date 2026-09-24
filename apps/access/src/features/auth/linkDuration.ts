import type { Locale } from '../../i18n/resources';

function localeTag(locale: Locale) {
  return locale === 'ru' ? 'ru-RU' : 'en-US';
}

export function formatLinkDuration(totalSeconds: number, locale: Locale) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const useMinutes = seconds >= 60 && seconds % 60 === 0;
  return new Intl.NumberFormat(localeTag(locale), {
    style: 'unit',
    unit: useMinutes ? 'minute' : 'second',
    unitDisplay: 'long'
  }).format(useMinutes ? seconds / 60 : seconds);
}

export function linkDurationFromTimestamps(sentAt: string | null, expiresAt: string | null, locale: Locale) {
  if (!sentAt || !expiresAt) return null;
  const durationSeconds = (Date.parse(expiresAt) - Date.parse(sentAt)) / 1000;
  return Number.isFinite(durationSeconds) && durationSeconds > 0
    ? formatLinkDuration(durationSeconds, locale)
    : null;
}

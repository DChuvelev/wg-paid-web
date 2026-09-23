import type { Locale } from './resources';

export function deviceQuantity(quantity: number, locale: Locale) {
  if (locale === 'en') return `${quantity} ${quantity === 1 ? 'device' : 'devices'}`;
  const absolute = Math.abs(quantity);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? 'устройств'
    : last === 1
      ? 'устройство'
      : last >= 2 && last <= 4
        ? 'устройства'
        : 'устройств';
  return `${quantity} ${noun}`;
}

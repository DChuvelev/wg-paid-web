import type { Locale } from './resources';

export function configurationQuantity(quantity: number, locale: Locale) {
  if (locale === 'en') return `${quantity} ${quantity === 1 ? 'configuration' : 'configurations'}`;
  const absolute = Math.abs(quantity);
  const lastTwo = absolute % 100;
  const last = absolute % 10;
  const noun = lastTwo >= 11 && lastTwo <= 14
    ? 'конфигураций'
    : last === 1
      ? 'конфигурация'
      : last >= 2 && last <= 4
        ? 'конфигурации'
        : 'конфигураций';
  return `${quantity} ${noun}`;
}

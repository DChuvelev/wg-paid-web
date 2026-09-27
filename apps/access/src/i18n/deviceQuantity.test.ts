import { expect, test } from 'vitest';
import { configurationQuantity } from './deviceQuantity';

test.each([
  [0, '0 конфигураций'], [1, '1 конфигурация'], [2, '2 конфигурации'], [4, '4 конфигурации'], [5, '5 конфигураций'],
  [11, '11 конфигураций'], [14, '14 конфигураций'], [21, '21 конфигурация'], [22, '22 конфигурации'], [25, '25 конфигураций']
])('formats Russian configuration quantity %i', (quantity, expected) => {
  expect(configurationQuantity(quantity, 'ru')).toBe(expected);
});

test('formats singular and plural English configuration quantities', () => {
  expect(configurationQuantity(1, 'en')).toBe('1 configuration');
  expect(configurationQuantity(2, 'en')).toBe('2 configurations');
});

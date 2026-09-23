import { expect, test } from 'vitest';
import { deviceQuantity } from './deviceQuantity';

test.each([
  [0, '0 устройств'], [1, '1 устройство'], [2, '2 устройства'], [4, '4 устройства'], [5, '5 устройств'],
  [11, '11 устройств'], [14, '14 устройств'], [21, '21 устройство'], [22, '22 устройства'], [25, '25 устройств']
])('formats Russian device quantity %i', (quantity, expected) => {
  expect(deviceQuantity(quantity, 'ru')).toBe(expected);
});

test('formats singular and plural English device quantities', () => {
  expect(deviceQuantity(1, 'en')).toBe('1 device');
  expect(deviceQuantity(2, 'en')).toBe('2 devices');
});

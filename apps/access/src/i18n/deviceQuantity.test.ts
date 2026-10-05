import { expect, test } from 'vitest';
import { configurationQuantity, deviceQuantityForAccess } from './deviceQuantity';

test.each([[1, '1 устройства'], [2, '2 устройств'], [3, '3 устройств'], [5, '5 устройств'], [11, '11 устройств'], [21, '21 устройства'], [22, '22 устройств']])('formats access quantity after Russian для: %i', (quantity, expected) => {
  expect(deviceQuantityForAccess(quantity, 'ru')).toBe(expected);
});

test.each([
  [0, '0 устройств'], [1, '1 устройство'], [2, '2 устройства'], [4, '4 устройства'], [5, '5 устройств'],
  [11, '11 устройств'], [14, '14 устройств'], [21, '21 устройство'], [22, '22 устройства'], [25, '25 устройств']
])('formats Russian device quantity %i', (quantity, expected) => {
  expect(configurationQuantity(quantity, 'ru')).toBe(expected);
});

test('formats singular and plural English device quantities', () => {
  expect(configurationQuantity(1, 'en')).toBe('1 device');
  expect(configurationQuantity(2, 'en')).toBe('2 devices');
});

// @vitest-environment node
import { describe, expect, test } from 'vitest';
import { createQuerySerializer } from './generated/client/utils.gen';

describe('generated list query serialization', () => {
  test('serializes FastAPI origin arrays as repeated parameters in caller order', () => {
    const serialize = createQuerySerializer<{ origin: Array<'user' | 'admin' | 'campaign'> }>();
    expect(serialize({ origin: ['user', 'admin'] })).toBe('origin=user&origin=admin');
    expect(serialize({ origin: ['admin', 'campaign'] })).toBe('origin=admin&origin=campaign');
    expect(serialize({ origin: ['user', 'admin', 'campaign'] })).toBe('origin=user&origin=admin&origin=campaign');
  });
});

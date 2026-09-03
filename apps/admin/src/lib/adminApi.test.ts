import { describe, expect, test } from 'vitest';
import { getAdminCsrfHeaders } from './adminApi';

describe('admin CSRF cookie handling', () => {
  test('maps the encoded CSRF cookie to the required header', () => {
    expect(getAdminCsrfHeaders('unrelated=x; wg_admin_csrf=token%2Fvalue%3D; another=y')).toEqual({
      'x-admin-csrf-token': 'token/value='
    });
  });

  test('does not invent a CSRF header when the cookie is absent', () => {
    expect(getAdminCsrfHeaders('unrelated=x')).toBeUndefined();
  });
});

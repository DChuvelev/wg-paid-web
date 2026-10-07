import { expect, test } from 'vitest';
import type { InviteOrigin } from '../../lib/adminApi';
import { filterInvitesByOrigin } from './inviteDomain';

const origins: InviteOrigin[] = ['user', 'admin', 'campaign'];
const rows = origins.flatMap((origin) => [{ origin, state: 'active' }, { origin, state: 'expired' }]);
for (let mask = 0; mask < 8; mask++) {
  const selected = origins.filter((_, index) => mask & (1 << index));
  test(`origin selection ${selected.join(',') || 'none'} filters active and archive records`, () => {
    expect(filterInvitesByOrigin(rows, selected)).toEqual(rows.filter((row) => selected.includes(row.origin)));
  });
}

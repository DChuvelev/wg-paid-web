import type { AdminInviteSummary } from '@wg-paid/api';
import type { InviteOrigin } from '../../lib/adminApi';

export function filterInvitesByOrigin<T extends Pick<AdminInviteSummary, 'origin'>>(rows: ReadonlyArray<T>, origins: ReadonlyArray<InviteOrigin>) {
  return rows.filter((row) => origins.includes(row.origin));
}

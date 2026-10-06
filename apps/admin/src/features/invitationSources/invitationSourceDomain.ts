import type { AdminInvitationSourceOption, AdminListUsersV2AdminUsersGetData, AdminUserSummary } from '@wg-paid/api';

export type SourceOrigin = AdminInvitationSourceOption['origin'];
export type SourceSelection = Pick<AdminInvitationSourceOption, 'source_id' | 'label' | 'secondary_label'>;
export type InvitationSourceFilter =
  | { origin: 'all' }
  | { origin: 'admin' }
  | { origin: SourceOrigin; selection: SourceSelection | null };

export function attributionParams(filter: InvitationSourceFilter): Pick<
  NonNullable<AdminListUsersV2AdminUsersGetData['query']>,
  'invited_by_origin' | 'invited_by_user_id' | 'invited_by_campaign_id'
> {
  if (filter.origin === 'all') return {};
  if (filter.origin === 'admin') return { invited_by_origin: 'admin' };
  return {
    invited_by_origin: filter.origin,
    ...(filter.selection ? filter.origin === 'user'
      ? { invited_by_user_id: filter.selection.source_id }
      : { invited_by_campaign_id: filter.selection.source_id } : {})
  };
}

type Attribution = Pick<AdminUserSummary, 'invited_by_origin' | 'invited_by_label' | 'invited_by_user_id' | 'invited_by_campaign_id'>;

export function matchesInvitationSource(row: Attribution, filter: InvitationSourceFilter) {
  if (filter.origin === 'all') return true;
  if (row.invited_by_origin !== filter.origin) return false;
  if (filter.origin === 'admin' || !filter.selection) return true;
  return (filter.origin === 'user' ? row.invited_by_user_id : row.invited_by_campaign_id) === filter.selection.source_id;
}

// Preserve the existing Users output, including custom Admin labels and Unknown fallbacks.
export function invitedBy(user: Pick<Attribution, 'invited_by_origin' | 'invited_by_label'>) {
  const label = user.invited_by_label?.trim();
  switch (user.invited_by_origin) {
    case 'admin':
      return label && label.toLocaleLowerCase() !== 'admin' ? `Admin · ${label}` : 'Admin';
    case 'user':
      return `User · ${label || 'Unknown'}`;
    case 'campaign':
      return `Campaign · ${label || 'Unknown'}`;
    default:
      return '—';
  }
}

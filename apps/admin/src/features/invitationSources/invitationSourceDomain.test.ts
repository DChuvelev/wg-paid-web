import { describe, expect, test } from 'vitest';
import { attributionParams, invitedBy, matchesInvitationSource, type InvitationSourceFilter } from './invitationSourceDomain';

const userId = '00000000-0000-4000-8000-000000000001';
const campaignId = '00000000-0000-4000-8000-000000000002';
const selection = { source_id: userId, label: 'Same name', secondary_label: 'first@example.test' };

describe('invitation attribution', () => {
  test.each<[InvitationSourceFilter, object]>([
    [{ origin: 'all' }, {}],
    [{ origin: 'admin' }, { invited_by_origin: 'admin' }],
    [{ origin: 'user', selection: null }, { invited_by_origin: 'user' }],
    [{ origin: 'campaign', selection: null }, { invited_by_origin: 'campaign' }],
    [{ origin: 'user', selection }, { invited_by_origin: 'user', invited_by_user_id: userId }],
    [{ origin: 'campaign', selection: { ...selection, source_id: campaignId } }, { invited_by_origin: 'campaign', invited_by_campaign_id: campaignId }]
  ])('maps %j to exact typed server parameters', (filter, expected) => {
    expect(attributionParams(filter)).toEqual(expected);
  });

  test('matches stable UUID and origin, never display labels or email', () => {
    const row = { invited_by_origin: 'user' as const, invited_by_label: 'Changed label', invited_by_user_id: userId, invited_by_campaign_id: null };
    expect(matchesInvitationSource(row, { origin: 'user', selection })).toBe(true);
    expect(matchesInvitationSource({ ...row, invited_by_user_id: campaignId, invited_by_label: selection.label }, { origin: 'user', selection })).toBe(false);
    expect(matchesInvitationSource(row, { origin: 'campaign', selection: { ...selection, source_id: userId } })).toBe(false);
    expect(matchesInvitationSource(row, { origin: 'user', selection: null })).toBe(true);
    expect(matchesInvitationSource({ ...row, invited_by_origin: null }, { origin: 'all' })).toBe(true);
    expect(matchesInvitationSource({ ...row, invited_by_origin: null }, { origin: 'admin' })).toBe(false);
  });

  test('preserves existing Users display and neutral missing attribution', () => {
    expect(invitedBy({ invited_by_origin: 'admin', invited_by_label: 'Admin' })).toBe('Admin');
    expect(invitedBy({ invited_by_origin: 'admin', invited_by_label: ' Operator ' })).toBe('Admin · Operator');
    expect(invitedBy({ invited_by_origin: 'user', invited_by_label: ' Alice ' })).toBe('User · Alice');
    expect(invitedBy({ invited_by_origin: 'campaign', invited_by_label: 'Conference' })).toBe('Campaign · Conference');
    expect(invitedBy({ invited_by_origin: 'user', invited_by_label: null })).toBe('User · Unknown');
    expect(invitedBy({ invited_by_origin: null, invited_by_label: 'unused' })).toBe('—');
  });
});

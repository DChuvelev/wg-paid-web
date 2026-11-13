import { expect, test } from 'vitest';
import { eventLabel, money, nextOffset, orderedTimeline, time } from './billingDomain';
test('preserves kopeks, zero and unknown money and dates', () => {
  for (const [v,expected] of [[0,0],[1,.01],[199,1.99]] as const) expect(money(v)).toBe(`${expected.toLocaleString(undefined,{minimumFractionDigits:2,maximumFractionDigits:2})} RUB`);
  expect(money(null)).toBe('Нет данных'); expect(money(undefined)).toBe('Нет данных'); expect(time(null)).toBe('Нет данных'); expect(time('invalid')).toBe('Нет данных');
});
test('bounds pagination using server has_more', () => {
  expect(nextOffset({offset:4950,limit:50,has_more:true})).toBe(5000);
  expect(nextOffset({offset:5000,limit:50,has_more:true})).toBeNull();
  expect(nextOffset({offset:0,limit:50,has_more:false})).toBeNull();
});
test('timeline is stable newest-first, null last; unknown types preserved and reminder caveats explicit', () => {
  const events = [null,'2026-01-01T00:00:00Z','2026-02-01T00:00:00Z','2026-02-01T00:00:00Z'].map((at_utc,i) => ({at_utc,type:String(i),evidence_source:'audit_events' as const}));
  expect(orderedTimeline(events).map(e=>e.type)).toEqual(['2','3','1','0']);
  expect(eventLabel('future_event')).toBe('future_event');
  expect(eventLabel('reminder_smtp_accepted')).toContain('не подтверждены'); expect(eventLabel('reminder_link_used')).toContain('не доказывает');
});

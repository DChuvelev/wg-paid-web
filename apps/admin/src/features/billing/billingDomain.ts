import type { TimelineEvent } from '@wg-paid/api/billing';
export function money(value: number | null | undefined, currency = 'RUB') {
  if (value == null || !Number.isSafeInteger(value)) return 'Нет данных';
  return `${(value / 100).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`;
}
export function time(value: string | null | undefined) {
  if (!value || !Number.isFinite(Date.parse(value))) return 'Нет данных';
  return `${new Date(value).toLocaleString(undefined, { timeZone: 'UTC' })} UTC`;
}
export function nextOffset(page: { has_more: boolean; offset: number; limit: number } | undefined) {
  return page?.has_more && page.offset + page.limit <= 5000 ? page.offset + page.limit : null;
}
export function orderedTimeline(events: TimelineEvent[]) {
  return events.map((event, index) => ({ event, index })).sort((a, b) => {
    const stamp = (v: string | null) => v && Number.isFinite(Date.parse(v)) ? Date.parse(v) : -Infinity;
    const left = stamp(a.event.at_utc), right = stamp(b.event.at_utc);
    return left === right ? a.index - b.index : left > right ? -1 : 1;
  }).map(({ event }) => event);
}
export function eventLabel(type: string) {
  return ({ reminder_smtp_accepted: 'Напоминание принято SMTP — доставка/прочтение не подтверждены', reminder_link_used: 'Вход по ссылке подтверждён — не доказывает причину платежа', payment_created: 'Платёж создан', payment_succeeded: 'Платёж подтверждён YooKassa', payment_canceled: 'Платёж отменён' } as Record<string, string>)[type] ?? type;
}

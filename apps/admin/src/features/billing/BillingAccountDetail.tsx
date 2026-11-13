import { useEffect, useRef } from 'react';
import type { AccountDetailResponse } from '@wg-paid/api/billing';
import { AccountFields } from './BillingRows';
import { eventLabel, money, orderedTimeline, time } from './billingDomain';
export function BillingAccountDetail({ data: d, close, expand, limit }: { data: AccountDetailResponse; close: () => void; expand: () => void; limit: number }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => { heading.current?.focus(); }, [d.account.billing_account_id]);
  return <section aria-label="Выбранный аккаунт"><h3 ref={heading} tabIndex={-1}>{d.account.email ?? 'Аккаунт без email'}</h3><button type="button" onClick={close}>Закрыть сведения</button>
    <AccountFields account={d.account} /><p>Зарегистрирован: {time(d.account.registered_at_utc)}</p>
    <details><summary>Технические идентификаторы</summary><p>Billing account: {d.account.billing_account_id}</p><p>User: {d.account.user_id}</p></details>
    <p>{d.reminder_delivery_read_tracking ? 'API сообщает о tracking capability; это не квитанция доставки/прочтения.' : 'Доставка/прочтение не отслеживаются.'} SMTP accepted ≠ delivered/read. Использование ссылки не доказывает причину последующего платежа.</p>
    {d.account.reminder_evidence_truncated ? <p role="status">Evidence напоминаний ограничен; отсутствие записи не доказывает неотправку.</p> : null}
    <h4>Ограниченная история событий — не полный реестр платежей аккаунта</h4>
    {d.timeline_truncated ? <p role="status">Timeline ограничен. {limit < 100 ? <button type="button" onClick={expand}>Показать до 100 событий</button> : 'Дальнейшая пагинация API отсутствует.'}</p> : null}
    {!d.timeline.length ? <p>Нет событий в ответе.</p> : <ol>{orderedTimeline(d.timeline).map((e, i) => <li key={i}><strong>{eventLabel(e.type)}</strong><p>{time(e.at_utc)} · Источник: {e.evidence_source}</p>
      {e.payment_id != null ? <p>Payment ID: {e.payment_id}</p> : null}{e.amount_kopeks != null ? <p>Сумма: {money(e.amount_kopeks)}</p> : null}{e.kind != null ? <p>Вид: {e.kind}</p> : null}
      {e.period_end_utc != null ? <p>Период до: {time(e.period_end_utc)}</p> : null}{e.target_period_end_utc != null ? <p>Целевой период до: {time(e.target_period_end_utc)}</p> : null}</li>)}</ol>}
  </section>;
}

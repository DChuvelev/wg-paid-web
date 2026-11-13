import type { BillingAccountRow, BillingPaymentRow } from '@wg-paid/api/billing';
import { money, time } from './billingDomain';
import styles from './Billing.module.css';
export function AccountFields({ account: a }: { account: BillingAccountRow }) {
  return <dl className={styles.fields}>
    <div><dt>Категория / статус</dt><dd>{a.category} / {a.status}</dd></div>
    <div><dt>Billing mode / access grant</dt><dd>{a.billing_mode} / {a.access_grant_status ?? 'Нет данных'}</dd></div>
    <div><dt>Конфигурации / ожидаемое количество</dt><dd>{a.slot_quantity} / {a.pending_slot_quantity ?? 'Нет данных'}</dd></div>
    <div><dt>Начало текущего периода</dt><dd>{time(a.current_period_start_utc)}</dd></div>
    <div><dt>Текущий период до</dt><dd>{time(a.current_period_end_utc)}</dd></div>
    <div><dt>Период количества до</dt><dd>{time(a.quantity_period_end_utc)}</dd></div>
    <div><dt>Последний подтверждённый платёж</dt><dd>{money(a.last_succeeded_payment_amount_kopeks)} · {time(a.last_succeeded_payment_at_utc)}</dd></div>
    <div><dt>Последняя запись об отправке напоминания</dt><dd>{a.last_reminder_sent_at_utc ? time(a.last_reminder_sent_at_utc) : 'Нет записи об отправке; это не доказательство неотправки'}</dd></div>
    <div><dt>Напоминание для текущего периода</dt><dd>{a.current_period_reminder_sent_at_utc ? time(a.current_period_reminder_sent_at_utc) : 'Нет записи об отправке'}</dd></div>
    <div><dt>Срок в ближайшие 3 дня</dt><dd>{a.due_within_3_days ? 'Да; не подтверждает отправку напоминания' : 'Нет'}</dd></div>
  </dl>;
}
export function BillingAccounts({ rows, select }: { rows: BillingAccountRow[]; select: (id: string) => void }) {
  return <table className={styles.rows} aria-label="Состояние Billing аккаунтов"><thead><tr><th>Аккаунт</th><th>Подписка и evidence</th></tr></thead><tbody>{rows.map(a => <tr className={styles.row} key={a.billing_account_id}>
    <td><button type="button" onClick={() => select(a.billing_account_id)}>{a.email ?? a.display_name ?? 'Аккаунт без email'}</button><p>{a.display_name ?? 'Имя не указано'} · {a.status} · {a.category}</p></td>
    <td><p>Текущий период до: {time(a.current_period_end_utc)}</p><p>Последний платёж: {money(a.last_succeeded_payment_amount_kopeks)} · {time(a.last_succeeded_payment_at_utc)}</p>{a.due_within_3_days ? <strong>Срок в ближайшие 3 дня</strong> : null}
    <details><summary>Состояние подписки и напоминания</summary><AccountFields account={a} />{a.reminder_evidence_truncated ? <p>Данные о напоминаниях ограничены.</p> : null}</details></td>
  </tr>)}</tbody></table>;
}
export function BillingPayments({ rows, select }: { rows: BillingPaymentRow[]; select: (id: string) => void }) {
  return <table className={styles.rows} aria-label="Глобальные платежи"><thead><tr><th>Платёж / аккаунт</th><th>Состояние и период</th></tr></thead><tbody>{rows.map(p => <tr className={styles.row} key={p.payment_id}>
    <td>{p.billing_account_id ? <button type="button" onClick={() => select(p.billing_account_id!)}>{p.email ?? 'Аккаунт без email'}</button> : <strong>Без привязки к аккаунту</strong>}<p>{p.category} · {money(p.amount_kopeks, p.currency)}</p></td>
    <td><dl className={styles.fields}>
      <div><dt>Статус / provider status</dt><dd>{p.status} / {p.provider_status ?? 'Нет данных'}</dd></div>
      <div><dt>Вид / количество до → после</dt><dd>{p.kind} / {p.quantity_before} → {p.quantity_after}</dd></div>
      <div><dt>Создан</dt><dd>{time(p.created_at_utc)}</dd></div><div><dt>Подтверждён</dt><dd>{time(p.succeeded_at_utc)}</dd></div>
      <div><dt>Целевой период</dt><dd>{time(p.target_period_start_utc)} — {time(p.target_period_end_utc)}</dd></div>
      <div><dt>Payment ID</dt><dd>{p.payment_id}</dd></div>
    </dl></td>
  </tr>)}</tbody></table>;
}

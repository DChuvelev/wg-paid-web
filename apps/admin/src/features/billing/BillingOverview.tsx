import type { Overview } from '@wg-paid/api/billing';
import { money, time } from './billingDomain';
import styles from './Billing.module.css';
export function BillingOverview({ data: d }: { data: Overview }) {
  const metrics = [['Сейчас active_paid', d.accounts_by_status.active_paid ?? 'Нет данных'], ['Срок в ближайшие 3 дня', d.active_paid_due_within_3_days], ['Когда-либо платили', d.ever_paid_accounts], ['Подтверждённые платежи', d.succeeded_count], ['Поступления gross', money(d.succeeded_gross_kopeks)], ['Созданы / ожидаются / отменены', `${d.created_count} / ${d.pending_count} / ${d.canceled_count}`], ['Зафиксированные отправки напоминаний', d.reminder_sent_count], ['Unattributed: подтверждения / сумма', `${d.unattributed_succeeded_count ?? 'Нет данных'} / ${money(d.unattributed_succeeded_kopeks)}`]];
  return <><dl className={styles.metrics}>{metrics.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl>
    <p>Сумма подтверждённых платежей до возвратов, chargebacks и комиссий; не net revenue.</p><p>active_paid — сохранённый billing status, не показатель доступности VPN. Trial не является paid; исторические плательщики показаны отдельно.</p>
    <p>Период: {time(d.period_start_utc)} — {time(d.period_end_utc)} · Scope: {d.scope}</p></>;
}

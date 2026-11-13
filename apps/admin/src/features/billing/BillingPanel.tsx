import { type ReactNode, useEffect, useRef, useState } from 'react';
import type { LookbackDays } from '@wg-paid/api/billing';
import { AdminApiError, type BillingAccountsQuery, type BillingPaymentsQuery } from '../../lib/adminApi';
import { useBilling } from './useBilling';
import { BillingOverview } from './BillingOverview';
import { BillingAccounts, BillingPayments } from './BillingRows';
import { BillingAccountDetail } from './BillingAccountDetail';
import { nextOffset, time } from './billingDomain';
import styles from './Billing.module.css';
function ResponseState({ query, children }: { query: { isPending: boolean; isFetching: boolean; error: unknown; data?: { as_of_utc: string } }; children: ReactNode }) {
  const forbidden = query.error instanceof AdminApiError && query.error.status === 403;
  return <>{query.isPending ? <p role="status">Загрузка…</p> : null}{query.isFetching && query.data ? <p role="status">Обновление…</p> : null}
    {query.error ? <p role="alert">{forbidden ? 'Доступ запрещён (403).' : 'Не удалось загрузить данные.'}</p> : null}
    {!forbidden && query.data ? <>{query.error ? <p role="status">Показаны сохранённые устаревшие данные предыдущего успешного запроса.</p> : null}<p>Данные на: {time(query.data.as_of_utc)}</p>{children}</> : null}</>;
}
function Paging({ page, offset, change, busy, label }: { page?: { offset: number; limit: number; total: number; has_more: boolean }; offset: number; change: (v: number) => void; busy: boolean; label: string }) {
  const next = nextOffset(page);
  return <nav aria-label={label}><button type="button" disabled={busy || offset === 0} onClick={() => change(Math.max(0, offset - 50))}>Предыдущие</button> <span>Смещение {offset} · Всего {page?.total ?? 'Нет данных'}</span> <button type="button" disabled={busy || next === null} onClick={() => { if (next !== null) change(next); }}>Следующие</button>{page?.has_more && next === null ? <p>Достигнут предел просмотра (offset 5000).</p> : null}</nav>;
}
export function BillingPanel({ onSessionExpired }: { onSessionExpired: () => void }) {
  const [scope, setScope] = useState<NonNullable<BillingAccountsQuery['scope']>>('commercial');
  const [days, setDays] = useState<LookbackDays>(30);
  const [accountStatus, setAccountStatus] = useState<BillingAccountsQuery['status']>('all');
  const [paymentStatus, setPaymentStatus] = useState<BillingPaymentsQuery['status']>('all');
  const [draft, setDraft] = useState(''); const [search, setSearch] = useState('');
  const [accountsOffset, setAccountsOffset] = useState(0); const [paymentsOffset, setPaymentsOffset] = useState(0);
  const [accountId, setAccountId] = useState<string | null>(null); const [detailLimit, setDetailLimit] = useState(50);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => { const timer = window.setTimeout(() => { setSearch(draft.trim()); setAccountsOffset(0); }, 250); return () => window.clearTimeout(timer); }, [draft]);
  const q = useBilling({ scope, status: accountStatus, query: search, limit: 50, offset: accountsOffset }, { scope, days, status: paymentStatus, limit: 50, offset: paymentsOffset }, accountId, detailLimit, onSessionExpired);
  const select = (id: string) => { opener.current = document.activeElement as HTMLElement; setDetailLimit(50); setAccountId(id); };
  const close = () => { setAccountId(null); opener.current?.focus(); };
  const queries = [q.overview, q.accounts, q.payments, ...(accountId ? [q.detail] : [])];
  if (q.unauthorized) return null;
  return <section className={styles.panel} aria-labelledby="billing-title"><h2 id="billing-title">Billing</h2>
    <div className={styles.toolbar}><label>Область<select value={scope} onChange={e => { setScope(e.target.value as typeof scope); setAccountsOffset(0); setPaymentsOffset(0); setAccountId(null); }}><option value="commercial">Commercial (Review excluded)</option><option value="review">Review</option><option value="all">All (включая Review)</option></select></label>
      <label>Период платежей<select value={days} onChange={e => { setDays(Number(e.target.value) as LookbackDays); setPaymentsOffset(0); }}>{([30,90,365] as const).map(d => <option key={d} value={d}>{d} дней</option>)}</select></label>
      <button type="button" disabled={queries.some(v => v.isFetching)} onClick={() => { queries.forEach(v => { void v.refetch(); }); }}>Обновить Billing</button></div>
    <p>{scope === 'commercial' ? 'Review исключён. Trusted Pilot не считается Commercial автоматически.' : 'Специальный Review включён в выбранную область.'} Каждый ответ имеет собственное время; snapshots не атомарны.</p>
    <ResponseState query={q.overview}>{q.overview.data ? <BillingOverview data={q.overview.data} /> : null}</ResponseState>
    <h3>Аккаунты</h3><div className={styles.toolbar}><label>Поиск по email<input type="search" maxLength={120} value={draft} onChange={e => setDraft(e.target.value)} /></label><label>Статус аккаунта<select value={accountStatus} onChange={e => { setAccountStatus(e.target.value as typeof accountStatus); setAccountsOffset(0); }}>{['all','trial','active_paid','past_due','expired'].map(s => <option key={s}>{s}</option>)}</select></label></div>
    <ResponseState query={q.accounts}>{q.accounts.data?.rows.length ? <BillingAccounts rows={q.accounts.data.rows} select={select} /> : <p>Нет аккаунтов на этой странице.</p>}</ResponseState>
    <Paging label="Страницы аккаунтов" page={q.accounts.isError ? undefined : q.accounts.data} offset={accountsOffset} change={setAccountsOffset} busy={q.accounts.isFetching} />
    {accountId ? <><button type="button" onClick={close}>Закрыть выбранный аккаунт</button><ResponseState query={q.detail}>{q.detail.data ? <BillingAccountDetail data={q.detail.data} close={close} expand={() => setDetailLimit(100)} limit={detailLimit} /> : null}</ResponseState></> : null}
    <h3>Глобальный реестр платежей</h3><label>Статус платежа<select value={paymentStatus} onChange={e => { setPaymentStatus(e.target.value as typeof paymentStatus); setPaymentsOffset(0); }}>{['all','created','pending','succeeded','canceled'].map(s => <option key={s}>{s}</option>)}</select></label>
    <ResponseState query={q.payments}>{q.payments.data?.rows.length ? <BillingPayments rows={q.payments.data.rows} select={select} /> : <p>Нет платежей на этой странице.</p>}</ResponseState>
    <Paging label="Страницы платежей" page={q.payments.isError ? undefined : q.payments.data} offset={paymentsOffset} change={setPaymentsOffset} busy={q.payments.isFetching} />
  </section>;
}

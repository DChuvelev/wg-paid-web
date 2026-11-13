import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import type { Overview, BillingAccountRow, PaymentsResponse } from '@wg-paid/api/billing';
import { BillingPanel } from './BillingPanel';
import { AdminApiError, loadBillingOverview, loadBillingAccounts, loadBillingPayments, loadBillingAccount } from '../../lib/adminApi';
vi.mock('../../lib/adminApi', async original => ({ ...await original<typeof import('../../lib/adminApi')>(), loadBillingOverview: vi.fn(), loadBillingAccounts: vi.fn(), loadBillingPayments: vi.fn(), loadBillingAccount: vi.fn() }));
const at = '2026-11-01T00:00:00Z';
const account: BillingAccountRow = { billing_account_id:'00000000-0000-4000-8000-000000000001', user_id:'00000000-0000-4000-8000-000000000002', email:'synthetic@example.test', display_name:null, registered_at_utc:null, category:'commercial', status:'trial',billing_mode:'manual',access_grant_status:null,slot_quantity:0,pending_slot_quantity:0,current_period_start_utc:at,current_period_end_utc:'2026-12-01T00:00:00Z',quantity_period_end_utc:'2026-11-15T00:00:00Z',last_succeeded_payment_at_utc:null,last_succeeded_payment_amount_kopeks:0,last_reminder_sent_at_utc:null,current_period_reminder_sent_at_utc:null,reminder_evidence_truncated:true,due_within_3_days:true };
const overview: Overview = { as_of_utc:at,period_start_utc:at,period_end_utc:at,scope:'commercial',accounts_by_status:{active_paid:0,trial:3},active_paid_due_within_3_days:0,ever_paid_accounts:8,succeeded_count:0,succeeded_gross_kopeks:0,created_count:0,pending_count:0,canceled_count:0,unattributed_succeeded_count:null,unattributed_succeeded_kopeks:null,reminder_sent_count:0 };
const payments: PaymentsResponse = {as_of_utc:at,scope:'commercial',days:30,status:'all',total:1,limit:50,offset:0,has_more:false,rows:[{payment_id:'00000000-0000-4000-8000-000000000003',billing_account_id:null,user_id:null,email:null,category:'unattributed',kind:'future_kind',status:'succeeded',provider_status:'succeeded',amount_kopeks:199,currency:'RUB',quantity_before:0,quantity_after:1,created_at_utc:at,succeeded_at_utc:at,target_period_start_utc:null,target_period_end_utc:null}]};
function mount(expire = vi.fn()) { const client = new QueryClient({ defaultOptions:{queries:{retry:false}} });const view=render(<QueryClientProvider client={client}><BillingPanel onSessionExpired={expire}/></QueryClientProvider>);return {...view,client,expire}; }
beforeEach(() => {
 vi.mocked(loadBillingOverview).mockResolvedValue(overview);
 vi.mocked(loadBillingAccounts).mockImplementation(async f => ({as_of_utc:at,scope:f.scope ?? 'commercial',total:101,limit:50,offset:f.offset ?? 0,has_more:true,rows:[account]}));
 vi.mocked(loadBillingPayments).mockResolvedValue(payments);
 vi.mocked(loadBillingAccount).mockResolvedValue({as_of_utc:at,account,timeline:[{type:'reminder_smtp_accepted',at_utc:null,evidence_source:'audit_events'},{type:'reminder_link_used',at_utc:at,evidence_source:'audit_events'}],timeline_truncated:true,reminder_delivery_read_tracking:false});
});
afterEach(() => {vi.clearAllMocks();vi.useRealTimers();});
test('defaults, unknown account states, detached ledger, distinct dates and bounded reminder evidence', async () => {
 mount(); await screen.findByText('Без привязки к аккаунту');
 expect(loadBillingOverview).toHaveBeenCalledWith(30,'commercial',expect.any(AbortSignal));
 expect(screen.getByText(/Review исключён/)).toBeVisible(); expect(screen.getAllByText(/trial/).length).toBeGreaterThan(0); expect(screen.queryByText(/Оплачено до/)).toBeNull();
 screen.getByRole('button',{name:'synthetic@example.test'}).focus(); fireEvent.click(screen.getByRole('button',{name:'synthetic@example.test'}));
 const detail=await screen.findByRole('region',{name:'Выбранный аккаунт'});
 expect(loadBillingAccount).toHaveBeenCalledWith(account.billing_account_id,50,expect.any(AbortSignal));
 expect(within(detail).getByText(/не полный реестр/)).toBeVisible();expect(within(detail).getByText(/Evidence напоминаний ограничен/)).toBeVisible();
 expect(within(detail).getByText(/Напоминание принято SMTP/)).toBeVisible();expect(within(detail).getAllByText(/не доказывает причину/)[0]!).toBeVisible();
 fireEvent.click(within(detail).getByRole('button',{name:'Показать до 100 событий'}));await waitFor(()=>expect(loadBillingAccount).toHaveBeenLastCalledWith(account.billing_account_id,100,expect.any(AbortSignal)));
 fireEvent.click(await screen.findByRole('button',{name:'Закрыть сведения'}));expect(screen.getByRole('button',{name:'synthetic@example.test'})).toHaveFocus();
});
test('paging, all periods and scopes reset only relevant filters and clear detail', async () => {
 mount();await screen.findByText('Без привязки к аккаунту');
 fireEvent.click(within(screen.getByRole('navigation',{name:'Страницы аккаунтов'})).getByText('Следующие'));
 await waitFor(()=>expect(loadBillingAccounts).toHaveBeenLastCalledWith(expect.objectContaining({offset:50}),expect.any(AbortSignal)));
 for(const days of [90,365]) {fireEvent.change(screen.getByLabelText('Период платежей'),{target:{value:String(days)}});await waitFor(()=>expect(loadBillingPayments).toHaveBeenLastCalledWith(expect.objectContaining({days,offset:0}),expect.any(AbortSignal)));}
 expect(loadBillingAccounts).toHaveBeenLastCalledWith(expect.objectContaining({offset:50}),expect.any(AbortSignal));
 fireEvent.change(screen.getByLabelText('Статус аккаунта'),{target:{value:'trial'}});await waitFor(()=>expect(loadBillingAccounts).toHaveBeenLastCalledWith(expect.objectContaining({status:'trial',offset:0}),expect.any(AbortSignal)));
 for(const scope of ['review','all','commercial']) {fireEvent.change(screen.getByLabelText('Область'),{target:{value:scope}});await waitFor(()=>expect(loadBillingOverview).toHaveBeenCalledWith(365,scope,expect.any(AbortSignal)));}
 fireEvent.change(screen.getByLabelText('Статус платежа'),{target:{value:'pending'}});await waitFor(()=>expect(loadBillingPayments).toHaveBeenLastCalledWith(expect.objectContaining({status:'pending'}),expect.any(AbortSignal)));
});
test('search trims after 250ms, bounds length and cancels superseded request', async () => {
 const v=mount();await screen.findByText('Без привязки к аккаунту'); vi.useFakeTimers();
 const input=screen.getByLabelText('Поиск по email');expect(input).toHaveAttribute('maxlength','120');
 fireEvent.change(input,{target:{value:'  next@example.test  '}});await act(async()=>{vi.advanceTimersByTime(249);});expect(loadBillingAccounts).toHaveBeenLastCalledWith(expect.objectContaining({query:''}),expect.any(AbortSignal));
 await act(async()=>{vi.advanceTimersByTime(1);});expect(loadBillingAccounts).toHaveBeenLastCalledWith(expect.objectContaining({query:'next@example.test',offset:0}),expect.any(AbortSignal));
 v.unmount();
});
test('network failure retains explicitly stale snapshot; 403 purges affected cached payload', async () => {
 const v=mount();await screen.findByText('Без привязки к аккаунту');vi.mocked(loadBillingPayments).mockRejectedValue(new AdminApiError(503));
 fireEvent.click(screen.getByRole('button',{name:'Обновить Billing'}));await screen.findByText(/Показаны сохранённые устаревшие/);expect(screen.getByText('Без привязки к аккаунту')).toBeVisible();
 vi.mocked(loadBillingPayments).mockRejectedValue(new AdminApiError(403));await waitFor(()=>expect(screen.getByRole('button',{name:'Обновить Billing'})).not.toBeDisabled());fireEvent.click(screen.getByRole('button',{name:'Обновить Billing'}));await screen.findByText('Доступ запрещён (403).');
 expect(screen.queryByText('Без привязки к аккаунту')).toBeNull();await waitFor(()=>expect(v.client.getQueryCache().findAll({queryKey:['admin','billing','payments']})[0]!.state.data).toBeUndefined());
});
test('401 hides private data and calls existing session callback', async () => {
 vi.mocked(loadBillingPayments).mockRejectedValue(new AdminApiError(401));const v=mount();await waitFor(()=>expect(v.expire).toHaveBeenCalled());expect(screen.queryByRole('heading',{name:'Billing'})).toBeNull();
});
test('unmount aborts requests, no polling, late resolution does not repopulate purged cache', async () => {
 let resolve!: (value: Overview)=>void;let signal: AbortSignal | undefined;
 vi.mocked(loadBillingOverview).mockImplementation((_d,_s,s)=>{signal=s;return new Promise(r=>{resolve=r;});});
 const v=mount();await waitFor(()=>expect(signal).toBeDefined());
 for(const q of v.client.getQueryCache().findAll({queryKey:['admin','billing']})) {expect(q.options.retry).toBe(false);expect(q.options).not.toHaveProperty('refetchInterval');}
 v.unmount();await v.client.cancelQueries({queryKey:['admin']});v.client.removeQueries({queryKey:['admin']});expect(signal!.aborted).toBe(true);
 await act(async()=>{resolve(overview);});expect(v.client.getQueryCache().findAll({queryKey:['admin','billing']})).toHaveLength(0);
});


test('a new committed search aborts the pending old request and ignores its late account result', async () => {
 let oldSignal: AbortSignal | undefined;
 let finish!: (value: Awaited<ReturnType<typeof loadBillingAccounts>>) => void;
 vi.mocked(loadBillingAccounts).mockImplementation((f,signal) => {
   if (!f.query) { oldSignal=signal; return new Promise(resolve => {finish=resolve;}); }
   return Promise.resolve({as_of_utc:at,scope:'commercial',total:0,limit:50,offset:0,has_more:false,rows:[]});
 });
 mount(); await waitFor(()=>expect(oldSignal).toBeDefined());
 fireEvent.change(screen.getByLabelText('Поиск по email'),{target:{value:'new@example.test'}});
 await waitFor(()=>expect(oldSignal!.aborted).toBe(true));
 await act(async()=>{finish({as_of_utc:at,scope:'commercial',total:1,limit:50,offset:0,has_more:false,rows:[account]});});
 expect(screen.queryByRole('button',{name:'synthetic@example.test'})).toBeNull();
 expect(screen.getByText('Нет аккаунтов на этой странице.')).toBeVisible();
});

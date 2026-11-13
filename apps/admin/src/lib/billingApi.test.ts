// @vitest-environment node
import { afterEach, expect, test, vi } from 'vitest';
import { client } from '../../../../packages/api/src/generated-billing/client.gen';
import { loadBillingOverview, loadBillingAccounts, loadBillingAccount, loadBillingPayments } from './adminApi';
afterEach(() => vi.unstubAllGlobals());
test('all four generated Billing GETs preserve filters, cookies, no-store and cancellation without secrets or CSRF', async () => {
  client.setConfig({ baseUrl: 'https://admin.example.test' });
  const requests: Request[] = [];
  vi.stubGlobal('fetch', vi.fn(async (r: Request) => { requests.push(r); return Response.json({}); }));
  const c = new AbortController();
  await loadBillingOverview(90, 'review', c.signal);
  await loadBillingAccounts({ scope: 'commercial', status: 'active_paid', query: 'a@example.test', limit: 50, offset: 5000 }, c.signal);
  await loadBillingAccount('00000000-0000-4000-8000-000000000001', 100, c.signal);
  await loadBillingPayments({ scope: 'all', days: 365, status: 'succeeded', limit: 50, offset: 50 }, c.signal);
  expect(requests.map(r => new URL(r.url).pathname)).toEqual(['/v2/admin/billing/overview','/v2/admin/billing/accounts','/v2/admin/billing/accounts/00000000-0000-4000-8000-000000000001','/v2/admin/billing/payments']);
  expect(Object.fromEntries(new URL(requests[1]!.url).searchParams)).toEqual({ scope: 'commercial', status: 'active_paid', query: 'a@example.test', limit: '50', offset: '5000' });
  expect(new URL(requests[0]!.url).searchParams.get('days')).toBe('90');
  expect(new URL(requests[2]!.url).searchParams.get('limit')).toBe('100');
  expect(new URL(requests[3]!.url).searchParams.get('days')).toBe('365');
  c.abort();
  for (const r of requests) { expect(r.method).toBe('GET'); expect(r.credentials).toBe('same-origin'); expect(r.cache).toBe('no-store'); expect(r.headers.has('x-admin-token')).toBe(false); expect(r.headers.has('x-admin-csrf-token')).toBe(false); expect(r.signal.aborted).toBe(true); }
});
test.each([401,403,422,503])('preserves HTTP %s across every Billing adapter', async status => {
  client.setConfig({ baseUrl: 'https://admin.example.test' });
  const fetch = vi.fn(async () => Response.json({}, { status })); vi.stubGlobal('fetch', fetch);
  for (const call of [() => loadBillingOverview(30,'commercial'), () => loadBillingAccounts({limit:50,offset:0}), () => loadBillingAccount('00000000-0000-4000-8000-000000000001',50), () => loadBillingPayments({limit:50,offset:0})]) await expect(call()).rejects.toMatchObject({status});
  expect(fetch).toHaveBeenCalledTimes(4);
});
test('rejects out of bounds pagination and search before network', async () => {
  await expect(loadBillingAccounts({limit:50,offset:5001})).rejects.toThrow(RangeError);
  await expect(loadBillingAccounts({limit:50,offset:0,query:'a'.repeat(121)})).rejects.toThrow(RangeError);
  await expect(loadBillingAccount('id',101)).rejects.toThrow(RangeError);
});

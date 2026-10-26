// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { client } from '../../../../packages/api/src/generated-broadcasts/client.gen';
import { createBroadcast, loadBroadcast, loadBroadcasts, pauseBroadcast, previewBroadcast, resumeBroadcast, sendBroadcast, testBroadcast } from './adminApi';

beforeEach(() => { vi.stubGlobal('document', { cookie: '' }); });
afterEach(() => { vi.unstubAllGlobals(); });

test('generated broadcast requests use cookie session and existing CSRF; no header admin secret or arbitrary test recipient', async () => {
  client.setConfig({ baseUrl: 'https://admin.example.test' });
  document.cookie = 'wg_admin_csrf=synthetic%20csrf; Path=/';
  const requests: Request[] = [];
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => {
    requests.push(request);
    return new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } });
  }));
  const body = { audience: 'active' as const, subject: 'Synthetic subject', body: 'Synthetic message' };
  const signal = new AbortController().signal;
  await loadBroadcasts(signal); await loadBroadcast('synthetic-id', signal);
  await previewBroadcast(body); await createBroadcast(body); await testBroadcast('synthetic-id');
  await sendBroadcast('synthetic-id', 3); await pauseBroadcast('synthetic-id'); await resumeBroadcast('synthetic-id');
  expect(requests.map((request) => [request.method, new URL(request.url).pathname])).toEqual([
    ['GET', '/v2/admin/broadcasts'], ['GET', '/v2/admin/broadcasts/synthetic-id'],
    ['POST', '/v2/admin/broadcasts/preview'], ['POST', '/v2/admin/broadcasts'],
    ['POST', '/v2/admin/broadcasts/synthetic-id/test'], ['POST', '/v2/admin/broadcasts/synthetic-id/send'],
    ['POST', '/v2/admin/broadcasts/synthetic-id/pause'], ['POST', '/v2/admin/broadcasts/synthetic-id/resume']
  ]);
  expect(new URL(requests[0]!.url).searchParams.get('limit')).toBe('100');
  for (const request of requests) {
    expect(request.credentials).toBe('same-origin');
    expect(request.headers.has('x-admin-token')).toBe(false);
    expect(request.headers.get('x-admin-csrf-token')).toBe(request.method === 'POST' ? 'synthetic csrf' : null);
  }
  expect(await requests[2]!.json()).toEqual(body);
  expect(await requests[3]!.json()).toEqual(body);
  expect(await requests[4]!.text()).toBe('');
  expect(await requests[5]!.json()).toEqual({ confirmed_recipient_count: 3 });
});

test.each([401, 403, 404, 409, 422, 503])('generated requests preserve HTTP %s and never retry a mutation', async (status) => {
  client.setConfig({ baseUrl: 'https://admin.example.test' });
  const fetch = vi.fn(async () => new Response('{}', { status, headers: { 'Content-Type': 'application/json' } }));
  vi.stubGlobal('fetch', fetch);
  await expect(sendBroadcast('synthetic-id', 3)).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledOnce();
});

test('GET cancellation reaches the generated Request AbortSignal', async () => {
  client.setConfig({ baseUrl: 'https://admin.example.test' });
  let received: Request | undefined;
  vi.stubGlobal('fetch', vi.fn(async (request: Request) => { received = request; return new Response('[]', { headers: { 'Content-Type': 'application/json' } }); }));
  const controller = new AbortController();
  await loadBroadcasts(controller.signal);
  controller.abort();
  expect(received?.signal.aborted).toBe(true);
});

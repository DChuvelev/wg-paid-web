// @vitest-environment node
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { client } from '@wg-paid/api/client';
import { createDiagnostic, downloadDiagnostic, loadDiagnostic } from './adminApi';

const id = '4bde688a-f374-4c20-9a51-d89d57de0001';
const job = {
  request_id: id, state: 'queued', created_at: '2026-11-10T10:00:00Z', expires_at: '2026-11-10T10:10:00Z'
};
const origin = 'https://admin.example.test';
const path = '/v2/admin/diagnostics';
const signal = () => new AbortController().signal;

beforeEach(() => {
  client.setConfig({ baseUrl: origin });
  vi.stubGlobal('document', { cookie: '' });
});
afterEach(() => vi.unstubAllGlobals());

test.each([[202, 'queued'], [200, 'partial']] as const)('accepts HTTP %s with one empty, authorized POST', async (status, state) => {
  document.cookie = 'wg_admin_csrf=synthetic%20csrf';
  const fetch = vi.fn<(request: Request) => Promise<Response>>(async () => Response.json({ ...job, state }, { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(createDiagnostic(signal())).resolves.toMatchObject({ id, state });
  expect(fetch).toHaveBeenCalledOnce();
  const request = fetch.mock.calls[0]![0];
  expect(request).toMatchObject({ url: origin + path, method: 'POST', credentials: 'same-origin', cache: 'no-store' });
  expect(request.headers.get('x-admin-csrf-token')).toBe('synthetic csrf');
  expect(request.body).toBeNull();
});

test.each([[403, '', null], [403, 'wg_admin_csrf=invalid', 'invalid'], [401, '', null]] as const)(
  'keeps server HTTP %s authoritative with CSRF cookie %s', async (status, cookie, csrf) => {
    document.cookie = cookie;
    const fetch = vi.fn(async (request: Request) => {
      expect(request.headers.get('x-admin-csrf-token')).toBe(csrf);
      return Response.json({}, { status });
    });
    vi.stubGlobal('fetch', fetch);
    await expect(createDiagnostic(signal())).rejects.toMatchObject({ status });
    expect(fetch).toHaveBeenCalledOnce();
  }
);

test('status and ZIP GETs use cookies, no CSRF, no-store and a cancellable request', async () => {
  document.cookie = 'wg_admin_csrf=synthetic';
  const fetch = vi.fn(async (request: Request) => request.url.endsWith('/download')
    ? new Response('synthetic', { headers: { 'Content-Type': 'application/zip', 'Content-Disposition': 'attachment; filename="synthetic.zip"' } })
    : Response.json(job));
  vi.stubGlobal('fetch', fetch);
  const controller = new AbortController();
  await expect(loadDiagnostic(id, controller.signal)).resolves.toMatchObject({ id, state: 'queued' });
  const zip = await downloadDiagnostic(id, controller.signal);
  expect(zip.filename).toBe('synthetic.zip');
  expect(await zip.blob.text()).toBe('synthetic');
  expect(fetch.mock.calls.map(([request]) => request.url)).toEqual([origin + path + '/' + id, origin + path + '/' + id + '/download']);
  controller.abort();
  for (const [request] of fetch.mock.calls) {
    expect(request).toMatchObject({ method: 'GET', credentials: 'same-origin', cache: 'no-store' });
    expect(request.headers.has('x-admin-csrf-token')).toBe(false);
    expect(request.signal.aborted).toBe(true);
  }
});

test.each([401, 404, 409, 410, 503])('preserves download HTTP %s without retry', async (status) => {
  const fetch = vi.fn(async () => Response.json({}, { status }));
  vi.stubGlobal('fetch', fetch);
  await expect(downloadDiagnostic(id, signal())).rejects.toMatchObject({ status });
  expect(fetch).toHaveBeenCalledOnce();
});

test('rejects unexpected status data or non-ZIP success responses', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ ...job, request_id: 'invalid' })));
  await expect(loadDiagnostic(id, signal())).rejects.toThrow('Admin API request failed');
  await expect(downloadDiagnostic(id, signal())).rejects.toThrow('Admin API request failed');
});

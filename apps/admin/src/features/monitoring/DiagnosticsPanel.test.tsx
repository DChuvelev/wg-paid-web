import { StrictMode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import {
  AdminApiError, createDiagnostic, downloadDiagnostic, loadDiagnostic, type DiagnosticJob
} from '../../lib/adminApi';
import { DiagnosticsPanel } from './DiagnosticsPanel';
import { clearDiagnosticId } from './useDiagnostic';

vi.mock('../../lib/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/adminApi')>(),
  createDiagnostic: vi.fn(), loadDiagnostic: vi.fn(), downloadDiagnostic: vi.fn()
}));

const id = '4bde688a-f374-4c20-9a51-d89d57de0001';
const storageKey = 'wg-admin-diagnostic-request';
const now = Date.parse('2026-11-10T10:00:00Z');
const job = (state: DiagnosticJob['state']): DiagnosticJob => ({
  id, state, createdAt: now, expiresAt: now + 600_000, errorCode: null
});
const create = vi.mocked(createDiagnostic);
const load = vi.mocked(loadDiagnostic);
const download = vi.mocked(downloadDiagnostic);
const start = () => screen.getByRole('button', { name: 'Собрать диагностику' });
const zip = () => screen.queryByRole('button', { name: 'Скачать ZIP' });
const createUrl = vi.fn(() => 'blob:synthetic');
const revokeUrl = vi.fn();

function mount(client = new QueryClient(), expired = vi.fn()) {
  const element = <StrictMode><QueryClientProvider client={client}>
    <DiagnosticsPanel onSessionExpired={expired} />
  </QueryClientProvider></StrictMode>;
  return { ...render(element), element, client, expired };
}

async function advance(ms = 0) {
  await act(async () => { await vi.advanceTimersByTimeAsync(ms); });
  // React Query defers observer notifications.
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
}

beforeEach(() => {
  sessionStorage.clear();
  vi.resetAllMocks();
  createUrl.mockReturnValue('blob:synthetic');
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = createUrl;
    static revokeObjectURL = revokeUrl;
  });
  vi.useFakeTimers();
  vi.setSystemTime(now);
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStorage.clear();
});

test('only a click enqueues once across double click and rerender, then active GETs stop at partial', async () => {
  create.mockResolvedValue(job('queued'));
  load.mockResolvedValueOnce(job('running')).mockResolvedValueOnce(job('partial'));
  const view = mount();
  expect(create).not.toHaveBeenCalled();
  expect(load).not.toHaveBeenCalled();
  const button = start();
  act(() => { button.click(); button.click(); });
  view.rerender(view.element);
  await advance();
  expect(screen.getByText('Задание в очереди.')).toBeVisible();
  expect(start()).toBeDisabled();
  expect(zip()).toBeNull();
  await advance(4_000);
  expect(screen.getByText('Идёт сбор диагностики.')).toBeVisible();
  await advance(4_000);
  expect(zip()).toBeEnabled();
  expect(screen.getByText(/ограниченном режиме \(review scope\)/)).toHaveTextContent('это не итоговая оценка здоровья всей сети');
  await advance(16_000);
  expect(load).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledOnce();
  expect(sessionStorage.getItem(storageKey)).toBe(id);
});

test('status requests do not overlap, are aborted on unmount and restore via GET only', async () => {
  create.mockResolvedValue(job('queued'));
  load.mockImplementationOnce(() => new Promise(() => {})).mockResolvedValue(job('ready'));
  const view = mount();
  fireEvent.click(start());
  await advance();
  await advance(12_000);
  expect(load).toHaveBeenCalledOnce();
  const requestSignal = load.mock.calls[0]?.[1];
  view.unmount();
  expect(requestSignal?.aborted).toBe(true);
  await advance(20_000);
  expect(load).toHaveBeenCalledOnce();
  mount(view.client);
  await advance();
  expect(zip()).toBeEnabled();
  expect(create).toHaveBeenCalledOnce();
  expect(load).toHaveBeenLastCalledWith(id, expect.any(AbortSignal));
});

test('active polling stops at the deadline and a new request requires a click', async () => {
  const stale = { ...job('running'), expiresAt: now + 4_000 };
  create.mockResolvedValue(stale);
  load.mockResolvedValue(stale);
  mount();
  fireEvent.click(start());
  await advance();
  await advance(9_000);
  expect(screen.getByText('Время автоматического ожидания истекло.')).toBeVisible();
  const calls = load.mock.calls.length;
  expect(calls).toBeGreaterThan(0);
  await advance(30_000);
  expect(load).toHaveBeenCalledTimes(calls);
  expect(create).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Собрать заново' }));
  await advance();
  expect(create).toHaveBeenCalledTimes(2);
});

test.each(['ready', 'partial'] as const)('downloads %s once and releases the temporary URL after unmount', async (state) => {
  create.mockResolvedValue(job(state));
  const blob = new Blob(['synthetic'], { type: 'application/zip' });
  download.mockResolvedValue({ blob, filename: 'synthetic.zip' });
  const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    expect(this.download).toBe('synthetic.zip');
    expect(this.href).toBe('blob:synthetic');
  });
  const view = mount();
  fireEvent.click(start());
  await advance();
  expect(screen.getByText('Подробные предупреждения и исходные наблюдения содержатся в скачиваемом ZIP.')).toBeVisible();
  expect(screen.getByText(state === 'ready' ? 'Архив готов к скачиванию.' : 'Архив готов к скачиванию (частичный результат).')).toBeVisible();
  if (state === 'ready') expect(screen.queryByText(/review scope/)).toBeNull();
  const button = zip();
  expect(button).toBeEnabled();
  act(() => { button?.click(); button?.click(); });
  await advance();
  expect(download).toHaveBeenCalledOnce();
  expect(createUrl).toHaveBeenCalledWith(blob);
  expect(click).toHaveBeenCalledOnce();
  expect(document.querySelector('a[download]')).toBeNull();
  expect(revokeUrl).not.toHaveBeenCalled();
  view.unmount();
  await advance(1_000);
  expect(revokeUrl).toHaveBeenCalledExactlyOnceWith('blob:synthetic');
  expect(create).toHaveBeenCalledOnce();
});

test('a result expires locally without an additional GET or POST', async () => {
  create.mockResolvedValue({ ...job('ready'), expiresAt: now + 5_000 });
  mount();
  fireEvent.click(start());
  await advance();
  expect(zip()).toBeEnabled();
  await advance(5_000);
  expect(zip()).toBeNull();
  expect(screen.getByText('Срок хранения архива истёк.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Собрать заново' })).toBeEnabled();
  expect(load).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledOnce();
});

test.each([
  [404, 'Задание не найдено.'],
  [409, 'Архив пока недоступен. Обновите статус задания.'],
  [410, 'Срок хранения архива истёк.'],
  [503, 'Сервер не подтвердил целостность архива.']
] as const)('handles download HTTP %s without queuing again or saving bytes', async (status, message) => {
  create.mockResolvedValue(job('ready'));
  download.mockRejectedValue(new AdminApiError(status, 'opaque server details'));
  mount();
  fireEvent.click(start());
  await advance();
  fireEvent.click(screen.getByRole('button', { name: 'Скачать ZIP' }));
  await advance();
  expect(screen.getByText(message)).toBeVisible();
  expect(screen.queryByText('opaque server details')).toBeNull();
  expect(zip()).toBeNull();
  expect(createUrl).not.toHaveBeenCalled();
  expect(create).toHaveBeenCalledOnce();
  expect(load).not.toHaveBeenCalled();
});

test('restores a missing job gracefully and ignores malformed or cleared IDs', async () => {
  sessionStorage.setItem(storageKey, 'bad-id');
  mount().unmount();
  expect(load).not.toHaveBeenCalled();
  sessionStorage.setItem(storageKey, id);
  load.mockRejectedValue(new AdminApiError(404));
  const view = mount();
  await advance();
  expect(screen.getByText('Задание не найдено.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Собрать заново' })).toBeEnabled();
  view.unmount();
  clearDiagnosticId();
  mount();
  expect(sessionStorage.getItem(storageKey)).toBeNull();
  expect(create).not.toHaveBeenCalled();
});

test('a failed job shows a safe mapped error and allows a manual new run', async () => {
  create.mockResolvedValue({ ...job('failed'), errorCode: 'COLLECTOR_TIMEOUT' });
  mount();
  fireEvent.click(start());
  await advance();
  expect(screen.getByText('Истекло время сбора диагностики.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Собрать заново' })).toBeEnabled();
  expect(load).not.toHaveBeenCalled();
  expect(zip()).toBeNull();
});

test('401 takes the existing session-expired path', async () => {
  create.mockRejectedValue(new AdminApiError(401));
  const view = mount();
  fireEvent.click(start());
  await advance();
  expect(view.expired).toHaveBeenCalledOnce();
  expect(screen.queryByRole('region', { name: 'Диагностика системы' })).toBeNull();
  expect(create).toHaveBeenCalledOnce();
});

test('network error stops polling and manual refresh only reads status', async () => {
  create.mockResolvedValue(job('queued'));
  load.mockRejectedValueOnce(new TypeError('network')).mockResolvedValue(job('ready'));
  mount();
  fireEvent.click(start());
  await advance();
  await advance(16_000);
  expect(screen.getByRole('alert')).toHaveTextContent('Не удалось обновить статус задания.');
  expect(load).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole('button', { name: 'Обновить статус' }));
  await advance();
  expect(zip()).toBeEnabled();
  expect(load).toHaveBeenCalledTimes(2);
  expect(create).toHaveBeenCalledOnce();
});

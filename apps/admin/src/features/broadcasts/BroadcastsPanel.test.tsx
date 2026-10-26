import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import type { BroadcastSummary } from '@wg-paid/api';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { AdminApiError, createBroadcast, loadBroadcast, loadBroadcasts, pauseBroadcast, previewBroadcast, resumeBroadcast, sendBroadcast, testBroadcast } from '../../lib/adminApi';
import { BroadcastsPanel } from './BroadcastsPanel';
import { BroadcastDetails } from './BroadcastDetails';
import { canSendDraft, detailKey, draftTtl, historyKey, pollingWindow } from './broadcastDomain';

vi.mock('../../lib/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/adminApi')>(),
  createBroadcast: vi.fn(), loadBroadcast: vi.fn(), loadBroadcasts: vi.fn(), pauseBroadcast: vi.fn(),
  previewBroadcast: vi.fn(), resumeBroadcast: vi.fn(), sendBroadcast: vi.fn(), testBroadcast: vi.fn()
}));

let draft: BroadcastSummary;
const clients: QueryClient[] = [];
beforeEach(() => {
  vi.resetAllMocks();
  draft = { id: 'synthetic-broadcast', audience: 'active', subject: 'Обновление сервиса', body: '<b>Обычный текст</b>',
    state: 'draft', recipient_count: 3, created_at: new Date().toISOString(), confirmed_at: null, test_attempted_at: null, counts: { pending: 3 } };
  vi.mocked(loadBroadcasts).mockImplementation(async () => [{ ...draft }]);
  vi.mocked(loadBroadcast).mockImplementation(async () => ({ ...draft }));
  vi.mocked(previewBroadcast).mockImplementation(async (body) => ({ ...body, recipient_count: 2 }));
  vi.mocked(createBroadcast).mockImplementation(async () => ({ ...draft }));
  vi.mocked(testBroadcast).mockResolvedValue(undefined);
  vi.mocked(sendBroadcast).mockImplementation(async () => (draft = { ...draft, state: 'queued', confirmed_at: new Date().toISOString() }));
  vi.mocked(pauseBroadcast).mockImplementation(async () => (draft = { ...draft, state: 'paused' }));
  vi.mocked(resumeBroadcast).mockImplementation(async () => (draft = { ...draft, state: 'queued' }));
});
afterEach(() => { clients.forEach((client) => client.clear()); clients.length = 0; vi.useRealTimers(); });

function mount(client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: 3 } } })) {
  clients.push(client);
  const expired = vi.fn();
  return { client, expired, ...render(<QueryClientProvider client={client}><BroadcastsPanel onSessionExpired={expired} /></QueryClientProvider>) };
}
function fill(subject = '  Обновление сервиса  ', body = '<b>Обычный текст</b>') {
  fireEvent.change(screen.getByLabelText('Тема'), { target: { value: subject } });
  fireEvent.change(screen.getByLabelText('Текст письма'), { target: { value: body } });
}
async function openDetails() {
  const history = await screen.findByRole('list');
  await waitFor(() => expect(within(history).getAllByRole('button')).toHaveLength(1));
  fireEvent.click(within(history).getByRole('button'));
  return screen.findByRole('region', { name: 'Детали рассылки' });
}
async function openConfirmation() {
  const prepare = screen.getByRole('button', { name: 'Подготовить отправку' });
  await waitFor(() => expect(prepare).toBeEnabled());
  fireEvent.click(prepare);
  fireEvent.change(screen.getByLabelText('Введите число адресатов для подтверждения'), { target: { value: '3' } });
  return screen.getByRole('button', { name: 'Подтвердить отправку: 3 адресатов' });
}

test('preview uses trimmed subject, active default and actual audience count; editing invalidates preview', async () => {
  mount(); fill();
  expect(screen.getByRole('button', { name: 'Создать черновик' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  const preview = await screen.findByRole('region', { name: 'Предпросмотр письма' });
  expect(previewBroadcast).toHaveBeenCalledWith({ audience: 'active', subject: 'Обновление сервиса', body: '<b>Обычный текст</b>' });
  expect(preview).toHaveTextContent('Адресатов: 2');
  expect(preview.querySelector('b')).toBeNull();
  fireEvent.change(screen.getByLabelText('Аудитория'), { target: { value: 'all' } });
  expect(screen.queryByRole('region', { name: 'Предпросмотр письма' })).toBeNull();
  expect(screen.getByRole('button', { name: 'Создать черновик' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  await screen.findByRole('region', { name: 'Предпросмотр письма' });
  expect(previewBroadcast).toHaveBeenLastCalledWith(expect.objectContaining({ audience: 'all' }));
});

test.each([
  ['x'.repeat(201), 'body'], ['', 'body'], ['Subject', 'x'.repeat(10001)], ['Subject', ''], ['Subject', 'a\0b']
])('rejects invalid compose values without POST', async (subject, body) => {
  mount(); fill(subject, body);
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  await screen.findByRole('alert');
  expect(previewBroadcast).not.toHaveBeenCalled();
  expect(createBroadcast).not.toHaveBeenCalled();
});

test('validates Unicode code points and accepts exact 200/10000 limits', async () => {
  mount(); fill(` ${'😀'.repeat(200)} `, 'x'.repeat(10000));
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  await screen.findByRole('region', { name: 'Предпросмотр письма' });
  expect(previewBroadcast).toHaveBeenCalledWith(expect.objectContaining({ subject: '😀'.repeat(200) }));
});

test('create is immutable and send requires separate exact-count confirmation using draft count, never preview count', async () => {
  mount(); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  await screen.findByRole('region', { name: 'Предпросмотр письма' });
  fireEvent.click(screen.getByRole('button', { name: 'Создать черновик' }));
  const details = await screen.findByRole('region', { name: 'Детали рассылки' });
  expect(details).toHaveTextContent('Адресатов: 3');
  expect(createBroadcast).toHaveBeenCalledOnce();
  expect(sendBroadcast).not.toHaveBeenCalled();
  const prepare = screen.getByRole('button', { name: 'Подготовить отправку' });
  await waitFor(() => expect(prepare).toBeEnabled());
  fireEvent.click(prepare);
  const send = screen.getByRole('button', { name: 'Подтвердить отправку: 3 адресатов' });
  expect(send).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Введите число адресатов для подтверждения'), { target: { value: '2' } });
  expect(send).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Отмена' }));
  expect(sendBroadcast).not.toHaveBeenCalled();
  const confirm = await openConfirmation();
  fireEvent.click(confirm); fireEvent.click(confirm);
  await screen.findByRole('button', { name: 'Приостановить' });
  expect(sendBroadcast).toHaveBeenCalledExactlyOnceWith(draft.id, 3);
  expect(details.querySelector('b')).toBeNull();
});

test('one test attempt has no address input, blocks double clicks and stays blocked after uncertain result/remount', async () => {
  vi.mocked(testBroadcast).mockRejectedValue(new AdminApiError(503, 'sensitive server response'));
  const view = mount(); await openDetails();
  expect(screen.queryByLabelText(/адрес.*почты/i)).toBeNull();
  const testButton = screen.getByRole('button', { name: 'Отправить тест' });
  fireEvent.click(testButton); fireEvent.click(testButton);
  await screen.findByText(/При ошибке или неизвестном результате создайте новый черновик/);
  expect(testBroadcast).toHaveBeenCalledExactlyOnceWith(draft.id);
  expect(testButton).toBeDisabled();
  expect(document.body.textContent).not.toContain('sensitive server response');
  view.unmount(); mount(view.client); await openDetails();
  expect(screen.getByRole('button', { name: 'Отправить тест' })).toBeDisabled();
});

test('an empty audience still allows one configured-inbox test but no mass send', async () => {
  draft.recipient_count = 0; draft.counts = {};
  mount(); await openDetails();
  expect(screen.getByRole('button', { name: 'Подготовить отправку' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Отправить тест' }));
  await screen.findByText(/Тест принят почтовым сервером/);
  expect(testBroadcast).toHaveBeenCalledExactlyOnceWith(draft.id);
  expect(sendBroadcast).not.toHaveBeenCalled();
});

test('late mutation completion after leaving Administration cannot repopulate session cache or refetch', async () => {
  let resolveCreate!: (value: BroadcastSummary) => void;
  vi.mocked(createBroadcast).mockImplementation(() => new Promise((resolve) => { resolveCreate = resolve; }));
  const view = mount(); fill();
  fireEvent.click(screen.getByRole('button', { name: 'Предпросмотр' }));
  await screen.findByRole('region', { name: 'Предпросмотр письма' });
  const create = screen.getByRole('button', { name: 'Создать черновик' });
  fireEvent.click(create); fireEvent.click(create);
  await waitFor(() => expect(createBroadcast).toHaveBeenCalledOnce());
  view.unmount(); view.client.clear();
  const historyRequests = vi.mocked(loadBroadcasts).mock.calls.length;
  await act(async () => { resolveCreate(draft); });
  expect(view.client.getQueryCache().getAll()).toHaveLength(0);
  expect(loadBroadcasts).toHaveBeenCalledTimes(historyRequests);
});

test('409 refreshes GETs and never retries send, including across remount', async () => {
  vi.mocked(sendBroadcast).mockRejectedValue(new AdminApiError(409, 'recipient_snapshot_changed'));
  const view = mount(); await openDetails();
  fireEvent.click(await openConfirmation());
  await screen.findByText(/Конфликт \(409\)/);
  await waitFor(() => expect(loadBroadcast).toHaveBeenCalledTimes(2));
  expect(sendBroadcast).toHaveBeenCalledOnce();
  expect(screen.getByRole('button', { name: 'Подготовить отправку' })).toBeDisabled();
  view.unmount(); mount(view.client); await openDetails();
  expect(screen.getByRole('button', { name: 'Подготовить отправку' })).toBeDisabled();
});

test('pause/resume use backend transitions; completed/uncertain counts never claim delivery', async () => {
  draft.state = 'sending'; draft.confirmed_at = new Date().toISOString();
  draft.counts = { smtp_accepted: 1, uncertain: 1, pending: 1 };
  mount(); await openDetails();
  expect(screen.getByText('Принято почтовым сервером')).toBeVisible();
  expect(screen.getByText('Неопределённый результат')).toBeVisible();
  expect(screen.queryByText('Доставлено')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Приостановить' }));
  const resume = await screen.findByRole('button', { name: 'Возобновить' });
  await waitFor(() => expect(resume).toBeEnabled());
  fireEvent.click(resume);
  await screen.findByRole('button', { name: 'Приостановить' });
  expect(pauseBroadcast).toHaveBeenCalledExactlyOnceWith(draft.id);
  expect(resumeBroadcast).toHaveBeenCalledExactlyOnceWith(draft.id);
});

test.each(['completed', 'completed_with_uncertain', 'future_state'])('state %s permits no destructive actions or polling', async (state) => {
  draft.state = state;
  const view = mount(); await openDetails();
  for (const name of ['Приостановить', 'Возобновить', 'Подготовить отправку', 'Отправить тест']) expect(screen.queryByRole('button', { name })).toBeNull();
  for (const key of [historyKey, detailKey(draft.id)]) {
    const query = view.client.getQueryCache().find({ queryKey: key })!;
    const interval = query.options as { refetchInterval: (query: unknown) => number | false };
    expect(interval.refetchInterval(query)).toBe(false);
  }
});

test('expired and empty drafts cannot be sent; open confirmation expires without a POST', async () => {
  draft.created_at = new Date(Date.now() - draftTtl - 1).toISOString();
  expect(canSendDraft(draft)).toBe(false);
  expect(canSendDraft({ ...draft, created_at: new Date().toISOString(), recipient_count: 0 })).toBe(false);
  draft.created_at = new Date(Date.now() - draftTtl + 1500).toISOString();
  vi.useFakeTimers();
  const action = vi.fn();
  render(<BroadcastDetails draft={draft} disabled={false} testAttempted={false} sendAttempted={false} onAction={action} />);
  fireEvent.click(screen.getByRole('button', { name: 'Подготовить отправку' }));
  fireEvent.change(screen.getByLabelText('Введите число адресатов для подтверждения'), { target: { value: '3' } });
  await act(async () => { await vi.advanceTimersByTimeAsync(1600); });
  expect(screen.getByRole('button', { name: 'Подготовить отправку' })).toBeDisabled();
  expect(screen.queryByRole('button', { name: 'Подтвердить отправку: 3 адресатов' })).toBeNull();
  expect(sendBroadcast).not.toHaveBeenCalled();
  expect(action).not.toHaveBeenCalled();
});

test('running polling is GET-only and bounded, manual refresh works after timeout, unmount aborts GETs', async () => {
  draft.state = 'sending';
  vi.useFakeTimers();
  const view = mount();
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  await act(async () => { fireEvent.click(within(screen.getByRole('list')).getByRole('button')); await vi.advanceTimersByTimeAsync(1); });
  await act(async () => { await vi.advanceTimersByTimeAsync(pollingWindow + 10000); });
  const calls = vi.mocked(loadBroadcast).mock.calls.length;
  expect(calls).toBeGreaterThan(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(60000); });
  expect(loadBroadcast).toHaveBeenCalledTimes(calls);
  expect(sendBroadcast).not.toHaveBeenCalled(); expect(testBroadcast).not.toHaveBeenCalled();
  expect(pauseBroadcast).not.toHaveBeenCalled(); expect(resumeBroadcast).not.toHaveBeenCalled();
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Обновить рассылки' })); await vi.advanceTimersByTimeAsync(1); });
  expect(loadBroadcast).toHaveBeenCalledTimes(calls + 1);
  let signal: AbortSignal | undefined;
  vi.mocked(loadBroadcast).mockImplementation((_id, incoming) => { signal = incoming; return new Promise(() => {}); });
  await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Обновить рассылки' })); await vi.advanceTimersByTimeAsync(1); });
  view.unmount(); expect(signal?.aborted).toBe(true);
});

test.each([401, 403, 404, 503])('GET error %s stops detail polling and blocks stale actions; 401 ends session', async (status) => {
  const view = mount(); await openDetails();
  vi.mocked(loadBroadcast).mockRejectedValue(new AdminApiError(status, 'private raw detail'));
  fireEvent.click(screen.getByRole('button', { name: 'Обновить рассылки' }));
  if (status === 401) await waitFor(() => expect(view.expired).toHaveBeenCalled());
  else {
    await screen.findByText(/Действия заблокированы/);
    expect(screen.getByRole('button', { name: 'Подготовить отправку' })).toBeDisabled();
    expect(view.expired).not.toHaveBeenCalled();
  }
  expect(document.body.textContent).not.toContain('private raw detail');
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import type { AdminCapacityResponse, AdminCapacitySnapshot, AdminCapacityWindow, AdminMonitoringEventsResponse, AdminMonitoringSummaryResponse } from '@wg-paid/api';
import { beforeEach, expect, test, vi } from 'vitest';
import { AdminApiError, loadMonitoringCapacity, loadMonitoringEvents, loadMonitoringSummary } from '../../lib/adminApi';
import { MonitoringPanel } from './MonitoringPanel';
import { diagnosticSummary, nextEventsOffset, numberText, rateText } from './monitoringDomain';

vi.mock('../../lib/adminApi', async (importOriginal) => ({
  ...await importOriginal<typeof import('../../lib/adminApi')>(),
  loadMonitoringSummary: vi.fn(), loadMonitoringEvents: vi.fn(), loadMonitoringCapacity: vi.fn()
}));

const timestamp = '2026-10-10T12:00:00Z';
const summary: AdminMonitoringSummaryResponse = {
  generated_at_utc: timestamp, window_start_utc: timestamp, window_end_utc: timestamp,
  window_hours: 24, freshness_threshold_seconds: 180, current_tunnel_health_verified: false,
  activity: {
    expected_minutes: 1440, observed_minutes: 1000, complete_minutes: 900, partial_minutes: 100,
    unknown_minutes: 40, missing_minutes: 400, coverage_ratio_over_window: 1000 / 1440,
    last_observed_minute_utc: timestamp, last_received_at_utc: timestamp, last_received_age_seconds: 200,
    stale: true, peak_active_configurations_observed: 7, peak_active_users_observed: 5,
    last_active_configurations_observed: null, last_active_users_observed: null,
    last_selector_peaks_observed: { egress1: 2, egress2: null, egress3: 0, egress5: 1 },
    unmatched_rows_total: 1, conflicted_slots_total: 0
  },
  stream_coverage: [{ source_stream: 'health', last_attempt_at_utc: timestamp, last_success_at_utc: null,
    success_age_seconds: null, stale: true, continuity: 'gap_detected', gap_count: 2,
    unknown_lines_total: 1, heartbeat_total: 3, ingested_events_total: 4, last_gap_first_at_utc: null, last_gap_last_at_utc: null }],
  event_observations: [
    { source_stream: 'health', egress_slot: 1, event_type: 'health_recovered', provenance: 'historical_retained_only', count: 2 },
    { source_stream: 'health', egress_slot: 1, event_type: 'probe', provenance: 'historical_retained_only', count: 3 },
    { source_stream: 'health', egress_slot: 1, event_type: 'probe', provenance: 'forward_live', count: 4 },
    { source_stream: 'recovery', egress_slot: 1, event_type: 'recovery_attempt', provenance: 'forward_live', count: 1 },
    { source_stream: 'recovery', egress_slot: null, event_type: 'recovery_attempt', provenance: 'historical_retained_only', count: 6 }
  ]
};
const events: AdminMonitoringEventsResponse = {
  generated_at_utc: timestamp, window_start_utc: timestamp, window_end_utc: timestamp,
  offset: 0, limit: 50, has_more: true,
  rows: [{ event_at_utc: timestamp, observed_at_utc: timestamp, source_stream: 'health', egress_slot: null,
    event_type: 'probe', result: 'pass', provenance: 'historical_retained_only' },
  { event_at_utc: '2026-10-10T11:00:00Z', observed_at_utc: timestamp, source_stream: 'recovery', egress_slot: 1,
    event_type: 'recovery_attempt', result: 'failed', provenance: 'forward_live' }]
};
const capacity: AdminCapacityResponse = {
  generated_at_utc: timestamp, status: 'unavailable', snapshot_at_utc: null, age_seconds: null,
  freshness_threshold_seconds: 2700, snapshot: null, current_tunnel_health_verified: false
};
const capacityWindow: AdminCapacityWindow = { status: 'partial', cpu_avg_pct: null, cpu_p95_pct: 12,
  mem_p95_pct: 30, netin_p95_bytes_per_sec: 1000, netout_p95_bytes_per_sec: null,
  diskread_p95_bytes_per_sec: 2000000, diskwrite_p95_bytes_per_sec: null, latest_age_sec: 100, points: 5 };
const snapshot: AdminCapacitySnapshot = {
  schema: 'wg-capacity-delivery-v1', source: 'vm130_resource_monitor', generated_at_utc: timestamp, source_status: 'partial',
  vms: { vm100: { status: 'partial', vcpus: 1, day: capacityWindow, week: capacityWindow } },
  guests: { vm121: { status: 'available', mem_total_mib: 2048, mem_available_mib: null, mem_available_pct: null,
    swap_used_mib: 0, psi_cpu_avg300: 1, psi_memory_avg300: null, psi_io_avg300: 0 } },
  node: { status: 'partial', cpu_count: 8, mem_used_pct: null, day_cpu_avg_pct: 5, week_cpu_avg_pct: null },
  nic: { status: 'unknown', link_up: null, link_mbps: null }
};

const writeText = vi.fn<(text: string) => Promise<void>>();
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadMonitoringSummary).mockResolvedValue(structuredClone(summary));
  vi.mocked(loadMonitoringEvents).mockImplementation(async (_window, offset) => ({ ...events, offset, has_more: offset === 0 }));
  vi.mocked(loadMonitoringCapacity).mockResolvedValue(structuredClone(capacity));
  writeText.mockResolvedValue();
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
});
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const expired = vi.fn();
  const view = render(<QueryClientProvider client={client}><MonitoringPanel onSessionExpired={expired} /></QueryClientProvider>);
  return { ...view, client, expired };
}

const selectorTable = () => screen.getByRole('table', { name: 'Пять логических селекторов' });
const selectorRow = (slot: number) => within(selectorTable()).getByRole('rowheader', { name: `egress${slot}` }).closest('tr')!;
const selectorValues = (slot: number) => within(selectorRow(slot)).getAllByRole('cell').slice(0, 3).map((cell) => cell.textContent);

test('renders observed coverage, five selectors, unknowns, stale and provenance without asserting live tunnel health', async () => {
  mount();
  await screen.findByText('Покрытие окна');
  expect(screen.getByText('Это история наблюдений, а не проверка доступности VPN в реальном времени.')).toBeVisible();
  expect(screen.getByText('Покрытие окна').nextElementSibling).toHaveTextContent('1000 / 1440 мин · 69.44 %');
  expect(screen.getByText(/Последняя наблюдавшаяся закрытая минута/)).toHaveTextContent(timestamp);
  expect(screen.getByText(/Активность · последняя наблюдавшаяся минута/).nextElementSibling).toHaveTextContent('Конфигурации: Нет данных · Пользователи: Нет данных');
  fireEvent.click(screen.getByText('За выбранный период'));
  expect(screen.getByText('Неизвестных минут').nextElementSibling).toHaveTextContent('40');
  expect(screen.getByText('Пропущенных минут').nextElementSibling).toHaveTextContent('400');
  expect(screen.getByText('Частичных минут').nextElementSibling).toHaveTextContent('100');
  expect(screen.getByText('Несопоставленные строки').nextElementSibling).toHaveTextContent('1');
  expect(screen.getByText('Конфликтующие слоты').nextElementSibling).toHaveTextContent('0');
  expect(screen.getByText('Пик конфигураций').nextElementSibling).toHaveTextContent('7');
  expect(screen.getByText('Пик пользователей').nextElementSibling).toHaveTextContent('5');
  expect(screen.getByText('Поток health').nextElementSibling).toHaveTextContent('Свежесть неизвестна · Обнаружены пропуски');
  expect(screen.getByText('Поток recovery').nextElementSibling).toHaveTextContent('Нет данных о потоке');
  expect(within(selectorTable()).getAllByRole('rowheader').map((cell) => cell.textContent)).toEqual(['egress1', 'egress2', 'egress3', 'egress4', 'egress5']);
  expect(selectorValues(1)).toEqual(['2', '9', '1']);
  expect(selectorValues(2)).toEqual(['Нет данных', '0', '0']);
  expect(selectorValues(3)).toEqual(['0', '0', '0']);
  expect(selectorValues(4)).toEqual(['Нет данных', '0', '0']);
  expect(selectorRow(2)).toHaveTextContent('Нет оценки последней минуты');
  expect(selectorRow(5)).toHaveTextContent('Нет событий за период');
  const first = within(selectorRow(1));
  fireEvent.click(first.getByText('Происхождение событий'));
  expect(first.getByText('Прямые наблюдения (forward_live): 4')).toBeVisible();
  expect(first.getByText('Сохранённая история (historical_retained_only): 5')).toBeVisible();
  const system = screen.getByText('Системные события без привязки к egress').parentElement!;
  expect(system).toHaveTextContent('health: 0 · recovery: 6');
  const systemDetails = within(system.parentElement!);
  fireEvent.click(systemDetails.getByText('Происхождение событий'));
  expect(systemDetails.getByText('Сохранённая история (historical_retained_only): 6')).toBeVisible();
  const timeline = screen.getByRole('list');
  expect(within(timeline).getAllByRole('listitem')[0]).toHaveTextContent('Системное событие без привязки к egress');
  expect(timeline).toHaveTextContent('historical_retained_only');
  expect(timeline).toHaveTextContent('forward_live');
  expect(document.body.textContent).not.toMatch(/туннель работает|текущий статус UP|healthy/);
});

test('flags missing selector estimates when the observed aggregate is positive', async () => {
  vi.mocked(loadMonitoringSummary).mockResolvedValue({ ...summary, activity: { ...summary.activity,
    last_active_configurations_observed: 3,
    last_selector_peaks_observed: { egress1: null, egress2: null, egress3: null, egress4: null, egress5: null }
  } });
  mount();
  expect(await screen.findByText(/Требуется сверка агрегации/)).toBeVisible();
  for (let slot = 1; slot <= 5; slot++) expect(selectorValues(slot)[0]).toBe('Нет данных');
});

test('24h/7d windows reset paging; only has_more permits the next bounded page', async () => {
  const weekStart = '2026-10-03T12:00:00Z';
  vi.mocked(loadMonitoringSummary).mockImplementation(async (window) => window === 24 ? summary : {
    ...summary, window_hours: 168, window_start_utc: weekStart, event_observations: []
  });
  vi.mocked(loadMonitoringEvents).mockImplementation(async (window, offset) => ({
    ...events, offset, has_more: offset === 0, window_start_utc: window === 168 ? weekStart : timestamp,
    rows: offset === 0 ? events.rows : []
  }));
  mount();
  const next = screen.getByRole('button', { name: 'Следующие' });
  await waitFor(() => expect(next).toBeEnabled());
  expect(loadMonitoringSummary).toHaveBeenLastCalledWith(24, expect.any(AbortSignal));
  fireEvent.click(next);
  await screen.findByText('Страница 2');
  await waitFor(() => expect(loadMonitoringEvents).toHaveBeenLastCalledWith(24, 50, expect.any(AbortSignal)));
  await waitFor(() => expect(next).toBeDisabled());
  expect(selectorValues(1)).toEqual(['2', '9', '1']);
  fireEvent.click(screen.getByRole('button', { name: 'Предыдущие' }));
  await waitFor(() => expect(next).toBeEnabled());
  expect(screen.getByText('Страница 1')).toBeVisible();
  fireEvent.click(next);
  await screen.findByText('Страница 2');
  fireEvent.change(screen.getByLabelText('Период наблюдений'), { target: { value: '168' } });
  await waitFor(() => expect(loadMonitoringSummary).toHaveBeenLastCalledWith(168, expect.any(AbortSignal)));
  expect(loadMonitoringEvents).toHaveBeenLastCalledWith(168, 0, expect.any(AbortSignal));
  expect(screen.getByText('Страница 1')).toBeVisible();
  await waitFor(() => expect(selectorValues(1)).toEqual(['2', '0', '0']));
  expect(screen.getByText(/Сформировано сервером/)).toHaveTextContent(weekStart);
  expect(screen.getByText(/^Сформировано:/)).toHaveTextContent(weekStart);
  expect(loadMonitoringCapacity).toHaveBeenCalledOnce();
  expect(nextEventsOffset({ ...events, offset: 4950 })).toBe(5000);
  expect(nextEventsOffset({ ...events, offset: 5000 })).toBeNull();
  expect(nextEventsOffset({ ...events, has_more: false })).toBeNull();
  expect(nextEventsOffset({ ...events, limit: 100 })).toBeNull();
});

test('absent receipt and success age remain unknown even if stale is false', async () => {
  vi.mocked(loadMonitoringSummary).mockResolvedValue({ ...summary,
    activity: { ...summary.activity, last_received_age_seconds: null, stale: false },
    stream_coverage: [{ ...summary.stream_coverage[0]!, last_success_at_utc: timestamp, success_age_seconds: null, stale: false, continuity: null }] });
  mount(); await screen.findByText('Покрытие окна');
  expect(screen.getByText(/Приём активности:/)).toHaveTextContent('Возраст: Нет данных · Свежесть неизвестна');
  expect(screen.getByText('Поток health').nextElementSibling).toHaveTextContent('Свежесть неизвестна · Неизвестно');
});

test.each([
  [null, null, 'Свежесть неизвестна'],
  [timestamp, 200, 'Устарело (stale)']
] as const)('uses timestamps and age before stale for activity and streams (%s, %s)', async (time, age, expected) => {
  vi.mocked(loadMonitoringSummary).mockResolvedValue({ ...summary,
    activity: { ...summary.activity, last_received_at_utc: time, last_received_age_seconds: age, stale: true },
    stream_coverage: [{ ...summary.stream_coverage[0]!, last_success_at_utc: time, success_age_seconds: age, stale: true }]
  });
  mount();
  await screen.findByText('Покрытие окна');
  expect(screen.getByText(/Приём активности:/)).toHaveTextContent(expected);
  expect(screen.getByText('Поток health').nextElementSibling).toHaveTextContent(expected);
});

test('omits counters for an untouched stream and retains observed zero counters', async () => {
  const untouched = { ...summary.stream_coverage[0]!, last_attempt_at_utc: null, last_success_at_utc: null,
    gap_count: 0, unknown_lines_total: 0, heartbeat_total: 0, ingested_events_total: 0 };
  vi.mocked(loadMonitoringSummary).mockResolvedValue({ ...summary, stream_coverage: [
    untouched,
    { ...untouched, source_stream: 'recovery', last_success_at_utc: timestamp, success_age_seconds: 0,
      stale: false, continuity: 'continuous' }
  ] });
  mount();
  await screen.findByText('Покрытие окна');
  expect(screen.getByText('Поток health').parentElement).toHaveTextContent(/^Поток healthНет данных о потоке$/);
  expect(screen.getByText('Поток recovery').parentElement).toHaveTextContent('В пределах порога · Без обнаруженных пропусков');
  expect(screen.getByText('Поток recovery').parentElement).toHaveTextContent('Пропуски: 0 · Неизвестные строки: 0');
  fireEvent.click(screen.getByText('За выбранный период'));
  expect(screen.queryByText(/^health · Последняя попытка:/)).toBeNull();
  expect(screen.getByText(/^recovery · Последняя попытка:/)).toHaveTextContent('Heartbeat: 0 · Полученные события: 0');
});

test.each(['partial', 'stale'] as const)('capacity shows %s, units, partial/missing metrics and observed 1-vCPU configuration', async (status) => {
  vi.mocked(loadMonitoringCapacity).mockResolvedValue({ ...capacity, status, snapshot, snapshot_at_utc: timestamp, age_seconds: 3000 });
  mount();
  await screen.findByText(/Источник: vm130_resource_monitor/);
  const section = screen.getByRole('heading', { name: 'Ресурсы и ёмкость' }).parentElement!;
  expect(section).toHaveTextContent(status);
  expect(section).toHaveTextContent('2048 MiB');
  expect(section).toHaveTextContent('1 kB/s');
  expect(section).toHaveTextContent('2 MB/s');
  expect(section).toHaveTextContent('PSI CPU / memory / IO (%)');
  expect(section).toHaveTextContent('Сеть in / out · исторический p95');
  expect(section).toHaveTextContent('VM100: 1 vCPU — наблюдаемая конфигурация');
  expect(section).toHaveTextContent('Наблюдаемый link: —');
  expect(within(section).getAllByRole('row')[1]).toHaveTextContent('— / 12 %');
});

test('absent capacity snapshot is unavailable, never zero or healthy', async () => {
  mount();
  await screen.findByText('Снимок ресурсов отсутствует.');
  expect(screen.getByRole('heading', { name: 'Ресурсы и ёмкость' }).parentElement).toHaveTextContent('unavailable');
  expect(within(screen.getByRole('region', { name: 'Ресурсы и ёмкость' })).queryByRole('table')).toBeNull();
  expect(numberText(null, ' %')).toBe('—');
  expect(numberText(0, ' %')).toBe('0 %');
  expect(rateText(null)).toBe('—');
});

test.each([401, 403, 503] as const)('HTTP %s is handled without echoing error text', async (status) => {
  vi.mocked(loadMonitoringSummary).mockRejectedValue(new AdminApiError(status, 'token=synthetic-secret pii@example.test'));
  const view = mount();
  if (status === 401) await waitFor(() => expect(view.expired).toHaveBeenCalled());
  else {
    await screen.findByRole('alert');
    expect(view.expired).not.toHaveBeenCalled();
    if (status === 403) expect(screen.getByRole('alert')).toHaveTextContent('Доступ запрещён (403)');
  }
  expect(document.body.textContent).not.toContain('synthetic-secret');
});

test('manual copy is bounded, sanitizes secret/PII-shaped values and causes no extra requests', async () => {
  const secret = 'pii@example.test token=synthetic-secret PrivateKey=synthetic-key 10.253.1.10 https://provider.example.test';
  const poisoned = { ...summary, generated_at_utc: secret, arbitrary_extra: secret,
    event_observations: [{ ...summary.event_observations[0]!, event_type: secret }],
    activity: { ...summary.activity, last_received_at_utc: secret, last_selector_peaks_observed: { ...summary.activity.last_selector_peaks_observed, extra: secret } },
    stream_coverage: [{ ...summary.stream_coverage[0]!, continuity: secret }] };
  const poisonedCapacity = { ...capacity, status: secret, snapshot: { ...snapshot, source: secret, source_status: secret } };
  const exported = diagnosticSummary({ window: 24,
    summary: poisoned as unknown as AdminMonitoringSummaryResponse,
    capacity: poisonedCapacity as unknown as AdminCapacityResponse,
    events: { ...events, rows: [{ ...events.rows[0]!, event_type: secret }] } });
  for (const item of secret.split(' ')) expect(exported).not.toContain(item);
  expect(exported).toContain('B4/v1');
  expect(exported).toContain('historical_retained_only');
  expect(exported.length).toBeLessThanOrEqual(8000);
  mount();
  const button = screen.getByRole('button', { name: 'Скопировать диагностическую сводку' });
  await waitFor(() => expect(button).toBeEnabled());
  expect(writeText).not.toHaveBeenCalled();
  fireEvent.click(button);
  await screen.findByText('Диагностическая сводка скопирована.');
  expect(loadMonitoringSummary).toHaveBeenCalledOnce();
  expect(loadMonitoringEvents).toHaveBeenCalledOnce();
  expect(loadMonitoringCapacity).toHaveBeenCalledOnce();
  writeText.mockRejectedValueOnce(new Error('permission denied'));
  fireEvent.click(button);
  await screen.findByText('Не удалось скопировать сводку.');
});

test('diagnostics mark failed endpoints unavailable even after cached data; refresh is GET-only', async () => {
  mount();
  await screen.findByText('Покрытие окна');
  vi.mocked(loadMonitoringSummary).mockRejectedValue(new Error('transport'));
  fireEvent.click(screen.getByRole('button', { name: 'Обновить мониторинг' }));
  await screen.findByRole('alert');
  expect(screen.getByText(/^Сводка\. Показаны данные/)).toBeVisible();
  expect(selectorValues(1)).toEqual(['2', '9', '1']);
  const copy = screen.getByRole('button', { name: 'Скопировать диагностическую сводку' });
  await waitFor(() => expect(copy).toBeEnabled());
  fireEvent.click(copy);
  await waitFor(() => expect(writeText).toHaveBeenCalled());
  expect(writeText.mock.calls[0]![0]).toContain('summary: unavailable');
  expect(loadMonitoringSummary).toHaveBeenCalledTimes(2);
});

test('summary and events failures are independent of the other panels', async () => {
  vi.mocked(loadMonitoringSummary).mockRejectedValue(new Error('summary transport'));
  mount();
  expect(await screen.findByText(/^Сводка: Не удалось/)).toBeVisible();
  expect(selectorValues(1)).toEqual(['Нет данных', 'Нет данных', 'Нет данных']);
  expect(screen.queryByText('Нет событий за период')).toBeNull();
  expect(await screen.findByRole('list')).toBeVisible();
  expect(await screen.findByText('Снимок ресурсов отсутствует.')).toBeVisible();
  vi.mocked(loadMonitoringSummary).mockResolvedValue(summary);
  vi.mocked(loadMonitoringEvents).mockRejectedValue(new Error('events transport'));
  fireEvent.click(screen.getByRole('button', { name: 'Обновить мониторинг' }));
  expect(await screen.findByText(/^События: Не удалось/)).toBeVisible();
  expect(screen.getByText(/^События\. Показаны данные/)).toBeVisible();
  expect(screen.queryByText(/^Сводка: Не удалось/)).toBeNull();
  expect(selectorValues(1)).toEqual(['2', '9', '1']);
});

test('unmount cancels outstanding GETs and query configuration has no recurring polling', async () => {
  let requestSignal: AbortSignal | undefined;
  vi.mocked(loadMonitoringSummary).mockImplementation((_window, signal) => {
    requestSignal = signal;
    return new Promise(() => {});
  });
  const view = mount();
  await waitFor(() => expect(requestSignal).toBeDefined());
  expect(screen.getByText('Загрузка сводки…')).toBeVisible();
  expect(selectorValues(1)).toEqual(['Нет данных', 'Нет данных', 'Нет данных']);
  const monitoringQueries = view.client.getQueryCache().findAll({ queryKey: ['admin', 'monitoring'] });
  expect(monitoringQueries).toHaveLength(3);
  for (const query of monitoringQueries) expect(query.options).not.toHaveProperty('refetchInterval');
  expect(screen.getByRole('region', { name: 'Диагностика системы' })).toBeVisible();
  expect(view.client.getQueryCache().find({ queryKey: ['admin', 'diagnostic', null] })?.isActive()).toBe(false);
  view.unmount();
  await act(async () => {});
  expect(requestSignal!.aborted).toBe(true);
});

test('mobile tables remain bounded and keyboard-scrollable at existing breakpoint', async () => {
  vi.mocked(loadMonitoringCapacity).mockResolvedValue({ ...capacity, snapshot });
  mount(); await screen.findByText(/Источник: vm130_resource_monitor/);
  for (const name of ['Пять логических селекторов', 'Ресурсы виртуальных машин', 'Память и PSI гостевых систем']) {
    expect(screen.getByRole('region', { name })).toHaveAttribute('tabindex', '0');
  }
  const css = readFileSync('apps/admin/src/features/monitoring/Monitoring.module.css', 'utf8');
  expect(css).toContain('@media (max-width: 760px)');
  expect(css).toContain('overflow-x: auto');
  expect(css).toContain('minmax(0, 1fr)');
});

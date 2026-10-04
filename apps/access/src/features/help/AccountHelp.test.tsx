import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, test, vi } from 'vitest';
import { LocaleProvider } from '../../i18n/LocaleProvider';
import { resources } from '../../i18n/resources';
import { localeStorageKey } from '../../i18n/localeContext';
import { useLocale } from '../../i18n/localeContext';
import { AccountHelp, HelpEntry } from './AccountHelp';
import { useCommercialHelp, useHelpAnchor, useHelpBlocker } from './helpContext';
import { createHelpPersistence, helpStorageKey } from './helpStorage';
import type { HelpTopicId } from './helpModel';

beforeEach(() => { localStorage.setItem(localeStorageKey, 'en'); });
function Target({ topic, instance, ready = false, available = true, usable = false }: { topic: HelpTopicId; instance?: string; ready?: boolean; available?: boolean; usable?: boolean }) {
  const anchor = useHelpAnchor(topic, { instance, readyVariant: ready, available, discoveryUsable: usable, values: { count: 2 } });
  return <div {...anchor}><button type="button">{topic} target {instance}</button></div>;
}
function Fixture({ invitations = false, add = false, count = 1, paid = false, succeededPayments = paid ? 1 : 0, blocked = false, naming = true, extra = false }: { invitations?: boolean; add?: boolean; count?: number; paid?: boolean; succeededPayments?: number; blocked?: boolean; naming?: boolean; extra?: boolean }) {
  useCommercialHelp({ resolved: true, scope: 'synthetic', count, paid, succeededPayments });
  useHelpBlocker(blocked);
  const { setLocale } = useLocale();
  return <><button type="button" onClick={() => setLocale('ru')}>RU</button><Target topic="account" /><Target topic="userName" /><Target topic="billing" /><Target topic="billingHistory" />
    <Target topic="configurations" /><Target topic="addConfiguration" available={add} usable={add} />
    {naming ? <Target topic="configurationName" instance="first" ready /> : null}<Target topic="routing" instance="first" />
    <Target topic="protocols" instance="first" /><Target topic="delivery" instance="first" />
    {extra ? <Target topic="billingPendingPayment" /> : null}<Target topic="invitations" available={invitations} usable={invitations} /><HelpEntry /></>;
}
function content(props: Parameters<typeof Fixture>[0] = {}, user = 'synthetic-user') {
  return <LocaleProvider><AccountHelp userId={user}><Fixture {...props} /></AccountHelp></LocaleProvider>;
}
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 500));
async function showOverview() { fireEvent.click(screen.getByRole('button', { name: 'Help' })); return screen.findByRole('dialog', { name: 'Help' }); }
async function next() { fireEvent.click(screen.getByRole('button', { name: 'Next' })); await settle(); }

test('initial offer requires consent, is comprehensive and finishes without performing actions', async () => {
  render(content()); expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(await screen.findByRole('button', { name: 'Show me around' }));
  await screen.findByRole('dialog', { name: 'Welcome to your Secret Studio account' });
  const titles = ['Your name', 'Access and payment', 'Configurations are for your devices', 'Give the device a useful name', 'Routing', 'Choose a connection method', 'Connect your device', 'Help is always available'];
  for (const title of titles) { await next(); await screen.findByRole('dialog', { name: title }); }
  fireEvent.click(screen.getByRole('button', { name: 'Done' }));
  expect(createHelpPersistence('synthetic-user').read().initial?.status).toBe('completed');
}, 15000);
test('Skip suppresses the revision but manual overview/direct jump/replay remain available', async () => {
  const view = render(content()); fireEvent.click(await screen.findByRole('button', { name: 'Not now' })); view.unmount(); render(content());
  await act(settle); expect(screen.queryByRole('button', { name: 'Show me around' })).toBeNull();
  await showOverview(); expect(screen.getByRole('button', { name: 'Payment history' })).toBeTruthy();
  fireEvent.click(screen.getByRole('button', { name: 'Routing' })); await screen.findByRole('dialog', { name: 'Routing' });
  fireEvent.click(screen.getByRole('button', { name: 'Back to topics' })); fireEvent.click(screen.getByRole('button', { name: 'Walk through the account' }));
  await screen.findByRole('dialog', { name: 'Your Secret Studio account' });
});
test('first observed invitations use neutral discovery and automatic cards do not steal focus', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); render(content({ invitations: true }));
  const control = screen.getByRole('button', { name: 'account target' }); control.focus();
  await screen.findByRole('dialog', { name: 'Invitations are available' }); expect(document.activeElement).toBe(control);
  await waitFor(() => expect(createHelpPersistence('synthetic-user').read().discoveries.invitations).toBe(1));
  fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(control);
});

test('mobile/reduced-motion card stays within the viewport after sizing and keyboard resize', async () => {
  const width = window.innerWidth; const height = window.innerHeight;
  const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
  vi.stubGlobal('matchMedia', (query: string) => ({ matches: query === '(prefers-reduced-motion: reduce)', media: query, addEventListener: () => undefined, removeEventListener: () => undefined }));
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 390 });
  Object.defineProperty(window, 'innerHeight', { configurable: true, value: 844 });
  try {
    createHelpPersistence('synthetic-user').initial('completed'); render(content()); await showOverview();
    fireEvent.click(screen.getByRole('button', { name: 'Access and payment' }));
    const card = await screen.findByRole('dialog', { name: 'Access and payment' });
    expect(card.getAttribute('aria-modal')).toBe('false');
    expect(scroll).toHaveBeenCalledWith(expect.objectContaining({ behavior: 'auto' }));
    expect(Number.parseFloat(card.style.maxHeight)).toBeLessThanOrEqual(844 * 0.45);
    act(() => { Object.defineProperty(window, 'innerHeight', { configurable: true, value: 400 }); window.dispatchEvent(new Event('resize')); });
    await waitFor(() => expect(Number.parseFloat(card.style.maxHeight)).toBeLessThanOrEqual(400 * 0.45));
  } finally {
    scroll.mockRestore();
    vi.unstubAllGlobals();
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: width });
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: height });
  }
});

test('Escape dismisses an offer and overview without removing permanent Help', async () => {
  render(content()); await screen.findByRole('button', { name: 'Show me around' });
  fireEvent.keyDown(document, { key: 'Escape' }); expect(createHelpPersistence('synthetic-user').read().initial?.status).toBe('skipped');
  await showOverview(); fireEvent.keyDown(document, { key: 'Escape' }); expect(screen.queryByRole('dialog')).toBeNull();
  expect(screen.getByRole('button', { name: 'Help' })).toBeTruthy();
});

test('manual overview reflects current capabilities with neutral titles after earlier completion', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await showOverview();
  expect(screen.queryByRole('button', { name: 'Invitations' })).toBeNull();
  view.rerender(content({ invitations: true, add: true, count: 3 }));
  const overview = screen.getByRole('dialog', { name: 'Help' });
  expect(overview.textContent).toContain('Invitations'); expect(overview.textContent).toContain('Additional configurations');
  expect(overview.textContent).not.toContain('now available');
  fireEvent.click(screen.getByRole('button', { name: 'Invitations' })); await screen.findByRole('dialog', { name: 'Invitations' });
});
test('quantity and invitations from one paid transition form one session with independent delivery', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await act(settle);
  view.rerender(content({ count: 2, paid: true, invitations: true }));
  await screen.findByRole('dialog', { name: 'Payment confirmed. What’s now available' });
  expect(screen.queryByText('Step 1 of 2')).toBeNull();
  expect(createHelpPersistence('synthetic-user').read().discoveries).toEqual({});
  await next(); await screen.findByRole('dialog', { name: 'You have additional configurations' });
  expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  await waitFor(() => expect(createHelpPersistence('synthetic-user').read().discoveries.commercialConfigurationQuantityIncrease).toBe(1));
  expect(createHelpPersistence('synthetic-user').read().discoveries.invitations).toBeUndefined();
  await next(); await screen.findByRole('dialog', { name: 'Invitations are now available' });
});
test('paid-to-paid payment progression still delivers all discoveries without a now-paid intro', async () => {
  createHelpPersistence('synthetic-user').initial('completed');
  const view = render(content({ paid: true, succeededPayments: 1 })); await act(settle);
  view.rerender(content({ count: 2, paid: true, succeededPayments: 2, invitations: true }));
  await screen.findByRole('dialog', { name: 'You have additional configurations' });
  expect(screen.queryByText(resources.en.helpPaymentIntroTitle)).toBeNull();
  expect(screen.queryByText(resources.en.helpPaymentIntroBody)).toBeNull();
  expect(screen.getByText('Step 1 of 2')).toBeTruthy();
  await next(); await screen.findByRole('dialog', { name: 'Invitations are now available' });
  expect(screen.getByText('Step 2 of 2')).toBeTruthy();
  expect(screen.queryByText(resources.en.helpPaymentIntroTitle)).toBeNull();
});
test('closing session leaves unshown discoveries unacknowledged', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await act(settle);
  view.rerender(content({ count: 2, invitations: true })); await screen.findByRole('dialog', { name: 'You have additional configurations' });
  fireEvent.click(screen.getByRole('button', { name: 'Close' })); expect(createHelpPersistence('synthetic-user').read().discoveries.invitations).toBeUndefined();
});
test('transition during a walkthrough waits until it ends; new targets are not injected', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await act(settle); await showOverview();
  fireEvent.click(screen.getByRole('button', { name: 'Walk through the account' })); await screen.findByRole('dialog', { name: 'Your Secret Studio account' });
  view.rerender(content({ invitations: true, extra: true })); await act(settle);
  expect(screen.queryByRole('dialog', { name: 'Invitations are now available' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close' })); await screen.findByRole('dialog', { name: 'Invitations are now available' });
});

test('a held pointer postpones automatic discovery until interaction has ended', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await act(settle);
  const target = screen.getByRole('button', { name: 'account target' }); fireEvent.pointerDown(target);
  view.rerender(content({ invitations: true })); await act(() => new Promise<void>((resolve) => setTimeout(resolve, 1100)));
  expect(screen.queryByRole('dialog')).toBeNull(); fireEvent.pointerUp(target);
  await screen.findByRole('dialog', { name: 'Invitations are now available' }, { timeout: 3000 });
});
test('blocked/QR/edit state suspends presentation and resumes without losing a topic', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await showOverview();
  fireEvent.click(screen.getByRole('button', { name: 'Routing' })); await screen.findByRole('dialog', { name: 'Routing' });
  view.rerender(content({ blocked: true })); expect(screen.queryByRole('dialog')).toBeNull(); expect(screen.getByText('Help is paused while you use the account.')).toBeTruthy();
  view.rerender(content()); await screen.findByRole('dialog', { name: 'Routing' });
});
test('missing target advances safely and identity change discards the old run', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); const view = render(content()); await showOverview();
  fireEvent.click(screen.getByRole('button', { name: 'Give the device a useful name' })); await screen.findByRole('dialog', { name: 'Give the device a useful name' });
  view.rerender(content({ naming: false })); await screen.findByRole('dialog', { name: 'Routing' });
  view.rerender(content({}, 'another-user')); expect(screen.queryByRole('dialog')).toBeNull();
  expect(localStorage.getItem(helpStorageKey('another-user'))).toBeNull();
});
test('StrictMode mounts do not duplicate offers or fabricate historical quantity', async () => {
  render(<StrictMode>{content({ count: 3 })}</StrictMode>); await screen.findByRole('button', { name: 'Show me around' });
  expect(screen.getAllByRole('button', { name: 'Show me around' })).toHaveLength(1); expect(screen.queryByText('You have additional configurations')).toBeNull();
});

test('language change keeps the topic, Escape restores focus and links stay safe', async () => {
  createHelpPersistence('synthetic-user').initial('completed'); render(content()); await showOverview();
  fireEvent.click(screen.getByRole('button', { name: 'Choose a connection method' })); await screen.findByRole('dialog', { name: 'Choose a connection method' });
  fireEvent.click(screen.getByRole('button', { name: 'RU' })); await screen.findByRole('dialog', { name: 'Выберите способ подключения' });
  for (const link of screen.getAllByRole('link', { hidden: true })) { expect(link.getAttribute('rel')).toBe('noopener noreferrer'); expect(link.getAttribute('href')).toMatch(/^https:/); }
  fireEvent.keyDown(document, { key: 'Escape' }); await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Помощь' }));
});

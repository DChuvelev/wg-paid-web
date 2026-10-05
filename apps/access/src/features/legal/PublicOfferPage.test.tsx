import { afterEach, expect, test, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { BrowserRouter } from 'react-router';
import { App } from '../../App';
import { publicOffer } from '../../content/publicOffer';
import { localeStorageKey } from '../../i18n/localeContext';
import { renderApp } from '../../test/renderApp';

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState(null, '', '/');
});

test('fresh /#offer opens the complete Russian offer without authentication or login', async () => {
  window.history.replaceState(null, '', '/#offer');
  window.localStorage.setItem(localeStorageKey, 'ru');
  const fetch = vi.spyOn(globalThis, 'fetch');
  render(<BrowserRouter><App /></BrowserRouter>);

  expect(await screen.findByRole('heading', { level: 1, name: publicOffer.ru.title })).toBeTruthy();
  expect(screen.queryByRole('textbox', { name: 'Email' })).toBeNull();
  expect(screen.queryByRole('button', { name: 'Отправить ссылку для входа' })).toBeNull();
  expect(document.querySelector('form')).toBeNull();
  expect(fetch).not.toHaveBeenCalled();
  expect(window.location.pathname).toBe('/');
  expect(window.location.hash).toBe('#offer');

  const offer = screen.getByRole('article');
  for (const text of [
    'Редакция от 1 октября 2026 года',
    'ИНДИВИДУАЛЬНЫЙ ПРЕДПРИНИМАТЕЛЬ ЧУВЕЛЕВ ДМИТРИЙ МИХАЙЛОВИЧ',
    'ИНН: 771003639432', 'ОГРНИП: 308774627600140',
    '125009, Россия, г. Москва, Газетный пер., д. 13/15, кв. 84',
    'Стоимость доступа составляет 299 рублей за один календарный месяц.',
    'Пользователю предоставляется простое неисключительное право использовать полученные материалы в собственных музыкальных, аудиовизуальных, рекламных, игровых и иных творческих проектах, в том числе коммерческих.'
  ]) expect(within(offer).getByText(text)).toBeTruthy();
  expect(within(offer).getAllByRole('heading', { level: 2 })).toHaveLength(9);
  // Every normative paragraph must be presented, including restrictions and refunds.
  for (const paragraph of publicOffer.ru.text.split('\n\n')) {
    expect(within(offer).getByText(paragraph)).toBeTruthy();
  }
  expect(within(offer).getByRole('link', { name: '+7 (993) 905-06-75' }).getAttribute('href')).toBe('tel:+79939050675');
  expect(within(offer).getByRole('link', { name: 'silver-arrow@yandex.ru' }).getAttribute('href')).toBe('mailto:silver-arrow@yandex.ru');
  expect(within(offer).getByRole('link', { name: 'https://vk.ru/clubsecretstudio' }).getAttribute('href')).toBe('https://vk.ru/clubsecretstudio');
});

test('common Access footer navigates to the offer and RU/EN switching preserves it', async () => {
  renderApp('/');
  const footer = screen.getByRole('contentinfo', { name: 'Legal information' });
  expect(footer.textContent).not.toMatch(/Чувелев|771003639432|308774627600140|Газетный|silver-arrow|993|916/);
  expect(footer.querySelectorAll('a')).toHaveLength(2);
  expect(within(footer).getByRole('link', { name: 'Secret Studio on VKontakte' }).getAttribute('rel')).toBe('noopener noreferrer');
  expect(within(footer).getByRole('link', { name: 'Public Offer' }).getAttribute('href')).toBe('/#offer');
  fireEvent.click(within(footer).getByRole('link', { name: 'Public Offer' }));
  expect(await screen.findByRole('heading', { level: 1, name: publicOffer.en.title })).toBeTruthy();
  expect(screen.getByText('The Russian-language version of this offer is authoritative. This English translation is provided for convenience.')).toBeTruthy();
  const offer = screen.getByRole('article');
  for (const paragraph of publicOffer.en.text.split('\n\n')) {
    expect(within(offer).getByText(paragraph)).toBeTruthy();
  }
  expect(within(offer).getAllByRole('heading', { level: 2 })).toHaveLength(9);
  fireEvent.click(screen.getByRole('button', { name: 'RU' }));
  expect(screen.getByRole('heading', { level: 1, name: publicOffer.ru.title })).toBeTruthy();
  expect(screen.queryByText(publicOffer.en.authorityNotice)).toBeNull();
  expect(document.querySelector('form')).toBeNull();
});

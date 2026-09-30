// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksPage } from './WorksPage';
import { ResidentHome } from './ResidentHome';

const { allPages, request } = vi.hoisted(() => ({ allPages: vi.fn(), request: vi.fn() }));
vi.mock('./residentApi', () => ({ allPages, formatDate: () => '27.09.2026', workStatuses: { NEW: 'Новая' }, previewText: (value) => value, queryPath: (path) => path, request }));

let container;
let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; allPages.mockReset(); request.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('показывает обращения без legacy Work list', async () => {
  allPages.mockImplementation((path, query) => Promise.resolve({ items: query.tab === 'active' ? [{ id: 2, title: 'Свет', description: 'Наблюдение', category: 'OTHER', status: 'NEW', createdAt: '2026-09-27T00:00:00Z', author: { id: 42 }, media: [{ id: 1, url: '/one.jpg' }, { id: 2, url: '/two.jpg' }, { id: 3, url: '/three.jpg' }], linkedWork: null, actions: { createWork: true }, isWatching: true }] : [{ id: 3, title: 'Подъезд', description: 'Принятое обращение', category: 'OTHER', status: 'ACCEPTED', createdAt: '2026-09-26T00:00:00Z', author: { id: 99 }, media: [], isWatching: true }] }));
  request.mockResolvedValue({ isWatching: true, watchReason: 'AUTHOR' });
  await act(async () => root.render(<WorksPage houseId={1} houses={[{ id: 1, address: 'Дом' }]} onHouseChange={() => {}} canViewObservations userId={42} onBack={() => {}} />));
  expect(container.querySelector('.house-event-card--work')).toBeNull();
  expect(allPages).toHaveBeenCalledTimes(2);
  expect(container.querySelector('.house-event-card--observation')).not.toBeNull();
  expect(container.querySelector('.page-header')).toBeNull();
  expect(allPages).toHaveBeenCalledWith('/api/houses/1/observations', { tab: 'active', search: '' }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(allPages).toHaveBeenCalledWith('/api/houses/1/observations', { tab: 'history', search: '' }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(container.textContent).toContain('Принятое обращение');
  expect(container.querySelector('[aria-label="Тип события"]')).toBeNull();
  expect(container.querySelector('.house-event-card__gallery-trigger span').textContent).toBe('+2');
  await act(async () => container.querySelector('.house-event-card__gallery-trigger').click());
  expect(container.querySelector('[aria-label="Следующее фото"]')).not.toBeNull();
  expect(container.querySelector('.event-photo-gallery__counter').textContent).toBe('1 / 3');
  await act(async () => container.querySelector('[aria-label="Следующее фото"]').click());
  expect(container.querySelector('.event-photo-gallery__counter').textContent).toBe('2 / 3');
  expect(container.querySelectorAll('.house-event-card--observation .house-event-card__status--observed')).toHaveLength(1);
  expect(container.querySelectorAll('.house-event-card--observation')[0].querySelector('.house-event-card__status--observed')).toBeNull();
  expect(request).not.toHaveBeenCalled();
  expect(container.querySelector('select[aria-label*="дом"]')).toBeNull();
});


it('переключает дом из верхней строки событий', async () => {
  const onHouseChange = vi.fn().mockResolvedValue(undefined);
  allPages.mockResolvedValue({ items: [] });
  request.mockResolvedValue({ items: [{ id: 2, address: 'Другой дом', access: { status: 'ACTIVE' }, actions: { open: true, requestAccess: false, cancelRequest: false } }], total: 1 });
  await act(async () => root.render(<WorksPage houseId={1} houses={[{ id: 1, address: 'Дом' }, { id: 2, address: 'Другой дом' }]} onHouseChange={onHouseChange} canViewObservations onBack={() => {}} />));
  await act(async () => container.querySelector('.home-location-action').click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 270)));
  await act(async () => container.querySelector('[aria-label="Выбрать дом Другой дом"]').click());
  expect(onHouseChange).not.toHaveBeenCalled();
  await act(async () => Array.from(container.querySelectorAll('.house-picker-modal button')).find((button) => button.textContent === 'Готово').click());
  expect(onHouseChange).toHaveBeenCalledWith(2);
});

it('передаёт поисковую строку в API всех обращений', async () => {
  allPages.mockResolvedValue({ items: [] });
  await act(async () => root.render(<WorksPage houseId={1} houses={[{ id: 1, address: 'Дом' }]} canViewObservations onBack={() => {}} />));
  const input = container.querySelector('input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, '  свет  ');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await act(async () => new Promise((resolve) => setTimeout(resolve, 350)));
  expect(allPages).toHaveBeenCalledWith('/api/houses/1/observations', { tab: 'active', search: 'свет' }, expect.any(Object));
  expect(allPages).toHaveBeenCalledWith('/api/houses/1/observations', { tab: 'history', search: 'свет' }, expect.any(Object));
});

it('на Главной загружает только активные обращения дома', async () => {
  allPages.mockResolvedValue({ items: [] });
  await act(async () => root.render(<ResidentHome houseId={1} houses={[{ id: 1, address: 'Дом', permissions: { viewObservations: true } }]} userId={42} onHouseChange={() => {}} onOpen={() => {}} />));
  expect(container.textContent).toContain('Активные события');
  expect(allPages).toHaveBeenCalledExactlyOnceWith('/api/houses/1/observations', { tab: 'active' }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { WorksPage } from './WorksPage';

const { allPages, request } = vi.hoisted(() => ({ allPages: vi.fn(), request: vi.fn() }));
vi.mock('./residentApi', () => ({ allPages, formatDate: () => '27.09.2026', workStatuses: { NEW: 'Новая' }, queryPath: (path) => path, request }));

let container;
let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; allPages.mockReset(); request.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('различает работу и наблюдение в ленте', async () => {
  allPages.mockImplementation((path) => Promise.resolve({ items: path.endsWith('/works') ? [{ id: 1, title: 'Ремонт', description: 'Работа', category: 'OTHER', status: 'NEW', date: '2026-09-27T00:00:00Z', media: [] }] : [{ id: 2, title: 'Свет', description: 'Наблюдение', category: 'OTHER', status: 'NEW', createdAt: '2026-09-27T00:00:00Z', media: [], linkedWork: null, actions: { createWork: true } }] }));
  await act(async () => root.render(<WorksPage houseId={1} houses={[{ id: 1, address: 'Дом' }]} onHouseChange={() => {}} canViewObservations onBack={() => {}} />));
  expect(container.textContent).toContain('Работа');
  expect(container.textContent).toContain('Наблюдение жителя');
  expect(container.querySelector('.house-event-card--work')).not.toBeNull();
  expect(container.querySelector('.house-event-card--observation')).not.toBeNull();
  expect(container.querySelector('select[aria-label*="дом"]')).toBeNull();
});


it('переключает дом из верхней строки событий', async () => {
  const onHouseChange = vi.fn().mockResolvedValue(undefined);
  allPages.mockResolvedValue({ items: [] });
  request.mockResolvedValue({ items: [{ id: 2, address: 'Другой дом', access: { status: 'ACTIVE' }, actions: { open: true, requestAccess: false, cancelRequest: false } }], total: 1 });
  await act(async () => root.render(<WorksPage houseId={1} houses={[{ id: 1, address: 'Дом' }, { id: 2, address: 'Другой дом' }]} onHouseChange={onHouseChange} canViewObservations onBack={() => {}} />));
  await act(async () => container.querySelector('.home-location-action').click());
  await act(async () => new Promise((resolve) => setTimeout(resolve, 270)));
  await act(async () => Array.from(container.querySelectorAll('.home-access-request button')).find((button) => button.textContent.includes('Открыть')).click());
  expect(onHouseChange).toHaveBeenCalledWith(2);
});

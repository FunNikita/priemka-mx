// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { HouseSwitcher } from './HouseSwitcher';

const { request } = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../../pages/residentApi', () => ({ request, queryPath: (path, query) => `${path}?q=${query.q}`, jsonRequest: () => ({}) }));

let container;
let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; vi.useFakeTimers(); request.mockReset(); container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.useRealTimers(); });

it('показывает spinner при поиске и empty после успешного пустого ответа', async () => {
  let resolve;
  request.mockImplementationOnce(() => new Promise((done) => { resolve = done; }));
  await act(async () => root.render(<HouseSwitcher houseId={null} houses={[]} onHouseChange={() => {}} />));
  await act(async () => container.querySelector('.home-location-action').click());
  expect(container.querySelector('.home-access-modal [role="status"]')).not.toBeNull();
  expect(container.textContent).not.toContain('Дома не найдены');
  await act(async () => vi.advanceTimersByTimeAsync(250));
  await act(async () => resolve({ items: [], total: 0 }));
  expect(container.textContent).toContain('Дома не найдены');
  expect(container.textContent).toContain('Попробуйте изменить запрос');
  request.mockResolvedValueOnce({ items: [], total: 0 });
  const search = container.querySelector('.home-access-dialog__input');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(search, 'Тест'); search.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(container.querySelector('.home-access-modal [role="status"]')).not.toBeNull();
});

it('показывает выбранный дом и доступные действия карточками без изменения API', async () => {
  const houses = [
    { id: 1, address: 'Текущий дом', access: { status: 'ACTIVE' }, actions: { open: true, requestAccess: false, cancelRequest: false } },
    { id: 2, address: 'Другой дом', access: { status: 'ACTIVE' }, actions: { open: true, requestAccess: false, cancelRequest: false } },
    { id: 3, address: 'Дом с заявкой', access: { status: 'PENDING' }, actions: { open: false, requestAccess: false, cancelRequest: true } },
    { id: 4, address: 'Новый дом', access: { status: 'NONE' }, actions: { open: false, requestAccess: true, cancelRequest: false } },
  ];
  const onHouseChange = vi.fn().mockResolvedValue(undefined);
  request.mockResolvedValue({ items: houses, total: houses.length });
  await act(async () => root.render(<HouseSwitcher houseId={1} houses={houses} onHouseChange={onHouseChange} />));
  await act(async () => container.querySelector('.home-location-action').click());
  await act(async () => vi.advanceTimersByTimeAsync(250));
  expect(container.querySelector('.house-picker-card--selected').textContent).toContain('Выбран');
  expect(container.querySelector('[aria-label="Запросить доступ к дому Новый дом"] svg')).not.toBeNull();
  expect(container.querySelector('[aria-label="Запросить доступ к дому Новый дом"]').closest('.house-picker-card').textContent).not.toContain('Нет доступа');
  expect(container.querySelector('[aria-label="Отменить заявку на дом Дом с заявкой"] svg')).not.toBeNull();
  await act(async () => container.querySelector('[aria-label="Выбрать дом Другой дом"]').click());
  expect(onHouseChange).not.toHaveBeenCalled();
  expect(container.querySelector('.house-picker-card--selected').textContent).toContain('Другой дом');
  await act(async () => Array.from(container.querySelectorAll('.house-picker-modal button')).find((button) => button.textContent === 'Готово').click());
  expect(onHouseChange).toHaveBeenCalledWith(2);
});

it('отменяет заявку только после подтверждения', async () => {
  const house = { id: 3, address: 'Дом с заявкой', access: { status: 'PENDING' }, actions: { open: false, requestAccess: false, cancelRequest: true } };
  request.mockResolvedValue({ items: [house], total: 1 });
  await act(async () => root.render(<HouseSwitcher houseId={null} houses={[]} onHouseChange={() => {}} />));
  await act(async () => container.querySelector('.home-location-action').click());
  await act(async () => vi.advanceTimersByTimeAsync(250));
  await act(async () => container.querySelector('[aria-label="Отменить заявку на дом Дом с заявкой"]').click());
  expect(request).not.toHaveBeenCalledWith('/api/houses/3/join-requests/me', { method: 'DELETE' });
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(request).toHaveBeenCalledWith('/api/houses/3/join-requests/me', { method: 'DELETE' });
});

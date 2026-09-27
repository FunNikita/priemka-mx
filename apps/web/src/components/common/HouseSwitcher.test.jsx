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

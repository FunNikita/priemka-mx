// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChairmanWorkDetail } from './ChairmanHome';

const { request, loadWorkForm, assignObservationExecutor } = vi.hoisted(() => ({ request: vi.fn(), loadWorkForm: vi.fn(), assignObservationExecutor: vi.fn() }));
vi.mock('./residentApi', () => ({ request, allPages: vi.fn(), formatDate: () => 'Сегодня', workStatuses: { NEW: 'Новая' }, jsonRequest: (method, body) => ({ method, body: JSON.stringify(body) }) }));
vi.mock('./chairmanApi', () => ({ loadWorkForm, assignObservationExecutor, assignInspection: vi.fn(), confirmChairmanDocument: vi.fn(), decideJoinRequest: vi.fn(), generateRefusal: vi.fn(), loadChairmanHome: vi.fn(), loadInspectionForm: vi.fn(), createChairmanObservation: vi.fn() }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  request.mockReset(); loadWorkForm.mockReset(); assignObservationExecutor.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('показывает подробности обращения и отдельно подтверждает назначение', async () => {
  const detail = { id: 42, title: 'Не закрывается дверь', description: 'В первом подъезде', category: 'Двери и домофон', status: 'NEW', house: { address: 'Дом 5' }, media: [{ id: 3, url: '/door.jpg' }], history: [{ id: 1, title: 'Обращение создано', createdAt: '2026-09-29T00:00:00Z' }], comments: [{ id: 2, text: 'Проверили', author: { type: 'USER', displayName: 'Житель', photoUrl: null }, createdAt: '2026-09-29T00:00:00Z', media: [] }], workflow: null, linkedWork: null, actions: { assignExecutor: true, comment: false, watch: false, unwatch: false, assignInspector: false, generateReasonedRefusal: false } };
  request.mockResolvedValue(detail);
  loadWorkForm.mockResolvedValue({ executors: [{ id: 8, name: 'Мария', executorCompanyName: 'ООО Дом' }], templates: [{ id: 3, category: 'COMMON_AREAS' }] });
  assignObservationExecutor.mockResolvedValue({ id: 42 });
  await act(async () => root.render(<ChairmanWorkDetail houseId={5} observationId={42} onBack={() => {}} />));
  expect(container.textContent).toContain('Двери и домофон');
  expect(container.textContent).toContain('В первом подъезде');
  expect(container.textContent).toContain('Проверили');
  expect(container.querySelector('img[src="/door.jpg"]')).not.toBeNull();
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Назначить исполнителя').click());
  const selects = container.querySelectorAll('[role="dialog"] select');
  await act(async () => { selects[0].value = 'COMMON_AREAS'; selects[0].dispatchEvent(new Event('change', { bubbles: true })); selects[1].value = '8'; selects[1].dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Продолжить').click());
  expect(assignObservationExecutor).not.toHaveBeenCalled();
  expect(container.textContent).toContain('ООО Дом');
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(assignObservationExecutor).toHaveBeenCalledWith(42, { executorUserId: 8, category: 'COMMON_AREAS' });
  expect(request).toHaveBeenCalledWith('/api/observations/42');
});

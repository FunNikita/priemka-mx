// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ChairmanHome, ChairmanWorkDetail } from './ChairmanHome';

const { request, loadWorkForm, assignObservationExecutor, loadChairmanHome } = vi.hoisted(() => ({ request: vi.fn(), loadWorkForm: vi.fn(), assignObservationExecutor: vi.fn(), loadChairmanHome: vi.fn() }));
vi.mock('./residentApi', () => ({ request, allPages: vi.fn(), formatDate: () => 'Сегодня', workStatuses: { NEW: 'Новая' }, observationStatusLabel: () => 'Новая', jsonRequest: (method, body) => ({ method, body: JSON.stringify(body) }) }));
vi.mock('./chairmanApi', () => ({ loadWorkForm, assignObservationExecutor, assignInspection: vi.fn(), confirmChairmanDocument: vi.fn(), decideJoinRequest: vi.fn(), generateRefusal: vi.fn(), loadChairmanHome, loadInspectionForm: vi.fn(), createChairmanObservation: vi.fn() }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  request.mockReset(); loadWorkForm.mockReset(); assignObservationExecutor.mockReset(); loadChairmanHome.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('открывает карточку по свободному месту ряда фото, а фото — отдельно', async () => {
  loadChairmanHome.mockResolvedValue({ requests: [], works: [{ id: 42, title: 'Дверь', description: 'Ремонт', status: 'NEW', media: [{ id: 1, url: '/one.jpg' }, { id: 2, url: '/two.jpg' }] }] });
  request.mockResolvedValue({ id: 42, title: 'Дверь', description: 'Ремонт', category: 'Двери', status: 'NEW', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: null, linkedWork: null, actions: {} });
  await act(async () => root.render(<ChairmanHome houseId={5} houses={[]} />));
  const card = container.querySelector('.chairman-work-card');
  expect(card.tagName).toBe('ARTICLE');
  expect(card.querySelector('.chairman-work-card__photos--scrollable')).toBeNull();
  await act(async () => card.querySelector('.media-preview__button').click());
  expect(container.querySelector('.image-modal-backdrop')).not.toBeNull();
  expect(container.querySelector('.chairman-work-card')).not.toBeNull();
  await act(async () => container.querySelector('.image-modal-backdrop').click());
  await act(async () => card.click());
  expect(request).toHaveBeenCalledWith('/api/observations/42');
});

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
  const selects = container.querySelectorAll('[role="dialog"] .app-select__trigger');
  await act(async () => selects[0].click());
  await act(async () => container.querySelector('[role="option"]').click());
  await act(async () => selects[1].click());
  await act(async () => container.querySelector('[role="option"]').click());
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Продолжить').click());
  expect(assignObservationExecutor).not.toHaveBeenCalled();
  expect(container.textContent).toContain('ООО Дом');
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(assignObservationExecutor).toHaveBeenCalledWith(42, { executorUserId: 8, category: 'COMMON_AREAS' });
  expect(request).toHaveBeenCalledWith('/api/observations/42');
});

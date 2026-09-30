// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { CouncilApiWorkPage } from './CouncilApiWorkPage';

const { councilRequest, allPages } = vi.hoisted(() => ({ councilRequest: vi.fn(), allPages: vi.fn() }));
vi.mock('./councilApi', () => ({ councilRequest, councilJson: vi.fn(), uploadCouncilPhoto: vi.fn() }));
vi.mock('./residentApi', () => ({ allPages, formatDate: (value) => value, historyEvents: {}, roleLabels: {}, workStatuses: {}, observationStatusLabel: () => '' }));

let container;
let root;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  councilRequest.mockReset();
  allPages.mockReset();
  URL.createObjectURL = vi.fn(() => 'blob:test-photo');
  URL.revokeObjectURL = vi.fn();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); if (originalCreateObjectURL) URL.createObjectURL = originalCreateObjectURL; else delete URL.createObjectURL; if (originalRevokeObjectURL) URL.revokeObjectURL = originalRevokeObjectURL; else delete URL.revokeObjectURL; });

async function renderAssignment() {
  councilRequest.mockImplementation((path) => {
    if (path === '/api/inspection-assignments/1') return Promise.resolve({ status: 'ASSIGNED', work: { id: 7, title: 'Работа по двери', description: 'Ремонт', category: 'COMMON_AREAS', house: { address: 'Дом' }, houseObject: { title: 'Подъезд' }, executor: { companyName: 'УК' }, media: [], sourceObservation: { id: 42, title: 'Дверь', description: 'Не закрывается', media: [] } }, checklist: [{ id: 11, title: 'Дверь', rules: { allowedResults: ['PASS', 'FAIL'], commentAllowed: true, maxCommentLength: 512, photosAllowed: true, maxPhotos: 5, evidenceRequiredOnFail: true }, answer: { result: 'PENDING', comment: null, media: [] } }], actions: { save: true, complete: false } });
    if (path === '/api/observations/42') return Promise.resolve({ id: 42, title: 'Дверь', description: 'Не закрывается', house: { address: 'Дом' }, category: 'Двери и домофон', media: [], history: [{ id: 3, title: 'Обращение создано', createdAt: '2026-09-29' }], comments: [], workflow: { executor: null, documents: [] } });
    throw new Error(path);
  });
  const task = { kind: 'assignment', id: 1, status: 'ASSIGNED', work: { id: 7, title: 'Дверь' }, observation: { id: 42 } };
  await act(async () => root.render(<CouncilApiWorkPage inspection={task} onBack={() => {}} />));
}

it('загружает связанную проверку без Work GET и показывает контекст из Inspection detail', async () => {
  await renderAssignment();
  expect(councilRequest.mock.calls.map(([path]) => path)).toEqual(['/api/inspection-assignments/1', '/api/observations/42']);
  expect(allPages).not.toHaveBeenCalled();
  expect(container.textContent).toContain('Подъезд');
  expect(container.textContent).toContain('Обращение создано');
});

it('показывает все замечания связанного обращения без отдельных GET повторных проверок', async () => {
  councilRequest.mockImplementation((path) => {
    if (path === '/api/reinspections/2') return Promise.resolve({ comment: 'Дефект остался', media: [{ id: 9, url: '/photo/9' }] });
    if (path === '/api/observations/42') return Promise.resolve({ id: 42, title: 'Дверь', description: 'Не закрывается', house: { address: 'Дом' }, category: 'COMMON_AREAS', media: [], history: [], comments: [], workflow: { executor: null, documents: [], issues: [{ id: 5, title: 'Дверь', description: 'Не закрывается', photos: [], remediation: { comment: 'Исправлено', photos: [] }, reinspections: [{ id: 2, status: 'COMPLETED', result: 'NOT_RESOLVED' }] }, { id: 6, title: 'Плафон', description: 'Трещина', photos: [], remediation: { comment: 'Заменён', photos: [] }, reinspections: [{ id: 3, status: 'ASSIGNED', result: null }] }] }, myTasks: { reinspectionIds: [2, 3] } });
    throw new Error(path);
  });
  await act(async () => root.render(<CouncilApiWorkPage inspection={{ kind: 'reinspection', id: 2, status: 'COMPLETED', work: { id: 7, title: 'Дверь' }, observation: { id: 42 } }} onBack={() => {}} />));
  expect(councilRequest.mock.calls.map(([path]) => path)).toEqual(['/api/observations/42', '/api/reinspections/2']);
  expect(allPages).not.toHaveBeenCalled();
  expect(container.querySelectorAll('.council-api__repeat-card')).toHaveLength(2);
  expect(container.textContent).toContain('Плафон');
  expect(container.textContent).toContain('Исправлено');
  expect(container.textContent).toContain('Дефект остался');
  expect(container.querySelector('img[alt="Замечание: фото 1"]')).not.toBeNull();
});

it('оставляет завершённые замечания видимыми после очистки myTasks', async () => {
  councilRequest.mockImplementation((path) => {
    if (path === '/api/reinspections/3') return Promise.resolve({ comment: 'Остался мусор', media: [] });
    if (path === '/api/observations/42') return Promise.resolve({ id: 42, title: 'Работа', description: 'Ремонт', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { executor: null, documents: [], issues: [{ id: 8, title: 'Территория', description: 'Мусор', status: 'OPEN', photos: [], remediation: { comment: 'Убрано', photos: [] }, reinspections: [{ id: 3, status: 'COMPLETED', result: 'NOT_RESOLVED' }] }, { id: 7, title: 'Покрытие', description: '', status: 'RESOLVED', photos: [], remediation: { comment: 'Исправлено', photos: [] }, reinspections: [{ id: 2, status: 'COMPLETED', result: 'RESOLVED' }] }] }, myTasks: { reinspectionIds: [] } });
    throw new Error(path);
  });
  await act(async () => root.render(<CouncilApiWorkPage inspection={{ kind: 'reinspection', id: 3, status: 'COMPLETED', work: { id: 7, title: 'Работа' }, observation: { id: 42 } }} onBack={() => {}} />));
  expect(container.querySelectorAll('.council-api__repeat-card')).toHaveLength(2);
  expect(container.textContent).toContain('Остался мусор');
  expect(container.querySelector('.council-api__result--unresolved').textContent).toBe('Не устранено');
  expect(container.querySelector('.council-api__result--resolved').textContent).toBe('Устранено');
  expect(container.querySelector('.council-api__repeat-card summary').textContent).not.toContain('Требуется устранение');
  expect(container.querySelector('.council-work__decision-actions')).toBeNull();
});

it('завершает замечания последовательно и при ошибке второго не отправляет первое повторно', async () => {
  const events = [];
  let failSecond = true;
  let releaseFirst;
  const firstDone = new Promise((resolve) => { releaseFirst = resolve; });
  const observation = { id: 42, title: 'Дверь', description: 'Ремонт', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { executor: null, documents: [], issues: [2, 3].map((id) => ({ id, title: `Пункт ${id}`, description: 'Замечание', photos: [], remediation: { comment: 'Исправлено', photos: [] }, reinspections: [{ id, status: 'ASSIGNED', result: null }] })) }, myTasks: { reinspectionIds: [2, 3] } };
  councilRequest.mockImplementation((path) => {
    if (path === '/api/observations/42') return Promise.resolve(observation);
    if (path === '/api/reinspections/2/complete') { events.push(2); return firstDone; }
    if (path === '/api/reinspections/3/complete') { events.push(3); if (failSecond) { failSecond = false; return Promise.reject(new Error('Сбой второго запроса')); } return Promise.resolve({}); }
    throw new Error(path);
  });
  await act(async () => root.render(<CouncilApiWorkPage inspection={{ kind: 'reinspection', id: 2, status: 'ASSIGNED', work: { id: 7, title: 'Дверь' }, observation: { id: 42 } }} onBack={() => {}} />));
  for (const card of container.querySelectorAll('.council-api__repeat-card')) {
    await act(async () => card.querySelector('.admin-select__trigger').click());
    await act(async () => Array.from(card.querySelectorAll('.admin-select__option')).find((button) => button.textContent === 'Устранено').click());
  }
  const approved = Array.from(container.querySelectorAll('.council-work__decision-actions button')).find((button) => button.textContent === 'Замечаний нет');
  expect(approved.disabled).toBe(false);
  await act(async () => approved.click());
  const confirmation = Array.from(container.querySelectorAll('.modal button')).find((button) => button.textContent === 'Подтвердить');
  const completion = act(async () => confirmation.click());
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(events).toEqual([2]);
  releaseFirst({});
  await completion;
  expect(events).toEqual([2, 3]);
  expect(container.textContent).toContain('Сбой второго запроса');
  await act(async () => approved.click());
  await act(async () => Array.from(container.querySelectorAll('.modal button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(events).toEqual([2, 3, 3]);
});

it('сохраняет Work и activity GET для MANUAL Work', async () => {
  councilRequest.mockImplementation((path) => {
    if (path === '/api/reinspections/2') return Promise.resolve({ status: 'ASSIGNED', result: null, comment: null, media: [], issue: { id: 5, title: 'Дверь', description: 'Замечание', before: [] }, remediation: { id: 6, comment: 'Исправлено', after: [] }, actions: { complete: true } });
    if (path === '/api/works/7') return Promise.resolve({ id: 7, title: 'Ручная работа', description: 'Ремонт', category: 'COMMON_AREAS', house: { address: 'Дом' }, houseObject: null, executor: null, media: [], sourceObservation: null, documents: [], history: [] });
    throw new Error(path);
  });
  allPages.mockResolvedValue({ items: [] });
  await act(async () => root.render(<CouncilApiWorkPage inspection={{ kind: 'reinspection', id: 2, status: 'ASSIGNED', work: { id: 7, title: 'Ручная работа' }, observation: null }} onBack={() => {}} />));
  expect(councilRequest.mock.calls.map(([path]) => path)).toEqual(['/api/reinspections/2', '/api/works/7']);
  expect(allPages).toHaveBeenCalledWith('/api/works/7/activity');
  expect(container.textContent).toContain('Ручная работа');
});

it('включает финальные кнопки после локальных ответов, даже если backend complete ещё false', async () => {
  await renderAssignment();
  expect(container.querySelector('[aria-label="Добавить фото"]')).toBeNull();
  await act(async () => container.querySelector('.council-api__select .admin-select__trigger').click());
  await act(async () => Array.from(container.querySelectorAll('.admin-select__option')).find((button) => button.textContent === 'Не соответствует').click());
  expect(container.querySelector('[aria-label="Добавить фото"]')).not.toBeNull();
  expect(container.querySelector('.council-api__photos input[type="file"]')).not.toBeNull();
  const remarks = Array.from(container.querySelectorAll('.council-work__decision-actions button')).find((button) => button.textContent === 'Завершить с замечаниями');
  const approved = Array.from(container.querySelectorAll('.council-work__decision-actions button')).find((button) => button.textContent === 'Замечаний нет');
  expect(remarks.disabled).toBe(true);
  const comment = container.querySelector('.council-api__checklist-textarea');
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(comment, 'Дверь не закрывается'); comment.dispatchEvent(new Event('input', { bubbles: true })); });
  expect(remarks.disabled).toBe(false);
  expect(approved.disabled).toBe(true);
  await act(async () => container.querySelector('.council-api__select .admin-select__trigger').click());
  await act(async () => Array.from(container.querySelectorAll('.admin-select__option')).find((button) => button.textContent === 'Соответствует').click());
  expect(approved.disabled).toBe(false);
  expect(remarks.disabled).toBe(true);
});

it('разрешает завершение с замечанием, подтверждённым только фотографией', async () => {
  await renderAssignment();
  await act(async () => container.querySelector('.council-api__select .admin-select__trigger').click());
  await act(async () => Array.from(container.querySelectorAll('.admin-select__option')).find((button) => button.textContent === 'Не соответствует').click());
  const input = container.querySelector('.council-api__photos input[type="file"]');
  const file = new File(['photo'], 'door.jpg', { type: 'image/jpeg' });
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: [file] }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  const remarks = Array.from(container.querySelectorAll('.council-work__decision-actions button')).find((button) => button.textContent === 'Завершить с замечаниями');
  expect(remarks.disabled).toBe(false);
});

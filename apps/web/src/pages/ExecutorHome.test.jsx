// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ExecutorHome, ExecutorWorkDetail } from './ExecutorHome';

const { request, allPages, uploadPhoto } = vi.hoisted(() => ({ request: vi.fn(), allPages: vi.fn(), uploadPhoto: vi.fn() }));
vi.mock('./residentApi', () => ({
  request, allPages,
  jsonRequest: (method, body) => ({ method, body: JSON.stringify(body) }),
  uploadPhoto, formatDate: () => 'Сегодня', workStatuses: { NEW: 'Новая' },
  observationStatusLabel: (observation) => ({ NEW: 'Новая' })[observation.status] ?? observation.status,
}));

let container;
let root;
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  request.mockReset(); allPages.mockReset(); uploadPhoto.mockReset();
  allPages.mockResolvedValue({ items: [], total: 0 });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});

it('отправляет устранение только с комментарием и фотографией', async () => {
  request.mockImplementation((path) => path === '/api/works/7' ? Promise.resolve({ id: 7, title: 'Ремонт', description: 'Описание', status: 'NEW', house: { address: 'Дом' }, executor: null, sourceObservation: null, media: [], documents: [], actions: { submitForInspection: false, reportRemediation: true, generateAcceptanceAct: false, confirmAcceptance: false } }) : Promise.resolve({}));
  allPages.mockImplementation((path) => Promise.resolve({ items: path.endsWith('/issues') ? [{ id: 11, title: 'Дефект', description: 'Не работает', status: 'OPEN', evidence: { comment: 'Сломано', photos: [] }, before: [], checklistItem: { title: 'Освещение' }, remediations: [], reinspections: [], actions: { submitRemediation: true } }] : [], total: path.endsWith('/issues') ? 1 : 0 }));
  uploadPhoto.mockResolvedValue({ id: 44 });
  await act(async () => root.render(<ExecutorWorkDetail workId={7} onBack={() => {}} />));
  const send = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Отправить устранение'));
  expect(send.disabled).toBe(true);
  await act(async () => { const textarea = container.querySelector('textarea'); Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(textarea, 'Исправлено'); textarea.dispatchEvent(new Event('input', { bubbles: true })); });
  const input = container.querySelector('input[type="file"]');
  const file = new File(['photo'], 'fix.jpg', { type: 'image/jpeg' });
  await act(async () => { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(send.disabled).toBe(false);
  await act(async () => send.click());
  expect(request).not.toHaveBeenCalledWith('/api/issues/11/remediations', expect.anything());
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(request).toHaveBeenCalledWith('/api/issues/11/remediations', { method: 'POST', body: JSON.stringify({ comment: 'Исправлено', mediaIds: [44] }) });
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); URL.createObjectURL = originalCreateObjectURL; URL.revokeObjectURL = originalRevokeObjectURL; });

it('показывает submit по backend action и перезагружает detail после отправки', async () => {
  let submitted = false;
  request.mockImplementation((path) => {
    if (path === '/api/works/7') return Promise.resolve({ id: 7, title: 'Ремонт', description: 'Описание', status: 'NEW', house: { address: 'Дом' }, executor: { companyName: 'УК', representativeName: 'Сергей' }, sourceObservation: null, media: [], documents: [], actions: { submitForInspection: !submitted, reportRemediation: false, generateAcceptanceAct: false, confirmAcceptance: false } });
    if (path === '/api/works/7/submit-for-inspection') { submitted = true; return Promise.resolve({}); }
    throw new Error(path);
  });
  allPages.mockResolvedValue({ items: [], total: 0 });
  await act(async () => root.render(<ExecutorWorkDetail workId={7} onBack={() => {}} />));
  expect(container.textContent).toContain('Компания: УК');
  const submit = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Передать на проверку'));
  expect(submit).toBeDefined();
  await act(async () => submit.click());
  expect(request).not.toHaveBeenCalledWith('/api/works/7/submit-for-inspection', expect.anything());
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(request).toHaveBeenCalledWith('/api/works/7/submit-for-inspection', { method: 'POST', body: '{}' });
  expect(container.textContent).not.toContain('Передать на проверку');
});

it('загружает список и detail обращения без Work GET', async () => {
  allPages.mockResolvedValue({ items: [{ id: 3, title: 'Свет', description: 'Не горит', status: 'NEW', createdAt: '2026-09-29T00:00:00Z', media: [], linkedWork: { id: 7 } }] });
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'NEW', house: { address: 'Дом' }, media: [], history: [{ id: 1, title: 'Обращение создано', createdAt: '2026-09-29T00:00:00Z' }], workflow: { workId: 7, executor: { companyName: 'УК' }, issues: [], documents: [] }, actions: { submitForInspection: false } });
  await act(async () => root.render(<ExecutorHome houseId={1} houses={[]} />));
  expect(allPages).toHaveBeenCalledExactlyOnceWith('/api/houses/1/observations', { tab: 'active' }, expect.any(Object));
  await act(async () => container.querySelector('.executor-work-card__open').click());
  expect(request).toHaveBeenCalledExactlyOnceWith('/api/observations/3');
  expect(container.textContent).toContain('Обращение создано');
});

it('открывает карточку исполнителя по всей поверхности, а фото — отдельно', async () => {
  allPages.mockResolvedValue({ items: [{ id: 3, title: 'Свет', description: 'Не горит', status: 'NEW', media: [{ id: 1, url: '/one.jpg' }, { id: 2, url: '/two.jpg' }, { id: 3, url: '/three.jpg' }] }] });
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'NEW', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, issues: [], documents: [] }, actions: {} });
  await act(async () => root.render(<ExecutorHome houseId={1} houses={[]} />));
  const card = container.querySelector('.chairman-work-card');
  expect(card.querySelector('.home-active-work__photos--scrollable')).not.toBeNull();
  expect(card.querySelector('.home-active-work__statuses span').textContent).toBe('Новая');
  expect(card.querySelector('.executor-work-card__open').getAttribute('aria-label')).toContain('Открыть работу');
  await act(async () => card.querySelector('.media-preview__button').click());
  expect(container.querySelector('.image-modal-backdrop')).not.toBeNull();
  expect(container.querySelector('.chairman-work-card')).not.toBeNull();
  await act(async () => container.querySelector('.image-modal-backdrop').click());
  await act(async () => card.querySelector('.executor-work-card__open').click());
  expect(container.querySelector('.observation-details-panel')).not.toBeNull();
});

it('показывает исполнителю первый блок наблюдения как у члена совета', async () => {
  request.mockResolvedValue({
    id: 14, title: 'Работу создал председатель!', description: 'Описание!\n\n\nДополнение',
    category: 'COMMON_AREAS', status: 'NEW', house: { address: 'Демо: Самара, ул. Речная, д. 11' },
    media: [], history: [{ id: 1, title: 'Обращение создано', createdAt: '2026-09-29T10:49:00Z' }],
    workflow: { category: 'ROOF', executor: { companyName: 'ООО «Исполнитель»' }, issues: [], documents: [{ id: 1, title: 'Договор', version: 1, fileUrl: '/contract.pdf', actions: {} }] },
    actions: {},
  });
  await act(async () => root.render(<ExecutorWorkDetail observationId={14} onBack={() => {}} />));
  const overview = container.querySelector('.active-work-details__card');
  expect(overview.textContent).toContain('История изменений');
  expect(overview.textContent).toContain('Обращение создано');
  expect(overview.textContent).toContain('Основная информация');
  expect(Array.from(overview.querySelectorAll('.active-work-details__field')).map((field) => field.firstChild.textContent)).toEqual([
    'Название наблюдения', 'Описание наблюдения', 'Адрес дома', 'Категория обращения', 'Исполнитель',
  ]);
  expect(overview.querySelector('.observation-details__multiline').textContent).toBe('Описание!\n\nДополнение');
  expect(overview.textContent).toContain('Документы');
  expect(container.textContent).not.toContain('Замечания');
});

it('показывает комментарии и подтверждает акт только после согласия', async () => {
  const detail = { id: 3, title: 'Свет', description: 'Не горит', category: 'Освещение', status: 'NEW', house: { address: 'Дом' }, media: [], history: [], comments: [{ id: 1, text: 'Ожидаем ремонт', author: { type: 'USER', displayName: 'Житель', photoUrl: null }, createdAt: '2026-09-29T00:00:00Z', media: [] }], workflow: { workId: 7, category: 'LIGHTING', executor: { companyName: 'УК' }, issues: [], documents: [{ id: 5, title: 'Акт', version: 1, fileUrl: '/act.pdf', actions: { confirm: true } }] }, linkedWork: null, actions: { comment: false, watch: false, unwatch: false, submitForInspection: false } };
  request.mockImplementation((path) => path === '/api/observations/3' ? Promise.resolve(detail) : Promise.resolve({}));
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  expect(container.textContent).toContain('Ожидаем ремонт');
  expect(container.textContent).toContain('Освещение');
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Подтвердить акт').click());
  expect(request).not.toHaveBeenCalledWith('/api/documents/5/confirm', expect.anything());
  await act(async () => Array.from(container.querySelectorAll('[role="dialog"] button')).find((button) => button.textContent === 'Подтвердить').click());
  expect(request).toHaveBeenCalledWith('/api/documents/5/confirm', { method: 'POST', body: '{}' });
});

it('показывает замечание и фото члена совета над формой устранения', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, issues: [{ id: 11, title: 'Освещение', photos: [] }], documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: [{ id: 11, title: 'Освещение', status: 'OPEN', checklistItem: { title: 'Освещение' }, evidence: { comment: 'Лампа мигает', photos: [{ id: 4, url: '/lamp.jpg' }] }, remediations: [], reinspections: [], actions: { submitRemediation: true } }] });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  expect(allPages).toHaveBeenCalledWith('/api/works/7/issues');
  const remark = Array.from(container.querySelectorAll('.active-work-details__card')).find((card) => card.textContent.includes('Лампа мигает'));
  expect(remark.querySelector('.council-work__checklist-row')).not.toBeNull();
  expect(remark.querySelector('.council-work__checklist-label').textContent).toBe('Освещение');
  expect(remark.textContent).toContain('Есть замечание');
  expect(remark.textContent).toContain('Лампа мигает');
  expect(remark.querySelector('img')).not.toBeNull();
  const prompt = Array.from(remark.querySelectorAll('.active-work-details__section-title')).find((element) => element.textContent === 'Добавьте комментарий по устранению');
  expect(prompt).toBeDefined();
  expect(remark.querySelector('img').compareDocumentPosition(prompt) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(remark.querySelector('textarea[aria-label="Как устранено замечание"]')).not.toBeNull();
  expect(remark.querySelector('.report-problem-photo-add[aria-label="Добавить фото"]')).not.toBeNull();
  expect(remark.querySelectorAll('.observation-issue__submit')).toHaveLength(1);
  expect(remark.textContent).not.toContain('Замечание члена совета');
  expect(remark.textContent).not.toContain('Как устранено замечание');
  expect(remark.querySelector('.observation-details__multiline').compareDocumentPosition(remark.querySelector('img')) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('показывает одну общую кнопку отправки для нескольких замечаний', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: [11, 12].map((id) => ({ id, title: `Пункт ${id}`, status: 'OPEN', evidence: { comment: 'Дефект', photos: [] }, remediations: [], reinspections: [], actions: { submitRemediation: true } })) });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  const card = Array.from(container.querySelectorAll('.active-work-details__card')).find((item) => item.textContent.includes('Пункт 11'));
  expect(card.querySelectorAll('.council-work__checklist-row')).toHaveLength(2);
  expect(card.querySelectorAll('.observation-issue__submit')).toHaveLength(1);
  expect(card.querySelector('.observation-issue__submit').disabled).toBe(true);
});

it('отделяет ответ исполнителя и скрывает ожидающую повторную проверку', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: [{ id: 11, title: 'Освещение', status: 'REMEDIATION_SUBMITTED', evidence: { comment: 'Лампа мигает', photos: [] }, remediations: [{ id: 21, createdAt: '2026-09-29T10:00:00Z', comment: 'Лампу заменили', after: [{ id: 5, url: '/fixed.jpg' }] }], reinspections: [{ id: 31, status: 'ASSIGNED', comment: null }], actions: { submitRemediation: false } }] });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  const response = container.querySelector('.observation-issue__response');
  expect(container.querySelector('.observation-issue__status')).toBeNull();
  expect(response.textContent).toContain('Ответ исполнителя');
  expect(response.textContent).toContain('Лампу заменили');
  expect(response.querySelector('.council-work__checklist-label').textContent).toBe('Лампу заменили');
  expect(response.querySelector('.observation-issue__response-head').textContent).toContain('Ответ исполнителя');
  expect(response.querySelector('.observation-issue__response-head').textContent).toContain('Сегодня');
  expect(response.querySelector('img')).not.toBeNull();
  expect(container.textContent).not.toContain('Повторная проверка: Ожидается');
});

it('не показывает исполнителю результаты повторных проверок в наблюдении', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: [{ id: 11, title: 'Освещение', status: 'OPEN', evidence: { comment: 'Лампа мигает', photos: [] }, remediations: [], reinspections: [{ id: 31, status: 'COMPLETED', result: 'UNRESOLVED', comment: 'Не исправлено' }, { id: 32, status: 'COMPLETED', result: 'RESOLVED' }], actions: { submitRemediation: false } }] });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  expect(container.textContent).toContain('Освещение');
  expect(container.textContent).not.toContain('Повторная проверка:');
  expect(container.textContent).not.toContain('Не исправлено');
});

it('сворачивает замечания в аккордеон и сохраняет форму устранения', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: [11, 12].map((id) => ({ id, title: `Пункт ${id}`, status: 'OPEN', evidence: { comment: `Дефект ${id}`, photos: [] }, remediations: [], reinspections: [], actions: { submitRemediation: true } })) });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  const accordions = container.querySelectorAll('.executor-issue-accordion');
  expect(accordions).toHaveLength(2);
  expect(accordions[0].open).toBe(true);
  expect(accordions[1].open).toBe(false);
  await act(async () => accordions[1].querySelector('summary').click());
  expect(accordions[1].open).toBe(true);
  expect(accordions[1].querySelector('textarea')).not.toBeNull();
  expect(container.querySelectorAll('.observation-issue__submit')).toHaveLength(1);
});

it('скрывает подписи завершённых замечаний и устранения на проверке', async () => {
  request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
  allPages.mockResolvedValue({ items: ['RESOLVED', 'REMEDIATION_SUBMITTED', 'OPEN'].map((status, index) => ({ id: index + 1, title: `Пункт ${index + 1}`, status, evidence: { comment: '', photos: [] }, remediations: [], reinspections: [], actions: { submitRemediation: false } })) });
  await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
  const headings = Array.from(container.querySelectorAll('.executor-issue-accordion summary'), (summary) => summary.textContent);
  expect(headings).toEqual(['Пункт 1', 'Пункт 2', 'Пункт 3Есть замечание']);
});

it('показывает выбранное фото в том же компоненте, что и проверка работы', async () => {
  URL.createObjectURL = vi.fn(() => 'blob:remediation-photo');
  URL.revokeObjectURL = vi.fn();
    request.mockResolvedValue({ id: 3, title: 'Свет', description: 'Не горит', status: 'IN_PROGRESS', house: { address: 'Дом' }, media: [], history: [], comments: [], workflow: { workId: 7, executor: { companyName: 'УК' }, documents: [] }, actions: {} });
    allPages.mockResolvedValue({ items: [{ id: 11, title: 'Освещение', status: 'OPEN', evidence: { comment: 'Дефект', photos: [] }, remediations: [], reinspections: [], actions: { submitRemediation: true } }] });
    await act(async () => root.render(<ExecutorWorkDetail observationId={3} onBack={() => {}} />));
    const input = container.querySelector('.council-api__photos input[type="file"]');
    const file = new File(['photo'], 'fix.jpg', { type: 'image/jpeg' });
    await act(async () => { Object.defineProperty(input, 'files', { value: [file], configurable: true }); input.dispatchEvent(new Event('change', { bubbles: true })); });
    expect(container.querySelector('.council-api__photos .report-problem-photo img').getAttribute('src')).toBe('blob:remediation-photo');
    expect(container.querySelector('.council-api__photos [aria-label="Редактировать фотографии"]')).not.toBeNull();
    expect(container.textContent).not.toContain('Выбрано фото:');
});

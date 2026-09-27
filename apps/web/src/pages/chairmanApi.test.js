import { afterEach, expect, it, vi } from 'vitest';
import { assignInspection, confirmChairmanDocument, createChairmanWork, decideJoinRequest, generateRefusal, loadChairmanHome, loadInspectionForm, loadWorkForm } from './chairmanApi';

afterEach(() => { vi.unstubAllGlobals(); });
function stub(responses) {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn();
  for (const body of responses) fetchMock.mockResolvedValueOnce(new Response(JSON.stringify(body), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

it('загружает заявки и работы только указанного дома', async () => {
  const fetchMock = stub([{ items: [{ id: 4 }], total: 1 }, { items: [{ id: 9 }], total: 1 }]);
  expect(await loadChairmanHome(8)).toEqual({ requests: [{ id: 4 }], works: [{ id: 9 }] });
  expect(fetchMock.mock.calls.map(([path]) => path)).toEqual(['/api/houses/8/join-requests?page=1&limit=100', '/api/houses/8/works?page=1&limit=100']);
});

it('отправляет только допустимое решение по заявке и точные тела действий', async () => {
  const fetchMock = stub([{}, {}, {}, {}, {}]);
  await decideJoinRequest(8, 4, 'APPROVE');
  await createChairmanWork(8, { executorUserId: 2, title: 'Работа', description: 'Описание', category: 'ROOF' });
  await assignInspection(9, 6, 3);
  await generateRefusal(9);
  await confirmChairmanDocument(7);
  expect(fetchMock.mock.calls.map(([path, init]) => [path, init.method, JSON.parse(init.body)])).toEqual([
    ['/api/houses/8/join-requests/4', 'PATCH', { decision: 'APPROVE' }],
    ['/api/houses/8/works', 'POST', { executorUserId: 2, title: 'Работа', description: 'Описание', category: 'ROOF' }],
    ['/api/works/9/inspections', 'POST', { checklistTemplateId: 6, assigneeUserId: 3 }],
    ['/api/works/9/documents', 'POST', { type: 'REASONED_REFUSAL' }],
    ['/api/documents/7/confirm', 'POST', {}],
  ]);
});

it('отбирает активные шаблоны нужной категории и кандидатов backend', async () => {
  const templates = { items: [{ id: 1, active: true, category: 'ROOF' }, { id: 2, active: false, category: 'ROOF' }, { id: 3, active: true, category: 'OUTDOOR' }] };
  const fetchMock = stub([{ items: [{ id: 10 }] }, templates, { items: [{ id: 11 }] }, templates]);
  expect(await loadWorkForm(8)).toEqual({ executors: [{ id: 10 }], templates: templates.items.filter((item) => item.active) });
  expect(await loadInspectionForm(8, 'ROOF')).toEqual({ members: [{ id: 11 }], templates: [templates.items[0]] });
  expect(fetchMock.mock.calls[0][0]).toContain('role=EXECUTOR');
  expect(fetchMock.mock.calls[2][0]).toContain('role=COUNCIL_MEMBER');
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const { getMaxInitData, apiFetch } = vi.hoisted(() => ({ getMaxInitData: vi.fn(), apiFetch: vi.fn() }));
vi.mock('./maxAuth', async (importOriginal) => ({ ...await importOriginal(), getMaxInitData }));
vi.mock('./api', () => ({ apiFetch }));
vi.mock('./pages/HomePage', () => ({ HomePage: ({ role }) => <div data-testid="home-role">{role}</div> }));
vi.mock('./pages/AdminPage', () => ({ AdminPage: () => <div data-testid="admin-page">Админка</div> }));
vi.mock('./pages/HistoryPage', () => ({ HistoryPage: ({ onBack }) => <div data-testid="history-page"><button onClick={onBack}>Назад</button></div> }));
vi.mock('./pages/ReportProblemPage', () => ({ ReportProblemPage: ({ onBack }) => <div data-testid="report-page"><button onClick={onBack}>Назад</button></div> }));
vi.mock('./pages/CouncilWorkPage', () => ({ CouncilWorkPage: ({ onBack }) => <div data-testid="inspection-page"><button onClick={onBack}>Назад</button></div> }));
vi.mock('./pages/WorksPage', () => ({ WorksPage: () => <div data-testid="works-page">События</div> }));
vi.mock('./pages/ChairmanHome', () => ({ ChairmanHome: ({ houseId, focusJoinRequestId }) => <div data-testid="chairman-request">{houseId}:{focusJoinRequestId}</div>, ChairmanWorkDetail: ({ observationId }) => <div data-testid="chairman-detail">{observationId}</div> }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  sessionStorage.clear();
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  getMaxInitData.mockReset(); apiFetch.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

async function renderNavigation(page, deepLink) {
  if (page) sessionStorage.setItem('max-active-page', JSON.stringify(page));
  if (deepLink) sessionStorage.setItem('max-active-deep-link', JSON.stringify(deepLink));
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { isAdmin: true }, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role: 'RESIDENT', status: 'ACTIVE', permissions: {} }] }) });
  await act(async () => root.render(<App />));
}

it('показывает tabbar на обычной внутренней странице и закрывает её при смене вкладки', async () => {
  await renderNavigation('history');
  expect(container.querySelector('[data-testid="history-page"] button')?.textContent).toBe('Назад');
  expect(container.querySelector('.tabbar')).not.toBeNull();
  expect(container.querySelector('.app-scroll--without-tabbar')).toBeNull();
  container.querySelector('.app-scroll').scrollTop = 400;
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'События').click());
  expect(container.querySelector('[data-testid="history-page"]')).toBeNull();
  expect(container.querySelector('[data-testid="works-page"]')).not.toBeNull();
  expect(container.querySelector('.tabbar-item--active')?.textContent).toBe('События');
  expect(container.querySelector('.app-scroll').scrollTop).toBe(0);
  container.querySelector('.app-scroll').scrollTop = 250;
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'События').click());
  expect(container.querySelector('.app-scroll').scrollTop).toBe(0);
});

it('скрывает tabbar при сообщении о проблеме и инспекции', async () => {
  await renderNavigation('report-problem');
  expect(container.querySelector('[data-testid="report-page"] button')?.textContent).toBe('Назад');
  expect(container.querySelector('.tabbar')).toBeNull();
  expect(container.querySelector('.app-scroll--without-tabbar')).not.toBeNull();
  await act(async () => root.unmount());
  root = createRoot(container);
  sessionStorage.removeItem('max-active-page');
  sessionStorage.setItem('max-active-deep-link', JSON.stringify({ kind: 'inspection', inspection: { id: 1 } }));
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="inspection-page"] button')?.textContent).toBe('Назад');
  expect(container.querySelector('.tabbar')).toBeNull();
  expect(container.querySelector('.app-scroll--without-tabbar')).not.toBeNull();
});

it('не открывает сохранённую админку исполнителю', async () => {
  sessionStorage.setItem('max-active-tab', JSON.stringify('admin'));
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { isAdmin: false }, lastHouseId: 5, houses: [{ id: 5, role: 'EXECUTOR', status: 'ACTIVE', permissions: {} }] }) });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="home-role"]')?.textContent).toBe('executor');
  expect(container.querySelector('[data-testid="admin-page"]')).toBeNull();
  expect(container.textContent).not.toContain('Админка');
  expect(JSON.parse(sessionStorage.getItem('max-active-tab'))).toBe('home');
});

it('сохраняет доступ к админке системному администратору', async () => {
  sessionStorage.setItem('max-active-tab', JSON.stringify('admin'));
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { isAdmin: true }, lastHouseId: 5, houses: [{ id: 5, role: 'EXECUTOR', status: 'ACTIVE', permissions: {} }] }) });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="admin-page"]')).not.toBeNull();
});

it('показывает чёрную заглушку без MAX initData и реально повторяет /api/me', async () => {
  let resolveInitData;
  getMaxInitData.mockImplementationOnce(() => new Promise((resolve) => { resolveInitData = resolve; })).mockResolvedValueOnce('signed');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { isAdmin: false }, houses: [] }) });
  await act(async () => root.render(<App />));
  expect(container.querySelector('.app-root--boot [role="status"]')).not.toBeNull();
  await act(async () => resolveInitData(undefined));
  expect(container.querySelector('.app-root--boot [role="alert"]')).not.toBeNull();
  expect(container.textContent).toContain('Повторить');
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Повторить')).click());
  expect(apiFetch).toHaveBeenCalledWith('/api/me', { headers: { 'X-Max-Init-Data': 'signed' } });
  expect(container.querySelector('.app-root--boot')).toBeNull();
});

it('повторяет bootstrap после ошибки /api/me', async () => {
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockRejectedValueOnce(new Error('Сеть недоступна')).mockResolvedValueOnce({ ok: true, json: async () => ({ user: { isAdmin: false }, houses: [] }) });
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('Сеть недоступна');
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Повторить')).click());
  expect(apiFetch).toHaveBeenCalledTimes(2);
  expect(container.querySelector('.app-root--boot')).toBeNull();
});

it('отличает закрытый предпросмотр от неверной MAX авторизации', async () => {
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockResolvedValue({ ok: false, status: 403, json: async () => ({ code: 'PREVIEW_ACCESS_DENIED', maxUserId: '7000000000000000102' }) });
  await act(async () => root.render(<App />));
  expect(container.textContent).toContain('7000000000000000102');
  expect(container.textContent).toContain('закрытому тесту');
});

it('находит чужую ожидающую заявку по проверенному start_param', async () => {
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockImplementation(async (path) => {
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { isAdmin: false }, start_param: 'join_request_12', houses: [{ id: 5, address: 'Тестовый дом', role: 'CHAIRMAN', status: 'ACTIVE', permissions: {} }] }) };
    if (path.startsWith('/api/houses/5/join-requests?')) return { ok: true, json: async () => ({ items: [{ id: 12 }], total: 1 }) };
    throw new Error(path);
  });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="chairman-request"]').textContent).toBe('5:12');
  expect(apiFetch.mock.calls.some(([path]) => path.includes('status=PENDING'))).toBe(true);
});

it('разрешает work deep link через связь с обращением', async () => {
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockImplementation(async (path) => {
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { isAdmin: false }, start_param: 'work_7', houses: [{ id: 5, role: 'CHAIRMAN', status: 'ACTIVE', permissions: {} }] }) };
    if (path === '/api/works/7/observation') return { ok: true, json: async () => ({ observationId: 42 }) };
    if (path === '/api/observations/42') return { ok: true, json: async () => ({ id: 42, house: { id: 5 } }) };
    throw new Error(path);
  });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="chairman-detail"]').textContent).toBe('42');
  expect(apiFetch.mock.calls.map(([path]) => path)).not.toContain('/api/works/7');
});

it('меняет собственную роль через API и перестраивает главную без перезагрузки', async () => {
  let role = 'RESIDENT';
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockImplementation(async (path, init) => {
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { isAdmin: false }, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role, status: 'ACTIVE', executorCompanyName: null, permissions: {} }] }) };
    if (path === '/api/me/houses/5/membership') { role = JSON.parse(init.body).role; return { ok: true, status: 200, json: async () => ({ role }) }; }
    throw new Error(path);
  });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="home-role"]').textContent).toBe('resident');
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'Роль').click());
  await act(async () => container.querySelector('button[aria-label="Выбрать роль для дома Дом"]').click());
  await act(async () => Array.from(container.querySelectorAll('[role="option"]')).find((option) => option.textContent === 'исполнитель').click());
  await act(async () => { const input = container.querySelector('input[maxlength="255"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Демо УК'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Сохранить роль').click());
  expect(apiFetch).toHaveBeenCalledWith('/api/me/houses/5/membership', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'EXECUTOR', executorCompanyName: 'Демо УК' }) }));
  expect(container.querySelector('.role-page__house-info').textContent).toContain('исполнитель');
});

it('показывает профиль во вкладке «Роль» и переключает роль через селект', async () => {
  let role = 'RESIDENT';
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockImplementation(async (path, init) => {
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { first_name: 'Анна', last_name: 'Иванова', photo_url: '/avatar.png', isAdmin: false }, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role, status: 'ACTIVE', permissions: {} }] }) };
    if (path === '/api/me/houses/5/membership') { role = JSON.parse(init.body).role; return { ok: true, json: async () => ({ role }) }; }
    throw new Error(path);
  });
  await act(async () => root.render(<App />));
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'Роль').click());
  expect(container.textContent).toContain('Анна Иванова');
  expect(container.querySelector('.role-page__house-info').textContent).toContain('житель');
  expect(container.textContent).not.toContain('Текущая роль:');
  expect(container.querySelector('.role-page__profile img')?.getAttribute('src')).toBe('/avatar.png');
  await act(async () => container.querySelector('button[aria-label="Выбрать роль для дома Дом"]').click());
  await act(async () => Array.from(container.querySelectorAll('[role="option"]')).find((option) => option.textContent === 'член совета').click());
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Сохранить роль').click());
  expect(apiFetch).toHaveBeenCalledWith('/api/me/houses/5/membership', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'COUNCIL_MEMBER' }) }));
  expect(container.querySelector('.role-page__house-info').textContent).toContain('член совета');
});

it('берёт имя и аватар из данных MAX, если их нет в /api/me', async () => {
  getMaxInitData.mockResolvedValue(new URLSearchParams({ user: JSON.stringify({ first_name: 'Мария', last_name: 'Петрова', photo_url: 'https://example.com/avatar.png' }) }).toString());
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { isAdmin: false }, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role: 'RESIDENT', status: 'ACTIVE', permissions: {} }] }) });
  await act(async () => root.render(<App />));
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'Роль').click());
  expect(container.textContent).toContain('Мария Петрова');
  expect(container.querySelector('.role-page__profile img')?.getAttribute('src')).toBe('https://example.com/avatar.png');
});

it('не блокирует выбор роли, когда в /api/me нет несуществующего флага', async () => {
  getMaxInitData.mockResolvedValue('signed');
  apiFetch.mockResolvedValue({ ok: true, json: async () => ({ user: { first_name: 'Анна', isAdmin: false }, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role: 'RESIDENT', status: 'ACTIVE', permissions: {} }] }) });
  await act(async () => root.render(<App />));
  await act(async () => Array.from(container.querySelectorAll('.tabbar button')).find((button) => button.textContent === 'Роль').click());
  const trigger = container.querySelector('button[aria-label="Выбрать роль для дома Дом"]');
  expect(trigger.disabled).toBe(false);
  await act(async () => trigger.click());
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(4);
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const { getMaxInitData, apiFetch } = vi.hoisted(() => ({ getMaxInitData: vi.fn(), apiFetch: vi.fn() }));
vi.mock('./maxAuth', () => ({ getMaxInitData }));
vi.mock('./api', () => ({ apiFetch }));
vi.mock('./pages/HomePage', () => ({ HomePage: ({ role }) => <div data-testid="home-role">{role}</div> }));
vi.mock('./pages/AdminPage', () => ({ AdminPage: () => <div data-testid="admin-page">Админка</div> }));
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
    if (path === '/api/me') return { ok: true, json: async () => ({ user: { isAdmin: false }, canSelfRoleSwitch: true, lastHouseId: 5, houses: [{ id: 5, address: 'Дом', role, status: 'ACTIVE', executorCompanyName: null, permissions: {} }] }) };
    if (path === '/api/me/houses/5/membership') { role = JSON.parse(init.body).role; return { ok: true, status: 200, json: async () => ({ role }) }; }
    throw new Error(path);
  });
  await act(async () => root.render(<App />));
  expect(container.querySelector('[data-testid="home-role"]').textContent).toBe('resident');
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Роль для демо')).click());
  await act(async () => { const select = container.querySelector('select'); select.value = 'EXECUTOR'; select.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => { const input = container.querySelector('input[maxlength="255"]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(input, 'Демо УК'); input.dispatchEvent(new Event('input', { bubbles: true })); });
  await act(async () => Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Сохранить').click());
  expect(apiFetch).toHaveBeenCalledWith('/api/me/houses/5/membership', expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ role: 'EXECUTOR', executorCompanyName: 'Демо УК' }) }));
  expect(container.querySelector('[data-testid="home-role"]').textContent).toBe('executor');
});

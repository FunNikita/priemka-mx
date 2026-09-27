// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

const { getMaxInitData, apiFetch } = vi.hoisted(() => ({ getMaxInitData: vi.fn(), apiFetch: vi.fn() }));
vi.mock('./maxAuth', () => ({ getMaxInitData }));
vi.mock('./api', () => ({ apiFetch }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {} });
  getMaxInitData.mockReset(); apiFetch.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

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

import { afterEach, expect, it, vi } from 'vitest';
import { saveAdminMembership } from './adminApi';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MembershipsDialog } from './AdminPage';

afterEach(() => { vi.unstubAllGlobals(); });

it('сохраняет членство в конкретном доме и не превращает системного администратора в роль', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await saveAdminMembership({ user: { id: 42, isAdmin: true }, houseId: '8', role: 'COUNCIL_MEMBER', status: 'ACTIVE', executorCompanyName: '' });
  expect(fetchMock.mock.calls[0][0]).toBe('/api/admin/houses/8/members/42');
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: 'COUNCIL_MEMBER', status: 'ACTIVE' });
});

it('передаёт компанию только для введённого значения', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn().mockResolvedValue(new Response('{}', { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  await saveAdminMembership({ user: { id: 42 }, houseId: '8', role: 'EXECUTOR', status: 'ACTIVE', executorCompanyName: '  Демо УК  ' });
  expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ role: 'EXECUTOR', status: 'ACTIVE', executorCompanyName: 'Демо УК' });
});

it('модальное окно показывает все членства, их статусы и компанию', () => {
  const user = { memberships: [
    { id: 1, houseAddress: 'Дом А', role: 'RESIDENT', status: 'ACTIVE' },
    { id: 2, houseAddress: 'Дом Б', role: 'EXECUTOR', status: 'PENDING', executorCompanyName: 'УК Б' },
  ] };
  const html = renderToStaticMarkup(createElement(MembershipsDialog, { user, onClose() {}, onEdit() {}, onAdd() {} }));
  expect(html).toContain('Дом А');
  expect(html).toContain('Дом Б');
  expect(html).toContain('Житель');
  expect(html).toContain('УК Б');
  expect(html).toContain('Добавить дом');
});

import { afterEach, expect, it, vi } from 'vitest';
import { allPages, jsonRequest, request, uploadPhoto } from './residentApi';

afterEach(() => { vi.unstubAllGlobals(); });

it('загружает все страницы и передаёт MAX initData только заголовком', async () => {
  vi.stubGlobal('window', { WebApp: { initData: 'signed-data' }, location: { hostname: '127.0.0.1' } });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 1 }], page: 1, limit: 100, total: 2 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 2 }], page: 2, limit: 100, total: 2 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  expect((await allPages('/api/houses/1/works')).items).toEqual([{ id: 1 }, { id: 2 }]);
  expect(fetchMock.mock.calls[0][0]).toBe('/api/houses/1/works?page=1&limit=100');
  expect(fetchMock.mock.calls[0][1].headers.get('X-Max-Init-Data')).toBe('signed-data');
});

it('обрабатывает 204 и отправляет JSON body', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 204 }));
  vi.stubGlobal('fetch', fetchMock);
  expect(await request('/api/houses/1/join-requests/me', { method: 'DELETE' })).toBeNull();
  expect(jsonRequest('PUT', { role: 'RESIDENT', status: 'ACTIVE' }).body).toBe('{"role":"RESIDENT","status":"ACTIVE"}');
});

it('отклоняет неподдерживаемый формат фото до отправки', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn();
  vi.stubGlobal('fetch', fetchMock);
  await expect(uploadPhoto(new File(['x'], 'bad.gif', { type: 'image/gif' }))).rejects.toThrow('JPEG');
  expect(fetchMock).not.toHaveBeenCalled();
});

it('показывает русский текст при сетевом сбое и сохраняет ответ бизнес-ошибки', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('Failed to fetch')).mockResolvedValueOnce(new Response(JSON.stringify({ message: 'Работа уже принята' }), { status: 409 }));
  vi.stubGlobal('fetch', fetchMock);
  await expect(request('/api/test')).rejects.toThrow('Не удалось связаться с сервером. Проверьте подключение к интернету и повторите попытку.');
  await expect(request('/api/test')).rejects.toThrow('Работа уже принята');
});

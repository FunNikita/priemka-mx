import { afterEach, expect, it, vi } from 'vitest';
import { loadCouncilTasks, uploadCouncilPhoto } from './councilApi';

afterEach(() => { vi.unstubAllGlobals(); });

it('загружает все страницы назначений и повторных проверок выбранного дома', async () => {
  vi.stubGlobal('window', { location: { hostname: 'example.com' } });
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 1, work: { houseId: 8 }, status: 'ASSIGNED' }], total: 2 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 3, work: { houseId: 8 }, status: 'COMPLETED' }], total: 1 }), { status: 200 }))
    .mockResolvedValueOnce(new Response(JSON.stringify({ items: [{ id: 2, work: { houseId: 8 }, status: 'IN_PROGRESS' }], total: 2 }), { status: 200 }));
  vi.stubGlobal('fetch', fetchMock);
  const tasks = await loadCouncilTasks(8);
  expect(tasks.map((task) => task.id)).toEqual([1, 2, 3]);
  expect(fetchMock.mock.calls.every(([path]) => path.includes('houseId=8'))).toBe(true);
});

it('не загружает неподдерживаемое фото', async () => {
  vi.stubGlobal('fetch', vi.fn());
  await expect(uploadCouncilPhoto(new File(['x'], 'bad.gif', { type: 'image/gif' }))).rejects.toThrow('JPEG');
  expect(fetch).not.toHaveBeenCalled();
});

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { apiFetch } from '../api';
import { councilRequest, loadCouncilTasks, uploadCouncilPhoto } from './councilApi';

vi.mock('../api', () => ({ apiFetch: vi.fn() }));

const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { 'Content-Type': 'application/json' } });

describe('API члена совета', () => {
  beforeEach(() => vi.resetAllMocks());

  it('объединяет первичные и повторные назначения без подмены ID работы', async () => {
    const work = { id: 41, title: 'Дверь', houseId: 5 };
    apiFetch.mockResolvedValueOnce(json({ items: [{ id: 10, status: 'IN_PROGRESS', work, inspectionId: 7 }] }))
      .mockResolvedValueOnce(json({ items: [{ id: 20, status: 'ASSIGNED', issueId: 11, work }] }));

    expect(await loadCouncilTasks()).toEqual([
      { kind: 'assignment', id: 10, status: 'IN_PROGRESS', work },
      { kind: 'reinspection', id: 20, status: 'ASSIGNED', issueId: 11, work },
    ]);
    expect(apiFetch).toHaveBeenNthCalledWith(1, '/api/me/inspection-assignments', undefined);
    expect(apiFetch).toHaveBeenNthCalledWith(2, '/api/me/reinspections', undefined);
  });

  it('отправляет фотографию как multipart с полем file', async () => {
    apiFetch.mockResolvedValueOnce(json({ id: 123 }, 201));
    const file = new File(['photo'], 'proof.png', { type: 'image/png' });

    expect(await uploadCouncilPhoto(file)).toEqual({ id: 123 });
    const [, init] = apiFetch.mock.calls[0];
    expect(init.method).toBe('POST');
    expect(init.body.get('file')).toBe(file);
    expect(init.headers).toBeUndefined();
  });

  it('не пытается разобрать пустой ответ и показывает сообщение сервера', async () => {
    apiFetch.mockResolvedValueOnce(new Response(null, { status: 204 }))
      .mockResolvedValueOnce(json({ message: 'Проверка завершена' }, 409));
    expect(await councilRequest('/api/houses/5/chat', { method: 'DELETE' })).toBeNull();
    await expect(councilRequest('/api/reinspections/20')).rejects.toThrow('Проверка завершена');
  });
});

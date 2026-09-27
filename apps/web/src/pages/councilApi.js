import { apiFetch } from '../api';

export async function councilRequest(path, init) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message;
    try { message = (await response.json()).message; } catch { /* The server may return an empty error. */ }
    const error = new Error(message || `Ошибка запроса (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export function councilJson(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function uploadCouncilPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите фото JPEG, PNG или WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Размер фото не должен превышать 10 МБ.');
  const form = new FormData();
  form.append('file', file);
  return councilRequest('/api/media', { method: 'POST', body: form });
}

async function loadAll(path, houseId) {
  const items = [];
  let page = 1;
  let result;
  do {
    const query = new URLSearchParams({ page: String(page), limit: '100' });
    if (houseId) query.set('houseId', String(houseId));
    result = await councilRequest(`${path}?${query}`);
    items.push(...result.items);
    page += 1;
  } while (items.length < result.total);
  return items;
}

export async function loadCouncilTasks(houseId) {
  const [assignments, reinspections] = await Promise.all([
    loadAll('/api/me/inspection-assignments', houseId),
    loadAll('/api/me/reinspections', houseId),
  ]);
  return [
    ...assignments.map((item) => ({ kind: 'assignment', id: item.id, work: item.work, status: item.status })),
    ...reinspections.map((item) => ({ kind: 'reinspection', id: item.id, work: item.work, issueId: item.issueId, status: item.status })),
  ];
}

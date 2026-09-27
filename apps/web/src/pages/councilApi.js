import { apiFetch } from '../api';

export async function councilRequest(path, init) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message;
    try { message = (await response.json()).message; } catch { /* The server may return an empty error. */ }
    throw new Error(message || `Ошибка запроса (${response.status})`);
  }
  return response.status === 204 ? null : response.json();
}

export function councilJson(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function uploadCouncilPhoto(file) {
  const form = new FormData();
  form.append('file', file);
  return councilRequest('/api/media', { method: 'POST', body: form });
}

export async function loadCouncilTasks() {
  const [assignments, reinspections] = await Promise.all([
    councilRequest('/api/me/inspection-assignments'),
    councilRequest('/api/me/reinspections'),
  ]);
  return [
    ...assignments.items.map((item) => ({ kind: 'assignment', id: item.id, work: item.work, status: item.status })),
    ...reinspections.items.map((item) => ({ kind: 'reinspection', id: item.id, work: item.work, issueId: item.issueId, status: item.status })),
  ];
}

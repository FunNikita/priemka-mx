import { apiFetch } from '../api';

export async function request(path, init) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message;
    try { message = (await response.json()).message; } catch { /* Empty or non-JSON error. */ }
    const error = new Error(message || `Ошибка запроса (${response.status})`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}

export function jsonRequest(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export function queryPath(path, query) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) if (value !== '' && value !== undefined && value !== null) params.set(key, String(value));
  return `${path}?${params}`;
}

export async function allPages(path, query = {}, options = {}) {
  const items = [];
  let page = 1;
  let result;
  do {
    result = await request(queryPath(path, { ...query, page, limit: 100 }), options);
    items.push(...result.items);
    page += 1;
  } while (items.length < result.total);
  return { ...result, items };
}

export async function uploadPhoto(file) {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('Выберите фото JPEG, PNG или WebP.');
  if (file.size > 10 * 1024 * 1024) throw new Error('Размер фото не должен превышать 10 МБ.');
  const form = new FormData();
  form.append('file', file);
  return request('/api/media', { method: 'POST', body: form });
}

export const workStatuses = {
  NEW: 'Новая', IN_REVIEW: 'На проверке', IN_PROGRESS: 'В работе', WAITING: 'Ожидает', ACCEPTED: 'Принята',
};

export const historyEvents = {
  WORK_CREATED: 'Работа создана', SUBMITTED_FOR_INSPECTION: 'Работа передана на проверку',
  INSPECTION_ASSIGNED: 'Назначен проверяющий', INSPECTION_COMPLETED: 'Проверка завершена',
  REMEDIATION_SUBMITTED: 'Устранение отправлено', REINSPECTION_COMPLETED: 'Повторная проверка завершена',
  ACCEPTANCE_CONFIRMED: 'Акт приёмки подтверждён',
};

export function formatDate(value) {
  return value ? new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) : '';
}

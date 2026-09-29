import { apiFetch } from '../api';

export async function request(path, init) {
  const response = await apiFetch(path, init);
  if (!response.ok) {
    let message;
    let code;
    let maxUserId;
    try { const body = await response.json(); message = body.message; code = body.code; maxUserId = body.maxUserId; } catch { /* Empty or non-JSON error. */ }
    const retryAfter = response.status === 429 ? response.headers.get('Retry-After') : null;
    const error = new Error(response.status === 429 ? `Слишком много запросов. Повторите попытку${retryAfter && /^\d+$/.test(retryAfter) ? ` через ${retryAfter} сек.` : ' позже'}.` : message || `Ошибка запроса (${response.status})`);
    error.status = response.status;
    error.code = code;
    error.maxUserId = maxUserId;
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
  NEW: 'Новая', IN_REVIEW: 'Рассматривается', IN_PROGRESS: 'В работе', WAITING: 'Ожидает', ACCEPTED: 'Принята',
};

export const historyEvents = {
  WORK_CREATED: 'Работа создана', SUBMITTED_FOR_INSPECTION: 'Работа передана на проверку',
  INSPECTION_ASSIGNED: 'Назначен проверяющий', INSPECTION_COMPLETED: 'Проверка завершена',
  REMEDIATION_SUBMITTED: 'Устранение отправлено', REINSPECTION_COMPLETED: 'Повторная проверка завершена',
  ACCEPTANCE_CONFIRMED: 'Акт приёмки подтверждён',
  OBSERVATION_CREATED: 'Обращение создано', OBSERVATION_COMMENT_ADDED: 'Добавлен комментарий к обращению',
  OBSERVATION_WATCHED: 'Подписка на обращение', OBSERVATION_UNWATCHED: 'Отписка от обращения',
  WORK_EDITED: 'Работа изменена', EXECUTOR_CHANGED: 'Исполнитель изменён', WORK_MEDIA_CHANGED: 'Фотографии работы изменены',
  WORK_COMMENT_ADDED: 'Добавлен комментарий к работе', WORK_WATCHED: 'Подписка на работу', WORK_UNWATCHED: 'Отписка от работы',
  ISSUE_CREATED: 'Создано замечание', DOCUMENT_GENERATED: 'Документ сформирован', DOCUMENT_CONFIRMED: 'Документ подтверждён',
  WORK_ACCEPTED: 'Работа принята',
};

export const roleLabels = { RESIDENT: 'житель', CHAIRMAN: 'председатель', COUNCIL_MEMBER: 'член совета', EXECUTOR: 'исполнитель' };

export function formatDate(value, now = new Date()) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';

  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1);
  const day = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const time = new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(date);

  if (day.getTime() === today.getTime()) return `сегодня в ${time}`;
  if (day.getTime() === yesterday.getTime()) return `вчера в ${time}`;
  if (date.getFullYear() === now.getFullYear()) {
    const dayAndMonth = new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long' }).format(date);
    return `${dayAndMonth} в ${time}`;
  }
  const dayNumber = String(date.getDate()).padStart(2, '0');
  const monthNumber = String(date.getMonth() + 1).padStart(2, '0');
  return `${dayNumber}.${monthNumber}.${date.getFullYear()} г. в ${time}`;
}

export function previewText(value, maxLength = 256) {
  const text = String(value ?? '');
  return text.length > maxLength ? `${text.slice(0, maxLength - 1)}…` : text;
}

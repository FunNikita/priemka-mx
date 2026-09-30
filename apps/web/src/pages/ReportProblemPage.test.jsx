// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ReportProblemPage } from './ReportProblemPage';

const { uploadPhoto, request } = vi.hoisted(() => ({ uploadPhoto: vi.fn(), request: vi.fn() }));
vi.mock('./residentApi', () => ({ uploadPhoto, request, jsonRequest: (method, body) => ({ method, body: JSON.stringify(body) }) }));

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn(() => `blob:photo-${Math.random()}`);
  URL.revokeObjectURL = vi.fn();
  uploadPhoto.mockReset(); request.mockReset();
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

it('загружает фото последовательно и сохраняет порядок mediaIds', async () => {
  let resolveFirst;
  let resolveSecond;
  uploadPhoto.mockImplementationOnce(() => new Promise((resolve) => { resolveFirst = resolve; })).mockImplementationOnce(() => new Promise((resolve) => { resolveSecond = resolve; }));
  request.mockRejectedValueOnce(new Error('Сеть')).mockResolvedValueOnce({ id: 9 });
  await act(async () => root.render(<ReportProblemPage houseId={1} houses={[{ id: 1, address: 'Дом', status: 'ACTIVE', permissions: { createObservation: true } }]} onBack={() => {}} />));
  const input = container.querySelector('input[type="file"]');
  const files = [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })];
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: files }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(uploadPhoto).toHaveBeenCalledTimes(1);
  expect(container.querySelector('button[aria-label="Повторить загрузку фото 1"]')).toBeNull();
  await act(async () => resolveFirst({ id: 20 }));
  expect(uploadPhoto).toHaveBeenCalledTimes(2);
  await act(async () => resolveSecond({ id: 21 }));
  expect(container.querySelectorAll('.report-problem-photo img')).toHaveLength(2);
  expect(uploadPhoto).toHaveBeenCalledTimes(2);
  await act(async () => container.querySelector('button[aria-label="Категория проблемы"]').click());
  await act(async () => Array.from(container.querySelectorAll('[role="option"]')).find((option) => option.textContent.includes('Освещение')).click());
  const title = container.querySelector('input[placeholder^="Например"]');
  const description = container.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(title, 'Свет');
    title.dispatchEvent(new Event('input', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(description, 'Не горит свет');
    description.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const submit = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Отправить проблему'));
  expect(submit.disabled).toBe(false);
  await act(async () => submit.click());
  expect(request).toHaveBeenCalledWith('/api/houses/1/observations', expect.objectContaining({ body: expect.stringContaining('"mediaIds":[20,21]') }));
  await act(async () => submit.click());
  expect(request).toHaveBeenCalledTimes(2);
  expect(uploadPhoto).toHaveBeenCalledTimes(2);
});

it('оставляет ошибочное фото для ручного retry и не отправляет успешное повторно', async () => {
  uploadPhoto.mockRejectedValueOnce(new Error('Сеть')).mockResolvedValueOnce({ id: 31 }).mockResolvedValueOnce({ id: 30 });
  await act(async () => root.render(<ReportProblemPage houseId={1} houses={[{ id: 1, address: 'Дом', status: 'ACTIVE', permissions: { createObservation: true } }]} onBack={() => {}} />));
  const input = container.querySelector('input[type="file"]');
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: [new File(['a'], 'a.png', { type: 'image/png' }), new File(['b'], 'b.png', { type: 'image/png' })] }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(uploadPhoto).toHaveBeenCalledTimes(2);
  expect(container.querySelector('button[aria-label="Повторить загрузку фото 1"]')).not.toBeNull();
  await act(async () => container.querySelector('button[aria-label="Повторить загрузку фото 1"]').click());
  expect(uploadPhoto).toHaveBeenCalledTimes(3);
  expect(uploadPhoto.mock.calls[2][0].name).toBe('a.png');
  expect(container.querySelectorAll('.report-problem-photo img')).toHaveLength(2);
});

it('ограничивает наблюдение пятью фотографиями', async () => {
  uploadPhoto.mockImplementation(() => new Promise(() => {}));
  await act(async () => root.render(<ReportProblemPage houseId={1} houses={[{ id: 1, address: 'Дом', status: 'ACTIVE', permissions: { createObservation: true } }]} onBack={() => {}} />));
  const input = container.querySelector('input[type="file"]');
  const files = Array.from({ length: 6 }, (_, index) => new File(['a'], `${index}.png`, { type: 'image/png' }));
  await act(async () => { Object.defineProperty(input, 'files', { configurable: true, value: files }); input.dispatchEvent(new Event('change', { bubbles: true })); });
  expect(container.querySelectorAll('.report-problem-photo')).toHaveLength(5);
  expect(uploadPhoto).toHaveBeenCalledTimes(1);
  expect(container.textContent).toContain('не более 5');
  expect(container.querySelector('.report-problem-photo-action').disabled).toBe(true);
});

it('держит отправку недоступной до окончания очереди', async () => {
  let finish;
  uploadPhoto.mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => root.render(<ReportProblemPage houseId={1} houses={[{ id: 1, address: 'Дом', status: 'ACTIVE', permissions: { createObservation: true } }]} onBack={() => {}} />));
  await act(async () => container.querySelector('button[aria-label="Категория проблемы"]').click());
  await act(async () => Array.from(container.querySelectorAll('[role="option"]')).find((option) => option.textContent.includes('Освещение')).click());
  const title = container.querySelector('input[placeholder^="Например"]');
  const description = container.querySelector('textarea');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(title, 'Свет'); title.dispatchEvent(new Event('input', { bubbles: true }));
    Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set.call(description, 'Не горит свет'); description.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const file = container.querySelector('input[type="file"]');
  await act(async () => { Object.defineProperty(file, 'files', { configurable: true, value: [new File(['a'], 'a.png', { type: 'image/png' })] }); file.dispatchEvent(new Event('change', { bubbles: true })); });
  const submit = Array.from(container.querySelectorAll('button')).find((button) => button.textContent.includes('Отправить проблему'));
  expect(submit.disabled).toBe(true);
  await act(async () => finish({ id: 50 }));
  expect(submit.disabled).toBe(false);
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { ResidentHome } from './ResidentHome';

const { allPages } = vi.hoisted(() => ({ allPages: vi.fn() }));
vi.mock('./residentApi', () => ({ allPages, request: vi.fn(), formatDate: () => 'Сегодня', previewText: (value) => value, workStatuses: { NEW: 'Новая' } }));
vi.mock('./ObservationDetail', () => ({ ObservationDetail: ({ observationId }) => <div data-testid="detail">{observationId}</div> }));

let container;
let root;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('на Главной жителя пустая область фотополосы открывает карточку, снимок — галерею', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  allPages.mockResolvedValue({ items: [{ id: 3, title: 'Свет', description: 'Не горит', status: 'NEW', media: [{ id: 1, url: '/one.jpg' }, { id: 2, url: '/two.jpg' }], isWatching: true }] });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  await act(async () => root.render(<ResidentHome houseId={1} houses={[{ id: 1, permissions: { viewObservations: true } }]} />));
  const card = container.querySelector('.home-active-work');
  expect(card.querySelector('.home-active-work__photos--scrollable')).toBeNull();
  await act(async () => card.querySelector('.media-preview__button').click());
  expect(container.querySelector('.image-modal-backdrop')).not.toBeNull();
  expect(container.querySelector('[data-testid="detail"]')).toBeNull();
  await act(async () => container.querySelector('.image-modal-backdrop').click());
  await act(async () => card.querySelector('.home-active-work__photos').click());
  expect(container.querySelector('[data-testid="detail"]').textContent).toBe('3');
});

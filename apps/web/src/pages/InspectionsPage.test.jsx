// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { InspectionsPage } from './InspectionsPage';

vi.mock('./useCouncilTasks', () => ({
  useCouncilTasks: () => ({
    tasks: [{ id: 1, kind: 'assignment', status: 'ASSIGNED', work: { id: 7, title: 'Работа', description: 'Описание', media: [{ id: 1, url: '/one.jpg' }, { id: 2, url: '/two.jpg' }] } }],
    loading: false, error: '', reload: vi.fn(),
  }),
}));

let container;
let root;
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('на Главной открывает проверку по свободному месту карточки и фото только по снимку', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
  const onOpenInspection = vi.fn();
  await act(async () => root.render(<InspectionsPage houseId={5} embedded onOpenInspection={onOpenInspection} />));
  const card = container.querySelector('.house-event-card');
  expect(card.querySelector('.house-event-card__photos--scrollable')).toBeNull();
  await act(async () => card.querySelector('.media-preview__button').click());
  expect(container.querySelector('.image-modal-backdrop')).not.toBeNull();
  expect(onOpenInspection).not.toHaveBeenCalled();
  await act(async () => container.querySelector('.image-modal-backdrop').click());
  await act(async () => card.querySelector('.house-event-card__photos').click());
  expect(onOpenInspection).toHaveBeenCalledOnce();
});

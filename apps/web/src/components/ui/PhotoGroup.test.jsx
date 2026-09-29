// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PhotoGroup } from './PhotoGroup';

let container;
let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('листаeт фотографии одного блока и показывает счётчик', async () => {
  const photos = [
    { id: 1, url: '/photo/abc123abc123', width: 1200, height: 800 },
    { id: 2, url: '/photo/def456def456', width: 800, height: 1200 },
  ];
  await act(async () => root.render(<PhotoGroup className="active-work-details__comment-photo-list" photos={photos} title="Фото комментария" />));
  expect(container.querySelectorAll('.active-work-details__comment-photo-list .media-preview__button')).toHaveLength(2);
  await act(async () => container.querySelector('.media-preview__button').click());
  expect(container.querySelector('.event-photo-gallery__counter').textContent).toBe('1 / 2');
  expect(container.querySelector('.photo-image__preview').getAttribute('src')).toBe('/photo/abc123abc123?w=200&h=133&fit=contain');
  await act(async () => container.querySelector('[aria-label="Следующее фото"]').click());
  expect(container.querySelector('.event-photo-gallery__counter').textContent).toBe('2 / 2');
  expect(container.querySelector('.photo-image__original').getAttribute('src')).toBe('/photo/def456def456');
});

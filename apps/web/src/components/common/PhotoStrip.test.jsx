// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PhotoGallery, PhotoStrip } from './PhotoStrip';

let container;
let root;
beforeEach(() => { globalThis.IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); });

it('не перелистывает gallery за границы и закрывает Escape', async () => {
  const onClose = vi.fn();
  const photos = [{ id: 1, url: '/photo/1' }, { id: 2, url: '/photo/2' }];
  await act(async () => root.render(<PhotoGallery photos={photos} title="Фото" onClose={onClose} />));
  expect(container.querySelector('[aria-label="Предыдущее фото"]')).toBeNull();
  expect(container.textContent).toContain('1 / 2');
  await act(async () => container.querySelector('[aria-label="Следующее фото"]').click());
  expect(container.textContent).toContain('2 / 2');
  expect(container.querySelector('[aria-label="Следующее фото"]')).toBeNull();
  const area = container.querySelector('.photo-gallery-area');
  area.getBoundingClientRect = () => ({ left: 0, width: 100 });
  await act(async () => area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10 })));
  expect(container.textContent).toContain('1 / 2');
  await act(async () => area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 90 })));
  expect(container.textContent).toContain('2 / 2');
  await act(async () => area.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 50 })));
  expect(container.textContent).toContain('2 / 2');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
  expect(container.textContent).toContain('2 / 2');
  await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
  expect(onClose).toHaveBeenCalledOnce();
});

it('показывает retry после ошибки изображения и повторно запрашивает URL', async () => {
  await act(async () => root.render(<PhotoStrip photos={[{ id: 1, url: '/photo/1' }]} />));
  const img = container.querySelector('img');
  expect(container.querySelector('[role="status"]')).not.toBeNull();
  await act(async () => img.dispatchEvent(new Event('error')));
  expect(container.querySelector('[aria-label="Повторить загрузку фото"]')).not.toBeNull();
  await act(async () => container.querySelector('[aria-label="Повторить загрузку фото"]').click());
  expect(container.querySelector('img').getAttribute('src')).toContain('retry=1');
});

it('поддерживает перетаскивание мышью без случайного открытия gallery', async () => {
  const onOpen = vi.fn();
  await act(async () => root.render(<PhotoStrip photos={[{ id: 1, url: '/photo/1' }, { id: 2, url: '/photo/2' }]} onOpen={onOpen} />));
  const strip = container.querySelector('.photo-strip');
  const pointer = (type, x) => { const event = new Event(type, { bubbles: true }); Object.defineProperties(event, { pointerType: { value: 'mouse' }, clientX: { value: x }, pointerId: { value: 1 } }); strip.dispatchEvent(event); };
  await act(async () => { pointer('pointerdown', 100); pointer('pointermove', 40); pointer('pointerup', 40); container.querySelector('.photo-strip__item').click(); });
  expect(strip.scrollLeft).toBe(60);
  expect(onOpen).not.toHaveBeenCalled();
});

// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PhotoField } from './CouncilApiWorkPage';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  URL.createObjectURL = vi.fn((file) => `blob:${file.name}`);
  URL.revokeObjectURL = vi.fn();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.restoreAllMocks();
});

it('показывает ошибку при выборе более пяти фотографий', async () => {
  const onChange = vi.fn();
  await act(async () => root.render(<PhotoField photos={[]} onChange={onChange} />));
  const input = container.querySelector('input[type="file"]');
  const files = Array.from({ length: 6 }, (_, index) => new File(['a'], `${index}.png`, { type: 'image/png' }));
  await act(async () => {
    Object.defineProperty(input, 'files', { configurable: true, value: files });
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('не более 5');
  expect(onChange.mock.calls[0][0]).toHaveLength(5);
});

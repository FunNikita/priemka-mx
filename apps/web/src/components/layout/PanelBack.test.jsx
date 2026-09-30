// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PanelBack } from './PanelBack';

afterEach(() => { delete window.WebApp; });

it('оставляет только нативную кнопку MAX без кнопки в панели', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const backButton = { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() };
  window.WebApp = { BackButton: backButton };
  const onBack = vi.fn();
  const element = document.createElement('div');
  const root = createRoot(element);
  await act(async () => root.render(<PanelBack onBack={onBack} />));
  expect(element.childElementCount).toBe(0);
  expect(backButton.show).toHaveBeenCalledOnce();
  expect(backButton.onClick).toHaveBeenCalledWith(onBack);
  await act(async () => root.unmount());
  expect(backButton.offClick).toHaveBeenCalledWith(onBack);
  expect(backButton.hide).toHaveBeenCalledOnce();
});

// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { PageHeader } from './PageHeader';

afterEach(() => { delete window.WebApp; });

it('управляет нативной кнопкой назад и очищает обработчик', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const backButton = { show: vi.fn(), hide: vi.fn(), onClick: vi.fn(), offClick: vi.fn() };
  window.WebApp = { BackButton: backButton };
  const onBack = vi.fn();
  const element = document.createElement('div');
  const root = createRoot(element);
  await act(async () => root.render(<PageHeader title="Страница" onBack={onBack} />));
  expect(backButton.show).toHaveBeenCalledOnce();
  expect(backButton.onClick).toHaveBeenCalledWith(onBack);
  backButton.onClick.mock.calls[0][0]();
  expect(onBack).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
  expect(backButton.offClick).toHaveBeenCalledWith(onBack);
  expect(backButton.hide).toHaveBeenCalledOnce();
});

it('работает в браузере без MAX Bridge', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const element = document.createElement('div');
  const root = createRoot(element);
  await act(async () => root.render(<PageHeader title="Страница" onBack={() => {}} />));
  await act(async () => root.unmount());
});

it('скрывает нативную кнопку без обработчика назад', async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  const backButton = { hide: vi.fn() };
  window.WebApp = { BackButton: backButton };
  const element = document.createElement('div');
  const root = createRoot(element);
  await act(async () => root.render(<PageHeader title="Главная" />));
  expect(backButton.hide).toHaveBeenCalledOnce();
  await act(async () => root.unmount());
});

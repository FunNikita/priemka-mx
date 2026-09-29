// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

import { DocumentRow } from './DocumentRow';

let container;
let root;
beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  delete window.WebApp;
});

it('передаёт HTTPS-ссылку и имя PDF в MAX Bridge при клике на скачивание', async () => {
  const downloadFile = vi.fn();
  window.WebApp = { initData: 'signed-data', downloadFile };
  await act(async () => root.render(<DocumentRow document={{ title: 'Акт приёмки', fileUrl: 'https://files.example.com/doc/42.pdf' }} />));

  const click = new MouseEvent('click', { bubbles: true, cancelable: true });
  await act(async () => container.querySelector('.document-row__download').dispatchEvent(click));

  expect(click.defaultPrevented).toBe(true);
  expect(downloadFile).toHaveBeenCalledWith('https://files.example.com/doc/42.pdf', 'Акт приёмки.pdf');
});

it('оставляет обычную ссылку для браузера без MAX Bridge', async () => {
  await act(async () => root.render(<DocumentRow document={{ fileName: 'report.pdf', fileUrl: '/doc/42.pdf' }} />));
  const link = container.querySelector('.document-row__download');
  expect(link.getAttribute('download')).toBe('report.pdf');
  expect(link.getAttribute('href')).toBe('/doc/42.pdf');
});

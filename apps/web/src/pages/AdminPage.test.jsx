import { expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { MembershipsDialog } from './AdminPage';

it('показывает компактную кнопку редактирования роли с понятным aria-label', () => {
  const user = { id: 1, memberships: [{ id: 2, houseAddress: 'Улица, 1', role: 'RESIDENT', status: 'ACTIVE' }] };
  const html = renderToStaticMarkup(<MembershipsDialog user={user} onClose={() => {}} onEdit={() => {}} onAdd={() => {}} />);
  expect(html).toContain('aria-label="Изменить роль в доме Улица, 1"');
  expect(html).toContain('vkuiIcon');
  expect(html).not.toContain('>Изменить</button>');
});

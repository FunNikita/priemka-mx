import { expect, it } from 'vitest';
import { activeMembership, houseRole, selectedHouseId } from './houseContext';

const me = { user: { isAdmin: true }, houses: [
  { id: 1, role: 'RESIDENT', status: 'ACTIVE' },
  { id: 2, role: 'COUNCIL_MEMBER', status: 'ACTIVE' },
  { id: 3, role: 'CHAIRMAN', status: 'PENDING' },
] };

it('выбирает роль только по активному членству выбранного дома', () => {
  expect(houseRole(me, 1)).toBe('RESIDENT');
  expect(houseRole(me, 2)).toBe('COUNCIL_MEMBER');
  expect(houseRole(me, 3)).toBeNull();
  expect(activeMembership(me, 3)).toBeNull();
  expect(selectedHouseId(me, 3)).toBe(1);
  expect(selectedHouseId(me, 2)).toBe(2);
});

it('системный администратор не получает домовую роль без членства', () => {
  expect(me.user.isAdmin).toBe(true);
  expect(houseRole({ user: { isAdmin: true }, houses: [] }, null)).toBeNull();
});

import { jsonRequest, request } from './residentApi';

export function saveAdminMembership(draft) {
  const body = { role: draft.role, status: draft.status };
  if (draft.executorCompanyName.trim()) body.executorCompanyName = draft.executorCompanyName.trim();
  return request(`/api/admin/houses/${draft.houseId}/members/${draft.user.id}`, jsonRequest('PUT', body));
}

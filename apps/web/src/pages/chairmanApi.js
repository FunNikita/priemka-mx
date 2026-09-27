import { allPages, jsonRequest, request } from './residentApi';

export async function loadChairmanHome(houseId) {
  const [requests, works] = await Promise.all([
    allPages(`/api/houses/${houseId}/join-requests`),
    allPages(`/api/houses/${houseId}/works`),
  ]);
  return { requests: requests.items, works: works.items };
}

export function decideJoinRequest(houseId, membershipId, decision) {
  return request(`/api/houses/${houseId}/join-requests/${membershipId}`, jsonRequest('PATCH', { decision }));
}

export async function loadWorkForm(houseId) {
  const [executors, templates] = await Promise.all([
    request(`/api/houses/${houseId}/members?role=EXECUTOR`),
    request('/api/checklist-templates'),
  ]);
  return { executors: executors.items, templates: templates.items.filter((item) => item.active) };
}

export function createChairmanWork(houseId, input) {
  return request(`/api/houses/${houseId}/works`, jsonRequest('POST', input));
}

export async function loadInspectionForm(houseId, category) {
  const [members, templates] = await Promise.all([
    request(`/api/houses/${houseId}/members?role=COUNCIL_MEMBER`),
    request('/api/checklist-templates'),
  ]);
  return { members: members.items, templates: templates.items.filter((item) => item.active && item.category === category) };
}

export function assignInspection(workId, checklistTemplateId, assigneeUserId) {
  return request(`/api/works/${workId}/inspections`, jsonRequest('POST', { checklistTemplateId, assigneeUserId }));
}

export function generateRefusal(workId) {
  return request(`/api/works/${workId}/documents`, jsonRequest('POST', { type: 'REASONED_REFUSAL' }));
}

export function confirmChairmanDocument(documentId) {
  return request(`/api/documents/${documentId}/confirm`, jsonRequest('POST', {}));
}

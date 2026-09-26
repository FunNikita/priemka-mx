/** Frontend-facing DTOs. Runtime validation remains in Fastify schemas/OpenAPI. */
export type HouseMembershipRole = "RESIDENT" | "COUNCIL_MEMBER" | "CHAIRMAN" | "EXECUTOR";
export type MembershipStatus = "PENDING" | "ACTIVE" | "REJECTED";
export type MembershipJoinSource = "CHAT" | "INVITE" | "REQUEST" | "ADMIN";
export type HouseAccessStatus = "NONE" | MembershipStatus;
export type WorkStatus = "NEW" | "IN_REVIEW" | "IN_PROGRESS" | "WAITING" | "ACCEPTED";
export type IssueStatus = "OPEN" | "REMEDIATION_SUBMITTED" | "RESOLVED";
export type InspectionAnswerResult = "PENDING" | "PASS" | "FAIL" | "UNABLE_TO_CHECK";
export type ReinspectionResult = "RESOLVED" | "NOT_RESOLVED";
export type DocumentType = "INSPECTION_REPORT" | "REINSPECTION_REPORT" | "REASONED_REFUSAL" | "ACCEPTANCE_ACT";
export type DocumentStatus = "DRAFT" | "FINAL" | "CONFIRMED" | "SUPERSEDED";
export type InspectionAssignmentStatus = "ASSIGNED" | "IN_PROGRESS" | "COMPLETED";
export type ReinspectionStatus = "ASSIGNED" | "COMPLETED";
export type IsoDateTime = string;
export type Id = number;
export type EmptyBody = Record<string, never>;
export type PageQuery = { page?: number; limit?: number };
export type Page<T> = { items: T[]; page: number; limit: number; total: number };
export type Items<T> = { items: T[] };
export type HouseRef = { id: Id; address: string };
export type Permissions = { viewWorks: boolean; viewObservations: boolean; viewHouseChat: boolean; createObservation: boolean; commentWork: boolean; watchWork: boolean; manageHouseChat: boolean; assignInspectors: boolean; performInspection: boolean; reportRemediation: boolean; confirmWorkResult: boolean; reviewJoinRequests: boolean };
export type MeResponse = { query_id?: string; ip?: string; auth_date: number; user: { id: Id; maxUserId: string; isAdmin: boolean; first_name: string; last_name: string; username: string | null; language_code: string; photo_url: string | null }; chat?: { id: string; type: "DIALOG" | "CHAT" | "CHANNEL" }; start_param?: string; houses: (HouseRef & { role: HouseMembershipRole; status: MembershipStatus; joinedVia: MembershipJoinSource; permissions: Permissions })[] };

export type ListHousesQuery = PageQuery & { q?: string };
export type HouseListItem = HouseRef & { access: { status: HouseAccessStatus; role: HouseMembershipRole | null; joinedVia: MembershipJoinSource | null }; actions: { open: boolean; requestAccess: boolean; cancelRequest: boolean } };
export type ListHousesResponse = Page<HouseListItem>;
export type JoinRequest = { id: Id; houseId: Id; role: "RESIDENT"; status: MembershipStatus; joinedVia: "REQUEST"; createdAt: IsoDateTime; updatedAt: IsoDateTime };
export type CreateJoinRequestResponse = JoinRequest;
export type CancelJoinRequestResponse = void; // HTTP 204
export type ListJoinRequestsQuery = PageQuery & { status?: MembershipStatus };
export type JoinRequestWithUser = JoinRequest & { user: { id: Id; firstName: string; lastName: string; photoUrl: string | null } };
export type ListJoinRequestsResponse = Page<JoinRequestWithUser>;
export type ReviewJoinRequestBody = { decision: "APPROVE" | "REJECT" };
export type ReviewJoinRequestResponse = JoinRequest;

export type MediaRef = { id: Id; url: string; width: number; height: number; mimeType: string; size: number };
export type WorkflowMediaRef = { id: Id; url: string };
export type Author = { id: Id; firstName: string; lastName: string };
export type WorkCard = { id: Id; title: string; description: string; category: string; status: WorkStatus; date: IsoDateTime; isWatching: boolean; media: MediaRef[] };
export type WorkDocument = { id: Id; type: DocumentType; title: string; version: number; status: DocumentStatus; createdAt: IsoDateTime; confirmedAt: IsoDateTime | null; fileUrl: string; actions: { confirm: boolean } };
export type WorkDetail = { id: Id; house: HouseRef; houseObject: { id: Id; title: string } | null; title: string; description: string; category: string; status: WorkStatus; date: IsoDateTime; dates: { createdAt: IsoDateTime; updatedAt: IsoDateTime; completedAt: IsoDateTime | null }; history: { id: Id; event: string; details: string | null; createdAt: IsoDateTime }[]; media: MediaRef[]; executor: string | null; representative: { id: Id; name: string; phone: string | null; maxUrl: string | null } | null; isWatching: boolean; actions: { watch: boolean; unwatch: boolean; comment: boolean; reportRemediation: boolean; assignInspectors: boolean; performInspection: boolean; generateReasonedRefusal: boolean; generateAcceptanceAct: boolean; confirmAcceptance: boolean; manageDocuments: boolean }; documents: WorkDocument[] };
export type ListWorksQuery = PageQuery & { status?: WorkStatus };
export type ListWorksResponse = Page<WorkCard> & { house: HouseRef & { chat: { title: string | null; joinUrl: string } | null }; actions: { manageChat: boolean } };
export type Observation = { id: Id; title: string; description: string; category: string; status: WorkStatus; createdAt: IsoDateTime; author: Author; media: MediaRef[] };
export type ListObservationsQuery = PageQuery & { status?: WorkStatus; search?: string };
export type CreateObservationBody = { category: string; title: string; description: string; houseObjectId?: Id | null; mediaIds?: Id[] };
export type Comment = { id: Id; text: string; author: Author; createdAt: IsoDateTime; media: MediaRef[] };
export type CreateCommentBody = { text?: string; mediaIds?: Id[] };
export type ChatResponse = { title: string | null; joinUrl: string };
export type UploadMediaBody = FormData;

export type ChecklistTemplateItem = { id: Id; order: number; title: string; description: string | null; method: string; sourceType: string; sourceLabel: string | null; commentRequiredOnFail: boolean; photoRequiredOnFail: boolean };
export type ChecklistTemplate = { id: Id; code: string; title: string; category: string; version: number; active: boolean; items: ChecklistTemplateItem[] };
export type WorkRef = { id: Id; title: string; houseId: Id };
export type InspectionAssignmentSummary = { id: Id; status: InspectionAssignmentStatus; work: WorkRef; inspectionId: Id };
export type InspectionAssignmentDetail = { id: Id; status: InspectionAssignmentStatus; work: { id: Id; title: string }; inspection: { id: Id; templateVersion: number }; checklist: (ChecklistTemplateItem & { answer: { result: InspectionAnswerResult; comment: string | null; media: WorkflowMediaRef[] } })[]; actions: { save: boolean; complete: boolean } };
export type SaveInspectionAnswerBody = { result: InspectionAnswerResult; comment?: string | null; mediaIds?: Id[] };
export type SaveInspectionAnswerResponse = { id: Id; result: InspectionAnswerResult; comment: string | null; mediaIds: Id[] };
export type Issue = { id: Id; workId: Id; title: string; description: string; status: IssueStatus; createdAt: IsoDateTime; resolvedAt: IsoDateTime | null; before: WorkflowMediaRef[]; remediations: { id: Id; comment: string; createdAt: IsoDateTime; after: WorkflowMediaRef[] }[]; reinspections: { id: Id; status: ReinspectionStatus; result: ReinspectionResult | null; comment: string | null; createdAt: IsoDateTime; completedAt: IsoDateTime | null }[]; work?: WorkRef };
export type ReinspectionSummary = { id: Id; status: ReinspectionStatus; issueId: Id; work: WorkRef };
export type ReinspectionDetail = { id: Id; status: ReinspectionStatus; result: ReinspectionResult | null; issue: { id: Id; title: string; description: string; before: WorkflowMediaRef[] }; remediation: { id: Id; comment: string; after: WorkflowMediaRef[] }; actions: { complete: boolean } };
export type AcceptanceActData = Record<"actNumber" | "city" | "contractNumber" | "contractDate" | "customerName" | "customerApartment" | "customerAuthorityBasis" | "executorOrganization" | "executorRepresentative" | "executorAuthorityBasis" | "periodFrom" | "periodTo" | "frequencyOrQuantity" | "unit" | "unitPrice" | "totalPrice" | "totalPriceWords", string>;
export type CreateDocumentBody = { type: "REASONED_REFUSAL" } | { type: "ACCEPTANCE_ACT"; data: AcceptanceActData };
export type CreateDocumentResponse = { id: Id; version: number; status: DocumentStatus; fileUrl: string };
export type ConfirmDocumentResponse = { status: DocumentStatus; confirmations?: number; version?: number; fileUrl?: string };

/** Method/path are literal; params/query/body/response are compile-time contract fields. */
export type Route<M extends string, P extends string, Params, Query, Body, Response> = { method: M; path: P; params: Params; query: Query; body: Body; response: Response };
export interface ApiContract {
  me: Route<"GET", "/api/me", never, never, never, MeResponse>;
  houses: Route<"GET", "/api/houses", never, ListHousesQuery, never, ListHousesResponse>;
  createJoinRequest: Route<"POST", "/api/houses/:houseId/join-requests", { houseId: Id }, never, EmptyBody, CreateJoinRequestResponse>;
  cancelJoinRequest: Route<"DELETE", "/api/houses/:houseId/join-requests/me", { houseId: Id }, never, never, CancelJoinRequestResponse>;
  joinRequests: Route<"GET", "/api/houses/:houseId/join-requests", { houseId: Id }, ListJoinRequestsQuery, never, ListJoinRequestsResponse>;
  reviewJoinRequest: Route<"PATCH", "/api/houses/:houseId/join-requests/:membershipId", { houseId: Id; membershipId: Id }, never, ReviewJoinRequestBody, ReviewJoinRequestResponse>;
  houseWorks: Route<"GET", "/api/houses/:houseId/works", { houseId: Id }, ListWorksQuery, never, ListWorksResponse>;
  work: Route<"GET", "/api/works/:workId", { workId: Id }, never, never, WorkDetail>;
  watchWork: Route<"POST", "/api/works/:workId/watch", { workId: Id }, never, never, void>;
  unwatchWork: Route<"DELETE", "/api/works/:workId/watch", { workId: Id }, never, never, void>;
  observations: Route<"GET", "/api/houses/:houseId/observations", { houseId: Id }, ListObservationsQuery, never, Page<Observation>>;
  createObservation: Route<"POST", "/api/houses/:houseId/observations", { houseId: Id }, never, CreateObservationBody, { id: Id; status: WorkStatus }>;
  comments: Route<"GET", "/api/works/:workId/comments", { workId: Id }, never, never, Items<Comment>>;
  createComment: Route<"POST", "/api/works/:workId/comments", { workId: Id }, never, CreateCommentBody, { id: Id }>;
  setHouseChat: Route<"PUT", "/api/houses/:houseId/chat", { houseId: Id }, never, { joinUrl: string }, ChatResponse>;
  deleteHouseChat: Route<"DELETE", "/api/houses/:houseId/chat", { houseId: Id }, never, never, void>;
  uploadMedia: Route<"POST", "/api/media", never, never, UploadMediaBody, { id: Id }>;
  checklistTemplates: Route<"GET", "/api/checklist-templates", never, { category?: string }, never, Items<ChecklistTemplate>>;
  houseCouncilMembers: Route<"GET", "/api/houses/:houseId/members", { houseId: Id }, { role: "COUNCIL_MEMBER" }, never, Items<{ id: Id; name: string }>>;
  createInspection: Route<"POST", "/api/works/:workId/inspections", { workId: Id }, never, { checklistTemplateId: Id; assigneeUserId: Id }, { id: Id }>;
  myInspectionAssignments: Route<"GET", "/api/me/inspection-assignments", never, { houseId?: Id; status?: InspectionAssignmentStatus }, never, Items<InspectionAssignmentSummary>>;
  inspectionAssignment: Route<"GET", "/api/inspection-assignments/:assignmentId", { assignmentId: Id }, never, never, InspectionAssignmentDetail>;
  saveInspectionAnswer: Route<"PUT", "/api/inspection-assignments/:assignmentId/answers/:itemId", { assignmentId: Id; itemId: Id }, never, SaveInspectionAnswerBody, SaveInspectionAnswerResponse>;
  completeInspection: Route<"POST", "/api/inspection-assignments/:assignmentId/complete", { assignmentId: Id }, never, EmptyBody, { status: "COMPLETED" }>;
  workIssues: Route<"GET", "/api/works/:workId/issues", { workId: Id }, never, never, Items<Issue>>;
  myIssues: Route<"GET", "/api/me/issues", never, { houseId?: Id; status?: IssueStatus }, never, Items<Issue>>;
  createRemediation: Route<"POST", "/api/issues/:issueId/remediations", { issueId: Id }, never, { comment: string; mediaIds: Id[] }, { id: Id; reinspectionId: Id }>;
  myReinspections: Route<"GET", "/api/me/reinspections", never, { houseId?: Id; status?: ReinspectionStatus }, never, Items<ReinspectionSummary>>;
  reinspection: Route<"GET", "/api/reinspections/:reinspectionId", { reinspectionId: Id }, never, never, ReinspectionDetail>;
  completeReinspection: Route<"POST", "/api/reinspections/:reinspectionId/complete", { reinspectionId: Id }, never, { result: ReinspectionResult; comment?: string | null; mediaIds?: Id[] }, { status: "COMPLETED"; result: ReinspectionResult }>;
  createDocument: Route<"POST", "/api/works/:workId/documents", { workId: Id }, never, CreateDocumentBody, CreateDocumentResponse>;
  confirmDocument: Route<"POST", "/api/documents/:documentId/confirm", { documentId: Id }, never, EmptyBody, ConfirmDocumentResponse>;
}

/** URL builders return paths including /api; caller supplies MAX auth and request handling. */
export const apiRoutes = {
  me: { method: "GET", path: "/api/me" },
  houses: { method: "GET", path: "/api/houses" },
  createJoinRequest: (houseId: Id) => ({ method: "POST", path: `/api/houses/${houseId}/join-requests` } as const),
  cancelJoinRequest: (houseId: Id) => ({ method: "DELETE", path: `/api/houses/${houseId}/join-requests/me` } as const),
  joinRequests: (houseId: Id) => ({ method: "GET", path: `/api/houses/${houseId}/join-requests` } as const),
  reviewJoinRequest: (houseId: Id, membershipId: Id) => ({ method: "PATCH", path: `/api/houses/${houseId}/join-requests/${membershipId}` } as const),
  houseWorks: (houseId: Id) => ({ method: "GET", path: `/api/houses/${houseId}/works` } as const),
  work: (workId: Id) => ({ method: "GET", path: `/api/works/${workId}` } as const),
  watchWork: (workId: Id) => ({ method: "POST", path: `/api/works/${workId}/watch` } as const),
  unwatchWork: (workId: Id) => ({ method: "DELETE", path: `/api/works/${workId}/watch` } as const),
  observations: (houseId: Id) => ({ method: "GET", path: `/api/houses/${houseId}/observations` } as const),
  createObservation: (houseId: Id) => ({ method: "POST", path: `/api/houses/${houseId}/observations` } as const),
  comments: (workId: Id) => ({ method: "GET", path: `/api/works/${workId}/comments` } as const),
  createComment: (workId: Id) => ({ method: "POST", path: `/api/works/${workId}/comments` } as const),
  setHouseChat: (houseId: Id) => ({ method: "PUT", path: `/api/houses/${houseId}/chat` } as const),
  deleteHouseChat: (houseId: Id) => ({ method: "DELETE", path: `/api/houses/${houseId}/chat` } as const),
  uploadMedia: { method: "POST", path: "/api/media" },
  checklistTemplates: { method: "GET", path: "/api/checklist-templates" },
  houseCouncilMembers: (houseId: Id) => ({ method: "GET", path: `/api/houses/${houseId}/members` } as const),
  createInspection: (workId: Id) => ({ method: "POST", path: `/api/works/${workId}/inspections` } as const),
  myInspectionAssignments: { method: "GET", path: "/api/me/inspection-assignments" },
  inspectionAssignment: (assignmentId: Id) => ({ method: "GET", path: `/api/inspection-assignments/${assignmentId}` } as const),
  saveInspectionAnswer: (assignmentId: Id, itemId: Id) => ({ method: "PUT", path: `/api/inspection-assignments/${assignmentId}/answers/${itemId}` } as const),
  completeInspection: (assignmentId: Id) => ({ method: "POST", path: `/api/inspection-assignments/${assignmentId}/complete` } as const),
  workIssues: (workId: Id) => ({ method: "GET", path: `/api/works/${workId}/issues` } as const),
  myIssues: { method: "GET", path: "/api/me/issues" },
  createRemediation: (issueId: Id) => ({ method: "POST", path: `/api/issues/${issueId}/remediations` } as const),
  myReinspections: { method: "GET", path: "/api/me/reinspections" },
  reinspection: (reinspectionId: Id) => ({ method: "GET", path: `/api/reinspections/${reinspectionId}` } as const),
  completeReinspection: (reinspectionId: Id) => ({ method: "POST", path: `/api/reinspections/${reinspectionId}/complete` } as const),
  createDocument: (workId: Id) => ({ method: "POST", path: `/api/works/${workId}/documents` } as const),
  confirmDocument: (documentId: Id) => ({ method: "POST", path: `/api/documents/${documentId}/confirm` } as const),
} as const;

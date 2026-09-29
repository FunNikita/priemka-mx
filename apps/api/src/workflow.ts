import { join } from "node:path";

import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

import type { DocumentType, DocumentVersion, PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { createDocumentVersion, documentTitle, ensureDocumentVersionFile, type DocumentPayload, verifyDocumentFile } from "./documents.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";
import { newPublicPhotoKey } from "./photo-keys.js";
import { syncLinkedObservationStatus } from "./observation-work.js";
import { recordActivity } from "./activity.js";
import { notifyWorkWatchers } from "./max/notifications.js";
import { documentStatusTitle, issueWord, workLabel } from "./max/bot-copy.js";

type Context = { db: PrismaClient; userId: number; isAdmin: boolean };
const err = { type: "object", properties: { message: { type: "string" }, code: { type: "string" }, maxUserId: { type: "string" } }, required: ["message"] } as const;
const id = { type: "integer", minimum: 1 } as const;
const params = (name: string) => ({ type: "object", required: [name], properties: { [name]: id } });
const mediaIds = { type: "array", uniqueItems: true, maxItems: 20, items: id } as const;
const answerMediaIds = { ...mediaIds, maxItems: 5 } as const;
const secured = { security: [{ maxInitData: [] }] };
const str = { type: "string" } as const;
const response = { 400: err, 403: err, 404: err, 409: err };
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = { ...dateTime, nullable: true } as const;
const nullableString = { type: "string", nullable: true } as const;
const mediaSchema = { type: "object", additionalProperties: false, required: ["id", "url"], properties: { id, url: str } } as const;
const mediaListSchema = { type: "array", items: mediaSchema } as const;
const executorSchema = { type: "object", additionalProperties: false, nullable: true, required: ["userId", "companyName", "representativeName"], properties: { userId: id, companyName: str, representativeName: nullableString } } as const;
const workRefSchema = { type: "object", additionalProperties: false, required: ["id", "title", "houseId", "category", "executor"], properties: { id, title: str, houseId: id, category: str, executor: executorSchema } } as const;
function workRef(work: { id: number; title: string; houseId: number; category: string; executorUserId: number | null; executorName: string | null; representativeName: string | null }) { return { id: work.id, title: work.title, houseId: work.houseId, category: work.category, executor: work.executorUserId && work.executorName ? { userId: work.executorUserId, companyName: work.executorName, representativeName: work.representativeName } : null }; }
const actionsSchema = (names: string[]) => ({ type: "object", additionalProperties: false, required: names, properties: Object.fromEntries(names.map((name) => [name, { type: "boolean" }])) });
const listSchema = (item: Record<string, unknown>, paginated = false) => ({ type: "object", additionalProperties: false, required: paginated ? ["items", "page", "limit", "total"] : ["items"], properties: { items: { type: "array", items: item }, ...(paginated ? { page: id, limit: id, total: { type: "integer", minimum: 0 } } : {}) } });
const pageQuery = { page: { type: "integer", minimum: 1, default: 1 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } } as const;
const pageOf = (query: { page?: number; limit?: number }) => { const page = query.page ?? 1, limit = query.limit ?? 20; return { page, limit, skip: (page - 1) * limit }; };
const checklistRules = { allowedResults: ["PASS", "FAIL"], commentAllowed: true, maxCommentLength: 512, photosAllowed: true, maxPhotos: 5, evidenceRequiredOnFail: true };
const rulesSchema = { type: "object", additionalProperties: false, required: ["allowedResults", "commentAllowed", "maxCommentLength", "photosAllowed", "maxPhotos", "evidenceRequiredOnFail"], properties: { allowedResults: { type: "array", items: { type: "string", enum: ["PASS", "FAIL"] } }, commentAllowed: { type: "boolean" }, maxCommentLength: { type: "integer" }, photosAllowed: { type: "boolean" }, maxPhotos: { type: "integer" }, evidenceRequiredOnFail: { type: "boolean" } } };
const templateItemSchema = { type: "object", additionalProperties: false, required: ["id", "order", "title", "description", "method", "sourceType", "sourceLabel", "rules"], properties: { id, order: id, title: str, description: nullableString, method: str, sourceType: str, sourceLabel: nullableString, rules: rulesSchema } };
const templateSchema = { type: "object", additionalProperties: false, required: ["id", "code", "title", "category", "version", "active", "items"], properties: { id, code: str, title: str, category: str, version: id, active: { type: "boolean" }, items: { type: "array", items: templateItemSchema } } };
const assignmentSummarySchema = { type: "object", additionalProperties: false, required: ["id", "status", "work", "inspectionId"], properties: { id, status: str, work: workRefSchema, inspectionId: id } };
const answerSchema = { type: "object", additionalProperties: false, required: ["result", "comment", "media"], properties: { result: str, comment: nullableString, media: mediaListSchema } };
const checklistSnapshotSchema = { type: "object", additionalProperties: false, required: ["id", "order", "title", "description", "method", "sourceType", "sourceLabel", "rules", "answer"], properties: { ...templateItemSchema.properties, answer: answerSchema } };
const assignmentDetailSchema = { type: "object", additionalProperties: false, required: ["id", "status", "work", "inspection", "checklist", "actions"], properties: { id, status: str, work: { type: "object", additionalProperties: false, required: ["id", "title", "executor"], properties: { id, title: str, executor: executorSchema } }, inspection: { type: "object", additionalProperties: false, required: ["id", "templateVersion"], properties: { id, templateVersion: id } }, checklist: { type: "array", items: checklistSnapshotSchema }, actions: actionsSchema(["save", "complete"]) } };
const issueSchema = { type: "object", additionalProperties: false, required: ["id", "workId", "title", "description", "status", "createdAt", "resolvedAt", "before", "checklistItem", "evidence", "actions", "work", "remediations", "reinspections"], properties: { id, workId: id, title: str, description: str, status: str, createdAt: dateTime, resolvedAt: nullableDateTime, before: mediaListSchema, checklistItem: { type: "object", additionalProperties: false, required: ["id", "order", "title", "description"], properties: { id, order: id, title: str, description: nullableString } }, evidence: { type: "object", additionalProperties: false, required: ["comment", "photos"], properties: { comment: nullableString, photos: mediaListSchema } }, actions: actionsSchema(["submitRemediation"]), remediations: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "comment", "createdAt", "after"], properties: { id, comment: str, createdAt: dateTime, after: mediaListSchema } } }, reinspections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "status", "result", "comment", "createdAt", "completedAt"], properties: { id, status: str, result: nullableString, comment: nullableString, createdAt: dateTime, completedAt: nullableDateTime } } }, work: workRefSchema } };
const reinspectionSummarySchema = { type: "object", additionalProperties: false, required: ["id", "status", "issueId", "work"], properties: { id, status: str, issueId: id, work: workRefSchema } };
const reinspectionDetailSchema = { type: "object", additionalProperties: false, required: ["id", "status", "result", "comment", "media", "issue", "remediation", "actions"], properties: { id, status: str, result: nullableString, comment: nullableString, media: mediaListSchema, issue: { type: "object", additionalProperties: false, required: ["id", "title", "description", "before"], properties: { id, title: str, description: str, before: mediaListSchema } }, remediation: { type: "object", additionalProperties: false, required: ["id", "comment", "after"], properties: { id, comment: str, after: mediaListSchema } }, actions: actionsSchema(["complete"]) } };
const remediationCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "reinspectionId"], properties: { id, reinspectionId: id } };
const documentCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "version", "status", "fileUrl"], properties: { id, version: id, status: str, fileUrl: str } };
const documentConfirmedSchema = { type: "object", additionalProperties: false, required: ["status"], properties: { status: str, confirmations: id, version: id, fileUrl: str } };

function fail(reply: FastifyReply, code: number, message: string) { return reply.code(code).send({ message }); }
function context(request: FastifyRequest) { return request.business as Context; }
function numberParam(request: FastifyRequest, name: string): number { return (request.params as Record<string, number>)[name]; }
function body<T>(request: FastifyRequest): T { return request.body as T; }
async function houseRole(ctx: Context, houseId: number) {
  return ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: ctx.userId } } });
}
async function mayChair(ctx: Context, houseId: number) {
  const role = await houseRole(ctx, houseId);
  return role?.status === "ACTIVE" && role.role === "CHAIRMAN";
}
async function isActiveChair(ctx: Context, houseId: number) {
  const role = await houseRole(ctx, houseId);
  return role?.status === "ACTIVE" && role.role === "CHAIRMAN";
}
async function mayWork(ctx: Context, work: { houseId: number; executorUserId: number | null }) {
  const role = await houseRole(ctx, work.houseId);
  return role?.status === "ACTIVE" && (role.role !== "EXECUTOR" || work.executorUserId === ctx.userId);
}
function mediaRef(media: { id: number; publicKey: string | null }) { return { id: media.id, url: `/photo/${media.publicKey}` }; }
type IssueViewInput = {
  id: number; workId: number; title: string; description: string; status: string; createdAt: Date; resolvedAt: Date | null;
  answer: { comment: string | null; checklistItem: { id: number; order: number; title: string; description: string | null }; media: { id: number; publicKey: string | null }[] };
  remediations: { id: number; comment: string; createdAt: Date; media: { id: number; publicKey: string | null }[] }[];
  reinspections: { id: number; status: string; result: string | null; comment: string | null; createdAt: Date; completedAt: Date | null }[];
  work?: { id: number; title: string; houseId: number; category: string; executorUserId: number | null; executorName: string | null; representativeName: string | null };
};
function issueView(issue: IssueViewInput, canRemediate = false) {
  return { id: issue.id, workId: issue.workId, title: issue.title, description: issue.description, status: issue.status, createdAt: issue.createdAt, resolvedAt: issue.resolvedAt,
    before: issue.answer.media.map(mediaRef), checklistItem: issue.answer.checklistItem, evidence: { comment: issue.answer.comment, photos: issue.answer.media.map(mediaRef) }, actions: { submitRemediation: canRemediate && issue.status === "OPEN" }, remediations: issue.remediations.map((item) => ({ id: item.id, comment: item.comment, createdAt: item.createdAt, after: item.media.map(mediaRef) })),
    reinspections: issue.reinspections.map((item) => ({ id: item.id, status: item.status, result: item.result, comment: item.comment, createdAt: item.createdAt, completedAt: item.completedAt })),
    ...(issue.work ? { work: workRef(issue.work) } : {}) };
}

export function workStatusFromIssueStatuses(statuses: readonly ("OPEN" | "REMEDIATION_SUBMITTED" | "RESOLVED")[]) {
  if (statuses.includes("OPEN")) return "IN_PROGRESS";
  if (statuses.includes("REMEDIATION_SUBMITTED")) return "WAITING";
  return "WAITING";
}

async function updateWorkStatusFromIssues(tx: Prisma.TransactionClient, workId: number) {
  const issues = await tx.issue.findMany({ where: { workId }, select: { status: true } });
  const status = workStatusFromIssueStatuses(issues.map((issue) => issue.status));
  await tx.work.update({ where: { id: workId }, data: { status } });
  await syncLinkedObservationStatus(tx, workId, status);
}

async function attachNewMedia(db: PrismaClient, userId: number, ids: number[], target: { inspectionAnswerId?: number; remediationId?: number; reinspectionId?: number }) {
  if (!ids.length) return;
  const items = await db.media.findMany({ where: { id: { in: ids }, ownerUserId: userId, temporary: true, expiresAt: { gt: new Date() } } });
  if (items.length !== ids.length) throw new Error("INVALID_MEDIA");
  for (const item of items) {
    const updated = await db.media.updateMany({ where: { id: item.id, ownerUserId: userId, temporary: true, expiresAt: { gt: new Date() } }, data: { ...target, temporary: false, expiresAt: null, publicKey: item.publicKey ?? newPublicPhotoKey() } });
    if (updated.count !== 1) throw new Error("INVALID_MEDIA");
  }
}

async function snapshotForWork(db: PrismaClient, workId: number, type: DocumentType, userId: number, extra: Record<string, unknown> = {}): Promise<DocumentPayload> {
  const work = await db.work.findUniqueOrThrow({ where: { id: workId }, include: { house: true, executor: true } });
  const creator = await db.user.findUniqueOrThrow({ where: { id: userId } });
  const base: DocumentPayload = {
    house: work.house.address, work: work.title, description: work.description,
    executor: work.executorName ?? (work.executor ? `${work.executor.firstName} ${work.executor.lastName}` : "Не указан"),
    createdAt: new Date().toISOString(), rows: [], summary: "",
    actor: { name: `${creator.firstName} ${creator.lastName}`.trim(), role: type === "ACCEPTANCE_ACT" ? "EXECUTOR" : type === "REASONED_REFUSAL" ? "CHAIRMAN" : "COUNCIL_MEMBER", at: new Date().toISOString() },
  };
  const mediaPath = (media: { blob: { storagePath: string } }) => join(process.env.MEDIA_DIR ?? "/app/data/media", media.blob.storagePath);
  if (type === "INSPECTION_REPORT") {
    const inspection = await db.inspection.findUniqueOrThrow({ where: { id: Number(extra.inspectionId) }, include: { items: { orderBy: { order: "asc" } }, assignments: { include: { assignee: true, answers: { include: { media: { orderBy: { id: "asc" }, include: { blob: true } } } } } } } });
    const assignment = inspection.assignments.find((item) => item.status === "COMPLETED") ?? inspection.assignments[0];
    if (!assignment) throw new Error("Inspection has no assignee");
    base.actor = { name: `${assignment.assignee.firstName} ${assignment.assignee.lastName}`.trim(), role: "COUNCIL_MEMBER", at: (assignment.completedAt ?? new Date()).toISOString() };
    base.checklist = inspection.items.map((item) => { const answer = assignment.answers.find((entry) => entry.checklistItemId === item.id); return { order: item.order, title: item.title, method: item.method, result: answer?.result ?? "PENDING", comment: answer?.comment ?? null }; });
    const failures = assignment.answers.filter((answer) => answer.result === "FAIL");
    base.issues = failures.map((answer) => ({ title: inspection.items.find((item) => item.id === answer.checklistItemId)?.title ?? "Замечание", comment: answer.comment ?? "", checkedAt: base.actor!.at }));
    base.summary = failures.length ? `Выявлено замечаний: ${failures.length}. Требуется устранение замечаний.` : "Замечаний не выявлено. Проверка успешно завершена.";
    base.photoGroups = inspection.items.flatMap((item) => assignment.answers.filter((answer) => answer.checklistItemId === item.id && answer.media.length).map((answer) => ({ title: `Пункт ${item.order}. ${item.title}${answer.comment ? ` — ${answer.comment}` : ""}`, photos: answer.media.map(mediaPath) })));
  } else if (type === "REINSPECTION_REPORT") {
    const item = await db.reinspection.findUniqueOrThrow({ where: { id: Number(extra.reinspectionId) }, include: { issue: { include: { answer: { include: { media: { orderBy: { id: "asc" }, include: { blob: true } } } } } }, remediation: { include: { media: { orderBy: { id: "asc" }, include: { blob: true } } } }, media: { orderBy: { id: "asc" }, include: { blob: true } }, assignee: true } });
    base.actor = { name: `${item.assignee.firstName} ${item.assignee.lastName}`.trim(), role: "COUNCIL_MEMBER", at: (item.completedAt ?? new Date()).toISOString() };
    base.rows = [{ label: "Исходное замечание", value: `${item.issue.title}: ${item.issue.description}` }, { label: "Устранение", value: item.remediation.comment }];
    base.summary = `${item.result === "RESOLVED" ? "Замечание устранено" : "Замечание не устранено"}${item.comment ? `. ${item.comment}` : ""}.`;
    base.photoGroups = [
      { title: "ИСХОДНОЕ ЗАМЕЧАНИЕ", photos: item.issue.answer.media.map(mediaPath) },
      { title: "ПОСЛЕ УСТРАНЕНИЯ ИСПОЛНИТЕЛЕМ", photos: item.remediation.media.map(mediaPath) },
      { title: "КОНТРОЛЬНЫЕ ФОТОГРАФИИ", photos: item.media.map(mediaPath) },
    ];
  } else if (type === "REASONED_REFUSAL") {
    const issues = await db.issue.findMany({ where: { workId, status: { not: "RESOLVED" } }, include: { answer: { include: { assignment: true, media: { orderBy: { id: "asc" }, include: { blob: true } } } } }, orderBy: { id: "asc" } });
    base.issues = issues.map((issue) => ({ title: issue.title, comment: issue.description, checkedAt: (issue.answer.assignment.completedAt ?? issue.createdAt).toISOString() }));
    base.summary = "Отказ от приёмки основан на перечисленных неустранённых замечаниях.";
    const paths = issues.flatMap((issue) => issue.answer.media.map(mediaPath));
    if (paths.length) base.photoGroups = [{ title: "ФОТОМАТЕРИАЛЫ", photos: paths }];
  } else {
    const inspection = await db.inspection.findFirst({ where: { workId }, include: { items: true, assignments: { include: { answers: true } } }, orderBy: { id: "desc" } });
    const issues = await db.issue.findMany({ where: { workId }, select: { id: true, title: true, status: true }, orderBy: { id: "asc" } });
    base.rows = [{ label: "Категория", value: work.category }, { label: "Представитель исполнителя", value: work.representativeName ?? "" }, { label: "Проверено пунктов", value: String(inspection?.items.length ?? 0) }, { label: "Замечаний устранено", value: String(issues.filter((item) => item.status === "RESOLVED").length) }];
    base.summary = issues.length ? `Все ${issues.length} замечаний устранены.` : "Замечаний по результатам проверки нет.";
  }
  return base;
}

async function generate(db: PrismaClient, workId: number, type: DocumentType, userId: number, botName: string, extra: Record<string, unknown> = {}) {
  const options = { inspectionId: type === "INSPECTION_REPORT" ? Number(extra.inspectionId) : undefined, reinspectionId: type === "REINSPECTION_REPORT" ? Number(extra.reinspectionId) : undefined };
  const created = await createDocumentVersion(db, workId, type, userId, await snapshotForWork(db, workId, type, userId, extra), botName, options);
  const work = await db.work.findUniqueOrThrow({ where: { id: workId }, select: { houseId: true, sourceObservationId: true } });
  await recordActivity(db, { event: "DOCUMENT_GENERATED", subjectType: "DOCUMENT", subjectId: created.documentId, houseId: work.houseId, workId, observationId: work.sourceObservationId ?? undefined, actorUserId: userId, metadata: { type, version: created.version } });
  return created;
}

async function ensureInspectionReport(db: PrismaClient, inspectionId: number, userId: number, botName: string) {
  const inspection = await db.inspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { assignments: true } });
  if (!inspection.assignments.length || inspection.assignments.some((item) => item.status !== "COMPLETED")) return;
  const document = await db.document.findUnique({ where: { inspectionId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (document?.versions[0]) return ensureDocumentVersionFile(db, document.id, "INSPECTION_REPORT", document.versions[0], botName);
  return generate(db, inspection.workId, "INSPECTION_REPORT", userId, botName, { inspectionId });
}

async function ensureReinspectionReport(db: PrismaClient, reinspectionId: number, userId: number, botName: string) {
  const reinspection = await db.reinspection.findUniqueOrThrow({ where: { id: reinspectionId }, include: { issue: true } });
  if (reinspection.status !== "COMPLETED") return;
  const document = await db.document.findUnique({ where: { reinspectionId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (document?.versions[0]) return ensureDocumentVersionFile(db, document.id, "REINSPECTION_REPORT", document.versions[0], botName);
  return generate(db, reinspection.issue.workId, "REINSPECTION_REPORT", userId, botName, { reinspectionId });
}

async function ensureAcceptanceAct(db: PrismaClient, workId: number, botName: string) {
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
    const work = await tx.work.findUniqueOrThrow({ where: { id: workId } });
    if (work.status !== "WAITING" || !work.executorUserId || await tx.issue.count({ where: { workId, status: { not: "RESOLVED" } } }) || !await tx.inspectionAssignment.count({ where: { inspection: { workId }, status: "COMPLETED" } })) return null;
    const existing = await tx.document.findFirst({ where: { workId, type: "ACCEPTANCE_ACT" } });
    if (existing) return existing;
    return generate(tx as PrismaClient, workId, "ACCEPTANCE_ACT", work.executorUserId, botName);
  }, { timeout: 15_000 });
}

async function acceptedAcceptanceActId(db: PrismaClient, workId: number) {
  const event = await db.workHistory.findFirst({ where: { workId, event: "ACCEPTANCE_CONFIRMED" }, orderBy: { id: "desc" } });
  const recordedId = event?.details?.match(/Документ №(\d+)/)?.[1];
  if (recordedId) return Number(recordedId);
  const confirmed = await db.document.findMany({ where: { workId, type: "ACCEPTANCE_ACT", versions: { some: { status: "CONFIRMED" } } }, select: { id: true }, take: 2 });
  return confirmed.length === 1 ? confirmed[0].id : null;
}

async function finalizeAcceptanceActIfReady(db: PrismaClient, documentId: number, now: () => Date, botName: string, previewRequired = false) {
  const document = await db.document.findUniqueOrThrow({ where: { id: documentId }, include: { work: true, versions: { orderBy: { version: "asc" }, include: { confirmations: { orderBy: { confirmedAt: "asc" } } } } } });
  if (document.type !== "ACCEPTANCE_ACT") throw new Error("Document is not an acceptance act");
  const original = document.versions[0];
  if (!original) throw new Error("Acceptance act has no initial version");
  if (document.work.status === "ACCEPTED") {
    if (await acceptedAcceptanceActId(db, document.workId) !== documentId) return { status: "CONFLICT" };
    const confirmed = document.versions.findLast((item) => item.status === "CONFIRMED");
    if (!confirmed) return { status: "CONFLICT" };
    const ready = await ensureDocumentVersionFile(db, document.id, document.type, confirmed, botName);
    return { status: "CONFIRMED", version: ready.version, fileUrl: `/doc/${ready.publicKey}.pdf` };
  }
  const confirmations = original.confirmations;
  const executor = confirmations.find((item) => item.roleSnapshot === "EXECUTOR");
  const representative = confirmations.find((item) => item.roleSnapshot === "CHAIRMAN");
  if (!executor || !representative) return { status: "FINAL", confirmations: confirmations.length };

  const existingFinal = document.versions.find((item) => item.version > original.version && item.status === "CONFIRMED")
    ?? document.versions.find((item) => item.version > original.version);
  let finalVersion: DocumentVersion;
  if (existingFinal) finalVersion = existingFinal;
  else {
    const people = await db.user.findMany({ where: { id: { in: confirmations.map((item) => item.userId) } }, select: { id: true, firstName: true, lastName: true } });
    const oldPayload = original.payloadJson as unknown as DocumentPayload;
    const payload: DocumentPayload = { ...oldPayload, confirmations: confirmations.map((item) => { const person = people.find((entry) => entry.id === item.userId); return { name: person ? `${person.firstName} ${person.lastName}` : `Пользователь ${item.userId}`, role: item.roleSnapshot, at: item.confirmedAt.toISOString() }; }) };
    finalVersion = await createDocumentVersion(db, document.workId, document.type, representative.userId, payload, botName, { documentId });
  }
  const readyVersion = await ensureDocumentVersionFile(db, document.id, document.type, finalVersion, botName);
  const finalized = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM Work WHERE id = ${document.workId} FOR UPDATE`;
    const currentWork = await tx.work.findUniqueOrThrow({ where: { id: document.workId } });
    if (currentWork.status === "ACCEPTED") {
      if (await acceptedAcceptanceActId(tx as PrismaClient, document.workId) !== documentId) return false;
    } else if (currentWork.status !== "WAITING" || await tx.issue.count({ where: { workId: document.workId, status: { not: "RESOLVED" } } })) return false;
    await tx.documentVersion.updateMany({ where: { id: readyVersion.id, status: { not: "CONFIRMED" } }, data: { status: "CONFIRMED", confirmedAt: now() } });
    await tx.documentVersion.updateMany({ where: { id: original.id, status: { not: "SUPERSEDED" } }, data: { status: "SUPERSEDED" } });
    for (const item of confirmations) await tx.documentConfirmation.upsert({ where: { documentVersionId_roleSnapshot: { documentVersionId: readyVersion.id, roleSnapshot: item.roleSnapshot } }, create: { documentVersionId: readyVersion.id, userId: item.userId, roleSnapshot: item.roleSnapshot, confirmedAt: item.confirmedAt }, update: {} });
    const accepted = await tx.work.updateMany({ where: { id: document.workId, status: { not: "ACCEPTED" } }, data: { status: "ACCEPTED", completedAt: now() } });
    if (accepted.count) await syncLinkedObservationStatus(tx, document.workId, "ACCEPTED");
    if (accepted.count) {
      await tx.workHistory.create({ data: { workId: document.workId, event: "ACCEPTANCE_CONFIRMED", details: `Документ №${document.id}, версия ${readyVersion.version}` } });
      await recordActivity(tx, { event: "WORK_ACCEPTED", subjectType: "WORK", subjectId: document.workId, houseId: currentWork.houseId, workId: document.workId, observationId: currentWork.sourceObservationId ?? undefined, actorUserId: representative.userId, metadata: { documentId } });
      await notifyWorkWatchers(tx, botName, document.workId, "accepted", `✅ Обращение ${workLabel(currentWork)} принято. Акт приёмки приложен.`, { previewRequired, pdfPublicKey: readyVersion.publicKey });
    }
    return true;
  });
  if (!finalized) return { status: "CONFLICT" };
  return { status: "CONFIRMED", version: readyVersion.version, fileUrl: `/doc/${readyVersion.publicKey}.pdf` };
}

export async function registerWorkflowApi(app: FastifyInstance, config: AppConfig, users: UserRepository, now: () => Date, businessDb?: PrismaClient) {
  const db = businessDb ?? (users instanceof PrismaUserRepository ? users.prisma : null);
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now, { required: !!config.previewAccessRequired, db });
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    await auth.call(app, request, reply, () => undefined);
    if (reply.sent) return;
    if (!db) return fail(reply, 503, "База данных недоступна");
    const identity = await users.upsertFromMax({ user: request.maxInitData!.user, authDate: request.maxInitData!.authDate, seenAt: now() });
    request.business = { db, userId: identity.id, isAdmin: identity.isAdmin };
  };
  const guarded = { preHandler: authenticate };

  app.get("/api/checklist-templates", { ...guarded, schema: { tags: ["Inspections"], ...secured, querystring: { type: "object", properties: { category: str } }, response: { 200: listSchema(templateSchema) } } }, async (request, reply) => {
    const ctx = context(request);
    if (!ctx.isAdmin && !await ctx.db.houseMembership.findFirst({ where: { userId: ctx.userId, status: "ACTIVE", role: { in: ["CHAIRMAN", "COUNCIL_MEMBER"] } } })) return fail(reply, 403, "Нет доступа к шаблонам");
    const { category } = request.query as { category?: string };
    const templates = await ctx.db.checklistTemplate.findMany({ where: { active: true, ...(category ? { category } : {}) }, include: { items: { orderBy: { order: "asc" } } }, orderBy: { title: "asc" } });
    return { items: templates.map((template) => ({ ...template, items: template.items.map((item) => ({ ...item, rules: checklistRules })) })) };
  });

  app.get("/api/houses/:houseId/members", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("houseId"), querystring: { type: "object", required: ["role"], properties: { role: { type: "string", enum: ["COUNCIL_MEMBER", "EXECUTOR"] } } }, response: { 200: listSchema({ type: "object", additionalProperties: false, required: ["id", "name", "executorCompanyName"], properties: { id, name: str, executorCompanyName: nullableString } }), ...response } } }, async (request, reply) => {
    const ctx = context(request), houseId = numberParam(request, "houseId");
    if (!await mayChair(ctx, houseId)) return fail(reply, 403, "Нет права выбирать проверяющих");
    const requestedRole = (request.query as { role: "COUNCIL_MEMBER" | "EXECUTOR" }).role;
    const members = await ctx.db.houseMembership.findMany({ where: { houseId, role: requestedRole, status: "ACTIVE" }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
    const items = members.filter((member) => requestedRole !== "EXECUTOR" || member.executorCompanyName?.trim()).map(({ user, executorCompanyName }) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), executorCompanyName }));
    const self = await houseRole(ctx, houseId);
    if (config.allowSelfRoleSwitch === true && self?.status === "ACTIVE" && self.role === "CHAIRMAN" && (requestedRole === "COUNCIL_MEMBER" || self.executorCompanyName?.trim())) {
      const user = await ctx.db.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { id: true, firstName: true, lastName: true } });
      items.push({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim(), executorCompanyName: self.executorCompanyName });
    }
    return { items };
  });

  app.post("/api/works/:workId/inspections", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("workId"), body: { type: "object", additionalProperties: false, required: ["checklistTemplateId", "assigneeUserId"], properties: { checklistTemplateId: id, assigneeUserId: id } }, response: { 201: { type: "object", additionalProperties: false, properties: { id }, required: ["id"] }, ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId");
    const input = body<{ checklistTemplateId: number; assigneeUserId: number }>(request);
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work) return fail(reply, 404, "Работа не найдена");
    if (!await mayChair(ctx, work.houseId)) return fail(reply, 403, "Нет права назначать проверку");
    if (work.status !== "NEW" || !work.submittedForInspectionAt) return fail(reply, 409, "Работа ещё не передана на проверку или проверка уже назначена");
    const template = await ctx.db.checklistTemplate.findUnique({ where: { id: input.checklistTemplateId }, include: { items: { orderBy: { order: "asc" } } } });
    if (!template?.active || !template.items.length) return fail(reply, 400, "Шаблон недоступен");
    if (template.category !== work.category) return fail(reply, 400, "Категория чек-листа не совпадает с категорией работы");
    const assignee = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId: work.houseId, userId: input.assigneeUserId } } });
    if (assignee?.status !== "ACTIVE" || (assignee.role !== "COUNCIL_MEMBER" && !(config.allowSelfRoleSwitch === true && input.assigneeUserId === ctx.userId && assignee.role === "CHAIRMAN"))) return fail(reply, 400, "Назначать можно только активного члена совета этого дома");
    const created = await ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
      const current = await tx.work.findUniqueOrThrow({ where: { id: workId } });
      if (current.status !== "NEW" || !current.submittedForInspectionAt || current.category !== template.category || await tx.inspection.count({ where: { workId } })) throw new Error("INSPECTION_CONFLICT");
      const inspection = await tx.inspection.create({ data: { workId, checklistTemplateId: template.id, templateVersion: template.version, createdByUserId: ctx.userId, items: { create: template.items.map((item) => ({ order: item.order, title: item.title, description: item.description, method: item.method, sourceType: item.sourceType, sourceLabel: item.sourceLabel, commentRequiredOnFail: item.commentRequiredOnFail, photoRequiredOnFail: item.photoRequiredOnFail })) }, assignments: { create: { assigneeUserId: input.assigneeUserId } } } });
      await tx.work.update({ where: { id: workId }, data: { status: "IN_REVIEW" } });
      await syncLinkedObservationStatus(tx, workId, "IN_REVIEW");
      await tx.workHistory.create({ data: { workId, event: "INSPECTION_ASSIGNED", details: `Проверяющий ${input.assigneeUserId}` } });
      await recordActivity(tx, { event: "INSPECTION_ASSIGNED", subjectType: "WORK", subjectId: workId, houseId: current.houseId, workId, observationId: current.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { assigneeUserId: input.assigneeUserId, inspectionId: inspection.id } });
      await notifyWorkWatchers(tx, config.botName, workId, `inspection_assigned:${inspection.id}`, `По обращению ${workLabel(current)} назначена проверка.`, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: input.assigneeUserId, text: `Вам назначена проверка обращения ${workLabel(current)}. Откройте обращение и заполните чек-лист.` }] });
      return inspection;
    }).catch((cause: unknown) => { if (cause instanceof Error && cause.message === "INSPECTION_CONFLICT") return null; throw cause; });
    if (!created) return fail(reply, 409, "Проверка уже назначена");
    return reply.code(201).send({ id: created.id });
  });

  app.get("/api/me/inspection-assignments", { ...guarded, schema: { tags: ["Inspections"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["ASSIGNED", "IN_PROGRESS", "COMPLETED"] }, ...pageQuery } }, response: { 200: listSchema(assignmentSummarySchema, true), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED"; page?: number; limit?: number };
    const { page, limit, skip } = pageOf(query);
    const where: Prisma.InspectionAssignmentWhereInput = { assigneeUserId: ctx.userId, ...(query.status ? { status: query.status } : {}), ...(query.houseId ? { inspection: { work: { houseId: query.houseId } } } : {}) };
    const [total, items] = await Promise.all([ctx.db.inspectionAssignment.count({ where }), ctx.db.inspectionAssignment.findMany({ where, skip, take: limit, include: { inspection: { include: { work: { select: { id: true, title: true, houseId: true, category: true, executorUserId: true, executorName: true, representativeName: true } } } } }, orderBy: { id: "desc" } })]);
    return { items: items.map((item) => ({ id: item.id, status: item.status, work: workRef(item.inspection.work), inspectionId: item.inspectionId })), page, limit, total };
  });

  const assignment = async (ctx: Context, assignmentId: number, readOnly = false) => {
    const found = await ctx.db.inspectionAssignment.findUnique({ where: { id: assignmentId }, include: { inspection: { include: { work: true, items: { orderBy: { order: "asc" } } } }, answers: { include: { media: true } } } });
    void readOnly;
    if (!found || found.assigneeUserId !== ctx.userId) return null;
    const membership = await houseRole(ctx, found.inspection.work.houseId);
    if (membership?.status !== "ACTIVE" || membership.role !== "COUNCIL_MEMBER") return null;
    return found;
  };

  app.get("/api/inspection-assignments/:assignmentId", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("assignmentId"), response: { 200: assignmentDetailSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await assignment(ctx, numberParam(request, "assignmentId"), true);
    if (!found) return fail(reply, 404, "Проверка не найдена");
    const role = await houseRole(ctx, found.inspection.work.houseId);
    const canAct = found.assigneeUserId === ctx.userId && role?.status === "ACTIVE" && role.role === "COUNCIL_MEMBER" && found.status !== "COMPLETED";
    const ready = found.inspection.items.every((item) => { const answer = found.answers.find((entry) => entry.checklistItemId === item.id); return answer && (answer.result === "PASS" || (answer.result === "FAIL" && (!!answer.comment?.trim() || !!answer.media.length))); });
    return { id: found.id, status: found.status, work: { id: found.inspection.work.id, title: found.inspection.work.title, executor: workRef(found.inspection.work).executor }, inspection: { id: found.inspection.id, templateVersion: found.inspection.templateVersion }, checklist: found.inspection.items.map((item) => { const answer = found.answers.find((entry) => entry.checklistItemId === item.id); return { ...item, rules: checklistRules, answer: { result: answer?.result === "UNABLE_TO_CHECK" ? "PENDING" : answer?.result ?? "PENDING", comment: answer?.comment ?? null, media: answer?.media.map(mediaRef) ?? [] } }; }), actions: { save: canAct, complete: canAct && ready } };
  });

  app.put("/api/inspection-assignments/:assignmentId/answers/:itemId", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: { type: "object", required: ["assignmentId", "itemId"], properties: { assignmentId: id, itemId: id } }, body: { type: "object", additionalProperties: false, required: ["result"], properties: { result: { type: "string", enum: ["PASS", "FAIL"] }, comment: { type: "string", nullable: true, maxLength: 512 }, mediaIds: { ...answerMediaIds, default: [] } } }, response: { 200: { type: "object", additionalProperties: false, required: ["id", "result", "comment", "mediaIds"], properties: { id, result: str, comment: { type: "string", nullable: true }, mediaIds: answerMediaIds } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await assignment(ctx, numberParam(request, "assignmentId"));
    if (!found) return fail(reply, 404, "Проверка не найдена");
    if (found.status === "COMPLETED") return fail(reply, 409, "Проверка завершена");
    const itemId = numberParam(request, "itemId"), item = found.inspection.items.find((entry) => entry.id === itemId);
    if (!item) return fail(reply, 404, "Пункт не найден");
    const input = body<{ result: "PASS" | "FAIL"; comment?: string | null; mediaIds?: number[] }>(request);
    const answerMediaIds = input.mediaIds ?? [];
    const comment = input.comment?.trim() || null;
    if (input.result === "FAIL" && !comment && !answerMediaIds.length) return fail(reply, 400, "Для замечания нужен комментарий или фото");
    try {
      const result = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM InspectionAssignment WHERE id = ${found.id} FOR UPDATE`;
        const current = await tx.inspectionAssignment.findUniqueOrThrow({ where: { id: found.id }, include: { answers: { include: { media: true } } } });
        if (current.status === "COMPLETED") throw new Error("INSPECTION_COMPLETED");
        const old = current.answers.find((answer) => answer.checklistItemId === itemId);
        const existing = new Set(old?.media.map((media) => media.id) ?? []);
        const added = answerMediaIds.filter((mediaId) => !existing.has(mediaId));
        if (old) await tx.media.updateMany({ where: { inspectionAnswerId: old.id, id: { notIn: answerMediaIds } }, data: { inspectionAnswerId: null, temporary: true, expiresAt: new Date(now().getTime() + 12 * 60 * 60 * 1000) } });
        const saved = await tx.inspectionAnswer.upsert({ where: { assignmentId_checklistItemId: { assignmentId: found.id, checklistItemId: itemId } }, create: { assignmentId: found.id, checklistItemId: itemId, result: input.result, comment }, update: { result: input.result, comment } });
        await attachNewMedia(tx as PrismaClient, ctx.userId, added, { inspectionAnswerId: saved.id });
        if (current.status === "ASSIGNED") await tx.inspectionAssignment.update({ where: { id: found.id }, data: { status: "IN_PROGRESS", startedAt: now() } });
        return saved;
      });
      return { id: result.id, result: result.result, comment: result.comment, mediaIds: answerMediaIds };
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); if (error instanceof Error && error.message === "INSPECTION_COMPLETED") return fail(reply, 409, "Проверка завершена"); throw error; }
  });

  app.post("/api/inspection-assignments/:assignmentId/complete", { ...guarded, schema: { tags: ["Inspections"], ...secured, description: "Завершение доступно только после ответа PASS или FAIL на каждый пункт; неотвеченные пункты блокируют завершение с ошибкой 400. Повторный вызов восстанавливает отсутствующий отчёт и возвращает 200.", params: params("assignmentId"), body: { type: "object", additionalProperties: false }, response: { 200: { type: "object", additionalProperties: false, required: ["status"], properties: { status: str } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await ctx.db.inspectionAssignment.findUnique({ where: { id: numberParam(request, "assignmentId") }, include: { inspection: { include: { work: true } } } });
    if (!found) return fail(reply, 404, "Проверка не найдена");
    if (found.assigneeUserId !== ctx.userId) return fail(reply, 404, "Проверка не найдена");
    if (found.status === "COMPLETED") {
      await ensureInspectionReport(ctx.db, found.inspectionId, ctx.userId, config.botName);
      await ensureAcceptanceAct(ctx.db, found.inspection.workId, config.botName);
      return { status: "COMPLETED" };
    }
    const role = await houseRole(ctx, found.inspection.work.houseId);
    if (role?.status !== "ACTIVE" || role.role !== "COUNCIL_MEMBER") return fail(reply, 404, "Проверка не найдена");
    const outcome = await ctx.db.$transaction(async (tx) => {
      // Lock order for workflow writes: Work, then Assignment/Issue, then Reinspection.
      await tx.$queryRaw`SELECT id FROM Work WHERE id = ${found.inspection.workId} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM InspectionAssignment WHERE id = ${found.id} FOR UPDATE`;
      const current = await tx.inspectionAssignment.findUniqueOrThrow({ where: { id: found.id }, include: { answers: { include: { media: true } }, inspection: { include: { items: true } } } });
      if (current.status === "COMPLETED") return "ALREADY_COMPLETED";
      if (current.inspection.items.length !== current.answers.length || current.answers.some((answer) => !["PASS", "FAIL"].includes(answer.result) || (answer.result === "FAIL" && !answer.comment?.trim() && !answer.media.length))) return "INCOMPLETE";
      await tx.inspectionAssignment.update({ where: { id: found.id }, data: { status: "COMPLETED", completedAt: now() } });
      const pending = await tx.inspectionAssignment.count({ where: { inspectionId: found.inspectionId, status: { not: "COMPLETED" } } });
      if (pending) return "COMPLETED";
      const answers = await tx.inspectionAnswer.findMany({ where: { assignment: { inspectionId: found.inspectionId }, result: "FAIL" }, include: { checklistItem: true } });
      for (const answer of answers) {
        const issue = await tx.issue.upsert({ where: { inspectionAnswerId: answer.id }, create: { workId: found.inspection.workId, inspectionAnswerId: answer.id, title: answer.checklistItem.title, description: answer.comment ?? "" }, update: {} });
        await recordActivity(tx, { event: "ISSUE_CREATED", subjectType: "ISSUE", subjectId: issue.id, houseId: found.inspection.work.houseId, workId: found.inspection.workId, observationId: found.inspection.work.sourceObservationId ?? undefined, actorUserId: ctx.userId });
      }
      await updateWorkStatusFromIssues(tx, found.inspection.workId);
      await tx.workHistory.create({ data: { workId: found.inspection.workId, event: "INSPECTION_COMPLETED", details: answers.length ? `${answers.length} замечаний` : "Без замечаний" } });
      await recordActivity(tx, { event: "INSPECTION_COMPLETED", subjectType: "WORK", subjectId: found.inspection.workId, houseId: found.inspection.work.houseId, workId: found.inspection.workId, observationId: found.inspection.work.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { inspectionId: found.inspectionId, issueCount: answers.length } });
      return "FINAL_COMPLETED";
    });
    if (outcome === "INCOMPLETE") return fail(reply, 400, "Заполните все пункты и доказательства");
    const report = await ensureInspectionReport(ctx.db, found.inspectionId, ctx.userId, config.botName);
    await ensureAcceptanceAct(ctx.db, found.inspection.workId, config.botName);
    if (outcome === "FINAL_COMPLETED" && report) {
      const issueCount = await ctx.db.issue.count({ where: { workId: found.inspection.workId, status: { not: "RESOLVED" } } });
      await notifyWorkWatchers(ctx.db, config.botName, found.inspection.workId, `inspection_completed:${found.inspectionId}`, `По обращению ${workLabel(found.inspection.work)} завершена проверка.\n\nОбнаружено ${issueCount} ${issueWord(issueCount)}.`, { previewRequired: config.previewAccessRequired, pdfPublicKey: report.publicKey, actionRecipients: found.inspection.work.executorUserId ? [{ userId: found.inspection.work.executorUserId, text: issueCount ? `Проверка обращения ${workLabel(found.inspection.work)} завершена. Обнаружено ${issueCount} ${issueWord(issueCount)}.\n\nВам необходимо перейти к устранению.` : `Проверка обращения ${workLabel(found.inspection.work)} завершена без замечаний.\n\nАкт приёмки сформирован автоматически. Подтвердите его.` }] : [] });
    }
    return { status: "COMPLETED" };
  });

  app.get("/api/works/:workId/issues", { ...guarded, schema: { tags: ["Issues"], ...secured, params: params("workId"), querystring: { type: "object", properties: pageQuery }, response: { 200: listSchema(issueSchema, true), ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId");
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work || !await mayWork(ctx, work)) return fail(reply, 404, "Работа не найдена");
    const role = await houseRole(ctx, work.houseId);
    if (!ctx.isAdmin && !["CHAIRMAN", "COUNCIL_MEMBER", "EXECUTOR"].includes(role?.role ?? "")) return fail(reply, 403, "Нет доступа к замечаниям");
    const { page, limit, skip } = pageOf(request.query as { page?: number; limit?: number });
    const [total, items] = await Promise.all([ctx.db.issue.count({ where: { workId } }), ctx.db.issue.findMany({ where: { workId }, skip, take: limit, include: { work: { select: { id: true, title: true, houseId: true, category: true, executorUserId: true, executorName: true, representativeName: true } }, answer: { include: { checklistItem: true, media: { orderBy: { id: "asc" } } } }, remediations: { include: { media: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }, reinspections: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } })]);
    return { items: items.map((issue) => issueView(issue, role?.status === "ACTIVE" && role.role === "EXECUTOR" && work.executorUserId === ctx.userId)), page, limit, total };
  });

  app.get("/api/me/issues", { ...guarded, schema: { tags: ["Issues"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["OPEN", "REMEDIATION_SUBMITTED", "RESOLVED"] }, ...pageQuery } }, response: { 200: listSchema(issueSchema, true), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "OPEN" | "REMEDIATION_SUBMITTED" | "RESOLVED"; page?: number; limit?: number };
    const { page, limit, skip } = pageOf(query);
    const where: Prisma.IssueWhereInput = { ...(query.status ? { status: query.status } : {}), work: { AND: [
      query.houseId ? { houseId: query.houseId } : {},
      ctx.isAdmin ? {} : { OR: [
        { executorUserId: ctx.userId, house: { memberships: { some: { userId: ctx.userId, status: "ACTIVE", role: "EXECUTOR" } } } },
        { house: { memberships: { some: { userId: ctx.userId, status: "ACTIVE", role: { in: ["CHAIRMAN", "COUNCIL_MEMBER"] } } } } },
      ] },
    ] } };
    const [total, items] = await Promise.all([ctx.db.issue.count({ where }), ctx.db.issue.findMany({ where, skip, take: limit, include: { work: { select: { id: true, title: true, houseId: true, category: true, executorUserId: true, executorName: true, representativeName: true } }, answer: { include: { checklistItem: true, media: { orderBy: { id: "asc" } } } }, remediations: { include: { media: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }, reinspections: { orderBy: { id: "asc" } } }, orderBy: { id: "desc" } })]);
    const roles = await ctx.db.houseMembership.findMany({ where: { userId: ctx.userId, status: "ACTIVE", role: "EXECUTOR" }, select: { houseId: true } });
    const executorHouses = new Set(roles.map((item) => item.houseId));
    return { items: items.map((issue) => issueView(issue, executorHouses.has(issue.work.houseId) && issue.work.executorUserId === ctx.userId)), page, limit, total };
  });

  app.post("/api/issues/:issueId/remediations", { ...guarded, schema: { tags: ["Issues"], ...secured, params: params("issueId"), body: { type: "object", additionalProperties: false, required: ["comment", "mediaIds"], properties: { comment: { type: "string", minLength: 1, maxLength: 10000 }, mediaIds: { ...mediaIds, minItems: 1 } } }, response: { 201: remediationCreatedSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), issueId = numberParam(request, "issueId"), input = body<{ comment: string; mediaIds: number[] }>(request);
    if (!input.comment.trim()) return fail(reply, 400, "Комментарий обязателен");
    const issue = await ctx.db.issue.findUnique({ where: { id: issueId }, include: { work: true, answer: { include: { assignment: true } } } });
    if (!issue || !await mayWork(ctx, issue.work)) return fail(reply, 404, "Замечание не найдено");
    const membership = await houseRole(ctx, issue.work.houseId);
    if (issue.work.executorUserId !== ctx.userId || membership?.role !== "EXECUTOR" || membership.status !== "ACTIVE") return fail(reply, 403, "Только исполнитель работы может устранить замечание");
    if (issue.status !== "OPEN") return fail(reply, 409, "Замечание не ожидает устранения");
    try {
      const created = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${issue.workId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Issue WHERE id = ${issueId} FOR UPDATE`;
        const current = await tx.issue.findUniqueOrThrow({ where: { id: issueId } });
        if (current.status !== "OPEN") throw new Error("REMEDIATION_CONFLICT");
        const remediation = await tx.remediation.create({ data: { issueId, executorUserId: ctx.userId, comment: input.comment.trim() } });
        await attachNewMedia(tx as PrismaClient, ctx.userId, input.mediaIds, { remediationId: remediation.id });
        const reinspection = await tx.reinspection.create({ data: { issueId, remediationId: remediation.id, assigneeUserId: issue.answer.assignment.assigneeUserId } });
        await tx.issue.update({ where: { id: issueId }, data: { status: "REMEDIATION_SUBMITTED" } });
        await updateWorkStatusFromIssues(tx, issue.workId);
        await tx.workHistory.create({ data: { workId: issue.workId, event: "REMEDIATION_SUBMITTED", details: input.comment.trim() } });
        await recordActivity(tx, { event: "REMEDIATION_SUBMITTED", subjectType: "ISSUE", subjectId: issueId, houseId: issue.work.houseId, workId: issue.workId, observationId: issue.work.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { remediationId: remediation.id, reinspectionId: reinspection.id } });
        await notifyWorkWatchers(tx, config.botName, issue.workId, `remediation:${remediation.id}`, `По обращению ${workLabel(issue.work)} отправлено устранение замечания.`, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: reinspection.assigneeUserId, text: `По обращению ${workLabel(issue.work)} отправлено устранение. Вам назначена повторная проверка.` }] });
        return { remediation, reinspection };
      });
      return reply.code(201).send({ id: created.remediation.id, reinspectionId: created.reinspection.id });
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); if (error instanceof Error && error.message === "REMEDIATION_CONFLICT") return fail(reply, 409, "Замечание не ожидает устранения"); throw error; }
  });

  app.get("/api/me/reinspections", { ...guarded, schema: { tags: ["Reinspections"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["ASSIGNED", "COMPLETED"] }, ...pageQuery } }, response: { 200: listSchema(reinspectionSummarySchema, true), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "ASSIGNED" | "COMPLETED"; page?: number; limit?: number };
    const { page, limit, skip } = pageOf(query);
    const where: Prisma.ReinspectionWhereInput = { assigneeUserId: ctx.userId, ...(query.status ? { status: query.status } : {}), ...(query.houseId ? { issue: { work: { houseId: query.houseId } } } : {}) };
    const [total, items] = await Promise.all([ctx.db.reinspection.count({ where }), ctx.db.reinspection.findMany({ where, skip, take: limit, include: { issue: { include: { work: { select: { id: true, title: true, houseId: true, category: true, executorUserId: true, executorName: true, representativeName: true } } } } }, orderBy: { id: "desc" } })]);
    return { items: items.map((item) => ({ id: item.id, status: item.status, issueId: item.issueId, work: workRef(item.issue.work) })), page, limit, total };
  });

  const reinspection = async (ctx: Context, reinspectionId: number, readOnly = false) => {
    const found = await ctx.db.reinspection.findUnique({ where: { id: reinspectionId }, include: { issue: { include: { work: true, answer: { include: { media: true } } } }, remediation: { include: { media: true } }, media: true } });
    void readOnly;
    if (!found || found.assigneeUserId !== ctx.userId) return null;
    const membership = await houseRole(ctx, found.issue.work.houseId);
    if (membership?.status !== "ACTIVE" || membership.role !== "COUNCIL_MEMBER") return null;
    return found;
  };

  app.get("/api/reinspections/:reinspectionId", { ...guarded, schema: { tags: ["Reinspections"], ...secured, params: params("reinspectionId"), response: { 200: reinspectionDetailSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await reinspection(ctx, numberParam(request, "reinspectionId"), true);
    if (!found) return fail(reply, 404, "Повторная проверка не найдена");
    const role = await houseRole(ctx, found.issue.work.houseId);
    return { id: found.id, status: found.status, result: found.result, comment: found.comment, media: found.media.map(mediaRef), issue: { id: found.issue.id, title: found.issue.title, description: found.issue.description, before: found.issue.answer.media.map(mediaRef) }, remediation: { id: found.remediation.id, comment: found.remediation.comment, after: found.remediation.media.map(mediaRef) }, actions: { complete: found.assigneeUserId === ctx.userId && role?.status === "ACTIVE" && role.role === "COUNCIL_MEMBER" && found.status === "ASSIGNED" } };
  });

  app.post("/api/reinspections/:reinspectionId/complete", { ...guarded, schema: { tags: ["Reinspections"], ...secured, description: "Повторное завершение возвращает сохранённый результат и восстанавливает отсутствующий отчёт без изменения замечания.", params: params("reinspectionId"), body: { type: "object", additionalProperties: false, required: ["result"], properties: { result: { type: "string", enum: ["RESOLVED", "NOT_RESOLVED"] }, comment: { type: "string", nullable: true, maxLength: 10000 }, mediaIds } }, response: { 200: { type: "object", additionalProperties: false, required: ["status", "result"], properties: { status: str, result: str } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await ctx.db.reinspection.findUnique({ where: { id: numberParam(request, "reinspectionId") }, include: { issue: { include: { work: true } } } });
    if (!found) return fail(reply, 404, "Повторная проверка не найдена");
    if (found.assigneeUserId !== ctx.userId) return fail(reply, 404, "Повторная проверка не найдена");
    if (found.status === "COMPLETED") {
      await ensureReinspectionReport(ctx.db, found.id, ctx.userId, config.botName);
      await ensureAcceptanceAct(ctx.db, found.issue.workId, config.botName);
      return { status: "COMPLETED", result: found.result };
    }
    const role = await houseRole(ctx, found.issue.work.houseId);
    if (role?.status !== "ACTIVE" || role.role !== "COUNCIL_MEMBER") return fail(reply, 404, "Повторная проверка не найдена");
    const input = body<{ result: "RESOLVED" | "NOT_RESOLVED"; comment?: string | null; mediaIds?: number[] }>(request);
    if (input.result === "NOT_RESOLVED" && !input.comment?.trim()) return fail(reply, 400, "Объясните, что осталось неустранённым");
    try {
      const persisted = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${found.issue.workId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Issue WHERE id = ${found.issueId} FOR UPDATE`;
        await tx.$queryRaw`SELECT id FROM Reinspection WHERE id = ${found.id} FOR UPDATE`;
        const updated = await tx.reinspection.updateMany({ where: { id: found.id, status: "ASSIGNED" }, data: { status: "COMPLETED", result: input.result, comment: input.comment?.trim() || null, completedAt: now() } });
        if (!updated.count) return tx.reinspection.findUniqueOrThrow({ where: { id: found.id } });
        await attachNewMedia(tx as PrismaClient, ctx.userId, input.mediaIds ?? [], { reinspectionId: found.id });
        await tx.issue.update({ where: { id: found.issueId }, data: { status: input.result === "RESOLVED" ? "RESOLVED" : "OPEN", resolvedAt: input.result === "RESOLVED" ? now() : null } });
        await updateWorkStatusFromIssues(tx, found.issue.workId);
        await tx.workHistory.create({ data: { workId: found.issue.workId, event: "REINSPECTION_COMPLETED", details: input.result } });
        await recordActivity(tx, { event: "REINSPECTION_COMPLETED", subjectType: "ISSUE", subjectId: found.issueId, houseId: found.issue.work.houseId, workId: found.issue.workId, observationId: found.issue.work.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { reinspectionId: found.id, result: input.result } });
        return tx.reinspection.findUniqueOrThrow({ where: { id: found.id } });
      });
      const report = await ensureReinspectionReport(ctx.db, found.id, ctx.userId, config.botName);
      await ensureAcceptanceAct(ctx.db, found.issue.workId, config.botName);
      if (report) {
        const remaining = await ctx.db.issue.count({ where: { workId: found.issue.workId, status: { not: "RESOLVED" } } });
        const action = found.issue.work.executorUserId && (input.result === "NOT_RESOLVED" || !remaining) ? [{ userId: found.issue.work.executorUserId, text: input.result === "NOT_RESOLVED" ? `Повторная проверка обращения ${workLabel(found.issue.work)} не подтвердила устранение.\n\nИсправьте замечание и отправьте новое устранение.` : `Все замечания по обращению ${workLabel(found.issue.work)} устранены.\n\nАкт приёмки сформирован автоматически. Подтвердите его.` }] : [];
        await notifyWorkWatchers(ctx.db, config.botName, found.issue.workId, `reinspection:${found.id}`, `По обращению ${workLabel(found.issue.work)} завершена повторная проверка. Результат: ${input.result === "RESOLVED" ? "замечание устранено" : "замечание осталось"}.`, { previewRequired: config.previewAccessRequired, pdfPublicKey: report.publicKey, actionRecipients: action });
      }
      return { status: persisted.status, result: persisted.result };
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); throw error; }
  });

  app.post("/api/works/:workId/documents", { ...guarded, schema: { tags: ["Documents"], ...secured, description: "Для одной работы допускается один акт приёмки и максимум один мотивированный отказ. REASONED_REFUSAL доступен только при наличии OPEN Issue; повторное создание документа возвращает 409.", params: params("workId"), body: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", enum: ["REASONED_REFUSAL", "ACCEPTANCE_ACT"] } } }, response: { 201: documentCreatedSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId"), input = body<{ type: "REASONED_REFUSAL" | "ACCEPTANCE_ACT" }>(request);
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work || !await mayWork(ctx, work)) return fail(reply, 404, "Работа не найдена");
    if (input.type === "REASONED_REFUSAL") {
      if (!await isActiveChair(ctx, work.houseId)) return fail(reply, 403, "Только председатель оформляет отказ");
      let created;
      try {
        created = await ctx.db.$transaction(async (tx) => {
          await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
          if (await tx.document.findFirst({ where: { workId, type: "REASONED_REFUSAL" }, select: { id: true } })) throw new Error("REASONED_REFUSAL_ALREADY_EXISTS");
          if (!await tx.issue.count({ where: { workId, status: "OPEN" } })) throw new Error("NO_OPEN_ISSUES_FOR_REFUSAL");
          const document = await generate(tx as PrismaClient, workId, input.type, ctx.userId, config.botName);
          await tx.documentVersion.update({ where: { id: document.id }, data: { status: "CONFIRMED", confirmedAt: now() } });
          return document;
        }, { timeout: 15_000 });
      } catch (error) {
        if (error instanceof Error && error.message === "REASONED_REFUSAL_ALREADY_EXISTS") return fail(reply, 409, "Мотивированный отказ для этой работы уже сформирован");
        if (error instanceof Error && error.message === "NO_OPEN_ISSUES_FOR_REFUSAL") return fail(reply, 409, "Нет открытых замечаний для мотивированного отказа");
        throw error;
      }
      await notifyWorkWatchers(ctx.db, config.botName, workId, `reasoned_refusal:${created.id}`, `По обращению ${workLabel(work)} оформлен мотивированный отказ. Подробности во вложении.`, { previewRequired: config.previewAccessRequired, pdfPublicKey: created.publicKey, actionRecipients: work.executorUserId ? [{ userId: work.executorUserId, text: `По обращению ${workLabel(work)} оформлен мотивированный отказ. Ознакомьтесь с PDF и устраните замечания.` }] : [] });
      return reply.code(201).send({ id: created.documentId, version: created.version, status: "CONFIRMED", fileUrl: `/doc/${created.publicKey}.pdf` });
    }
    const role = await houseRole(ctx, work.houseId);
    if (!(role?.status === "ACTIVE" && role.role === "EXECUTOR" && work.executorUserId === ctx.userId)) return fail(reply, 403, "Акт оформляет исполнитель работы");
    if (await ctx.db.document.findFirst({ where: { workId, type: "ACCEPTANCE_ACT" }, select: { id: true } })) return fail(reply, 409, "Акт приёмки для этой работы уже сформирован");
    if (work.status !== "WAITING" || await ctx.db.issue.count({ where: { workId, status: { not: "RESOLVED" } } })) return fail(reply, 409, "Работа ещё не прошла проверку");
    if (!await ctx.db.inspectionAssignment.count({ where: { inspection: { workId }, status: "COMPLETED" } })) return fail(reply, 409, "Нет завершённой проверки");
    try {
      const created = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
        if (await tx.document.findFirst({ where: { workId, type: "ACCEPTANCE_ACT" }, select: { id: true } })) throw new Error("ACCEPTANCE_ACT_ALREADY_EXISTS");
        const current = await tx.work.findUniqueOrThrow({ where: { id: workId } });
        if (current.status !== "WAITING" || await tx.issue.count({ where: { workId, status: { not: "RESOLVED" } } })) throw new Error("WORK_NOT_READY");
        return generate(tx as PrismaClient, workId, "ACCEPTANCE_ACT", ctx.userId, config.botName);
      }, { timeout: 15_000 });
      await notifyWorkWatchers(ctx.db, config.botName, workId, `acceptance_ready:${created.id}`, `По обращению ${workLabel(work)} оформлен акт приёмки. Подробности во вложении.`, { previewRequired: config.previewAccessRequired, pdfPublicKey: created.publicKey, actionRecipients: [{ userId: ctx.userId, text: `Акт приёмки по обращению ${workLabel(work)} готов. Подтвердите его, затем председатель сможет завершить приёмку.` }] });
      return reply.code(201).send({ id: created.documentId, version: created.version, status: created.status, fileUrl: `/doc/${created.publicKey}.pdf` });
    } catch (error) {
      if (error instanceof Error && error.message === "ACCEPTANCE_ACT_ALREADY_EXISTS") return fail(reply, 409, "Акт приёмки для этой работы уже сформирован");
      if (error instanceof Error && error.message === "WORK_NOT_READY") return fail(reply, 409, "Работа ещё не прошла проверку");
      throw error;
    }
  });

  app.post("/api/documents/:documentId/confirm", { ...guarded, preValidation: async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length) return fail(reply, 400, "Подтверждение не принимает данные пользователя из body");
  }, schema: { tags: ["Documents"], ...secured, description: "Повторное подтверждение безопасно: незавершённая финализация акта продолжается без повторной записи подтверждения.", params: params("documentId"), body: { type: "object", additionalProperties: false }, response: { 200: documentConfirmedSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), documentId = numberParam(request, "documentId");
    const document = await ctx.db.document.findUnique({ where: { id: documentId }, include: { work: true, versions: { orderBy: { version: "asc" }, take: 1, include: { confirmations: true } } } });
    if (!document || !await mayWork(ctx, document.work)) return fail(reply, 404, "Документ не найден");
    if (document.type !== "ACCEPTANCE_ACT") return fail(reply, 403, "Этот документ не требует отдельного подтверждения");
    const original = document.versions[0];
    if (!original) return fail(reply, 409, "Версия документа недоступна для подтверждения");
    if (document.work.status === "ACCEPTED") {
      if (await acceptedAcceptanceActId(ctx.db, document.workId) !== documentId) return fail(reply, 409, "Эта работа уже принята по другому акту");
      if (!original.confirmations.some((confirmation) => confirmation.userId === ctx.userId)) return fail(reply, 403, "Вы не подтверждали этот акт");
      const result = await finalizeAcceptanceActIfReady(ctx.db, documentId, now, config.botName, config.previewAccessRequired);
      return result.status === "CONFLICT" ? fail(reply, 409, "Эта работа уже принята по другому акту") : result;
    }
    if (original.status === "SUPERSEDED" && original.confirmations.some((item) => item.userId === ctx.userId) && original.confirmations.some((item) => item.roleSnapshot === "EXECUTOR") && original.confirmations.some((item) => item.roleSnapshot === "CHAIRMAN")) {
      return finalizeAcceptanceActIfReady(ctx.db, documentId, now, config.botName, config.previewAccessRequired);
    }
    if (original.status !== "FINAL") return fail(reply, 403, "Подтверждение недоступно");
    const membership = await houseRole(ctx, document.work.houseId);
    const isExecutor = membership?.status === "ACTIVE" && membership.role === "EXECUTOR" && document.work.executorUserId === ctx.userId;
    const isRepresentative = membership?.status === "ACTIVE" && membership.role === "CHAIRMAN";
    if ((isExecutor && original.confirmations.some((item) => item.roleSnapshot === "EXECUTOR" && item.userId === ctx.userId)) || (isRepresentative && original.confirmations.some((item) => item.roleSnapshot === "CHAIRMAN" && item.userId === ctx.userId))) {
      return finalizeAcceptanceActIfReady(ctx.db, documentId, now, config.botName, config.previewAccessRequired);
    }
    let roleSnapshot: string;
    if (isExecutor && !original.confirmations.length) roleSnapshot = "EXECUTOR";
    else if (isRepresentative && original.confirmations.some((confirmation) => confirmation.roleSnapshot === "EXECUTOR")) roleSnapshot = "CHAIRMAN";
    else return fail(reply, 403, "Ожидается подтверждение исполнителя, затем уполномоченного представителя дома");
    await ctx.db.documentConfirmation.upsert({ where: { documentVersionId_roleSnapshot: { documentVersionId: original.id, roleSnapshot } }, create: { documentVersionId: original.id, userId: ctx.userId, roleSnapshot, confirmedAt: now() }, update: {} });
    await recordActivity(ctx.db, { event: "DOCUMENT_CONFIRMED", subjectType: "DOCUMENT", subjectId: documentId, houseId: document.work.houseId, workId: document.workId, observationId: document.work.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { role: roleSnapshot, version: original.version } });
    if (roleSnapshot === "EXECUTOR") {
      const chairmen = await ctx.db.houseMembership.findMany({ where: { houseId: document.work.houseId, role: "CHAIRMAN", status: "ACTIVE" }, select: { userId: true } });
      await notifyWorkWatchers(ctx.db, config.botName, document.workId, `acceptance_executor_confirmed:${documentId}`, `Исполнитель подтвердил акт приёмки по обращению ${workLabel(document.work)}.`, { previewRequired: config.previewAccessRequired, pdfPublicKey: original.publicKey, actionRecipients: chairmen.map((chairman) => ({ userId: chairman.userId, text: `Исполнитель подтвердил акт приёмки по обращению ${workLabel(document.work)}.\n\nТеперь вам нужно подтвердить акт. PDF приложен.` })) });
    }
    const result = await finalizeAcceptanceActIfReady(ctx.db, documentId, now, config.botName, config.previewAccessRequired);
    return result.status === "CONFLICT" ? fail(reply, 409, "Эта работа уже принята по другому акту") : result;
  });

  app.get("/doc/:key.pdf", { schema: { tags: ["Documents"], params: { type: "object", required: ["key"], properties: { key: { type: "string", pattern: "^(?:[a-z0-9]{20}|[a-f0-9]{40})$" } } }, response: { 200: { type: "string", format: "binary" }, 404: err, 409: err, 503: err } } }, async (request, reply) => {
    if (!db) return fail(reply, 503, "База данных недоступна");
    const key = (request.params as { key: string }).key;
    const version = await db.documentVersion.findUnique({ where: { publicKey: key }, include: { document: true } });
    if (!version) return fail(reply, 404, "Документ не найден");
    try {
      const verified = await verifyDocumentFile(version);
      const ready = verified.ok ? version : await ensureDocumentVersionFile(db, version.documentId, version.document.type, version, config.botName);
      const valid = verified.ok ? verified : await verifyDocumentFile(ready);
      if (!valid.ok || !valid.bytes) return fail(reply, 409, "Целостность документа не подтверждена");
      const bytes = valid.bytes;
      return reply.header("Content-Disposition", `inline; filename="document-${key}.pdf"`).header("X-Robots-Tag", "noindex, nofollow, noarchive").type("application/pdf").send(bytes);
    } catch { return fail(reply, 409, "Целостность документа не подтверждена"); }
  });
}

export async function publicDocumentStatus(db: PrismaClient, key: string) {
  const version = await db.documentVersion.findUnique({ where: { publicKey: key }, include: { document: { include: { work: { include: { house: true } } } }, confirmations: { include: { user: true } } } });
  if (!version) return { message: "Документ не найден.", bytes: null };
  const verified = await verifyDocumentFile(version);
  if (!verified.ok) return { message: "Документ найден, но целостность файла не подтверждена.", bytes: null };
  const document = version.document;
  const names = version.confirmations.map((item) => `${item.roleSnapshot === "CHAIRMAN" ? "Председатель" : "Исполнитель"}: ${item.user.firstName} ${item.user.lastName}`).join("; ");
  return { message: `✅ Документ №${document.id} найден\n\n${documentTitle[document.type]}\nДом: ${document.work.house.address}\nОбращение: «${document.work.title}»\nВерсия: ${version.version}\nСформирован: ${version.createdAt.toLocaleString("ru-RU")}\nСтатус: ${documentStatusTitle(version.status)}${document.type === "ACCEPTANCE_ACT" ? `\nПодтвердил: ${names || "ожидает подтверждения"}` : ""}\n\nЦелостность файла: подтверждена 🤝`, bytes: verified.bytes };
}

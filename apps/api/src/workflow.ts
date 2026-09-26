import { randomBytes } from "node:crypto";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";

import type { DocumentType, DocumentVersion, PrismaClient, Prisma } from "../generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { createDocumentVersion, documentRoot, documentTitle, ensureDocumentVersionFile, type DocumentPayload, verifyDocumentFile } from "./documents.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";

type Context = { db: PrismaClient; userId: number; isAdmin: boolean };
const err = { type: "object", properties: { message: { type: "string" } }, required: ["message"] } as const;
const id = { type: "integer", minimum: 1 } as const;
const params = (name: string) => ({ type: "object", required: [name], properties: { [name]: id } });
const mediaIds = { type: "array", uniqueItems: true, maxItems: 20, items: id } as const;
const secured = { security: [{ maxInitData: [] }] };
const str = { type: "string" } as const;
const response = { 400: err, 403: err, 404: err, 409: err };
const dateTime = { type: "string", format: "date-time" } as const;
const nullableDateTime = { ...dateTime, nullable: true } as const;
const nullableString = { type: "string", nullable: true } as const;
const mediaSchema = { type: "object", additionalProperties: false, required: ["id", "url"], properties: { id, url: str } } as const;
const mediaListSchema = { type: "array", items: mediaSchema } as const;
const workRefSchema = { type: "object", additionalProperties: false, required: ["id", "title", "houseId"], properties: { id, title: str, houseId: id } } as const;
const actionsSchema = (names: string[]) => ({ type: "object", additionalProperties: false, required: names, properties: Object.fromEntries(names.map((name) => [name, { type: "boolean" }])) });
const listSchema = (item: Record<string, unknown>) => ({ type: "object", additionalProperties: false, required: ["items"], properties: { items: { type: "array", items: item } } });
const templateItemSchema = { type: "object", additionalProperties: false, required: ["id", "order", "title", "description", "method", "sourceType", "sourceLabel", "commentRequiredOnFail", "photoRequiredOnFail"], properties: { id, order: id, title: str, description: nullableString, method: str, sourceType: str, sourceLabel: nullableString, commentRequiredOnFail: { type: "boolean" }, photoRequiredOnFail: { type: "boolean" } } };
const templateSchema = { type: "object", additionalProperties: false, required: ["id", "code", "title", "category", "version", "active", "items"], properties: { id, code: str, title: str, category: str, version: id, active: { type: "boolean" }, items: { type: "array", items: templateItemSchema } } };
const assignmentSummarySchema = { type: "object", additionalProperties: false, required: ["id", "status", "work", "inspectionId"], properties: { id, status: str, work: workRefSchema, inspectionId: id } };
const answerSchema = { type: "object", additionalProperties: false, required: ["result", "comment", "media"], properties: { result: str, comment: nullableString, media: mediaListSchema } };
const checklistSnapshotSchema = { type: "object", additionalProperties: false, required: ["id", "order", "title", "description", "method", "sourceType", "sourceLabel", "commentRequiredOnFail", "photoRequiredOnFail", "answer"], properties: { ...templateItemSchema.properties, answer: answerSchema } };
const assignmentDetailSchema = { type: "object", additionalProperties: false, required: ["id", "status", "work", "inspection", "checklist", "actions"], properties: { id, status: str, work: { type: "object", additionalProperties: false, required: ["id", "title"], properties: { id, title: str } }, inspection: { type: "object", additionalProperties: false, required: ["id", "templateVersion"], properties: { id, templateVersion: id } }, checklist: { type: "array", items: checklistSnapshotSchema }, actions: actionsSchema(["save", "complete"]) } };
const issueSchema = { type: "object", additionalProperties: false, required: ["id", "workId", "title", "description", "status", "createdAt", "resolvedAt", "before", "remediations", "reinspections"], properties: { id, workId: id, title: str, description: str, status: str, createdAt: dateTime, resolvedAt: nullableDateTime, before: mediaListSchema, remediations: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "comment", "createdAt", "after"], properties: { id, comment: str, createdAt: dateTime, after: mediaListSchema } } }, reinspections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "status", "result", "comment", "createdAt", "completedAt"], properties: { id, status: str, result: nullableString, comment: nullableString, createdAt: dateTime, completedAt: nullableDateTime } } }, work: workRefSchema } };
const reinspectionSummarySchema = { type: "object", additionalProperties: false, required: ["id", "status", "issueId", "work"], properties: { id, status: str, issueId: id, work: workRefSchema } };
const reinspectionDetailSchema = { type: "object", additionalProperties: false, required: ["id", "status", "result", "issue", "remediation", "actions"], properties: { id, status: str, result: nullableString, issue: { type: "object", additionalProperties: false, required: ["id", "title", "description", "before"], properties: { id, title: str, description: str, before: mediaListSchema } }, remediation: { type: "object", additionalProperties: false, required: ["id", "comment", "after"], properties: { id, comment: str, after: mediaListSchema } }, actions: actionsSchema(["complete"]) } };
const remediationCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "reinspectionId"], properties: { id, reinspectionId: id } };
const documentCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "version", "status", "fileUrl"], properties: { id, version: id, status: str, fileUrl: str } };
const documentConfirmedSchema = { type: "object", additionalProperties: false, required: ["status"], properties: { status: str, confirmations: id, version: id, fileUrl: str } };
const botName = () => {
  const value = process.env.MAX_BOT_NAME;
  if (!value) throw new Error("MAX_BOT_NAME is required for document QR");
  return value;
};

function fail(reply: FastifyReply, code: number, message: string) { return reply.code(code).send({ message }); }
function context(request: FastifyRequest) { return request.business as Context; }
function numberParam(request: FastifyRequest, name: string): number { return (request.params as Record<string, number>)[name]; }
function body<T>(request: FastifyRequest): T { return request.body as T; }
async function houseRole(ctx: Context, houseId: number) {
  return ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: ctx.userId } } });
}
async function mayChair(ctx: Context, houseId: number) {
  if (ctx.isAdmin) return true;
  const role = await houseRole(ctx, houseId);
  return role?.status === "ACTIVE" && role.role === "CHAIRMAN";
}
async function isActiveChair(ctx: Context, houseId: number) {
  const role = await houseRole(ctx, houseId);
  return role?.status === "ACTIVE" && role.role === "CHAIRMAN";
}
async function mayWork(ctx: Context, work: { houseId: number; executorUserId: number | null }) {
  if (ctx.isAdmin) return true;
  const role = await houseRole(ctx, work.houseId);
  return role?.status === "ACTIVE" && (role.role !== "EXECUTOR" || work.executorUserId === ctx.userId);
}
function mediaRef(media: { id: number; publicKey: string | null }) { return { id: media.id, url: `/photo/${media.publicKey}` }; }
type IssueViewInput = {
  id: number; workId: number; title: string; description: string; status: string; createdAt: Date; resolvedAt: Date | null;
  answer: { media: { id: number; publicKey: string | null }[] };
  remediations: { id: number; comment: string; createdAt: Date; media: { id: number; publicKey: string | null }[] }[];
  reinspections: { id: number; status: string; result: string | null; comment: string | null; createdAt: Date; completedAt: Date | null }[];
  work?: { id: number; title: string; houseId: number };
};
function issueView(issue: IssueViewInput) {
  return { id: issue.id, workId: issue.workId, title: issue.title, description: issue.description, status: issue.status, createdAt: issue.createdAt, resolvedAt: issue.resolvedAt,
    before: issue.answer.media.map(mediaRef), remediations: issue.remediations.map((item) => ({ id: item.id, comment: item.comment, createdAt: item.createdAt, after: item.media.map(mediaRef) })),
    reinspections: issue.reinspections.map((item) => ({ id: item.id, status: item.status, result: item.result, comment: item.comment, createdAt: item.createdAt, completedAt: item.completedAt })),
    ...(issue.work ? { work: issue.work } : {}) };
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
}

async function attachNewMedia(db: PrismaClient, userId: number, ids: number[], target: { inspectionAnswerId?: number; remediationId?: number; reinspectionId?: number }) {
  if (!ids.length) return;
  const items = await db.media.findMany({ where: { id: { in: ids }, ownerUserId: userId, temporary: true, expiresAt: { gt: new Date() } } });
  if (items.length !== ids.length) throw new Error("INVALID_MEDIA");
  for (const item of items) {
    const updated = await db.media.updateMany({ where: { id: item.id, ownerUserId: userId, temporary: true, expiresAt: { gt: new Date() } }, data: { ...target, temporary: false, expiresAt: null, publicKey: item.publicKey ?? randomBytes(8).toString("hex") } });
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
    const paths = inspection.items.flatMap((item) => assignment.answers.filter((answer) => answer.checklistItemId === item.id).flatMap((answer) => answer.media.map(mediaPath)));
    if (paths.length) base.photoGroups = [{ title: "ФОТОМАТЕРИАЛЫ", photos: paths }];
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
    base.act = Object.fromEntries(Object.entries(extra).map(([key, value]) => [key, String(value ?? "")]));
  }
  return base;
}

async function generate(db: PrismaClient, workId: number, type: DocumentType, userId: number, extra: Record<string, unknown> = {}) {
  const options = { inspectionId: type === "INSPECTION_REPORT" ? Number(extra.inspectionId) : undefined, reinspectionId: type === "REINSPECTION_REPORT" ? Number(extra.reinspectionId) : undefined };
  return createDocumentVersion(db, workId, type, userId, await snapshotForWork(db, workId, type, userId, extra), botName(), options);
}

async function ensureInspectionReport(db: PrismaClient, inspectionId: number, userId: number) {
  const inspection = await db.inspection.findUniqueOrThrow({ where: { id: inspectionId }, include: { assignments: true } });
  if (!inspection.assignments.length || inspection.assignments.some((item) => item.status !== "COMPLETED")) return;
  const document = await db.document.findUnique({ where: { inspectionId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (document?.versions[0]) return ensureDocumentVersionFile(db, document.id, "INSPECTION_REPORT", document.versions[0], botName());
  return generate(db, inspection.workId, "INSPECTION_REPORT", userId, { inspectionId });
}

async function ensureReinspectionReport(db: PrismaClient, reinspectionId: number, userId: number) {
  const reinspection = await db.reinspection.findUniqueOrThrow({ where: { id: reinspectionId }, include: { issue: true } });
  if (reinspection.status !== "COMPLETED") return;
  const document = await db.document.findUnique({ where: { reinspectionId }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
  if (document?.versions[0]) return ensureDocumentVersionFile(db, document.id, "REINSPECTION_REPORT", document.versions[0], botName());
  return generate(db, reinspection.issue.workId, "REINSPECTION_REPORT", userId, { reinspectionId });
}

async function acceptedAcceptanceActId(db: PrismaClient, workId: number) {
  const event = await db.workHistory.findFirst({ where: { workId, event: "ACCEPTANCE_CONFIRMED" }, orderBy: { id: "desc" } });
  const recordedId = event?.details?.match(/Документ №(\d+)/)?.[1];
  if (recordedId) return Number(recordedId);
  const confirmed = await db.document.findMany({ where: { workId, type: "ACCEPTANCE_ACT", versions: { some: { status: "CONFIRMED" } } }, select: { id: true }, take: 2 });
  return confirmed.length === 1 ? confirmed[0].id : null;
}

async function finalizeAcceptanceActIfReady(db: PrismaClient, documentId: number, now: () => Date) {
  const document = await db.document.findUniqueOrThrow({ where: { id: documentId }, include: { work: true, versions: { orderBy: { version: "asc" }, include: { confirmations: { orderBy: { confirmedAt: "asc" } } } } } });
  if (document.type !== "ACCEPTANCE_ACT") throw new Error("Document is not an acceptance act");
  const original = document.versions[0];
  if (!original) throw new Error("Acceptance act has no initial version");
  if (document.work.status === "ACCEPTED") {
    if (await acceptedAcceptanceActId(db, document.workId) !== documentId) return { status: "CONFLICT" };
    const confirmed = document.versions.findLast((item) => item.status === "CONFIRMED");
    if (!confirmed) return { status: "CONFLICT" };
    const ready = await ensureDocumentVersionFile(db, document.id, document.type, confirmed, botName());
    return { status: "CONFIRMED", version: ready.version, fileUrl: `/doc/${ready.publicKey}.pdf` };
  }
  const confirmations = original.confirmations;
  const executor = confirmations.find((item) => item.roleSnapshot === "EXECUTOR");
  const representative = confirmations.find((item) => ["CHAIRMAN", "COUNCIL_MEMBER"].includes(item.roleSnapshot));
  if (!executor || !representative) return { status: "FINAL", confirmations: confirmations.length };

  const existingFinal = document.versions.find((item) => item.version > original.version && item.status === "CONFIRMED")
    ?? document.versions.find((item) => item.version > original.version);
  let finalVersion: DocumentVersion;
  if (existingFinal) finalVersion = existingFinal;
  else {
    const people = await db.user.findMany({ where: { id: { in: confirmations.map((item) => item.userId) } }, select: { id: true, firstName: true, lastName: true } });
    const oldPayload = original.payloadJson as unknown as DocumentPayload;
    const payload: DocumentPayload = { ...oldPayload, confirmations: confirmations.map((item) => { const person = people.find((entry) => entry.id === item.userId); return { name: person ? `${person.firstName} ${person.lastName}` : `Пользователь ${item.userId}`, role: item.roleSnapshot, at: item.confirmedAt.toISOString() }; }) };
    finalVersion = await createDocumentVersion(db, document.workId, document.type, representative.userId, payload, botName(), { documentId });
  }
  const readyVersion = await ensureDocumentVersionFile(db, document.id, document.type, finalVersion, botName());
  await db.$transaction(async (tx) => {
    await tx.documentVersion.updateMany({ where: { id: readyVersion.id, status: { not: "CONFIRMED" } }, data: { status: "CONFIRMED", confirmedAt: now() } });
    await tx.documentVersion.updateMany({ where: { id: original.id, status: { not: "SUPERSEDED" } }, data: { status: "SUPERSEDED" } });
    for (const item of confirmations) await tx.documentConfirmation.upsert({ where: { documentVersionId_userId: { documentVersionId: readyVersion.id, userId: item.userId } }, create: { documentVersionId: readyVersion.id, userId: item.userId, roleSnapshot: item.roleSnapshot, confirmedAt: item.confirmedAt }, update: {} });
    const accepted = await tx.work.updateMany({ where: { id: document.workId, status: { not: "ACCEPTED" } }, data: { status: "ACCEPTED", completedAt: now() } });
    if (accepted.count) await tx.workHistory.create({ data: { workId: document.workId, event: "ACCEPTANCE_CONFIRMED", details: `Документ №${document.id}, версия ${readyVersion.version}` } });
  });
  return { status: "CONFIRMED", version: readyVersion.version, fileUrl: `/doc/${readyVersion.publicKey}.pdf` };
}

export async function registerWorkflowApi(app: FastifyInstance, config: AppConfig, users: UserRepository, now: () => Date, businessDb?: PrismaClient) {
  const db = businessDb ?? (users instanceof PrismaUserRepository ? users.prisma : null);
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now);
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
    return { items: await ctx.db.checklistTemplate.findMany({ where: { active: true, ...(category ? { category } : {}) }, include: { items: { orderBy: { order: "asc" } } }, orderBy: { title: "asc" } }) };
  });

  app.get("/api/houses/:houseId/members", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("houseId"), querystring: { type: "object", required: ["role"], properties: { role: { type: "string", const: "COUNCIL_MEMBER" } } }, response: { 200: listSchema({ type: "object", additionalProperties: false, required: ["id", "name"], properties: { id, name: str } }), ...response } } }, async (request, reply) => {
    const ctx = context(request), houseId = numberParam(request, "houseId");
    if (!await mayChair(ctx, houseId)) return fail(reply, 403, "Нет права выбирать проверяющих");
    const members = await ctx.db.houseMembership.findMany({ where: { houseId, role: "COUNCIL_MEMBER", status: "ACTIVE" }, include: { user: { select: { id: true, firstName: true, lastName: true } } } });
    return { items: members.map(({ user }) => ({ id: user.id, name: `${user.firstName} ${user.lastName}`.trim() })) };
  });

  app.post("/api/works/:workId/inspections", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("workId"), body: { type: "object", additionalProperties: false, required: ["checklistTemplateId", "assigneeUserId"], properties: { checklistTemplateId: id, assigneeUserId: id } }, response: { 201: { type: "object", additionalProperties: false, properties: { id }, required: ["id"] }, ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId");
    const input = body<{ checklistTemplateId: number; assigneeUserId: number }>(request);
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work) return fail(reply, 404, "Работа не найдена");
    if (!await mayChair(ctx, work.houseId)) return fail(reply, 403, "Нет права назначать проверку");
    if (work.status !== "NEW") return fail(reply, 409, "Проверка уже назначена");
    const template = await ctx.db.checklistTemplate.findUnique({ where: { id: input.checklistTemplateId }, include: { items: { orderBy: { order: "asc" } } } });
    if (!template?.active || !template.items.length) return fail(reply, 400, "Шаблон недоступен");
    const assignee = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId: work.houseId, userId: input.assigneeUserId } } });
    if (assignee?.role !== "COUNCIL_MEMBER" || assignee.status !== "ACTIVE") return fail(reply, 400, "Назначать можно только активного члена совета этого дома");
    const created = await ctx.db.$transaction(async (tx) => {
      const inspection = await tx.inspection.create({ data: { workId, checklistTemplateId: template.id, templateVersion: template.version, createdByUserId: ctx.userId, items: { create: template.items.map((item) => ({ order: item.order, title: item.title, description: item.description, method: item.method, sourceType: item.sourceType, sourceLabel: item.sourceLabel, commentRequiredOnFail: item.commentRequiredOnFail, photoRequiredOnFail: item.photoRequiredOnFail })) }, assignments: { create: { assigneeUserId: input.assigneeUserId } } } });
      await tx.work.update({ where: { id: workId }, data: { status: "IN_REVIEW" } });
      await tx.workHistory.create({ data: { workId, event: "INSPECTION_ASSIGNED", details: `Проверяющий ${input.assigneeUserId}` } });
      return inspection;
    });
    return reply.code(201).send({ id: created.id });
  });

  app.get("/api/me/inspection-assignments", { ...guarded, schema: { tags: ["Inspections"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["ASSIGNED", "IN_PROGRESS", "COMPLETED"] } } }, response: { 200: listSchema(assignmentSummarySchema), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" };
    const items = await ctx.db.inspectionAssignment.findMany({ where: { ...(!ctx.isAdmin ? { assigneeUserId: ctx.userId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.houseId ? { inspection: { work: { houseId: query.houseId } } } : {}) }, include: { inspection: { include: { work: { select: { id: true, title: true, houseId: true } } } } }, orderBy: { id: "desc" } });
    return { items: items.map((item) => ({ id: item.id, status: item.status, work: item.inspection.work, inspectionId: item.inspectionId })) };
  });

  const assignment = async (ctx: Context, assignmentId: number, readOnly = false) => {
    const found = await ctx.db.inspectionAssignment.findUnique({ where: { id: assignmentId }, include: { inspection: { include: { work: true, items: { orderBy: { order: "asc" } } } }, answers: { include: { media: true } } } });
    if (readOnly && ctx.isAdmin) return found;
    if (!found || found.assigneeUserId !== ctx.userId) return null;
    const membership = await houseRole(ctx, found.inspection.work.houseId);
    if (membership?.status !== "ACTIVE" || membership.role !== "COUNCIL_MEMBER") return null;
    return found;
  };

  app.get("/api/inspection-assignments/:assignmentId", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: params("assignmentId"), response: { 200: assignmentDetailSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await assignment(ctx, numberParam(request, "assignmentId"), true);
    if (!found) return fail(reply, 404, "Проверка не найдена");
    return { id: found.id, status: found.status, work: { id: found.inspection.work.id, title: found.inspection.work.title }, inspection: { id: found.inspection.id, templateVersion: found.inspection.templateVersion }, checklist: found.inspection.items.map((item) => { const answer = found.answers.find((entry) => entry.checklistItemId === item.id); return { ...item, answer: { result: answer?.result ?? "PENDING", comment: answer?.comment ?? null, media: answer?.media.map(mediaRef) ?? [] } }; }), actions: { save: !ctx.isAdmin && found.status !== "COMPLETED", complete: !ctx.isAdmin && found.status !== "COMPLETED" } };
  });

  app.put("/api/inspection-assignments/:assignmentId/answers/:itemId", { ...guarded, schema: { tags: ["Inspections"], ...secured, params: { type: "object", required: ["assignmentId", "itemId"], properties: { assignmentId: id, itemId: id } }, body: { type: "object", additionalProperties: false, required: ["result"], properties: { result: { type: "string", enum: ["PENDING", "PASS", "FAIL", "UNABLE_TO_CHECK"] }, comment: { type: "string", nullable: true, maxLength: 10000 }, mediaIds: { ...mediaIds, default: [] } } }, response: { 200: { type: "object", additionalProperties: false, required: ["id", "result", "comment", "mediaIds"], properties: { id, result: str, comment: { type: "string", nullable: true }, mediaIds } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await assignment(ctx, numberParam(request, "assignmentId"));
    if (!found) return fail(reply, 404, "Проверка не найдена");
    if (found.status === "COMPLETED") return fail(reply, 409, "Проверка завершена");
    const itemId = numberParam(request, "itemId"), item = found.inspection.items.find((entry) => entry.id === itemId);
    if (!item) return fail(reply, 404, "Пункт не найден");
    const input = body<{ result: "PENDING" | "PASS" | "FAIL" | "UNABLE_TO_CHECK"; comment?: string | null; mediaIds?: number[] }>(request);
    const answerMediaIds = input.mediaIds ?? [];
    const comment = input.comment?.trim() || null;
    if ((input.result === "FAIL" || input.result === "UNABLE_TO_CHECK") && !comment) return fail(reply, 400, "Комментарий обязателен");
    if (input.result === "FAIL" && !answerMediaIds.length) return fail(reply, 400, "Для замечания нужно фото");
    const old = found.answers.find((answer) => answer.checklistItemId === itemId);
    const existing = new Set(old?.media.map((media) => media.id) ?? []);
    const added = answerMediaIds.filter((mediaId) => !existing.has(mediaId));
    try {
      const result = await ctx.db.$transaction(async (tx) => {
        if (old) await tx.media.updateMany({ where: { inspectionAnswerId: old.id, id: { notIn: answerMediaIds } }, data: { inspectionAnswerId: null } });
        const saved = await tx.inspectionAnswer.upsert({ where: { assignmentId_checklistItemId: { assignmentId: found.id, checklistItemId: itemId } }, create: { assignmentId: found.id, checklistItemId: itemId, result: input.result, comment }, update: { result: input.result, comment } });
        await attachNewMedia(tx as PrismaClient, ctx.userId, added, { inspectionAnswerId: saved.id });
        if (found.status === "ASSIGNED") await tx.inspectionAssignment.update({ where: { id: found.id }, data: { status: "IN_PROGRESS", startedAt: now() } });
        return saved;
      });
      return { id: result.id, result: result.result, comment: result.comment, mediaIds: answerMediaIds };
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); throw error; }
  });

  app.post("/api/inspection-assignments/:assignmentId/complete", { ...guarded, schema: { tags: ["Inspections"], ...secured, description: "Завершение доступно только после ответа PASS или FAIL на каждый пункт; PENDING и UNABLE_TO_CHECK блокируют завершение с ошибкой 400. Повторный вызов восстанавливает отсутствующий отчёт и возвращает 200.", params: params("assignmentId"), body: { type: "object", additionalProperties: false }, response: { 200: { type: "object", additionalProperties: false, required: ["status"], properties: { status: str } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await assignment(ctx, numberParam(request, "assignmentId"));
    if (!found) return fail(reply, 404, "Проверка не найдена");
    if (found.status === "COMPLETED") {
      await ensureInspectionReport(ctx.db, found.inspectionId, ctx.userId);
      return { status: "COMPLETED" };
    }
    if (found.inspection.items.length !== found.answers.length || found.answers.some((answer) => !["PASS", "FAIL"].includes(answer.result) || (answer.result === "FAIL" && (!answer.comment?.trim() || !answer.media.length)))) return fail(reply, 400, "Заполните все пункты и доказательства");
    await ctx.db.$transaction(async (tx) => {
      const updated = await tx.inspectionAssignment.updateMany({ where: { id: found.id, status: { not: "COMPLETED" } }, data: { status: "COMPLETED", completedAt: now() } });
      if (!updated.count) return;
      const pending = await tx.inspectionAssignment.count({ where: { inspectionId: found.inspectionId, status: { not: "COMPLETED" } } });
      if (pending) return;
      const answers = await tx.inspectionAnswer.findMany({ where: { assignment: { inspectionId: found.inspectionId }, result: "FAIL" }, include: { checklistItem: true } });
      for (const answer of answers) await tx.issue.upsert({ where: { inspectionAnswerId: answer.id }, create: { workId: found.inspection.workId, inspectionAnswerId: answer.id, title: answer.checklistItem.title, description: answer.comment ?? "" }, update: {} });
      await updateWorkStatusFromIssues(tx, found.inspection.workId);
      await tx.workHistory.create({ data: { workId: found.inspection.workId, event: "INSPECTION_COMPLETED", details: answers.length ? `${answers.length} замечаний` : "Без замечаний" } });
    });
    await ensureInspectionReport(ctx.db, found.inspectionId, ctx.userId);
    return { status: "COMPLETED" };
  });

  app.get("/api/works/:workId/issues", { ...guarded, schema: { tags: ["Issues"], ...secured, params: params("workId"), response: { 200: listSchema(issueSchema), ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId");
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work || !await mayWork(ctx, work)) return fail(reply, 404, "Работа не найдена");
    const role = await houseRole(ctx, work.houseId);
    if (!ctx.isAdmin && !["CHAIRMAN", "COUNCIL_MEMBER", "EXECUTOR"].includes(role?.role ?? "")) return fail(reply, 403, "Нет доступа к замечаниям");
    const items = await ctx.db.issue.findMany({ where: { workId }, include: { answer: { include: { media: { orderBy: { id: "asc" } } } }, remediations: { include: { media: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }, reinspections: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } });
    return { items: items.map(issueView) };
  });

  app.get("/api/me/issues", { ...guarded, schema: { tags: ["Issues"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["OPEN", "REMEDIATION_SUBMITTED", "RESOLVED"] } } }, response: { 200: listSchema(issueSchema), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "OPEN" | "REMEDIATION_SUBMITTED" | "RESOLVED" };
    const where: Prisma.IssueWhereInput = { ...(query.status ? { status: query.status } : {}), work: { AND: [
      query.houseId ? { houseId: query.houseId } : {},
      ctx.isAdmin ? {} : { OR: [
        { executorUserId: ctx.userId, house: { memberships: { some: { userId: ctx.userId, status: "ACTIVE", role: "EXECUTOR" } } } },
        { house: { memberships: { some: { userId: ctx.userId, status: "ACTIVE", role: { in: ["CHAIRMAN", "COUNCIL_MEMBER"] } } } } },
      ] },
    ] } };
    const items = await ctx.db.issue.findMany({ where, include: { work: { select: { id: true, title: true, houseId: true } }, answer: { include: { media: { orderBy: { id: "asc" } } } }, remediations: { include: { media: { orderBy: { id: "asc" } } }, orderBy: { id: "asc" } }, reinspections: { orderBy: { id: "asc" } } }, orderBy: { id: "desc" } });
    return { items: items.map(issueView) };
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
        const remediation = await tx.remediation.create({ data: { issueId, executorUserId: ctx.userId, comment: input.comment.trim() } });
        await attachNewMedia(tx as PrismaClient, ctx.userId, input.mediaIds, { remediationId: remediation.id });
        const reinspection = await tx.reinspection.create({ data: { issueId, remediationId: remediation.id, assigneeUserId: issue.answer.assignment.assigneeUserId } });
        await tx.issue.update({ where: { id: issueId }, data: { status: "REMEDIATION_SUBMITTED" } });
        await updateWorkStatusFromIssues(tx, issue.workId);
        await tx.workHistory.create({ data: { workId: issue.workId, event: "REMEDIATION_SUBMITTED", details: input.comment.trim() } });
        return { remediation, reinspection };
      });
      return reply.code(201).send({ id: created.remediation.id, reinspectionId: created.reinspection.id });
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); throw error; }
  });

  app.get("/api/me/reinspections", { ...guarded, schema: { tags: ["Reinspections"], ...secured, querystring: { type: "object", properties: { houseId: id, status: { type: "string", enum: ["ASSIGNED", "COMPLETED"] } } }, response: { 200: listSchema(reinspectionSummarySchema), ...response } } }, async (request) => {
    const ctx = context(request), query = request.query as { houseId?: number; status?: "ASSIGNED" | "COMPLETED" };
    const items = await ctx.db.reinspection.findMany({ where: { ...(!ctx.isAdmin ? { assigneeUserId: ctx.userId } : {}), ...(query.status ? { status: query.status } : {}), ...(query.houseId ? { issue: { work: { houseId: query.houseId } } } : {}) }, include: { issue: { include: { work: { select: { id: true, title: true, houseId: true } } } } }, orderBy: { id: "desc" } });
    return { items: items.map((item) => ({ id: item.id, status: item.status, issueId: item.issueId, work: item.issue.work })) };
  });

  const reinspection = async (ctx: Context, reinspectionId: number, readOnly = false) => {
    const found = await ctx.db.reinspection.findUnique({ where: { id: reinspectionId }, include: { issue: { include: { work: true, answer: { include: { media: true } } } }, remediation: { include: { media: true } }, media: true } });
    if (readOnly && ctx.isAdmin) return found;
    if (!found || found.assigneeUserId !== ctx.userId) return null;
    const membership = await houseRole(ctx, found.issue.work.houseId);
    if (membership?.status !== "ACTIVE" || membership.role !== "COUNCIL_MEMBER") return null;
    return found;
  };

  app.get("/api/reinspections/:reinspectionId", { ...guarded, schema: { tags: ["Reinspections"], ...secured, params: params("reinspectionId"), response: { 200: reinspectionDetailSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await reinspection(ctx, numberParam(request, "reinspectionId"), true);
    if (!found) return fail(reply, 404, "Повторная проверка не найдена");
    return { id: found.id, status: found.status, result: found.result, issue: { id: found.issue.id, title: found.issue.title, description: found.issue.description, before: found.issue.answer.media.map(mediaRef) }, remediation: { id: found.remediation.id, comment: found.remediation.comment, after: found.remediation.media.map(mediaRef) }, actions: { complete: !ctx.isAdmin && found.status === "ASSIGNED" } };
  });

  app.post("/api/reinspections/:reinspectionId/complete", { ...guarded, schema: { tags: ["Reinspections"], ...secured, description: "Повторное завершение возвращает сохранённый результат и восстанавливает отсутствующий отчёт без изменения замечания.", params: params("reinspectionId"), body: { type: "object", additionalProperties: false, required: ["result"], properties: { result: { type: "string", enum: ["RESOLVED", "NOT_RESOLVED"] }, comment: { type: "string", nullable: true, maxLength: 10000 }, mediaIds } }, response: { 200: { type: "object", additionalProperties: false, required: ["status", "result"], properties: { status: str, result: str } }, ...response } } }, async (request, reply) => {
    const ctx = context(request), found = await reinspection(ctx, numberParam(request, "reinspectionId"));
    if (!found) return fail(reply, 404, "Повторная проверка не найдена");
    if (found.status === "COMPLETED") {
      await ensureReinspectionReport(ctx.db, found.id, ctx.userId);
      return { status: "COMPLETED", result: found.result };
    }
    const input = body<{ result: "RESOLVED" | "NOT_RESOLVED"; comment?: string | null; mediaIds?: number[] }>(request);
    if (input.result === "NOT_RESOLVED" && !input.comment?.trim()) return fail(reply, 400, "Объясните, что осталось неустранённым");
    try {
      await ctx.db.$transaction(async (tx) => {
        const updated = await tx.reinspection.updateMany({ where: { id: found.id, status: "ASSIGNED" }, data: { status: "COMPLETED", result: input.result, comment: input.comment?.trim() || null, completedAt: now() } });
        if (!updated.count) return;
        await attachNewMedia(tx as PrismaClient, ctx.userId, input.mediaIds ?? [], { reinspectionId: found.id });
        await tx.issue.update({ where: { id: found.issueId }, data: { status: input.result === "RESOLVED" ? "RESOLVED" : "OPEN", resolvedAt: input.result === "RESOLVED" ? now() : null } });
        await updateWorkStatusFromIssues(tx, found.issue.workId);
        await tx.workHistory.create({ data: { workId: found.issue.workId, event: "REINSPECTION_COMPLETED", details: input.result } });
      });
      await ensureReinspectionReport(ctx.db, found.id, ctx.userId);
      return { status: "COMPLETED", result: input.result };
    } catch (error) { if (error instanceof Error && error.message === "INVALID_MEDIA") return fail(reply, 400, "Некорректные mediaIds"); throw error; }
  });

  const actFields = ["actNumber", "city", "contractNumber", "contractDate", "customerName", "customerApartment", "customerAuthorityBasis", "executorOrganization", "executorRepresentative", "executorAuthorityBasis", "periodFrom", "periodTo", "frequencyOrQuantity", "unit", "unitPrice", "totalPrice", "totalPriceWords"] as const;
  app.post("/api/works/:workId/documents", { ...guarded, schema: { tags: ["Documents"], ...secured, description: "Для одной работы допускается один акт приёмки; повторное создание ACCEPTANCE_ACT возвращает 409.", params: params("workId"), body: { type: "object", additionalProperties: false, required: ["type"], properties: { type: { type: "string", enum: ["REASONED_REFUSAL", "ACCEPTANCE_ACT"] }, data: { type: "object", additionalProperties: false, properties: Object.fromEntries(actFields.map((field) => [field, { type: "string", minLength: 1, maxLength: 512 }])) } } }, response: { 201: documentCreatedSchema, ...response } } }, async (request, reply) => {
    const ctx = context(request), workId = numberParam(request, "workId"), input = body<{ type: "REASONED_REFUSAL" | "ACCEPTANCE_ACT"; data?: Record<string, string> }>(request);
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work || !await mayWork(ctx, work)) return fail(reply, 404, "Работа не найдена");
    if (input.type === "REASONED_REFUSAL") {
      if (!await isActiveChair(ctx, work.houseId)) return fail(reply, 403, "Только председатель оформляет отказ");
      if (!await ctx.db.issue.count({ where: { workId, status: { not: "RESOLVED" } } })) return fail(reply, 409, "Нет активных замечаний");
      const created = await generate(ctx.db, workId, input.type, ctx.userId, input.data);
      await ctx.db.documentVersion.update({ where: { id: created.id }, data: { status: "CONFIRMED", confirmedAt: now() } });
      return reply.code(201).send({ id: created.documentId, version: created.version, status: "CONFIRMED", fileUrl: `/doc/${created.publicKey}.pdf` });
    }
    const role = await houseRole(ctx, work.houseId);
    if (!(role?.status === "ACTIVE" && role.role === "EXECUTOR" && work.executorUserId === ctx.userId)) return fail(reply, 403, "Акт оформляет исполнитель работы");
    if (await ctx.db.document.findFirst({ where: { workId, type: "ACCEPTANCE_ACT" }, select: { id: true } })) return fail(reply, 409, "Акт приёмки для этой работы уже сформирован");
    if (work.status !== "WAITING" || await ctx.db.issue.count({ where: { workId, status: { not: "RESOLVED" } } })) return fail(reply, 409, "Работа ещё не прошла проверку");
    if (!await ctx.db.inspectionAssignment.count({ where: { inspection: { workId }, status: "COMPLETED" } })) return fail(reply, 409, "Нет завершённой проверки");
    if (!input.data || actFields.some((field) => !input.data?.[field]?.trim())) return fail(reply, 400, "Заполните поля формы акта № 761/пр");
    try {
      const created = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
        if (await tx.document.findFirst({ where: { workId, type: "ACCEPTANCE_ACT" }, select: { id: true } })) throw new Error("ACCEPTANCE_ACT_ALREADY_EXISTS");
        const current = await tx.work.findUniqueOrThrow({ where: { id: workId } });
        if (current.status !== "WAITING" || await tx.issue.count({ where: { workId, status: { not: "RESOLVED" } } })) throw new Error("WORK_NOT_READY");
        return generate(tx as PrismaClient, workId, "ACCEPTANCE_ACT", ctx.userId, input.data);
      }, { timeout: 15_000 });
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
      const result = await finalizeAcceptanceActIfReady(ctx.db, documentId, now);
      return result.status === "CONFLICT" ? fail(reply, 409, "Эта работа уже принята по другому акту") : result;
    }
    if (original.confirmations.some((confirmation) => confirmation.userId === ctx.userId)) {
      const result = await finalizeAcceptanceActIfReady(ctx.db, documentId, now);
      return result.status === "CONFLICT" ? fail(reply, 409, "Эта работа уже принята по другому акту") : result;
    }
    if (original.status !== "FINAL") return fail(reply, 403, "Подтверждение недоступно");
    const membership = await houseRole(ctx, document.work.houseId);
    const isExecutor = membership?.status === "ACTIVE" && membership.role === "EXECUTOR" && document.work.executorUserId === ctx.userId;
    const isRepresentative = membership?.status === "ACTIVE" && ["CHAIRMAN", "COUNCIL_MEMBER"].includes(membership.role) && membership.canSignAcceptanceAct;
    let roleSnapshot: string;
    if (isExecutor && !original.confirmations.length) roleSnapshot = "EXECUTOR";
    else if (isRepresentative && original.confirmations.some((confirmation) => confirmation.roleSnapshot === "EXECUTOR") && !original.confirmations.some((confirmation) => ["CHAIRMAN", "COUNCIL_MEMBER"].includes(confirmation.roleSnapshot))) roleSnapshot = membership.role;
    else return fail(reply, 403, "Ожидается подтверждение исполнителя, затем уполномоченного представителя дома");
    await ctx.db.documentConfirmation.upsert({ where: { documentVersionId_userId: { documentVersionId: original.id, userId: ctx.userId } }, create: { documentVersionId: original.id, userId: ctx.userId, roleSnapshot, confirmedAt: now() }, update: {} });
    const result = await finalizeAcceptanceActIfReady(ctx.db, documentId, now);
    return result.status === "CONFLICT" ? fail(reply, 409, "Эта работа уже принята по другому акту") : result;
  });

  app.get("/doc/:key.pdf", { schema: { tags: ["Documents"], params: { type: "object", required: ["key"], properties: { key: { type: "string", pattern: "^(?:[a-z0-9]{20}|[a-f0-9]{40})$" } } }, response: { 200: { type: "string", format: "binary" }, 404: err } } }, async (request, reply) => {
    if (!db) return fail(reply, 503, "База данных недоступна");
    const key = (request.params as { key: string }).key;
    const version = await db.documentVersion.findUnique({ where: { publicKey: key } });
    if (!version) return fail(reply, 404, "Документ не найден");
    try {
      const bytes = await readFile(join(documentRoot(), version.storagePath));
      return reply.header("Content-Disposition", `inline; filename="document-${key}.pdf"`).header("X-Robots-Tag", "noindex, nofollow, noarchive").type("application/pdf").send(bytes);
    } catch { return fail(reply, 404, "Документ не найден"); }
  });
}

export async function publicDocumentStatus(db: PrismaClient, key: string) {
  const version = await db.documentVersion.findUnique({ where: { publicKey: key }, include: { document: { include: { work: { include: { house: true } } } }, confirmations: { include: { user: true } } } });
  if (!version) return { message: "Документ не найден", bytes: null };
  const verified = await verifyDocumentFile(version);
  if (!verified.ok) return { message: "Документ найден, но целостность файла не подтверждена", bytes: null };
  const document = version.document;
  const names = version.confirmations.map((item) => `${item.user.firstName} ${item.user.lastName}`).join(", ");
  return { message: `✅ Документ найден\n${documentTitle[document.type]} №${document.id}\nДом: ${document.work.house.address}\nРабота: ${document.work.title}\nВерсия: ${version.version}\nСформирован: ${version.createdAt.toLocaleString("ru-RU")}\nСтатус: ${version.status}${document.type === "ACCEPTANCE_ACT" ? `\nПодтвердил: ${names || "ожидает подтверждения"}` : ""}\nЦелостность файла: подтверждена`, bytes: verified.bytes };
}

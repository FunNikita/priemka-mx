import multipart from "@fastify/multipart";
import { createHash } from "node:crypto";
import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import type { FastifyInstance, FastifyReply, FastifyRequest, preHandlerHookHandler } from "fastify";
import sharp from "sharp";

import type { PrismaClient } from "../generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";
import { newPublicPhotoKey } from "./photo-keys.js";

const mediaRoot = () => resolve(process.env.MEDIA_DIR ?? "/app/data/media");
const maxFileSize = 10 * 1024 * 1024;
const errorResponse = { type: "object", required: ["message"], properties: { message: { type: "string" } } } as const;
const idParams = { type: "object", required: ["houseId"], properties: { houseId: { type: "integer", minimum: 1 } } } as const;
const workParams = { type: "object", required: ["workId"], properties: { workId: { type: "integer", minimum: 1 } } } as const;
const statusValues = ["NEW", "IN_REVIEW", "IN_PROGRESS", "WAITING", "ACCEPTED"] as const;
const statusSchema = { type: "string", enum: statusValues } as const;
const listQuery = { type: "object", properties: { status: statusSchema, page: { type: "integer", minimum: 1, default: 1 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } } } as const;
const observationQuery = { type: "object", properties: { status: statusSchema, search: { type: "string", maxLength: 200 }, page: listQuery.properties.page, limit: listQuery.properties.limit } } as const;
const mediaIdsProperty = { type: "array", uniqueItems: true, maxItems: 20, items: { type: "integer", minimum: 1 } } as const;
const mediaRefSchema = { type: "object", additionalProperties: false, required: ["id", "url", "width", "height", "mimeType", "size"], properties: { id: { type: "integer" }, url: { type: "string" }, width: { type: "integer" }, height: { type: "integer" }, mimeType: { type: "string" }, size: { type: "integer" } } } as const;
const workCardSchema = { type: "object", additionalProperties: false, required: ["id", "title", "description", "category", "status", "date", "isWatching", "media"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, date: { type: "string", format: "date-time" }, isWatching: { type: "boolean" }, media: { type: "array", items: mediaRefSchema } } } as const;
const authorSchema = { type: "object", additionalProperties: false, required: ["id", "firstName", "lastName"], properties: { id: { type: "integer" }, firstName: { type: "string" }, lastName: { type: "string" } } } as const;
const observationSchema = { type: "object", additionalProperties: false, required: ["id", "title", "description", "category", "status", "createdAt", "author", "media"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, createdAt: { type: "string", format: "date-time" }, author: authorSchema, media: { type: "array", items: mediaRefSchema } } } as const;
const commentSchema = { type: "object", additionalProperties: false, required: ["id", "text", "author", "createdAt", "media"], properties: { id: { type: "integer" }, text: { type: "string" }, author: authorSchema, createdAt: { type: "string", format: "date-time" }, media: { type: "array", items: mediaRefSchema } } } as const;
const houseRefSchema = { type: "object", additionalProperties: false, required: ["id", "address"], properties: { id: { type: "integer" }, address: { type: "string" } } } as const;
const chatSchema = { type: "object", additionalProperties: false, required: ["title", "joinUrl"], properties: { title: { type: "string", nullable: true }, joinUrl: { type: "string" } } } as const;
const houseSummarySchema = { type: "object", additionalProperties: false, required: ["id", "address", "chat"], properties: { ...houseRefSchema.properties, chat: { ...chatSchema, nullable: true } } } as const;
const houseActionsSchema = { type: "object", additionalProperties: false, required: ["manageChat"], properties: { manageChat: { type: "boolean" } } } as const;
const worksResponseSchema = { type: "object", additionalProperties: false, required: ["house", "actions", "items", "page", "limit", "total"], properties: { house: houseSummarySchema, actions: houseActionsSchema, items: { type: "array", items: workCardSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const representativeSchema = { type: "object", additionalProperties: false, nullable: true, required: ["id", "name", "phone", "maxUrl"], properties: { id: { type: "integer" }, name: { type: "string" }, phone: { type: "string", nullable: true }, maxUrl: { type: "string", nullable: true } } } as const;
const workActionsSchema = { type: "object", additionalProperties: false, required: ["watch", "unwatch", "comment", "submitForInspection", "reportRemediation", "assignInspector", "performInspection", "generateReasonedRefusal", "generateAcceptanceAct", "confirmAcceptance", "manageDocuments"], properties: { watch: { type: "boolean" }, unwatch: { type: "boolean" }, comment: { type: "boolean" }, submitForInspection: { type: "boolean" }, reportRemediation: { type: "boolean" }, assignInspector: { type: "boolean" }, performInspection: { type: "boolean" }, generateReasonedRefusal: { type: "boolean" }, generateAcceptanceAct: { type: "boolean" }, confirmAcceptance: { type: "boolean" }, manageDocuments: { type: "boolean" } } } as const;
const documentSchema = { type: "object", additionalProperties: false, required: ["id", "type", "title", "version", "status", "createdAt", "confirmedAt", "fileUrl", "actions"], properties: { id: { type: "integer" }, type: { type: "string" }, title: { type: "string" }, version: { type: "integer" }, status: { type: "string" }, createdAt: { type: "string", format: "date-time" }, confirmedAt: { type: "string", format: "date-time", nullable: true }, fileUrl: { type: "string" }, actions: { type: "object", additionalProperties: false, required: ["confirm"], properties: { confirm: { type: "boolean" } } } } } as const;
const workDetailSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "house", "houseObject", "title", "description", "category", "status", "date", "dates", "history", "media", "executor", "representative", "isWatching", "actions", "documents"],
  properties: {
    id: { type: "integer" }, house: houseRefSchema,
    houseObject: { type: "object", additionalProperties: false, nullable: true, required: ["id", "title"], properties: { id: { type: "integer" }, title: { type: "string" } } },
    title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, date: { type: "string", format: "date-time" },
    dates: { type: "object", additionalProperties: false, required: ["createdAt", "updatedAt", "completedAt", "submittedForInspectionAt"], properties: { createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, completedAt: { type: "string", format: "date-time", nullable: true }, submittedForInspectionAt: { type: "string", format: "date-time", nullable: true } } },
    history: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "event", "details", "createdAt"], properties: { id: { type: "integer" }, event: { type: "string" }, details: { type: "string", nullable: true }, createdAt: { type: "string", format: "date-time" } } } },
    media: { type: "array", items: mediaRefSchema }, executor: { type: "string", nullable: true }, representative: representativeSchema,
    isWatching: { type: "boolean" }, actions: workActionsSchema, documents: { type: "array", description: "По одной записи на документ: только версия с наибольшим номером.", items: documentSchema },
  },
} as const;
const observationListSchema = { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: observationSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const commentsListSchema = { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: commentSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const observationCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "status"], properties: { id: { type: "integer" }, status: statusSchema } } as const;
const idResponseSchema = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer" } } } as const;
export const mediaUploadBodySchema = { type: "object", additionalProperties: false, required: ["file"], properties: { file: { type: "string", format: "binary" } } } as const;
export const photoResponseSchema = { type: "string", format: "binary" } as const;

type Context = { db: PrismaClient; userId: number; isAdmin: boolean };
type Membership = { role: string; status: string };

export function permissionsFor(role: string | null, status: string | null, isAdmin = false) {
  const active = status === "ACTIVE";
  const admin = isAdmin;
  const residentSide = active && ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN"].includes(role ?? "");
  const chatManager = active && ["CHAIRMAN", "COUNCIL_MEMBER"].includes(role ?? "");
  return {
    viewWorks: admin || active,
    viewObservations: admin || residentSide,
    viewHouseChat: admin || residentSide,
    createObservation: residentSide,
    commentWork: active,
    watchWork: active,
    manageHouseChat: chatManager,
    assignInspector: active && role === "CHAIRMAN",
    performInspection: active && role === "COUNCIL_MEMBER",
    reviewJoinRequests: active && role === "CHAIRMAN",
  };
}

function isSystemAdmin(ctx: Context) { return ctx.isAdmin; }

function mediaRef(media: { id: number; publicKey: string | null; blob: { width: number; height: number; mimeType: string; size: number } }) {
  return { id: media.id, url: `/photo/${media.publicKey}`, width: media.blob.width, height: media.blob.height, mimeType: media.blob.mimeType, size: media.blob.size };
}

function author(user: { id: number; firstName: string; lastName: string }) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName };
}

function pageOf(query: { page?: number; limit?: number }) {
  const page = query.page ?? 1;
  const limit = query.limit ?? 20;
  return { page, limit, skip: (page - 1) * limit };
}

function bad(reply: unknown, status: number, message: string) {
  return (reply as FastifyReply).code(status).send({ message });
}

function isMaxChatUrl(value: string) {
  if (value !== value.trim() || /\s/.test(value)) return false;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname === "max.ru" && !url.username && !url.password && url.pathname.split("/").some((segment) => segment.length > 0);
  } catch {
    return false;
  }
}

async function membership(ctx: Context, houseId: number): Promise<Membership | null> {
  return ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: ctx.userId } } });
}

async function houseAccess(ctx: Context, houseId: number, permission: keyof ReturnType<typeof permissionsFor>) {
  const m = await membership(ctx, houseId);
  const permissions = permissionsFor(m?.role ?? null, m?.status ?? null, ctx.isAdmin);
  return permissions[permission] ? { membership: m, permissions } : null;
}

async function workAccess(ctx: Context, workId: number) {
  const work = await ctx.db.work.findUnique({ where: { id: workId }, include: { house: true, houseObject: true, executor: { select: { id: true, firstName: true, lastName: true } }, media: { where: { temporary: false }, include: { blob: true } }, history: { orderBy: { createdAt: "asc" } } } });
  if (!work) return null;
  const m = await houseAccess(ctx, work.houseId, "viewWorks");
  return m && (isSystemAdmin(ctx) || m.membership?.role !== "EXECUTOR" || work.executorUserId === ctx.userId) ? { work, permissions: m.permissions } : null;
}

async function attachMedia(db: PrismaClient, ownerUserId: number, mediaIds: number[], target: { observationId?: number; commentId?: number }) {
  if (!mediaIds.length) return;
  const currentTime = new Date();
  const items = await db.media.findMany({ where: { id: { in: mediaIds }, ownerUserId, temporary: true, expiresAt: { gt: currentTime } } });
  if (items.length !== mediaIds.length) throw new Error("INVALID_MEDIA");
  for (const item of items) {
    const updated = await db.media.updateMany({ where: { id: item.id, ownerUserId, temporary: true, expiresAt: { gt: currentTime } }, data: { ...target, temporary: false, expiresAt: null, publicKey: item.publicKey ?? newPublicPhotoKey() } });
    if (updated.count !== 1) throw new Error("INVALID_MEDIA");
  }
}

function typedRequest<T>(request: FastifyRequest): T { return request as unknown as T; }

export async function registerBusinessApi(app: FastifyInstance, config: AppConfig, users: UserRepository, now: () => Date, businessDb?: PrismaClient) {
  await app.register(multipart, { limits: { fileSize: maxFileSize, files: 1, fields: 0, parts: 1 } });
  const db = businessDb ?? (users instanceof PrismaUserRepository ? users.prisma : null);
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now);
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    await auth.call(app, request, reply, () => undefined);
    if (reply.sent) return;
    if (!db) return bad(reply, 503, "База данных недоступна");
    const identity = await users.upsertFromMax({ user: request.maxInitData!.user, authDate: request.maxInitData!.authDate, seenAt: now() });
    request.business = { db, userId: identity.id, isAdmin: identity.isAdmin };
  };
  const secured = { preHandler: authenticate };
  const security = [{ maxInitData: [] }];

  app.post("/api/houses/:houseId/works", { ...secured, schema: { tags: ["Works"], security, params: idParams, body: { type: "object", additionalProperties: false, required: ["executorUserId", "title", "description", "category"], properties: { executorUserId: { type: "integer", minimum: 1 }, title: { type: "string", minLength: 1, maxLength: 255 }, description: { type: "string", minLength: 1, maxLength: 10000 }, category: { type: "string", minLength: 1, maxLength: 100 } } }, response: { 201: idResponseSchema, 400: errorResponse, 403: errorResponse, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { houseId } = request.params as { houseId: number };
    const input = request.body as { executorUserId: number; title: string; description: string; category: string };
    if (!await ctx.db.house.findUnique({ where: { id: houseId }, select: { id: true } })) return bad(reply, 404, "Дом не найден");
    const chair = await membership(ctx, houseId);
    if (chair?.status !== "ACTIVE" || chair.role !== "CHAIRMAN") return bad(reply, 403, "Работу создаёт председатель дома");
    const candidate = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: input.executorUserId } }, include: { user: true } });
    if (!candidate || candidate.status !== "ACTIVE" || (candidate.role !== "EXECUTOR" && candidate.userId !== ctx.userId) || !candidate.executorCompanyName?.trim()) return bad(reply, 400, "Нужен активный исполнитель с компанией");
    if (!input.title.trim() || !input.description.trim() || !input.category.trim()) return bad(reply, 400, "Заполните данные работы");
    const created = await ctx.db.$transaction(async (tx) => {
      const work = await tx.work.create({ data: { houseId, executorUserId: candidate.userId, executorName: candidate.executorCompanyName!.trim(), representativeName: `${candidate.user.firstName} ${candidate.user.lastName}`.trim(), title: input.title.trim(), description: input.description.trim(), category: input.category.trim(), status: "NEW" } });
      await tx.workHistory.create({ data: { workId: work.id, event: "WORK_CREATED", details: `Исполнитель ${candidate.userId}` } });
      return work;
    });
    return reply.code(201).send({ id: created.id });
  });

  app.post("/api/works/:workId/submit-for-inspection", { ...secured, schema: { tags: ["Works"], security, params: workParams, body: { type: "object", additionalProperties: false, properties: {} }, response: { 200: { type: "object", additionalProperties: false, required: ["submittedForInspectionAt"], properties: { submittedForInspectionAt: { type: "string", format: "date-time" } } }, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { workId } = request.params as { workId: number };
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work) return bad(reply, 404, "Работа не найдена");
    const m = await membership(ctx, work.houseId);
    if (m?.status !== "ACTIVE" || m.role !== "EXECUTOR" || work.executorUserId !== ctx.userId) return bad(reply, 403, "Только назначенный исполнитель может передать работу");
    if (work.status === "ACCEPTED") return bad(reply, 409, "Работа уже принята");
    if (work.submittedForInspectionAt) return { submittedForInspectionAt: work.submittedForInspectionAt };
    if (work.status !== "NEW") return bad(reply, 409, "Работа уже находится на проверке");
    const submitted = await ctx.db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
      const current = await tx.work.findUniqueOrThrow({ where: { id: workId } });
      if (current.submittedForInspectionAt) return current.submittedForInspectionAt;
      if (current.status !== "NEW") return null;
      const at = now();
      await tx.work.update({ where: { id: workId }, data: { submittedForInspectionAt: at } });
      await tx.workHistory.create({ data: { workId, event: "SUBMITTED_FOR_INSPECTION" } });
      return at;
    });
    return submitted ? { submittedForInspectionAt: submitted } : bad(reply, 409, "Работа уже находится на проверке");
  });

  app.get("/api/houses/:houseId/works", { ...secured, schema: { tags: ["Works"], security, params: idParams, querystring: listQuery, response: { 200: worksResponseSchema, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const query = typedRequest<{ query: { status?: string; page?: number; limit?: number } }>(request).query;
    const ctx = request.business!;
    const access = await houseAccess(ctx, houseId, "viewWorks");
    if (!access) return bad(reply, 403, "Нет доступа к дому");
    const house = await ctx.db.house.findUnique({ where: { id: houseId }, include: { chat: true } });
    if (!house) return bad(reply, 404, "Дом не найден");
    const { page, limit, skip } = pageOf(query);
    const where = { houseId, ...(!isSystemAdmin(ctx) && access.membership?.role === "EXECUTOR" ? { executorUserId: ctx.userId } : {}), ...(query.status ? { status: query.status as (typeof statusValues)[number] } : {}) };
    const [total, works] = await Promise.all([ctx.db.work.count({ where }), ctx.db.work.findMany({ where, skip, take: limit, orderBy: [{ date: "desc" }, { id: "desc" }], include: { media: { where: { temporary: false }, include: { blob: true } }, subscriptions: { where: { userId: ctx.userId }, select: { id: true } } } })]);
    if (!ctx.isAdmin && access.membership?.status === "ACTIVE") await ctx.db.user.update({ where: { id: ctx.userId }, data: { lastHouseId: houseId } });
    return { house: { id: house.id, address: house.address, chat: access.permissions.viewHouseChat && house.chat ? { title: house.chat.title, joinUrl: house.chat.joinUrl } : null }, actions: { manageChat: access.permissions.manageHouseChat }, items: works.map((work) => ({ id: work.id, title: work.title, description: work.description, category: work.category, status: work.status, date: work.date, isWatching: work.subscriptions.length > 0, media: work.media.map(mediaRef) })), page, limit, total };
  });

  app.get("/api/works/:workId", { ...secured, schema: { tags: ["Works"], security, params: workParams, response: { 200: workDetailSchema, 403: errorResponse, 404: errorResponse } } }, async (request, reply) => {
    const { workId } = typedRequest<{ params: { workId: number } }>(request).params;
    const ctx = request.business!;
    const access = await workAccess(ctx, workId);
    if (!access) return bad(reply, 404, "Работа не найдена");
    const { work, permissions } = access;
    const [watching, membership, activeIssues, openIssues, documents, myAssignments, inspections, completedInspections] = await Promise.all([
      ctx.db.workSubscription.findUnique({ where: { workId_userId: { workId, userId: ctx.userId } } }),
      ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId: work.houseId, userId: ctx.userId } } }),
      ctx.db.issue.count({ where: { workId, status: { not: "RESOLVED" } } }),
      ctx.db.issue.count({ where: { workId, status: "OPEN" } }),
      ctx.db.document.findMany({ where: { workId }, include: { versions: { orderBy: { version: "desc" }, take: 1, include: { confirmations: true } } } }),
      ctx.db.inspectionAssignment.count({ where: { assigneeUserId: ctx.userId, inspection: { workId }, status: { not: "COMPLETED" } } }),
      ctx.db.inspection.count({ where: { workId } }),
      ctx.db.inspectionAssignment.count({ where: { inspection: { workId }, status: "COMPLETED" } }),
    ]);
    const chair = membership?.status === "ACTIVE" && membership.role === "CHAIRMAN";
    const refusalChair = membership?.status === "ACTIVE" && membership.role === "CHAIRMAN";
    const executor = membership?.status === "ACTIVE" && membership.role === "EXECUTOR" && work.executorUserId === ctx.userId;
    const representative = chair;
    const hasAcceptanceAct = documents.some((document) => document.type === "ACCEPTANCE_ACT");
    const canConfirm = (type: string, status: string, confirmations: { userId: number; roleSnapshot: string }[]) => work.status !== "ACCEPTED" && type === "ACCEPTANCE_ACT" && status === "FINAL" && ((executor && !confirmations.some((item) => item.roleSnapshot === "EXECUTOR") && !confirmations.length) || (representative && confirmations.some((item) => item.roleSnapshot === "EXECUTOR") && !confirmations.some((item) => item.roleSnapshot === "CHAIRMAN")));
    const documentItems = documents.flatMap((document) => {
      const version = document.versions[0];
      return version ? [{ id: document.id, type: document.type, title: document.title, version: version.version, status: version.status, createdAt: version.createdAt, confirmedAt: version.confirmedAt, fileUrl: `/doc/${version.publicKey}.pdf`, actions: { confirm: canConfirm(document.type, version.status, version.confirmations) } }] : [];
    });
    return { id: work.id, house: { id: work.house.id, address: work.house.address }, houseObject: work.houseObject ? { id: work.houseObject.id, title: work.houseObject.title } : null, title: work.title, description: work.description, category: work.category, status: work.status, date: work.date, dates: { createdAt: work.createdAt, updatedAt: work.updatedAt, completedAt: work.completedAt, submittedForInspectionAt: work.submittedForInspectionAt }, history: work.history.map((event) => ({ id: event.id, event: event.event, details: event.details, createdAt: event.createdAt })), media: work.media.map(mediaRef), executor: work.executorName, representative: work.executor ? { id: work.executor.id, name: work.representativeName ?? `${work.executor.firstName} ${work.executor.lastName}`.trim(), phone: null, maxUrl: null } : null, isWatching: !!watching, documents: documentItems, actions: { watch: permissions.watchWork && !watching, unwatch: permissions.watchWork && !!watching, comment: permissions.commentWork, reportRemediation: executor && !!openIssues, submitForInspection: executor && work.status === "NEW" && !work.submittedForInspectionAt, assignInspector: chair && work.status === "NEW" && !!work.submittedForInspectionAt && !inspections, performInspection: membership?.status === "ACTIVE" && membership.role === "COUNCIL_MEMBER" && !!myAssignments, generateReasonedRefusal: !!refusalChair && !!activeIssues, generateAcceptanceAct: executor && work.status === "WAITING" && !!completedInspections && !activeIssues && !hasAcceptanceAct, confirmAcceptance: documentItems.some((item) => item.type === "ACCEPTANCE_ACT" && item.actions.confirm), manageDocuments: chair || executor } };
  });

  for (const method of ["POST", "DELETE"] as const) {
    app.route({ method, url: "/api/works/:workId/watch", ...secured, schema: { tags: ["Works"], security, params: workParams, response: { 204: { type: "null" }, 404: errorResponse } }, handler: async (request, reply) => {
      const { workId } = typedRequest<{ params: { workId: number } }>(request).params;
      const ctx = request.business!;
      const access = await workAccess(ctx, workId);
      if (!access || !access.permissions.watchWork) return bad(reply, 404, "Работа не найдена");
      if (method === "POST") await ctx.db.workSubscription.upsert({ where: { workId_userId: { workId, userId: ctx.userId } }, create: { workId, userId: ctx.userId }, update: {} });
      else await ctx.db.workSubscription.deleteMany({ where: { workId, userId: ctx.userId } });
      return reply.code(204).send();
    } });
  }

  app.get("/api/houses/:houseId/observations", { ...secured, schema: { tags: ["Observations"], security, params: idParams, querystring: observationQuery, response: { 200: observationListSchema, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const query = typedRequest<{ query: { status?: string; search?: string; page?: number; limit?: number } }>(request).query;
    const ctx = request.business!;
    if (!await houseAccess(ctx, houseId, "viewObservations")) return bad(reply, 403, "Нет доступа к наблюдениям дома");
    const { page, limit, skip } = pageOf(query);
    const where = { houseId, ...(query.status ? { status: query.status as (typeof statusValues)[number] } : {}), ...(query.search ? { OR: [{ title: { contains: query.search } }, { description: { contains: query.search } }] } : {}) };
    const [total, items] = await Promise.all([ctx.db.observation.count({ where }), ctx.db.observation.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: { author: true, media: { include: { blob: true } } } })]);
    return { items: items.map((item) => ({ id: item.id, title: item.title, description: item.description, category: item.category, status: item.status, createdAt: item.createdAt, author: author(item.author), media: item.media.map(mediaRef) })), page, limit, total };
  });

  app.post("/api/houses/:houseId/observations", { ...secured, schema: { tags: ["Observations"], security, params: idParams, body: { type: "object", additionalProperties: false, required: ["category", "title", "description"], properties: { category: { type: "string", minLength: 1, maxLength: 100 }, houseObjectId: { type: "integer", minimum: 1, nullable: true }, title: { type: "string", minLength: 1, maxLength: 255 }, description: { type: "string", minLength: 1, maxLength: 10000 }, mediaIds: mediaIdsProperty } }, response: { 201: observationCreatedSchema, 400: errorResponse, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const body = typedRequest<{ body: { category: string; houseObjectId?: number | null; title: string; description: string; mediaIds?: number[] } }>(request).body;
    const ctx = request.business!;
    if (!await houseAccess(ctx, houseId, "createObservation")) return bad(reply, 403, "Нет права создать событие");
    if (!body.title.trim() || !body.description.trim() || !body.category.trim()) return bad(reply, 400, "Заполните обязательные поля");
    if (body.houseObjectId && !await ctx.db.houseObject.findFirst({ where: { id: body.houseObjectId, houseId } })) return bad(reply, 400, "Объект не относится к дому");
    try {
      const result = await ctx.db.$transaction(async (tx) => {
        const item = await tx.observation.create({ data: { houseId, houseObjectId: body.houseObjectId ?? null, authorId: ctx.userId, title: body.title.trim(), description: body.description.trim(), category: body.category.trim() } });
        await attachMedia(tx as PrismaClient, ctx.userId, body.mediaIds ?? [], { observationId: item.id });
        return item;
      });
      return reply.code(201).send({ id: result.id, status: result.status });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_MEDIA") return bad(reply, 400, "Некорректные mediaIds");
      throw error;
    }
  });

  app.get("/api/works/:workId/comments", { ...secured, schema: { tags: ["Comments"], security, params: workParams, querystring: { type: "object", properties: { page: listQuery.properties.page, limit: listQuery.properties.limit } }, response: { 200: commentsListSchema, 404: errorResponse } } }, async (request, reply) => {
    const { workId } = typedRequest<{ params: { workId: number } }>(request).params;
    const ctx = request.business!;
    if (!await workAccess(ctx, workId)) return bad(reply, 404, "Работа не найдена");
    const { page, limit, skip } = pageOf(request.query as { page?: number; limit?: number });
    const [total, comments] = await Promise.all([ctx.db.comment.count({ where: { workId } }), ctx.db.comment.findMany({ where: { workId }, skip, take: limit, orderBy: { id: "asc" }, include: { author: true, media: { include: { blob: true } } } })]);
    return { items: comments.map((item) => ({ id: item.id, text: item.text, author: author(item.author), createdAt: item.createdAt, media: item.media.map(mediaRef) })), page, limit, total };
  });

  app.post("/api/works/:workId/comments", { ...secured, schema: { tags: ["Comments"], security, params: workParams, body: { type: "object", additionalProperties: false, properties: { text: { type: "string", maxLength: 10000 }, mediaIds: mediaIdsProperty } }, response: { 201: idResponseSchema, 400: errorResponse, 404: errorResponse } } }, async (request, reply) => {
    const { workId } = typedRequest<{ params: { workId: number } }>(request).params;
    const body = typedRequest<{ body: { text?: string; mediaIds: number[] } }>(request).body;
    const ctx = request.business!;
    const access = await workAccess(ctx, workId);
    if (!access || !access.permissions.commentWork) return bad(reply, 404, "Работа не найдена");
    const mediaIds = body.mediaIds ?? [];
    if (!body.text?.trim() && !mediaIds.length) return bad(reply, 400, "Пустой комментарий");
    try {
      const item = await ctx.db.$transaction(async (tx) => {
        const created = await tx.comment.create({ data: { workId, authorId: ctx.userId, text: body.text?.trim() ?? "" } });
        await attachMedia(tx as PrismaClient, ctx.userId, mediaIds, { commentId: created.id });
        return created;
      });
      return reply.code(201).send({ id: item.id });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_MEDIA") return bad(reply, 400, "Некорректные mediaIds");
      throw error;
    }
  });

  app.put("/api/houses/:houseId/chat", { ...secured, schema: { tags: ["House chat"], security, params: idParams, body: { type: "object", additionalProperties: false, required: ["joinUrl"], properties: { joinUrl: { type: "string", minLength: 12, maxLength: 2048, description: "HTTPS URL на max.ru с непустым путём" } } }, response: { 200: chatSchema, 400: errorResponse, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const { joinUrl } = typedRequest<{ body: { joinUrl: string } }>(request).body;
    const ctx = request.business!;
    if (!await houseAccess(ctx, houseId, "manageHouseChat")) return bad(reply, 403, "Нет права управлять чатом");
    if (!isMaxChatUrl(joinUrl)) return bad(reply, 400, "Некорректная ссылка MAX");
    const chat = await ctx.db.houseChat.upsert({ where: { houseId }, create: { houseId, joinUrl }, update: { joinUrl } });
    return { title: chat.title, joinUrl: chat.joinUrl };
  });
  app.delete("/api/houses/:houseId/chat", { ...secured, schema: { tags: ["House chat"], security, params: idParams, response: { 204: { type: "null" }, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const ctx = request.business!;
    if (!await houseAccess(ctx, houseId, "manageHouseChat")) return bad(reply, 403, "Нет права управлять чатом");
    await ctx.db.houseChat.deleteMany({ where: { houseId } });
    return reply.code(204).send();
  });

  const uploadAttempts = new Map<number, number[]>();
  let uploadSweepCount = 0;
  app.post("/api/media", { ...secured, schema: { tags: ["Media"], security, consumes: ["multipart/form-data"], response: { 201: idResponseSchema, 400: errorResponse, 403: errorResponse, 413: errorResponse, 429: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!;
    const activeMembership = await ctx.db.houseMembership.findFirst({ where: { userId: ctx.userId, status: "ACTIVE" }, select: { id: true } });
    if (!activeMembership) return bad(reply, 403, "Нет доступа к загрузке медиа");
    const currentTime = now().getTime();
    if (++uploadSweepCount % 100 === 0) {
      for (const [userId, attempts] of uploadAttempts) {
        const active = attempts.filter((time) => currentTime - time < 60_000);
        if (active.length) uploadAttempts.set(userId, active);
        else uploadAttempts.delete(userId);
      }
    }
    const recent = (uploadAttempts.get(ctx.userId) ?? []).filter((time) => currentTime - time < 60_000);
    if (recent.length >= 10) return reply.header("Retry-After", String(Math.max(1, Math.ceil((60_000 - (currentTime - recent[0])) / 1000)))).code(429).send({ message: "Слишком много загрузок" });
    recent.push(currentTime);
    uploadAttempts.set(ctx.userId, recent);
    let part;
    try { part = await request.file(); } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) return bad(reply, 413, "Файл слишком большой");
      throw error;
    }
    if (!part || part.fieldname !== "file") return bad(reply, 400, "Ожидается поле file");
    if (!["image/jpeg", "image/png", "image/webp"].includes(part.mimetype)) return bad(reply, 400, "Неподдерживаемый формат");
    let bytes: Buffer;
    try { bytes = await part.toBuffer(); } catch (error) {
      if (error instanceof app.multipartErrors.RequestFileTooLargeError) return bad(reply, 413, "Файл слишком большой");
      throw error;
    }
    let metadata;
    try { metadata = await sharp(bytes, { limitInputPixels: 50_000_000 }).metadata(); } catch { return bad(reply, 400, "Некорректное изображение"); }
    const mimeType = { jpeg: "image/jpeg", png: "image/png", webp: "image/webp" }[metadata.format as "jpeg" | "png" | "webp"];
    if (!mimeType || mimeType !== part.mimetype || !metadata.width || !metadata.height) return bad(reply, 400, "Некорректное изображение");
    const normalized = await sharp(bytes, { limitInputPixels: 50_000_000 }).autoOrient().toFormat(metadata.format as "jpeg" | "png" | "webp").toBuffer();
    const storedMetadata = await sharp(normalized).metadata();
    const sha256 = createHash("sha256").update(normalized).digest("hex");
    const extension = metadata.format === "jpeg" ? "jpg" : metadata.format!;
    const storagePath = join("blobs", sha256.slice(0, 2), sha256.slice(2, 4), `${sha256}.${extension}`);
    const fullPath = join(mediaRoot(), storagePath);
    await mkdir(resolve(fullPath, ".."), { recursive: true });
    try { await writeFile(fullPath, normalized, { flag: "wx" }); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error; }
    const blob = await ctx.db.mediaBlob.upsert({ where: { sha256 }, create: { sha256, mimeType, size: normalized.length, width: storedMetadata.width!, height: storedMetadata.height!, storagePath }, update: {} });
    const media = await ctx.db.media.create({ data: { blobId: blob.id, ownerUserId: ctx.userId, temporary: true, expiresAt: new Date(now().getTime() + 12 * 60 * 60 * 1000) } });
    return reply.code(201).send({ id: media.id });
  });

  app.get("/photo/:key", { schema: { tags: ["Media"], params: { type: "object", required: ["key"], properties: { key: { type: "string", pattern: "^(?:[a-z0-9]{12,16}|[a-z0-9]{20})$" } } }, querystring: { type: "object", properties: { w: { type: "integer", minimum: 32, maximum: 2048 }, h: { type: "integer", minimum: 32, maximum: 2048 }, fit: { type: "string", enum: ["cover", "contain"] } }, dependencies: { w: ["h"], h: ["w"] } }, response: { 400: errorResponse, 404: errorResponse, 503: errorResponse } } }, async (request, reply) => {
    if (!db) return bad(reply, 503, "База данных недоступна");
    const { key } = typedRequest<{ params: { key: string } }>(request).params;
    const { w, h, fit } = typedRequest<{ query: { w?: number; h?: number; fit?: "cover" | "contain" } }>(request).query;
    const media = await db.media.findUnique({ where: { publicKey: key }, include: { blob: true } });
    if (!media || media.temporary) return bad(reply, 404, "Фото не найдено");
    let bytes: Buffer;
    try { bytes = await readFile(join(mediaRoot(), media.blob.storagePath)); } catch { return bad(reply, 404, "Фото не найдено"); }
    if (w && h) {
      const scale = Math.min(1, media.blob.width / w, media.blob.height / h);
      bytes = await sharp(bytes).autoOrient().resize(Math.max(1, Math.floor(w * scale)), Math.max(1, Math.floor(h * scale)), { fit: fit ?? "cover", withoutEnlargement: true }).toBuffer();
    }
    const etag = createHash("sha256").update(`${key}:${w ?? 0}:${h ?? 0}:${fit ?? "cover"}`).digest("base64url");
    return reply.header("Cache-Control", "private, no-store").header("X-Robots-Tag", "noindex, nofollow, noarchive").header("ETag", `"${etag}"`).type(media.blob.mimeType).send(bytes);
  });

  if (db) {
    const timer = setInterval(() => { cleanupExpiredMedia(db, now()).catch((error: unknown) => app.log.error(error, "media cleanup failed")); }, 60 * 60 * 1000);
    timer.unref();
    app.addHook("onClose", async () => { clearInterval(timer); uploadAttempts.clear(); });
  }
}

export async function cleanupExpiredMedia(db: PrismaClient, now: Date, root = mediaRoot()) {
  const expired = await db.media.findMany({ where: { temporary: true, expiresAt: { lt: now } }, select: { id: true, blobId: true } });
  if (!expired.length) return { media: 0, blobs: 0 };
  const deleted = await db.media.deleteMany({ where: { id: { in: expired.map((item) => item.id) }, temporary: true, expiresAt: { lt: now } } });
  let blobs = 0;
  for (const blobId of new Set(expired.map((item) => item.blobId))) {
    if (await db.media.count({ where: { blobId } })) continue;
    const blob = await db.mediaBlob.findUnique({ where: { id: blobId } });
    if (!blob) continue;
    await db.mediaBlob.delete({ where: { id: blobId } });
    try { await unlink(join(root, blob.storagePath)); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    blobs++;
  }
  return { media: deleted.count, blobs };
}

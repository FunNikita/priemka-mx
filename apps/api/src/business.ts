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
import { syncLinkedObservationStatus } from "./observation-work.js";
import { recordActivity } from "./activity.js";
import { appLink, enqueueText, notifyWorkWatchers } from "./max/notifications.js";
import { createdWorkTexts, workLabel } from "./max/bot-copy.js";

const mediaRoot = () => resolve(process.env.MEDIA_DIR ?? "/app/data/media");
const maxFileSize = 10 * 1024 * 1024;
const errorResponse = { type: "object", required: ["message"], properties: { message: { type: "string" }, code: { type: "string" }, maxUserId: { type: "string" } } } as const;
const idParams = { type: "object", required: ["houseId"], properties: { houseId: { type: "integer", minimum: 1 } } } as const;
const workParams = { type: "object", required: ["workId"], properties: { workId: { type: "integer", minimum: 1 } } } as const;
const observationParams = { type: "object", required: ["observationId"], properties: { observationId: { type: "integer", minimum: 1 } } } as const;
const statusValues = ["NEW", "IN_REVIEW", "IN_PROGRESS", "WAITING", "ACCEPTED"] as const;
const statusSchema = { type: "string", enum: statusValues } as const;
const listQuery = { type: "object", properties: { status: statusSchema, page: { type: "integer", minimum: 1, default: 1 }, limit: { type: "integer", minimum: 1, maximum: 100, default: 20 } } } as const;
const worksQuery = { type: "object", properties: { ...listQuery.properties, origin: { type: "string", enum: ["MANUAL", "OBSERVATION"] } } } as const;
const observationQuery = { type: "object", properties: { tab: { type: "string", enum: ["active", "history"], default: "active" }, search: { type: "string", maxLength: 200 }, watching: { type: "boolean" }, page: listQuery.properties.page, limit: listQuery.properties.limit } } as const;
const mediaIdsProperty = { type: "array", uniqueItems: true, maxItems: 20, items: { type: "integer", minimum: 1 } } as const;
const mediaRefSchema = { type: "object", additionalProperties: false, required: ["id", "url", "width", "height", "mimeType", "size"], properties: { id: { type: "integer" }, url: { type: "string" }, width: { type: "integer" }, height: { type: "integer" }, mimeType: { type: "string" }, size: { type: "integer" } } } as const;
const executorSchema = { type: "object", additionalProperties: false, nullable: true, required: ["userId", "companyName", "representativeName"], properties: { userId: { type: "integer" }, companyName: { type: "string" }, representativeName: { type: "string", nullable: true } } } as const;
const observationExecutorSchema = { type: "object", additionalProperties: false, nullable: true, required: ["userId", "companyName"], properties: { userId: { type: "integer" }, companyName: { type: "string" } } } as const;
const linkedWorkDetailSchema = { type: "object", additionalProperties: false, nullable: true, required: ["id", "title", "description", "category", "status", "date", "createdAt", "submittedForInspectionAt", "executor", "media", "issues"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, date: { type: "string", format: "date-time" }, createdAt: { type: "string", format: "date-time" }, submittedForInspectionAt: { type: "string", format: "date-time", nullable: true }, executor: observationExecutorSchema, media: { type: "array", items: mediaRefSchema }, issues: { type: "object", additionalProperties: false, required: ["total", "open", "remediationSubmitted", "resolved"], properties: { total: { type: "integer" }, open: { type: "integer" }, remediationSubmitted: { type: "integer" }, resolved: { type: "integer" } } } } } as const;
function observationExecutorDto(work: { executorUserId: number | null; executorName: string | null }) { return work.executorUserId && work.executorName ? { userId: work.executorUserId, companyName: work.executorName } : null; }
function executorDto(work: { executorUserId: number | null; executorName: string | null; representativeName: string | null }) { return work.executorUserId && work.executorName ? { userId: work.executorUserId, companyName: work.executorName, representativeName: work.representativeName } : null; }
const workCardSchema = { type: "object", additionalProperties: false, required: ["id", "title", "description", "category", "status", "date", "isWatching", "media"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, date: { type: "string", format: "date-time" }, isWatching: { type: "boolean" }, media: { type: "array", items: mediaRefSchema } } } as const;
const authorSchema = { type: "object", additionalProperties: false, required: ["id", "firstName", "lastName"], properties: { id: { type: "integer" }, firstName: { type: "string" }, lastName: { type: "string" } } } as const;
const observationSchema = { type: "object", additionalProperties: false, required: ["id", "title", "description", "category", "status", "createdAt", "author", "media", "linkedWork", "isWatching", "actions"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, createdAt: { type: "string", format: "date-time" }, author: authorSchema, media: { type: "array", items: mediaRefSchema }, linkedWork: { type: "object", additionalProperties: false, nullable: true, required: ["id", "status"], properties: { id: { type: "integer" }, status: statusSchema } }, isWatching: { type: "boolean" }, actions: { type: "object", additionalProperties: false, required: ["createWork"], properties: { createWork: { type: "boolean" } } } } } as const;
const commentSchema = { type: "object", additionalProperties: false, required: ["id", "text", "author", "createdAt", "media"], properties: { id: { type: "integer" }, text: { type: "string" }, author: authorSchema, createdAt: { type: "string", format: "date-time" }, media: { type: "array", items: mediaRefSchema } } } as const;
const observationCommentSchema = { type: "object", additionalProperties: false, required: ["id", "text", "author", "createdAt", "media"], properties: { id: { type: "integer" }, text: { type: "string" }, author: { type: "object", additionalProperties: false, required: ["type", "displayName", "photoUrl"], properties: { type: { type: "string", enum: ["USER", "EXECUTOR"] }, displayName: { type: "string" }, photoUrl: { type: "string", nullable: true } } }, createdAt: { type: "string", format: "date-time" }, media: { type: "array", items: mediaRefSchema } } } as const;
const houseRefSchema = { type: "object", additionalProperties: false, required: ["id", "address"], properties: { id: { type: "integer" }, address: { type: "string" } } } as const;
const chatSchema = { type: "object", additionalProperties: false, required: ["title", "joinUrl"], properties: { title: { type: "string", nullable: true }, joinUrl: { type: "string" } } } as const;
const houseSummarySchema = { type: "object", additionalProperties: false, required: ["id", "address", "chat"], properties: { ...houseRefSchema.properties, chat: { ...chatSchema, nullable: true } } } as const;
const houseActionsSchema = { type: "object", additionalProperties: false, required: ["manageChat"], properties: { manageChat: { type: "boolean" } } } as const;
const worksResponseSchema = { type: "object", additionalProperties: false, required: ["house", "actions", "items", "page", "limit", "total"], properties: { house: houseSummarySchema, actions: houseActionsSchema, items: { type: "array", items: workCardSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const representativeSchema = { type: "object", additionalProperties: false, nullable: true, required: ["id", "name", "phone", "maxUrl"], properties: { id: { type: "integer" }, name: { type: "string" }, phone: { type: "string", nullable: true }, maxUrl: { type: "string", nullable: true } } } as const;
const workActionsSchema = { type: "object", additionalProperties: false, required: ["watch", "unwatch", "comment", "edit", "submitForInspection", "reportRemediation", "assignInspector", "performInspection", "generateReasonedRefusal", "generateAcceptanceAct", "confirmAcceptance", "manageDocuments"], properties: { watch: { type: "boolean" }, unwatch: { type: "boolean" }, comment: { type: "boolean" }, edit: { type: "boolean" }, submitForInspection: { type: "boolean" }, reportRemediation: { type: "boolean" }, assignInspector: { type: "boolean" }, performInspection: { type: "boolean" }, generateReasonedRefusal: { type: "boolean" }, generateAcceptanceAct: { type: "boolean" }, confirmAcceptance: { type: "boolean" }, manageDocuments: { type: "boolean" } } } as const;
const documentSchema = { type: "object", additionalProperties: false, required: ["id", "type", "title", "version", "status", "createdAt", "confirmedAt", "fileUrl", "actions"], properties: { id: { type: "integer" }, type: { type: "string" }, title: { type: "string" }, version: { type: "integer" }, status: { type: "string" }, createdAt: { type: "string", format: "date-time" }, confirmedAt: { type: "string", format: "date-time", nullable: true }, fileUrl: { type: "string" }, actions: { type: "object", additionalProperties: false, required: ["confirm"], properties: { confirm: { type: "boolean" } } } } } as const;
const workDetailSchema = {
  type: "object", additionalProperties: false,
  required: ["id", "house", "houseObject", "sourceObservation", "title", "description", "category", "status", "date", "dates", "history", "media", "executor", "representative", "isWatching", "actions", "documents"],
  properties: {
    id: { type: "integer" }, house: houseRefSchema,
    houseObject: { type: "object", additionalProperties: false, nullable: true, required: ["id", "title"], properties: { id: { type: "integer" }, title: { type: "string" } } },
    sourceObservation: { type: "object", additionalProperties: false, nullable: true, required: ["id", "title", "description", "category", "createdAt", "author", "media"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, createdAt: { type: "string", format: "date-time" }, author: authorSchema, media: { type: "array", items: mediaRefSchema } } },
    title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, date: { type: "string", format: "date-time" },
    dates: { type: "object", additionalProperties: false, required: ["createdAt", "updatedAt", "completedAt", "submittedForInspectionAt"], properties: { createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, completedAt: { type: "string", format: "date-time", nullable: true }, submittedForInspectionAt: { type: "string", format: "date-time", nullable: true } } },
    history: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "event", "details", "createdAt"], properties: { id: { type: "integer" }, event: { type: "string" }, details: { type: "string", nullable: true }, createdAt: { type: "string", format: "date-time" } } } },
    media: { type: "array", items: mediaRefSchema }, executor: executorSchema, representative: representativeSchema,
    isWatching: { type: "boolean" }, actions: workActionsSchema, documents: { type: "array", description: "По одной записи на документ: только версия с наибольшим номером.", items: documentSchema },
  },
} as const;
const observationListSchema = { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: observationSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const commentsListSchema = { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: commentSchema }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const observationCreatedSchema = { type: "object", additionalProperties: false, required: ["id", "status"], properties: { id: { type: "integer" }, status: statusSchema } } as const;
const observationDetailSchema = { type: "object", additionalProperties: false, required: ["id", "house", "title", "description", "category", "status", "author", "createdAt", "updatedAt", "media", "linkedWork", "isWatching", "watchReason", "workflow", "history", "comments", "myTasks", "actions"], properties: {
  id: { type: "integer" }, house: houseRefSchema, title: { type: "string" }, description: { type: "string" }, category: { type: "string" }, status: statusSchema, author: authorSchema, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" }, media: { type: "array", items: mediaRefSchema }, linkedWork: linkedWorkDetailSchema, isWatching: { type: "boolean" }, watchReason: { type: "string", nullable: true, enum: ["AUTHOR", "MANUAL", null] },
  workflow: { type: "object", additionalProperties: false, nullable: true, required: ["workId", "category", "executor", "submittedForInspectionAt", "inspection", "issueCounters", "issues", "documents"], properties: { workId: { type: "integer" }, category: { type: "string" }, executor: observationExecutorSchema, submittedForInspectionAt: { type: "string", format: "date-time", nullable: true }, inspection: { type: "object", additionalProperties: false, nullable: true, required: ["id", "status", "inspector"], properties: { id: { type: "integer" }, status: { type: "string" }, inspector: { ...authorSchema, nullable: true } } }, issueCounters: { type: "object", additionalProperties: false, required: ["total", "open", "remediationSubmitted", "resolved"], properties: { total: { type: "integer" }, open: { type: "integer" }, remediationSubmitted: { type: "integer" }, resolved: { type: "integer" } } }, issues: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "description", "status", "photos", "remediation", "reinspections", "actions"], properties: { id: { type: "integer" }, title: { type: "string" }, description: { type: "string" }, status: { type: "string" }, photos: { type: "array", items: mediaRefSchema }, remediation: { type: "object", additionalProperties: false, nullable: true, required: ["comment", "photos"], properties: { comment: { type: "string" }, photos: { type: "array", items: mediaRefSchema } } }, reinspections: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "status", "result", "completedAt"], properties: { id: { type: "integer" }, status: { type: "string" }, result: { type: "string", nullable: true }, completedAt: { type: "string", format: "date-time", nullable: true } } } }, actions: { type: "object", additionalProperties: false, required: ["submitRemediation"], properties: { submitRemediation: { type: "boolean" } } } } } }, documents: { type: "array", items: documentSchema } } },
  history: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "title", "createdAt"], properties: { id: { type: "integer" }, title: { type: "string" }, createdAt: { type: "string", format: "date-time" } } } }, comments: { type: "array", items: observationCommentSchema }, myTasks: { type: "object", additionalProperties: false, required: ["inspectionAssignmentId", "reinspectionIds"], properties: { inspectionAssignmentId: { type: "integer", nullable: true }, reinspectionIds: { type: "array", items: { type: "integer" } } } },
  actions: { type: "object", additionalProperties: false, required: ["comment", "watch", "unwatch", "createWork", "assignExecutor", "submitForInspection", "assignInspector", "generateReasonedRefusal", "confirmAcceptance"], properties: { comment: { type: "boolean" }, watch: { type: "boolean" }, unwatch: { type: "boolean" }, createWork: { type: "boolean" }, assignExecutor: { type: "boolean" }, submitForInspection: { type: "boolean" }, assignInspector: { type: "boolean" }, generateReasonedRefusal: { type: "boolean" }, confirmAcceptance: { type: "boolean" } } },
} } as const;
const activityListSchema = { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "event", "subjectType", "subjectId", "subjectKey", "actorUserId", "actorName", "actorRole", "metadata", "createdAt"], properties: { id: { type: "integer" }, event: { type: "string" }, subjectType: { type: "string" }, subjectId: { type: "integer", nullable: true }, subjectKey: { type: "string", nullable: true }, actorUserId: { type: "integer", nullable: true }, actorName: { type: "string", nullable: true }, actorRole: { type: "string", nullable: true }, metadata: { type: "object", nullable: true, additionalProperties: true }, createdAt: { type: "string", format: "date-time" } } } }, page: { type: "integer" }, limit: { type: "integer" }, total: { type: "integer" } } } as const;
const idResponseSchema = { type: "object", additionalProperties: false, required: ["id"], properties: { id: { type: "integer" } } } as const;
export const mediaUploadBodySchema = { type: "object", additionalProperties: false, required: ["file"], properties: { file: { type: "string", format: "binary" } } } as const;
export const photoResponseSchema = { type: "string", format: "binary" } as const;

type Context = { db: PrismaClient; userId: number; isAdmin: boolean };
type Membership = { role: string; status: string; executorCompanyName: string | null };

function canAssignExecutor<T extends Membership & { userId: number }>(candidate: T | null, actor: Membership | null, executorUserId: number, actorUserId: number, allowSelfRoleSwitch: boolean): candidate is T {
  return !!candidate && candidate.status === "ACTIVE" && !!candidate.executorCompanyName?.trim() &&
    (candidate.role === "EXECUTOR" || (allowSelfRoleSwitch && actor?.status === "ACTIVE" && actor.role === "CHAIRMAN" && executorUserId === actorUserId && candidate.userId === actorUserId));
}

export function permissionsFor(role: string | null, status: string | null) {
  const active = status === "ACTIVE";
  const residentSide = active && ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN"].includes(role ?? "");
  const chatManager = active && ["CHAIRMAN", "COUNCIL_MEMBER"].includes(role ?? "");
  return {
    viewWorks: active,
    viewObservations: residentSide,
    viewHouseChat: residentSide,
    createObservation: residentSide,
    commentWork: active,
    watchWork: active,
    manageHouseChat: chatManager,
    assignInspector: active && role === "CHAIRMAN",
    performInspection: active && role === "COUNCIL_MEMBER",
    reviewJoinRequests: active && role === "CHAIRMAN",
  };
}


function mediaRef(media: { id: number; publicKey: string | null; blob: { width: number; height: number; mimeType: string; size: number } }) {
  return { id: media.id, url: `/photo/${media.publicKey}`, width: media.blob.width, height: media.blob.height, mimeType: media.blob.mimeType, size: media.blob.size };
}

function author(user: { id: number; firstName: string; lastName: string }) {
  return { id: user.id, firstName: user.firstName, lastName: user.lastName };
}

function activityTitle(event: string, metadata: unknown): string | null {
  const titles: Record<string, string> = {
    OBSERVATION_CREATED: "Обращение создано", WORK_CREATED: "Назначен исполнитель", EXECUTOR_CHANGED: "Исполнитель изменён",
    SUBMITTED_FOR_INSPECTION: "Передано на проверку", INSPECTION_ASSIGNED: "Назначен проверяющий", INSPECTION_COMPLETED: "Проверка завершена",
    REMEDIATION_SUBMITTED: "Исполнитель сообщил об устранении", REINSPECTION_COMPLETED: "Повторная проверка завершена",
    DOCUMENT_CONFIRMED: "Акт подтверждён", WORK_ACCEPTED: "Обращение принято",
  };
  if (event === "INSPECTION_COMPLETED" && metadata && typeof metadata === "object" && "issueCount" in metadata && typeof metadata.issueCount === "number" && metadata.issueCount > 0) return `Проверка завершена. Найдено ${metadata.issueCount} замечаний`;
  if (event === "REINSPECTION_COMPLETED" && metadata && typeof metadata === "object" && "result" in metadata) return metadata.result === "RESOLVED" ? "Повторная проверка завершена. Замечание устранено" : "Повторная проверка завершена. Требуется повторное устранение";
  return titles[event] ?? null;
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
  const permissions = permissionsFor(m?.role ?? null, m?.status ?? null);
  return permissions[permission] ? { membership: m, permissions } : null;
}

async function workAccess(ctx: Context, workId: number) {
  const work = await ctx.db.work.findUnique({ where: { id: workId }, include: { house: true, houseObject: true, sourceObservation: { include: { author: true, media: { where: { temporary: false }, include: { blob: true } } } }, executor: { select: { id: true, firstName: true, lastName: true } }, media: { where: { temporary: false }, include: { blob: true } }, history: { orderBy: { createdAt: "asc" } } } });
  if (!work) return null;
  const m = await houseAccess(ctx, work.houseId, "viewWorks");
  return m && (m.membership?.role !== "EXECUTOR" || work.executorUserId === ctx.userId) ? { work, permissions: m.permissions } : null;
}

async function attachMedia(db: PrismaClient, ownerUserId: number, mediaIds: number[], target: { observationId?: number; commentId?: number; workId?: number }) {
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
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now, { required: !!config.previewAccessRequired, db });
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    await auth.call(app, request, reply, () => undefined);
    if (reply.sent) return;
    if (!db) return bad(reply, 503, "База данных недоступна");
    const identity = await users.upsertFromMax({ user: request.maxInitData!.user, authDate: request.maxInitData!.authDate, seenAt: now() });
    request.business = { db, userId: identity.id, isAdmin: identity.isAdmin };
  };
  const secured = { preHandler: authenticate };
  const security = [{ maxInitData: [] }];

  app.post("/api/houses/:houseId/works", { ...secured, schema: { tags: ["Works"], security, params: idParams, body: { type: "object", additionalProperties: false, required: ["executorUserId", "title", "description", "category"], properties: { executorUserId: { type: "integer", minimum: 1 }, sourceObservationId: { type: "integer", minimum: 1 }, title: { type: "string", minLength: 1, maxLength: 255 }, description: { type: "string", minLength: 1, maxLength: 10000 }, category: { type: "string", minLength: 1, maxLength: 100 } } }, response: { 201: idResponseSchema, 400: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { houseId } = request.params as { houseId: number };
    const input = request.body as { executorUserId: number; sourceObservationId?: number; title: string; description: string; category: string };
    if (!await ctx.db.house.findUnique({ where: { id: houseId }, select: { id: true } })) return bad(reply, 404, "Дом не найден");
    const chair = await membership(ctx, houseId);
    if (chair?.status !== "ACTIVE" || chair.role !== "CHAIRMAN") return bad(reply, 403, "Работу создаёт председатель дома");
    const candidate = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: input.executorUserId } }, include: { user: true } });
    if (!canAssignExecutor(candidate, chair, input.executorUserId, ctx.userId, config.allowSelfRoleSwitch === true)) return bad(reply, 400, "Нужен активный исполнитель с компанией");
    if (!input.title.trim() || !input.description.trim() || !input.category.trim()) return bad(reply, 400, "Заполните данные работы");
    if (!await ctx.db.checklistTemplate.count({ where: { active: true, category: input.category.trim() } })) return bad(reply, 400, "Выберите категорию из активных чек-листов");
    const created = await ctx.db.$transaction(async (tx) => {
      let observationTitle: string | null = null;
      if (input.sourceObservationId) {
        await tx.$queryRaw`SELECT id FROM Observation WHERE id = ${input.sourceObservationId} FOR UPDATE`;
        const source = await tx.observation.findUnique({ where: { id: input.sourceObservationId }, include: { linkedWork: { select: { id: true } } } });
        if (!source) throw new Error("OBSERVATION_MISSING");
        if (source.houseId !== houseId) throw new Error("OBSERVATION_HOUSE_MISMATCH");
        if (source.linkedWork) throw new Error("OBSERVATION_LINKED");
        observationTitle = source.title;
      }
      const work = await tx.work.create({ data: { houseId, sourceObservationId: input.sourceObservationId ?? null, executorUserId: candidate.userId, executorName: candidate.executorCompanyName!.trim(), representativeName: `${candidate.user.firstName} ${candidate.user.lastName}`.trim(), title: input.title.trim(), description: input.description.trim(), category: input.category.trim(), status: "NEW" } });
      await tx.workExecutorAssignment.create({ data: { workId: work.id, userId: candidate.userId } });
      if (input.sourceObservationId) {
        const watchers = await tx.observationSubscription.findMany({ where: { observationId: input.sourceObservationId }, select: { userId: true } });
        for (const watcher of watchers) await tx.workSubscription.upsert({ where: { workId_userId: { workId: work.id, userId: watcher.userId } }, create: { workId: work.id, userId: watcher.userId, sourceObservationId: input.sourceObservationId }, update: {} });
      }
      if (input.sourceObservationId) await syncLinkedObservationStatus(tx, work.id, "IN_PROGRESS");
      await tx.workHistory.create({ data: { workId: work.id, event: "WORK_CREATED", details: `Исполнитель ${candidate.userId}` } });
      await recordActivity(tx, { event: "WORK_CREATED", subjectType: "WORK", subjectId: work.id, houseId, workId: work.id, observationId: input.sourceObservationId, actorUserId: ctx.userId, metadata: { executorUserId: candidate.userId, category: work.category } });
      const texts = createdWorkTexts(work, candidate.executorCompanyName!.trim(), observationTitle);
      await notifyWorkWatchers(tx, config.botName, work.id, "created", texts.general, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: candidate.userId, text: texts.executor }] });
      return work;
    }).catch((cause: unknown) => {
      if (cause instanceof Error && cause.message === "OBSERVATION_MISSING") return "OBSERVATION_MISSING" as const;
      if (cause instanceof Error && cause.message === "OBSERVATION_HOUSE_MISMATCH") return "OBSERVATION_HOUSE_MISMATCH" as const;
      if (cause instanceof Error && (cause.message === "OBSERVATION_LINKED" || ("code" in cause && cause.code === "P2002"))) return "OBSERVATION_LINKED" as const;
      throw cause;
    });
    if (created === "OBSERVATION_MISSING") return bad(reply, 404, "Наблюдение не найдено");
    if (created === "OBSERVATION_HOUSE_MISMATCH") return bad(reply, 400, "Наблюдение относится к другому дому");
    if (created === "OBSERVATION_LINKED") return bad(reply, 409, "По наблюдению уже создана работа");
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
      await syncLinkedObservationStatus(tx, workId, "IN_REVIEW");
      await tx.workHistory.create({ data: { workId, event: "SUBMITTED_FOR_INSPECTION" } });
      await recordActivity(tx, { event: "SUBMITTED_FOR_INSPECTION", subjectType: "WORK", subjectId: workId, houseId: current.houseId, workId, observationId: current.sourceObservationId ?? undefined, actorUserId: ctx.userId });
      const chairmen = await tx.houseMembership.findMany({ where: { houseId: current.houseId, role: "CHAIRMAN", status: "ACTIVE" }, select: { userId: true, role: true, status: true } });
      await notifyWorkWatchers(tx, config.botName, workId, "submitted", `💼 Работа ${workLabel(current)} передана на проверку.`, { previewRequired: config.previewAccessRequired, actionRecipients: chairmen.filter((member) => member.role === "CHAIRMAN" && member.status === "ACTIVE").map((member) => ({ userId: member.userId, text: `💼 Работа ${workLabel(current)} передана на проверку.\n\nВам нужно назначить проверяющего.` })) });
      return at;
    });
    return submitted ? { submittedForInspectionAt: submitted } : bad(reply, 409, "Работа уже находится на проверке");
  });

  app.get("/api/houses/:houseId/works", { ...secured, schema: { tags: ["Works"], security, params: idParams, querystring: worksQuery, response: { 200: worksResponseSchema, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const query = typedRequest<{ query: { status?: string; origin?: "MANUAL" | "OBSERVATION"; page?: number; limit?: number } }>(request).query;
    const ctx = request.business!;
    const access = await houseAccess(ctx, houseId, "viewWorks");
    if (!access) return bad(reply, 403, "Нет доступа к дому");
    const house = await ctx.db.house.findUnique({ where: { id: houseId }, include: { chat: true } });
    if (!house) return bad(reply, 404, "Дом не найден");
    const { page, limit, skip } = pageOf(query);
    const where = { houseId, ...(access.membership?.role === "EXECUTOR" ? { executorUserId: ctx.userId } : {}), ...(query.status ? { status: query.status as (typeof statusValues)[number] } : {}), ...(query.origin ? { sourceObservationId: query.origin === "MANUAL" ? null : { not: null } } : {}) };
    const [total, works] = await Promise.all([ctx.db.work.count({ where }), ctx.db.work.findMany({ where, skip, take: limit, orderBy: [{ date: "desc" }, { id: "desc" }], include: { media: { where: { temporary: false }, include: { blob: true } }, subscriptions: { where: { userId: ctx.userId }, select: { id: true } }, sourceObservation: { select: { authorId: true } } } })]);
    return { house: { id: house.id, address: house.address, chat: access.permissions.viewHouseChat && house.chat ? { title: house.chat.title, joinUrl: house.chat.joinUrl } : null }, actions: { manageChat: access.permissions.manageHouseChat }, items: works.map((work) => ({ id: work.id, title: work.title, description: work.description, category: work.category, status: work.status, date: work.date, isWatching: work.subscriptions.length > 0 || work.sourceObservation?.authorId === ctx.userId, media: work.media.map(mediaRef) })), page, limit, total };
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
    const effectiveWatching = !!watching || work.sourceObservation?.authorId === ctx.userId;
    const hasAcceptanceAct = documents.some((document) => document.type === "ACCEPTANCE_ACT");
    const canConfirm = (type: string, status: string, confirmations: { userId: number; roleSnapshot: string }[]) => work.status !== "ACCEPTED" && type === "ACCEPTANCE_ACT" && status === "FINAL" && ((executor && !confirmations.some((item) => item.roleSnapshot === "EXECUTOR") && !confirmations.length) || (representative && confirmations.some((item) => item.roleSnapshot === "EXECUTOR") && !confirmations.some((item) => item.roleSnapshot === "CHAIRMAN")));
    const documentItems = documents.flatMap((document) => {
      const version = document.versions[0];
      return version ? [{ id: document.id, type: document.type, title: document.title, version: version.version, status: version.status, createdAt: version.createdAt, confirmedAt: version.confirmedAt, fileUrl: `/doc/${version.publicKey}.pdf`, actions: { confirm: canConfirm(document.type, version.status, version.confirmations) } }] : [];
    });
    return { id: work.id, house: { id: work.house.id, address: work.house.address }, houseObject: work.houseObject ? { id: work.houseObject.id, title: work.houseObject.title } : null, sourceObservation: work.sourceObservation ? { id: work.sourceObservation.id, title: work.sourceObservation.title, description: work.sourceObservation.description, category: work.sourceObservation.category, createdAt: work.sourceObservation.createdAt, author: author(work.sourceObservation.author), media: work.sourceObservation.media.map(mediaRef) } : null, title: work.title, description: work.description, category: work.category, status: work.status, date: work.date, dates: { createdAt: work.createdAt, updatedAt: work.updatedAt, completedAt: work.completedAt, submittedForInspectionAt: work.submittedForInspectionAt }, history: work.history.map((event) => ({ id: event.id, event: event.event, details: event.details, createdAt: event.createdAt })), media: work.media.map(mediaRef), executor: executorDto(work), representative: work.executor ? { id: work.executor.id, name: work.representativeName ?? `${work.executor.firstName} ${work.executor.lastName}`.trim(), phone: null, maxUrl: null } : null, isWatching: effectiveWatching, documents: documentItems, actions: { watch: permissions.watchWork && !effectiveWatching, unwatch: permissions.watchWork && !!watching && work.sourceObservation?.authorId !== ctx.userId, comment: permissions.commentWork, edit: chair && work.status === "NEW" && !work.submittedForInspectionAt && !inspections, reportRemediation: executor && !!openIssues, submitForInspection: executor && work.status === "NEW" && !work.submittedForInspectionAt, assignInspector: chair && work.status === "NEW" && !!work.submittedForInspectionAt && !inspections, performInspection: membership?.status === "ACTIVE" && membership.role === "COUNCIL_MEMBER" && !!myAssignments, generateReasonedRefusal: !!refusalChair && !!activeIssues, generateAcceptanceAct: executor && work.status === "WAITING" && !!completedInspections && !activeIssues && !hasAcceptanceAct, confirmAcceptance: documentItems.some((item) => item.type === "ACCEPTANCE_ACT" && item.actions.confirm), manageDocuments: chair || executor } };
  });

  app.get("/api/works/:workId/observation", { ...secured, schema: { tags: ["Works"], security, params: workParams, response: { 200: { type: "object", additionalProperties: false, required: ["observationId"], properties: { observationId: { type: "integer", nullable: true } } }, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { workId } = request.params as { workId: number };
    const work = await ctx.db.work.findUnique({ where: { id: workId }, select: { houseId: true, sourceObservationId: true, executorUserId: true } });
    if (!work) return bad(reply, 404, "Работа не найдена");
    const member = await membership(ctx, work.houseId);
    if (member?.status !== "ACTIVE" || (member.role === "EXECUTOR" && work.executorUserId !== ctx.userId && !await ctx.db.workExecutorAssignment.count({ where: { workId, userId: ctx.userId } }))) return bad(reply, 404, "Работа не найдена");
    return { observationId: work.sourceObservationId };
  });

  app.get("/api/works/:workId/activity", { ...secured, schema: { tags: ["Works"], security, params: workParams, querystring: { type: "object", properties: { page: listQuery.properties.page, limit: listQuery.properties.limit } }, response: { 200: activityListSchema, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { workId } = request.params as { workId: number };
    if (!await workAccess(ctx, workId)) return bad(reply, 404, "Работа не найдена");
    const { page, limit, skip } = pageOf(request.query as { page?: number; limit?: number });
    const where = { workId };
    const [total, items] = await Promise.all([ctx.db.activityEvent.count({ where }), ctx.db.activityEvent.findMany({ where, skip, take: limit, orderBy: { id: "asc" } })]);
    return { items, page, limit, total };
  });

  app.patch("/api/works/:workId", { ...secured, schema: { tags: ["Works"], security, params: workParams, body: { type: "object", additionalProperties: false, minProperties: 1, properties: { title: { type: "string", minLength: 1, maxLength: 255 }, description: { type: "string", minLength: 1, maxLength: 10000 }, category: { type: "string", minLength: 1, maxLength: 100 }, executorUserId: { type: "integer", minimum: 1 }, addMediaIds: mediaIdsProperty, removeMediaIds: mediaIdsProperty } }, response: { 200: idResponseSchema, 400: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { workId } = request.params as { workId: number };
    const input = request.body as { title?: string; description?: string; category?: string; executorUserId?: number; addMediaIds?: number[]; removeMediaIds?: number[] };
    const work = await ctx.db.work.findUnique({ where: { id: workId } });
    if (!work) return bad(reply, 404, "Работа не найдена");
    const m = await membership(ctx, work.houseId);
    if (m?.status !== "ACTIVE" || m.role !== "CHAIRMAN") return bad(reply, 403, "Работу редактирует председатель дома");
    if (input.title !== undefined && !input.title.trim() || input.description !== undefined && !input.description.trim()) return bad(reply, 400, "Название и описание не должны быть пустыми");
    if (input.category !== undefined && !await ctx.db.checklistTemplate.count({ where: { active: true, category: input.category.trim() } })) return bad(reply, 400, "Выберите категорию из активных чек-листов");
    const candidate = input.executorUserId !== undefined ? await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId: work.houseId, userId: input.executorUserId } }, include: { user: true } }) : null;
    if (input.executorUserId !== undefined && (!candidate || candidate.status !== "ACTIVE" || candidate.role !== "EXECUTOR" || !candidate.executorCompanyName?.trim())) return bad(reply, 400, "Нужен активный исполнитель с компанией");
    try {
      const changed = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${workId} FOR UPDATE`;
        const current = await tx.work.findUniqueOrThrow({ where: { id: workId } });
        if (current.status !== "NEW" || current.submittedForInspectionAt || await tx.inspection.count({ where: { workId } })) throw new Error("WORK_NOT_EDITABLE");
        const before = { title: current.title, description: current.description, category: current.category, executorUserId: current.executorUserId, companyName: current.executorName, representativeName: current.representativeName };
        const remove = input.removeMediaIds ?? [];
        if (remove.length) {
          const found = await tx.media.findMany({ where: { id: { in: remove }, workId, temporary: false }, select: { id: true } });
          if (found.length !== remove.length) throw new Error("INVALID_MEDIA");
          await tx.media.updateMany({ where: { id: { in: remove }, workId }, data: { workId: null, temporary: true, expiresAt: new Date(now().getTime() + 12 * 60 * 60 * 1000) } });
        }
        await attachMedia(tx as PrismaClient, ctx.userId, input.addMediaIds ?? [], { workId });
        const updated = await tx.work.update({ where: { id: workId }, data: { ...(input.title !== undefined ? { title: input.title.trim() } : {}), ...(input.description !== undefined ? { description: input.description.trim() } : {}), ...(input.category !== undefined ? { category: input.category.trim() } : {}), ...(candidate ? { executorUserId: candidate.userId, executorName: candidate.executorCompanyName!.trim(), representativeName: `${candidate.user.firstName} ${candidate.user.lastName}`.trim() } : {}) } });
        if (candidate && candidate.userId !== current.executorUserId) {
          await tx.workExecutorAssignment.updateMany({ where: { workId, unassignedAt: null }, data: { unassignedAt: now() } });
          await tx.workExecutorAssignment.create({ data: { workId, userId: candidate.userId } });
        }
        await tx.workHistory.create({ data: { workId, event: "WORK_EDITED", details: JSON.stringify({ fields: Object.keys(input) }) } });
        const activity = { subjectType: "WORK", subjectId: workId, houseId: current.houseId, workId, observationId: current.sourceObservationId ?? undefined, actorUserId: ctx.userId };
        const after = { title: updated.title, description: updated.description, category: updated.category, executorUserId: updated.executorUserId, companyName: updated.executorName, representativeName: updated.representativeName };
        const changedFields = Object.keys(before).filter((field) => before[field as keyof typeof before] !== after[field as keyof typeof after]);
        await recordActivity(tx, { ...activity, event: "WORK_EDITED", metadata: { before: Object.fromEntries(changedFields.map((field) => [field, before[field as keyof typeof before]])), after: Object.fromEntries(changedFields.map((field) => [field, after[field as keyof typeof after]])) } });
        if (candidate && candidate.userId !== before.executorUserId) {
          await recordActivity(tx, { ...activity, event: "EXECUTOR_CHANGED", metadata: { previousExecutorUserId: before.executorUserId, executorUserId: updated.executorUserId } });
          await notifyWorkWatchers(tx, config.botName, workId, `executor_changed:${candidate.userId}:${now().getTime()}`, `По работе ${workLabel(updated)} назначен другой исполнитель.`, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: candidate.userId, text: `Вы назначены исполнителем работы ${workLabel(updated)}.` }] });
        }
        if ((input.addMediaIds ?? []).length || remove.length) await recordActivity(tx, { ...activity, event: "WORK_MEDIA_CHANGED", metadata: { added: (input.addMediaIds ?? []).length, removed: remove.length } });
        return updated;
      });
      return { id: changed.id };
    } catch (error) {
      if (error instanceof Error && error.message === "WORK_NOT_EDITABLE") return bad(reply, 409, "Работа уже передана на проверку");
      if (error instanceof Error && error.message === "INVALID_MEDIA") return bad(reply, 400, "Некорректные mediaIds");
      throw error;
    }
  });

  for (const method of ["POST", "DELETE"] as const) {
    app.route({ method, url: "/api/works/:workId/watch", ...secured, schema: { tags: ["Works"], security, params: workParams, response: { 204: { type: "null" }, 404: errorResponse, 409: errorResponse } }, handler: async (request, reply) => {
      const { workId } = typedRequest<{ params: { workId: number } }>(request).params;
      const ctx = request.business!;
      const access = await workAccess(ctx, workId);
      if (!access || !access.permissions.watchWork) return bad(reply, 404, "Работа не найдена");
      if (method === "DELETE" && access.work.sourceObservation?.authorId === ctx.userId) return reply.code(409).send({ message: "Автор обращения обязан наблюдать за работой", code: "AUTHOR_WATCH_REQUIRED" });
      await ctx.db.$transaction(async (tx) => {
        if (method === "POST") {
          const inserted = await tx.workSubscription.createMany({ data: [{ workId, userId: ctx.userId }], skipDuplicates: true });
          if (inserted.count) await recordActivity(tx, { event: "WORK_WATCHED", subjectType: "WORK", subjectId: workId, houseId: access.work.houseId, workId, observationId: access.work.sourceObservationId ?? undefined, actorUserId: ctx.userId });
        } else {
          const deleted = await tx.workSubscription.deleteMany({ where: { workId, userId: ctx.userId } });
          if (access.work.sourceObservationId) await tx.observationSubscription.deleteMany({ where: { observationId: access.work.sourceObservationId, userId: ctx.userId, reason: "MANUAL" } });
          if (deleted.count) await recordActivity(tx, { event: "WORK_UNWATCHED", subjectType: "WORK", subjectId: workId, houseId: access.work.houseId, workId, observationId: access.work.sourceObservationId ?? undefined, actorUserId: ctx.userId });
        }
      });
      return reply.code(204).send();
    } });
  }

  app.put("/api/observations/:observationId/executor", { ...secured, schema: { tags: ["Observations"], security, params: observationParams, body: { type: "object", additionalProperties: false, required: ["executorUserId"], properties: { executorUserId: { type: "integer", minimum: 1 }, category: { type: "string", minLength: 1, maxLength: 100 } } }, response: { 200: idResponseSchema, 400: errorResponse, 403: errorResponse, 404: errorResponse, 409: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { observationId } = request.params as { observationId: number };
    const input = request.body as { executorUserId: number; category?: string };
    const observation = await ctx.db.observation.findUnique({ where: { id: observationId } });
    if (!observation) return bad(reply, 404, "Обращение не найдено");
    const chair = await membership(ctx, observation.houseId);
    if (chair?.status !== "ACTIVE" || chair.role !== "CHAIRMAN") return bad(reply, 403, "Исполнителя назначает председатель дома");
    const candidate = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId: observation.houseId, userId: input.executorUserId } }, include: { user: true } });
    if (!canAssignExecutor(candidate, chair, input.executorUserId, ctx.userId, config.allowSelfRoleSwitch === true)) return bad(reply, 400, "Нужен активный исполнитель с компанией");
    const category = input.category?.trim() || observation.category;
    if (!await ctx.db.checklistTemplate.count({ where: { active: true, category } })) return bad(reply, 400, "Выберите категорию из активных чек-листов");
    try {
      const work = await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM Observation WHERE id = ${observationId} FOR UPDATE`;
        const source = await tx.observation.findUniqueOrThrow({ where: { id: observationId }, include: { linkedWork: true } });
        if (!source.linkedWork) {
          const created = await tx.work.create({ data: { houseId: source.houseId, sourceObservationId: source.id, houseObjectId: source.houseObjectId, executorUserId: candidate.userId, executorName: candidate.executorCompanyName!.trim(), representativeName: `${candidate.user.firstName} ${candidate.user.lastName}`.trim(), title: source.title, description: source.description, category, status: "NEW" } });
          await tx.workExecutorAssignment.create({ data: { workId: created.id, userId: candidate.userId } });
          const watchers = await tx.observationSubscription.findMany({ where: { observationId }, select: { userId: true } });
          for (const watcher of watchers) await tx.workSubscription.upsert({ where: { workId_userId: { workId: created.id, userId: watcher.userId } }, create: { workId: created.id, userId: watcher.userId, sourceObservationId: observationId }, update: {} });
          await syncLinkedObservationStatus(tx, created.id, "IN_PROGRESS");
          await tx.workHistory.create({ data: { workId: created.id, event: "WORK_CREATED", details: `Исполнитель ${candidate.userId}` } });
          await recordActivity(tx, { event: "WORK_CREATED", subjectType: "WORK", subjectId: created.id, houseId: source.houseId, workId: created.id, observationId, actorUserId: ctx.userId, metadata: { executorUserId: candidate.userId, category } });
          const texts = createdWorkTexts(created, candidate.executorCompanyName!.trim(), source.title);
          await notifyWorkWatchers(tx, config.botName, created.id, "created", texts.general, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: candidate.userId, text: texts.executor }] });
          return created;
        }
        await tx.$queryRaw`SELECT id FROM Work WHERE id = ${source.linkedWork.id} FOR UPDATE`;
        const current = await tx.work.findUniqueOrThrow({ where: { id: source.linkedWork.id } });
        if (current.status !== "NEW" || current.submittedForInspectionAt || await tx.inspection.count({ where: { workId: current.id } })) throw new Error("WORK_NOT_EDITABLE");
        if (current.executorUserId === candidate.userId) return current;
        const changed = await tx.work.update({ where: { id: current.id }, data: { executorUserId: candidate.userId, executorName: candidate.executorCompanyName!.trim(), representativeName: `${candidate.user.firstName} ${candidate.user.lastName}`.trim(), category } });
        await tx.workExecutorAssignment.updateMany({ where: { workId: current.id, unassignedAt: null }, data: { unassignedAt: now() } });
        await tx.workExecutorAssignment.create({ data: { workId: current.id, userId: candidate.userId } });
        await tx.workHistory.create({ data: { workId: current.id, event: "EXECUTOR_CHANGED", details: `Исполнитель ${candidate.userId}` } });
        await recordActivity(tx, { event: "EXECUTOR_CHANGED", subjectType: "WORK", subjectId: current.id, houseId: source.houseId, workId: current.id, observationId, actorUserId: ctx.userId, metadata: { previousExecutorUserId: current.executorUserId, executorUserId: candidate.userId } });
        await notifyWorkWatchers(tx, config.botName, current.id, `executor_changed:${candidate.userId}:${now().getTime()}`, `По обращению «${source.title}» назначен другой исполнитель.`, { previewRequired: config.previewAccessRequired, actionRecipients: [{ userId: candidate.userId, text: `Вы назначены исполнителем обращения «${source.title}».` }] });
        return changed;
      });
      return { id: work.id };
    } catch (error) {
      if (error instanceof Error && error.message === "WORK_NOT_EDITABLE") return bad(reply, 409, "Обращение уже передано на проверку; сменить исполнителя нельзя");
      throw error;
    }
  });

  app.get("/api/houses/:houseId/observations", { ...secured, schema: { tags: ["Observations"], security, params: idParams, querystring: observationQuery, response: { 200: observationListSchema, 403: errorResponse } } }, async (request, reply) => {
    const { houseId } = typedRequest<{ params: { houseId: number } }>(request).params;
    const query = typedRequest<{ query: { tab?: "active" | "history"; search?: string; watching?: boolean; page?: number; limit?: number } }>(request).query;
    const ctx = request.business!;
    const chair = await membership(ctx, houseId);
    if (chair?.status !== "ACTIVE") return bad(reply, 403, "Нет доступа к обращениям дома");
    const canCreateWork = chair?.status === "ACTIVE" && chair.role === "CHAIRMAN";
    const { page, limit, skip } = pageOf(query);
    const history = query.tab === "history";
    const executor = chair.role === "EXECUTOR";
    const where = { houseId, ...(executor ? { linkedWork: history ? { executorAssignments: { some: { userId: ctx.userId } }, OR: [{ status: "ACCEPTED" as const }, { executorUserId: { not: ctx.userId } }] } : { executorUserId: ctx.userId, status: { not: "ACCEPTED" as const } } } : { status: history ? "ACCEPTED" as const : { not: "ACCEPTED" as const }, ...(query.watching ? { OR: [{ authorId: ctx.userId }, { subscriptions: { some: { userId: ctx.userId, reason: { in: ["AUTHOR", "MANUAL"] as ("AUTHOR" | "MANUAL")[] } } } }] } : {}) }), ...(query.search ? { AND: [{ OR: [{ title: { contains: query.search } }, { description: { contains: query.search } }] }] } : {}) };
    const [total, items] = await Promise.all([ctx.db.observation.count({ where }), ctx.db.observation.findMany({ where, skip, take: limit, orderBy: { createdAt: "desc" }, include: { author: true, linkedWork: { select: { id: true, status: true } }, media: { include: { blob: true } }, subscriptions: { where: { userId: ctx.userId }, select: { id: true } } } })]);
    return { items: items.map((item) => ({ id: item.id, title: item.title, description: item.description, category: item.category, status: item.status, createdAt: item.createdAt, author: author(item.author), media: item.media.map(mediaRef), linkedWork: item.linkedWork ?? null, isWatching: !executor && (item.authorId === ctx.userId || item.subscriptions.length > 0), actions: { createWork: canCreateWork && !item.linkedWork } })), page, limit, total };
  });

  async function observationAccess(ctx: Context, observationId: number) {
    const item = await ctx.db.observation.findUnique({ where: { id: observationId }, include: { house: true, author: true, linkedWork: { select: { id: true, status: true } }, media: { where: { temporary: false }, include: { blob: true } }, subscriptions: { where: { userId: ctx.userId } } } });
    if (!item) return null;
    const member = await membership(ctx, item.houseId);
    if (member?.status !== "ACTIVE") return null;
    if (member.role === "EXECUTOR" && (!item.linkedWork || !(await ctx.db.workExecutorAssignment.count({ where: { workId: item.linkedWork.id, userId: ctx.userId } })))) return null;
    return item;
  }

  app.get("/api/observations/:observationId", { ...secured, schema: { tags: ["Observations"], security, params: observationParams, response: { 200: observationDetailSchema, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { observationId } = request.params as { observationId: number };
    const item = await observationAccess(ctx, observationId);
    if (!item) return bad(reply, 404, "Обращение не найдено");
    const m = await membership(ctx, item.houseId);
    const subscription = item.subscriptions[0];
    const isAuthor = item.authorId === ctx.userId;
    const workId = item.linkedWork?.id;
    const [linked, events, comments] = await Promise.all([
      workId ? ctx.db.work.findUnique({ where: { id: workId }, include: { media: { where: { temporary: false }, include: { blob: true } }, issues: { include: { answer: { include: { media: { include: { blob: true } } } }, remediations: { orderBy: { createdAt: "desc" }, take: 1, include: { media: { include: { blob: true } } } }, reinspections: { orderBy: { createdAt: "desc" } } } }, inspections: { orderBy: { createdAt: "desc" }, take: 1, include: { assignments: { include: { assignee: true } } } }, documents: { include: { versions: { orderBy: { version: "desc" }, take: 1, include: { confirmations: true } } } } } }) : null,
      ctx.db.activityEvent.findMany({ where: { OR: [{ observationId }, ...(workId ? [{ workId }] : [])] }, orderBy: { id: "asc" } }),
      ctx.db.comment.findMany({ where: { OR: [{ observationId }, ...(workId ? [{ workId }] : [])] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { author: true, media: { include: { blob: true } } } }),
    ]);
    const issues = linked?.issues ?? [];
    const linkedWork = linked ? { id: linked.id, title: linked.title, description: linked.description, category: linked.category, status: linked.status, date: linked.date, createdAt: linked.createdAt, submittedForInspectionAt: linked.submittedForInspectionAt, executor: observationExecutorDto(linked), media: linked.media.map(mediaRef), issues: { total: issues.length, open: issues.filter((issue) => issue.status === "OPEN").length, remediationSubmitted: issues.filter((issue) => issue.status === "REMEDIATION_SUBMITTED").length, resolved: issues.filter((issue) => issue.status === "RESOLVED").length } } : null;
    const chair = m?.role === "CHAIRMAN" && m.status === "ACTIVE";
    const executor = m?.role === "EXECUTOR" && m.status === "ACTIVE" && linked?.executorUserId === ctx.userId;
    const inspection = linked?.inspections[0] ?? null;
    const assignment = inspection?.assignments.find((entry) => entry.assigneeUserId === ctx.userId && entry.status !== "COMPLETED") ?? null;
    const reinspections = workId ? await ctx.db.reinspection.findMany({ where: { issue: { workId }, assigneeUserId: ctx.userId, status: "ASSIGNED" }, select: { id: true } }) : [];
    const documents = linked?.documents.flatMap((document) => {
      const version = document.versions[0];
      if (!version) return [];
      const confirmedByExecutor = version.confirmations.some((entry) => entry.roleSnapshot === "EXECUTOR");
      const confirmedByChair = version.confirmations.some((entry) => entry.roleSnapshot === "CHAIRMAN");
      const confirm = document.type === "ACCEPTANCE_ACT" && version.status === "FINAL" && linked.status !== "ACCEPTED" && ((executor && !confirmedByExecutor && !version.confirmations.length) || (chair && confirmedByExecutor && !confirmedByChair));
      return [{ id: document.id, type: document.type, title: document.title, version: version.version, status: version.status, createdAt: version.createdAt, confirmedAt: version.confirmedAt, fileUrl: `/doc/${version.publicKey}.pdf`, actions: { confirm } }];
    }) ?? [];
    const workflow = linked ? { workId: linked.id, category: linked.category, executor: observationExecutorDto(linked), submittedForInspectionAt: linked.submittedForInspectionAt, inspection: inspection ? { id: inspection.id, status: inspection.assignments[0]?.status ?? "ASSIGNED", inspector: inspection.assignments[0] ? author(inspection.assignments[0].assignee) : null } : null, issueCounters: linkedWork!.issues, issues: issues.map((issue) => ({ id: issue.id, title: issue.title, description: issue.description, status: issue.status, photos: issue.answer.media.map(mediaRef), remediation: issue.remediations[0] ? { comment: issue.remediations[0].comment, photos: issue.remediations[0].media.map(mediaRef) } : null, reinspections: issue.reinspections.map((entry) => ({ id: entry.id, status: entry.status, result: entry.result, completedAt: entry.completedAt })), actions: { submitRemediation: !!executor && issue.status === "OPEN" } })), documents } : null;
    const editable = !!chair && !!linked && linked.status === "NEW" && !linked.submittedForInspectionAt && !inspection;
    const residentSide = m?.role !== "EXECUTOR";
    return { id: item.id, house: { id: item.house.id, address: item.house.address }, title: item.title, description: item.description, category: item.category, status: item.status, author: author(item.author), createdAt: item.createdAt, updatedAt: item.updatedAt, media: item.media.map(mediaRef), linkedWork, workflow, history: events.flatMap((event) => { const title = activityTitle(event.event, event.metadata); return title ? [{ id: event.id, title, createdAt: event.createdAt }] : []; }), comments: comments.map((comment) => ({ id: comment.id, text: comment.text, author: comment.authorTypeSnapshot === "EXECUTOR" && comment.authorDisplayNameSnapshot ? { type: "EXECUTOR", displayName: comment.authorDisplayNameSnapshot, photoUrl: null } : { type: "USER", displayName: comment.authorDisplayNameSnapshot ?? `${comment.author.firstName} ${comment.author.lastName}`.trim(), photoUrl: comment.author.photoUrl ?? null }, createdAt: comment.createdAt, media: comment.media.map(mediaRef) })), myTasks: { inspectionAssignmentId: assignment?.id ?? null, reinspectionIds: reinspections.map((entry) => entry.id) }, isWatching: isAuthor || !!subscription, watchReason: isAuthor ? "AUTHOR" : subscription?.reason ?? null, actions: { comment: residentSide || !!executor, watch: residentSide && !isAuthor && !subscription, unwatch: residentSide && !isAuthor && !!subscription, createWork: !!chair && !linked, assignExecutor: !!chair && (!linked || editable), submitForInspection: !!executor && linked?.status === "NEW" && !linked.submittedForInspectionAt, assignInspector: !!chair && linked?.status === "NEW" && !!linked.submittedForInspectionAt && !inspection, generateReasonedRefusal: !!chair && issues.some((issue) => issue.status !== "RESOLVED"), confirmAcceptance: documents.some((document) => document.actions.confirm) } };
  });

  app.get("/api/observations/:observationId/history", { ...secured, schema: { tags: ["Observations"], security, params: observationParams, querystring: { type: "object", properties: { page: listQuery.properties.page, limit: listQuery.properties.limit } }, response: { 200: activityListSchema, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { observationId } = request.params as { observationId: number };
    if (!await observationAccess(ctx, observationId)) return bad(reply, 404, "Обращение не найдено");
    const { page, limit, skip } = pageOf(request.query as { page?: number; limit?: number });
    const where = { observationId };
    const [total, items] = await Promise.all([ctx.db.activityEvent.count({ where }), ctx.db.activityEvent.findMany({ where, skip, take: limit, orderBy: { id: "asc" } })]);
    return { items, page, limit, total };
  });

  for (const method of ["POST", "DELETE"] as const) {
    app.route({ method, url: "/api/observations/:observationId/watch", ...secured, schema: { tags: ["Observations"], security, params: observationParams, response: { 204: { type: "null" }, 404: errorResponse, 409: errorResponse } }, handler: async (request, reply) => {
      const ctx = request.business!, { observationId } = request.params as { observationId: number };
      const item = await observationAccess(ctx, observationId);
      if (!item) return bad(reply, 404, "Обращение не найдено");
      if ((await membership(ctx, item.houseId))?.role === "EXECUTOR") return bad(reply, 404, "Обращение не найдено");
      if (method === "DELETE" && item.authorId === ctx.userId) return reply.code(409).send({ message: "Автор обращения обязан наблюдать за ним", code: "AUTHOR_WATCH_REQUIRED" });
      if (method === "POST") {
        await ctx.db.$transaction(async (tx) => {
          const inserted = await tx.observationSubscription.createMany({ data: [{ observationId, userId: ctx.userId, reason: "MANUAL" }], skipDuplicates: true });
          if (!inserted.count) return;
          if (item.linkedWork) await tx.workSubscription.upsert({ where: { workId_userId: { workId: item.linkedWork.id, userId: ctx.userId } }, create: { workId: item.linkedWork.id, userId: ctx.userId, sourceObservationId: observationId }, update: {} });
          await recordActivity(tx, { event: "OBSERVATION_WATCHED", subjectType: "OBSERVATION", subjectId: observationId, houseId: item.houseId, observationId, actorUserId: ctx.userId });
          const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { maxUserId: true } });
          await enqueueText(tx, { key: `observation:${observationId}:watch:${ctx.userId}`, maxUserId: user.maxUserId, text: `👀 Вы подписались на обновления обращения «${item.title}»\n\nЯ сообщу здесь, когда по нему изменится важный этап.`, buttonText: "Открыть обращение", buttonUrl: appLink(config.botName, "observation", observationId), recipientUserId: ctx.userId, houseId: item.houseId, accessKind: "OBSERVATION", subjectId: observationId });
        });
      } else {
        await ctx.db.$transaction(async (tx) => {
          const deleted = await tx.observationSubscription.deleteMany({ where: { observationId, userId: ctx.userId, reason: "MANUAL" } });
          if (item.linkedWork) await tx.workSubscription.deleteMany({ where: { workId: item.linkedWork.id, userId: ctx.userId, sourceObservationId: observationId } });
          if (deleted.count) await recordActivity(tx, { event: "OBSERVATION_UNWATCHED", subjectType: "OBSERVATION", subjectId: observationId, houseId: item.houseId, observationId, actorUserId: ctx.userId });
        });
      }
      return reply.code(204).send();
    } });
  }

  app.get("/api/observations/:observationId/comments", { ...secured, schema: { tags: ["Comments"], security, params: observationParams, querystring: { type: "object", properties: { page: listQuery.properties.page, limit: listQuery.properties.limit } }, response: { 200: commentsListSchema, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { observationId } = request.params as { observationId: number };
    if (!await observationAccess(ctx, observationId)) return bad(reply, 404, "Обращение не найдено");
    const { page, limit, skip } = pageOf(request.query as { page?: number; limit?: number });
    const where = { observationId };
    const [total, items] = await Promise.all([ctx.db.comment.count({ where }), ctx.db.comment.findMany({ where, skip, take: limit, orderBy: { id: "asc" }, include: { author: true, media: { include: { blob: true } } } })]);
    return { items: items.map((item) => ({ id: item.id, text: item.text, author: author(item.author), createdAt: item.createdAt, media: item.media.map(mediaRef) })), page, limit, total };
  });

  app.post("/api/observations/:observationId/comments", { ...secured, schema: { tags: ["Comments"], security, params: observationParams, body: { type: "object", additionalProperties: false, properties: { text: { type: "string", maxLength: 10000 }, mediaIds: mediaIdsProperty } }, response: { 201: idResponseSchema, 400: errorResponse, 404: errorResponse } } }, async (request, reply) => {
    const ctx = request.business!, { observationId } = request.params as { observationId: number };
    const item = await observationAccess(ctx, observationId);
    if (!item) return bad(reply, 404, "Обращение не найдено");
    const member = await membership(ctx, item.houseId);
    const executorComment = member?.role === "EXECUTOR" && !!item.linkedWork;
    const linkedWork = executorComment ? await ctx.db.work.findUnique({ where: { id: item.linkedWork!.id }, select: { executorUserId: true, executorName: true } }) : null;
    if (executorComment && linkedWork?.executorUserId !== ctx.userId) return bad(reply, 404, "Обращение не найдено");
    if (executorComment && !linkedWork?.executorName?.trim()) return bad(reply, 409, "Не указана компания назначенной работы");
    const input = request.body as { text?: string; mediaIds?: number[] };
    if (!input.text?.trim() && !input.mediaIds?.length) return bad(reply, 400, "Пустой комментарий");
    try {
      const comment = await ctx.db.$transaction(async (tx) => {
        const currentUser = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId } });
        const created = await tx.comment.create({ data: { observationId, authorId: ctx.userId, text: input.text?.trim() ?? "", authorTypeSnapshot: executorComment ? "EXECUTOR" : "USER", authorDisplayNameSnapshot: executorComment ? linkedWork!.executorName!.trim() : `${currentUser.firstName} ${currentUser.lastName}`.trim() } });
        await attachMedia(tx as PrismaClient, ctx.userId, input.mediaIds ?? [], { commentId: created.id });
        await recordActivity(tx, { event: "OBSERVATION_COMMENT_ADDED", subjectType: "OBSERVATION", subjectId: observationId, houseId: item.houseId, observationId, actorUserId: ctx.userId, metadata: { commentId: created.id } });
        return created;
      });
      return reply.code(201).send({ id: comment.id });
    } catch (error) {
      if (error instanceof Error && error.message === "INVALID_MEDIA") return bad(reply, 400, "Некорректные mediaIds");
      throw error;
    }
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
        await tx.observationSubscription.create({ data: { observationId: item.id, userId: ctx.userId, reason: "AUTHOR" } });
        await recordActivity(tx, { event: "OBSERVATION_CREATED", subjectType: "OBSERVATION", subjectId: item.id, houseId, observationId: item.id, actorUserId: ctx.userId, metadata: { category: item.category } });
        const user = await tx.user.findUniqueOrThrow({ where: { id: ctx.userId }, select: { maxUserId: true } });
        await enqueueText(tx, { key: `observation:${item.id}:author`, maxUserId: user.maxUserId, text: `✅ Обращение создано\n\n«${item.title}»\n\nЯ напишу здесь, когда по обращению изменится важный этап.`, buttonText: "Открыть обращение", buttonUrl: appLink(config.botName, "observation", item.id), recipientUserId: ctx.userId, houseId, accessKind: "OBSERVATION", subjectId: item.id });
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
        await recordActivity(tx, { event: "WORK_COMMENT_ADDED", subjectType: "WORK", subjectId: workId, houseId: access.work.houseId, workId, observationId: access.work.sourceObservationId ?? undefined, actorUserId: ctx.userId, metadata: { commentId: created.id } });
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

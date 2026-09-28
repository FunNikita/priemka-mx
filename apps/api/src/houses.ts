import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { permissionsFor } from "./business.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";
import { recordActivity } from "./activity.js";
import { appLink, enqueueActionForUser } from "./max/notifications.js";

const id = { type: "integer", minimum: 1 } as const;
const str = { type: "string" } as const;
const error = { type: "object", additionalProperties: false, required: ["message"], properties: { message: str, code: str, maxUserId: str } } as const;
const page = { type: "integer", minimum: 1, default: 1 } as const;
const limit = { type: "integer", minimum: 1, maximum: 100, default: 20 } as const;
const status = { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] } as const;
const role = { type: "string", enum: ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN", "EXECUTOR"] } as const;
const joinedVia = { type: "string", enum: ["CHAT", "INVITE", "REQUEST", "ADMIN"] } as const;
const params = { type: "object", required: ["houseId"], properties: { houseId: id } } as const;
const membershipParams = { type: "object", required: ["houseId", "membershipId"], properties: { houseId: id, membershipId: id } } as const;
const emptyBody = { type: "object", additionalProperties: false, properties: {} } as const;
const membershipView = { type: "object", additionalProperties: false, required: ["id", "houseId", "role", "status", "joinedVia", "executorCompanyName", "createdAt", "updatedAt"], properties: { id, houseId: id, role, status, joinedVia, executorCompanyName: { ...str, nullable: true }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } } as const;
const houseView = { type: "object", additionalProperties: false, required: ["id", "address", "access", "actions"], properties: { id, address: str, access: { type: "object", additionalProperties: false, required: ["status", "role", "joinedVia"], properties: { status: { type: "string", enum: ["NONE", "PENDING", "ACTIVE", "REJECTED"] }, role: { ...role, nullable: true }, joinedVia: { ...joinedVia, nullable: true } } }, actions: { type: "object", additionalProperties: false, required: ["open", "requestAccess", "cancelRequest"], properties: { open: { type: "boolean" }, requestAccess: { type: "boolean" }, cancelRequest: { type: "boolean" } } } } } as const;
const requestView = { type: "object", additionalProperties: false, required: [...membershipView.required, "requestedAt", "user"], properties: { ...membershipView.properties, requestedAt: { type: "string", format: "date-time" }, user: { type: "object", additionalProperties: false, required: ["id", "firstName", "lastName", "photoUrl"], properties: { id, firstName: str, lastName: str, photoUrl: { ...str, nullable: true } } } } } as const;
const list = (item: object) => ({ type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: item }, page: id, limit: id, total: { type: "integer", minimum: 0 } } });
const failure = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ message });
const view = (m: { id: number; houseId: number; role: string; status: string; joinedVia: string; executorCompanyName?: string | null; createdAt: Date; updatedAt: Date }) => ({ id: m.id, houseId: m.houseId, role: m.role, status: m.status, joinedVia: m.joinedVia, executorCompanyName: m.executorCompanyName ?? null, createdAt: m.createdAt, updatedAt: m.updatedAt });

export async function registerHousesApi(app: FastifyInstance, config: AppConfig, users: UserRepository, now: () => Date, businessDb?: PrismaClient) {
  const db = businessDb ?? (users instanceof PrismaUserRepository ? users.prisma : null);
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now, { required: !!config.previewAccessRequired, db });
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    await auth.call(app, request, reply, () => undefined);
    if (reply.sent) return;
    if (!db) return failure(reply, 503, "База данных недоступна");
    const identity = await users.upsertFromMax({ user: request.maxInitData!.user, authDate: request.maxInitData!.authDate, seenAt: now() });
    request.business = { db, userId: identity.id, isAdmin: identity.isAdmin };
  };
  const guarded = { preHandler: authenticate };
  const security = [{ maxInitData: [] }];
  async function notifyChairmenOfRequest(request: { id: number; houseId: number; requestedAt: Date }) {
    const house = await db!.house.findUnique({ where: { id: request.houseId }, select: { address: true } });
    const chairmen = await db!.houseMembership.findMany({ where: { houseId: request.houseId, role: "CHAIRMAN", status: "ACTIVE" }, select: { userId: true, role: true, status: true } });
    for (const chair of chairmen.filter((member) => member.role === "CHAIRMAN" && member.status === "ACTIVE")) {
      await enqueueActionForUser(db!, { key: `join_request:${request.id}:${request.requestedAt.getTime()}:chair:${chair.userId}`, userId: chair.userId, houseId: request.houseId, accessKind: "JOIN_REVIEW", subjectId: request.id, previewRequired: !!config.previewAccessRequired, text: `🆕 Поступила новая заявка жителя на вступление в дом по адресу: ${house!.address}. Рассмотрите её.`, buttonText: "Открыть заявку", buttonUrl: appLink(config.botName, "join_request", request.id) });
    }
  }

  const company = { type: "string", maxLength: 255 } as const;
  const updateBody = { type: "object", additionalProperties: false, required: ["role"], properties: { role, executorCompanyName: company } } as const;
  const adminBody = { type: "object", additionalProperties: false, required: ["role", "status"], properties: { role, status, executorCompanyName: company } } as const;
  async function saveMembership(houseId: number, userId: number, input: { role: "RESIDENT" | "COUNCIL_MEMBER" | "CHAIRMAN" | "EXECUTOR"; status?: "PENDING" | "ACTIVE" | "REJECTED"; executorCompanyName?: string }, self: boolean, actorUserId: number) {
    return db!.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM House WHERE id = ${houseId} FOR UPDATE`;
      const house = await tx.house.findUnique({ where: { id: houseId }, select: { id: true } });
      if (!house) throw new Error("HOUSE_MISSING");
      const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
      if (!user) throw new Error("USER_MISSING");
      const current = await tx.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId } } });
      if (self && current?.status !== "ACTIVE") throw new Error("NOT_ACTIVE");
      const nextStatus = self ? "ACTIVE" : input.status!;
      const companyName = input.executorCompanyName === undefined ? current?.executorCompanyName ?? null : input.executorCompanyName.trim() || null;
      if (input.role === "EXECUTOR" && !companyName) throw new Error("COMPANY_REQUIRED");
      if (input.role === "CHAIRMAN" && nextStatus === "ACTIVE") {
        const another = await tx.houseMembership.findFirst({ where: { houseId, role: "CHAIRMAN", status: "ACTIVE", userId: { not: userId } }, select: { id: true } });
        if (another) throw new Error("CHAIR_EXISTS");
      }
      const before = { role: current?.role ?? null, status: current?.status ?? null, executorCompanyName: current?.executorCompanyName ?? null };
      const saved = await tx.houseMembership.upsert({ where: { houseId_userId: { houseId, userId } }, create: { houseId, userId, role: input.role, status: nextStatus, joinedVia: "ADMIN", executorCompanyName: companyName }, update: { role: input.role, status: nextStatus, ...(input.executorCompanyName !== undefined ? { executorCompanyName: companyName } : {}) } });
      await recordActivity(tx, { event: "MEMBERSHIP_CHANGED", subjectType: "MEMBERSHIP", subjectId: saved.id, houseId, actorUserId, metadata: { userId, before, after: { role: saved.role, status: saved.status, executorCompanyName: saved.executorCompanyName } } });
      return saved;
    });
  }
  function membershipError(reply: FastifyReply, cause: unknown) {
    if (!(cause instanceof Error)) throw cause;
    if (cause.message === "HOUSE_MISSING" || cause.message === "USER_MISSING") return failure(reply, 404, "Дом или пользователь не найден");
    if (cause.message === "NOT_ACTIVE") return failure(reply, 403, "Нужно активное членство");
    if (cause.message === "COMPANY_REQUIRED") return failure(reply, 400, "Укажите компанию исполнителя");
    if (cause.message === "CHAIR_EXISTS") return failure(reply, 409, "У дома уже есть активный председатель");
    throw cause;
  }
  app.patch("/api/me/houses/:houseId/membership", { ...guarded, schema: { tags: ["Memberships"], security, params, body: updateBody, response: { 200: membershipView, 400: error, 403: error, 404: error, 409: error } } }, async (request, reply) => {
    if (!config.allowSelfRoleSwitch) return failure(reply, 403, "Самостоятельная смена роли отключена");
    const ctx = request.business!, { houseId } = request.params as { houseId: number };
    try { return view(await saveMembership(houseId, ctx.userId, request.body as { role: "RESIDENT" | "COUNCIL_MEMBER" | "CHAIRMAN" | "EXECUTOR"; executorCompanyName?: string }, true, ctx.userId)); }
    catch (cause) { return membershipError(reply, cause); }
  });
  app.get("/api/admin/users", { ...guarded, schema: { tags: ["Admin"], security, querystring: { type: "object", properties: { q: { ...str, maxLength: 200 }, page, limit } }, response: { 200: { type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "maxUserId", "firstName", "lastName", "username", "photoUrl", "memberships"], properties: { id, maxUserId: str, firstName: str, lastName: str, username: { ...str, nullable: true }, photoUrl: { ...str, nullable: true }, memberships: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "houseId", "houseAddress", "role", "status", "joinedVia", "executorCompanyName"], properties: { id, houseId: id, houseAddress: str, role, status, joinedVia, executorCompanyName: { ...str, nullable: true } } } } } } }, page, limit, total: { type: "integer" } } }, 403: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const query = request.query as { q?: string; page?: number; limit?: number }, p = query.page ?? 1, l = query.limit ?? 20, q = query.q?.trim();
    const where = q ? { OR: [{ firstName: { contains: q } }, { lastName: { contains: q } }, { username: { contains: q } }, { maxUserId: { contains: q } }] } : {};
    const [total, users] = await Promise.all([ctx.db.user.count({ where }), ctx.db.user.findMany({ where, skip: (p - 1) * l, take: l, orderBy: { id: "asc" }, include: { memberships: { include: { house: { select: { address: true } } } } } })]);
    return { page: p, limit: l, total, items: users.map((user) => ({ id: user.id, maxUserId: user.maxUserId, firstName: user.firstName, lastName: user.lastName, username: user.username, photoUrl: user.photoUrl, memberships: user.memberships.map((m) => ({ id: m.id, houseId: m.houseId, houseAddress: m.house.address, role: m.role, status: m.status, joinedVia: m.joinedVia, executorCompanyName: m.executorCompanyName })) })) };
  });
  app.put("/api/admin/houses/:houseId/members/:userId", { ...guarded, schema: { tags: ["Admin"], security, params: { type: "object", required: ["houseId", "userId"], properties: { houseId: id, userId: id } }, body: adminBody, response: { 200: membershipView, 400: error, 403: error, 404: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const { houseId, userId } = request.params as { houseId: number; userId: number };
    try { return view(await saveMembership(houseId, userId, request.body as { role: "RESIDENT" | "COUNCIL_MEMBER" | "CHAIRMAN" | "EXECUTOR"; status: "PENDING" | "ACTIVE" | "REJECTED"; executorCompanyName?: string }, false, ctx.userId)); }
    catch (cause) { return membershipError(reply, cause); }
  });

  app.put("/api/me/last-house", { ...guarded, schema: { tags: ["Identity"], security, body: { type: "object", additionalProperties: false, required: ["houseId"], properties: { houseId: id } }, response: { 200: { type: "object", additionalProperties: false, required: ["lastHouseId"], properties: { lastHouseId: id } }, 403: error } } }, async (request, reply) => {
    const ctx = request.business!, { houseId } = request.body as { houseId: number };
    const active = await ctx.db.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId: ctx.userId } } });
    if (active?.status !== "ACTIVE") return failure(reply, 403, "Нужно активное членство в доме");
    await ctx.db.user.update({ where: { id: ctx.userId }, data: { lastHouseId: houseId } });
    return { lastHouseId: houseId };
  });

  app.post("/api/admin/houses", { ...guarded, schema: { tags: ["Admin"], security, body: { type: "object", additionalProperties: false, required: ["address"], properties: { address: { type: "string", minLength: 1, maxLength: 512 } } }, response: { 201: { type: "object", additionalProperties: false, required: ["id", "address"], properties: { id, address: str } }, 400: error, 403: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const address = (request.body as { address: string }).address.trim();
    if (!address) return failure(reply, 400, "Укажите адрес дома");
    const created = await ctx.db.$transaction(async (tx) => {
      if (await tx.house.findFirst({ where: { address }, select: { id: true } })) return null;
      const house = await tx.house.create({ data: { address } });
      await recordActivity(tx, { event: "HOUSE_CREATED", subjectType: "HOUSE", subjectId: house.id, houseId: house.id, actorUserId: ctx.userId });
      return house;
    });
    return created ? reply.code(201).send({ id: created.id, address: created.address }) : failure(reply, 409, "Дом с таким адресом уже существует");
  });

  app.delete("/api/admin/houses/:houseId/members/:userId", { ...guarded, schema: { tags: ["Admin"], security, params: { type: "object", required: ["houseId", "userId"], properties: { houseId: id, userId: id } }, response: { 204: { type: "null" }, 403: error, 404: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const { houseId, userId } = request.params as { houseId: number; userId: number };
    try {
      await ctx.db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM House WHERE id = ${houseId} FOR UPDATE`;
        const current = await tx.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId } } });
        if (!current) throw new Error("MEMBERSHIP_MISSING");
        if (current.status === "ACTIVE" && current.role === "EXECUTOR" && await tx.work.count({ where: { houseId, executorUserId: userId, status: { not: "ACCEPTED" } } })) throw new Error("ACTIVE_WORKS");
        if (current.status === "ACTIVE" && current.role === "COUNCIL_MEMBER") {
          if (await tx.inspectionAssignment.count({ where: { assigneeUserId: userId, status: { not: "COMPLETED" }, inspection: { work: { houseId } } } }) || await tx.reinspection.count({ where: { assigneeUserId: userId, status: { not: "COMPLETED" }, issue: { work: { houseId } } } })) throw new Error("ACTIVE_INSPECTIONS");
        }
        await recordActivity(tx, { event: "MEMBERSHIP_REMOVED", subjectType: "MEMBERSHIP", subjectId: current.id, houseId, actorUserId: ctx.userId, metadata: { userId, role: current.role, status: current.status } });
        await tx.houseMembership.delete({ where: { id: current.id } });
        await tx.user.updateMany({ where: { id: userId, lastHouseId: houseId }, data: { lastHouseId: null } });
      });
      return reply.code(204).send();
    } catch (cause) {
      if (cause instanceof Error && cause.message === "MEMBERSHIP_MISSING") return failure(reply, 404, "Участник дома не найден");
      if (cause instanceof Error && ["ACTIVE_WORKS", "ACTIVE_INSPECTIONS"].includes(cause.message)) return failure(reply, 409, "У участника есть незавершённые назначения");
      throw cause;
    }
  });

  app.get("/api/admin/preview-access", { ...guarded, schema: { tags: ["Admin"], security, querystring: { type: "object", properties: { q: { type: "string", maxLength: 32 }, page, limit } }, response: { 200: list({ type: "object", additionalProperties: false, required: ["maxUserId", "enabled", "createdAt", "updatedAt"], properties: { maxUserId: str, enabled: { type: "boolean" }, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } }), 403: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const query = request.query as { q?: string; page?: number; limit?: number }, currentPage = query.page ?? 1, currentLimit = query.limit ?? 20;
    const where = query.q ? { maxUserId: { contains: query.q } } : {};
    const [total, items] = await Promise.all([ctx.db.previewAccess.count({ where }), ctx.db.previewAccess.findMany({ where, skip: (currentPage - 1) * currentLimit, take: currentLimit, orderBy: { maxUserId: "asc" } })]);
    return { items, page: currentPage, limit: currentLimit, total };
  });

  app.put("/api/admin/preview-access/:maxUserId", { ...guarded, schema: { tags: ["Admin"], security, params: { type: "object", required: ["maxUserId"], properties: { maxUserId: { type: "string", pattern: "^[1-9][0-9]{0,31}$" } } }, body: { type: "object", additionalProperties: false, required: ["enabled"], properties: { enabled: { type: "boolean" } } }, response: { 200: { type: "object", additionalProperties: false, required: ["maxUserId", "enabled"], properties: { maxUserId: str, enabled: { type: "boolean" } } }, 403: error } } }, async (request, reply) => {
    const ctx = request.business!;
    if (!ctx.isAdmin) return failure(reply, 403, "Только системный администратор");
    const { maxUserId } = request.params as { maxUserId: string }, { enabled } = request.body as { enabled: boolean };
    const result = await ctx.db.$transaction(async (tx) => {
      const old = await tx.previewAccess.findUnique({ where: { maxUserId } });
      const saved = await tx.previewAccess.upsert({ where: { maxUserId }, create: { maxUserId, enabled }, update: { enabled } });
      if (old?.enabled !== enabled) await recordActivity(tx, { event: "PREVIEW_ACCESS_CHANGED", subjectType: "PREVIEW_ACCESS", subjectKey: maxUserId, actorUserId: ctx.userId, metadata: { before: { enabled: old?.enabled ?? null }, after: { enabled } } });
      return saved;
    });
    return { maxUserId: result.maxUserId, enabled: result.enabled };
  });

  app.get("/api/houses", { ...guarded, preValidation: async (request) => {
    const query = request.query as { q?: unknown };
    if (typeof query.q === "string") query.q = query.q.trim();
  }, schema: { tags: ["Houses"], security, querystring: { type: "object", properties: { q: { type: "string", maxLength: 200 }, page, limit } }, response: { 200: list(houseView), 400: error, 401: error } } }, async (request) => {
    const ctx = request.business!;
    const query = request.query as { q?: string; page?: number; limit?: number };
    const currentPage = query.page ?? 1;
    const currentLimit = query.limit ?? 20;
    const q = query.q?.trim();
    const where = q ? { address: { contains: q } } : {};
    const [total, houses] = await Promise.all([
      ctx.db.house.count({ where }),
      ctx.db.house.findMany({ where, skip: (currentPage - 1) * currentLimit, take: currentLimit, orderBy: [{ address: "asc" }, { id: "asc" }], select: { id: true, address: true, memberships: { where: { userId: ctx.userId }, select: { role: true, status: true, joinedVia: true } } } }),
    ]);
    return { items: houses.map((house) => {
      const m = house.memberships[0];
      return { id: house.id, address: house.address, access: { status: m?.status ?? "NONE", role: m?.role ?? null, joinedVia: m?.joinedVia ?? null }, actions: { open: m?.status === "ACTIVE", requestAccess: !m || (m.role === "RESIDENT" && m.status === "REJECTED"), cancelRequest: m?.role === "RESIDENT" && m.status === "PENDING" && m.joinedVia === "REQUEST" } };
    }), page: currentPage, limit: currentLimit, total };
  });

  app.post("/api/houses/:houseId/join-requests", { ...guarded, preValidation: async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).length) { failure(reply, 400, "Заявка не принимает данные пользователя"); return; }
  }, schema: { tags: ["Join requests"], security, params, body: emptyBody, response: { 200: membershipView, 201: membershipView, 400: error, 401: error, 404: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId } = request.params as { houseId: number };
    if (!await ctx.db.house.findUnique({ where: { id: houseId }, select: { id: true } })) return failure(reply, 404, "Дом не найден");
    const key = { houseId_userId: { houseId, userId: ctx.userId } };
    let current = await ctx.db.houseMembership.findUnique({ where: key });
    if (!current) {
      try {
        const created = await ctx.db.houseMembership.create({ data: { houseId, userId: ctx.userId, role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST" } });
        await notifyChairmenOfRequest(created);
        return reply.code(201).send(view(created));
      } catch (cause) {
        if (typeof cause !== "object" || cause === null || !("code" in cause) || cause.code !== "P2002") throw cause;
        current = await ctx.db.houseMembership.findUnique({ where: key });
      }
    }
    if (!current) return failure(reply, 409, "Заявка изменилась, повторите запрос");
    if (current.role !== "RESIDENT") return failure(reply, 409, "Роль участника нельзя изменить заявкой");
    if (current.status === "ACTIVE") return failure(reply, 409, "Пользователь уже состоит в доме");
    if (current.status === "PENDING") return current.joinedVia === "REQUEST" ? view(current) : failure(reply, 409, "Уже есть заявка из другого источника");
    const changed = await ctx.db.houseMembership.updateMany({ where: { id: current.id, role: "RESIDENT", status: "REJECTED" }, data: { status: "PENDING", joinedVia: "REQUEST", requestedAt: now() } });
    if (!changed.count) return failure(reply, 409, "Заявка изменилась, повторите запрос");
    const renewed = await ctx.db.houseMembership.findUniqueOrThrow({ where: { id: current.id } });
    await notifyChairmenOfRequest(renewed);
    return view(renewed);
  });

  app.delete("/api/houses/:houseId/join-requests/me", { ...guarded, schema: { tags: ["Join requests"], security, params, response: { 204: { type: "null" }, 401: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId } = request.params as { houseId: number };
    await ctx.db.houseMembership.deleteMany({ where: { houseId, userId: ctx.userId, role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST" } });
    return reply.code(204).send();
  });

  async function canReview(houseId: number, userId: number) {
    const m = await db!.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId } }, select: { role: true, status: true } });
    return permissionsFor(m?.role ?? null, m?.status ?? null).reviewJoinRequests;
  }

  app.get("/api/houses/:houseId/join-requests", { ...guarded, schema: { tags: ["Join requests"], security, params, querystring: { type: "object", properties: { status: { ...status, default: "PENDING" }, page, limit } }, response: { 200: list(requestView), 400: error, 401: error, 403: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId } = request.params as { houseId: number };
    if (!await canReview(houseId, ctx.userId)) return failure(reply, 403, "Нет права рассматривать заявки");
    const query = request.query as { status?: "PENDING" | "ACTIVE" | "REJECTED"; page?: number; limit?: number };
    const currentPage = query.page ?? 1;
    const currentLimit = query.limit ?? 20;
    const where = { houseId, role: "RESIDENT" as const, status: query.status ?? "PENDING" };
    const [total, items] = await Promise.all([
      ctx.db.houseMembership.count({ where }),
      ctx.db.houseMembership.findMany({ where, skip: (currentPage - 1) * currentLimit, take: currentLimit, orderBy: [{ requestedAt: "asc" }, { id: "asc" }], include: { user: { select: { id: true, firstName: true, lastName: true, photoUrl: true } } } }),
    ]);
    return { items: items.map((m) => ({ ...view(m), requestedAt: m.requestedAt, user: m.user })), page: currentPage, limit: currentLimit, total };
  });

  app.patch("/api/houses/:houseId/join-requests/:membershipId", { ...guarded, preValidation: async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).some((key) => key !== "decision")) { failure(reply, 400, "Разрешено только решение по заявке"); return; }
  }, schema: { tags: ["Join requests"], security, params: membershipParams, body: { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { type: "string", enum: ["APPROVE", "REJECT"] } } }, response: { 200: membershipView, 400: error, 401: error, 403: error, 404: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId, membershipId } = request.params as { houseId: number; membershipId: number };
    const { decision } = request.body as { decision: "APPROVE" | "REJECT" };
    if (!await canReview(houseId, ctx.userId)) return failure(reply, 403, "Нет права рассматривать заявки");
    const current = await ctx.db.houseMembership.findUnique({ where: { id: membershipId } });
    if (!current || current.houseId !== houseId || current.role !== "RESIDENT") return failure(reply, 404, "Заявка не найдена");
    const target = decision === "APPROVE" ? "ACTIVE" : "REJECTED";
    if (current.status === target) return view(current);
    if (current.status !== "PENDING") return failure(reply, 409, "Заявка уже рассмотрена");
    const changed = await ctx.db.houseMembership.updateMany({ where: { id: membershipId, houseId, role: "RESIDENT", status: "PENDING" }, data: { status: target } });
    if (!changed.count) return failure(reply, 409, "Заявка уже изменена");
    const reviewed = await ctx.db.houseMembership.findUniqueOrThrow({ where: { id: membershipId } });
    const house = await ctx.db.house.findUnique({ where: { id: houseId }, select: { address: true } });
    await enqueueActionForUser(ctx.db, { key: `join_request:${membershipId}:${reviewed.requestedAt.getTime()}:${target}`, userId: reviewed.userId, houseId, accessKind: "JOIN_RESULT", subjectId: membershipId, previewRequired: !!config.previewAccessRequired, text: target === "ACTIVE" ? `Ваша заявка на вступление в дом по адресу: ${house!.address} одобрена.` : `Ваша заявка на вступление в дом по адресу: ${house!.address} была отклонена.`, buttonText: target === "ACTIVE" ? "Открыть сервис" : "", buttonUrl: target === "ACTIVE" ? `https://max.ru/${config.botName}?startapp` : "" });
    return view(reviewed);
  });
}

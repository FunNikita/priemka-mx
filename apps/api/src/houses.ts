import type { FastifyInstance, FastifyReply, preHandlerHookHandler } from "fastify";
import type { PrismaClient } from "../generated/prisma/client.js";
import type { AppConfig } from "./config.js";
import { permissionsFor } from "./business.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";

const id = { type: "integer", minimum: 1 } as const;
const str = { type: "string" } as const;
const error = { type: "object", additionalProperties: false, required: ["message"], properties: { message: str } } as const;
const page = { type: "integer", minimum: 1, default: 1 } as const;
const limit = { type: "integer", minimum: 1, maximum: 100, default: 20 } as const;
const status = { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] } as const;
const role = { type: "string", enum: ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN", "EXECUTOR"] } as const;
const joinedVia = { type: "string", enum: ["CHAT", "INVITE", "REQUEST", "ADMIN"] } as const;
const params = { type: "object", required: ["houseId"], properties: { houseId: id } } as const;
const membershipParams = { type: "object", required: ["houseId", "membershipId"], properties: { houseId: id, membershipId: id } } as const;
const emptyBody = { type: "object", additionalProperties: false, properties: {} } as const;
const membershipView = { type: "object", additionalProperties: false, required: ["id", "houseId", "role", "status", "joinedVia", "createdAt", "updatedAt"], properties: { id, houseId: id, role, status, joinedVia, createdAt: { type: "string", format: "date-time" }, updatedAt: { type: "string", format: "date-time" } } } as const;
const houseView = { type: "object", additionalProperties: false, required: ["id", "address", "access", "actions"], properties: { id, address: str, access: { type: "object", additionalProperties: false, required: ["status", "role", "joinedVia"], properties: { status: { type: "string", enum: ["NONE", "PENDING", "ACTIVE", "REJECTED"] }, role: { ...role, nullable: true }, joinedVia: { ...joinedVia, nullable: true } } }, actions: { type: "object", additionalProperties: false, required: ["open", "requestAccess", "cancelRequest"], properties: { open: { type: "boolean" }, requestAccess: { type: "boolean" }, cancelRequest: { type: "boolean" } } } } } as const;
const requestView = { type: "object", additionalProperties: false, required: [...membershipView.required, "user"], properties: { ...membershipView.properties, user: { type: "object", additionalProperties: false, required: ["id", "firstName", "lastName", "photoUrl"], properties: { id, firstName: str, lastName: str, photoUrl: { ...str, nullable: true } } } } } as const;
const list = (item: object) => ({ type: "object", additionalProperties: false, required: ["items", "page", "limit", "total"], properties: { items: { type: "array", items: item }, page: id, limit: id, total: { type: "integer", minimum: 0 } } });
const failure = (reply: FastifyReply, code: number, message: string) => reply.code(code).send({ message });
const view = (m: { id: number; houseId: number; role: string; status: string; joinedVia: string; createdAt: Date; updatedAt: Date }) => ({ id: m.id, houseId: m.houseId, role: m.role, status: m.status, joinedVia: m.joinedVia, createdAt: m.createdAt, updatedAt: m.updatedAt });

export async function registerHousesApi(app: FastifyInstance, config: AppConfig, users: UserRepository, now: () => Date, businessDb?: PrismaClient) {
  const db = businessDb ?? (users instanceof PrismaUserRepository ? users.prisma : null);
  const auth = requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now);
  const authenticate: preHandlerHookHandler = async (request, reply) => {
    await auth.call(app, request, reply, () => undefined);
    if (reply.sent) return;
    if (!db) return failure(reply, 503, "База данных недоступна");
    const identity = await users.upsertFromMax({ user: request.maxInitData!.user, authDate: request.maxInitData!.authDate, seenAt: now() });
    request.business = { db, userId: identity.id, isAdmin: identity.isAdmin };
  };
  const guarded = { preHandler: authenticate };
  const security = [{ maxInitData: [] }];

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
        const created = await ctx.db.houseMembership.create({ data: { houseId, userId: ctx.userId, role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST", canSignAcceptanceAct: false, authorityBasis: null } });
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
    const changed = await ctx.db.houseMembership.updateMany({ where: { id: current.id, role: "RESIDENT", status: "REJECTED" }, data: { status: "PENDING", joinedVia: "REQUEST", canSignAcceptanceAct: false, authorityBasis: null } });
    if (!changed.count) return failure(reply, 409, "Заявка изменилась, повторите запрос");
    return view(await ctx.db.houseMembership.findUniqueOrThrow({ where: { id: current.id } }));
  });

  app.delete("/api/houses/:houseId/join-requests/me", { ...guarded, schema: { tags: ["Join requests"], security, params, response: { 204: { type: "null" }, 401: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId } = request.params as { houseId: number };
    await ctx.db.houseMembership.deleteMany({ where: { houseId, userId: ctx.userId, role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST" } });
    return reply.code(204).send();
  });

  async function canReview(houseId: number, userId: number, isAdmin: boolean) {
    const m = await db!.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId } }, select: { role: true, status: true } });
    return permissionsFor(m?.role ?? null, m?.status ?? null, isAdmin).reviewJoinRequests;
  }

  app.get("/api/houses/:houseId/join-requests", { ...guarded, schema: { tags: ["Join requests"], security, params, querystring: { type: "object", properties: { status: { ...status, default: "PENDING" }, page, limit } }, response: { 200: list(requestView), 400: error, 401: error, 403: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId } = request.params as { houseId: number };
    if (!await canReview(houseId, ctx.userId, ctx.isAdmin)) return failure(reply, 403, "Нет права рассматривать заявки");
    const query = request.query as { status?: "PENDING" | "ACTIVE" | "REJECTED"; page?: number; limit?: number };
    const currentPage = query.page ?? 1;
    const currentLimit = query.limit ?? 20;
    const where = { houseId, role: "RESIDENT" as const, joinedVia: "REQUEST" as const, status: query.status ?? "PENDING" };
    const [total, items] = await Promise.all([
      ctx.db.houseMembership.count({ where }),
      ctx.db.houseMembership.findMany({ where, skip: (currentPage - 1) * currentLimit, take: currentLimit, orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { user: { select: { id: true, firstName: true, lastName: true, photoUrl: true } } } }),
    ]);
    return { items: items.map((m) => ({ ...view(m), user: m.user })), page: currentPage, limit: currentLimit, total };
  });

  app.patch("/api/houses/:houseId/join-requests/:membershipId", { ...guarded, preValidation: async (request, reply) => {
    if (!request.body || typeof request.body !== "object" || Array.isArray(request.body) || Object.keys(request.body).some((key) => key !== "decision")) { failure(reply, 400, "Разрешено только решение по заявке"); return; }
  }, schema: { tags: ["Join requests"], security, params: membershipParams, body: { type: "object", additionalProperties: false, required: ["decision"], properties: { decision: { type: "string", enum: ["APPROVE", "REJECT"] } } }, response: { 200: membershipView, 400: error, 401: error, 403: error, 404: error, 409: error } } }, async (request, reply) => {
    const ctx = request.business!;
    const { houseId, membershipId } = request.params as { houseId: number; membershipId: number };
    const { decision } = request.body as { decision: "APPROVE" | "REJECT" };
    if (!await canReview(houseId, ctx.userId, ctx.isAdmin)) return failure(reply, 403, "Нет права рассматривать заявки");
    const current = await ctx.db.houseMembership.findUnique({ where: { id: membershipId } });
    if (!current || current.houseId !== houseId || current.role !== "RESIDENT" || current.joinedVia !== "REQUEST") return failure(reply, 404, "Заявка не найдена");
    const target = decision === "APPROVE" ? "ACTIVE" : "REJECTED";
    if (current.status === target) return view(current);
    if (current.status !== "PENDING") return failure(reply, 409, "Заявка уже рассмотрена");
    const changed = await ctx.db.houseMembership.updateMany({ where: { id: membershipId, houseId, role: "RESIDENT", joinedVia: "REQUEST", status: "PENDING" }, data: { status: target } });
    if (!changed.count) return failure(reply, 409, "Заявка уже изменена");
    return view(await ctx.db.houseMembership.findUniqueOrThrow({ where: { id: membershipId } }));
  });
}

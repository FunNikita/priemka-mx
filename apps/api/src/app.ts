import staticPlugin from "@fastify/static";
import { existsSync } from "node:fs";
import { isIP } from "node:net";
import { isAbsolute, resolve } from "node:path";
import swagger from "@fastify/swagger";
import Fastify, { LogController, type FastifyBaseLogger, type FastifyInstance, type FastifyServerOptions } from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import { isValidMaxBotName } from "./max/bot-name.js";
import type { MaxInitData } from "./max/init-data.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { registerDocumentBot } from "./max/document-bot.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";
import { mediaUploadBodySchema, permissionsFor, photoResponseSchema, registerBusinessApi } from "./business.js";
import { registerWorkflowApi } from "./workflow.js";
import { registerHousesApi } from "./houses.js";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createOperationalLogStream } from "./operational-log.js";
import { validationMessage } from "./validation-error.js";

const healthSchema = {
  response: { 200: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", const: "ok" } } } },
} as const;

const unauthorizedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: { message: { type: "string" } },
} as const;

const permissionsSchema = {
  type: "object", additionalProperties: false,
  required: ["viewWorks", "viewObservations", "viewHouseChat", "createObservation", "commentWork", "watchWork", "manageHouseChat", "assignInspector", "performInspection", "reviewJoinRequests"],
  properties: {
    viewWorks: { type: "boolean" }, viewObservations: { type: "boolean" }, viewHouseChat: { type: "boolean" }, createObservation: { type: "boolean" }, commentWork: { type: "boolean" }, watchWork: { type: "boolean" },
    manageHouseChat: { type: "boolean" }, assignInspector: { type: "boolean" }, performInspection: { type: "boolean" },
    reviewJoinRequests: { type: "boolean" },
  },
} as const;

export type CreateAppOptions = {
  config?: AppConfig;
  userRepository?: UserRepository;
  logger?: FastifyServerOptions["logger"] | FastifyBaseLogger;
  logStream?: { write: (message: string) => unknown };
  staticRoot?: string;
  now?: () => Date;
  businessDb?: PrismaClient;
};

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? getConfig();
  if (!isValidMaxBotName(config.botName)) throw new Error("MAX_BOT_NAME must be a valid MAX bot name");
  const repository = options.userRepository ?? new PrismaUserRepository();
  const now = options.now ?? (() => new Date());
  const retentionDays = Number(process.env.LOG_RETENTION_DAYS ?? "14");
  if (!Number.isInteger(retentionDays) || retentionDays < 1 || retentionDays > 365) throw new Error("LOG_RETENTION_DAYS must be 1-365");
  const trustedProxyIp = process.env.TRUSTED_PROXY_IP || null;
  if (trustedProxyIp && !isIP(trustedProxyIp)) throw new Error("TRUSTED_PROXY_IP must be one IP address");
  if (process.env.APP_LOG_DIR && !isAbsolute(process.env.APP_LOG_DIR)) throw new Error("APP_LOG_DIR must be absolute");
  const operationalLog = !options.logger && !options.logStream && process.env.NODE_ENV === "production" && process.env.APP_LOG_DIR ? createOperationalLogStream(process.env.APP_LOG_DIR, retentionDays) : null;
  const app = Fastify({
    logger: options.logger ?? createDefaultLogger(options.logStream ?? operationalLog ?? undefined),
    logController: new LogController({ disableRequestLogging: true }),
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
    trustProxy: trustedProxyIp ? (address) => address === trustedProxyIp : false,
    schemaErrorFormatter: (errors) => new Error(validationMessage(errors[0])),
  });

  app.setErrorHandler((error, request, reply) => {
    const statusCode = typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number" ? error.statusCode : 500;
    if (statusCode === 500) {
      request.log.error({ err: error, requestId: request.id }, "Unexpected HTTP error");
      return reply.code(500).send({ message: "Внутренняя ошибка сервиса. Повторите попытку позже." });
    }
    return reply.send(error);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Robots-Tag", "noindex, nofollow, noarchive, nosnippet");
    return payload;
  });
  app.addHook("onResponse", async (request, reply) => {
    const path = new URL(request.url, "http://localhost").pathname;
    const actor = request.business;
    app.log.info({ event: "http_request", requestId: request.id, method: request.method, route: request.routeOptions.url ?? path, path, statusCode: reply.statusCode, durationMs: Math.round(reply.elapsedTime), remoteIp: request.ip, userAgent: request.headers["user-agent"] ?? null, actorUserId: actor?.userId ?? null, maxUserId: request.maxInitData?.user.id ?? null }, "HTTP request");
    if (reply.statusCode === 401 || reply.statusCode === 403) app.log.warn({ event: "security_event", requestId: request.id, statusCode: reply.statusCode, remoteIp: request.ip, path, actorUserId: actor?.userId ?? null }, "Access rejected");
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method) && reply.statusCode < 400 && path.startsWith("/api/")) app.log.info({ event: "domain_action", action: `${request.method} ${request.routeOptions.url ?? path}`, actorUserId: actor?.userId ?? null, remoteIp: request.ip, houseId: (request.params as { houseId?: number } | undefined)?.houseId ?? null, subjectId: (request.params as { workId?: number; observationId?: number; userId?: number } | undefined)?.workId ?? (request.params as { observationId?: number } | undefined)?.observationId ?? null }, "Domain action");
  });
  app.get("/robots.txt", { schema: { tags: ["System"], response: { 200: { type: "string" } } } }, async (_request, reply) => reply.type("text/plain; charset=utf-8").send("User-agent: *\nDisallow: /\n"));

  await app.register(swagger, {
    openapi: {
      info: { title: "Приёмка API", version: "0.1.0" },
      components: {
        securitySchemes: {
          maxInitData: { type: "apiKey", in: "header", name: "X-Max-Init-Data", description: "Исходная строка window.WebApp.initData" },
        },
      },
    },
    // The upload stays streaming at runtime; only the generated document receives its binary body schema.
    transform: ({ schema, url }) => {
      if (url === "/api/media") return { schema: { ...schema, body: mediaUploadBodySchema }, url };
      if (url === "/photo/:key") return { schema: { ...schema, produces: ["image/jpeg", "image/png", "image/webp"], response: { ...(schema.response && typeof schema.response === "object" ? schema.response : {}), 200: photoResponseSchema } }, url };
      if (url === "/doc/:key.pdf") return { schema: { ...schema, produces: ["application/pdf"], response: { ...(schema.response && typeof schema.response === "object" ? schema.response : {}), 200: { type: "string", format: "binary" } } }, url };
      return { schema, url };
    },
  });

  app.get("/api/health", { schema: { tags: ["System"], summary: "Liveness", ...healthSchema } }, async () => ({ status: "ok" }));

  app.get("/api/ready", {
    schema: {
      tags: ["System"],
      summary: "Readiness: доступность MySQL",
      response: {
        200: healthSchema.response[200],
        503: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", const: "unavailable" } } },
      },
    },
  }, async (_request, reply) => {
    if (!(await repository.isReady())) return reply.code(503).send({ status: "unavailable" });
    return { status: "ok" };
  });

  app.get("/api/me", {
    preHandler: requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now, { required: !!config.previewAccessRequired, db: options.businessDb ?? (repository instanceof PrismaUserRepository ? repository.prisma : null) }),
    schema: {
      tags: ["Identity"],
      summary: "Текущий пользователь MAX",
      security: [{ maxInitData: [] }],
      response: {
        200: {
          type: "object",
          additionalProperties: false,
          required: ["user", "auth_date", "houses", "lastHouseId"],
          properties: {
            query_id: { type: "string" },
            ip: { type: "string" },
            auth_date: { type: "integer" },
            user: {
              type: "object",
              additionalProperties: false,
              required: ["id", "maxUserId", "isAdmin", "first_name", "last_name", "username", "language_code", "photo_url"],
              properties: {
                id: { type: "integer", minimum: 1 },
                maxUserId: { type: "string", pattern: "^[1-9][0-9]*$" },
                isAdmin: { type: "boolean" },
                first_name: { type: "string" },
                last_name: { type: "string" },
                username: { type: "string", nullable: true },
                language_code: { type: "string" },
                photo_url: { type: "string", nullable: true },
              },
            },
            chat: {
              type: "object",
              additionalProperties: false,
              required: ["id", "type"],
              properties: {
                id: { type: "string", pattern: "^(?:0|-?[1-9][0-9]*)$" },
                type: { type: "string", enum: ["DIALOG", "CHAT", "CHANNEL"] },
              },
            },
            start_param: { type: "string" },
            lastHouseId: { type: "integer", nullable: true },
            houses: { type: "array", items: { type: "object", additionalProperties: false, required: ["id", "address", "role", "status", "joinedVia", "executorCompanyName", "permissions", "chat"], properties: { id: { type: "integer" }, address: { type: "string" }, role: { type: "string", enum: ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN", "EXECUTOR"] }, status: { type: "string", enum: ["PENDING", "ACTIVE", "REJECTED"] }, joinedVia: { type: "string", enum: ["CHAT", "INVITE", "REQUEST", "ADMIN"] }, executorCompanyName: { type: "string", nullable: true }, permissions: permissionsSchema, chat: { type: "object", additionalProperties: false, nullable: true, required: ["title", "joinUrl"], properties: { title: { type: "string", nullable: true }, joinUrl: { type: "string" } } } } } },
          },
        },
        401: unauthorizedSchema,
        403: { type: "object", additionalProperties: false, required: ["message", "code", "maxUserId"], properties: { message: { type: "string" }, code: { type: "string" }, maxUserId: { type: "string" } } },
      },
    },
  }, async (request) => {
    const initData = request.maxInitData!;
    const identity = await repository.upsertFromMax({ user: initData.user, authDate: initData.authDate, seenAt: now() });
    const businessDb = options.businessDb ?? (repository instanceof PrismaUserRepository ? repository.prisma : null);
    const houses = businessDb
      ? await businessDb.houseMembership.findMany({ where: { user: { maxUserId: initData.user.id } }, include: { house: { include: { chat: true } } }, orderBy: { houseId: "asc" } })
      : [];
    const lastHouseId = businessDb ? (await businessDb.user.findUnique({ where: { id: identity.id }, select: { lastHouseId: true } }))?.lastHouseId : null;
    const sorted = houses.sort((a, b) => {
      const rank = (m: typeof a) => m.status === "ACTIVE" ? (m.houseId === lastHouseId ? 0 : 1) : 2;
      return rank(a) - rank(b) || a.houseId - b.houseId;
    });
    return { ...toMaxResponse(initData, identity), lastHouseId: lastHouseId ?? null, houses: sorted.map((membership) => { const permissions = permissionsFor(membership.role, membership.status); return { id: membership.houseId, address: membership.house.address, role: membership.role, status: membership.status, joinedVia: membership.joinedVia, executorCompanyName: membership.executorCompanyName, permissions, chat: permissions.viewHouseChat && membership.house.chat ? { title: membership.house.chat.title, joinUrl: membership.house.chat.joinUrl } : null }; }) };
  });

  await registerHousesApi(app, config, repository, now, options.businessDb);
  await registerBusinessApi(app, config, repository, now, options.businessDb);
  await registerWorkflowApi(app, config, repository, now, options.businessDb);
  registerDocumentBot(app, options.businessDb ?? (repository instanceof PrismaUserRepository ? repository.prisma : null), config.botToken, config);

  const staticRoot = options.staticRoot ?? resolve(process.cwd(), "../web/dist");
  if (existsSync(staticRoot)) {
    await app.register(staticPlugin, { root: staticRoot, prefix: "/app/", wildcard: true });
    app.get("/app", async (_request, reply) => reply.code(308).header("location", "/app/").send());
    app.setNotFoundHandler((request, reply) => {
      const pathname = new URL(request.url, "http://localhost").pathname;
      if ((request.method === "GET" || request.method === "HEAD") && pathname.startsWith("/app/") && !pathname.startsWith("/app/assets/")) {
        return reply.type("text/html; charset=utf-8").sendFile("index.html");
      }
      return reply.code(404).send({ message: "Маршрут не найден" });
    });
  }

  app.addHook("onClose", async () => {
    if (operationalLog) await operationalLog.close();
    if (repository instanceof PrismaUserRepository) await repository.close();
  });

  return app;
}

function createDefaultLogger(logStream: CreateAppOptions["logStream"]): FastifyServerOptions["logger"] {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    serializers: { req: (request) => ({ method: request.method, url: request.url, id: request.id }) },
    redact: {
      paths: [
        "req.headers.x-max-init-data", "req.headers.authorization", "req.headers.cookie", "req.headers.x-max-bot-api-secret",
        "headers.x-max-init-data", "headers.authorization", "headers.cookie", "headers.x-max-bot-api-secret",
        "MAX_BOT_TOKEN", "MAX_WEBHOOK_SECRET", "BOT_TOKEN", "DATABASE_URL", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD",
        "botToken", "databaseUrl", "password",
        "config.botToken", "config.databaseUrl", "config.password",
        "env.MAX_BOT_TOKEN", "env.BOT_TOKEN", "env.DATABASE_URL", "env.MYSQL_PASSWORD", "env.MYSQL_ROOT_PASSWORD",
      ],
      censor: "[REDACTED]",
    },
    transport: logStream || process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty" },
    stream: logStream,
  };
}

function toMaxResponse(initData: MaxInitData, identity: { id: number; isAdmin: boolean }) {
  return {
    ...(initData.queryId === undefined ? {} : { query_id: initData.queryId }),
    ...(initData.ip === undefined ? {} : { ip: initData.ip }),
    auth_date: initData.authDate,
    user: {
      id: identity.id,
      maxUserId: initData.user.id,
      isAdmin: identity.isAdmin,
      first_name: initData.user.firstName,
      last_name: initData.user.lastName,
      username: initData.user.username,
      language_code: initData.user.languageCode,
      photo_url: initData.user.photoUrl,
    },
    ...(initData.chat === undefined ? {} : { chat: initData.chat }),
    ...(initData.startParam === undefined ? {} : { start_param: initData.startParam }),
  };
}

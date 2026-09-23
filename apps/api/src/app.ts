import staticPlugin from "@fastify/static";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import swagger from "@fastify/swagger";
import Fastify, { type FastifyBaseLogger, type FastifyInstance, type FastifyServerOptions } from "fastify";

import { getConfig, type AppConfig } from "./config.js";
import type { MaxInitData } from "./max/init-data.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import { PrismaUserRepository } from "./repositories/prisma-user-repository.js";
import type { UserRepository } from "./repositories/user-repository.js";

const healthSchema = {
  response: { 200: { type: "object", additionalProperties: false, required: ["status"], properties: { status: { type: "string", const: "ok" } } } },
} as const;

const unauthorizedSchema = {
  type: "object",
  additionalProperties: false,
  required: ["message"],
  properties: { message: { type: "string" } },
} as const;

export type CreateAppOptions = {
  config?: AppConfig;
  userRepository?: UserRepository;
  logger?: FastifyServerOptions["logger"] | FastifyBaseLogger;
  logStream?: { write: (message: string) => unknown };
  staticRoot?: string;
  now?: () => Date;
};

export async function createApp(options: CreateAppOptions = {}): Promise<FastifyInstance> {
  const config = options.config ?? getConfig();
  const repository = options.userRepository ?? new PrismaUserRepository();
  const now = options.now ?? (() => new Date());
  const app = Fastify({
    logger: options.logger ?? createDefaultLogger(options.logStream),
    requestIdHeader: "x-request-id",
    genReqId: () => crypto.randomUUID(),
  });

  await app.register(swagger, {
    openapi: {
      info: { title: "Приёмка API", version: "0.1.0" },
      components: {
        securitySchemes: {
          maxInitData: { type: "apiKey", in: "header", name: "X-Max-Init-Data", description: "Исходная строка window.WebApp.initData" },
        },
      },
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
    preHandler: requireMaxAuth(config.botToken, config.maxInitDataMaxAgeSeconds, now),
    schema: {
      tags: ["Identity"],
      summary: "Текущий пользователь MAX",
      security: [{ maxInitData: [] }],
      response: {
        200: {
          type: "object",
          additionalProperties: false,
          required: ["user", "auth_date"],
          properties: {
            query_id: { type: "string" },
            ip: { type: "string" },
            auth_date: { type: "integer" },
            user: {
              type: "object",
              additionalProperties: false,
              required: ["id", "first_name", "last_name", "username", "language_code", "photo_url"],
              properties: {
                id: { type: "string", pattern: "^[1-9][0-9]*$" },
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
          },
        },
        401: unauthorizedSchema,
      },
    },
  }, async (request) => {
    const initData = request.maxInitData!;
    await repository.upsertFromMax({ user: initData.user, authDate: initData.authDate, seenAt: now() });
    return toMaxResponse(initData);
  });

  const staticRoot = options.staticRoot ?? resolve(process.cwd(), "../web/dist");
  if (existsSync(staticRoot)) {
    await app.register(staticPlugin, { root: staticRoot, wildcard: true });
    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/") || request.url.startsWith("/max/")) {
        return reply.code(404).send({ message: "Маршрут не найден" });
      }
      return reply.type("text/html; charset=utf-8").sendFile("index.html");
    });
  }

  app.addHook("onClose", async () => {
    if (repository instanceof PrismaUserRepository) await repository.close();
  });

  return app;
}

function createDefaultLogger(logStream: CreateAppOptions["logStream"]): FastifyServerOptions["logger"] {
  return {
    level: process.env.LOG_LEVEL ?? "info",
    redact: {
      paths: [
        "req.headers.x-max-init-data", "req.headers.authorization", "req.headers.cookie",
        "headers.x-max-init-data", "headers.authorization", "headers.cookie",
        "MAX_BOT_TOKEN", "BOT_TOKEN", "DATABASE_URL", "MYSQL_PASSWORD", "MYSQL_ROOT_PASSWORD",
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

function toMaxResponse(initData: MaxInitData) {
  return {
    ...(initData.queryId === undefined ? {} : { query_id: initData.queryId }),
    ...(initData.ip === undefined ? {} : { ip: initData.ip }),
    auth_date: initData.authDate,
    user: {
      id: initData.user.id,
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

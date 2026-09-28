import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Writable } from "node:stream";
import { describe, expect, it } from "vitest";

import { createApp } from "./app.js";
import { requireMaxAuth } from "./max/require-max-auth.js";
import type { UserRepository, UpsertMaxUserInput } from "./repositories/user-repository.js";
import { createSignedMaxInitData } from "./test/helpers/max-init-data.js";
import type { PrismaClient } from "../generated/prisma/client.js";

class MemoryUserRepository implements UserRepository {
  readonly users = new Map<string, UpsertMaxUserInput>();
  ready = true;

  async isReady(): Promise<boolean> {
    return this.ready;
  }

  async upsertFromMax(input: UpsertMaxUserInput): Promise<{ id: number; isAdmin: false }> {
    this.users.set(input.user.id, input);
    return { id: 1, isAdmin: false };
  }
}

const botToken = "test-bot-token";

it("localizes schema validation and preserves an explicit business error", async () => {
  const { app } = await testApp(undefined, { businessDb: {} as PrismaClient });
  try {
    const headers = { "x-max-init-data": createSignedMaxInitData(botToken) };
    const cases = [
      [{ title: "Тест", description: "Описание", category: "OTHER" }, "Заполните поле «исполнитель»."],
      [{ executorUserId: "не число", title: "Тест", description: "Описание", category: "OTHER" }, "Укажите корректное числовое значение в поле «исполнитель»."],
    ] as const;
    for (const [payload, expected] of cases) {
      const response = await app.inject({ method: "POST", url: "/api/houses/1/works", headers, payload });
      expect(response.statusCode).toBe(400);
      expect(response.json().message).toBe(expected);
    }
    const choice = await app.inject({ method: "GET", url: "/api/houses/1/works?status=WRONG", headers });
    expect(choice.statusCode).toBe(400);
    expect(choice.json().message).toBe("Выберите допустимое значение для поля «статус».");
    const business = await app.inject({ method: "GET", url: "/api/me" });
    expect(business.statusCode).toBe(401);
    expect(business.json().message).not.toBe("Внутренняя ошибка сервиса. Повторите попытку позже.");
  } finally { await app.close(); }
});

async function testApp(repository = new MemoryUserRepository(), options: Omit<Parameters<typeof createApp>[0], "config" | "userRepository" | "logger"> = {}) {
  return { app: await createApp({ config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 }, userRepository: repository, logger: false, ...options }), repository };
}

describe("system routes", () => {
  it("asks robots to avoid every route", async () => {
    const { app } = await testApp();
    try {
      const robots = await app.inject({ method: "GET", url: "/robots.txt" });
      expect(robots.body).toBe("User-agent: *\nDisallow: /\n");
      for (const url of ["/api/health", "/missing", "/photo/abcdefghijkl"]) expect((await app.inject({ method: "GET", url })).headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive, nosnippet");
    } finally { await app.close(); }
  });
  it("logs socket IP on 200 and 404 without trusting a spoofed forwarded header", async () => {
    const logs: string[] = [];
    const app = await createApp({ config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 }, userRepository: new MemoryUserRepository(), logStream: { write: (line: string) => { logs.push(line); } }, staticRoot: "/nonexistent-priemka-static" });
    try {
      await app.inject({ method: "GET", url: "/api/health", headers: { "x-forwarded-for": "203.0.113.42" } });
      await app.inject({ method: "GET", url: "/not-found?secret=hidden", headers: { "x-forwarded-for": "203.0.113.42" } });
      const records = logs.flatMap((line) => line.trim().split("\n")).filter(Boolean).map((line) => JSON.parse(line) as Record<string, unknown>).filter((record) => record.event === "http_request");
      expect(records.map((record) => record.statusCode)).toEqual([200, 404]);
      expect(records.every((record) => record.remoteIp !== "203.0.113.42" && typeof record.remoteIp === "string")).toBe(true);
      expect(logs.join("")).not.toContain("secret=hidden");
    } finally { await app.close(); }
  });
  it("documents actual public PDF and photo responses", async () => {
    const { app } = await testApp();
    try {
      await app.ready();
      const spec = app.swagger() as { paths: Record<string, { get: { responses: Record<string, unknown> } }> };
      expect(Object.keys(spec.paths["/doc/{key}.pdf"].get.responses).sort()).toEqual(["200", "404", "409", "503"]);
      expect(Object.keys(spec.paths["/photo/{key}"].get.responses).sort()).toEqual(["200", "400", "404", "503"]);
      expect((await app.inject({ method: "GET", url: `/doc/${"a".repeat(20)}.pdf` })).statusCode).toBe(503);
      expect((await app.inject({ method: "GET", url: `/photo/${"a".repeat(20)}` })).statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });
  it("returns liveness response", async () => {
    const { app } = await testApp();
    try {
      const response = await app.inject({ method: "GET", url: "/api/health" });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ status: "ok" });
    } finally {
      await app.close();
    }
  });

  it("returns readiness according to database availability", async () => {
    const { app, repository } = await testApp();
    try {
      expect((await app.inject({ method: "GET", url: "/api/ready" })).statusCode).toBe(200);
      repository.ready = false;
      expect((await app.inject({ method: "GET", url: "/api/ready" })).statusCode).toBe(503);
    } finally {
      await app.close();
    }
  });

  it("serves the SPA only under /app/ and keeps missing assets and other routes as 404", async () => {
    const staticRoot = await mkdtemp(join(tmpdir(), "priemka-web-"));
    await writeFile(join(staticRoot, "index.html"), "<main>Приёмка SPA</main>");
    await mkdir(join(staticRoot, "assets"));
    await writeFile(join(staticRoot, "assets", "main.js"), "console.log('app');");
    const { app } = await testApp(new MemoryUserRepository(), { staticRoot });
    try {
      const index = await app.inject({ method: "GET", url: "/app/" });
      expect(index.statusCode).toBe(200);
      expect(index.headers["content-type"]).toContain("text/html");
      expect(index.body).toContain("Приёмка SPA");
      const redirect = await app.inject({ method: "GET", url: "/app" });
      expect(redirect.statusCode).toBe(308);
      expect(redirect.headers.location).toBe("/app/");
      expect((await app.inject({ method: "GET", url: "/app/foo" })).body).toContain("Приёмка SPA");
      expect((await app.inject({ method: "GET", url: "/app/assets/main.js" })).statusCode).toBe(200);
      const missingAsset = await app.inject({ method: "GET", url: "/app/assets/not-existing.js" });
      expect(missingAsset.statusCode).toBe(404);
      expect(missingAsset.headers["content-type"]).not.toContain("text/html");
      expect((await app.inject({ method: "GET", url: "/" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/dsfsdf" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/unknown" })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/max/nonexistent" })).statusCode).toBe(404);
    } finally {
      await app.close();
      await rm(staticRoot, { recursive: true, force: true });
    }
  });
});

describe("GET /api/me", () => {
  it("keeps invalid auth at 401 and returns the signed MAX ID for preview denial", async () => {
    const db = { previewAccess: { findUnique: async () => null } } as unknown as PrismaClient;
    const app = await createApp({ config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600, previewAccessRequired: true }, userRepository: new MemoryUserRepository(), businessDb: db, logger: false, staticRoot: "/nonexistent" });
    try {
      expect((await app.inject({ method: "GET", url: "/api/health" })).statusCode).toBe(200);
      const invalid = await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": "invalid" } });
      expect(invalid.statusCode).toBe(401);
      expect(invalid.body).not.toContain("9007199254740993");
      const denied = await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": createSignedMaxInitData(botToken) } });
      expect(denied.statusCode).toBe(403);
      expect(denied.json()).toEqual({ message: "Доступ к тестированию пока не открыт", code: "PREVIEW_ACCESS_DENIED", maxUserId: "9007199254740993" });
    } finally { await app.close(); }
  });
  it("can reuse MAX authorization on another protected route", async () => {
    const { app } = await testApp();
    app.get("/api/protected-test", {
      preHandler: requireMaxAuth(botToken, 3600, () => new Date()),
    }, async (request) => ({ userId: request.maxInitData!.user.id }));
    try {
      expect((await app.inject({ method: "GET", url: "/api/protected-test" })).statusCode).toBe(401);
      const initData = createSignedMaxInitData(botToken);
      const response = await app.inject({ method: "GET", url: "/api/protected-test", headers: { "x-max-init-data": initData } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual({ userId: "9007199254740993" });
    } finally {
      await app.close();
    }
  });

  it("rejects a missing MAX header and an invalid signature", async () => {
    const { app } = await testApp();
    try {
      expect((await app.inject({ method: "GET", url: "/api/me" })).statusCode).toBe(401);
      const tampered = createSignedMaxInitData(botToken).replace("ip=203.0.113.9", "ip=198.51.100.4");
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": tampered } })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("returns MAX field names and preserves large MAX user and chat IDs", async () => {
    const { app, repository } = await testApp();
    try {
      const initData = createSignedMaxInitData(botToken);
      const response = await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": initData } });
      expect(response.statusCode).toBe(200);
      expect(response.json()).toEqual(expect.objectContaining({
        query_id: "test-query-id",
        ip: "203.0.113.9",
        auth_date: expect.any(Number),
        user: {
          id: 1,
          maxUserId: "9007199254740993",
          isAdmin: false,
          first_name: "Макс",
          last_name: "Пользователь",
          username: null,
          language_code: "ru",
          photo_url: null,
        },
        chat: { id: "9007199254740995", type: "DIALOG" },
        start_param: "test-start-param",
      }));
      const firstStored = repository.users.get("9007199254740993");
      expect(firstStored?.user.firstName).toBe("Макс");
      expect(firstStored).not.toHaveProperty("ip");

      const second = createSignedMaxInitData(botToken, {
        ip: "2001:db8::1",
        user: '{"id":9007199254740993,"first_name":"Новое имя","last_name":"Пользователь","username":null,"language_code":"ru","photo_url":null}',
      });
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": second } })).statusCode).toBe(200);
      expect(repository.users).toHaveLength(1);
      expect(repository.users.get("9007199254740993")?.user.firstName).toBe("Новое имя");
      expect(repository.users.get("9007199254740993")).not.toHaveProperty("ip");
    } finally {
      await app.close();
    }
  });

  it("preserves a large negative signed chat ID", async () => {
    const { app } = await testApp();
    try {
      const initData = createSignedMaxInitData(botToken, { chat: '{"id":-9007199254740995,"type":"DIALOG"}' });
      const response = await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": initData } });
      expect(response.statusCode).toBe(200);
      expect(response.json().chat).toEqual({ id: "-9007199254740995", type: "DIALOG" });
    } finally {
      await app.close();
    }
  });

  it("rejects expired and impermissibly future auth_date", async () => {
    const fixedNow = new Date("2026-09-22T20:00:00.000Z");
    const { app } = await testApp(new MemoryUserRepository(), { now: () => fixedNow });
    try {
      const expired = createSignedMaxInitData(botToken, { auth_date: String(Math.floor(fixedNow.getTime() / 1000) - 3601) });
      const future = createSignedMaxInitData(botToken, { auth_date: String(Math.floor(fixedNow.getTime() / 1000) + 61) });
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": expired } })).statusCode).toBe(401);
      expect((await app.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": future } })).statusCode).toBe(401);
    } finally {
      await app.close();
    }
  });

  it("redacts sensitive headers using the application's default logger", async () => {
    const logs: string[] = [];
    const repository = new MemoryUserRepository();
    const loggedApp = await createApp({
      config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 },
      userRepository: repository,
      logStream: new Writable({
        write(chunk, _encoding, callback) {
          logs.push(String(chunk));
          callback();
        },
      }),
    });
    const secretHeader = createSignedMaxInitData(botToken);
    loggedApp.addHook("onRequest", async (request) => {
      request.log.info({
        headers: request.headers,
        MAX_BOT_TOKEN: "test-secret-bot-token",
        DATABASE_URL: "mysql://test-secret-db-password@localhost/test",
        config: { botToken: "test-secret-nested-token" },
      }, "redaction check");
    });
    try {
      await loggedApp.inject({ method: "GET", url: "/api/me", headers: {
        "x-max-init-data": secretHeader,
        authorization: "Bearer test-secret-authorization",
        cookie: "session=test-secret-cookie",
      } });
      const output = logs.join("\n");
      expect(output).toContain("[REDACTED]");
      expect(output).not.toContain(secretHeader);
      expect(output).not.toContain("test-secret-authorization");
      expect(output).not.toContain("test-secret-cookie");
      expect(output).not.toContain("test-secret-bot-token");
      expect(output).not.toContain("test-secret-db-password");
      expect(output).not.toContain("test-secret-nested-token");
    } finally {
      await loggedApp.close();
    }
  });

  it("logs request metadata and an error stack without exposing initData", async () => {
    const logs: string[] = [];
    const loggedApp = await createApp({
      config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 },
      userRepository: {
        isReady: async () => true,
        upsertFromMax: async () => { throw new Error("test repository failure"); },
      },
      logStream: new Writable({
        write(chunk, _encoding, callback) {
          logs.push(String(chunk));
          callback();
        },
      }),
    });
    const initData = createSignedMaxInitData(botToken);
    try {
      const response = await loggedApp.inject({ method: "GET", url: "/api/me", headers: { "x-max-init-data": initData } });
      expect(response.statusCode).toBe(500);
      expect(response.json().message).toBe("Внутренняя ошибка сервиса. Повторите попытку позже.");
      expect(response.body).not.toContain("test repository failure");
      const records = logs.join("").trim().split("\n").map((line) => JSON.parse(line) as Record<string, unknown>);
      expect(logs.join("")).toContain("test repository failure");
      expect(records.some((record) => record.event === "http_request" && record.requestId && record.method === "GET" && record.path === "/api/me" && record.statusCode === 500 && typeof record.durationMs === "number" && typeof record.remoteIp === "string")).toBe(true);
      expect(logs.join("")).not.toContain(initData);
    } finally {
      await loggedApp.close();
    }
  });
});

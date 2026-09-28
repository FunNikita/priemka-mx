import { createHash } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { createApp } from "../app.js";
import { appLink } from "./notifications.js";
import { deliverBotOutbox } from "./document-bot.js";

afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("uses documented startapp payloads", () => {
  expect(appLink("PriemkaDemoBot", "observation", 42)).toBe("https://max.ru/PriemkaDemoBot?startapp=observation_42");
  expect(appLink("PriemkaDemoBot", "work", 7)).toBe("https://max.ru/PriemkaDemoBot?startapp=work_7");
});

it("deduplicates welcome, ignores group messages, and checks PreviewAccess before fallback", async () => {
  vi.stubEnv("MAX_WEBHOOK_SECRET", "test_webhook_secret");
  const jobs = new Map<string, Record<string, unknown>>();
  let enabled = false;
  const db = { botOutbox: { upsert: async ({ where, create }: { where: { eventKey: string }; create: Record<string, unknown> }) => {
    if (!jobs.has(where.eventKey)) jobs.set(where.eventKey, { id: jobs.size + 1, ...create });
    return jobs.get(where.eventKey);
  } }, previewAccess: { findUnique: async () => enabled ? { enabled: true } : null } } as unknown as PrismaClient;
  const app = await createApp({ config: { botToken: "test-token", botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600, previewAccessRequired: true, botTimeZone: "Europe/Moscow" }, businessDb: db, userRepository: { isReady: async () => true, upsertFromMax: async () => ({ id: 1, isAdmin: false }) }, logger: false, staticRoot: "/nonexistent" });
  const send = (body: object) => app.inject({ method: "POST", url: "/max/webhook", headers: { "x-max-bot-api-secret": "test_webhook_secret", "content-type": "application/json" }, payload: body });
  try {
    const group = { update_type: "message_created", message: { sender: { user_id: "9007199254740993", first_name: "Макс" }, recipient: { chat_id: -123, chat_type: "chat" }, body: { text: "/start" } } };
    expect((await send(group)).statusCode).toBe(200);
    expect(jobs.size).toBe(0);
    const direct = { update_type: "message_created", message: { sender: { user_id: "9007199254740993", first_name: "Макс" }, recipient: { chat_id: 123, chat_type: "dialog" }, body: { text: "привет" } } };
    await send(direct);
    await send(direct);
    expect(jobs.size).toBe(1);
    expect([...jobs.values()][0].text).toBe("Доступ пока не открыт.\n\n#9007199254740993");
    enabled = true;
    await send({ update_type: "bot_started", chat_id: 123, user: { user_id: "9007199254740993", first_name: "Макс" }, timestamp: 1 });
    expect(jobs.size).toBe(2);
    expect([...jobs.values()][1].text).toContain("Я чат-бот «Приёмка»");
    await send({ update_type: "bot_started", chat_id: 123, user: { user_id: "9007199254740993" }, timestamp: 2 });
    expect([...jobs.values()][2].text).toMatch(/^(?:Доброе утро|Добрый день|Добрый вечер|Доброй ночи)!\n\n/);
    await send({ update_type: "bot_started", chat_id: 123, user: { user_id: "9007199254740993", first_name: "Макс" }, payload: `doc_${"a".repeat(20)}` });
    expect([...jobs.values()][3]).toEqual(expect.objectContaining({ chatId: "9007199254740993", targetType: "USER", publicKey: "a".repeat(20) }));
  } finally { await app.close(); }
});

it("paces queued messages and sends event payload through open_app", async () => {
  const jobs = [1, 2, 3].map((id) => ({ id, eventKey: String(id), chatId: "9007199254740993", publicKey: "", kind: "TEXT", targetType: "USER", accessKind: "NONE", recipientUserId: null, houseId: null, subjectId: null, text: `Этап ${id}`, buttonText: "Открыть работу", buttonUrl: appLink("PriemkaDemoBot", "work", 42), attempts: 0, nextAttemptAt: new Date(), sentText: false, fileToken: null, completedAt: null as Date | null, deadAt: null as Date | null, createdAt: new Date(), updatedAt: new Date() }));
  const sends: number[] = [];
  const bodies: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (_url: string, options: RequestInit) => { sends.push(Date.now()); bodies.push(JSON.parse(String(options.body)) as Record<string, unknown>); return new Response("{}", { status: 200 }); }));
  const db = { botOutbox: { findUnique: async ({ where }: { where: { id: number } }) => jobs[where.id - 1], update: async ({ where, data }: { where: { id: number }; data: { completedAt: Date } }) => Object.assign(jobs[where.id - 1], data) } } as unknown as PrismaClient;
  await Promise.all(jobs.map((job) => deliverBotOutbox(db, "test-token", job.id, "PriemkaDemoBot")));
  expect(sends).toHaveLength(3);
  expect(sends[1] - sends[0]).toBeGreaterThanOrEqual(500);
  expect(sends[2] - sends[1]).toBeGreaterThanOrEqual(500);
  expect(bodies[0].attachments).toEqual([{ type: "inline_keyboard", payload: { buttons: [[{ type: "open_app", text: "Открыть работу", web_app: "PriemkaDemoBot", payload: "work_42" }]] } }]);
});

it("sends a PDF and open_app button in one direct message and retries attachment processing", async () => {
  const directory = await mkdtemp(join(tmpdir(), "priemka-pdf-notify-"));
  vi.stubEnv("DOCUMENTS_DIR", directory);
  const bytes = Buffer.from("%PDF-1.4\nnotification-test\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(directory, "report.pdf"), bytes);
  const job = { id: 1, chatId: "9007199254740993", targetType: "USER", accessKind: "NONE", recipientUserId: null, houseId: null, subjectId: null, kind: "TEXT", publicKey: "a".repeat(20), text: "Проверка завершена", buttonText: "Открыть работу", buttonUrl: appLink("PriemkaDemoBot", "work", 7), fileToken: null as string | null, completedAt: null as Date | null, deadAt: null as Date | null, sentText: false };
  const messages: { url: string; body: Record<string, unknown> }[] = [];
  let attempts = 0;
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, options: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/uploads?type=file")) return new Response(JSON.stringify({ url: "https://upload.max.ru/file", token: "file-token" }), { status: 200 });
    if (url === "https://upload.max.ru/file") return new Response("", { status: 200 });
    messages.push({ url, body: JSON.parse(String(options.body)) as Record<string, unknown> });
    attempts++;
    return new Response(attempts === 1 ? JSON.stringify({ code: "attachment.not.ready" }) : "{}", { status: attempts === 1 ? 400 : 200 });
  }));
  const db = { botOutbox: { findUnique: async () => job, update: async ({ data }: { data: Partial<typeof job> }) => Object.assign(job, data) }, documentVersion: { findUnique: async () => ({ storagePath: "report.pdf", sha256, version: 1, createdAt: new Date(), status: "FINAL", confirmations: [], document: { id: 1, type: "INSPECTION_REPORT", work: { title: "Работа", house: { address: "Дом" } } } }) } } as unknown as PrismaClient;
  try {
    await expect(deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot")).rejects.toThrow("MAX API 400");
    expect(job.fileToken).toBe("file-token");
    expect(job.completedAt).toBeNull();
    await deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot");
    expect(job.completedAt).toBeInstanceOf(Date);
    expect(messages).toHaveLength(2);
    expect(messages[1].url).toContain("user_id=9007199254740993");
    expect(messages[1].body.attachments).toEqual([{ type: "file", payload: { token: "file-token" } }, { type: "inline_keyboard", payload: { buttons: [[{ type: "open_app", text: "Открыть работу", web_app: "PriemkaDemoBot", payload: "work_7" }]] } }]);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("drops a queued lifecycle message when the recipient loses house access", async () => {
  const job = { id: 1, chatId: "9007199254740993", targetType: "USER", accessKind: "WORK", recipientUserId: 1, houseId: 9, subjectId: 7, completedAt: null, deadAt: null as Date | null };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const db = { botOutbox: { findUnique: async () => job, update: async ({ data }: { data: { deadAt: Date } }) => Object.assign(job, data) }, user: { findUnique: async () => ({ maxUserId: job.chatId }) }, houseMembership: { findUnique: async () => ({ role: "RESIDENT", status: "REJECTED" }) } } as unknown as PrismaClient;
  await deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot");
  expect(job.deadAt).toBeInstanceOf(Date);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("sends the verified document with the new PDF caption", async () => {
  const directory = await mkdtemp(join(tmpdir(), "priemka-doc-caption-"));
  vi.stubEnv("DOCUMENTS_DIR", directory);
  const bytes = Buffer.from("%PDF-1.4\ncaption-test\n");
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await writeFile(join(directory, "report.pdf"), bytes);
  const job = { id: 1, chatId: "9007199254740993", targetType: "USER", accessKind: "NONE", recipientUserId: null, houseId: null, subjectId: null, kind: "DOCUMENT", publicKey: "a".repeat(20), fileToken: null as string | null, completedAt: null as Date | null, deadAt: null, sentText: false };
  const messages: Record<string, unknown>[] = [];
  vi.stubGlobal("fetch", vi.fn(async (input: string | URL, options: RequestInit) => {
    const url = String(input);
    if (url.endsWith("/uploads?type=file")) return new Response(JSON.stringify({ url: "https://upload.max.ru/file", token: "file-token" }), { status: 200 });
    if (url === "https://upload.max.ru/file") return new Response("", { status: 200 });
    messages.push(JSON.parse(String(options.body)) as Record<string, unknown>);
    return new Response("{}", { status: 200 });
  }));
  const db = { botOutbox: { findUnique: async () => job, update: async ({ data }: { data: Partial<typeof job> }) => Object.assign(job, data) }, documentVersion: { findUnique: async () => ({ storagePath: "report.pdf", sha256, version: 1, createdAt: new Date(), status: "FINAL", confirmations: [], document: { id: 1, type: "INSPECTION_REPORT", work: { title: "Работа", house: { address: "Дом" } } } }) } } as unknown as PrismaClient;
  try {
    await deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot");
    expect(messages[0].text).toContain("Статус: Сформирован");
    expect(messages[1].text).toBe("📄 Файл документа");
  } finally { await rm(directory, { recursive: true, force: true }); }
});

it("drops a queued lifecycle message when preview access is revoked", async () => {
  const job = { id: 1, chatId: "9007199254740993", targetType: "USER", accessKind: "WORK", recipientUserId: 1, houseId: 9, subjectId: 7, completedAt: null, deadAt: null as Date | null };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const db = { botOutbox: { findUnique: async () => job, update: async ({ data }: { data: { deadAt: Date } }) => Object.assign(job, data) }, user: { findUnique: async () => ({ maxUserId: job.chatId }) }, previewAccess: { findUnique: async () => ({ enabled: false }) } } as unknown as PrismaClient;
  await deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot", true);
  expect(job.deadAt).toBeInstanceOf(Date);
  expect(fetchMock).not.toHaveBeenCalled();
});

it("never sends legacy chat-targeted jobs to a group or channel", async () => {
  const job = { id: 1, chatId: "-123", targetType: "CHAT", accessKind: "NONE", recipientUserId: null, houseId: null, subjectId: null, completedAt: null, deadAt: null as Date | null };
  const fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  const db = { botOutbox: { findUnique: async () => job, update: async ({ data }: { data: { deadAt: Date } }) => Object.assign(job, data) } } as unknown as PrismaClient;
  await deliverBotOutbox(db, "test-token", 1, "PriemkaDemoBot");
  expect(job.deadAt).toBeInstanceOf(Date);
  expect(fetchMock).not.toHaveBeenCalled();
});

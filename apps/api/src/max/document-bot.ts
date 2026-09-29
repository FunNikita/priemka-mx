import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import type { PrismaClient } from "../../generated/prisma/client.js";
import type { AppConfig } from "../config.js";
import { parseDocumentPayload } from "../documents.js";
import { publicDocumentStatus } from "../workflow.js";
import { canDeliverNotification, enqueueText } from "./notifications.js";

const maxApi = "https://platform-api2.max.ru";
const webhookPath = "/max/webhook";
const nextTargetSend = new Map<string, number>();

function sameSecret(given: unknown, expected: string) {
  if (typeof given !== "string" || !expected) return false;
  const left = Buffer.from(given), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

type BotUpdate = { type: "bot_started" | "message_created"; chatId: string; userId: string; name: string; payload: string | null; text: string | null; dialog: boolean };
function parseUpdate(value: string): BotUpdate | null {
  if (value.length > 16384) return null;
  try {
    // MAX IDs are int64. Quote them before JSON.parse so JavaScript never rounds them.
    const safe = value.replace(/("(?:chat_id|user_id)"\s*:\s*)(-?[0-9]{1,32})/g, '$1"$2"');
    const update = JSON.parse(safe) as Record<string, unknown>;
    if (update.update_type !== "bot_started" && update.update_type !== "message_created") return null;
    const message = update.message as Record<string, unknown> | undefined;
    const sender = (update.update_type === "bot_started" ? update.user : message?.sender) as Record<string, unknown> | undefined;
    const recipient = message?.recipient as Record<string, unknown> | undefined;
    const body = message?.body as Record<string, unknown> | undefined;
    const userId = String(sender?.user_id ?? "");
    const chatId = String(update.chat_id ?? recipient?.chat_id ?? "");
    if (!/^[1-9][0-9]{0,31}$/.test(userId) || !/^-?[1-9][0-9]{0,31}$/.test(chatId)) return null;
    return { type: update.update_type, chatId, userId, name: typeof sender?.first_name === "string" ? sender.first_name.slice(0, 100) : "", payload: typeof update.payload === "string" ? update.payload : null, text: typeof body?.text === "string" ? body.text : null, dialog: update.update_type === "bot_started" || recipient?.chat_type === "dialog" };
  } catch { return null; }
}

async function maxRequest(path: string, token: string, input: Record<string, unknown>) {
  const result = await fetch(`${maxApi}${path}`, { method: "POST", headers: { Authorization: token, "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
  if (!result.ok) throw new Error(`MAX API ${result.status}`);
  return result;
}

async function uploadPdf(token: string, bytes: Buffer) {
  const init = await fetch(`${maxApi}/uploads?type=file`, { method: "POST", headers: { Authorization: token }, signal: AbortSignal.timeout(15000) });
  if (!init.ok) throw new Error(`MAX upload init ${init.status}`);
  const upload = await init.json() as { url?: string; token?: string };
  if (!upload.url) throw new Error("MAX upload URL missing");
  const url = new URL(upload.url);
  if (url.protocol !== "https:" || !["oneme.ru", "okcdn.ru", "max.ru"].some((domain) => url.hostname === domain || url.hostname.endsWith(`.${domain}`))) throw new Error("MAX upload URL rejected");
  const form = new FormData();
  form.append("data", new Blob([new Uint8Array(bytes)], { type: "application/pdf" }), "document.pdf");
  const uploaded = await fetch(url, { method: "POST", body: form, redirect: "error", signal: AbortSignal.timeout(30000) });
  if (!uploaded.ok) throw new Error(`MAX upload ${uploaded.status}`);
  const responseText = await uploaded.text();
  let uploadToken = upload.token;
  if (!uploadToken) {
    try { uploadToken = (JSON.parse(responseText) as { token?: string }).token; } catch { /* MAX can return XML for other media types. */ }
  }
  if (!uploadToken) throw new Error("MAX file token missing");
  return uploadToken;
}

async function throttle(target: string) {
  const now = Date.now();
  const scheduled = Math.max(now, nextTargetSend.get(target) ?? 0, nextTargetSend.get("*") ?? 0);
  nextTargetSend.set(target, scheduled + 550);
  nextTargetSend.set("*", scheduled + 550);
  const wait = scheduled - now;
  if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
}

function keyboard(buttonText: string | null, buttonUrl: string | null, botName: string) {
  if (!buttonText || !buttonUrl) return [];
  let url: URL;
  try { url = new URL(buttonUrl); } catch { return []; }
  const expected = `https://max.ru/${botName}`;
  if (`${url.origin}${url.pathname}` !== expected) return [];
  const payload = url.searchParams.get("startapp");
  const button = { type: "open_app", text: buttonText, web_app: botName, ...(payload && /^[A-Za-z0-9_-]{1,512}$/.test(payload) ? { payload } : {}) };
  return [{ type: "inline_keyboard", payload: { buttons: [[button]] } }];
}

export function outboxRetryDelayMs(attempts: number) {
  return Math.min(3600000, 5000 * 2 ** attempts);
}

export function outboxRetryState(attempts: number, at: Date) {
  return { attempts, nextAttemptAt: new Date(at.getTime() + outboxRetryDelayMs(attempts)), ...(attempts >= 8 ? { deadAt: at } : {}) };
}

export async function deliverBotOutbox(db: PrismaClient, token: string, outboxId: number, botName = process.env.MAX_BOT_NAME ?? "", previewRequired = false) {
  const job = await db.botOutbox.findUnique({ where: { id: outboxId } });
  if (!job || job.completedAt || job.deadAt) return;
  if (job.targetType !== "USER" || !await canDeliverNotification(db, job, previewRequired)) {
    await db.botOutbox.update({ where: { id: job.id }, data: { deadAt: new Date() } });
    return;
  }
  const target = `${job.targetType}:${job.chatId}`;
  const destination = `${job.targetType === "USER" ? "user_id" : "chat_id"}=${encodeURIComponent(job.chatId)}`;
  if (job.kind === "TEXT") {
    const attachments: Record<string, unknown>[] = [];
    if (job.publicKey) {
      const document = await publicDocumentStatus(db, job.publicKey);
      if (!document.bytes) throw new Error("Notification PDF unavailable");
      const fileToken = job.fileToken ?? await uploadPdf(token, document.bytes);
      if (!job.fileToken) await db.botOutbox.update({ where: { id: job.id }, data: { fileToken } });
      attachments.push({ type: "file", payload: { token: fileToken } });
    }
    attachments.push(...keyboard(job.buttonText, job.buttonUrl, botName));
    await throttle(target);
    if (!await canDeliverNotification(db, job, previewRequired)) {
      await db.botOutbox.update({ where: { id: job.id }, data: { deadAt: new Date() } });
      return;
    }
    await maxRequest(`/messages?${destination}`, token, { text: job.text ?? "", attachments });
    await db.botOutbox.update({ where: { id: job.id }, data: { completedAt: new Date(), sentText: true } });
    return;
  }
  const result = job.publicKey ? await publicDocumentStatus(db, job.publicKey) : { message: "Некорректный код документа.", bytes: null };
  if (!job.sentText) {
    await throttle(target);
    await maxRequest(`/messages?${destination}`, token, { text: result.message });
    await db.botOutbox.update({ where: { id: job.id }, data: { sentText: true } });
  }
  if (!result.bytes) {
    await db.botOutbox.update({ where: { id: job.id }, data: { completedAt: new Date() } });
    return;
  }
  const fileToken = job.fileToken ?? await uploadPdf(token, result.bytes);
  if (!job.fileToken) await db.botOutbox.update({ where: { id: job.id }, data: { fileToken } });
  await throttle(target);
  await maxRequest(`/messages?${destination}`, token, { text: "📄 Файл документа", attachments: [{ type: "file", payload: { token: fileToken } }] });
  await db.botOutbox.update({ where: { id: job.id }, data: { completedAt: new Date() } });
}

function greeting(name: string, timeZone: string) {
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
  const salutation = hour >= 5 && hour < 12 ? "Доброе утро" : hour >= 12 && hour < 18 ? "Добрый день" : hour >= 18 && hour < 23 ? "Добрый вечер" : "Доброй ночи";
  return `${salutation}${name.trim() ? `, ${name}` : ""}!\n\nЯ чат-бот «Приёмка» — сервис для контроля работ в доме.\n\nПока я ещё учусь отвечать на сообщения, но основной функционал уже доступен в мини-приложении.\n\nНажмите кнопку ниже, чтобы открыть сервис.`;
}

export function registerDocumentBot(app: FastifyInstance, db: PrismaClient | null, token: string, config?: AppConfig) {
  const secret = process.env.MAX_WEBHOOK_SECRET ?? "";
  const botName = config?.botName ?? process.env.MAX_BOT_NAME ?? "";
  const timeZone = config?.botTimeZone ?? "Europe/Moscow";
  app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
    scope.post(webhookPath, { schema: { tags: ["MAX bot"], body: { type: "string" }, response: { 200: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, 401: { type: "object", properties: { message: { type: "string" } } }, 503: { type: "object", properties: { message: { type: "string" } } } } } }, async (request, reply) => {
      if (!db || !secret) return reply.code(503).send({ message: "Webhook не настроен" });
      if (!sameSecret(request.headers["x-max-bot-api-secret"], secret)) return reply.code(401).send({ message: "Не удалось подтвердить запрос MAX." });
      const raw = request.body as string;
      const update = parseUpdate(raw);
      if (!update) return { ok: true };
      if (update.type === "bot_started" && update.payload?.startsWith("doc_")) {
        const publicKey = parseDocumentPayload(update.payload) ?? "";
        const eventKey = createHash("sha256").update(raw).digest("hex");
        const job = await db.botOutbox.upsert({ where: { eventKey }, create: { eventKey, chatId: update.userId, publicKey, targetType: "USER" }, update: {} }).catch(async (error: unknown) => {
          if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
          return db.botOutbox.findUniqueOrThrow({ where: { eventKey } });
        });
        app.log.info({ event: "max_bot_update", updateType: update.type, command: "doc", allowed: true, outboxId: job.id }, "MAX bot update");
        return { ok: true };
      }
      if (!update.dialog) return { ok: true };
      const allowed = !config?.previewAccessRequired || !!(await db.previewAccess.findUnique({ where: { maxUserId: update.userId } }))?.enabled;
      const command = update.type === "bot_started" || /^\/start(?:\s|$)/.test(update.text ?? "") ? "start" : "unknown";
      const text = !allowed
        ? `Доступ пока не открыт.\n\n#${update.userId}`
        : command === "start" ? greeting(update.name, timeZone)
          : "Такой команды я пока не знаю.\n\nОсновной функционал «Приёмки» уже доступен в мини-приложении — откройте его по кнопке ниже.";
      const eventKey = createHash("sha256").update(raw).digest("hex");
      const job = await enqueueText(db, { key: `webhook:${eventKey}`, maxUserId: update.userId, text, buttonText: allowed ? "Открыть сервис" : "", buttonUrl: allowed ? `https://max.ru/${botName}?startapp` : "" });
      app.log.info({ event: "max_bot_update", updateType: update.type, command, allowed, outboxId: job.id }, "MAX bot update");
      return { ok: true };
    });
  });
  if (db && secret && process.env.NODE_ENV !== "test") {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const jobs = await db.botOutbox.findMany({ where: { completedAt: null, deadAt: null, nextAttemptAt: { lte: new Date() }, attempts: { lt: 8 } }, orderBy: { id: "asc" }, take: 5 });
        for (const job of jobs) {
          try { await deliverBotOutbox(db, token, job.id, botName, !!config?.previewAccessRequired); }
          catch {
            const attempts = job.attempts + 1;
            await db.botOutbox.update({ where: { id: job.id }, data: outboxRetryState(attempts, new Date()) });
            app.log.warn({ event: "outbox_retry", outboxId: job.id, attempts, dead: attempts >= 8 }, "MAX delivery retry scheduled");
          }
        }
      } catch { app.log.error("MAX outbox polling failed"); }
      finally { running = false; }
    }, 5000);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }
}

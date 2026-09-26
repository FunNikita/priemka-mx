import { createHash, timingSafeEqual } from "node:crypto";

import type { FastifyInstance } from "fastify";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { parseDocumentPayload } from "../documents.js";
import { publicDocumentStatus } from "../workflow.js";

const maxApi = "https://platform-api2.max.ru";
const webhookPath = "/max/webhook";

function sameSecret(given: unknown, expected: string) {
  if (typeof given !== "string" || !expected) return false;
  const left = Buffer.from(given), right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

function parseUpdate(value: string): { chatId: string; payload: string | null } | null {
  if (value.length > 16384) return null;
  const chats = [...value.matchAll(/"chat_id"\s*:\s*("-?[0-9]+"|-?[0-9]+)/g)];
  if (chats.length !== 1) return null;
  const chatId = chats[0][1].replaceAll('"', "");
  if (!/^-?[1-9][0-9]{0,31}$/.test(chatId)) return null;
  try {
    const update = JSON.parse(value) as { update_type?: unknown; payload?: unknown };
    if (update.update_type !== "bot_started") return null;
    return { chatId, payload: typeof update.payload === "string" ? update.payload : null };
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

export async function deliverBotOutbox(db: PrismaClient, token: string, outboxId: number) {
  const job = await db.botOutbox.findUnique({ where: { id: outboxId } });
  if (!job || job.completedAt) return;
  const result = job.publicKey ? await publicDocumentStatus(db, job.publicKey) : { message: "Некорректный код документа", bytes: null };
  const chat = encodeURIComponent(job.chatId);
  if (!job.sentText) {
    await maxRequest(`/messages?chat_id=${chat}`, token, { text: result.message });
    await db.botOutbox.update({ where: { id: job.id }, data: { sentText: true } });
  }
  if (!result.bytes) {
    await db.botOutbox.update({ where: { id: job.id }, data: { completedAt: new Date() } });
    return;
  }
  const fileToken = job.fileToken ?? await uploadPdf(token, result.bytes);
  if (!job.fileToken) await db.botOutbox.update({ where: { id: job.id }, data: { fileToken } });
  await maxRequest(`/messages?chat_id=${chat}`, token, { text: "PDF документа", attachments: [{ type: "file", payload: { token: fileToken } }] });
  await db.botOutbox.update({ where: { id: job.id }, data: { completedAt: new Date() } });
}

export function registerDocumentBot(app: FastifyInstance, db: PrismaClient | null, token: string) {
  const secret = process.env.MAX_WEBHOOK_SECRET ?? "";
  app.register(async (scope) => {
    scope.addContentTypeParser("application/json", { parseAs: "string" }, (_request, body, done) => done(null, body));
    scope.post(webhookPath, { schema: { tags: ["MAX bot"], body: { type: "string" }, response: { 200: { type: "object", properties: { ok: { type: "boolean" } }, required: ["ok"] }, 401: { type: "object", properties: { message: { type: "string" } } }, 503: { type: "object", properties: { message: { type: "string" } } } } } }, async (request, reply) => {
      if (!db || !secret) return reply.code(503).send({ message: "Webhook не настроен" });
      if (!sameSecret(request.headers["x-max-bot-api-secret"], secret)) return reply.code(401).send({ message: "Unauthorized" });
      const raw = request.body as string;
      const update = parseUpdate(raw);
      if (!update || !update.payload?.startsWith("doc_")) return { ok: true };
      const publicKey = parseDocumentPayload(update.payload) ?? "";
      const eventKey = createHash("sha256").update(raw).digest("hex");
      await db.botOutbox.upsert({ where: { eventKey }, create: { eventKey, chatId: update.chatId, publicKey }, update: {} });
      return { ok: true };
    });
  });
  if (db && secret && process.env.NODE_ENV !== "test") {
    let running = false;
    const timer = setInterval(async () => {
      if (running) return;
      running = true;
      try {
        const jobs = await db.botOutbox.findMany({ where: { completedAt: null, nextAttemptAt: { lte: new Date() }, attempts: { lt: 8 } }, orderBy: { id: "asc" }, take: 5 });
        for (const job of jobs) {
          try { await deliverBotOutbox(db, token, job.id); }
          catch {
            const attempts = job.attempts + 1;
            await db.botOutbox.update({ where: { id: job.id }, data: { attempts, nextAttemptAt: new Date(Date.now() + Math.min(3600000, 5000 * 2 ** attempts)) } });
            app.log.warn({ outboxId: job.id, attempts }, "MAX document delivery retry scheduled");
          }
        }
      } catch { app.log.error("MAX outbox polling failed"); }
      finally { running = false; }
    }, 5000);
    timer.unref();
    app.addHook("onClose", async () => clearInterval(timer));
  }
}

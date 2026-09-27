import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { isValidMaxBotName } from "../max/bot-name.js";

const maxApi = "https://platform-api2.max.ru";

class WebhookSetupError extends Error {}

function webhookUrl(publicBaseUrl: string): string {
  let url: URL;
  try {
    url = new URL(publicBaseUrl);
  } catch {
    throw new WebhookSetupError("PUBLIC_BASE_URL is not a valid URL");
  }
  if (url.protocol !== "https:" || !url.hostname || url.username || url.password || url.search || url.hash || publicBaseUrl.includes("?") || publicBaseUrl.includes("#") || url.pathname !== "/" || url.port) {
    throw new WebhookSetupError("PUBLIC_BASE_URL must be an HTTPS origin without credentials, path, port, query, or fragment");
  }
  return `${url.origin}/max/webhook`;
}

function failureCode(error: unknown): string {
  if (error instanceof Error && error.name === "TimeoutError") return "TIMEOUT";
  const cause = error instanceof Error ? (error as Error & { cause?: { code?: unknown } }).cause : undefined;
  const code = cause?.code;
  return typeof code === "string" && /^[A-Z0-9_]{2,80}$/.test(code) ? code : "NETWORK_ERROR";
}

async function maxJson(path: "/me" | "/subscriptions", token: string, method: "GET" | "POST", body?: Record<string, unknown>): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${maxApi}${path}`, {
      method,
      headers: { Authorization: token, ...(body ? { "Content-Type": "application/json" } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}),
      signal: AbortSignal.timeout(15000),
    });
  } catch (error) {
    throw new WebhookSetupError(`MAX ${method} ${path} request failed: ${failureCode(error)}`);
  }
  if (response.status !== 200) throw new WebhookSetupError(`MAX ${method} ${path} returned HTTP ${response.status}`);
  try {
    return await response.json() as unknown;
  } catch {
    throw new WebhookSetupError(`MAX ${method} ${path} returned invalid JSON`);
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

export async function ensureMaxWebhook(publicBaseUrl: string): Promise<void> {
  const url = webhookUrl(publicBaseUrl);
  const token = process.env.MAX_BOT_TOKEN;
  const botName = process.env.MAX_BOT_NAME;
  const secret = process.env.MAX_WEBHOOK_SECRET;
  if (!token) throw new WebhookSetupError("MAX_BOT_TOKEN is missing");
  if (!botName || !isValidMaxBotName(botName)) throw new WebhookSetupError("MAX_BOT_NAME is invalid");
  if (!secret || !/^[A-Za-z0-9_-]{5,256}$/.test(secret)) throw new WebhookSetupError("MAX_WEBHOOK_SECRET is invalid");

  const bot = record(await maxJson("/me", token, "GET"));
  if (!bot || bot.is_bot !== true || bot.username !== botName) throw new WebhookSetupError("MAX bot identity does not match MAX_BOT_NAME");
  console.log(`MAX bot verified: @${botName}`);

  const before = record(await maxJson("/subscriptions", token, "GET"))?.subscriptions;
  const current = Array.isArray(before) ? before.map(record).find((item) => item?.url === url) : null;
  const types = Array.isArray(current?.update_types) ? current.update_types.filter((item): item is string => typeof item === "string") : [];
  const required = ["bot_started", "message_created"];
  const updateTypes = [...new Set([...types, ...required])];
  const result = record(await maxJson("/subscriptions", token, "POST", { url, update_types: updateTypes, secret }));
  if (result?.success !== true) throw new WebhookSetupError("MAX POST /subscriptions did not report success");
  const subscriptions = record(await maxJson("/subscriptions", token, "GET"))?.subscriptions;
  if (!Array.isArray(subscriptions) || !subscriptions.some((value: unknown) => {
    const subscription = record(value);
    const confirmedTypes = subscription?.update_types;
    return subscription?.url === url && Array.isArray(confirmedTypes) && updateTypes.every((type) => confirmedTypes.includes(type));
  })) throw new WebhookSetupError("MAX GET /subscriptions did not confirm required webhook types");

  console.log(`MAX webhook configured: ${url}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  ensureMaxWebhook(process.argv[2] ?? "").catch((error: unknown) => {
    console.error(error instanceof WebhookSetupError ? error.message : "MAX webhook setup failed");
    process.exitCode = 1;
  });
}

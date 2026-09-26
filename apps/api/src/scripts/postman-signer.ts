import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadEnv } from "dotenv";

import { createSignedMaxInitData } from "../test/helpers/max-init-data.js";

const profileKeys = [
  "maxUserId", "maxFirstName", "maxLastName", "maxUsername", "maxLanguageCode", "maxPhotoUrl",
  "maxChatId", "maxChatType", "maxQueryId", "maxStartParam", "maxIp",
  "maxAuthDate", "maxAuthDateOffsetSeconds",
] as const;

type ProfileKey = typeof profileKeys[number];
export type PostmanProfile = Partial<Record<ProfileKey, string>>;

function decimal(value: string, field: string, allowNegative = false): string {
  const pattern = allowNegative ? /^(?:0|-?[1-9]\d*)$/ : /^[1-9]\d*$/;
  if (!pattern.test(value)) throw new Error(`${field} must be a decimal integer`);
  const number = BigInt(value);
  if (number > 9223372036854775807n || number < (allowNegative ? -9223372036854775808n : 1n)) {
    throw new Error(`${field} is outside the signed 64-bit range`);
  }
  return value;
}

function optional(value: string | undefined, fallback: string): string {
  return value === undefined || value === "" ? fallback : value;
}

export function createPostmanInitData(botToken: string, profile: PostmanProfile, now = new Date()): string {
  const userId = decimal(optional(profile.maxUserId, "9007199254740993"), "maxUserId");
  const chatId = decimal(optional(profile.maxChatId, "-9007199254740995"), "maxChatId", true);
  const chatType = optional(profile.maxChatType, "DIALOG");
  if (!["DIALOG", "CHAT", "CHANNEL"].includes(chatType)) throw new Error("maxChatType is invalid");

  const exactDate = profile.maxAuthDate?.trim();
  const offset = optional(profile.maxAuthDateOffsetSeconds?.trim(), "0");
  if (exactDate !== undefined && exactDate !== "" && !/^[1-9]\d*$/.test(exactDate)) {
    throw new Error("maxAuthDate must be a Unix timestamp in seconds");
  }
  if ((exactDate === undefined || exactDate === "") &&
      (!/^[+-]?(?:0|[1-9]\d*)$/.test(offset) || !Number.isSafeInteger(Number(offset)))) {
    throw new Error("maxAuthDateOffsetSeconds must be a safe integer");
  }
  const authDate = exactDate === undefined || exactDate === ""
    ? Math.floor(now.getTime() / 1000) + Number(offset)
    : Number(exactDate);
  if (!Number.isSafeInteger(authDate)) throw new Error("maxAuthDate must be a Unix timestamp in seconds");

  const user = `{"id":${userId},"first_name":${JSON.stringify(optional(profile.maxFirstName, "Макс"))},` +
    `"last_name":${JSON.stringify(optional(profile.maxLastName, "Пользователь"))},` +
    `"username":${JSON.stringify(profile.maxUsername || null)},` +
    `"language_code":${JSON.stringify(optional(profile.maxLanguageCode, "ru"))},` +
    `"photo_url":${JSON.stringify(profile.maxPhotoUrl || null)}}`;
  const chat = `{"id":${chatId},"type":${JSON.stringify(chatType)}}`;

  return createSignedMaxInitData(botToken, {
    auth_date: String(authDate),
    user,
    chat,
    query_id: optional(profile.maxQueryId, "local-postman-test"),
    start_param: optional(profile.maxStartParam, "local-test"),
    ip: optional(profile.maxIp, "203.0.113.9"),
  });
}

async function handleRequest(request: IncomingMessage, response: ServerResponse, botToken: string): Promise<void> {
  response.setHeader("Cache-Control", "no-store");
  if (request.method !== "POST" || request.url !== "/sign" || request.headers.origin ||
      request.headers["content-type"]?.split(";")[0] !== "application/json") {
    response.writeHead(404).end();
    return;
  }

  let body = "";
  for await (const chunk of request) {
    body += chunk.toString();
    if (body.length > 8192) {
      response.writeHead(413).end();
      return;
    }
  }
  try {
    const parsed: unknown = JSON.parse(body);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Expected a profile object");
    const profile = parsed as Record<string, unknown>;
    for (const [key, value] of Object.entries(profile)) {
      if (!profileKeys.includes(key as ProfileKey) || typeof value !== "string") throw new Error("Invalid profile field");
    }
    const initData = createPostmanInitData(botToken, profile as PostmanProfile);
    response.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ initData }));
  } catch (error) {
    response.writeHead(400, { "Content-Type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ message: error instanceof Error ? error.message : "Invalid profile" }));
  }
}

export function createPostmanSignerServer(botToken: string) {
  return createServer((request, response) => {
    void handleRequest(request, response, botToken).catch(() => response.destroy());
  });
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  loadEnv({ path: resolve(process.cwd(), "../../.env"), quiet: true });
  const botToken = process.env.MAX_BOT_TOKEN;
  if (!botToken || botToken.startsWith("replace_with_")) throw new Error("Set MAX_BOT_TOKEN in the project .env");
  createPostmanSignerServer(botToken).listen(36901, "127.0.0.1", () => {
    process.stdout.write("Local Postman signer listening at http://127.0.0.1:36901/sign\n");
  });
}

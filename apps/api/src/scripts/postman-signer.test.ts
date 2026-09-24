import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createPostmanInitData, createPostmanSignerServer } from "./postman-signer.js";

const botToken = "local-test-secret-token";
const now = new Date("2026-09-24T16:00:00.000Z");

async function checkMe(profile: Parameters<typeof createPostmanInitData>[1], initData?: string) {
  const app = await createApp({
    config: { botToken, maxInitDataMaxAgeSeconds: 3600 },
    now: () => now,
    logger: false,
    userRepository: { isReady: async () => true, upsertFromMax: async () => {} },
  });
  try {
    return await app.inject({ method: "GET", url: "/api/me", headers: {
      "x-max-init-data": initData ?? createPostmanInitData(botToken, profile, now),
    } });
  } finally {
    await app.close();
  }
}

describe("local Postman MAX signer", () => {
  it("uses current auth_date and returns all custom MAX fields without losing ID precision", async () => {
    const response = await checkMe({
      maxUserId: "9007199254740993",
      maxFirstName: "Анна",
      maxLastName: "Тестовая",
      maxUsername: "anna_test",
      maxLanguageCode: "ru",
      maxPhotoUrl: "https://example.test/photo.jpg",
      maxChatId: "-9007199254740995",
      maxChatType: "CHAT",
      maxQueryId: "custom-query",
      maxStartParam: "custom-start",
      maxIp: "198.51.100.4",
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(expect.objectContaining({
      auth_date: Math.floor(now.getTime() / 1000),
      query_id: "custom-query",
      start_param: "custom-start",
      ip: "198.51.100.4",
      user: {
        id: "9007199254740993",
        first_name: "Анна",
        last_name: "Тестовая",
        username: "anna_test",
        language_code: "ru",
        photo_url: "https://example.test/photo.jpg",
      },
      chat: { id: "-9007199254740995", type: "CHAT" },
    }));
  });

  it("rejects expired and future offset dates", async () => {
    expect((await checkMe({ maxAuthDateOffsetSeconds: "-3601" })).statusCode).toBe(401);
    expect((await checkMe({ maxAuthDateOffsetSeconds: "+61" })).statusCode).toBe(401);
  });

  it("gives an exact auth_date priority over the offset", async () => {
    const exact = String(Math.floor(now.getTime() / 1000));
    const response = await checkMe({ maxAuthDate: exact, maxAuthDateOffsetSeconds: "-3601" });
    expect(response.statusCode).toBe(200);
    expect(response.json().auth_date).toBe(Number(exact));
  });

  it("rejects changes to signed data", async () => {
    const signed = createPostmanInitData(botToken, { maxFirstName: "Анна" }, now);
    expect((await checkMe({}, signed.replace(encodeURIComponent("Анна"), encodeURIComponent("Ирина")))).statusCode).toBe(401);
  });

  it("keeps the token out of the Postman collection and signer response", async () => {
    const collection = await readFile(resolve(process.cwd(), "../../docs/postman/Priemka.postman_collection.json"), "utf8");
    expect(collection).not.toContain("MAX_BOT_TOKEN");
    expect(collection).not.toContain(botToken);

    const server = createPostmanSignerServer(botToken);
    await new Promise<void>((resolveListen) => server.listen(0, "127.0.0.1", resolveListen));
    try {
      const address = server.address();
      if (!address || typeof address === "string") throw new Error("Missing test port");
      const response = await fetch(`http://127.0.0.1:${address.port}/sign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ maxFirstName: "Анна" }),
      });
      const body = await response.text();
      expect(response.status).toBe(200);
      expect(body).not.toContain(botToken);
      expect(JSON.parse(body).initData).toBeTypeOf("string");
    } finally {
      await new Promise<void>((resolveClose, rejectClose) => server.close((error) => error ? rejectClose(error) : resolveClose()));
    }
  });
});

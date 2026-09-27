import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { createApp } from "../app.js";
import { createPostmanInitData, createPostmanSignerServer } from "./postman-signer.js";

const botToken = "local-test-secret-token";
const now = new Date("2026-09-24T16:00:00.000Z");

async function checkMe(profile: Parameters<typeof createPostmanInitData>[1], initData?: string) {
  const app = await createApp({
    config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 },
    now: () => now,
    logger: false,
    userRepository: { isReady: async () => true, upsertFromMax: async () => ({ id: 1, isAdmin: false }) },
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
        id: 1,
        maxUserId: "9007199254740993",
        isAdmin: false,
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

  it("includes business requests with MAX signing and reusable IDs", async () => {
    const collection = JSON.parse(await readFile(resolve(process.cwd(), "../../docs/postman/Priemka.postman_collection.json"), "utf8"));
    const business = collection.item.find((item: { name: string }) => item.name === "Business API");
    const me = collection.item.find((item: { name: string }) => item.name === "GET /api/me");
    expect(business.event.find((event: { listen: string }) => event.listen === "prerequest"))
      .toEqual(me.event.find((event: { listen: string }) => event.listen === "prerequest"));
    expect(collection.variable.map((variable: { key: string }) => variable.key)).toEqual(
      expect.arrayContaining(["houseId", "workId", "mediaId", "maxJoinUrl"]),
    );
    const requests = business.item.map((item: { request: { method: string; url: string; header: { key: string; value: string }[] } }) => {
      expect(item.request.header).toEqual(expect.arrayContaining([
        expect.objectContaining({ key: "X-Max-Init-Data", value: "{{maxInitData}}" }),
      ]));
      return `${item.request.method} ${item.request.url}`;
    });
    expect(requests).toEqual(expect.arrayContaining([
      "GET {{baseUrl}}/api/houses/{{houseId}}/works",
      "GET {{baseUrl}}/api/works/{{workId}}",
      "POST {{baseUrl}}/api/works/{{workId}}/watch",
      "DELETE {{baseUrl}}/api/works/{{workId}}/watch",
      "GET {{baseUrl}}/api/houses/{{houseId}}/observations",
      "POST {{baseUrl}}/api/houses/{{houseId}}/observations",
      "GET {{baseUrl}}/api/works/{{workId}}/comments?page=1&limit=20",
      "POST {{baseUrl}}/api/works/{{workId}}/comments",
      "PUT {{baseUrl}}/api/houses/{{houseId}}/chat",
      "DELETE {{baseUrl}}/api/houses/{{houseId}}/chat",
      "POST {{baseUrl}}/api/media",
    ]));
  });
  it("includes workflow requests with the same MAX signing and no bot secret", async () => {
    const collection = JSON.parse(await readFile(resolve(process.cwd(), "../../docs/postman/Priemka.postman_collection.json"), "utf8"));
    const business = collection.item.find((item: { name: string }) => item.name === "Business API");
    const workflow = collection.item.find((item: { name: string }) => item.name === "Workflow API");
    expect(workflow.event).toEqual(business.event);
    const paths = workflow.item.map((item: { request: { method: string; url: string; header: { key: string; value: string }[] } }) => {
      expect(item.request.header).toEqual(expect.arrayContaining([expect.objectContaining({ key: "X-Max-Init-Data", value: "{{maxInitData}}" })]));
      return `${item.request.method} ${item.request.url}`;
    });
    expect(paths).toEqual(expect.arrayContaining([
      "GET {{baseUrl}}/api/checklist-templates?category=COMMON_AREAS",
      "POST {{baseUrl}}/api/works/{{workId}}/inspections",
      "PUT {{baseUrl}}/api/inspection-assignments/{{assignmentId}}/answers/{{itemId}}",
      "POST {{baseUrl}}/api/inspection-assignments/{{assignmentId}}/complete",
      "POST {{baseUrl}}/api/issues/{{issueId}}/remediations",
      "POST {{baseUrl}}/api/reinspections/{{reinspectionId}}/complete",
      "POST {{baseUrl}}/api/works/{{workId}}/documents",
      "POST {{baseUrl}}/api/documents/{{documentId}}/confirm",
    ]));
    const inspection = workflow.item.find((item: { request: { url: string; method: string } }) => item.request.url.endsWith("/inspections") && item.request.method === "POST");
    expect(JSON.parse(inspection.request.body.raw)).toHaveProperty("assigneeUserId");
    expect(inspection.request.body.raw).not.toContain("assigneeUserIds");
    const act = workflow.item.find((item: { name: string }) => item.name === "POST акт приёмки");
    expect(JSON.parse(act.request.body.raw)).toEqual({ type: "ACCEPTANCE_ACT" });
    expect(JSON.stringify(workflow)).not.toContain("MAX_BOT_TOKEN");
  });
});

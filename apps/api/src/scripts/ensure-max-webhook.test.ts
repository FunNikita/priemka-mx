import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { ensureMaxWebhook } from "./ensure-max-webhook.js";

const token = "test-bot-token-private";
const secret = "test_webhook_secret_private";
const botName = "expected_bot";
const webhook = "https://dev.example.com/max/webhook";

function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status, headers: { "Content-Type": "application/json" } });
}

function mockFetch(...responses: Response[]) {
  const mocked = vi.fn();
  for (const response of responses) mocked.mockResolvedValueOnce(response);
  vi.stubGlobal("fetch", mocked);
  return mocked;
}

beforeEach(() => {
  vi.stubEnv("MAX_BOT_TOKEN", token);
  vi.stubEnv("MAX_BOT_NAME", botName);
  vi.stubEnv("MAX_WEBHOOK_SECRET", secret);
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("ensureMaxWebhook", () => {
  it("verifies the bot, posts bot_started and the secret, and confirms the subscription", async () => {
    const mocked = mockFetch(
      json({ is_bot: true, username: botName }),
      json({ success: true }),
      json({ subscriptions: [{ url: webhook, update_types: ["bot_started"] }] }),
    );

    await ensureMaxWebhook("https://dev.example.com");

    expect(mocked).toHaveBeenCalledTimes(3);
    expect(mocked).toHaveBeenNthCalledWith(1, "https://platform-api2.max.ru/me", expect.objectContaining({ method: "GET", headers: { Authorization: token } }));
    expect(mocked).toHaveBeenNthCalledWith(2, "https://platform-api2.max.ru/subscriptions", expect.objectContaining({ method: "POST", headers: { Authorization: token, "Content-Type": "application/json" } }));
    expect(JSON.parse(String((mocked.mock.calls[1][1] as RequestInit).body))).toEqual({ url: webhook, update_types: ["bot_started"], secret });
    expect(mocked).toHaveBeenNthCalledWith(3, "https://platform-api2.max.ru/subscriptions", expect.objectContaining({ method: "GET", headers: { Authorization: token } }));
    expect(console.log).toHaveBeenCalledWith(`MAX bot verified: @${botName}`);
    expect(console.log).toHaveBeenCalledWith(`MAX webhook configured: ${webhook}`);
  });

  it("rejects the wrong bot before changing subscriptions", async () => {
    const mocked = mockFetch(json({ is_bot: true, username: "different_bot" }));
    await expect(ensureMaxWebhook("https://dev.example.com")).rejects.toThrow("MAX bot identity does not match");
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid token without using the response body", async () => {
    const mocked = mockFetch(json({ message: `${token} ${secret}` }, 401));
    const message = await ensureMaxWebhook("https://dev.example.com").then(() => "", (error: Error) => error.message);
    expect(message).toContain("HTTP 401");
    expect(message).not.toContain(token);
    expect(message).not.toContain(secret);
    expect(mocked).toHaveBeenCalledTimes(1);
  });

  it("fails when POST /subscriptions returns success false", async () => {
    const mocked = mockFetch(json({ is_bot: true, username: botName }), json({ success: false, message: secret }));
    await expect(ensureMaxWebhook("https://dev.example.com")).rejects.toThrow("did not report success");
    expect(mocked).toHaveBeenCalledTimes(2);
  });

  it("fails when GET /subscriptions does not contain the expected bot_started webhook", async () => {
    mockFetch(
      json({ is_bot: true, username: botName }),
      json({ success: true }),
      json({ subscriptions: [{ url: webhook, update_types: ["message_created"] }] }),
    );
    await expect(ensureMaxWebhook("https://dev.example.com")).rejects.toThrow("did not confirm bot_started webhook");
  });

  it("rejects an HTTP base URL before any network request", async () => {
    const mocked = mockFetch();
    await expect(ensureMaxWebhook("http://dev.example.com")).rejects.toThrow("PUBLIC_BASE_URL");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("rejects an invalid webhook secret before any network request", async () => {
    vi.stubEnv("MAX_WEBHOOK_SECRET", "bad secret");
    const mocked = mockFetch();
    await expect(ensureMaxWebhook("https://dev.example.com")).rejects.toThrow("MAX_WEBHOOK_SECRET is invalid");
    expect(mocked).not.toHaveBeenCalled();
  });

  it("does not include credentials in network errors", async () => {
    const mocked = vi.fn().mockRejectedValue(new Error(`fetch failed ${token} ${secret}`));
    vi.stubGlobal("fetch", mocked);
    const message = await ensureMaxWebhook("https://dev.example.com").then(() => "", (error: Error) => error.message);
    expect(message).toContain("NETWORK_ERROR");
    expect(message).not.toContain(token);
    expect(message).not.toContain(secret);
  });
});

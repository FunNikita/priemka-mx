import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { validateMaxInitData } from "../api/src/max/init-data";
import { resolveMaxInitData } from "./src/maxAuth";
import { createDevMaxInitData } from "./vite-dev-max-auth";

const identity = {
  botToken: "local-test-token",
  userId: "7000000000000000101",
  firstName: "Даша",
  lastName: "Демо",
};

describe("локальная MAX-авторизация", () => {
  it("сохраняет приоритет настоящего raw initData", async () => {
    const fetchStub = vi.fn();
    expect(await resolveMaxInitData("real=signed&data=1", true, "127.0.0.1", fetchStub)).toBe("real=signed&data=1");
    expect(fetchStub).not.toHaveBeenCalled();
  });

  it("запрашивает stub только в локальном DEV", async () => {
    const fetchStub = vi.fn().mockResolvedValue(new Response(JSON.stringify({ initData: "stub=signed" }), { headers: { "Content-Type": "application/json" } }));
    expect(await resolveMaxInitData(undefined, true, "127.0.0.1", fetchStub)).toBe("stub=signed");
    expect(await resolveMaxInitData(undefined, false, "127.0.0.1", fetchStub)).toBeUndefined();
    expect(await resolveMaxInitData(undefined, true, "dev-priemka.example", fetchStub)).toBeUndefined();
    expect(fetchStub).toHaveBeenCalledTimes(1);
  });

  it("не создаёт авторизацию при выключенном или недоступном stub", async () => {
    const missing = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    expect(await resolveMaxInitData(undefined, true, "localhost", missing)).toBeUndefined();
    expect(await resolveMaxInitData(undefined, false, "localhost", missing)).toBeUndefined();
    expect(missing).toHaveBeenCalledTimes(1);
  });

  it("подписывает точный int64 MAX ID для существующего backend validator", () => {
    const now = new Date("2026-09-27T10:00:00Z");
    const signed = createDevMaxInitData(identity, now);
    const user = new URLSearchParams(signed).get("user");
    expect(user).toContain('"id":7000000000000000101');
    expect(validateMaxInitData(signed, identity.botToken, 3600, now).user.id).toBe(identity.userId);
    expect(new URLSearchParams(createDevMaxInitData(identity, now)).get("query_id")).not.toBe(new URLSearchParams(signed).get("query_id"));
  });

  it("не содержит bot token в клиентских исходниках", () => {
    const clientFiles = ["src/api.ts", "src/maxAuth.ts"];
    for (const file of clientFiles) {
      const source = readFileSync(resolve(import.meta.dirname, file), "utf8");
      expect(source).not.toContain(identity.botToken);
      expect(source).not.toContain("DEV_MAX_BOT_TOKEN");
    }
  });
});

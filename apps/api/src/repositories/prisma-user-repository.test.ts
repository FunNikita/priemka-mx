import { describe, expect, it, vi } from "vitest";
const { upsert, enroll } = vi.hoisted(() => ({ upsert: vi.fn(), enroll: vi.fn() }));
vi.mock("../../generated/prisma/client.js", () => ({ PrismaClient: class { user = { upsert }; } }));
vi.mock("@prisma/adapter-mariadb", () => ({ PrismaMariaDb: class {} }));
vi.mock("../demo-auto-enroll.js", () => ({ autoEnrollDemoResident: enroll }));
import { PrismaUserRepository } from "./prisma-user-repository.js";

describe("centralized user upsert enrollment", () => {
  it.each([undefined, "Exact house"])("preserves identity and enrolls after successful upsert (%s)", async (address) => {
    vi.stubEnv("DATABASE_URL", "mysql://test:test@localhost/test");
    upsert.mockReset(); enroll.mockReset(); upsert.mockResolvedValue({ id: 5, isAdmin: false });
    try {
      const repo = new PrismaUserRepository(address);
      const input = { user: { id: "9007199254740993", firstName: "Имя", lastName: "Фамилия", username: null, languageCode: "ru", photoUrl: null }, authDate: 100, seenAt: new Date() };
      expect(await repo.upsertFromMax(input)).toEqual({ id: 5, isAdmin: false });
      expect(enroll).toHaveBeenCalledWith(repo.prisma, 5, address);
      expect(upsert.mock.invocationCallOrder[0]).toBeLessThan(enroll.mock.invocationCallOrder[0]);
      const args = upsert.mock.calls[0][0];
      expect(args.where.maxUserId).toBe(input.user.id);
      expect(args.update).not.toHaveProperty("isAdmin"); expect(args.update).not.toHaveProperty("lastHouseId");
    } finally { vi.unstubAllEnvs(); }
  });
});

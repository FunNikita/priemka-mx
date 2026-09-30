import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { autoEnrollDemoResident } from "./demo-auto-enroll.js";

function fixture(current: Record<string, unknown> | null = null, houses = [{ id: 78 }]) {
  let membership = current;
  const tx = {
    $queryRaw: vi.fn().mockResolvedValue(houses),
    houseMembership: {
      findUnique: vi.fn(async () => membership),
      create: vi.fn(async ({ data }) => (membership = { id: 1, ...data })),
      update: vi.fn(async ({ data }) => (membership = { ...membership, ...data })),
    },
    activityEvent: { create: vi.fn().mockResolvedValue({}) },
    user: { update: vi.fn() }, botOutbox: { create: vi.fn() },
  };
  const transaction = vi.fn(async (callback) => callback(tx));
  const db = { $transaction: transaction } as unknown as PrismaClient;
  return { db, tx, transaction };
}

describe("demo auto-enroll", () => {
  it("does nothing when disabled", async () => {
    const f = fixture(); await autoEnrollDemoResident(f.db, 5);
    expect(f.transaction).not.toHaveBeenCalled();
  });
  it("creates one active resident, then is idempotent, without requests, messages or user changes", async () => {
    const f = fixture();
    await autoEnrollDemoResident(f.db, 5, "Exact house");
    await autoEnrollDemoResident(f.db, 5, "Exact house");
    expect(f.tx.$queryRaw.mock.calls[0][0].join("?")).toContain("BINARY address = BINARY ? LIMIT 2 FOR UPDATE");
    expect(f.tx.$queryRaw.mock.calls[0][1]).toBe("Exact house");
    expect(f.tx.houseMembership.create).toHaveBeenCalledExactlyOnceWith({ data: { houseId: 78, userId: 5, role: "RESIDENT", status: "ACTIVE", joinedVia: "ADMIN", executorCompanyName: null } });
    expect(f.tx.houseMembership.update).not.toHaveBeenCalled();
    expect(f.tx.activityEvent.create).toHaveBeenCalledTimes(1);
    expect(f.tx.activityEvent.create.mock.calls[0][0].data.actorUserId).toBeUndefined();
    expect(f.tx.botOutbox.create).not.toHaveBeenCalled(); expect(f.tx.user.update).not.toHaveBeenCalled();
  });
  it.each(["PENDING", "REJECTED"])("activates only the status of an existing %s resident", async (status) => {
    const f = fixture({ id: 1, role: "RESIDENT", status, joinedVia: "REQUEST" });
    await autoEnrollDemoResident(f.db, 5, "Exact house");
    expect(f.tx.houseMembership.update).toHaveBeenCalledExactlyOnceWith({ where: { id: 1 }, data: { status: "ACTIVE" } });
    expect(f.tx.houseMembership.create).not.toHaveBeenCalled();
  });
  it.each(["RESIDENT", "CHAIRMAN", "COUNCIL_MEMBER", "EXECUTOR"])("preserves active %s", async (role) => {
    const f = fixture({ id: 1, role, status: "ACTIVE", executorCompanyName: "Existing company" });
    await autoEnrollDemoResident(f.db, 5, "Exact house");
    expect(f.tx.houseMembership.create).not.toHaveBeenCalled(); expect(f.tx.houseMembership.update).not.toHaveBeenCalled(); expect(f.tx.activityEvent.create).not.toHaveBeenCalled();
  });
  it.each(["CHAIRMAN", "COUNCIL_MEMBER", "EXECUTOR"])("preserves pending/rejected elevated %s", async (role) => {
    for (const status of ["PENDING", "REJECTED"]) {
      const f = fixture({ id: 1, role, status, executorCompanyName: "Existing company" });
      await autoEnrollDemoResident(f.db, 5, "Exact house");
      expect(f.tx.houseMembership.update).not.toHaveBeenCalled(); expect(f.tx.houseMembership.create).not.toHaveBeenCalled();
    }
  });
  it.each([{ houses: [] }, { houses: [{ id: 78 }, { id: 79 }] }])("fails closed for nonunique address", async ({ houses }) => {
    const f = fixture(null, houses);
    await expect(autoEnrollDemoResident(f.db, 5, "Exact house")).rejects.toMatchObject({ statusCode: 503 });
    expect(f.tx.houseMembership.create).not.toHaveBeenCalled(); expect(f.tx.houseMembership.update).not.toHaveBeenCalled();
  });
});

import { describe, expect, it } from "vitest";

import type { PrismaClient } from "../../generated/prisma/client.js";
import { additionalDemoHouseAddresses, seedDemo } from "./seed-demo.js";

type Row = Record<string, unknown> & { id: number };

function memoryDb() {
  const users: Row[] = [];
  const houses: Row[] = [];
  const memberships: Row[] = [];
  const objects: Row[] = [];
  const works: Row[] = [];
  const observations: Row[] = [];
  const templates: Row[] = [];
  const find = (rows: Row[], where: Record<string, unknown>) => rows.find((row) => Object.entries(where).every(([key, value]) => row[key] === value)) ?? null;
  const create = (rows: Row[], data: Record<string, unknown>) => {
    const row = { ...data, id: rows.length + 1 };
    rows.push(row);
    return row;
  };
  const db = {
    user: { upsert: async ({ where, create: data }: { where: { maxUserId: string }; create: Record<string, unknown> }) => find(users, where) ?? create(users, data) },
    house: { findFirst: async ({ where }: { where: Record<string, unknown> }) => find(houses, where), create: async ({ data }: { data: Record<string, unknown> }) => create(houses, data) },
    houseMembership: { upsert: async ({ where, create: data }: { where: { houseId_userId: { houseId: number; userId: number } }; create: Record<string, unknown> }) => find(memberships, where.houseId_userId) ?? create(memberships, data) },
    houseObject: { findFirst: async ({ where }: { where: Record<string, unknown> }) => find(objects, where), create: async ({ data }: { data: Record<string, unknown> }) => create(objects, data) },
    work: { findFirst: async ({ where }: { where: Record<string, unknown> }) => find(works, where), create: async ({ data }: { data: Record<string, unknown> }) => create(works, data) },
    observation: { findFirst: async ({ where }: { where: Record<string, unknown> }) => find(observations, where), create: async ({ data }: { data: Record<string, unknown> }) => create(observations, data) },
    checklistTemplate: { findUnique: async ({ where }: { where: Record<string, unknown> }) => find(templates, where), create: async ({ data }: { data: Record<string, unknown> }) => create(templates, data) },
  } as unknown as PrismaClient;
  return { db, users, houses, memberships, objects, works, observations, templates };
}

describe("demo seed", () => {
  it("is repeatable and covers all five product statuses", async () => {
    const memory = memoryDb();
    const first = await seedDemo(memory.db);
    expect(memory.houses).toHaveLength(6);
    expect(memory.houses.map((house) => house.address)).toEqual(["Демо: ул. Примерная, д. 12", ...additionalDemoHouseAddresses]);
    const second = await seedDemo(memory.db);
    expect(second).toEqual(first);
    expect(memory.houses).toHaveLength(6);
    expect(new Set(memory.houses.map((house) => house.address)).size).toBe(6);
    expect(memory.users).toHaveLength(5);
    expect(memory.memberships).toHaveLength(4);
    const admin = memory.users.find((item) => item.isAdmin === true);
    expect(admin).toBeDefined();
    expect(memory.memberships.some((item) => item.userId === admin?.id)).toBe(false);
    expect(memory.objects).toHaveLength(2);
    expect(memory.works).toHaveLength(6);
    expect(memory.works.find((item) => item.title === "Демо: передана на проверку")?.submittedForInspectionAt).toBeTruthy();
    expect(memory.observations).toHaveLength(2);
    expect(memory.templates).toHaveLength(5);
    expect(new Set(memory.works.map((work) => work.status))).toEqual(new Set(["NEW", "IN_REVIEW", "IN_PROGRESS", "WAITING", "ACCEPTED"]));
    expect(new Set(memory.memberships.map((item) => item.role))).toEqual(new Set(["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN", "EXECUTOR"]));
  });
});

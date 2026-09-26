import { describe, expect, it } from "vitest";
import type { PrismaClient } from "../generated/prisma/client.js";
import { createApp } from "./app.js";
import { createSignedMaxInitData } from "./test/helpers/max-init-data.js";

const token = "test-bot-token";
const auth = (id: number) => ({ "x-max-init-data": createSignedMaxInitData(token, { user: `{"id":${9007199254740992n + BigInt(id)},"first_name":"Имя","last_name":"Фамилия","username":null,"language_code":"ru","photo_url":null}` }) });
type Member = { id: number; houseId: number; userId: number; role: "RESIDENT" | "COUNCIL_MEMBER" | "CHAIRMAN" | "EXECUTOR"; status: "PENDING" | "ACTIVE" | "REJECTED"; joinedVia: "CHAT" | "INVITE" | "REQUEST" | "ADMIN"; executorCompanyName: string | null; canSignAcceptanceAct: boolean; authorityBasis: string | null; createdAt: Date; updatedAt: Date };
const houses = [{ id: 1, address: "Москва, А" }, { id: 2, address: "Москва, Б" }, { id: 3, address: "Санкт-Петербург, В" }];

function fixture() {
  const members: Member[] = [];
  let nextId = 1;
  const add = (houseId: number, userId: number, role: Member["role"], status: Member["status"], joinedVia: Member["joinedVia"] = "ADMIN") => {
    const row: Member = { id: nextId++, houseId, userId, role, status, joinedVia, executorCompanyName: null, canSignAcceptanceAct: false, authorityBasis: null, createdAt: new Date("2026-09-25T00:00:00Z"), updatedAt: new Date("2026-09-25T00:00:00Z") };
    members.push(row);
    return row;
  };
  const matches = (m: Member, where: Record<string, unknown>) => Object.entries(where).every(([key, value]) => (m as unknown as Record<string, unknown>)[key] === value);
  const db = {
    user: { findUnique: async ({ where }: { where: { id?: number } }) => where.id && where.id > 5 ? null : { id: where.id ?? 1, lastHouseId: null, maxUserId: String(9007199254740992n + BigInt(where.id ?? 1)), firstName: "Имя", lastName: "Фамилия", username: null, photoUrl: null, memberships: members.filter((m) => m.userId === where.id).map((m) => ({ ...m, house: houses.find((h) => h.id === m.houseId)! })) }, count: async () => 5, findMany: async () => Array.from({ length: 5 }, (_, index) => ({ id: index + 1, maxUserId: String(9007199254740993n + BigInt(index)), firstName: "Имя", lastName: "Фамилия", username: null, photoUrl: null, memberships: members.filter((m) => m.userId === index + 1).map((m) => ({ ...m, house: houses.find((h) => h.id === m.houseId)! })) })) },
    house: {
      findUnique: async ({ where }: { where: { id: number } }) => houses.find((h) => h.id === where.id) ?? null,
      count: async ({ where }: { where: { address?: { contains: string } } }) => houses.filter((h) => !where.address || h.address.includes(where.address.contains)).length,
      findMany: async ({ where, skip, take, select }: { where: { address?: { contains: string } }; skip: number; take: number; select: { memberships: { where: { userId: number } } } }) => houses.filter((h) => !where.address || h.address.includes(where.address.contains)).slice(skip, skip + take).map((h) => ({ ...h, memberships: members.filter((m) => m.houseId === h.id && m.userId === select.memberships.where.userId) })),
    },
    houseMembership: {
      findUnique: async ({ where }: { where: { id?: number; houseId_userId?: { houseId: number; userId: number } } }) => members.find((m) => where.id ? m.id === where.id : m.houseId === where.houseId_userId?.houseId && m.userId === where.houseId_userId.userId) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => members.find((m) => m.id === where.id)!,
      findMany: async ({ where, skip, take }: { where: Record<string, unknown>; skip?: number; take?: number }) => {
        if ("user" in where) return members.filter((m) => m.userId === 1).map((m) => ({ ...m, house: houses.find((h) => h.id === m.houseId)! }));
        return members.filter((m) => matches(m, where)).slice(skip ?? 0, (skip ?? 0) + (take ?? members.length)).map((m) => ({ ...m, user: { id: m.userId, firstName: "Имя", lastName: "Фамилия", photoUrl: null } }));
      },
      count: async ({ where }: { where: Record<string, unknown> }) => members.filter((m) => matches(m, where)).length,
      create: async ({ data }: { data: Omit<Member, "id" | "createdAt" | "updatedAt"> }) => {
        if (members.some((m) => m.houseId === data.houseId && m.userId === data.userId)) throw { code: "P2002" };
        return add(data.houseId, data.userId, data.role, data.status, data.joinedVia);
      },
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Member> }) => {
        const found = members.filter((m) => matches(m, where));
        found.forEach((m) => Object.assign(m, data, { updatedAt: new Date("2026-09-26T00:00:00Z") }));
        return { count: found.length };
      },
      deleteMany: async ({ where }: { where: Record<string, unknown> }) => {
        let count = 0;
        for (let i = members.length - 1; i >= 0; i--) if (matches(members[i], where)) { members.splice(i, 1); count++; }
        return { count };
      },
      findFirst: async ({ where }: { where: { houseId: number; role: Member["role"]; status: Member["status"]; userId: { not: number } } }) => members.find((m) => m.houseId === where.houseId && m.role === where.role && m.status === where.status && m.userId !== where.userId.not) ?? null,
      upsert: async ({ where, create, update }: { where: { houseId_userId: { houseId: number; userId: number } }; create: Partial<Member> & Pick<Member, "houseId" | "userId" | "role" | "status" | "joinedVia">; update: Partial<Member> }) => {
        const existing = members.find((m) => m.houseId === where.houseId_userId.houseId && m.userId === where.houseId_userId.userId);
        if (existing) { Object.assign(existing, update); return existing; }
        const row = add(create.houseId, create.userId, create.role, create.status, create.joinedVia);
        Object.assign(row, create);
        return row;
      },
    },
    $queryRaw: async () => [{ id: 1 }],
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => fn(db),
  };
  const app = (allowSelfRoleSwitch = false) => createApp({ config: { botToken: token, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600, allowSelfRoleSwitch }, userRepository: { isReady: async () => true, upsertFromMax: async ({ user }) => ({ id: Number(BigInt(user.id) - 9007199254740992n), isAdmin: user.id === "9007199254740997" }) }, businessDb: db as unknown as PrismaClient, logger: false, staticRoot: "/nonexistent-priemka-static" });
  return { app, add, members };
}

describe("houses and join requests", () => {
  it("switches only active own roles, retains company and enforces one active chairman", async () => {
    const f = fixture();
    const blocked = await f.app();
    f.add(1, 1, "RESIDENT", "ACTIVE");
    expect((await blocked.inject({ method: "PATCH", url: "/api/me/houses/1/membership", headers: auth(1), payload: { role: "EXECUTOR", executorCompanyName: "Компания" } })).statusCode).toBe(403);
    await blocked.close();
    const app = await f.app(true);
    const patch = (userId: number, payload: object) => app.inject({ method: "PATCH", url: "/api/me/houses/1/membership", headers: auth(userId), payload });
    try {
      expect((await patch(2, { role: "CHAIRMAN" })).statusCode).toBe(403);
      const pending = f.add(2, 2, "RESIDENT", "PENDING");
      expect((await app.inject({ method: "PATCH", url: "/api/me/houses/2/membership", headers: auth(2), payload: { role: "CHAIRMAN" } })).statusCode).toBe(403);
      pending.status = "REJECTED";
      expect((await app.inject({ method: "PATCH", url: "/api/me/houses/2/membership", headers: auth(2), payload: { role: "CHAIRMAN" } })).statusCode).toBe(403);
      expect((await patch(1, { role: "EXECUTOR" })).statusCode).toBe(400);
      expect((await patch(1, { role: "EXECUTOR", executorCompanyName: "  Компания  " })).json().executorCompanyName).toBe("Компания");
      expect((await patch(1, { role: "CHAIRMAN" })).statusCode).toBe(200);
      f.add(1, 2, "RESIDENT", "ACTIVE");
      expect((await patch(2, { role: "CHAIRMAN" })).statusCode).toBe(409);
      expect((await patch(1, { role: "COUNCIL_MEMBER" })).statusCode).toBe(200);
      expect((await patch(2, { role: "CHAIRMAN" })).statusCode).toBe(200);
      expect((await patch(2, { role: "EXECUTOR", executorCompanyName: "Исполнитель" })).statusCode).toBe(200);
      expect((await patch(1, { role: "CHAIRMAN" })).statusCode).toBe(200);
      expect(f.members.find((m) => m.userId === 1)?.executorCompanyName).toBe("Компания");
    } finally { await app.close(); }
  });

  it("restricts admin endpoints and upserts memberships without changing joinedVia", async () => {
    const f = fixture();
    const app = await f.app(true);
    const path = "/api/admin/houses/1/members/2";
    try {
      expect((await app.inject({ method: "GET", url: "/api/admin/users", headers: auth(1) })).statusCode).toBe(403);
      expect((await app.inject({ method: "PUT", url: path, headers: auth(1), payload: { role: "EXECUTOR", status: "ACTIVE", executorCompanyName: "Компания" } })).statusCode).toBe(403);
      const users = await app.inject({ method: "GET", url: "/api/admin/users", headers: auth(5) });
      expect(users.statusCode).toBe(200);
      expect(users.json().items[0]).toEqual(expect.objectContaining({ id: 1, maxUserId: expect.any(String), memberships: [] }));
      expect((await app.inject({ method: "PUT", url: path, headers: auth(5), payload: { role: "EXECUTOR", status: "ACTIVE" } })).statusCode).toBe(400);
      const created = await app.inject({ method: "PUT", url: path, headers: auth(5), payload: { role: "EXECUTOR", status: "ACTIVE", executorCompanyName: "  Компания  " } });
      expect(created.statusCode).toBe(200);
      expect(created.json()).toEqual(expect.objectContaining({ joinedVia: "ADMIN", executorCompanyName: "Компания" }));
      const updated = await app.inject({ method: "PUT", url: path, headers: auth(5), payload: { role: "CHAIRMAN", status: "ACTIVE" } });
      expect(updated.statusCode).toBe(200);
      expect(updated.json().executorCompanyName).toBe("Компания");
      expect((await app.inject({ method: "PUT", url: "/api/admin/houses/1/members/1", headers: auth(5), payload: { role: "CHAIRMAN", status: "ACTIVE" } })).statusCode).toBe(409);
      expect((await app.inject({ method: "GET", url: "/api/admin/users", headers: auth(5) })).json().items[1].memberships[0].houseAddress).toBe("Москва, А");
    } finally { await app.close(); }
  });

  it("lists houses for users without membership, filters and paginates, and exposes access actions", async () => {
    const f = fixture();
    const app = await f.app();
    try {
      expect((await app.inject({ method: "GET", url: "/api/houses" })).statusCode).toBe(401);
      const none = (await app.inject({ method: "GET", url: "/api/houses", headers: auth(1) })).json();
      expect(none.total).toBe(3);
      expect(none.items[0]).toEqual({ id: 1, address: "Москва, А", access: { status: "NONE", role: null, joinedVia: null }, actions: { open: false, requestAccess: true, cancelRequest: false } });
      expect((await app.inject({ method: "GET", url: "/api/houses?q=%20Москва%20&page=2&limit=1", headers: auth(1) })).json()).toEqual(expect.objectContaining({ total: 2, page: 2, limit: 1, items: [expect.objectContaining({ id: 2 })] }));
      expect((await app.inject({ method: "GET", url: `/api/houses?q=${encodeURIComponent(" ".repeat(201) + "Москва")}`, headers: auth(1) })).json().total).toBe(2);
      expect((await app.inject({ method: "GET", url: `/api/houses?q=${"x".repeat(201)}`, headers: auth(1) })).statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/houses?page=0", headers: auth(1) })).statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/houses?limit=101", headers: auth(1) })).statusCode).toBe(400);
      const row = f.add(1, 1, "RESIDENT", "PENDING", "REQUEST");
      expect((await app.inject({ method: "GET", url: "/api/houses", headers: auth(1) })).json().items[0]).toEqual(expect.objectContaining({ access: { status: "PENDING", role: "RESIDENT", joinedVia: "REQUEST" }, actions: { open: false, requestAccess: false, cancelRequest: true } }));
      row.status = "ACTIVE";
      expect((await app.inject({ method: "GET", url: "/api/houses", headers: auth(1) })).json().items[0].actions).toEqual({ open: true, requestAccess: false, cancelRequest: false });
      row.status = "REJECTED";
      expect((await app.inject({ method: "GET", url: "/api/houses", headers: auth(1) })).json().items[0].actions).toEqual({ open: false, requestAccess: true, cancelRequest: false });
      row.role = "COUNCIL_MEMBER";
      expect((await app.inject({ method: "GET", url: "/api/houses", headers: auth(1) })).json().items[0].actions.requestAccess).toBe(false);
      expect((await app.inject({ method: "GET", url: "/api/houses", headers: auth(5) })).json().items[0].access.status).toBe("NONE");
    } finally { await app.close(); }
  });

  it("creates, retries, cancels and resubmits only own resident requests", async () => {
    const f = fixture();
    const app = await f.app();
    const post = (houseId = 1, payload: object = {}) => app.inject({ method: "POST", url: `/api/houses/${houseId}/join-requests`, headers: auth(1), payload });
    try {
      expect((await post(99)).statusCode).toBe(404);
      expect((await post(1, { role: "CHAIRMAN" })).statusCode).toBe(400);
      expect((await post(1, { status: "ACTIVE" })).statusCode).toBe(400);
      const created = await post();
      expect(created.statusCode).toBe(201);
      expect(created.json()).toEqual(expect.objectContaining({ houseId: 1, role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST" }));
      expect(f.members[0]).toEqual(expect.objectContaining({ userId: 1, canSignAcceptanceAct: false, authorityBasis: null }));
      expect((await post()).statusCode).toBe(200);
      expect(f.members).toHaveLength(1);
      const me = (await app.inject({ method: "GET", url: "/api/me", headers: auth(1) })).json();
      expect(me.houses[0]).toEqual(expect.objectContaining({ role: "RESIDENT", status: "PENDING", joinedVia: "REQUEST", permissions: expect.objectContaining({ viewWorks: false }) }));
      const del = () => app.inject({ method: "DELETE", url: "/api/houses/1/join-requests/me", headers: auth(1) });
      expect((await del()).statusCode).toBe(204);
      expect((await del()).statusCode).toBe(204);
      expect(f.members).toHaveLength(0);
      const rejected = f.add(1, 1, "RESIDENT", "REJECTED", "CHAT");
      expect((await del()).statusCode).toBe(204);
      expect(f.members).toHaveLength(1);
      rejected.canSignAcceptanceAct = true;
      rejected.authorityBasis = "old";
      expect((await post()).statusCode).toBe(200);
      expect(rejected).toEqual(expect.objectContaining({ status: "PENDING", joinedVia: "REQUEST", canSignAcceptanceAct: true, authorityBasis: "old" }));
      rejected.status = "ACTIVE";
      expect((await post()).statusCode).toBe(409);
      expect((await del()).statusCode).toBe(204);
      expect(f.members).toHaveLength(1);
      rejected.role = "CHAIRMAN";
      rejected.status = "REJECTED";
      expect((await post()).statusCode).toBe(409);
      rejected.status = "PENDING";
      expect((await del()).statusCode).toBe(204);
      expect(f.members).toHaveLength(1);
      rejected.role = "RESIDENT";
      rejected.joinedVia = "CHAT";
      expect((await del()).statusCode).toBe(204);
      expect(f.members).toHaveLength(1);
    } finally { await app.close(); }
  });

  it("does not overwrite a pending resident membership created through chat", async () => {
    const f = fixture();
    const existing = f.add(1, 1, "RESIDENT", "PENDING", "CHAT");
    const app = await f.app();
    try {
      const response = await app.inject({ method: "POST", url: "/api/houses/1/join-requests", headers: auth(1), payload: {} });
      expect(response.statusCode).toBe(409);
      expect(f.members).toHaveLength(1);
      expect(f.members[0]).toBe(existing);
      expect(existing).toEqual(expect.objectContaining({ role: "RESIDENT", status: "PENDING", joinedVia: "CHAT" }));
    } finally { await app.close(); }
  });

  it("allows only this house's active chairman to review resident requests", async () => {
    const f = fixture();
    const request = f.add(1, 1, "RESIDENT", "PENDING", "REQUEST");
    f.add(1, 2, "CHAIRMAN", "ACTIVE");
    f.add(1, 3, "COUNCIL_MEMBER", "ACTIVE");
    f.add(2, 4, "CHAIRMAN", "ACTIVE");
    const elevated = f.add(1, 6, "EXECUTOR", "PENDING", "REQUEST");
    const other = f.add(2, 7, "RESIDENT", "PENDING", "REQUEST");
    const app = await f.app();
    const list = (user: number) => app.inject({ method: "GET", url: "/api/houses/1/join-requests", headers: auth(user) });
    const decide = (user: number, id: number, decision: string) => app.inject({ method: "PATCH", url: `/api/houses/1/join-requests/${id}`, headers: auth(user), payload: { decision } });
    try {
      expect((await list(1)).statusCode).toBe(403);
      expect((await list(3)).statusCode).toBe(403);
      expect((await list(4)).statusCode).toBe(403);
      expect((await decide(4, request.id, "APPROVE")).statusCode).toBe(403);
      expect((await decide(3, request.id, "APPROVE")).statusCode).toBe(403);
      expect((await app.inject({ method: "PATCH", url: `/api/houses/1/join-requests/${request.id}`, headers: auth(2), payload: { decision: "APPROVE", role: "CHAIRMAN" } })).statusCode).toBe(400);
      expect((await list(2)).json()).toEqual(expect.objectContaining({ total: 1, items: [expect.objectContaining({ id: request.id, user: { id: 1, firstName: "Имя", lastName: "Фамилия", photoUrl: null } })] }));
      expect((await list(5)).statusCode).toBe(403);
      expect((await decide(2, elevated.id, "APPROVE")).statusCode).toBe(404);
      expect((await decide(2, other.id, "APPROVE")).statusCode).toBe(404);
      expect((await decide(2, request.id, "APPROVE")).json().status).toBe("ACTIVE");
      expect((await decide(2, request.id, "APPROVE")).statusCode).toBe(200);
      expect((await decide(2, request.id, "REJECT")).statusCode).toBe(409);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/join-requests?status=ACTIVE", headers: auth(2) })).json().total).toBe(1);
      const me = (await app.inject({ method: "GET", url: "/api/me", headers: auth(1) })).json();
      expect(me.houses[0]).toEqual(expect.objectContaining({ status: "ACTIVE", role: "RESIDENT", permissions: expect.objectContaining({ viewWorks: true, createObservation: true }) }));
      const second = f.add(1, 8, "RESIDENT", "PENDING", "REQUEST");
      expect((await decide(2, second.id, "REJECT")).json().status).toBe("REJECTED");
      expect((await decide(2, second.id, "APPROVE")).statusCode).toBe(409);
    } finally { await app.close(); }
  });
});

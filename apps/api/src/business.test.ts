import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterEach, describe, expect, it } from "vitest";

import type { PrismaClient } from "../generated/prisma/client.js";
import { HouseMembershipRole } from "../generated/prisma/enums.js";
import { createApp } from "./app.js";
import { cleanupExpiredMedia, permissionsFor } from "./business.js";
import { createSignedMaxInitData } from "./test/helpers/max-init-data.js";

const botToken = "test-bot-token";
const auth = { "x-max-init-data": createSignedMaxInitData(botToken) };
const tempDirs: string[] = [];
afterEach(async () => { for (const dir of tempDirs.splice(0)) await rm(dir, { recursive: true, force: true }); });

type MediaRow = { id: number; blobId: number; ownerUserId: number; temporary: boolean; expiresAt: Date | null; publicKey: string | null; observationId?: number; commentId?: number };
type BlobRow = { id: number; sha256: string; mimeType: string; size: number; width: number; height: number; storagePath: string };

function fixture() {
  let role = "RESIDENT";
  let status = "ACTIVE";
  let hasMembership = true;
  let company: string | null = null;
  let otherCandidateRole = "EXECUTOR";
  const createdWorks: Array<Record<string, unknown>> = [];
  const historyEvents: Array<Record<string, unknown>> = [];
  const activityEvents: Array<Record<string, unknown>> = [];
  const subscriptions = new Set<string>();
  const media = new Map<number, MediaRow>();
  const blobs = new Map<number, BlobRow>();
  const observations: Array<Record<string, unknown>> = [];
  const observationSubscriptions = new Map<string, { reason: string }>();
  const outboxJobs = new Map<string, Record<string, unknown>>();
  const comments: Array<Record<string, unknown>> = [];
  const assignments: Array<{ workId: number; userId: number; unassignedAt: Date | null }> = [];
  let chat: { title: string | null; joinUrl: string } | null = null;
  const house = { id: 1, address: "Тестовая, 1" };
  const work = { id: 7, houseId: 1, executorUserId: null as number | null, house, houseObject: null, executor: null as { id: number; firstName: string; lastName: string } | null, title: "Лифт", description: "Ремонт", category: "ELEVATOR", status: "NEW" as string, date: new Date("2026-09-24T00:00:00Z"), createdAt: new Date("2026-09-24T00:00:00Z"), updatedAt: new Date("2026-09-24T00:00:00Z"), completedAt: null, submittedForInspectionAt: null as Date | null, executorName: null as string | null, representativeName: null as string | null, media: [], history: [] };
  const user = { id: 1, firstName: "Макс", lastName: "Пользователь", photoUrl: "https://example.test/avatar.jpg" };
  const matchesWork = (where: { status?: string; executorUserId?: number; sourceObservationId?: null | { not: null } }) =>
    (!where.status || where.status === work.status) &&
    (!where.executorUserId || where.executorUserId === work.executorUserId) &&
    (where.sourceObservationId === undefined || (where.sourceObservationId === null) !== !!(work as typeof work & { sourceObservationId?: number }).sourceObservationId);
  const linkedWork = (observationId: number) => createdWorks.find((row) => row.sourceObservationId === observationId) ?? ((work as typeof work & { sourceObservationId?: number }).sourceObservationId === observationId ? work : null);
  const matchesObservation = (item: Record<string, unknown>, where: Record<string, unknown>): boolean => {
    if (where.status && (typeof where.status === "string" ? item.status !== where.status : item.status === (where.status as { not: string }).not)) return false;
    const linked = linkedWork(item.id as number);
    const linkFilter = where.linkedWork as Record<string, unknown> | undefined;
    const matchesLink = (filter: Record<string, unknown>): boolean => {
      if (!linked) return false;
      if (filter.executorUserId !== undefined) {
        const wanted = filter.executorUserId as number | { not: number };
        if (typeof wanted === "number" ? linked.executorUserId !== wanted : linked.executorUserId === wanted.not) return false;
      }
      if (filter.status && (typeof filter.status === "string" ? linked.status !== filter.status : linked.status === (filter.status as { not: string }).not)) return false;
      if (filter.executorAssignments && !assignments.some((row) => row.workId === linked.id && row.userId === ((filter.executorAssignments as { some: { userId: number } }).some.userId))) return false;
      if (filter.OR && !(filter.OR as Record<string, unknown>[]).some(matchesLink)) return false;
      return true;
    };
    if (linkFilter && !matchesLink(linkFilter)) return false;
    if (where.OR && !(where.OR as Record<string, unknown>[]).some((condition) => (condition.authorId !== undefined && item.authorId === condition.authorId) || (condition.subscriptions !== undefined && observationSubscriptions.has(`${item.id}:${(condition.subscriptions as { some: { userId: number } }).some.userId}`)) || (condition.title !== undefined && String(item.title).includes((condition.title as { contains: string }).contains)) || (condition.description !== undefined && String(item.description).includes((condition.description as { contains: string }).contains)))) return false;
    if (where.AND && !(where.AND as Record<string, unknown>[]).every((condition) => matchesObservation(item, condition))) return false;
    return true;
  };
  let lastHouseId: number | null = null;
  const db = {
    user: { findUniqueOrThrow: async ({ where }: { where: { id: number } }) => ({ ...user, id: where.id, maxUserId: String(9007199254740992n + BigInt(where.id)) }), findUnique: async () => ({ lastHouseId, firstName: "Макс", lastName: "Пользователь", maxUserId: "9007199254740993" }), findMany: async () => [{ id: 1, maxUserId: "9007199254740993" }], update: async ({ data }: { data: { lastHouseId: number } }) => { lastHouseId = data.lastHouseId; return { id: 1, lastHouseId }; } },
    houseMembership: {
      findUnique: async ({ where }: { where: { houseId_userId: { houseId: number; userId: number } } }) => hasMembership && where.houseId_userId.houseId === 1 ? { userId: where.houseId_userId.userId, role: role === "CHAIRMAN" && where.houseId_userId.userId !== 1 ? otherCandidateRole : role, status, executorCompanyName: company, user: { id: where.houseId_userId.userId, firstName: "Макс", lastName: "Пользователь" }, createdAt: new Date("2026-09-23T00:00:00Z") } : null,
      findFirst: async () => hasMembership && status === "ACTIVE" ? { id: 1 } : null,
      findMany: async () => hasMembership ? [{ houseId: 1, house: { ...house, chat }, role, status, joinedVia: "ADMIN", executorCompanyName: company }] : [],
    },
    house: { findUniqueOrThrow: async () => ({ ...house, chat }), findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? { ...house, chat } : null },
    houseObject: { findFirst: async () => null },
    work: {
      findUnique: async ({ where }: { where: { id: number } }) => { const row = where.id === 7 ? work : createdWorks.find((item) => item.id === where.id); return row ? { ...row, issues: [], inspections: [], documents: [], media: [], history: [], house, sourceObservation: (row as typeof work & { sourceObservation?: unknown }).sourceObservation ?? null } : null; },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => where.id === 7 ? work : createdWorks.find((item) => item.id === where.id)!,
      create: async ({ data }: { data: Record<string, unknown> }) => { if (data.sourceObservationId && createdWorks.some((item) => item.sourceObservationId === data.sourceObservationId)) throw Object.assign(new Error("Unique constraint"), { code: "P2002" }); const row = { ...data, id: 8 + createdWorks.length, submittedForInspectionAt: null }; createdWorks.push(row); return row; },
      update: async ({ where, data }: { where: { id: number }; data: Partial<typeof work> }) => { const row = where.id === 7 ? work : createdWorks.find((item) => item.id === where.id)!; Object.assign(row, data); return row; },
      findMany: async ({ where }: { where: Parameters<typeof matchesWork>[0] }) => matchesWork(where) ? [{ ...work, subscriptions: subscriptions.has("7:1") ? [{ id: 1 }] : [] }] : [],
      count: async ({ where }: { where: Parameters<typeof matchesWork>[0] }) => Number(matchesWork(where)),
    },
    workSubscription: {
      findUnique: async () => subscriptions.has("7:1") ? { id: 1 } : null,
      createMany: async () => { const inserted = !subscriptions.has("7:1"); subscriptions.add("7:1"); return { count: Number(inserted) }; },
      upsert: async () => { subscriptions.add("7:1"); return { id: 1 }; },
      deleteMany: async () => { subscriptions.delete("7:1"); return { count: 1 }; },
    },
    workExecutorAssignment: {
      create: async ({ data }: { data: { workId: number; userId: number } }) => { const row = { ...data, unassignedAt: null }; assignments.push(row); return row; },
      updateMany: async ({ where, data }: { where: { workId: number }; data: { unassignedAt: Date } }) => { let count = 0; for (const row of assignments) if (row.workId === where.workId && !row.unassignedAt) { row.unassignedAt = data.unassignedAt; count++; } return { count }; },
      count: async ({ where }: { where: { workId: number; userId: number } }) => assignments.filter((row) => row.workId === where.workId && row.userId === where.userId).length,
    },
    issue: { count: async () => 0 },
    reinspection: { findMany: async () => [] },
    document: { findMany: async () => [], findFirst: async () => null },
    inspectionAssignment: { count: async () => 0 },
    inspection: { count: async () => 0 },
    workHistory: { create: async ({ data }: { data: Record<string, unknown> }) => { historyEvents.push(data); return data; } },
    activityEvent: { create: async ({ data }: { data: Record<string, unknown> }) => { activityEvents.push(data); return data; }, findMany: async () => activityEvents.map((event, index) => ({ id: index + 1, ...event, createdAt: new Date() })) },
    botOutbox: { upsert: async ({ where, create }: { where: { eventKey: string }; create: Record<string, unknown> }) => { if (!outboxJobs.has(where.eventKey)) outboxJobs.set(where.eventKey, { id: outboxJobs.size + 1, ...create }); return outboxJobs.get(where.eventKey); } },
    checklistTemplate: { count: async ({ where }: { where: { category: string } }) => where.category === "UNKNOWN" ? 0 : 1 },
    observationSubscription: {
      create: async ({ data }: { data: { observationId: number; userId: number; reason: string } }) => { observationSubscriptions.set(`${data.observationId}:${data.userId}`, { reason: data.reason }); return { id: observationSubscriptions.size, ...data }; },
      findMany: async ({ where }: { where: { observationId: number } }) => [...observationSubscriptions.keys()].filter((key) => key.startsWith(`${where.observationId}:`)).map((key) => ({ userId: Number(key.split(":")[1]) })),
      createMany: async ({ data }: { data: { observationId: number; userId: number; reason: string }[] }) => { const key = `${data[0].observationId}:${data[0].userId}`; if (observationSubscriptions.has(key)) return { count: 0 }; observationSubscriptions.set(key, { reason: data[0].reason }); return { count: 1 }; },
      findUnique: async ({ where }: { where: { observationId_userId: { observationId: number; userId: number } } }) => observationSubscriptions.get(`${where.observationId_userId.observationId}:${where.observationId_userId.userId}`) ?? null,
      deleteMany: async ({ where }: { where: { observationId: number; userId: number; reason: string } }) => { const key = `${where.observationId}:${where.userId}`; if (observationSubscriptions.get(key)?.reason !== where.reason) return { count: 0 }; observationSubscriptions.delete(key); return { count: 1 }; },
    },
    $queryRaw: async () => [{ id: 7 }],
    houseChat: {
      upsert: async ({ create, update }: { create: { joinUrl: string }; update: { joinUrl: string } }) => { chat = { title: null, joinUrl: chat ? update.joinUrl : create.joinUrl }; return chat; },
      deleteMany: async () => { chat = null; return { count: 1 }; },
    },
    mediaBlob: {
      upsert: async ({ where, create }: { where: { sha256: string }; create: Omit<BlobRow, "id"> }) => {
        const found = [...blobs.values()].find((blob) => blob.sha256 === where.sha256);
        if (found) return found;
        const row = { ...create, id: blobs.size + 1 };
        blobs.set(row.id, row);
        return row;
      },
      findUnique: async ({ where }: { where: { id: number } }) => blobs.get(where.id) ?? null,
      delete: async ({ where }: { where: { id: number } }) => { const row = blobs.get(where.id); blobs.delete(where.id); return row; },
    },
    media: {
      create: async ({ data }: { data: Omit<MediaRow, "id" | "publicKey"> }) => { const row = { ...data, id: media.size + 1, publicKey: null }; media.set(row.id, row); return row; },
      findMany: async ({ where }: { where: { id?: { in: number[] }; ownerUserId?: number; temporary?: boolean; expiresAt?: { gt?: Date; lt?: Date } } }) => [...media.values()].filter((row) => (!where.id || where.id.in.includes(row.id)) && (where.ownerUserId === undefined || where.ownerUserId === row.ownerUserId) && (where.temporary === undefined || where.temporary === row.temporary) && (!where.expiresAt?.gt || !!row.expiresAt && row.expiresAt > where.expiresAt.gt) && (!where.expiresAt?.lt || !!row.expiresAt && row.expiresAt < where.expiresAt.lt)),
      findUnique: async ({ where }: { where: { publicKey: string } }) => { const row = [...media.values()].find((item) => item.publicKey === where.publicKey); return row ? { ...row, blob: blobs.get(row.blobId) } : null; },
      updateMany: async ({ where, data }: { where: { id: number; ownerUserId: number; temporary: boolean; expiresAt: { gt: Date } }; data: Partial<MediaRow> }) => {
        const row = media.get(where.id);
        if (!row || row.ownerUserId !== where.ownerUserId || row.temporary !== where.temporary || !row.expiresAt || row.expiresAt <= where.expiresAt.gt) return { count: 0 };
        Object.assign(row, data);
        return { count: 1 };
      },
      deleteMany: async ({ where }: { where: { id: { in: number[] } } }) => { for (const id of where.id.in) media.delete(id); return { count: where.id.in.length }; },
      count: async ({ where }: { where: { blobId: number } }) => [...media.values()].filter((item) => item.blobId === where.blobId).length,
    },
    observation: {
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: observations.length + 1, status: "NEW", createdAt: new Date(), updatedAt: new Date() }; observations.push(row); return row; },
      count: async ({ where }: { where: Parameters<typeof matchesObservation>[1] }) => observations.filter((item) => matchesObservation(item, where)).length,
      findUnique: async ({ where, include }: { where: { id: number }; include?: { subscriptions?: { where: { userId: number } } } }) => { const item = observations.find((row) => row.id === where.id); const key = `${item?.id}:${include?.subscriptions?.where.userId ?? 1}`; return item ? { ...item, house, author: user, media: [], subscriptions: observationSubscriptions.get(key) ? [observationSubscriptions.get(key)] : [], linkedWork: linkedWork(item.id as number) } : null; },
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => { const item = observations.find((row) => row.id === where.id)!; return { ...item, linkedWork: linkedWork(item.id as number) }; },
      update: async ({ where, data }: { where: { id: number }; data: { status: string } }) => { const item = observations.find((row) => row.id === where.id)!; item.status = data.status; return item; },
      findMany: async ({ where, include }: { where: Parameters<typeof matchesObservation>[1]; include?: { subscriptions?: { where: { userId: number } } } }) => observations.filter((item) => matchesObservation(item, where)).map((item) => ({ ...item, linkedWork: linkedWork(item.id as number), author: user, subscriptions: observationSubscriptions.has(`${item.id}:${include?.subscriptions?.where.userId ?? 1}`) ? [observationSubscriptions.get(`${item.id}:${include?.subscriptions?.where.userId ?? 1}`)] : [], media: [...media.values()].filter((m) => m.observationId === item.id).map((m) => ({ ...m, blob: blobs.get(m.blobId) })) })),
    },
    comment: {
      count: async ({ where }: { where: { workId?: number; observationId?: number } }) => comments.filter((item) => where.workId !== undefined ? item.workId === where.workId : item.observationId === where.observationId).length,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: comments.length + 1, createdAt: new Date() }; comments.push(row); return row; },
      findMany: async ({ where, skip = 0, take = 20, orderBy }: { where: { workId?: number; observationId?: number; OR?: { workId?: number; observationId?: number }[] }; skip?: number; take?: number; orderBy?: { createdAt?: "asc" | "desc"; id?: "asc" | "desc" }[] }) => {
        const matches = (item: Record<string, unknown>, filter: { workId?: number; observationId?: number }) => filter.workId !== undefined ? item.workId === filter.workId : item.observationId === filter.observationId;
        const selected = comments.filter((item) => where.OR ? where.OR.some((filter) => matches(item, filter)) : matches(item, where));
        if (orderBy) selected.sort((a, b) => { for (const rule of orderBy) { const key = rule.createdAt ? "createdAt" : "id"; const direction = rule[key] === "desc" ? -1 : 1; const left = key === "createdAt" ? (a.createdAt as Date).getTime() : a.id as number; const right = key === "createdAt" ? (b.createdAt as Date).getTime() : b.id as number; if (left !== right) return (left < right ? -1 : 1) * direction; } return 0; });
        return selected.slice(skip, skip + take).map((item) => ({ ...item, author: user, media: [...media.values()].filter((m) => m.commentId === item.id).map((m) => ({ ...m, blob: blobs.get(m.blobId) })) }));
      },
    },
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => {
      const observationCount = observations.length;
      const commentCount = comments.length;
      try { return await fn(db); } catch (error) { observations.splice(observationCount); comments.splice(commentCount); throw error; }
    },
  };
  return { db: db as unknown as PrismaClient, media, blobs, subscriptions, observationSubscriptions, outboxJobs, observations, comments, assignments, createdWorks, historyEvents, activityEvents, setCompany: (value: string | null) => { company = value; }, setOtherCandidateRole: (value: string) => { otherCandidateRole = value; }, setWorkCompany: (value: string) => { work.executorName = value; }, setRole: (value: string) => { role = value; }, setStatus: (value: string) => { status = value; }, setMembership: (value: boolean) => { hasMembership = value; }, setChat: (value: typeof chat) => { chat = value; }, setWorkStatus: (value: string) => { work.status = value; }, linkExistingWork: (observationId: number) => { Object.assign(work, { sourceObservationId: observationId, sourceObservation: { ...observations.find((item) => item.id === observationId), authorId: 1, author: user, media: [], subscriptions: [] } }); }, assignExecutor: (value: number | null) => { work.executorUserId = value; work.executorName = value ? "ООО Управдом" : null; work.representativeName = value ? "Сергей Петров" : null; work.executor = value ? { id: value, firstName: "Сергей", lastName: "Петров" } : null; if (value) assignments.push({ workId: 7, userId: value, unassignedAt: null }); }, getChat: () => chat };
}

async function appFor(db: PrismaClient, isAdmin = false, now?: () => Date, allowSelfRoleSwitch = false) {
  return createApp({ config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600, allowSelfRoleSwitch }, userRepository: { isReady: async () => true, upsertFromMax: async ({ user }) => ({ id: Number(BigInt(user.id) - 9007199254740992n), isAdmin }) }, businessDb: db, now, logger: false, staticRoot: "/nonexistent-priemka-static" });
}

function multipartBody(bytes: Buffer, mimeType = "image/png") {
  const boundary = "priemka-test-boundary";
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  return { headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.${extension}"\r\nContent-Type: ${mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}

describe("business API", () => {
  it("lists active and completed обращения by role and keeps previous executor assignments without duplicates", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const create = async (title: string) => (await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title, description: title } })).json().id as number;
      const first = await create("Первое");
      const second = await create("Второе");
      const foreign = await create("Чужое");
      f.linkExistingWork(first);
      f.assignExecutor(1);
      f.observations.find((item) => item.id === second)!.status = "ACCEPTED";
      f.createdWorks.push({ id: 10, houseId: 1, sourceObservationId: second, executorUserId: 1, status: "ACCEPTED" });
      f.assignments.push({ workId: 10, userId: 1, unassignedAt: null });
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=active", headers: auth })).json().items.map((item: { id: number }) => item.id)).toEqual([first, foreign]);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=history", headers: auth })).json().items.map((item: { id: number }) => item.id)).toEqual([second]);
      f.setRole("CHAIRMAN");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=active", headers: auth })).json().items).toHaveLength(2);
      f.setRole("EXECUTOR");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=active", headers: auth })).json().items.map((item: { id: number }) => item.id)).toEqual([first]);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=history", headers: auth })).json().items.map((item: { id: number }) => item.id)).toEqual([second]);
      expect((await app.inject({ method: "GET", url: `/api/observations/${first}`, headers: auth })).json().actions).toEqual(expect.objectContaining({ comment: true, submitForInspection: true }));
      f.assignments.push({ workId: 7, userId: 1, unassignedAt: new Date() });
      f.assignments.push({ workId: 7, userId: 1, unassignedAt: new Date() });
      f.assignExecutor(2);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=active", headers: auth })).json().items).toEqual([]);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=history", headers: auth })).json().items.map((item: { id: number }) => item.id)).toEqual([first, second]);
      const detail = await app.inject({ method: "GET", url: `/api/observations/${first}`, headers: auth });
      expect(detail.json().actions).toEqual(expect.objectContaining({ comment: false, submitForInspection: false, assignExecutor: false }));
      expect((await app.inject({ method: "POST", url: `/api/observations/${first}/comments`, headers: auth, payload: { text: "Нет" } })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: `/api/observations/${foreign}`, headers: auth })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/works/7/observation", headers: auth })).json()).toEqual({ observationId: first });
    } finally { await app.close(); }
  });

  it("creates an internal work from an обращение and tracks executor changes atomically", async () => {
    const f = fixture(); f.setRole("CHAIRMAN"); f.setCompany("УК Тест");
    const app = await appFor(f.db);
    try {
      const created = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Лифт", description: "Не работает" } });
      const path = `/api/observations/${created.json().id}/executor`;
      const assigned = await app.inject({ method: "PUT", url: path, headers: auth, payload: { executorUserId: 2 } });
      expect(assigned.statusCode, assigned.body).toBe(200);
      expect(f.createdWorks[0]).toEqual(expect.objectContaining({ sourceObservationId: created.json().id, title: "Лифт", description: "Не работает", executorUserId: 2 }));
      expect(f.assignments).toEqual([expect.objectContaining({ workId: assigned.json().id, userId: 2, unassignedAt: null })]);
      const changed = await app.inject({ method: "PUT", url: path, headers: auth, payload: { executorUserId: 3 } });
      expect(changed.statusCode, changed.body).toBe(200);
      expect(f.assignments).toEqual([expect.objectContaining({ userId: 2, unassignedAt: expect.any(Date) }), expect.objectContaining({ userId: 3, unassignedAt: null })]);
      f.createdWorks[0].submittedForInspectionAt = new Date();
      expect((await app.inject({ method: "PUT", url: path, headers: auth, payload: { executorUserId: 2 } })).statusCode).toBe(409);
    } finally { await app.close(); }
  });

  it("allows chairman demo self-assignment only with a saved company and the demo flag", async () => {
    const f = fixture(); f.setRole("CHAIRMAN"); f.setCompany("ООО Демо");
    const app = await appFor(f.db, false, undefined, true);
    try {
      const create = async () => (await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Обращение", description: "Описание" } })).json().id as number;
      const id = await create();
      const assigned = await app.inject({ method: "PUT", url: `/api/observations/${id}/executor`, headers: auth, payload: { executorUserId: 1 } });
      expect(assigned.statusCode).toBe(200);
      expect(f.createdWorks[0]).toEqual(expect.objectContaining({ sourceObservationId: id, executorUserId: 1, executorName: "ООО Демо" }));
      expect(f.assignments).toEqual([expect.objectContaining({ workId: assigned.json().id, userId: 1, unassignedAt: null })]);
      f.setCompany(null);
      expect((await app.inject({ method: "PUT", url: `/api/observations/${await create()}/executor`, headers: auth, payload: { executorUserId: 1 } })).statusCode).toBe(400);
      f.setCompany("ООО Демо"); f.setOtherCandidateRole("CHAIRMAN");
      expect((await app.inject({ method: "PUT", url: `/api/observations/${await create()}/executor`, headers: auth, payload: { executorUserId: 2 } })).statusCode).toBe(400);
    } finally { await app.close(); }
    const disabled = fixture(); disabled.setRole("CHAIRMAN"); disabled.setCompany("ООО Демо");
    const productionApp = await appFor(disabled.db);
    try {
      const id = (await productionApp.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Обращение", description: "Описание" } })).json().id as number;
      expect((await productionApp.inject({ method: "PUT", url: `/api/observations/${id}/executor`, headers: auth, payload: { executorUserId: 1 } })).statusCode).toBe(400);
    } finally { await productionApp.close(); }
  });

  it("combines legacy Work comments with new Observation comments in one detail", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const created = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Вход", description: "Дверь" } });
      const id = created.json().id as number;
      f.linkExistingWork(id);
      f.comments.push({ id: 1, workId: 7, authorId: 1, text: "Старый комментарий", createdAt: new Date() });
      const fresh = await app.inject({ method: "POST", url: `/api/observations/${id}/comments`, headers: auth, payload: { text: "Новый комментарий" } });
      expect(fresh.statusCode).toBe(201);
      expect(f.comments.at(-1)).toEqual(expect.objectContaining({ observationId: id, text: "Новый комментарий" }));
      const detail = await app.inject({ method: "GET", url: `/api/observations/${id}`, headers: auth });
      expect(detail.json().comments.map((comment: { text: string }) => comment.text)).toEqual(["Новый комментарий", "Старый комментарий"]);
      expect(detail.json().comments.map((comment: { author: unknown }) => comment.author)).toEqual([
        { type: "USER", displayName: "Макс Пользователь", photoUrl: "https://example.test/avatar.jpg" },
        { type: "USER", displayName: "Макс Пользователь", photoUrl: "https://example.test/avatar.jpg" },
      ]);
      expect(f.comments.at(-1)).toEqual(expect.objectContaining({ authorTypeSnapshot: "USER", authorDisplayNameSnapshot: "Макс Пользователь" }));
      expect(detail.json().history.map((event: { title: string }) => event.title)).toContain("Обращение создано");
    } finally { await app.close(); }
  });

  it("filters watched observations with author fallback and exposes isWatching", async () => {
    const f = fixture(); const app = await appFor(f.db);
    try {
      const create = async (title: string) => (await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title, description: title } })).json().id as number;
      const authorId = await create("Автор"); const manualId = await create("Подписка"); const otherId = await create("Не наблюдаю"); const subscribedAuthorId = await create("Авторская подписка");
      f.observations.find((item) => item.id === manualId)!.authorId = 2;
      f.observations.find((item) => item.id === otherId)!.authorId = 2;
      f.observations.find((item) => item.id === subscribedAuthorId)!.authorId = 2;
      f.observationSubscriptions.delete(`${authorId}:1`);
      f.observationSubscriptions.delete(`${otherId}:1`);
      f.observationSubscriptions.set(`${manualId}:1`, { reason: "MANUAL" });
      expect(f.observationSubscriptions.get(`${subscribedAuthorId}:1`)?.reason).toBe("AUTHOR");
      const all = (await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).json();
      expect(all.items.map((item: { isWatching: boolean }) => item.isWatching)).toEqual([true, true, false, true]);
      const watched = (await app.inject({ method: "GET", url: "/api/houses/1/observations?watching=true", headers: auth })).json();
      expect(watched.items.map((item: { id: number }) => item.id)).toEqual([authorId, manualId, subscribedAuthorId]);
      expect(watched.total).toBe(3);
    } finally { await app.close(); }
  });

  it("returns comments newest first with id as the tie-breaker in every public read", async () => {
    const f = fixture(); const app = await appFor(f.db);
    try {
      const id = (await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Дом", description: "Описание" } })).json().id as number;
      f.linkExistingWork(id);
      const older = new Date("2026-09-27T00:00:00Z"), newer = new Date("2026-09-28T00:00:00Z");
      for (const [commentId, createdAt, target] of [[1, older, "work"], [2, newer, "work"], [3, newer, "work"], [4, older, "observation"], [5, newer, "observation"], [6, newer, "observation"]] as const) f.comments.push({ id: commentId, createdAt, authorId: 1, text: `Комментарий ${commentId}`, ...(target === "work" ? { workId: 7 } : { observationId: id }) });
      const ids = (items: { id: number }[]) => items.map((item) => item.id);
      expect(ids((await app.inject({ method: "GET", url: `/api/observations/${id}`, headers: auth })).json().comments)).toEqual([6, 5, 3, 2, 4, 1]);
      expect(ids((await app.inject({ method: "GET", url: `/api/observations/${id}/comments`, headers: auth })).json().items)).toEqual([6, 5, 4]);
      expect(ids((await app.inject({ method: "GET", url: "/api/works/7/comments", headers: auth })).json().items)).toEqual([3, 2, 1]);
    } finally { await app.close(); }
  });

  it("keeps executor company snapshot and hides personal name after role switch", async () => {
    const f = fixture(); const app = await appFor(f.db);
    try {
      const id = (await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Дом", description: "Описание" } })).json().id as number;
      f.linkExistingWork(id); f.assignExecutor(1); f.setWorkCompany("ООО «Старая компания»"); f.setRole("EXECUTOR"); f.setCompany("ООО «Новая компания»");
      const created = await app.inject({ method: "POST", url: `/api/observations/${id}/comments`, headers: auth, payload: { text: "Исправим" } });
      expect(created.statusCode).toBe(201);
      expect(f.comments.at(-1)).toEqual(expect.objectContaining({ authorTypeSnapshot: "EXECUTOR", authorDisplayNameSnapshot: "ООО «Старая компания»" }));
      f.setRole("CHAIRMAN"); f.setCompany("ООО «Ещё одна компания»");
      const detail = (await app.inject({ method: "GET", url: `/api/observations/${id}`, headers: auth })).json();
      expect(detail.comments[0].author).toEqual({ type: "EXECUTOR", displayName: "ООО «Старая компания»", photoUrl: null });
      expect(detail.workflow.executor.companyName).toBe("ООО «Старая компания»");
      expect(detail.comments[0].author.displayName).not.toBe("ООО «Новая компания»");
      expect(JSON.stringify(detail.comments[0].author)).not.toContain("Макс");
    } finally { await app.close(); }
  });

  it("returns the linked work snapshot in observation detail and filters manual works", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const created = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Обращение", description: "Описание" } });
      expect(created.statusCode).toBe(201);
      f.linkExistingWork(created.json().id);
      f.assignExecutor(1);
      const detail = await app.inject({ method: "GET", url: `/api/observations/${created.json().id}`, headers: auth });
      expect(detail.statusCode).toBe(200);
      expect(detail.json().linkedWork).toEqual(expect.objectContaining({ id: 7, title: "Лифт", executor: { userId: 1, companyName: "ООО Управдом" }, issues: { total: 0, open: 0, remediationSubmitted: 0, resolved: 0 } }));
      expect((await app.inject({ method: "GET", url: "/api/works/7", headers: auth })).json().executor).toEqual({ userId: 1, companyName: "ООО Управдом", representativeName: "Сергей Петров" });
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?origin=OBSERVATION", headers: auth })).json().total).toBe(1);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?origin=MANUAL", headers: auth })).json().total).toBe(0);
    } finally { await app.close(); }
  });
  it("edits work only before submit and validates its checklist category", async () => {
    const f = fixture();
    f.setRole("CHAIRMAN");
    const app = await appFor(f.db);
    try {
      const path = "/api/works/7";
      expect((await app.inject({ method: "PATCH", url: path, headers: auth, payload: { category: "UNKNOWN" } })).statusCode).toBe(400);
      const edited = await app.inject({ method: "PATCH", url: path, headers: auth, payload: { title: "Новая работа" } });
      expect(edited.statusCode).toBe(200);
      expect(edited.json()).toEqual({ id: 7 });
      expect(f.activityEvents.find((event) => event.event === "WORK_EDITED")?.metadata).toEqual({ before: { title: "Лифт" }, after: { title: "Новая работа" } });
      expect((await app.inject({ method: "GET", url: path, headers: auth })).json().actions.edit).toBe(true);
      f.setWorkStatus("IN_REVIEW");
      expect((await app.inject({ method: "PATCH", url: path, headers: auth, payload: { title: "Поздняя правка" } })).statusCode).toBe(409);
    } finally { await app.close(); }
  });
  it("keeps the author subscribed and confirms the first manual watch once", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    const otherAuth = { "x-max-init-data": createSignedMaxInitData(botToken, { user: '{"id":9007199254740994,"first_name":"Другой","last_name":"Житель","username":null,"language_code":"ru","photo_url":null}' }) };
    try {
      const created = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Протечка", description: "У подъезда" } });
      expect(created.statusCode).toBe(201);
      const id = created.json().id as number;
      expect(f.observationSubscriptions.get(`${id}:1`)?.reason).toBe("AUTHOR");
      const detail = await app.inject({ method: "GET", url: `/api/observations/${id}`, headers: auth });
      expect(detail.json()).toEqual(expect.objectContaining({ isWatching: true, watchReason: "AUTHOR", actions: expect.objectContaining({ unwatch: false }) }));
      const authorUnwatch = await app.inject({ method: "DELETE", url: `/api/observations/${id}/watch`, headers: auth });
      expect(authorUnwatch.statusCode).toBe(409);
      expect(authorUnwatch.json().code).toBe("AUTHOR_WATCH_REQUIRED");
      f.linkExistingWork(id);
      const linkedUnwatch = await app.inject({ method: "DELETE", url: "/api/works/7/watch", headers: auth });
      expect(linkedUnwatch.statusCode).toBe(409);
      expect(linkedUnwatch.json().code).toBe("AUTHOR_WATCH_REQUIRED");
      expect((await app.inject({ method: "POST", url: `/api/observations/${id}/watch`, headers: otherAuth })).statusCode).toBe(204);
      expect((await app.inject({ method: "POST", url: `/api/observations/${id}/watch`, headers: otherAuth })).statusCode).toBe(204);
      expect(f.observationSubscriptions.get(`${id}:2`)?.reason).toBe("MANUAL");
      expect(f.outboxJobs.size).toBe(2);
      expect((await app.inject({ method: "DELETE", url: `/api/observations/${id}/watch`, headers: otherAuth })).statusCode).toBe(204);
      expect(f.observationSubscriptions.has(`${id}:2`)).toBe(false);
    } finally { await app.close(); }
  });
  it("limits media attempts to ten per user per minute after membership", async () => {
    const f = fixture();
    let time = Date.now();
    const app = await appFor(f.db, false, () => new Date(time));
    const invalid = multipartBody(Buffer.from("invalid"));
    const otherUser = createSignedMaxInitData(botToken, { user: '{"id":9007199254740994,"first_name":"Другой","last_name":"Пользователь","username":null,"language_code":"ru","photo_url":null}' });
    try {
      for (let index = 0; index < 10; index++) expect((await app.inject({ method: "POST", url: "/api/media", ...invalid })).statusCode).toBe(400);
      const limited = await app.inject({ method: "POST", url: "/api/media", ...invalid });
      expect(limited.statusCode).toBe(429);
      expect(Number(limited.headers["retry-after"])).toBeGreaterThan(0);
      expect((await app.inject({ method: "POST", url: "/api/media", headers: { ...invalid.headers, "x-max-init-data": otherUser }, payload: invalid.payload })).statusCode).toBe(400);
      time += 60_000;
      expect((await app.inject({ method: "POST", url: "/api/media", ...invalid })).statusCode).toBe(400);
    } finally { await app.close(); }
  });
  it("gates legacy chairman self-assignment while retaining ordinary executor assignment", async () => {
    const f = fixture(); f.setRole("CHAIRMAN"); f.setCompany("Демо УК");
    const app = await appFor(f.db);
    try {
      const payload = { title: "Ремонт", description: "Описание", category: "OTHER" };
      expect((await app.inject({ method: "POST", url: "/api/houses/1/works", headers: auth, payload: { ...payload, executorUserId: 1 } })).statusCode).toBe(400);
      expect((await app.inject({ method: "POST", url: "/api/houses/1/works", headers: auth, payload: { ...payload, executorUserId: 2 } })).statusCode).toBe(201);
      expect(f.createdWorks[0]).toEqual(expect.objectContaining({ executorUserId: 2, executorName: "Демо УК" }));
    } finally { await app.close(); }
  });

  it("lets a chairman assign own work with a company snapshot and submit once as executor", async () => {
    const f = fixture();
    f.setRole("CHAIRMAN");
    f.setCompany("Сохранённая компания");
    const app = await appFor(f.db, false, undefined, true);
    try {
      const payload = { executorUserId: 1, title: "  Ремонт  ", description: "  Описание  ", category: "COMMON_AREAS" };
      expect((await app.inject({ method: "POST", url: "/api/houses/1/works", headers: auth, payload })).statusCode).toBe(201);
      expect(f.createdWorks[0]).toEqual(expect.objectContaining({ executorName: "Сохранённая компания", representativeName: "Макс Пользователь", title: "Ремонт", status: "NEW" }));
      expect((await app.inject({ method: "POST", url: "/api/works/7/submit-for-inspection", headers: auth, payload: {} })).statusCode).toBe(403);
      f.setRole("EXECUTOR");
      f.assignExecutor(1);
      const first = await app.inject({ method: "POST", url: "/api/works/7/submit-for-inspection", headers: auth, payload: {} });
      expect(first.statusCode).toBe(200);
      expect((await app.inject({ method: "POST", url: "/api/works/7/submit-for-inspection", headers: auth, payload: {} })).json()).toEqual(first.json());
      expect(f.historyEvents.filter((event) => event.event === "SUBMITTED_FOR_INSPECTION")).toHaveLength(1);
    } finally { await app.close(); }
  });

  it("uses the work label without repeating the source observation after creation", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      expect((await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Заявка", description: "Описание" } })).statusCode).toBe(201);
      f.linkExistingWork(1);
      f.setRole("EXECUTOR");
      f.assignExecutor(1);
      expect((await app.inject({ method: "POST", url: "/api/works/7/submit-for-inspection", headers: auth, payload: {} })).statusCode).toBe(200);
      const job = [...f.outboxJobs.values()].find((item) => item.accessKind === "WORK");
      expect(job?.text).toBe("💼 Обращение «Лифт» (№7) передано на проверку.");
      expect(job?.text).not.toContain("Работа");
    } finally { await app.close(); }
  });

  it("links a chairman work to one observation and syncs its status", async () => {
    const f = fixture();
    const app = await appFor(f.db, false, undefined, true);
    const url = "/api/houses/1/works";
    const payload = { executorUserId: 1, title: "Ремонт", description: "Описание", category: "OTHER", sourceObservationId: 1 };
    try {
      expect((await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Заявка", description: "Описание" } })).statusCode).toBe(201);
      expect((await app.inject({ method: "POST", url, headers: auth, payload })).statusCode).toBe(403);
      f.setRole("CHAIRMAN"); f.setCompany("Тестовая УК");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).json().items[0].actions.createWork).toBe(true);
      expect((await app.inject({ method: "POST", url, headers: auth, payload: { ...payload, sourceObservationId: 999 } })).statusCode).toBe(404);
      f.observations[0].houseId = 2;
      expect((await app.inject({ method: "POST", url, headers: auth, payload })).statusCode).toBe(400);
      f.observations[0].houseId = 1;
      const raced = await Promise.all([app.inject({ method: "POST", url, headers: auth, payload }), app.inject({ method: "POST", url, headers: auth, payload })]);
      expect(raced.map((response) => response.statusCode).sort()).toEqual([201, 409]);
      expect(f.observations[0].status).toBe("IN_PROGRESS");
      expect(f.createdWorks[0].sourceObservationId).toBe(1);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).json().items[0]).toEqual(expect.objectContaining({ linkedWork: expect.objectContaining({ id: 8 }), actions: { createWork: false } }));
      expect((await app.inject({ method: "POST", url, headers: auth, payload })).statusCode).toBe(409);
      expect(f.createdWorks).toHaveLength(1);
      expect((await app.inject({ method: "POST", url, headers: auth, payload: { ...payload, sourceObservationId: undefined } })).statusCode).toBe(201);
      expect(f.createdWorks[1].sourceObservationId).toBeNull();
      expect(f.comments).toHaveLength(0);
    } finally { await app.close(); }
  });

  it("enforces MAX auth and house permissions, and keeps work flags separate", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works" })).statusCode).toBe(401);
      const me = await app.inject({ method: "GET", url: "/api/me", headers: auth });
      expect(me.json().user).toEqual(expect.objectContaining({ id: 1, maxUserId: "9007199254740993", isAdmin: false }));
      expect(me.json().houses[0]).toEqual(expect.objectContaining({ id: 1, role: "RESIDENT", chat: null, permissions: expect.objectContaining({ manageHouseChat: false, viewWorks: true }) }));
      expect(me.json().houses[0].permissions).not.toHaveProperty("reportRemediation");
      const list = await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth });
      expect(list.json().items[0]).toEqual(expect.objectContaining({ id: 7, status: "NEW", isWatching: false }));
      expect(list.json().items[0]).not.toHaveProperty("isNewForMe");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?status=NEW", headers: auth })).json().total).toBe(1);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?origin=MANUAL", headers: auth })).json().total).toBe(1);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?origin=OBSERVATION", headers: auth })).json().total).toBe(0);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?origin=OTHER", headers: auth })).statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?status=WAITING", headers: auth })).json().items).toEqual([]);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?status=INVALID", headers: auth })).statusCode).toBe(400);
      const detail = await app.inject({ method: "GET", url: "/api/works/7", headers: auth });
      expect(detail.json().actions).toEqual(expect.objectContaining({ watch: true, reportRemediation: false }));
      f.setWorkStatus("WAITING");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?status=WAITING", headers: auth })).json().items[0].status).toBe("WAITING");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).json().items[0]).not.toHaveProperty("isNewForMe");
      expect((await app.inject({ method: "POST", url: "/api/works/7/comments", headers: auth, payload: { text: "Замечание" } })).statusCode).toBe(201);
      expect((await app.inject({ method: "POST", url: "/api/works/7/comments", headers: auth, payload: { text: "  " } })).statusCode).toBe(400);
      const observationBody = { category: "OTHER", title: "Без фото", description: "Описание" };
      expect((await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: observationBody })).statusCode).toBe(201);
      expect((await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { ...observationBody, mediaIds: [] } })).statusCode).toBe(201);
      f.setStatus("PENDING");
      expect((await app.inject({ method: "GET", url: "/api/works/7", headers: auth })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).statusCode).toBe(403);
    } finally { await app.close(); }
  });

  it("keeps watch/unwatch idempotent and restricts chat management", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      for (let i = 0; i < 2; i++) expect((await app.inject({ method: "POST", url: "/api/works/7/watch", headers: auth })).statusCode).toBe(204);
      expect(f.subscriptions.size).toBe(1);
      expect((await app.inject({ method: "GET", url: "/api/works/7", headers: auth })).json().actions.unwatch).toBe(true);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).json().items[0]).toEqual(expect.objectContaining({ status: "NEW", isWatching: true }));
      for (let i = 0; i < 2; i++) expect((await app.inject({ method: "DELETE", url: "/api/works/7/watch", headers: auth })).statusCode).toBe(204);
      expect(f.subscriptions.size).toBe(0);
      const body = { joinUrl: "https://max.ru/join/test123" };
      expect((await app.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: body })).statusCode).toBe(403);
      f.setRole("COUNCIL_MEMBER");
      expect((await app.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: body })).statusCode).toBe(200);
      expect(f.getChat()?.joinUrl).toBe(body.joinUrl);
      expect((await app.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: { joinUrl: "https://max.ru/chat/example" } })).statusCode).toBe(200);
      expect((await app.inject({ method: "DELETE", url: "/api/houses/1/chat", headers: auth })).statusCode).toBe(204);
      expect(f.getChat()).toBeNull();
      for (const joinUrl of ["https://evil.example/join/test", "http://max.ru/join/test", "https://max.ru/", "https://evil@max.ru/chat/test"]) {
        expect((await app.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: { joinUrl } })).statusCode).toBe(400);
      }
    } finally { await app.close(); }
  });

  it("allows an executor to access only assigned works", async () => {
    const f = fixture();
    f.setRole("EXECUTOR");
    f.setChat({ title: "Чат жителей", joinUrl: "https://max.ru/join/test123" });
    const app = await appFor(f.db);
    try {
      expect((await app.inject({ method: "GET", url: "/api/works/7", headers: auth })).statusCode).toBe(404);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).json().items).toEqual([]);
      f.assignExecutor(1);
      const detail = await app.inject({ method: "GET", url: "/api/works/7", headers: auth });
      expect(detail.statusCode).toBe(200);
      const works = await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth });
      expect(works.json().items).toHaveLength(1);
      expect(works.json().house.chat).toBeNull();
      expect(works.json().actions.manageChat).toBe(false);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).json().items).toEqual([]);
      f.setChat({ title: "Закрытый чат", joinUrl: "https://max.ru/join/private" });
      const me = await app.inject({ method: "GET", url: "/api/me", headers: auth });
      expect(me.json().houses[0].permissions).toEqual(expect.objectContaining({ viewObservations: false, viewHouseChat: false }));
      expect(me.json().houses[0].chat).toBeNull();
      expect(detail.json().actions).toEqual(expect.objectContaining({ reportRemediation: false, confirmAcceptance: false, assignInspector: false }));
      expect(detail.json().representative).toEqual({ id: 1, name: "Сергей Петров", phone: null, maxUrl: null });
    } finally { await app.close(); }
  });

  it("does not give system ADMIN house workflow access without membership", async () => {
    const f = fixture();
    f.setMembership(false);
    const regular = await appFor(f.db);
    try {
      expect((await regular.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: { joinUrl: "https://max.ru/chat/example" } })).statusCode).toBe(403);
    } finally { await regular.close(); }
    const admin = await appFor(f.db, true);
    try {
      const me = await admin.inject({ method: "GET", url: "/api/me", headers: auth });
      expect(me.json().user.isAdmin).toBe(true);
      expect(me.json().houses).toEqual([]);
      expect((await admin.inject({ method: "PUT", url: "/api/houses/1/chat", headers: auth, payload: { joinUrl: "https://max.ru/chat/example" } })).statusCode).toBe(403);
      expect((await admin.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).statusCode).toBe(403);
      expect((await admin.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).statusCode).toBe(403);
      expect((await admin.inject({ method: "DELETE", url: "/api/houses/1/chat", headers: auth })).statusCode).toBe(403);
    } finally { await admin.close(); }
  });

  it("shows observations and resident chat to resident, council and chairman", async () => {
    for (const role of ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN"]) {
      const f = fixture();
      f.setRole(role);
      f.setChat({ title: "Чат жителей", joinUrl: "https://max.ru/join/test123" });
      const app = await appFor(f.db);
      try {
        expect((await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).statusCode).toBe(200);
        const works = await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth });
        expect(works.json().house.chat.joinUrl).toBe("https://max.ru/join/test123");
        expect(works.json().actions.manageChat).toBe(role !== "RESIDENT");
        const me = await app.inject({ method: "GET", url: "/api/me", headers: auth });
        expect(me.json().houses[0].permissions).toEqual(expect.objectContaining({ viewObservations: true, viewHouseChat: true }));
        expect(me.json().houses[0].chat).toEqual({ title: "Чат жителей", joinUrl: "https://max.ru/join/test123" });
      } finally { await app.close(); }
    }
  });

  it("advertises only available chairman actions for this work", async () => {
    const f = fixture();
    f.setRole("CHAIRMAN");
    const app = await appFor(f.db);
    try {
      for (const status of ["NEW", "IN_REVIEW", "IN_PROGRESS", "WAITING", "ACCEPTED"]) {
        f.setWorkStatus(status);
        const response = await app.inject({ method: "GET", url: "/api/works/7", headers: auth });
        expect(response.json().actions).toEqual(expect.objectContaining({ assignInspector: false, confirmAcceptance: false, reportRemediation: false, comment: true }));
      }
    } finally { await app.close(); }
  });

  it("uploads temporary Media, deduplicates blobs, attaches owned media, and serves photos", async () => {
    const dir = await mkdtemp(join(tmpdir(), "priemka-media-"));
    tempDirs.push(dir);
    process.env.MEDIA_DIR = dir;
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const internalId = (await app.inject({ method: "GET", url: "/api/me", headers: auth })).json().user.id;
      const bytes = await sharp({ create: { width: 100, height: 80, channels: 3, background: "red" } }).png().toBuffer();
      const form = multipartBody(bytes);
      f.setStatus("PENDING");
      expect((await app.inject({ method: "POST", url: "/api/media", ...form })).statusCode).toBe(403);
      f.setStatus("REJECTED");
      expect((await app.inject({ method: "POST", url: "/api/media", ...form })).statusCode).toBe(403);
      f.setStatus("ACTIVE");
      const first = await app.inject({ method: "POST", url: "/api/media", ...form });
      const second = await app.inject({ method: "POST", url: "/api/media", ...form });
      expect(first.statusCode).toBe(201);
      expect(Object.keys(first.json())).toEqual(["id"]);
      expect(f.media.size).toBe(2);
      expect(f.blobs.size).toBe(1);
      const firstId = first.json().id as number;
      const secondId = second.json().id as number;
      expect(f.media.get(firstId)).toEqual(expect.objectContaining({ temporary: true, publicKey: null }));
      expect((await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Тест", description: "Описание", mediaIds: [999] } })).statusCode).toBe(400);
      f.media.get(secondId)!.ownerUserId = 2;
      expect((await app.inject({ method: "POST", url: "/api/works/7/comments", headers: auth, payload: { text: "", mediaIds: [secondId] } })).statusCode).toBe(400);
      const observation = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Тест", description: "Описание", mediaIds: [firstId] } });
      expect(observation.statusCode).toBe(201);
      expect(f.media.get(firstId)).toEqual(expect.objectContaining({ temporary: false, expiresAt: null, publicKey: expect.stringMatching(/^[a-z0-9]{20}$/) }));
      const observationList = await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth });
      expect(observationList.statusCode, observationList.body).toBe(200);
      expect(observationList.json().items[0].media[0]).toEqual(expect.objectContaining({ id: firstId, url: expect.stringMatching(/^\/photo\//) }));
      expect(observationList.json().items[0].author.id).toBe(internalId);
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?tab=history", headers: auth })).json().items).toEqual([]);
      const third = await app.inject({ method: "POST", url: "/api/media", ...form });
      const thirdId = third.json().id as number;
      const comment = await app.inject({ method: "POST", url: "/api/works/7/comments", headers: auth, payload: { text: "", mediaIds: [thirdId] } });
      expect(comment.statusCode).toBe(201);
      expect(f.media.get(thirdId)).toEqual(expect.objectContaining({ temporary: false, commentId: 1 }));
      const commentList = await app.inject({ method: "GET", url: "/api/works/7/comments", headers: auth });
      expect(commentList.json().items[0].media[0].id).toBe(thirdId);
      expect(commentList.json().items[0].author.id).toBe(internalId);
      expect(commentList.json()).toEqual(expect.objectContaining({ page: 1, limit: 20, total: 1 }));
      expect((await app.inject({ method: "GET", url: "/api/works/7/comments?page=2&limit=1", headers: auth })).json()).toEqual({ items: [], page: 2, limit: 1, total: 1 });
      expect((await app.inject({ method: "GET", url: "/api/works/7/comments?page=0", headers: auth })).statusCode).toBe(400);
      expect((await app.inject({ method: "GET", url: "/api/works/7/comments?limit=101", headers: auth })).statusCode).toBe(400);
      const key = f.media.get(firstId)!.publicKey!;
      const original = await app.inject({ method: "GET", url: `/photo/${key}` });
      expect(original.statusCode).toBe(200);
      expect(original.headers["cache-control"]).toBe("private, no-store");
      expect(original.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive, nosnippet");
      for (const query of ["?w=200&h=200", "?w=400&h=240&fit=cover", "?w=800&h=800&fit=contain"]) {
        const response = await app.inject({ method: "GET", url: `/photo/${key}${query}` });
        expect(response.statusCode).toBe(200);
        const meta = await sharp(response.rawPayload).metadata();
        expect(meta.width).toBeLessThanOrEqual(100);
        expect(meta.height).toBeLessThanOrEqual(80);
      }
      for (const query of ["?w=31&h=200", "?w=2049&h=200"]) expect((await app.inject({ method: "GET", url: `/photo/${key}${query}` })).statusCode).toBe(400);
      f.media.get(firstId)!.publicKey = "abcdef0123456789";
      expect((await app.inject({ method: "GET", url: "/photo/abcdef0123456789" })).statusCode).toBe(200);
      const blob = [...f.blobs.values()][0];
      f.media.get(secondId)!.expiresAt = new Date(0);
      expect(await cleanupExpiredMedia(f.db, new Date(), dir)).toEqual({ media: 1, blobs: 0 });
      expect(await readFile(join(dir, blob.storagePath))).toEqual(bytes);
    } finally { await app.close(); delete process.env.MEDIA_DIR; }
  });

  it("removes the physical blob after cleanup deletes its last Media", async () => {
    const dir = await mkdtemp(join(tmpdir(), "priemka-cleanup-"));
    tempDirs.push(dir);
    process.env.MEDIA_DIR = dir;
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const bytes = await sharp({ create: { width: 40, height: 40, channels: 3, background: "blue" } }).png().toBuffer();
      const upload = await app.inject({ method: "POST", url: "/api/media", ...multipartBody(bytes) });
      expect(upload.statusCode).toBe(201);
      f.media.get(upload.json().id)!.expiresAt = new Date(0);
      const blob = [...f.blobs.values()][0];
      expect(await cleanupExpiredMedia(f.db, new Date(), dir)).toEqual({ media: 1, blobs: 1 });
      expect(f.blobs.size).toBe(0);
      await expect(readFile(join(dir, blob.storagePath))).rejects.toMatchObject({ code: "ENOENT" });
    } finally { await app.close(); delete process.env.MEDIA_DIR; }
  });

  it("auto-orients EXIF phone photos when producing previews", async () => {
    const dir = await mkdtemp(join(tmpdir(), "priemka-orientation-"));
    tempDirs.push(dir);
    process.env.MEDIA_DIR = dir;
    const f = fixture();
    const app = await appFor(f.db);
    try {
      const bytes = await sharp({ create: { width: 120, height: 80, channels: 3, background: "green" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
      const upload = await app.inject({ method: "POST", url: "/api/media", ...multipartBody(bytes, "image/jpeg") });
      expect(upload.statusCode).toBe(201);
      expect([...f.blobs.values()][0]).toEqual(expect.objectContaining({ width: 80, height: 120 }));
      const attach = await app.inject({ method: "POST", url: "/api/houses/1/observations", headers: auth, payload: { category: "OTHER", title: "Фото", description: "С телефона", mediaIds: [upload.json().id] } });
      expect(attach.statusCode).toBe(201);
      const key = f.media.get(upload.json().id)!.publicKey;
      const original = await app.inject({ method: "GET", url: `/photo/${key}` });
      const stored = await sharp(original.rawPayload).metadata();
      expect([stored.width, stored.height]).toEqual([80, 120]);
      expect(stored.exif).toBeUndefined();
      expect(stored.orientation).toBeUndefined();
      const preview = await app.inject({ method: "GET", url: `/photo/${key}?w=80&h=120&fit=contain` });
      expect(preview.statusCode).toBe(200);
      const metadata = await sharp(preview.rawPayload).metadata();
      expect([metadata.width, metadata.height]).toEqual([80, 120]);
      expect(metadata.orientation).toBeUndefined();
    } finally { await app.close(); delete process.env.MEDIA_DIR; }
  });
});

describe("permissions", () => {
  it("keeps system and house roles independent", () => {
    expect(Object.values(HouseMembershipRole)).toEqual(expect.arrayContaining(["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN", "EXECUTOR"]));
    expect(Object.values(HouseMembershipRole)).not.toContain("ADMIN");
  });
  it("keeps remediation away from residents and disables pending memberships", () => {
    expect(permissionsFor("RESIDENT", "ACTIVE").reviewJoinRequests).toBe(false);
    expect(permissionsFor("EXECUTOR", "ACTIVE").reviewJoinRequests).toBe(false);
    expect(permissionsFor(null, null).manageHouseChat).toBe(false);
    expect(Object.values(permissionsFor("CHAIRMAN", "PENDING")).every((value) => !value)).toBe(true);
    expect(Object.values(permissionsFor("RESIDENT", "REJECTED")).every((value) => !value)).toBe(true);
  });
});

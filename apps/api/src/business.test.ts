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
  const createdWorks: Array<Record<string, unknown>> = [];
  const historyEvents: Array<Record<string, unknown>> = [];
  const subscriptions = new Set<string>();
  const media = new Map<number, MediaRow>();
  const blobs = new Map<number, BlobRow>();
  const observations: Array<Record<string, unknown>> = [];
  const comments: Array<Record<string, unknown>> = [];
  let chat: { title: string | null; joinUrl: string } | null = null;
  const house = { id: 1, address: "Тестовая, 1" };
  const work = { id: 7, houseId: 1, executorUserId: null as number | null, house, houseObject: null, executor: null as { id: number; firstName: string; lastName: string } | null, title: "Лифт", description: "Ремонт", category: "ELEVATOR", status: "NEW" as string, date: new Date("2026-09-24T00:00:00Z"), createdAt: new Date("2026-09-24T00:00:00Z"), updatedAt: new Date("2026-09-24T00:00:00Z"), completedAt: null, submittedForInspectionAt: null as Date | null, executorName: null, representativeName: null, media: [], history: [] };
  const user = { id: 1, firstName: "Макс", lastName: "Пользователь" };
  let lastHouseId: number | null = null;
  const db = {
    user: { findUniqueOrThrow: async () => ({ id: 1 }), findUnique: async () => ({ lastHouseId }), update: async ({ data }: { data: { lastHouseId: number } }) => { lastHouseId = data.lastHouseId; return { id: 1, lastHouseId }; } },
    houseMembership: {
      findUnique: async ({ where }: { where: { houseId_userId: { houseId: number } } }) => hasMembership && where.houseId_userId.houseId === 1 ? { userId: 1, role, status, executorCompanyName: company, user: { id: 1, firstName: "Макс", lastName: "Пользователь" }, createdAt: new Date("2026-09-23T00:00:00Z") } : null,
      findFirst: async () => hasMembership && status === "ACTIVE" ? { id: 1 } : null,
      findMany: async () => hasMembership ? [{ houseId: 1, house, role, status, joinedVia: "ADMIN", executorCompanyName: company }] : [],
    },
    house: { findUniqueOrThrow: async () => ({ ...house, chat }), findUnique: async ({ where }: { where: { id: number } }) => where.id === 1 ? { ...house, chat } : null },
    houseObject: { findFirst: async () => null },
    work: {
      findUnique: async ({ where }: { where: { id: number } }) => where.id === 7 ? work : createdWorks.find((item) => item.id === where.id) ?? null,
      findUniqueOrThrow: async ({ where }: { where: { id: number } }) => where.id === 7 ? work : createdWorks.find((item) => item.id === where.id)!,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: 8 + createdWorks.length, submittedForInspectionAt: null }; createdWorks.push(row); return row; },
      update: async ({ data }: { data: Partial<typeof work> }) => { Object.assign(work, data); return work; },
      findMany: async ({ where }: { where: { status?: string; executorUserId?: number } }) => where.status && where.status !== work.status || where.executorUserId && where.executorUserId !== work.executorUserId ? [] : [{ ...work, subscriptions: subscriptions.has("7:1") ? [{ id: 1 }] : [] }],
      count: async ({ where }: { where: { status?: string; executorUserId?: number } }) => where.status && where.status !== work.status || where.executorUserId && where.executorUserId !== work.executorUserId ? 0 : 1,
    },
    workSubscription: {
      findUnique: async () => subscriptions.has("7:1") ? { id: 1 } : null,
      upsert: async () => { subscriptions.add("7:1"); return { id: 1 }; },
      deleteMany: async () => { subscriptions.delete("7:1"); return { count: 1 }; },
    },
    issue: { count: async () => 0 },
    document: { findMany: async () => [] },
    inspectionAssignment: { count: async () => 0 },
    inspection: { count: async () => 0 },
    workHistory: { create: async ({ data }: { data: Record<string, unknown> }) => { historyEvents.push(data); return data; } },
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
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: observations.length + 1, status: "NEW", createdAt: new Date() }; observations.push(row); return row; },
      count: async () => observations.length,
      findMany: async ({ where }: { where: { status?: string } }) => observations.filter((item) => !where.status || item.status === where.status).map((item) => ({ ...item, author: user, media: [...media.values()].filter((m) => m.observationId === item.id).map((m) => ({ ...m, blob: blobs.get(m.blobId) })) })),
    },
    comment: {
      count: async () => comments.length,
      create: async ({ data }: { data: Record<string, unknown> }) => { const row = { ...data, id: comments.length + 1, createdAt: new Date() }; comments.push(row); return row; },
      findMany: async ({ skip = 0, take = 20 }: { skip?: number; take?: number }) => comments.slice(skip, skip + take).map((item) => ({ ...item, author: user, media: [...media.values()].filter((m) => m.commentId === item.id).map((m) => ({ ...m, blob: blobs.get(m.blobId) })) })),
    },
    $transaction: async (fn: (client: unknown) => Promise<unknown>) => {
      const observationCount = observations.length;
      const commentCount = comments.length;
      try { return await fn(db); } catch (error) { observations.splice(observationCount); comments.splice(commentCount); throw error; }
    },
  };
  return { db: db as unknown as PrismaClient, media, blobs, subscriptions, observations, comments, createdWorks, historyEvents, setCompany: (value: string | null) => { company = value; }, setRole: (value: string) => { role = value; }, setStatus: (value: string) => { status = value; }, setMembership: (value: boolean) => { hasMembership = value; }, setChat: (value: typeof chat) => { chat = value; }, setWorkStatus: (value: string) => { work.status = value; }, assignExecutor: (value: number | null) => { work.executorUserId = value; work.executor = value ? { id: value, firstName: "Сергей", lastName: "Петров" } : null; }, getChat: () => chat };
}

async function appFor(db: PrismaClient, isAdmin = false, now?: () => Date) {
  return createApp({ config: { botToken, botName: "PriemkaDemoBot", maxInitDataMaxAgeSeconds: 3600 }, userRepository: { isReady: async () => true, upsertFromMax: async ({ user }) => ({ id: Number(BigInt(user.id) - 9007199254740992n), isAdmin }) }, businessDb: db, now, logger: false, staticRoot: "/nonexistent-priemka-static" });
}

function multipartBody(bytes: Buffer, mimeType = "image/png") {
  const boundary = "priemka-test-boundary";
  const extension = mimeType === "image/jpeg" ? "jpg" : "png";
  return { headers: { ...auth, "content-type": `multipart/form-data; boundary=${boundary}` }, payload: Buffer.concat([Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="image.${extension}"\r\nContent-Type: ${mimeType}\r\n\r\n`), bytes, Buffer.from(`\r\n--${boundary}--\r\n`)]) };
}

describe("business API", () => {
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
  it("lets a chairman assign own work with a company snapshot and submit once as executor", async () => {
    const f = fixture();
    f.setRole("CHAIRMAN");
    f.setCompany("Сохранённая компания");
    const app = await appFor(f.db);
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

  it("enforces MAX auth and house permissions, and keeps work flags separate", async () => {
    const f = fixture();
    const app = await appFor(f.db);
    try {
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works" })).statusCode).toBe(401);
      const me = await app.inject({ method: "GET", url: "/api/me", headers: auth });
      expect(me.json().user).toEqual(expect.objectContaining({ id: 1, maxUserId: "9007199254740993", isAdmin: false }));
      expect(me.json().houses[0]).toEqual(expect.objectContaining({ id: 1, role: "RESIDENT", permissions: expect.objectContaining({ manageHouseChat: false, viewWorks: true }) }));
      expect(me.json().houses[0].permissions).not.toHaveProperty("reportRemediation");
      const list = await app.inject({ method: "GET", url: "/api/houses/1/works", headers: auth });
      expect(list.json().items[0]).toEqual(expect.objectContaining({ id: 7, status: "NEW", isWatching: false }));
      expect(list.json().items[0]).not.toHaveProperty("isNewForMe");
      expect((await app.inject({ method: "GET", url: "/api/houses/1/works?status=NEW", headers: auth })).json().total).toBe(1);
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
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).statusCode).toBe(403);
      const me = await app.inject({ method: "GET", url: "/api/me", headers: auth });
      expect(me.json().houses[0].permissions).toEqual(expect.objectContaining({ viewObservations: false, viewHouseChat: false }));
      expect(detail.json().actions).toEqual(expect.objectContaining({ reportRemediation: false, confirmAcceptance: false, assignInspector: false }));
      expect(detail.json().representative).toEqual({ id: 1, name: "Сергей Петров", phone: null, maxUrl: null });
    } finally { await app.close(); }
  });

  it("allows system ADMIN to manage a known house without membership", async () => {
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
      expect((await admin.inject({ method: "GET", url: "/api/houses/1/observations", headers: auth })).statusCode).toBe(200);
      expect((await admin.inject({ method: "GET", url: "/api/houses/1/works", headers: auth })).statusCode).toBe(200);
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
      expect((await app.inject({ method: "GET", url: "/api/houses/1/observations?status=WAITING", headers: auth })).json().items).toEqual([]);
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
      expect(original.headers["x-robots-tag"]).toBe("noindex, nofollow, noarchive");
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
    expect(permissionsFor(null, null, true).manageHouseChat).toBe(false);
    expect(Object.values(permissionsFor("CHAIRMAN", "PENDING")).every((value) => !value)).toBe(true);
    expect(Object.values(permissionsFor("RESIDENT", "REJECTED")).every((value) => !value)).toBe(true);
  });
});

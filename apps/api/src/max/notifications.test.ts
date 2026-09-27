import { expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { notifyWorkWatchers } from "./notifications.js";

it("merges watchers and action recipients, prefers the action, and checks current membership and preview access", async () => {
  const jobs: Record<string, unknown>[] = [];
  const active = new Set([1, 2, 4]);
  const preview = new Set([1, 2, 3, 4]);
  const db = {
    work: { findUnique: async () => ({ houseId: 9, executorUserId: 4, subscriptions: [{ userId: 1 }, { userId: 2 }, { userId: 3 }], sourceObservation: { authorId: 1, subscriptions: [{ userId: 2 }] } }) },
    user: { findMany: async () => [1, 2, 3, 4].map((id) => ({ id, maxUserId: String(id) })), findUnique: async ({ where }: { where: { id: number } }) => ({ maxUserId: String(where.id) }) },
    houseMembership: { findUnique: async ({ where }: { where: { houseId_userId: { userId: number } } }) => ({ role: where.houseId_userId.userId === 4 ? "EXECUTOR" : "RESIDENT", status: active.has(where.houseId_userId.userId) ? "ACTIVE" : "REJECTED" }) },
    previewAccess: { findUnique: async ({ where }: { where: { maxUserId: string } }) => preview.has(Number(where.maxUserId)) ? { enabled: true } : null },
    botOutbox: { upsert: async ({ create }: { create: Record<string, unknown> }) => { jobs.push(create); return create; } },
  } as unknown as PrismaClient;
  await notifyWorkWatchers(db, "PriemkaDemoBot", 7, "inspection_completed:1", "Проверка завершена", { previewRequired: true, actionRecipients: [{ userId: 2, text: "Вам нужно устранить замечания" }, { userId: 4, text: "Вам назначена работа" }] });
  expect(jobs).toHaveLength(3);
  expect(jobs.filter((job) => job.chatId === "2")).toEqual([expect.objectContaining({ text: "Вам нужно устранить замечания", targetType: "USER", accessKind: "WORK" })]);
  expect(jobs.some((job) => job.chatId === "3")).toBe(false);
  preview.delete(1);
  jobs.length = 0;
  await notifyWorkWatchers(db, "PriemkaDemoBot", 7, "inspection_completed:2", "Следующий этап", { previewRequired: true });
  expect(jobs.map((job) => job.chatId)).toEqual(["2"]);
});

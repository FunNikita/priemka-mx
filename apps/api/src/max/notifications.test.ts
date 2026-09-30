import { expect, it } from "vitest";
import type { PrismaClient } from "../../generated/prisma/client.js";
import { notifyWorkWatchers } from "./notifications.js";

it("merges watchers and action recipients, prefers the action, and checks current membership and preview access", async () => {
  const jobs = new Map<string, Record<string, unknown>>();
  const active = new Set([1, 2, 4]);
  const preview = new Set([1, 2, 3, 4]);
  const db = {
    work: { findUnique: async () => ({ houseId: 9, executorUserId: 4, subscriptions: [{ userId: 1 }, { userId: 2 }, { userId: 3 }], sourceObservation: { authorId: 1, subscriptions: [{ userId: 2 }] } }) },
    user: { findMany: async () => [1, 2, 3, 4].map((id) => ({ id, maxUserId: String(id) })), findUnique: async ({ where }: { where: { id: number } }) => ({ maxUserId: String(where.id) }) },
    houseMembership: { findUnique: async ({ where }: { where: { houseId_userId: { userId: number } } }) => ({ role: where.houseId_userId.userId === 4 ? "EXECUTOR" : "RESIDENT", status: active.has(where.houseId_userId.userId) ? "ACTIVE" : "REJECTED" }) },
    previewAccess: { findUnique: async ({ where }: { where: { maxUserId: string } }) => preview.has(Number(where.maxUserId)) ? { enabled: true } : null },
    botOutbox: { upsert: async ({ where, create }: { where: { eventKey: string }; create: Record<string, unknown> }) => {
      if (!jobs.has(where.eventKey)) jobs.set(where.eventKey, create);
      return jobs.get(where.eventKey);
    } },
  } as unknown as PrismaClient;
  await notifyWorkWatchers(db, "PriemkaDemoBot", 7, "inspection_completed:1", "Проверка завершена", { previewRequired: true, actionRecipients: [{ userId: 2, text: "Вам нужно устранить замечания" }, { userId: 4, text: "Вам назначено обращение" }] });
  expect(jobs.size).toBe(3);
  expect([...jobs.values()].filter((job) => job.chatId === "2")).toEqual([expect.objectContaining({ text: "Вам нужно устранить замечания", buttonText: "Открыть обращение", buttonUrl: "https://max.ru/PriemkaDemoBot?startapp=work_7", targetType: "USER", accessKind: "WORK", subjectId: 7, houseId: 9 })]);
  expect([...jobs.values()].some((job) => job.chatId === "3")).toBe(false);
  await notifyWorkWatchers(db, "PriemkaDemoBot", 7, "inspection_completed:1", "Повторное событие", { previewRequired: true, actionRecipients: [{ userId: 2, text: "Повторное действие" }] });
  expect(jobs.size).toBe(3);
  expect([...jobs.values()].find((job) => job.chatId === "2")?.text).toBe("Вам нужно устранить замечания");
  preview.delete(1);
  await notifyWorkWatchers(db, "PriemkaDemoBot", 7, "inspection_completed:2", "Следующий этап", { previewRequired: true });
  expect(jobs.size).toBe(4);
  expect([...jobs.values()].filter((job) => job.text === "Следующий этап").map((job) => job.chatId)).toEqual(["2"]);
});

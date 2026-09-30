import { createHash } from "node:crypto";
import type { Prisma, PrismaClient } from "../../generated/prisma/client.js";

type Db = Prisma.TransactionClient | PrismaClient;
type AccessKind = "NONE" | "WORK" | "OBSERVATION" | "JOIN_REVIEW" | "JOIN_RESULT";
type Access = { recipientUserId?: number; houseId?: number; accessKind?: AccessKind; subjectId?: number };
type NotificationJob = { recipientUserId: number | null; houseId: number | null; accessKind: string; subjectId: number | null; chatId: string };
export function appLink(botName: string, type: "observation" | "work" | "join_request", id: number) {
  return `https://max.ru/${botName}?startapp=${type}_${id}`;
}

export async function canDeliverNotification(db: Db, job: NotificationJob, previewRequired: boolean) {
  if (job.accessKind === "NONE") return true;
  if (!job.recipientUserId || !job.houseId || !job.subjectId) return false;
  const user = await db.user.findUnique({ where: { id: job.recipientUserId }, select: { maxUserId: true } });
  if (!user || user.maxUserId !== job.chatId) return false;
  if (previewRequired && !(await db.previewAccess.findUnique({ where: { maxUserId: user.maxUserId }, select: { enabled: true } }))?.enabled) return false;
  if (job.accessKind === "JOIN_RESULT") {
    const request = await db.houseMembership.findUnique({ where: { id: job.subjectId }, select: { userId: true, houseId: true, status: true } });
    return !!request && request.userId === job.recipientUserId && request.houseId === job.houseId && request.status !== "PENDING";
  }
  const member = await db.houseMembership.findUnique({ where: { houseId_userId: { houseId: job.houseId, userId: job.recipientUserId } }, select: { role: true, status: true } });
  if (member?.status !== "ACTIVE") return false;
  if (job.accessKind === "JOIN_REVIEW") {
    const request = await db.houseMembership.findUnique({ where: { id: job.subjectId }, select: { houseId: true, status: true } });
    return member.role === "CHAIRMAN" && request?.houseId === job.houseId && request.status === "PENDING";
  }
  if (job.accessKind === "OBSERVATION") {
    const observation = await db.observation.findUnique({ where: { id: job.subjectId }, select: { houseId: true } });
    return observation?.houseId === job.houseId && ["RESIDENT", "COUNCIL_MEMBER", "CHAIRMAN"].includes(member.role);
  }
  if (job.accessKind === "WORK") {
    const work = await db.work.findUnique({ where: { id: job.subjectId }, select: { houseId: true, executorUserId: true } });
    return work?.houseId === job.houseId && (member.role !== "EXECUTOR" || work.executorUserId === job.recipientUserId);
  }
  return false;
}

export async function enqueueText(db: Db, input: { key: string; maxUserId: string; text: string; buttonText: string; buttonUrl: string; pdfPublicKey?: string } & Access) {
  const eventKey = createHash("sha256").update(input.key).digest("hex");
  try {
    return await db.botOutbox.upsert({ where: { eventKey }, create: { eventKey, chatId: input.maxUserId, publicKey: input.pdfPublicKey ?? "", kind: "TEXT", targetType: "USER", text: input.text, buttonText: input.buttonText, buttonUrl: input.buttonUrl, recipientUserId: input.recipientUserId, houseId: input.houseId, accessKind: input.accessKind ?? "NONE", subjectId: input.subjectId }, update: {} });
  } catch (error) {
    if (typeof error !== "object" || error === null || !("code" in error) || error.code !== "P2002") throw error;
    return db.botOutbox.findUniqueOrThrow({ where: { eventKey } });
  }
}

export async function enqueueActionForUser(db: Db, input: { key: string; userId: number; text: string; buttonText: string; buttonUrl: string; previewRequired: boolean; pdfPublicKey?: string } & Omit<Access, "recipientUserId">) {
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { maxUserId: true } });
  if (!user) return null;
  const access = { recipientUserId: input.userId, houseId: input.houseId ?? null, accessKind: input.accessKind ?? "NONE", subjectId: input.subjectId ?? null, chatId: user.maxUserId };
  if (!await canDeliverNotification(db, access, input.previewRequired)) return null;
  return enqueueText(db, { ...input, maxUserId: user.maxUserId, recipientUserId: input.userId });
}

export async function notifyWorkWatchers(db: Db, botName: string, workId: number, event: string, text: string, options: { actionRecipients?: { userId: number; text: string }[]; previewRequired?: boolean; pdfPublicKey?: string } = {}) {
  const work = await db.work.findUnique({ where: { id: workId }, select: { houseId: true, executorUserId: true, subscriptions: { select: { userId: true } }, sourceObservation: { select: { authorId: true, subscriptions: { select: { userId: true } } } } } });
  if (!work) return;
  const recipients = new Map<number, string>();
  for (const subscription of work.subscriptions ?? []) recipients.set(subscription.userId, text);
  if (work.sourceObservation) {
    recipients.set(work.sourceObservation.authorId, text);
    for (const subscription of work.sourceObservation.subscriptions) recipients.set(subscription.userId, text);
  }
  for (const action of options.actionRecipients ?? []) recipients.set(action.userId, action.text);
  if (!recipients.size) return;
  const users = await db.user.findMany({ where: { id: { in: [...recipients.keys()] } }, select: { id: true, maxUserId: true } });
  for (const user of users) {
    if (!recipients.has(user.id)) continue;
    const access = { recipientUserId: user.id, houseId: work.houseId, accessKind: "WORK", subjectId: workId, chatId: user.maxUserId };
    if (!await canDeliverNotification(db, access, !!options.previewRequired)) continue;
    await enqueueText(db, { key: `work:${workId}:${event}:user:${user.id}`, maxUserId: user.maxUserId, text: recipients.get(user.id)!, buttonText: "Открыть обращение", buttonUrl: appLink(botName, "work", workId), recipientUserId: user.id, houseId: work.houseId, accessKind: "WORK", subjectId: workId, pdfPublicKey: options.pdfPublicKey });
  }
}

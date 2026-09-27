import type { Prisma, PrismaClient } from "../generated/prisma/client.js";

type Db = Prisma.TransactionClient | PrismaClient;
export type ActivityInput = {
  event: string;
  subjectType: string;
  subjectId?: number;
  subjectKey?: string;
  houseId?: number;
  workId?: number;
  observationId?: number;
  actorUserId?: number;
  metadata?: Prisma.InputJsonObject;
};

export async function recordActivity(db: Db, input: ActivityInput) {
  const actor = input.actorUserId ? await db.user.findUnique({ where: { id: input.actorUserId }, select: { firstName: true, lastName: true } }) : null;
  const membership = input.actorUserId && input.houseId ? await db.houseMembership.findUnique({ where: { houseId_userId: { houseId: input.houseId, userId: input.actorUserId } }, select: { role: true, status: true } }) : null;
  return db.activityEvent.create({ data: {
    event: input.event, subjectType: input.subjectType, subjectId: input.subjectId, subjectKey: input.subjectKey,
    houseId: input.houseId, workId: input.workId, observationId: input.observationId,
    actorUserId: input.actorUserId,
    actorName: actor ? `${actor.firstName} ${actor.lastName}`.trim() : null,
    actorRole: membership?.status === "ACTIVE" ? membership.role : null,
    metadata: input.metadata ?? undefined,
  } });
}

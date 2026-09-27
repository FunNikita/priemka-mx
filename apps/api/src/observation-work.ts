import type { Prisma } from "../generated/prisma/client.js";

export type LinkedObservationStatus = "IN_REVIEW" | "IN_PROGRESS" | "WAITING" | "ACCEPTED";

export async function syncLinkedObservationStatus(tx: Prisma.TransactionClient, workId: number, status: LinkedObservationStatus) {
  const work = await tx.work.findUnique({ where: { id: workId }, select: { sourceObservationId: true } });
  if (!work?.sourceObservationId) return;
  await tx.observation.update({ where: { id: work.sourceObservationId }, data: { status } });
}

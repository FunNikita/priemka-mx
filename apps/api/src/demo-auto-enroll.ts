import type { PrismaClient } from "../generated/prisma/client.js";
import { recordActivity } from "./activity.js";

export async function autoEnrollDemoResident(db: PrismaClient, userId: number, address?: string) {
  if (!address) return;
  await db.$transaction(async (tx) => {
    // MySQL's default collation is not exact; use the same House row lock as role changes.
    const houses = await tx.$queryRaw<{ id: number }[]>`SELECT id FROM House WHERE BINARY address = BINARY ${address} LIMIT 2 FOR UPDATE`;
    if (houses.length !== 1) {
      throw Object.assign(new Error("Demo auto-enroll requires exactly one house with the configured address"), { statusCode: 503 });
    }
    const houseId = houses[0].id;
    const current = await tx.houseMembership.findUnique({ where: { houseId_userId: { houseId, userId } } });
    if (current && (current.role !== "RESIDENT" || current.status === "ACTIVE")) return;
    const saved = current
      ? await tx.houseMembership.update({ where: { id: current.id }, data: { status: "ACTIVE" } })
      : await tx.houseMembership.create({ data: { houseId, userId, role: "RESIDENT", status: "ACTIVE", joinedVia: "ADMIN", executorCompanyName: null } });
    await recordActivity(tx, {
      event: "MEMBERSHIP_CHANGED", subjectType: "MEMBERSHIP", subjectId: saved.id, houseId,
      metadata: { source: "DEMO_AUTO_ENROLL", userId, before: current ? { role: current.role, status: current.status } : null, after: { role: saved.role, status: saved.status } },
    });
  });
}

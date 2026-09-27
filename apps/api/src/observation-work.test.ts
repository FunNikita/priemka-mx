import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "../generated/prisma/client.js";
import { syncLinkedObservationStatus } from "./observation-work.js";

describe("linked observation status", () => {
  it("does not change an unrelated observation for a manual work", async () => {
    const update = vi.fn();
    const tx = { work: { findUnique: vi.fn().mockResolvedValue({ sourceObservationId: null }) }, observation: { update } } as unknown as Prisma.TransactionClient;
    await syncLinkedObservationStatus(tx, 7, "ACCEPTED");
    expect(update).not.toHaveBeenCalled();
  });
  it("copies the workflow status to the linked observation", async () => {
    const update = vi.fn();
    const tx = { work: { findUnique: vi.fn().mockResolvedValue({ sourceObservationId: 12 }) }, observation: { update } } as unknown as Prisma.TransactionClient;
    for (const status of ["IN_PROGRESS", "IN_REVIEW", "WAITING", "ACCEPTED"] as const) await syncLinkedObservationStatus(tx, 7, status);
    expect(update.mock.calls.map(([input]) => input)).toEqual(["IN_PROGRESS", "IN_REVIEW", "WAITING", "ACCEPTED"].map((status) => ({ where: { id: 12 }, data: { status } })));
  });
});

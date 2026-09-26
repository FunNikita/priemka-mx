import type { MaxInitData } from "../max/init-data.js";

export type UpsertMaxUserInput = Pick<MaxInitData, "authDate" | "user"> & { seenAt: Date };
export type UserIdentity = { id: number; isAdmin: boolean };

export interface UserRepository {
  upsertFromMax(input: UpsertMaxUserInput): Promise<UserIdentity>;
  isReady(): Promise<boolean>;
}

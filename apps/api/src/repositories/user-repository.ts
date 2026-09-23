import type { MaxInitData } from "../max/init-data.js";

export type UpsertMaxUserInput = Pick<MaxInitData, "authDate" | "user"> & { seenAt: Date };

export interface UserRepository {
  upsertFromMax(input: UpsertMaxUserInput): Promise<void>;
  isReady(): Promise<boolean>;
}

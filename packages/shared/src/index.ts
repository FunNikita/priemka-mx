export type MaxLaunchContext = {
  queryId?: string;
  ip?: string;
  authDate: number;
  chat?: { id: string; type: "DIALOG" | "CHAT" | "CHANNEL" };
  startParam?: string;
};
/** Public MVP API routes and DTOs. */
export * from "./api.js";

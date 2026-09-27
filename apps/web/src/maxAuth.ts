export async function resolveMaxInitData(
  realInitData: string | undefined,
  isDev: boolean,
  hostname: string,
  fetchStub: () => Promise<Response>,
): Promise<string | undefined> {
  if (realInitData?.trim()) return realInitData;
  if (!isDev || (hostname !== "127.0.0.1" && hostname !== "localhost" && hostname !== "[::1]")) return undefined;

  try {
    const response = await fetchStub();
    if (!response.ok || !response.headers.get("Content-Type")?.includes("application/json")) return undefined;
    const data: unknown = await response.json();
    if (data && typeof data === "object" && "initData" in data && typeof data.initData === "string" && data.initData.trim()) {
      return data.initData;
    }
  } catch { /* The local stub is optional. */ }
  return undefined;
}

export function getMaxInitData(): Promise<string | undefined> {
  return resolveMaxInitData(
    window.WebApp?.initData,
    import.meta.env.DEV,
    window.location.hostname,
    () => fetch("/__dev/max-init-data", { cache: "no-store" }),
  );
}

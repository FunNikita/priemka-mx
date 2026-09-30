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

export function profileFromMaxInitData(initData: string | undefined) {
  if (!initData) return null;
  try {
    const rawUser = new URLSearchParams(initData).get('user');
    if (!rawUser) return null;
    const user = JSON.parse(rawUser);
    return {
      firstName: typeof user.first_name === 'string' ? user.first_name : '',
      lastName: typeof user.last_name === 'string' ? user.last_name : '',
      photoUrl: typeof user.photo_url === 'string' ? user.photo_url : null,
    };
  } catch {
    return null;
  }
}

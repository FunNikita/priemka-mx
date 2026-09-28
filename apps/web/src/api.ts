import { getMaxInitData } from "./maxAuth";

declare global {
  interface Window {
    WebApp?: { initData?: string };
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("X-Max-Init-Data")) {
    const initData = await getMaxInitData();
    if (initData) headers.set("X-Max-Init-Data", initData);
  }

  const url = path === "/api" || path.startsWith("/api/") ? path : `/api${path}`;
  try {
    return await fetch(url, { ...init, headers });
  } catch (error) {
    if (error instanceof TypeError) throw new Error("Не удалось связаться с сервером. Проверьте подключение к интернету и повторите попытку.", { cause: error });
    throw error;
  }
}

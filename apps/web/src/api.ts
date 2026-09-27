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
  return fetch(url, { ...init, headers });
}

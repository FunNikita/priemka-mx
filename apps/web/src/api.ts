declare global {
  interface Window {
    WebApp?: { initData?: string };
  }
}

export async function apiFetch(path: string, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const initData = window.WebApp?.initData;

  if (initData) headers.set("X-Max-Init-Data", initData);

  return fetch(`/api${path}`, { ...init, headers });
}

export interface ApiError extends Error {
  status?: number;
  code?: string;
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers:
      init?.body && typeof init.body === "string"
        ? { "content-type": "application/json", ...(init?.headers || {}) }
        : init?.headers,
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    data = null;
  }
  if (!res.ok) {
    if (res.status === 401 && typeof window !== "undefined" && !window.location.pathname.startsWith("/login")) {
      window.location.href = "/login";
    }
    const obj = (data || {}) as { error?: string; code?: string };
    const err = new Error(obj.error || `Request failed (${res.status})`) as ApiError;
    err.status = res.status;
    err.code = obj.code;
    throw err;
  }
  return data as T;
}

export async function post<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "POST", body: JSON.stringify(body) });
}

export async function patch<T>(path: string, body: unknown): Promise<T> {
  return api<T>(path, { method: "PATCH", body: JSON.stringify(body) });
}

export async function del<T>(path: string): Promise<T> {
  return api<T>(path, { method: "DELETE" });
}

export function todayLocal(): string {
  return new Date().toLocaleDateString("en-CA");
}

export function shiftLocal(iso: string, days: number): string {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d.toLocaleDateString("en-CA");
}

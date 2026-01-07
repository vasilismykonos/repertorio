// apps/web/lib/apiClient.ts

/**
 * Minimal, shared fetch helpers for client components.
 *
 * Goal: remove duplicated "if (!res.ok) parse message" blocks from every form.
 */

export type ApiError = {
  status: number;
  message: string;
};

function messageFromAny(payload: any, fallback: string): string {
  const msg = payload?.message;
  if (Array.isArray(msg)) return msg.join(", ");
  if (typeof msg === "string" && msg.trim()) return msg.trim();
  if (payload?.error && typeof payload.error === "string") return payload.error;
  return fallback;
}

async function readBodyAsAny(res: Response): Promise<any> {
  const ct = res.headers.get("content-type") || "";
  if (ct.includes("application/json")) {
    return res.json().catch(() => null);
  }
  return res.text().catch(() => "");
}

/**
 * Fetch JSON (or accept FormData as body) and throw a normalised Error on non-2xx.
 */
export async function apiFetchJson<T>(
  url: string,
  init?: RequestInit,
): Promise<T> {
  const res = await fetch(url, {
    credentials: "include",
    ...init,
  });

  if (!res.ok) {
    const payload = await readBodyAsAny(res);
    const fallback = `Αποτυχία (HTTP ${res.status})`;
    const msg = typeof payload === "string"
      ? payload || fallback
      : messageFromAny(payload, fallback);
    const err = new Error(msg) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }

  // 204 No Content
  if (res.status === 204) {
    return undefined as unknown as T;
  }

  const payload = await readBodyAsAny(res);
  return payload as T;
}

/**
 * Fetch where you only care that it succeeded.
 */
export async function apiFetchOk(
  url: string,
  init?: RequestInit,
): Promise<void> {
  await apiFetchJson<void>(url, init);
}

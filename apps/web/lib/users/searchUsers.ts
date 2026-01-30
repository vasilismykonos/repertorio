import type { UserPick } from "./types";

// ✅ Same-origin (σύμφωνα με το arch rule σου) -> Nginx κάνει proxy /api/v1
const API_BASE_URL = "/api/v1";

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

/**
 * Αναζήτηση χρηστών για mention (@xxx)
 * Υποθέτει endpoint: GET /api/v1/users?q=...&take=...
 * που επιστρέφει είτε { items: [...] } είτε απευθείας array.
 */
export async function searchUsers(q: string, take = 8): Promise<UserPick[]> {
  const query = String(q ?? "").trim();
  if (!query) return [];

  const url =
  `${API_BASE_URL}/users?search=${encodeURIComponent(query)}` +
  `&page=1&pageSize=${encodeURIComponent(String(take))}`;


  const res = await fetch(url, { method: "GET", headers: { Accept: "application/json" }, cache: "no-store" });
  const body = await readJson(res);

  if (!res.ok) {
    const msg = (body as any)?.error || (body as any)?.message || `HTTP ${res.status}`;
    throw new Error(msg);
  }

  const items = Array.isArray(body) ? body : (body?.items ?? []);
  if (!Array.isArray(items)) return [];

  return items
    .map((x: any) => ({
      id: Number(x.id),
      username: String(x.username ?? ""),
      displayName: x.displayName != null ? String(x.displayName) : null,
      avatarUrl: x.avatarUrl != null ? String(x.avatarUrl) : null,
    }))
    .filter((u: UserPick) => Number.isFinite(u.id) && u.id > 0);
}

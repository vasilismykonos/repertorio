import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";

// Ανταποκρίνεται στο minimal που θες για options
type Option = {
  value: string;
  label: string;
  count?: number;
};

// Προσπαθούμε να καλύψουμε διαφορετικά σχήματα από Nest (array ή object wrapper)
type ApiUser = {
  id: number;
  email?: string | null;
  username?: string | null;
  displayName?: string | null;
  role?: string;
};

// helper: "καλό" label
function toUserLabel(u: ApiUser): string {
  const dn = String(u.displayName ?? "").trim();
  if (dn) return dn;

  const un = String(u.username ?? "").trim();
  if (un) return un;

  const em = String(u.email ?? "").trim();
  if (em) return em;

  return `User ${u.id}`;
}

// helper: normalize response σε array
function normalizeUsers(payload: unknown): ApiUser[] {
  if (Array.isArray(payload)) return payload as ApiUser[];

  if (payload && typeof payload === "object") {
    const obj = payload as any;
    if (Array.isArray(obj.items)) return obj.items as ApiUser[];
    if (Array.isArray(obj.users)) return obj.users as ApiUser[];
    if (Array.isArray(obj.data)) return obj.data as ApiUser[];
    if (obj.result && Array.isArray(obj.result.items)) return obj.result.items as ApiUser[];
  }

  return [];
}

/**
 * GET /api/users/options?q=...
 *
 * Επιστρέφει: { options: Option[] }
 * - Αν το Nest έχει search param (π.χ. q), το προωθούμε.
 * - Αν δεν το υποστηρίζει, το endpoint θα γυρίσει όλους (ό,τι δώσει το /users) και θα κάνουμε filtering client-side στο modal.
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const q = String(searchParams.get("q") ?? "").trim();

  // Προσπάθεια να περάσουμε query στο Nest (αν το υποστηρίζεις).
  // Αν δεν το υποστηρίζει, απλά αγνοείται ή θα το χειριστείς αργότερα στον Nest controller.
  const qs = q ? `?q=${encodeURIComponent(q)}` : "";
  const url = `/users${qs}`;

  try {
    const payload = await fetchJson<unknown>(url, { method: "GET" });
    const users = normalizeUsers(payload);

    const options: Option[] = users.map((u) => ({
      value: String(u.id),
      label: toUserLabel(u),
      count: 0, // δεν χρησιμοποιείται εδώ, αλλά συμβατό με UI
    }));

    return NextResponse.json({ options }, { status: 200 });
  } catch (err) {
    console.error("GET /api/users/options failed", err);
    return NextResponse.json(
      { options: [], error: "Failed to load user options" },
      { status: 500 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function getApiBase(): string {
  const base = (process.env.API_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Missing API_INTERNAL_BASE_URL");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

async function requireMe(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) return null;
  return me;
}

export async function GET(req: NextRequest) {
  const me = await requireMe(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const upstream = await fetch(`${getApiBase()}/chat/threads?userId=${encodeURIComponent(String(me.id))}`, {
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const me = await requireMe(req);
  if (!me) {
    return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const payload = await req.json().catch(() => ({}));
  const upstream = await fetch(`${getApiBase()}/chat/threads?userId=${encodeURIComponent(String(me.id))}`, {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status, headers: NO_STORE_HEADERS });
}

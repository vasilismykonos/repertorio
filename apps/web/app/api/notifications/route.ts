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
  return base;
}

async function readJsonSafe(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function takeParam(value: string | null): number {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return 10;
  return Math.min(n, 30);
}

export async function GET(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) {
    return NextResponse.json(
      { ok: true, authenticated: false, unreadCount: 0, items: [] },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  const take = takeParam(req.nextUrl.searchParams.get("take"));
  const url = `${getApiBase()}/notifications?userId=${encodeURIComponent(String(me.id))}&take=${encodeURIComponent(String(take))}`;

  const upstream = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(
    { ...(body as any), authenticated: true },
    { status: upstream.status, headers: NO_STORE_HEADERS },
  );
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const url = `${getApiBase()}/notifications/mark-read?userId=${encodeURIComponent(String(me.id))}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status, headers: NO_STORE_HEADERS });
}

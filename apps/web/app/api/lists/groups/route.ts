// apps/web/app/api/lists/groups/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

function getApiBase(): string {
  const base = (process.env.API_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  if (!base) {
    throw new Error("Missing API_INTERNAL_BASE_URL");
  }
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

export async function GET(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `${getApiBase()}/lists/groups?userId=${encodeURIComponent(String(me.id))}`;

  const upstream = await fetch(url, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);

  return NextResponse.json(body, { status: upstream.status });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);

  const url = `${getApiBase()}/lists/groups?userId=${encodeURIComponent(String(me.id))}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload ?? {}),
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);

  return NextResponse.json(body, { status: upstream.status });
}
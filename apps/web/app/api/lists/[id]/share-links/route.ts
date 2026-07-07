// apps/web/app/api/lists/[id]/share-links/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

function getApiBase(): string {
  const base = (process.env.API_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Missing API_INTERNAL_BASE_URL");
  return base;
}

async function readJsonSafe(res: Response) {
  const text = await res.text().catch(() => "");
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function parseId(params: { id?: string }) {
  const value = Number(params.id ?? "");
  return Number.isFinite(value) && Number.isInteger(value) && value > 0 ? value : null;
}

export async function POST(req: NextRequest, ctx: { params: { id: string } }) {
  const listId = parseId(ctx.params);
  if (!listId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const me = await getCurrentUserFromApi(req);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const payload = await req.json().catch(() => null);
  const url = `${getApiBase()}/lists/${listId}/share-links?userId=${encodeURIComponent(String(me.id))}`;

  const upstream = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(payload ?? {}),
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

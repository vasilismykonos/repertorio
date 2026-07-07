// apps/web/app/api/lists/share-links/[token]/route.ts
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

function cleanToken(value: string | undefined) {
  const token = String(value || "").trim();
  return token.length >= 12 ? token : null;
}

export async function GET(_req: NextRequest, ctx: { params: { token: string } }) {
  const token = cleanToken(ctx.params.token);
  if (!token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const upstream = await fetch(`${getApiBase()}/lists/share-links/${encodeURIComponent(token)}`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

export async function POST(req: NextRequest, ctx: { params: { token: string } }) {
  const token = cleanToken(ctx.params.token);
  if (!token) {
    return NextResponse.json({ error: "Invalid token" }, { status: 400 });
  }

  const me = await getCurrentUserFromApi(req);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `${getApiBase()}/lists/share-links/${encodeURIComponent(token)}/accept?userId=${encodeURIComponent(String(me.id))}`;
  const upstream = await fetch(url, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

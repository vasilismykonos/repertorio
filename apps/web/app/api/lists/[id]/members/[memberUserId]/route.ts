// apps/web/app/api/lists/[id]/members/[memberUserId]/route.ts
import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

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

function parsePosInt(raw: string | undefined) {
  const n = Number(raw ?? "");
  if (!Number.isFinite(n) || !Number.isInteger(n) || n <= 0) return null;
  return n;
}

export async function DELETE(
  req: NextRequest,
  ctx: { params: { id: string; memberUserId: string } },
) {
  const listId = parsePosInt(ctx.params.id);
  const memberUserId = parsePosInt(ctx.params.memberUserId);
  if (!listId || !memberUserId) {
    return NextResponse.json({ error: "Invalid id" }, { status: 400 });
  }

  const me = await getCurrentUserFromApi(req);
  if (!me) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = `${getApiBase()}/lists/${listId}/members/${memberUserId}?userId=${encodeURIComponent(String(me.id))}`;

  const upstream = await fetch(url, {
    method: "DELETE",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

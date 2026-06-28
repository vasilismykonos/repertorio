import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

type RouteParams = { params: { threadId: string } };

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

export async function POST(req: NextRequest, { params }: RouteParams) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) return NextResponse.json({ ok: false, error: "Χρειάζεται σύνδεση." }, { status: 401 });

  const threadId = Number(params.threadId);
  if (!Number.isFinite(threadId) || threadId <= 0) {
    return NextResponse.json({ ok: false, error: "Invalid thread id" }, { status: 400 });
  }

  const upstream = await fetch(`${getApiBase()}/chat/threads/${Math.trunc(threadId)}/read?userId=${encodeURIComponent(String(me.id))}`, {
    method: "POST",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });

  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

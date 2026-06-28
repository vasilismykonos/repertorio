import { NextRequest, NextResponse } from "next/server";

export const runtime = "nodejs";

function apiV1Base(): string {
  const raw = process.env.API_INTERNAL_BASE_URL;
  if (!raw) throw new Error("Missing API_INTERNAL_BASE_URL");
  const base = raw.replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

async function proxy(req: NextRequest, url: string, init?: RequestInit) {
  const cookie = req.headers.get("cookie") ?? "";
  const authorization = req.headers.get("authorization") ?? "";
  const res = await fetch(url, {
    cache: "no-store",
    ...init,
    headers: {
      ...(init?.headers ?? {}),
      ...(cookie ? { cookie } : {}),
      ...(authorization ? { authorization } : {}),
    },
  });
  const body = await res.text();
  return new NextResponse(body, {
    status: res.status,
    headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
  });
}

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    return proxy(req, `${apiV1Base()}/assets/${encodeURIComponent(params.id)}/score-content`);
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await req.text();
    return proxy(req, `${apiV1Base()}/assets/${encodeURIComponent(params.id)}/score-content`, {
      method: "PATCH",
      headers: { "Content-Type": req.headers.get("content-type") ?? "application/json" },
      body,
    });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}

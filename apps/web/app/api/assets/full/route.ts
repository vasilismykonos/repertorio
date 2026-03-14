// apps/web/app/api/assets/full/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function apiV1Base(): string {
  const raw = process.env.API_INTERNAL_BASE_URL;
  if (!raw) throw new Error("Missing API_INTERNAL_BASE_URL");
  const base = raw.replace(/\/+$/, "");
  return base.endsWith("/api/v1") ? base : `${base}/api/v1`;
}

export async function POST(req: Request) {
  try {
    const fd = await req.formData();

    const cookie = req.headers.get("cookie") ?? "";
    const authorization = req.headers.get("authorization") ?? "";

    const res = await fetch(`${apiV1Base()}/assets/full`, {
      method: "POST",
      body: fd,
      cache: "no-store",
      headers: {
        ...(cookie ? { cookie } : {}),
        ...(authorization ? { authorization } : {}),
      },
    });

    const body = await res.text();
    return new NextResponse(body, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}
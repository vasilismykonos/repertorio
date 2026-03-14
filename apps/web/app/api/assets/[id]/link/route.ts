// apps/web/app/api/assets/[id]/link/route.ts
import { NextResponse } from "next/server";

export const runtime = "nodejs";

function apiBase(): string {
  const base = process.env.API_INTERNAL_BASE_URL;
  if (!base) throw new Error("Missing API_INTERNAL_BASE_URL");
  return base.replace(/\/+$/, "");
}

async function readJsonBody(req: Request) {
  const text = await req.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    // allow plain text (will be forwarded as-is)
    return text;
  }
}

export async function POST(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const body = await readJsonBody(req);

    const res = await fetch(`${apiBase()}/api/v1/assets/${encodeURIComponent(id)}/link`, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    const out = await res.text();
    return new NextResponse(out, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function PATCH(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const body = await readJsonBody(req);

    const res = await fetch(`${apiBase()}/api/v1/assets/${encodeURIComponent(id)}/link`, {
      method: "PATCH",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    const out = await res.text();
    return new NextResponse(out, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: { id: string } }) {
  try {
    const id = ctx.params.id;
    const u = new URL(req.url);

    const targetType = u.searchParams.get("targetType") ?? "";
    const targetId = u.searchParams.get("targetId") ?? "";

    const url = new URL(`${apiBase()}/api/v1/assets/${encodeURIComponent(id)}/link`);
    url.searchParams.set("targetType", targetType);
    url.searchParams.set("targetId", targetId);

    const res = await fetch(url.toString(), {
      method: "DELETE",
      headers: { accept: "application/json" },
      cache: "no-store",
    });

    const out = await res.text();
    return new NextResponse(out, {
      status: res.status,
      headers: { "content-type": res.headers.get("content-type") ?? "application/json" },
    });
  } catch (e: any) {
    return NextResponse.json({ message: e?.message ?? "Internal error" }, { status: 500 });
  }
}
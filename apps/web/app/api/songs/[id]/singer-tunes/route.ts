// apps/web/app/api/songs/[id]/singer-tunes/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function getInternalBaseUrl(): string | null {
  const base = (process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/$/, "");
  return base ? base : null;
}

function requireInternalKey(): string {
  const k = (process.env.INTERNAL_API_KEY || "").trim();
  if (!k) throw new Error("Missing INTERNAL_API_KEY in web env");
  return k;
}

function parseSongId(ctx: { params: { id: string } }): number | null {
  const n = Number(ctx?.params?.id);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.trunc(n);
}

function pickQuery(req: NextRequest, name: string): string | null {
  try {
    const { searchParams } = new URL(req.url);
    const v = searchParams.get(name);
    return v && v.trim() ? v : null;
  } catch {
    return null;
  }
}

function jsonUpstream(body: unknown, status: number) {
  // Αν upstream επέστρεψε undefined/null body, κρατάμε νόμιμο JSON.
  return NextResponse.json(body ?? null, { status });
}

function serverMisconfigured(message: string) {
  return NextResponse.json({ error: message }, { status: 500 });
}

async function requireViewerEmail(req: NextRequest): Promise<string | null> {
  const user = await getCurrentUserFromApi(req);
  return user?.email ? String(user.email) : null;
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) return serverMisconfigured("Missing API_INTERNAL_BASE_URL in web env");

  const songId = parseSongId(ctx);
  if (!songId) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const viewerEmail = await requireViewerEmail(req);
  if (!viewerEmail) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let internalKey: string;
  try {
    internalKey = requireInternalKey();
  } catch (e: any) {
    return serverMisconfigured(e?.message || "Server misconfigured");
  }

  const rowId = pickQuery(req, "id");
  const scope = pickQuery(req, "scope"); // "allowed" | "mine" (optional)

  const qs = new URLSearchParams();
  if (rowId) qs.set("id", rowId);
  if (scope) qs.set("scope", scope);

  const upstreamUrl = `${baseUrl}/songs/${songId}/singer-tunes/internal${
    qs.toString() ? `?${qs.toString()}` : ""
  }`;

  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": viewerEmail,
    },
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return jsonUpstream(body, upstream.status);
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) return serverMisconfigured("Missing API_INTERNAL_BASE_URL in web env");

  const songId = parseSongId(ctx);
  if (!songId) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const viewerEmail = await requireViewerEmail(req);
  if (!viewerEmail) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let internalKey: string;
  try {
    internalKey = requireInternalKey();
  } catch (e: any) {
    return serverMisconfigured(e?.message || "Server misconfigured");
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upstreamUrl = `${baseUrl}/songs/${songId}/singer-tunes/internal`;

  const upstream = await fetch(upstreamUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": viewerEmail,
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return jsonUpstream(body, upstream.status);
}

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) return serverMisconfigured("Missing API_INTERNAL_BASE_URL in web env");

  const songId = parseSongId(ctx);
  if (!songId) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const viewerEmail = await requireViewerEmail(req);
  if (!viewerEmail) return NextResponse.json({ error: "Not authenticated" }, { status: 401 });

  let internalKey: string;
  try {
    internalKey = requireInternalKey();
  } catch (e: any) {
    return serverMisconfigured(e?.message || "Server misconfigured");
  }

  const rowId = pickQuery(req, "id");
  if (!rowId) return NextResponse.json({ error: "Missing id query param" }, { status: 400 });

  const qs = new URLSearchParams({ id: rowId });
  const upstreamUrl = `${baseUrl}/songs/${songId}/singer-tunes/internal?${qs.toString()}`;

  const upstream = await fetch(upstreamUrl, {
    method: "DELETE",
    headers: {
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": viewerEmail,
    },
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return jsonUpstream(body, upstream.status);
}

// apps/web/app/api/songs/[id]/singer-tunes/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// ✅ Important: this is session-dependent, never static
export const dynamic = "force-dynamic";
export const revalidate = 0;

async function readJson(res: Response) {
  const t = await res.text();
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

function parseSongId(ctx: { params: { id: string } }) {
  const id = Number(ctx.params.id);
  return Number.isFinite(id) && id > 0 ? id : null;
}

function requireInternalBaseUrl(): string | null {
  const base = String(process.env.API_INTERNAL_BASE_URL ?? "").trim();
  return base ? base.replace(/\/+$/, "") : null; // trim trailing slashes
}

function requireInternalKey() {
  const key = String(process.env.INTERNAL_API_KEY ?? "").trim();
  return key || null;
}

async function requireViewerEmail() {
  const session = await getServerSession(authOptions);
  const email = String((session as any)?.user?.email ?? "").trim();
  return email || null;
}

/**
 * Build upstream URL using ONLY env:
 * API_INTERNAL_BASE_URL should already include /api/v1
 * e.g. http://127.0.0.1:3003/api/v1 (dev) or http://127.0.0.1:3000/api/v1 (prod)
 */
function upstreamUrl(req: NextRequest, pathUnderV1: string) {
  const base = requireInternalBaseUrl();
  if (!base) return null;

  const host = req.headers.get("host") || undefined;

  // ensure path starts with "/"
  const p = pathUnderV1.startsWith("/") ? pathUnderV1 : `/${pathUnderV1}`;

  return {
    url: `${base}${p}`,
    host,
  };
}

function normalizeCreatorUserIds(raw: any): number[] | null {
  if (!Array.isArray(raw)) return null;
  const ids = raw
    .map((x: any) => Number(x))
    .filter((n: number) => Number.isFinite(n) && n > 0);
  return ids;
}

async function proxyUpstream(args: {
  req: NextRequest;
  method: "GET" | "PUT";
  url: string;
  host?: string;
  internalKey: string;
  viewerEmail: string;
  body?: any;
}) {
  const { method, url, host, internalKey, viewerEmail, body } = args;

  try {
    const headers: Record<string, string> = {
      Accept: "application/json",
      "x-forwarded-proto": "https",
      "x-internal-key": internalKey,
      "x-viewer-email": viewerEmail,
    };

    // keep host only if present (helps if you rely on vhost behavior somewhere)
    if (host) headers.host = host;

    if (method !== "GET") headers["Content-Type"] = "application/json";

    const upstream = await fetch(url, {
      method,
      headers,
      body: method === "GET" ? undefined : JSON.stringify(body ?? {}),
      cache: "no-store",
    });

    const parsed = await readJson(upstream);
    return NextResponse.json(parsed, { status: upstream.status });
  } catch (e: any) {
    const cause = e?.cause
      ? `${e.cause?.code || ""} ${e.cause?.message || ""}`.trim()
      : null;

    return NextResponse.json(
      {
        error: "Upstream fetch failed",
        message: e?.message || String(e),
        cause,
      },
      { status: 502 },
    );
  }
}

export async function GET(req: NextRequest, ctx: { params: { id: string } }) {
  const id = parseSongId(ctx);
  if (!id) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const base = requireInternalBaseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  const internalKey = requireInternalKey();
  if (!internalKey) {
    return NextResponse.json(
      { error: "Missing INTERNAL_API_KEY in web env" },
      { status: 500 },
    );
  }

  const viewerEmail = await requireViewerEmail();
  if (!viewerEmail) {
    return NextResponse.json(
      { error: "Not authenticated (no session email)" },
      { status: 401 },
    );
  }

  // ✅ IMPORTANT: song-scoped upstream endpoint (UNDER /api/v1)
  const u = upstreamUrl(
    req,
    `/songs/${encodeURIComponent(String(id))}/singer-tunes/access/internal`,
  );

  if (!u) {
    // should never happen because base already checked
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  return proxyUpstream({
    req,
    method: "GET",
    url: u.url,
    host: u.host,
    internalKey,
    viewerEmail,
  });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const id = parseSongId(ctx);
  if (!id) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const base = requireInternalBaseUrl();
  if (!base) {
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  const internalKey = requireInternalKey();
  if (!internalKey) {
    return NextResponse.json(
      { error: "Missing INTERNAL_API_KEY in web env" },
      { status: 500 },
    );
  }

  const viewerEmail = await requireViewerEmail();
  if (!viewerEmail) {
    return NextResponse.json(
      { error: "Not authenticated (no session email)" },
      { status: 401 },
    );
  }

  const raw = await req.json().catch(() => null);

  const creatorUserIds = normalizeCreatorUserIds(raw?.creatorUserIds);
  if (!creatorUserIds) {
    return NextResponse.json(
      { error: "creatorUserIds must be an array of positive numbers" },
      { status: 400 },
    );
  }

  // ✅ IMPORTANT: song-scoped upstream endpoint (UNDER /api/v1)
  const u = upstreamUrl(
    req,
    `/songs/${encodeURIComponent(String(id))}/singer-tunes/access/internal`,
  );

  if (!u) {
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  return proxyUpstream({
    req,
    method: "PUT",
    url: u.url,
    host: u.host,
    internalKey,
    viewerEmail,
    body: { creatorUserIds },
  });
}

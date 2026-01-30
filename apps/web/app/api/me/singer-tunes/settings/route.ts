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

/**
 * Stable upstream:
 * - hit local API directly (no DNS/TLS issues)
 * - keep Host for proper vhost behavior if you rely on it
 */
function upstreamUrl(req: NextRequest, path: string) {
  const host = req.headers.get("host") || "dev.repertorio.net";
  return {
    url: `http://127.0.0.1:3003${path}`,
    host,
  };
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
  host: string;
  internalKey: string;
  viewerEmail: string;
  body?: any;
}) {
  const { req, method, url, host, internalKey, viewerEmail, body } = args;

  try {
    const upstream = await fetch(url, {
      method,
      headers: {
        Accept: "application/json",
        host,
        "x-forwarded-proto": "https",
        "x-internal-key": internalKey,
        "x-viewer-email": viewerEmail,
        ...(method !== "GET" ? { "Content-Type": "application/json" } : {}),
      },
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

  // ✅ IMPORTANT: song-scoped upstream endpoint
  const { url, host } = upstreamUrl(
    req,
    `/api/v1/songs/${encodeURIComponent(String(id))}/singer-tunes/access/internal`,
  );

  return proxyUpstream({
    req,
    method: "GET",
    url,
    host,
    internalKey,
    viewerEmail,
  });
}

export async function PUT(req: NextRequest, ctx: { params: { id: string } }) {
  const id = parseSongId(ctx);
  if (!id) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

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

  // ✅ IMPORTANT: song-scoped upstream endpoint
  const { url, host } = upstreamUrl(
    req,
    `/api/v1/songs/${encodeURIComponent(String(id))}/singer-tunes/access/internal`,
  );

  return proxyUpstream({
    req,
    method: "PUT",
    url,
    host,
    internalKey,
    viewerEmail,
    body: { creatorUserIds },
  });
}

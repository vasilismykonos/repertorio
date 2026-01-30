// apps/web/app/api/songs/[id]/singer-tunes/settings/route.ts
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

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

async function requireViewerEmail() {
  const session = await getServerSession(authOptions);
  const email = String((session as any)?.user?.email ?? "").trim();
  if (!email) return null;
  return email;
}

function requireInternalKey() {
  const key = String(process.env.INTERNAL_API_KEY ?? "").trim();
  return key || null;
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

  const { url, host } = upstreamUrl(req, "/api/v1/singer-tunes/access/internal");

  try {
    const upstream = await fetch(url, {
      method: "GET",
      headers: {
        Accept: "application/json",
        host,
        "x-forwarded-proto": "https",
        "x-internal-key": internalKey,
        "x-viewer-email": viewerEmail,
      },
      cache: "no-store",
    });

    const body = await readJson(upstream);
    return NextResponse.json(body, { status: upstream.status });
  } catch (e: any) {
    const cause = e?.cause
      ? `${e.cause?.code || ""} ${e.cause?.message || ""}`.trim()
      : null;

    return NextResponse.json(
      { error: "Upstream fetch failed", message: e?.message || String(e), cause },
      { status: 502 },
    );
  }
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
  const creatorUserIds = Array.isArray(raw?.creatorUserIds)
    ? raw.creatorUserIds
        .map((x: any) => Number(x))
        .filter((n: number) => Number.isFinite(n) && n > 0)
    : null;

  if (!creatorUserIds) {
    return NextResponse.json(
      { error: "creatorUserIds must be an array" },
      { status: 400 },
    );
  }

  const { url, host } = upstreamUrl(req, "/api/v1/singer-tunes/access/internal");

  try {
    const upstream = await fetch(url, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        host,
        "x-forwarded-proto": "https",
        "Content-Type": "application/json",
        "x-internal-key": internalKey,
        "x-viewer-email": viewerEmail,
      },
      body: JSON.stringify({ creatorUserIds }),
      cache: "no-store",
    });

    const body = await readJson(upstream);
    return NextResponse.json(body, { status: upstream.status });
  } catch (e: any) {
    const cause = e?.cause
      ? `${e.cause?.code || ""} ${e.cause?.message || ""}`.trim()
      : null;

    return NextResponse.json(
      { error: "Upstream fetch failed", message: e?.message || String(e), cause },
      { status: 502 },
    );
  }
}

import { NextRequest, NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type RouteParams = { params: { id: string } };

async function readJson(res: Response) {
  const text = await res.text();
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return text;
  }
}

function getInternalBaseUrl(): string | null {
  const base = (process.env.API_INTERNAL_BASE_URL || "").trim().replace(/\/$/, "");
  return base || null;
}

function getInternalKey(): string | null {
  return (process.env.INTERNAL_API_KEY || "").trim() || null;
}

function parseSongId(params: { id: string }): number | null {
  const id = Number(params.id);
  return Number.isFinite(id) && id > 0 ? Math.trunc(id) : null;
}

async function buildInternalHeaders(req: NextRequest, withJson = false): Promise<HeadersInit | null> {
  const internalKey = getInternalKey();
  if (!internalKey) return null;

  const user = await getCurrentUserFromApi(req);
  const headers: Record<string, string> = {
    Accept: "application/json",
    "x-internal-key": internalKey,
  };

  if (withJson) headers["Content-Type"] = "application/json";
  if (user?.email) headers["x-viewer-email"] = String(user.email);
  return headers;
}

export async function GET(req: NextRequest, { params }: RouteParams) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) return NextResponse.json({ error: "Missing API_INTERNAL_BASE_URL" }, { status: 500 });

  const songId = parseSongId(params);
  if (!songId) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const headers = await buildInternalHeaders(req);
  if (!headers) return NextResponse.json({ error: "Missing INTERNAL_API_KEY" }, { status: 500 });

  const upstream = await fetch(`${baseUrl}/songs/${songId}/road-votes/internal`, {
    method: "GET",
    headers,
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return NextResponse.json(body ?? null, { status: upstream.status });
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) return NextResponse.json({ error: "Missing API_INTERNAL_BASE_URL" }, { status: 500 });

  const songId = parseSongId(params);
  if (!songId) return NextResponse.json({ error: "Invalid song id" }, { status: 400 });

  const headers = await buildInternalHeaders(req, true);
  if (!headers) return NextResponse.json({ error: "Missing INTERNAL_API_KEY" }, { status: 500 });

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upstream = await fetch(`${baseUrl}/songs/${songId}/road-votes/internal`, {
    method: "PUT",
    headers,
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return NextResponse.json(body ?? null, { status: upstream.status });
}

// apps/web/app/api/me/singer-tunes/access/route.ts
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
  if (!k) {
    // Μη “ανοίξει” τρύπα: αν λείπει key, αποτυγχάνουμε σκληρά.
    throw new Error("Missing INTERNAL_API_KEY in web env");
  }
  return k;
}

export async function GET(req: NextRequest) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  let user: any = null;
  try {
    user = await getCurrentUserFromApi();
  } catch {
    user = null;
  }

  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let internalKey: string;
  try {
    internalKey = requireInternalKey();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server misconfigured" },
      { status: 500 },
    );
  }

  const upstreamUrl = `${baseUrl}/singer-tunes/access/internal`;

  const upstream = await fetch(upstreamUrl, {
    method: "GET",
    headers: {
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": String(user.email),
    },
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

export async function PUT(req: NextRequest) {
  const baseUrl = getInternalBaseUrl();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Missing API_INTERNAL_BASE_URL in web env" },
      { status: 500 },
    );
  }

  let user: any = null;
  try {
    user = await getCurrentUserFromApi();
  } catch {
    user = null;
  }

  if (!user?.email) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let internalKey: string;
  try {
    internalKey = requireInternalKey();
  } catch (e: any) {
    return NextResponse.json(
      { error: e?.message || "Server misconfigured" },
      { status: 500 },
    );
  }

  const payload = await req.json().catch(() => null);
  if (!payload || typeof payload !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const upstreamUrl = `${baseUrl}/singer-tunes/access/internal`;

  const upstream = await fetch(upstreamUrl, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-internal-key": internalKey,
      "x-viewer-email": String(user.email),
    },
    body: JSON.stringify(payload),
    cache: "no-store",
  });

  const body = await readJson(upstream);
  return NextResponse.json(body, { status: upstream.status });
}

import { NextRequest, NextResponse } from "next/server";

import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function getApiBase(): string {
  const base = (process.env.API_INTERNAL_BASE_URL || "").replace(/\/$/, "");
  if (!base) throw new Error("Missing API_INTERNAL_BASE_URL");
  return base;
}

async function readJsonSafe(res: Response) {
  const t = await res.text().catch(() => "");
  try {
    return t ? JSON.parse(t) : null;
  } catch {
    return t;
  }
}

export async function GET() {
  const upstream = await fetch(`${getApiBase()}/notifications/push/public-key`, {
    method: "GET",
    headers: { Accept: "application/json" },
    cache: "no-store",
  });
  const body = await readJsonSafe(upstream);
  return NextResponse.json(body, { status: upstream.status, headers: NO_STORE_HEADERS });
}

export async function POST(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = await req.json().catch(() => ({}));
  const upstream = await fetch(
    `${getApiBase()}/notifications/push/subscribe?userId=${encodeURIComponent(String(me.id))}`,
    {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "User-Agent": req.headers.get("user-agent") || "",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const upstreamBody = await readJsonSafe(upstream);
  return NextResponse.json(upstreamBody, { status: upstream.status, headers: NO_STORE_HEADERS });
}

export async function DELETE(req: NextRequest) {
  const me = await getCurrentUserFromApi(req);
  if (!me?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const body = await req.json().catch(() => ({}));
  const upstream = await fetch(
    `${getApiBase()}/notifications/push/subscribe?userId=${encodeURIComponent(String(me.id))}`,
    {
      method: "DELETE",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      cache: "no-store",
    },
  );
  const upstreamBody = await readJsonSafe(upstream);
  return NextResponse.json(upstreamBody, { status: upstream.status, headers: NO_STORE_HEADERS });
}

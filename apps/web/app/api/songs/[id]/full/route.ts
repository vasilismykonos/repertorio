// apps/web/app/api/songs/[id]/full/route.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy PATCH requests for full song updates to the upstream NestJS API.
 * This endpoint accepts a JSON payload containing all updatable song
 * fields and forwards it to `/songs/:id/full`.  It forwards cookies
 * and authorization headers to preserve the authenticated session.
 * On error, it normalises responses into a JSON object with a
 * `message` property.  On success, it returns the upstream JSON as‑is.
 */

// Determine the upstream API base URL.  Prefer internal base for
// server-side requests; fallback to public base; default to
// production URL as last resort.  Trailing slashes are removed to
// avoid duplicate separators.
const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json(
      { message: "Μη έγκυρο ID τραγουδιού" },
      { status: 400 },
    );
  }

  // Forward cookies and authorization headers.  Use JSON for the body.
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  // Parse the JSON body.  If parsing fails, use an empty object.
  let bodyJson: any = null;
  try {
    bodyJson = await req.json();
  } catch {
    bodyJson = null;
  }

  const upstreamUrl = `${API_BASE_URL}/songs/${idNum}/full`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "PATCH",
      headers,
      body: JSON.stringify(bodyJson ?? {}),
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        return NextResponse.json(
          data ?? { message: `Αποτυχία ενημέρωσης (${res.status})` },
          { status: res.status },
        );
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { message: text || `Αποτυχία ενημέρωσης (${res.status})` },
        { status: res.status },
      );
    }

    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      return NextResponse.json(data ?? {}, { status: 200 });
    }
    const text = await res.text().catch(() => "");
    return NextResponse.json({ message: text || "" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}
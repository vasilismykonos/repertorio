// apps/web/app/api/songs/full/route.ts

import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy POST requests for creating a full song to the upstream NestJS API.
 * This endpoint accepts a JSON payload containing all song fields (title,
 * lyrics, characteristics, categoryId, rythmId, tagIds, assets, versions,
 * credits, etc.) and forwards it to `/songs/full`.  It forwards the
 * cookies and authorization header to preserve the authenticated
 * session.  On success, it returns the upstream JSON as‑is; on error,
 * it normalises responses into a JSON object with a `message` field.
 */

// Determine the upstream API base URL.  Prefer the internal base for
// server-side requests; fallback to the public base; default to
// production URL as a last resort.  Trailing slashes are removed to
// prevent duplicate separators when constructing endpoints.
const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export async function POST(req: NextRequest) {
  // Forward cookies and authorization headers.  Content-Type will be
  // explicitly set to application/json since this endpoint expects a
  // JSON payload from the form handler.
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  // Parse the JSON body.  If parsing fails, fall back to an empty
  // object rather than throwing an exception.
  let bodyJson: any = null;
  try {
    bodyJson = await req.json();
  } catch {
    bodyJson = null;
  }

  const upstreamUrl = `${API_BASE_URL}/songs/full`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyJson ?? {}),
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      // Normalise error responses: if upstream returns JSON use it,
      // otherwise wrap plain text in a message property.
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        return NextResponse.json(
          data ?? { message: `Αποτυχία δημιουργίας (${res.status})` },
          { status: res.status },
        );
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { message: text || `Αποτυχία δημιουργίας (${res.status})` },
        { status: res.status },
      );
    }

    // Success: return JSON payload as is.  If the upstream returned
    // something other than JSON, wrap it in a message property.
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => null);
      return NextResponse.json(data ?? {}, { status: 200 });
    }
    const text = await res.text().catch(() => "");
    return NextResponse.json({ message: text || "" }, { status: 200 });
  } catch (err: any) {
    // Catch network or unexpected errors.
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}
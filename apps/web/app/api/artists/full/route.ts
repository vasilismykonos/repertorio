// apps/web/app/api/artists/full/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy POST requests for creating a full artist (multipart form-data) to the
 * upstream NestJS API.  Forwards cookies and authorization headers to
 * preserve the authenticated session.  Passes through the request body
 * (multipart) without parsing so that file uploads work correctly.  On
 * success, returns the upstream JSON as-is; otherwise normalises error
 * responses into JSON with a `message` field.
 */

// Determine the upstream API base URL. Prefer the internal base for
// server-side requests; fallback to the public base; default to a
// relative path under the app. Avoid hard-coding production URLs as
// a final fallback to prevent unintended calls to the live API.
const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "/api/v1"
).replace(/\/$/, "");

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export async function POST(req: NextRequest) {
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const contentType = pickForwardHeader(req, "content-type");

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  // Preserve the original Content-Type header so that multipart boundaries are not lost.
  if (contentType) headers["content-type"] = contentType;

  const upstreamUrl = `${API_BASE_URL}/artists/full`;
  try {
    const res = await fetch(upstreamUrl, {
      method: "POST",
      headers,
      body: req.body,
      // ✅ required for streaming request bodies on Node.js
      duplex: "half",
      cache: "no-store",
    } as any);
    const contentTypeRes = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentTypeRes.includes("application/json")) {
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
    // Success: return JSON or plain text accordingly
    if (contentTypeRes.includes("application/json")) {
      const data = await res.json().catch(() => null);
      return NextResponse.json(data ?? {}, { status: 200 });
    }
    // Fallback: treat unknown content as text
    const text = await res.text().catch(() => "");
    return NextResponse.json({ message: text || "" }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}
// apps/web/app/api/artists/[id]/full/route.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Proxy PATCH requests for full artist updates (multipart form-data) to the
 * upstream NestJS API.  Forwards authentication headers and cookies and
 * streams the multipart body through untouched.  Returns upstream JSON
 * responses directly and normalises error responses into JSON with a
 * `message` property.
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

export async function PATCH(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json(
      { message: "Μη έγκυρο ID καλλιτέχνη" },
      { status: 400 },
    );
  }
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const contentType = pickForwardHeader(req, "content-type");
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;
  if (contentType) headers["content-type"] = contentType;
  const upstreamUrl = `${API_BASE_URL}/artists/${idNum}/full`;
  try {
    const res = await fetch(upstreamUrl, {
      method: "PATCH",
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
    if (contentTypeRes.includes("application/json")) {
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
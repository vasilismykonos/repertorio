// apps/web/app/api/_lib/proxy.ts
import { NextRequest, NextResponse } from "next/server";

/**
 * Shared helpers for Next.js App Router "proxy" route handlers under /app/api/**.
 *
 * Template goals:
 * - No hardcoded production fallbacks for API base URL.
 * - Forward auth/cookies consistently.
 * - Accept multipart form-data (string fields) or JSON input, normalize to JSON.
 * - Preserve upstream status codes on success.
 * - Normalize upstream responses (json/text/204) consistently.
 */

export function getApiBaseUrl(): string | null {
  const base =
    process.env.API_INTERNAL_BASE_URL ||
    process.env.NEXT_PUBLIC_API_BASE_URL ||
    "";
  const trimmed = base.trim().replace(/\/$/, "");
  return trimmed ? trimmed : null;
}

export function missingApiBaseUrlResponse(): NextResponse {
  return NextResponse.json(
    {
      message:
        "Missing API base URL configuration (API_INTERNAL_BASE_URL or NEXT_PUBLIC_API_BASE_URL).",
    },
    { status: 500 },
  );
}

export function pickForwardHeader(
  req: NextRequest,
  name: string,
): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export function buildForwardHeaders(
  req: NextRequest,
  extra?: Record<string, string>,
): Record<string, string> {
  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = { ...(extra ?? {}) };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  return headers;
}

function tryParseJsonObjectOrArray(value: string): unknown {
  const s = value.trim();
  if (!s) return value;

  // Only attempt JSON.parse for arrays/objects to avoid surprising coercions.
  const first = s[0];
  if (first !== "{" && first !== "[") return value;

  try {
    return JSON.parse(s);
  } catch {
    return value;
  }
}

/**
 * Reads request body and returns a JSON object.
 *
 * Preferred input: multipart/form-data (string fields) -> JSON object.
 * - Supports repeated keys: collects into arrays
 * - If a value looks like JSON object/array, it is parsed
 *
 * Fallback: JSON body -> JSON object.
 *
 * Throws Error("Invalid request body") if neither can be read as an object.
 */
export async function readBodyAsJson(
  req: NextRequest,
): Promise<Record<string, any>> {
  const ct = (req.headers.get("content-type") || "").toLowerCase();

  // If the client explicitly sent JSON, parse JSON directly.
  // IMPORTANT: avoid calling req.formData() first, as it may consume the stream.
  if (ct.includes("application/json")) {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object") {
      throw new Error("Invalid request body");
    }
    return json as Record<string, any>;
  }

  // Otherwise, prefer multipart/form-data (or x-www-form-urlencoded).
  // Use a clone so that we can still fall back to JSON if form parsing fails.
  const cloned = req.clone();
  try {
    const formData = await cloned.formData();
    const out: Record<string, any> = {};

    formData.forEach((value, key) => {
      if (typeof value !== "string") return;

      const parsed = tryParseJsonObjectOrArray(value);

      if (!(key in out)) {
        out[key] = parsed;
        return;
      }

      const prev = out[key];
      if (Array.isArray(prev)) {
        prev.push(parsed);
      } else {
        out[key] = [prev, parsed];
      }
    });

    return out;
  } catch {
    const json = await req.json().catch(() => null);
    if (!json || typeof json !== "object") {
      throw new Error("Invalid request body");
    }
    return json as Record<string, any>;
  }
}

/**
 * Proxies an upstream request and normalizes the response to NextResponse JSON.
 *
 * Behavior:
 * - 204 => returns 204 with empty body
 * - Upstream JSON => returns that JSON (preserving upstream status code)
 * - Upstream text => returns { message: "<text>" } (preserving upstream status code)
 * - Non-OK status => returns payload with upstream status
 * - Network/other error => returns 500 with message
 */
export async function proxyJson(
  upstreamUrl: string,
  init: RequestInit,
): Promise<NextResponse> {
  try {
    const res = await fetch(upstreamUrl, { ...init, cache: "no-store" });
    const contentType = res.headers.get("content-type") || "";

    if (res.status === 204) {
      return new NextResponse(null, { status: 204 });
    }

    const isJson = contentType.includes("application/json");

    const payload = isJson
      ? await res.json().catch(() => null)
      : await res.text().catch(() => "");

    if (!res.ok) {
      if (isJson) {
        return NextResponse.json(
          payload ?? { message: `Upstream error (${res.status})` },
          { status: res.status },
        );
      }

      return NextResponse.json(
        { message: payload || `Upstream error (${res.status})` },
        { status: res.status },
      );
    }

    if (isJson) {
      return NextResponse.json(payload ?? {}, { status: res.status });
    }

    return NextResponse.json({ message: payload || "" }, { status: res.status });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}

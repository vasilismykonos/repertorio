// apps/web/app/api/rythms/route.ts
import { NextRequest, NextResponse } from "next/server";

const API_BASE_URL = (
  process.env.API_INTERNAL_BASE_URL ||
  process.env.NEXT_PUBLIC_API_BASE_URL ||
  "https://api.repertorio.net/api/v1"
).replace(/\/$/, "");

function pickForwardHeader(req: NextRequest, name: string): string | undefined {
  const v = req.headers.get(name);
  return v && v.trim() ? v : undefined;
}

export async function GET(req: NextRequest) {
  const url = new URL(`${API_BASE_URL}/rythms`);
  const { searchParams } = req.nextUrl;
  searchParams.forEach((value, key) => {
    if (value != null) url.searchParams.append(key, value);
  });

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  try {
    const res = await fetch(url.toString(), {
      method: "GET",
      headers,
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        return NextResponse.json(
          data ?? { message: `Σφάλμα ανάκτησης (${res.status})` },
          { status: res.status },
        );
      }
      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { message: text || `Σφάλμα ανάκτησης (${res.status})` },
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

export async function POST(req: NextRequest) {
  let bodyJson: Record<string, any> = {};
  try {
    bodyJson = await req.json();
  } catch {
    return NextResponse.json({ message: "Invalid request body" }, { status: 400 });
  }

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  try {
    const res = await fetch(`${API_BASE_URL}/rythms`, {
      method: "POST",
      headers,
      body: JSON.stringify(bodyJson),
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";
    if (!res.ok) {
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

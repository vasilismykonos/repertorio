// apps/web/app/api/artists/[id]/route.ts
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

export async function DELETE(req: NextRequest, ctx: { params: { id: string } }) {
  const idNum = Number(ctx.params.id);
  if (!Number.isFinite(idNum) || idNum <= 0) {
    return NextResponse.json({ message: "Μη έγκυρο ID καλλιτέχνη" }, { status: 400 });
  }

  const cookie = pickForwardHeader(req, "cookie");
  const authorization = pickForwardHeader(req, "authorization");

  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = cookie;
  if (authorization) headers.authorization = authorization;

  const upstreamUrl = `${API_BASE_URL}/artists/${idNum}`;

  try {
    const res = await fetch(upstreamUrl, {
      method: "DELETE",
      headers,
      cache: "no-store",
    });

    const contentType = res.headers.get("content-type") || "";

    if (!res.ok) {
      if (contentType.includes("application/json")) {
        const data = await res.json().catch(() => null);
        return NextResponse.json(
          data ?? { message: `Αποτυχία διαγραφής (${res.status})` },
          { status: res.status },
        );
      }

      const text = await res.text().catch(() => "");
      return NextResponse.json(
        { message: text || `Αποτυχία διαγραφής (${res.status})` },
        { status: res.status },
      );
    }

    // επιτυχία
    if (contentType.includes("application/json")) {
      const data = await res.json().catch(() => ({ success: true }));
      return NextResponse.json(data, { status: 200 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: any) {
    return NextResponse.json(
      { message: err?.message || "Σφάλμα επικοινωνίας με API" },
      { status: 500 },
    );
  }
}

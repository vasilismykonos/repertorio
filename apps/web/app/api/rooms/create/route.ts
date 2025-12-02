// apps/web/app/api/rooms/create/route.ts
import { NextResponse } from "next/server";

type ApiResponse = {
  success: boolean;
  message?: string;
};

function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://localhost:4455";

  return base.replace(/\/+$/, "");
}

// POST /api/rooms/create  ->  proxy σε Node /create-room
export async function POST(req: Request) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  const room = typeof body.room === "string" ? body.room.trim() : "";
  const password =
    typeof body.password === "string" ? body.password : "";

  if (!room) {
    return NextResponse.json(
      {
        success: false,
        message: "Απαιτείται όνομα δωματίου.",
      } satisfies ApiResponse,
      { status: 400 }
    );
  }

  try {
    const upstream = await fetch(`${getRoomsBaseUrl()}/create-room`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, password }),
    });

    const upstreamJson = (await upstream
      .json()
      .catch(() => ({}))) as Partial<ApiResponse>;

    if (!upstream.ok || upstreamJson.success === false) {
      console.error(
        "[POST /api/rooms/create] Αποτυχία δημιουργίας room. Status:",
        upstream.status,
        "Body:",
        upstreamJson
      );
      return NextResponse.json(
        {
          success: false,
          message:
            upstreamJson.message ||
            `Σφάλμα rooms server (HTTP ${upstream.status}).`,
        } satisfies ApiResponse,
        { status: upstream.status || 500 }
      );
    }

    return NextResponse.json(
      {
        success: true,
        message: upstreamJson.message || "Το room δημιουργήθηκε.",
      } satisfies ApiResponse
    );
  } catch (err) {
    console.error("[POST /api/rooms/create] Σφάλμα:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Αποτυχία επικοινωνίας με rooms server.",
      } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

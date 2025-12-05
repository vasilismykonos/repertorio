// apps/web/app/api/rooms/route.ts
import { NextRequest, NextResponse } from "next/server";

type Room = {
  room: string;
  userCount: number;
  hasPassword: boolean;
};

type ApiResponse = {
  success: boolean;
  message?: string;
};

function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://127.0.0.1:4455";

  return base.replace(/\/+$/, "");
}

// GET /api/rooms – λίστα rooms
export async function GET(_req: NextRequest) {
  const upstream = `${getRoomsBaseUrl()}/get-rooms`;
  try {
    const res = await fetch(upstream, {
      method: "GET",
      cache: "no-store",
    });
    if (!res.ok) {
      console.error("[GET /api/rooms] upstream status:", res.status);
      return NextResponse.json<Room[]>([], { status: 200 });
    }
    const json = (await res.json()) as Room[];
    return NextResponse.json(json);
  } catch (err) {
    console.error("[GET /api/rooms] error:", err);
    return NextResponse.json<Room[]>([], { status: 200 });
  }
}

// POST /api/rooms – create room
export async function POST(req: NextRequest) {
  const { room, password = "" } = (await req.json().catch(() => ({}))) as {
    room?: string;
    password?: string;
  };

  if (!room || room.trim() === "") {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        message: "Απαιτείται όνομα room.",
      },
      { status: 400 }
    );
  }

  const upstream = `${getRoomsBaseUrl()}/create-room`;
  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, password }),
    });

    const upstreamJson = (await res.json().catch(() => ({}))) as any;

    if (!res.ok || upstreamJson.success === false) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          message:
            upstreamJson.message ||
            "Αποτυχία δημιουργίας room από τον rooms server.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      message: upstreamJson.message || "Το room δημιουργήθηκε.",
    });
  } catch (err) {
    console.error("[POST /api/rooms] Σφάλμα:", err);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        message: "Αποτυχία επικοινωνίας με rooms server.",
      },
      { status: 500 }
    );
  }
}

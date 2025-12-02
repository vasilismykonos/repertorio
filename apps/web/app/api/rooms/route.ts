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
    "http://localhost:4455";

  return base.replace(/\/+$/, "");
}

// =============================
// GET /api/rooms
// -> Επιστροφή λίστας rooms
// =============================
export async function GET() {
  try {
    const res = await fetch(`${getRoomsBaseUrl()}/get-rooms`, {
      cache: "no-store",
    });

    if (!res.ok) {
      console.error(
        "[GET /api/rooms] Αποτυχία επικοινωνίας με rooms server. Status:",
        res.status
      );
      return NextResponse.json([] satisfies Room[]);
    }

    const data = await res.json().catch(() => null);

    if (Array.isArray(data)) {
      return NextResponse.json(data as Room[]);
    }

    if (data && Array.isArray((data as any).rooms)) {
      return NextResponse.json((data as any).rooms as Room[]);
    }

    return NextResponse.json([] satisfies Room[]);
  } catch (err) {
    console.error("[GET /api/rooms] Σφάλμα:", err);
    return NextResponse.json([] satisfies Room[]);
  }
}

// =========================================
// POST /api/rooms
// -> Fallback δημιουργίας room
//    (σε περίπτωση που το UI καλεί POST /api/rooms)
// =========================================
export async function POST(req: NextRequest) {
  let body: any = {};
  try {
    body = await req.json();
  } catch {
    body = {};
  }

  // Καλύπτουμε διάφορα πιθανά ονόματα πεδίων
  const room =
    (typeof body.room === "string" && body.room.trim()) ||
    (typeof body.name === "string" && body.name.trim()) ||
    (typeof body.roomName === "string" && body.roomName.trim()) ||
    "";

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
        "[POST /api/rooms] Αποτυχία δημιουργίας room. Status:",
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
    console.error("[POST /api/rooms] Σφάλμα:", err);
    return NextResponse.json(
      {
        success: false,
        message: "Αποτυχία επικοινωνίας με rooms server.",
      } satisfies ApiResponse,
      { status: 500 }
    );
  }
}

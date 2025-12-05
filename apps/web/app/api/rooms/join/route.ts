// apps/web/app/api/rooms/join/route.ts
import { NextRequest, NextResponse } from "next/server";

type ApiResponse = {
  success: boolean;
  valid?: boolean;
  message?: string;
};

function getRoomsBaseUrl(): string {
  const base =
    process.env.ROOMS_HTTP_BASE_URL ||
    process.env.NEXT_PUBLIC_ROOMS_HTTP_BASE_URL ||
    "http://127.0.0.1:4455";

  return base.replace(/\/+$/, "");
}

// POST /api/rooms/join – verify password (προαιρετικό, αν θέλεις HTTP έλεγχο)
export async function POST(req: NextRequest) {
  const { room, password = "" } = (await req.json().catch(() => ({}))) as {
    room?: string;
    password?: string;
  };

  if (!room || room.trim() === "") {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        valid: false,
        message: "Απαιτείται όνομα room.",
      },
      { status: 400 }
    );
  }

  const upstream = `${getRoomsBaseUrl()}/verify-room-password`;

  try {
    const res = await fetch(upstream, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room, password }),
    });
    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          valid: false,
          message: json.message || "Αποτυχία ελέγχου κωδικού.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: !!json.success,
      valid: !!json.valid,
      message: json.message,
    });
  } catch (err) {
    console.error("[POST /api/rooms/join] error:", err);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        valid: false,
        message: "Αποτυχία επικοινωνίας με rooms server.",
      },
      { status: 500 }
    );
  }
}

// apps/web/app/api/rooms/[room]/route.ts
import { NextRequest, NextResponse } from "next/server";

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

// DELETE /api/rooms/[room] – διαγραφή room (π.χ. μόνο για admin)
export async function DELETE(
  _req: NextRequest,
  context: { params: { room: string } }
) {
  const roomParam = context.params.room;
  if (!roomParam) {
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        message: "Απαιτείται όνομα room.",
      },
      { status: 400 }
    );
  }

  const upstream = `${getRoomsBaseUrl()}/delete-room`;

  try {
    const res = await fetch(upstream, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ room: decodeURIComponent(roomParam) }),
    });

    const json = (await res.json().catch(() => ({}))) as any;

    if (!res.ok || json.success === false) {
      return NextResponse.json<ApiResponse>(
        {
          success: false,
          message: json.message || "Αποτυχία διαγραφής room.",
        },
        { status: 500 }
      );
    }

    return NextResponse.json<ApiResponse>({
      success: true,
      message: json.message || "Το room διαγράφηκε.",
    });
  } catch (err) {
    console.error("[DELETE /api/rooms/[room]] Σφάλμα:", err);
    return NextResponse.json<ApiResponse>(
      {
        success: false,
        message: "Αποτυχία επικοινωνίας με rooms server.",
      },
      { status: 500 }
    );
  }
}

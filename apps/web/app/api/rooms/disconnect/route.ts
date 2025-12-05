// apps/web/app/api/rooms/disconnect/route.ts
import { NextRequest, NextResponse } from "next/server";

type ApiResponse = {
  success: boolean;
  message?: string;
};

// Η αποσύνδεση από το room γίνεται ουσιαστικά μέσω WebSocket
// (leave_room + κλείσιμο WS). Αυτό το endpoint υπάρχει μόνο
// για να μην σκάει 405 στο RoomsClient.
export async function POST(_req: NextRequest) {
  try {
    // Καταναλώνουμε το body για τυπικούς λόγους (room κ.λπ.)
    await _req.json().catch(() => null);
  } catch {
    // ignore
  }

  return NextResponse.json(
    {
      success: true,
      message: "Disconnected (handled client-side via WebSocket).",
    } satisfies ApiResponse,
    { status: 200 }
  );
}

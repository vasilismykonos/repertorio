import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";

// Browser calls must stay same-origin.
// This route handler is same-origin and can see cookies.
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user?.id) {
    // no logged in user -> no presence update
    return new NextResponse(null, { status: 204 });
  }

  // Call Nest via same-origin proxy (/api/v1 -> nginx -> :3003)
  await fetch(`/api/v1/presence/ping?userId=${encodeURIComponent(String(user.id))}`, {
    method: "POST",
    // Route Handler fetch is server-side; no cookies needed for Nest because we pass userId.
    cache: "no-store",
  }).catch(() => null);

  return new NextResponse(null, { status: 204 });
}
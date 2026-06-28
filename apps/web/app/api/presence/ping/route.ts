import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { getCurrentUserFromApi } from "@/lib/currentUser";
import { fetchJson } from "@/lib/api";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);

  if (user?.id) {
    await fetchJson(
      `/presence/ping?userId=${encodeURIComponent(String(user.id))}`,
      { method: "POST" },
    ).catch(() => null);

    return new NextResponse(null, { status: 204 });
  }

  const body = await req.json().catch(() => null);
  const guestId = String(req.nextUrl.searchParams.get("guestId") || body?.guestId || "").trim();
  const guestLabel = String(
    req.nextUrl.searchParams.get("guestLabel") || body?.guestLabel || "Επισκέπτης",
  ).trim();

  if (guestId) {
    await fetchJson(
      `/presence/ping?guestId=${encodeURIComponent(guestId)}&guestLabel=${encodeURIComponent(guestLabel || "Επισκέπτης")}`,
      { method: "POST" },
    ).catch(() => null);
  }

  return new NextResponse(null, { status: 204 });
}

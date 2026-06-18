import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function intParam(value: string | null, fallback: number): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.floor(n) : fallback;
}

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user?.id) {
    return NextResponse.json(
      {
        ok: true,
        authenticated: false,
        windowSec: 180,
        count: 0,
        onlineCount: 0,
        users: [],
        generatedAt: new Date().toISOString(),
      },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  const sp = req.nextUrl.searchParams;
  const windowSec = intParam(sp.get("windowSec"), 180);
  const take = intParam(sp.get("take"), 20);

  try {
    const data = await fetchJson(
      `/presence/online-users?windowSec=${encodeURIComponent(String(windowSec))}&take=${encodeURIComponent(String(take))}`,
    );

    return NextResponse.json(
      { ...(data as any), authenticated: true },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  } catch (e: any) {
    return NextResponse.json(
      { ok: false, error: String(e?.message || e || "Failed") },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

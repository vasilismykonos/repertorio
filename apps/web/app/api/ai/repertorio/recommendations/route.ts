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

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json(
      { items: [], profile: { sourceSongCount: 0, categoryTitles: [], rythmTitles: [], tagTitles: [] } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }

  const take = req.nextUrl.searchParams.get("take") || "8";
  const qs = new URLSearchParams();
  qs.set("userId", String(user.id));
  qs.set("take", take);

  try {
    const data = await fetchJson(`/songs/recommendations?${qs.toString()}`);
    return NextResponse.json(data, { status: 200, headers: NO_STORE_HEADERS });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed"), items: [], profile: { sourceSongCount: 0, categoryTitles: [], rythmTitles: [], tagTitles: [] } },
      { status: 200, headers: NO_STORE_HEADERS },
    );
  }
}

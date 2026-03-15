// apps/web/app/api/lists/[id]/song-ids/route.ts
import { NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

type ListItemDto = {
  songId: number | null;
  sortId: number;
};

type ListDetailDto = {
  id: number;
  items: ListItemDto[];
};

export async function GET(
  _req: Request,
  ctx: { params: { id: string } },
) {
  const listId = Number(ctx.params.id);
  if (!Number.isFinite(listId) || listId <= 0) {
    return NextResponse.json({ error: "Invalid list id" }, { status: 400, headers: NO_STORE_HEADERS });
  }

  const user = await getCurrentUserFromApi();
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401, headers: NO_STORE_HEADERS });
  }

  const apiUrl = `/lists/${listId}?userId=${user.id}`;

  let data: ListDetailDto;
  try {
    data = await fetchJson<ListDetailDto>(apiUrl);
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed") },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }

  const songIds: number[] = [];
  for (const it of data.items ?? []) {
    const sid = Number(it.songId);
    if (Number.isFinite(sid) && sid > 0) songIds.push(sid);
  }

  return NextResponse.json({ listId, songIds }, { status: 200, headers: NO_STORE_HEADERS });
}

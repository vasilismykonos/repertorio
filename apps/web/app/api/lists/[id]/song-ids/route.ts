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
  title?: string | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
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
  const items: Array<{
    songId: number;
    title: string | null;
    selectedTonicity: string | null;
    selectedTonicitySign: "+" | "-" | null;
    selectedSingerTuneId: number | null;
  }> = [];

  for (const it of data.items ?? []) {
    const sid = Number(it.songId);
    if (Number.isFinite(sid) && sid > 0) {
      const selectedSingerTuneId = Number(it.selectedSingerTuneId || 0);
      songIds.push(sid);
      items.push({
        songId: sid,
        title: typeof it.title === "string" && it.title.trim() ? it.title.trim() : null,
        selectedTonicity:
          typeof it.selectedTonicity === "string" && it.selectedTonicity.trim()
            ? it.selectedTonicity.trim()
            : null,
        selectedTonicitySign:
          it.selectedTonicitySign === "+" || it.selectedTonicitySign === "-"
            ? it.selectedTonicitySign
            : null,
        selectedSingerTuneId:
          Number.isFinite(selectedSingerTuneId) && selectedSingerTuneId > 0
            ? selectedSingerTuneId
            : null,
      });
    }
  }

  return NextResponse.json({ listId, songIds, items }, { status: 200, headers: NO_STORE_HEADERS });
}

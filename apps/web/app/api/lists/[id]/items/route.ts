// apps/web/app/api/lists/[id]/items/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type AddListItemBody = {
  songId: number;
};

type AddListItemResponse = {
  listItemId: number;
  listId: number;
  sortId: number;
  songId: number | null;
  title: string | null;
  chords: string | null;
  chordsSource: "LIST" | "SONG" | "NONE";
  lyrics: string | null;
  lyricsSource: "LIST" | "SONG" | "NONE";
  itemsCount: number;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

export async function POST(
  req: NextRequest,
  ctx: { params: { id: string } },
) {
  const listId = Number(ctx.params.id);
  if (!Number.isFinite(listId) || listId <= 0) {
    return NextResponse.json({ error: "Invalid list id" }, { status: 400 });
  }

  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  let body: AddListItemBody | null = null;
  try {
    body = (await req.json()) as AddListItemBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const songId = Number(body?.songId);
  if (!Number.isFinite(songId) || songId <= 0) {
    return NextResponse.json({ error: "Invalid songId" }, { status: 400 });
  }

  try {
    const data = await fetchJson<AddListItemResponse>(
      `/lists/${listId}/items?userId=${user.id}`,
      {
        method: "POST",
        body: JSON.stringify({ songId }),
      },
    );

    return NextResponse.json(data, { status: 200, headers: NO_STORE_HEADERS });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed") },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

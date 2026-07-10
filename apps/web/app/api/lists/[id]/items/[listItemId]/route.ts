import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type UpdateListItemBody = {
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  tags?: string[] | string | null;
};

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function positiveInt(value: unknown): number | null {
  const n = Number(value);
  return Number.isFinite(n) && Number.isInteger(n) && n > 0 ? n : null;
}

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PUT(
  req: NextRequest,
  ctx: { params: { id: string; listItemId: string } },
) {
  const listId = positiveInt(ctx.params.id);
  const listItemId = positiveInt(ctx.params.listItemId);

  if (!listId || !listItemId) {
    return NextResponse.json(
      { error: "Invalid list item id" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: UpdateListItemBody | null = null;
  try {
    body = (await req.json()) as UpdateListItemBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const data = await fetchJson(
      `/lists/${listId}/items/${listItemId}?userId=${encodeURIComponent(String(user.id))}`,
      {
        method: "PUT",
        body: JSON.stringify({
          selectedTonicity:
            typeof body?.selectedTonicity === "string"
              ? body.selectedTonicity
              : body?.selectedTonicity === null
                ? null
                : undefined,
          selectedTonicitySign:
            body?.selectedTonicitySign === "+" || body?.selectedTonicitySign === "-"
              ? body.selectedTonicitySign
              : body?.selectedTonicitySign === null
                ? null
                : undefined,
          selectedSingerTuneId:
            body?.selectedSingerTuneId === null
              ? null
              : positiveInt(body?.selectedSingerTuneId) ?? undefined,
          tags:
            body?.tags === null || typeof body?.tags === "string" || Array.isArray(body?.tags)
              ? body.tags
              : undefined,
        }),
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

// apps/web/app/api/lists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type ListSummaryDto = {
  id: number;
  title: string;
  groupId: number | null;
  groupIds?: number[];
  groups?: ListGroupSummaryDto[];
  marked: boolean;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  itemsCount: number;
  containsSong?: boolean;
  listItemId?: number | null;
  selectedTonicity?: string | null;
  selectedTonicitySign?: "+" | "-" | null;
  selectedSingerTuneId?: number | null;
  selectedSingerTuneTitle?: string | null;
  selectedSingerTuneTune?: string | null;
  name?: string;
  listTitle?: string;
  list_title?: string;
};

type ListGroupSummaryDto = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
};

type CreateListBody = {
  title?: string;
  marked?: boolean;
  groupId?: number | string | null;
  groupIds?: Array<number | string | null> | null;
};

export const dynamic = "force-dynamic";
export const revalidate = 0;

const NO_STORE_HEADERS = {
  "Cache-Control": "no-store, no-cache, must-revalidate, proxy-revalidate",
  Pragma: "no-cache",
  Expires: "0",
} as const;

function parseGroupIds(value: CreateListBody["groupIds"]): number[] | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return [];
  if (!Array.isArray(value)) return undefined;

  const seen = new Set<number>();
  const out: number[] = [];
  for (const item of value) {
    if (item === null || item === undefined || item === "") continue;
    const id = Number(item);
    if (!Number.isFinite(id) || id <= 0 || !Number.isInteger(id)) return null;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

type ListsIndexResponse = {
  items: ListSummaryDto[];
  total: number;
  page: number;
  pageSize: number;
  groups: ListGroupSummaryDto[];
};

export async function GET(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() ?? "";
  const groupId = sp.get("groupId")?.trim();
  const page = sp.get("page")?.trim() ?? "1";
  const pageSize = sp.get("pageSize")?.trim() ?? "200";
  const songId = sp.get("songId")?.trim();

  const qs = new URLSearchParams();
  qs.set("userId", String(user.id));
  qs.set("page", page);
  qs.set("pageSize", pageSize);

  if (search) qs.set("search", search);
  if (groupId) qs.set("groupId", groupId);
  if (songId) qs.set("songId", songId);

  try {
    const data = await fetchJson<ListsIndexResponse>(`/lists?${qs.toString()}`);
    return NextResponse.json(data, { status: 200, headers: NO_STORE_HEADERS });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed") },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
export async function POST(req: NextRequest) {
  const user = await getCurrentUserFromApi(req);
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401, headers: NO_STORE_HEADERS },
    );
  }

  let body: CreateListBody | null = null;
  try {
    body = (await req.json()) as CreateListBody;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const title = String(body?.title || "").trim();
  if (!title) {
    return NextResponse.json(
      { error: "Title is required" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  const groupId =
    body?.groupId === null || body?.groupId === undefined || body?.groupId === ""
      ? null
      : Number(body.groupId);
  const groupIds = parseGroupIds(body?.groupIds);

  if (groupId !== null && (!Number.isFinite(groupId) || groupId <= 0)) {
    return NextResponse.json(
      { error: "Invalid groupId" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }
  if (body?.groupIds !== undefined && (groupIds === undefined || groupIds === null)) {
    return NextResponse.json(
      { error: "Invalid groupIds" },
      { status: 400, headers: NO_STORE_HEADERS },
    );
  }

  try {
    const data = await fetchJson(
      `/lists?userId=${encodeURIComponent(String(user.id))}`,
      {
        method: "POST",
        body: JSON.stringify({
          title,
          marked: Boolean(body?.marked),
          groupId,
          groupIds,
        }),
      },
    );

    return NextResponse.json(data, { status: 201, headers: NO_STORE_HEADERS });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed") },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

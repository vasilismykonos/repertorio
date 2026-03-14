// apps/web/app/api/lists/route.ts
import { NextRequest, NextResponse } from "next/server";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

type ListSummaryDto = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
  role: "OWNER" | "LIST_EDITOR" | "SONGS_EDITOR" | "VIEWER";
  itemsCount: number;
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
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const sp = req.nextUrl.searchParams;
  const search = sp.get("search")?.trim() ?? "";
  const groupId = sp.get("groupId")?.trim();
  const page = sp.get("page")?.trim() ?? "1";
  const pageSize = sp.get("pageSize")?.trim() ?? "200";

  const qs = new URLSearchParams();
  qs.set("userId", String(user.id));
  qs.set("page", page);
  qs.set("pageSize", pageSize);

  if (search) qs.set("search", search);
  if (groupId) qs.set("groupId", groupId);

  try {
    const data = await fetchJson<ListsIndexResponse>(`/lists?${qs.toString()}`);
    return NextResponse.json(data, { status: 200 });
  } catch (e: any) {
    return NextResponse.json(
      { error: String(e?.message || e || "Failed") },
      { status: 500 },
    );
  }
}

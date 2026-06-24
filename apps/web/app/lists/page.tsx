// apps/web/app/lists/page.tsx

import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

import ListsPageClient from "./ListsPageClient";
import type { ListGroupWithRole } from "./ListsGroupsBlock";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Λίστες | Repertorio Next",
  description: "Λίστες τραγουδιών του χρήστη από το παλιό Repertorio.",
};

export type ListSummary = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;

  // ✅ από backend (/lists)
  role:
    | "OWNER"
    | "LIST_EDITOR"
    | "SONGS_EDITOR"
    | "VIEWER";
  itemsCount: number;
  popularityViews?: number;
};

export type ListGroupSummary = {
  id: number;
  title: string;
  fullTitle: string | null;
  listsCount: number;
};

export type ListsIndexResponse = {
  items: ListSummary[];
  total: number;
  page: number;
  pageSize: number;
  groups: ListGroupSummary[];
};

export type ListGroupsIndexResponse = {
  items: ListGroupWithRole[];
};

type ListsPageSearchParams = {
  search?: string;
  groupId?: string;
  page?: string;
};

function emptyListsResponse(page: number, pageSize: number): ListsIndexResponse {
  return {
    items: [],
    total: 0,
    page,
    pageSize,
    groups: [],
  };
}

export default async function ListsPage({
  searchParams,
}: {
  searchParams: ListsPageSearchParams;
}) {
  const rawSearch = searchParams.search ?? "";
  const search = rawSearch.trim();

  const groupId = searchParams.groupId ?? "";

  const rawPage = searchParams.page ?? "1";
  const page = Number(rawPage) > 0 ? Number(rawPage) : 1;

  const pageSize = 50;

  const currentUser = await getCurrentUserFromApi().catch(() => null);
  if (!currentUser) {
    const empty = emptyListsResponse(page, pageSize);
    return (
      <ListsPageClient
        initialSearch={search}
        initialGroupId={groupId}
        page={page}
        pageSize={pageSize}
        data={empty}
        facets={empty}
        groupsIndex={null}
        viewerIsAdmin={false}
        allowOfflineFallback
        requiresLogin
      />
    );
  }

  const viewerIsAdmin = String((currentUser as any).role ?? "USER") === "ADMIN";

  const dataParams = new URLSearchParams();
  dataParams.set("userId", String(currentUser.id));
  dataParams.set("page", String(page));
  dataParams.set("pageSize", String(pageSize));
  if (search) dataParams.set("search", search);
  if (groupId) dataParams.set("groupId", groupId);
  const dataUrl = `/lists?${dataParams.toString()}`;

  const facetsParams = new URLSearchParams();
  facetsParams.set("userId", String(currentUser.id));
  facetsParams.set("page", "1");
  facetsParams.set("pageSize", "1");
  if (search) facetsParams.set("search", search);
  const facetsUrl = `/lists?${facetsParams.toString()}`;

  const groupsParams = new URLSearchParams();
  groupsParams.set("userId", String(currentUser.id));
  const groupsUrl = `/lists/groups?${groupsParams.toString()}`;

  let data: ListsIndexResponse;
  let facets: ListsIndexResponse;
  let groupsIndex: ListGroupsIndexResponse | null = null;

  try {
    data = await fetchJson<ListsIndexResponse>(dataUrl);
    facets = await fetchJson<ListsIndexResponse>(facetsUrl);

    try {
      groupsIndex = await fetchJson<ListGroupsIndexResponse>(groupsUrl);
    } catch {
      groupsIndex = null;
    }
  } catch (err: any) {
    const empty = emptyListsResponse(page, pageSize);
    return (
      <ListsPageClient
        initialSearch={search}
        initialGroupId={groupId}
        page={page}
        pageSize={pageSize}
        data={empty}
        facets={empty}
        groupsIndex={null}
        viewerIsAdmin={viewerIsAdmin}
        allowOfflineFallback
        initialError={String(err?.message || err)}
      />
    );
  }

  return (
    <ListsPageClient
      initialSearch={search}
      initialGroupId={groupId}
      page={page}
      pageSize={pageSize}
      data={data}
      facets={facets}
      groupsIndex={groupsIndex}
      viewerIsAdmin={viewerIsAdmin}
    />
  );
}

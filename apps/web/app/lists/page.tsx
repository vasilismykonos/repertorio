// apps/web/app/lists/page.tsx

import type { Metadata } from "next";
import { fetchJson } from "@/lib/api";
import { getCurrentUserFromApi } from "@/lib/currentUser";

import ListsPageClient from "./ListsPageClient";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Λίστες | Repertorio Next",
  description: "Λίστες τραγουδιών του χρήστη από το παλιό Repertorio.",
};

// Πρέπει να ταιριάζει με αυτά που επιστρέφει το /lists API (ListsService.getListsIndex)
export type ListSummary = {
  id: number;
  title: string;
  groupId: number | null;
  marked: boolean;
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

type ListsPageSearchParams = {
  search?: string;
  groupId?: string; // "", "null" ή αριθμητικό groupId
  page?: string;
};

export default async function ListsPage({
  searchParams,
}: {
  searchParams: ListsPageSearchParams;
}) {
  // -----------------------------
  // Ανάγνωση query params
  // -----------------------------
  const rawSearch = searchParams.search ?? "";
  const search = rawSearch.trim();

  const rawGroupId = searchParams.groupId ?? "";
  // "", "null" ή αριθμός ως string
  const groupId = rawGroupId;

  const rawPage = searchParams.page ?? "1";
  const page = Number(rawPage) > 0 ? Number(rawPage) : 1;

  // Match backend default (ListsService.getListsIndex)
  const pageSize = 50;

  // -----------------------------
  // Current user
  // -----------------------------
  const currentUser = await getCurrentUserFromApi();
  if (!currentUser) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστες</h1>
        <p>Πρέπει να είστε συνδεδεμένος για να δείτε τις λίστες σας.</p>
      </section>
    );
  }

  // -----------------------------
  // 1) DATA: items με το τρέχον φίλτρο groupId
  // -----------------------------
  const dataParams = new URLSearchParams();
  dataParams.set("userId", String(currentUser.id));
  dataParams.set("page", String(page));
  dataParams.set("pageSize", String(pageSize));

  if (search) dataParams.set("search", search);
  if (groupId) dataParams.set("groupId", groupId);

  const dataUrl = `/lists?${dataParams.toString()}`;

  // -----------------------------
  // 2) FACETS: total/groups ΠΑΝΤΑ χωρίς groupId (αλλά κρατάμε το search)
  //    Δεν μας νοιάζουν τα items εδώ, μόνο τα counts.
  // -----------------------------
  const facetsParams = new URLSearchParams();
  facetsParams.set("userId", String(currentUser.id));
  facetsParams.set("page", "1");
  facetsParams.set("pageSize", "1");

  if (search) facetsParams.set("search", search);

  const facetsUrl = `/lists?${facetsParams.toString()}`;

  let data: ListsIndexResponse;
  let facets: ListsIndexResponse;

  try {
    // sequential για καθαρό error handling (και ίδιο session/cookies)
    data = await fetchJson<ListsIndexResponse>(dataUrl);
    facets = await fetchJson<ListsIndexResponse>(facetsUrl);
  } catch (err: any) {
    return (
      <section style={{ padding: "1rem" }}>
        <h1>Λίστες</h1>
        <p>Σφάλμα κατά την ανάκτηση λιστών. ({String(err?.message || err)})</p>
      </section>
    );
  }

  // -----------------------------
  // Render (client)
  // -----------------------------
  return (
    <ListsPageClient
      initialSearch={search}
      initialGroupId={groupId}
      page={page}
      pageSize={pageSize}
      data={data}
      facets={facets}
    />
  );
}
